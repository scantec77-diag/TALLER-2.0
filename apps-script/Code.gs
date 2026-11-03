/**
 * Taller 2.0 — biblioteca privada. Ejecutar COMO la cuenta que tiene
 * acceso a la carpeta raíz. Publicar acceso "Cualquier persona", ya que
 * CADA operación valida un Firebase ID token y un rol en Firestore.
 * No poner contraseñas, tokens permanentes ni claves privadas aquí.
 */
const LIBRARY_ROOT_='11cVCcyrGyjp17oqkjZ5uS93PqstprZ9Y';
const FIREBASE_WEB_API_KEY_='AIzaSyCHFS8iMwgTdK_JGsxSTodblP6OJFahWbA';
const FIREBASE_PROJECT_='taller-2-0';
const MAX_CHUNK_=384*1024;

// La biblioteca se abre con POST desde Taller 2.0: no hay segundo login de Google.
function doGet(){
  return HtmlService.createHtmlOutput('<h2>Biblioteca de Taller 2.0</h2><p>Abrí un manual desde Taller 2.0 para ingresar.</p>')
    .setTitle('Taller 2.0 · Biblioteca');
}
function doPost(e){
  try{
    const params=(e&&e.parameter)||{};
    const user=validUser_(String(params.idToken||''));
    const folder=String(params.folderId||LIBRARY_ROOT_);
    const info=allowedFile_(folder,true);
    const session=Utilities.getUuid()+'-'+Utilities.getUuid();
    CacheService.getScriptCache().put('library_'+session,JSON.stringify({uid:user.uid,token:String(params.idToken||'')}),21600);
    const t=HtmlService.createTemplateFromFile('Biblioteca');
    t.sessionJson=JSON.stringify(session);
    t.bridgeJson=JSON.stringify(params.mode==='bridge');
    t.bridgeNonceJson=JSON.stringify(/^[0-9a-f-]{36}$/.test(String(params.bridgeNonce||''))?params.bridgeNonce:'');
    t.folderJson=JSON.stringify(folder);
    t.folderNameJson=JSON.stringify(info.name||'Biblioteca').replace(/</g,'\\u003c');
    const output=t.evaluate().setTitle('Taller 2.0 · Biblioteca');
    return params.mode==='bridge'?output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL):output;
  }catch(err){
    if(e?.parameter?.mode==='bridge'&&/^[0-9a-f-]{36}$/.test(String(e.parameter.bridgeNonce||''))){
      const message={channel:'taller-library-v1',nonce:e.parameter.bridgeNonce,type:'ready',error:'Tu cuenta de Taller no tiene acceso a la biblioteca o la sesión venció. Volvé a ingresar con tu cuenta personal.'};
      return HtmlService.createHtmlOutput('<script>window.top.postMessage('+JSON.stringify(message).replace(/</g,'\\u003c')+',"https://scantec77-diag.github.io")</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    return HtmlService.createHtmlOutput('<h3>Acceso a la biblioteca no autorizado</h3>'+
      '<p>Volvé a Taller 2.0 para iniciar sesión o pedir permiso de acceso.</p>'+
      '<p><a href="https://scantec77-diag.github.io/TALLER-2.0/">Volver a Taller 2.0</a></p>')
      .setTitle('Taller 2.0 · Permiso requerido');
  }
}
function validSession_(session){
  if(!/^[0-9a-f-]{73}$/.test(String(session||'')))throw Error('Sesión inválida. Volvé a ingresar desde Taller 2.0.');
  const stored=CacheService.getScriptCache().get('library_'+session);
  if(!stored)throw Error('La sesión de biblioteca venció. Volvé a ingresar desde Taller 2.0.');
  let identity;try{identity=JSON.parse(stored)}catch(_){}
  if(!identity?.uid||!identity?.token)throw Error('Sesión inválida. Reconectá la biblioteca.');
  // Recheck revocation on every operation; a cached session is not permission.
  checkLibraryRole_(identity.uid,identity.token);
  return identity.uid;
}
function jsonRequest_(url,opt){
  const response=UrlFetchApp.fetch(url,Object.assign({muteHttpExceptions:true,followRedirects:true},opt||{}));
  const code=response.getResponseCode();
  let data={};
  try{data=JSON.parse(response.getContentText())}catch(_){}
  if(code<200||code>=300)throw Error('El servicio rechazó la solicitud ('+code+').');
  return data;
}
function validUser_(token){
  if(typeof token!=='string'||token.length<100||token.length>9000)throw Error('Ingresá a Taller 2.0 con tu cuenta Google.');
  const key=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token)
    .map(x=>(x<0?x+256:x).toString(16).padStart(2,'0')).join('');
  const cache=CacheService.getScriptCache();
  const previous=cache.get('auth_'+key);
  if(previous){checkLibraryRole_(previous,token);return {uid:previous}};
  const verify=jsonRequest_('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(FIREBASE_WEB_API_KEY_),{
    method:'post',contentType:'application/json',payload:JSON.stringify({idToken:token})
  });
  const user=verify.users&&verify.users[0];
  if(!user||!user.localId||!user.emailVerified)throw Error('Cuenta no verificada.');
  const providers=user.providerUserInfo||[];
  if(!providers.some(p=>p.providerId==='google.com'))throw Error('Ingresá con Google.');
  checkLibraryRole_(user.localId,token);
  cache.put('auth_'+key,user.localId,120);
  return {uid:user.localId};
}
function checkLibraryRole_(uid,token){
  const roleUrl='https://firestore.googleapis.com/v1/projects/'+FIREBASE_PROJECT_+
    '/databases/(default)/documents/roles/'+encodeURIComponent(uid);
  let roles;
  try{roles=jsonRequest_(roleUrl,{headers:{Authorization:'Bearer '+token}})}
  catch(error){
    if(/\(401\)/.test(error.message))throw Error('La sesión de biblioteca venció. Reconectá para continuar.');
    throw error;
  }
  const role=roles.fields?.role?.stringValue||'';
  const status=roles.fields?.status?.stringValue||'active';
  if(status==='blocked')throw Error('Tu acceso a Taller está bloqueado. Consultá al administrador.');
  if(status==='deleted')throw Error('Tu acceso a Taller fue eliminado. Consultá al administrador.');
  if(role!=='admin'&&role!=='reader')throw Error('Tu usuario todavía no tiene permiso de biblioteca.');
}
function driveApi_(relative,opt){
  const url='https://www.googleapis.com/drive/v3/'+relative;
  const options=Object.assign({method:'get',muteHttpExceptions:true},opt||{});
  options.headers=Object.assign({Authorization:'Bearer '+ScriptApp.getOAuthToken()},options.headers||{});
  return UrlFetchApp.fetch(url,options);
}
function meta_(id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,120}$/.test(id))throw Error('Identificador inválido.');
  const res=driveApi_('files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,size,modifiedTime,parents,trashed,webViewLink&supportsAllDrives=true');
  if(res.getResponseCode()!==200)throw Error('Archivo o carpeta no disponible.');
  const m=JSON.parse(res.getContentText());
  if(m.trashed)throw Error('El archivo está en la papelera.');
  return m;
}
function allowedFile_(id,folderOnly){
  let item=meta_(id);
  if(folderOnly&&item.mimeType!=='application/vnd.google-apps.folder')throw Error('No es una carpeta.');
  const original=item;
  const visited={};
  for(let i=0;i<40;i++){
    if(item.id===LIBRARY_ROOT_)return original;
    const parents=item.parents||[];
    if(!parents.length||visited[item.id])break;
    visited[item.id]=true;
    item=meta_(parents[0]);
  }
  throw Error('El archivo no pertenece a la biblioteca autorizada.');
}
function listarCarpeta(session,folderId,pageToken){
  validSession_(session);
  allowedFile_(folderId,true);
  const q="'"+folderId+"' in parents and trashed = false";
  let params='files?'+[
    'q='+encodeURIComponent(q),
    'fields='+encodeURIComponent('nextPageToken,files(id,name,mimeType,size,webViewLink)'),
    'pageSize=1000',
    'orderBy='+encodeURIComponent('folder,name'),
    'supportsAllDrives=true','includeItemsFromAllDrives=true'
  ].join('&');
  if(pageToken)params+='&pageToken='+encodeURIComponent(String(pageToken));
  const res=driveApi_(params);
  if(res.getResponseCode()!==200)throw Error('No se pudo leer esta carpeta ('+res.getResponseCode()+').');
  const d=JSON.parse(res.getContentText());
  return {files:(d.files||[]).map(f=>({id:f.id,name:f.name,mimeType:f.mimeType,size:Number(f.size)||0,webViewLink:f.webViewLink||''})),
          nextPageToken:d.nextPageToken||''};
}
function infoArchivo(session,fileId){
  validSession_(session);
  const file=allowedFile_(fileId,false);
  if(file.mimeType==='application/vnd.google-apps.folder')throw Error('Seleccioná un documento.');
  return {id:file.id,name:file.name,mimeType:file.mimeType,size:Number(file.size)||0,webViewLink:file.webViewLink||''};
}
function bloqueArchivo(session,fileId,start){
  validSession_(session);
  const file=allowedFile_(fileId,false);
  const size=Number(file.size)||0;
  const offset=Number(start);
  if(!Number.isInteger(offset)||offset<0||offset>=size)throw Error('Bloque fuera de rango.');
  if(file.mimeType.startsWith('application/vnd.google-apps.'))throw Error('Para documentos nativos de Google se necesita una exportación especial.');
  const end=Math.min(size-1,offset+MAX_CHUNK_-1);
  const res=driveApi_('files/'+encodeURIComponent(fileId)+'?alt=media&supportsAllDrives=true',
    {headers:{Range:'bytes='+offset+'-'+end}});
  const status=res.getResponseCode();
  if(status!==206&&!(status===200&&offset===0&&size<=MAX_CHUNK_))
    throw Error('Drive no permitió descargar una parte del archivo ('+status+').');
  const bytes=res.getContent();
  if(bytes.length>MAX_CHUNK_)throw Error('Bloque demasiado grande.');
  return {base64:Utilities.base64Encode(bytes),start:offset,length:bytes.length,size:size};
}


