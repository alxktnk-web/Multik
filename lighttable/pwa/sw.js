const VERSION = '__BUILD_VERSION__';
const FILES = __PRECACHE_FILES__;
const PREFIX = `multik-lighttable:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const urls = FILES.map(file => new URL(file, self.registration.scope).href);
function canonical(href) {
  const url = new URL(href); url.search = ''; url.hash = '';
  url.pathname = url.pathname.replace(/\/index\.html$/, '/'); return url.href;
}
function valid(response, href) {
  if (!response.ok || !['basic', 'default'].includes(response.type)) return false;
  if (response.url && canonical(response.url) !== canonical(href)) return false;
  const type = (response.headers.get('content-type') || '').split(';')[0].trim();
  const extension = new URL(href).pathname.split('.').pop();
  const types = {html:['text/html'],js:['text/javascript','application/javascript'],css:['text/css'],png:['image/png'],webmanifest:['application/manifest+json','application/json']};
  return types[extension]?.includes(type) === true;
}
async function clean(response) {
  // Safari cannot consume redirected responses from respondWith or CacheStorage.
  return response.redirected ? new Response(await response.blob(), {status:response.status,statusText:response.statusText,headers:response.headers}) : response;
}
self.addEventListener('install', event => event.waitUntil((async () => {
  try {
    const cache = await caches.open(CACHE);
    await Promise.all(urls.map(async href => {
      const response = await fetch(href, {credentials:'same-origin',cache:'reload'});
      if (!valid(response, href)) throw Error('Incomplete application download');
      await cache.put(href, await clean(response));
    }));
  } catch (error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;
  if (request.mode === 'navigate') { url.search = ''; if (url.pathname.endsWith('/')) url.pathname += 'index.html'; }
  if (!urls.includes(url.href)) return; // Recovery and unknown paths always use the network.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE), cached = await cache.match(url.href);
    if (cached && valid(cached, url.href)) return clean(cached);
    const response = await fetch(request);
    if (valid(response, url.href)) { const safe = await clean(response); await cache.put(url.href, safe.clone()); return safe; }
    if (response.redirected) return request.mode === 'navigate' ? Response.redirect(response.url, 302) : Response.error();
    return response;
  })());
});
