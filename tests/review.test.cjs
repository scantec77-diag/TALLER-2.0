const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function configuration(raw,blocked=false){
 const start=html.indexOf('const KEY="taller20_config_v1";');
 const end=html.indexOf("const view=document.getElementById('view');",start);
 const store={value:raw};
 const ctx={console:{warn(){}},localStorage:{getItem(){if(blocked)throw Error('blocked');return store.value},setItem(k,v){if(blocked)throw Error('blocked');store.value=v}}};
 vm.createContext(ctx);
 vm.runInContext(html.slice(start,end)+"function persist(){try{localStorage.setItem(KEY,JSON.stringify(config))}catch(e){}};globalThis.result=config;",ctx);
 return ctx.result;
}
test('startup recovers malformed JSON and blocked storage',()=>{
 for(const raw of ['{bad','null','[]','{"machines":null}','{"machines":[null,{},1]}'])assert.equal(configuration(raw).machines.length,23);
 assert.equal(configuration(null,true).machines.length,23);
});
test('configuration preserves custom folders and deleted default folders',()=>{
 const base=configuration(null),removed=base.machines[0].folder;
 const restored=configuration(JSON.stringify({machines:[{name:'Custom',folder:'custom123'}],removed:[removed]}));
 assert(!restored.machines.some(m=>m.folder===removed));
 assert(restored.machines.some(m=>m.folder==='custom123'));
});
test('Apps Script folder names cannot terminate embedded script',()=>{
 let template;
 const context={LIBRARY_ROOT_:'root',validUser_:()=>({uid:'user'}),allowedFile_:()=>({name:'</script><script>alert(1)</script>'}),Utilities:{getUuid:()=> 'uuid'},CacheService:{getScriptCache:()=>({put(){}})},HtmlService:{createTemplateFromFile(){template={evaluate:()=>({setTitle(){}})};return template}}};
 vm.createContext(context);
 const source=fs.readFileSync('apps-script/Code.gs','utf8');
 vm.runInContext(source.slice(source.indexOf('function doPost('),source.indexOf('function validSession_(')),context);
 context.doPost({parameter:{idToken:'token',folderId:'root'}});
 assert(!template.folderNameJson.includes('</script>'));
 assert.equal(JSON.parse(template.folderNameJson),'</script><script>alert(1)</script>');
});
test('all inline JavaScript and modules parse',()=>{
 const {spawnSync}=require('node:child_process');
 const paths=['index.html','apps-script/Biblioteca.html','prueba-conexion-biblioteca.html','apps-script/Code.gs','push-notifications.js','firebase-messaging-sw.js','firebase-config.js','push-config.js','functions/index.js'];
 for(const path of paths){const text=fs.readFileSync(path,'utf8');const codes=path.endsWith('.html')?[...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]):[text];for(let code of codes){code=code.replace(/<\?!=.*?\?>/g,'"test"');const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:code,encoding:'utf8'});assert.equal(result.status,0,path+': '+result.stderr);}}
});
test('notes finish saving after leaving the screen without touching a missing status',async()=>{
 const start=html.indexOf('async function notes(){'),end=html.indexOf('\n\nlet stopCommonNotifications',start);
 const elements={myNotes:{value:'',addEventListener(event,fn){this.input=fn}},noteStatus:{textContent:''}};
 let timer,written;
 const ctx={activeUser:{uid:'user'},db:{},doc:(...x)=>x,getDoc:async()=>({exists:()=>true,data:()=>({content:'old'})}),setDoc:async(ref,data)=>{written=data},view:{innerHTML:''},document:{getElementById:id=>elements[id]},window:{},clearTimeout(){},setTimeout(fn){timer=fn},alert(){}};
 vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);await ctx.notes();
 const input=elements.myNotes;input.value='saved after navigation';input.input();delete elements.noteStatus;
 await timer();assert.equal(written.content,'saved after navigation');
});
test('late PDF response does not overwrite a newer view',async()=>{
 const start=html.indexOf('async function openDriveFile(file){'),end=html.indexOf('\nfunction settings()',start);
 const screen={isConnected:true};let resolve,created=0;
 const ctx={driveListVersion:0,activeUser:{uid:'u'},clearPdfPreview(){},recordLibraryVisit(){},driveTrail:[],driveFileLink:()=>'',view:{innerHTML:''},folderHeader:()=>'',esc:x=>x,bindTrailButtons(){},document:{getElementById:()=>screen},driveRequest:()=>new Promise(r=>resolve=r),URL:{createObjectURL(){created++;return 'blob:test'}},Blob};
 vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 const result=ctx.openDriveFile({id:'test',name:'test.pdf',mimeType:'application/pdf'});screen.isConnected=false;ctx.driveListVersion++;
 resolve({blob:async()=>new Blob(['test'])});await result;assert.equal(created,0);
});

