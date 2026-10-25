import type { Renderer } from '../render/renderer';
import { Repository } from '../data/repository';
import { pairId, stableSeed, type Project, type Roll, type Asset } from '../data/types';
import { createComposition, copyComposition, type LayerId } from './types';
import type { Session } from './session';

export type BrowsingSpace='mixes'|'library';
type LibraryContext={projectId:string;anchorId:string;order:string[]};

// Serial navigation owns persistence. Renderer/gestures never write to the repository.
export class Navigation {
  project?:Project;
  rolls?:[Roll,Roll];
  sources?:[Asset,Asset];
  space:BrowsingSpace='mixes';
  private libraryAnchor='';
  private libraryOrder:string[]=[];
  busy=false;
  onBusy:()=>void=()=>{};
  onChange:()=>void=()=>{};
  constructor(readonly repo:Repository,readonly session:Session,readonly renderer:Renderer){}
  async commit(){
    if(!this.project||!this.session.dirty)return;
    if(this.session.gesturing)throw Error('Finish moving before changing frames');
    if(this.project.kind==='favorite'){
      const copy=await this.repo.workingCopy(copyComposition(this.session.draft),this.project);
      this.project=copy.project;this.session.markSaved(copy.composition);
      await this.persistContext();this.onChange();return;
    }
    const next=await this.repo.commit(copyComposition(this.session.draft),this.session.savedRevision);
    this.session.markSaved(next);
  }
  async boundary(action:()=>Promise<void>){
    if(this.busy)return false;
    this.busy=true;this.onBusy();
    try{await this.commit();await action();return true;}finally{this.busy=false;this.onBusy();}
  }
  async open(project:Project,space?:BrowsingSpace){
    return this.boundary(async()=>{
      const rolls=await Promise.all([this.repo.roll(project.rollA),this.repo.roll(project.rollB)]) as [Roll,Roll];
      const remembered=space===undefined?await this.repo.preference('browsing-context') as LibraryContext|undefined:undefined;
      const restore=remembered?.projectId===project.id&&typeof remembered.anchorId==='string'&&Array.isArray(remembered.order)&&remembered.order.every(id=>typeof id==='string');
      const nextSpace=space??(restore||project.kind?'library':'mixes');
      // Anchor belongs to the saved variant, even when edits create a hidden draft.
      const order=nextSpace==='library'?(await this.repo.listFavorites()).map(f=>f.projectId):[];
      await this.present(project,rolls,nextSpace,restore?remembered!.anchorId:project.id,restore?remembered!.order:order);
    });
  }
  async select(layer:LayerId,index:number){
    if(!this.project||!this.rolls||this.busy)return false;
    const key=layer==='a'?'a':'b';
    if(this.project[key]===index){this.session.activeLayer=layer;this.onChange();return true;}
    if(this.space==='library')return false;
    if(!Number.isInteger(index)||index<0||index>=this.rolls[layer==='a'?0:1].assetIds.length)return false;
    return this.boundary(async()=>{
      const project=this.project!;
      const next={...project,[key]:index};await this.present(next,this.rolls!);
      this.session.activeLayer=layer;this.session.tool={kind:'layer'};this.onChange();
    });
  }
  async step(direction:-1|1){
    if(!this.project||!this.rolls||this.busy)return false;
    // Empty Library keeps the current image and its working draft in place.
    if(this.space==='library'){
      return this.boundary(async()=>{
        const order=(await this.repo.listFavorites()).map(f=>f.projectId);
        if(!order.length)return;
        const index=order.indexOf(this.libraryAnchor);
        let nextId:string|undefined;
        if(index>=0)nextId=order[(index+direction+order.length)%order.length];
        else{
          // Unlike leaves the viewed item onscreen. On the next swipe, continue
          // from its former position, skipping other memberships removed since.
          const previous=this.libraryOrder.indexOf(this.libraryAnchor);
          if(previous>=0)for(let distance=1;distance<=this.libraryOrder.length;distance++){
            const candidate=this.libraryOrder[(previous+direction*distance+this.libraryOrder.length)%this.libraryOrder.length];
            if(order.includes(candidate)){nextId=candidate;break;}
          }
          nextId??=direction===1?order[0]:order[order.length-1];
        }
        // A one-item Library has nowhere to move. Keep its working edits
        // visible instead of replacing the draft with the immutable snapshot.
        if(order.length===1&&nextId===this.libraryAnchor)return;
        const project=await this.repo.project(nextId);
        if(project.kind!=='favorite')throw Error('Saved variant is unavailable');
        const rolls=await Promise.all([this.repo.roll(project.rollA),this.repo.roll(project.rollB)]) as [Roll,Roll];
        await this.present(project,rolls,'library',project.id,order);
      });
    }
    return this.boundary(async()=>{
      const p=this.project!,r=this.rolls!;
      const next={...p,a:(p.a+direction+r[0].capacity)%r[0].capacity,b:(p.b+direction+r[1].capacity)%r[1].capacity};
      await this.present(next,r);
    });
  }
  private context(project:Project,space=this.space,anchor=this.libraryAnchor,order=this.libraryOrder){
    return space==='library'?{projectId:project.id,anchorId:anchor,order}:null;
  }
  private async persistContext(){
    if(this.project)await this.repo.setPreference('browsing-context',this.context(this.project));
  }
  private async present(project:Project,rolls:[Roll,Roll],space=this.space,anchor=this.libraryAnchor,order=this.libraryOrder){
    const ids=[rolls[0].assetIds[project.a],rolls[1].assetIds[project.b]];
    if(ids.some(id=>!id))throw Error('This photo is missing from the roll');
    const sources=await Promise.all(ids.map(id=>this.repo.asset(id))) as [Asset,Asset];
    const id=pairId(project,ids[0],ids[1]);
    const initial=createComposition(id,sources.map(a=>({assetId:a.id,assetRevision:a.revision})) as Parameters<typeof createComposition>[1],sources.map(a=>({x:a.width,y:a.height})) as Parameters<typeof createComposition>[2],stableSeed(id));
    const scene=await this.repo.ensureComposition(initial);
    // Previously viewed but never edited pairs adopt the consistent film direction.
    // Saved user edits (revision > 0) retain their exact placement.
    if(scene.revision===0&&scene.layers.every(l=>l.transform.xMm===0&&l.transform.yMm===0&&l.transform.turns===0&&(l.transform.scale??1)===1&&l.placements[0].turns===0))scene.layers=initial.layers;
    const success=await this.renderer.loadPair(sources.map(a=>({id:a.id,blob:a.preview})) as Parameters<Renderer['loadPair']>[0],true,scene,async()=>{await this.repo.select(project);await this.repo.setPreference('browsing-context',this.context(project,space,anchor,order));});
    if(!success)throw Error('Photo is recovering. Try selecting again.');
    this.project=project;this.rolls=rolls;this.sources=sources;this.space=space;this.libraryAnchor=anchor;this.libraryOrder=order;this.onChange();
  }
  async keepConflictCopy(){
    if(!this.project||this.busy)return false;
    this.busy=true;this.onBusy();
    try{
      const result=await this.repo.fork(copyComposition(this.session.draft),this.project);
      this.project=result.project;this.session.replace(result.composition);await this.persistContext();this.onChange();return true;
    }finally{this.busy=false;this.onBusy();}
  }
}
