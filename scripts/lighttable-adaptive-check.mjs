import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out='lab-out/lighttable/adaptive';await mkdir(out,{recursive:true});
const vite=await createServer({server:{host:'127.0.0.1',port:5194,strictPort:true},logLevel:'error'});let browser;
try{
 await vite.listen();browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:402,height:874},hasTouch:true});page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 const settled=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const idle=()=>page.waitForFunction(()=>window.__lighttable?.renderer.ready&&!window.__lighttable.navigation.busy);
 const state=()=>page.evaluate(()=>{const l=window.__lighttable;return {draft:structuredClone(l.session.draft),dirty:l.session.dirty,editing:l.session.editing,undo:l.session.canUndo,commits:l.repo.counters.compositionCommits,assets:l.repo.counters.assetsWritten,project:l.navigation.project};});
 await page.goto('http://127.0.0.1:5194/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);await page.click('[data-close-library]');
 await page.evaluate(async()=>{
   const l=window.__lighttable,{demoSources}=await import('/src/lighttable/ui/fixtures.ts'),{Selection,importFiles}=await import('/src/lighttable/data/import.ts');
   const blobs=await demoSources(),rolls=[];
   for(let side=0;side<2;side++){const s=new Selection();s.setCapacity(6);s.add(Array.from({length:6},(_,i)=>new File([blobs[(i+side)%2]],`${side}-${i}.png`,{type:'image/png'})));rolls.push(await importFiles(l.repo,s,`Adaptive ${side}`,()=>{}));}
   await l.navigation.open(await l.repo.createProject(rolls[0].id,rolls[1].id));window.__originalProject=structuredClone(l.navigation.project);window.__originalCompositionId=l.session.draft.id;
 });await idle();
 await page.click('[data-action="library"]');await page.waitForFunction(()=>{const image=document.querySelector('.mix-card img');return image?.complete&&image.naturalWidth>=480;});
 const cover=await page.evaluate(async()=>{const image=document.querySelector('.mix-card img'),blob=await (await fetch(image.src)).blob(),c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let low=255,high=0;for(let i=0;i<data.length;i+=4){low=Math.min(low,data[i]);high=Math.max(high,data[i]);}const l=window.__lighttable,a=await l.repo.asset(l.navigation.sources[0].id);return {width:image.naturalWidth,height:image.naturalHeight,range:high-low,distinct:blob.size!==a.thumb.size};});
 assert.ok(cover.width>=480&&cover.height>=480&&cover.range>30&&cover.distinct,JSON.stringify(cover));await page.screenshot({path:`${out}/mixes-portrait.png`});
 await page.click('.mix-card');await idle();
 const beforeLike=await state();await page.click('[data-action="favorite"]');await idle();await page.waitForFunction(async()=> (await window.__lighttable.repo.listFavorites()).length===1);
 assert.equal((await state()).assets,beforeLike.assets);assert.equal(await page.locator('[data-action="favorite"]').getAttribute('aria-pressed'),'true');
 await page.click('[data-action="library"]');await page.click('[data-home-tab="favorites"]');await page.locator('.mix-card[data-favorite]').waitFor();await page.screenshot({path:`${out}/library-portrait.png`});await page.click('.mix-card[data-favorite]');await idle();
 assert.equal((await state()).project.kind,'favorite');assert.equal((await state()).editing,true);
 const pinned=await page.evaluate(async()=>{const l=window.__lighttable,before=l.session.draft.id;return {step:await l.navigation.step(1),select:await l.navigation.select('a',1),unchanged:l.session.draft.id===before};});assert.deepEqual(pinned,{step:false,select:false,unchanged:true});
 await page.click('[data-layer="a"]');
 // Native range inputs and ruler gestures must not touch storage, JPEG or GPU readback.
 await page.evaluate(()=>{
  const counters={read:0,encode:0,get:0,put:0,add:0},restore=[];
  for(const [obj,key,name] of [[WebGL2RenderingContext.prototype,'readPixels','read'],[HTMLCanvasElement.prototype,'toBlob','encode'],[IDBObjectStore.prototype,'get','get'],[IDBObjectStore.prototype,'put','put'],[IDBObjectStore.prototype,'add','add']]){const original=obj[key];obj[key]=function(...args){counters[name]++;return original.apply(this,args)};restore.push(()=>obj[key]=original);}
  window.__io=counters;window.__restore=()=>restore.forEach(fn=>fn());const r=window.__lighttable.renderer;window.__gpu={uploads:r.metrics.uploads,compilations:r.metrics.compilations,bytes:r.metrics.liveBytes};
 });
 for(const selector of ['[data-position="x"]','[data-position="y"]','[data-scale]']){await page.locator(selector).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');}
 await page.click('[data-mode="levels"]');await settled();let h=await page.locator('[data-level="black"]').boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+36,h.y+h.height/2,{steps:6});await page.mouse.up();await settled();
 const adjusted=await state();assert.ok(adjusted.draft.layers[0].transform.xMm>0);assert.ok(adjusted.draft.layers[0].transform.yMm>0);assert.ok(adjusted.draft.layers[0].transform.scale>1);assert.ok(adjusted.draft.layers[0].levels.black>.05);assert.equal(adjusted.draft.layers[1].levels,undefined);
 assert.deepEqual(await page.evaluate(()=>window.__io),{read:0,encode:0,get:0,put:0,add:0});assert.deepEqual(await page.evaluate(()=>{const r=window.__lighttable.renderer;return {uploads:r.metrics.uploads,compilations:r.metrics.compilations,bytes:r.metrics.liveBytes};}),await page.evaluate(()=>window.__gpu));await page.evaluate(()=>window.__restore());
 await page.evaluate(()=>{const r=window.__lighttable.repo;window.__commit=r.commit.bind(r);r.commit=async()=>{throw new DOMException('Adaptive test quota failure. Retry.','QuotaExceededError')};});await page.click('[data-edit-done]');await idle();assert.equal((await state()).editing,true);assert.equal((await state()).undo,true);assert.deepEqual((await state()).draft,adjusted.draft);
 await page.evaluate(()=>window.__lighttable.repo.commit=window.__commit);await page.click('[data-edit-done]');await idle();assert.equal((await state()).editing,false);assert.equal((await state()).commits,adjusted.commits+1);
 const saved=await page.evaluate(async()=>{const l=window.__lighttable,original=await l.repo.composition(window.__originalCompositionId),favorite=await l.repo.composition(l.session.draft.id);return {original:original.layers[0].levels??null,favorite:favorite.layers[0].levels.black,assets:l.repo.counters.assetsWritten};});assert.equal(saved.original,null);assert.ok(saved.favorite>.05);assert.equal(saved.assets,beforeLike.assets);
 // Reopen through Library, proving the normal editor reads the independently saved snapshot.
 await page.click('[data-action="library"]');await page.locator('.mix-card[data-favorite]').waitFor();await page.click('.mix-card[data-favorite]');await idle();assert.ok((await state()).draft.layers[0].levels.black>.05);
 const layouts=[];
 for(const [name,w,height,turn] of [['portrait-wide',402,874,0],['portrait-tall',402,874,1],['landscape-wide',874,402,0],['landscape-tall',874,402,1]]){
  await page.setViewportSize({width:w,height});await page.evaluate(turn=>{const s=window.__lighttable.session;s.begin();s.draft.frame.turns=turn;s.end();},turn);await settled();
  for(const mode of ['layers','levels']){
   await page.click(`[data-mode="${mode}"]`);await settled();
   const dimensions=await page.evaluate(()=>{
    const stage=document.querySelector('.stage').getBoundingClientRect();const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};};
    const controls=[...document.querySelectorAll('.workspace .topbar button,.workspace .toolbar button,.workspace .edit-modes button,.workspace .edit-actions button,.workspace .layer-controls button,.workspace .layer-controls input,.workspace .level-handle')].filter(e=>e.getClientRects().length>0);
    const badTargets=controls.filter(e=>{const b=e.getBoundingClientRect();return b.width<43.9||b.height<43.9;}).map(e=>({id:e.getAttribute('aria-label'),...r(e)}));
    const overlapping=controls.filter(e=>{const b=e.getBoundingClientRect();return Math.min(b.right,stage.right)-Math.max(b.left,stage.left)>1&&Math.min(b.bottom,stage.bottom)-Math.max(b.top,stage.top)>1;}).map(e=>e.getAttribute('aria-label'));
    const offscreen=controls.filter(e=>{const b=e.getBoundingClientRect();return b.left<-.5||b.top<-.5||b.right>innerWidth+.5||b.bottom>innerHeight+.5;}).map(e=>({id:e.getAttribute('aria-label'),...r(e)}));
    return {stage:r(document.querySelector('.stage')),badTargets,overlapping,offscreen,overflow:document.documentElement.scrollWidth>innerWidth,save:!!document.querySelector('[data-action="export"]').getClientRects().length};
   });layouts.push({name,mode,...dimensions});await page.screenshot({path:`${out}/${name}-${mode}.png`});
   assert.equal(dimensions.save,true,`${name}/${mode}: save visible`);assert.equal(dimensions.overflow,false);assert.deepEqual(dimensions.badTargets,[],`${name}/${mode}: targets`);assert.deepEqual(dimensions.overlapping,[],`${name}/${mode}: controls overlap stage`);assert.deepEqual(dimensions.offscreen,[],`${name}/${mode}: controls offscreen`);if(w>height)assert.ok(dimensions.stage.h>=height-2,`${name}/${mode}: photo uses full height`);
  }
 }
 await page.click('[data-action="favorite"]');await idle();assert.equal(await page.evaluate(async()=> (await window.__lighttable.repo.listFavorites()).length),0);assert.equal((await state()).editing,true);assert.equal((await state()).assets,beforeLike.assets);
 assert.deepEqual(errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify({environment:'Chromium software GPU; not iPhone hardware',cover,layouts,passed:['home actual covers','heart no original writes','favorite independent editing','pinned pair','range and Levels zero I/O','failed Done retry','favorite reopen','four orientations','Save visible','44px targets','no stage overlap','unlike retains editor']},null,2));
 console.log('PASS: home covers, heart/Library independent editing, pinned pair, hot path, Done failure/retry, four orientations, unlike');
}finally{await browser?.close();await vite.close();}
