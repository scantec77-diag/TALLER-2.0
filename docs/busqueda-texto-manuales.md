# Búsqueda dentro de los manuales PDF

## Qué hace esta etapa

- Agrega **Buscar dentro de manuales** a la portada de Taller 2.0.
- Busca palabras y códigos en el texto que Google Drive tiene indexado para los PDF.
- Solo muestra archivos que cuelgan de las carpetas de manuales configuradas en Taller 2.0.
- Al abrir un resultado, PDF.js revisa sus páginas, informa dónde aparece la consulta y permite saltar a cada página coincidente.
- No copia PDF al repositorio ni descarga todos los manuales de una vez. Solo descarga el PDF que el usuario abre para revisar las páginas.

## Límites

- La búsqueda de Drive compara palabras completas; por ejemplo, una búsqueda por una parte de una palabra puede no encontrarla.
- En un PDF escaneado como imagen, la página puede no tener texto extraíble. Si Drive no puede indexar su contenido, habrá que aplicarle OCR.
- Se muestran hasta 100 resultados de la primera página de Drive. Una búsqueda más específica permite reducir una lista grande.
- Esta búsqueda ayuda a localizar el documento y la página. **Todavía no completa la colección Firestore manualChunks que consulta Taller IA**. Para que el chat responda citando el contenido de los PDF falta el indexador administrativo de fragmentos, con permisos por usuario y sincronización de cambios.

## Activación

La implementación está en la rama feature/busqueda-texto-manuales-20261024. Para verla en GitHub Pages hay que revisar e integrar esa rama con main; la rama no publica cambios por sí sola.

La búsqueda usa la autorización de lectura de Drive que ya tiene el visor de Taller 2.0. No guarda contraseñas ni sube los documentos al repositorio. Probá desde la app con una búsqueda de un código conocido, por ejemplo P0340, y verificá que el resultado abra el PDF en la página donde aparece.
