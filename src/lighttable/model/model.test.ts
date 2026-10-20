import { describe, expect, it } from 'vitest';
import { createComposition, turns, type QuarterTurns } from './types';
import { filmToScreen, inverse, point, vector, sourceToFilm } from './transforms';
import { Session } from './session';
import { Gestures } from '../input/gestures';
const scene=()=>createComposition('test',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:400,y:300},{x:300,y:400}]);
function setup() { const s=new Session(scene());s.interaction='move';s.viewport={width:360,height:640,zoom:1,pan:{x:0,y:0}};return {s,g:new Gestures(s)}; }
describe('film / source / screen coordinates',()=>{
  for(const turn of [0,1,2,3] as QuarterTurns[]) for(const zoom of [1,2,4]) {
    it(`pointer follows screen at ${turn*90} degrees / ${zoom}x`,()=>{
      const c=scene(); c.frame.turns=turn;
      const m=filmToScreen(c.frame,{width:390,height:700,zoom,pan:{x:43,y:-19}});
      const d=vector(inverse(m),{x:21,y:-37});
      const screen=vector(m,d);
      expect(screen.x).toBeCloseTo(21,10);expect(screen.y).toBeCloseTo(-37,10);
      let p={x:11.2,y:7.9};for(let i=0;i<100;i++)p=point(inverse(m),point(m,p));
      expect(p.x).toBeCloseTo(11.2,9);expect(p.y).toBeCloseTo(7.9,9);
      const sm=sourceToFilm(c.frame,c.layers[1],c.layers[1].placements[0]);
      const uv=point(inverse(sm),point(sm,{x:0.1,y:0.9}));
      expect(uv.x).toBeCloseTo(0.1,12); expect(uv.y).toBeCloseTo(0.9,12);
    });
  }
  it('turns retain exact quarter rotations',()=>{let t:QuarterTurns=0;for(let i=0;i<4;i++)t=turns(t+1);expect(t).toBe(0);});
});
describe('RAM gestures and single gesture ownership',()=>{
  it('lifts accumulate independent x/y offsets and one undo per gesture',()=>{
    const {s,g}=setup();const a=structuredClone(s.draft.layers[0]);
    g.down(1,{x:100,y:100});g.move(1,{x:120,y:130});g.up(1);
    expect(s.layer.transform).toEqual({xMm:2,yMm:3,turns:0});
    g.down(2,{x:100,y:100});g.move(2,{x:130,y:120});g.up(2);
    expect(s.layer.transform).toEqual({xMm:5,yMm:5,turns:0});
    expect(s.draft.layers[0]).toEqual(a);expect(s.draft.revision).toBe(0);expect(s.dirty).toBe(true);
    s.undo();expect(s.layer.transform.xMm).toBe(2);s.undo();expect(s.dirty).toBe(false);
  });
  it('second pointer rolls back only the unfinished single gesture; remaining finger cannot drag',()=>{
    const {s,g}=setup();g.down(1,{x:100,y:100});g.move(1,{x:120,y:100});g.up(1);
    g.down(1,{x:100,y:100});g.move(1,{x:150,y:140});
    g.down(2,{x:250,y:140});expect(s.layer.transform.xMm).toBe(2);expect(s.layer.transform.yMm).toBe(0);
    g.move(2,{x:350,y:140});expect(s.viewport.zoom).toBe(1);expect(s.layer.transform.scale).toBe(2);
    const scaledX=s.layer.transform.xMm;g.up(2);g.move(1,{x:10,y:10});expect(s.layer.transform.xMm).toBe(scaledX);
    g.up(1);expect(g.state).toBe('idle');
  });
  it('cancel and resize retain previous gestures and unlock after all pointers lift',()=>{
    const {s,g}=setup();g.down(1,{x:100,y:100});g.move(1,{x:110,y:110});g.up(1);
    g.down(1,{x:100,y:100});g.move(1,{x:160,y:110});g.cancel();
    expect(s.layer.transform.xMm).toBe(1);g.up(1);expect(g.active).toBe(false);
    g.down(1,{x:100,y:100});g.move(1,{x:120,y:120});g.cancelPointer(1);
    expect(s.layer.transform.xMm).toBe(1);expect(g.state).toBe('idle');
  });
  it('tap does not create undo or dirty; faster motion has the same meaning',()=>{
    const {s,g}=setup();g.down(1,{x:10,y:10});g.move(1,{x:11,y:11});g.up(1);
    expect(s.canUndo).toBe(false);expect(s.dirty).toBe(false);
    g.down(1,{x:10,y:10});g.move(1,{x:210,y:10});g.up(1);expect(s.layer.transform.xMm).toBe(20);
  });
  it('active layer and composition identity stay independent',()=>{
    const {s,g}=setup();s.activeLayer='a';g.down(1,{x:10,y:10});g.move(1,{x:10,y:30});g.up(1);
    expect(s.draft.layers[0].transform.yMm).toBe(2);expect(s.draft.layers[1].transform.yMm).toBe(0);
    const fresh=scene();expect(fresh.layers[0].transform.yMm).toBe(0);
    expect(s.draft.id).toBe('test');
  });
  it('parameter drag ignores x, clamps, cancels on pinch and never moves a layer',()=>{
    const {s,g}=setup();s.tool={kind:'parameter',parameter:'halo'};
    g.down(1,{x:10,y:200});g.move(1,{x:300,y:200});g.up(1);expect(s.draft.effects.halo).toBe(0.35);
    g.down(1,{x:10,y:200});g.move(1,{x:10,y:-500});expect(s.draft.effects.halo).toBe(1);
    g.down(2,{x:100,y:100});expect(s.draft.effects.halo).toBe(0.35);
    g.up(1);g.up(2);expect(s.layer.transform.yMm).toBe(0);
  });
});

