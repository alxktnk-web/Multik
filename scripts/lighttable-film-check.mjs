import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const candidateVersion=Number(process.env.LIGHTTABLE_TEST_PROFILE??3);
assert.ok([3,4].includes(candidateVersion),'Only test profiles 3/4 are supported');
const out=candidateVersion===3?'lab-out/lighttable/film':'lab-out/lighttable/dense';
await mkdir(out,{recursive:true});
const frozen=await readFile('scripts/fixtures/lighttable-profile2.frag','utf8');
const vite=await createServer({server:{host:'127.0.0.1',port:5192,strictPort:true},logLevel:'error'});
await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/film-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Film render test</title>'}));
  await page.goto('http://127.0.0.1:5192/film-harness');
  await page.evaluate(async({frozen,candidateVersion})=>{
    const {Renderer}=await import('/src/lighttable/render/renderer.ts');
    const {Session}=await import('/src/lighttable/model/session.ts');
    const {createComposition}=await import('/src/lighttable/model/types.ts');
    const f=await import('/scripts/fixtures/film-analysis.mjs');
    const c=f.canvas();document.body.append(c);
    const composition=createComposition('film-test',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:800,y:600},{x:800,y:600}],51);
    const session=new Session(composition);session.viewport={width:800,height:600,zoom:1,pan:{x:0,y:0}};
    const renderer=new Renderer(c,session),oracle=renderer.resources.program(frozen);
    function read(){
      renderer.draw(performance.now());const raw=new Uint8Array(c.width*c.height*4);
      renderer.gl.readPixels(0,0,c.width,c.height,renderer.gl.RGBA,renderer.gl.UNSIGNED_BYTE,raw);
      // Normalize GL lower-left coordinates for all image comparisons/probes.
      const data=new Uint8Array(raw.length);
      for(let y=0;y<c.height;y++)data.set(raw.subarray((c.height-y-1)*c.width*4,(c.height-y)*c.width*4),y*c.width*4);
      return data;
    }
    let serial=0;
    async function load(a,b,stored){
      const n=serial++,inputs=[{id:`a-${n}`,blob:a},{id:`b-${n}`,blob:b}];
      if(stored)stored.layers.forEach((l,i)=>l.placements[0].source.assetId=inputs[i].id);
      await renderer.loadPair(inputs,true,stored);return inputs;
    }
    window.h={candidateVersion,f,session,renderer,oracle,read,load,composition,black:await f.flat([0,0,0]),atlas:await f.atlas(),artifacts:[]};
  },{frozen,candidateVersion});

  const numeric=await page.evaluate(async()=>{
    const {f,renderer:r,session:s,oracle,read,load,black,atlas}=window.h;
    await load(atlas,black);
    const sample=(data,i)=>Array.from(data.slice(((Math.floor(i/8)*100+50)*800+i%8*100+50)*4,((Math.floor(i/8)*100+50)*800+i%8*100+50)*4+3));
    const regression=[],oracleErrors=[];
    for(const exposure of [-2,0,2])for(const contrast of [.5,1,1.5]){
      s.draft.effects={...s.draft.effects,halo:0,exposure,contrast};s.draft.profile.version=2;
      const current=read(),program=r.programs.present;r.programs.present=oracle;
      const baseline=read();r.programs.present=program;regression.push(f.diff(current,baseline));
      s.draft.profile.version=window.h.candidateVersion;const candidate=read();
      for(let i=0;i<f.patchColors.length;i++){
        const linear=f.patchColors[i].map(v=>f.decode(v/255));
        const source=window.h.candidateVersion===4?f.denseReference(linear):linear;
        const expected=f.reference3(source.map(v=>v*2**exposure),contrast).map(v=>v*255);
        const actual=sample(candidate,i);
        oracleErrors.push(Math.max(...actual.map((v,k)=>Math.abs(v-expected[k]))));
      }
    }
    // Gray response over exposure stops; paired lights prove actual additive mixing.
    const steps=[];
    for(const pair of [[0,0],[32,32],[64,64],[118,0],[118,118],[180,180],[220,220],[255,0],[255,255]]){
      await load(await f.flat([pair[0],pair[0],pair[0]]),await f.flat([pair[1],pair[1],pair[1]]));
      s.draft.effects.halo=0;const result={input:pair};
      for(const version of [2,window.h.candidateVersion]){s.draft.profile.version=version;result[`p${version}`]=sample(read(),0);}
      steps.push(result);
    }
    // Neutral response must be monotone for every exposure; no NaN / inversion.
    const ramp=await f.atlas();await load(ramp,black);s.draft.effects.halo=0;s.draft.profile.version=window.h.candidateVersion;
    const monotone=[];
    for(const ev of [-2,-1,0,1,2]){
      s.draft.effects.exposure=ev;const d=read();monotone.push(Array.from({length:16},(_,i)=>sample(d,i)[0]));
    }
    // No exposure/threshold coupling: two medium lights never create source halo.
    const gray=await f.flat([180,180,180]);await load(gray,gray);s.draft.profile.version=window.h.candidateVersion;
    s.draft.effects.halo=0;const off=read();s.draft.effects.halo=1;const on=read();
    const falseHalo=f.diff(off,on);
    // White interior stays neutral; red spill follows translated source and padding.
    await load(await f.scene('disc'),black);s.draft.profile.version=window.h.candidateVersion;s.draft.effects.halo=0;
    const point=(d,x,y)=>Array.from(d.slice((y*800+x)*4,(y*800+x)*4+3));
    const discOff=read();s.draft.effects.halo=1;const discOn=read();
    const center={off:point(discOff,300,300),on:point(discOn,300,300)};
    const spill={off:point(discOff,380,300),on:point(discOn,380,300)};
    s.draft.layers[0].transform.xMm=4.5;
    const moved=read(),edge=point(moved,88,95),translated=point(moved,480,300);
    // Swapping source-associated variation too is necessary for full halo symmetry;
    // pure exposure addition is commutative independently of ordered pair identity.
    const branches=await f.scene('branches'),texture=await f.scene('texture');
    await load(branches,texture);s.draft.effects.halo=1;s.draft.effects.haloRadius=1.6;
    s.draft.effects.haloThreshold=.5;s.draft.layers[0].transform={xMm:3,yMm:-2,turns:1,scale:1.7};
    s.draft.profile.version=2;const haloCurrent=read(),program=r.programs.present;r.programs.present=oracle;
    regression.push(f.diff(haloCurrent,read()));r.programs.present=program;
    await load(branches,texture);s.draft.profile.version=window.h.candidateVersion;s.draft.effects.halo=0;const ab=read();
    await load(texture,branches);s.draft.profile.version=window.h.candidateVersion;s.draft.effects.halo=0;const ba=read();
    const symmetry=f.diff(ab,ba);
    // Cached source masks are profile independent; 2 -> 3 -> 2 must be reversible.
    const inputs=await load(branches,texture);const stored=structuredClone(s.draft);
    await r.loadPair(inputs,true,stored);s.draft.profile.version=2;const before=read();
    const metrics={...r.metrics},builds=r.haloBuilds;
    s.draft.profile.version=window.h.candidateVersion;read();s.draft.profile.version=2;const back=read();
    const switchCost={uploads:r.metrics.uploads-metrics.uploads,compilations:r.metrics.compilations-metrics.compilations,bytes:r.metrics.liveBytes-metrics.liveBytes,haloBuilds:r.haloBuilds-builds};
    // Instrument the actual candidate hot path, including changing mask parameters.
    const hot={readPixels:0,encode:0,cpuPixels:0,upload:0,compile:0,idbWrite:0},undo=[];
    const wrap=(proto,name,key)=>{const original=proto[name];proto[name]=function(...args){hot[key]++;return original.apply(this,args);};undo.push(()=>proto[name]=original);};
    for(const [proto,name,key] of [
      [WebGL2RenderingContext.prototype,'readPixels','readPixels'],
      [WebGL2RenderingContext.prototype,'texImage2D','upload'],
      [WebGL2RenderingContext.prototype,'compileShader','compile'],
      [HTMLCanvasElement.prototype,'toBlob','encode'],
      [CanvasRenderingContext2D.prototype,'getImageData','cpuPixels'],
      [CanvasRenderingContext2D.prototype,'putImageData','cpuPixels'],
      [IDBObjectStore.prototype,'put','idbWrite'],[IDBObjectStore.prototype,'add','idbWrite'],
    ])wrap(proto,name,key);
    const hotBase=r.metrics.liveBytes;
    try{
      s.draft.profile.version=window.h.candidateVersion;
      for(let i=0;i<8;i++){
        s.draft.layers[0].transform.xMm=i/4;
        s.draft.effects.haloRadius=i%2?.2:1.6;s.draft.effects.haloThreshold=i%2?.5:.95;
        s.draft.effects.exposure=i%2?-2:2;s.draft.effects.balance=i%2?-2:2;
        r.draw(performance.now());
      }
    }finally{undo.reverse().forEach(fn=>fn());}
    const hotBytes=r.metrics.liveBytes-hotBase;
    return {regression,oracleMaxError:Math.max(...oracleErrors),steps,monotone,falseHalo,center,spill,edge,translated,symmetry,switchCost,switchBack:f.diff(before,back),hot,hotBytes};
  });
  assert.ok(numeric.regression.every(x=>x.max===0),'profile 2 changed vs frozen v8');
  assert.ok(numeric.oracleMaxError<1.6,JSON.stringify(numeric)); // 8-bit texture/target rounding + GPU sRGB precision.
  for(const row of numeric.monotone)assert.ok(row.every((v,i)=>!i||v>=row[i-1]));
  assert.equal(numeric.falseHalo.max,0);
  assert.deepEqual(numeric.center.on,numeric.center.off);
  assert.ok(numeric.spill.on[0]>numeric.spill.off[0]+8);
  assert.ok(numeric.spill.on[0]>numeric.spill.on[1]+8);
  assert.ok(numeric.edge[0]>numeric.edge[1]+5);
  assert.ok(Math.abs(numeric.translated[0]-numeric.spill.on[0])<3);
  assert.equal(numeric.symmetry.max,0);
  assert.deepEqual(numeric.switchCost,{uploads:0,compilations:0,bytes:0,haloBuilds:0});
  assert.equal(numeric.switchBack.max,0);
  assert.ok(Object.values(numeric.hot).every(n=>n===0));assert.equal(numeric.hotBytes,0);
  console.log('PASS: frozen profile 2, independent CPU oracle, gray steps, halo, commutativity, allocation-free profile switch');

  const comparisons=await page.evaluate(async()=>{
    const {f,renderer:r,session:s,read,load,black,atlas}=window.h;
    const photo=async name=>{const res=await fetch(`/scripts/fixtures/film-photos/${name}`);if(!res.ok)throw Error(name);return res.blob();};
    const astronaut=await photo('astronaut.png'),cat=await photo('chelsea.png'),coffee=await photo('coffee.png'),rocket=await photo('rocket.jpg');
    const scenes=[
      ['patches',atlas,atlas,0,0],
      ['branches',await f.scene('branches'),await f.scene('texture'),0,.35],
      ['silhouette',await f.scene('silhouette'),await f.scene('texture'),0,.35],
      ['portrait-cat',astronaut,cat,-.5,.35],
      ['coffee-cat',coffee,cat,0,.35],
      ['rocket-portrait',rocket,astronaut,0,.35],
      ['halo',await f.scene('disc'),black,0,1],
    ];
    const records=[];
    for(const [name,a,b,exposure,halo] of scenes){
      await load(a,b);s.draft.effects.exposure=exposure;s.draft.effects.halo=halo;
      const sheet=f.canvas(1600,1260),ctx=sheet.getContext('2d');ctx.fillStyle='#242424';ctx.fillRect(0,0,1600,1260);ctx.fillStyle='white';ctx.font='18px sans-serif';
      ctx.fillText(`${name} | sources A / B | seed 51 | balance 0 | contrast 1 | EV ${exposure} | halo ${halo} / .65mm / .75`,12,24);
      for(const [i,blob] of [a,b].entries()){
        const im=await createImageBitmap(blob),scale=Math.min(800/im.width,600/im.height);
        ctx.drawImage(im,i*800+(800-im.width*scale)/2,30+(600-im.height*scale)/2,im.width*scale,im.height*scale);im.close();
      }
      const outputs=[];
      for(const [column,version] of [2,window.h.candidateVersion].entries()){
        s.draft.profile.version=version;const data=read();outputs.push(data);
        ctx.fillStyle='white';ctx.fillText(`Profile ${version}${version===window.h.candidateVersion?' — candidate':''}`,12+column*800,654);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(data),800,600),column*800,660);
      }
      window.h.artifacts.push({name:`${name}.jpg`,data:sheet.toDataURL('image/jpeg',.94)});
      records.push({name,composition:structuredClone(s.draft),difference:f.diff(outputs[0],outputs[1])});
    }
    return records;
  });
  for(const artifact of await page.evaluate(()=>window.h.artifacts)){
    await writeFile(`${out}/${artifact.name}`,Buffer.from(artifact.data.split(',')[1],'base64'));
  }
  console.log(`PASS: seven labelled source/profile-2/profile-${candidateVersion} comparisons generated`);

  const parity=await page.evaluate(async()=>{
    const {f,renderer:r,session:s,read,load}=window.h;
    const inputs=await load(await f.scene('branches'),await f.scene('texture'));
    s.draft.profile.version=window.h.candidateVersion;s.draft.effects.halo=1;s.draft.effects.haloRadius=1.6;
    s.draft.layers[0].transform={xMm:3,yMm:-2,turns:1,scale:1.7};s.draft.frame.turns=1;
    const snapshot=structuredClone(s.draft),base=r.metrics.liveBytes;
    const exportOne=tile=>r.exportImage(snapshot,inputs,2000,new AbortController().signal,()=>{},tile);
    const mono=await exportOne(2000),tiled=await exportOne(257);
    const a=await f.pixels(mono.blob),b=await f.pixels(tiled.blob);
    // Matched geometry with a lower-resolution preview; compare smooth interior
    // patches separately from unavoidable resampling and JPEG edge differences.
    s.viewport={width:600,height:800,zoom:1,pan:{x:0,y:0}};
    const preview=read();
    const im=await createImageBitmap(mono.blob),small=f.canvas(600,800),ctx=small.getContext('2d');
    ctx.drawImage(im,0,0,600,800);im.close();const jpeg=ctx.getImageData(0,0,600,800).data;
    const previewDifference=f.diff(preview,jpeg);
    // Stronger same-resolution proof: render the preview's present into RGBA8
    // FBO at export dimensions, compare to decoded JPEG with codec allowance.
    const target=r.resources.texture(1500,2000);
    r.target(target);r.gl.viewport(0,0,1500,2000);
    const {inverse,filmToScreen}=await import('/src/lighttable/model/transforms.ts');
    r.present(snapshot,r.pair,inverse(filmToScreen(snapshot.frame,{width:1500,height:2000,zoom:1,pan:{x:0,y:0}})),1500,2000);
    const raw=new Uint8Array(1500*2000*4);r.gl.readPixels(0,0,1500,2000,r.gl.RGBA,r.gl.UNSIGNED_BYTE,raw);
    const flipped=new Uint8Array(raw.length);for(let y=0;y<2000;y++)flipped.set(raw.subarray((1999-y)*1500*4,(2000-y)*1500*4),y*1500*4);
    r.resources.release(target);r.gl.bindFramebuffer(r.gl.FRAMEBUFFER,null);
    const sameResolution=f.diff(flipped,a.data);
    const pending=exportOne(257);s.draft.effects.exposure=1;const isolated=await pending;
    const isolatedPixels=await f.pixels(isolated.blob);
    const unchanged=JSON.stringify(snapshot)===JSON.stringify({...s.draft,effects:{...s.draft.effects,exposure:snapshot.effects.exposure}});
    const cancel=new AbortController();let cancelled=false;
    try{await r.exportImage(snapshot,inputs,2000,cancel.signal,()=>cancel.abort());}catch{cancelled=cancel.signal.aborted;}
    const restoredBytes=r.metrics.liveBytes;
    window.h.artifacts=[{name:'candidate-tiled.jpg',data:await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(tiled.blob);})}];
    return {tiled:f.diff(a.data,b.data),previewDifference,sameResolution,snapshot:f.diff(isolatedPixels.data,b.data),unchanged,cancelled,base,restoredBytes,dimensions:[tiled.width,tiled.height]};
  });
  assert.ok(parity.tiled.mae<1,JSON.stringify(parity));
  assert.ok(parity.previewDifference.mae<4,JSON.stringify(parity));
  assert.ok(parity.sameResolution.mae<3,JSON.stringify(parity)); // JPEG 4:2:0 around saturated edges.
  assert.equal(parity.snapshot.max,0);
  assert.ok(parity.unchanged&&parity.cancelled);
  assert.equal(parity.base,parity.restoredBytes);
  assert.deepEqual(parity.dimensions,[1500,2000]);
  for(const artifact of await page.evaluate(()=>window.h.artifacts)){
    await writeFile(`${out}/${artifact.name}`,Buffer.from(artifact.data.split(',')[1],'base64'));
  }
  const persistence=await page.evaluate(async()=>{
    const {Repository}=await import('/src/lighttable/data/repository.ts');
    const {Selection,importFiles}=await import('/src/lighttable/data/import.ts');
    const {createComposition}=await import('/src/lighttable/model/types.ts');
    const {f,atlas,black,renderer:r,session:s}=window.h;
    const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join('');
    let repo=new Repository();const selection=new Selection();selection.setCapacity(6);
    const files=[atlas,black,await f.scene('branches'),await f.scene('texture'),await f.scene('disc'),await f.flat([118,118,118])];
    selection.add(files.map((blob,i)=>new File([blob],`${i}.png`,{type:'image/png'})));
    const roll=await importFiles(repo,selection,'profile roundtrip',()=>{});
    const hashes=await Promise.all(files.map(hash));
    const make=(id,indices)=>createComposition(id,indices.map(i=>({assetId:roll.assetIds[i],assetRevision:1})),indices.map(()=>({x:800,y:600})),71);
    const old=make('old-pair',[0,1]),candidate=make('candidate-pair',[2,3]);
    old.effects.exposure=-.7;old.layers[0].transform.xMm=2.5;
    await repo.ensureComposition(old);await repo.ensureComposition(candidate);
    candidate.profile.version=window.h.candidateVersion;candidate.effects.exposure=.4;candidate.layers[1].transform={xMm:-3,yMm:2,turns:1,scale:1.7};
    const committed=await repo.commit(candidate,0);
    await repo.close();repo=new Repository();
    const reloaded=await repo.composition(candidate.id),untouched=await repo.composition(old.id);
    const after=await Promise.all(roll.assetIds.map(async id=>hash((await repo.asset(id)).blob)));
    const inputs=await Promise.all(reloaded.layers.map(async l=>{const a=await repo.asset(l.placements[0].source.assetId);return {id:a.id,blob:a.blob};}));
    await r.loadPair(inputs,true,reloaded);s.viewport={width:800,height:600,zoom:1,pan:{x:0,y:0}};
    const before=window.h.read(),draft=JSON.stringify(s.draft),ext=r.gl.getExtension('WEBGL_lose_context'),statuses=[];
    r.onStatus=message=>statuses.push(message);
    // Actual restoration must preserve version 3 rather than normalizing it to 2.
    const lost=new Promise(resolve=>r.canvas.addEventListener('webglcontextlost',resolve,{once:true}));
    ext.loseContext();await lost;
    // Let the loss event finish (including preventDefault) before asking the
    // extension to restore. Calling it inside the event's microtask is too early.
    await new Promise(resolve=>setTimeout(resolve,0));ext.restoreContext();
    const deadline=performance.now()+10000;
    while(!r.ready){if(performance.now()>deadline)throw Error(`Candidate context restoration timed out: ${statuses.join('; ')}`);await new Promise(resolve=>setTimeout(resolve,20));}
    const restored=window.h.read();
    await repo.close();
    return {hashes,after,roundtrip:JSON.stringify(reloaded)===JSON.stringify(committed),oldUnchanged:JSON.stringify(old)===JSON.stringify(untouched),profile:reloaded.profile.version,revision:reloaded.revision,restoreUnchanged:draft===JSON.stringify(s.draft),restorePixels:f.diff(before,restored)};
  });
  assert.deepEqual(persistence.after,persistence.hashes);
  assert.ok(persistence.roundtrip&&persistence.oldUnchanged&&persistence.restoreUnchanged);
  assert.equal(persistence.profile,candidateVersion);assert.equal(persistence.revision,1);
  assert.equal(persistence.restorePixels.max,0);
  console.log(`PASS: profile-${candidateVersion} durable roundtrip, independent v8 pair, six original hashes, context restoration`);
  assert.deepEqual(errors,[]);
  const disposed=await page.evaluate(()=>{const r=window.h.renderer;r.dispose();return {bytes:r.metrics.liveBytes,textures:r.metrics.liveTextures};});
  assert.deepEqual(disposed,{bytes:0,textures:0});
  await writeFile(`${out}/evidence.json`,JSON.stringify({candidateVersion,environment:'Chromium SwiftShader; not Safari/iPhone/P3/HDR',frozenShaderSha256:createHash('sha256').update(frozen).digest('hex'),numeric,comparisons,parity,persistence,disposed,errors},null,2));
  console.log(`PASS: profile-${candidateVersion} tiled JPEG, preview comparison, snapshot/cancel/budget/dispose`);
}finally{await browser.close();await vite.close();}
