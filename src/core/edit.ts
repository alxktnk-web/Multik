// Правка готового кадра (панель Edit): переопределения поверх рецепта проявки.
// Рецепт и исходная проявка не меняются; правка хранится отдельно и пересчитывается из исходных снимков.

import { FRAME_W, PITCH, frameA } from './geometry';
import type { Leak, LeakKind, Recipe } from './recipe';

export type Channel = 'l' | 'r' | 'g' | 'b';
/** Точка кривой: вход и выход 0…1 в видимой (sRGB) шкале готового позитива. */
export type CurvePoint = [number, number];

export interface FrameEdit {
  /** баланс проходов, ступени −2…+2 (A светлее при +) */
  balance: number;
  /** экспозиция поверх экспозиции проявки, ступени −2…+2 */
  exposure: number;
  /** слияние белого 0…10 */
  whites: number;
  /** общий множитель силы засветок кадра 0…2 */
  leakGain: number;
  /** сдвиг второго прохода, мм (−36…+36) */
  shiftMm: number;
  flip: boolean;
  /** ореол и «дыхание» светов, множители 0…2 */
  halation: number;
  glow: number;
  /** засветки, задевающие кадр: из рецепта, изменённые или добавленные */
  leaks: Leak[];
  curves: Record<Channel, CurvePoint[]>;
  /** −100…+100 */
  black: number;
  contrast: number;
  saturation: number;
  warmth: number;
  /** зерно 0…2, пыль 0…1 (доля пылинок рецепта) */
  grain: number;
  dust: number;
}

export const IDENTITY_CURVE: CurvePoint[] = [
  [0, 0],
  [1, 1],
];

/** Засветки рецепта, свет которых доходит до кадра i (свои и соседей, севшие на перемычку). */
export function leaksTouching(recipe: Recipe, i: number): Leak[] {
  const f = frameA(i);
  return recipe.leaks.filter((l) => l.frame === i || (Math.abs(l.frame - i) === 1 && l.x > f.x - 3 && l.x < f.x + FRAME_W + 3));
}

/** Правка «без изменений»: значения, с которыми кадр был проявлен. */
export function baseEdit(recipe: Recipe, i: number, whites: number): FrameEdit {
  return {
    balance: 0,
    exposure: 0,
    whites,
    leakGain: 1,
    shiftMm: Math.round(recipe.shiftMm * 10) / 10,
    flip: recipe.settings.swapRotate,
    halation: 1,
    glow: 1,
    leaks: leaksTouching(recipe, i).map((l) => ({ ...l })),
    curves: { l: [...IDENTITY_CURVE], r: [...IDENTITY_CURVE], g: [...IDENTITY_CURVE], b: [...IDENTITY_CURVE] },
    black: 0,
    contrast: 0,
    saturation: 0,
    warmth: 0,
    grain: 1,
    dust: 1,
  };
}

export const EDIT_SECTIONS = {
  basic: ['balance', 'exposure', 'whites', 'leakGain'],
  overlay: ['balance', 'shiftMm', 'flip', 'exposure', 'whites', 'halation', 'glow'],
  leaks: ['leaks', 'leakGain'],
  tone: ['curves', 'black', 'contrast', 'saturation', 'warmth'],
  texture: ['grain', 'dust'],
} as const satisfies Record<string, (keyof FrameEdit)[]>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Сколько параметров отличается от проявки (для подписи «N edits»). */
export function countChanges(edit: FrameEdit, base: FrameEdit): number {
  return (Object.keys(base) as (keyof FrameEdit)[]).filter((k) => !same(edit[k], base[k])).length;
}

export function resetKeys(edit: FrameEdit, base: FrameEdit, keys: readonly (keyof FrameEdit)[]): FrameEdit {
  const next = structuredClone(edit);
  for (const k of keys) (next as unknown as Record<string, unknown>)[k] = structuredClone(base[k]);
  return next;
}

