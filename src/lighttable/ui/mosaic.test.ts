import { describe, expect, it } from 'vitest';
import { makeMosaic } from './mosaic';
const seeded=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
describe('roll mosaic',()=>{
  it('covers the card without overlapping or thin cells across roll sizes and seeds',()=>{
    for(const size of [6,8,12,24,36])for(let seed=1;seed<=200;seed++){
      const ids=Array.from({length:size},(_,i)=>String(i)),r=makeMosaic(ids,seeded(seed));
      expect(r.cells).toHaveLength(6);expect(new Set(r.cells.map(c=>c.assetId)).size).toBe(6);
      expect(r.cells.reduce((sum,c)=>sum+c.width*c.height,0)).toBeCloseTo(1,10);
      for(const [i,a] of r.cells.entries()){
        expect(a.x).toBeGreaterThanOrEqual(0);expect(a.y).toBeGreaterThanOrEqual(0);expect(a.x+a.width).toBeLessThanOrEqual(1.0000001);expect(a.y+a.height).toBeLessThanOrEqual(1.0000001);expect(a.width).toBeGreaterThanOrEqual(.17);expect(a.height).toBeGreaterThanOrEqual(.17);
        for(const b of r.cells.slice(i+1)){const overlapX=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)),overlapY=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));expect(overlapX*overlapY).toBeLessThan(1e-12);}
      }
    }
  });
  it('is reproducible with an injected random source and varies across seeds',()=>{const ids=Array.from({length:12},(_,i)=>String(i));expect(makeMosaic(ids,seeded(7))).toEqual(makeMosaic(ids,seeded(7)));expect(makeMosaic(ids,seeded(7))).not.toEqual(makeMosaic(ids,seeded(8)));});
});
