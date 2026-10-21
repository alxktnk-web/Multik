import type { Session } from '../model/session';

const profiles = [
  {version:2, name:'Original', description:'The original Multik look.'},
  {version:3, name:'Film', description:'Softer highlights and an edge glow. Experimental.'},
  {version:4, name:'Dense', description:'Deeper shadows; fine detail may disappear. Experimental.'},
] as const;

// A preview is one cancellable RAM transaction, never a persistence boundary.
export class ProfileDialog {
  readonly dialog = document.createElement('dialog');
  private choosing = false;
  onChange:()=>void = ()=>{};
  constructor(root:HTMLElement, readonly session:Session) {
    this.dialog.className='profile-dialog';
    this.dialog.setAttribute('aria-labelledby','profile-heading');
    this.dialog.setAttribute('aria-describedby','profile-description');
    this.dialog.innerHTML=`<div class="profile-content"><h1 id="profile-heading">Image profile</h1>
      <div class="profile-options" role="group" aria-label="Image profile">${profiles.map(p=>`<button type="button" data-profile-version="${p.version}" aria-pressed="false">${p.name}</button>`).join('')}</div>
      <p id="profile-description" aria-live="polite"></p></div>
      <footer class="sheet-dock sheet-actions"><button type="button" class="text-button" data-cancel-profile>Cancel</button><button type="button" class="mix-button" data-apply-profile>Apply</button></footer>`;
    root.append(this.dialog);
    this.dialog.querySelector('[data-cancel-profile]')!.addEventListener('click',()=>this.cancel());
    this.dialog.querySelector('[data-apply-profile]')!.addEventListener('click',()=>this.finish(true));
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.cancel();});
    this.dialog.addEventListener('close',()=>{if(!this.dialog.open)this.cancel();});
    for(const button of this.dialog.querySelectorAll<HTMLButtonElement>('[data-profile-version]')){
      button.onclick=()=>{
        if(!this.choosing)return;
        const profile=profiles.find(p=>p.version===Number(button.dataset.profileVersion));
        if(!profile)return;
        this.session.draft.profile.version=profile.version;
        this.session.onChange();this.sync();
      };
    }
  }
  get active(){return this.choosing;}
  open(){
    if(this.choosing||this.session.gesturing)return;
    this.choosing=true;this.session.begin();this.sync();this.dialog.showModal();
    this.dialog.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    this.onChange();
  }
  private sync(){
    const current=profiles.find(p=>p.version===this.session.draft.profile.version)!;
    for(const button of this.dialog.querySelectorAll<HTMLButtonElement>('[data-profile-version]'))
      button.setAttribute('aria-pressed',String(Number(button.dataset.profileVersion)===current.version));
    this.dialog.querySelector('#profile-description')!.textContent=current.description;
  }
  private finish(apply:boolean){
    if(!this.choosing)return;
    this.choosing=false;
    if(apply)this.session.end();else this.session.cancel();
    this.onChange();this.dialog.close();
  }
  cancel(){this.finish(false);}
  dispose(){this.cancel();this.dialog.remove();}
}
