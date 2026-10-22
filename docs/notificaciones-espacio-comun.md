# Taller 2.0 — ESPACIO COMÚN y avisos

## Incluido en el proyecto
- Mensajes de ESPACIO COMÚN para usuarios de Google autenticados y verificados.
- Pop-ups dentro de la aplicación cuando hay mensajes nuevos de otros usuarios.
- Pantalla 🔔 Notificaciones con alta/baja voluntaria del dispositivo.
- Service worker FCM y registro de dispositivos en `users/{uid}/pushDevices/{id}`.
- Función backend para enviar un push al publicar un mensaje (omite al autor).
- Reglas de Firestore para aislar tokens por usuario y evitar escritura pública.

## Pendiente de activación en Firebase (no realizado automáticamente)
1. Publicar las reglas del archivo `firestore.rules` desde Firebase Console o con `firebase deploy --only firestore:rules --project taller-2-0`. El archivo GitHub **no aplica automáticamente** reglas en la base de datos.
2. Firebase Console > Configuración del proyecto > Cloud Messaging > Certificados push web: generar clave VAPID y pegar **solo la clave pública** en `push-config.js`.
3. Para push con la app cerrada, configurar facturación/plan de Firebase si fuera necesario para Cloud Functions (ver costos antes de activar) y desplegar `firebase deploy --only functions --project taller-2-0`. Los mensajes en vivo y pop-ups internos no requieren esa función.
4. Publicar la versión del sitio con `index.html`, `push-config.js`, `push-notifications.js` y `firebase-messaging-sw.js` en el mismo origen HTTPS.
5. Abrir la web desde un navegador Android compatible (o instalar como PWA) y elegir **🔔 Notificaciones**. Aceptar el permiso y probar con otra cuenta.
6. El login Google debe completar correctamente en ambos dispositivos y Firestore debe permitir los accesos configurados.

## APK Android y avisos con APK cerrada
La APK actual no tiene código fuente Android en este repositorio. Si carga el HTML en WebView, el sistema de Push API Web puede no funcionar aunque el sitio sí funcione desde Chrome. Para una APK real que reciba notificaciones cerrada hay que actualizar el proyecto Android con Firebase Cloud Messaging nativo, configurar el canal de avisos, pedir `POST_NOTIFICATIONS` en Android 13+ y registrar el token nativo asociado al UID. Después se recompila y firma **con la misma clave** que la APK instalada. No se puede obtener eso editando solo el HTML de este repositorio.

## Seguridad y límites
- **Nunca** subir la clave privada VAPID, clave de servicio Firebase, contraseñas de la cuenta de manuales ni tokens de autorización a GitHub.
- Las reglas restringen tokens a cada propietario. Firestore/Cloud Functions todavía deben verificarse en Firebase Console.
- Sólo la clave VAPID pública puede permanecer en el repositorio.
- La función consulta una colección por usuario/dispositivo al distribuir mensajes. Para grupos grandes hay que revisar costos y diseño.
- El botón desactivar elimina el registro del dispositivo, pero los permisos del navegador se revocan desde sus ajustes.
