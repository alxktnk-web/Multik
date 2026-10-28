import { describe,expect,it } from 'vitest';
import { Selection } from './import';
import { assertComposition,compositionStateKey,pairId,stableSeed } from './types';
import { createComposition } from '../model/types';
import { Session } from '../model/session';
const scene=()=>createComposition('c',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:400,y:300},{x:400,y:300}]);
describe('durable schema and pair identity',()=>{
  it('rejects corrupt numbers, source versions and unknown schemas',()=>{
    assertComposition(scene());
    for(const corrupt of [(c:ReturnType<typeof scene>)=>{c.frame.turns=7 as 0;},(c:ReturnType<typeof scene>)=>{c.layers[0].transform.xMm=NaN;},(c:ReturnType<typeof scene>)=>{c.effects.halo=2;},(c:ReturnType<typeof scene>)=>{c.layers[0].placements[0].source.assetRevision=8;}]){const c=scene();corrupt(c);expect(()=>assertComposition(c)).toThrow();}
  });
  it('ordered pair key includes project and rolls',()=>{
    const p={id:'p',rollA:'ra',rollB:'rb',a:0,b:0,updatedAt:''};
    expect(pairId(p,'a','b')).not.toBe(pairId(p,'b','a'));expect(pairId(p,'a','b')).not.toBe(pairId({...p,id:'other'},'a','b'));expect(stableSeed('a')).toBe(stableSeed('a'));
  });
  it('accepts absent or bounded layer scales and rejects invalid persisted values',()=>{
    assertComposition(scene());
    for(const scale of [.5,1,4]){const c=scene();c.layers[0].transform.scale=scale;assertComposition(c);}
    for(const scale of [0,.49,4.01,NaN,Infinity]){const c=scene();c.layers[0].transform.scale=scale;expect(()=>assertComposition(c)).toThrow();}
  });
  it('undo after a navigation-boundary commit uses current revision',()=>{
    const s=new Session(scene());s.begin();s.moveLayer(3,2);s.end();s.markSaved({...structuredClone(s.draft),revision:1});expect(s.dirty).toBe(false);s.undo();expect(s.draft.revision).toBe(1);expect(s.savedRevision).toBe(1);expect(s.dirty).toBe(true);
  });
});
describe('strict roll capacity',()=>{
  const files=(n:number)=>Array.from({length:n},(_,i)=>({name:`${i}.png`}) as File);
  it('keeps all overflow candidates, disables further adding and allows correction',()=>{
    const s=new Selection();s.setCapacity(12);s.add(files(9));s.add(files(5));expect(s.files.length).toBe(14);expect(s.overflow).toBe(true);expect(s.ready).toBe(false);expect(s.add(files(2))).toBe(false);
    s.remove(0);s.remove(0);expect(s.ready).toBe(true);expect(s.full).toBe(true);s.remove(0);expect(s.full).toBe(false);s.add(files(1));expect(s.ready).toBe(true);
  });
  it('defaults to free counts and enforces a 200-photo ceiling without dropping selections',()=>{
    const s=new Selection();expect(s.ready).toBe(false);expect(s.add(files(37))).toBe(true);expect(s.ready).toBe(true);
    expect(s.add(files(163))).toBe(true);expect(s.files).toHaveLength(200);expect(s.full).toBe(true);
    expect(s.add(files(1))).toBe(false);expect(s.files).toHaveLength(200);
    const fresh=new Selection();expect(fresh.add(files(201))).toBe(false);expect(fresh.files).toHaveLength(0);
  });
  it('capacity changes never silently discard originals',()=>{const s=new Selection();s.add(files(12));s.setCapacity(6);expect(s.files.length).toBe(12);expect(s.overflow).toBe(true);s.setCapacity(24);expect(s.full).toBe(false);});
});

describe('saved variant identity',()=>{
  it('ignores persistence identity and normalizes neutral optional fields',()=>{
    const original=scene(),copy=structuredClone(original);copy.id='other';copy.revision=12;
    copy.layers[0].transform.scale=1;copy.layers[0].levels={black:0,mid:.5,white:1};
    expect(compositionStateKey(copy)).toBe(compositionStateKey(original));
  });
  it.each(['frame','placement','transform','levels','effect','profile','seed'] as const)('captures %s edits as a distinct variant',part=>{
    const original=scene(),copy=structuredClone(original);
    if(part==='frame')copy.frame.turns=1;
    if(part==='placement')copy.layers[0].placements[0].turns=1;
    if(part==='transform')copy.layers[1].transform.scale=1.2;
    if(part==='levels')copy.layers[0].levels={black:.1,mid:.5,white:1};
    if(part==='effect')copy.effects.exposure=.2;
    if(part==='profile')copy.profile.version=5;
    if(part==='seed')copy.seed++;
    expect(compositionStateKey(copy)).not.toBe(compositionStateKey(original));
  });
});
