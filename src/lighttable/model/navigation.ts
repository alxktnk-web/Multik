import type { Renderer } from '../render/renderer';
import { Repository } from '../data/repository';
import { pairId, stableSeed, type Project, type Roll, type Asset, type MixRecipe } from '../data/types';
import { createComposition, copyComposition, type LayerId } from './types';
import type { Session } from './session';

export type BrowsingSpace='mixes'|'library';
type LibraryContext={projectId:string;anchorId:string;order:string[]};
type EditingContext={project:Project;space:BrowsingSpace;anchor:string;order:string[];layer:LayerId};

// Serial navigation owns persistence. Renderer/gestures never write to the repository.
export class Navigation {
  project?:Project;
  rolls?:[Roll,Roll];
  sources?:[Asset,Asset];
  space:BrowsingSpace='mixes';
  private libraryAnchor='';
  private libraryOrder:string[]=[];
  private editingTarget?:string;
  private pendingEditing?:EditingContext;
  private pendingBrowsing?:{value:LibraryContext|null};
  busy=false;
  onBusy:()=>void=()=>{};
  onChange:()=>void=()=>{};
  constructor(readonly repo:Repository,readonly session:Session,readonly renderer:Renderer){}
  async commit(){
    if(this.session.gesturing&&(this.pendingEditing||this.pendingBrowsing||this.session.dirty))throw Error('Finish moving before changing frames');
    if(this.pendingEditing)await this.saveEditingContext();
    if(this.pendingBrowsing)await this.saveBrowsingContext();
    if(!this.project||!this.session.dirty)return;
    if(this.session.gesturing)throw Error('Finish moving before changing frames');
    if(this.project.kind==='favorite'){
      const copy=await this.repo.workingCopy(copyComposition(this.session.draft),this.project);
      this.project=copy.project;this.session.markSaved(copy.composition);
      this.pendingBrowsing={value:this.context(this.project)};
      await this.rememberEditing();await this.saveBrowsingContext();this.onChange();return;
    }
    const next=await this.repo.commit(copyComposition(this.session.draft),this.session.savedRevision);
    this.session.markSaved(next);await this.rememberEditing();
  }
  async boundary(action:()=>Promise<void>){
    if(this.busy)return false;
    this.busy=true;this.onBusy();
    try{if(this.session.gesturing)throw Error('Finish moving before changing frames');await this.commit();if(this.project&&this.editingTarget===this.editingKey(this.project,this.space))await this.rememberEditing();await action();return true;}finally{this.busy=false;this.onBusy();}
  }
  async open(project:Project,space?:BrowsingSpace){
    return this.boundary(async()=>{
      const rolls=await Promise.all([this.repo.roll(project.rollA),this.repo.roll(project.rollB)]) as [Roll,Roll];
      const remembered=space===undefined?await this.repo.preference('browsing-context') as LibraryContext|undefined:undefined;
      const editing=await this.repo.preference('last-editing-session') as EditingContext|undefined;
      const restore=remembered?.projectId===project.id&&typeof remembered.anchorId==='string'&&Array.isArray(remembered.order)&&remembered.order.every(id=>typeof id==='string');
      const nextSpace=space??(restore||project.kind?'library':'mixes');
      // Anchor belongs to the saved variant, even when edits create a hidden draft.
      const order=nextSpace==='library'?(await this.repo.listFavorites()).map(f=>f.projectId):[];
      await this.present(project,rolls,nextSpace,restore?remembered!.anchorId:project.id,restore?remembered!.order:order);
      if(editing?.project&&this.editingKey(editing.project,editing.space)===this.editingKey(project,nextSpace))this.editingTarget=this.editingKey(project,nextSpace);
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
      const next:Project={...project,[key]:index};
      if(project.recipe){const slots=project.recipe.slots.map(s=>({...s}));const slot=slots[project.slot!];slot[layer==='a'?'assetAId':'assetBId']=this.rolls![layer==='a'?0:1].assetIds[index];next.recipe={...project.recipe,slots};}
      await this.present(next,this.rolls!);
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
      let next:Project;
      if(p.recipe){const slot=((p.slot??0)+direction+p.recipe.slots.length)%p.recipe.slots.length;const item=p.recipe.slots[slot];next={...p,slot,a:r[0].assetIds.indexOf(item.assetAId),b:r[1].assetIds.indexOf(item.assetBId)};}
      else next={...p,a:(p.a+direction+r[0].capacity)%r[0].capacity,b:(p.b+direction+r[1].capacity)%r[1].capacity};
      await this.present(next,r);
    });
  }
  private editingKey(project:Project,space:BrowsingSpace){
    return JSON.stringify([project.id,space,project.recipe?project.recipe.slots[project.slot??0]?.id:[project.a,project.b]]);
  }
  private async saveEditingContext(){
    const value=this.pendingEditing;if(!value)return;
    await this.repo.setPreference('last-editing-session',value);
    if(this.pendingEditing===value)this.pendingEditing=undefined;
  }
  async rememberEditing(){
    if(!this.project)return;
    const value:EditingContext={project:structuredClone(this.project),space:this.space,anchor:this.libraryAnchor,order:[...this.libraryOrder],layer:this.session.activeLayer};
    this.editingTarget=this.editingKey(this.project,this.space);this.pendingEditing=value;
    await this.saveEditingContext();
  }
  async resumeAvailable(){
    const value=await this.repo.preference('last-editing-session') as EditingContext|undefined;
    if(!value?.project?.id)return false;
    try{await this.repo.project(value.project.id);return true;}catch{return false;}
  }
  async resume(){
    const value=await this.repo.preference('last-editing-session') as EditingContext|undefined;
    if(!value?.project?.id)throw Error('Editing session unavailable');
    return this.boundary(async()=>{
      const current=await this.repo.project(value.project.id);
      const rolls=await Promise.all([this.repo.roll(current.rollA),this.repo.roll(current.rollB)]) as [Roll,Roll];
      let project:Project;
      if(value.project.recipe){
        const savedSlot=value.project.recipe.slots[value.project.slot??0];
        const slot=current.recipe?.slots.findIndex(item=>item.id===savedSlot?.id)??-1;
        if(slot<0||!current.recipe)throw Error('Editing session is unavailable');
        const item=current.recipe.slots[slot];
        project={...current,slot,a:rolls[0].assetIds.indexOf(item.assetAId),b:rolls[1].assetIds.indexOf(item.assetBId)};
      }else project={...current,a:value.project.a,b:value.project.b};
      await this.present(project,rolls,value.space,value.anchor,value.order,current.recipe);
      this.session.activeLayer=value.layer==='a'?'a':'b';this.session.tool={kind:'layer'};await this.rememberEditing();this.onChange();
    });
  }
  private context(project:Project,space=this.space,anchor=this.libraryAnchor,order=this.libraryOrder){
    return space==='library'?{projectId:project.id,anchorId:anchor,order}:null;
  }
  private async saveBrowsingContext(){
    const pending=this.pendingBrowsing;if(!pending)return;
    await this.repo.setPreference('browsing-context',pending.value);
    if(this.pendingBrowsing===pending)this.pendingBrowsing=undefined;
  }
  private async persistContext(){
    if(!this.project)return;
    this.pendingBrowsing={value:this.context(this.project)};
    await this.saveBrowsingContext();
  }
  private async present(project:Project,rolls:[Roll,Roll],space=this.space,anchor=this.libraryAnchor,order=this.libraryOrder,expectedRecipe?:MixRecipe){
    const ids=[rolls[0].assetIds[project.a],rolls[1].assetIds[project.b]];
    if(project.recipe){const slot=project.recipe.slots[project.slot??0];if(!slot||slot.assetAId!==ids[0]||slot.assetBId!==ids[1])throw Error('This mix was changed by an older version. Update all tabs and reopen it.');}
    if(ids.some(id=>!id))throw Error('This photo is missing from the roll');
    const sources=await Promise.all(ids.map(id=>this.repo.asset(id))) as [Asset,Asset];
    const id=pairId(project,ids[0],ids[1]);
    const initial=createComposition(id,sources.map(a=>({assetId:a.id,assetRevision:a.revision})) as Parameters<typeof createComposition>[1],sources.map(a=>({x:a.width,y:a.height})) as Parameters<typeof createComposition>[2],stableSeed(id));
    const scene=await this.repo.ensureComposition(initial);
    // Previously viewed but never edited pairs adopt the consistent film direction.
    // Saved user edits (revision > 0) retain their exact placement.
    if(scene.revision===0&&scene.layers.every(l=>l.transform.xMm===0&&l.transform.yMm===0&&l.transform.turns===0&&(l.transform.scale??1)===1&&l.placements[0].turns===0))scene.layers=initial.layers;
    const success=await this.renderer.loadPair(sources.map(a=>({id:a.id,blob:a.preview})) as Parameters<Renderer['loadPair']>[0],true,scene,async()=>{await this.repo.select(project,expectedRecipe??(this.project?.id===project.id?this.project.recipe:project.recipe));await this.repo.setPreference('browsing-context',this.context(project,space,anchor,order));});
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
