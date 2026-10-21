import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('dist-combined');let release='A',auth='ok';
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://local').pathname;
 const html=text=>res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(text);
 if(path==='/login')return html('<h1>Sign in</h1>');
 if(path==='/lighttable/harness.html')return html('<h1>Harness</h1>');
 if(auth==='redirect'&&path.startsWith('/lighttable/')&&!['/lighttable/sw.js','/lighttable/recover.html'].includes(path))return res.writeHead(302,{Location:'/login'}).end();
 if(auth==='html-js'&&path.startsWith('/lighttable/assets/')&&path.endsWith('.js'))return html('<h1>Sign in</h1>');
 if(path.endsWith('/index.html'))return res.writeHead(308,{Location:path.slice(0,-10)}).end();
 const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+'/'))return res.writeHead(400).end();
 try{let data=await readFile(file);if(path==='/lighttable/sw.js'&&release==='B')data=Buffer.from(data.toString().replace(/const VERSION = '([^']+)'/,"const VERSION = '$1-B'"));res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(base+'/');await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL===location.origin+'/sw.js');
 const rootCaches=await page.evaluate(async()=>Object.fromEntries(await Promise.all((await caches.keys()).map(async name=>[name,(await(await caches.open(name)).keys()).map(r=>r.url)]))));
 await page.goto(base+'/lighttable/index.html');await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL===location.origin+'/lighttable/sw.js');await page.waitForFunction(()=>document.querySelector('[data-pwa-state]').textContent.includes('Available offline'));await page.click('[data-close-library]');
 const installed=await page.evaluate(async()=>{
  const registration=await navigator.serviceWorker.getRegistration('/lighttable/'),manifest=await(await fetch('/lighttable/manifest.webmanifest')).json(),names=(await caches.keys()).filter(n=>n.startsWith('multik-lighttable:'));
  const flags=[];for(const name of names){const cache=await caches.open(name);for(const request of await cache.keys())flags.push((await cache.match(request)).redirected);}
  return {scope:registration.scope,manifest,flags};
 });assert.equal(installed.scope,base+'/lighttable/');assert.equal(installed.manifest.id,'/lighttable/');assert.equal(installed.manifest.scope,'/lighttable/');assert.ok(installed.flags.length>=6);assert.ok(installed.flags.every(f=>!f));
 console.log('PASS: Classic worker → isolated Lighttable scope, canonical redirects, complete safe cache and standalone manifest');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#304237';x.fillRect(0,0,400,300);x.fillStyle='#fff';x.fillRect(130,100,50,50);return c.toDataURL('image/png').split(',')[1];});
 await page.click('[data-action="library"]');await page.click('[data-new-roll]');await page.selectOption('[data-capacity]','6');await page.setInputFiles('[data-roll-files]',Array.from({length:6},(_,i)=>({name:`frame-${i}.png`,mimeType:'image/png',buffer:Buffer.from(png,'base64')})));await page.click('[data-save-roll]');await page.waitForFunction(()=>!document.querySelector('.roll-import-dialog').open);await page.click('[data-start-mix]');await page.waitForFunction(()=>!document.querySelector('.library-dialog').open);
 const cdp=await context.newCDPSession(page),send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});
 async function drag(){await page.click('[data-action="browse"]');await page.click('[data-layer="b"]');const r=await page.locator('canvas').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;await send('touchStart',[[x,y]]);await send('touchMove',[[x+25,y+15]]);await send('touchEnd',[]);}
 const records=()=>page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('multik-lighttable',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});try{return await new Promise((resolve,reject)=>{const r=db.transaction('compositions').objectStore('compositions').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=reject;});}finally{db.close();}});
 await drag();await page.click('[data-rail="a"] [data-index="1"]');await page.click('[data-rail="a"] [data-index="0"]');const saved=await records();
 await context.setOffline(true);await page.reload();await page.waitForSelector('[data-rail="a"] button');assert.deepEqual(await records(),saved);await page.goto(base+'/');await page.waitForSelector('[data-new]');await page.goto(base+'/lighttable/');await page.waitForSelector('[data-rail="a"] button');await context.setOffline(false);
 console.log('PASS: offline Classic and Lighttable reloads; imported originals and committed pair edits survive independently');
 await drag();const beforeUpdate=await records();await page.evaluate(()=>window.__noReload=42);release='B';await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration('/lighttable/')).update();});await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration('/lighttable/')).waiting);
 assert.equal(await page.evaluate(()=>window.__noReload),42);assert.deepEqual(await records(),beforeUpdate);
 const gestureRect=await page.locator('canvas').boundingBox(),gx=gestureRect.x+gestureRect.width/2,gy=gestureRect.y+gestureRect.height/2;
 await send('touchStart',[[gx,gy]]);await send('touchMove',[[gx+10,gy+10]]);await page.evaluate(()=>document.querySelector('.info-dialog').showModal());assert.equal(await page.locator('[data-pwa-update]').isDisabled(),true);await page.evaluate(()=>document.querySelector('.info-dialog').close());await send('touchEnd',[]);
 assert.equal((await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration('/lighttable/')).waiting)),true);
 await page.click('[data-action="export"]');await page.evaluate(()=>document.querySelector('.info-dialog').showModal());assert.equal(await page.locator('[data-pwa-update]').isDisabled(),true);await page.evaluate(()=>document.querySelector('.info-dialog').close());await page.click('[data-close-export]');
 // The editor checkpoint blocks update even without dirty metadata.
 await page.click('[data-action="pro"]');await page.evaluate(()=>document.querySelector('.info-dialog').showModal());assert.equal(await page.locator('[data-pwa-update]').isDisabled(),true);await page.evaluate(()=>document.querySelector('.info-dialog').close());await page.click('[data-edit-done]');
 // An open import/library boundary blocks applying the update.
 await page.click('[data-action="library"]');await page.evaluate(()=>document.querySelector('.info-dialog').showModal());assert.equal(await page.locator('[data-pwa-update]').isDisabled(),true);await page.evaluate(()=>document.querySelector('.info-dialog').close());await page.click('[data-close-library]');
 await drag();await page.click('[data-action="info"]');await page.waitForFunction(()=>!document.querySelector('[data-pwa-update]').disabled);const committedBefore=await records();await page.click('[data-pwa-update]');await page.waitForFunction(()=>window.__noReload===undefined&&document.querySelector('[data-rail="a"] button'));const updated=await records();assert.equal(updated.reduce((n,c)=>n+c.revision,0),committedBefore.reduce((n,c)=>n+c.revision,0)+1);assert.equal(updated.filter(c=>c.revision!==(committedBefore.find(old=>old.id===c.id)?.revision??0)).length,1);
 const rootCachesAfter=await page.evaluate(async()=>Object.fromEntries(await Promise.all((await caches.keys()).filter(n=>n.startsWith('multik:')).map(async name=>[name,(await(await caches.open(name)).keys()).map(r=>r.url)]))));assert.deepEqual(rootCachesAfter,rootCaches);
 console.log('PASS: waiting update never reloads a dirty scene; setup boundary blocks activation; explicit update preserves committed data and Classic cache');
 await page.evaluate(async()=>{localStorage.setItem('pwa-sentinel','keep');await caches.open(`multik-lighttable:${location.origin}/sibling/:keep`);});const beforeRecovery=await records();await page.goto(base+'/lighttable/recover.html');await page.click('#repair');await page.waitForSelector('#open:not([hidden])');assert.equal(await page.evaluate(()=>localStorage.getItem('pwa-sentinel')),'keep');assert.deepEqual(await records(),beforeRecovery);
 const recovery=await page.evaluate(async()=>({scopes:(await navigator.serviceWorker.getRegistrations()).map(r=>r.scope).sort(),names:await caches.keys()}));assert.deepEqual(recovery.scopes,[base+'/',base+'/lighttable/']);assert.ok(recovery.names.includes(`multik-lighttable:${base}/sibling/:keep`));for(const name of Object.keys(rootCaches))assert.ok(recovery.names.includes(name));
 await page.goto(base+'/recover.html');await page.waitForSelector('#open:not([hidden])');
 await context.setOffline(true);await page.goto(base+'/lighttable/');await page.waitForSelector('[data-rail="a"] button');await context.setOffline(false);
 console.log('PASS: scoped recovery reinstalls only Lighttable offline files; both registrations, sibling cache, originals and edits survive');
 await page.evaluate(async()=>{for(const name of await caches.keys())if(name.startsWith(`multik-lighttable:${location.origin}/lighttable/:`))await caches.delete(name);});auth='redirect';await page.goto(base+'/lighttable/');assert.ok(page.url().endsWith('/login'));
 const count=await page.evaluate(async()=>{let count=0;for(const name of await caches.keys())if(name.startsWith(`multik-lighttable:${location.origin}/lighttable/:`))count+=(await(await caches.open(name)).keys()).length;return count;});assert.equal(count,0);
 for(const mode of ['redirect','html-js']){
  auth=mode;const denied=await browser.newContext(),test=await denied.newPage();await test.goto(base+'/lighttable/harness.html');const state=await test.evaluate(async()=>{const reg=await navigator.serviceWorker.register('/lighttable/sw.js',{scope:'/lighttable/'}),worker=reg.installing||reg.waiting||reg.active;return new Promise(resolve=>{function check(){if(['activated','redundant'].includes(worker.state))resolve(worker.state);}worker.addEventListener('statechange',check);check();});});assert.equal(state,'redundant');assert.equal(await test.evaluate(async()=>{let count=0;for(const name of await caches.keys())if(name.startsWith('multik-lighttable:'))count+=(await(await caches.open(name)).keys()).length;return count;}),0);await denied.close();
 }
 assert.deepEqual(errors,[]);await mkdir('lab-out/lighttable',{recursive:true});await writeFile('lab-out/lighttable/pwa-evidence.json',JSON.stringify({environment:'Chromium production artifact; iPhone Safari/PWA not hardware-verified',installed,recovery,rootCachePreserved:true,offlineOriginalsAndEdits:true,explicitUpdate:true,authPoisoningBlocked:true},null,2));
 console.log('PASS: expired sign-in navigation redirects cleanly; redirects and HTML disguised as JS cannot install/poison PWA; no page errors');
}finally{await browser.close();await new Promise(r=>server.close(r));}
