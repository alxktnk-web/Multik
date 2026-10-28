import { Repository } from '../data/repository';
import { pairId, stableSeed, type Project } from '../data/types';
import { Session } from '../model/session';
import { createComposition, type Composition } from '../model/types';
import { Renderer } from '../render/renderer';
import { initialRecipeScene } from '../model/navigation';

// One serialized, reusable offscreen preview renderer. Never replaces the editing
// session or runs on pointer movement. Covers use the same shaders as the canvas.
export class Covers {
  private renderer?:Renderer;
  private session?:Session;
  private queue:Promise<unknown>=Promise.resolve();
  private disposed=false;
  constructor(private repo:Repository){}
  render(snapshot:Composition):Promise<Blob>{
    const copy=structuredClone(snapshot);
    const job=this.queue.then(async()=>{
      if(this.disposed)throw Error('Preview closed');
      if(!this.renderer){this.session=new Session(copy);this.renderer=new Renderer(document.createElement('canvas'),this.session);this.renderer.setSourceResolver(async(source,full)=>{const a=await this.repo.asset(source.assetId);if(a.revision!==source.assetRevision)throw Error('Film strip source unavailable');return {id:a.id,blob:full?a.blob:a.preview};});}
      const portrait=copy.frame.turns%2===1;
      this.session!.viewport={width:portrait?480:640,height:portrait?640:480,zoom:1,pan:{x:0,y:0}};
      const assets=await Promise.all(copy.layers.map(l=>this.repo.asset(l.placements[0].source.assetId)));
      if(this.disposed)throw Error('Preview closed');
      if(!await this.renderer.loadPair(assets.map(a=>({id:a.id,blob:a.preview})) as Parameters<Renderer['loadPair']>[0],true,copy))throw Error('Preview unavailable');
      return this.renderer.capturePreview();
    });
    this.queue=job.catch(()=>{});return job;
  }
  async project(project:Project):Promise<Blob|undefined>{
    const rolls=await Promise.all([this.repo.roll(project.rollA),this.repo.roll(project.rollB)]);
    const ids=[rolls[0].assetIds[project.a],rolls[1].assetIds[project.b]];
    const id=pairId(project,ids[0],ids[1]);
    const stored=await this.repo.composition(id);
    const cached=await this.repo.preference(`cover:${project.id}`) as {compositionId:string;revision:number;thumb:Blob}|undefined;
    if(cached?.compositionId===id&&cached.revision===(stored?.revision??0)&&cached.thumb instanceof Blob)return cached.thumb;
    let composition=stored;
    if(!composition){
      const assets=await Promise.all(ids.map(id=>this.repo.asset(id)));
      composition=await initialRecipeScene(this.repo,project,createComposition(id,assets.map(a=>({assetId:a.id,assetRevision:a.revision})) as Parameters<typeof createComposition>[1],assets.map(a=>({x:a.width,y:a.height})) as Parameters<typeof createComposition>[2],stableSeed(id)));
    }
    const thumb=await this.render(composition);
    // Cache failure must not hide a usable cover or discard the saved composition.
    try{await this.repo.setPreference(`cover:${project.id}`,{compositionId:id,revision:composition.revision,thumb});}catch{}
    return thumb;
  }
  dispose(){this.disposed=true;this.renderer?.dispose();}
}
