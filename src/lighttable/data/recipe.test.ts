import { describe,expect,it } from 'vitest';
import { createRecipe } from './recipe';
import { pairId,type Project,type Roll } from './types';
const roll=(id:string,n:number):Roll=>({id,name:id,capacity:n,assetIds:Array.from({length:n},(_,i)=>`${id}${i}`),createdAt:''});
const seeded=()=>{let seed=42;return ()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);};
describe('persisted mix recipe',()=>{
  it.each([[6,6],[6,8],[12,36],[24,36]])('balances %i and %i frames', (a,b)=>{
    const left=roll('a',a),right=roll('b',b),recipe=createRecipe(left,right,seeded()),n=Math.max(a,b);
    expect(recipe.slots).toHaveLength(n);expect(new Set(recipe.slots.map(s=>s.id)).size).toBe(n);
    for(const [ids,key] of [[left.assetIds,'assetAId'],[right.assetIds,'assetBId']] as const){
      const counts=ids.map(id=>recipe.slots.filter(s=>s[key]===id).length);
      expect(Math.min(...counts)).toBe(Math.floor(n/ids.length));expect(Math.max(...counts)).toBe(Math.ceil(n/ids.length));
    }
    expect(recipe.slots.map(({assetAId,assetBId})=>[assetAId,assetBId])).toEqual(createRecipe(left,right,seeded()).slots.map(({assetAId,assetBId})=>[assetAId,assetBId]));
  });
  it('avoids self pairs for ordinary self mixes',()=>{const r=roll('a',12);expect(createRecipe(r,r,seeded()).slots.every(s=>s.assetAId!==s.assetBId)).toBe(true);});
  it('isolates slots and keeps legacy IDs unchanged',()=>{
    const recipe=createRecipe(roll('a',6),roll('b',6),seeded());const p:Project={id:'p',rollA:'a',rollB:'b',a:0,b:0,updatedAt:'',slot:0,recipe};
    expect(pairId(p,'a0','b0')).not.toBe(pairId({...p,slot:1},'a0','b0'));
    expect(pairId({...p,recipe:undefined},'a0','b0')).toBe(JSON.stringify(['pair','p','a','a0',1,'b','b0',1]));
  });
});
