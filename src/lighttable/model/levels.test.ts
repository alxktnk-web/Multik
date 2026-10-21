import { describe, it, expect } from 'vitest';
import { createComposition, neutralLevels } from './types';
import { levelExponent, moveLevel } from './levels';
import { Session } from './session';
import { assertComposition } from '../data/types';
import { Gestures } from '../input/gestures';
import { filmToScreen, point } from './transforms';
const scene=()=>createComposition('levels',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:400,y:300},{x:400,y:300}]);
describe('source Levels and editor checkpoint',()=>{
  it('selects visible photo thirds across orientations, locks the point and keeps edits on the selected source',()=>{
    for(const [width,height] of [[375,460],[820,300]])for(const turns of [0,1,2,3] as const)for(const [i,name] of (['black','mid','white'] as const).entries()){
      const s=new Session(scene());s.viewport={width,height,zoom:1,pan:{x:0,y:0}};s.draft.frame.turns=turns;s.interaction='move';s.tool={kind:'levels',point:'mid'};
      const m=filmToScreen(s.draft.frame,s.viewport),a=point(m,{x:0,y:0}),b=point(m,{x:s.draft.frame.widthMm,y:s.draft.frame.heightMm});
      const x=Math.min(a.x,b.x)+Math.abs(b.x-a.x)*(i+.5)/3,g=new Gestures(s);
      g.down(1,{x,y:height/2});expect(s.tool).toEqual({kind:'levels',point:name});
      g.move(1,{x:width-x,y:height/2+(name==='white'?20:-20)});g.up(1);
      expect(s.tool).toEqual({kind:'levels',point:name});expect(s.layer.levels?.[name]).not.toBe([0,.5,1][i]);expect(s.draft.layers[0].levels).toBeUndefined();
      s.undo();expect(s.layer.levels).toBeUndefined();
    }
  });
  it('pinch cancels unfinished Levels, scales the selected source and leaves no stray point movement',()=>{
    const s=new Session(scene());s.viewport={width:400,height:300,zoom:1,pan:{x:0,y:0}};s.tool={kind:'levels',point:'black'};s.interaction='move';const g=new Gestures(s);
    g.down(1,{x:70,y:150});g.move(1,{x:70,y:120});expect(s.layer.levels?.black).toBeGreaterThan(0);
    g.down(2,{x:200,y:120});expect(s.layer.levels).toBeUndefined();g.move(2,{x:260,y:120});expect(s.layer.transform.scale).toBeGreaterThan(1);
    g.up(2);g.move(1,{x:70,y:60});expect(s.layer.levels).toBeUndefined();g.up(1);expect(s.viewport.zoom).toBe(1);
  });
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
