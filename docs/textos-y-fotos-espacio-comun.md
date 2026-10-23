# Textos largos y fotos en Espacio común

El texto admite hasta 1.040.000 bytes UTF-8 por publicación, dejando margen bajo el límite de 1 MiB por documento de Firestore. No equivale a una cantidad fija de caracteres: ASCII usa un byte, muchas letras acentuadas dos y muchos emojis cuatro. El contador muestra ambas medidas. Los textos no se recortan al guardar; los largos se muestran con «Leer mensaje completo».

El botón «Agregar fotos» abre el selector del dispositivo. Admite hasta cuatro fotos por publicación, con vista previa y eliminación antes de publicar. Se admite pegar imágenes cuando el navegador entrega archivos en el portapapeles. Las fotos se convierten a JPEG, hasta 1600 píxeles de lado y hasta 320.000 caracteres de data URL cada una; se reduce resolución/calidad adicionalmente cuando hace falta. Son copias comprimidas, no originales para archivo técnico. Formatos no decodificables requieren conversión a JPG. El selector dentro de una APK depende del soporte de archivos de su WebView y necesita prueba en el teléfono.

Las fotos se guardan en commonMessages/{messageId}/photos/{0..3}, separadas del documento de texto. La publicación y las fotos se escriben en un único lote atómico. Las fotos se descargan al tocar «Ver fotos», no al cargar el tablón. Solo cuentas verificadas pueden leerlas y el autor puede crearlas al publicar; no se permite modificarlas después. Ante rechazo se conserva el borrador en el cuadro mientras esa pantalla siga abierta.

## Activación pendiente

Publicar firestore.rules desde Firebase Console → Firestore Database → Reglas, o mediante una sesión autenticada con Firebase CLI usando firebase deploy --only firestore:rules --project ID_DEL_PROYECTO. La publicación web de GitHub Pages no publica las reglas. No activar Functions ni cambiar de plan para esta función.

No se requiere Cloud Storage ni nuevos servicios de pago. Texto e imágenes sí consumen la cuota de almacenamiento y operaciones de Firestore. No hay almacenamiento ilimitado gratuito. La implementación no cambia el plan ni verifica cuál está activo.

## Validación

node --test tests/review.test.cjs: incluye conteo UTF-8, rechazo del exceso, conservación del borrador ante fallo y escritura separada de fotos en un mismo lote usando dobles de prueba. La sintaxis de los scripts y las regresiones previas se comprueban también. No se ejecutó un emulador de reglas ni una prueba contra Firebase real. La prueba de compresión/selector en navegador y APK sigue pendiente: el navegador de pruebas no pudo descargarse en este entorno.

Prueba final con dos cuentas verificadas tras publicar las reglas: publicar más de 3.000 caracteres; comprobar tildes y emojis; enviar texto con cuatro fotos; enviar una foto sin texto; quitar una foto antes de enviar; probar lectura desde otra cuenta; comprobar rechazo sin sesión. Verificar que las reglas rechacen fotos en publicaciones ajenas, más de cuatro posiciones y cambios posteriores.
