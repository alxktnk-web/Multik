import { ImportRoll } from './import-roll';
import { icon } from './icons';
import { FavoriteNotice } from './favorite-notice';
import type { Repository } from '../data/repository';
import type { Navigation } from '../model/navigation';
import type { Project, Roll } from '../data/types';
import './home.css';

type HomeTab='mixes'|'favorites';
type HomeHooks={cover?:(project:Project)=>Promise<Blob|undefined>;onOpen?:(project:Project)=>void;onStateChange?:()=>void;onFavoritesChange?:()=>Promise<void>};
const heart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
const gridIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

/** Home owns browsing/import UI, not the renderer or the editing session. */
export class Library {
  readonly dialog=document.createElement('dialog');
  private rename=document.createElement('dialog');
  private importer:ImportRoll;
  private selected:string[]=[];
  private urls:string[]=[];
  private busy=false;
  private generation=0;
  private status:HTMLElement;
  private pressTimer=0;
  private renameId='';
  private projects:Project[]=[];
  private tab:HomeTab='mixes';
  private coverQueue=Promise.resolve();
  private favoriteNotice:FavoriteNotice;
  constructor(readonly root:HTMLElement,readonly repo:Repository,readonly navigation:Navigation,readonly hooks:HomeHooks={}){
    this.dialog.className='library-dialog home-dialog';
    this.dialog.innerHTML=`<div class="sheet-content library-content"><header class="library-heading"><h1>Mixes</h1><button type="button" data-pwa-update hidden>Update</button></header><p class="home-update-status" data-pwa-state role="status" hidden></p><div class="mix-grid" aria-label="Mixes"></div><p class="home-empty" hidden></p><details class="home-rolls"><summary>Use existing rolls</summary><div class="roll-grid" aria-label="Rolls"></div><button type="button" class="mix-button" data-start-mix disabled hidden>Mix</button></details><div class="pending-imports"></div></div><footer class="sheet-dock home-dock"><p class="library-message" role="status" aria-live="polite"></p><div class="home-create"><button type="button" class="mix-button" data-new-mix>${icon('plus')}<span>Mix</span></button><button type="button" class="text-button" data-new-roll>${icon('plus')}<span>Roll</span></button></div><nav class="home-navigation" aria-label="Library navigation"><button type="button" data-close-library aria-label="Back to lighttable">${icon('back')}</button><button type="button" data-home-tab="mixes" aria-pressed="true">${gridIcon}<span>Mixes</span></button><button type="button" data-home-tab="favorites" aria-pressed="false">${heart}<span>Library</span></button></nav></footer>`;
    this.rename.className='rename-dialog';
    this.rename.innerHTML='<form><div class="sheet-content"><h1>Rename roll</h1><input data-rename-name aria-label="Roll name" maxlength="80" required autocomplete="off"/><p class="rename-message" role="status"></p><details class="roll-mixes"><summary>Saved mixes</summary><div></div></details></div><footer class="sheet-dock sheet-actions"><button type="button" class="text-button" data-cancel-rename>Cancel</button><button class="mix-button" data-save-name>Save</button></footer></form>';
    this.status=this.dialog.querySelector('.library-message')!;
    this.favoriteNotice=new FavoriteNotice(repo,async()=>{await this.refresh();await this.hooks.onFavoritesChange?.();},e=>this.showError(e));
    this.dialog.querySelector('.home-dock')!.prepend(this.favoriteNotice.element);
    this.importer=new ImportRoll(repo,async roll=>{this.selected=[...this.selected.slice(-1),roll.id];this.tab='mixes';await this.refresh();this.dialog.querySelector<HTMLDetailsElement>('.home-rolls')!.open=true;});
    root.append(this.dialog,this.importer.dialog,this.rename);
    this.dialog.querySelector<HTMLButtonElement>('[data-close-library]')!.onclick=()=>{if(!this.busy)this.dialog.close();};
    this.dialog.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});
    this.dialog.addEventListener('close',()=>{this.cancelPress();this.generation++;});
    this.dialog.addEventListener('scroll',()=>this.cancelPress(),true);
    for(const dialog of [this.dialog,this.importer.dialog,this.rename])dialog.addEventListener('close',()=>this.hooks.onStateChange?.());
    this.dialog.querySelector<HTMLButtonElement>('[data-new-roll]')!.onclick=()=>{if(!this.busy){this.importer.open();this.hooks.onStateChange?.();}};
    this.dialog.querySelector<HTMLButtonElement>('[data-new-mix]')!.onclick=()=>{
      if(this.busy)return;
      // Callback may be retried after storage/navigation failure. Reuse its project.
      let created:Project|undefined;
      this.importer.openMix({onImported:async rolls=>{
        created??=await this.repo.createProject(rolls[0].id,rolls[1].id);
        await this.openProject(created);
      },onCancel:()=>{void this.refresh().catch(e=>this.showError(e));}});
      this.hooks.onStateChange?.();
    };
    for(const b of this.dialog.querySelectorAll<HTMLButtonElement>('[data-home-tab]'))b.onclick=()=>{if(this.busy)return;this.tab=b.dataset.homeTab as HomeTab;void this.refresh().catch(e=>this.showError(e));};
    this.dialog.querySelector<HTMLButtonElement>('[data-start-mix]')!.onclick=()=>void this.run(async()=>{
      if(!this.selected.length)return;const [a,b=a]=this.selected;
      const p=this.projects.find(p=>p.rollA===a&&p.rollB===b)??await this.repo.createProject(a,b);
      await this.openProject(p);
    });
    this.rename.querySelector<HTMLButtonElement>('[data-cancel-rename]')!.onclick=()=>{if(!this.busy)this.rename.close();};
    this.rename.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});
    this.rename.querySelector('form')!.onsubmit=e=>{
      e.preventDefault();void this.run(async()=>{
        try{await repo.renameRoll(this.renameId,this.rename.querySelector<HTMLInputElement>('[data-rename-name]')!.value);await this.refresh();this.rename.close();}
        catch(error){this.rename.querySelector('.rename-message')!.textContent=error instanceof Error?error.message:'Could not rename roll';}
      });
    };
  }
  get interacting(){return this.busy||this.importer.dialog.open||this.rename.open;}
  get active(){return this.dialog.open||this.importer.dialog.open||this.rename.open;}
  async open(tab:HomeTab='mixes'){this.tab=tab;this.status.textContent='';if(!this.dialog.open)this.dialog.showModal();try{await this.refresh();}catch(e){this.showError(e);}}
  private async openProject(project:Project){
    if(!await this.navigation.open(project))throw Error('Finish the current action and try again.');
    this.rename.close();this.dialog.close();this.hooks.onOpen?.(project);
  }
  private showError(error:unknown){this.status.textContent=error instanceof Error?error.message:'Could not open library';}
  private async run(action:()=>Promise<void>){if(this.busy)return;this.busy=true;this.controls();this.status.textContent='';try{await action();}catch(e){this.showError(e);}finally{this.busy=false;this.controls();}}
  private cancelPress(){clearTimeout(this.pressTimer);this.pressTimer=0;}
  private editRoll(roll:Roll){
    if(this.busy||this.rename.open)return;this.cancelPress();this.renameId=roll.id;
    const input=this.rename.querySelector<HTMLInputElement>('[data-rename-name]')!;input.value=roll.name;
    this.rename.querySelector('.rename-message')!.textContent='';
    const details=this.rename.querySelector<HTMLDetailsElement>('.roll-mixes')!,list=details.querySelector('div')!;details.open=false;list.replaceChildren();
    const mixes=this.projects.filter(p=>p.rollA===roll.id||p.rollB===roll.id);details.hidden=!mixes.length;
    for(const p of mixes){const b=document.createElement('button');b.type='button';b.className='project-card';b.dataset.project=p.id;b.textContent=this.date(p.updatedAt);b.onclick=()=>void this.run(()=>this.openProject(p));list.append(b);}
    this.rename.showModal();this.hooks.onStateChange?.();input.focus();input.select();
  }
  private date(value:string){return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
  private controls(){
    for(const dialog of [this.dialog,this.rename])dialog.querySelectorAll<HTMLButtonElement>('button:not([data-pwa-update])').forEach(b=>{b.disabled=this.busy;});
    this.rename.querySelector<HTMLInputElement>('[data-rename-name]')!.disabled=this.busy;
    const mix=this.dialog.querySelector<HTMLButtonElement>('[data-start-mix]')!;mix.hidden=this.selected.length===0;mix.disabled=this.busy||!this.selected.length;mix.setAttribute('aria-label',this.selected.length===1?'Mix this roll with itself':'Mix selected rolls');
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-roll]').forEach(b=>{const index=this.selected.indexOf(b.dataset.roll!);b.setAttribute('aria-pressed',String(index>=0));b.dataset.side=index===0?'I':index===1?'II':'';});
    for(const b of this.dialog.querySelectorAll<HTMLButtonElement>('[data-home-tab]'))b.setAttribute('aria-pressed',String(b.dataset.homeTab===this.tab));
    this.hooks.onStateChange?.();
  }
  private image(img:HTMLImageElement,blob:Blob,generation:number){if(generation!==this.generation)return;const url=URL.createObjectURL(blob);this.urls.push(url);img.src=url;img.closest('.mix-card')?.setAttribute('aria-busy','false');}
  private queueCover(project:Project,img:HTMLImageElement,generation:number){
    this.coverQueue=this.coverQueue.then(async()=>{
      if(generation!==this.generation||!this.dialog.open)return;
      try{
        const blob=await this.hooks.cover?.(project);
        if(blob)this.image(img,blob,generation);
        else if(generation===this.generation){img.closest('.mix-card')?.setAttribute('aria-busy','false');img.alt='Open mix';}
      }catch{if(generation===this.generation){img.closest('.mix-card')?.setAttribute('aria-busy','false');img.alt='Open mix';}}
    });
  }
  private card(project:Project,label:string){
    const card=document.createElement('button');card.type='button';card.className='mix-card';card.dataset.project=project.id;card.setAttribute('aria-label',label);card.setAttribute('aria-busy','true');
    const img=document.createElement('img');img.alt='';img.draggable=false;
    const caption=document.createElement('span');caption.textContent=label;card.append(img,caption);
    card.onclick=()=>void this.run(()=>this.openProject(project));return {card,img};
  }
  async refresh(){
    this.cancelPress();const generation=++this.generation;
    const [rolls,projects,jobs,favorites]=await Promise.all([this.repo.listRolls(),this.repo.listProjects(),this.repo.pendingImports(),this.repo.listFavorites()]);if(generation!==this.generation)return;
    this.projects=projects.filter(p=>!p.kind);this.selected=this.selected.filter(id=>rolls.some(r=>r.id===id));
    for(const url of this.urls)URL.revokeObjectURL(url);this.urls=[];
    const favoritesTab=this.tab==='favorites';this.dialog.dataset.homeTab=this.tab;
    this.dialog.querySelector('h1')!.textContent=favoritesTab?'Library':'Mixes';
    const mixes=this.dialog.querySelector<HTMLElement>('.mix-grid')!;mixes.setAttribute('aria-label',favoritesTab?'Liked photos':'Mixes');mixes.replaceChildren();
    if(favoritesTab){
      for(const favorite of favorites){
        const project=projects.find(p=>p.id===favorite.projectId);if(!project)continue;
        const {card,img}=this.card(project,this.date(favorite.createdAt));card.dataset.favorite=favorite.id;
        const wrapper=document.createElement('div');wrapper.className='favorite-card';
        const mark=document.createElement('button');mark.type='button';mark.className='favorite-mark';mark.setAttribute('aria-label','Remove from Library');mark.setAttribute('aria-pressed','true');mark.innerHTML=heart;
        mark.onclick=()=>void this.run(async()=>{const removed=await this.repo.removeFavorite(favorite.id);await this.refresh();await this.hooks.onFavoritesChange?.();if(removed)this.favoriteNotice.show(removed);});
        wrapper.append(card,mark);mixes.append(wrapper);this.image(img,favorite.thumb,generation);
      }
    }else for(const p of this.projects){const {card,img}=this.card(p,this.date(p.updatedAt));mixes.append(card);this.queueCover(p,img,generation);}
    const empty=this.dialog.querySelector<HTMLElement>('.home-empty')!;empty.hidden=!!mixes.childElementCount;empty.textContent=favoritesTab?'Photos you like will appear here.':'Create your first mix.';
    const rollSection=this.dialog.querySelector<HTMLElement>('.home-rolls')!;rollSection.hidden=favoritesTab||!rolls.length;
    const grid=this.dialog.querySelector<HTMLElement>('.roll-grid')!;grid.replaceChildren();
    for(const roll of rolls){
      const button=document.createElement('button');button.className='roll-card';button.dataset.roll=roll.id;button.type='button';
      const img=document.createElement('img');img.alt='';img.draggable=false;const name=document.createElement('span');name.textContent=roll.name;button.setAttribute('aria-label',`${roll.name}, ${roll.capacity} frames. Hold to rename.`);button.append(img,name);
      let held=false,start:{x:number;y:number}|undefined;
      button.onpointerdown=e=>{if(e.button!==0||!e.isPrimary||this.busy)return;this.cancelPress();held=false;start={x:e.clientX,y:e.clientY};this.pressTimer=window.setTimeout(()=>{held=true;this.editRoll(roll);},500);};
      button.onpointermove=e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8){this.cancelPress();start=undefined;}};
      button.onpointerup=button.onpointercancel=()=>{this.cancelPress();start=undefined;};
      button.oncontextmenu=e=>{e.preventDefault();held=true;this.editRoll(roll);};
      button.onkeydown=e=>{if(e.key==='F2'||(e.shiftKey&&e.key==='F10')){e.preventDefault();this.editRoll(roll);}};
      button.onclick=()=>{if(held){held=false;return;}if(this.busy||this.rename.open)return;const index=this.selected.indexOf(roll.id);if(index>=0)this.selected.splice(index,1);else this.selected=[...this.selected.slice(-1),roll.id];this.controls();};grid.append(button);
      void this.repo.asset(roll.assetIds[0]).then(asset=>this.image(img,asset.thumb,generation)).catch(e=>{if(generation===this.generation)this.showError(e);});
    }
    const pending=this.dialog.querySelector<HTMLElement>('.pending-imports')!;pending.replaceChildren();pending.hidden=favoritesTab;
    for(const job of jobs){const row=document.createElement('div'),label=document.createElement('span'),cancel=document.createElement('button');label.textContent=`Unfinished import: ${job.name}`;cancel.textContent='Discard import';cancel.className='text-button';cancel.onclick=()=>void this.run(async()=>{await this.repo.cancelImport(job);await this.refresh();});row.append(label,cancel);pending.append(row);}
    this.dialog.querySelector<HTMLElement>('.home-create')!.hidden=favoritesTab;
    this.controls();
  }
  dispose(){this.cancelPress();this.generation++;this.favoriteNotice.dispose();this.importer.dispose();for(const url of this.urls)URL.revokeObjectURL(url);this.dialog.remove();this.rename.remove();}
}
