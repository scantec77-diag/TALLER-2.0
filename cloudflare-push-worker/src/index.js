// Taller 2.0: puerta de envío FCM sin Cloud Functions (Cloudflare Workers Free).
// NO desplegar sin configurar FIREBASE_SERVICE_ACCOUNT_JSON como secreto privado.
// Aviso intencionalmente sin texto del mensaje: un tema FCM no autentica receptores.
const PROJECT = 'taller-2-0';
const WEB_API_KEY = 'AIzaSyCHFS8iMwgTdK_JGsxSTodblP6OJFahWbA';
const ALLOWED_ORIGIN = 'https://scantec77-diag.github.io';
const TOPIC = 'taller20_espacio_comun';
let cachedAccessToken = null;
let cachedUntil = 0;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
   'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Vary':'Origin'}
});
const b64url = bytes => {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let binary = '';
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
};
const cleanName = value => String(value || 'Alguien')
  .replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim().slice(0,80) || 'Alguien';

async function verifyUser(firebaseToken) {
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + WEB_API_KEY, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({idToken: firebaseToken})
  });
  if (!response.ok) throw new Error('INVALID_AUTH');
  const payload = await response.json();
  const user = payload.users?.[0];
  if (!user?.localId || user.emailVerified !== true ||
      !user.providerUserInfo?.some(p => p.providerId === 'google.com')) throw new Error('INVALID_AUTH');
  return user;
}

async function readCommonMessage(token, id) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/commonMessages/' + encodeURIComponent(id);
  const response = await fetch(url, {headers: {'Authorization':'Bearer '+token}});
  if (!response.ok) throw new Error(response.status === 403 ? 'PERMISSION_DENIED' : 'MESSAGE_NOT_FOUND');
  return response.json();
}

async function getServiceToken(env) {
  if (cachedAccessToken && Date.now() < cachedUntil) return cachedAccessToken;
  const credentials = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || 'null');
  if (!credentials?.client_email || !credentials?.private_key || credentials.project_id !== PROJECT) {
    throw new Error('SERVER_NOT_CONFIGURED');
  }
  const now = Math.floor(Date.now()/1000);
  const header = b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim = b64url(JSON.stringify({
    iss:credentials.client_email, sub:credentials.client_email,
    aud:'https://oauth2.googleapis.com/token', iat:now, exp:now+3600,
    scope:'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore'
  }));
  const encoded = header+'.'+claim;
  const keyBody = credentials.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const keyData = Uint8Array.from(atob(keyBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyData, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(encoded));
  const assertion = encoded+'.'+b64url(new Uint8Array(sig));
  const response = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})
  });
  if (!response.ok) throw new Error('SERVICE_TOKEN_REJECTED');
  const oauth = await response.json();
  if (!oauth.access_token) throw new Error('SERVICE_TOKEN_MISSING');
  cachedAccessToken=oauth.access_token;
  cachedUntil=Date.now()+Math.max(30, Math.min(3300, (oauth.expires_in||3600)-120))*1000;
  return cachedAccessToken;
}

async function recordOnce(oauth, id) {
  const base='https://firestore.googleapis.com/v1/projects/'+PROJECT+
    '/databases/(default)/documents/pushDispatches';
  const r=await fetch(base+'?documentId='+encodeURIComponent(id),{
    method:'POST',headers:{'Authorization':'Bearer '+oauth,'Content-Type':'application/json'},
    body:JSON.stringify({fields:{createdAt:{timestampValue:new Date().toISOString()},channel:{stringValue:'common'}}})
  });
  if (r.status===409) return false;
  if (!r.ok) throw new Error('DISPATCH_LOG_FAILED');
  return true;
}
async function undoDispatch(oauth, id) {
  await fetch('https://firestore.googleapis.com/v1/projects/'+PROJECT+
    '/databases/(default)/documents/pushDispatches/'+encodeURIComponent(id),{
    method:'DELETE',headers:{Authorization:'Bearer '+oauth}
  }).catch(()=>{});
}

async function handle(req, env) {
  const origin=req.headers.get('Origin');
  if (origin !== ALLOWED_ORIGIN) return json({error:'ORIGIN_NOT_ALLOWED'},403);
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':ALLOWED_ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Max-Age':'600','Vary':'Origin'
  }});
  if (req.method !== 'POST' || new URL(req.url).pathname !== '/notify') return json({error:'NOT_FOUND'},404);
  if (Number(req.headers.get('Content-Length')||0)>2048) return json({error:'TOO_LARGE'},413);
  const bearer=req.headers.get('Authorization')||'';
  if (!bearer.startsWith('Bearer ') || bearer.length>8192) return json({error:'AUTH_REQUIRED'},401);
  let user;
  try { user=await verifyUser(bearer.slice(7)); }
  catch (_) { return json({error:'AUTH_INVALID'},401); }
  let requestData;
  try { requestData=await req.json(); }
  catch (_) { return json({error:'BAD_JSON'},400); }
  const id=requestData?.messageId;
  if (typeof id!=='string' || !/^[a-zA-Z0-9]{8,128}$/.test(id)) return json({error:'BAD_MESSAGE_ID'},400);
  let source;
  try { source=await readCommonMessage(bearer.slice(7),id); }
  catch (_) { return json({error:'MESSAGE_NOT_AVAILABLE'},403); }
  const fields=source.fields||{};
  if (fields.authorId?.stringValue !== user.localId) return json({error:'NOT_AUTHOR'},403);
  const createdAt=Date.parse(fields.createdAt?.timestampValue||'');
  if (!Number.isFinite(createdAt) || Math.abs(Date.now()-createdAt)>120000) {
    return json({error:'MESSAGE_EXPIRED'},409);
  }
  const authorName=cleanName(fields.authorName?.stringValue);
  let oauth;
  try { oauth=await getServiceToken(env); }
  catch (e) { console.error(e.message); return json({error:'NOT_CONFIGURED'},503); }
  let fresh;
  try { fresh=await recordOnce(oauth,id); }
  catch(e) { console.error(e.message); return json({error:'DELIVERY_NOT_READY'},503); }
  if (!fresh) return json({ok:true,alreadySent:true});
  const fcmBody={message:{
    topic:TOPIC,
    notification:{title:'Taller 2.0 · Espacio Común',body:authorName+' escribió un mensaje'},
    data:{type:'common-message',authorName,messageId:id},
    android:{priority:'HIGH',notification:{channel_id:'espacio_comun'}}
  }};
  let r;
  try { r=await fetch('https://fcm.googleapis.com/v1/projects/'+PROJECT+'/messages:send',{
    method:'POST',headers:{Authorization:'Bearer '+oauth,'Content-Type':'application/json'},
    body:JSON.stringify(fcmBody)
  });}
  catch(e){console.error('FCM network failure',e.message);return json({error:'DELIVERY_UNCERTAIN'},502);}
  if (!r.ok) {
    console.error('FCM error',r.status,(await r.text()).slice(0,300));
    await undoDispatch(oauth,id); // FCM lo rechazó, así que es seguro habilitar un reintento.
    return json({error:'FCM_REJECTED'},502);
  }
  return json({ok:true});
}
export default {
  async fetch(request,env) {
    try {return await handle(request,env);}
    catch(e){ console.error('Worker inesperado:',e);return json({error:'SERVER_ERROR'},500);}
  }
};
