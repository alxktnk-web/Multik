import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const vite=await createServer({server:{host:'127.0.0.1',port:5185,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.stack));
const output='lab-out/lighttable';await mkdir(output,{recursive:true});
const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const state=()=>page.evaluate(()=>{const l=window.__lighttable;return {effects:{...l.session.draft.effects},layers:structuredClone(l.session.draft.layers),tool:l.session.tool,commits:l.repo.counters.compositionCommits,builds:l.renderer.haloBuilds,uploads:l.renderer.metrics.uploads,bytes:l.renderer.metrics.liveBytes};});
const cdp=await context.newCDPSession(page),send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});
async function drag(dx,dy){const r=await page.locator('canvas').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;await send('touchStart',[[x,y]]);for(let i=1;i<=4;i++)await send('touchMove',[[x+dx*i/4,y+dy*i/4]]);await send('touchEnd',[]);await frame();}
try{
  await page.goto('http://127.0.0.1:5185/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);
  assert.equal(await page.locator('.library-dialog').isVisible(),true);await page.screenshot({path:`${output}/home-empty.png`});await page.click('[data-close-library]');
  await page.evaluate(async()=>{const l=window.__lighttable,{demoSources}=await import('/src/lighttable/ui/fixtures.ts'),{Selection,importFiles}=await import('/src/lighttable/data/import.ts');const blobs=await demoSources();const rolls=[];for(let j=0;j<2;j++){const s=new Selection();s.setCapacity(6);s.add(Array.from({length:6},(_,i)=>new File([blobs[(i+j)%2]],`${i}.png`,{type:'image/png'})));rolls.push(await importFiles(l.repo,s,j?'Тени':'Город',()=>{}));}await l.navigation.open(await l.repo.createProject(rolls[0].id,rolls[1].id));});
  await page.click('[data-action="import"]');await page.waitForFunction(()=>document.querySelector('.resume-hero img')?.complete);await page.screenshot({path:`${output}/home-library.png`});await page.setViewportSize({width:874,height:402});await page.screenshot({path:`${output}/home-landscape.png`});await page.setViewportSize({width:402,height:874});await page.click('[data-resume]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);
  await page.click('.rail-handle');await page.click('[data-action="pro"]');await page.click('[data-action="halo"]');await page.click('[data-action="haloRadius"]');
  const before=await state();await drag(70,0);assert.deepEqual((await state()).effects,before.effects);await drag(0,-70);const radius=await state();assert.ok(radius.effects.haloRadius>before.effects.haloRadius);assert.equal(radius.uploads,before.uploads);assert.equal(radius.bytes,before.bytes);assert.ok(radius.builds>before.builds);assert.equal(radius.commits,before.commits);
  await page.click('[data-action="haloThreshold"]');await drag(0,-35);assert.ok((await state()).effects.haloThreshold>before.effects.haloThreshold);assert.deepEqual((await state()).layers,before.layers);
  await page.click('[data-action="haloXY"]');const preXY=await state();await drag(35,-30);const xy=await state();assert.ok(xy.effects.halo>preXY.effects.halo);assert.ok(xy.effects.haloRadius>preXY.effects.haloRadius);await page.click('[data-action="undo"]');assert.deepEqual((await state()).effects,preXY.effects);
  await page.click('[data-action="exposure"]');await page.click('[data-action="lightXY"]');const preLight=await state();await drag(35,-30);const light=await state();assert.ok(light.effects.exposure>preLight.effects.exposure);assert.ok(light.effects.contrast>preLight.effects.contrast);assert.equal(light.builds,preLight.builds);assert.deepEqual(light.layers,preLight.layers);
  await page.locator('canvas').focus();await page.keyboard.press('ArrowRight');assert.ok((await state()).effects.contrast>light.effects.contrast);
  const accessible=page.locator('.accessible-range');assert.equal(await accessible.nth(0).getAttribute('aria-label'),'Exposure');assert.equal(await accessible.nth(1).getAttribute('aria-label'),'Contrast');await accessible.nth(1).focus();await page.keyboard.press('ArrowLeft');await accessible.nth(1).blur();
  await page.screenshot({path:`${output}/pro-portrait.png`});await page.setViewportSize({width:874,height:402});await frame();await page.screenshot({path:`${output}/pro-landscape.png`});
  // While a finger owns the photo, tool switches are disabled. Pinch rolls back current effect.
  const saved=await state(),r=await page.locator('canvas').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
  await send('touchStart',[[x,y]]);await send('touchMove',[[x+20,y-20]]);assert.equal(await page.locator('[data-action="halo"]').isDisabled(),true);await send('touchStart',[[x+20,y-20],[x+90,y]]);await send('touchEnd',[]);await frame();assert.deepEqual((await state()).effects,saved.effects);
  await page.click('[data-action="rotate"]');assert.equal(await page.locator('.pro-tools').isVisible(),false);assert.deepEqual((await state()).tool,{kind:'layer'});
  if(!await page.locator('.rail-a').isVisible())await page.click('.rail-handle');await page.click('[data-rail="a"] [data-index="1"]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.equal((await state()).effects.haloRadius,.65);
  await page.click('[data-rail="a"] [data-index="0"]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);await frame();assert.deepEqual((await state()).effects,saved.effects);
  await page.reload();await page.waitForFunction(()=>window.__lighttable?.navigation.project);assert.deepEqual((await state()).effects,saved.effects);
  // Coalesced parameter invalidation: 100 edits in one task build two masks once, zero texture allocations/uploads.
  const coalesced=await page.evaluate(async()=>{const l=window.__lighttable,b=l.renderer.haloBuilds,u=l.renderer.metrics.uploads,m=l.renderer.metrics.liveBytes;for(let i=0;i<100;i++){l.session.draft.effects.haloRadius=.3+i*.005;l.renderer.invalidate();}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {builds:l.renderer.haloBuilds-b,uploads:l.renderer.metrics.uploads-u,bytes:l.renderer.metrics.liveBytes-m};});assert.deepEqual(coalesced,{builds:2,uploads:0,bytes:0});
  const pixels=await page.evaluate(async()=>{
    const l=window.__lighttable,{filmToScreen,point}=await import('/src/lighttable/model/transforms.ts');
    async function blob(bright){const c=document.createElement('canvas');c.width=400;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,400,300);if(bright){ctx.fillStyle='#eee';ctx.beginPath();ctx.arc(150,150,15,0,Math.PI*2);ctx.fill();}return new Promise(r=>c.toBlob(r,'image/png'));}
    await l.renderer.loadPair([{id:'halo-probe',blob:await blob(true)},{id:'black-probe',blob:await blob(false)}]);
    function read(){l.renderer.draw(performance.now());const gl=l.renderer.gl,c=l.renderer.canvas,p=point(filmToScreen(l.session.draft.frame,l.session.viewport),{x:16.5,y:13.5}),pixel=new Uint8Array(4);gl.readPixels(Math.floor(p.x*c.width/l.session.viewport.width),c.height-1-Math.floor(p.y*c.height/l.session.viewport.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];}
    l.session.draft.effects.halo=1;l.session.draft.effects.haloThreshold=.5;l.session.draft.effects.haloRadius=.2;const narrow=read();l.session.draft.effects.haloRadius=1.6;const broad=read();l.session.draft.effects.haloThreshold=.95;const filtered=read();return {narrow,broad,filtered};
  });assert.ok(pixels.broad[0]>pixels.narrow[0]+8,JSON.stringify(pixels));assert.ok(pixels.broad[0]>pixels.filtered[0]+8,JSON.stringify(pixels));
  assert.deepEqual(errors,[]);await writeFile(`${output}/pro-evidence.json`,JSON.stringify({device:'Chromium touch emulation; not iPhone hardware',radius,xy,coalesced,pixels},null,2));
  console.log('PASS: home, explicit one-axis/XY, keyboard/ranges, tool lock, pinch rollback, rotate exit, independent persisted effects, coalesced halo rebuild without upload/allocation');
}finally{await browser.close();await vite.close();}
