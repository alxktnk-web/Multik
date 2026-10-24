import { describe,expect,it,vi } from 'vitest';
import { Navigation } from './navigation';
import { Session } from './session';
import { createComposition,copyComposition } from './types';
import { pairId,type Asset,type Project,type Roll } from '../data/types';
import type { Repository } from '../data/repository';
import type { Renderer } from '../render/renderer';

function setup(){
  const rolls:[Roll,Roll]=['a','b'].map(id=>({id,name:id,capacity:3,assetIds:[0,1,2].map(i=>`${id}${i}`),createdAt:''})) as [Roll,Roll];
  const origin:Project={id:'mix',rollA:'a',rollB:'b',a:2,b:2,updatedAt:''};
  const favorite:Project={...origin,id:'favorite',kind:'favorite',a:0,b:1,favoriteSourceId:pairId(origin,'a0','b1')};
  const initial=createComposition(pairId(favorite,'a0','b1'),[{assetId:'a0',assetRevision:1},{assetId:'b1',assetRevision:1}],[{x:400,y:300},{x:400,y:300}]);
  initial.revision=1;
  const saved=new Map([[initial.id,copyComposition(initial)]]),events:string[]=[];
  const repo={
    project:vi.fn(async()=>origin),
    asset:vi.fn(async(id:string)=>({id,revision:1,preview:new Blob(),width:400,height:300}) as Asset),
    ensureComposition:vi.fn(async(c:ReturnType<typeof createComposition>)=>copyComposition(saved.get(c.id)??c)),
    workingCopy:vi.fn(async(c:ReturnType<typeof createComposition>,project:Project)=>{events.push('working-copy');const draft:Project={...project,id:'draft',kind:'draft'},next={...copyComposition(c),id:pairId(draft,'a0','b1'),revision:1};saved.set(next.id,next);return {project:draft,composition:next};}),
    commit:vi.fn(async(c:ReturnType<typeof createComposition>,revision:number)=>{events.push('commit');const next={...copyComposition(c),revision:revision+1};saved.set(c.id,next);return next;}),
    select:vi.fn(async(p:Project)=>{events.push('select');expect(p.kind).toBeUndefined();}),
  };
  const session=new Session(initial);
  const renderer={loadPair:vi.fn(async(_sources:unknown,_reset:unknown,c:ReturnType<typeof createComposition>,select:()=>Promise<void>)=>{await select();session.replace(c);return true;})};
  const navigation=new Navigation(repo as unknown as Repository,session,renderer as unknown as Renderer);
  navigation.project=favorite;navigation.rolls=rolls;
  return {navigation,session,repo,renderer,saved,events,favorite,origin,initial};
}

describe('favorite rail navigation',()=>{
  it('selects the current source layer while retaining its editing tool and pair',async()=>{
    const {navigation,session,repo,favorite}=setup();session.tool={kind:'levels',point:'mid'};
    expect(await navigation.select('a',0)).toBe(true);
    expect(session.activeLayer).toBe('a');expect(session.tool).toEqual({kind:'levels',point:'mid'});
    expect(navigation.project).toBe(favorite);expect(repo.commit).not.toHaveBeenCalled();expect(repo.project).not.toHaveBeenCalled();
  });
  it.each(['a','b'] as const)('commits favorite edits before browsing the %s roll in its original mix',async layer=>{
    const {navigation,session,repo,saved,events,favorite,origin,initial}=setup();
    session.rotateLayer();const edits=copyComposition(session.draft);
    expect(await navigation.select(layer,2)).toBe(true);
    expect(events).toEqual(['working-copy','select']);expect(repo.project).toHaveBeenCalledWith(origin.id);
    expect(navigation.project).toMatchObject({id:origin.id,a:layer==='a'?2:0,b:layer==='b'?2:1});
    expect(navigation.project?.kind).toBeUndefined();expect(favorite).toMatchObject({a:0,b:1,kind:'favorite'});
    expect(saved.get(initial.id)).toEqual(initial);expect(saved.get(pairId({...favorite,id:'draft'},'a0','b1'))).toEqual({...edits,id:pairId({...favorite,id:'draft'},'a0','b1'),revision:1});
    expect(session.draft.layers.map(l=>l.placements[0].source.assetId)).toEqual(layer==='a'?['a2','b1']:['a0','b2']);
    expect(session.draft.id).not.toBe(initial.id);expect(session.activeLayer).toBe(layer);expect(navigation.busy).toBe(false);
  });
  it('keeps the favorite and its working edits if the commit fails',async()=>{
    const {navigation,session,repo,renderer,favorite}=setup();session.rotateLayer();const edits=copyComposition(session.draft);
    repo.workingCopy.mockRejectedValueOnce(Error('Conflict'));
    await expect(navigation.select('a',2)).rejects.toThrow('Conflict');
    expect(navigation.project).toBe(favorite);expect(session.draft).toEqual(edits);expect(session.dirty).toBe(true);
    expect(renderer.loadPair).not.toHaveBeenCalled();expect(repo.project).not.toHaveBeenCalled();expect(navigation.busy).toBe(false);
  });
  it.each([-1,1] as const)('browses both rolls from a favorite with a %s step',async direction=>{
    const {navigation,session,saved,events,favorite,origin,initial}=setup();session.rotateLayer();const edits=copyComposition(session.draft);
    expect(await navigation.step(direction)).toBe(true);
    expect(events).toEqual(['working-copy','select']);
    expect(navigation.project).toMatchObject({id:origin.id,a:direction===1?1:2,b:direction===1?2:0});
    expect(navigation.project?.kind).toBeUndefined();expect(favorite).toMatchObject({a:0,b:1,kind:'favorite'});
    expect(saved.get(initial.id)).toEqual(initial);expect(saved.get(pairId({...favorite,id:'draft'},'a0','b1'))).toEqual({...edits,id:pairId({...favorite,id:'draft'},'a0','b1'),revision:1});expect(session.draft.id).not.toBe(initial.id);
  });
  it('rejects an unrelated originating mix without changing the favorite sources',async()=>{
    const {navigation,repo,renderer,favorite}=setup();repo.project.mockResolvedValueOnce({...favorite,id:'mix',kind:undefined,rollA:'unrelated'});
    await expect(navigation.select('a',2)).rejects.toThrow('Favorite source unavailable');
    expect(navigation.project).toBe(favorite);expect(renderer.loadPair).not.toHaveBeenCalled();expect(navigation.busy).toBe(false);
  });
  it('does not cross a save boundary for an invalid frame',async()=>{
    const {navigation,session,repo}=setup();session.rotateLayer();
    expect(await navigation.select('a',3)).toBe(false);expect(repo.commit).not.toHaveBeenCalled();
  });
});

describe('immutable Library working copies',()=>{
  it('rebases undo and edit cancel when committing the first change to a saved variant',async()=>{
    const {navigation,session,repo,saved,initial}=setup();
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
