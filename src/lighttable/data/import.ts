import { decodeSource } from '../render/assets';
import type { Repository } from './repository';
import { capacities, type Asset, type Capacity, type ImportJob } from './types';
export class Selection {
  capacity:Capacity=12;
  files:File[]=[];
  add(files:File[]){if(this.files.length>=this.capacity)return false;this.files.push(...files);return true;}
  remove(index:number){this.files.splice(index,1);}
  setCapacity(value:number){if(!capacities.includes(value as Capacity))throw Error('Invalid frame limit');this.capacity=value as Capacity;}
  get full(){return this.files.length>=this.capacity;}
  get overflow(){return this.files.length>this.capacity;}
  get ready(){return this.files.length===this.capacity;}
}
const encode=(canvas:HTMLCanvasElement,quality:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare photo')),'image/jpeg',quality));
export async function prepareAsset(blob:Blob,id:string,owner:string,origin?:string):Promise<Asset>{
  const decoded=await decodeSource({id,blob});
  const c=document.createElement('canvas');
  try{
    c.width=decoded.width;c.height=decoded.height;const ctx=c.getContext('2d');if(!ctx)throw Error('Image preparation unavailable');ctx.drawImage(decoded.image,0,0);
    const preview=await encode(c,.93),scale=Math.min(1,160/Math.max(decoded.width,decoded.height));
    c.width=Math.max(1,Math.round(decoded.width*scale));c.height=Math.max(1,Math.round(decoded.height*scale));ctx.drawImage(decoded.image,0,0,c.width,c.height);
    const thumb=await encode(c,.82);return {id,revision:1,owner,origin,blob,preview,thumb,width:decoded.width,height:decoded.height};
  }finally{decoded.close();c.width=c.height=1;}
}
export function suggestedRollName(date=new Date()){
  return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short'}).format(date)+' · '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
export async function importFiles(repo:Repository,selection:Selection,name:string,progress:(n:number)=>void,signal?:AbortSignal){
  if(!selection.ready)throw Error(`Choose exactly ${selection.capacity} photos`);
  const files=[...selection.files],job=await repo.beginImport(name||suggestedRollName(),selection.capacity);
  try{
    for(let i=0;i<files.length;i++){
      signal?.throwIfAborted();const asset=await prepareAsset(files[i],job.assetIds[i],job.id);signal?.throwIfAborted();await repo.stageAsset(job,i,asset);progress(i+1);
    }
    signal?.throwIfAborted();return await repo.finishImport(job);
  }catch(e){await repo.cancelImport(job).catch(()=>{});throw e;}
}
export async function resumeAdoption(repo:Repository,job:ImportJob,source:(i:number)=>Promise<Blob>,progress:(n:number)=>void,signal?:AbortSignal){
  for(let i=0;i<job.capacity;i++){
    signal?.throwIfAborted();
    const blob=await source(i),existing=await repo.pendingAsset(job.assetIds[i]);
    if(existing){if(existing.owner!==job.id||existing.blob.size!==blob.size||existing.blob.type!==blob.type)throw Error('Original photo changed');}
    else{const asset=await prepareAsset(blob,job.assetIds[i],job.id,`${job.origin}:${i}`);signal?.throwIfAborted();await repo.stageAsset(job,i,asset);}
    progress(i+1);
  }
  signal?.throwIfAborted();return repo.finishImport(job);
}
