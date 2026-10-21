import { describe, it, expect } from 'vitest';
import { createComposition, neutralLevels } from './types';
import { levelExponent, moveLevel } from './levels';
import { Session } from './session';
import { assertComposition } from '../data/types';
const scene=()=>createComposition('levels',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:400,y:300},{x:400,y:300}]);
describe('source Levels and editor checkpoint',()=>{
  it('maps the middle point to half light and has identity defaults',()=>{
    expect(levelExponent(neutralLevels)).toBe(1);
    const l={black:.1,mid:.35,white:.9};expect(Math.pow((l.mid-l.black)/(l.white-l.black),levelExponent(l))).toBeCloseTo(.5,12);
  });
  it('keeps input points ordered and preserves gamma when moving endpoints',()=>{
    let l=moveLevel(neutralLevels,'black',.8);expect(l.mid).toBeCloseTo(.9);expect(levelExponent(l)).toBeCloseTo(1);
    l=moveLevel(l,'white',.1);expect(l.white-l.black).toBeCloseTo(.02);
    l=moveLevel(l,'mid',-10);expect(l.mid).toBeGreaterThan(l.black);expect(l.mid).toBeLessThan(l.white);
    const c=scene();c.layers[0].levels=l;assertComposition(c);
  });
  it('rejects nonfinite, inverted and collapsed levels',()=>{
    for(const l of [{black:NaN,mid:.5,white:1},{black:.8,mid:.5,white:1},{black:0,mid:0,white:1},{black:0,mid:.5,white:Infinity}]){const c=scene();c.layers[0].levels=l;expect(()=>assertComposition(c)).toThrow();}
  });
  it('cancels the entire edit and restores previous undo history',()=>{
    const s=new Session(scene());s.rotate();const before=structuredClone(s.draft);s.beginEdit();
    s.begin();s.layer.levels={black:.2,mid:.6,white:1};s.end();s.begin();s.draft.profile.version=5;s.end();
    expect(s.editChanged).toBe(true);s.discardEdit();expect(s.draft).toEqual(before);expect(s.editing).toBe(false);s.undo();expect(s.draft.frame.turns).toBe(0);
  });
  it('keeps undo inside the edit checkpoint and accepts edits after saving',()=>{
    const s=new Session(scene());s.rotate();s.beginEdit();expect(s.canUndo).toBe(false);s.undo();expect(s.draft.frame.turns).toBe(1);
    s.begin();s.layer.levels={black:.1,mid:.5,white:.9};s.end();
    const saved=structuredClone(s.draft);saved.revision=1;s.markSaved(saved);s.acceptEdit();expect(s.dirty).toBe(false);s.undo();expect(s.layer.levels).toBeUndefined();expect(s.dirty).toBe(true);expect(s.savedRevision).toBe(1);
  });
  it('retains draft, checkpoint and undo until a failed save can be retried',()=>{
    const s=new Session(scene());s.beginEdit();s.begin();s.layer.levels={black:.1,mid:.5,white:1};s.end();
    expect(s.dirty&&s.editing&&s.canUndo).toBe(true);s.cancel();expect(s.layer.levels?.black).toBe(.1);s.discardEdit();expect(s.layer.levels).toBeUndefined();
  });
  it('keeps layers and looks independent without implicit reset',()=>{
    const s=new Session(scene());s.beginEdit();s.begin();s.draft.layers[0].levels={black:.2,mid:.6,white:1};s.draft.profile.version=5;s.end();
    assertComposition(s.draft);expect(s.draft.layers[1].levels).toBeUndefined();s.begin();s.draft.profile.version=3;s.end();expect(s.draft.layers[0].levels?.black).toBe(.2);s.undo();expect(s.draft.profile.version).toBe(5);
  });
});
