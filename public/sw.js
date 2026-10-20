// The build embeds every application asset and a content-based version here.
const VERSION = '__BUILD_VERSION__';
const FILES = __PRECACHE_FILES__;
const PREFIX = `multik:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const urls = FILES.map((file) => new URL(file, self.registration.scope).href);

// Static hosts may redirect /index.html to /. Safari rejects a followed
// redirect returned by respondWith(), including one read back from CacheStorage.
function canonical(href) {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/index\.html$/, '/');
  return url.href;
}
function isAppResponse(response, href) {
  if (!response.ok || !['basic', 'default'].includes(response.type)) return false;
  if (response.url && canonical(response.url) !== canonical(href)) return false;
  const type = response.headers.get('content-type') ?? '';
  if (href.endsWith('.html')) return type.includes('text/html');
  // Never store a login page in place of JavaScript, CSS, icons, or the manifest.
  return !type.includes('text/html');
}
async function withoutRedirect(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status, statusText: response.statusText, headers: response.headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(urls.map(async (href) => {
      const response = await fetch(href, { credentials: 'same-origin', cache: 'reload' });
      if (!isAppResponse(response, href)) throw new Error('Application file unavailable');
      await cache.put(href, await withoutRedirect(response));
    }));
  })());
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
    if (cached && isAppResponse(cached, url.href)) return withoutRedirect(cached);
    const response = await fetch(request);
    if (isAppResponse(response, url.href)) {
      const clean = await withoutRedirect(response);
      await cache.put(url.href, clean.clone());
      return clean;
    }
    // A sign-in redirect belongs to browser navigation, never to the app cache.
    if (response.redirected) return request.mode === 'navigate'
      ? Response.redirect(response.url, 302) : Response.error();
    return response;
  })());
});
