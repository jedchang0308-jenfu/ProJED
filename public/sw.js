self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    if (self.registration) {
      await self.registration.unregister();
    }

    if (self.caches) {
      const names = await self.caches.keys();
      await Promise.all(names.map(function (name) {
        return self.caches.delete(name);
      }));
    }

    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(function (client) {
      client.navigate(client.url);
    });
  }()));
});
