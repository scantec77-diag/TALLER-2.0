# Taller 2.0 — usuarios y espacios privados

## Decisiones confirmadas
- Registro libre mediante correo electrónico, sin aprobación del administrador.
- Verificación del correo antes de habilitar la cuenta.
- Cada usuario accede exclusivamente a sus datos en «Mi espacio».
- Administrador con rol asignado desde el servidor, nunca por un botón o campo editable del cliente.
- Acceso biométrico local en una etapa posterior; no sustituye la autenticación del servidor.
- Compilar APK únicamente después de las pruebas de seguridad y funcionamiento.

## Modelo de datos propuesto
`profiles/{uid}`: correo verificado, nombre visible, fecha de alta, preferencias.
`users/{uid}/notes/{noteId}`: título, contenido, fechas de creación y edición.
`users/{uid}/settings/{settingId}`: preferencias privadas.
`roles/{uid}`: rol asignado por proceso administrativo confiable, nunca escritura pública.

El identificador `uid` lo entrega el proveedor de autenticación. Nunca confiar en un uid recibido como parámetro para decidir permisos.

## Reglas de seguridad (ejemplo Firebase Firestore)
Ver `firestore.rules`. La aplicación no debe permitir escribir roles desde clientes. Las notas sólo son accesibles por su dueño. Una interfaz oculta NO constituye protección.

## Implementación pendiente de integrar
1. Identificar el framework actual y sus archivos de entrada.
2. Configurar proyecto de autenticación y base de datos con credenciales de entorno (sin secretos en Git).
3. Implementar registro, login, verificación de correo, recuperación de acceso y cierre de sesión.
4. Conectar «Mi espacio» al uid autenticado.
5. Añadir reglas y pruebas automáticas con dos usuarios distintos y un administrador.
6. Integrar desbloqueo biométrico usando API segura del dispositivo, sin almacenar huellas.
7. Validar y recién entonces generar APK.

**Estado:** diseño y reglas iniciales, no despliegue ni APK.
