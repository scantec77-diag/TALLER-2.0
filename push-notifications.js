// Registro voluntario de notificaciones FCM Web para Taller 2.0.
// En una APK basada en Android WebView puede no estar disponible la Push API.
import { getMessaging, getToken, deleteToken, isSupported } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { PUSH_VAPID_PUBLIC_KEY } from './push-config.js';

const storageKey = uid => 'taller20_push_optin_' + uid;
let busy = false;
const capable = async () => Boolean(
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'Notification' in window &&
  'PushManager' in window &&
  await isSupported()
);
const readSaved = uid => { try { return JSON.parse(localStorage.getItem(storageKey(uid)) || 'null'); } catch (_) { return null; } };
const save = (uid, value) => { try { localStorage.setItem(storageKey(uid), JSON.stringify(value)); } catch (_) {} };
const forget = uid => { try { localStorage.removeItem(storageKey(uid)); } catch (_) {} };
async function digest(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function registerDevice({ app, db, user }) {
  if (!user || !PUSH_VAPID_PUBLIC_KEY.trim()) throw Error('Falta configurar la clave pública Web Push de Firebase.');
  if (!await capable()) throw Error('Este navegador o la APK no admite las notificaciones Web Push.');
  if (Notification.permission !== 'granted') throw Error('No hay permiso de notificaciones en el dispositivo.');
  const worker = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
  const token = await getToken(getMessaging(app), { vapidKey: PUSH_VAPID_PUBLIC_KEY.trim(), serviceWorkerRegistration: worker });
  if (!token) throw Error('Firebase todavía no entregó un token de notificación.');
  const id = await digest(token), previous = readSaved(user.uid);
  await setDoc(doc(db, 'users', user.uid, 'pushDevices', id), {
    token, platform: 'web', updatedAt: serverTimestamp()
  });
  if (previous?.id && previous.id !== id) {
    await deleteDoc(doc(db, 'users', user.uid, 'pushDevices', previous.id)).catch(() => {});
  }
  save(user.uid, { id, enabled: true });
}
export async function refreshPushRegistration(ctx) {
  const saved = ctx.user && readSaved(ctx.user.uid);
  if (!saved?.enabled || !PUSH_VAPID_PUBLIC_KEY.trim() || !await capable() || Notification.permission !== 'granted') return;
  try { await registerDevice(ctx); } catch (e) { console.warn('Push no disponible:', e.code || e.message); }
}
export async function forgetPushRegistration({ app, db, user }) {
  if (!user) return;
  const saved = readSaved(user.uid);
  if (saved?.id) await deleteDoc(doc(db, 'users', user.uid, 'pushDevices', saved.id));
  if (await capable()) await deleteToken(getMessaging(app)).catch(() => {});
  forget(user.uid);
}
export function pushIsEnabled(uid) { return Boolean(readSaved(uid)?.enabled); }
export async function showPushSettings({ app, db, user, view, home }) {
  if (!user) return;
  view.innerHTML = '<button class="back" id="pushBack" type="button">← Volver</button>' +
    '<h2>🔔 Notificaciones</h2>' +
    '<p>Avisos del ESPACIO COMÚN, con el nombre de quien publica. Los avisos dentro de Taller 2.0 funcionan sin activar las notificaciones del teléfono.</p>' +
    '<p id="pushState" role="status">Comprobando compatibilidad...</p>' +
    '<button class="settings" id="pushEnable" type="button">Activar notificaciones del celular</button>' +
    '<button class="settings" id="pushDisable" type="button">Desactivar en este dispositivo</button>' +
    '<p><small>Para recibirlas con la aplicación cerrada se necesita una web/PWA compatible, la clave Web Push y el servidor de Firebase desplegado. En una APK WebView se requiere integración Android nativa.</small></p>';
  document.getElementById('pushBack').onclick = home;
  const status = document.getElementById('pushState');
  const enable = document.getElementById('pushEnable');
  const disable = document.getElementById('pushDisable');
  const supported = await capable();
  if (!status.isConnected) return;
  if (!supported) {
    status.textContent = 'Este dispositivo no ofrece Web Push en este entorno. Los avisos dentro de la aplicación siguen activos.';
  } else if (!PUSH_VAPID_PUBLIC_KEY.trim()) {
    status.textContent = 'Falta completar la clave pública Web Push en el proyecto Firebase.';
  } else {
    status.textContent = pushIsEnabled(user.uid) && Notification.permission === 'granted'
      ? 'Notificaciones activadas para este dispositivo.'
      : 'Notificaciones del teléfono todavía desactivadas.';
  }
  enable.disabled = !supported || !PUSH_VAPID_PUBLIC_KEY.trim();
  disable.disabled = !pushIsEnabled(user.uid);
  enable.onclick = async () => {
    if (busy) return;
    // Solicitar el permiso desde el clic explícito, no al abrir la aplicación.
    const permissionRequest = Notification.permission === 'default'
      ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    busy = true; enable.disabled = true;
    try {
      if (await permissionRequest !== 'granted') throw Error('Permiso denegado: habilitá las notificaciones en los ajustes del navegador.');
      status.textContent = 'Registrando dispositivo...';
      await registerDevice({ app, db, user });
      if (status.isConnected) { status.textContent = 'Notificaciones activadas ✓'; disable.disabled = false; }
    } catch (e) {
      if (status.isConnected) status.textContent = e.message || 'No se pudo activar.';
    } finally { busy = false; if (enable.isConnected) enable.disabled = false; }
  };
  disable.onclick = async () => {
    if (busy) return;
    busy = true; disable.disabled = true; status.textContent = 'Desactivando...';
    try {
      await forgetPushRegistration({ app, db, user });
      if (status.isConnected) status.textContent = 'Notificaciones desactivadas en este dispositivo ✓';
    } catch (e) {
      if (status.isConnected) { status.textContent = 'No se pudo desactivar: ' + (e.message || e.code); disable.disabled = false; }
    } finally { busy = false; }
  };
}
