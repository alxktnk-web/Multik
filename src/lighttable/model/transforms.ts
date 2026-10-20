import type { Composition, Layer, Placement, Point, QuarterTurns, Viewport } from './types';

// Affine matrix in CSS/Canvas order. All geometry is independent of DOM and DPR.
export type Matrix = readonly [number, number, number, number, number, number];
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (x: number, y = x): Matrix => [x, 0, 0, y, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function inverse(m: Matrix): Matrix {
  const d = m[0]*m[3]-m[1]*m[2];
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) throw Error('Singular transform');
  const a=m[3]/d, b=-m[1]/d, c=-m[2]/d, e=m[0]/d;
  return [a,b,c,e,-a*m[4]-c*m[5],-b*m[4]-e*m[5]];
}
export const point = (m: Matrix, p: Point): Point => ({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
export const vector = (m: Matrix, p: Point): Point => ({x:m[0]*p.x+m[2]*p.y,y:m[1]*p.x+m[3]*p.y});
export function rotation(turn: QuarterTurns): Matrix {
  return [[1,0,0,1,0,0], [0,1,-1,0,0,0], [-1,0,0,-1,0,0], [0,-1,1,0,0,0]][turn] as unknown as Matrix;
}
export const around = (m: Matrix, x: number, y: number) => multiply(translate(x,y), multiply(m,translate(-x,-y)));
export function filmToScreen(frame: Composition['frame'], view: Viewport): Matrix {
  const odd = frame.turns % 2;
  const fit = Math.min(view.width/(odd ? frame.heightMm : frame.widthMm),view.height/(odd ? frame.widthMm : frame.heightMm));
  return multiply(translate(view.width/2+view.pan.x,view.height/2+view.pan.y), multiply(scale(fit*view.zoom),multiply(rotation(frame.turns),translate(-frame.widthMm/2,-frame.heightMm/2))));
}
export function sourceToFilm(frame: Composition['frame'], layer: Layer, placement: Placement): Matrix {
  const r=placement.rect, t=layer.transform;
  return multiply(translate(t.xMm,t.yMm),multiply(around(multiply(rotation(t.turns),scale(t.scale??1)),frame.widthMm/2,frame.heightMm/2),multiply(translate(r.x,r.y),multiply(scale(r.width,r.height),around(rotation(placement.turns),0.5,0.5)))));
}
export const glMatrix = (m: Matrix) => new Float32Array([m[0],m[1],0,m[2],m[3],0,m[4],m[5],1]);
