import type { MixRecipe, Roll } from './types';

// Fisher–Yates uses a separate random stream from presentation/cover recipes.
export function createRecipe(a:Roll,b:Roll,random:()=>number=Math.random):MixRecipe {
  const n=Math.max(a.assetIds.length,b.assetIds.length);
  const shuffle=<T>(items:T[])=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
  const balanced=(ids:string[])=>{
    const result=Array.from({length:Math.floor(n/ids.length)},()=>ids).flat();
    result.push(...shuffle([...ids]).slice(0,n%ids.length));
    return shuffle(result);
  };
  const left=balanced(a.assetIds),right=balanced(b.assetIds);
  // A bounded swap avoids self-pairs where possible without altering counts.
  if(a.id===b.id&&n>1)for(let i=0;i<n;i++)if(left[i]===right[i]){
    const j=right.findIndex((value,k)=>k!==i&&value!==left[i]&&right[i]!==left[k]);
    if(j>=0)[right[i],right[j]]=[right[j],right[i]];
  }
  return {version:1,slots:left.map((assetAId,i)=>({id:crypto.randomUUID(),assetAId,assetBId:right[i]}))};
}
