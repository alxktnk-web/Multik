import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
let vite;let base=process.env.LIGHTTABLE_URL;
if(!base){vite=await createServer({server:{host:'127.0.0.1',port:5181,strictPort:true},logLevel:'error'});await vite.listen();base='http://127.0.0.1:5181';}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/lighttable/');await page.waitForFunction(()=>window.__lighttable?.renderer.ready);
  const result=await page.evaluate(async()=>{
    const {Repository}=await import('/src/lighttable/data/repository.ts');
    const {Selection,importFiles}=await import('/src/lighttable/data/import.ts');
    const {LegacyReader}=await import('/src/lighttable/data/legacy-reader.ts');
    const {createComposition}=await import('/src/lighttable/model/types.ts');
    const repo=new Repository(),other=new Repository();
    const c=document.createElement('canvas');c.width=64;c.height=48;c.getContext('2d').fillRect(0,0,64,48);const blob=await new Promise(r=>c.toBlob(r));
    const files=Array.from({length:6},(_,i)=>new File([blob],`${i}.png`,{type:'image/png'}));
    const selection=new Selection();selection.setCapacity(6);selection.add(files);const roll=await importFiles(repo,selection,'Native',()=>{});
    const asset=await repo.asset(roll.assetIds[0]);const bytes=async b=>Array.from(new Uint8Array(await b.arrayBuffer()));
    const preserved=JSON.stringify(await bytes(asset.blob))===JSON.stringify(await bytes(blob));
    const scene=createComposition('cas',[{assetId:roll.assetIds[0],assetRevision:1},{assetId:roll.assetIds[1],assetRevision:1}],[{x:64,y:48},{x:64,y:48}]);
    await repo.ensureComposition(scene);const first=await repo.commit(scene,0);let conflict=false;try{await other.commit(scene,0);}catch(e){conflict=e.constructor.name==='ConflictError';}
    const version=(await repo.composition('cas')).revision;
    const original=IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction=function(names,mode,...rest){const tx=original.call(this,names,mode,...rest);if(this.name==='multik-lighttable'&&mode==='readwrite'&&Array.from(typeof names==='string'?[names]:names).includes('compositions'))queueMicrotask(()=>tx.abort());return tx;};
    let failed=false;try{await repo.commit(first,1);}catch{failed=true;}finally{IDBDatabase.prototype.transaction=original;}
    const retained=(await repo.composition('cas')).revision;await repo.commit(first,1);
    const job=await repo.beginImport('Incomplete',6);let incomplete=false;try{await repo.finishImport(job);}catch{incomplete=true;}const hidden=!(await repo.listRolls()).some(r=>r.id===job.rollId);await repo.cancelImport(job);
    const broken=new Selection();broken.setCapacity(6);broken.add([...files.slice(0,5),new File(['broken'],'bad.png',{type:'image/png'})]);let bad=false;
    try{await importFiles(repo,broken,'Bad',()=>{});}catch{bad=true;}
    const noPartial=!(await repo.listRolls()).some(r=>r.name==='Bad')&&(await repo.pendingImports()).length===0;
    // Build a disposable v1 fixture, then instrument ALL legacy transactions.
    await new Promise((resolve,reject)=>{const q=indexedDB.open('multik-app',1);q.onupgradeneeded=()=>{q.result.createObjectStore('rolls',{keyPath:'id'});q.result.createObjectStore('photos');};q.onerror=reject;q.onsuccess=()=>{const db=q.result,tx=db.transaction(['rolls','photos'],'readwrite');tx.objectStore('rolls').put({id:'old',name:'Classic',length:6,photos:Array.from({length:6},()=>({w:64,h:48}))});for(let i=0;i<6;i++)tx.objectStore('photos').put(blob,`old:${i}`);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;};});
    let oldWrites=0;
    IDBDatabase.prototype.transaction=function(names,mode,...rest){if(this.name==='multik-app'&&mode&&mode!=='readonly'){oldWrites++;throw Error('Legacy write attempted');}return original.call(this,names,mode,...rest);};
    const legacy=new LegacyReader();const [old]=await legacy.rolls();const abort=new AbortController();let interrupted=false;
    try{await legacy.adopt(repo,old,n=>{if(n===2)abort.abort();},abort.signal);}catch{interrupted=true;}
    const beforeResume=(await repo.pendingImports()).find(j=>j.origin==='old');const hiddenAdoption=!(await repo.listRolls()).some(r=>r.origin==='old');
    const adopted=await legacy.adopt(repo,old,()=>{}),again=await legacy.adopt(repo,old,()=>{});
    const copied=await repo.asset(adopted.assetIds[0]);const exact=JSON.stringify(await bytes(copied.blob))===JSON.stringify(await bytes(blob));
    legacy.close();IDBDatabase.prototype.transaction=original;
    // Delete originals only as the fixture's v1 owner, never through v2.
    await new Promise((resolve,reject)=>{const q=indexedDB.open('multik-app',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction(['rolls','photos'],'readwrite');tx.objectStore('rolls').clear();tx.objectStore('photos').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;};});
    const independent=!!(await repo.asset(adopted.assetIds[0])).blob;
    await repo.close();await other.close();
    return {preserved,conflict,version,failed,retained,incomplete,hidden,bad,noPartial,oldWrites,interrupted,hiddenAdoption,resumable:!!beforeResume,exact,independent,dedup:adopted.id===again.id,n:adopted.assetIds.length};
  });
  assert.deepEqual(result,{preserved:true,conflict:true,version:1,failed:true,retained:1,incomplete:true,hidden:true,bad:true,noPartial:true,oldWrites:0,interrupted:true,hiddenAdoption:true,resumable:true,exact:true,independent:true,dedup:true,n:6});
  assert.deepEqual(errors,[]);
  console.log('PASS: original bytes preserved, CAS conflict + transaction abort/retry, hidden partial imports, bad-file cleanup');
  console.log('PASS: interrupted legacy adoption resumes/deduplicates, 0 legacy writes, independent originals after Classic deletion');
}finally{await browser.close();await vite?.close();}
