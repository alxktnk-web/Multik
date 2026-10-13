// Варианты вида. Каждый — набор параметров конвейера; в лаборатории их сравнивают рядом.

export type Vec3 = [number, number, number];

export interface Look {
  id: string;
  name: string;
  note: string;
  /** включён ли вариант в лаборатории по умолчанию */
  defaultOn: boolean;
  /** множитель света каждого прохода: 1 — пересвет (без компенсации), 0.5 — −1 EV */
  passGain: number;
  /** с какой яркости снимка начинается расширение светов и во сколько раз (1 + hlBoost) */
  hlStart: number;
  hlBoost: number;
  vignette: number;
  /** мягкость объектива: сдвиг уровня мип-карты при выборке снимка (0 — резко, как iPhone) */
  lensSoftness: number;
  /** радиус скругления углов кадрового окна и мягкость края, мм */
  cornerMm: number;
  softMm: number;
  /** ореол: порог света, сила узкой и широкой части, радиусы (мм), цвет */
  halThreshold: number;
  halSmall: number;
  halLarge: number;
  halSigmaSmallMm: number;
  halSigmaLargeMm: number;
  halTint: Vec3;
  /** мягкое светлое «дыхание» светов */
  bloom: number;
  /** неравномерность проявки */
  mottle: number;
  /** экспозиция перед кривой */
  exposure: number;
  /** кривая по каналам: контраст и сдвиг в ступенях (больше — канал темнее) */
  contrast: Vec3;
  offsetStops: Vec3;
  black: Vec3;
  white: Vec3;
  /** обрезка кривой: всё ниже clipLow — чистый чёрный, выше clipHigh — чистый белый (0 и 1 — без обрезки) */
  clipLow: number;
  clipHigh: number;
  saturation: number;
  highlightSaturation: number;
  shadowTint: Vec3;
  highlightTint: Vec3;
  grain: number;
  grainMm: number;
  grainChroma: number;
  leakGain: number;
  /**
   * Тональная модель: 'log' — S-кривая в логарифме экспозиции (contrast/offset, жёсткая);
   * 'faithful' — один проход воспроизводит исходное фото, чёрное прозрачно для другого прохода,
   * сумма уходит в мягкое плечо; contrast/offset не используются, вместо них punch.
   */
  tone?: 'log' | 'faithful';
  /** сила S-кривой в модели 'faithful', 0…1 */
  punch?: number;
}

const portraSoft: Look = {
  id: 'A',
  name: 'Portra · soft',
  note: 'warm, soft contrast, moderate halation',
  defaultOn: false,
  passGain: 1,
  hlStart: 0.8,
  hlBoost: 3,
  vignette: 0.25,
  lensSoftness: 0,
  cornerMm: 0.8,
  softMm: 0.12,
  halThreshold: 1.6,
  halSmall: 0.25,
  halLarge: 0.35,
  halSigmaSmallMm: 0.25,
  halSigmaLargeMm: 1.0,
  halTint: [1, 0.22, 0.06],
  bloom: 0.06,
  mottle: 0.03,
  exposure: 1,
  contrast: [0.78, 0.75, 0.72],
  offsetStops: [0, 0.05, 0.18],
  black: [0.07, 0.06, 0.065],
  white: [0.975, 0.96, 0.92],
  clipLow: 0,
  clipHigh: 1,
  saturation: 1,
  highlightSaturation: 0.7,
  shadowTint: [-0.01, 0, 0.015],
  highlightTint: [0.02, 0.008, -0.015],
  grain: 0.1,
  grainMm: 0.015,
  grainChroma: 0.3,
  leakGain: 1,
};

const portraPunchy: Look = {
  ...portraSoft,
  id: 'B',
  name: 'Portra · contrast + halation',
  note: 'denser shadows, stronger red halation (liked in lab-0.2)',
  defaultOn: false,
  halThreshold: 1.3,
  halSmall: 0.5,
  halLarge: 0.7,
  bloom: 0.1,
  contrast: [0.98, 0.95, 0.92],
  black: [0.05, 0.045, 0.05],
  saturation: 1.08,
  grain: 0.12,
};

const faded: Look = {
  ...portraSoft,
  id: 'C',
  name: 'Faded',
  note: 'low contrast, lifted blacks, slight magenta-cyan tint',
  defaultOn: false,
  contrast: [0.6, 0.58, 0.56],
  offsetStops: [-0.05, 0.05, 0.05],
  black: [0.13, 0.12, 0.14],
  white: [0.95, 0.94, 0.94],
  saturation: 0.85,
  shadowTint: [0, 0.01, 0.03],
  highlightTint: [0.02, 0, 0.02],
  grain: 0.14,
};

