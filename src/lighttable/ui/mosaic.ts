export type MosaicCell={assetId:string;x:number;y:number;width:number;height:number;crop:{x:number;y:number}};
export type MosaicRecipe={version:1;cells:MosaicCell[]};
type Rect={x:number;y:number;width:number;height:number};
const shuffle=<T>(values:T[],random:()=>number)=>{const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
/** Random recursive cuts; the first rectangle is deliberately dominant. */
export function makeMosaic(assetIds:string[],random:()=>number=Math.random):MosaicRecipe{
  const ids=shuffle(assetIds,random).slice(0,6);if(!ids.length)throw Error('Roll has no photos');
  if(ids.length===1)return {version:1,cells:[{assetId:ids[0],x:0,y:0,width:1,height:1,crop:{x:.5,y:.5}}]};
  let rectangles:Rect[]=[];
  for(let attempt=0;attempt<100;attempt++){
    const vertical=random()<.5,reverse=random()<.5,share=.48+random()*.08;
    const big:Rect=vertical?{x:reverse?1-share:0,y:0,width:share,height:1}:{x:0,y:reverse?1-share:0,width:1,height:share};
    const rest:Rect=vertical?{x:reverse?0:share,y:0,width:1-share,height:1}:{x:0,y:reverse?0:share,width:1,height:1-share};
    const pieces=[rest];
    while(pieces.length<ids.length-1){
      const choices=pieces.flatMap((r,i)=>[...(r.width>=.38?[{i,axis:'x' as const}]:[]),...(r.height>=.38?[{i,axis:'y' as const}]:[])]);
      if(!choices.length)break;
      const {i,axis}=choices[Math.floor(random()*choices.length)],r=pieces[i],fraction=.4+random()*.2;
      const one={...r},two={...r};if(axis==='x'){one.width=r.width*fraction;two.x=r.x+one.width;two.width=r.width-one.width;}else{one.height=r.height*fraction;two.y=r.y+one.height;two.height=r.height-one.height;}
      pieces.splice(i,1,one,two);
    }
    if(pieces.length===ids.length-1&&pieces.every(r=>r.width>=.17&&r.height>=.17)){rectangles=[big,...pieces];break;}
  }
  if(!rectangles.length){const n=ids.length-1;rectangles=[{x:0,y:0,width:.5,height:1}];for(let i=0;i<n;i++)rectangles.push({x:.5,y:i/n,width:.5,height:1/n});}
  return {version:1,cells:rectangles.map((r,i)=>({...r,assetId:ids[i],crop:{x:.5,y:.5}}))};
}
export function validMosaic(value:unknown,ids:string[]):value is MosaicRecipe{
  const r=value as MosaicRecipe;if(!r||r.version!==1||!Array.isArray(r.cells)||r.cells.length!==Math.min(6,ids.length)||new Set(r.cells.map(c=>c?.assetId)).size!==r.cells.length)return false;
  if(!r.cells.every(c=>c&&ids.includes(c.assetId)&&[c.x,c.y,c.width,c.height,c.crop?.x,c.crop?.y].every(Number.isFinite)&&c.width>0&&c.height>0&&c.x>=0&&c.y>=0&&c.x+c.width<=1.000001&&c.y+c.height<=1.000001&&c.crop.x>=0&&c.crop.x<=1&&c.crop.y>=0&&c.crop.y<=1))return false;
  if(Math.abs(r.cells.reduce((sum,c)=>sum+c.width*c.height,0)-1)>1e-6)return false;
  return r.cells.every((a,i)=>r.cells.slice(i+1).every(b=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))<1e-9));
}
