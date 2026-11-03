const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('library-server.js','utf8').replace(/^export /gm,'');
function clientContext(extra={}){
 const ctx={URL,URLSearchParams,Response,Headers,Blob,Uint8Array,DOMException,atob,crypto:require('node:crypto').webcrypto,console,setTimeout,clearTimeout,...extra};
 vm.createContext(ctx);vm.runInContext(source,ctx);return ctx;
}
test('reader first access sends only their personal Firebase session, never shared credentials',async()=>{
 let receive;const forms=[],sent=[];const origin='https://frame-script.googleusercontent.com';
 const remote={postMessage(message,to){sent.push({message,to});queueMicrotask(()=>receive({origin,source:remote,data:{channel:message.channel,nonce:message.nonce,type:'result',id:message.id,result:{ok:true}}}))}};
 const document={body:{appendChild(){}},createElement(tag){return {tag,children:[],appendChild(c){this.children.push(c)},remove(){},submit(){forms.push(this);const fields=Object.fromEntries(this.children.map(x=>[x.name,x.value]));queueMicrotask(()=>receive({origin,source:remote,data:{channel:'taller-library-v1',nonce:fields.bridgeNonce,type:'ready'}}))}}}};
 const ctx=clientContext({window:{addEventListener(_,fn){receive=fn}},document});
 const client=ctx.createLibraryServer({url:'https://script.google.com/macros/s/test/exec',getIdToken:async()=>'personal-firebase-session',timeoutMs:100});
 await client.connect();const result=await client.request('metadatosArchivo',['manual00001']);
 assert.equal(result.ok,true);assert.equal(forms.length,1);
 const fields=Object.fromEntries(forms[0].children.map(x=>[x.name,x.value]));
 assert.deepEqual(Object.keys(fields).sort(),['bridgeNonce','idToken','mode']);assert.equal(fields.idToken,'personal-firebase-session');
 assert(!JSON.stringify(forms).includes('manuales.taller'));assert.equal(sent[0].to,origin);client.close();
});
test('logout while a token refresh is pending cannot establish a library session',async()=>{
 let resolveToken,forms=0;
 const ctx=clientContext({window:{addEventListener(){}},document:{createElement(){forms++;return {}},body:{appendChild(){}}}});
 const client=ctx.createLibraryServer({url:'https://script.google.com/macros/s/test/exec',getIdToken:()=>new Promise(r=>resolveToken=r)});
 const connecting=client.connect();client.close();resolveToken('old-user-token');
 await assert.rejects(connecting,/sesión.*cambió/);assert.equal(forms,0);
});
test('Drive byte ranges are served with exact bounds through the library RPC',async()=>{
 const ctx=clientContext(),calls=[];const bytes=Uint8Array.from({length:12},(_,i)=>i);
 const request=async(method,args)=>{calls.push({method,args});if(method==='metadatosArchivo')return {size:12,mimeType:'application/pdf'};const start=args[1],block=bytes.slice(start,start+4);return {start,length:block.length,base64:Buffer.from(block).toString('base64')}};
 const response=await ctx.libraryDriveResponse(request,'https://www.googleapis.com/drive/v3/files/manual00001?alt=media',{headers:{Range:'bytes=3-8'}});
 assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 3-8/12');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[3,4,5,6,7,8]);
 assert.deepEqual(calls.filter(x=>x.method==='bloqueArchivo').map(x=>x.args[1]),[3,7]);
});
test('library adapter cannot write files or call another service',async()=>{
 const ctx=clientContext();let calls=0;const request=()=>calls++;
 await assert.rejects(ctx.libraryDriveResponse(request,'https://evil.example/drive/v3/files/manual00001'),/no admitida/);
 await assert.rejects(ctx.libraryDriveResponse(request,'https://www.googleapis.com/drive/v3/files/manual00001',{method:'DELETE'}),/no admitida/);assert.equal(calls,0);
});
test('PDF range reads reuse opening metadata while every block still reaches the authorized server',async()=>{
 const ctx=clientContext(),calls=[];
 const request=async(method,args)=>{calls.push(method);if(method==='metadatosArchivo')throw Error('Redundant metadata request');return {start:args[1],length:4,size:12,base64:Buffer.from([1,2,3,4]).toString('base64')}};
 const file={id:'manual00001',size:12,mimeType:'application/pdf'};
 for(const range of ['bytes=0-3','bytes=4-7','bytes=8-11']){
  const response=await ctx.libraryDriveResponse(request,'https://www.googleapis.com/drive/v3/files/manual00001?alt=media',{headers:{Range:range},libraryFile:file});
  assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,4);
 }
 assert.deepEqual(calls,['bloqueArchivo','bloqueArchivo','bloqueArchivo']);
 await assert.rejects(ctx.libraryDriveResponse(async()=>{throw Error('Tu acceso está bloqueado')},'https://www.googleapis.com/drive/v3/files/manual00001?alt=media',{headers:{Range:'bytes=0-3'},libraryFile:file}),/bloqueado/);
});
test('reused metadata cannot silently read a changed PDF or a different file',async()=>{
 const ctx=clientContext();let metadata=0;
 const request=async(method,args)=>{if(method==='metadatosArchivo'){metadata++;return {size:12}}return {start:args[1],length:4,size:16,base64:Buffer.from([1,2,3,4]).toString('base64')}};
 await assert.rejects(ctx.libraryDriveResponse(request,'https://www.googleapis.com/drive/v3/files/manual00001?alt=media',{headers:{Range:'bytes=0-3'},libraryFile:{id:'otherfile001',size:12}}),/archivo cambió/);
 assert.equal(metadata,1);
});
function backend(role='reader',provider='google.com'){
 const cache=new Map(),ctx={console,Utilities:{DigestAlgorithm:{SHA_256:'sha'},computeDigest:()=>[1,2,3]},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),ctx);
 ctx.jsonRequest_=url=>url.includes('accounts:lookup')?{users:[{localId:'own-google-user',emailVerified:true,email:'reader@example.test',providerUserInfo:[{providerId:provider}]}]}:{fields:{role:{stringValue:role}}};
 return ctx;
}
test('server authorizes a reader by their own Google identity and Firestore role',()=>{
 assert.equal(backend().validUser_('x'.repeat(150)).uid,'own-google-user');
 assert.throws(()=>backend('unapproved').validUser_('x'.repeat(150)),/no tiene permiso/);
 assert.throws(()=>backend('reader','password').validUser_('x'.repeat(150)),/con Google/);
});
test('Drive search cannot expose files outside the library root',()=>{
 const ctx=backend();ctx.validSession_=()=>true;
 ctx.driveApi_=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({files:[{id:'inside00001',name:'allowed.pdf',parents:['11cVCcyrGyjp17oqkjZ5uS93PqstprZ9Y']},{id:'outside0001',name:'private.pdf',parents:['elsewhere00']}]})});
 ctx.meta_=id=>({id,parents:[]});
 const result=ctx.consultarArchivos('session',{q:"fullText contains 'manual'"});assert.equal(result.files.length,1);assert.equal(result.files[0].name,'allowed.pdf');
});
test('standard-user reconnect never starts the shared Google-account popup',async()=>{
 const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('async function authorizeDriveAccount(){'),end=html.indexOf('\nfunction bindConnectionButton',start);
 let connects=0,popups=0;
 const ctx={activeUser:{uid:'reader'},auth:{currentUser:{uid:'reader'}},useServerLibrary:()=>true,libraryServer:{connect:async()=>connects++},signInWithPopup(){popups++},reauthenticateWithPopup(){popups++}};
 vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);await ctx.authorizeDriveAccount();assert.equal(connects,1);assert.equal(popups,0);
});

