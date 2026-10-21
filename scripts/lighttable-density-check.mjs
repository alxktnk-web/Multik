// Research-only comparisons: prototypes are compiled on this isolated test page.
// No extra blending modes or selectors are shipped to the application's UI.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out='lab-out/lighttable/density-study';await mkdir(out,{recursive:true});
const frozen=await readFile('scripts/fixtures/lighttable-profile3.frag','utf8');
const vite=await createServer({server:{host:'127.0.0.1',port:5193,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/density-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Density research</title>'}));
  await page.goto('http://127.0.0.1:5193/density-harness');
  const result=await page.evaluate(async frozen=>{
    const {Renderer}=await import('/src/lighttable/render/renderer.ts'),{Session}=await import('/src/lighttable/model/session.ts');
    const {createComposition}=await import('/src/lighttable/model/types.ts'),{present}=await import('/src/lighttable/render/shaders.ts');
    const f=await import('/scripts/fixtures/film-analysis.mjs');
    const c=f.canvas(),s=new Session(createComposition('density',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:800,y:600},{x:800,y:600}],51));
    document.body.append(c);s.viewport={width:800,height:600,zoom:1,pan:{x:0,y:0}};
    const r=new Renderer(c,s),actual=r.programs.present,baseline=r.resources.program(frozen);
    const formula='denseSource(source(uA,a))*uGains.x+denseSource(source(uB,b))*uGains.y';
    if(!present.includes(formula))throw Error('Research insertion point changed');
    const prototype=body=>r.resources.program(present.replace(formula,body));
    const aOnly=prototype('denseSource(source(uA,a))*uGains.x+source(uB,b)*uGains.y');
    const bOnly=prototype('source(uA,a)*uGains.x+denseSource(source(uB,b))*uGains.y');
    // Soft luma selection, not Photoshop's per-channel Darken implementation.
    const darken=prototype(`mix(source(uA,a)*uGains.x,source(uB,b)*uGains.y,
      smoothstep(-.04,.04,dot(source(uA,a)*uGains.x-source(uB,b)*uGains.y,vec3(.2126,.7152,.0722))))`);
    const variants=[
      {id:'profile3',title:'Profile 3 / additive',version:3,p:actual,contrast:1},
      {id:'profile4',title:'Profile 4 / both sources dense',version:4,p:actual,contrast:1},
      {id:'a-only',title:'Study / source A dense only',version:4,p:aOnly,contrast:1},
      {id:'b-only',title:'Study / source B dense only',version:4,p:bOnly,contrast:1},
      {id:'darken',title:'Study / soft darker-source mask',version:4,p:darken,contrast:1},
      {id:'post-contrast',title:'Study / profile 3 + Contrast 1.5',version:3,p:actual,contrast:1.5},
    ];
    const read=()=>{r.draw(performance.now());const raw=new Uint8Array(800*600*4),d=new Uint8Array(raw.length);
      r.gl.readPixels(0,0,800,600,r.gl.RGBA,r.gl.UNSIGNED_BYTE,raw);
      for(let y=0;y<600;y++)d.set(raw.subarray((599-y)*3200,(600-y)*3200),y*3200);return d;};
    let serial=0;const load=async(a,b)=>r.loadPair([{id:`a-${serial++}`,blob:a},{id:`b-${serial++}`,blob:b}]);
    const stats=d=>{let black=0,dark=0,white=0,sum=0,n=0;for(let y=70;y<530;y++)for(let x=100;x<700;x++){
      const i=(y*800+x)*4,Y=f.luma([d[i],d[i+1],d[i+2]]);n++;sum+=Y;if(Y<=16)black++;if(Y<=48)dark++;if(Y>=240)white++;
    }return {mean:sum/n,nearBlackFraction:black/n,darkFraction:dark/n,nearWhiteFraction:white/n,crop:[100,70,700,530]};};
    const errors=[],regression=[];
    await load(await f.atlas(),await f.flat([64,64,64]));
    for(const ev of [-2,0,2])for(const halo of [0,1]){
      s.draft.profile.version=3;s.draft.effects.exposure=ev;s.draft.effects.halo=halo;
      r.programs.present=actual;const now=read();r.programs.present=baseline;regression.push(f.diff(now,read()));
    }
    r.programs.present=actual;
    // Near-equal sums with different source distributions separate in profile 4.
    const distribution=[];
    for(const [a,b] of [[118,0],[86,86],[64,64],[118,118],[160,160],[255,0],[255,255]]){
      await load(await f.flat([a,a,a]),await f.flat([b,b,b]));s.draft.effects.halo=0;
      const row={input:[a,b],inputLinearSum:f.decode(a/255)+f.decode(b/255)};
      for(const version of [3,4]){s.draft.profile.version=version;row[`p${version}`]=read()[0];}distribution.push(row);
    }
    // Candidate color oracle on mixed source patches with unequal gains/balance.
    const {balanceGains}=await import('/src/core/recipe.ts');
    await load(await f.atlas(),await f.flat([118,118,118]));s.draft.profile.version=4;s.draft.effects.halo=0;
    for(const balance of [-2,0,2])for(const exposure of [-2,0,2]){
      s.draft.effects.balance=balance;s.draft.effects.exposure=exposure;
      s.draft.layers[0].placements[0].gain=4;s.draft.layers[1].placements[0].gain=.5;
      const d=read(),g=balanceGains(balance),b=f.denseReference([118,118,118].map(v=>f.decode(v/255)));
      for(const [i,rgb] of f.patchColors.entries()){
        const a=f.denseReference(rgb.map(v=>f.decode(v/255)));
        const expected=f.reference3(a.map((v,k)=>(v*g.a*4+b[k]*g.b*.5)*2**exposure));
        const pos=((Math.floor(i/8)*100+50)*800+i%8*100+50)*4;
        errors.push(Math.max(...expected.map((v,k)=>Math.abs(v*255-d[pos+k]))));
      }
    }
    const photo=async name=>(await fetch(`/scripts/fixtures/film-photos/${name}`)).blob();
    const cat=await photo('chelsea.png'),portrait=await photo('astronaut.png'),coffee=await photo('coffee.png'),rocket=await photo('rocket.jpg');
    const scenes=[
      ['branches',await f.scene('branches'),await f.scene('texture')],
      ['portrait-cat',portrait,cat],['coffee-cat',coffee,cat],['rocket-portrait',rocket,portrait],
    ],artifacts=[],comparisons=[];
    for(const [name,a,b] of scenes){
      await load(a,b);s.draft.effects.halo=0; // Isolate mixing, tone and source contrast.
      const sheet=f.canvas(1800,1470),ctx=sheet.getContext('2d');ctx.fillStyle='#242424';ctx.fillRect(0,0,1800,1470);
      const pair=f.canvas(1600,640),pairCtx=pair.getContext('2d');pairCtx.fillStyle='#242424';pairCtx.fillRect(0,0,1600,640);pairCtx.font='18px sans-serif';
      ctx.fillStyle='white';ctx.font='18px sans-serif';
      for(const [i,blob] of [a,b].entries()){
        const im=await createImageBitmap(blob),scale=Math.min(600/im.width,450/im.height);
        ctx.drawImage(im,i*600+(600-im.width*scale)/2,30+(450-im.height*scale)/2,im.width*scale,im.height*scale);im.close();
        ctx.fillText(`Source ${i?'B':'A'}`,12+i*600,23);
      }
      ['Density study / same sources & geometry',name,'EV 0 / balance 0 / halo OFF / seed 51','Fixed gate: luminance .02 ... .40','Only profile 4 is a new runtime profile','Source order is A/B; no UI changes'].forEach((line,i)=>ctx.fillText(line,1212,40+i*35));
      const measurements=[];
      for(const [i,v] of variants.entries()){
        s.draft.profile.version=v.version;s.draft.effects.contrast=v.contrast;r.programs.present=v.p;
        const d=read(),tmp=f.canvas(),t=tmp.getContext('2d');t.putImageData(new ImageData(new Uint8ClampedArray(d),800,600),0,0);
        const col=i%3,row=1+Math.floor(i/3);ctx.drawImage(tmp,col*600,row*490+30,600,450);
        ctx.fillStyle='white';ctx.fillText(v.title,col*600+12,row*490+23);
        if(i<2){pairCtx.putImageData(new ImageData(new Uint8ClampedArray(d),800,600),i*800,40);pairCtx.fillStyle='white';pairCtx.fillText(`${name} | ${v.title} | EV 0, contrast 1, halo 0`,i*800+12,26);}
        measurements.push({id:v.id,...stats(d)});
      }
      artifacts.push({name:`${name}-study.jpg`,data:sheet.toDataURL('image/jpeg',.94)});
      artifacts.push({name:`${name}-3-vs-4.jpg`,data:pair.toDataURL('image/jpeg',.94)});
      comparisons.push({name,measurements,geometry:structuredClone(s.draft.layers)});
    }
    r.programs.present=actual;
    // A small final regression exercises old profile 3 after alternating masks.
    s.draft.profile.version=3;s.draft.effects.halo=1;s.draft.effects.haloRadius=1.6;
    s.draft.layers[0].transform={xMm:3,yMm:-2,turns:1,scale:1.7};
    const now=read();r.programs.present=baseline;regression.push(f.diff(now,read()));
    r.dispose();
    return {regression,oracleMaxError:Math.max(...errors),distribution,comparisons,artifacts,disposed:r.metrics.liveBytes};
  },frozen);
  assert.ok(result.regression.every(d=>d.max===0),'Profile 3 changed');
  assert.ok(result.oracleMaxError<1.6,JSON.stringify(result.oracleMaxError));
  assert.ok(result.distribution.find(row=>row.input.every(v=>v===64)).p4<10,'Dark + dark must stay near black');
  for(const row of result.distribution.filter(row=>row.input[0]===255))assert.equal(row.p4,row.p3,'Bright neutral inputs must keep profile-3 tone');
  for(const c of result.comparisons){
    const a=c.measurements.find(m=>m.id==='profile3'),b=c.measurements.find(m=>m.id==='profile4');
    assert.ok(b.mean<a.mean,`${c.name}: no density increase`);
    assert.ok(b.darkFraction>a.darkFraction,`${c.name}: no additional dark areas`);
  }
  assert.equal(result.disposed,0);assert.deepEqual(errors,[]);
  for(const artifact of result.artifacts)await writeFile(`${out}/${artifact.name}`,Buffer.from(artifact.data.split(',')[1],'base64'));
  delete result.artifacts;
  await writeFile(`${out}/evidence.json`,JSON.stringify({environment:'Chromium SwiftShader, not Safari/iPhone',...result},null,2));
  console.log('PASS: frozen profile 3, profile-4 mixed-source oracle, density increase on four pairs, six-way comparison, disposal');
}finally{await browser.close();await vite.close();}
