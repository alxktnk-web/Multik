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
  saturation: number;
  highlightSaturation: number;
  shadowTint: Vec3;
  highlightTint: Vec3;
  grain: number;
  grainMm: number;
  grainChroma: number;
  leakGain: number;
}

const portraSoft: Look = {
  id: 'A',
  name: 'Portra · мягкая',
  note: 'тёплая, мягкий контраст, ореол умеренный',
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
  name: 'Portra · контраст + ореол',
  note: 'плотнее тени, сильнее красный ореол (понравился в lab-0.2)',
  defaultOn: true,
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
  name: 'Выцветшая',
  note: 'низкий контраст, приподнятый чёрный, лёгкий малиново-голубой оттенок',
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
  name: 'Плотная · белое выгорает',
  note: 'как B, но яркое небо выжигает второй кадр почти до белого, глубже чёрный, мягче резкость',
  defaultOn: true,
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
  name: 'Сильный пересвет',
  note: 'ещё на ⅔ ступени светлее: света сгорают целиком, тени держат картинку, ореол сильнее',
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

export const LOOKS: Look[] = [portraPunchy, burnt, blown, portraSoft, faded];
