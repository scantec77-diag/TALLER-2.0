# Prueba de aislamiento entre dos cuentas — Taller 2.0

Estado: **pendiente de ejecutar**. Este documento define las verificaciones, no certifica que ya funcionen.

## Preparación
- Configurar un proyecto Firebase de pruebas con Authentication (correo/contraseña, verificación de correo) y Firestore.
- Publicar `firestore.rules` en el entorno de pruebas, nunca directamente en producción.
- Crear dos cuentas verificadas: usuario A y usuario B. No guardar contraseñas en el repositorio.
- Crear dos notas con identificadores diferentes, una bajo `users/UID_A/notes` y otra bajo `users/UID_B/notes`.

## Casos de prueba obligatorios
| Caso | Sesión | Acción | Resultado esperado |
|---|---|---|---|
| 1 | A | Leer nota propia | Permitido |
| 2 | A | Editar nota propia | Permitido |
| 3 | A | Leer nota de B por ruta directa | Denegado |
| 4 | A | Crear nota bajo UID_B | Denegado |
| 5 | B | Leer nota de A por ruta directa | Denegado |
| 6 | Sin sesión | Leer cualquier nota | Denegado |
| 7 | Correo no verificado | Leer nota propia | Denegado |
| 8 | A | Modificar roles/UID_A | Denegado |
| 9 | A | Listar notas bajo users/UID_B/notes | Denegado |
| 10 | B | Abrir «Mi espacio» | Sólo notas y ajustes de B |

## Criterio de aceptación
Todos los casos deben pasar con reglas del servidor, no solamente con filtros de interfaz. Confirmar también que cerrar sesión borra caché sensible visible y que cambiar de cuenta no conserva el contenido de la anterior.

## Integración
La pantalla principal debe consultar el UID de la sesión validada y cargar exclusivamente rutas propias. Para huella, utilizar BiometricPrompt / credenciales del sistema Android; no almacenar imágenes ni plantillas biométricas.

## Siguiente paso
Inspeccionar código y framework de la aplicación para implementar registro, sesiones y pantallas. Sin credenciales de Firebase y sin despliegue, las pruebas reales no pueden darse por aprobadas.
