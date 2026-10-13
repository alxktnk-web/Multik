// Прогон лаборатории в headless Chromium: собранный dist → две пачки фото → кадры в lab-out/.
// node scripts/lab-shot.mjs --a a1.jpg,a2.jpg --b b1.jpg,b2.jpg [--seed 123] [--size 33] [--out lab-out] [--looks A,B,C]

import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []),
);
const filesA = args.a.split(',').map((f) => resolve(f));
const filesB = args.b.split(',').map((f) => resolve(f));
const out = resolve(args.out ?? 'lab-out');
mkdirSync(out, { recursive: true });

const dist = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const body = await readFile(join(dist, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await page.goto(`http://localhost:${port}/lab/`);
await page.setInputFiles('#passA', filesA);
await page.setInputFiles('#passB', filesB);
if (args.size) await page.selectOption('#size', args.size);
if (args.looks) {
  const want = args.looks.split(',');
  for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) await page.setChecked(`#looks input[value="${id}"]`, want.includes(id));
}
if (args.seed) await page.evaluate((s) => window.__setSeed?.(Number(s)), args.seed);
const t0 = Date.now();
await page.click('#develop');
await page.waitForFunction(() => document.getElementById('progress').hidden && !document.getElementById('develop').disabled, null, { timeout: 600_000 });
console.log(`development: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const err = await page.textContent('#error');
if (err && !(await page.isHidden('#error'))) console.error(err);
console.log(await page.textContent('.summary').catch(() => ''));

const shots = await page.$$eval('.variant img', async (imgs) =>
  Promise.all(
    imgs.map(async (img) => {
      const blob = await (await fetch(img.src)).blob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { name: img.alt, data: btoa(bin) };
    }),
  ),
);
for (const s of shots) {
  const file = s.name.replace(/[^\p{L}\p{N}]+/gu, '_') + '.jpg';
  writeFileSync(join(out, file), Buffer.from(s.data, 'base64'));
}
console.log(`saved ${shots.length} frames to ${out}`);
await browser.close();
server.close();
