const CACHE_VERSION = '260130.2';
const CACHE_NAME = `noteable-cache-${CACHE_VERSION}`;
const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icons/icon512.png',
  './icons/icon128.png',
  './manifest.json'
];

// Install: cache all files
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache first
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

// --- Notify clients when a new SW is waiting ---
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

});

