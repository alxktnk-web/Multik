// Verify the isolated PWA build before assembling it beside immutable Classic.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const root=resolve('dist-lighttable');
const files=await readdir(root,{recursive:true});
for(const path of files)assert.ok(path==='lighttable'||path.startsWith('lighttable/'),`Staging escaped its namespace: ${path}`);
assert.ok(files.includes('lighttable/sw.js')&&files.includes('lighttable/manifest.webmanifest'));
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;
  if(!path.startsWith('/lighttable/'))return res.writeHead(404).end();
  const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+'/'))return res.writeHead(400).end();
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/lighttable/`);
  await page.waitForFunction(()=>document.querySelector('.sources img')?.complete&&!document.querySelector('[data-action="rotate"]').disabled);
  await page.click('[data-close-library]');
  assert.equal(await page.evaluate(()=>typeof window.__lighttable),'undefined');
  await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/lighttable/sw.js'));
  assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),1);
  assert.deepEqual(await page.evaluate(async()=>(await indexedDB.databases()).map(db=>db.name)),['multik-lighttable']);
  await page.click('[data-action="rotate"]');await page.click('[data-action="pro"]');await page.click('[data-action="halo"]');
  assert.deepEqual(errors,[]);await page.screenshot({path:'lab-out/lighttable/production-smoke.png'});
  console.log('PASS: isolated production entry/assets, no dev hook, scoped PWA worker and no legacy DB; production GPU/UI smoke');
}finally{await browser.close();await new Promise(r=>server.close(r));}
