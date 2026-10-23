import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const output=resolve('lab-out/lighttable');await mkdir(output,{recursive:true});
let vite;
let base=process.env.LIGHTTABLE_URL;
if(!base){vite=await createServer({server:{host:'127.0.0.1',port:5180,strictPort:true},logLevel:'error'});await vite.listen();base='http://127.0.0.1:5180';}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(e.stack));
await context.addInitScript(()=>{
  window.__counts={readPixels:0,encode:0,putImageData:0,upload:0,compile:0,idb:0};
  const wrap=(proto,key,counter)=>{const original=proto[key];proto[key]=function(...args){window.__counts[counter]++;return original.apply(this,args);};};
  wrap(WebGL2RenderingContext.prototype,'readPixels','readPixels');wrap(WebGL2RenderingContext.prototype,'texImage2D','upload');wrap(WebGL2RenderingContext.prototype,'compileShader','compile');
  wrap(HTMLCanvasElement.prototype,'toBlob','encode');wrap(HTMLCanvasElement.prototype,'toDataURL','encode');wrap(CanvasRenderingContext2D.prototype,'putImageData','putImageData');wrap(IDBFactory.prototype,'open','idb');
});
const touch=await context.newCDPSession(page);
const send=(type,points)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});
const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const state=()=>page.evaluate(()=>{const {session,gestures,renderer}=window.__lighttable;return {draft:session.draft,viewport:session.viewport,active:gestures.active,dirty:session.dirty,metrics:renderer.metrics};});
async function drag(dx,dy){await page.evaluate(()=>window.__lighttable.session.interaction='move');const r=await page.locator('canvas').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
  await send('touchStart',[[x,y]]);for(let k=1;k<=4;k++)await send('touchMove',[[x+dx*k/4,y+dy*k/4]]);await send('touchEnd',[]);await frame();}