describe('consistent film direction',()=>{
  it('portrait and landscape lie in the same landscape frame without stretching',()=>{
    const c=scene();
    expect(c.layers[0].placements[0].rect).toEqual(c.layers[1].placements[0].rect);
    expect(c.layers[1].placements[0].turns).toBe(1);
    for(const [i,size] of [[0,{x:400,y:300}],[1,{x:300,y:400}]] as const){
      const matrix=sourceToFilm(c.frame,c.layers[i],c.layers[i].placements[0]);
      const corners=[{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}].map(p=>point(matrix,p));
      expect(Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x))).toBeCloseTo(36);
      expect(Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))).toBeCloseTo(27);
      const dx=vector(matrix,{x:1/size.x,y:0}),dy=vector(matrix,{x:0,y:1/size.y});
      expect(Math.hypot(dx.x,dx.y)).toBeCloseTo(Math.hypot(dy.x,dy.y),10);
    }
  });
  it('manual layer rotation is undoable and never changes the other layer or saved revision',()=>{
    const s=new Session(scene()),initial=structuredClone(s.draft);
    s.rotateLayer();expect(s.layer.transform.turns).toBe(1);expect(s.draft.layers[0]).toEqual(initial.layers[0]);
    expect(s.savedRevision).toBe(0);expect(s.dirty).toBe(true);s.undo();expect(s.draft).toEqual(initial);
    for(let i=0;i<4;i++)s.rotateLayer();expect(s.draft).toEqual(initial);
  });
});

describe('browse and layer pinch',()=>{
  it('browse swipe navigates once without touching edits; vertical and cancelled drags do not navigate',()=>{
    const {s,g}=setup();s.interaction='browse';const before=structuredClone(s.draft),calls:number[]=[];g.onSwipe=d=>calls.push(d);
    g.down(1,{x:150,y:100});g.move(1,{x:60,y:105});g.up(1);expect(calls).toEqual([1]);expect(s.draft).toEqual(before);expect(s.dirty).toBe(false);
    g.down(1,{x:100,y:100});g.move(1,{x:100,y:200});g.up(1);expect(calls).toEqual([1]);
    g.down(1,{x:100,y:100});g.move(1,{x:200,y:100});g.cancelPointer(1);expect(calls).toEqual([1]);
    s.interaction='move';g.down(1,{x:150,y:100});g.move(1,{x:60,y:105});g.up(1);expect(calls).toEqual([1]);expect(s.dirty).toBe(true);
  });
  it('pinch edits selected layer only, keeps viewport fixed, cancels and undoes atomically',()=>{
    const {s,g}=setup();s.interaction='browse';const before=structuredClone(s.draft),view=structuredClone(s.viewport);
    g.down(1,{x:100,y:300});g.down(2,{x:200,y:300});g.move(2,{x:300,y:300});g.up(2);g.up(1);
    expect(s.layer.transform.scale).toBe(2);expect(s.draft.layers[0]).toEqual(before.layers[0]);expect(s.viewport).toEqual(view);expect(s.savedRevision).toBe(0);
    s.undo();expect(s.draft).toEqual(before);
    g.down(1,{x:100,y:300});g.down(2,{x:200,y:300});g.move(2,{x:300,y:300});g.cancelPointer(2);g.up(1);expect(s.draft).toEqual(before);
  });
  it('pinch returning to start leaves no phantom scale or Undo entry',()=>{
    const {s,g}=setup();g.down(1,{x:100,y:300});g.down(2,{x:200,y:300});g.move(2,{x:300,y:300});g.move(2,{x:200,y:300});g.up(2);g.up(1);
    expect(s.dirty).toBe(false);expect(s.canUndo).toBe(false);
  });
  it('scaled source keeps its center and doubles its span',()=>{
    const c=scene();c.layers[1].transform.scale=2;
    const m=sourceToFilm(c.frame,c.layers[1],c.layers[1].placements[0]);
    expect(point(m,{x:.5,y:.5})).toEqual({x:18,y:13.5});
    const edge=vector(m,{x:1,y:0});expect(Math.hypot(edge.x,edge.y)).toBeCloseTo(54);
  });
});
