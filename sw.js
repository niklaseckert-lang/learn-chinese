/* Offline support: cache every app file, serve from cache, refresh when VERSION changes.
   VERSION and ASSETS are rewritten by tools/stamp.py — run it after changing any app file. */
const VERSION = 'bace5c6865';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/app.js',
  'js/data/adjectives.js',
  'js/data/counting.js',
  'js/data/nouns.js',
  'js/data/proverbs.js',
  'js/data/sentences.js',
  'js/data/tones.js',
  'js/data/verbs.js',
  'manifest.webmanifest',
];
const CACHE = `xuezhongwen-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('xuezhongwen-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
  );
});
