const BUILD_VERSION = document.documentElement.dataset.appVersion || 'source';
const CHANNEL_URL = new URL('./updates/stable.json', document.baseURI);
const notice = document.getElementById('appUpdateNotice');
const message = document.getElementById('appUpdateMessage');
const applyButton = document.getElementById('applyAppUpdate');
let registration = null;
let updateAvailable = false;
let applying = false;
let lastCheck = 0;

function showUpdate(version) {
  updateAvailable = true;
  if (message) message.textContent = 'Hay una versión nueva de Taller (' + version + ') en el canal estable.';
  if (notice) notice.hidden = false;
}

async function installOrApplyUpdate() {
  if (applying) return;
  applying = true;
  if (applyButton) {
    applyButton.disabled = true;
    applyButton.textContent = 'Actualizando…';
  }
  try {
    if (!registration && 'serviceWorker' in navigator) {
      registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    }
    if (registration?.waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once: true});
      registration.waiting.postMessage({type: 'SKIP_WAITING'});
      return;
    }
    await registration?.update().catch(() => {});
    if (registration?.waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once: true});
      registration.waiting.postMessage({type: 'SKIP_WAITING'});
      return;
    }
    location.reload();
  } catch (_) {
    location.reload();
  }
}

async function checkForUpdate(force = false) {
  const now = Date.now();
  if (!force && now - lastCheck < 60_000) return;
  lastCheck = now;
  try {
    const url = new URL(CHANNEL_URL);
    url.searchParams.set('check', String(now));
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) return;
    const channel = await response.json();
    if (channel.channel !== 'stable' || !channel.version || channel.version === BUILD_VERSION) return;
    showUpdate(channel.version);
    if ('serviceWorker' in navigator) {
      registration ||= await navigator.serviceWorker.register('./firebase-messaging-sw.js');
      await registration.update().catch(() => {});
      if (registration.waiting) showUpdate(channel.version);
    }
  } catch (error) {
    console.info('No se pudo consultar el canal de actualizaciones de Taller.', error);
  }
}

applyButton?.addEventListener('click', installOrApplyUpdate);
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./firebase-messaging-sw.js')
    .then(value => { registration = value; return checkForUpdate(true); })
    .catch(error => {
      console.info('La actualización automática no está disponible en este navegador.', error);
      checkForUpdate(true);
    });
} else {
  checkForUpdate(true);
}

window.addEventListener('focus', () => checkForUpdate());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkForUpdate();
});
setInterval(() => checkForUpdate(), 5 * 60_000);
