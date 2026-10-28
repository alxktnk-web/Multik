import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const vite=await createServer({server:{host:'127.0.0.1',port:5224,strictPort:true},logLevel:'error'});let browser;
try{
 await vite.listen();browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();await page.route('**/film-gpu',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Film GPU</title>'}));await page.goto('http://127.0.0.1:5224/film-gpu');
 const result=await page.evaluate(async()=>{
  const {Renderer}=await import('/src/lighttable/render/renderer.ts'),{Session}=await import('/src/lighttable/model/session.ts'),{createComposition}=await import('/src/lighttable/model/types.ts'),{createFilmStripSnapshot}=await import('/src/lighttable/model/film-strip.ts');
  const flat=async color=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,400,300);return await new Promise(r=>c.toBlob(r,'image/png'));};
  const blobs={a:await flat('#ff0000'),b:await flat('#00ff00'),c:await flat('#0000ff'),z:await flat('#000000')},ref=id=>({assetId:id,assetRevision:1}),entry=id=>({source:ref(id),size:{x:400,y:300}});
  const base=createComposition('gpu',[ref('a'),ref('z')],[{x:400,y:300},{x:400,y:300}]);const scene=createFilmStripSnapshot(base,[[entry('a'),entry('b'),entry('c')],[entry('z'),entry('z'),entry('z')]],0);
  scene.profile.version=5;const s=new Session(scene);s.viewport={width:400,height:300,zoom:1,pan:{x:0,y:0}};const canvas=document.createElement('canvas');document.body.append(canvas);const r=new Renderer(canvas,s);r.setSourceResolver(async source=>({id:source.assetId,blob:blobs[source.assetId]}));
  const inputs=[{id:'a',blob:blobs.a},{id:'z',blob:blobs.z}];await r.loadPair(inputs,true,scene);
  const pixel=async blob=>{const img=await createImageBitmap(blob),c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);img.close();return [...x.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data].slice(0,3);};
  const preview=async()=>pixel(await r.capturePreview());const first=await preview();s.draft.layers[0].transform.xMm=-37.2;r.invalidate();const next=await preview();
  s.draft.layers[0].transform.turns=1;r.invalidate();const rotated=await preview();s.draft.layers[0].transform.turns=0;s.draft.layers[0].levels={black:0,mid:.3,white:1};s.draft.profile.version=3;Object.assign(s.draft.effects,{halo:.8,haloRadius:1.2,haloThreshold:.5});r.invalidate();const adjusted=await preview();const exported=await pixel((await r.exportImage(s.draft,inputs,2000,new AbortController().signal,()=>{},512)).blob);const peak=r.metrics.peakBytes;r.dispose();return {first,next,rotated,adjusted,exported,peak};
 });
 assert.ok(result.first[0]>240&&result.first[1]<10,JSON.stringify(result));assert.ok(result.next[1]>240&&result.next[0]<10,JSON.stringify(result));
 assert.ok(result.adjusted.some((x,i)=>Math.abs(x-result.exported[i])>0)||result.adjusted.some(x=>x>0));for(let i=0;i<3;i++)assert.ok(Math.abs(result.adjusted[i]-result.exported[i])<=5,JSON.stringify(result));
 assert.ok(result.peak<160*1024*1024,JSON.stringify(result));console.log('PASS: strip shader, adjacent frame, Levels/Halo preview/export and bounded GPU memory',JSON.stringify(result));
}finally{await browser?.close();await vite.close();}
