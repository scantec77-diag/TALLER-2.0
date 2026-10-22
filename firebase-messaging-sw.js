/* Taller 2.0: mensajes push cuando la web/PWA compatible está en segundo plano.
   Este service worker debe servirse en el mismo origen de index.html y sobre HTTPS. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyCHFS8iMwgTdK_JGsxSTodblP6OJFahWbA',
  authDomain: 'taller-2-0.firebaseapp.com',
  projectId: 'taller-2-0',
  storageBucket: 'taller-2-0.firebasestorage.app',
  messagingSenderId: '84943475166',
  appId: '1:84943475166:web:d19eff70f97678ab448d4f'
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  const name = String(data.authorName || 'Alguien').slice(0, 80);
  const title = '💬 ' + name + ' escribió en ESPACIO COMÚN';
  const body = String(data.preview || 'Hay un mensaje nuevo en Taller 2.0').slice(0, 160);
  const url = new URL('./index.html#espacio-comun', self.registration.scope).href;
  return self.registration.showNotification(title, {
    body, tag: 'taller20-common-' + String(data.messageId || '').slice(0, 128),
    icon: undefined, badge: undefined, data: { url }
  });
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL('./index.html#espacio-comun', self.registration.scope).href;
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return clients.openWindow(url);
  })());
});
