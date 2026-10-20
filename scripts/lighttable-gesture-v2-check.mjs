import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const vite=await createServer({server:{host:'127.0.0.1',port:5188,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(25000);
 const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await context.addInitScript(()=>{window.__writes=0;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='compositions'&&this.transaction.db.name==='multik-lighttable')window.__writes++;return put.apply(this,args);};});
 await page.goto('http://127.0.0.1:5188/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);await page.click('[data-close-library]');
 await page.evaluate(async()=>{const l=window.__lighttable,{Selection,importFiles}=await import('/src/lighttable/data/import.ts'),{demoSources}=await import('/src/lighttable/ui/fixtures.ts');const blobs=await demoSources(),s=new Selection();s.setCapacity(6);s.add(Array.from({length:6},(_,i)=>new File([blobs[i%2]],`${i}.png`,{type:'image/png'})));const roll=await importFiles(l.repo,s,'Gesture fixtures',()=>{});await l.navigation.open(await l.repo.createProject(roll.id,roll.id));});
 const cdp=await context.newCDPSession(page),send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({id,x,y}))});
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const state=()=>page.evaluate(()=>{const l=window.__lighttable;return {draft:structuredClone(l.session.draft),view:structuredClone(l.session.viewport),project:{...l.navigation.project},mode:l.session.interaction,dirty:l.session.dirty,commits:l.repo.counters.compositionCommits,writes:window.__writes};});
 const wait=()=>page.waitForFunction(()=>!window.__lighttable.navigation.busy);
 async function drag(dx,dy){const r=await page.locator('canvas').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;await send('touchStart',[[x,y]]);await send('touchMove',[[x+dx/2,y+dy/2]]);await send('touchMove',[[x+dx,y+dy]]);await send('touchEnd',[]);await wait();await frame();}
 let start=await state();assert.equal(start.mode,'browse');await drag(-90,0);assert.equal((await state()).project.a,1);assert.equal((await state()).project.b,1);assert.equal((await state()).commits,0);
 await page.click('[data-layer=b]');await drag(28,22);const moved=await state();assert.equal(moved.project.a,1);assert.equal(moved.writes,0);assert.equal(moved.dirty,true);
 const r=await page.locator('canvas').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
 await send('touchStart',[[x-40,y]]);await send('touchStart',[[x-40,y],[x+40,y]]);await send('touchMove',[[x-80,y],[x+80,y]]);await send('touchEnd',[[x-80,y]]);await send('touchMove',[[x-110,y+35]]);await send('touchEnd',[]);await frame();
 const scaled=await state();assert.equal(scaled.draft.layers[1].transform.scale,2);assert.deepEqual(scaled.draft.layers[0],moved.draft.layers[0]);assert.deepEqual(scaled.view,moved.view);assert.equal(scaled.writes,0);
 await page.click('[data-action=browse]');assert.equal((await state()).writes,0);await drag(-90,0);assert.equal((await state()).commits,1);assert.equal((await state()).draft.layers[1].transform.scale,undefined);await drag(90,0);assert.deepEqual((await state()).draft.layers,scaled.draft.layers);
 await page.reload();await page.waitForFunction(()=>window.__lighttable?.navigation.project);assert.deepEqual((await state()).draft.layers,scaled.draft.layers);assert.equal((await state()).mode,'browse');
 await page.click('[data-layer=b]');assert.equal((await state()).mode,'move');await page.click('[data-layer=b]');assert.equal((await state()).mode,'browse');
 // Failure retains exact draft and frame; a subsequent swipe retries through the same commit boundary.
 await page.click('[data-layer=b]');await drag(12,4);const dirty=await state();await page.click('[data-action=browse]');
 await page.evaluate(()=>{const l=window.__lighttable,commit=l.repo.commit.bind(l.repo);l.repo.commit=async()=>{throw Error('Injected storage failure');};window.__restore=()=>l.repo.commit=commit;});await drag(-90,0);assert.deepEqual((await state()).draft,dirty.draft);assert.equal((await state()).project.a,1);await page.evaluate(()=>window.__restore());await drag(-90,0);assert.equal((await state()).project.a,2);
 await page.click('[data-action=library]');assert.ok(page.url().endsWith('/lighttable/'));assert.equal(await page.locator('.library-dialog').isVisible(),true);assert.equal(await page.locator('a[href="/"]').count(),0);await page.click('[data-close-library]');
 await mkdir('lab-out/lighttable',{recursive:true});await page.screenshot({path:'lab-out/lighttable/gesture-v2-portrait.png'});await page.setViewportSize({width:874,height:402});await frame();await page.screenshot({path:'lab-out/lighttable/gesture-v2-landscape.png'});
 // GPU samples verify range and neutrality independently of subjective photographs.
 const tone=await page.evaluate(async()=>{
  const l=window.__lighttable,{filmToScreen,point}=await import('/src/lighttable/model/transforms.ts');
  async function solid(v){const c=document.createElement('canvas');c.width=400;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(0,0,400,300);return new Promise(r=>c.toBlob(r,'image/png'));}
  const out=[];
  for(const [a,b] of [[0,0],[32,0],[128,0],[255,0],[128,128],[255,255]]){
   await l.renderer.loadPair([{id:'tone-a',blob:await solid(a)},{id:'tone-b',blob:await solid(b)}]);l.session.draft.effects.halo=0;l.renderer.draw(performance.now());
   const gl=l.renderer.gl,c=l.renderer.canvas,p=point(filmToScreen(l.session.draft.frame,l.session.viewport),{x:18,y:13.5}),pixel=new Uint8Array(4);gl.readPixels(Math.floor(p.x*c.width/l.session.viewport.width),c.height-1-Math.floor(p.y*c.height/l.session.viewport.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);out.push({a,b,rgb:[...pixel].slice(0,3)});
  }return out;
 });
 assert.deepEqual(tone[0].rgb,[0,0,0]);assert.ok(tone[1].rgb[0]<32);assert.ok(Math.abs(tone[2].rgb[0]-128)<3);assert.ok(tone[3].rgb[0]>=245);assert.ok(tone[4].rgb[0]>tone[2].rgb[0]+35);assert.deepEqual(tone[5].rgb,[255,255,255]);for(const p of tone)assert.ok(Math.max(...p.rgb)-Math.min(...p.rgb)<=1);
 assert.deepEqual(errors,[]);await writeFile('lab-out/lighttable/gesture-v2-evidence.json',JSON.stringify({tone,scale:scaled.draft.layers[1].transform,zeroWritesOnLift:true,commitOnSwipe:true,reload:true,storageFailureRetainsDraft:true,noClassicNavigation:true,hardware:'Chromium SwiftShader; not iPhone hardware'},null,2));
 console.log('PASS: native swipe/move ownership, selected-layer pinch, zero writes on lift, swipe commit/reload/failure retry, safe library navigation, black/mid/white tone GPU probes');
}finally{await browser.close();await vite.close();}
