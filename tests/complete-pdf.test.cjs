const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function reader(){
 const ctx={AbortController,DOMException,Uint8Array,Promise,Error,encodeURIComponent};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('progressive-pdf.js','utf8').replace(/^export /gm,''),ctx);
 return ctx.createCompletePdf;
}
test('complete viewer supplies all bytes without creating a PDF range transport',async()=>{
 let options,calls=0;
 const r=reader()({file:{id:'manual00001'},lib:{getDocument(value){options=value;return {promise:Promise.resolve({numPages:1}),destroy(){}}}},request:async(url,opts)=>{
  calls++;assert.match(url,/alt=media/);assert.equal(opts.libraryCompletePdf,true);assert.equal(opts.headers,undefined);
  return new Response(new Uint8Array([37,80,68,70]));
 }});
 assert.equal((await r.promise).numPages,1);assert.equal(calls,1);
 assert.deepEqual([...options.data],[37,80,68,70]);assert.equal(options.disableRange,true);assert.equal(options.range,undefined);r.destroy();
});
test('complete viewer cancellation prevents a late download from opening PDF.js',async()=>{
 let finish,starts=0;
 const r=reader()({file:{id:'manual00001'},lib:{getDocument(){starts++}},request:()=>new Promise(resolve=>finish=resolve)});
 r.destroy();finish(new Response('pdf'));await assert.rejects(r.promise,/cancelada/);assert.equal(starts,0);
});
test('complete download limits concurrency and assembles out of order responses correctly',async()=>{
 const ctx={URL,Response,Headers,Blob,Uint8Array,DOMException,atob};vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('library-server.js','utf8').replace(/^export /gm,''),ctx);
 const block=384*1024,size=block*4+7,progress=[];let active=0,peak=0;
 const request=async(method,args)=>{
  if(method==='metadatosArchivo')return {size,mimeType:'application/pdf'};
  active++;peak=Math.max(peak,active);const start=args[1];
  await new Promise(resolve=>setTimeout(resolve,start===0?10:1));active--;
  const bytes=Buffer.alloc(Math.min(block,size-start),start/block+1);
  return {start,size,length:bytes.length,base64:bytes.toString('base64')};
 };
 const response=await ctx.libraryDriveResponse(request,'https://www.googleapis.com/drive/v3/files/manual00001?alt=media',{libraryCompletePdf:true,libraryProgress:p=>progress.push(p.received)});
 const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(bytes.length,size);assert.equal(peak,3);
 for(let i=0;i<5;i++)assert.equal(bytes[i*block],i+1);
 assert.equal(progress.at(-1),size);assert.ok(progress.every((n,i)=>!i||n>progress[i-1]));
});
test('complete download refuses changed files and denied access',async()=>{
 const ctx={URL,Response,Headers,Blob,Uint8Array,DOMException,atob};vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('library-server.js','utf8').replace(/^export /gm,''),ctx);
 for(const denied of [false,true]){
  const request=async(method)=>{if(method==='metadatosArchivo')return {size:4};if(denied)throw Error('Acceso bloqueado');return {start:0,size:8,length:4,base64:'AQIDBA=='}};
  await assert.rejects(ctx.libraryDriveResponse(request,'https://www.googleapis.com/drive/v3/files/manual00001?alt=media',{libraryCompletePdf:true}),denied?/bloqueado/:/cambió/);
 }
});
