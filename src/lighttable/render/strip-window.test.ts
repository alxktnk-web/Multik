import { describe, expect, it } from 'vitest';
import { createFilmStripSnapshot } from '../model/film-strip';
import { point } from '../model/transforms';
import { createComposition } from '../model/types';
import { planStripWindow, rasterizeStripWindow } from './strip-window';
const source=(assetId:string)=>({source:{assetId,assetRevision:1},size:{x:400,y:300}});
const scene=()=>createFilmStripSnapshot(createComposition('x',[source('a').source,source('b').source],[{x:400,y:300},{x:400,y:300}]),[[source('a'),source('c')],[source('b'),source('d')]],0);

describe('raw strip window proof',()=>{
  it('maps a preview and export tile to the same physical coordinates',()=>{
    const s=scene();s.layers[0].transform={xMm:4,yMm:0,turns:1,scale:.5};
    const full=planStripWindow(s,0,{width:360,height:270,crop:{x:0,y:0,width:36,height:27}});
    const tile=planStripWindow(s,0,{width:180,height:270,crop:{x:18,y:0,width:18,height:27}});
    for(const draw of tile){const other=full.find(p=>p.offset===draw.offset)!;const a=point(other.sourceToPixels,{x:.5,y:.5}),b=point(draw.sourceToPixels,{x:.5,y:.5});expect(b.x).toBeCloseTo(a.x-180);expect(b.y).toBeCloseTo(a.y);}
  });
  it('rasterizes serially, uses transparent canvas, and releases every decode',async()=>{
    const s=scene();s.layers[0].transform.xMm=10;
    const operations:string[]=[],ctx={clearRect:()=>operations.push('clear'),setTransform:()=>operations.push('transform'),drawImage:()=>operations.push('draw')};
    const canvas={width:0,height:0,getContext:()=>ctx} as unknown as HTMLCanvasElement;
    let active=0,peak=0;
    const result=await rasterizeStripWindow(s,0,{width:360,height:270,crop:{x:0,y:0,width:36,height:27}},async source=>{operations.push(`decode:${source.assetId}`);peak=Math.max(peak,++active);return {image:{} as HTMLCanvasElement,width:1,height:1,close:()=>{operations.push('close');active--;}};},new AbortController().signal,()=>canvas);
    expect(result).toBe(canvas);expect(peak).toBe(1);expect(active).toBe(0);expect(operations[0]).toBe('clear');expect(operations.filter(x=>x==='draw').length).toBe(2);expect(operations.filter(x=>x==='close').length).toBe(2);
  });
  it('rejects oversized output before allocation and cleans up after decode errors',async()=>{
    const s=scene(), controller=new AbortController();let made=false;
    await expect(rasterizeStripWindow(s,0,{width:4096,height:4096,crop:{x:0,y:0,width:36,height:27}},async()=>{throw Error('unexpected');},controller.signal,()=>{made=true;return {} as HTMLCanvasElement;})).rejects.toThrow('resource limit');expect(made).toBe(false);
    const canvas={width:0,height:0,getContext:()=>({clearRect:()=>{}})} as unknown as HTMLCanvasElement;
    await expect(rasterizeStripWindow(s,0,{width:100,height:100,crop:{x:0,y:0,width:36,height:27}},async()=>{throw Error('decode failed');},controller.signal,()=>canvas)).rejects.toThrow('decode failed');expect(canvas.width).toBe(1);expect(canvas.height).toBe(1);
  });
});
