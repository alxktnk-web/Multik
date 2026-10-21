import { clamp, neutralLevels, type Levels, type LevelPoint, type Layer } from './types';

export const levelPoints:LevelPoint[]=['black','mid','white'];
export const getLevels=(layer:Layer):Readonly<Levels>=>layer.levels??neutralLevels;
// Moving an endpoint preserves the relative midpoint (gamma). Endpoints never cross.
export function moveLevel(initial:Readonly<Levels>,point:LevelPoint,value:number):Levels{
  const l={...initial},fraction=(l.mid-l.black)/(l.white-l.black);
  if(point==='black')l.black=clamp(value,0,l.white-.02);
  if(point==='white')l.white=clamp(value,l.black+.02,1);
  l.mid=point==='mid'?clamp(value,l.black+(l.white-l.black)*.05,l.white-(l.white-l.black)*.05):l.black+fraction*(l.white-l.black);
  return l;
}
export function levelExponent(l:Readonly<Levels>){return Math.log(.5)/Math.log((l.mid-l.black)/(l.white-l.black));}

export function setLevels(layer:Layer,l:Levels){
  if(l.black===0&&l.mid===.5&&l.white===1)delete layer.levels;else layer.levels=l;
}
