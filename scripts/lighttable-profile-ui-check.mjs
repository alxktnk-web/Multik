import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const out='lab-out/lighttable/profile-ui';await mkdir(out,{recursive:true});
const vite=await createServer({server:{host:'127.0.0.1',port:5194,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:402,height:874},hasTouch:true});page.setDefaultTimeout(30000);
const errors=[];page.on('pageerror',e=>errors.push(e.stack));
const state=()=>page.evaluate(()=>{const l=window.__lighttable;return {draft:structuredClone(l.session.draft),dirty:l.session.dirty,undo:l.session.canUndo,gesturing:l.session.gesturing,commits:l.repo.counters.compositionCommits,project:structuredClone(l.navigation.project)};});
const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const waitNav=()=>page.waitForFunction(()=>!window.__lighttable.navigation.busy&&window.__lighttable.renderer.ready);
const open=()=>page.click('[data-action="profile"]');
const choose=v=>page.click(`[data-profile-version="${v}"]`);
const apply=()=>page.click('[data-apply-profile]');
const cancel=()=>page.click('[data-cancel-profile]');
const pro=async()=>{if(!await page.locator('.pro-tools').isVisible())await page.click('[data-action="pro"]');};
const hashes=()=>page.evaluate(async()=>{const l=window.__lighttable,roll=await l.repo.roll(l.navigation.project.rollA);return Promise.all(roll.assetIds.map(async id=>{const a=await l.repo.asset(id);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await a.blob.arrayBuffer()))).join(',');}));});
try{
  await page.goto('http://127.0.0.1:5194/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);await page.click('[data-close-library]');
  await page.evaluate(async()=>{
    const l=window.__lighttable,{demoSources}=await import('/src/lighttable/ui/fixtures.ts'),{Selection,importFiles}=await import('/src/lighttable/data/import.ts');
    const blobs=await demoSources(),s=new Selection();s.setCapacity(6);s.add(Array.from({length:6},(_,i)=>new File([blobs[i%2]],`${i}.png`,{type:'image/png'})));
    const roll=await importFiles(l.repo,s,'Profile fixtures',()=>{});await l.navigation.open(await l.repo.createProject(roll.id,roll.id));await l.navigation.select('b',1);
  });
  const originals=await hashes();await pro();
  // Cancelling comparison restores an already dirty draft, including its prior undo.
  await page.evaluate(()=>{const s=window.__lighttable.session;s.begin();s.draft.effects.exposure=.3;s.end();});
  const before=await state();await open();await choose(3);await choose(4);
  assert.equal((await state()).draft.profile.version,4);assert.equal((await state()).commits,before.commits);
  assert.equal(await page.locator('[data-action="export"]').isDisabled(),true);
  assert.equal(await page.locator('[data-rail="a"] button').first().isDisabled(),true);
  const locked=await state();await page.evaluate(()=>document.querySelector('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));assert.deepEqual(await state(),locked);
  await cancel();assert.deepEqual(await state(),before);await page.click('[data-action="undo"]');assert.equal((await state()).draft.effects.exposure,0);
  await open();await choose(3);await choose(2);await apply();assert.equal((await state()).dirty,false);assert.equal((await state()).undo,false);
  await frame();const metrics=await page.evaluate(()=>{const l=window.__lighttable;window.__profileIO={read:0,encode:0,writes:0};const gl=l.renderer.gl,read=gl.readPixels.bind(gl),blob=HTMLCanvasElement.prototype.toBlob,put=IDBObjectStore.prototype.put;gl.readPixels=(...args)=>{window.__profileIO.read++;return read(...args);};HTMLCanvasElement.prototype.toBlob=function(...args){window.__profileIO.encode++;return blob.apply(this,args);};IDBObjectStore.prototype.put=function(...args){window.__profileIO.writes++;return put.apply(this,args);};window.__restoreProfileIO=()=>{gl.readPixels=read;HTMLCanvasElement.prototype.toBlob=blob;IDBObjectStore.prototype.put=put;};return {uploads:l.renderer.metrics.uploads,compilations:l.renderer.metrics.compilations,bytes:l.renderer.metrics.liveBytes};});
  await open();await choose(3);await frame();await choose(4);await frame();await apply();
  assert.deepEqual(await page.evaluate(()=>window.__profileIO),{read:0,encode:0,writes:0});
  assert.deepEqual(await page.evaluate(()=>{const r=window.__lighttable.renderer;return {uploads:r.metrics.uploads,compilations:r.metrics.compilations,bytes:r.metrics.liveBytes};}),metrics);
  await page.evaluate(()=>window.__restoreProfileIO());await page.click('[data-action="undo"]');assert.equal((await state()).draft.profile.version,2);assert.equal((await state()).undo,false);
  console.log('PASS: cancelled preview preserves prior draft/history; no-op adds no Undo; Apply is one Undo, no writes/readback/encode/upload/compile');

  await open();await choose(3);await apply();const dirty=await state();
  await page.evaluate(()=>{const repo=window.__lighttable.repo,commit=repo.commit.bind(repo);window.__restoreCommit=()=>repo.commit=commit;repo.commit=async()=>{throw new DOMException('Storage full','QuotaExceededError');};});
  await page.click('[data-rail="a"] [data-index="1"]');await waitNav();assert.deepEqual(await state(),dirty);
  await page.evaluate(()=>window.__restoreCommit());await page.click('[data-rail="a"] [data-index="1"]');await waitNav();assert.equal((await state()).draft.profile.version,2);
  await open();await choose(4);await apply();await page.click('[data-rail="a"] [data-index="0"]');await waitNav();assert.equal((await state()).draft.profile.version,3);
  await page.reload();await page.waitForFunction(()=>window.__lighttable?.navigation.project&&window.__lighttable.renderer.ready);assert.equal((await state()).draft.profile.version,3);
  await page.click('[data-rail="a"] [data-index="1"]');await waitNav();assert.equal((await state()).draft.profile.version,4);
  await page.click('[data-rail="a"] [data-index="0"]');await waitNav();assert.equal((await state()).draft.profile.version,3);
  console.log('PASS: failed metadata commit retains chosen profile and Undo; retry, per-pair independence and reload preserve explicit choices');

  await page.evaluate(()=>{const r=window.__lighttable.renderer,fn=r.exportImage.bind(r);window.__exportProfiles=[];r.exportImage=(snapshot,...args)=>{window.__exportProfiles.push(snapshot.profile.version);return fn(snapshot,...args);};});
  await page.click('[data-action="export"]');await page.waitForSelector('.export-ready:not([hidden])');const filmFile=await page.locator('[data-download-export]').getAttribute('href');await page.click('[data-close-export]');
  await pro();await open();await choose(4);await apply();
  await page.click('[data-action="import"]');await page.waitForFunction(()=>document.querySelector('.library-dialog').open&&!window.__lighttable.navigation.busy);assert.equal(await page.locator('.hero-result').count(),0);await page.click('[data-close-library]');
  await page.click('[data-action="export"]');await page.waitForSelector('.export-ready:not([hidden])');assert.notEqual(await page.locator('[data-download-export]').getAttribute('href'),filmFile);assert.deepEqual(await page.evaluate(()=>window.__exportProfiles),[3,4]);await page.click('[data-close-export]');
  await page.click('[data-action="import"]');await page.waitForSelector('.hero-result');await page.click('[data-close-library]');
  // Defensive cache guard: even an equal-revision snapshot with a different profile must regenerate.
  await page.evaluate(()=>{window.__lighttable.session.draft.profile.version=3;window.__lighttable.session.onChange();});
  await page.click('[data-action="export"]');await page.waitForSelector('.export-ready:not([hidden])');assert.deepEqual(await page.evaluate(()=>window.__exportProfiles),[3,4,3]);await page.click('[data-close-export]');
  await page.evaluate(()=>{window.__lighttable.session.draft.profile.version=4;window.__lighttable.session.onChange();});
  console.log('PASS: export uses selected snapshot, discards old ready JPEG on profile change, and rejects stale profile thumbnails');

  await pro();const saved=await state();await open();await choose(2);await page.keyboard.press('Escape');assert.deepEqual(await state(),saved);
  for(const viewport of [{width:375,height:667},{width:402,height:874},{width:874,height:402}]){
    await page.setViewportSize(viewport);await frame();await pro();
    const proRect=await page.locator('.pro-tools').boundingBox();assert.ok(proRect.x>=0&&proRect.x+proRect.width<=viewport.width,'Pro fits the viewport');
    await open();await choose(3);await frame();
    const geometry=await page.evaluate(()=>{const d=document.querySelector('.profile-dialog'),rect=d.getBoundingClientRect(),s=document.querySelector('.stage').getBoundingClientRect(),overlap=Math.max(0,Math.min(rect.right,s.right)-Math.max(rect.left,s.left))*Math.max(0,Math.min(rect.bottom,s.bottom)-Math.max(rect.top,s.top));return {buttons:[...d.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height};}),blur:getComputedStyle(d,'::backdrop').backdropFilter,covered:overlap/(s.width*s.height)};});
    await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}.png`});
    assert.equal(geometry.blur,'none');assert.ok(geometry.covered<.6,JSON.stringify({viewport,geometry}));
    for(const r of geometry.buttons)assert.ok(r.x>=0&&r.y>=0&&r.right<=viewport.width+1&&r.bottom<=viewport.height+1&&r.height>=44);
    await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}.png`});await cancel();
  }
  await open();await choose(2);await page.setViewportSize({width:402,height:874});await frame();assert.equal(await page.locator('.profile-dialog').isVisible(),false);assert.equal((await state()).draft.profile.version,4);
  await open();await choose(3);await page.evaluate(()=>{const e=window.__lighttable.renderer.gl.getExtension('WEBGL_lose_context');window.__restoreContext=()=>e.restoreContext();e.loseContext();});await page.waitForFunction(()=>window.__lighttable.renderer.gl.isContextLost());assert.equal(await page.locator('.profile-dialog').isVisible(),false);assert.equal((await state()).draft.profile.version,4);await page.evaluate(()=>window.__restoreContext());await waitNav();
  assert.deepEqual(await hashes(),originals);assert.deepEqual(errors,[]);
  await writeFile(`${out}/checks.json`,JSON.stringify({environment:'Chromium touch emulation / SwiftShader, not iPhone',profiles:[2,3,4],originalHashes:originals,errors,checks:['cancel/prior draft','one Undo/no-op','zero I/O on profile preview','commit failure/retry','per-pair/reload','JPEG profile cache','thumbnail invalidation','keyboard/Escape','portrait/landscape','resize/context loss cancellation']},null,2));
  console.log('PASS: compact portrait/landscape controls, keyboard cancellation, resize/context loss rollback, original hashes unchanged, no page errors');
}finally{await browser.close();await vite.close();}
