const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function management({target='reader',role='reader',promoted=false}={}){
  const writes=[],state={};let reads=0,refreshes=0;
  const ctx={activeUser:{uid:'admin'},isAdmin:true,window:{confirm:()=>true},view:{querySelectorAll:()=>[]},
    document:{getElementById:()=>state},db:{},doc:(_,collection,uid)=>({collection,uid}),
    getDoc:async()=>({exists:()=>true,data:()=>++reads===1?{role:promoted?'admin':role}:writes[0].data}),
    setDoc:async(ref,data)=>writes.push({ref,data}),serverTimestamp:()=>123,accessDashboard:async()=>refreshes++};
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('let accessUsers='),html.indexOf('async function accessDashboard(){')),ctx);
  vm.runInContext('accessUsers.set('+JSON.stringify(target)+','+JSON.stringify({uid:target,role,displayName:'Test'})+')',ctx);
  return {ctx,writes,state,refreshed:()=>refreshes};
}
test('administrator can block, unblock and remove access with a verified readback',async()=>{
  for(const [action,status] of [['block','blocked'],['unblock','active'],['delete','deleted']]){
    const {ctx,writes,refreshed}=management();await ctx.changeUserAccess('reader',action);
    assert.equal(writes.length,1);assert.equal(writes[0].ref.uid,'reader');assert.equal(writes[0].data.role,'reader');
    assert.equal(writes[0].data.status,status);assert.equal(writes[0].data.updatedBy,'admin');assert.equal(refreshed(),1);
  }
});
test('self, administrator accounts and stale cards of promoted administrators are protected',async()=>{
  for(const options of [{target:'admin'},{role:'admin'},{promoted:true}]){
    const {ctx,writes}=management(options);await ctx.changeUserAccess(options.target||'reader','block');assert.equal(writes.length,0);
  }
  const {ctx,writes}=management();ctx.isAdmin=false;await ctx.changeUserAccess('reader','delete');assert.equal(writes.length,0);
});
test('cancellation performs no write and removed access can be restored',async()=>{
  const {ctx,writes}=management();ctx.window.confirm=()=>false;await ctx.changeUserAccess('reader','block');assert.equal(writes.length,0);
  vm.runInContext("accessUsers.get('reader').status='deleted'",ctx);ctx.window.confirm=()=>true;
  await ctx.changeUserAccess('reader','unblock');assert.equal(writes[0].data.status,'active');
});
function service(){
  const cache=new Map();let status='active';
  const ctx={CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value)})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha'},computeDigest:()=>[1,2]},console};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),ctx);
  ctx.jsonRequest_=url=>url.includes('accounts:lookup')?{users:[{localId:'reader',emailVerified:true,providerUserInfo:[{providerId:'google.com'}]}]}:
    {fields:{role:{stringValue:'reader'},status:{stringValue:status}}};
  return {ctx,cache,setStatus:value=>status=value};
}
test('cached identity cannot bypass a new block or deletion',()=>{
  const {ctx,setStatus}=service(),token='x'.repeat(150);
  assert.equal(ctx.validUser_(token).uid,'reader');
  setStatus('blocked');assert.throws(()=>ctx.validUser_(token),/bloqueado/);
  setStatus('deleted');assert.throws(()=>ctx.validUser_(token),/eliminado/);
  setStatus('active');assert.equal(ctx.validUser_(token).uid,'reader');
});
test('an already open library session rechecks revocation on every operation',()=>{
  const {ctx,cache,setStatus}=service(),session='a'.repeat(73);
  cache.set('library_'+session,JSON.stringify({uid:'reader',token:'x'.repeat(150)}));
  assert.equal(ctx.validSession_(session),'reader');
  setStatus('blocked');assert.throws(()=>ctx.validSession_(session),/bloqueado/);
  setStatus('active');assert.equal(ctx.validSession_(session),'reader');
  cache.set('library_'+session,'reader');assert.throws(()=>ctx.validSession_(session),/Sesión inválida/);
});
