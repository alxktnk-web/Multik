import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const output=resolve('lab-out/lighttable');await mkdir(output,{recursive:true});
const vite=await createServer({server:{host:'127.0.0.1',port:5182,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.stack));
await context.addInitScript(()=>{
  window.__compositionWrites={put:0,add:0};
  for(const method of ['put','add']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){if(this.transaction.db.name==='multik-lighttable'&&this.name==='compositions')window.__compositionWrites[method]++;return original.apply(this,args);};}
});
const state=()=>page.evaluate(()=>{const l=window.__lighttable;return {draft:l.session.draft,dirty:l.session.dirty,project:l.navigation.project,counters:l.repo.counters,busy:l.navigation.busy,active:l.session.activeLayer};});
const touch=await context.newCDPSession(page);const send=(type,points)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});
async function drag(dx,dy){await page.evaluate(()=>window.__lighttable.session.interaction='move');const r=await page.locator('canvas').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;await send('touchStart',[[x,y]]);for(let i=1;i<=3;i++)await send('touchMove',[[x+dx*i/3,y+dy*i/3]]);await send('touchEnd',[]);}
const waitNav=()=>page.waitForFunction(()=>!window.__lighttable.navigation.busy);
try{
  await page.goto('http://127.0.0.1:5182/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);
  await page.click('[data-close-library]');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#234';x.fillRect(0,0,400,300);x.fillStyle='#fff';x.fillRect(100,100,50,50);return c.toDataURL('image/png').split(',')[1];});
  const photo=i=>({name:`photo${i}.png`,mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.click('[data-action="import"]');await page.click('[data-new-roll]');await page.selectOption('[data-capacity]','6');
  await page.setInputFiles('[data-roll-files]',Array.from({length:7},(_,i)=>photo(i)));
  assert.equal(await page.locator('[data-save-roll]').isDisabled(),true);assert.ok((await page.locator('.import-count').innerText()).includes('7 / 6'));assert.equal(await page.locator('[data-roll-files]').isDisabled(),true);
  await page.screenshot({path:resolve(output,'import-overflow.png')});
  // Programmatic change cannot bypass the full-capacity guard.
  await page.evaluate(()=>{const input=document.querySelector('[data-roll-files]'),dt=new DataTransfer();dt.items.add(new File(['x'],'extra.png',{type:'image/png'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.locator('.candidate').count(),7);
  await page.locator('.candidate button').last().click();assert.equal(await page.locator('[data-save-roll]').isDisabled(),false);assert.ok((await page.locator('.import-count').innerText()).includes('6 / 6 ✓'));
  await page.screenshot({path:resolve(output,'import-full.png')});
  await page.fill('[data-roll-name]','Film A');await page.click('[data-save-roll]');await page.waitForFunction(()=>!document.querySelector('.roll-import-dialog').open);
  await page.click('[data-new-roll]');await page.selectOption('[data-capacity]','6');
  await page.setInputFiles('[data-roll-files]',[...Array.from({length:5},(_,i)=>photo(i)),{name:'bad.png',mimeType:'image/png',buffer:Buffer.from('broken')}]);
  await page.fill('[data-roll-name]','Film B');await page.click('[data-save-roll]');await page.waitForFunction(()=>document.querySelector('.import-message').textContent.includes('Could not open'));
  await page.screenshot({path:resolve(output,'import-error.png')});
  assert.equal(await page.locator('.candidate').count(),6);await page.locator('.candidate button').last().click();assert.equal(await page.locator('[data-roll-files]').isDisabled(),false);await page.setInputFiles('[data-roll-files]',photo(6));await page.click('[data-save-roll]');await page.waitForFunction(()=>!document.querySelector('.roll-import-dialog').open);
  await page.click('[data-start-mix]');await page.waitForFunction(()=>!!window.__lighttable.navigation.project&&!document.querySelector('.library-dialog').open);await waitNav();
  assert.equal(await page.locator('[data-rail="a"] button').count(),6);assert.equal(await page.locator('[data-rail="b"] button').count(),6);
  console.log('PASS: native 6-frame import enforces full/overflow including forged change; failed file can be removed/replaced without losing selection');
  await page.evaluate(()=>{window.__compositionWrites={put:0,add:0};});
  await drag(20,15);await drag(10,-5);assert.deepEqual(await page.evaluate(()=>window.__compositionWrites),{put:0,add:0});const edited=await state();assert.equal(edited.counters.compositionCommits,0);assert.equal(edited.dirty,true);
  const originalId=edited.draft.id;const savedLayer=edited.draft.layers[1].transform;
  await page.click('[data-rail="a"] [data-index="1"]');await waitNav();const next=await state();assert.equal(next.counters.compositionCommits,1);assert.equal(await page.evaluate(()=>window.__compositionWrites.put),1);assert.notEqual(next.draft.id,originalId);assert.deepEqual(next.draft.layers[1].transform,{xMm:0,yMm:0,turns:0});
  await page.click('[data-rail="a"] [data-index="0"]');await waitNav();assert.deepEqual((await state()).draft.layers[1].transform,savedLayer);assert.equal((await state()).counters.compositionCommits,1);
  await page.reload();await page.waitForFunction(()=>window.__lighttable?.navigation.project);assert.deepEqual((await state()).draft.layers[1].transform,savedLayer);
  console.log('PASS: zero commits on lift, exactly one metadata commit at pair navigation, independent pair offsets and reload restoration');
  // Failure aborts the transaction and must retain the current pair/draft.
  await page.click('[data-layer="b"]');await drag(12,8);const unsaved=await state();
  await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;window.__restoreTx=()=>{IDBDatabase.prototype.transaction=original;};IDBDatabase.prototype.transaction=function(names,mode,...rest){const tx=original.call(this,names,mode,...rest);if(this.name==='multik-lighttable'&&mode==='readwrite'&&Array.from(typeof names==='string'?[names]:names).includes('compositions'))queueMicrotask(()=>tx.abort());return tx;};});
  await page.click('[data-rail="a"] [data-index="2"]');await waitNav();assert.deepEqual((await state()).draft,unsaved.draft);assert.equal((await state()).dirty,true);assert.equal((await state()).project.a,0);
  await page.evaluate(()=>window.__restoreTx());await page.click('[data-rail="a"] [data-index="2"]');await waitNav();assert.equal((await state()).project.a,2);
  console.log('PASS: injected transaction abort prevents navigation and keeps draft; next tap retries successfully');
  // Delayed commits block repeat navigation rather than queueing multiple selections.
  await drag(6,6);
  const serial=await page.evaluate(async()=>{const l=window.__lighttable,original=l.repo.commit.bind(l.repo);let release;l.repo.commit=async(...args)=>{await new Promise(r=>release=r);return original(...args);};try{const first=l.navigation.select('a',3);await Promise.resolve();const second=await l.navigation.select('a',4);release();await first;return {second,a:l.navigation.project.a};}finally{l.repo.commit=original;}});assert.deepEqual(serial,{second:false,a:3});
  console.log('PASS: serialized navigation ignores a second target while the first metadata commit is pending');
  // A competing repository commit simulates the other tab; copy preserves both versions.
  await drag(7,3);
  const conflict=await page.evaluate(async()=>{const l=window.__lighttable;const {Repository}=await import('/src/lighttable/data/repository.ts');const other=new Repository(),base=await other.composition(l.session.draft.id);base.effects.halo=.9;await other.commit(base,base.revision);await other.close();return {id:l.session.draft.id,draft:structuredClone(l.session.draft)};});
  await page.click('[data-rail="b"] [data-index="1"]');await waitNav();assert.equal((await state()).draft.id,conflict.id);assert.equal((await state()).dirty,true);assert.equal(await page.locator('.conflict-copy').isVisible(),true);
  await page.click('.conflict-copy');await waitNav();assert.notEqual((await state()).draft.id,conflict.id);assert.deepEqual((await state()).draft.layers,conflict.draft.layers);assert.equal((await state()).dirty,false);
  const fork=await state();
  await page.click('[data-rail="b"] [data-index="1"]');await waitNav();
  await page.click(`[data-rail="b"] [data-index="${fork.project.b}"]`);await waitNav();
  assert.deepEqual((await state()).draft.layers,fork.draft.layers,'Uncommitted-revision fork must retain its transforms on revisit');
  console.log('PASS: stale tab cannot overwrite committed revision; explicit copy retains the draft in a separate session');
  // Native rail scroll only scrolls; choosing selected thumbnail only changes active layer.
  const before=(await state()).project;await page.locator('[data-rail="a"]').evaluate(rail=>{rail.scrollLeft=120;rail.dispatchEvent(new Event('scroll'));});assert.deepEqual((await state()).project,before);
  const oldCommits=(await state()).counters.compositionCommits;await page.click(`[data-rail="a"] [data-index="${before.a}"]`);assert.equal((await state()).active,'a');assert.equal((await state()).counters.compositionCommits,oldCommits);
  await page.screenshot({path:resolve(output,'rolls-portrait.png')});
  await page.click('.rail-handle');assert.equal(await page.locator('.film-tray').isVisible(),false);await page.click('.rail-handle');assert.equal(await page.locator('.film-tray').isVisible(),true);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);
  const positions=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom};};return {a:rect('.rail-a'),b:rect('.rail-b'),image:rect('.stage')};});assert.ok(positions.a.right<=positions.image.x+1);assert.ok(positions.b.x>=positions.image.right-1);assert.deepEqual((await state()).project,before);
  await page.screenshot({path:resolve(output,'rolls-landscape.png')});await page.click('.rail-handle');assert.equal(await page.locator('.rail-a').isVisible(),false);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.equal(await page.locator('.rail-a').isVisible(),true);
  console.log('PASS: independent scroll/selection, collapsible rails, A/center/B landscape and orientation-specific visibility');
  assert.deepEqual(errors,[]);console.log('PASS: workspace integration has no page errors');
}finally{await browser.close();await vite.close();}
