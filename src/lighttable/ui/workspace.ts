import { Session } from '../model/session';
import { createComposition, copyComposition, clamp, type LayerId, type ParameterId } from '../model/types';
import { getLevels, moveLevel, setLevels } from '../model/levels';
import { inverse, filmToScreen, vector } from '../model/transforms';
import { parameters, xyTools, toolParameters } from '../model/parameters';
import { Gestures, bindGestures } from '../input/gestures';
import { Renderer } from '../render/renderer';
import { Repository } from '../data/repository';
import { compositionStateKey, ConflictError, type Favorite, type Project } from '../data/types';
import { Navigation } from '../model/navigation';
import { Library } from './library';
import { FavoriteNotice } from './favorite-notice';
import { Covers } from './covers';
import { ExportDialog } from './export-dialog';
import { Editor } from './editor';
import { button } from './icons';
import { setupPwa } from './pwa';
import { FilmRails } from './film-rails';
import { demoSources } from './fixtures';

export async function mountWorkspace(root:HTMLElement){
  root.innerHTML=`<main class="workspace">
    <header class="topbar">${button('library','Open Mixes','film')}${button('collection','Open Library','collection')}</header>
    <section class="stage" aria-label="Lighttable"><canvas tabindex="0" aria-label="Photo. Swipe to browse. Edit to move a selected photo."></canvas></section>
    <p class="status" role="status" aria-live="polite"></p>
    <footer class="toolbar glass"><div class="sources">
      <button type="button" data-layer="a" aria-label="Select photo I" aria-pressed="false"><img alt=""/><span class="layer-depth" aria-hidden="true">I</span></button>
      <button type="button" data-layer="b" aria-label="Select photo II" aria-pressed="true"><img alt=""/><span class="layer-depth" aria-hidden="true">II</span></button>
    </div><span class="divider"></span>${button('favorite','Add to Library','heart')}${button('rotate','Rotate photo 90 degrees','rotate')}${button('export','Save to Photos','export')}${button('pro','Edit photo','pro')}${button('undo','Undo','undo')}</footer>
  </main>`;
  const workspace=root.querySelector<HTMLElement>('.workspace')!,canvas=root.querySelector('canvas')!,stage=root.querySelector<HTMLElement>('.stage')!;
  const session=new Session(createComposition('empty',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:4,y:3},{x:4,y:3}]));
  const renderer=new Renderer(canvas,session),gestures=new Gestures(session);
  let pwa:ReturnType<typeof setupPwa>|undefined;
  let busy=true,exportBusy=false,sourceUrls:string[]=[],thumbKey='';
  const orientation=matchMedia('(orientation: landscape)');
  let orientationSavePending=false,cleanView=false;
  const repo=new Repository(),navigation=new Navigation(repo,session,renderer);
  const status=root.querySelector<HTMLElement>('.status')!;
  const action=(id:string)=>root.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
  const covers=new Covers(repo);
  let favorites:Favorite[]=[],favoriteGeneration=0;
  const currentFavorite=()=>{const key=compositionStateKey(session.draft);return favorites.find(f=>f.stateKey===key);};
  const syncHeart=()=>{if(session.gesturing)return;const liked=!!currentFavorite(),heart=action('favorite');heart.setAttribute('aria-pressed',String(liked));heart.setAttribute('aria-label',liked?'Remove from Library':'Add to Library');};
  const refreshFavorites=async()=>{const generation=++favoriteGeneration;const next=await repo.listFavorites();if(generation===favoriteGeneration){favorites=next;sync();}};
  const copy=document.createElement('button');copy.className='conflict-copy';copy.textContent='Save a separate copy';copy.hidden=true;workspace.append(copy);
  let noticeTimer=0;
  const report=(message:string)=>{clearTimeout(noticeTimer);status.textContent=message;status.hidden=!message;};
  const reportError=(error:unknown)=>{report(error instanceof Error?error.message:'Could not complete action');copy.hidden=!(error instanceof ConflictError);};
  const library=new Library(root,repo,navigation,{cover:p=>covers.project(p),resumeCover:async()=>{
    const context=await repo.preference('last-editing-session') as {project?:Project}|undefined;
    if(!context?.project)return undefined;
    const saved=await repo.project(context.project.id),slotId=context.project.recipe?.slots[context.project.slot??0]?.id;
    if(saved.recipe&&slotId){const slot=saved.recipe.slots.findIndex(s=>s.id===slotId);if(slot<0)return undefined;const rolls=await Promise.all([repo.roll(saved.rollA),repo.roll(saved.rollB)]);const item=saved.recipe.slots[slot];return covers.project({...saved,slot,a:rolls[0].assetIds.indexOf(item.assetAId),b:rolls[1].assetIds.indexOf(item.assetBId)});}
    return covers.project({...saved,a:context.project.a,b:context.project.b});
  },onStateChange:()=>sync(),onFavoritesChange:refreshFavorites}),exportDialog=new ExportDialog(root,renderer,repo),editor=new Editor(workspace,session);
  const favoriteNotice=new FavoriteNotice(repo,refreshFavorites,reportError);workspace.append(favoriteNotice.element);
  gestures.onTap=()=>{if(session.interaction==='browse'&&session.tool.kind==='layer'){cleanView=!cleanView;sync();}};
  gestures.onSwipe=direction=>{if(session.interaction==='browse')void navigation.step(direction).catch(reportError);};
  const rails=new FilmRails(workspace,navigation,repo,reportError,()=>{if(orientation.matches)editor.selectMode();sync();});
  gestures.allowScale=()=>orientation.matches&&editor.mode==='layers';
  const baseLocked=()=>busy||exportBusy||navigation.busy;
  const locked=()=>baseLocked()||gestures.active||session.gesturing;
  const sync=()=>{
    if(orientation.matches&&navigation.project){
      if(!session.editing){session.beginEdit();editor.selectMode();}
    }else{
      if(session.editing){editor.finishGesture();session.end();session.acceptEdit();orientationSavePending=true;}
      session.interaction='browse';session.tool={kind:'layer'};
    }
    if(session.interaction!=='browse')cleanView=false;
    workspace.classList.toggle('clean-view',cleanView);
    workspace.dataset.space=navigation.space;
    action('library').setAttribute('aria-pressed',String(navigation.space==='mixes'));
    action('collection').setAttribute('aria-pressed',String(navigation.space==='library'));
    const save=action('export'),dock=session.editing?editor.element.querySelector('.edit-actions')!:workspace.querySelector('.toolbar')!;
    if(save.parentElement!==dock)dock.insertBefore(save,session.editing?null:action('pro'));
    const rotate=action('rotate');
    if(rotate.parentElement!==dock)dock.insertBefore(rotate,save);
    const heart=action('favorite');
    if(heart.parentElement!==dock)dock.insertBefore(heart,save);
    syncHeart();
    workspace.dataset.composition=session.draft.frame.turns%2?'portrait':'landscape';
    workspace.dataset.favorite=String(!!navigation.project?.kind);
    const lock=locked();workspace.classList.toggle('editing',session.editing);workspace.classList.toggle('moving-layer',session.interaction==='move');
    for(const b of root.querySelectorAll<HTMLButtonElement>('.toolbar button'))b.disabled=lock;
    action('export').disabled=lock||!navigation.sources;
    action('undo').disabled=lock||!session.canUndo;
    action('library').disabled=lock;action('collection').disabled=lock;
    heart.disabled=lock||!navigation.sources;
    action('pro').setAttribute('aria-expanded',String(session.editing));
    for(const b of root.querySelectorAll<HTMLButtonElement>('[data-layer]'))b.setAttribute('aria-pressed',String(b.dataset.layer===session.activeLayer));
    editor.sync(lock);
    action('export').disabled=lock||!navigation.sources;heart.disabled=lock||!navigation.sources;
    const selected=session.tool.kind==='parameter'?session.tool.parameter:session.tool.kind==='xy'?session.tool.pair:'';
    for(const b of root.querySelectorAll<HTMLButtonElement>('.pro-options [data-action]'))b.setAttribute('aria-pressed',String(b.dataset.action===selected));
    canvas.setAttribute('aria-label',session.tool.kind==='levels'?`Levels of photo ${session.activeLayer==='a'?'I':'II'}. Left, middle and right thirds adjust black, midtones and white. Slide vertically. Select Move to resize this layer.`:session.tool.kind==='xy'?xyTools[session.tool.pair].label:session.tool.kind==='parameter'?`${parameters[session.tool.parameter].label}. Slide up to increase.`:'Photo. Swipe to browse. Edit to move a selected photo.');
    canvas.style.pointerEvents=baseLocked()||editor.activeGesture?'none':'';
    rails.setLocked(lock);pwa?.refresh();
    if(orientationSavePending&&!baseLocked()&&!session.gesturing&&!gestures.active){
      orientationSavePending=false;
      queueMicrotask(()=>{void navigation.boundary(async()=>{}).catch(reportError);});
    }
  };
  const finish=()=>{session.interaction='browse';session.tool={kind:'layer'};report('');sync();};
  editor.onChange=sync;
  editor.onDone=()=>{editor.finishGesture();session.end();editor.selectMode('browse');sync();void navigation.boundary(async()=>{session.acceptEdit();finish();}).catch(reportError);};
  editor.onCancel=()=>{session.discardEdit();finish();};
  exportDialog.onBusy=value=>{exportBusy=value;sync();};
  exportDialog.onStatus=report;
  session.onChange=()=>{syncHeart();workspace.dataset.composition=session.draft.frame.turns%2?'portrait':'landscape';renderer.invalidate();editor.refresh();};
  renderer.onStatus=message=>{busy=true;editor.cancelGesture();gestures.reset();sync();report(message);};
  renderer.onReady=()=>{busy=false;sync();report('');};
  navigation.onBusy=()=>sync();
  navigation.onChange=()=>{
    if(orientation.matches){session.beginEdit();editor.selectMode();}
    void refreshFavorites().catch(reportError);
    if(navigation.sources){
      const key=navigation.sources.map(a=>a.id).join('|');
      if(key!==thumbKey){thumbKey=key;for(const url of sourceUrls)URL.revokeObjectURL(url);sourceUrls=navigation.sources.map(a=>URL.createObjectURL(a.thumb));root.querySelectorAll<HTMLImageElement>('.sources img').forEach((img,i)=>{img.src=sourceUrls[i];img.classList.toggle('portrait-source',!!navigation.sources&&navigation.sources[i].height>navigation.sources[i].width);});}
    }
    sync();void rails.update().catch(reportError);
  };
  copy.onclick=()=>{void navigation.keepConflictCopy().then(success=>{if(!success)return;copy.hidden=true;finish();report('Copy saved');noticeTimer=window.setTimeout(()=>report(''),2200);}).catch(reportError);};
  const unbind=bindGestures(canvas,gestures,sync,()=>!baseLocked()&&!editor.activeGesture);
  const resize=new ResizeObserver(()=>{
    const rect=stage.getBoundingClientRect();if(rect.width===session.viewport.width&&rect.height===session.viewport.height)return;
    editor.cancelGesture();gestures.reset();session.viewport.width=Math.max(1,rect.width);session.viewport.height=Math.max(1,rect.height);
    session.viewport.pan={x:0,y:0};renderer.invalidate();sync();
  });resize.observe(stage);
  const abort=new AbortController(),opts={signal:abort.signal};
  orientation.addEventListener('change',()=>{editor.finishGesture();session.end();gestures.reset();sync();renderer.invalidate();},opts);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){editor.cancelGesture();gestures.reset();sync();}},opts);
  window.addEventListener('blur',()=>{editor.cancelGesture();gestures.reset();sync();},opts);
  root.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLButtonElement>('[data-action], [data-layer]');if(!target||target.disabled||locked())return;
    const id=target.dataset.action;
    if(target.dataset.layer){
      const layer=target.dataset.layer as LayerId;
      if(!session.editing)return;
      session.activeLayer=layer;editor.selectMode();
      void rails.update().catch(reportError);
    }
    if(id==='rotate'){session.rotate();session.viewport.pan={x:0,y:0};if(orientation.matches)editor.selectMode();}
    if(id==='undo')session.undo();
    if(id==='rotate-layer')session.rotateLayer();
    if(id==='reset')session.resetLayer();
    if(id==='reset-levels'){session.begin();delete session.layer.levels;session.end();}
    if(id==='pro'&&orientation.matches&&!session.editing){
      void navigation.boundary(async()=>{session.beginEdit();editor.mode='layers';session.interaction='move';session.tool={kind:'layer'};report('');sync();}).catch(reportError);return;
    }
    if(id&&['halo','haloRadius','haloThreshold'].includes(id)&&session.draft.profile.version!==5)session.tool={kind:'parameter',parameter:id as ParameterId};
    if(id==='haloXY'&&session.draft.profile.version!==5)session.tool={kind:'xy',pair:'haloXY'};
    if(id==='favorite'){void navigation.boundary(async()=>{
      if(!navigation.project)return;const existing=currentFavorite();
      if(existing){const removed=await repo.removeFavorite(existing.id);if(removed)favoriteNotice.show(removed);}
      else {const snapshot=copyComposition(session.draft);await repo.favoriteCurrent(navigation.project,snapshot,await covers.render(snapshot));}
      await refreshFavorites();
    }).catch(reportError);return;}
    if(id==='export'){if(!session.dirty&&exportDialog.shareReady(session.draft))return;void navigation.boundary(async()=>{if(navigation.sources&&navigation.project){session.acceptEdit();finish();await exportDialog.open(session.draft,navigation.sources,navigation.project.id);}}).catch(reportError);return;}
    if(id==='library'||id==='collection'){void navigation.boundary(async()=>{cleanView=false;session.acceptEdit();finish();await library.open(id==='collection'?'favorites':'mixes');}).catch(reportError);return;}
    sync();renderer.invalidate();
  },opts);
  canvas.addEventListener('keydown',event=>{
    if(locked())return;
    const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(event.key==='Escape'&&session.editing){event.preventDefault();editor.requestCancel();return;}
    if(!orientation.matches||session.interaction==='browse'){const d=directions[event.key];if(d?.[0]){event.preventDefault();void navigation.step(d[0]===1?1:-1).catch(reportError);}return;}
    if(event.key==='0'){event.preventDefault();session.scaleLayer(1);sync();return;}
    if(event.key==='+'||event.key==='='){event.preventDefault();session.scaleLayer((session.layer.transform.scale??1)*1.25);sync();return;}
    if(event.key==='-'){event.preventDefault();session.scaleLayer((session.layer.transform.scale??1)/1.25);sync();return;}
    const direction=directions[event.key];if(!direction)return;event.preventDefault();
    session.begin();
    if(session.tool.kind==='layer'){
      const d=vector(inverse(filmToScreen(session.draft.frame,session.viewport)),{x:direction[0]*(event.shiftKey?20:4),y:direction[1]*(event.shiftKey?20:4)});
      session.moveLayer(session.layer.transform.xMm+d.x,session.layer.transform.yMm+d.y);
    }else if(session.tool.kind==='levels'){
      const l=getLevels(session.layer),p=session.tool.point;setLevels(session.layer,moveLevel(l,p,l[p]+(direction[0]||-direction[1])*.01));
    }else{const keys=toolParameters(session.tool),key=direction[0]?keys[1]:keys[0];if(key){const p=parameters[key];session.draft.effects[key]=clamp(session.draft.effects[key]+(direction[0]||-direction[1])*p.step,p.min,p.max);}}
    session.end();sync();
  },opts);
  const dispose=()=>{clearTimeout(noticeTimer);favoriteNotice.dispose();pwa?.dispose();covers.dispose();abort.abort();editor.dispose();unbind();resize.disconnect();exportDialog.dispose();library.dispose();rails.dispose();renderer.dispose();void repo.close();for(const url of sourceUrls)URL.revokeObjectURL(url);};
  try{
    report('Preparing Lighttable…');sync();
    const blobs=await demoSources();await renderer.loadPair(blobs.map((blob,i)=>({id:`demo-${i}`,blob})) as Parameters<Renderer['loadPair']>[0]);
    sourceUrls=blobs.map(blob=>URL.createObjectURL(blob));root.querySelectorAll<HTMLImageElement>('.sources img').forEach((img,i)=>img.src=sourceUrls[i]);
    try{const project=await repo.lastProject();if(project)await navigation.open(project);else await library.open();}catch(error){reportError(error);}
  }catch(error){dispose();throw error;}
  pwa=setupPwa({root,canUpdate:()=>(!session.editing||library.dialog.open)&&!busy&&!exportBusy&&!navigation.busy&&!gestures.active&&!session.gesturing&&!library.interacting&&!exportDialog.busy&&(!session.dirty||!!navigation.project),applyUpdate:async action=>{if(!await navigation.boundary(action))throw Error('Finish this action and try updating again');}});
  return {session,renderer,gestures,repo,navigation,editor,dispose};
}
