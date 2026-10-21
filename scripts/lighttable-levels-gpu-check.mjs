import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const vite=await createServer({server:{host:'127.0.0.1',port:5196,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.route('**/levels-gpu',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Levels GPU verification</title>'}));await page.goto('http://127.0.0.1:5196/levels-gpu');
 const result=await page.evaluate(async()=>{
  const {Renderer}=await import('/src/lighttable/render/renderer.ts'),{Session}=await import('/src/lighttable/model/session.ts'),{createComposition}=await import('/src/lighttable/model/types.ts');
  const canvas=document.createElement('canvas');document.body.append(canvas);const s=new Session(createComposition('gpu',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:400,y:300},{x:400,y:300}]));s.viewport={width:400,height:300,zoom:1,pan:{x:0,y:0}};const r=new Renderer(canvas,s);
  const flat=async v=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle=`rgb(${v.join(',')})`;x.fillRect(0,0,400,300);return new Promise(resolve=>c.toBlob(resolve,'image/png'));};
  const read=()=>{r.draw(performance.now());const p=new Uint8Array(4);r.gl.readPixels(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1,r.gl.RGBA,r.gl.UNSIGNED_BYTE,p);return [...p].slice(0,3);};
  const load=async(a,b)=>{await r.loadPair([{id:'a',blob:await flat(a)},{id:'b',blob:await flat(b)}]);s.draft.profile.version=5;};
  const rows=[];
  for(const [a,b] of [[[0,0,0],[0,0,0]],[[128,128,128],[0,0,0]],[[128,128,128],[128,128,128]],[[255,255,255],[255,255,255]],[[70,120,170],[50,90,130]]]){await load(a,b);rows.push({a,b,rgb:read()});}
  await load([128,128,128],[64,64,64]);s.draft.layers[0].levels={black:.3,mid:.65,white:1};const sourceIsolation=read();
  s.draft.layers[1].levels={black:.1,mid:.55,white:1};const bothBlack=read();
  await load([128,128,128],[0,0,0]);s.draft.layers[0].levels={black:0,mid:((128/255+.055)/1.055)**2.4,white:1};const middle=read();
  s.draft.layers[0].levels={black:0,mid:.1,white:.2};const white=read();
  await load([70,120,170],[50,90,130]);const clean=read();Object.assign(s.draft.effects,{halo:1,exposure:2,balance:2,contrast:1.5});s.draft.layers[0].placements[0].gain=.2;s.draft.layers[1].placements[0].gain=3;const bypass=read();
  r.dispose();return {rows,sourceIsolation,bothBlack,middle,white,clean,bypass};
 });
 const decode=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 const encode=v=>255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055);
 for(const row of result.rows)for(let i=0;i<3;i++){const expected=encode(Math.min(1,decode(row.a[i]/255)+decode(row.b[i]/255)));assert.ok(Math.abs(row.rgb[i]-expected)<1.1,JSON.stringify({row,expected}));}
 for(const v of result.sourceIsolation)assert.ok(Math.abs(v-64)<=1);
 assert.deepEqual(result.bothBlack,[0,0,0]);for(const v of result.middle)assert.ok(Math.abs(v-188)<=1);assert.deepEqual(result.white,[255,255,255]);assert.deepEqual(result.bypass,result.clean);
 await mkdir('lab-out/lighttable/editor',{recursive:true});await writeFile('lab-out/lighttable/editor/gpu.json',JSON.stringify(result,null,2));
 console.log('PASS: Clear linear-light oracle, clipping, no hidden globals/halo/gains, independent source black/mid/white');
}finally{await browser.close();await vite.close();}
