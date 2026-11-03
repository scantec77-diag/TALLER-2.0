# Acceso a manuales con la cuenta personal de Taller

El servicio se publicó en Google Apps Script, versión 4, el 3 de noviembre de 2026. Se ejecuta como la cuenta propietaria de los manuales. Google mantiene su autorización en el servidor; la contraseña y el token de Drive no se entregan a los usuarios.

Cada visitante inicia sesión en Taller con su propia cuenta de Google. El servicio valida su Firebase ID token, la verificación de Google y el rol `admin` o `reader` de Firestore. Una cuenta sin permiso no recibe archivos. Esto también se aplica al primer acceso, a la búsqueda dentro de documentos y a Reconectar.

La interfaz conserva el visor de Taller. `library-server.js` abre un canal temporal con Apps Script; el canal valida origen, identificador aleatorio y remitente de cada respuesta. El servidor admite únicamente lectura y comprueba que los archivos pertenecen a la biblioteca configurada. La sesión del canal dura hasta seis horas y se renueva con la sesión personal de Taller, sin el ingreso de la cuenta compartida.

## Actualizar el servicio

1. Abrir el proyecto original de Apps Script desde la cuenta de manuales.
2. Copiar `Code.gs`, `Biblioteca.html` y `appsscript.json`. El archivo HTML debe llamarse `Biblioteca`.
3. Administrar las implementaciones y publicar una nueva versión conservando la cuenta ejecutora y el acceso existente. No cambiar los roles de usuarios como parte de una actualización.
4. Si cambia el enlace de implementación, actualizar `LIBRARY_SERVICE_URL` en `index.html`.
5. Ejecutar `node --test tests/*.test.cjs` antes de publicar el sitio.
6. Comprobar un usuario lector autorizado: entrar con su Google personal, abrir una carpeta y un PDF, buscar dentro de manuales y tocar Reconectar. Ninguna de estas acciones debe pedir la cuenta de manuales.
7. Comprobar el rechazo de una sesión inválida y de una cuenta sin permiso.

La APK es una WebView del sitio publicado y carga estas actualizaciones sin recompilarse. No guardar contraseñas de los manuales en el APK, en GitHub ni en Apps Script.
