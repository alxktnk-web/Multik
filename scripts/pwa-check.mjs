// Exercise canonical redirects, expired sign-in, and recovery without deleting local data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';
const worker = await readFile('dist/sw.js', 'utf8');
const legacySource = await readFile('scripts/fixtures/sw-legacy.js', 'utf8');
const legacy = legacySource.replace('__BUILD_VERSION__', 'legacy-redirect-regression')
  .replace('__PRECACHE_FILES__', worker.match(/const FILES = (.*);/)[1]);
let old = false, login = false;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://local').pathname;
  const html = text => res.writeHead(200, {'Content-Type':'text/html', 'Cache-Control':'no-store'}).end(text);
  if (path === '/login') return html('<h1>Sign in</h1>');
  if (path === '/multik/harness.html') return html('<h1>Harness</h1>');
  if (!path.startsWith('/multik/')) return res.writeHead(404).end();
  if (login && path !== '/multik/sw.js' && path !== '/multik/recover.html') return res.writeHead(302, {Location:'/login'}).end();
  if (path.endsWith('/index.html')) return res.writeHead(308, {Location:path.slice(0, -10)}).end();
  if (path === '/multik/sw.js') return res.writeHead(200, {'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(old ? legacy : worker);
  const file = path.slice('/multik/'.length) + (path.endsWith('/') ? 'index.html' : '');
  try {
    const body = await readFile(resolve('dist', file));
    const type = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[extname(file)];
    res.writeHead(200, {'Content-Type':type || 'application/octet-stream','Cache-Control':'no-store'}).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/multik/`;
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const timeout = setTimeout(() => { console.error('PWA regression timed out'); void browser.close(); }, 90000);
try {
  const context = await browser.newContext(); const page = await context.newPage();
  context.on('console', message => { if(message.type() === 'error') console.error('Browser:', message.text()); });
  page.on('pageerror', error => console.error(error.message));
  await page.goto(base);
  console.log('Checking production worker installation');
  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(async () => reject(new Error(JSON.stringify((await navigator.serviceWorker.getRegistrations()).map(r => ({active:r.active?.state,installing:r.installing?.state,waiting:r.waiting?.state}))))), 10000)),
  ]));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const flags = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    return Promise.all((await cache.keys()).map(async request => (await cache.match(request)).redirected));
  });
  assert.ok(flags.length > 5); assert.ok(flags.every(flag => !flag));
  await context.setOffline(true);
  await page.reload(); await page.waitForSelector('[data-new]');
  await page.goto(base+'lab/'); await page.waitForSelector('#develop');
  await context.setOffline(false);
  console.log('PASS: canonical HTML redirects are normalized; home and Lab work offline');
  // Force a real navigation cache miss after authentication expires.
  await page.evaluate(async () => { for (const name of await caches.keys()) await caches.delete(name); });
  login = true;
  await page.goto(base); assert.ok(page.url().endsWith('/login'));
  const cachedCount = await page.evaluate(async () => {
    const counts = await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).length));
    return counts.reduce((a,b)=>a+b,0);
  });
  assert.equal(cachedCount, 0);
  await context.close();
  console.log('PASS: expired authentication redirects navigation without caching the login page');
  // An unauthenticated fresh install must fail instead of saving login HTML as assets.
  const denied = await browser.newContext(); const deniedPage = await denied.newPage();
  await deniedPage.goto(base+'harness.html');
  const state = await deniedPage.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('./sw.js');
    const worker = reg.installing;
    return new Promise(resolve => {
      const check = () => { if (['activated','redundant'].includes(worker.state)) resolve(worker.state); };
      worker.addEventListener('statechange',check); check();
    });
  });
  assert.equal(state, 'redundant'); await denied.close(); login = false;
  console.log('PASS: sign-in HTML cannot poison a fresh application cache');
  // Reproduce the exact deployed worker with redirected cache entries, then recover.
  old = true;
  const recovery = await browser.newContext(); const recoveryPage = await recovery.newPage();
  await recoveryPage.goto(base);
  await recoveryPage.evaluate(() => navigator.serviceWorker.ready);
  await recoveryPage.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.equal(await recoveryPage.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    return (await cache.match(new URL('./index.html', location.href).href)).redirected;
  }), true);
  await recoveryPage.evaluate(async () => {
    localStorage.setItem('multik-layout-v1', 'retained-layout');
    await new Promise((resolve,reject) => {
      const req = indexedDB.open('recovery-fixture', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction('photos','readwrite');
        tx.objectStore('photos').put(new Blob(['photo-data']), 'photo');
        tx.oncomplete = () => {db.close();resolve();}; tx.onerror = reject;
      };
    });
  });
  old = false;
  await recoveryPage.goto(base+'recover.html');
  await recoveryPage.waitForSelector('#open', {timeout:45000});
  assert.equal(await recoveryPage.evaluate(() => localStorage.getItem('multik-layout-v1')), 'retained-layout');
  assert.equal(await recoveryPage.evaluate(() => new Promise(resolve => {
    const req = indexedDB.open('recovery-fixture'); req.onsuccess = () => {
      const db=req.result, get=db.transaction('photos').objectStore('photos').get('photo');
      get.onsuccess=async () => {const text=await get.result.text();db.close();resolve(text);};
    };
  })), 'photo-data');
  await recoveryPage.click('#open'); await recoveryPage.waitForSelector('[data-new]');
  await recovery.setOffline(true); await recoveryPage.reload(); await recoveryPage.waitForSelector('[data-new]');
  await recovery.close();
  console.log('PASS: recovery replaces the broken deployed worker and preserves IndexedDB photos and preferences');
} finally { clearTimeout(timeout); await browser.close(); await new Promise(r=>server.close(r)); }