test('common text capacity counts UTF-8 bytes including accents and emoji',()=>{
 const start=html.indexOf('function commonTextBytes('),end=html.indexOf('async function compressCommonPhoto(',start);
 const ctx={TextEncoder};vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 assert.equal(ctx.commonTextBytes('á😀a'),7);
 assert.equal(ctx.commonTextBytes('a'.repeat(1040000)),1040000);
 assert.equal(ctx.commonTextBytes('😀'.repeat(260000)),1040000);
 assert(ctx.commonTextBytes('😀'.repeat(260001))>1040000);
});
test('common messages preserve failed drafts and save photos atomically apart from text',async()=>{
 const elements={};
 function element(){return {value:'',textContent:'',isConnected:true,disabled:false,style:{},children:[],addEventListener(){},setCustomValidity(){},replaceChildren(){this.children=[]},append(...items){this.children.push(...items)}}}
 const view=element();Object.defineProperty(view,'innerHTML',{set(html){for(const m of html.matchAll(/id="([^"]+)"/g))elements[m[1]]=element()}});
 let fail=false,writes=[],calls=0;
 const ctx={TextEncoder,activeUser:{uid:'u',displayName:'Ari'},db:{},view,document:{getElementById:id=>elements[id],createElement:element},collection:(...x)=>x.slice(1).join('/'),doc:(...x)=>x.length===1?{id:'id',path:x[0]+'/id'}:x.slice(1).join('/'),serverTimestamp:()=>1,orderBy(){},limit(){},startAfter(){},query(){},getDocs:async()=>({docs:[],size:0}),writeBatch(){let pending=[];return {set(ref,data){pending.push({ref,data})},async commit(){calls++;if(fail)throw {code:'permission-denied'};writes=pending}}}};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('// Leave 8 KiB'),html.indexOf('\nfunction pushSettings()')),ctx);ctx.commonSpace();
 const form=elements.commonForm,input=elements.commonText;
 input.value='x'.repeat(4000);await form.onsubmit({preventDefault(){}});assert.equal(writes[0].data.text.length,4000);
 fail=true;input.value='conservar';await form.onsubmit({preventDefault(){}});assert.equal(input.value,'conservar');assert.equal(elements.commonSend.disabled,false);
 input.value='😀'.repeat(260001);const before=calls;await form.onsubmit({preventDefault(){}});assert.equal(calls,before);
 ctx.compressCommonPhoto=async()=> 'data:image/jpeg;base64,YQ==';elements.commonFiles.files=[{type:'image/jpeg'}];await elements.commonFiles.onchange();
 fail=false;input.value='';await form.onsubmit({preventDefault(){}});
 assert.equal(writes.length,2);assert.equal(writes[0].data.photoCount,1);assert.equal(writes[0].data.text,'');assert(!('dataUrl' in writes[0].data));assert.equal(writes[1].ref,'commonMessages/id/photos/0');assert.equal(input.value,'');
});
