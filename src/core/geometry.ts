// Геометрия плёнки в миллиметрах. Ось x — вдоль плёнки, y — сверху вниз.

export const FRAME_W = 36;
export const FRAME_H = 27;
export const GAP = 2;
export const PITCH = FRAME_W + GAP;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  rect: Rect;
  /** индекс снимка в пачке */
  photo: number;
  /** 0 — без поворота, 1 — 90° против часовой, 2 — 180°, 3 — 270° */
  turn: number;
  /** множитель света (разброс экспозиции) */
  gain: number;
}

export function frameA(i: number): Rect {
  return { x: i * PITCH, y: 0, w: FRAME_W, h: FRAME_H };
}

export function expand(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function stripLength(n: number): number {
  return n * PITCH - GAP;
}
