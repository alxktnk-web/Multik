import { clamp, type ParameterId, type Tool, type XYId } from './types';
type Parameter={min:number;max:number;step:number;label:string;log?:boolean};
export const parameters: Record<ParameterId, Parameter> = {
  halo: { min: 0, max: 1, step: .05, label: 'Halo strength' },
  exposure: { min: -2, max: 2, step: .1, label: 'Exposure' },
  balance: { min: -2, max: 2, step: .1, label: 'Film balance' },
  contrast: { min: .5, max: 1.5, step: .05, label: 'Contrast' },
  haloRadius: { min: .2, max: 1.6, step: .05, label: 'Halo radius', log:true },
  haloThreshold: { min: .5, max: .95, step: .025, label: 'Highlight threshold' },
};
export const xyTools:Record<XYId,{x:ParameterId;y:ParameterId;label:string}>={
  lightXY:{x:'contrast',y:'exposure',label:'Up for exposure, right for contrast'},
  haloXY:{x:'haloRadius',y:'halo',label:'Up for halo strength, right for radius'},
};
export function toolParameters(tool:Tool):ParameterId[]{return tool.kind==='parameter'?[tool.parameter]:tool.kind==='xy'?[xyTools[tool.pair].y,xyTools[tool.pair].x]:[];}
export function parameterPosition(id:ParameterId,value:number):number{
  const p=parameters[id];return clamp(p.log?Math.log(value/p.min)/Math.log(p.max/p.min):(value-p.min)/(p.max-p.min),0,1);
}
export function dragParameter(id:ParameterId,initial:number,dy:number,height:number):number{
  if(dy===0)return initial;
  const p=parameters[id],position=clamp(parameterPosition(id,initial)-dy/Math.max(1,height*.7),0,1);
  return p.log?p.min*Math.pow(p.max/p.min,position):p.min+position*(p.max-p.min);
}
