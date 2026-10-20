import assert from 'node:assert/strict';
import { writeFile,mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const vite=await createServer({server:{host:'127.0.0.1',port:5183,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.goto('http://127.0.0.1:5183/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);
  const evidence=await page.evaluate(async()=>{
    const l=window.__lighttable,{Selection,importFiles}=await import('/src/lighttable/data/import.ts');
    const c=document.createElement('canvas');c.width=1024;c.height=768;const ctx=c.getContext('2d');ctx.fillStyle='#243a48';ctx.fillRect(0,0,1024,768);ctx.fillStyle='white';ctx.fillRect(200,200,180,120);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.95));c.width=c.height=1;
    const selection=new Selection();selection.add(Array.from({length:12},(_,i)=>new File([blob],`frame-${i}.jpg`,{type:'image/jpeg'})));
    const roll=await importFiles(l.repo,selection,'Cache fixtures',()=>{});await l.navigation.open(await l.repo.createProject(roll.id,roll.id));
    await l.navigation.select('a',1);const uploads=l.renderer.metrics.uploads;await l.navigation.select('a',0);const warmUploads=l.renderer.metrics.uploads-uploads;
    for(let i=0;i<100;i++){await l.navigation.select(i%2?'a':'b',(i*5)%12);}
    const settled={...l.renderer.metrics};const draft=structuredClone(l.session.draft);const memory=l.renderer.memoryEstimate;
    l.dispose();await l.repo.close();
    return {warmUploads,settled,memory,remaining:l.renderer.metrics.liveTextures,commits:l.repo.counters.compositionCommits,frameId:draft.id};
  });
  assert.equal(evidence.warmUploads,0);assert.ok(evidence.settled.liveBytes<=24*1024*1024);assert.ok(evidence.settled.peakBytes<48*1024*1024);assert.equal(evidence.remaining,0);assert.equal(evidence.commits,0);assert.deepEqual(errors,[]);
  await mkdir('lab-out/lighttable',{recursive:true});await writeFile('lab-out/lighttable/cache-evidence.json',JSON.stringify({...evidence,environment:'Chromium SwiftShader; not iPhone memory/performance'},null,2));
  console.log(`PASS: warm return uploads=0; 100 pair changes bounded to ${evidence.settled.liveBytes} tracked bytes (peak ${evidence.settled.peakBytes}); dispose=0; no unchanged-frame commits`);
}finally{await browser.close();await vite.close();}
