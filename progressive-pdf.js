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
    const meta = await (await request(base, {signal: controller.signal})).json();
    if (stopped) throw abortError();
    const size = Number(meta.size);
    if (!Number.isSafeInteger(size) || size <= 0) throw Error('El PDF no tiene un tamaño válido.');
    // Match the library service's maximum block size, avoiding tiny RPC calls.
    const rangeChunkSize = 384 * 1024;
    const transport = new lib.PDFDataRangeTransport(size, new Uint8Array(0), true);
    transport.abort = () => { controller.abort(); };
    transport.requestDataRange = (begin, end) => {
      (async () => {
        if (stopped) return;
        const response = await request(base + '?alt=media', {
          headers: {Range: 'bytes=' + begin + '-' + (end - 1)}, signal: controller.signal,
          libraryFile: {...meta, id: file.id}
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

