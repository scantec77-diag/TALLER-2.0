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
2. Deja la pantalla abierta hasta que termine. Puede detener el trabajo; la próxima ejecución retoma desde la última página guardada.
3. Los usuarios con sesión verificada buscan desde la misma pantalla. El resultado OCR lleva al visor y muestra las páginas coincidentes.

La primera pasada puede demorar según cantidad y tamaño de los PDF. Los manuales de más de 60 MB o 300 páginas también se procesan. PDF.js solicita bloques de bytes a Drive y el avance se guarda junto con las páginas OCR, en bloques de hasta diez páginas. La capacidad real sigue dependiendo de la memoria del dispositivo y de los límites de Google. Se necesita Internet para cargar Tesseract.js y su modelo de idiomas.

## Reconexión

- Todos los usuarios con sesión iniciada tienen **⟳ Reconexión** en la pantalla principal. Renueva el acceso de lectura con la cuenta de manuales preseleccionada; Google puede solicitar selección de cuenta o verificación.
- El permiso de lectura y la sesión temporal de Drive son distintos. La sesión de esta aplicación se renueva cuando vence; no se guarda ninguna contraseña de Google en la aplicación.
- Si el acceso vence durante la indexación, se pausa una vez y aparece **Reconectar y continuar**. No se marca el resto de los PDF como fallidos. Al reconectar se retoma el último bloque pendiente.
- Los errores propios de cada PDF se muestran con su nombre. Una interrupción de conexión o de permisos de Firestore también pausa el trabajo, conservando los bloques confirmados.
- Las reglas firestore.rules deben publicarse junto con esta versión: permiten los campos de avance y páginas posteriores a la 300, manteniendo lectura para cuentas verificadas y escritura exclusiva del administrador.

## Acceso a los datos

Firestore permite leer el índice a usuarios con correo verificado y escribirlo solo a la cuenta con rol admin en `/roles/{uid}`. Se guardan texto y tokens por página, nombre del PDF, número de página y fecha de modificación de Drive.

## Límites

- El OCR puede confundir caracteres, especialmente en fotos borrosas, torcidas o de baja resolución.
- La búsqueda OCR encuentra palabras normalizadas; todavía no admite búsqueda semántica ni citas para Taller IA.
- Se muestran hasta 100 resultados; el índice devuelve hasta 300 páginas coincidentes por búsqueda.