// Vista PDF de documentos nativos de Google sin enviar al usuario a Drive.
function exportarDocumentoPDF(session,fileId){
  validSession_(session);
  const file=allowedFile_(fileId,false);
  const tipos={
    'application/vnd.google-apps.document':true,
    'application/vnd.google-apps.spreadsheet':true,
    'application/vnd.google-apps.presentation':true
  };
  if(!tipos[file.mimeType])throw Error('No se admite exportar este formato como PDF.');
  const url='files/'+encodeURIComponent(fileId)+'/export?mimeType='+encodeURIComponent('application/pdf');
  const response=driveApi_(url);
  if(response.getResponseCode()!==200)throw Error('No se pudo generar el PDF ('+response.getResponseCode()+').');
  const data=response.getContent();
  if(data.length>7*1024*1024)throw Error('El documento supera el tamaño admitido para conversión directa.');
  return {name:file.name+'.pdf',mimeType:'application/pdf',size:data.length,base64:Utilities.base64Encode(data)};
}

// Todas las operaciones de lectura verifican sesión y pertenencia a la biblioteca.
function metadatosArchivo(session,fileId){validSession_(session);return allowedFile_(fileId,false)}
function consultarArchivos(session,params){
  validSession_(session);params=params||{};
  const q=String(params.q||'trashed = false');
  if(q.length>4096)throw Error('La consulta es demasiado larga.');
  const query={q:q,fields:'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',pageSize:Math.max(1,Math.min(1000,Number(params.pageSize)||1000)),supportsAllDrives:true,includeItemsFromAllDrives:true};
  if(params.pageToken)query.pageToken=String(params.pageToken);
  if(params.orderBy)query.orderBy=String(params.orderBy).slice(0,80);
  const encoded=Object.keys(query).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(query[k])).join('&');
  const response=driveApi_('files?'+encoded);
  if(response.getResponseCode()!==200)throw Error('No se pudo consultar la biblioteca ('+response.getResponseCode()+').');
  const data=JSON.parse(response.getContentText()),parents={};
  const files=(data.files||[]).filter(file=>{
    let current=file;const seen={};
    for(let i=0;i<40;i++){
      if(current.id===LIBRARY_ROOT_)return true;
      const parent=(current.parents||[])[0];if(!parent||seen[parent])return false;seen[parent]=true;
      try{current=parents[parent]||(parents[parent]=meta_(parent))}catch(_){return false}
    }
    return false;
  });
  return {files:files,nextPageToken:data.nextPageToken||''};
}
function verificarBibliotecaServidor_(){
  allowedFile_(LIBRARY_ROOT_,true);
  if(!doPost({parameter:{}}).getContent().includes('Acceso a la biblioteca no autorizado'))throw Error('La protección de acceso no funciona.');
  console.log('Biblioteca accesible; solicitudes sin sesión rechazadas.');
}
function exportarDocumentoTexto(session,fileId){
  validSession_(session);const file=allowedFile_(fileId,false);
  if(file.mimeType!=='application/vnd.google-apps.document')throw Error('Este archivo no se puede exportar como texto.');
  const response=driveApi_('files/'+encodeURIComponent(fileId)+'/export?mimeType=text%2Fplain');
  if(response.getResponseCode()!==200)throw Error('No se pudo leer el texto del documento.');
  const text=response.getContentText();if(text.length>7*1024*1024)throw Error('El texto supera el tamaño admitido.');
  return text;
}
