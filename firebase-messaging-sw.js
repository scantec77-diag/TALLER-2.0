/* Taller 2.0: push notifications plus a versioned app shell for in-app updates. */
const TALLER_BUILD_VERSION = '__TALLER_BUILD_VERSION__';
const TALLER_CACHE_PREFIX = 'taller20-shell-';
const TALLER_CACHE_NAME = TALLER_CACHE_PREFIX + TALLER_BUILD_VERSION;
const TALLER_APP_SHELL = [
  new URL('./index.html', self.registration.scope).href,
  new URL('./app-updates.js', self.registration.scope).href
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(TALLER_CACHE_NAME).then(cache =>
    Promise.allSettled(TALLER_APP_SHELL.map(url => cache.add(url)))
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(TALLER_CACHE_PREFIX) && name !== TALLER_CACHE_NAME)
      .map(name => caches.delete(name)));
    await clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('/updates/stable.json')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(TALLER_CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match(new URL('./index.html', self.registration.scope).href);
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyCHFS8iMwgTdK_KJsxSTodblP6OJFahWbA',
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
