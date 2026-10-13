// Рецепт проявки: все случайные решения плёнки, вычисленные заранее из сида.
// По рецепту плёнку можно проявить повторно один в один.

import { FRAME_H, FRAME_W, PITCH, frameA, type Placement, type Rect } from './geometry';
import { Rng } from './rng';

export const ALGO_VERSION = 'lab-0.7';

export interface RecipeSettings {
  shiftMode: 'random' | 'manual';
  /** используется при shiftMode = 'manual', −36…+36 */
  shiftMm: number;
  swapRotate: boolean;
  reverseOrder: boolean;
  leaks: boolean;
  leakChance: number;
  endFog: boolean;
  dust: boolean;
  /** количество пыли: 4 — обычное, 0 — нет, 10 — много */
  dustLevel: number;
  exposureJitter: boolean;
}

export const DEFAULT_SETTINGS: RecipeSettings = {
  shiftMode: 'random',
  shiftMm: 10,
  swapRotate: true,
  reverseOrder: false,
  leaks: true,
  leakChance: 0.5,
  endFog: true,
  dust: true,
  dustLevel: 4,
  exposureJitter: true,
};

/**
 * Тип засветки (lab-0.7, по разбору ChatGPT): «glow» — широкий бледный подсвет, «stripe» — насыщенная
 * красно-малиновая полоса от края, «burn» — выжженная область с рваной цветной границей.
 */
export type LeakKind = 'glow' | 'stripe' | 'burn';
export const LEAK_KINDS: LeakKind[] = ['glow', 'stripe', 'burn'];

export interface Leak {
  /** кадр плёнки A, у края которого засветка */
  frame: number;
  kind: LeakKind;
  /** край, от которого входит засветка, мм вдоль плёнки */
  x: number;
  /** +1 — засветка уходит вправо от края, −1 — влево */
  dir: 1 | -1;
  width: number;
  strength: number;
  /** 0 — красно-оранжевая, 1 — малиновая */
  hue: number;
  /** −1 — по всей высоте, иначе центр по высоте 0…1 */
  yCenter: number;
  seed: number;
  /** выключена в правке кадра (форма сохраняется) */
  off?: boolean;
}

/**
 * Случайная засветка у края кадра i. Сила: много слабых, несколько заметных, редко разрушительные.
 * Каждая четвёртая садится на перемычку и заходит на соседний кадр — одно событие на ленте.
 */
export function randomLeak(rng: Rng, i: number, kind?: LeakKind): Leak {
  const k = kind ?? (rng.chance(0.4) ? 'glow' : rng.chance(0.75) ? 'stripe' : 'burn');
  const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  const f = frameA(i);
  const onGap = rng.chance(0.25);
  const edge = dir === 1 ? f.x : f.x + FRAME_W;
  const x = onGap ? edge - dir * (1 + rng.range(0, 1.5)) : edge - dir * rng.range(0, 1.5);
  const r = rng.next();
  const strength =
    k === 'glow' ? 0.4 + 1.6 * r : k === 'stripe' ? 0.5 + 3.5 * r * r : 1 + 1.5 * r;
  const width = k === 'glow' ? rng.range(10, 26) : k === 'stripe' ? rng.range(4, 14) : rng.range(3, 9);
  return {
    frame: i,
    kind: k,
    x,
    dir,
    width,
    strength,
    hue: rng.chance(0.5) ? rng.range(0, 0.35) : rng.range(0.45, 1),
    yCenter: k === 'burn' || rng.chance(0.5) ? -1 : rng.range(0, 1),
    seed: rng.range(0, 100),
  };
}

export interface Fog {
  /** граница засвеченного конца, мм вдоль плёнки */
  edge: number;
  /** +1 — засвечено слева от границы (начало плёнки), −1 — справа (конец) */
  dir: 1 | -1;
  strength: number;
  seed: number;
}

export interface Dust {
  x: number;
  y: number;
  r: number;
}

export interface Hair {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bend: number;
}

export interface Recipe {
  version: string;
  seed: number;
  n: number;
  settings: RecipeSettings;
  orderA: number[];
  orderB: number[];
  shiftMm: number;
  vShiftMm: number;
  jitterB: { dx: number; dy: number }[];
  evA: number[];
  evB: number[];
  leaks: Leak[];
  fogs: Fog[];
  dust: Dust[][];
  hairs: Hair[][];
  /** кадры первого прохода, повёрнутые на 180° правкой кадра (панель Edit) */
  rotateA?: number[];
}

/**
 * Баланс проходов A ↔ B (формула ChatGPT): отношение A/B меняется в 2^b раз, а сумма весов остаётся 2 —
 * баланс не меняет общую яркость. b в ступенях, −2…+2.
 */
export function balanceGains(b: number): { a: number; b: number } {
  const u = 2 ** (b / 2);
  const v = 2 ** (-b / 2);
  return { a: (2 * u) / (u + v), b: (2 * v) / (u + v) };
}

