import { collection, doc, getDoc, getDocs, query, where, limit, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const OCR_FILES='manualOcrFiles', OCR_PAGES='manualOcrPages';
const RANGE_BYTES=1024*1024, CHECKPOINT_PAGES=10, INDEX_VERSION=2, WRITE_CHUNK=100;
function termsFor(value){return [...new Set(String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9_-]{2,}/g)||[])].slice(0,8)}
function tokensFor(value){return [...new Set(normalized(value).match(/[a-z0-9_-]{2,}/g)||[])].slice(0,800)}
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
 while(queue.length){
  if(shouldStop())break;
  const folderId=queue.shift();if(visited.has(folderId))continue;visited.add(folderId);
  reportTo(report,'Revisando carpetas de manuales: '+visited.size+(queue.length?' · faltan '+queue.length:''));
  const children=await listChildren(request,folderId);
  for(const child of children){
   if(child.mimeType==='application/vnd.google-apps.folder')queue.push(child.id);
   else if(child.mimeType==='application/pdf'||/\.pdf$/i.test(child.name||''))pdfs.set(child.id,child);
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
// PDF.js requests authenticated byte ranges instead of downloading a large PDF
// in a single arrayBuffer. Authorization is checked again for every range.
export async function openManualPdf({pdfjs,request,file}){
 const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media';
 const response=await request(url,{headers:{Range:'bytes=0-'+(RANGE_BYTES-1)}});
 const initial=new Uint8Array(await response.arrayBuffer());
 const contentRange=response.headers?.get('Content-Range')||'';
 const match=contentRange.match(/^bytes\s+0-\d+\/(\d+)$/i);
 const length=Number(match?.[1]||file.size);
 let task,lastError=null,closed=false;
 const controllers=new Set();
 if(response.status===206&&Number.isSafeInteger(length)&&length>initial.byteLength&&pdfjs.PDFDataRangeTransport){
  const transport=new pdfjs.PDFDataRangeTransport(length,initial);
  transport.requestDataRange=(begin,end)=>{
   if(closed)return;
   const controller=new AbortController();controllers.add(controller);
   (async()=>{
    try{
     const part=await request(url,{headers:{Range:'bytes='+begin+'-'+(end-1)},signal:controller.signal});
     const range=part.headers?.get('Content-Range')||'';
     if(part.status!==206||(range&&!range.startsWith('bytes '+begin+'-')))throw Error('Drive no devolvió el bloque solicitado del PDF.');
     const bytes=new Uint8Array(await part.arrayBuffer());
     if(bytes.byteLength!==end-begin)throw Error('La descarga del bloque del PDF quedó incompleta.');
     if(!closed)transport.onDataRange(begin,bytes);
    }catch(error){
     if(!closed){lastError=error;await task?.destroy().catch(()=>{})}
    }finally{controllers.delete(controller)}
   })();
  };
  transport.abort=()=>{closed=true;for(const controller of controllers)controller.abort();controllers.clear()};
  task=pdfjs.getDocument({range:transport,length,rangeChunkSize:RANGE_BYTES,disableAutoFetch:true,disableStream:true,isEvalSupported:false});
 }else if(response.status===206&&initial.byteLength!==length){
  // A provider without usable range metadata can still be processed normally.
  const full=await request(url);
  task=pdfjs.getDocument({data:new Uint8Array(await full.arrayBuffer()),isEvalSupported:false});
 }else{
  task=pdfjs.getDocument({data:initial,isEvalSupported:false});
 }
 try{
  const pdf=await task.promise;
  return {pdf,get error(){return lastError},async close(){closed=true;for(const controller of controllers)controller.abort();controllers.clear();await task.destroy()}};
 }catch(error){await task.destroy().catch(()=>{});throw lastError||error}
}
async function renderPageCanvas(pdf,pageNumber){
 const page=await pdf.getPage(pageNumber),natural=page.getViewport({scale:1});
 const scale=Math.min(1.7,2600/natural.width,3200/natural.height,Math.sqrt(8000000/(natural.width*natural.height)));
 const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
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
 pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
 let worker=null,processed=0,skipped=0,errors=0,ocrPages=0,paused=false,pauseReason='',pauseMessage='',currentPage='';
 const failures=[];
 const pauseFor=error=>{
  if(error?.message==='AUTH_NEEDED'||error?.code==='AUTH_NEEDED'){paused=true;pauseReason='auth';pauseMessage='La conexión con Drive venció.';return true}
  if(['permission-denied','unauthenticated','resource-exhausted','unavailable'].includes(error?.code)||error?.status===429||error?.status>=500||error?.name==='TypeError'){
   paused=true;pauseReason='connection';
   pauseMessage=['permission-denied','unauthenticated'].includes(error?.code)?'No se pudo guardar el índice. Comprobá la sesión y el permiso de administrador.':'La conexión o el servicio se interrumpió. Intentá reanudar más tarde.';
   return true;
  }
  return false;
 };
 try{
  const files=await discoverPdfs(request,rootIds,shouldStop,report);reportTo(report,files.length+' PDF encontrados. Preparando el OCR…');
  for(let fileIndex=0;fileIndex<files.length;fileIndex++){
   if(shouldStop())break;
   const file=files[fileIndex];if(!safeId(file.id))continue;
   const stateRef=doc(db,OCR_FILES,file.id);
   let opened=null,state=null;
   try{
    const stateSnapshot=await getDoc(stateRef),prior=stateSnapshot.exists()?stateSnapshot.data():{},modifiedTime=String(file.modifiedTime||'');
    if(['complete','no-text'].includes(prior.status)&&prior.modifiedTime===modifiedTime){skipped++;continue}
    reportTo(report,'Procesando '+(fileIndex+1)+' de '+files.length+': '+file.name);
    opened=await openManualPdf({pdfjs,request,file});
    const pdf=opened.pdf;
    const resume=prior.indexVersion===INDEX_VERSION&&prior.modifiedTime===modifiedTime&&Number.isInteger(prior.lastPage)&&prior.lastPage>=0&&prior.lastPage<=pdf.numPages;
    // Do not remove existing pages until Drive has actually opened the PDF.
    if(!resume)await removeOldPages(db,file.id);
    state={fileId:file.id,fileName:String(file.name||'').slice(0,300),modifiedTime,status:'processing',pageCount:pdf.numPages,ocrPageCount:resume?(Number(prior.ocrPageCount)||0):0,lastPage:resume?prior.lastPage:0,indexVersion:INDEX_VERSION};
    let records=[],lastPage=state.lastPage,pendingOcr=0;
    const checkpoint=async status=>{
     const batch=writeBatch(db);
     for(const record of records)batch.set(doc(db,OCR_PAGES,record.id),record.data);
     const next={...state,status,lastPage,ocrPageCount:state.ocrPageCount+pendingOcr,updatedAt:serverTimestamp()};
     batch.set(stateRef,next);await batch.commit();
     state=next;ocrPages+=pendingOcr;pendingOcr=0;records=[];
    };
    await checkpoint('processing');
    for(let pageNumber=state.lastPage+1;pageNumber<=pdf.numPages;pageNumber++){
     if(shouldStop())break;
     currentPage=file.name+' · página '+pageNumber+' de '+pdf.numPages;
     reportTo(report,currentPage);
     const page=await pdf.getPage(pageNumber);
     let canvas=null;
     try{
      const content=await page.getTextContent(),pageText=content.items.map(item=>item.str||'').join(' ').replace(/\s+/g,' ').trim();
      if(pageText.length<40){
       if(!worker){
        const tesseract=await loadTesseract();
        worker=await tesseract.createWorker('eng+spa',1,{logger:event=>{if(event.status==='recognizing text'&&Number.isFinite(event.progress))reportTo(report,currentPage+' · '+Math.round(event.progress*100)+'%')}});
       }
       canvas=await renderPageCanvas(pdf,pageNumber);
       const result=await worker.recognize(canvas),text=String(result?.data?.text||'').replace(/\s+/g,' ').trim().slice(0,100000),tokens=tokensFor(text);
       if(text&&tokens.length){
        records.push({id:file.id+'_'+pageNumber,data:{fileId:file.id,fileName:state.fileName,page:pageNumber,text,tokens,sourceModifiedTime:modifiedTime,updatedAt:serverTimestamp()}});
        pendingOcr++;
       }
      }
      lastPage=pageNumber;
      if(lastPage-state.lastPage>=CHECKPOINT_PAGES)await checkpoint('processing');
     }finally{if(canvas){canvas.width=0;canvas.height=0}page.cleanup?.()}
    }
    const stopped=shouldStop();
    await checkpoint(stopped?'processing':(state.ocrPageCount+pendingOcr?'complete':'no-text'));
    if(!stopped)processed++;
    if(stopped)break;
   }catch(error){
    error=opened?.error||error;
    // Auth/network failures pause the run once; they are not failures of every PDF.
    if(pauseFor(error))break;
    errors++;
    const message=String(error?.message||'Error desconocido').slice(0,300);
    failures.push({fileName:String(file.name||''),error:message});
    const failed=writeBatch(db);
    failed.set(stateRef,{...(state||{}),fileId:file.id,fileName:String(file.name||'').slice(0,300),modifiedTime:String(file.modifiedTime||''),status:'error',error:message,updatedAt:serverTimestamp()});
    try{await failed.commit()}catch(saveError){if(pauseFor(saveError))break;throw saveError}
   }finally{
    if(opened)await opened.close().catch(()=>{});
   }
  }
 }catch(error){if(!pauseFor(error))throw error}
 finally{if(worker)await worker.terminate()}
 return {processed,skipped,errors,ocrPages,failures,paused,pauseReason,pauseMessage,stopped:shouldStop()};
}

