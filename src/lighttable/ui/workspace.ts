import { Session } from '../model/session';
import { createComposition, clamp, type LayerId, type ParameterId, type XYId } from '../model/types';
import { inverse, filmToScreen, vector } from '../model/transforms';
import { parameters, xyTools, toolParameters, parameterPosition } from '../model/parameters';
import { Gestures, bindGestures } from '../input/gestures';
import { Renderer } from '../render/renderer';
import { Repository } from '../data/repository';
import { ConflictError } from '../data/types';
import { Navigation } from '../model/navigation';
import { Library } from './library';
import { ExportDialog } from './export-dialog';
import { ProfileDialog } from './profile-dialog';
import { setupPwa } from './pwa';
import { FilmRails } from './film-rails';
import { demoSources } from './fixtures';
const icons={
  browse:'<path d="m7 7-5 5 5 5M2 12h20m-5-5 5 5-5 5"/>',
  export:'<path d="M12 15V3m-4 4 4-4 4 4M5 11v9h14v-9"/>',
  contrast:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 4a8 8 0 0 1 0 16" fill="currentColor"/>',
  radius:'<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  threshold:'<path d="m4 18 8-12 8 12M4 14h16"/>',
  balance:'<path d="M12 4v16M4 8h16M4 8l-3 7h6L4 8ZM20 8l-3 7h6l-3-7Z"/>',
  xy:'<path d="M12 3v18M3 12h18m-12-6 3-3 3 3m3 3 3 3-3 3"/>',
  back:'<path d="m14 6-6 6 6 6"/>',
  rotate:'<path d="M5 8a8 8 0 1 1-1 7M5 3v5h5"/><path d="M10 10h5v5h-5z"/>',
  undo:'<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12" transform="translate(1 -2)"/>',
  pro:'<path d="M6 4v16M12 4v16M18 4v16"/><circle cx="6" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="18" cy="7" r="2"/>',
  halo:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  light:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  reset:'<path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4"/><path d="M8 12h8M12 8v8"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  profile:'<rect x="3" y="4" width="13" height="16" rx="2"/><path d="M16 7h5v13a2 2 0 0 1-2 2h-9M9 4v16"/>',
  hand:'<path d="M8 12V5a2 2 0 0 1 4 0v7-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-3-7-6L3 12a2 2 0 0 1 3-2l2 2Z"/>',
};
const icon=(name:keyof typeof icons)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const button=(id:string,label:string,name:keyof typeof icons)=>`<button type="button" data-action="${id}" aria-label="${label}" title="${label}">${icon(name)}</button>`;

