# Activación de biblioteca sin segundo inicio de sesión — Taller 2.0

**Estado:** Código preparado en GitHub, **no desplegado** en Google Apps Script desde este repositorio. La APK existente es una WebView de `https://scantec77-diag.github.io/TALLER-2.0/`, por lo que no requiere una compilación distinta para cargar cambios publicados del sitio.

## Archivos de Apps Script

- `Code.gs`
- `Biblioteca.html`
- `appsscript.json`

El Web App se publica **como el propietario de la cuenta que tiene acceso a la carpeta de los manuales** y con acceso de red «Cualquier persona». Aunque el sitio pueda recibir peticiones externas, **el servidor valida el Firebase ID token y el rol `admin` o `reader` en Firestore** antes de crear una sesión, y comprueba que cada archivo pertenece a la carpeta raíz prevista. No se envían contraseñas ni permisos de Google Drive al usuario.

## Cómo publicar (requiere acceso autenticado a Apps Script)

1. Abrir el proyecto original de Apps Script con la cuenta autorizada para consultar la biblioteca.
2. Reemplazar el contenido de `Code.gs` y crear o reemplazar el archivo HTML `Biblioteca` con `Biblioteca.html`.
3. Activar «Mostrar archivo de manifiesto» en la configuración y actualizar `appsscript.json`.
4. Implementar > Administrar implementaciones > Editar > Nueva versión. Seleccionar «Aplicación web», «Ejecutar como: Yo», «Quién tiene acceso: Cualquier persona», y aprobar permisos de Drive de solo lectura.
5. Confirmar el enlace `/exec`; si es nuevo, actualizar `LIBRARY_SERVICE_URL` en `index.html`.
6. Revisar las reglas y documentos `roles/{uid}` de Firestore para permitir `admin` o `reader` a los usuarios de confianza. **No conceder acceso a cualquiera que conozca el enlace público del sitio.**
7. Entrar a Taller 2.0 con cuenta administradora. Ir a Gestionar conexión > «Probar acceso sin segunda contraseña» y abrir una máquina. Verificar carpetas, PDF y otro usuario aprobado.
8. Solo después de comprobar el despliegue, cambiar `DIRECT_LIB_DEFAULT` de `false` a `true` en `index.html` para toda la APK. El modo de prueba es local al navegador para no dejar sin servicio a otros usuarios durante la transición.

## Limitaciones y pruebas

- Los PDF almacenados se descargan por partes y se muestran en un visor de páginas; grandes manuales pueden tardar según su tamaño y la conexión.
- Docs, Sheets y Slides nativos se convierten a PDF con un límite de tamaño. Los demás formatos pueden descargarse desde el visor.
- La sesión temporal del visor dura hasta seis horas y después debe reabrirse la biblioteca desde Taller 2.0, **sin contraseña de la cuenta de manuales**.
- Probar con un usuario no autorizado: debe rechazarse antes de listar cualquier carpeta.
- Al salir del visor se vuelve a la web de Taller 2.0. La sesión personal de Firebase suele persistir en ese navegador.

**No guardar la contraseña de los manuales en el APK, en GitHub, ni en Apps Script.**
