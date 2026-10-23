import type { Renderer } from '../render/renderer';
import { Repository } from '../data/repository';
import { pairId, stableSeed, type Project, type Roll, type Asset } from '../data/types';
import { createComposition, copyComposition, type LayerId } from './types';
import type { Session } from './session';

// Serial navigation owns persistence. Renderer/gestures never write to the repository.
export class Navigation {
  project?:Project;
  rolls?:[Roll,Roll];
  sources?:[Asset,Asset];
  busy=false;
  onBusy:()=>void=()=>{};
  onChange:()=>void=()=>{};
  constructor(readonly repo:Repository,readonly session:Session,readonly renderer:Renderer){}
  async commit(){
    if(!this.project||!this.session.dirty)return;
    if(this.session.gesturing)throw Error('Finish moving before changing frames');
    const next=await this.repo.commit(copyComposition(this.session.draft),this.session.savedRevision);
    this.session.markSaved(next);
  }
  async boundary(action:()=>Promise<void>){
    if(this.busy)return false;
    this.busy=true;this.onBusy();
    try{await this.commit();await action();return true;}finally{this.busy=false;this.onBusy();}
  }
  async open(project:Project){
    return this.boundary(async()=>{
      const rolls=await Promise.all([this.repo.roll(project.rollA),this.repo.roll(project.rollB)]) as [Roll,Roll];
      await this.present(project,rolls);
    });
  }
  async select(layer:LayerId,index:number){
    if(!this.project||!this.rolls||this.busy||this.project.kind==='favorite')return false;
    const key=layer==='a'?'a':'b';
    if(this.project[key]===index){this.session.activeLayer=layer;this.session.tool={kind:'layer'};this.onChange();return true;}
    if(!Number.isInteger(index)||index<0||index>=this.rolls[layer==='a'?0:1].assetIds.length)return false;
    return this.boundary(async()=>{
      const next={...this.project!,[key]:index};await this.present(next,this.rolls!);
      this.session.activeLayer=layer;this.session.tool={kind:'layer'};this.onChange();
    });
  }
  async step(direction:-1|1){
    if(!this.project||!this.rolls||this.busy||this.project.kind==='favorite')return false;
    return this.boundary(async()=>{
      const p=this.project!,r=this.rolls!;
      const next={...p,a:(p.a+direction+r[0].capacity)%r[0].capacity,b:(p.b+direction+r[1].capacity)%r[1].capacity};
      await this.present(next,r);
    });
  }
  private async present(project:Project,rolls:[Roll,Roll]){
    const ids=[rolls[0].assetIds[project.a],rolls[1].assetIds[project.b]];
    if(ids.some(id=>!id))throw Error('This photo is missing from the roll');
    const sources=await Promise.all(ids.map(id=>this.repo.asset(id))) as [Asset,Asset];
    const id=pairId(project,ids[0],ids[1]);
    const initial=createComposition(id,sources.map(a=>({assetId:a.id,assetRevision:a.revision})) as Parameters<typeof createComposition>[1],sources.map(a=>({x:a.width,y:a.height})) as Parameters<typeof createComposition>[2],stableSeed(id));
    const scene=await this.repo.ensureComposition(initial);
    // Previously viewed but never edited pairs adopt the consistent film direction.
    // Saved user edits (revision > 0) retain their exact placement.
    if(scene.revision===0&&scene.layers.every(l=>l.transform.xMm===0&&l.transform.yMm===0&&l.transform.turns===0&&(l.transform.scale??1)===1&&l.placements[0].turns===0))scene.layers=initial.layers;
    const success=await this.renderer.loadPair(sources.map(a=>({id:a.id,blob:a.preview})) as Parameters<Renderer['loadPair']>[0],true,scene,()=>this.repo.select(project));
    if(!success)throw Error('Photo is recovering. Try selecting again.');
    this.project=project;this.rolls=rolls;this.sources=sources;this.onChange();
  }
  async keepConflictCopy(){
    if(!this.project||this.busy)return false;
    this.busy=true;this.onBusy();
    try{
      const result=await this.repo.fork(copyComposition(this.session.draft),this.project);
      this.project=result.project;this.session.replace(result.composition);this.onChange();return true;
    }finally{this.busy=false;this.onBusy();}
  }
}
