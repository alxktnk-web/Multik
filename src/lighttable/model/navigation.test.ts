import { describe,expect,it,vi } from 'vitest';
import { Navigation } from './navigation';
import { Session } from './session';
import { createComposition,copyComposition } from './types';
import { pairId,type Asset,type Project,type Roll,type Favorite } from '../data/types';
import type { Repository } from '../data/repository';
import type { Renderer } from '../render/renderer';

async function setup(){
  const rolls:[Roll,Roll]=['a','b'].map(id=>({id,name:id,capacity:3,assetIds:[0,1,2].map(i=>`${id}${i}`),createdAt:''})) as [Roll,Roll];
  const origin:Project={id:'mix',rollA:'a',rollB:'b',a:2,b:2,updatedAt:''};
  const favorite:Project={...origin,id:'favorite',kind:'favorite',a:0,b:1,favoriteSourceId:pairId(origin,'a0','b1')};
  // Distinct variants deliberately share sources: Library must browse states.
  const variants=[favorite,{...favorite,id:'second'},{...favorite,id:'third',a:2,b:0}];
  const projects=new Map([origin,...variants].map(p=>[p.id,p]));
  const scene=(p:Project)=>createComposition(pairId(p,`a${p.a}`,`b${p.b}`),[{assetId:`a${p.a}`,assetRevision:1},{assetId:`b${p.b}`,assetRevision:1}],[{x:400,y:300},{x:400,y:300}]);
  const saved=new Map(variants.map((p,i)=>{const c=scene(p);c.revision=1;c.frame.turns=i as 0|1|2;return [c.id,c];}));
  const initial=copyComposition(saved.get(scene(favorite).id)!);
  let favorites:Favorite[]=variants.map((p,i)=>({id:`favorite:${p.id}`,projectId:p.id,compositionId:scene(p).id,sourceCompositionId:p.favoriteSourceId!,createdAt:String(3-i),thumb:new Blob()}));
  const prefs=new Map<string,unknown>(),events:string[]=[];
  const repo={
    roll:vi.fn(async(id:string)=>rolls.find(r=>r.id===id)!),
    project:vi.fn(async(id:string)=>{const p=projects.get(id);if(!p)throw Error('Session unavailable');return p;}),
    preference:vi.fn(async(id:string)=>prefs.get(id)),
    setPreference:vi.fn(async(id:string,value:unknown)=>{prefs.set(id,value);}),
    listFavorites:vi.fn(async()=>favorites),
    asset:vi.fn(async(id:string)=>({id,revision:1,preview:new Blob(),width:400,height:300}) as Asset),
    ensureComposition:vi.fn(async(c:ReturnType<typeof createComposition>)=>copyComposition(saved.get(c.id)??c)),
    workingCopy:vi.fn(async(c:ReturnType<typeof createComposition>,project:Project)=>{events.push('working-copy');const draft:Project={...project,id:'draft',kind:'draft'},next={...copyComposition(c),id:pairId(draft,`a${project.a}`,`b${project.b}`),revision:1};saved.set(next.id,next);projects.set(draft.id,draft);return {project:draft,composition:next};}),
    commit:vi.fn(async(c:ReturnType<typeof createComposition>,revision:number)=>{events.push('commit');const next={...copyComposition(c),revision:revision+1};saved.set(c.id,next);return next;}),
    select:vi.fn(async()=>{events.push('select');}),
  };
  const makeNavigation=()=>{
    const session=new Session(initial);
    const renderer={loadPair:vi.fn(async(_sources:unknown,_reset:unknown,c:ReturnType<typeof createComposition>,select:()=>Promise<void>)=>{await select();session.replace(c);return true;})};
    return {session,renderer,navigation:new Navigation(repo as unknown as Repository,session,renderer as unknown as Renderer)};
  };
  const current=makeNavigation();await current.navigation.open(favorite,'library');events.length=0;
  return {...current,repo,saved,events,favorite,origin,initial,variants,projects,prefs,makeNavigation,remove:(id:string)=>{favorites=favorites.filter(f=>f.projectId!==id);}};
}

