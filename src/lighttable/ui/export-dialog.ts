import { copyComposition, type Composition } from '../model/types';
import type { Renderer } from '../render/renderer';
import type { Asset } from '../data/types';
import type { Repository } from '../data/repository';

// Save uses the native share sheet. A prepared JPEG stays in RAM for a fresh
// tap when Safari expires user activation during asynchronous rendering.
export class ExportDialog {
  private controller?:AbortController;
  private file?:File;
  private key='';
  private sharing=false;
  private disposed=false;
  onBusy:(busy:boolean)=>void=()=>{};
  onStatus:(message:string)=>void=()=>{};
  constructor(_root:HTMLElement,readonly renderer:Renderer,readonly repo:Repository){}
  get busy(){return !!this.controller||this.sharing;}
  readyFor(snapshot:Composition){return !!this.file&&this.key===JSON.stringify(snapshot);}
  shareReady(snapshot:Composition){
    if(this.disposed||this.busy||!this.readyFor(snapshot))return false;
    // No await before navigator.share: retain this button tap's activation.
    void this.share();return true;
  }
  async open(snapshot:Composition,sources:[Asset,Asset],projectId:string){
    if(this.disposed||this.busy)return;
    if(this.shareReady(snapshot))return;
    if(!navigator.share){this.onStatus('Save to Photos is unavailable in this browser. Open Multik in Safari on iPhone.');return;}
    const composition=copyComposition(snapshot),controller=new AbortController();
    this.file=undefined;this.key='';this.controller=controller;this.onBusy(true);
    this.onStatus('Preparing photo…');
    try{
      const result=await this.renderer.exportImage(composition,sources.map(a=>({id:a.id,blob:a.blob})) as Parameters<Renderer['exportImage']>[1],4000,controller.signal,n=>{
        if(!this.disposed)this.onStatus(`Preparing photo… ${Math.round(n*100)}%`);
      });
      if(this.disposed)return;
      this.file=new File([result.blob],`multik-r${result.revision}-4000.jpg`,{type:'image/jpeg'});
      this.key=JSON.stringify(composition);
      // Attempt native sharing immediately. Failure keeps the exact ready file
      // for the same Save icon; no preview, Download link or extra menu.
      await this.share();
      if(projectId&&!this.disposed)try{await this.repo.setPreference(`result:${projectId}`,{compositionId:result.compositionId,revision:result.revision,profileVersion:composition.profile.version,thumb:result.thumb});}catch{/* Optional thumbnail must never discard the JPEG. */}
    }catch(error){if(!this.disposed)this.onStatus(error instanceof Error?error.message:'Could not prepare photo. Tap Save to Photos to retry.');}
    finally{this.controller=undefined;if(!this.disposed)this.onBusy(false);}
  }
  private async share(){
    if(!this.file||this.disposed||this.sharing)return;
    this.sharing=true;this.onBusy(true);this.onStatus('');
    try{
      if(!navigator.share||(navigator.canShare&&!navigator.canShare({files:[this.file]}))){
        this.onStatus('Save to Photos is unavailable in this browser. Open Multik in Safari on iPhone.');return;
      }
      await navigator.share({files:[this.file]});
    }catch(error){
      if(!this.disposed&&!(error instanceof DOMException&&error.name==='AbortError'))this.onStatus('Photo ready. Tap Save to Photos again.');
    }finally{this.sharing=false;if(!this.disposed)this.onBusy(this.busy);}
  }
  dispose(){this.disposed=true;this.controller?.abort();this.file=undefined;this.key='';}
}
