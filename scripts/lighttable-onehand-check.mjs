import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const vite=await createServer({server:{host:'127.0.0.1',port:5187,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:402,height:874},hasTouch:true,isMobile:true});page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto('http://127.0.0.1:5187/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);
 await page.click('[data-new-roll]');assert.match(await page.inputValue('[data-roll-name]'),/^\d\d [A-Z][a-z]{2} · \d\d:\d\d$/);
 const photos=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#244334';x.fillRect(0,0,400,300);x.fillStyle='#fff';x.beginPath();x.arc(100,90,30,0,Math.PI*2);x.fill();x.fillStyle='#622313';x.fillRect(220,150,120,100);
  const p=document.createElement('canvas');p.width=300;p.height=400;const y=p.getContext('2d');y.translate(0,400);y.rotate(-Math.PI/2);y.drawImage(c,0,0);
  return [c,p].map(c=>c.toDataURL('image/png').split(',')[1]);
 });
 const photo=i=>({name:`frame-${i}.png`,mimeType:'image/png',buffer:Buffer.from(photos[i%2],'base64')});
 await page.setInputFiles('[data-roll-files]',Array.from({length:13},(_,i)=>photo(i)));
 assert.equal(await page.getAttribute('.roll-import-dialog','data-selection'),'overflow');assert.equal(await page.locator('[data-save-roll]').isDisabled(),true);assert.equal(await page.locator('.candidate-extra').count(),1);
 await page.locator('.candidate button').last().click();assert.equal(await page.getAttribute('.roll-import-dialog','data-selection'),'full');assert.match(await page.locator('.import-count').innerText(),/12 \/ 12 ✓ · Roll full/);
 await page.waitForFunction(()=>[...document.querySelectorAll('.candidate img')].every(i=>i.complete&&i.naturalWidth>0));
 const geometry=[];
 for(const [width,height] of [[375,667],[402,874],[874,402]]){
  await page.setViewportSize({width,height});
  for(const scroll of [0,100000]){
   await page.locator('.roll-import-dialog .sheet-content').evaluate((e,s)=>e.scrollTop=s,scroll);
   const r=await page.locator('[data-save-roll]').boundingBox();assert.ok(r.y>=height-100&&r.y+r.height<=height+1,JSON.stringify({width,height,r}));
   const count=await page.locator('.import-count').boundingBox();assert.ok(count.y>height*.5);
   const hit=await page.locator('[data-save-roll]').evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;});assert.equal(hit,true);
   geometry.push({width,height,scroll,button:r});
  }
 }
 await page.setViewportSize({width:402,height:874});await page.screenshot({path:'lab-out/lighttable/onehand-full.png'});
 await page.click('[data-save-roll]');await page.waitForFunction(()=>!document.querySelector('.roll-import-dialog').open);await page.click('[data-start-mix]');await page.waitForFunction(()=>window.__lighttable.navigation.project&&!window.__lighttable.navigation.busy);
 await page.evaluate(()=>window.__lighttable.navigation.select('b',1));
 const direction=await page.evaluate(async()=>{
  const l=window.__lighttable,c=structuredClone(l.session.draft),inputs=l.navigation.sources.map(a=>({id:a.id,blob:a.blob}));
  const original=await l.navigation.sources[1].blob.arrayBuffer();
  const mixed=await l.renderer.exportImage(c,inputs,2000,new AbortController().signal);
  const reference=structuredClone(c);reference.layers[1].placements[0]=structuredClone(reference.layers[0].placements[0]);
  const same=await l.renderer.exportImage(reference,[inputs[0],inputs[0]],2000,new AbortController().signal);
  async function pixels(blob){const b=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=b.width;canvas.height=b.height;const ctx=canvas.getContext('2d');ctx.drawImage(b,0,0);b.close();return ctx.getImageData(0,0,canvas.width,canvas.height).data;}
  const a=await pixels(mixed.blob),b=await pixels(same.blob);let delta=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);delta+=d;max=Math.max(max,d);}
  const after=await (await l.repo.asset(l.navigation.sources[1].id)).blob.arrayBuffer();
  return {placements:c.layers.map(l=>l.placements[0]),mae:delta/a.length,max,originalSame:original.byteLength===after.byteLength&&new Uint8Array(original).every((v,i)=>v===new Uint8Array(after)[i])};
 });
 assert.equal(direction.placements[0].turns,0);assert.equal(direction.placements[1].turns,1);assert.deepEqual(direction.placements[0].rect,direction.placements[1].rect);assert.ok(direction.mae<.4,JSON.stringify(direction));assert.equal(direction.originalSame,true);
 const save=await page.locator('[data-action=export]').boundingBox();assert.ok(save.y>750);await page.screenshot({path:'lab-out/lighttable/onehand-workspace.png'});
 // Rotation changes only this pair and still waits for navigation before commit.
 const before=await page.evaluate(()=>window.__lighttable.repo.counters.compositionCommits);await page.click('[data-action=pro]');await page.click('[data-action=rotate-layer]');assert.equal(await page.evaluate(()=>window.__lighttable.repo.counters.compositionCommits),before);
 await page.click('[data-rail=a] [data-index="1"]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.equal(await page.evaluate(()=>window.__lighttable.session.layer.transform.turns),0);
 await page.click('[data-rail=a] [data-index="0"]');await page.waitForFunction(()=>!window.__lighttable.navigation.busy);assert.equal(await page.evaluate(()=>window.__lighttable.session.draft.layers[1].transform.turns),1);
 assert.deepEqual(errors,[]);await mkdir('lab-out/lighttable',{recursive:true});await writeFile('lab-out/lighttable/onehand-evidence.json',JSON.stringify({geometry,direction,environment:'Chromium SwiftShader. Native iOS picker and Photos not device-verified.'},null,2));
 console.log('PASS: 12/13 full/overflow, bottom dock in 3 sizes at both scroll ends, auto name, equal landscape/portrait placement and halo/JPEG, original bytes, per-pair manual rotation');
}finally{await browser.close();await vite.close();}
