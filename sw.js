/* Offline shell, scoped to this repository path. Version bumps evict obsolete
 * module graphs together so cached engine and UI versions never mix. */
const CACHE = 'riichi-mahjong-v1.0.0';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/analysis-worker.js',
  './js/core/tiles.js',
  './js/core/shanten.js',
  './js/core/scoring.js',
  './js/core/game.js',
  './js/core/ai.js',
  './js/core/all-last.js',
  './js/ui/common.js',
  './js/ui/table.js',
  './js/ui/trainers.js',
  './js/ui/replay.js',
];
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  )
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('riichi-mahjong-') && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
