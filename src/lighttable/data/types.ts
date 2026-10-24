import { parameters } from '../model/parameters';
import { copyComposition, type Composition } from '../model/types';
export const capacities=[6,12,24,36] as const;
export type Capacity=typeof capacities[number];
export type Asset={id:string;revision:1;blob:Blob;preview:Blob;thumb:Blob;width:number;height:number;owner:string;origin?:string};
export type Roll={id:string;name:string;capacity:number;assetIds:string[];createdAt:string;origin?:string};
export type ImportJob={id:string;rollId:string;name:string;capacity:number;assetIds:string[];origin?:string};
export type Project={id:string;rollA:string;rollB:string;a:number;b:number;updatedAt:string;kind?:'favorite'|'draft';favoriteSourceId?:string};
// Membership can be undone without deleting the immutable snapshot or its shared assets.
export type Favorite={id:string;projectId:string;compositionId:string;sourceCompositionId:string;createdAt:string;thumb:Blob;stateKey?:string};
export function compositionStateKey(value:Composition):string {
  const {id:_id,revision:_revision,...state}=copyComposition(value);
  // Canonical keys make identity independent of object property insertion order.
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
  for(const layer of state.layers){layer.transform.scale??=1;layer.levels??={black:0,mid:.5,white:1};}
  return JSON.stringify(canonical(state));
}
export class ConflictError extends Error {constructor(){super('This frame changed in another tab. Your edits are still here. Close the other tab or save a separate copy.');}}
export function assertComposition(value:unknown):asserts value is Composition {
  if(!value||typeof value!=='object')throw Error('Composition data is damaged');
  const c=value as Composition;
  const finite=(x:unknown,min:number,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
  const quarter=(x:unknown)=>finite(x,0,3)&&Number.isInteger(x);
  const id=(x:unknown)=>typeof x==='string'&&x.length>0&&x.length<4096;
  if(c.schema!==1||c.mode!=='manual-pair'||!id(c.id)||!Number.isInteger(c.revision)||c.revision<0||c.profile?.id!=='lighttable-clean-v1'||![1,2,3,4,5].includes(c.profile.version)||c.frame?.widthMm!==36||c.frame.heightMm!==27||!quarter(c.frame.turns)||!finite(c.seed,0,0xffffffff)||!Array.isArray(c.layers)||c.layers.length!==2||!finite(c.effects?.halo,0,1)||!finite(c.effects.exposure,-2,2)||!finite(c.effects.balance,-2,2))throw Error('Unsupported or damaged composition');
  for(const key of ['contrast','haloRadius','haloThreshold'] as const){const p=parameters[key],v=c.effects[key];if(v!==undefined&&!finite(v,p.min,p.max))throw Error('Effect data is damaged');}
  for(const [i,layer] of c.layers.entries()){
    if(layer.id!==(i?'b':'a')||!Array.isArray(layer.placements)||layer.placements.length!==1||!finite(layer.transform?.xMm,-36,36)||!finite(layer.transform.yMm,-27,27)||!quarter(layer.transform.turns)||(layer.transform.scale!==undefined&&!finite(layer.transform.scale,.5,4)))throw Error('Layer data is damaged');
    const l=layer.levels;
    if(l!==undefined&&(!l||typeof l!=='object'||!finite(l.black,0,.98)||!finite(l.mid,0,1)||!finite(l.white,.02,1)||l.mid-l.black<.0009||l.white-l.mid<.0009))throw Error('Levels data is damaged');
    const p=layer.placements[0],r=p.rect;
    if(!id(p.source?.assetId)||p.source.assetRevision!==1||!quarter(p.turns)||!finite(p.gain,0,4)||!finite(r?.x,-36,36)||!finite(r.y,-27,27)||!finite(r.width,.0001,36)||!finite(r.height,.0001,27))throw Error('Layer source is damaged');
  }
}
export function validateRoll(value:unknown):Roll {
  const r=value as Roll;
  if(!r||typeof r.id!=='string'||typeof r.name!=='string'||!Number.isInteger(r.capacity)||r.capacity<1||r.capacity>1000||!Array.isArray(r.assetIds)||r.assetIds.length!==r.capacity||new Set(r.assetIds).size!==r.capacity||r.assetIds.some(id=>typeof id!=='string')||typeof r.createdAt!=='string')throw Error('Roll data is damaged');
  return r;
}
export const pairId=(project:Project,a:string,b:string)=>JSON.stringify(['pair',project.id,project.rollA,a,1,project.rollB,b,1]);
export function stableSeed(id:string){let hash=2166136261;for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);return hash>>>0;}
