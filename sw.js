const CACHE_VERSION = '260107.1149';
const CACHE_NAME = 'noteable-cache-${CACHE_VERSION}';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './icons/icon512.png',
  './icons/icon128.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() => {
          console.warn('[ServiceWorker] Offline and no cache for:', event.request.url);
        })
      );
    })
  );

});
