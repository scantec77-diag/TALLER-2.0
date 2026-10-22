# Taller 2.0 — acceso a manuales sin contraseña compartida

## Estado
Esta rama es una **propuesta de actualización**, todavía NO está publicada en producción. El cliente requiere que el servicio Apps Script de esta misma rama esté desplegado. No combinar la nueva página con el antiguo Apps Script.

## Qué cambia
- Cada usuario inicia sesión únicamente con su propia cuenta Google en Firebase Authentication (igual que antes).
- La aplicación deja de abrir `signInWithPopup` para la cuenta propietaria de manuales.
- Todas las lecturas de la biblioteca usan Apps Script **ejecutado como el propietario de los manuales**. No se guarda ninguna contraseña de esa cuenta en HTML, APK ni GitHub.
- El servicio valida cada solicitud contra Firebase Identity Toolkit; compara el árbol solicitado con la carpeta raíz y no muestra archivos externos a él.
- Los archivos se envían por bloques con POST y se abren localmente; no se exponen permisos directos de Drive.
- El acceso de administrador y el registro de accesos permanecen en Firebase.

## Configuración manual OBLIGATORIA en la cuenta que tiene acceso a los manuales
1. Abrir el proyecto existente en [Google Apps Script](https://script.google.com/home/projects).
2. Guardar una copia del código actual del proyecto.
3. Reemplazar `Code.gs` con el contenido de `apps-script/Code.gs` de esta rama (si existen otros archivos de ese proyecto, conservarlos sin modificar).
4. Confirmar que la raíz `11cVCcyrGyjp17oqkjZ5uS93PqstprZ9Y` se puede leer desde la cuenta ejecutora. Si no, compartirle esa carpeta como lector desde Drive, sin publicar el contenido para todo el mundo.
5. Ejecutar una función de prueba/autorización desde el editor para conceder a Apps Script los permisos de **lectura de Drive** y solicitudes a la red de Google. El servidor usa `DriveApp`, `UrlFetchApp` y `ScriptApp.getOAuthToken()`.
6. En **Implementar > Administrar implementaciones**, editar la implementación web que usa Taller 2.0: **Nueva versión**, **Ejecutar como: Yo**, **Quién puede acceder: Cualquiera**. El servicio **no permite consultar contenido sin un ID token válido de Firebase**; `doGet` no devuelve archivos.
7. Confirmar que la URL `/exec` de esa implementación sigue siendo exactamente la que figura en `library-bridge.js`. Si se crea una implementación nueva, actualizar allí la URL antes de lanzar.
8. Después de publicar Apps Script, desplegar la versión de esta rama en GitHub Pages o fusionarla con `main`.

## Pruebas antes de fusionar
1. Abrir la web desde el teléfono propio con Google iniciado. Revisar `Gestionar conexión` y obtener «Servidor de biblioteca conectado».
2. Abrir `CONTAINERAS VIEJAS`, una subcarpeta y un PDF pequeño. Verificar que no aparece una solicitud de contraseña de manuales.
3. Desde otro teléfono iniciar sesión en Taller 2.0 con **otra cuenta de Google**, y repetir. No debe mostrarse ni elegirse la cuenta de manuales.
4. Comprobar que `Mi espacio` y el registro del administrador no cruzan datos entre usuarios.
5. Probar una solicitud sin token de Firebase: debe ser rechazada. Probar un ID de carpeta o archivo fuera de la raíz: también debe ser rechazado.
6. Probar una carpeta con más de 120 documentos para verificar la paginación.
7. Probar PDF grande: la transferencia se hace por bloques y el máximo actual es **60 MB**. Archivos nativos de Google todavía no tienen vista previa.

## Limitaciones y seguridad
- No se puede completar ni verificar la **publicación** de Apps Script desde GitHub. Este paso requiere acceso al editor del proyecto en la cuenta ejecutora.
- No conviene guardar el correo y la contraseña del propietario en la APK, la web ni el repositorio.
- El transporte usa un formulario POST dentro de un iframe oculto y una respuesta `postMessage` con origen y canal aleatorio comprobados. El token de Firebase no figura en la URL.
- Apps Script tiene cuotas y límites de tiempo. Los PDFs grandes y carpetas muy extensas deben probarse con tráfico real antes de habilitar la app a todos.
- El repositorio incluye una clave **pública** de configuración Firebase; no es una contraseña del propietario.