/** Чаще 5–15 мм (как на референсах), изредка любой сдвиг до длины кадра. */
export function sampleShift(rng: Rng): number {
  const mag = rng.chance(0.2) ? rng.range(0, FRAME_W) : rng.range(5, 15);
  return rng.chance(0.5) ? mag : -mag;
}

/** Отдельный поток случайности на каждый эффект: например, число пылинок не влияет на порядок кадров. */
function stream(seed: number, salt: number): Rng {
  return new Rng(Math.imul(seed ^ 0x5bd1e995, 0x01000193) ^ Math.imul(salt, 0x9e3779b1));
}

export function makeRecipe(n: number, seed: number, settings: RecipeSettings = DEFAULT_SETTINGS): Recipe {
  let rng = stream(seed, 1);
  const orderA = rng.permutation(n);
  const orderB = rng.permutation(n);
  rng = stream(seed, 2);
  const randomShift = sampleShift(rng);
  const shiftMm =
    settings.shiftMode === 'manual' ? Math.max(-FRAME_W, Math.min(FRAME_W, settings.shiftMm)) : randomShift;
  const vShiftMm = rng.range(-0.3, 0.3);
  const jitterB = Array.from({ length: n }, () => ({ dx: rng.range(-0.7, 0.7), dy: rng.range(-0.15, 0.15) }));
  rng = stream(seed, 3);
  const ev = () => (settings.exposureJitter ? rng.range(-1 / 3, 1 / 3) : 0);
  const evA = Array.from({ length: n }, ev);
  const evB = Array.from({ length: n }, ev);

  rng = stream(seed, 4);
  const leaks: Leak[] = [];
  for (let i = 0; i < n; i++) {
    const hit = rng.chance(settings.leakChance);
    const leak = randomLeak(rng, i);
    if (settings.leaks && hit) leaks.push(leak);
  }

  rng = stream(seed, 5);
  const fogs: Fog[] = [];
  const startFog = rng.chance(0.7);
  const endFog = rng.chance(0.5);
  const startEdge = rng.range(2, 14);
  const endEdge = n * PITCH - 2 - rng.range(2, 14);
  if (settings.endFog && startFog) fogs.push({ edge: startEdge, dir: 1, strength: rng.range(0.8, 1.2), seed: rng.range(0, 100) });
  if (settings.endFog && endFog) fogs.push({ edge: endEdge, dir: -1, strength: rng.range(0.8, 1.2), seed: rng.range(0, 100) });

  rng = stream(seed, 6);
  const dust: Dust[][] = [];
  const hairs: Hair[][] = [];
  for (let i = 0; i < n; i++) {
    const specks: Dust[] = [];
    const count = Math.round((4 + rng.int(16)) * (settings.dustLevel ?? 4) / 4);
    for (let k = 0; k < count; k++) {
      specks.push({ x: rng.range(0, FRAME_W), y: rng.range(0, FRAME_H), r: rng.range(0.03, 0.1) });
    }
    const frameHairs: Hair[] = [];
    if (rng.chance(0.12)) {
      const x0 = rng.range(0, FRAME_W);
      const y0 = rng.range(0, FRAME_H);
      const a = rng.range(0, Math.PI * 2);
      const len = rng.range(3, 10);
      frameHairs.push({ x0, y0, x1: x0 + Math.cos(a) * len, y1: y0 + Math.sin(a) * len, bend: rng.range(-1, 1) });
    }
    dust.push(settings.dust ? specks : []);
    hairs.push(settings.dust ? frameHairs : []);
  }

  return {
    version: ALGO_VERSION,
    seed,
    n,
    settings,
    orderA,
    orderB,
    shiftMm,
    vShiftMm,
    jitterB,
    evA,
    evB,
    leaks,
    fogs,
    dust,
    hairs,
  };
}

export interface PhotoShape {
  portrait: boolean;
}

/** Где на плёнке лежат кадры обоих проходов и какие снимки в них. */
export function placements(recipe: Recipe, shapesA: PhotoShape[], shapesB: PhotoShape[]): { a: Placement[]; b: Placement[] } {
  const a = recipe.orderA.map((photo, i) => ({
    rect: frameA(i),
    photo,
    turn: ((shapesA[photo].portrait ? 1 : 0) + (recipe.rotateA?.includes(i) ? 2 : 0)) % 4,
    gain: 2 ** recipe.evA[i],
  }));
  const b = recipe.orderB.map((_, j) => {
    const photo = recipe.orderB[recipe.settings.reverseOrder ? recipe.n - 1 - j : j];
    const rect: Rect = {
      x: j * PITCH + recipe.shiftMm + recipe.jitterB[j].dx,
      y: recipe.vShiftMm + recipe.jitterB[j].dy,
      w: FRAME_W,
      h: FRAME_H,
    };
    const turn = ((shapesB[photo].portrait ? 1 : 0) + (recipe.settings.swapRotate ? 2 : 0)) % 4;
    return { rect, photo, turn, gain: 2 ** recipe.evB[j] };
  });
  return { a, b };
}
