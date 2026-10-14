// Правка готового кадра — «пульт» (макет v2, утверждён Александром 14.10.2026).
// Три канала: Bottom — снимок первой плёнки, Top — снимок второй плёнки, Mix — общее для пары.
// Правка хранится поверх рецепта; рецепт и исходная проявка не меняются, кадр пересчитывается из исходных снимков.

import { FRAME_W, PITCH, frameA } from './geometry';
import type { Leak, LeakKind, Recipe } from './recipe';

/** Настройки одного снимка, до наложения. Всё −1…+1, кроме glow 0…2, soft 0…1. */
export interface PhotoEdit {
  /** экспозиция, ступени −2…+2 */
  light: number;
  contrast: number;
  black: number;
  whites: number;
  /** насыщенность (крутилка Colour) */
  color: number;
  warmth: number;
  /** доля в ореоле 0…2 */
  glow: number;
  /** мягкость объектива 0…1 */
  soft: number;
  /** поворот снимка, четверти оборота 0…3 (кнопка 90°) */
  turns: number;
}

export interface MixEdit {
  /** слияние белого 0…10 */
  whites: number;
  /** сила ореола 0…2 */
  halo: number;
  /** сила засветок 0…2 (0 — без засветок) */
  leaks: number;
  /** общий контраст и чёрное после наложения, −1…+1 */
  contrast: number;
  black: number;
  /** зерно 0…2, пыль 0…1, мягкое свечение светов 0…2 */
  grain: number;
  dust: number;
  glow: number;
  /** сдвиг верхней плёнки, мм (−36…+36) */
  shiftMm: number;
}

export interface FrameEdit {
  v: 2;
  bottom: PhotoEdit;
  top: PhotoEdit;
  mix: MixEdit;
  /** засветки, задевающие кадр: из рецепта или новые (кнопка с кубиком) */
  leaks: Leak[];
}

export type Channel = 'bottom' | 'top' | 'mix';

const photo = (turns: number): PhotoEdit => ({ light: 0, contrast: 0, black: 0, whites: 0, color: 0, warmth: 0, glow: 1, soft: 0, turns });

/** Засветки рецепта, свет которых доходит до кадра i (свои и соседей, севшие на перемычку). */
export function leaksTouching(recipe: Recipe, i: number): Leak[] {
  const f = frameA(i);
  return recipe.leaks.filter((l) => l.frame === i || (Math.abs(l.frame - i) === 1 && l.x > f.x - 3 && l.x < f.x + FRAME_W + 3));
}

/** Правка «без изменений»: значения, с которыми кадр был проявлен. */
export function baseEdit(recipe: Recipe, i: number, whites: number): FrameEdit {
  return {
    v: 2,
    bottom: photo(0),
    top: photo(recipe.settings.swapRotate ? 2 : 0),
    mix: { whites, halo: 1, leaks: 1, contrast: 0, black: 0, grain: 1, dust: 1, glow: 1, shiftMm: Math.round(recipe.shiftMm * 10) / 10 },
    leaks: leaksTouching(recipe, i).map((l) => ({ ...l })),
  };
}

/** Сохранённая правка, если она той же версии; правки первой панели (v1) не переносятся. */
export function storedEdit(stored: unknown): FrameEdit | null {
  if (!stored || typeof stored !== 'object' || (stored as FrameEdit).v !== 2) return null;
  const e = structuredClone(stored) as FrameEdit;
  // первые правки пульта хранили поворот как «180° да/нет»
  for (const p of [e.bottom, e.top] as (PhotoEdit & { rotate?: boolean })[]) {
    if (typeof p.turns !== 'number') p.turns = p.rotate ? 2 : 0;
    delete p.rotate;
  }
  return e;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Сколько параметров отличается от проявки. */
export function countChanges(edit: FrameEdit, base: FrameEdit): number {
  let n = 0;
  for (const ch of ['bottom', 'top', 'mix'] as const) {
    const e = edit[ch] as unknown as Record<string, unknown>;
    const b = base[ch] as unknown as Record<string, unknown>;
    for (const k of Object.keys(b)) if (!same(e[k], b[k])) n++;
  }
  return n + (same(edit.leaks, base.leaks) ? 0 : 1);
}

/** Рецепт с правками кадра: сдвиг, повороты, засветки. */
export function editedRecipe(recipe: Recipe, i: number, edit: FrameEdit): Recipe {
  const touching = new Set(leaksTouching(recipe, i));
  const others = recipe.leaks.filter((l) => !touching.has(l));
  const dust = recipe.dust.map((d, k) => (k === i ? d.slice(0, Math.round(d.length * edit.mix.dust)) : d));
  const hairs = recipe.hairs.map((h, k) => (k === i && edit.mix.dust < 0.5 ? [] : h));
  const leaks = edit.mix.leaks > 0 ? edit.leaks.filter((l) => !l.off).map((l) => ({ ...l, strength: l.strength * edit.mix.leaks })) : [];
  return {
    ...recipe,
    shiftMm: Math.max(-FRAME_W, Math.min(FRAME_W, edit.mix.shiftMm)),
    turnA: { ...recipe.turnA, [i]: edit.bottom.turns },
    turnB: edit.top.turns,
    leaks: [...others, ...leaks],
    dust,
    hairs,
  };
}

/** Меняется ли от правки сложение снимков (иначе достаточно пересчитать последний шаг). */
export function composeKey(edit: FrameEdit): string {
  const { whites: _w, halo: _h, contrast: _c, black: _b, grain: _g, dust: _d, glow: _gl, ...mix } = edit.mix;
  return JSON.stringify([edit.bottom, edit.top, mix, edit.leaks]);
}

/** Край кадра, от которого входит засветка. */
export function leakEdge(leak: Leak, i: number): 'left' | 'right' {
  return leak.x < i * PITCH + FRAME_W / 2 ? 'left' : 'right';
}

/**
 * Монотонная кубическая интерполяция (Фриче–Карлсон): кривая проходит через точки и не даёт
 * «перелётов». Возвращает 256 значений 0…1. (Кривые сейчас не в пульте; оставлены для следующих версий.)
 */
export function curveTable(points: [number, number][]): Float32Array {
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
    out[k] = Math.max(0, Math.min(1, (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[seg + 1]));
  }
  return out;
}

export const LEAK_KIND_NAMES: Record<LeakKind, string> = { glow: 'Glow', stripe: 'Stripe', burn: 'Burnt edge' };
