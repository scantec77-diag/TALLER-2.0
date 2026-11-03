const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function loadReader(){
  const context={AbortController,DOMException,Uint8Array,Number,Promise,Error,encodeURIComponent,atob};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('progressive-pdf.js','utf8').replace(/^export /gm,''),context);
  return context.createProgressivePdf;
}
test('viewer opens using requested byte ranges without downloading the complete PDF',async()=>{
  const size=10*1024*1024,calls=[];let transport,options,resolveDocument;
  class Range {constructor(length,data){assert.equal(length,size);assert.equal(data.length,0);transport=this}onDataRange(begin,bytes){assert.equal(begin,0);assert.equal(bytes.length,384*1024);resolveDocument({numPages:20})}}
  const lib={PDFDataRangeTransport:Range,getDocument(opts){options=opts;queueMicrotask(()=>transport.requestDataRange(0,384*1024));return {promise:new Promise(r=>resolveDocument=r),destroy:async()=>{}}}};
  const request=async(url,opts)=>{calls.push({url,opts});return url.includes('?')?new Response(new Uint8Array(384*1024),{status:206,headers:{'Content-Range':'bytes 0-393215/'+size}}):Response.json({size})};
  const reader=loadReader()({lib,file:{id:'manual00001'},request});
  const pdf=await reader.promise;
  assert.equal(pdf.numPages,20);assert.equal(calls.length,2);
  assert.equal(calls[1].opts.headers.Range,'bytes=0-393215');
  assert.equal(options.disableAutoFetch,true);assert.equal(options.disableStream,true);
  reader.destroy();
});
test('a server that ignores ranges fails visibly instead of silently downloading everything',async()=>{
  let error;
  class Range {requestDataRange(){}}
  const lib={PDFDataRangeTransport:Range,getDocument(opts){queueMicrotask(()=>opts.range.requestDataRange(0,10));return {promise:new Promise(()=>{}),destroy:async()=>{}}}};
  const reader=loadReader()({lib,file:{id:'manual00001'},request:async url=>url.includes('?')?new Response(new Uint8Array(10)):Response.json({size:100}),onError:e=>error=e});
  await assert.rejects(reader.promise,/fragmento solicitado/);assert.match(error.message,/fragmento solicitado/);
});
test('leaving the manual cancels loading and prevents a late metadata response from starting PDF.js',async()=>{
  let finish,started=0;
  const reader=loadReader()({lib:{getDocument(){started++}},file:{id:'manual00001'},request:()=>new Promise(r=>finish=r)});
  reader.destroy();finish(Response.json({size:100}));
  await assert.rejects(reader.promise,/cancelada/);assert.equal(started,0);
});
function viewerContext(){
  const nodes=new Map(),events=[];let observeCallback,observed=false;
  class Observer {constructor(callback){observeCallback=callback}observe(){observed=true}disconnect(){observed=false}}
  function element(){return {isConnected:true,style:{},textContent:'',disabled:false,children:[],
    append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},
    replaceChildren(...items){this.children=items},setAttribute(){},before(){},after(){},
    getContext(){return {}},insertAdjacentHTML(_,html){parse(html)},click(){}}}
  function parse(html){for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],element())}
  const view=element();view.clientWidth=400;Object.defineProperty(view,'innerHTML',{set:parse});
  const pdf={numPages:10,async getPage(page){events.push('get:'+page);return {getViewport:({scale})=>({width:400*scale,height:600*scale}),render(){events.push('render:'+page);return {promise:Promise.resolve()}},getTextContent(){throw Error('Text search must not block initial preview')}}},getData(){throw Error('Full download must be explicit')}};
  const context={driveListVersion:0,activeUser:{uid:'reader'},clearPdfPreview(){},recordLibraryVisit(){},driveTrail:[],driveFileLink:()=>'',folderHeader:()=>'',esc:s=>s,
    useServerLibrary:()=>true,bindTrailButtons(){},driveRequest(){},createCompletePdf:()=>({promise:Promise.resolve(pdf),destroy(){}}),view,
    window:{pdfjsLib:{getDocument(){},GlobalWorkerOptions:{}},devicePixelRatio:1,IntersectionObserver:Observer,removeEventListener(){}},
    document:{getElementById:id=>nodes.get(id),createElement:element},requestAnimationFrame:fn=>{events.push('paint');queueMicrotask(fn)},
    normalizeManualText:s=>s.toLowerCase(),setTimeout,URL,Blob,console};
  vm.createContext(context);
  const source=fs.readFileSync('index.html','utf8');
  vm.runInContext(source.slice(source.indexOf('async function openDriveFile('),source.indexOf('function settings(){')),context);
  return {context,nodes,events,intersect:()=>observeCallback([{isIntersecting:true}]),isObserved:()=>observed};
}
test('opening a PDF uses the prepared header and tail with just one server round trip',async()=>{
 const size=1024*1024,chunk=384*1024,tail=2*chunk,calls=[];let transport,finish;
 const chunks=[{start:0,length:chunk,size,base64:Buffer.alloc(chunk,1).toString('base64')},{start:tail,length:size-tail,size,base64:Buffer.alloc(size-tail,2).toString('base64')}];
 class Range {
  constructor(length,initial){assert.equal(length,size);assert.equal(initial.length,chunk);assert.equal(initial[0],1);transport=this}
  onDataRange(start,bytes){assert.equal(start,tail);assert.equal(bytes.length,size-tail);assert.equal(bytes[0],2);finish({numPages:60})}
 }
 const lib={PDFDataRangeTransport:Range,getDocument(){queueMicrotask(()=>transport.requestDataRange(tail,size));return {promise:new Promise(r=>finish=r),destroy:async()=>{}}}};
 const reader=loadReader()({lib,file:{id:'manual00001'},request:async(url,options)=>{calls.push(url);assert.equal(options.libraryPdfBootstrap,true);return Response.json({size,initialChunks:chunks})}});
 assert.equal((await reader.promise).numPages,60);assert.equal(calls.length,1);reader.destroy();
});
test('invalid prepared bytes cannot start the PDF reader',async()=>{
 let starts=0;
 const reader=loadReader()({lib:{getDocument(){starts++}},file:{id:'manual00001'},request:async()=>Response.json({size:10,initialChunks:[{start:0,length:10,size:10,base64:'AQ=='}]})});
 await assert.rejects(reader.promise,/fragmento inicial inválido/);assert.equal(starts,0);
});
test('prepared ranges wait for PDF.js to register each range reader',async()=>{
 const size=1024*1024,chunk=384*1024,tail=2*chunk,registered=new Set(),delivered=[];
 let transport,finish;
 class Range {
  constructor(){transport=this}
  onDataRange(begin,bytes){
   assert.ok(registered.has(begin),'_onReceiveData - no PDFDataTransportStreamRangeReader instance found');
   delivered.push([begin,bytes.length,bytes[0]]);
   // The real PDF worker takes ownership of the delivered ArrayBuffer.
   structuredClone(bytes,{transfer:[bytes.buffer]});
   if(delivered.length===2)finish({numPages:60});
  }
 }
 const lib={PDFDataRangeTransport:Range,getDocument(){
  queueMicrotask(()=>{
   // PDF.js 3.11 calls requestDataRange before adding its reader to the list.
   for(const [begin,end] of [[tail,size],[tail+10,tail+30]]){
    transport.requestDataRange(begin,end);registered.add(begin);
   }
  });
  return {promise:new Promise(r=>finish=r),destroy:async()=>{}};
 }};
 const reader=loadReader()({lib,file:{id:'manual00001'},request:async()=>Response.json({size,initialChunks:[
  {start:tail,length:size-tail,size,base64:Buffer.alloc(size-tail,7).toString('base64')}
 ]})});
 assert.equal((await reader.promise).numPages,60);
 assert.deepEqual(delivered,[[tail,size-tail,7],[tail+10,20,7]]);reader.destroy();
});
test('closing the manual suppresses a queued prepared response',async()=>{
 let delivered=0,reader;
 class Range {onDataRange(){delivered++}}
 const lib={PDFDataRangeTransport:Range,getDocument({range}){
  queueMicrotask(()=>{range.requestDataRange(0,10);reader.destroy()});
  return {promise:new Promise(()=>{}),destroy:async()=>{}};
 }};
 reader=loadReader()({lib,file:{id:'manual00001'},request:async()=>Response.json({size:10,initialChunks:[
  {start:0,length:10,size:10,base64:Buffer.alloc(10).toString('base64')}
 ]})});
 await assert.rejects(reader.promise,/cancelada/);await new Promise(setImmediate);
 assert.equal(delivered,0);
});
test('first page paints before pages two and three are requested; full text scanning waits for a click',async()=>{
  const {context,nodes,events,intersect,isObserved}=viewerContext();
  await context.openDriveFile({id:'manual00001',name:'Manual.pdf',mimeType:'application/pdf'},'engine');
  assert.deepEqual(events,['get:1','render:1','paint','get:2','render:2','paint','get:3','render:3','paint']);
  assert.equal(nodes.get('pdfPages').children.length,6);
  assert.match(nodes.get('pdfStatus').textContent,/1–3 listas/);
  assert.equal(nodes.has('pdfNext'),false);assert.equal(isObserved(),true);
  const firstCanvas=nodes.get('pdfPages').children[1];
  intersect();intersect();await new Promise(setImmediate);
  assert.deepEqual(events.filter(x=>x.startsWith('get:')),['get:1','get:2','get:3','get:4','get:5','get:6']);
  assert.equal(nodes.get('pdfPages').children.length,12);assert.equal(nodes.get('pdfPages').children[1],firstCanvas);
  intersect();await new Promise(setImmediate);intersect();await new Promise(setImmediate);
  assert.equal(nodes.get('pdfPages').children.length,20);assert.equal(nodes.get('pdfMore').hidden,true);assert.equal(isObserved(),false);
  intersect();await new Promise(setImmediate);assert.equal(events.filter(x=>x.startsWith('get:')).length,10);
});
test('leaving a manual disconnects automatic loading and prevents new page requests',async()=>{
  const {context,events,intersect,isObserved}=viewerContext();
  await context.openDriveFile({id:'manual00001',name:'Manual.pdf',mimeType:'application/pdf'});
  context.pdfPreviewTask.destroy();assert.equal(isObserved(),false);
  intersect();await new Promise(setImmediate);
  assert.equal(events.filter(x=>x.startsWith('get:')).length,3);
});



