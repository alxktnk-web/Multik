import { Selection, importFiles, suggestedRollName } from '../data/import';
import type { Repository } from '../data/repository';
import type { Roll } from '../data/types';
import { decodeSource } from '../render/assets';

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
  private capacity:HTMLSelectElement;
  constructor(readonly repo:Repository,readonly imported:(roll:Roll)=>Promise<void>){
    this.dialog.className='roll-import-dialog';
    this.dialog.innerHTML=`<div class="sheet-content"><header class="sheet-heading"><h1>New roll</h1><span class="sheet-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="7" width="15" height="12" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/></svg></span></header><div class="import-meta"><select aria-label="Frame limit" data-capacity><option>6</option><option selected>12</option><option>24</option><option>36</option></select><input data-roll-name aria-label="Roll name" placeholder="Roll name" maxlength="80"/></div><div class="candidate-grid"></div></div><footer class="sheet-dock"><div class="import-count" role="status" aria-live="polite"></div><progress class="import-progress" max="1" value="0" hidden aria-label="Preparing photos"></progress><p class="import-message" role="status" aria-live="polite"></p><div class="sheet-actions"><button class="close-dialog" data-close-import aria-label="Cancel">×</button><label class="add-files" aria-label="Add photos">＋<input type="file" multiple accept="image/*" data-roll-files aria-label="Add photos"/></label><button class="mix-button" data-save-roll aria-label="Add roll">Add roll</button><button class="text-button" data-cancel-job hidden>Cancel</button></div></footer>`;
    this.list=this.dialog.querySelector('.candidate-grid')!;this.status=this.dialog.querySelector('.import-message')!;this.count=this.dialog.querySelector('.import-count')!;this.input=this.dialog.querySelector('[data-roll-files]')!;this.save=this.dialog.querySelector('[data-save-roll]')!;this.capacity=this.dialog.querySelector('[data-capacity]')!;
    this.progress=this.dialog.querySelector('progress')!;
    this.input.addEventListener('cancel',()=>{if(!this.selection.files.length)this.dialog.close();});
    this.input.onchange=()=>{
      if(this.busy)return;const added=Array.from(this.input.files??[]);this.input.value='';if(!this.selection.add(added))return;this.render();
      for(const file of added)this.preview(file);
    };
    this.capacity.onchange=()=>{if(this.busy)return;this.selection.setCapacity(Number(this.capacity.value));this.render();};
    this.dialog.querySelector<HTMLButtonElement>('[data-close-import]')!.onclick=()=>{if(!this.busy){this.clear();this.dialog.close();}};
    this.dialog.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();else this.clear();});
    this.dialog.querySelector<HTMLButtonElement>('[data-cancel-job]')!.onclick=()=>this.abort?.abort();
    this.save.onclick=()=>void this.submit();this.render();
  }
  open(){this.status.textContent='';this.dialog.querySelector<HTMLInputElement>('[data-roll-name]')!.value=suggestedRollName();this.render();this.dialog.showModal();this.dialog.querySelector<HTMLElement>('.sheet-content')!.scrollTop=0;this.input.click();}
  private preview(file:File){
    const generation=this.generation;
    this.previews=this.previews.then(async()=>{
      if(generation!==this.generation||this.busy||!this.selection.files.includes(file))return;
      let decoded;
      try{
        decoded=await decodeSource({id:'import-preview',blob:file},160);const c=document.createElement('canvas');c.width=decoded.width;c.height=decoded.height;c.getContext('2d')!.drawImage(decoded.image,0,0);
        const blob=await new Promise<Blob|null>(r=>c.toBlob(r,'image/jpeg',.8));c.width=c.height=1;
        if(blob&&generation===this.generation&&this.selection.files.includes(file)){const old=this.urls.get(file);if(old)URL.revokeObjectURL(old);this.urls.set(file,URL.createObjectURL(blob));this.updatePreview(file);}
      }catch{/* Bad candidate remains removable; submit reports the decoder error. */}finally{decoded?.close();if(generation===this.generation){this.previewed.add(file);this.previewProgress();}}
    });
  }
  private updatePreview(file:File){
    for(const element of this.list.querySelectorAll<HTMLElement>('[data-candidate]')){
      if(this.selection.files[Number(element.dataset.candidate)]===file){const img=element.querySelector('img')!;img.src=this.urls.get(file)!;}
    }
  }
  private previewProgress(){
    if(this.busy)return;
    const files=this.selection.files,done=files.filter(f=>this.previewed.has(f)).length,pending=done<files.length;
    this.progress.hidden=!pending;this.progress.max=Math.max(1,files.length);this.progress.value=done;
    this.progress.setAttribute('aria-label','Preparing previews');
    if(pending&&(!this.status.textContent||this.status.textContent.startsWith('Preparing previews')))this.status.textContent=`Preparing previews ${done} of ${files.length}`;
    else if(this.status.textContent?.startsWith('Preparing previews'))this.status.textContent='';
  }
  private render(){
    const s=this.selection;this.count.textContent=`${s.files.length} / ${s.capacity}${s.ready?' ✓ · Roll full':s.overflow?` · Remove ${s.files.length-s.capacity}`:` · ${s.capacity-s.files.length} left`}`;this.count.classList.toggle('overflow',s.overflow);
    this.dialog.dataset.selection=s.overflow?'overflow':s.ready?'full':'open';this.dialog.style.setProperty('--filled',String(Math.min(1,s.files.length/s.capacity)));this.count.hidden=this.busy;this.dialog.setAttribute('aria-busy',String(this.busy));
    this.save.setAttribute('aria-label',s.ready?'Add roll':`Select ${s.capacity} photos to confirm`);
    this.input.closest('label')!.hidden=this.busy;this.save.hidden=this.busy;this.dialog.querySelector<HTMLButtonElement>('[data-close-import]')!.hidden=this.busy;
    this.input.disabled=this.busy||s.full;this.input.closest('label')!.classList.toggle('disabled',this.input.disabled);this.save.disabled=this.busy||!s.ready;this.capacity.disabled=this.busy;
    this.dialog.querySelector<HTMLInputElement>('[data-roll-name]')!.disabled=this.busy;
    this.dialog.querySelector<HTMLButtonElement>('[data-close-import]')!.disabled=this.busy;
    this.dialog.querySelector<HTMLButtonElement>('[data-cancel-job]')!.hidden=!this.busy;
    this.list.replaceChildren();
    s.files.forEach((file,index)=>{
      const card=document.createElement('div');card.className='candidate';card.dataset.candidate=String(index);card.classList.toggle('candidate-extra',index>=s.capacity);
      const img=document.createElement('img');img.alt='';card.setAttribute('aria-label',file.name);const url=this.urls.get(file);if(url)img.src=url;
      const remove=document.createElement('button');remove.textContent='×';remove.type='button';remove.setAttribute('aria-label',`Remove photo ${index+1}`);remove.disabled=this.busy;
      remove.onclick=()=>{if(this.busy)return;s.remove(index);const url=this.urls.get(file);if(url&&!s.files.includes(file)){URL.revokeObjectURL(url);this.urls.delete(file);}this.render();};card.append(img,remove);this.list.append(card);
    });
    this.previewProgress();
  }
  private async submit(){
    if(this.busy||!this.selection.ready)return;
    this.busy=true;this.abort=new AbortController();this.render();this.status.textContent='Preparing photos…';this.progress.hidden=false;this.progress.removeAttribute('value');this.progress.setAttribute('aria-label','Importing photos');
    try{
      await this.previews; // Stop the preview queue before starting full import.
      this.progress.max=this.selection.capacity;this.progress.value=0;this.status.textContent=`Importing 0 of ${this.selection.capacity}`;
      const name=this.dialog.querySelector<HTMLInputElement>('[data-roll-name]')!.value.trim();
      const roll=await importFiles(this.repo,this.selection,name,n=>{this.progress.value=n;this.status.textContent=`Importing ${n} of ${this.selection.capacity}`;},this.abort.signal);
      this.clear();this.dialog.close();await this.imported(roll);
    }catch(error){this.status.textContent=this.abort.signal.aborted?'Import cancelled. Your selected photos are still here.':error instanceof Error?error.message:'Could not add roll';}
    finally{this.busy=false;this.abort=undefined;this.render();for(const file of this.selection.files)if(!this.previewed.has(file))this.preview(file);}
  }
  private clear(){this.generation++;for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.previewed.clear();this.selection.files=[];this.input.value='';}
  dispose(){this.abort?.abort();this.clear();this.dialog.remove();}
}
