'use strict';
// Backend: disparar un único push a los dispositivos registrados de los demás usuarios.
// Desplegar por separado con Firebase CLI. Nunca guardar credenciales de servicio aquí.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
exports.notifyCommonMessage = onDocumentCreated({
  document: 'commonMessages/{messageId}',
  region: 'southamerica-east1',
  retry: false
}, async event => {
  const message = event.data?.data();
  if (!message || typeof message.text !== 'string' || !message.text.trim() || !message.authorId) return;
  const firestore = getFirestore();
  const devices = await firestore.collectionGroup('pushDevices').get();
  const unique = new Map();
  for (const device of devices.docs) {
    const uid = device.ref.parent.parent?.id;
    const token = device.data().token;
    if (!uid || uid === message.authorId || device.data().platform !== 'web' ||
        typeof token !== 'string' || !token) continue;
    if (!unique.has(token)) unique.set(token, []);
    unique.get(token).push(device.ref);
  }
  const entries = [...unique.entries()];
  const authorName = String(message.authorName || 'Alguien').slice(0, 80);
  const preview = message.text.trim().slice(0, 160);
  for (let i = 0; i < entries.length; i += 500) {
    const batch = entries.slice(i, i + 500);
    const result = await getMessaging().sendEachForMulticast({
      tokens: batch.map(([token]) => token),
      data: {
        type: 'common-message',
        authorName,
        preview,
        messageId: String(event.params.messageId).slice(0, 128)
      },
      android: { priority: 'high' }
    });
    const cleanups = [];
    result.responses.forEach((res, n) => {
      if (res.success) return;
      const code = res.error?.code || '';
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token') {
        for (const ref of batch[n][1]) cleanups.push(ref.delete());
      } else {
        console.error('No se pudo entregar un aviso FCM:', code);
      }
    });
    await Promise.allSettled(cleanups);
  }
  console.log('Avisos del espacio común: dispositivos destinatarios:', entries.length);
});
