import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const vite=await createServer({server:{host:'127.0.0.1',port:5204,strictPort:true},logLevel:'error'});let browser;
try{
 await vite.listen();browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:874,height:402},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const state=()=>page.evaluate(()=>{const l=window.__lighttable;return {layers:structuredClone(l.session.draft.layers),commits:l.repo.counters.compositionCommits,tool:l.session.tool.kind,mode:l.editor.mode};});
 await page.goto('http://127.0.0.1:5204/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);await page.click('[data-close-library]');
 await page.evaluate(async()=>{const l=window.__lighttable,{demoSources}=await import('/src/lighttable/ui/fixtures.ts'),{Selection,importFiles}=await import('/src/lighttable/data/import.ts');const blobs=await demoSources(),s=new Selection();s.setCapacity(6);s.add(Array.from({length:6},(_,i)=>new File([blobs[i%2]],`${i}.png`,{type:'image/png'})));const roll=await importFiles(l.repo,s,'Levels landscape',()=>{});await l.navigation.open(await l.repo.createProject(roll.id,roll.id));await l.navigation.select('b',1);});
 await page.click('[data-rail=a] [aria-pressed=true]');await page.click('[data-mode=levels]');await settle();
 const before=await state();
 await page.evaluate(()=>{const l=window.__lighttable;window.__levelsIO={read:0,encode:0,write:0};const read=l.renderer.gl.readPixels.bind(l.renderer.gl),blob=HTMLCanvasElement.prototype.toBlob,put=IDBObjectStore.prototype.put;l.renderer.gl.readPixels=(...a)=>{window.__levelsIO.read++;return read(...a)};HTMLCanvasElement.prototype.toBlob=function(...a){window.__levelsIO.encode++;return blob.apply(this,a)};IDBObjectStore.prototype.put=function(...a){window.__levelsIO.write++;return put.apply(this,a)};window.__restoreLevelsIO=()=>{l.renderer.gl.readPixels=read;HTMLCanvasElement.prototype.toBlob=blob;IDBObjectStore.prototype.put=put};});
 for(const [point,delta] of [['black',-25],['mid',18],['white',30]]){
  const h=await page.locator(`[data-level=${point}]`).boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2,h.y+h.height/2+delta,{steps:6});await page.mouse.up();await settle();
  assert.equal(await page.locator('.levels-ruler').isVisible(),true);assert.equal((await state()).tool,'levels');
 }
 const edited=await state();assert.ok(edited.layers[0].levels.black>0);assert.ok(edited.layers[0].levels.white<1);assert.deepEqual(edited.layers[1],before.layers[1]);assert.deepEqual(edited.layers[0].transform,before.layers[0].transform);assert.equal(edited.commits,before.commits);
 assert.deepEqual(await page.evaluate(()=>window.__levelsIO),{read:0,encode:0,write:0});await page.evaluate(()=>window.__restoreLevelsIO());
 // A second finger must not resize the image while adjusting Levels.
 await page.evaluate(()=>{const l=window.__lighttable;window.__beforePinch=JSON.stringify(l.session.draft.layers);l.gestures.down(41,{x:80,y:120});l.gestures.down(42,{x:180,y:120});l.gestures.move(42,{x:300,y:150});l.gestures.up(41);l.gestures.up(42);});
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__lighttable.session.draft.layers)===window.__beforePinch),true);
 for(const mode of ['looks','layers','halo','levels']){await page.click(`[data-mode=${mode}]`);await settle();}
 assert.deepEqual((await state()).layers,edited.layers);assert.equal(await page.locator('.levels-ruler').isVisible(),true);
 await page.click('[data-rail=b] [aria-pressed=true]');assert.equal(await page.locator('[data-level=black]').getAttribute('aria-valuenow'),'0.0');
 await page.locator('[data-level=mid]').focus();await page.keyboard.press('ArrowUp');const both=await state();assert.deepEqual(both.layers[0],edited.layers[0]);assert.ok(both.layers[1].levels.mid>.5);assert.equal(both.commits,before.commits);
 await page.click('[data-rail=a] [data-index="2"]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.equal((await state()).tool,'levels');assert.equal((await state()).layers[0].levels,undefined);
 await page.click('[data-rail=a] [data-index="0"]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.deepEqual((await state()).layers,both.layers);
 await page.reload();await page.waitForFunction(()=>window.__lighttable?.navigation.project);await settle();assert.deepEqual((await state()).layers,both.layers);
 await page.click('[data-mode=levels]');assert.equal(await page.locator('.levels-ruler').isVisible(),true);assert.deepEqual(errors,[]);
 console.log('PASS: landscape Levels black/mid/white ruler stays active, zero I/O through finger lift, fixed transforms/pinch, independent layers, tool switches, pair navigation and reload persistence');
}finally{await browser?.close();await vite.close();}
