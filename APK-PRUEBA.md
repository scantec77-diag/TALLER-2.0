# Taller 2.0 — Instalador de prueba Android

La rama `apk-prueba-taller-2-0` compila una APK de prueba de Taller 2.0 a partir de la web publicada.

## Descargar
Ir a **Releases** del repositorio y elegir **Taller 2.0 - APK de prueba**. Descargar `Taller-2.0-Prueba.apk` directamente, o consultar las ejecuciones de **Actions**.

## Qué hace
Abre `https://scantec77-diag.github.io/TALLER-2.0/` usando una pestaña de navegador de Android, para permitir la autenticación Google/Firebase, evitando WebView. Muestra el código web vigente, sin copiar manuales ni almacenar contraseñas en la APK.

## Alcance y limitaciones
- Requiere conexión a Internet.
- El acceso a Google Drive requiere que Drive API y OAuth estén correctamente habilitados, y que la cuenta de manuales tenga permisos sobre las carpetas.
- Esta compilación se firma con la clave de depuración de GitHub Actions. No reemplaza la firma de la APK de Scantec ni sirve como APK definitiva para Play Store.
- Al recompilar, una clave debug nueva puede impedir instalar encima: desinstalar la versión de prueba antes de instalar otra firmada de forma diferente.
- Se instala con identificador `ar.scantec.taller20`, separado de Scantec.

## Compilación local
Android SDK 35, Java 17 y Gradle 8.10.2. Ejecutar `gradle :app:assembleDebug`.