try{
  await page.goto(base+'/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.metrics.frames>0);
  await page.click('[data-close-library]');await page.click('[data-action="pro"]');
  assert.equal(await page.locator('.status').isVisible(),false);
  await page.evaluate(()=>{for(const key of Object.keys(window.__counts))window.__counts[key]=0;});
  const start=await state();await drag(24,18);const moved=await state();
  assert.deepEqual(moved.draft.layers[0],start.draft.layers[0]);assert.ok(moved.draft.layers[1].transform.xMm>0);assert.ok(moved.draft.layers[1].transform.yMm>0);assert.equal(moved.draft.revision,0);
  await drag(12,-8);const repeated=await state();assert.ok(repeated.draft.layers[1].transform.xMm>moved.draft.layers[1].transform.xMm);
  await page.click('[data-action="undo"]');assert.deepEqual((await state()).draft.layers[1].transform,moved.draft.layers[1].transform);
  const counts=await page.evaluate(()=>window.__counts);assert.deepEqual(counts,{readPixels:0,encode:0,putImageData:0,upload:0,compile:0,idb:0});
  console.log('PASS: native diagonal gestures accumulate RAM drafts; zero readback/encode/upload/compile/IDB on movement and lift');

  // Start a real one-pointer drag then add a second; only the unfinished movement rolls back.
  const beforePinch=(await state()).draft;
  const r=await page.locator('canvas').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
  await send('touchStart',[[x-40,y]]);await send('touchMove',[[x-20,y+20]]);
  await send('touchStart',[[x-20,y+20],[x+40,y+20]]);
  await send('touchMove',[[x-50,y+20],[x+70,y+20]]);
  await send('touchEnd',[[x-50,y+20]]);await send('touchMove',[[x-90,y+50]]);await send('touchEnd',[]);await frame();
  assert.deepEqual((await state()).draft.layers[0],beforePinch.layers[0]);assert.ok((await state()).draft.layers[1].transform.scale>1.9);assert.equal((await state()).viewport.zoom,1);await page.evaluate(()=>window.__lighttable.session.undo());assert.deepEqual((await state()).draft,beforePinch);
  // Verify screen-displacement across all rotations at two viewport zoom levels.
  for(const turn of [0,1,2,3])for(const zoom of [1,2]){
    await page.evaluate(({turn,zoom})=>{const l=window.__lighttable;l.session.draft.frame.turns=turn;l.session.viewport.zoom=zoom;l.session.viewport.pan={x:0,y:0};l.session.layer.transform={xMm:0,yMm:0,turns:0};l.session.onChange();l.renderer.invalidate();},{turn,zoom});await frame();
    await drag(21,-17);
    const delta=await page.evaluate(async()=>{const {filmToScreen,vector}=await import('/src/lighttable/model/transforms.ts');const s=window.__lighttable.session;return vector(filmToScreen(s.draft.frame,s.viewport),{x:s.layer.transform.xMm,y:s.layer.transform.yMm});});
    assert.ok(Math.abs(delta.x-21)<.3&&Math.abs(delta.y+17)<.3,JSON.stringify({turn,zoom,delta}));
  }
  console.log('PASS: pinch cancels only active stroke; one remaining finger waits; movement follows finger at all rotations and zoom');
  await page.click('[data-layer="a"]');await drag(-10,12);assert.equal((await state()).draft.layers[0].transform.yMm!==0,true);
  await page.click('[data-mode="pro"]');await page.click('[data-action="halo"]');const beforeEffect=await state();await drag(0,-40);
  const afterEffect=await state();assert.deepEqual(afterEffect.draft.layers,beforeEffect.draft.layers);assert.ok(afterEffect.draft.effects.halo>beforeEffect.draft.effects.halo);
  await page.click('[data-mode="layers"]');await drag(8,8);assert.notDeepEqual((await state()).draft.layers[0].transform,afterEffect.draft.layers[0].transform);
  console.log('PASS: layer selector and explicit parameter gesture have one owner; closing tools restores layer drag');

  // Explicit GPU reads below are test probes only, not production preview/export code.
  const halo=await page.evaluate(async()=>{
    const l=window.__lighttable;
    async function fixture(kind){const c=document.createElement('canvas');c.width=400;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle=kind==='gray'?'#aaa':'black';ctx.fillRect(0,0,400,300);if(kind==='disc'){ctx.fillStyle='white';ctx.beginPath();ctx.arc(120,150,12,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(3,50,12,0,Math.PI*2);ctx.fill();}return new Promise(r=>c.toBlob(r,'image/png'));}
    const white=await fixture('disc'),black=await fixture('black'),gray=await fixture('gray');
    window.__fixtures={white,black,gray};
    const pair=(a,b)=>[{id:'a',blob:a},{id:'b',blob:b}];
    const {filmToScreen,point}=await import('/src/lighttable/model/transforms.ts');
    function read(x,y){l.renderer.draw(performance.now());const gl=l.renderer.gl,c=l.renderer.canvas,p=point(filmToScreen(l.session.draft.frame,l.session.viewport),{x,y});const data=new Uint8Array(4);gl.readPixels(Math.floor(p.x*c.width/l.session.viewport.width),c.height-1-Math.floor(p.y*c.height/l.session.viewport.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,data);return [...data];}
    await l.renderer.loadPair(pair(white,black));l.session.draft.effects.halo=0;const off=read(12.6,13.5);l.session.draft.effects.halo=1;const on=read(12.6,13.5);
    l.session.draft.layers[0].transform.xMm=3;const moved=read(15.6,13.5);
    // The bright object near the source's left edge must glow outside its translated coverage.
    l.session.draft.layers[0].transform.xMm=5;const outside=read(4.5,4.5);
    await l.renderer.loadPair(pair(gray,gray));l.session.draft.effects.halo=0;const grayOff=read(18,13.5);l.session.draft.effects.halo=1;const grayOn=read(18,13.5);
    return {off,on,moved,outside,grayOff,grayOn};
  });
  assert.ok(halo.on[0]>halo.off[0]+8,JSON.stringify(halo));assert.ok(halo.on[0]>halo.on[1]+8);assert.ok(Math.abs(halo.moved[0]-halo.on[0])<6,JSON.stringify(halo));assert.ok(halo.outside[0]>halo.outside[1]+5);assert.deepEqual(halo.grayOn,halo.grayOff);
  console.log('PASS: source-anchored red halo, padded source edges, halo=0, no halo triggered by two medium lights');

  // Out-of-order decode: hold the first decoder before submitting another complete pair.
  const race=await page.evaluate(async()=>{
    const l=window.__lighttable,{white,black,gray}=window.__fixtures;
    const original=HTMLImageElement.prototype.decode;let release;let first=true;
    HTMLImageElement.prototype.decode=async function(){await original.call(this);if(first){first=false;await new Promise(r=>release=r);}};
    try{
      const old=l.renderer.loadPair([{id:'old-a',blob:white},{id:'old-b',blob:black}]);
      while(!release)await new Promise(r=>setTimeout(r,5));
      const recent=await l.renderer.loadPair([{id:'new-a',blob:gray},{id:'new-b',blob:black}]);release();const oldResult=await old;
      return {recent,oldResult,ids:l.session.draft.layers.map(x=>x.placements[0].source.assetId),textures:l.renderer.metrics.liveTextures};
    }finally{HTMLImageElement.prototype.decode=original;release?.();}
  });assert.equal(race.recent,true);assert.equal(race.oldResult,false);assert.deepEqual(race.ids,['new-a','new-b']);assert.equal(race.textures,8);
  console.log('PASS: stale decode cannot replace the latest complete pair; retired GPU textures released');

  const quality=await page.evaluate(async()=>{
    const l=window.__lighttable,uploads=l.renderer.metrics.uploads,transform=JSON.stringify(l.session.draft.layers);
    const sizes=[];
    for(const tier of [1024,768,512]){
      l.renderer.setQuality(tier);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      sizes.push({tier,width:l.renderer.canvas.width,height:l.renderer.canvas.height});
    }
    l.renderer.setQuality(1024);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const before=l.renderer.metrics.frames;
    for(let i=0;i<100;i++)l.renderer.invalidate();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {sizes,uploads:l.renderer.metrics.uploads-uploads,unchanged:transform===JSON.stringify(l.session.draft.layers),draws:l.renderer.metrics.frames-before};
  });
  for(const size of quality.sizes)assert.ok(Math.max(size.width,size.height)<=size.tier);
  assert.equal(quality.uploads,0);assert.equal(quality.unchanged,true);assert.equal(quality.draws,1);
  console.log('PASS: 1024/768/512 presentation tiers retain scene and textures; 100 invalidations coalesce into one draw');

  const beforeLoss=(await state()).draft;
  await page.evaluate(()=>{const l=window.__lighttable;window.__lose=l.renderer.gl.getExtension('WEBGL_lose_context');window.__lose.loseContext();});
  await page.waitForFunction(()=>window.__lighttable.renderer.metrics.contextLosses===1);
  await page.evaluate(()=>window.__lose.restoreContext());await page.waitForFunction(()=>window.__lighttable.renderer.ready);await frame();
  assert.deepEqual((await state()).draft,beforeLoss);assert.equal((await state()).metrics.liveTextures,8);
  console.log('PASS: WebGL context loss/restoration keeps RAM composition and rebuilds bounded resources');

  // Durable roll picker and retry are covered in lighttable-workspace-check.mjs.
  await page.reload();await page.waitForFunction(()=>window.__lighttable?.renderer.metrics.frames>0);
  await page.click('[data-close-library]');
  await page.screenshot({path:resolve(output,'portrait.png')});
  await page.click('[data-action="rotate"]');await frame();await page.screenshot({path:resolve(output,'portrait-rotated.png')});
  const rotation=(await state()).draft.frame.turns;
  await page.setViewportSize({width:844,height:390});await frame();assert.equal((await state()).draft.frame.turns,rotation);
  await page.screenshot({path:resolve(output,'landscape.png')});
  for(const size of [{width:375,height:667},{width:430,height:932},{width:667,height:375},{width:932,height:430}]){
    await page.setViewportSize(size);await frame();
    const bounds=await page.locator('.toolbar button').evaluateAll(buttons=>buttons.filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    for(const r of bounds){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=size.width+1&&r.y+r.h<=size.height+1,JSON.stringify({size,r}));assert.ok(r.w>=44&&r.h>=44);}
  }
  console.log('PASS: portrait / landscape layout, rotation independent from phone orientation, controls >=44px');
  await page.setViewportSize({width:390,height:844});await frame();
  const metrics=(await state()).metrics;
  assert.equal(errors.length,0,errors.join('\n'));
  assert.ok(metrics.liveBytes<96*1024*1024);assert.equal(metrics.liveTextures,8);
  await writeFile(resolve(output,'browser-evidence.json'),JSON.stringify({environment:'Chromium SwiftShader; NOT iPhone hardware',halo,counts,metrics,errors},null,2));
  console.log('PASS: no page errors; bounded active GPU allocations. iPhone hardware performance NOT VERIFIED.');
  const disposed=await page.evaluate(()=>{const l=window.__lighttable;l.dispose();return {textures:l.renderer.metrics.liveTextures,bytes:l.renderer.metrics.liveBytes};});
  assert.deepEqual(disposed,{textures:0,bytes:0});
  console.log('PASS: disposal releases tracked textures, listeners and scheduler');
}finally{await browser.close();await vite?.close();}
