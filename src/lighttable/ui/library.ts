import { pairId } from '../data/types';
import { ImportRoll } from './import-roll';
import type { Repository } from '../data/repository';
import type { Navigation } from '../model/navigation';

export class Library {
  readonly dialog=document.createElement('dialog');
  private importer:ImportRoll;
  private selected:string[]=[];
  private urls:string[]=[];
  private busy=false;
  private generation=0;
  private status:HTMLElement;
  constructor(readonly root:HTMLElement,readonly repo:Repository,readonly navigation:Navigation){
    this.dialog.className='library-dialog';
    this.dialog.innerHTML=`<div class="sheet-content library-content"><header class="library-heading"><span class="wordmark">multik<span class="wordmark-dot"> · </span></span></header><div class="library-hero"></div><div class="roll-grid"></div><div class="saved-projects"></div><div class="pending-imports"></div></div><footer class="sheet-dock"><p class="library-message" role="status" aria-live="polite"></p><div class="sheet-actions"><button class="close-dialog" data-close-library aria-label="Back to lighttable">×</button><button class="text-button add-roll-button" data-new-roll aria-label="New roll">＋</button><button class="mix-button" data-start-mix disabled>Mix</button></div></footer>`;
    this.status=this.dialog.querySelector('.library-message')!;
    this.importer=new ImportRoll(repo,async roll=>{this.selected=[...this.selected.slice(-1),roll.id];await this.refresh();});
    root.append(this.dialog,this.importer.dialog);
    this.dialog.querySelector<HTMLButtonElement>('[data-close-library]')!.onclick=()=>{if(!this.busy)this.dialog.close();};
    this.dialog.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});
    this.dialog.querySelector<HTMLButtonElement>('[data-new-roll]')!.onclick=()=>{if(!this.busy)this.importer.open();};
    this.dialog.querySelector<HTMLButtonElement>('[data-start-mix]')!.onclick=()=>void this.run(async()=>{
      if(!this.selected.length)return;const p=await this.repo.createProject(this.selected[0],this.selected[1]??this.selected[0]);
      if(await this.navigation.open(p))this.dialog.close();
    });
  }
  async open(){this.status.textContent='';this.dialog.showModal();try{await this.refresh();}catch(e){this.showError(e);}}
  private showError(error:unknown){this.status.textContent=error instanceof Error?error.message:'Could not open library';}
  private async run(action:()=>Promise<void>){if(this.busy)return;this.busy=true;this.controls();this.status.textContent='';try{await action();}catch(e){this.showError(e);}finally{this.busy=false;this.controls();}}
  private controls(){
    this.dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=this.busy;});
    const mix=this.dialog.querySelector<HTMLButtonElement>('[data-start-mix]')!;mix.disabled=this.busy||this.selected.length===0;mix.textContent='Mix';mix.setAttribute('aria-label',this.selected.length===1?'Mix this roll with itself':'Mix selected rolls');
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-roll]').forEach(b=>{const index=this.selected.indexOf(b.dataset.roll!);b.setAttribute('aria-pressed',String(index>=0));b.dataset.side=index===0?'I':index===1?'II':'';});
  }
  async refresh(){
    const generation=++this.generation;const [rolls,projects,jobs]=await Promise.all([this.repo.listRolls(),this.repo.listProjects(),this.repo.pendingImports()]);if(generation!==this.generation)return;
    for(const url of this.urls)URL.revokeObjectURL(url);this.urls=[];
    const grid=this.dialog.querySelector<HTMLElement>('.roll-grid')!;grid.replaceChildren();
    for(const roll of rolls){
      const button=document.createElement('button');button.className='roll-card';button.dataset.roll=roll.id;button.type='button';
      const img=document.createElement('img');img.alt='';const name=document.createElement('span');name.textContent=roll.name;const count=document.createElement('small');count.textContent=String(roll.capacity);button.setAttribute('aria-label',`${roll.name}, ${roll.capacity} frames`);button.append(img,name,count);
      button.onclick=()=>{if(this.busy)return;const index=this.selected.indexOf(roll.id);if(index>=0)this.selected.splice(index,1);else this.selected=[...this.selected.slice(-1),roll.id];this.controls();};grid.append(button);
      void this.repo.asset(roll.assetIds[0]).then(asset=>{if(generation!==this.generation)return;const url=URL.createObjectURL(asset.thumb);this.urls.push(url);img.src=url;img.classList.toggle('portrait-source',asset.height>asset.width);}).catch(e=>this.showError(e));
    }
    grid.hidden=!rolls.length;
    const recent=this.dialog.querySelector('.saved-projects')!;recent.replaceChildren();
    const hero=this.dialog.querySelector<HTMLElement>('.library-hero')!;hero.replaceChildren();
    if(projects.length){
      const p=[...projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
      const card=document.createElement('button');card.className='resume-hero';card.dataset.resume=p.id;card.setAttribute('aria-label','Resume last mix');
      const label=document.createElement('span');label.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';card.append(label);
      for(const [side,rollId,index] of [['a',p.rollA,p.a],['b',p.rollB,p.b]] as const){const roll=rolls.find(r=>r.id===rollId);if(!roll)continue;const img=document.createElement('img');img.alt='';img.className=`hero-source hero-${side}`;card.prepend(img);void this.repo.asset(roll.assetIds[index]).then(asset=>{if(generation!==this.generation)return;const url=URL.createObjectURL(asset.preview);this.urls.push(url);img.src=url;}).catch(e=>{if(generation===this.generation)this.showError(e);});}
      const rollA=rolls.find(r=>r.id===p.rollA),rollB=rolls.find(r=>r.id===p.rollB);
      if(rollA&&rollB){const id=pairId(p,rollA.assetIds[p.a],rollB.assetIds[p.b]);
        void Promise.all([this.repo.preference(`result:${p.id}`),this.repo.composition(id)]).then(([value,scene])=>{
          const result=value as {compositionId?:string;revision?:number;profileVersion?:number;thumb?:Blob}|undefined;
          if(generation!==this.generation||!scene||result?.compositionId!==id||result.revision!==scene.revision||result.profileVersion!==scene.profile.version||!(result.thumb instanceof Blob))return;
          const img=document.createElement('img');img.alt='';img.className='hero-result';const url=URL.createObjectURL(result.thumb);this.urls.push(url);img.src=url;
          card.querySelectorAll('img').forEach(image=>image.remove());card.prepend(img);
        }).catch(()=>{/* A missing derivative never blocks the original pair. */});
      }
      card.onclick=()=>void this.run(async()=>{if(await this.navigation.open(p))this.dialog.close();});hero.append(card);
    }else{
      const empty=document.createElement('button');empty.className='empty-hero';empty.setAttribute('aria-label','Add your first roll');empty.innerHTML='<span class="empty-film film-one" aria-hidden="true"></span><span class="empty-film film-two" aria-hidden="true"></span><span class="hero-add" aria-hidden="true">＋</span>';empty.onclick=()=>{if(!this.busy)this.importer.open();};hero.append(empty);
    }
    for(const p of projects){const button=document.createElement('button');button.className='project-card';button.dataset.project=p.id;button.textContent=`${rolls.find(r=>r.id===p.rollA)?.name??'Roll'} × ${rolls.find(r=>r.id===p.rollB)?.name??'Roll'}`;button.onclick=()=>void this.run(async()=>{if(await this.navigation.open(p))this.dialog.close();});recent.append(button);}
    const pending=this.dialog.querySelector('.pending-imports')!;pending.replaceChildren();
    for(const job of jobs){const row=document.createElement('div'),label=document.createElement('span'),cancel=document.createElement('button');label.textContent=`Unfinished import: ${job.name}`;cancel.textContent='Discard import';cancel.className='text-button';cancel.onclick=()=>void this.run(async()=>{await this.repo.cancelImport(job);await this.refresh();});row.append(label,cancel);pending.append(row);}
    this.controls();
  }
  dispose(){this.generation++;this.importer.dispose();for(const url of this.urls)URL.revokeObjectURL(url);this.dialog.remove();}
}
