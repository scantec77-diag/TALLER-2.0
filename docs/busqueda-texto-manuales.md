# Búsqueda dentro de manuales PDF y Word

## Qué hace

- **Buscar dentro de manuales** consulta PDF, DOC, DOCX y Google Docs en las carpetas configuradas.
- Drive aporta el texto indexado de documentos digitales. El visor busca por página en PDF y muestra párrafos coincidentes en DOCX y Google Docs.
- El OCR agrega texto de páginas escaneadas a un índice compartido en Firestore. Los resultados muestran el PDF y las páginas donde se encontró cada término.
- El administrador inicia la indexación desde la pantalla de búsqueda. El procesamiento se hace en su navegador con PDF.js y Tesseract.js en español e inglés.
- Las páginas con texto digital suficiente se omiten. Se vuelven a procesar los PDF si Drive informa una fecha de modificación nueva; los demás se saltan.
- Los manuales permanecen en Drive y no se copian al repositorio ni se envían a un servicio externo de OCR.

## Uso del OCR

1. El administrador abre **Buscar dentro de manuales** y presiona **Indexar PDF escaneados**.
2. Deja la pantalla abierta hasta que termine. Puede detener el trabajo; la próxima ejecución retoma los PDF que falten.
3. Los usuarios con sesión verificada buscan desde la misma pantalla. El resultado OCR lleva al visor y muestra las páginas coincidentes.

La primera pasada puede demorar según cantidad y tamaño de los PDF. El procesamiento tiene límites de 60 MB por archivo, 300 páginas por PDF y 2.500 PDF por ejecución. Se necesita Internet para cargar Tesseract.js y su modelo de idiomas.

## Acceso a los datos

Firestore permite leer el índice a usuarios con correo verificado y escribirlo solo a la cuenta con rol admin en `/roles/{uid}`. Se guardan texto y tokens por página, nombre del PDF, número de página y fecha de modificación de Drive.

## Límites

- El OCR puede confundir caracteres, especialmente en fotos borrosas, torcidas o de baja resolución.
- La búsqueda OCR encuentra palabras normalizadas; todavía no admite búsqueda semántica ni citas para Taller IA.
- Se muestran hasta 100 resultados; el índice devuelve hasta 300 páginas coincidentes por búsqueda.
