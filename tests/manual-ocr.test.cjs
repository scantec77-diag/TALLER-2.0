const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('manual-ocr.js','utf8').replace(/^import .*;\n/,'').replace(/^export /gm,'');
const file=(id='manual00001',extra={})=>({id,name:id+'.pdf',mimeType:'application/pdf',modifiedTime:'2026-11-03',size:100,...extra});
const response=(data,status=200,headers={})=>({status,headers:{get:key=>headers[key]||null},arrayBuffer:async()=>data instanceof ArrayBuffer?data:new ArrayBuffer(8),json:async()=>data});
function harness({files=[file()],pages=25,existing=[],pageError,mediaError,onRecognize,range=false}={}){
 const data=new Map(existing),reads=[],downloads=[],recognized=[],commits=[];
 let activeRange,rangeParams,recognizedCount=0,terminated=0;
 const pdf={numPages:pages,async getPage(number){
  reads.push(number);if(pageError)pageError(number);
  return {getTextContent:async()=>({items:[]}),getViewport:()=>({width:10,height:10}),render:()=>({promise:Promise.resolve()}),cleanup(){}};
 }};
 const ctx={
  console,URLSearchParams,Uint8Array,ArrayBuffer,AbortController,Error,Number,
  window:{Tesseract:{async createWorker(){return {async recognize(){recognized.push(++recognizedCount);onRecognize?.(recognizedCount);return {data:{text:'presion aceite manual'}}},async terminate(){terminated++}}}}},
  document:{createElement:()=>({width:0,height:0,getContext:()=>({})})},
  collection:(_,name)=>({name}),
  doc:(_,name,id)=>({path:name+'/'+id,id}),
  query:(collection,...conditions)=>({collection,conditions}),where:(name,op,value)=>({name,op,value}),limit:n=>({limit:n}),serverTimestamp:()=>1,
  async getDoc(ref){const value=data.get(ref.path);return {exists:()=>!!value,data:()=>value}},
  async getDocs(q){
   const name=q.collection?.name||q.name,conditions=q.conditions||[];
   return {docs:[...data].filter(([path,value])=>path.startsWith(name+'/')&&conditions.every(c=>!c.name||value[c.name]===c.value)).map(([path,value])=>({ref:{path},id:path.split('/').pop(),data:()=>value}))};
  },
  writeBatch(){
   const changes=[];return {set:(ref,value)=>changes.push({ref,value}),delete:ref=>changes.push({ref,remove:true}),async commit(){commits.push(changes);for(const change of changes){if(change.remove)data.delete(change.ref.path);else data.set(change.ref.path,change.value)}}};
  }
 };
 ctx.window.pdfjsLib={
  GlobalWorkerOptions:{},
  PDFDataRangeTransport:class{constructor(length,initial){this.length=length;this.initial=initial;activeRange=this}onDataRange(begin,bytes){this.received={begin,bytes}}},
  getDocument(params){rangeParams=params;return {promise:Promise.resolve(pdf),async destroy(){activeRange?.abort?.()}}}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 async function request(url,options={}){
  if(url.includes('alt=media')){
   downloads.push({url,options});if(mediaError)mediaError(url,options);
   if(range){
    const first=options.headers.Range==='bytes=0-1048575',begin=first?0:1048576;
    return response(new ArrayBuffer(1048576),206,{'Content-Range':'bytes '+begin+'-'+(begin+1048575)+'/83886080'});
   }
   return response(new ArrayBuffer(8));
  }
  return response({files});
 }
 return {ctx,data,reads,downloads,commits,recognized,request,files,pdf,get transport(){return activeRange},get params(){return rangeParams},get terminated(){return terminated},
  run:(options={})=>ctx.indexScannedManuals({db:{},request,rootIds:['root00001'],...options})};
}
test('AUTH_NEEDED pauses once before deleting old pages or failing remaining PDFs',async()=>{
 const saved={fileId:'manual00001',page:1,text:'keep'};
 const h=harness({files:[file(),file('manual00002'),file('manual00003')],existing:[['manualOcrPages/manual00001_1',saved]],mediaError(){throw Error('AUTH_NEEDED')}});
 const result=await h.run();
 assert.equal(result.paused,true);assert.equal(result.pauseReason,'auth');assert.equal(result.errors,0);
 assert.equal(h.downloads.length,1);assert.equal(h.data.get('manualOcrPages/manual00001_1'),saved);assert.equal(h.data.has('manualOcrFiles/manual00002'),false);
});
test('authentication during discovery pauses without counting PDF errors',async()=>{
 const h=harness();
 const result=await h.ctx.indexScannedManuals({db:{},rootIds:['root00001'],request:async()=>{throw Error('AUTH_NEEDED')}});
 assert.equal(result.paused,true);assert.equal(result.errors,0);assert.equal(result.processed,0);
});
test('manuals exceeding 60 MB and 300 pages are committed past page 300',async()=>{
 const h=harness({files:[file('manual00001',{size:80*1024*1024})],pages:305});
 const result=await h.run();
 assert.equal(result.errors,0);assert.equal(result.processed,1);assert.equal(result.ocrPages,305);
 assert.equal(h.data.get('manualOcrPages/manual00001_305').page,305);
 assert.equal(h.data.get('manualOcrFiles/manual00001').lastPage,305);
 assert.equal(h.data.get('manualOcrFiles/manual00001').status,'complete');assert.equal(h.terminated,1);
 assert(h.commits.every(batch=>batch.length<=11));
});
test('stopping saves the page and resumes without redoing committed OCR',async()=>{
 let stop=false;const h=harness({pages:25,onRecognize:n=>{if(n===12)stop=true}});
 let result=await h.run({shouldStop:()=>stop});
 assert.equal(result.stopped,true);assert.equal(result.processed,0);
 assert.equal(h.data.get('manualOcrFiles/manual00001').lastPage,12);
 h.reads.length=0;stop=false;
 result=await h.run();
 assert.equal(h.reads[0],13);assert.equal(result.ocrPages,13);
 assert.equal(h.data.get('manualOcrFiles/manual00001').ocrPageCount,25);
 assert.equal(h.data.get('manualOcrFiles/manual00001').status,'complete');
});
test('page failure retains the atomic checkpoint and retries only the unsaved block',async()=>{
 let fail=true;
 const h=harness({pages:25,pageError:n=>{if(fail&&n===16)throw Error('AUTH_NEEDED')}});
 let result=await h.run();
 assert.equal(result.paused,true);assert.equal(result.errors,0);
 assert.equal(h.data.get('manualOcrFiles/manual00001').lastPage,10);
 assert.equal(h.data.has('manualOcrPages/manual00001_11'),false);
 fail=false;h.reads.length=0;result=await h.run();
 assert.equal(h.reads[0],11);assert.equal(result.errors,0);
 assert.equal(h.data.get('manualOcrFiles/manual00001').ocrPageCount,25);
});
test('large PDFs use authenticated byte ranges without a full download',async()=>{
 const h=harness({range:true,files:[file('manual00001',{size:80*1024*1024})]});
 const opened=await h.ctx.openManualPdf({pdfjs:h.ctx.window.pdfjsLib,request:h.request,file:h.files[0]});
 assert.equal(h.params.disableAutoFetch,true);assert.equal(h.params.disableStream,true);
 assert.equal(h.transport.length,80*1024*1024);assert.equal(h.downloads.length,1);
 h.transport.requestDataRange(1048576,2097152);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.downloads[1].options.headers.Range,'bytes=1048576-2097151');
 assert.equal(h.transport.received.begin,1048576);await opened.close();
});
test('range authorization errors retain their cause and close the PDF task',async()=>{
 let fail=false;const h=harness({range:true,mediaError(){if(fail)throw Error('AUTH_NEEDED')}});
 const opened=await h.ctx.openManualPdf({pdfjs:h.ctx.window.pdfjsLib,request:h.request,file:h.files[0]});
 fail=true;h.transport.requestDataRange(1048576,2097152);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(opened.error.message,'AUTH_NEEDED');await opened.close();
});
test('Firestore permission failures pause instead of failing every manual',async()=>{
 const h=harness({files:[file(),file('manual00002')]});
 h.ctx.writeBatch=()=>({set(){},delete(){},async commit(){throw {code:'permission-denied'}}});
 const result=await h.run();
 assert.equal(result.paused,true);assert.equal(result.errors,0);assert.equal(h.downloads.length,1);
});
test('damaged PDFs are reported while the next PDF is processed',async()=>{
 const h=harness({files:[file(),file('manual00002')],pages:1,mediaError:url=>{if(url.includes('manual00001'))throw Error('PDF dañado')}});
 const result=await h.run();
 assert.equal(result.paused,false);assert.equal(result.errors,1);assert.equal(result.processed,1);
 assert.equal(result.failures[0].fileName,'manual00001.pdf');
});
test('home exposes reconnection to standard signed-in users',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const start=html.indexOf('function home(){'),end=html.indexOf('async function manualContentSearch()',start);
 const ctx={activeUser:{uid:'reader'},isAdmin:false,driveListVersion:0,clearPdfPreview(){},view:{innerHTML:''},config:{machines:[]}};
 vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);ctx.home();
 assert(ctx.view.innerHTML.includes('⟳ Reconexión'));assert(!ctx.view.innerHTML.includes('Gestionar conexión'));
 assert(!ctx.view.innerHTML.includes('manuales.taller.exolgan@gmail.com'));
});
test('OCR pause button reconnects only from a new click and then resumes',async()=>{
 const code=fs.readFileSync('manual-content-search.js','utf8').replace(/^export /gm,'');
 const elements={};const element=()=>({isConnected:true,textContent:'',disabled:false,children:[],replaceChildren(){this.children=[]},appendChild(child){this.children.push(child)}});
 const view={};Object.defineProperty(view,'innerHTML',{set(html){for(const m of html.matchAll(/id="([^"]+)"/g))elements[m[1]]=element()}});
 const ctx={document:{getElementById:id=>elements[id],createElement:element},console};
 vm.createContext(ctx);vm.runInContext(code,ctx);let reconnects=0,runs=0;
 ctx.showManualContentSearch({view,isAdmin:true,rootIds:['root00001'],home(){},onReconnect:async()=>{reconnects++},onStartOcr:async()=>({processed:0,skipped:0,ocrPages:0,errors:0,paused:++runs===1,pauseReason:runs===1?'auth':'',failures:[]})});
 await elements.manualOcrStart.onclick();assert.equal(reconnects,0);assert.equal(elements.manualOcrStart.textContent,'⟳ Reconectar y continuar');
 await elements.manualOcrStart.onclick();assert.equal(reconnects,1);assert.equal(runs,2);
});
