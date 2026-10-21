import { ImportRoll } from './import-roll';
import { icon } from './icons';
import type { Repository } from '../data/repository';
import type { Navigation } from '../model/navigation';
import type { Project, Roll } from '../data/types';

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
  constructor(readonly root:HTMLElement,readonly repo:Repository,readonly navigation:Navigation){
    this.dialog.className='library-dialog';
    this.dialog.innerHTML=`<div class="sheet-content library-content"><header class="library-heading"><button type="button" class="add-roll-button" data-new-roll aria-label="New roll">${icon('plus')}</button></header><div class="roll-grid"></div><div class="pending-imports"></div></div><footer class="sheet-dock"><p class="library-message" role="status" aria-live="polite"></p><div class="sheet-actions"><button class="close-dialog" data-close-library aria-label="Back to lighttable">${icon('back')}</button><button class="mix-button" data-start-mix disabled hidden>Mix</button></div></footer>`;
    this.rename.className='rename-dialog';
    this.rename.innerHTML='<form><div class="sheet-content"><h1>Rename roll</h1><input data-rename-name aria-label="Roll name" maxlength="80" required autocomplete="off"/><p class="rename-message" role="status"></p><details class="roll-mixes"><summary>Saved mixes</summary><div></div></details></div><footer class="sheet-dock sheet-actions"><button type="button" class="text-button" data-cancel-rename>Cancel</button><button class="mix-button" data-save-name>Save</button></footer></form>';
    this.status=this.dialog.querySelector('.library-message')!;
    this.importer=new ImportRoll(repo,async roll=>{this.selected=[...this.selected.slice(-1),roll.id];await this.refresh();});
    root.append(this.dialog,this.importer.dialog,this.rename);
    this.dialog.querySelector<HTMLButtonElement>('[data-close-library]')!.onclick=()=>{if(!this.busy)this.dialog.close();};
    this.dialog.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});
    this.dialog.addEventListener('close',()=>this.cancelPress());
    this.dialog.addEventListener('scroll',()=>this.cancelPress(),true);
    this.dialog.querySelector<HTMLButtonElement>('[data-new-roll]')!.onclick=()=>{if(!this.busy)this.importer.open();};
    this.dialog.querySelector<HTMLButtonElement>('[data-start-mix]')!.onclick=()=>void this.run(async()=>{
      if(!this.selected.length)return;const [a,b=a]=this.selected;
      // Reopen the latest matching mix instead of silently making duplicate sessions.
      const p=this.projects.filter(p=>p.rollA===a&&p.rollB===b).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]??await this.repo.createProject(a,b);
      if(await this.navigation.open(p))this.dialog.close();
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
  async open(){this.status.textContent='';this.dialog.showModal();try{await this.refresh();}catch(e){this.showError(e);}}
  private showError(error:unknown){this.status.textContent=error instanceof Error?error.message:'Could not open library';}
  private async run(action:()=>Promise<void>){if(this.busy)return;this.busy=true;this.controls();this.status.textContent='';try{await action();}catch(e){this.showError(e);}finally{this.busy=false;this.controls();}}
  private cancelPress(){clearTimeout(this.pressTimer);this.pressTimer=0;}
  private editRoll(roll:Roll){
    if(this.busy||this.rename.open)return;this.cancelPress();this.renameId=roll.id;
    const input=this.rename.querySelector<HTMLInputElement>('[data-rename-name]')!;input.value=roll.name;
    this.rename.querySelector('.rename-message')!.textContent='';
    const details=this.rename.querySelector<HTMLDetailsElement>('.roll-mixes')!,list=details.querySelector('div')!;details.open=false;list.replaceChildren();
    const mixes=this.projects.filter(p=>p.rollA===roll.id||p.rollB===roll.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));details.hidden=!mixes.length;
    // Existing sessions, including conflict copies, remain reachable without cluttering home.
    for(const p of mixes){const b=document.createElement('button');b.type='button';b.className='project-card';b.dataset.project=p.id;b.textContent=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(p.updatedAt));b.onclick=()=>void this.run(async()=>{if(await this.navigation.open(p)){this.rename.close();this.dialog.close();}});list.append(b);}
    this.rename.showModal();input.focus();input.select();
  }
  private controls(){
    for(const dialog of [this.dialog,this.rename])dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=this.busy;});
    this.rename.querySelector<HTMLInputElement>('[data-rename-name]')!.disabled=this.busy;
    const mix=this.dialog.querySelector<HTMLButtonElement>('[data-start-mix]')!;mix.hidden=this.selected.length===0;mix.disabled=this.busy||!this.selected.length;mix.setAttribute('aria-label',this.selected.length===1?'Mix this roll with itself':'Mix selected rolls');
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-roll]').forEach(b=>{const index=this.selected.indexOf(b.dataset.roll!);b.setAttribute('aria-pressed',String(index>=0));b.dataset.side=index===0?'I':index===1?'II':'';});
  }
  async refresh(){
    this.cancelPress();const generation=++this.generation;const [rolls,projects,jobs]=await Promise.all([this.repo.listRolls(),this.repo.listProjects(),this.repo.pendingImports()]);if(generation!==this.generation)return;
    this.projects=projects;this.selected=this.selected.filter(id=>rolls.some(r=>r.id===id));
    for(const url of this.urls)URL.revokeObjectURL(url);this.urls=[];
    const grid=this.dialog.querySelector<HTMLElement>('.roll-grid')!;grid.replaceChildren();
    for(const roll of rolls){
      const button=document.createElement('button');button.className='roll-card';button.dataset.roll=roll.id;button.type='button';
      const img=document.createElement('img');img.alt='';img.draggable=false;const name=document.createElement('span');name.textContent=roll.name;const count=document.createElement('small');count.textContent=String(roll.capacity);button.setAttribute('aria-label',`${roll.name}, ${roll.capacity} frames`);button.append(img,name,count);
      let held=false,start:{x:number;y:number}|undefined;
      button.onpointerdown=e=>{if(e.button!==0||!e.isPrimary||this.busy)return;this.cancelPress();held=false;start={x:e.clientX,y:e.clientY};this.pressTimer=window.setTimeout(()=>{held=true;this.editRoll(roll);},500);};
      button.onpointermove=e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8){this.cancelPress();start=undefined;}};
      button.onpointerup=button.onpointercancel=()=>{this.cancelPress();start=undefined;};
      button.oncontextmenu=e=>{e.preventDefault();held=true;this.editRoll(roll);};
      button.onkeydown=e=>{if(e.key==='F2'||(e.shiftKey&&e.key==='F10')){e.preventDefault();this.editRoll(roll);}};
      button.onclick=()=>{if(held){held=false;return;}if(this.busy||this.rename.open)return;const index=this.selected.indexOf(roll.id);if(index>=0)this.selected.splice(index,1);else this.selected=[...this.selected.slice(-1),roll.id];this.controls();};grid.append(button);
      void this.repo.asset(roll.assetIds[0]).then(asset=>{if(generation!==this.generation)return;const url=URL.createObjectURL(asset.thumb);this.urls.push(url);img.src=url;}).catch(e=>{if(generation===this.generation)this.showError(e);});
    }
    grid.hidden=!rolls.length;
    const pending=this.dialog.querySelector('.pending-imports')!;pending.replaceChildren();
    for(const job of jobs){const row=document.createElement('div'),label=document.createElement('span'),cancel=document.createElement('button');label.textContent=`Unfinished import: ${job.name}`;cancel.textContent='Discard import';cancel.className='text-button';cancel.onclick=()=>void this.run(async()=>{await this.repo.cancelImport(job);await this.refresh();});row.append(label,cancel);pending.append(row);}
    this.controls();
  }
  dispose(){this.cancelPress();this.generation++;this.importer.dispose();for(const url of this.urls)URL.revokeObjectURL(url);this.dialog.remove();this.rename.remove();}
}
