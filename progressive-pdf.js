// Adapt the authenticated Drive reader to PDF.js byte-range loading.
// Never send shared credentials or a private download URL to the PDF worker.
export function createProgressivePdf({lib, file, request, onProgress = () => {}, onError = () => {}}) {
  const controller = new AbortController();
  const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id);
  let task, stopped = false, received = 0, rejectFailure;
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  // Attach immediately: cancellation can happen while metadata is loading.
  failure.catch(() => {});
  const abortError = () => new DOMException('Lectura cancelada.', 'AbortError');
  function stop(error = abortError()) {
    if (stopped) return;
    stopped = true;
    controller.abort();
    rejectFailure(error);
    if (task) Promise.resolve(task.destroy()).catch(() => {});
  }
  const loading = (async () => {
    const meta = await (await request(base, {signal: controller.signal, libraryPdfBootstrap: true})).json();
    if (stopped) throw abortError();
    const size = Number(meta.size);
    if (!Number.isSafeInteger(size) || size <= 0) throw Error('El PDF no tiene un tamaño válido.');
    // Match the library service's maximum block size, avoiding tiny RPC calls.
    const rangeChunkSize = 384 * 1024;
    // The server prepares the header and PDF index together, with one access
    // check and parallel Drive reads, instead of serial Apps Script round trips.
    const initial = (meta.initialChunks || []).map(chunk => {
      const bytes = Uint8Array.from(atob(chunk.base64), c => c.charCodeAt(0));
      if (!Number.isSafeInteger(chunk.start) || chunk.start < 0 || chunk.length !== bytes.length
        || bytes.length > rangeChunkSize || chunk.start + bytes.length > size || Number(chunk.size) !== size)
        throw Error('Llegó un fragmento inicial inválido del PDF.');
      return {start: chunk.start, bytes};
    });
    const first = initial.find(chunk => chunk.start === 0);
    received = initial.reduce((total, chunk) => total + chunk.bytes.length, 0);
    if (received) onProgress({received, size});
    const transport = new lib.PDFDataRangeTransport(size, first?.bytes || new Uint8Array(0), true);
    transport.abort = () => { controller.abort(); };
    transport.requestDataRange = (begin, end) => {
      (async () => {
        // PDF.js registers the range reader AFTER calling requestDataRange.
        // Cached responses must yield too, just like a network response does.
        await Promise.resolve();
        if (stopped) return;
        const prepared = initial.find(chunk => chunk.start <= begin && chunk.start + chunk.bytes.length >= end);
        if (prepared) {
          // PDF.js may transfer this buffer to its worker. Keep cached bytes
          // intact for overlapping or repeated requests.
          transport.onDataRange(begin, prepared.bytes.slice(begin - prepared.start, end - prepared.start));
          return;
        }
        const response = await request(base + '?alt=media', {
          headers: {Range: 'bytes=' + begin + '-' + (end - 1)}, signal: controller.signal,
          libraryFile: {id: file.id, size, mimeType: meta.mimeType}
        });
        if (stopped) return;
        const contentRange = response.headers.get('Content-Range');
        if (response.status !== 206 || contentRange !== 'bytes ' + begin + '-' + (end - 1) + '/' + size)
          throw Error('El servicio no devolvió el fragmento solicitado del PDF.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (stopped) return;
        if (bytes.length !== end - begin) throw Error('Llegó un fragmento incompleto del PDF.');
        received += bytes.length;
        onProgress({received, size});
        transport.onDataRange(begin, bytes);
      })().catch(error => {
        if (stopped) return;
        stop(error);
        onError(error);
      });
    };
    task = lib.getDocument({range: transport, length: size, rangeChunkSize,
      disableAutoFetch: true, disableStream: true, isEvalSupported: false});
    return task.promise;
  })();
  return {promise: Promise.race([loading, failure]), destroy: () => stop()};
}


