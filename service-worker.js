self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((key) => key.startsWith('clear-flow-cache'))
          .map((key) => caches.delete(key))
      );
      await self.registration.unregister();
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', () => {
  // Legacy worker intentionally disabled.
});
