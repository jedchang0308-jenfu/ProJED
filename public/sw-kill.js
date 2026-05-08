(function () {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.getRegistrations()
    .then(function (registrations) {
      registrations.forEach(function (registration) {
        registration.unregister()
          .then(function (ok) {
            console.log('[PWA Kill Switch] Unregistered Service Worker:', ok);
          });
      });
    })
    .catch(function (error) {
      console.warn('[PWA Kill Switch] Failed to unregister Service Workers:', error);
    });

  if (!window.caches) return;

  caches.keys()
    .then(function (names) {
      return Promise.all(names.map(function (name) {
        return caches.delete(name);
      }));
    })
    .catch(function (error) {
      console.warn('[PWA Kill Switch] Failed to clear caches:', error);
    });
}());
