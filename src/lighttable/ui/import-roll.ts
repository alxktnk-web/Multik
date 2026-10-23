import { Selection, importFiles, suggestedRollName } from '../data/import';
import type { Repository } from '../data/repository';
import { capacities, type Roll } from '../data/types';
import { decodeSource } from '../render/assets';
import { icon } from './icons';
import './import.css';

type ImportOptions={capacity?:number;step?:1|2;pick?:boolean;onImported?:(roll:Roll)=>Promise<void>;onCancel?:()=>void};
type MixOptions={onImported:(rolls:[Roll,Roll])=>Promise<void>;onCancel?:()=>void};
type RollDraft={files:File[];capacity:number;name:string};
type MixDraft={options:MixOptions;step:1|2;first?:RollDraft;rolls:Roll[]};

export class ImportRoll {
  readonly dialog=document.createElement('dialog');
  private selection=new Selection();
  private urls=new Map<File,string>();
  private previews=Promise.resolve();
  private previewed=new Set<File>();
  private progress:HTMLProgressElement;
  private generation=0;
  private busy=false;
  private abort?:AbortController;
  private list:HTMLElement;
  private status:HTMLElement;
  private count:HTMLElement;
  private input:HTMLInputElement;
  private save:HTMLButtonElement;
  private options:ImportOptions={};
  private mix?:MixDraft;
  private completed?:Roll;
  constructor(readonly repo:Repository,readonly imported:(roll:Roll)=>Promise<void>){
    this.dialog.className='roll-import-dialog';
    this.dialog.innerHTML=`<div class="sheet-content"><header class="sheet-heading"><button type="button" data-import-back aria-label="Back to first roll" hidden>${icon('back')}</button><h1>New roll</h1><span class="import-step" aria-label="Roll in mix"></span></header><div class="import-meta"><div class="frame-limits" role="group" aria-label="Frame limit">${capacities.map(n=>`<button type="button" data-capacity="${n}" aria-pressed="false" aria-label="${n} frames"><span>${String(n).padStart(2,'0')}</span></button>`).join('')}</div><input data-roll-name aria-label="Roll name" placeholder="Roll name" maxlength="80"/></div><div class="candidate-grid"></div></div><footer class="sheet-dock"><div class="import-count" role="status" aria-live="polite"></div><progress class="import-progress" max="1" value="0" hidden aria-label="Preparing photos"></progress><p class="import-message" role="status" aria-live="polite"></p><div class="sheet-actions"><button type="button" class="close-dialog" data-close-import aria-label="Cancel import">×</button><label class="add-files" aria-label="Add photos">${icon('plus')}<input type="file" multiple accept="image/*" data-roll-files aria-label="Add photos"/></label><button type="button" class="mix-button" data-save-roll aria-label="Add roll">Add roll</button><button type="button" class="text-button" data-cancel-job hidden>Cancel</button></div></footer>`;
    this.list=this.dialog.querySelector('.candidate-grid')!;this.status=this.dialog.querySelector('.import-message')!;this.count=this.dialog.querySelector('.import-count')!;this.input=this.dialog.querySelector('[data-roll-files]')!;this.save=this.dialog.querySelector('[data-save-roll]')!;
    this.progress=this.dialog.querySelector('progress')!;
    this.input.addEventListener('cancel',()=>{
      if(this.busy||this.selection.files.length)return;
      if(this.mix?.step===2){this.status.textContent='Add photos for the second roll.';return;}
      this.cancel();
    });
    this.input.onchange=()=>{
      if(this.busy||this.currentSaved)return;const added=Array.from(this.input.files??[]);this.input.value='';if(!added.length||!this.selection.add(added))return;
      this.status.textContent='';this.render();for(const file of added)this.preview(file);
    };
    for(const b of this.dialog.querySelectorAll<HTMLButtonElement>('[data-capacity]'))b.onclick=()=>{
      if(this.busy||this.currentSaved||this.mix?.step===2)return;this.selection.setCapacity(Number(b.dataset.capacity));this.render();
    };
    this.dialog.querySelector<HTMLButtonElement>('[data-close-import]')!.onclick=()=>this.cancel();
    this.dialog.addEventListener('cancel',e=>{
      // The native file input's cancel event bubbles. Only Escape on the dialog
      // cancels the whole wizard; cancelling the second picker keeps roll I.
      if(e.target!==this.dialog)return;e.preventDefault();this.cancel();
    });
    this.dialog.querySelector<HTMLButtonElement>('[data-import-back]')!.onclick=()=>this.back();
    this.dialog.querySelector<HTMLButtonElement>('[data-cancel-job]')!.onclick=()=>this.abort?.abort();
    this.save.onclick=()=>{if(this.mix?.step===1)this.next();else void this.submit();};this.render();
  }
  /** Invoke from a user gesture when pick is true; the native source menu belongs to iOS. */
  open(options:ImportOptions={}){
    if(this.busy||this.dialog.open)return;
    this.clearSelection();this.mix=undefined;this.completed=undefined;this.options=options;
    this.selection.setCapacity(options.capacity??12);this.name.value=suggestedRollName();this.status.textContent='';
    this.render();this.dialog.showModal();this.resetScroll();if(options.pick!==false)this.input.click();
  }
  /** Both selections stay in RAM until Create mix. Next opens the second picker in the same tap. */
  openMix(options:MixOptions){
    if(this.busy||this.dialog.open)return;
    this.clearSelection();this.completed=undefined;this.options={};this.mix={options,step:1,rolls:[]};
    this.selection.setCapacity(12);this.name.value=suggestedRollName();this.status.textContent='';
    this.render();this.dialog.showModal();this.resetScroll();this.input.click();
  }
  private get name(){return this.dialog.querySelector<HTMLInputElement>('[data-roll-name]')!;}
  private get currentSaved(){return !!this.completed||!!(this.mix?.step===2&&this.mix.rolls[1]);}
  private resetScroll(){this.dialog.querySelector<HTMLElement>('.sheet-content')!.scrollTop=0;}
  private snapshot():RollDraft{return {files:[...this.selection.files],capacity:this.selection.capacity,name:this.name.value.trim()||suggestedRollName()};}
  private next(){
    const mix=this.mix;if(this.busy||!mix||mix.step!==1||!this.selection.ready)return;
    mix.first=this.snapshot();mix.step=2;this.clearSelection();this.selection.setCapacity(mix.first.capacity);
    this.name.value=suggestedRollName();this.status.textContent='';this.render();this.resetScroll();this.input.click();
  }
  private back(){
    const mix=this.mix;if(this.busy||!mix?.first||mix.rolls.length)return;
    const first=mix.first;this.clearSelection();mix.step=1;mix.first=undefined;
    this.selection.setCapacity(first.capacity);this.selection.files=[...first.files];this.name.value=first.name;this.status.textContent='';
    this.render();this.resetScroll();for(const file of this.selection.files)this.preview(file);
  }
  private cancel(){
    if(this.busy)return;const callback=this.mix?.options.onCancel??this.options.onCancel;
    this.clearSelection();this.mix=undefined;this.completed=undefined;this.dialog.close();callback?.();
  }
  private preview(file:File){
    const generation=this.generation;
    this.previews=this.previews.then(async()=>{
      if(generation!==this.generation||this.busy||!this.selection.files.includes(file))return;
      let decoded;
      try{
        decoded=await decodeSource({id:'import-preview',blob:file},320);const c=document.createElement('canvas');c.width=decoded.width;c.height=decoded.height;c.getContext('2d')!.drawImage(decoded.image,0,0);
        const blob=await new Promise<Blob|null>(r=>c.toBlob(r,'image/jpeg',.88));c.width=c.height=1;
        if(blob&&generation===this.generation&&this.selection.files.includes(file)){const old=this.urls.get(file);if(old)URL.revokeObjectURL(old);this.urls.set(file,URL.createObjectURL(blob));this.updatePreview(file);}
      }catch{/* Bad candidate remains removable; submit reports the decoder error. */}finally{decoded?.close();if(generation===this.generation){this.previewed.add(file);this.previewProgress();}}
    });
  }
  private updatePreview(file:File){
    for(const element of this.list.querySelectorAll<HTMLElement>('[data-candidate]'))if(this.selection.files[Number(element.dataset.candidate)]===file)element.querySelector('img')!.src=this.urls.get(file)!;
  }
  private previewProgress(){
    if(this.busy)return;
    const files=this.selection.files,done=files.filter(f=>this.previewed.has(f)).length,pending=done<files.length;
    this.progress.hidden=!pending;this.progress.max=Math.max(1,files.length);this.progress.value=done;this.progress.setAttribute('aria-label','Preparing previews');
    if(pending&&(!this.status.textContent||this.status.textContent.startsWith('Preparing previews')))this.status.textContent=`Preparing previews ${done} of ${files.length}`;
    else if(this.status.textContent?.startsWith('Preparing previews'))this.status.textContent='';
  }
  private render(){
    const s=this.selection,step=this.mix?.step??this.options.step,saved=this.currentSaved;
    this.dialog.querySelector('h1')!.textContent=this.mix?'New mix':'New roll';this.dialog.querySelector('.import-step')!.textContent=step?`${step} / 2`:'';
    const back=this.dialog.querySelector<HTMLButtonElement>('[data-import-back]')!;back.hidden=this.mix?.step!==2;back.disabled=this.busy||!!this.mix?.rolls.length;
    this.count.textContent=`${s.files.length} / ${s.capacity}${s.ready?' ✓':s.overflow?` · Remove ${s.files.length-s.capacity}`:` · ${s.capacity-s.files.length} left`}`;this.count.classList.toggle('overflow',s.overflow);
    this.dialog.dataset.selection=s.overflow?'overflow':s.ready?'full':'open';this.dialog.style.setProperty('--filled',String(Math.min(1,s.files.length/s.capacity)));this.count.hidden=this.busy;this.dialog.setAttribute('aria-busy',String(this.busy));
    const action=this.mix?(step===1?'Next':'Create mix'):'Add roll';this.save.textContent=action;this.save.setAttribute('aria-label',s.ready?action:`Select ${s.capacity} photos to confirm`);
    this.input.closest('label')!.hidden=this.busy||saved;this.save.hidden=this.busy;this.dialog.querySelector<HTMLButtonElement>('[data-close-import]')!.hidden=this.busy;
    this.input.disabled=this.busy||s.full||saved;this.input.closest('label')!.classList.toggle('disabled',this.input.disabled);this.save.disabled=this.busy||!s.ready;
    for(const b of this.dialog.querySelectorAll<HTMLButtonElement>('[data-capacity]')){b.setAttribute('aria-pressed',String(Number(b.dataset.capacity)===s.capacity));b.disabled=this.busy||saved||this.mix?.step===2;}
    this.name.disabled=this.busy||saved;this.dialog.querySelector<HTMLButtonElement>('[data-close-import]')!.disabled=this.busy;this.dialog.querySelector<HTMLButtonElement>('[data-cancel-job]')!.hidden=!this.busy;
    this.list.replaceChildren();
    s.files.forEach((file,index)=>{
      const card=document.createElement('div');card.className='candidate';card.dataset.candidate=String(index);card.classList.toggle('candidate-extra',index>=s.capacity);
      const img=document.createElement('img');img.alt='';card.setAttribute('aria-label',file.name);const url=this.urls.get(file);if(url)img.src=url;
      const remove=document.createElement('button');remove.textContent='×';remove.type='button';remove.setAttribute('aria-label',`Remove photo ${index+1}`);remove.disabled=this.busy||saved;
      remove.onclick=()=>{if(this.busy||this.currentSaved)return;s.remove(index);const url=this.urls.get(file);if(url&&!s.files.includes(file)){URL.revokeObjectURL(url);this.urls.delete(file);}this.render();};card.append(img,remove);this.list.append(card);
    });this.previewProgress();
  }
  private async write(draft:RollDraft,offset:number,total:number){
    const selection=new Selection();selection.setCapacity(draft.capacity);selection.files=[...draft.files];
    return importFiles(this.repo,selection,draft.name,n=>{this.progress.value=offset+n;this.status.textContent=`Importing ${offset+n} of ${total}`;},this.abort!.signal);
  }
  private async submit(){
    if(this.busy||!this.selection.ready)return;
    this.busy=true;this.abort=new AbortController();this.render();this.status.textContent='Preparing photos…';this.progress.hidden=false;this.progress.removeAttribute('value');this.progress.setAttribute('aria-label','Importing photos');
    try{
      await this.previews;
      const mix=this.mix,total=this.selection.capacity*(mix?2:1),offset=mix?mix.rolls.length*this.selection.capacity:0;
      this.progress.max=total;this.progress.value=offset;this.status.textContent=`Importing ${offset} of ${total}`;
      if(mix){
        if(!mix.first)throw Error('Choose the first roll');
        if(!mix.rolls[0])mix.rolls[0]=await this.write(mix.first,0,total);
        if(!mix.rolls[1])mix.rolls[1]=await this.write(this.snapshot(),mix.first.capacity,total);
        await mix.options.onImported([mix.rolls[0],mix.rolls[1]]);
      }else{
        if(!this.completed)this.completed=await this.write(this.snapshot(),0,total);
        await (this.options.onImported??this.imported)(this.completed);
      }
      this.clearSelection();this.dialog.close();this.mix=undefined;this.completed=undefined;
    }catch(error){this.status.textContent=this.abort.signal.aborted?'Import cancelled. Your selected photos are still here.':error instanceof Error?error.message:'Could not add roll';}
    finally{this.busy=false;this.abort=undefined;this.render();for(const file of this.selection.files)if(!this.previewed.has(file))this.preview(file);}
  }
  private clearSelection(){this.generation++;for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.previewed.clear();this.selection.files=[];this.input.value='';}
  dispose(){this.abort?.abort();this.clearSelection();this.mix=undefined;this.completed=undefined;this.dialog.remove();}
}
