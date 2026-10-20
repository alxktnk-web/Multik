// The build embeds every application asset and a content-based version here.
const VERSION = '__BUILD_VERSION__';
const FILES = __PRECACHE_FILES__;
const PREFIX = `multik:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const urls = FILES.map((file) => new URL(file, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)));
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.href.startsWith(self.registration.scope)) return;
  if (request.mode === 'navigate') {
    url.search = '';
    if (url.pathname.endsWith('/')) url.pathname += 'index.html';
  }
  // Only application files get a cache fallback. Never return HTML for a missing script.
  if (!urls.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      event.waitUntil(cache.put(url.href, response.clone()));
    }
    return response;
  })());
});
