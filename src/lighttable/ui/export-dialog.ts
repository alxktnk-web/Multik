import { copyComposition, type Composition } from '../model/types';
import type { Renderer } from '../render/renderer';
import type { Asset } from '../data/types';
import type { Repository } from '../data/repository';

type Result=Awaited<ReturnType<Renderer['exportImage']>>;
export class ExportDialog {
  readonly dialog=document.createElement('dialog');
  private snapshot?:Composition;
  private sources?:[Asset,Asset];
  private projectId?:string;
  private controller?:AbortController;
  private file?:File;
  private url='';
  private generation=0;
  private disposed=false;
  private message:HTMLElement;
  onBusy:(busy:boolean)=>void=()=>{};
  constructor(root:HTMLElement,readonly renderer:Renderer,readonly repo:Repository){
    this.dialog.className='export-dialog';
    this.dialog.innerHTML=`<div class="sheet-content"><header class="sheet-heading"><h1>Save photo</h1></header><div class="export-preview" hidden><img alt="Your photo"/></div></div><footer class="sheet-dock"><progress max="1" value="0" hidden aria-label="Preparing photo"></progress><p class="export-message" role="status" aria-live="polite"></p><p class="share-hint" hidden>Choose Save Image in the share sheet.</p><div class="sheet-actions"><button class="close-dialog" data-close-export aria-label="Close">×</button><button class="mix-button" data-render-export>Prepare photo</button><button class="text-button" data-cancel-export hidden>Cancel</button><div class="export-ready" hidden><button class="mix-button" data-share-export>Save to Photos</button><a class="text-button" data-download-export download>Download</a></div></div></footer>`;
    this.message=this.dialog.querySelector('.export-message')!;root.append(this.dialog);
    this.dialog.querySelector<HTMLButtonElement>('[data-close-export]')!.onclick=()=>this.close();
    this.dialog.querySelector<HTMLButtonElement>('[data-cancel-export]')!.onclick=()=>this.controller?.abort();
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    this.dialog.querySelector<HTMLButtonElement>('[data-render-export]')!.onclick=()=>void this.generate();
    this.dialog.querySelector<HTMLButtonElement>('[data-share-export]')!.onclick=()=>void this.share();
  }
  open(snapshot:Composition,sources:[Asset,Asset],projectId:string){
    if(this.controller)return;
    if(this.snapshot?.id!==snapshot.id||this.snapshot.revision!==snapshot.revision||this.snapshot.profile.version!==snapshot.profile.version)this.clearResult();
    this.snapshot=copyComposition(snapshot);this.sources=[...sources];this.projectId=projectId;this.message.textContent='';this.sync();this.dialog.showModal();if(!this.file)void this.generate();
  }
  private clearResult(){if(this.url)URL.revokeObjectURL(this.url);this.url='';this.file=undefined;this.dialog.querySelector('img')!.removeAttribute('src');}
  private close(){this.controller?.abort();this.dialog.close();}
  private sync(){
    const busy=!!this.controller;
    this.dialog.querySelector<HTMLButtonElement>('[data-render-export]')!.hidden=busy||!!this.file;
    this.dialog.querySelector<HTMLElement>('progress')!.hidden=!busy;
    this.dialog.querySelector<HTMLElement>('[data-cancel-export]')!.hidden=!busy;
    this.dialog.querySelector<HTMLElement>('.export-ready')!.hidden=!this.file;
    this.dialog.querySelector<HTMLElement>('.export-preview')!.hidden=!this.file;
    const share=this.dialog.querySelector<HTMLButtonElement>('[data-share-export]')!;
    share.hidden=!this.file||!navigator.canShare?.({files:[this.file]});
    this.dialog.querySelector<HTMLElement>('.share-hint')!.hidden=share.hidden;
  }
  private async generate(){
    if(this.controller||!this.snapshot||!this.sources)return;
    const generation=++this.generation,snapshot=copyComposition(this.snapshot),projectId=this.projectId;
    const controller=new AbortController();this.controller=controller;this.clearResult();this.message.textContent='';
    // Always use the renderer’s maximum supported size; never silently downsize.
    const edge=4000;
    const progress=this.dialog.querySelector<HTMLProgressElement>('progress')!;progress.value=0;this.sync();this.onBusy(true);
    try{
      const result=await this.renderer.exportImage(snapshot,this.sources.map(a=>({id:a.id,blob:a.blob})) as Parameters<Renderer['exportImage']>[1],edge,controller.signal,n=>{progress.value=n;});
      if(this.disposed||generation!==this.generation)return;
      this.accept(result,edge);
      // A derivative is optional. Quota failure must not discard the ready JPEG.
      if(projectId)try{await this.repo.setPreference(`result:${projectId}`,{compositionId:result.compositionId,revision:result.revision,profileVersion:snapshot.profile.version,thumb:result.thumb});}catch{this.message.textContent='Photo ready. Thumbnail not saved: storage is full.';}
    }catch(error){if(!this.disposed&&generation===this.generation)this.message.textContent=controller.signal.aborted?'Cancelled':error instanceof Error?error.message:'Could not prepare photo';}
    finally{if(!this.disposed&&generation===this.generation){this.controller=undefined;this.sync();this.onBusy(false);}}
  }
  private accept(result:Result,edge:number){
    this.file=new File([result.blob],`multik-r${result.revision}-${edge}.jpg`,{type:'image/jpeg'});this.url=URL.createObjectURL(this.file);
    this.dialog.querySelector<HTMLImageElement>('img')!.src=this.url;
    const download=this.dialog.querySelector<HTMLAnchorElement>('[data-download-export]')!;download.href=this.url;download.download=this.file.name;
    this.message.textContent=`${result.width} × ${result.height}`;
  }
  private async share(){
    if(!this.file||!navigator.share)return;
    const button=this.dialog.querySelector<HTMLButtonElement>('[data-share-export]')!;button.disabled=true;
    try{await navigator.share({files:[this.file]});this.message.textContent='';}catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))this.message.textContent='Photo ready. Tap Save to Photos again or Download.';}
    finally{button.disabled=false;}
  }
  dispose(){this.disposed=true;this.generation++;this.controller?.abort();this.clearResult();this.dialog.remove();}
}
