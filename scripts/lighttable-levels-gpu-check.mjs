import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const vite=await createServer({server:{host:'127.0.0.1',port:5196,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.route('**/levels-gpu',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Levels GPU verification</title>'}));await page.goto('http://127.0.0.1:5196/levels-gpu');
 // Independent CPU CIELAB measurements of rendered sRGB pixels (D65).
 const decode=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 const encode=v=>255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055);
 const lab=rgb=>{
  const [r,g,b]=rgb.map(v=>decode(v/255));
  const f=t=>t>216/24389?Math.cbrt(t):t*841/108+4/29;
  const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.0721750*b),z=f((.0193339*r+.1191920*g+.9503041*b)/1.08883);
  return [116*y-16,500*(x-y),200*(y-z)];
 };
 const linearFromLab=([l,a,b])=>{
  const fy=(l+16)/116,inv=f=>f>6/29?f**3:(f-4/29)*108/841;
  const x=.95047*inv(fy+a/500),y=inv(fy),z=1.08883*inv(fy-b/200);
  return [3.2404542*x-1.5371385*y-.4985314*z,-.969266*x+1.8760108*y+.041556*z,.0556434*x-.2040259*y+1.0572252*z];
 };
 const fixtures=[];
 for(const rgb of [[70,120,170],[170,110,80],[120,140,115],[255,0,0],[0,255,0],[0,0,255],[255,0,255],[0,255,255]]){
  const lightness=lab(rgb)[0]/100;
  for(const target of [.3,.5,.7]){
   const exponent=Math.log(target)/Math.log(lightness);
   const mid=Math.pow(.5,1/exponent);
   assert.ok(mid>=.05&&mid<=.95,'Fixture must be reachable within the Levels handle limits');
   fixtures.push({rgb,target,levels:{black:0,mid,white:1}});
  }
  fixtures.push({rgb,target:0,levels:{black:lightness+.02,mid:(lightness+1.02)/2,white:1}});
  fixtures.push({rgb,target:1,levels:{black:0,mid:(lightness-.02)/2,white:lightness-.02}});
 }
 const result=await page.evaluate(async({fixtures,grayLightness})=>{
  const {Renderer}=await import('/src/lighttable/render/renderer.ts'),{Session}=await import('/src/lighttable/model/session.ts'),{createComposition}=await import('/src/lighttable/model/types.ts');
  const canvas=document.createElement('canvas');document.body.append(canvas);const s=new Session(createComposition('gpu',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:400,y:300},{x:400,y:300}]));s.viewport={width:400,height:300,zoom:1,pan:{x:0,y:0}};const r=new Renderer(canvas,s);
  const flat=async v=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle=`rgb(${v.join(',')})`;x.fillRect(0,0,400,300);return new Promise(resolve=>c.toBlob(resolve,'image/png'));};
  const read=()=>{r.draw(performance.now());const p=new Uint8Array(4);r.gl.readPixels(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1,r.gl.RGBA,r.gl.UNSIGNED_BYTE,p);return [...p].slice(0,3);};
  const load=async(a,b)=>{await r.loadPair([{id:'a',blob:await flat(a)},{id:'b',blob:await flat(b)}]);s.draft.profile.version=5;};
  const rows=[];
  for(const [a,b] of [[[0,0,0],[0,0,0]],[[128,128,128],[0,0,0]],[[128,128,128],[128,128,128]],[[255,255,255],[255,255,255]],[[70,120,170],[50,90,130]]]){await load(a,b);rows.push({a,b,rgb:read()});}
  await load([128,128,128],[64,64,64]);s.draft.layers[0].levels={black:.6,mid:.8,white:1};const sourceIsolation=read();
  s.draft.layers[1].levels={black:.3,mid:.65,white:1};const bothBlack=read();
  await load([128,128,128],[0,0,0]);s.draft.layers[0].levels={black:0,mid:grayLightness,white:1};const middle=read();
  s.draft.layers[0].levels={black:0,mid:.1,white:.2};const white=read();
  await load([70,120,170],[50,90,130]);const clean=read();Object.assign(s.draft.effects,{halo:1,exposure:2,balance:2,contrast:1.5});s.draft.layers[0].placements[0].gain=.2;s.draft.layers[1].placements[0].gain=3;const bypass=read();
  const lightnessRows=[];
  for(const fixture of fixtures){await load(fixture.rgb,[0,0,0]);s.draft.layers[0].levels=fixture.levels;lightnessRows.push({...fixture,output:read()});}
  r.dispose();return {rows,sourceIsolation,bothBlack,middle,white,clean,bypass,lightnessRows};
 },{fixtures,grayLightness:lab([128,128,128])[0]/100});
 for(const row of result.rows)for(let i=0;i<3;i++){const expected=encode(Math.min(1,decode(row.a[i]/255)+decode(row.b[i]/255)));assert.ok(Math.abs(row.rgb[i]-expected)<1.1,JSON.stringify({row,expected}));}
 for(const v of result.sourceIsolation)assert.ok(Math.abs(v-64)<=1);
 assert.deepEqual(result.bothBlack,[0,0,0]);for(const v of result.middle)assert.ok(Math.abs(v-119)<=1);assert.deepEqual(result.white,[255,255,255]);assert.deepEqual(result.bypass,result.clean);
 let inGamut=0,compressed=0;
 for(const row of result.lightnessRows){
  const source=lab(row.rgb),actual=lab(row.output),wanted=[100*row.target,source[1],source[2]],context=JSON.stringify({row,source,actual});
  assert.ok(Math.abs(actual[0]-wanted[0])<.6,`L* ${context}`);
  if(row.target===0||row.target===1){assert.deepEqual(row.output,Array(3).fill(255*row.target));continue;}
  const possible=linearFromLab(wanted).every(v=>v>=0&&v<=1);
  if(possible){inGamut++;assert.ok(Math.hypot(actual[1]-source[1],actual[2]-source[2])<1.5,`a*/b* ${context}`);}
  else{
   compressed++;
   const sourceChroma=Math.hypot(source[1],source[2]),outputChroma=Math.hypot(actual[1],actual[2]);
   assert.ok(outputChroma<=sourceChroma+1,`chroma ${context}`);
   assert.ok(actual[1]*source[1]+actual[2]*source[2]>0,`hue reversed ${context}`);
   assert.ok(Math.abs(actual[1]*source[2]-actual[2]*source[1])/sourceChroma<1.5,`hue ${context}`);
   // Compression must approach the gamut boundary, not simply desaturate.
   assert.ok(row.output.some(v=>v<=5||v>=250),`gamut boundary ${context}`);
  }
 }
 assert.ok(inGamut>=3&&compressed>=3,'Exercise preserved and compressed chroma');
 await mkdir('lab-out/lighttable/editor',{recursive:true});await writeFile('lab-out/lighttable/editor/gpu.json',JSON.stringify(result,null,2));
 console.log(`PASS: Clear linear-light oracle, independent source Levels, L* midpoint, 40 colored probes (${inGamut} preserve a*/b*, ${compressed} gamut-compress at fixed L*/hue), black/white boundaries`);
}finally{await browser.close();await vite.close();}