/** Рецепт с правками кадра: сдвиг и поворот второго прохода, засветки только из правки. */
export function editedRecipe(recipe: Recipe, i: number, edit: FrameEdit): Recipe {
  const touching = new Set(leaksTouching(recipe, i));
  const others = recipe.leaks.filter((l) => !touching.has(l));
  const dust = recipe.dust.map((d, k) => (k === i ? d.slice(0, Math.round(d.length * edit.dust)) : d));
  const hairs = recipe.hairs.map((h, k) => (k === i && edit.dust < 0.5 ? [] : h));
  return {
    ...recipe,
    shiftMm: Math.max(-FRAME_W, Math.min(FRAME_W, edit.shiftMm)),
    settings: { ...recipe.settings, swapRotate: edit.flip },
    leaks: [...others, ...edit.leaks.filter((l) => !l.off).map((l) => ({ ...l, strength: l.strength * edit.leakGain }))],
    dust,
    hairs,
  };
}

/** Край кадра, от которого входит засветка: для подписи и переключателя Left/Right. */
export function leakEdge(leak: Leak, i: number): 'left' | 'right' {
  return leak.x < i * PITCH + FRAME_W / 2 ? 'left' : 'right';
}

/** Перенос засветки к другому краю кадра i (засветка уходит внутрь кадра). */
export function moveLeak(leak: Leak, i: number, edge: 'left' | 'right'): Leak {
  const f = frameA(i);
  const inset = Math.min(1.5, Math.abs(leak.x - (leakEdge(leak, i) === 'left' ? f.x : f.x + FRAME_W)));
  return edge === 'left' ? { ...leak, frame: i, x: f.x - inset, dir: 1 } : { ...leak, frame: i, x: f.x + FRAME_W + inset, dir: -1 };
}

/**
 * Монотонная кубическая интерполяция (Фриче–Карлсон): кривая проходит через точки и не даёт
 * «перелётов» — тон не разворачивается. Возвращает 256 значений 0…1.
 */
export function curveTable(points: CurvePoint[]): Float32Array {
  const pts = [...points].sort((p, q) => p[0] - q[0]);
  const out = new Float32Array(256);
  const n = pts.length;
  if (n < 2) {
    for (let k = 0; k < 256; k++) out[k] = k / 255;
    return out;
  }
  const d: number[] = [];
  for (let k = 0; k < n - 1; k++) d.push((pts[k + 1][1] - pts[k][1]) / Math.max(1e-6, pts[k + 1][0] - pts[k][0]));
  const m: number[] = [d[0]];
  for (let k = 1; k < n - 1; k++) m.push(d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2);
  m.push(d[n - 2]);
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[k] = t * a * d[k];
      m[k + 1] = t * b * d[k];
    }
  }
  let seg = 0;
  for (let k = 0; k < 256; k++) {
    const x = k / 255;
    if (x <= pts[0][0]) {
      out[k] = pts[0][1];
      continue;
    }
    if (x >= pts[n - 1][0]) {
      out[k] = pts[n - 1][1];
      continue;
    }
    while (seg < n - 2 && x > pts[seg + 1][0]) seg++;
    const [x0, y0] = pts[seg];
    const [x1, y1] = pts[seg + 1];
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    out[k] =
      (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[seg + 1];
    out[k] = Math.max(0, Math.min(1, out[k]));
  }
  return out;
}

/** Таблица для шейдера: R, G, B — поканальные кривые, A — яркостная. 256 × 4 байта. */
export function curveLut(curves: Record<Channel, CurvePoint[]>): Uint8Array {
  const t = { r: curveTable(curves.r), g: curveTable(curves.g), b: curveTable(curves.b), l: curveTable(curves.l) };
  const lut = new Uint8Array(256 * 4);
  for (let k = 0; k < 256; k++) {
    lut[k * 4] = Math.round(t.r[k] * 255);
    lut[k * 4 + 1] = Math.round(t.g[k] * 255);
    lut[k * 4 + 2] = Math.round(t.b[k] * 255);
    lut[k * 4 + 3] = Math.round(t.l[k] * 255);
  }
  return lut;
}

export function isIdentity(curves: Record<Channel, CurvePoint[]>): boolean {
  return (Object.values(curves) as CurvePoint[][]).every((c) => same(c, IDENTITY_CURVE));
}

export const LEAK_KIND_NAMES: Record<LeakKind, string> = { glow: 'Glow', stripe: 'Stripe', burn: 'Burnt edge' };