// lab-0.3: по отметкам Александра — B лучше всех, но белое не выгорает и наложение «вялое».
// Белое небо iPhone (≈0.9 sRGB) теперь попадает в усиление светов и выжигается почти в белый,
// чёрный глубже, контраст выше, объектив мягче — меньше «цифровой» резкости.
const burnt: Look = {
  ...portraPunchy,
  id: 'D',
  name: 'Dense · burnt whites',
  note: 'like B, but a bright sky burns the second frame almost to white; deeper blacks, softer sharpness',
  defaultOn: false,
  hlStart: 0.55,
  hlBoost: 5,
  exposure: 1.3,
  lensSoftness: 0.6,
  contrast: [1.05, 1.02, 1],
  black: [0.03, 0.028, 0.032],
  white: [0.985, 0.975, 0.95],
  highlightSaturation: 0.6,
};

const blown: Look = {
  ...burnt,
  id: 'E',
  name: 'Heavy overexposure',
  note: '⅔ stop brighter still: highlights burn out fully, shadows hold the image, stronger halation',
  exposure: 1.7,
  hlStart: 0.5,
  hlBoost: 6,
  lensSoftness: 0.8,
  contrast: [1.15, 1.12, 1.08],
  black: [0.025, 0.024, 0.028],
  saturation: 1.12,
  highlightSaturation: 0.5,
  halSmall: 0.6,
  halLarge: 0.9,
};

// lab-0.4: кадр с чайкой (1-E, рецепт 519064) — «белое на белом должно сливаться в одно,
// видно только чёрное, никаких белых окантовок; контраст выше, чёрное — чёрное».
// Верх кривой обрезается в чистый белый (без кремового оттенка), низ — в чёрный:
// граница кадра второго прохода внутри выгоревшей области исчезает.
const merged: Look = {
  ...blown,
  id: 'F',
  name: 'Melted whites · true blacks',
  note: 'burnt areas melt into one clean white with no edges; unlifted blacks, higher contrast',
  defaultOn: true,
  contrast: [1.3, 1.27, 1.24],
  black: [0.008, 0.008, 0.01],
  white: [1, 1, 1],
  clipLow: 0.04,
  clipHigh: 0.86,
  highlightSaturation: 0.3,
  highlightTint: [0.01, 0.004, -0.008],
  bloom: 0.06,
  halLarge: 0.7,
};

// lab-0.6: «чёрное — это дырка для другой экспозиции, как альфа-канал» (Александр). Логарифмическая кривая
// вариантов A–F в 2–3 раза контрастнее фото: тёмно-средние тона одного прохода уходили в чистый чёрный
// и закрывали другой проход. M и N — на «честной» кривой: один проход = исходное фото.
const meltedClean: Look = {
  ...merged,
  id: 'M',
  name: 'Melted · clean blacks',
  note: 'faithful curve: black is a hole for the other pass, overlaps brighten like screen, near-whites melt into white',
  defaultOn: true,
  tone: 'faithful',
  punch: 0.35,
  exposure: 1,
  hlStart: 0.75,
  hlBoost: 4,
  lensSoftness: 0.6,
  black: [0.008, 0.008, 0.01],
  white: [1, 1, 1],
  clipLow: 0.03,
  clipHigh: 0.9,
  saturation: 1.08,
  highlightSaturation: 0.5,
  shadowTint: [-0.005, 0, 0.01],
  highlightTint: [0.01, 0.004, -0.008],
  grain: 0.12,
};

const natural: Look = {
  ...meltedClean,
  id: 'N',
  name: 'Natural',
  note: 'faithful curve, softer: photos look like themselves, gentle Portra warmth, whites do not merge on their own',
  punch: 0.15,
  hlStart: 0.8,
  hlBoost: 3,
  lensSoftness: 0.3,
  black: [0.03, 0.028, 0.032],
  white: [0.985, 0.975, 0.95],
  clipLow: 0,
  clipHigh: 1,
  saturation: 1.02,
  highlightSaturation: 0.7,
  shadowTint: [-0.01, 0, 0.015],
  highlightTint: [0.02, 0.008, -0.015],
};

export const LOOKS: Look[] = [meltedClean, natural, merged, blown, burnt, portraPunchy, portraSoft, faded];

/**
 * «Слияние белого» 0…10: верх кривой обрезается в чистый белый тем раньше, чем выше значение.
 * 0 — без обрезки, 6 ≈ вариант F, 10 — всё светлее ~¾ шкалы уходит в сплошной белый.
 * При слиянии света выцветают в нейтральный белый, без кремового оттенка.
 */
export function withWhiteMerge(look: Look, level: number): Look {
  const t = Math.max(0, Math.min(10, level)) / 10;
  return {
    ...look,
    clipHigh: 1 - 0.25 * t,
    white: look.white.map((c) => c + (1 - c) * t) as Vec3,
    highlightSaturation: look.highlightSaturation * (1 - 0.6 * t),
  };
}