describe('Library browsing space',()=>{
  it.each(['a','b'] as const)('selects the fixed %s layer while retaining Levels and its sources',async layer=>{
    const {navigation,session,repo,favorite}=await setup();session.tool={kind:'levels',point:'mid'};session.activeLayer=layer==='a'?'b':'a';
    expect(await navigation.select(layer,favorite[layer])).toBe(true);
    expect(session.activeLayer).toBe(layer);expect(session.tool).toEqual({kind:'levels',point:'mid'});
    expect(navigation.project).toBe(favorite);expect(repo.commit).not.toHaveBeenCalled();expect(repo.project).not.toHaveBeenCalled();
  });
  it.each(['a','b'] as const)('rejects replacing the %s source, including after edits fork a draft',async layer=>{
    const {navigation,session,repo,favorite}=await setup();session.rotateLayer();
    expect(await navigation.select(layer,2)).toBe(false);expect(repo.workingCopy).not.toHaveBeenCalled();
    await navigation.commit();expect(navigation.project?.kind).toBe('draft');
    expect(await navigation.select(layer,2)).toBe(false);expect(navigation.project?.[layer]).toBe(favorite[layer]);
    expect(navigation.space).toBe('library');
  });
  it('opens saved variants in Library by default and can browse variants from another Mix',async()=>{
    const {navigation,repo,projects,variants,saved}=await setup();
    await navigation.open(variants[1]);expect(navigation.space).toBe('library');
    const rolls:[Roll,Roll]=['x','y'].map(id=>({id,name:id,capacity:1,assetIds:[`${id}0`],createdAt:''})) as [Roll,Roll];
    const other:Project={...variants[2],rollA:'x',rollB:'y',a:0,b:0};projects.set(other.id,other);
    const c=createComposition(pairId(other,'x0','y0'),[{assetId:'x0',assetRevision:1},{assetId:'y0',assetRevision:1}],[{x:400,y:300},{x:400,y:300}]);c.revision=1;c.frame.turns=3;saved.set(c.id,c);
    repo.roll.mockImplementation(async(id:string)=>rolls.find(r=>r.id===id)!);
    await navigation.step(1);expect(navigation.project).toEqual(other);expect(navigation.rolls).toEqual(rolls);
    expect(navigation.session.draft.frame.turns).toBe(3);expect(navigation.session.draft.layers.map(l=>l.placements[0].source.assetId)).toEqual(['x0','y0']);
  });
  it('swipes between saved states sharing the same sources, wrapping only inside Library',async()=>{
    const {navigation,session,repo}=await setup();
    expect(await navigation.step(1)).toBe(true);expect(navigation.project?.id).toBe('second');expect(session.draft.frame.turns).toBe(1);
    expect(await navigation.step(1)).toBe(true);expect(navigation.project?.id).toBe('third');
    expect(await navigation.step(1)).toBe(true);expect(navigation.project?.id).toBe('favorite');
    expect(await navigation.step(-1)).toBe(true);expect(navigation.project?.id).toBe('third');
    expect(repo.project.mock.calls.map(([id])=>id)).toEqual(['second','third','favorite','third']);expect(navigation.space).toBe('library');
  });
  it.each([-1,1] as const)('saves favorite edits to a hidden draft before the %s swipe and retains the variant anchor',async direction=>{
    const {navigation,session,saved,events,initial}=await setup();session.rotateLayer();const edits=copyComposition(session.draft);
    expect(await navigation.step(direction)).toBe(true);
    expect(events).toEqual(['working-copy','select']);expect(navigation.project?.id).toBe(direction===1?'second':'third');
    expect(saved.get(initial.id)).toEqual(initial);expect(saved.get(pairId({...navigation.project!,id:'draft'},'a0','b1'))?.layers).toEqual(edits.layers);
    expect(navigation.project?.kind).toBe('favorite');expect(navigation.space).toBe('library');
  });
  it('keeps Library context after an explicit edit commit before the next swipe',async()=>{
    const {navigation,session}=await setup();session.rotateLayer();await navigation.commit();
    expect(navigation.project?.id).toBe('draft');expect(navigation.space).toBe('library');
    await navigation.step(1);expect(navigation.project?.id).toBe('second');
  });
  it('restores the hidden draft and its saved-variant anchor on reload',async()=>{
    const {navigation,session,makeNavigation,initial,saved}=await setup();session.rotateLayer();await navigation.commit();const draft=navigation.project!;
    const reloaded=makeNavigation();await reloaded.navigation.open(draft);
    expect(reloaded.navigation.space).toBe('library');expect(reloaded.navigation.project?.id).toBe('draft');expect(reloaded.session.draft).toEqual(session.draft);
    await reloaded.navigation.step(1);expect(reloaded.navigation.project?.id).toBe('second');expect(saved.get(initial.id)).toEqual(initial);
  });
  it.each([-1,1] as const)('keeps an unliked current item onscreen and continues in the %s direction on swipe',async direction=>{
    const {navigation,remove}=await setup();await navigation.step(1);remove('second');
    expect(navigation.project?.id).toBe('second');
    await navigation.step(direction);expect(navigation.project?.id).toBe(direction===1?'third':'favorite');expect(navigation.space).toBe('library');
  });
  it('skips multiple removed variants and wraps within remaining memberships',async()=>{
    const {navigation,remove}=await setup();remove('favorite');remove('second');
    await navigation.step(1);expect(navigation.project?.id).toBe('third');
    await navigation.step(-1);expect(navigation.project?.id).toBe('third');
  });
  it('keeps the current working draft visible when its anchor is the only saved variant',async()=>{
    const {navigation,session,remove,repo,renderer,initial,saved}=await setup();remove('second');remove('third');session.rotateLayer();const edits=copyComposition(session.draft);renderer.loadPair.mockClear();
    await navigation.step(1);expect(navigation.project?.kind).toBe('draft');expect(session.draft.layers).toEqual(edits.layers);
    expect(saved.get(initial.id)).toEqual(initial);expect(renderer.loadPair).not.toHaveBeenCalled();expect(repo.project).not.toHaveBeenCalled();
    await navigation.step(-1);expect(navigation.project?.kind).toBe('draft');expect(session.draft.layers).toEqual(edits.layers);expect(navigation.space).toBe('library');
  });
  it('retains an empty Library image and saves edits without entering a Mix',async()=>{
    const {navigation,session,remove,repo}=await setup();for(const id of ['favorite','second','third'])remove(id);
    session.rotateLayer();await navigation.step(1);expect(navigation.project?.kind).toBe('draft');expect(navigation.space).toBe('library');expect(repo.project).not.toHaveBeenCalled();
    await navigation.step(-1);expect(navigation.project?.kind).toBe('draft');
  });
  it('keeps the favorite and working edits if saving fails',async()=>{
    const {navigation,session,repo,renderer,favorite}=await setup();session.rotateLayer();const edits=copyComposition(session.draft);renderer.loadPair.mockClear();
    repo.workingCopy.mockRejectedValueOnce(Error('Conflict'));
    await expect(navigation.step(1)).rejects.toThrow('Conflict');
    expect(navigation.project).toBe(favorite);expect(session.draft).toEqual(edits);expect(session.dirty).toBe(true);
    expect(renderer.loadPair).not.toHaveBeenCalled();expect(repo.project).not.toHaveBeenCalled();expect(navigation.busy).toBe(false);
  });
  it('reports context and working-copy changes to the UI',async()=>{
    const {navigation,session,origin}=await setup();const changed=vi.fn();navigation.onChange=changed;
    session.rotateLayer();await navigation.commit();expect(changed).toHaveBeenCalledOnce();
    await navigation.open(origin,'mixes');expect(navigation.space).toBe('mixes');expect(changed).toHaveBeenCalledTimes(2);
  });
});

