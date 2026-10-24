import type { Favorite } from '../data/types';
import type { Repository } from '../data/repository';

/** Removal only changes membership, so Undo restores the exact saved variant. */
export class FavoriteNotice {
  readonly element=document.createElement('div');
  private removed?:Favorite;
  private timer=0;
  private button:HTMLButtonElement;
  constructor(repo:Repository,changed:()=>Promise<void>,error:(error:unknown)=>void){
    this.element.className='favorite-notice';this.element.hidden=true;
    this.element.innerHTML='<span role="status" aria-live="polite">Removed ·</span><button type="button">Undo</button>';
    this.button=this.element.querySelector('button')!;
    this.button.onclick=async()=>{
      const favorite=this.removed;if(!favorite)return;
      clearTimeout(this.timer);this.button.disabled=true;
      try{await repo.restoreFavorite(favorite);await changed();if(this.removed===favorite)this.hide();}
      catch(e){error(e);}finally{this.button.disabled=false;}
    };
  }
  show(favorite:Favorite){
    clearTimeout(this.timer);this.removed=favorite;this.element.hidden=false;
    this.timer=window.setTimeout(()=>this.hide(),8000);
  }
  private hide(){this.removed=undefined;this.element.hidden=true;}
  dispose(){clearTimeout(this.timer);this.element.remove();}
}
