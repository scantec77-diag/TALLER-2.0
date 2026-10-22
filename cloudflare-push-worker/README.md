# Avisos gratis · Taller 2.0 (en preparación)

## Qué está incluido
- La APK Android se suscribe al tema FCM `taller20_espacio_comun`.
- Un Worker recibe el ID del mensaje nuevo, valida el usuario en Firebase Authentication,
  lee el mensaje desde Firestore y comprueba que lo publicó ese usuario hace menos de 2 minutos.
- El Worker registra el envío en `pushDispatches` para no repetirlo y manda una
  notificación general al tema de Android. **No incluye el texto del mensaje**.
- No requiere Firebase Cloud Functions (que exigiría activar facturación).

## Estado
Código preparado, **NO DESPLEGADO**. Sin las conexiones de abajo no salen avisos.
El plan gratuito de Workers tiene límites, puede rechazar solicitudes al agotarse y
no hay garantía de entrega instantánea. FCM es gratuito en Firebase Spark.

## Pasos del titular de las cuentas, sin pagar
1. Firebase Console > proyecto `taller-2-0` > Configuración > Agregar app Android.
   Paquete **`ar.scantec.taller20`**. Copiar el **App ID de Firebase** (`1:...:android:...`).
   En GitHub > Settings > Secrets and variables > Actions > Variables, configurar
   `TALLER_FIREBASE_ANDROID_APP_ID` (no es contraseña).
2. Recompilar la APK de la rama Android en GitHub Actions. Probar que recibe un
   mensaje de prueba de Firebase Console antes de habilitar envíos automáticos.
3. Crear cuenta gratuita en Cloudflare y desplegar `cloudflare-push-worker/`
   usando Cloudflare Workers Free. Configurar el secreto
   `FIREBASE_SERVICE_ACCOUNT_JSON` **solo en Cloudflare** (no en GitHub ni en
   la web). El JSON de la cuenta de servicio se obtiene de Firebase > Cuentas de
   servicio. La cuenta necesita permiso mínimo de Firestore y Cloud Messaging.
   No activar Workers Paid.
4. Copiar la URL del Worker terminada en `/notify` a
   `push-dispatch-config.js` en el repositorio web.
5. Aplicar/confirmar las reglas de Firestore que permitan leer `commonMessages`
   para usuarios con correo verificado (el código no las publica por sí solo).
6. Probar desde dos usuarios distintos. **Nunca compartir claves privadas
   ni JSON de cuentas de servicio por chat o en un repositorio público.**

## Advertencia de privacidad
FCM topics no autentica a cada receptor; cualquier dispositivo configurado para
suscribirse al tema podría recibir un aviso. Por eso los avisos Android contienen
solo el nombre de quien publicó, nunca texto del mensaje. No se deben enviar datos
sensibles por ese tema. Para grupos privados se necesitará registro autenticado
de dispositivos y envío a tokens individuales.

## Firebase
Configuración web existente: proyecto `taller-2-0`.
No poner secretos en archivos de frontend ni activar Firebase Functions/Blaze.

## Costos
Firebase Cloud Messaging: sin costo. Firestore tiene límites del plan Spark.
Cloudflare Workers Free: hasta 100.000 solicitudes/día y límite de CPU por
solicitud. El proyecto NO crea facturación automáticamente.
