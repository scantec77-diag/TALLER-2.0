/**
 * Taller 2.0 — biblioteca privada mediante Apps Script.
 * Ejecutar como: Yo (propietario de la cuenta de manuales).
 * Acceso al despliegue: Cualquier usuario (los permisos efectivos
 * se verifican con un ID token de Firebase EN CADA solicitud).
 *
 * Se recibe la sesión de Firebase por POST; jamás una contraseña de Google.
 * Los archivos se leen usando los permisos del propietario del script.
 */
const TALLER = {
  firebaseApiKey: 'AIzaSyCHFS8iMwgTdK_JGsxSTodblP6OJFahWbA',
  origin: 'https://scantec77-diag.github.io',
  rootId: '11cVCcyrGyjp17oqkjZ5uS93PqstprZ9Y',
  maxSize: 60 * 1024 * 1024,
  chunkSize: 768 * 1024,
  pageSize: 120
};

function doGet() {
  // No se exponen carpetas en solicitudes GET, ni se usan tokens en URLs.
  return HtmlService.createHtmlOutput(
    '<!doctype html><html lang="es"><meta charset="utf-8">' +
    '<body><p>Biblioteca Taller 2.0. Abrí una máquina desde la aplicación.</p></body></html>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const p = e && e.parameter || {};
  const requestId = String(p.requestId || '').slice(0, 120);
  const channel = String(p.channel || '').slice(0, 120);
  try {
    if (!/^[A-Za-z0-9_-]{16,120}$/.test(channel) ||
        !/^[A-Za-z0-9_-]{8,120}$/.test(requestId)) throw Error('Solicitud inválida');
    const user = authenticate_(p.idToken);
    const action = String(p.action || '');
    let payload;
    if (action === 'list') payload = list_(String(p.folderId || TALLER.rootId), String(p.cursor || ''));
    else if (action === 'chunk') payload = chunk_(String(p.fileId || ''), Number(p.offset));
    else if (action === 'ping') payload = { message: 'Biblioteca disponible', email: user.email };
    else throw Error('Operación no permitida');
    return answer_({ channel: channel, requestId: requestId, ok: true, payload: payload });
  } catch (err) {
    return answer_({
      channel: channel, requestId: requestId, ok: false,
      error: String(err && err.message || err).slice(0, 300)
    });
  }
}

function authenticate_(token) {
  if (!token || typeof token !== 'string' || token.length > 8192) {
    throw Error('Iniciá sesión en Taller 2.0 para acceder a los manuales.');
  }
  // Identity Toolkit verifica criptográficamente el ID token de ESTE proyecto.
  // No confiar en email, uid o rol enviados como campos del formulario.
  const res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
      encodeURIComponent(TALLER.firebaseApiKey), {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ idToken: token }),
      muteHttpExceptions: true
    }
  );
  if (res.getResponseCode() !== 200) throw Error('Sesión vencida o no autorizada. Volvé a ingresar.');
  const body = JSON.parse(res.getContentText());
  const user = body.users && body.users[0];
  if (!user || !user.localId || user.disabled || user.emailVerified !== true) {
    throw Error('Tu cuenta todavía no está habilitada para acceder a la biblioteca.');
  }
  return { uid: user.localId, email: user.email || '' };
}

// Rechaza cualquier carpeta ajena al árbol de TALLER 2.0.
function insideRoot_(folder) {
  let current = folder;
  for (let depth = 0; depth < 24; depth++) {
    if (current.getId() === TALLER.rootId) return true;
    const parents = current.getParents();
    if (!parents.hasNext()) break;
    current = parents.next();
  }
  return false;
}
function safeFolder_(id) {
  if (!/^[\w-]{10,100}$/.test(id)) throw Error('Carpeta inválida');
  const folder = DriveApp.getFolderById(id);
  if (!insideRoot_(folder)) throw Error('La carpeta no pertenece a Taller 2.0');
  return folder;
}
function safeFile_(id) {
  if (!/^[\w-]{10,100}$/.test(id)) throw Error('Archivo inválido');
  const file = DriveApp.getFileById(id);
  const parents = file.getParents();
  let allowed = false;
  while (parents.hasNext()) {
    if (insideRoot_(parents.next())) { allowed = true; break; }
  }
  if (!allowed) throw Error('Archivo fuera de la biblioteca');
  return file;
}
function list_(folderId, cursor) {
  const folder = safeFolder_(folderId);
  let previous = {};
  if (cursor) {
    try {
      previous = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(cursor)).getDataAsString());
      if (previous.id !== folderId) throw Error('Paginación inválida');
    } catch (_) { throw Error('Paginación inválida'); }
  }
  let folderIterator = previous.folders
    ? DriveApp.continueFolderIterator(previous.folders) : folder.getFolders();
  let fileIterator = previous.files
    ? DriveApp.continueFileIterator(previous.files) : folder.getFiles();
  // El cursor conserva ambas posiciones y primero muestra subcarpetas.
  const entries = [];
  while (folderIterator.hasNext() && entries.length < TALLER.pageSize) {
    const f = folderIterator.next();
    entries.push({ id: f.getId(), name: f.getName(), mimeType: 'application/vnd.google-apps.folder' });
  }
  while (!folderIterator.hasNext() && fileIterator.hasNext() && entries.length < TALLER.pageSize) {
    const f = fileIterator.next();
    entries.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType(), size: f.getSize() });
  }
  let next = '';
  if (folderIterator.hasNext() || fileIterator.hasNext()) {
    next = Utilities.base64EncodeWebSafe(JSON.stringify({
      id: folderId,
      folders: folderIterator.hasNext() ? folderIterator.getContinuationToken() : '',
      files: fileIterator.hasNext() ? fileIterator.getContinuationToken() : ''
    }));
  }
  return { folderId: folderId, files: entries, nextPageToken: next };
}

function chunk_(fileId, offset) {
  const file = safeFile_(fileId);
  const size = file.getSize();
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size ||
      offset % TALLER.chunkSize !== 0) throw Error('Posición inválida');
  if (size > TALLER.maxSize) throw Error('El archivo supera el límite de 60 MB de esta versión');
  const mime = file.getMimeType();
  if (mime.startsWith('application/vnd.google-apps.')) {
    throw Error('Los documentos nativos de Google requieren un visor específico');
  }
  const end = Math.min(size - 1, offset + TALLER.chunkSize - 1);
  // Descarga por tramos sin dar a los usuarios permiso directo sobre Drive.
  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media', {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        Range: 'bytes=' + offset + '-' + end
      },
      muteHttpExceptions: true
    }
  );
  const status = response.getResponseCode();
  if (status !== 206 && !(status === 200 && offset === 0 && size <= TALLER.chunkSize)) {
    throw Error('No se pudo descargar el tramo del archivo (Drive ' + status + ')');
  }
  const bytes = response.getBlob().getBytes();
  if (bytes.length !== end - offset + 1) throw Error('El tramo recibido está incompleto');
  return { fileId: fileId, offset: offset, size: size,
           data: Utilities.base64Encode(bytes), mimeType: mime };
}

function answer_(result) {
  // Evita inyección HTML desde los nombres de archivos.
  const json = JSON.stringify(result).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><meta charset="utf-8"><body>' +
    '<script>window.top.postMessage(' + json + ',' +
    JSON.stringify(TALLER.origin) + ');<\/script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
