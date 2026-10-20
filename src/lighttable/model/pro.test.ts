import { describe,it,expect } from 'vitest';
import { createComposition,copyComposition } from './types';
import { parameters,dragParameter } from './parameters';
import { Session } from './session';
import { Gestures } from '../input/gestures';
import { assertComposition } from '../data/types';
const scene=()=>createComposition('pro',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:400,y:300},{x:400,y:300}]);
function setup(){const s=new Session(scene());s.viewport={width:360,height:640,zoom:1,pan:{x:0,y:0}};return {s,g:new Gestures(s)};}
describe('Pro gesture contracts',()=>{
  it('XY changes exactly two values, successive touches accumulate, one undo restores both',()=>{
    const {s,g}=setup();s.tool={kind:'xy',pair:'lightXY'};const before=copyComposition(s.draft);
    g.down(1,{x:100,y:200});g.move(1,{x:130,y:150});g.up(1);
    expect(s.draft.effects.exposure).toBeGreaterThan(0);expect(s.draft.effects.contrast).toBeGreaterThan(1);expect(s.draft.layers).toEqual(before.layers);
    const step=copyComposition(s.draft);g.down(2,{x:10,y:500});g.move(2,{x:40,y:450});g.up(2);
    expect(s.draft.effects.exposure).toBeCloseTo(step.effects.exposure*2);expect(s.draft.revision).toBe(0);
    s.undo();expect(s.draft).toEqual(step);s.undo();expect(s.draft).toEqual(before);
  });
  it('pinch cancels only the latest XY edit and remaining pointer cannot adjust a parameter',()=>{
    const {s,g}=setup();s.tool={kind:'xy',pair:'haloXY'};
    g.down(1,{x:100,y:200});g.move(1,{x:140,y:150});g.up(1);const before=copyComposition(s.draft);
    g.down(1,{x:100,y:200});g.move(1,{x:200,y:100});g.down(2,{x:250,y:200});expect(s.draft).toEqual(before);
    g.up(2);g.move(1,{x:300,y:0});g.up(1);expect(s.draft).toEqual(before);
  });
  it('one-axis horizontal movement is a no-op for every parameter; new touch recovers from clamp',()=>{
    for(const id of Object.keys(parameters) as (keyof typeof parameters)[]){const {s,g}=setup();s.tool={kind:'parameter',parameter:id};const initial=s.draft.effects[id];
      g.down(1,{x:0,y:200});g.move(1,{x:200,y:200});g.up(1);expect(s.draft.effects[id]).toBeCloseTo(initial);expect(s.dirty).toBe(false);
      g.down(1,{x:0,y:200});g.move(1,{x:0,y:-10000});g.up(1);expect(s.draft.effects[id]).toBeCloseTo(parameters[id].max);
      g.down(1,{x:0,y:200});g.move(1,{x:0,y:220});g.up(1);expect(s.draft.effects[id]).toBeLessThan(parameters[id].max);
    }
  });
  it('radius uses a positive logarithmic scale, deadzone does not produce undo',()=>{
    expect(dragParameter('haloRadius',.2,-350,1000)).toBeCloseTo(Math.sqrt(.2*1.6));
    const {s,g}=setup();s.tool={kind:'xy',pair:'haloXY'};g.down(1,{x:10,y:10});g.move(1,{x:12,y:12});g.up(1);expect(s.canUndo).toBe(false);
  });
  it('schema-1 defaults normalize in memory, reject corrupt new fields and retain originals',()=>{
    const original=scene();const old=structuredClone(original) as any;delete old.effects.contrast;delete old.effects.haloRadius;delete old.effects.haloThreshold;
    assertComposition(old);expect(copyComposition(old)).toEqual(original);expect(old.effects.contrast).toBeUndefined();
    for(const key of ['contrast','haloRadius','haloThreshold'] as const){const bad=scene();bad.effects[key]=NaN;expect(()=>assertComposition(bad)).toThrow();bad.effects[key]=99;expect(()=>assertComposition(bad)).toThrow();}
  });
});
