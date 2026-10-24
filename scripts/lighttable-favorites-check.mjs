import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Real IndexedDB transactions verify snapshots, concurrent membership and Undo.
const vite=await createServer({server:{host:'127.0.0.1',port:5193,strictPort:true},logLevel:'error',plugins:[{name:'favorites-test-page',configureServer(server){server.middlewares.use('/__favorites-test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Favorites test</title><div id="app"></div>');});}}]});
let browser;
try{
  await vite.listen();browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5193/__favorites-test');
  const results=await page.evaluate(async()=>{
    const {Repository}=await import('/src/lighttable/data/repository.ts');
    const {createComposition}=await import('/src/lighttable/model/types.ts');
    const {pairId,compositionStateKey}=await import('/src/lighttable/data/types.ts');
    const repo=new Repository(),other=new Repository(),thumb=new Blob(['preview-one'],{type:'image/jpeg'});
    const originals=[new Blob(['original-A']),new Blob(['original-B'])],rolls=[];
    for(let i=0;i<2;i++){
      const job=await repo.beginImport(`Roll ${i}`,1);
      await repo.stageAsset(job,0,{id:job.assetIds[0],revision:1,blob:originals[i],preview:thumb,thumb,width:1200,height:900,owner:job.id});
      rolls.push(await repo.finishImport(job));
    }
    const project=await repo.createProject(rolls[0].id,rolls[1].id),ids=rolls.map(r=>r.assetIds[0]);
    const scene=createComposition(pairId(project,...ids),ids.map(assetId=>({assetId,assetRevision:1})),[{x:1200,y:900},{x:1200,y:900}]);
    scene.layers[0].levels={black:.1,mid:.4,white:.9};scene.frame.turns=1;
    await repo.ensureComposition(scene);
    const favorites=await Promise.all([repo.favoriteCurrent(project,scene,thumb),other.favoriteCurrent(project,scene,thumb)]);
    const favorite=favorites[0],fp=await repo.project(favorite.projectId),saved=await repo.composition(favorite.compositionId);
    const initial={deduplicated:favorites[0].id===favorites[1].id&&favorites[0].projectId===favorites[1].projectId&&(await repo.listFavorites()).length===1,independent:fp.id!==project.id&&saved.id!==scene.id,revision:saved.revision,kind:fp.kind,exact:saved.frame.turns===1&&saved.layers[0].levels.black===.1,originalRefs:saved.layers.every((l,i)=>l.placements[0].source.assetId===ids[i])};
    scene.layers[0].levels.black=.2;await repo.commit(scene,0);
    const isolated=(await repo.composition(favorite.compositionId)).layers[0].levels.black===.1;
    let immutable=false;try{await repo.commit(saved,1);}catch(e){immutable=e.message.includes('immutable');}
    const changed=structuredClone(saved);changed.layers[1].transform.scale=1.7;changed.effects.exposure=.3;
    const working=await repo.workingCopy(changed,fp);
    const workingCopy=working.project.kind==='draft'&&working.composition.id!==saved.id&&compositionStateKey(working.composition)===compositionStateKey(changed)&&(await repo.composition(saved.id)).layers[1].transform.scale===undefined;
    working.composition.effects.contrast=1.4;const edited=await repo.commit(working.composition,1);
    let conflict=false;try{await other.commit(working.composition,1);}catch(e){conflict=e.constructor.name==='ConflictError';}
    const variant=await repo.favoriteCurrent(working.project,edited,new Blob(['variant-preview']));
    const variantSaved=await repo.composition(variant.compositionId);
    const variants=variant.id!==favorite.id&&(await repo.listFavorites()).length===2&&variantSaved.effects.contrast===1.4&&variantSaved.effects.exposure===.3&&variantSaved.layers[1].transform.scale===1.7;
    const repeated=await repo.favoriteCurrent(fp,saved,new Blob(['ignored-preview']));
    const sameState=repeated.id===favorite.id&&await repeated.thumb.text()==='preview-one'&&(await repo.listFavorites()).length===2;
    const fork=await repo.fork(edited,working.project);
    const copyReachable=!fork.project.kind&&fork.composition.layers[1].transform.scale===1.7;
    const removed=await repo.removeFavorite(favorite.id);
    const membershipOnly=(await repo.listFavorites()).length===1&&!!await repo.composition(saved.id)&&!!await repo.project(fp.id);
    await repo.restoreFavorite(removed);
    const restored=(await repo.listFavorites()).find(f=>f.id===favorite.id);
    const undo=restored.createdAt===favorite.createdAt&&await restored.thumb.text()==='preview-one'&&compositionStateKey(await repo.composition(saved.id))===compositionStateKey(saved);
    await repo.removeFavorite(favorite.id);
    await repo.favoriteCurrent(fp,saved,thumb);await repo.restoreFavorite(removed);
    const undoAfterRelike=(await repo.listFavorites()).length===2&&(await repo.listFavorites()).some(f=>f.id===favorite.id);
    const originalsKept=(await repo.asset(ids[0])).blob.size===originals[0].size&&(await repo.asset(ids[1])).blob.size===originals[1].size&&repo.counters.assetsWritten===2;
    await repo.close();await other.close();
    const reopened=new Repository(),persisted=(await reopened.listFavorites()).length===2&&compositionStateKey(await reopened.composition(saved.id))===compositionStateKey(saved);
    const transaction=IDBDatabase.prototype.transaction,beforeProjects=(await reopened.listProjects()).length;
    const third=structuredClone(scene);third.frame.turns=3;
    IDBDatabase.prototype.transaction=function(names,mode,...rest){const tx=transaction.call(this,names,mode,...rest);if(this.name==='multik-lighttable'&&mode==='readwrite'&&Array.from(typeof names==='string'?[names]:names).includes('compositions'))queueMicrotask(()=>tx.abort());return tx;};
    let failed=false;try{await reopened.favoriteCurrent(project,third,thumb);}catch{failed=true;}finally{IDBDatabase.prototype.transaction=transaction;}
    const atomic=failed&&(await reopened.listFavorites()).length===2&&(await reopened.listProjects()).length===beforeProjects;
    const retried=await reopened.favoriteCurrent(project,third,thumb),retry=(await reopened.listFavorites()).length===3&&!!await reopened.composition(retried.compositionId);
    let mismatch=false;try{await reopened.favoriteCurrent({...project,a:99},scene,thumb);}catch{mismatch=true;}
    // Exercise the standalone Library's real card heart, without nesting interactive buttons.
    const {Library}=await import('/src/lighttable/ui/library.ts');
    const library=new Library(document.querySelector('#app'),reopened,{open:async()=>true});await library.open('favorites');
    window.favoriteTest={repo:reopened,library,count:3};
    return {initial,isolated,immutable,workingCopy,conflict,variants,sameState,copyReachable,membershipOnly,undo,undoAfterRelike,originalsKept,persisted,atomic,retry,mismatch};
  });
  assert.deepEqual(results,{initial:{deduplicated:true,independent:true,revision:1,kind:'favorite',exact:true,originalRefs:true},isolated:true,immutable:true,workingCopy:true,conflict:true,variants:true,sameState:true,copyReachable:true,membershipOnly:true,undo:true,undoAfterRelike:true,originalsKept:true,persisted:true,atomic:true,retry:true,mismatch:true});
  await page.locator('.favorite-mark').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.favorite-card').length===2);
  assert.equal(await page.locator('.favorite-notice').isVisible(),true);
  assert.equal(await page.locator('.library-dialog').evaluate(e=>e.open),true);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.favorite-card').length===3);
  assert.equal(await page.locator('.favorite-notice').isVisible(),false);
  await page.evaluate(async()=>{window.favoriteTest.library.dispose();await window.favoriteTest.repo.close();});
  // A separate browser context exercises the real workspace and GPU-backed covers.
  const workspace=await browser.newPage({viewport:{width:402,height:874},hasTouch:true});
  workspace.on('pageerror',e=>errors.push(e.message));
  const idle=()=>workspace.waitForFunction(()=>window.__lighttable?.renderer.ready&&!window.__lighttable.navigation.busy);
  const heart=workspace.locator('[data-action=favorite]');
  await workspace.goto('http://127.0.0.1:5193/lighttable/');await idle();await workspace.click('[data-close-library]');
  await workspace.evaluate(async()=>{
    const l=window.__lighttable,{demoSources}=await import('/src/lighttable/ui/fixtures.ts'),{Selection,importFiles}=await import('/src/lighttable/data/import.ts');
    const blobs=await demoSources(),selection=new Selection();selection.setCapacity(6);
    selection.add(Array.from({length:6},(_,i)=>new File([blobs[i%2]],`${i}.png`,{type:'image/png'})));
    const roll=await importFiles(l.repo,selection,'Saved variants',()=>{});
    await l.navigation.open(await l.repo.createProject(roll.id,roll.id));await l.navigation.select('b',1);
    window.variantAssets=l.repo.counters.assetsWritten;
  });await idle();
  await heart.click();await idle();await workspace.waitForFunction(async()=> (await window.__lighttable.repo.listFavorites()).length===1);
  assert.equal(await heart.getAttribute('aria-pressed'),'true');
  await workspace.evaluate(async()=>{const l=window.__lighttable;window.originalVariant=(await l.repo.listFavorites())[0];window.originalSnapshot=await l.repo.composition(window.originalVariant.compositionId);});
  await workspace.click('[data-action=library]');await workspace.click('[data-home-tab=favorites]');await workspace.click('.mix-card[data-favorite]');await idle();
  await workspace.setViewportSize({width:874,height:402});await workspace.waitForFunction(()=>window.__lighttable.session.editing);
  await workspace.click('[data-mode=levels]');await workspace.locator('[data-level=black]').focus();await workspace.keyboard.press('Shift+ArrowUp');
  assert.equal(await heart.getAttribute('aria-pressed'),'false');
  assert.equal(await workspace.evaluate(()=>window.__lighttable.session.draft.layers[1].levels.black),.05);
  assert.equal(await workspace.evaluate(async()=>JSON.stringify(await window.__lighttable.repo.composition(window.originalVariant.compositionId))===JSON.stringify(window.originalSnapshot)),true);
  await workspace.click('[data-mode=browse]');await idle();
  assert.equal(await workspace.evaluate(()=>window.__lighttable.navigation.project.kind),'draft');
  const draftId=await workspace.evaluate(()=>window.__lighttable.session.draft.id);
  await workspace.reload();await idle();await workspace.waitForFunction(()=>window.__lighttable.navigation.project?.kind==='draft');
  assert.equal(await workspace.evaluate(()=>window.__lighttable.session.draft.id),draftId);
  assert.equal(await workspace.evaluate(()=>window.__lighttable.session.draft.layers[1].levels.black),.05);
  assert.equal(await workspace.evaluate(()=>window.__lighttable.session.draft.layers.every(l=>l.transform.xMm===0&&l.transform.yMm===0&&l.transform.turns===0)),true);
  assert.equal(await heart.getAttribute('aria-pressed'),'false');
  await heart.click();await idle();await workspace.waitForFunction(async()=> (await window.__lighttable.repo.listFavorites()).length===2);
  assert.equal(await heart.getAttribute('aria-pressed'),'true');
  // Reload drops test globals, so identify the older saved snapshot from the two memberships.
  const originalId=await workspace.evaluate(async()=>{const l=window.__lighttable,rows=await l.repo.listFavorites();for(const f of rows){const c=await l.repo.composition(f.compositionId);if(!c.layers[1].levels)return f.projectId;}});
  assert.ok(originalId);
  const visibleBefore=await workspace.evaluate(()=>JSON.stringify(window.__lighttable.session.draft));
  await heart.click();await idle();assert.equal(await heart.getAttribute('aria-pressed'),'false');
  assert.equal(await workspace.evaluate(()=>JSON.stringify(window.__lighttable.session.draft)),visibleBefore);
  await workspace.locator('.workspace>.favorite-notice button').click();await workspace.waitForFunction(()=>document.querySelector('[data-action=favorite]').getAttribute('aria-pressed')==='true');await idle();
  assert.equal(await heart.getAttribute('aria-pressed'),'true');
  assert.equal(await workspace.evaluate(async()=> (await window.__lighttable.repo.listFavorites()).length),2);
  await workspace.click('[data-action=library]');await workspace.locator(`.mix-card[data-project="${originalId}"]`).click();await idle();
  assert.equal(await workspace.evaluate(()=>window.__lighttable.session.draft.layers[1].levels),undefined);
  assert.equal(await heart.getAttribute('aria-pressed'),'true');
  const savedId=await workspace.evaluate(()=>window.__lighttable.session.draft.id);
  await heart.click();await idle();assert.equal(await workspace.evaluate(()=>window.__lighttable.session.draft.id),savedId);
  await workspace.locator('.workspace>.favorite-notice button').click();await workspace.waitForFunction(()=>document.querySelector('[data-action=favorite]').getAttribute('aria-pressed')==='true');await idle();
  assert.equal(await workspace.evaluate(()=>window.__lighttable.session.draft.id),savedId);
  assert.equal(await heart.getAttribute('aria-pressed'),'true');
  assert.equal(await workspace.evaluate(async()=> (await window.__lighttable.repo.listFavorites()).length),2);
  assert.deepEqual(errors,[]);
  console.log('PASS: workspace heart outlines after Levels edit; hidden working draft survives reload; new like preserves old Library variant; unlike/Undo retains open composition');
  console.log('PASS: concurrent same-state likes deduplicate; edited Library state creates a new immutable variant with shared originals');
  console.log('PASS: working copies preserve prior variants; membership Undo restores the complete saved state and prevents duplicate re-likes');
  console.log('PASS: reload, CAS conflicts, atomic failure/retry, pair validation and standalone Library unlike/Undo');
}finally{await browser?.close();await vite.close();}
