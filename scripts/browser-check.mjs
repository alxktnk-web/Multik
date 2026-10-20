// Local regression checks. Uses an isolated browser profile and disposable fixture photos.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { extname, resolve, join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const output = resolve(process.env.CHECK_OUTPUT ?? 'lab-out/review');
await mkdir(output, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const touch = await context.newCDPSession(page);
const sendTouch = (type, points) => touch.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x,y],id) => ({x,y,id})) });
async function pinch(selector, from = 25, to = 75) {
  const r = await page.locator(selector).boundingBox();
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  await sendTouch('touchStart', [[x-from,y],[x+from,y]]);
  for(let k=1;k<=5;k++) { const d=from+(to-from)*k/5; await sendTouch('touchMove',[[x-d,y],[x+d,y]]); }
  await sendTouch('touchEnd', []);
}
const shot = async (name) => page.screenshot({ path: join(output, name + '.png') });
const waitPreview = () => page.waitForFunction(() => {
  const canvas = document.querySelector('#edit-canvas, #setup-canvas');
  return canvas && canvas.getContext('2d').getImageData(10, 10, 1, 1).data[3] > 0;
});
let server;
try {
  await page.goto(url);
  await page.click('[data-new]');
  await page.click('[data-length="6"]');
  await page.setInputFiles('#roll-files', Array.from({ length: 6 }, (_, i) => ({ name: `bad${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from('broken') })));
  await page.click('[data-save-roll]');
  await page.waitForFunction(() => document.querySelector('.note')?.textContent.includes('Couldn’t save'));
  assert.equal(await page.locator('[data-save-roll]').isDisabled(), false);
  // Replace all bad inputs with real decodable images, without leaving the screen.
  for (let i = 0; i < 6; i++) await page.click('[data-unpick="0"]');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 640, 480);
    g.addColorStop(0, '#294a60'); g.addColorStop(1, '#bfa077'); x.fillStyle = g; x.fillRect(0, 0, 640, 480);
    x.fillStyle = '#172d3c'; x.fillRect(100, 120, 170, 360); x.fillStyle = '#e9b56f'; x.beginPath(); x.arc(440, 140, 65, 0, 7); x.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.setInputFiles('#roll-files', Array.from({ length: 6 }, (_, i) => ({ name: `photo${i}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })));
  await page.fill('#roll-name', 'Sunday light');
  await page.click('[data-save-roll]');
  await page.waitForSelector('[data-pick]');
  console.log('PASS: failed import can be corrected and saved without restarting');

  const fixture = await page.evaluate(async () => {
    const s = await import('/src/app/store.ts');
    const { DEFAULT_SETTINGS, ALGO_VERSION } = await import('/src/core/recipe.ts');
    const { runDevelopment, FrameRenderer, encodeFrame, lookFor } = await import('/src/app/develop.ts');
    const [a] = await s.listRolls();
    const photos = await Promise.all(a.photos.map(async (meta, i) => ({ full: await s.rollPhoto(a, i), thumb: await s.rollThumb(a.id, i), meta })));
    const b = await s.createRoll('City walk', 6, photos);
    let d = await s.createDev({ rollA: a.id, rollB: b.id, titleA: a.name, titleB: b.name, seed: 51, n: 2,
      params: { lookId: 'M', exposureTenths: 0, whiteMerge: 4, haloAmount: 0.4, highlightVariation: true, ppm: 10, settings: { ...DEFAULT_SETTINGS, shiftMode: 'manual', shiftMm: -12, leakChance: 0.8 } }, algo: ALGO_VERSION });
    const glow0 = lookFor(d, 0), glow1 = lookFor(d, 1);
    if (glow0.halSmall === glow1.halSmall || glow0.halSmall !== lookFor(d, 0).halSmall) throw Error('Highlight variation must be deterministic and per frame');
    const off = lookFor({...d, params: {...d.params, haloAmount: 0}}, 0);
    if (off.halSmall || off.halLarge || off.bloom) throw Error('Halo zero must disable all automatic highlight glow');
    let count = 0;
    d = await runDevelopment(d, () => count++, () => count === 1);
    const pausedAt = d.done;
    d = await runDevelopment(d, () => {}, () => false);
    const renderer = await FrameRenderer.open(d, Math.round(36 * d.params.ppm * 1.15));
    const image = await renderer.renderOriginal(0, d.params.ppm);
    const [jpeg] = await encodeFrame(image);
    const { baseEdit } = await import('/src/core/edit.ts');
    const unchanged = await renderer.render(0, baseEdit(renderer.recipe, 0, 4, d.params.haloAmount), d.params.ppm);
    const haloParity = unchanged.data.every((v, k) => v === image.data[k]);
    const expected = new Uint8Array(await (await s.devFrame(d.id, 0)).arrayBuffer());
    const actual = new Uint8Array(await jpeg.arrayBuffer());
    const equal = expected.length === actual.length && expected.every((v, i) => v === actual[i]);
    renderer.dispose();
    let deleteBlocked = false;
    try { await s.deleteRoll(a); } catch { deleteBlocked = true; }
    return { a: a.id, b: b.id, d: d.id, pausedAt, done: d.done, equal, haloParity, deleteBlocked, sourceExists: !!await s.rollPhoto(a, 0) };
  });
  assert.equal(fixture.pausedAt, 1); assert.equal(fixture.done, 2);
  assert.equal(fixture.haloParity, true, 'Opening the editor retains the pre-development halo amount');
  assert.equal(fixture.equal, true, 'Preview renderer and batch renderer must produce identical JPEGs at the same resolution');
  assert.equal(fixture.deleteBlocked && fixture.sourceExists, true);
  console.log('PASS: resume, preview/batch parity, atomic protection of source photos');
  await page.reload();
  await page.click(`[data-roll-more="${fixture.a}"]`);
  assert.equal(await page.locator('[data-confirm-roll]').isDisabled(), true);
  await page.click('.action-sheet [data-close-sheet]');
  await shot('library');
  await page.click(`[data-pick="${fixture.a}"]`); await page.click(`[data-pick="${fixture.b}"]`);
  await page.click('[data-mix]'); await waitPreview();
  assert.equal(await page.locator('.panel-primary [data-k="leaks"]').count(), 1);
  assert.equal(await page.locator('[data-k="leaks"]').getAttribute('aria-valuenow'), '0');
  assert.equal(await page.locator('.panel-primary [data-k="halo"]').count(), 1);
  await page.locator('[data-k="halo"]').focus(); await page.keyboard.press('ArrowRight');
  const haloSetting = await page.evaluate(() => JSON.parse(localStorage.getItem('multik-mix-v6')).values.halo);
  assert.ok(haloSetting > 5);
  await pinch('.ssample');
  assert.ok(Number(await page.locator('.ssample').getAttribute('data-zoom')) > 2);
  await pinch('.ssample', 75, 25);
  await shot('mix');
  await page.click('[data-layout="setup"]');
  await page.selectOption('[data-layout-place="white"]', 'hidden');
  await page.click('[data-layout-done]');
  assert.equal(await page.locator('[data-k="white"]').count(), 0);
  // Configuration remains separate from the processing parameters.
  const settingsBefore = await page.evaluate(() => localStorage.getItem('multik-mix-v6'));
  await page.click('[data-layout="setup"]'); await page.click('[data-layout-reset]'); await page.click('[data-layout-done]');
  assert.equal(await page.evaluate(() => localStorage.getItem('multik-mix-v6')), settingsBefore);
  await page.click('[data-home]'); await page.click('[data-tab="devs"]'); await page.click(`[data-open-dev="${fixture.d}"]`);
  await page.waitForSelector('#viewer img');
  const initialFrame = await page.locator('#viewer img').getAttribute('alt');
  await pinch('#viewer');
  assert.ok(Number(await page.locator('#viewer').getAttribute('data-zoom')) > 2);
  const r = await page.locator('#viewer').boundingBox();
  const x = r.x+r.width/2, y=r.y+r.height/2;
  const beforePan = await page.locator('.viewer-photo').getAttribute('style');
  await sendTouch('touchStart', [[x,y]]); await sendTouch('touchMove', [[x+60,y+20]]); await sendTouch('touchEnd', []);
  assert.notEqual(await page.locator('.viewer-photo').getAttribute('style'), beforePan);
  assert.equal(await page.locator('#viewer img').getAttribute('alt'), initialFrame);
  await shot('viewer-zoomed');
  await pinch('#viewer', 75, 25);
  assert.ok(Number(await page.locator('#viewer').getAttribute('data-zoom')) < 1.05);
  await sendTouch('touchStart', [[x,y]]); await sendTouch('touchMove', [[x-90,y]]); await sendTouch('touchEnd', []);
  await page.waitForFunction(() => document.querySelector('#viewer img')?.alt === 'Frame 2');
  await page.click('[data-view="0"]');
  console.log('PASS: native two-finger zoom, one-finger pan, no accidental frame changes, swipe after zoom reset');
  const snapshot = () => page.evaluate(async id => {
    const s = await import('/src/app/store.ts'), d = await s.getDev(id);
    return { edits: d.edits ?? {}, bytes: await Promise.all([0,1].map(async i => Array.from(new Uint8Array(await (await s.devFrame(id,i)).arrayBuffer())))) };
  }, fixture.d);
  async function slowDrag(dx, dy = 0, cancelWithPinch = false) {
    const r = await page.locator('#viewer img').boundingBox(), x = r.x+r.width/2, y=r.y+r.height/2;
    await sendTouch('touchStart', [[x,y]]);
    await page.waitForTimeout(180);
    for(let i=1;i<=5;i++) { await sendTouch('touchMove', [[x+dx*i/5,y+dy*i/5]]); await page.waitForTimeout(45); }
    if(cancelWithPinch) await sendTouch('touchStart', [[x+dx,y+dy],[x+dx+30,y+dy]]);
    await sendTouch('touchEnd', []);
    await page.waitForFunction(() => !document.querySelector('#viewer.adjusting'));
    await page.waitForFunction(() => { const img=document.querySelector('#viewer img'); return img?.complete && img.naturalWidth > 0; });
  }
  const unshifted = await snapshot();
  await page.evaluate(id => {
    window.frameWrites = 0;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if(this.name === 'frames' && key === `${id}:0`) window.frameWrites++;
      return put.call(this,value,key);
    };
  }, fixture.d);
  const assertUnsaved = async () => {
    assert.deepEqual(await snapshot(), unshifted, 'Lifting the finger must not persist a frame');
    assert.equal(await page.evaluate(() => window.frameWrites), 0);
  };
  const previewReady = () => page.waitForFunction(() => { const c=document.querySelector('.viewer-live'); return c && !c.hidden && c.width > 1; });
  const swipeNext = async (expectSuccess = true) => {
    const r=await page.locator('#viewer').boundingBox(), x=r.x+r.width/2,y=r.y+r.height/2;
    await sendTouch('touchStart',[[x,y]]); await sendTouch('touchMove',[[x-100,y]]); await sendTouch('touchEnd',[]);
    if(expectSuccess) await page.waitForFunction(() => document.querySelector('#viewer img')?.alt === 'Frame 2');
  };
  assert.equal(await page.locator('[data-viewer-layer="top"]').getAttribute('aria-pressed'), 'true');
  const size = await page.locator('#viewer img').boundingBox();
  await slowDrag(30); await previewReady(); await assertUnsaved();
  assert.equal(await page.locator('[data-drag-hint]').textContent(), 'Drag to move');
  await slowDrag(20); await assertUnsaved();
  await page.click('[data-viewer-layer="bottom"]');
  await slowDrag(35); await assertUnsaved();
  // Undo remains a draft operation and restores only the last movement.
  await page.click('[data-viewer-undo]'); await assertUnsaved();
  await slowDrag(35); await assertUnsaved();
  await slowDrag(25, 0, true);
  await assertUnsaved();
  await pinch('#viewer');
  assert.ok(Number(await page.locator('#viewer').getAttribute('data-zoom')) > 2);
  assert.equal(await page.locator('.viewer-photo .viewer-live').count(), 1, 'Zoom includes the draft preview');
  await pinch('#viewer',75,25); await assertUnsaved();
  // Opening a menu must retain the movable session without saving.
  await page.click('[data-dev-more]'); await page.click('.action-sheet [data-close-sheet]');
  await previewReady(); await assertUnsaved();
  await page.evaluate(async () => {
    const {FrameRenderer}=await import('/src/app/develop.ts');
    window.savedRendererOpen=FrameRenderer.open;
    FrameRenderer.open=async () => {throw Error('Test save failure');};
  });
  await swipeNext(false); await page.waitForSelector('#app-error');
  assert.equal(await page.locator('#viewer img').getAttribute('alt'), 'Frame 1');
  await assertUnsaved();
  await page.evaluate(async () => { const {FrameRenderer}=await import('/src/app/develop.ts'); FrameRenderer.open=window.savedRendererOpen; });
  await page.click('#app-error');
  await swipeNext();
  const shifted = await snapshot();
  assert.ok(Math.abs(shifted.edits[0].mix.shiftMm - (-12 + 50/size.width*36)) < 0.05, 'Successive Top drags accumulate');
  assert.ok(Math.abs(shifted.edits[0].mix.bottomShiftMm - 35/size.width*36) < 0.05, 'Bottom shift and undo preserve Top');
  assert.deepEqual(shifted.bytes[1], unshifted.bytes[1]);
  assert.equal(shifted.edits[1], undefined);
  assert.notDeepEqual(shifted.bytes[0], unshifted.bytes[0]);
  assert.equal(await page.evaluate(() => window.frameWrites), 1, 'A swipe saves the accumulated frame exactly once');
  await page.reload(); await page.click('[data-tab="devs"]'); await page.click(`[data-open-dev="${fixture.d}"]`);
  assert.deepEqual(await snapshot(), shifted, 'The committed draft survives reload');
  await page.click('[data-viewer-layer="top"]');
  await page.click('[data-rotate-frame]');
  await page.waitForFunction(() => { const img=document.querySelector('#viewer img'); return img?.complete && img.naturalWidth < img.naturalHeight; });
  await slowDrag(0, 35);
  assert.deepEqual((await snapshot()).edits, shifted.edits, 'Rotated dragging also waits for navigation');
  // Filmstrip selection commits just like a swipe.
  await page.click('[data-view="1"]'); await page.waitForFunction(() => document.querySelector('#viewer img')?.alt === 'Frame 2');
  const shiftedRotated = await snapshot();
  assert.ok(shiftedRotated.edits[0].mix.shiftMm > shifted.edits[0].mix.shiftMm);
  assert.equal(shiftedRotated.edits[0].mix.bottomShiftMm, shifted.edits[0].mix.bottomShiftMm);
  await page.click('[data-view="0"]');
  await page.waitForFunction(() => { const img=document.querySelector('#viewer img'); return img?.alt === 'Frame 1' && img.complete && img.naturalWidth < img.naturalHeight; });
  await slowDrag(0, 20);
  await page.click('[data-back-devs]'); await page.waitForSelector('[data-open-dev]');
  assert.ok((await snapshot()).edits[0].mix.shiftMm > shiftedRotated.edits[0].mix.shiftMm, 'Leaving the viewer preserves pending changes');
  await page.evaluate(async id => {
    const s=await import('/src/app/store.ts'); await s.resetEditedFrame(await s.getDev(id),0);
    for(let i=0;i<3;i++) await s.rotateFrame(id,0);
  }, fixture.d);
  await page.reload(); await page.click('[data-tab="devs"]'); await page.click(`[data-open-dev="${fixture.d}"]`);
  assert.deepEqual(await snapshot(), unshifted);
  console.log('PASS: repeated drags stay unsaved, draft undo/pinch/menu/zoom, one commit on swipe, per-frame isolation, rotated navigation and exit');
  const beforeRotation = await page.evaluate(async id => {
    const s = await import('/src/app/store.ts');
    return Array.from(new Uint8Array(await (await s.devFrame(id, 0)).arrayBuffer()));
  }, fixture.d);
  for (let turn = 1; turn <= 4; turn++) {
    await page.click('[data-rotate-frame]');
    await page.waitForFunction(({ id, turn }) => import('/src/app/store.ts').then(async s =>
      s.frameTurns(await s.getDev(id), 0) === turn % 4), { id: fixture.d, turn });
    await page.waitForFunction(() => { const img=document.querySelector('#viewer img'); return img?.complete && img.naturalWidth > 0; });
    if (turn === 1) {
      const dims = await page.evaluate(async id => {
        const s = await import('/src/app/store.ts'), d = await s.getDev(id);
        const bmp = await createImageBitmap(await s.exportFrame(d, 0));
        const size = [bmp.width, bmp.height]; bmp.close(); return size;
      }, fixture.d);
      assert.ok(dims[0] < dims[1], 'Export rotates with the whole composition');
    }
  }
  const afterRotation = await page.evaluate(async id => {
    const s = await import('/src/app/store.ts');
    return Array.from(new Uint8Array(await (await s.devFrame(id, 0)).arrayBuffer()));
  }, fixture.d);
  assert.deepEqual(afterRotation, beforeRotation, 'Four rotations must not re-encode the stored image');
  await page.click('[data-rotate-frame]');
  await page.waitForFunction(() => { const img=document.querySelector('#viewer img'); return img?.complete && img.naturalWidth < img.naturalHeight; });
  await page.click('[data-edit]'); await waitPreview();
  assert.equal(await page.locator('[data-c="mix.grain"]').count(), 0);
  assert.equal(await page.locator('.panel-primary [data-c="mix.leaks"]').count(), 1);
  const topKnob = page.locator('[data-c="mix.shift"]');
  const bottomKnob = page.locator('[data-c="mix.bottomShift"]');
  assert.ok((await topKnob.boundingBox()).x < (await bottomKnob.boundingBox()).x);
  const topBefore = await topKnob.getAttribute('aria-valuenow');
  await bottomKnob.focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await topKnob.getAttribute('aria-valuenow'), topBefore);
  const bottomAfter = await bottomKnob.getAttribute('aria-valuenow');
  await topKnob.focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await bottomKnob.getAttribute('aria-valuenow'), bottomAfter);
  await page.click('[data-ed="glow"]');
  assert.equal(await page.locator('[data-ed="glow-mode"][data-arg="wand"]').getAttribute('aria-checked'), 'true');
  const cv = await page.locator('#edit-canvas').boundingBox();
  assert.ok(cv.height > cv.width, 'The editor retains portrait orientation');
  await page.mouse.click(cv.x + cv.width * 0.3, cv.y + cv.height * 0.4);
  await page.waitForSelector('.gdot');
  const mark = await page.locator('.gdot').boundingBox();
  assert.ok(Math.abs(mark.x + mark.width / 2 - (cv.x + cv.width * 0.3)) < 2);
  assert.ok(Math.abs(mark.y + mark.height / 2 - (cv.y + cv.height * 0.4)) < 2);
  await page.locator('[data-c="glow.strength"]').focus(); await page.keyboard.press('ArrowRight');
  await pinch('.epreview');
  assert.ok(Number(await page.locator('.epreview').getAttribute('data-zoom')) > 2);
  assert.equal(await page.locator('.gdot').count(), 1, 'Pinching must not add a halo');
  await pinch('.epreview', 75, 25);
  assert.equal(await page.locator('.gdot').count(), 1);
  await shot('contour-halo-rotated');
  await page.click('[data-ed="glow-exit"]');
  await shot('editor-rotated');
  console.log('PASS: whole-frame rotation/export, unchanged source bytes, independent layer shifts and rotated halo hit testing');
  await page.click('[data-ed="channel"][data-arg="mix"]'); await waitPreview(); await shot('editor-mix');
  await page.click('[data-layout="edit.mix"]');
  await shot('customize');
  await page.selectOption('[data-layout-place="mix.dust"]', 'hidden');
  await page.selectOption('[data-layout-place="mix.whites"]', 'more');
  await page.click('[data-layout-move="mix.balance"][data-dir="-1"]');
  await page.click('[data-layout-done]');
  assert.equal(await page.locator('[data-c="mix.dust"]').count(), 0);
  await shot('editor-personal');
  await page.click('[data-ed="channel"][data-arg="bottom"]');
  await page.locator('[data-c="bottom.light"] [role="slider"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.click('[data-ed="done"]');
  await page.waitForSelector('[data-edit]', { timeout: 30000 });
  const edited = await page.evaluate(async (id) => (await (await import('/src/app/store.ts')).getDev(id)).edits?.[0]?.bottom.light, fixture.d);
  assert.ok(edited > 0);
  const savedTools = await page.evaluate(async id => {
    const d = await (await import('/src/app/store.ts')).getDev(id);
    return { edit: d.edits[0], turns: d.frameTurns[0] };
  }, fixture.d);
  assert.equal(savedTools.turns, 1);
  assert.notEqual(savedTools.edit.mix.bottomShiftMm, 0);
  assert.equal(savedTools.edit.glows[0].kind, 'wand');
  assert.ok(Math.abs(savedTools.edit.glows[0].x - 0.4 * 36) < 0.1);
  assert.ok(Math.abs(savedTools.edit.glows[0].y - 0.7 * 27) < 0.1);
  assert.ok(savedTools.edit.glows[0].strength > 1.2);
  await page.reload(); await page.click('[data-tab="devs"]'); await page.click(`[data-open-dev="${fixture.d}"]`); await page.click('[data-edit]');
  await page.waitForSelector('[data-ed="channel"]'); await page.click('[data-ed="channel"][data-arg="mix"]');
  assert.equal(await page.locator('[data-c="mix.dust"]').count(), 0);
  assert.equal(await page.locator('.panel-secondary [data-c="mix.whites"]').count(), 1);
  console.log('PASS: per-screen layout persists across reloads and does not change saved image settings');
  // Every row can be reached by scrolling; the fixed footer does not cover its track.
  for (const size of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(size);
    const details = page.locator('.panel-more');
    if (!(await details.getAttribute('open') !== null)) await details.locator('summary').click();
    const last = page.locator('.editor-tools .htrack').last();
    await last.scrollIntoViewIfNeeded();
    const bounds = await last.boundingBox();
    const footer = await page.locator('.mactions').boundingBox();
    assert.ok(bounds.width > 120, 'Track must retain usable width');
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= footer.y + 1, 'Last slider must remain accessible above footer');
    await shot(`editor-${size.width}`);
  }
  console.log('PASS: compact portrait and landscape layouts keep all controls reachable');
  assert.deepEqual(errors, []);

  // Serve the real production build under a subpath to exercise a fresh PWA install.
  server = httpServer(async (req, res) => {
    const path = new URL(req.url, 'http://local').pathname;
    if (!path.startsWith('/multik/')) { res.writeHead(404).end(); return; }
    const relative = path.slice('/multik/'.length) + (path.endsWith('/') ? 'index.html' : '');
    try {
      const body = await readFile(resolve('dist', relative));
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': mime[extname(relative)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const production = `http://127.0.0.1:${server.address().port}/multik/`;
  const offlineContext = await browser.newContext();
  const offlinePage = await offlineContext.newPage();
  const offlineErrors = []; offlinePage.on('pageerror', (e) => offlineErrors.push(e.message));
  await offlinePage.goto(production);
  await offlinePage.evaluate(() => navigator.serviceWorker.ready);
  await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller);
  await offlineContext.setOffline(true);
  await offlinePage.reload(); await offlinePage.waitForSelector('[data-new]');
  await offlinePage.goto(production + 'lab/'); await offlinePage.waitForSelector('#develop');
  const missing = await offlinePage.evaluate(async () => { try { const response = await fetch('./missing-script.js'); return response.ok; } catch { return false; } });
  assert.equal(missing, false);
  assert.deepEqual(offlineErrors, []);
  await offlineContext.close();
  console.log('PASS: first-install offline reload, previously unvisited Lab, subpath hosting, missing asset is not HTML');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
  await vite.close();
  if (server) await new Promise((r) => server.close(r));
}
