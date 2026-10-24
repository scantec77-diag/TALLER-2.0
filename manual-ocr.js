import { collection, doc, getDoc, getDocs, query, where, limit, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const OCR_FILES='manualOcrFiles', OCR_PAGES='manualOcrPages';
const MAX_PDF_BYTES=60*1024*1024, MAX_PDF_PAGES=300, MAX_PDFS_PER_RUN=2500, MAX_FOLDERS_PER_RUN=5000, WRITE_CHUNK=100;
function termsFor(value){return [...new Set(String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9_-]{2,}/g)||[])].slice(0,8)}
function tokensFor(value){return termsFor(value).slice(0,800)}
function normalized(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function safeId(value){return /^[A-Za-z0-9_-]{8,160}$/.test(String(value||''))}
function reportTo(report,message){if(typeof report==='function')report(message)}
async function loadTesseract(){
 if(window.Tesseract)return window.Tesseract;
 if(window.__tallerTesseractPromise)return window.__tallerTesseractPromise;
 window.__tallerTesseractPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';script.async=true;
  script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('No se pudo iniciar Tesseract.js.'));
  script.onerror=()=>reject(Error('No se pudo descargar el motor OCR. Revisá la conexión a Internet.'));
  document.head.appendChild(script);
 });return window.__tallerTesseractPromise;
}
async function listChildren(request,folderId){
 const found=[];let pageToken='';
 do{
  const params=new URLSearchParams({q:"'"+folderId.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"' in parents and trashed = false",fields:'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)',pageSize:'1000',orderBy:'name'});
  if(pageToken)params.set('pageToken',pageToken);
  const response=await request('https://www.googleapis.com/drive/v3/files?'+params),data=await response.json();
  found.push(...(data.files||[]));pageToken=data.nextPageToken||'';
 }while(pageToken);
 return found;
}
async function discoverPdfs(request,rootIds,shouldStop,report){
 const queue=[...new Set(rootIds.filter(safeId))],visited=new Set(),pdfs=new Map();
 while(queue.length&&visited.size<MAX_FOLDERS_PER_RUN&&pdfs.size<MAX_PDFS_PER_RUN){
  if(shouldStop())break;
  const folderId=queue.shift();if(visited.has(folderId))continue;visited.add(folderId);
  reportTo(report,'Revisando carpetas de manuales: '+visited.size+(queue.length?' · faltan '+queue.length:''));
  const children=await listChildren(request,folderId);
  for(const child of children){
   if(child.mimeType==='application/vnd.google-apps.folder')queue.push(child.id);
   else if(child.mimeType==='application/pdf'||/\.pdf$/i.test(child.name||''))pdfs.set(child.id,child);
   if(pdfs.size>=MAX_PDFS_PER_RUN)break;
  }
 }return [...pdfs.values()];
}
async function removeOldPages(db,fileId){
 const snapshot=await getDocs(query(collection(db,OCR_PAGES),where('fileId','==',fileId))),docs=snapshot.docs;
 for(let offset=0;offset<docs.length;offset+=WRITE_CHUNK){const batch=writeBatch(db);docs.slice(offset,offset+WRITE_CHUNK).forEach(item=>batch.delete(item.ref));await batch.commit()}
}
async function writePageRecords(db,records){
 for(let offset=0;offset<records.length;offset+=WRITE_CHUNK){const batch=writeBatch(db);records.slice(offset,offset+WRITE_CHUNK).forEach(record=>batch.set(doc(db,OCR_PAGES,record.id),record.data));await batch.commit()}
}
async function renderPageCanvas(pdf,pageNumber){
 const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale:1.7}),canvas=document.createElement('canvas');
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport}).promise;return canvas;
}
function matchScore(text,terms){const value=normalized(text);return terms.reduce((score,term)=>score+(value.includes(term)?1:0),0)}
export async function findOcrPages(db,terms){
 const searchTerms=termsFor(terms);if(!searchTerms.length)return [];
 const snapshot=await getDocs(query(collection(db,OCR_PAGES),where('tokens','array-contains-any',searchTerms),limit(300)));
 return snapshot.docs.map(item=>{const data=item.data();return {...data,score:matchScore(data.text,searchTerms)}}).filter(item=>item.fileId&&item.page&&item.score>0);
}
export async function indexScannedManuals({db,request,rootIds,report=()=>{},shouldStop=()=>false}){
 const pdfjs=window.pdfjsLib;if(!pdfjs)throw Error('No está disponible el visor PDF necesario para procesar manuales.');
 const tesseract=await loadTesseract();
 const worker=await tesseract.createWorker('eng+spa',1,{logger:event=>{if(event.status==='recognizing text'&&Number.isFinite(event.progress))reportTo(report,'Reconociendo texto de la página… '+Math.round(event.progress*100)+'%')}});
 let processed=0,skipped=0,errors=0,ocrPages=0;
 try{
  const files=await discoverPdfs(request,rootIds,shouldStop,report);reportTo(report,files.length+' PDF encontrados. Preparando el OCR…');
  for(let fileIndex=0;fileIndex<files.length;fileIndex++){
   if(shouldStop())break;
   const file=files[fileIndex];if(!safeId(file.id))continue;
   const stateRef=doc(db,OCR_FILES,file.id);
   try{
    const stateSnapshot=await getDoc(stateRef),prior=stateSnapshot.exists()?stateSnapshot.data():{},modifiedTime=String(file.modifiedTime||'');
    if(['complete','no-text'].includes(prior.status)&&prior.modifiedTime===modifiedTime){skipped++;continue}
    if(Number(file.size)>MAX_PDF_BYTES)throw Error('Supera el límite de 60 MB.');
    reportTo(report,'Procesando '+(fileIndex+1)+' de '+files.length+': '+file.name);
    await removeOldPages(db,file.id);
    const started=writeBatch(db);
    started.set(stateRef,{fileId:file.id,fileName:String(file.name||'').slice(0,300),modifiedTime,status:'processing',pageCount:0,ocrPageCount:0,updatedAt:serverTimestamp()});
    await started.commit();
    const response=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media'),buffer=await response.arrayBuffer();
    if(buffer.byteLength>MAX_PDF_BYTES)throw Error('Supera el límite de 60 MB.');
    const pdf=await pdfjs.getDocument({data:buffer,isEvalSupported:false}).promise;
    if(pdf.numPages>MAX_PDF_PAGES)throw Error('Supera el límite de '+MAX_PDF_PAGES+' páginas.');
    let records=[],fileOcrPages=0;
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
     if(shouldStop())break;
     const page=await pdf.getPage(pageNumber),content=await page.getTextContent(),pageText=content.items.map(item=>item.str||'').join(' ').replace(/\s+/g,' ').trim();
     if(pageText.length>=40)continue;
     const canvas=await renderPageCanvas(pdf,pageNumber);
     try{
      const result=await worker.recognize(canvas),text=String(result?.data?.text||'').replace(/\s+/g,' ').trim().slice(0,100000),tokens=tokensFor(text);
      if(text&&tokens.length){
       records.push({id:file.id+'_'+pageNumber,data:{fileId:file.id,fileName:String(file.name||'').slice(0,300),page:pageNumber,text,tokens,sourceModifiedTime:modifiedTime,updatedAt:serverTimestamp()}});
       fileOcrPages++;ocrPages++;
       if(records.length>=WRITE_CHUNK){await writePageRecords(db,records);records=[]}
      }
     }finally{canvas.width=0;canvas.height=0}
    }
    if(records.length)await writePageRecords(db,records);
    const stopped=shouldStop(),finish=writeBatch(db);
    finish.set(stateRef,{fileId:file.id,fileName:String(file.name||'').slice(0,300),modifiedTime,status:stopped?'processing':(fileOcrPages?'complete':'no-text'),pageCount:pdf.numPages,ocrPageCount:fileOcrPages,updatedAt:serverTimestamp()});
    await finish.commit();processed++;pdf.destroy?.();if(stopped)break;
   }catch(error){
    errors++;const failed=writeBatch(db);
    failed.set(stateRef,{fileId:file.id,fileName:String(file.name||'').slice(0,300),modifiedTime:String(file.modifiedTime||''),status:'error',error:String(error?.message||'Error desconocido').slice(0,300),updatedAt:serverTimestamp()});
    await failed.commit().catch(()=>{});
   }
  }
 }finally{await worker.terminate()}
 return {processed,skipped,errors,ocrPages,stopped:shouldStop()};
}
