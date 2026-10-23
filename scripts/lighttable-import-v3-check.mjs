import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Isolate the importer from the editor so these tests also cover its public contract.
const vite=await createServer({server:{host:'127.0.0.1',port:5196,strictPort:true},logLevel:'error'});
await vite.listen();
let browser;
try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));
  let choosers=0;page.on('filechooser',()=>choosers++);
  await page.route('**/import-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/lighttable/style.css"><div id="root"></div><button id="roll">Roll</button><button id="mix">Mix</button>'}));
  await page.goto('http://127.0.0.1:5196/import-harness');
  const png=await page.evaluate(async()=>{
    const [{ImportRoll},{Repository}]=await Promise.all([import('/src/lighttable/ui/import-roll.ts'),import('/src/lighttable/data/repository.ts')]);
    const repo=new Repository();window.repo=repo;window.completed=[];window.mixResults=[];
    const importer=new ImportRoll(repo,async roll=>{window.completed.push(roll);});window.importer=importer;
    document.querySelector('#root').append(importer.dialog);
    document.querySelector('#roll').onclick=()=>importer.open();
    document.querySelector('#mix').onclick=()=>importer.openMix({onImported:async rolls=>{
      if(window.failCallback)throw Error('Test mix callback failure');
      window.mixResults.push(rolls);
    }});
    const c=document.createElement('canvas');c.width=120;c.height=90;const x=c.getContext('2d');x.fillStyle='#866';x.fillRect(0,0,120,90);x.fillStyle='#acf';x.fillRect(10,20,40,30);
    return c.toDataURL('image/png').split(',')[1];
  });
  const clickPicker=selector=>Promise.all([page.waitForEvent('filechooser'),page.click(selector)]);
  const photos=(n,prefix='p')=>Array.from({length:n},(_,i)=>({name:`${prefix}-${i}.png`,mimeType:'image/png',buffer:Buffer.from(png,'base64')}));
  const count=()=>page.evaluate(async()=>({rolls:(await window.repo.listRolls()).length,jobs:(await window.repo.pendingImports()).length}));
  const waitClosed=()=>page.waitForFunction(()=>!window.importer.dialog.open);
  const waitIdle=()=>page.waitForFunction(()=>window.importer.dialog.getAttribute('aria-busy')==='false');

  await clickPicker('#roll');assert.equal(choosers,1);
  assert.equal(await page.locator('[data-capacity="12"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-roll-files]').getAttribute('capture'),null);
  await page.click('[data-capacity="6"]');await page.setInputFiles('[data-roll-files]',photos(7));
  assert.equal(await page.locator('[data-save-roll]').isDisabled(),true);
  assert.match(await page.locator('.import-count').innerText(),/7 \/ 6.*Remove 1/);
  await page.locator('.candidate button').last().click();
  await page.click('[data-save-roll]');await waitClosed();assert.deepEqual(await count(),{rolls:1,jobs:0});
  await clickPicker('#roll');assert.equal(await page.locator('[data-capacity="12"]').getAttribute('aria-pressed'),'true','New standalone roll always resets to 12');
  await page.click('[data-close-import]');
  console.log('PASS: native picker, no capture, segmented capacity, overflow review, default reset to 12');

  await clickPicker('#mix');await page.setInputFiles('[data-roll-files]',photos(12,'a'));
  const beforeNext=choosers;
  await Promise.all([page.waitForEvent('filechooser'),page.click('[data-save-roll]')]);assert.equal(choosers,beforeNext+1,'Next opens native picker in the same user click');
  assert.equal(await page.locator('.import-step').innerText(),'2 / 2');
  assert.deepEqual(await count(),{rolls:1,jobs:0},'Next only holds first selection in RAM');
  await page.locator('[data-roll-files]').dispatchEvent('cancel');
  assert.equal(await page.locator('.roll-import-dialog').isVisible(),true,'Cancel second picker retains first draft');
  await page.click('[data-import-back]');assert.equal(await page.locator('.candidate').count(),12,'Back restores first selection');
  await clickPicker('[data-save-roll]');await page.setInputFiles('[data-roll-files]',photos(12,'b'));
  await page.evaluate(()=>{
    const r=window.repo,stage=r.stageAsset.bind(r);let writes=0;
    r.stageAsset=async(...args)=>{if(++writes===14)throw Error('Test second-roll storage failure');return stage(...args);};
    window.restoreStage=()=>r.stageAsset=stage;
  });
  await page.click('[data-save-roll]');await waitIdle();
  assert.match(await page.locator('.import-message').innerText(),/Test second-roll storage failure/);
  assert.deepEqual(await count(),{rolls:2,jobs:0},'First roll persists; failed second import job cleaned');
  assert.equal(await page.locator('.candidate').count(),12,'Second selection retained after write failure');
  await page.evaluate(()=>{window.restoreStage();window.failCallback=true;});
  await page.click('[data-save-roll]');await waitIdle();
  assert.match(await page.locator('.import-message').innerText(),/Test mix callback failure/);
  assert.deepEqual(await count(),{rolls:3,jobs:0},'Retry does not duplicate first completed roll');
  await page.evaluate(()=>window.failCallback=false);
  await page.click('[data-save-roll]');await waitClosed();
  assert.deepEqual(await count(),{rolls:3,jobs:0},'Callback retry reuses both completed rolls');
  assert.equal(await page.evaluate(()=>window.mixResults.length),1);
  assert.deepEqual(await page.evaluate(()=>window.mixResults[0].map(r=>r.capacity)),[12,12]);
  console.log('PASS: two-roll wizard, synchronous second picker, cancel/back recovery, independent storage/callback retry without duplicate rolls');

  await clickPicker('#mix');await page.click('[data-capacity="6"]');await page.setInputFiles('[data-roll-files]',photos(6,'cancel-a'));
  await clickPicker('[data-save-roll]');await page.setInputFiles('[data-roll-files]',photos(6,'cancel-b'));
  await page.evaluate(()=>{
    const r=window.repo,stage=r.stageAsset.bind(r);let writes=0;
    r.stageAsset=async(...args)=>{await stage(...args);if(++writes===2)await new Promise(resolve=>window.releaseImport=resolve);};
    window.restoreStage=()=>r.stageAsset=stage;
  });
  await page.click('[data-save-roll]');await page.waitForFunction(()=>!!window.releaseImport);
  assert.equal(await page.locator('.import-progress').isVisible(),true);
  assert.equal(await page.locator('.import-progress').getAttribute('max'),'12');
  assert.match(await page.locator('.import-message').innerText(),/Importing 1 of 12/);
  await page.click('[data-cancel-job]');await page.evaluate(()=>{window.releaseImport();window.restoreStage();});await waitIdle();
  assert.deepEqual(await count(),{rolls:3,jobs:0},'Cancel cleans only unfinished job, not completed originals');
  assert.equal(await page.locator('.candidate').count(),6);
  const output=resolve('lab-out/lighttable/import-v3');await mkdir(output,{recursive:true});
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    await page.screenshot({path:resolve(output,`${viewport.width}x${viewport.height}.png`)});
    const hitSizes=await page.locator('[data-capacity]').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
    assert.ok(hitSizes.every(r=>r.width>=44&&r.height>=44),'Frame counts retain 44px targets');
  }
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>{window.importer.dispose();return window.repo.close();});
  console.log('PASS: visible true import progress, cancellation retains selection and originals, portrait/landscape capacity targets');
}finally{await browser?.close();await vite.close();}
