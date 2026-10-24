# Búsqueda dentro de manuales PDF y Word

## Qué hace esta etapa

- Agrega **Buscar dentro de manuales** a la portada de Taller 2.0.
- Usa la búsqueda de texto completo de Drive para localizar contenido indexado en PDF, DOC, DOCX y Google Docs.
- Solo muestra archivos que cuelgan de las carpetas de manuales configuradas en Taller 2.0.
- Al abrir un PDF, PDF.js revisa sus páginas, informa dónde aparece el texto y permite saltar a cada página coincidente.
- Al abrir un DOCX, extrae el texto en el navegador y muestra los párrafos coincidentes. Los Google Docs se exportan como texto para mostrar los párrafos encontrados.
- Los archivos Word DOC antiguos se localizan mediante Drive y se abren allí para consultar el contenido.
- No copia manuales al repositorio ni procesa toda la biblioteca en una búsqueda. Solo se descarga el documento que la persona abre.

## Límites de esta etapa

- La búsqueda de Drive trabaja sobre el texto que Drive pudo indexar. Una búsqueda por parte de una palabra puede no encontrarla.
- Un PDF escaneado como imagen puede no tener texto indexado o extraíble. El OCR para esos archivos queda para la siguiente etapa.
- Se muestran hasta 100 resultados ordenados; la búsqueda recorre las páginas de resultados que devuelve Drive.
- Esta función ayuda a localizar documentos y páginas. Todavía no indexa fragmentos para que Taller IA cite el contenido de los manuales.

## Activación

La implementación está en la rama `feature/busqueda-texto-manuales-20261024`. Para verla en GitHub Pages hay que revisar e integrar esa rama con `main`; la rama no publica cambios por sí sola.

La búsqueda usa la autorización de lectura de Drive que ya tiene el visor. No guarda contraseñas ni sube los manuales al repositorio.