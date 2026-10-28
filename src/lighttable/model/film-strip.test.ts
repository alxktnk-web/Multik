import { describe, expect, it } from 'vitest';
import { compositionStateKey } from '../data/types';
import { point } from './transforms';
import { copyComposition, createComposition } from './types';
import { createFilmStripSnapshot, stripFrame, stripSourceToFilm, visibleStripOffsets } from './film-strip';

const source=(assetId:string, x=400, y=300)=>({source:{assetId,assetRevision:1},size:{x,y}});
const base=()=>createComposition('pair',[source('a').source,source('b').source],[{x:400,y:300},{x:300,y:400}]);
const scene=()=>createFilmStripSnapshot(base(),[[source('a'),source('c'),source('a')],[source('b',300,400),source('d'),source('e')]],0);

describe('film strip snapshot foundation',()=>{
  it('freezes the complete ordered sides, including duplicates and portrait geometry',()=>{
    const a=[source('a'),source('c'),source('a')], b=[source('b',300,400),source('d'),source('e')];
    const original=base(), snapshot=createFilmStripSnapshot(original,[a,b],0), saved=copyComposition(snapshot);
    a[1].source.assetId='changed';original.layers[0].placements[0].rect.x=9;
    expect(snapshot.filmStrip.layers[0].frames.map(p=>p.source.assetId)).toEqual(['a','c','a']);
    expect(snapshot.filmStrip.layers[1].frames[0].turns).toBe(1);
    expect(saved).toEqual(snapshot);
    expect(compositionStateKey(saved)).toBe(compositionStateKey(snapshot));
    expect('filmStrip' in base()).toBe(false);
  });
  it('wraps in both directions, preserving repeated slots and one-frame rolls',()=>{
    const s=scene().filmStrip.layers[0];
    expect([-4,-3,-2,-1,0,1,2,3,4].map(n=>stripFrame(s,n).source.assetId)).toEqual(['a','a','c','a','a','c','a','a','c']);
    const single={center:0,frames:[s.frames[0]]};expect(stripFrame(single,-99)).toEqual(stripFrame(single,99));
  });
  it('rotates, scales and translates all slots around the same center',()=>{
    const s=scene();s.layers[0].transform={xMm:3,yMm:-2,turns:1,scale:2};
    const p0=point(stripSourceToFilm(s,0,0),{x:.5,y:.5});
    const p1=point(stripSourceToFilm(s,0,1),{x:.5,y:.5});
    expect(p0.x).toBeCloseTo(21);expect(p0.y).toBeCloseTo(11.5);
    expect(p1.x).toBeCloseTo(p0.x);expect(p1.y-p0.y).toBeCloseTo(2*37.2);
    expect(s.layers[1].transform).toEqual({xMm:0,yMm:0,turns:0});
  });
  it('computes bounded neighbors including gaps and halo at extreme transforms',()=>{
    const s=scene();expect(visibleStripOffsets(s.frame,s.layers[0],1.2,0)).toEqual([0]);
    expect(visibleStripOffsets(s.frame,s.layers[0],1.2,4.8)).toEqual([-1,0,1]);
    expect(visibleStripOffsets(s.frame,s.layers[0],1.2,4.8,{x:10,y:0,width:8,height:27})).toEqual([0]);
    for(const turn of [0,1,2,3] as const){s.layers[0].transform={xMm:36,yMm:27,turns:turn,scale:.5};const offsets=visibleStripOffsets(s.frame,s.layers[0],1.2,4.8);expect(offsets.length).toBeLessThanOrEqual(9);expect(offsets.every(n=>Math.abs(n)<=4)).toBe(true);}
  });
  it('returns all potentially visible slots over the supported gesture bounds',()=>{
    const s=scene();
    for(const turn of [0,1,2,3] as const)for(const size of [.5,1,4])for(const x of [-36,0,36])for(const y of [-27,0,27]){
      s.layers[0].transform={xMm:x,yMm:y,turns:turn,scale:size};
      const offsets=visibleStripOffsets(s.frame,s.layers[0],1.2,4.8);
      expect(offsets.length).toBeLessThanOrEqual(9);expect(offsets.every(n=>Math.abs(n)<=4)).toBe(true);
      for(let offset=-6;offset<=6;offset++){
        const m=stripSourceToFilm(s,0,offset);
        const samples=[{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:.5,y:.5}].map(p=>point(m,p));
        if(samples.some(p=>p.x>0&&p.x<36&&p.y>0&&p.y<27))expect(offsets).toContain(offset);
      }
    }
  });
  it('rejects mismatched center and invalid source dimensions',()=>{
    expect(()=>createFilmStripSnapshot(base(),[[source('wrong')],[source('b')]],0)).toThrow();
    expect(()=>createFilmStripSnapshot(base(),[[source('a',0,1)],[source('b')]],0)).toThrow();
  });
});
