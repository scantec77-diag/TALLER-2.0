// Búsqueda de texto en el contenido indexado por Google Drive.
// La consulta se limita a PDFs que estén dentro de las carpetas configuradas en Taller 2.0.
const termsFor = value => [...new Set(
  String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().match(/[a-z0-9_-]{2,}/g) || []
)].slice(0, 8);
const normalized = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escapeDriveTerm = value => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function readParent(request, id, cache) {
  if (cache.has(id)) return cache.get(id);
  const query = new URLSearchParams({fields: 'id,name,mimeType,parents'});
  const response = await request('https://www.googleapis.com/drive/v3/files/' +
    encodeURIComponent(id) + '?' + query);
  const data = await response.json();
  cache.set(id, data);
  return data;
}

async function inLibrary(request, file, allowedRoots, parentCache) {
  const queue = [...(file.parents || [])];
  const visited = new Set();
  for (let depth = 0; queue.length && depth < 40; depth++) {
    const parentId = queue.shift();
    if (allowedRoots.has(parentId)) return true;
    if (visited.has(parentId)) continue;
    visited.add(parentId);
    try {
      const parent = await readParent(request, parentId, parentCache);
      queue.push(...(parent.parents || []));
    } catch (_) {
      // Si no se puede validar la ruta, el archivo se descarta.
      return false;
    }
  }
  return false;
}

export function showManualContentSearch({view, request, rootIds, openFile, home}) {
  const roots = new Set((rootIds || []).filter(id =>
    typeof id === 'string' && /^[A-Za-z0-9_-]{8,160}$/.test(id)));
  view.innerHTML = '<button class="back" id="manualSearchBack" type="button">← Volver</button>' +
    '<h2>🔎 Buscar dentro de los manuales</h2>' +
    '<p>Busca palabras en el contenido de los PDF de las carpetas configuradas. Después podés abrir el manual y ver en qué páginas aparece.</p>' +
    '<form id="manualSearchForm"><label>Palabras o código de falla<input id="manualSearchQuery" type="search" maxlength="120" placeholder="Ej.: presión de aceite o P0340" required></label>' +
    '<button class="settings" id="manualSearchButton" type="submit">Buscar en los PDF</button></form>' +
    '<p id="manualSearchStatus" role="status"></p><div id="manualSearchResults"></div>' +
    '<small>Drive busca palabras completas del texto que pudo indexar. Un PDF escaneado como imagen puede necesitar OCR.</small>';
  document.getElementById('manualSearchBack').onclick = home;
  const form = document.getElementById('manualSearchForm');
  const input = document.getElementById('manualSearchQuery');
  const button = document.getElementById('manualSearchButton');
  const status = document.getElementById('manualSearchStatus');
  const results = document.getElementById('manualSearchResults');
  const parentCache = new Map();
  let requestNumber = 0;
  form.onsubmit = async event => {
    event.preventDefault();
    const searchId = ++requestNumber;
    const queryText = input.value.trim();
    const terms = termsFor(queryText);
    if (!terms.length) { status.textContent = 'Escribí una palabra, un nombre o un código.'; return; }
    if (!roots.size) { status.textContent = 'No hay carpetas de manuales configuradas.'; return; }
    button.disabled = true;
    results.replaceChildren();
    status.textContent = 'Buscando en los PDF…';
    try {
      const clauses = terms.map(term => "fullText contains '" + escapeDriveTerm(term) + "'");
      const q = '(' + clauses.join(' or ') + ") and trashed = false and mimeType = 'application/pdf'";
      const params = new URLSearchParams({
        q,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',
        pageSize: '1000'
      });
      const response = await request('https://www.googleapis.com/drive/v3/files?' + params);
      const data = await response.json();
      if (searchId !== requestNumber) return;
      const all = data.files || [];
      const matches = [];
      for (let i = 0; i < all.length; i++) {
        if (searchId !== requestNumber) return;
        if (i % 20 === 0) status.textContent = 'Revisando coincidencias dentro de la biblioteca… ' + (i + 1) + ' de ' + all.length;
        if (await inLibrary(request, all[i], roots, parentCache)) matches.push(all[i]);
      }
      if (searchId !== requestNumber) return;
      const sorted = matches.sort((a,b) => {
        const sa = terms.reduce((n,t) => n + (normalized(a.name).includes(t) ? 1 : 0), 0);
        const sb = terms.reduce((n,t) => n + (normalized(b.name).includes(t) ? 1 : 0), 0);
        return sb - sa || String(a.name).localeCompare(String(b.name), 'es');
      });
      if (!sorted.length) {
        status.textContent = all.length
          ? 'Drive encontró coincidencias, pero ninguna pertenece a las carpetas de manuales de Taller 2.0.'
          : 'No se encontraron PDF con esas palabras. Probá con otra palabra o código.';
        return;
      }
      status.textContent = sorted.length + ' PDF encontrados en la biblioteca.' +
        (data.nextPageToken ? ' Mostrando los primeros resultados; afiná la búsqueda si necesitás más.' : '');
      const fragment = document.createDocumentFragment();
      for (const file of sorted.slice(0, 100)) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'settings';
        item.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;overflow-wrap:anywhere';
        item.textContent = '📕 ' + file.name;
        item.onclick = () => openFile(file, queryText);
        fragment.appendChild(item);
      }
      results.replaceChildren(fragment);
    } catch (error) {
      if (searchId !== requestNumber) return;
      status.textContent = error.message === 'AUTH_NEEDED'
        ? 'La conexión con los manuales venció. Volvé a conectar Drive e intentá de nuevo.'
        : 'No se pudo buscar en Drive: ' + (error.message || 'error desconocido');
    } finally {
      if (searchId === requestNumber && button.isConnected) button.disabled = false;
    }
  };
}
