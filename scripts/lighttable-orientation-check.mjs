import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out='lab-out/lighttable/orientation';await mkdir(out,{recursive:true});
const vite=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true},logLevel:'error'});let browser;
try{
 await vite.listen();browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:402,height:874},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await page.goto('http://127.0.0.1:5198/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);await page.click('[data-close-library]');
 await page.evaluate(async()=>{const l=window.__lighttable,{demoSources}=await import('/src/lighttable/ui/fixtures.ts'),{Selection,importFiles}=await import('/src/lighttable/data/import.ts');const blobs=await demoSources(),s=new Selection();s.setCapacity(6);s.add(Array.from({length:6},(_,i)=>new File([blobs[i%2]],`${i}.png`,{type:'image/png'})));const roll=await importFiles(l.repo,s,'Orientation',()=>{});await l.navigation.open(await l.repo.createProject(roll.id,roll.id));await l.navigation.select('b',1);});
 assert.equal(await page.locator('[data-action=pro]').isVisible(),false);assert.equal(await page.locator('.film-rail').first().isVisible(),false);
 await page.evaluate(()=>{const l=window.__lighttable,before=JSON.stringify(l.session.draft);l.gestures.down(1,{x:80,y:120});l.gestures.down(2,{x:180,y:120});l.gestures.move(2,{x:300,y:150});l.gestures.up(1);l.gestures.up(2);if(JSON.stringify(l.session.draft)!==before)throw Error('Portrait pinch edited photo');});
 const initialPair=await page.evaluate(()=>window.__lighttable.navigation.project.a);const canvas=await page.locator('canvas').boundingBox();await page.mouse.move(canvas.x+canvas.width*.75,canvas.y+canvas.height*.5);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.25,canvas.y+canvas.height*.5,{steps:8});await page.mouse.up();await page.waitForFunction(a=>window.__lighttable.navigation.project.a!==a,initialPair);
 await page.screenshot({path:`${out}/portrait.png`});
 for(const [w,h] of [[874,402],[667,375]]){
  await page.setViewportSize({width:w,height:h});await page.waitForFunction(()=>window.__lighttable.session.editing);await frame();
  assert.equal(await page.locator('.film-rail').first().isVisible(),true);
  assert.equal(await page.locator('.topbar').evaluate(e=>getComputedStyle(e).gridArea),'auto', 'Home offset must use workspace, not an inset grid cell');
  let stableStage;
  for(const mode of ['browse','layers','levels','halo','looks']){
   await page.click(`[data-mode=${mode}]`);await frame();
   if(mode!=='layers')assert.equal(await page.locator(`[data-mode=${mode}]`).getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('[data-action=undo], [data-edit-done], [data-position], [data-scale], .rail-handle, .toolbar .sources button, .toolbar [data-action=rotate]').filter({visible:true}).count(),0);
   const geo=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return {stage:box(document.querySelector('.stage')),tracks:[...document.querySelectorAll('.workspace input[type=range],.levels-track')].filter(e=>e.getClientRects().length).map(box),buttons:[...document.querySelectorAll('.workspace button')].filter(e=>e.getClientRects().length&&!e.closest('.film-rail')).map(e=>({...box(e),label:e.getAttribute('aria-label')}))};});
   assert.ok(geo.stage.h>=h-30&&geo.stage.w>=280,JSON.stringify(geo.stage));
   if(stableStage)assert.deepEqual(geo.stage,stableStage,`stage moved for ${mode}`);else stableStage=geo.stage;
   assert.ok(geo.stage.y>=12&&geo.stage.bottom<=h-12);
   for(const r of geo.tracks)assert.ok(r.h>=h-80,`short track ${mode}`);
   for(let i=0;i<geo.buttons.length;i++){const a=geo.buttons[i];assert.ok(a.x>=0&&a.y>=0&&a.right<=w+.5&&a.bottom<=h+.5,`offscreen ${a.label}`);assert.ok(a.w>=Math.min(44,h/10)-.1&&a.h>=Math.min(44,h/10)-.1);for(const b of geo.buttons.slice(i+1))assert.ok(Math.min(a.right,b.right)-Math.max(a.x,b.x)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)<=1,`overlap ${a.label}/${b.label}`);}
   if(w===874)await page.screenshot({path:`${out}/landscape-${mode}.png`});
  }
  const column=await page.locator('[data-action=library], [data-action=collection], [data-mode=browse], [data-mode=layers], [data-mode=levels], [data-mode=halo], [data-action=favorite], [data-action=export], [data-action=rotate], [data-mode=looks]').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({label:e.getAttribute('aria-label'),x:e.getBoundingClientRect().x})));
  assert.equal(column.length,10,JSON.stringify(column));assert.ok(column.every(b=>Math.abs(b.x-column[0].x)<1),JSON.stringify(column));
  const looks=await page.locator('[data-mode=looks]').boundingBox(),popup=await page.locator('.look-options').boundingBox();assert.ok(popup.x>=looks.x+looks.width,JSON.stringify({looks,popup}));
  await page.click('[data-profile-version="3"]');assert.equal(await page.evaluate(()=>window.__lighttable.session.tool.kind),'layer');assert.equal(await page.locator('.look-options').isVisible(),false);
  for(const mode of ['levels','halo']){await page.click(`[data-mode=${mode}]`);await page.click(`[data-mode=${mode}]`);assert.equal(await page.evaluate(()=>window.__lighttable.editor.mode),mode);}
  for(const side of ['a','b'])assert.equal(await page.locator(`[data-rail=${side}]`).isVisible(),true);
 }
 await page.click('[data-rail=a] [data-index="0"]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);await page.click('[data-mode=levels]');const other=await page.evaluate(()=>JSON.stringify(window.__lighttable.session.draft.layers[1]));const commits=await page.evaluate(()=>window.__lighttable.repo.counters.compositionCommits);const black=await page.locator('[data-level=black]').boundingBox();await page.mouse.move(black.x+22,black.y+22);await page.mouse.down();await page.mouse.move(black.x+22,black.y-30,{steps:5});await page.mouse.up();assert.equal(await page.evaluate(()=>JSON.stringify(window.__lighttable.session.draft.layers[1])),other);assert.equal(await page.evaluate(()=>window.__lighttable.repo.counters.compositionCommits),commits);assert.ok(await page.evaluate(()=>window.__lighttable.session.draft.layers[0].levels.black>0));
 await page.click('[data-rail=a] [data-index="2"]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.equal(await page.evaluate(()=>window.__lighttable.session.tool.kind),'levels');
 await page.click('[data-rail=b] [aria-pressed=true]');assert.equal(await page.evaluate(()=>window.__lighttable.session.tool.kind),'levels');assert.equal(await page.evaluate(()=>window.__lighttable.session.activeLayer),'b');
 await page.click('[data-mode=browse]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.equal(await page.evaluate(()=>window.__lighttable.session.interaction),'browse');assert.equal(await page.locator('.levels-ruler').isVisible(),false);
 await page.evaluate(()=>{const l=window.__lighttable,before=JSON.stringify(l.session.draft);l.gestures.down(1,{x:80,y:120});l.gestures.down(2,{x:180,y:120});l.gestures.move(2,{x:300,y:150});l.gestures.up(1);l.gestures.up(2);if(JSON.stringify(l.session.draft)!==before)throw Error('View pinch edited photo');});
 await page.click('[data-mode=layers]');assert.equal(await page.evaluate(()=>window.__lighttable.session.interaction),'move');
 await page.click('[data-mode=halo]');await page.locator('.effect-range').fill('0.7');await page.locator('.effect-range').dispatchEvent('change');assert.equal(await page.evaluate(()=>window.__lighttable.session.draft.effects.halo),.7);
 const before=await page.evaluate(()=>window.__lighttable.repo.counters.compositionCommits);
 await page.setViewportSize({width:402,height:874});await page.waitForFunction(()=>!window.__lighttable.session.editing&&!window.__lighttable.session.dirty&&!window.__lighttable.navigation.busy);assert.equal(await page.evaluate(()=>window.__lighttable.repo.counters.compositionCommits),before+1);
 await page.setViewportSize({width:874,height:402});await page.waitForFunction(()=>window.__lighttable.session.editing);if(await page.locator('[data-mode=halo]').getAttribute('aria-pressed')!=='true')await page.click('[data-mode=halo]');await page.locator('.effect-range').fill('0.3');await page.locator('.effect-range').dispatchEvent('change');
 await page.evaluate(()=>{const r=window.__lighttable.repo;window.__commit=r.commit.bind(r);r.commit=async()=>{throw Error('Test save failure');};});
 await page.click('[data-mode=browse]');await page.waitForFunction(()=>document.querySelector('.status').textContent==='Test save failure');assert.equal(await page.evaluate(()=>window.__lighttable.session.interaction),'browse');assert.equal(await page.evaluate(()=>window.__lighttable.session.dirty),true);
 await page.setViewportSize({width:402,height:874});await page.waitForFunction(()=>!window.__lighttable.session.editing&&document.querySelector('.status').textContent==='Test save failure');
 assert.deepEqual(await page.evaluate(()=>({editing:window.__lighttable.session.editing,dirty:window.__lighttable.session.dirty,halo:window.__lighttable.session.draft.effects.halo})),{editing:false,dirty:true,halo:.3});
 await page.evaluate(()=>window.__lighttable.repo.commit=window.__commit);await page.click('[data-action=library]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.equal(await page.evaluate(()=>window.__lighttable.session.dirty),false);
 await page.click('[data-close-library]');await page.evaluate(async()=>{const l=window.__lighttable,f=await l.repo.favoriteCurrent(l.navigation.project,l.session.draft,l.navigation.sources[0].thumb);await l.navigation.open(await l.repo.project(f.projectId));});
 await page.setViewportSize({width:874,height:402});await page.waitForFunction(()=>window.__lighttable.session.editing);await frame();
 assert.equal(await page.locator('.rail-a').isVisible(),false);
 await page.click('[data-mode=levels]');
 for(const side of ['a','b']){const rail=page.locator(`[data-rail=${side}]`);assert.equal(await rail.isVisible(),true);assert.equal(await rail.locator('button').count(),1);await rail.locator('[aria-pressed=true]').click();assert.equal(await page.evaluate(()=>window.__lighttable.session.activeLayer),side);assert.equal(await page.evaluate(()=>window.__lighttable.editor.mode),'levels');}
 await page.click('[data-mode=levels]');
 const beforeTurn=await page.evaluate(()=>window.__lighttable.session.draft.frame.turns);await page.click('[data-action=rotate]');assert.equal(await page.evaluate(()=>window.__lighttable.session.draft.frame.turns),(beforeTurn+1)%4);assert.equal(await page.evaluate(()=>window.__lighttable.session.tool.kind),'levels');
 await page.evaluate(()=>{const l=window.__lighttable,before=JSON.stringify(l.session.draft);l.gestures.down(1,{x:80,y:120});l.gestures.down(2,{x:180,y:120});l.gestures.move(2,{x:300,y:150});l.gestures.up(1);l.gestures.up(2);if(JSON.stringify(l.session.draft)!==before)throw Error('Levels pinch edited photo');});
 assert.deepEqual(errors,[]);console.log('PASS: orientation, portrait no edits, persistent rails, single tool column, explicit View/Move and persistent Levels across source selection, Halo, save boundary and failed-save draft retention; layout and screenshots');
}finally{await browser?.close();await vite.close();}
