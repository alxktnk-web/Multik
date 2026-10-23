import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out='lab-out/lighttable/long-controls';await mkdir(out,{recursive:true});
const vite=await createServer({server:{host:'127.0.0.1',port:5196,strictPort:true},logLevel:'error'});let browser;
try{
 await vite.listen();browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:402,height:874},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await page.goto('http://127.0.0.1:5196/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);await page.click('[data-close-library]');
 await page.evaluate(async()=>{const l=window.__lighttable,{demoSources}=await import('/src/lighttable/ui/fixtures.ts'),{Selection,importFiles}=await import('/src/lighttable/data/import.ts');const blobs=await demoSources(),s=new Selection();s.setCapacity(6);s.add(Array.from({length:6},(_,i)=>new File([blobs[i%2]],`${i}.png`,{type:'image/png'})));const roll=await importFiles(l.repo,s,'Long controls',()=>{});await l.navigation.open(await l.repo.createProject(roll.id,roll.id));await l.navigation.select('b',1);});
 await page.click('[data-action="pro"]');const layouts=[];
 for(const [name,w,h] of [['portrait',402,874],['narrow-portrait',375,812],['small-portrait',320,700],['landscape',874,402],['small-landscape',667,375]])for(const turn of [0,1]){
  await page.setViewportSize({width:w,height:h});await page.evaluate(turn=>{const s=window.__lighttable.session;s.begin();s.draft.frame.turns=turn;s.end();},turn);await frame();
  for(const mode of ['layers','levels','pro','haloXY']){
   await page.click(`[data-mode="${mode==='haloXY'?'pro':mode}"]`);if(mode==='haloXY')await page.click('[data-action="haloXY"]');await frame();
   const geometry=await page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
    const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    const tracks=[...document.querySelectorAll('.workspace input[type=range],.levels-track')].filter(visible).map(e=>({label:e.getAttribute('aria-label')??'Levels',...rect(e)}));
    const stage=rect(document.querySelector('.stage'));
    const controls=[...document.querySelectorAll('.workspace button,.workspace input[type=range],.level-handle')].filter(visible).map(e=>({label:e.getAttribute('aria-label')??e.dataset.action,...rect(e)}));
    return {tracks,stage,controls};
   });
   for(const r of geometry.tracks){assert.ok((w>h?r.h:r.w)>=(w>h?h:w)-80,`${name}/${turn}/${mode} short track ${JSON.stringify(r)}`);assert.ok((w>h?r.w:r.h)>=43.9,`narrow touch area ${r.label}`);}
   assert.equal(geometry.tracks.length,mode==='layers'?3:mode==='haloXY'?2:1);
   for(const r of geometry.controls){assert.ok(r.w>=43.9&&r.h>=43.9,`small control ${name} ${JSON.stringify(r)}`);assert.ok(r.x>=-.5&&r.y>=-.5&&r.right<=w+.5&&r.bottom<=h+.5,`offscreen ${name} ${JSON.stringify(r)}`);const s=geometry.stage;assert.ok(Math.min(r.right,s.right)-Math.max(r.x,s.x)<=1||Math.min(r.bottom,s.bottom)-Math.max(r.y,s.y)<=1,`over photo ${name} ${r.label}`);}
   if(w<h&&turn===1&&mode==='layers'){
    const footer=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {y:r.y,h:r.height};};return {utilities:box('.layer-utilities'),modes:box('.edit-modes'),ranges:box('.layer-controls')};});
    assert.ok(Math.abs(footer.utilities.y-footer.modes.y)<1,'utilities share footer row');assert.equal(footer.ranges.h,132,'no separate utilities row');
    for(let i=0;i<geometry.controls.length;i++)for(let j=i+1;j<geometry.controls.length;j++){const a=geometry.controls[i],b=geometry.controls[j];assert.ok(Math.min(a.right,b.right)-Math.max(a.x,b.x)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)<=1,`overlapping controls ${name}: ${a.label}/${b.label}`);}
   }
   layouts.push({name,turn,mode,tracks:geometry.tracks,stage:geometry.stage});if(name==='portrait'||name==='landscape')await page.screenshot({path:`${out}/${name}-${turn}-${mode}.png`});
  }
 }
 // Actual native vertical slider movement, not synthetic input events.
 await page.setViewportSize({width:874,height:402});await page.click('[data-mode="layers"]');await frame();
 const before=await page.evaluate(()=>{const l=window.__lighttable;return {x:l.session.layer.transform.xMm,commits:l.repo.counters.compositionCommits};});
 const r=await page.locator('[data-position="x"]').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height*.6);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height*.25,{steps:8});await page.mouse.up();await frame();
 const after=await page.evaluate(()=>{const l=window.__lighttable;return {x:l.session.layer.transform.xMm,commits:l.repo.counters.compositionCommits,gesture:l.session.gesturing};});assert.ok(after.x>before.x);assert.equal(after.commits,before.commits);assert.equal(after.gesture,false);
 await page.click('[data-action="undo"]');assert.equal(await page.evaluate(()=>window.__lighttable.session.layer.transform.xMm),before.x);
 assert.deepEqual(errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify({environment:'Chromium, not iPhone',layouts,nativeVerticalRange:true,undo:true,noCommitsOnLift:true},null,2));console.log('PASS: long tracks in all modes/orientations, 44px targets, no overlap, native vertical input and Undo');
}finally{await browser?.close();await vite.close();}
