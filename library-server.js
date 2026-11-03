// Only the visitor's Firebase session crosses to the library service.
const CHANNEL = 'taller-library-v1';
const googleFrameOrigin = origin => /^https:\/\/(?:[a-z0-9-]+\.)?googleusercontent\.com$/.test(origin) || origin === 'https://script.google.com';

export function createLibraryServer({url, getIdToken, timeoutMs = 45000}) {
  let frame, remote, remoteOrigin, nonce, connecting, ready, sequence = 0, generation = 0;
  const pending = new Map();
  function close() {
    generation++; nonce = null;
    ready?.reject(Error('La conexión se renovó. Volvé a intentar.'));
    ready = null;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Conexión cerrada.')); }
    pending.clear(); frame?.remove(); frame = remote = remoteOrigin = null;
    connecting = null;
  }
  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || message.channel !== CHANNEL || message.nonce !== nonce || !googleFrameOrigin(event.origin)) return;
    if (message.type === 'ready' && ready) {
      if (message.error) { ready.reject(Error(message.error)); return; }
      remote = event.source; remoteOrigin = event.origin; ready.resolve(); return;
    }
    if (event.source !== remote || event.origin !== remoteOrigin || message.type !== 'result') return;
    const p = pending.get(message.id); if (!p) return;
    pending.delete(message.id); clearTimeout(p.timer);
    message.error ? p.reject(Error(message.error)) : p.resolve(message.result);
  });
  async function connect(force = false) {
    if (force) close();
    if (remote) return;
    if (connecting) return connecting;
    const currentGeneration = generation; let attemptFrame;
    const attempt = (async () => {
      const token = await getIdToken();
      if (generation !== currentGeneration) throw Error('La sesión de Taller cambió.');
      nonce = crypto.randomUUID();
      const name = 'taller_library_' + nonce.replaceAll('-', '');
      frame = attemptFrame = document.createElement('iframe'); frame.name = name; frame.hidden = true;
      frame.title = 'Conexión privada de biblioteca'; document.body.appendChild(frame);
      const form = document.createElement('form'); form.method = 'POST'; form.action = url; form.target = name; form.hidden = true;
      for (const [key, value] of Object.entries({idToken: token, mode: 'bridge', bridgeNonce: nonce})) {
        const input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = value; form.appendChild(input);
      }
      let currentReady;
      const loaded = new Promise((resolve, reject) => { ready = currentReady = {resolve, reject}; });
      const timer = setTimeout(() => currentReady.reject(Error('No se pudo conectar la biblioteca. Volvé a intentar con Reconectar.')), timeoutMs);
      document.body.appendChild(form); form.submit(); form.remove();
      try { await loaded; } finally { clearTimeout(timer); if (ready === currentReady) ready = null; }
    })();
    connecting = attempt;
    try { await attempt; } catch (error) { attemptFrame?.remove(); if (frame === attemptFrame) frame = null; throw error; }
    finally { if (connecting === attempt) connecting = null; }
  }
  async function request(method, args = [], retry = true) {
    await connect();
    const id = ++sequence;
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error('La biblioteca tardó demasiado en responder.')); }, timeoutMs);
        pending.set(id, {resolve, reject, timer});
        remote.postMessage({channel: CHANNEL, nonce, type: 'request', id, method, args}, remoteOrigin);
      });
    } catch (error) {
      if (retry && /sesi[oó]n.*(?:venci|inv[aá]lid)/i.test(error.message)) { await connect(true); return request(method, args, false); }
      throw error;
    }
  }
  return {connect, close, request, fetch: (url, options) => libraryDriveResponse(request, url, options)};
}

export async function libraryDriveResponse(request, input, options = {}) {
  const url = new URL(input);
  if (url.origin !== 'https://www.googleapis.com' || String(options.method || 'GET').toUpperCase() !== 'GET') throw Error('Operación de biblioteca no admitida.');
  const json = data => new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}});
  if (url.pathname === '/drive/v3/files') {
    const params = Object.fromEntries(['q', 'pageToken', 'pageSize', 'orderBy'].filter(k => url.searchParams.has(k)).map(k => [k, url.searchParams.get(k)]));
    return json(await request('consultarArchivos', [params]));
  }
  const match = url.pathname.match(/^\/drive\/v3\/files\/([A-Za-z0-9_-]{8,120})(\/export)?$/);
  if (!match) throw Error('Archivo de biblioteca no admitido.');
  const id = match[1];
  if (match[2]) {
    if (url.searchParams.get('mimeType') === 'text/plain') return new Response(await request('exportarDocumentoTexto', [id]), {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    if (url.searchParams.get('mimeType') !== 'application/pdf') throw Error('Formato de exportación no admitido.');
    const result = await request('exportarDocumentoPDF', [id]);
    return new Response(Uint8Array.from(atob(result.base64), c => c.charCodeAt(0)), {headers: {'Content-Type': 'application/pdf'}});
  }
  if (url.searchParams.get('alt') !== 'media') return json(await request('metadatosArchivo', [id]));
  // Reuse metadata already fetched for this open PDF. Each block RPC still
  // validates the current session, role and library membership on the server.
  const known = options.libraryFile;
  const meta = known?.id === id && Number.isSafeInteger(Number(known.size)) && Number(known.size) > 0
    ? known : await request('metadatosArchivo', [id]);
  const size = Number(meta.size) || 0, range = new Headers(options.headers).get('Range');
  const bounds = range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range && !bounds) throw Error('Rango de lectura no admitido.');
  const start = bounds ? Number(bounds[1]) : 0;
  const end = Math.min(size - 1, bounds?.[2] ? Number(bounds[2]) : size - 1);
  if (bounds && (start >= size || start > end)) return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + size}});
  const chunks = []; let offset = start;
  while (offset <= end) {
    if (options.signal?.aborted) throw new DOMException('Lectura cancelada.', 'AbortError');
    const result = await request('bloqueArchivo', [id, offset]);
    if (result.size != null && Number(result.size) !== size) throw Error('El archivo cambió. Volvé a abrir el manual.');
    if (result.start !== offset || !result.length) throw Error('La biblioteca devolvió un bloque incompleto.');
    const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
    if (bytes.length !== result.length) throw Error('El bloque recibido no coincide con su tamaño.');
    const part = bytes.subarray(0, Math.min(bytes.length, end - offset + 1));
    chunks.push(part); offset += part.length;
  }
  const headers = {'Content-Type': meta.mimeType || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': String(Math.max(0, end - start + 1))};
  if (bounds) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  return new Response(new Blob(chunks), {status: bounds ? 206 : 200, headers});
}

