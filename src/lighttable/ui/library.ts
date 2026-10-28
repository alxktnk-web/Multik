import { ImportRoll } from './import-roll';
import { icon } from './icons';
import { FavoriteNotice } from './favorite-notice';
import { makeMosaic, validMosaic, type MosaicRecipe } from './mosaic';
import type { Repository } from '../data/repository';
import type { Navigation } from '../model/navigation';
import type { Project, Roll } from '../data/types';
import './home.css';

type HomeTab='rolls'|'mixes'|'favorites';
type HomeHooks={resumeCover?:()=>Promise<Blob|undefined>;cover?:(project:Project)=>Promise<Blob|undefined>;onOpen?:(project:Project)=>void;onStateChange?:()=>void;onFavoritesChange?:()=>Promise<void>};
const heart=icon('heart');
export class Library {
  readonly dialog=document.createElement('dialog');
  private detail=document.createElement('dialog');
  private settings=document.createElement('dialog');
  private importer:ImportRoll;
  private selected:string[]=[];
  private selecting=false;
  private urls:string[]=[];
  private busy=false;
  private pendingMix?:{key:string;project:Project};
  private generation=0;
  private status:HTMLElement;
  private projects:Project[]=[];
  private rolls:Roll[]=[];
  private recipes=new Map<string,MosaicRecipe>();
  private tab:HomeTab='mixes';
  private favoriteNotice:FavoriteNotice;
  private coverQueue=Promise.resolve();
  private photoQueue=Promise.resolve();
  private photoObserver?:IntersectionObserver;
  private photoRequests=new WeakMap<HTMLImageElement,{id:string;generation:number}>();
  constructor(readonly root:HTMLElement,readonly repo:Repository,readonly navigation:Navigation,readonly hooks:HomeHooks={}){
    this.dialog.className='library-dialog home-dialog';
    this.dialog.innerHTML=`<div class="sheet-content library-content"><header class="library-heading"><h1>Mixes</h1><div><button type="button" data-settings>Settings</button><button type="button" data-pwa-update hidden>Update</button><button type="button" data-add-roll hidden>Add roll</button><button type="button" data-new-mix>${icon('plus')} New mix</button><button type="button" data-cancel-selection hidden>Cancel</button></div></header><p class="home-update-status" data-pwa-state role="status" hidden></p><p class="selection-hint" hidden>Select two rolls</p><div class="mix-grid" aria-label="Mixes"></div><div class="roll-grid" aria-label="Rolls" hidden></div><p class="home-empty" hidden></p><div class="pending-imports"></div></div><footer class="sheet-dock home-dock"><p class="library-message" role="status" aria-live="polite"></p><div class="composer" hidden><div class="selected-strips"></div><div class="composer-actions"><button type="button" data-use-twice hidden>Use twice</button><button type="button" class="mix-button" data-start-mix disabled>Mix</button></div></div><button type="button" class="continue-editing" data-resume hidden><img alt=""/><span>Continue editing</span></button><nav class="home-navigation" aria-label="Library navigation"><button type="button" data-home-tab="rolls">${icon('rolls')}<span>Rolls</span></button><button type="button" data-home-tab="mixes">${icon('mixes')}<span>Mixes</span></button><button type="button" data-home-tab="favorites">${heart}<span>Library</span></button><button type="button" data-close-library aria-label="Back to lighttable">${icon('back')}<span>Back</span></button></nav></footer>`;
    this.detail.className='rename-dialog roll-detail';this.detail.innerHTML='<div class="sheet-content"><h1></h1><div class="detail-photos"></div></div><footer class="sheet-dock sheet-actions"><button type="button" class="text-button" data-close-detail>Close</button></footer>';
    this.settings.className='rename-dialog settings-dialog';this.settings.innerHTML='<div class="sheet-content"><h1>Settings</h1><label class="fixed-length-setting"><span>Fixed roll length</span><input type="checkbox" data-fixed-roll-length /></label><p>Choose 6, 12, 24 or 36 photos when adding a roll.</p><p data-settings-message role="status" aria-live="polite"></p></div><footer class="sheet-dock sheet-actions"><button type="button" class="text-button" data-close-settings>Close</button></footer>';
    this.status=this.dialog.querySelector('.library-message')!;
    this.favoriteNotice=new FavoriteNotice(repo,async()=>{await this.refresh();await this.hooks.onFavoritesChange?.();},e=>this.showError(e));this.dialog.querySelector('.home-dock')!.prepend(this.favoriteNotice.element);
    this.importer=new ImportRoll(repo,async roll=>{this.tab='rolls';if(this.selecting&&this.selected.length<2&&!this.selected.includes(roll.id))this.selected.push(roll.id);await this.refresh();});
    root.append(this.dialog,this.importer.dialog,this.detail,this.settings);
    this.dialog.querySelector<HTMLButtonElement>('[data-close-library]')!.onclick=()=>{if(!this.busy)this.dialog.close();};
    this.dialog.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});
    this.dialog.addEventListener('close',()=>{this.generation++;this.photoObserver?.disconnect();});
    for(const dialog of [this.dialog,this.importer.dialog,this.detail,this.settings])dialog.addEventListener('close',()=>this.hooks.onStateChange?.());
    this.detail.querySelector<HTMLButtonElement>('[data-close-detail]')!.onclick=()=>this.detail.close();
    const fixed=this.settings.querySelector<HTMLInputElement>('[data-fixed-roll-length]')!,message=this.settings.querySelector<HTMLElement>('[data-settings-message]')!;
    this.dialog.querySelector<HTMLButtonElement>('[data-settings]')!.onclick=()=>{if(this.busy)return;message.textContent='';fixed.disabled=true;this.settings.showModal();void this.importer.fixedRollLength().then(value=>{fixed.checked=value;fixed.disabled=false;}).catch(()=>{message.textContent='Could not load settings.';});};
    fixed.onchange=()=>{const desired=fixed.checked;fixed.disabled=true;message.textContent='';void this.importer.setFixedRollLength(desired).catch(()=>{fixed.checked=!desired;message.textContent='Could not save setting. Please try again.';}).finally(()=>{fixed.disabled=false;});};
    this.settings.querySelector<HTMLButtonElement>('[data-close-settings]')!.onclick=()=>this.settings.close();
    this.dialog.querySelector<HTMLButtonElement>('[data-add-roll]')!.onclick=()=>{if(!this.busy){this.importer.open();this.hooks.onStateChange?.();}};
    this.dialog.querySelector<HTMLButtonElement>('[data-new-mix]')!.onclick=()=>{this.selecting=true;this.selected=[];this.pendingMix=undefined;this.tab='rolls';void this.refresh().catch(e=>this.showError(e));};
    this.dialog.querySelector<HTMLButtonElement>('[data-cancel-selection]')!.onclick=()=>{this.selecting=false;this.selected=[];this.tab='mixes';void this.refresh().catch(e=>this.showError(e));};
    for(const b of this.dialog.querySelectorAll<HTMLButtonElement>('[data-home-tab]'))b.onclick=()=>{if(this.busy)return;this.selecting=false;this.selected=[];this.tab=b.dataset.homeTab as HomeTab;void this.refresh().catch(e=>this.showError(e));};
    this.dialog.querySelector<HTMLButtonElement>('[data-use-twice]')!.onclick=()=>{if(this.selected.length===1){this.selected.push(this.selected[0]);this.controls();void this.renderStrips(this.generation);}};
    this.dialog.querySelector<HTMLButtonElement>('[data-start-mix]')!.onclick=()=>void this.run(async()=>{if(this.selected.length!==2)return;this.status.textContent='Creating mix…';const key=JSON.stringify(this.selected);if(!this.pendingMix||this.pendingMix.key!==key)this.pendingMix={key,project:await this.repo.createProject(this.selected[0],this.selected[1])};await this.openProject(this.pendingMix.project);this.pendingMix=undefined;});
    this.dialog.querySelector<HTMLButtonElement>('[data-resume]')!.onclick=()=>void this.run(async()=>{const n=this.navigation as Navigation & {resume:()=>Promise<boolean>};if(!await n.resume())throw Error('The editing session is unavailable.');this.dialog.close();if(this.navigation.project)this.hooks.onOpen?.(this.navigation.project);this.hooks.onStateChange?.();});
  }
  get interacting(){return this.busy||this.importer.dialog.open||this.detail.open||this.settings.open;}
  get active(){return this.dialog.open||this.importer.dialog.open||this.detail.open||this.settings.open;}
  async open(tab:HomeTab='mixes'){this.tab=tab;this.selecting=false;this.selected=[];this.status.textContent='';if(!this.dialog.open)this.dialog.showModal();try{await this.refresh();}catch(e){this.showError(e);}}
  private async openProject(project:Project){if(!await this.navigation.open(project,project.kind==='favorite'?'library':'mixes'))throw Error('Finish the current action and try again.');if(this.detail.open)this.detail.close();this.dialog.close();this.hooks.onOpen?.(project);}
  private showError(error:unknown){this.status.textContent=error instanceof Error?error.message:'Could not open library';}
  private async run(action:()=>Promise<void>){if(this.busy)return;this.busy=true;this.controls();this.status.textContent='';try{await action();}catch(e){this.showError(e);}finally{this.busy=false;this.controls();}}
  private date(value:string){return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
  private controls(){
    this.dialog.querySelectorAll<HTMLButtonElement>('button:not([data-pwa-update])').forEach(b=>b.disabled=this.busy);
    this.dialog.querySelector<HTMLButtonElement>('[data-start-mix]')!.disabled=this.busy||this.selected.length!==2;
    this.dialog.querySelector<HTMLButtonElement>('[data-use-twice]')!.hidden=this.selected.length!==1;
    this.dialog.querySelector<HTMLElement>('.composer')!.hidden=!this.selecting;
    this.dialog.querySelector<HTMLElement>('.selection-hint')!.hidden=!this.selecting;
    this.dialog.querySelector<HTMLElement>('.selection-hint')!.textContent=this.selected.length===0?'Select two rolls':this.selected.length===1?'Select another roll or use this one twice':'Ready to mix';
    this.dialog.querySelector<HTMLButtonElement>('[data-cancel-selection]')!.hidden=!this.selecting;
    this.dialog.querySelector<HTMLButtonElement>('[data-new-mix]')!.hidden=this.tab!=='mixes'||this.selecting;
    this.dialog.querySelector<HTMLButtonElement>('[data-add-roll]')!.hidden=this.tab!=='rolls';
    this.dialog.querySelector<HTMLButtonElement>('[data-close-library]')!.hidden=!this.navigation.project;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-roll]').forEach(b=>{const indexes=this.selected.flatMap((id,i)=>id===b.dataset.roll?[i===0?'I':'II']:[]);b.setAttribute('aria-pressed',String(!!indexes.length));b.dataset.side=indexes.join(' + ');});
    for(const b of this.dialog.querySelectorAll<HTMLButtonElement>('[data-home-tab]'))b.setAttribute('aria-pressed',String(b.dataset.homeTab===this.tab));
    const resume=this.dialog.querySelector<HTMLButtonElement>('[data-resume]')!;resume.hidden=this.selecting||resume.dataset.available!=='true';
    this.hooks.onStateChange?.();
  }
  private image(img:HTMLImageElement,blob:Blob,generation:number){if(generation!==this.generation)return;const url=URL.createObjectURL(blob);this.urls.push(url);img.src=url;img.closest('.mix-card')?.setAttribute('aria-busy','false');}
  private async recipe(roll:Roll){
    const cached=this.recipes.get(roll.id);if(cached)return cached;
    const key=`roll-cover:${roll.id}`,existing=await this.repo.preference(key);if(validMosaic(existing,roll.assetIds)){this.recipes.set(roll.id,existing);return existing;}
    const candidate=makeMosaic(roll.assetIds);try{const repo=this.repo as Repository & {ensureRollCover:<T>(id:string,value:T)=>Promise<T>};const result=await repo.ensureRollCover(key,candidate);if(!validMosaic(result,roll.assetIds))throw Error('Saved roll cover is unavailable');this.recipes.set(roll.id,result);return result;}catch{this.status.textContent='Roll cover could not be saved. It may change next time.';this.recipes.set(roll.id,candidate);return candidate;}
  }
  private photo(img:HTMLImageElement,id:string,generation:number){
    img.loading='lazy';this.photoRequests.set(img,{id,generation});
    if(typeof IntersectionObserver==='undefined'){this.loadPhoto(img);return;}
    this.photoObserver??=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const image=entry.target as HTMLImageElement;this.photoObserver!.unobserve(image);this.loadPhoto(image);}}, {rootMargin:'200px'});
    this.photoObserver.observe(img);
  }
  private loadPhoto(img:HTMLImageElement){
    const request=this.photoRequests.get(img);if(!request)return;
    this.photoQueue=this.photoQueue.then(async()=>{if(request.generation!==this.generation)return;try{const asset=await this.repo.asset(request.id);if(img.isConnected)this.image(img,asset.preview,request.generation);}catch{if(request.generation===this.generation)this.status.textContent='Some photos could not be loaded.';}});
  }
  private async rollCard(roll:Roll,generation:number){
    const wrapper=document.createElement('div');wrapper.className='roll-wrapper';const button=document.createElement('button');button.className='roll-card';button.dataset.roll=roll.id;button.type='button';button.setAttribute('aria-label',`${roll.name}, ${roll.assetIds.length} photos`);const count=document.createElement('span');count.className='roll-count';count.textContent=String(roll.assetIds.length);button.append(count);
    const detail=document.createElement('button');detail.type='button';detail.className='roll-detail-button';detail.textContent='View photos';detail.onclick=()=>void this.showRoll(roll,generation);
    button.onclick=()=>{if(!this.selecting){void this.showRoll(roll,generation);return;}const index=this.selected.indexOf(roll.id);if(index>=0)this.selected=this.selected.filter(id=>id!==roll.id);else if(this.selected.length<2)this.selected.push(roll.id);else{this.status.textContent='Deselect a roll first.';return;}this.status.textContent='';this.controls();void this.renderStrips(generation);};wrapper.append(button,detail);
    const recipe=await this.recipe(roll);if(generation!==this.generation)return wrapper;
    for(const c of recipe.cells){const img=document.createElement('img');img.alt='';img.draggable=false;img.style.left=`${c.x*100}%`;img.style.top=`${c.y*100}%`;img.style.width=`${c.width*100}%`;img.style.height=`${c.height*100}%`;img.style.objectPosition=`${c.crop.x*100}% ${c.crop.y*100}%`;button.prepend(img);void this.photo(img,c.assetId,generation);}return wrapper;
  }
  private async showRoll(roll:Roll,generation:number){this.detail.querySelector('h1')!.textContent=roll.name;const grid=this.detail.querySelector<HTMLElement>('.detail-photos')!;for(const img of grid.querySelectorAll('img')){this.photoObserver?.unobserve(img);const url=img.getAttribute('src');if(url?.startsWith('blob:')){URL.revokeObjectURL(url);this.urls=this.urls.filter(value=>value!==url);}}grid.replaceChildren();for(const id of roll.assetIds){const img=document.createElement('img');img.alt='';grid.append(img);void this.photo(img,id,generation);}if(!this.detail.open)this.detail.showModal();this.hooks.onStateChange?.();}
  private async renderStrips(generation:number){const box=this.dialog.querySelector<HTMLElement>('.selected-strips')!;for(const img of box.querySelectorAll('img')){this.photoObserver?.unobserve(img);const url=img.getAttribute('src');if(url?.startsWith('blob:')){URL.revokeObjectURL(url);this.urls=this.urls.filter(value=>value!==url);}}box.replaceChildren();for(const [i,id] of this.selected.entries()){const roll=this.rolls.find(r=>r.id===id);if(!roll)continue;const row=document.createElement('div');row.className='selected-strip';row.innerHTML=`<strong>${i?'II':'I'}</strong>`;box.append(row);const recipe=await this.recipe(roll);if(generation!==this.generation||!row.isConnected)return;for(const cell of recipe.cells){const img=document.createElement('img');img.alt='';row.append(img);void this.photo(img,cell.assetId,generation);}const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remove roll ${i?'II':'I'}`);remove.onclick=()=>{this.selected.splice(i,1);this.controls();void this.renderStrips(generation);};row.append(remove);}}
  private card(project:Project,label:string){const card=document.createElement('button');card.type='button';card.className='mix-card';card.dataset.project=project.id;card.setAttribute('aria-label',label);card.setAttribute('aria-busy','true');const img=document.createElement('img');img.alt='';img.draggable=false;const caption=document.createElement('span');caption.textContent=label;card.append(img,caption);card.onclick=()=>void this.run(()=>this.openProject(project));return {card,img};}
  async refresh(){
    const generation=++this.generation;this.photoObserver?.disconnect();this.recipes.clear();const [rolls,projects,jobs,favorites]=await Promise.all([this.repo.listRolls(),this.repo.listProjects(),this.repo.pendingImports(),this.repo.listFavorites()]);if(generation!==this.generation)return;this.rolls=rolls;this.projects=projects.filter(p=>!p.kind);this.selected=this.selected.filter(id=>rolls.some(r=>r.id===id));for(const url of this.urls)URL.revokeObjectURL(url);this.urls=[];
    this.dialog.dataset.homeTab=this.tab;this.dialog.querySelector('h1')!.textContent=this.tab==='favorites'?'Library':this.tab==='rolls'?'Rolls':'Mixes';const mixes=this.dialog.querySelector<HTMLElement>('.mix-grid')!,grid=this.dialog.querySelector<HTMLElement>('.roll-grid')!;mixes.replaceChildren();grid.replaceChildren();mixes.hidden=this.tab==='rolls';grid.hidden=this.tab!=='rolls';
    if(this.tab==='rolls'){for(const roll of rolls){const card=await this.rollCard(roll,generation);if(generation!==this.generation)return;grid.append(card);}}
    else if(this.tab==='favorites'){for(const favorite of favorites){const project=projects.find(p=>p.id===favorite.projectId);if(!project)continue;const {card,img}=this.card(project,this.date(favorite.createdAt));card.dataset.favorite=favorite.id;const wrapper=document.createElement('div');wrapper.className='favorite-card';const mark=document.createElement('button');mark.type='button';mark.className='favorite-mark';mark.setAttribute('aria-label','Remove from Library');mark.setAttribute('aria-pressed','true');mark.innerHTML=heart;mark.onclick=()=>void this.run(async()=>{const removed=await this.repo.removeFavorite(favorite.id);await this.refresh();await this.hooks.onFavoritesChange?.();if(removed)this.favoriteNotice.show(removed);});wrapper.append(card,mark);mixes.append(wrapper);this.image(img,favorite.thumb,generation);}}
    else for(const p of this.projects){const {card,img}=this.card(p,this.date(p.updatedAt));mixes.append(card);this.coverQueue=this.coverQueue.then(async()=>{if(generation!==this.generation)return;try{const blob=await this.hooks.cover?.(p);if(blob)this.image(img,blob,generation);else card.setAttribute('aria-busy','false');}catch{card.setAttribute('aria-busy','false');}});const thumbs=document.createElement('div');thumbs.className='mix-sources';card.insertBefore(thumbs,card.lastChild);void Promise.all([this.repo.roll(p.rollA),this.repo.roll(p.rollB)]).then(rs=>{const recipe=(p as Project & {recipe?:{slots:{assetAId:string;assetBId:string}[]};slot?:number}).recipe;const slot=recipe?.slots[(p as Project & {slot?:number}).slot??0];const ids=slot?[slot.assetAId,slot.assetBId]:[rs[0].assetIds[p.a],rs[1].assetIds[p.b]];for(const id of ids){const photo=document.createElement('img');photo.alt='';thumbs.append(photo);void this.photo(photo,id,generation);}}).catch(()=>{});}
    const empty=this.dialog.querySelector<HTMLElement>('.home-empty')!;empty.hidden=this.tab==='rolls'?!!rolls.length:!!mixes.childElementCount;empty.textContent=this.tab==='rolls'?'Add a roll to start collecting photos.':this.tab==='favorites'?'Photos you like will appear here.':'Create your first mix.';
    const pending=this.dialog.querySelector<HTMLElement>('.pending-imports')!;pending.replaceChildren();pending.hidden=this.tab!=='rolls';if(this.tab==='rolls')for(const job of jobs){const row=document.createElement('div'),label=document.createElement('span'),cancel=document.createElement('button');label.textContent=`Unfinished import: ${job.name}`;cancel.textContent='Discard import';cancel.className='text-button';cancel.onclick=()=>void this.run(async()=>{await this.repo.cancelImport(job);await this.refresh();});row.append(label,cancel);pending.append(row);}
    const resume=this.dialog.querySelector<HTMLButtonElement>('[data-resume]')!;try{const n=this.navigation as Navigation & {resumeAvailable:()=>Promise<boolean>};resume.dataset.available=String(await n.resumeAvailable());if(resume.dataset.available==='true'){const thumb=await this.hooks.resumeCover?.();const img=resume.querySelector('img')!;img.hidden=!thumb;if(thumb)this.image(img,thumb,generation);}}catch{resume.dataset.available='false';}if(generation!==this.generation)return;this.controls();await this.renderStrips(generation);
  }
  dispose(){this.generation++;this.photoObserver?.disconnect();this.favoriteNotice.dispose();this.importer.dispose();for(const url of this.urls)URL.revokeObjectURL(url);this.dialog.remove();this.detail.remove();this.settings.remove();}
}
