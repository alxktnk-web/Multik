import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Exercise the repository against real IndexedDB without mounting the UI under development.
const vite=await createServer({server:{host:'127.0.0.1',port:5193,strictPort:true},logLevel:'error',plugins:[{name:'favorites-test-page',configureServer(server){server.middlewares.use('/__favorites-test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Favorites test</title>');});}}]});
let browser;
try{
  await vite.listen();browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5193/__favorites-test');
  const results=await page.evaluate(async()=>{
    const {Repository}=await import('/src/lighttable/data/repository.ts');
    const {createComposition}=await import('/src/lighttable/model/types.ts');
    const {pairId}=await import('/src/lighttable/data/types.ts');
    const repo=new Repository(),other=new Repository(),thumb=new Blob(['preview-one'],{type:'image/jpeg'});
    const originals=[new Blob(['original-A']),new Blob(['original-B'])];
    const rolls=[];
    for(let i=0;i<2;i++){
      const job=await repo.beginImport(`Roll ${i}`,1);
      await repo.stageAsset(job,0,{id:job.assetIds[0],revision:1,blob:originals[i],preview:thumb,thumb,width:1200,height:900,owner:job.id});
      rolls.push(await repo.finishImport(job));
    }
    const project=await repo.createProject(rolls[0].id,rolls[1].id);
    const ids=rolls.map(r=>r.assetIds[0]);
    const scene=createComposition(pairId(project,...ids),ids.map(assetId=>({assetId,assetRevision:1})),[{x:1200,y:900},{x:1200,y:900}]);
    scene.layers[0].levels={black:.1,mid:.4,white:.9};scene.frame.turns=1;
    await repo.ensureComposition(scene);
    const favorites=await Promise.all([repo.favoriteCurrent(project,scene,thumb),other.favoriteCurrent(project,scene,thumb)]);
    const favorite=favorites[0],fp=await repo.project(favorite.projectId),saved=await repo.composition(favorite.compositionId);
    const initial={deduplicated:favorites[0].id===favorites[1].id&&favorites[0].projectId===favorites[1].projectId&&(await repo.listFavorites()).length===1,independent:fp.id!==project.id&&saved.id!==scene.id,revision:saved.revision,kind:fp.kind,exact:saved.frame.turns===1&&saved.layers[0].levels.black===.1,originalRefs:saved.layers.every((l,i)=>l.placements[0].source.assetId===ids[i])};
    scene.layers[0].levels.black=.2;await repo.commit(scene,0);
    const isolated=(await repo.composition(favorite.compositionId)).layers[0].levels.black===.1;
    saved.layers[1].transform.scale=1.7;const edited=await repo.commit(saved,1);
    let conflict=false;try{await other.commit(saved,1);}catch(e){conflict=e.constructor.name==='ConflictError';}
    await repo.updateFavoriteThumbnail(fp.id,new Blob(['stale']),1);
    const staleIgnored=await (await repo.listFavorites())[0].thumb.text()==='preview-one';
    await repo.updateFavoriteThumbnail(fp.id,new Blob(['preview-two']),edited.revision);
    const thumbnailUpdated=await (await repo.listFavorites())[0].thumb.text()==='preview-two';
    const fork=await repo.fork(edited,fp);
    const copyReachable=fork.project.kind!=='favorite'&&(await repo.listProjects()).some(p=>p.id===fork.project.id)&&fork.composition.layers[1].transform.scale===1.7&&(await repo.listFavorites()).length===1;
    const repeated=await repo.favoriteCurrent(project,scene,thumb);
    const editRetained=repeated.projectId===fp.id&&(await repo.composition(favorite.compositionId)).layers[1].transform.scale===1.7;
    await repo.removeFavorite(favorite.id);
    const removed=(await repo.listFavorites()).length===0;
    const originalsKept=(await repo.asset(ids[0])).blob.size===originals[0].size&&(await repo.asset(ids[1])).blob.size===originals[1].size&&(await repo.listRolls()).length===2;
    const snapshotKept=!!await repo.project(fp.id)&&!!await repo.composition(favorite.compositionId);
    const rejoined=await repo.favoriteCurrent(fp,edited,new Blob(['rejoined']));
    const sameProject=rejoined.projectId===fp.id&&(await repo.listFavorites()).length===1;
    await repo.close();await other.close();
    const reopened=new Repository();const persisted=(await reopened.listFavorites())[0].projectId===fp.id;
    const transaction=IDBDatabase.prototype.transaction;
    const beforeProjects=(await reopened.listProjects()).length;
    await reopened.removeFavorite(favorite.id);
    IDBDatabase.prototype.transaction=function(names,mode,...rest){const tx=transaction.call(this,names,mode,...rest);if(this.name==='multik-lighttable'&&mode==='readwrite'&&Array.from(typeof names==='string'?[names]:names).includes('compositions'))queueMicrotask(()=>tx.abort());return tx;};
    let failed=false;try{await reopened.favoriteCurrent(project,scene,thumb);}catch{failed=true;}finally{IDBDatabase.prototype.transaction=transaction;}
    const atomic=failed&&(await reopened.listFavorites()).length===0&&(await reopened.listProjects()).length===beforeProjects;
    const retried=await reopened.favoriteCurrent(project,scene,thumb);
    const retry=(await reopened.listFavorites()).length===1&&!!await reopened.composition(retried.compositionId);
    let mismatch=false;try{await reopened.favoriteCurrent({...project,a:99},scene,thumb);}catch{mismatch=true;}
    await reopened.close();
    return {initial,copyReachable,isolated,conflict,staleIgnored,thumbnailUpdated,editRetained,removed,originalsKept,snapshotKept,sameProject,persisted,atomic,retry,mismatch};
  });
  assert.deepEqual(results,{initial:{deduplicated:true,independent:true,revision:1,kind:'favorite',exact:true,originalRefs:true},copyReachable:true,isolated:true,conflict:true,staleIgnored:true,thumbnailUpdated:true,editRetained:true,removed:true,originalsKept:true,snapshotKept:true,sameProject:true,persisted:true,atomic:true,retry:true,mismatch:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: concurrent likes deduplicate, independent editable snapshots preserve source references, source edits isolated');
  console.log('PASS: CAS edit conflict, stale thumbnail ignored, unlike/re-like keeps originals and current editor, reload persistence');
  console.log('PASS: aborted favorite transaction leaves no partial project, retry succeeds, mismatched pair rejected');
}finally{await browser?.close();await vite.close();}
