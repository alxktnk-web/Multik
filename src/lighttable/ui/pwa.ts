type Options={root:HTMLElement;canUpdate:()=>boolean;applyUpdate:(action:()=>Promise<void>)=>Promise<void>};
export function setupPwa({root,canUpdate,applyUpdate}:Options){
  const noop={refresh:()=>{},dispose:()=>{}};
  if(!import.meta.env.PROD||!('serviceWorker' in navigator)||!window.isSecureContext)return noop;
  const scope=new URL('/lighttable/',location.origin).href,button=root.querySelector<HTMLButtonElement>('[data-pwa-update]')!,status=root.querySelector<HTMLElement>('[data-pwa-state]')!;
  const abort=new AbortController(),opts={signal:abort.signal};let registration:ServiceWorkerRegistration|undefined,disposed=false,applying=false,failed=false,lastCheck=0;
  const refresh=()=>{
    if(disposed)return;
    button.hidden=!registration?.waiting;
    button.disabled=applying||!canUpdate();
    status.textContent=registration?.waiting?'Update ready. Finish your current action to apply it.':registration?.active?.state==='activated'?'Available offline.':failed?'Offline setup failed. Check your connection or recover the app.':'Preparing offline access…';
  };
  const watch=(worker:ServiceWorker|null)=>worker?.addEventListener('statechange',()=>{if(worker.state==='redundant')failed=true;if(worker.state==='activated')failed=false;refresh();},opts);
  async function check(){
    if(disposed||applying)return;
    if(registration){if(Date.now()-lastCheck<60_000)return;lastCheck=Date.now();try{await registration.update();}catch{/* Cached version remains available offline. */}refresh();return;}
    try{
      const reg=await navigator.serviceWorker.register(scope+'sw.js',{scope,updateViaCache:'none'});if(disposed)return;registration=reg;
      reg.addEventListener('updatefound',()=>{watch(reg.installing);refresh();},opts);watch(reg.installing);watch(reg.waiting);watch(reg.active);refresh();
    }catch{if(!disposed)status.textContent='Connect to the internet to set up offline access.';}
  }
  button.addEventListener('click',()=>{
    if(!canUpdate()||applying||!registration?.waiting)return;
    const worker=registration.waiting;applying=true;refresh();
    void applyUpdate(async()=>{
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>finish(Error('Could not apply update. Try again later.')),15_000);
        const finish=(error?:Error)=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);worker.removeEventListener('statechange',changed);error?reject(error):resolve();};
        const changed=()=>{if(worker.state==='redundant')finish(Error('Update unavailable. Try again later.'));else if(worker.state==='activated'&&navigator.serviceWorker.controller===worker)finish();};
        navigator.serviceWorker.addEventListener('controllerchange',changed);worker.addEventListener('statechange',changed);worker.postMessage({type:'ACTIVATE_UPDATE'});changed();
      });
      location.reload();
    }).catch(error=>{status.textContent=error instanceof Error?error.message:'Could not update app';}).finally(()=>{applying=false;button.disabled=!canUpdate();});
  },opts);
  navigator.serviceWorker.addEventListener('controllerchange',refresh,opts); // Never reload for another tab's update.
  window.addEventListener('online',()=>void check(),opts);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();},opts);
  void check();
  return {refresh,dispose:()=>{disposed=true;abort.abort();}};
}