export async function mountWorkspace(root:HTMLElement){
  root.innerHTML=`<main class="workspace">
    <header class="topbar"><button class="icon-button" data-action="library" aria-label="Open library">${icon('back')}</button><span class="wordmark">multik<span class="wordmark-dot"> · </span></span><div class="top-actions"><button class="info-button" data-action="info" aria-label="About Multik">◦</button></div></header>
    <section class="stage" aria-label="Lighttable"><canvas tabindex="0" aria-label="Photo. Swipe to browse, select a layer to move. Pinch resizes the selected layer."></canvas><div class="parameter-compass" aria-hidden="true" hidden><i></i><b></b><span></span></div></section>
    <p class="status" role="status" aria-live="polite"></p>
    <div class="pro-tools glass" hidden><div class="pro-primary">${button('layer','Move layer','hand')}${button('halo','Red halo','halo')}${button('exposure','Exposure','light')}${button('profile','Image profile','profile')}${button('rotate-layer','Rotate selected layer','rotate')}${button('undo','Undo','undo')}${button('reset','Center selected layer','reset')}</div>
    <div class="pro-secondary" data-family="halo" hidden>${button('haloRadius','Halo radius','radius')}${button('haloThreshold','Highlight threshold','threshold')}${button('haloXY',xyTools.haloXY.label,'xy')}</div>
    <div class="pro-secondary" data-family="light" hidden>${button('contrast','Contrast','contrast')}${button('balance','Film balance','balance')}${button('lightXY',xyTools.lightXY.label,'xy')}</div>
    <input class="accessible-range" type="range"/><input class="accessible-range accessible-x" type="range" hidden/></div>
    <footer class="toolbar glass"><div class="sources">
      <button data-layer="a" aria-label="Move lower layer" aria-pressed="false"><img alt=""/><span class="layer-depth" aria-hidden="true">I</span></button>
      <button data-layer="b" aria-label="Move upper layer" aria-pressed="true"><img alt=""/><span class="layer-depth" aria-hidden="true">II</span></button>
    </div><span class="divider"></span>${button('browse','Browse frames','browse')}${button('import','Open rolls','plus')}${button('rotate','Rotate photo 90 degrees','rotate')}${button('export','Save to Photos','export')}${button('pro','Edit photo','pro')}</footer>
    <dialog class="info-dialog"><div class="sheet-content"><h1>Lighttable</h1><p>Swipe to change frames. Tap a layer thumbnail to move it; tap it again to browse. Pinch changes only the selected layer size.</p><p>Tap a tool, then slide up or down. The two-axis tool also responds left and right.</p><p>Edits save when changing frames or opening a tool, library or export. Lifting your finger does not save.</p><p>Use the arrow in the bottom dock to save a photo. On iPhone, choose Save Image in the share sheet.</p><p class="prototype-note">Install: Safari → Share → Add to Home Screen.</p><p class="prototype-note" data-pwa-state></p><a class="text-button recovery-link" href="/lighttable/recover.html">Recover app</a></div><form method="dialog" class="sheet-dock sheet-actions"><button class="close-dialog" aria-label="Close">×</button><button type="button" class="mix-button" data-pwa-update hidden>Update</button></form></dialog>
  </main>`;
  const canvas=root.querySelector('canvas')!,stage=root.querySelector<HTMLElement>('.stage')!;
  const session=new Session(createComposition('empty',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:4,y:3},{x:4,y:3}]));
  const renderer=new Renderer(canvas,session),gestures=new Gestures(session);
  let pwa:ReturnType<typeof setupPwa>|undefined;
  let busy=true,exportBusy=false,pro=false,sourceUrls:string[]=[],thumbKey='';
  const repo=new Repository(),navigation=new Navigation(repo,session,renderer);
  const status=root.querySelector<HTMLElement>('.status')!,proTools=root.querySelector<HTMLElement>('.pro-tools')!,ranges=[...root.querySelectorAll<HTMLInputElement>('.accessible-range')];
  const compass=root.querySelector<HTMLElement>('.parameter-compass')!;
  const indicator=()=>{const keys=toolParameters(session.tool);compass.hidden=!pro||!keys.length;compass.classList.toggle('xy',session.tool.kind==='xy');compass.classList.toggle('changing',session.gesturing);if(keys.length){compass.style.setProperty('--y',String(1-parameterPosition(keys[0],session.draft.effects[keys[0]])));compass.style.setProperty('--x',String(keys[1]?parameterPosition(keys[1],session.draft.effects[keys[1]]):.5));}};
  const info=root.querySelector<HTMLDialogElement>('.info-dialog')!;
  const action=(id:string)=>root.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
  const copy=document.createElement('button');copy.className='conflict-copy';copy.textContent='Save a separate copy';copy.hidden=true;root.querySelector('.workspace')!.append(copy);
  let noticeTimer=0;
  const report=(message:string)=>{clearTimeout(noticeTimer);status.textContent=message;status.hidden=!message;};
  const reportError=(error:unknown)=>{report(error instanceof Error?error.message:'Could not complete action');copy.hidden=!(error instanceof ConflictError);};
  const library=new Library(root,repo,navigation),exportDialog=new ExportDialog(root,renderer,repo),profileDialog=new ProfileDialog(root,session);
  gestures.onSwipe=direction=>{void navigation.step(direction).catch(reportError);};
  const rails=new FilmRails(root.querySelector<HTMLElement>('.workspace')!,navigation,repo,reportError);
  const sync=()=>{
    const locked=busy||exportBusy||navigation.busy||gestures.active||profileDialog.active;
    for(const b of root.querySelectorAll<HTMLButtonElement>('.toolbar button, .pro-tools button'))b.disabled=locked;
    action('export').disabled=locked||!navigation.sources;
    action('undo').disabled=locked||!session.canUndo;
    action('browse').setAttribute('aria-pressed',String(session.interaction==='browse'&&session.tool.kind==='layer'));
    root.querySelector('.workspace')!.classList.toggle('moving-layer',session.interaction==='move');
    for(const b of root.querySelectorAll<HTMLButtonElement>('[data-layer]'))b.setAttribute('aria-pressed',String(b.dataset.layer===session.activeLayer));
    proTools.hidden=!pro;action('pro').setAttribute('aria-expanded',String(pro));
    action('profile').setAttribute('aria-haspopup','dialog');action('profile').setAttribute('aria-expanded',String(profileDialog.active));
    const selected=session.tool.kind==='layer'?'layer':session.tool.kind==='xy'?session.tool.pair:session.tool.parameter;
    for(const id of ['layer',...Object.keys(parameters),...Object.keys(xyTools)])action(id).setAttribute('aria-pressed',String(id===selected));
    const family=selected.startsWith('halo')?'halo':selected==='layer'?'':'light';
    for(const el of root.querySelectorAll<HTMLElement>('[data-family]'))el.hidden=el.dataset.family!==family;
    const keys=toolParameters(session.tool);
    ranges.forEach((range,i)=>{const key=keys[i];range.hidden=!pro||!key;range.disabled=locked;if(key){const p=parameters[key];range.dataset.parameter=key;range.min=String(p.min);range.max=String(p.max);range.step=String(p.step);range.value=String(session.draft.effects[key]);range.setAttribute('aria-label',p.label);}});
    canvas.setAttribute('aria-label',session.tool.kind==='layer'?'Photo. Swipe to browse, select a layer to move. Pinch resizes the selected layer.':session.tool.kind==='xy'?xyTools[session.tool.pair].label:`${parameters[session.tool.parameter].label}. Slide up to increase, down to decrease. Pinch resizes the selected layer.`);
    indicator();
    canvas.style.pointerEvents=busy||exportBusy||navigation.busy||profileDialog.active?'none':'';
    rails.setLocked(locked);pwa?.refresh();
  };
  exportDialog.onBusy=value=>{exportBusy=value;sync();};
  profileDialog.onChange=sync;
  session.onChange=()=>{renderer.invalidate();indicator();};
  renderer.onStatus=message=>{busy=true;profileDialog.cancel();gestures.reset();sync();report(message);};
  renderer.onReady=()=>{busy=false;sync();report('');};
  navigation.onBusy=sync;
  navigation.onChange=()=>{
    if(navigation.sources){
      const key=navigation.sources.map(a=>a.id).join('|');
      if(key!==thumbKey){thumbKey=key;for(const url of sourceUrls)URL.revokeObjectURL(url);sourceUrls=navigation.sources.map(a=>URL.createObjectURL(a.thumb));root.querySelectorAll<HTMLImageElement>('.sources img').forEach((img,i)=>{img.src=sourceUrls[i];img.classList.toggle('portrait-source',!!navigation.sources&&navigation.sources[i].height>navigation.sources[i].width);});}
    }
    sync();void rails.update().catch(reportError);
  };
  copy.onclick=()=>{void navigation.keepConflictCopy().then(()=>{copy.hidden=true;report('Copy saved');noticeTimer=window.setTimeout(()=>report(''),2200);}).catch(reportError);};
  const unbind=bindGestures(canvas,gestures,sync);
  const resize=new ResizeObserver(()=>{
    const rect=stage.getBoundingClientRect();
    if(rect.width===session.viewport.width&&rect.height===session.viewport.height)return;
    profileDialog.cancel();gestures.cancel();session.viewport.width=Math.max(1,rect.width);session.viewport.height=Math.max(1,rect.height);
    session.viewport.pan={x:0,y:0};renderer.invalidate();sync();
  });resize.observe(stage);
  const abort=new AbortController(),opts={signal:abort.signal};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){profileDialog.cancel();gestures.reset();sync();}},opts);
  root.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLButtonElement>('[data-action], [data-layer]');if(!target)return;
    const id=target.dataset.action;
    if(profileDialog.active)return;
    if(id==='info'){pwa?.refresh();info.showModal();return;}
    if(busy||exportBusy||navigation.busy||gestures.active)return;
    if(target.dataset.layer){session.interaction=session.activeLayer===target.dataset.layer&&session.interaction==='move'?'browse':'move';session.activeLayer=target.dataset.layer as LayerId;session.tool={kind:'layer'};void rails.update().catch(reportError);report(session.interaction==='move'?`Move ${session.activeLayer==='a'?'I':'II'} · pinch to resize`:'Swipe to browse');noticeTimer=window.setTimeout(()=>report(''),1800);}
    if(id==='browse'){pro=false;session.interaction='browse';session.tool={kind:'layer'};}
    if(id==='rotate'){session.rotate();session.viewport.pan={x:0,y:0};pro=false;session.tool={kind:'layer'};}
    if(id==='undo')session.undo();
    if(id==='profile'){profileDialog.open();return;}
    if(id==='rotate-layer')session.rotateLayer();
    if(id==='reset')session.resetLayer();
    if(id==='pro'){
      if(pro){pro=false;session.interaction='browse';session.tool={kind:'layer'};sync();return;}
      void navigation.boundary(async()=>{pro=true;session.interaction='move';session.tool={kind:'layer'};sync();}).catch(reportError);return;
    }
    if(id==='layer'){session.tool={kind:'layer'};session.interaction='move';}
    if(id&&Object.hasOwn(parameters,id))session.tool={kind:'parameter',parameter:id as ParameterId};
    if(id&&Object.hasOwn(xyTools,id))session.tool={kind:'xy',pair:id as XYId};
    if(id==='export'){void navigation.boundary(async()=>{if(navigation.sources&&navigation.project)exportDialog.open(session.draft,navigation.sources,navigation.project.id);}).catch(reportError);return;}
    if(id==='import'||id==='library'){void navigation.boundary(()=>library.open()).catch(reportError);return;}
    sync();renderer.invalidate();
  },opts);
  // Native range is a keyboard/VoiceOver equivalent, not a permanent slider in the photo UI.
  for(const range of ranges){
    range.addEventListener('input',()=>{
      if(busy||exportBusy||navigation.busy||gestures.active||profileDialog.active)return;
      const key=range.dataset.parameter as ParameterId;if(!toolParameters(session.tool).includes(key))return;
      session.begin();session.draft.effects[key]=Number(range.value);session.onChange();
    },opts);
    range.addEventListener('change',()=>{session.end();sync();},opts);
    range.addEventListener('blur',()=>{session.end();sync();},opts);
  }
  canvas.addEventListener('keydown',event=>{
    if(busy||exportBusy||navigation.busy||gestures.active||profileDialog.active)return;
    const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(event.key==='0'){event.preventDefault();session.scaleLayer(1);sync();return;}
    if(event.key==='+'||event.key==='='){event.preventDefault();session.scaleLayer((session.layer.transform.scale??1)*1.25);sync();return;}
    if(event.key==='-'){event.preventDefault();session.scaleLayer((session.layer.transform.scale??1)/1.25);sync();return;}
    const direction=directions[event.key];if(!direction)return;event.preventDefault();
    if(session.interaction==='browse'&&session.tool.kind==='layer'){if(direction[0])void navigation.step(direction[0]===1?1:-1).catch(reportError);return;}
    session.begin();
    if(session.tool.kind==='layer'){
      const d=vector(inverse(filmToScreen(session.draft.frame,session.viewport)),{x:direction[0]*(event.shiftKey?20:4),y:direction[1]*(event.shiftKey?20:4)});
      session.moveLayer(session.layer.transform.xMm+d.x,session.layer.transform.yMm+d.y);
    }else{const keys=toolParameters(session.tool),key=direction[0]?keys[1]:keys[0];if(key){const p=parameters[key];session.draft.effects[key]=clamp(session.draft.effects[key]+(direction[0]||-direction[1])*p.step,p.min,p.max);}}
    session.end();sync();
  },opts);
  const dispose=()=>{clearTimeout(noticeTimer);pwa?.dispose();abort.abort();profileDialog.dispose();unbind();resize.disconnect();exportDialog.dispose();library.dispose();rails.dispose();renderer.dispose();void repo.close();for(const url of sourceUrls)URL.revokeObjectURL(url);};
  try{
    report('Preparing Lighttable…');sync();
    const blobs=await demoSources();
    await renderer.loadPair(blobs.map((blob,i)=>({id:`demo-${i}`,blob})) as Parameters<Renderer['loadPair']>[0]);
    sourceUrls=blobs.map(blob=>URL.createObjectURL(blob));root.querySelectorAll<HTMLImageElement>('.sources img').forEach((img,i)=>{img.src=sourceUrls[i];img.classList.toggle('portrait-source',!!navigation.sources&&navigation.sources[i].height>navigation.sources[i].width);});
    try{const project=await repo.lastProject();if(project)await navigation.open(project);else await library.open();}catch(error){reportError(error);}
  }catch(error){dispose();throw error;}
  pwa=setupPwa({root,canUpdate:()=>!profileDialog.active&&!busy&&!exportBusy&&!navigation.busy&&!gestures.active&&!session.gesturing&&!library.dialog.open&&!root.querySelector<HTMLDialogElement>('.export-dialog')!.open&&(!session.dirty||!!navigation.project),applyUpdate:async action=>{if(!await navigation.boundary(action))throw Error('Finish this action and try updating again');}});
  return {session,renderer,gestures,repo,navigation,dispose};

}
