/* global self, caches */
// Installation identity is live metadata, independent of the adopted app version.
// A waiting worker repairs legacy precaches without claiming clients or reloading tabs.
export async function refreshInstalledManifestCaches() {
  const identities = ['/manifest.webmanifest', '/quick-task/manifest.webmanifest'];
  await Promise.all(identities.map(async pathname => {
    try {
      const response = await fetch(new URL(pathname, self.location.origin), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      const manifest = await response.clone().json();
      const scope = pathname === '/manifest.webmanifest' ? '/' : '/quick-task/';
      if (manifest.id !== scope || manifest.scope !== scope || manifest.start_url !== scope
        || typeof manifest.name !== 'string' || !manifest.name.trim()
        || !['standalone', 'minimal-ui', 'fullscreen', 'browser'].includes(manifest.display)
        || !Array.isArray(manifest.icons) || !manifest.icons.length) return;
      const names = (await caches.keys()).filter(name => name.startsWith('projed-'));
      // Keep an offline copy even though canonical manifests no longer use precache.
      if (!names.includes('projed-install-manifests')) names.push('projed-install-manifests');
      await Promise.all(names.map(async name => {
        const cache = await caches.open(name);
        if (name === 'projed-install-manifests') {
          await cache.put(new URL(pathname, self.location.origin), response.clone());
          return;
        }
        const keys = await cache.keys();
        for (const key of keys) {
          const url = new URL(key.url);
          // Preserve Workbox revision keys, versioned snapshots and all user data.
          if (url.origin === self.location.origin && url.pathname === pathname) {
            await cache.put(key, response.clone());
          }
        }
      }));
    } catch { /* Offline/invalid metadata must not break installation or erase the old copy. */ }
  }));
}

export function createManifestCacheRepairSource() {
  return `self.addEventListener('install', event => { event.waitUntil((${refreshInstalledManifestCaches.toString()})()); });\n`;
}
