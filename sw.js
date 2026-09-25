const CACHE_NAME = 'appletube-v20';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/components.css',
  './css/visualizer.css',
  './js/config.js',
  './js/storage.js',
  './js/auth.js',
  './js/api.js',
  './js/player.js',
  './js/visualizer.js',
  './js/ui.js',
  './js/app.js',
  './js/colorExtractor.js',
  './assets/logo.svg',
  './assets/logo.png',
  './assets/default-cover.svg',
  './assets/default-cover.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        // Ignore assets that fail during initial install
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pass through audio streaming, byte-range requests, and API requests directly
  const requestUrl = new URL(event.request.url);
  if (
    requestUrl.origin !== location.origin ||
    requestUrl.pathname.startsWith('/api/') ||
    event.request.destination === 'audio' ||
    event.request.destination === 'video' ||
    event.request.headers.has('range') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-first for fresh updates, falling back to cache when offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
