import { icon } from './icons';
import type { Navigation } from '../model/navigation';
import type { Repository } from '../data/repository';
import type { LayerId } from '../model/types';

export class FilmRails {
  readonly tray=document.createElement('div');
  readonly handle=document.createElement('button');
  private urls:string[]=[];
  private generation=0;
  private rollKey='';
  private locked=false;
  private hidden={portrait:false,landscape:false};
  private media=matchMedia('(orientation: landscape)');
  private abort=new AbortController();
  constructor(readonly root:HTMLElement,readonly navigation:Navigation,readonly repo:Repository,readonly error:(e:unknown)=>void){
    this.tray.className='film-tray';this.tray.hidden=true;this.tray.innerHTML='<div class="film-rail rail-a" data-rail="a" aria-label="Lower roll"></div><div class="film-rail rail-b" data-rail="b" aria-label="Upper roll"></div>';
    this.handle.className='rail-handle';this.handle.type='button';this.handle.hidden=true;
    root.append(this.tray,this.handle);
    this.handle.onclick=()=>this.toggle();
    let start:{x:number;y:number}|undefined,dragged=false;
    this.handle.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};dragged=false;this.handle.setPointerCapture(e.pointerId);},{signal:this.abort.signal});
    this.handle.addEventListener('pointerup',e=>{if(!start)return;const delta=this.media.matches?e.clientX-start.x:e.clientY-start.y;if(Math.abs(delta)>12){dragged=true;this.toggle(delta<0?this.media.matches:!this.media.matches);}start=undefined;},{signal:this.abort.signal});
    this.handle.addEventListener('click',e=>{if(dragged){e.stopImmediatePropagation();dragged=false;}},{capture:true,signal:this.abort.signal});
    this.media.addEventListener('change',()=>this.layout(),{signal:this.abort.signal});
    void repo.preference('rails-hidden').then(value=>{if(value&&typeof value==='object'){const v=value as typeof this.hidden;this.hidden={portrait:v.portrait===true,landscape:v.landscape===true};this.layout();}}).catch(error);
  }
  private toggle(force?:boolean){const key=this.media.matches?'landscape':'portrait';this.hidden[key]=force??!this.hidden[key];this.layout();void this.repo.setPreference('rails-hidden',this.hidden).catch(this.error);}
  setLocked(locked:boolean){this.locked=locked;this.handle.disabled=locked;for(const button of this.tray.querySelectorAll<HTMLButtonElement>('button'))button.disabled=locked||this.navigation.busy;}
  private layout(){
    const hidden=this.hidden[this.media.matches?'landscape':'portrait'];
    this.root.classList.toggle('has-rails',!!this.navigation.rolls);this.root.classList.toggle('rails-collapsed',hidden);
    this.tray.hidden=!this.navigation.rolls;this.handle.hidden=!this.navigation.rolls;
    this.handle.setAttribute('aria-label',hidden?'Show rolls':'Hide rolls');this.handle.setAttribute('aria-expanded',String(!hidden));this.handle.innerHTML=icon(this.media.matches?(hidden?'right':'back'):(hidden?'up':'down'));
  }
  async update(){
    const rolls=this.navigation.rolls,p=this.navigation.project;if(!rolls||!p){this.layout();return;}
    const key=JSON.stringify(rolls.map(r=>r.id));
    if(key!==this.rollKey){
      this.rollKey=key;const generation=++this.generation;for(const url of this.urls)URL.revokeObjectURL(url);this.urls=[];
      for(const [side,roll] of rolls.entries()){
        const layer:LayerId=side?'b':'a',rail=this.tray.querySelector<HTMLElement>(`[data-rail="${layer}"]`)!;rail.replaceChildren();
        for(let i=0;i<roll.assetIds.length;i++){
          const button=document.createElement('button');button.type='button';button.dataset.index=String(i);button.setAttribute('aria-label',`${side?'Upper':'Lower'} roll, frame ${i+1}`);const image=document.createElement('img');image.alt='';image.loading='lazy';button.append(image);
          button.onclick=()=>{void this.navigation.select(layer,i).catch(this.error);};rail.append(button);
          void this.repo.asset(roll.assetIds[i]).then(a=>{if(generation!==this.generation)return;const url=URL.createObjectURL(a.thumb);this.urls.push(url);image.src=url;image.classList.toggle('portrait-source',a.height>a.width);}).catch(this.error);
        }
      }
    }
    for(const [side,index] of [['a',p.a],['b',p.b]] as const){const rail=this.tray.querySelector(`[data-rail="${side}"]`)!;
      for(const button of rail.querySelectorAll<HTMLButtonElement>('button')){button.setAttribute('aria-pressed',String(Number(button.dataset.index)===index));button.disabled=this.navigation.busy||this.locked;}
      rail.classList.toggle('active-layer',this.navigation.session.activeLayer===side);
    }
    this.layout();
  }
  dispose(){this.generation++;this.abort.abort();for(const url of this.urls)URL.revokeObjectURL(url);this.tray.remove();this.handle.remove();}
}
