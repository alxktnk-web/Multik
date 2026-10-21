import type { Session } from '../model/session';
import { getLevels, moveLevel, levelPoints, setLevels } from '../model/levels';
import { clamp, type LevelPoint, type Levels, type Composition } from '../model/types';
import { parameters } from '../model/parameters';
import { icon, button } from './icons';

export class Editor {
  readonly element=document.createElement('section');
  readonly discard=document.createElement('dialog');
  mode:'levels'|'looks'|'layers'|'pro'='layers';
  private pointer?:{id:number;start:number;levels:Readonly<Levels>;point:LevelPoint;moved:boolean};
  private range?:HTMLInputElement;
  private locked=false;
  private abort=new AbortController();
  private landscape=matchMedia('(orientation:landscape)');
  onChange:()=>void=()=>{};
  onDone:()=>void=()=>{};
  onCancel:()=>void=()=>{};
  constructor(root:HTMLElement,readonly session:Session){
    this.element.className='editor';this.element.hidden=true;
    this.element.innerHTML=`<nav class="edit-modes glass" aria-label="Edit tools">
      ${(['layers','levels','looks','pro'] as const).map((mode,i)=>`<button type="button" data-mode="${mode}" aria-label="${['Move','Levels','Looks','Pro'][i]}" aria-pressed="false">${icon((['hand','pro','profile','more'] as const)[i])}<span>${['Move','Levels','Looks','Pro'][i]}</span></button>`).join('')}
      </nav><div class="edit-content">
      <div class="levels-ruler" role="group" aria-label="Levels of selected photo"><div class="levels-track"><div class="levels-ticks" aria-hidden="true"></div>
      ${levelPoints.map((p,i)=>`<div class="level-handle" role="slider" tabindex="0" data-level="${p}" aria-label="${['Black point','Midtones','White point'][i]}" aria-valuemin="0" aria-valuemax="100" style="--dot:${['#171715','#85847e','#eeeae2'][i]}"><i aria-hidden="true"></i></div>`).join('')}</div></div>
      <div class="look-options" role="group" aria-label="Image profile" hidden>${(['Original','Film','Dense','Clear'] as const).map((p,i)=>`<button type="button" data-profile-version="${i+2}" aria-pressed="false">${p}</button>`).join('')}</div>
      <div class="layer-controls" hidden>${button('rotate-layer','Rotate selected layer 90 degrees','rotate')}${button('reset','Center selected layer','reset')}<label>Scale<input type="range" data-scale min="0.5" max="4" step="0.01" aria-label="Selected layer scale"/></label></div>
      <div class="pro-controls" hidden><div class="pro-options">${button('halo','Red halo','halo')}${button('haloRadius','Halo radius','radius')}${button('haloThreshold','Highlight threshold','threshold')}${button('haloXY','Halo: horizontal radius, vertical strength','xy')}${button('reset-levels','Reset selected photo levels','undo')}</div>
      <label class="pro-range-label"><span></span><input type="range" class="effect-range"/></label><label class="pro-range-label"><span></span><input type="range" class="effect-range"/></label></div>
      </div><footer class="edit-actions"><button type="button" data-edit-cancel>Cancel</button><button type="button" data-edit-done>Done</button></footer>`;
    this.discard.className='discard-dialog';this.discard.innerHTML='<div class="sheet-content"><h1>Discard changes?</h1></div><div class="sheet-dock sheet-actions"><button type="button" class="text-button" data-keep>Keep editing</button><button type="button" class="mix-button" data-discard>Discard changes</button></div>';
    root.append(this.element,this.discard);
    const opts={signal:this.abort.signal},track=this.element.querySelector<HTMLElement>('.levels-track')!;
    const axis=(e:PointerEvent)=>this.landscape.matches?-e.clientY:e.clientX;
    track.addEventListener('pointerdown',e=>{
      if(e.button!==0||this.locked||this.pointer||session.gesturing)return;
      e.preventDefault();
      const l=getLevels(session.layer),r=track.getBoundingClientRect(),v=this.landscape.matches?(r.bottom-e.clientY)/r.height:(e.clientX-r.left)/r.width;
      const chosen=levelPoints.reduce((a,b)=>Math.abs(l[a]-v)<=Math.abs(l[b]-v)?a:b);
      session.tool={kind:'levels',point:chosen};session.begin();
      this.pointer={id:e.pointerId,start:axis(e),levels:{...l},point:chosen,moved:false};track.setPointerCapture(e.pointerId);
      this.element.querySelector<HTMLElement>(`[data-level="${chosen}"]`)!.focus({preventScroll:true});this.refresh();this.onChange();
    },opts);
    track.addEventListener('pointermove',e=>{
      const p=this.pointer;if(!p||p.id!==e.pointerId)return;
      const delta=axis(e)-p.start;if(!p.moved&&Math.abs(delta)<2)return;p.moved=true;
      const r=track.getBoundingClientRect();setLevels(session.layer,moveLevel(p.levels,p.point,p.levels[p.point]+delta/Math.max(1,this.landscape.matches?r.height:r.width)));session.onChange();
    },opts);
    track.addEventListener('pointerup',e=>{if(this.pointer?.id!==e.pointerId)return;this.pointer=undefined;session.end();this.onChange();},opts);
    for(const type of ['pointercancel','lostpointercapture'])track.addEventListener(type,()=>this.cancelGesture(),opts);
    for(const handle of this.element.querySelectorAll<HTMLElement>('[data-level]'))handle.addEventListener('keydown',e=>{
      if(this.locked||session.gesturing)return;
      const p=handle.dataset.level as LevelPoint,keys=['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();
      const l=getLevels(session.layer),value=e.key==='Home'?0:e.key==='End'?1:l[p]+(['ArrowUp','ArrowRight'].includes(e.key)?1:-1)*(e.shiftKey?.05:.005);
      session.tool={kind:'levels',point:p};session.begin();setLevels(session.layer,moveLevel(l,p,value));session.end();this.onChange();
    },opts);
    this.element.addEventListener('click',e=>{
      const b=(e.target as Element).closest<HTMLButtonElement>('button');if(!b||this.locked||session.gesturing)return;
      if(b.dataset.mode){this.mode=b.dataset.mode as typeof this.mode;session.interaction='move';session.tool=this.mode==='levels'?{kind:'levels',point:'black'}:this.mode==='pro'?{kind:'parameter',parameter:'halo'}:{kind:'layer'};this.onChange();}
      if(b.dataset.profileVersion){session.begin();session.draft.profile.version=Number(b.dataset.profileVersion) as Composition['profile']['version'];session.end();this.onChange();}
      if(b.hasAttribute('data-edit-done'))this.onDone();
      if(b.hasAttribute('data-edit-cancel'))this.requestCancel();
    },opts);
    this.discard.querySelector('[data-keep]')!.addEventListener('click',()=>this.discard.close(),opts);
    this.discard.querySelector('[data-discard]')!.addEventListener('click',()=>{this.discard.close();this.onCancel();},opts);
    for(const input of this.element.querySelectorAll<HTMLInputElement>('input')){
      input.addEventListener('input',()=>{
        if(this.locked&&!this.range)return;
        if(session.gesturing&&this.range!==input)return;
        this.range=input;session.begin();
        if(input.hasAttribute('data-scale'))session.layer.transform.scale=clamp(Number(input.value),.5,4);
        else {const key=input.dataset.parameter as keyof typeof parameters;if(!key)return;session.draft.effects[key]=Number(input.value);}
        session.onChange();this.onChange();
      },opts);
      const end=()=>{if(this.range!==input)return;this.range=undefined;session.end();this.onChange();};
      input.addEventListener('change',end,opts);input.addEventListener('blur',end,opts);
    }
  }
  get activeGesture(){return !!this.pointer||!!this.range;}
  requestCancel(){if(this.session.editChanged)this.discard.showModal();else this.onCancel();}
  cancelGesture(){if(!this.pointer&&!this.range)return;this.pointer=undefined;this.range=undefined;this.session.cancel();this.onChange();}
  refresh(){
    const s=this.session,l=getLevels(s.layer),selected=s.tool.kind==='levels'?s.tool.point:'black';
    for(const h of this.element.querySelectorAll<HTMLElement>('[data-level]')){
      const p=h.dataset.level as LevelPoint;h.style.setProperty('--position',String(l[p]*100)+'%');h.classList.toggle('selected',p===selected);
      h.setAttribute('aria-valuenow',(l[p]*100).toFixed(1));h.setAttribute('aria-valuetext',`${p} ${Math.round(l[p]*100)} percent, photo ${s.activeLayer==='a'?'I':'II'}`);h.setAttribute('aria-orientation',this.landscape.matches?'vertical':'horizontal');
    }
    for(const b of this.element.querySelectorAll<HTMLButtonElement>('[data-profile-version]'))b.setAttribute('aria-pressed',String(Number(b.dataset.profileVersion)===s.draft.profile.version));
  }
  sync(locked:boolean){
    this.locked=locked;this.element.hidden=!this.session.editing;this.element.parentElement!.dataset.editMode=this.mode;
    for(const b of this.element.querySelectorAll<HTMLButtonElement>('button'))b.disabled=locked;
    for(const b of this.element.querySelectorAll<HTMLButtonElement>('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===this.mode));
    for(const [selector,mode] of [['.levels-ruler','levels'],['.look-options','looks'],['.layer-controls','layers'],['.pro-controls','pro']])this.element.querySelector<HTMLElement>(selector)!.hidden=this.mode!==mode;
    for(const h of this.element.querySelectorAll<HTMLElement>('[data-level]'))h.setAttribute('aria-disabled',String(locked&&!this.pointer));
    for(const input of this.element.querySelectorAll<HTMLInputElement>('input'))input.disabled=locked&&input!==this.range;
    const scale=this.element.querySelector<HTMLInputElement>('[data-scale]')!;if(this.range!==scale)scale.value=String(this.session.layer.transform.scale??1);
    const keys=this.session.tool.kind==='parameter'?[this.session.tool.parameter]:this.session.tool.kind==='xy'?['halo','haloRadius'] as const:[];
    this.element.querySelectorAll<HTMLInputElement>('.effect-range').forEach((r,i)=>{
      const key=keys[i],label=r.parentElement!;label.hidden=!key||this.session.draft.profile.version===5;
      if(key){const p=parameters[key];r.dataset.parameter=key;r.min=String(p.min);r.max=String(p.max);r.step=String(p.step);if(r!==this.range)r.value=String(this.session.draft.effects[key]);r.setAttribute('aria-label',p.label);label.querySelector('span')!.textContent=p.label;}
    });
    for(const b of this.element.querySelectorAll<HTMLButtonElement>('.pro-options [data-action]'))if(b.dataset.action!=='reset-levels')b.disabled=locked||this.session.draft.profile.version===5;
    this.refresh();
  }
  dispose(){this.abort.abort();this.cancelGesture();this.element.remove();this.discard.remove();}
}
