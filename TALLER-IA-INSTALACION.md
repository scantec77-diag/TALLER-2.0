# Taller IA — Integración preparada (23/10/2026)

La interfaz de chat ya está conectada a la portada de Taller 2.0. Se conservan la biblioteca, Firebase Authentication, el espacio común y las notificaciones existentes.

**Estado:** La interfaz está publicada en GitHub, pero la función de IA no está desplegada. Sin despliegue, clave de OpenAI y App Check, el chat mostrará un mensaje de configuración pendiente. No se ha indexado ningún manual, ni se han transferido archivos de Google Drive a proveedores de IA.

## Activación (administrador)

1. Confirmar en la consola Firebase el proyecto de Taller 2.0 y que el plan admita Cloud Functions y Secret Manager.
2. Abrir Firebase CLI en una PC con credenciales autorizadas. Desde la raíz del repositorio instalar dependencias: `cd functions && npm install`.
3. Configurar el secreto privado, sin escribirlo en GitHub: `firebase functions:secrets:set OPENAI_API_KEY`.
4. Registrar el sitio GitHub Pages y configurar Firebase App Check para web con reCAPTCHA Enterprise. **Actualmente la página web no inicializa App Check:** implementar esta inicialización y validarla antes de desplegar; la función exige `enforceAppCheck:true`.
5. En Firebase CLI, seleccionar explícitamente el proyecto correcto y desplegar sólo la función nueva: `firebase deploy --only functions:tallerIA`.
6. Confirmar que está habilitada la API OpenAI, revisar facturación de Firebase y OpenAI, y probar con usuario real.

## Manuales de Google Drive (segunda etapa)

La función puede leer documentos de la colección Firestore `manualChunks` sólo si `published=true` y `authorizedUids` incluye el UID del usuario. Cada registro debe contener `title`, `page`, `content`, `published`, y `authorizedUids`.

**La colección aún debe llenarse** mediante una herramienta de indexación administrativa que:
- verifique qué carpetas y archivos pueden consultar cada usuario;
- extraiga texto de PDF autorizados;
- cargue fragmentos con título y número de página;
- revoque ACL y fragmentos cuando cambien los permisos;
- no exponga tokens OAuth de la cuenta propietaria de los manuales al usuario final.

No permitir escrituras de `manualChunks` por usuarios comunes. No subir documentos confidenciales a servicios externos sin autorización. La búsqueda inicial es por coincidencia de palabras, no semántica: se recomienda migrarla a búsqueda vectorial para un catálogo amplio.

## Privacidad, seguridad y límites

Las conversaciones se mantienen en memoria temporal del navegador, no en Firestore. Se envían preguntas y hasta ocho mensajes anteriores a la función y al proveedor de IA. Se limita a 20 consultas por UID y día mediante Firestore. Los fragmentos recuperados también se envían al proveedor OpenAI. Los resultados técnicos deben validarse contra manuales oficiales, especialmente al intervenir equipos energizados, hidráulica, elevación o circuitos de seguridad.

## Archivos agregados o cambiados

- `taller-ia.js`: ventana del chat, errores claros y llamada a Firebase.
- `taller-ia.css`: diseño adaptable.
- `functions/taller-ia.js`: servicio seguro con autenticación, límite de uso, búsqueda documental con ACL y consulta al modelo.
- `index.html`: botón y carga del chat.
- `functions/index.js`: exporta nueva función preservando notificaciones.
