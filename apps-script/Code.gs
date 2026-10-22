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

function doGet(){
  return HtmlService.createHtmlOutputFromFile('Biblioteca')
    .setTitle('Taller 2.0 · Biblioteca')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
  if(cache.get('auth_'+key)==='ok')return true;
  const verify=jsonRequest_('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(FIREBASE_WEB_API_KEY_),{
    method:'post',contentType:'application/json',payload:JSON.stringify({idToken:token})
  });
  const user=verify.users&&verify.users[0];
  if(!user||!user.localId||!user.emailVerified)throw Error('Cuenta no verificada.');
  const providers=user.providerUserInfo||[];
  if(!providers.some(p=>p.providerId==='google.com'))throw Error('Ingresá con Google.');
  const uid=encodeURIComponent(user.localId);
  const roleUrl='https://firestore.googleapis.com/v1/projects/'+FIREBASE_PROJECT_+
    '/databases/(default)/documents/roles/'+uid;
  const roles=jsonRequest_(roleUrl,{headers:{Authorization:'Bearer '+token}});
  const role=roles.fields?.role?.stringValue||'';
  if(role!=='admin'&&role!=='reader')throw Error('Tu usuario todavía no tiene permiso de biblioteca.');
  cache.put('auth_'+key,'ok',120);
  return true;
}
function driveApi_(relative,opt){
  const url='https://www.googleapis.com/drive/v3/'+relative;
  const options=Object.assign({method:'get',muteHttpExceptions:true},opt||{});
  options.headers=Object.assign({Authorization:'Bearer '+ScriptApp.getOAuthToken()},options.headers||{});
  return UrlFetchApp.fetch(url,options);
}
function meta_(id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,120}$/.test(id))throw Error('Identificador inválido.');
  const res=driveApi_('files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,size,parents,trashed,webViewLink&supportsAllDrives=true');
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
function listarCarpeta(idToken,folderId,pageToken){
  validUser_(idToken);
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
function infoArchivo(idToken,fileId){
  validUser_(idToken);
  const file=allowedFile_(fileId,false);
  if(file.mimeType==='application/vnd.google-apps.folder')throw Error('Seleccioná un documento.');
  return {id:file.id,name:file.name,mimeType:file.mimeType,size:Number(file.size)||0,webViewLink:file.webViewLink||''};
}
function bloqueArchivo(idToken,fileId,start){
  validUser_(idToken);
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