describe('Mixes browsing space',()=>{
  it.each([-1,1] as const)('keeps paired-roll %s stepping independent of Library membership',async direction=>{
    const {navigation,origin,repo}=await setup();await navigation.open(origin,'mixes');repo.listFavorites.mockClear();
    await navigation.step(direction);expect(navigation.project).toMatchObject({id:'mix',a:direction===1?0:1,b:direction===1?0:1});
    expect(navigation.space).toBe('mixes');expect(repo.listFavorites).not.toHaveBeenCalled();
  });
  it('allows selecting another source in Mixes and rejects invalid frames before saving',async()=>{
    const {navigation,session,origin,repo}=await setup();await navigation.open(origin,'mixes');session.rotateLayer();
    expect(await navigation.select('a',3)).toBe(false);expect(repo.commit).not.toHaveBeenCalled();
    expect(await navigation.select('a',1)).toBe(true);expect(navigation.project).toMatchObject({id:'mix',a:1,b:2});expect(navigation.space).toBe('mixes');
  });
  it('clears the persisted Library context when a Mix is explicitly opened',async()=>{
    const {navigation,origin,makeNavigation,prefs}=await setup();await navigation.open(origin,'mixes');expect(prefs.get('browsing-context')).toBeNull();
    const reloaded=makeNavigation();await reloaded.navigation.open(origin);expect(reloaded.navigation.space).toBe('mixes');await reloaded.navigation.step(1);expect(reloaded.navigation.project?.id).toBe('mix');
  });
});

describe('immutable Library working copies',()=>{
  it('rebases undo and edit cancel when committing the first change to a saved variant',async()=>{
    const {navigation,session,repo,saved,initial}=await setup();
    session.beginEdit();session.rotateLayer();const changed=copyComposition(session.draft);
    await navigation.commit();
    expect(navigation.project?.kind).toBe('draft');expect(repo.commit).not.toHaveBeenCalled();
    expect(saved.get(initial.id)).toEqual(initial);expect(session.draft.id).not.toBe(initial.id);
    const draftId=session.draft.id;session.undo();
    expect(session.draft.id).toBe(draftId);expect(session.draft.layers).toEqual(initial.layers);expect(session.dirty).toBe(true);
    session.discardEdit();expect(session.draft.id).toBe(draftId);expect(session.draft.layers).toEqual(initial.layers);
    await navigation.commit();expect(repo.commit).toHaveBeenCalledWith(expect.objectContaining({id:draftId}),1);
    expect(saved.get(initial.id)).toEqual(initial);expect(changed.layers).not.toEqual(initial.layers);
  });
});
