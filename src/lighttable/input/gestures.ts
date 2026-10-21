import { filmToScreen, inverse, vector, point, type Matrix } from '../model/transforms';
import { getLevels, moveLevel, setLevels } from '../model/levels';
import { dragParameter, xyTools } from '../model/parameters';
import { clamp, type Point, type Tool, type Levels } from '../model/types';
import type { Session } from '../model/session';

type Single = { start:Point;last:Point;x:number;y:number;inverse:Matrix;tool:Tool;value:number;valueX:number;moved:boolean;browse:boolean;levels:Readonly<Levels> };
type Pinch = { distance:number;scale:number;x:number;y:number;anchor:Point;moved:boolean;explicitScale:boolean };
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const center=(a:Point,b:Point)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

// Explicit browse/move ownership: no speed or long-press heuristic. Persistence is navigation-owned.
export class Gestures {
  private points=new Map<number,Point>();
  private single?:Single;
  private pinch?:Pinch;
  private waiting=false;
  onSwipe:(direction:-1|1)=>void=()=>{};
  constructor(readonly session:Session){}
  get active(){return this.points.size>0||this.waiting;}
  get state(){return this.waiting?'waiting':this.pinch?'scale':this.single?(this.single.moved?(this.single.browse?'browse':this.single.tool.kind):'pending'):'idle';}
  down(id:number,p:Point){
    if(this.waiting){this.points.set(id,p);return;}
    this.points.set(id,p);
    const s=this.session;
    if(this.points.size===1){
      if(s.tool.kind==='levels'){
        const m=filmToScreen(s.draft.frame,s.viewport),a=point(m,{x:0,y:0}),b=point(m,{x:s.draft.frame.widthMm,y:s.draft.frame.heightMm});
        const fraction=(p.x-Math.min(a.x,b.x))/Math.max(1,Math.abs(b.x-a.x));
        s.tool={kind:'levels',point:(['black','mid','white'] as const)[clamp(Math.floor(fraction*3),0,2)]};
      }
      s.begin();
      this.single={start:p,last:p,x:s.layer.transform.xMm,y:s.layer.transform.yMm,inverse:inverse(filmToScreen(s.draft.frame,s.viewport)),tool:{...s.tool},levels:{...getLevels(s.layer)},value:s.tool.kind==='parameter'?s.draft.effects[s.tool.parameter]:s.tool.kind==='xy'?s.draft.effects[xyTools[s.tool.pair].y]:0,valueX:s.tool.kind==='xy'?s.draft.effects[xyTools[s.tool.pair].x]:0,moved:false,browse:s.interaction==='browse'&&s.tool.kind==='layer'};
    }else if(this.points.size===2){
      s.cancel();this.single=undefined;s.begin();
      const [a,b]=[...this.points.values()],t=s.layer.transform;
      this.pinch={distance:Math.max(12,distance(a,b)),scale:t.scale??1,moved:false,explicitScale:t.scale!==undefined,x:t.xMm,y:t.yMm,anchor:point(inverse(filmToScreen(s.draft.frame,s.viewport)),center(a,b))};
    }else this.cancel();
  }
  move(id:number,p:Point){
    if(!this.points.has(id))return;this.points.set(id,p);if(this.waiting)return;
    const s=this.session;
    if(this.pinch){
      const [a,b]=[...this.points.values()],start=this.pinch,d=distance(a,b);
      if(!start.moved&&Math.abs(d-start.distance)<4)return;start.moved=true;
      const next=clamp(start.scale*d/start.distance,.5,4),ratio=next/start.scale,t=s.layer.transform,f=s.draft.frame;
      if(next===1&&!start.explicitScale)delete t.scale;else t.scale=next;
      // Keep the original pinch anchor fixed. Two-finger translation never pans the viewport.
      s.moveLayer(start.anchor.x-f.widthMm/2-(start.anchor.x-f.widthMm/2-start.x)*ratio,start.anchor.y-f.heightMm/2-(start.anchor.y-f.heightMm/2-start.y)*ratio);return;
    }
    const g=this.single;if(!g)return;g.last=p;
    const delta={x:p.x-g.start.x,y:p.y-g.start.y};
    if(!g.moved&&Math.hypot(delta.x,delta.y)<4)return;g.moved=true;
    if(g.browse)return;
    if(g.tool.kind==='layer'){const d=vector(g.inverse,delta);s.moveLayer(g.x+d.x,g.y+d.y);}
    else if(g.tool.kind==='levels'){setLevels(s.layer,moveLevel(g.levels,g.tool.point,g.levels[g.tool.point]-delta.y/Math.max(1,s.viewport.height*.7)));s.onChange();}
    else if(g.tool.kind==='xy'){const pair=xyTools[g.tool.pair];s.draft.effects[pair.y]=dragParameter(pair.y,g.value,delta.y,s.viewport.height);s.draft.effects[pair.x]=dragParameter(pair.x,g.valueX,-delta.x,s.viewport.width);s.onChange();}
    else{s.draft.effects[g.tool.parameter]=dragParameter(g.tool.parameter,g.value,delta.y,s.viewport.height);s.onChange();}
  }
  up(id:number){
    if(!this.points.has(id))return;this.points.delete(id);let swipe:-1|1|undefined;
    if(this.single){const g=this.single,dx=g.last.x-g.start.x,dy=g.last.y-g.start.y;
      if(g.browse&&Math.abs(dx)>=48&&Math.abs(dx)>Math.abs(dy)*1.4)swipe=dx<0?1:-1;
      this.session.end();this.single=undefined;
    }
    if(this.pinch){this.session.end();this.pinch=undefined;this.waiting=this.points.size>0;}
    if(this.points.size===0)this.waiting=false;
    if(swipe!==undefined)this.onSwipe(swipe);
  }
  cancel(){this.session.cancel();this.single=undefined;this.pinch=undefined;this.waiting=this.points.size>0;}
  cancelPointer(id:number){if(!this.points.has(id))return;this.cancel();this.up(id);}
  reset(){this.cancel();this.points.clear();this.waiting=false;}
}
export function bindGestures(canvas:HTMLCanvasElement,gestures:Gestures,changed:()=>void,enabled:()=>boolean=()=>true){
  const abort=new AbortController(),opts={signal:abort.signal};
  const local=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||!enabled())return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);gestures.down(e.pointerId,local(e));changed();},opts);
  canvas.addEventListener('pointermove',e=>gestures.move(e.pointerId,local(e)),opts);
  canvas.addEventListener('pointerup',e=>{gestures.up(e.pointerId);changed();},opts);
  canvas.addEventListener('pointercancel',e=>{gestures.cancelPointer(e.pointerId);changed();},opts);
  canvas.addEventListener('lostpointercapture',e=>{gestures.cancelPointer(e.pointerId);changed();},opts);
  canvas.addEventListener('contextmenu',e=>e.preventDefault(),opts);
  return ()=>{abort.abort();gestures.reset();};
}
