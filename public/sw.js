// Splitty service worker: cache-first for static assets, network-first for pages.
const CACHE = 'splitty-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  const isAsset = /\/_expo\/|\/assets\/|\.(png|wasm|js|css|ico|webmanifest)$/.test(new URL(req.url).pathname);
  e.respondWith(
    isAsset
      ? caches.match(req).then((hit) => hit || fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return res; }))
      : fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return res; }).catch(() => caches.match(req).then((h) => h || caches.match('/app/')))
  );
});
