import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out='lab-out/lighttable/editor';await mkdir(out,{recursive:true});
const vite=await createServer({server:{host:'127.0.0.1',port:5195,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:402,height:874},hasTouch:true});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const state=()=>page.evaluate(()=>{const l=window.__lighttable;return {draft:structuredClone(l.session.draft),dirty:l.session.dirty,editing:l.session.editing,undo:l.session.canUndo,commits:l.repo.counters.compositionCommits};});
 await page.goto('http://127.0.0.1:5195/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);await page.click('[data-close-library]');
 await page.evaluate(async()=>{
   const l=window.__lighttable,{demoSources}=await import('/src/lighttable/ui/fixtures.ts'),{Selection,importFiles}=await import('/src/lighttable/data/import.ts');
   const blobs=await demoSources(),s=new Selection();s.setCapacity(6);s.add(Array.from({length:6},(_,i)=>new File([blobs[i%2]],`${i}.png`,{type:'image/png'})));
   const roll=await importFiles(l.repo,s,'Levels fixtures',()=>{});await l.navigation.open(await l.repo.createProject(roll.id,roll.id));await l.navigation.select('b',1);
 });
 await page.click('[data-action="pro"]');await frame();assert.equal((await state()).editing,true);
 await page.click('[data-layer="a"]');await page.click('[data-mode="levels"]');
 const before=await state();
 // Real pointer input on the ruler, no writes/readback/encoding/uploads/allocations.
 await page.evaluate(()=>{const l=window.__lighttable;window.__io={read:0,encode:0,write:0};const read=l.renderer.gl.readPixels.bind(l.renderer.gl),blob=HTMLCanvasElement.prototype.toBlob,put=IDBObjectStore.prototype.put;l.renderer.gl.readPixels=(...a)=>{window.__io.read++;return read(...a)};HTMLCanvasElement.prototype.toBlob=function(...a){window.__io.encode++;return blob.apply(this,a)};IDBObjectStore.prototype.put=function(...a){window.__io.write++;return put.apply(this,a)};window.__metrics={uploads:l.renderer.metrics.uploads,compilations:l.renderer.metrics.compilations,bytes:l.renderer.metrics.liveBytes};window.__restore=()=>{l.renderer.gl.readPixels=read;HTMLCanvasElement.prototype.toBlob=blob;IDBObjectStore.prototype.put=put};});
 let h=await page.locator('[data-level="black"]').boundingBox();await page.mouse.move(h.x+22,h.y+22);await page.mouse.down();await page.mouse.move(h.x+65,h.y+22,{steps:6});await page.mouse.up();await frame();
 const adjusted=await state();assert.ok(adjusted.draft.layers[0].levels.black>.1);assert.equal(adjusted.draft.layers[1].levels,undefined);assert.equal(adjusted.commits,before.commits);
 assert.deepEqual(await page.evaluate(()=>window.__io),{read:0,encode:0,write:0});assert.deepEqual(await page.evaluate(()=>{const r=window.__lighttable.renderer;return {uploads:r.metrics.uploads,compilations:r.metrics.compilations,bytes:r.metrics.liveBytes};}),await page.evaluate(()=>window.__metrics));await page.evaluate(()=>window.__restore());
 await page.click('[data-layer="b"]');assert.equal(await page.locator('[data-level="black"]').getAttribute('aria-valuenow'),'0.0');await page.click('[data-layer="a"]');assert.ok(Number(await page.locator('[data-level="black"]').getAttribute('aria-valuenow'))>10);
 await page.click('[data-action="undo"]');assert.deepEqual((await state()).draft,before.draft);assert.equal(await page.locator('[data-action="undo"]').isDisabled(),true);
 // Choose Clear in-place. Cancel restores complete entry snapshot, not just profile.
 await page.click('[data-mode="looks"]');await page.click('[data-profile-version="5"]');assert.equal((await state()).draft.profile.version,5);await page.click('[data-edit-cancel]');assert.equal(await page.locator('.discard-dialog').isVisible(),true);await page.click('[data-discard]');assert.equal((await state()).editing,false);assert.deepEqual((await state()).draft,before.draft);
 await page.click('[data-action="pro"]');await page.click('[data-mode="looks"]');await page.click('[data-profile-version="5"]');await page.click('[data-mode="levels"]');
 await page.locator('[data-level="black"]').focus();await page.keyboard.press('ArrowRight');
 const changed=await state();await page.evaluate(()=>{const r=window.__lighttable.repo;window.__commit=r.commit.bind(r);r.commit=async()=>{throw new DOMException('Test quota. Try Done again.','QuotaExceededError')};});
 await page.click('[data-edit-done]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.equal((await state()).editing,true);assert.deepEqual((await state()).draft,changed.draft);assert.equal((await state()).undo,true);
 await page.evaluate(()=>window.__lighttable.repo.commit=window.__commit);await page.click('[data-edit-done]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.equal((await state()).editing,false);assert.equal((await state()).commits,changed.commits+1);
 await page.reload();await page.waitForFunction(()=>window.__lighttable?.navigation.project);assert.equal((await state()).draft.profile.version,5);assert.ok((await state()).draft.layers[0].levels.black>0);
 // Each pair is independent; return restores both Levels and profile.
 await page.evaluate(()=>window.__lighttable.navigation.step(1));assert.equal((await state()).draft.profile.version,2);assert.equal((await state()).draft.layers[0].levels,undefined);await page.evaluate(()=>window.__lighttable.navigation.step(-1));assert.equal((await state()).draft.profile.version,5);
 await page.click('[data-action="pro"]');await page.click('[data-mode="levels"]');
 for(const [name,w,h] of [['portrait',402,874],['small',375,667],['landscape',874,402]]){
   await page.setViewportSize({width:w,height:h});await frame();await page.screenshot({path:`${out}/${name}.png`});
   const dimensions=await page.evaluate(()=>{const track=document.querySelector('.levels-track').getBoundingClientRect(),stage=document.querySelector('.stage').getBoundingClientRect();return {track:{x:track.x,y:track.y,w:track.width,h:track.height},stage:{w:stage.width,h:stage.height},overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(dimensions.overflow,false);assert.ok(dimensions.stage.h>180);assert.ok(dimensions.track.w>0&&dimensions.track.h>=44);
 }
 // Orientation preserves completed edits, cancels only in-progress input.
 const rotated=await state();await page.setViewportSize({width:402,height:874});await frame();assert.deepEqual((await state()).draft,rotated.draft);
 await page.click('[data-edit-cancel]');assert.equal((await state()).editing,false);
 // Export remains available in Edit and is a guarded save boundary.
 assert.equal(await page.locator('[data-action="browse"]').count(),0);
 assert.equal(await page.locator('.sources').isVisible(),false);
 await page.click('[data-action="pro"]');assert.equal(await page.locator('[data-mode="layers"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-action="export"]').isVisible(),true);
 await page.click('[data-mode="levels"]');await page.locator('[data-level="black"]').focus();await page.keyboard.press('ArrowRight');
 const exportDraft=await state();
 await page.evaluate(()=>{const r=window.__lighttable.repo;window.__commit=r.commit.bind(r);r.commit=async()=>{throw Error('Test save failure');};});
 await page.click('[data-action="export"]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);
 assert.equal((await state()).editing,true);assert.deepEqual((await state()).draft,exportDraft.draft);assert.equal(await page.locator('.export-dialog').isVisible(),false);
 await page.evaluate(()=>window.__lighttable.repo.commit=window.__commit);
 await page.click('[data-action="export"]');await page.locator('.export-dialog').waitFor({state:'visible'});assert.equal(await page.locator('.export-dialog').isVisible(),true);assert.equal((await state()).editing,false);assert.equal((await state()).commits,exportDraft.commits+1);
 await page.click('[data-close-export]');assert.equal(await page.locator('[data-action="export"]').isVisible(),true);
 assert.deepEqual(errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify({environment:'Chromium, not iPhone hardware',passed:['ruler hot path','source isolation','Undo','Cancel checkpoint','Clear selection','failed Done retry','Done one commit','reload','pair isolation','portrait/landscape layout','rotation','export visible in Edit','export commit failure and retry','explicit Move entry']},null,2));
 console.log('PASS: Levels editor real input, zero I/O hot path, Undo/Cancel, failed commit retry, persistence, pairs, layouts');
}finally{await browser.close();await vite.close();}
