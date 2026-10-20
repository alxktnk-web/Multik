import { clamp, copyComposition, turns, type Composition, type LayerId, type Tool, type Viewport } from './types';

// RAM-only working state. Persistence belongs to the navigation/repository layer (M3).
export class Session {
  draft: Composition;
  activeLayer: LayerId = 'b';
  tool: Tool = { kind: 'layer' };
  interaction: 'browse' | 'move' = 'browse';
  viewport: Viewport = { width: 1, height: 1, zoom: 1, pan: { x: 0, y: 0 } };
  private saved: Composition;
  private before?: Composition;
  private history: Composition[] = [];
  dirty = false;
  onChange: () => void = () => {};
  constructor(composition: Composition) {
    this.draft = copyComposition(composition);
    this.saved = copyComposition(composition);
  }
  get gesturing() { return !!this.before; }
  get canUndo() { return this.history.length > 0; }
  get savedRevision() { return this.saved.revision; }
  get layer() { return this.draft.layers[this.activeLayer === 'a' ? 0 : 1]; }
  begin() { if (!this.before) this.before = copyComposition(this.draft); }
  moveLayer(x: number, y: number) {
    const t=this.layer.transform, f=this.draft.frame;
    t.xMm=clamp(x,-f.widthMm,f.widthMm); t.yMm=clamp(y,-f.heightMm,f.heightMm);
    this.onChange();
  }
  end() {
    if (!this.before) return;
    if (JSON.stringify(this.before) !== JSON.stringify(this.draft)) {
      this.history.push(this.before);
      if (this.history.length > 50) this.history.shift();
    }
    this.before=undefined;
    this.refreshDirty();
    this.onChange();
  }
  cancel() {
    if (this.before) this.draft=this.before;
    this.before=undefined;
    this.refreshDirty();
    this.onChange();
  }
  private refreshDirty() { this.dirty=JSON.stringify({...this.saved,revision:0})!==JSON.stringify({...this.draft,revision:0}); }
  markSaved(composition:Composition){
    this.saved=copyComposition(composition);this.draft.revision=composition.revision;
    this.refreshDirty();this.onChange();
  }
  undo() {
    if (this.gesturing) return;
    const last=this.history.pop();
    if (last) { this.draft=last;this.draft.revision=this.saved.revision; this.refreshDirty(); this.onChange(); }
  }
  rotate() {
    if (this.gesturing) return;
    this.begin(); this.draft.frame.turns=turns(this.draft.frame.turns+1); this.end();
  }
  rotateLayer() {
    if(this.gesturing)return;
    this.begin();this.layer.transform.turns=turns(this.layer.transform.turns+1);this.end();
  }
  scaleLayer(value:number) {
    if(this.gesturing)return;
    this.begin();this.layer.transform.scale=clamp(value,.5,4);this.end();
  }
  resetLayer() {
    if (this.gesturing) return;
    this.begin(); this.layer.transform={xMm:0,yMm:0,turns:0}; this.end();
  }
  replace(composition: Composition) {
    this.before=undefined; this.history=[];
    this.saved=copyComposition(composition); this.draft=copyComposition(composition);
    this.dirty=false; this.viewport.zoom=1; this.viewport.pan={x:0,y:0}; this.onChange();
  }
}
