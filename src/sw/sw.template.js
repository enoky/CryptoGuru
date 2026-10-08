/*
 * CryptoGuru service worker: keeps the app shell (HTML, JS, CSS, icons) on
 * the device so the app opens with no connection. Market data is cached by
 * the app itself in IndexedDB, so /api and other sites are left alone.
 *
 * Built by the Vite plugin in vite.config.ts, which fills in the file list.
 */
const VERSION = '__VERSION__';
const CACHE = `cryptoguru-shell-${VERSION}`;
const PRECACHE = __PRECACHE__;
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('cryptoguru-shell-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// The page asks the waiting worker to take over when the user taps "Reload" on the update banner.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(pageFromNetworkOrCache(req));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

/**
 * Pages come from the network when it answers within 3 s, so updates show up;
 * otherwise from the cached shell. The cached shell is never replaced here:
 * it must match the cached JS/CSS of this worker version.
 */
async function pageFromNetworkOrCache(req) {
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch {
    const cache = await caches.open(CACHE);
    return (await cache.match('/')) || Response.error();
  }
}
