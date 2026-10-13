// Проявка в приложении: кадр за кадром, в памяти только снимки, нужные текущему кадру.
// Каждый готовый кадр сразу сохраняется — после прерывания проявка продолжается с того же места.

import { curveLut, editedRecipe, isIdentity, type FrameEdit } from '../core/edit';
import { balanceGains, makeRecipe, type PhotoShape, type Recipe } from '../core/recipe';
import { Developer, type FrameOptions, type Source } from '../gl/pipeline';
import { LOOKS, withWhiteMerge, type Look } from '../looks';
import { getRoll, rollPhoto, saveFrame, type Development, type Roll } from './store';

export function lookFor(dev: Development): Look {
  const base = LOOKS.find((l) => l.id === dev.params.lookId) ?? LOOKS[0];
  const look = { ...base, exposure: 2 ** (dev.params.exposureTenths / 10) };
  return dev.params.whiteMerge === undefined ? look : withWhiteMerge(look, dev.params.whiteMerge);
}

async function decode(blob: Blob, maxPx: number): Promise<ImageBitmap | HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  if (scale === 1) return bmp;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

export function encode(img: ImageData, width?: number, quality = 0.92): Promise<Blob> {
  const full = document.createElement('canvas');
  full.width = img.width;
  full.height = img.height;
  full.getContext('2d')!.putImageData(img, 0, 0);
  let out = full;
  if (width && width < img.width) {
    out = document.createElement('canvas');
    out.width = width;
    out.height = Math.round((img.height / img.width) * width);
    out.getContext('2d')!.drawImage(full, 0, 0, out.width, out.height);
  }
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the frame'))), 'image/jpeg', quality));
}

export interface Progress {
  frame: number;
  thumb: Blob;
  dev: Development;
}

/** Проявляет кадры dev.done … n−1. Возвращает обновлённую проявку. */
export async function runDevelopment(dev: Development, onFrame: (p: Progress) => void, shouldStop: () => boolean): Promise<Development> {
  const [rollA, rollB] = await Promise.all([getRoll(dev.rollA), getRoll(dev.rollB)]);
  if (!rollA || !rollB) throw new Error('One of the rolls was deleted — this development can’t be resumed');
  const recipe = makeRecipe(dev.n, dev.seed, dev.params.settings);
  const look = lookFor(dev);
  const shapes = {
    a: rollA.photos.map((p) => ({ portrait: p.h > p.w })),
    b: rollB.photos.map((p) => ({ portrait: p.h > p.w })),
  };
  const ppm = dev.params.ppm;
  const maxPx = Math.min(4000, Math.round(36 * ppm * 1.15));

  const canvas = document.createElement('canvas');
  const developer = new Developer(canvas);
  const cache = new Map<string, Source>();
  let lost = false;
  canvas.addEventListener('webglcontextlost', () => (lost = true));

  try {
    for (let i = dev.done; i < dev.n; i++) {
      if (shouldStop()) break;
      const need = developer.needed(i, recipe, look, shapes);
      const keys = new Set([...need.a.map((k) => `a${k}`), ...need.b.map((k) => `b${k}`)]);
      for (const [key, src] of cache) {
        if (!keys.has(key)) {
          developer.release(src);
          cache.delete(key);
        }
      }
      for (const key of keys) {
        if (cache.has(key)) continue;
        const roll = key[0] === 'a' ? rollA : rollB;
        const blob = await rollPhoto(roll, Number(key.slice(1)));
        if (!blob) throw new Error(`A photo from “${roll.name}” is missing`);
        const img = await decode(blob, maxPx);
        cache.set(key, developer.upload(img));
        if (img instanceof ImageBitmap) img.close();
      }
      const srcA: (Source | undefined)[] = [];
      const srcB: (Source | undefined)[] = [];
      for (const [key, src] of cache) (key[0] === 'a' ? srcA : srcB)[Number(key.slice(1))] = src;
      const img = developer.renderFrame(i, recipe, look, srcA, srcB, ppm, shapes);
      if (lost) throw new Error('The phone interrupted developing — resume it from Developed');
      const [full, thumb] = await Promise.all([encode(img), encode(img, 480, 0.8)]);
      dev = await saveFrame(dev, i, full, thumb);
      onFrame({ frame: i, thumb, dev });
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    cache.forEach((src) => developer.release(src));
    developer.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return dev;
}

// --- правка кадра (панель Edit) ---

/** Вид проявки с правками кадра: экспозиция, слияние белого, ореол, «дыхание», зерно. */
export function editLook(dev: Development, edit: FrameEdit): Look {
  const base = LOOKS.find((l) => l.id === dev.params.lookId) ?? LOOKS[0];
  const look = withWhiteMerge({ ...base, exposure: 2 ** (dev.params.exposureTenths / 10 + edit.exposure) }, edit.whites);
  return {
    ...look,
    halSmall: look.halSmall * edit.halation,
    halLarge: look.halLarge * edit.halation,
    bloom: look.bloom * edit.glow,
    grain: look.grain * edit.grain,
  };
}

export function editOptions(edit: FrameEdit): FrameOptions {
  const g = balanceGains(edit.balance);
  return {
    gainA: g.a,
    gainB: g.b,
    curveLut: isIdentity(edit.curves) ? undefined : curveLut(edit.curves),
    black: edit.black / 100,
    contrast: edit.contrast / 100,
    saturation: edit.saturation / 100,
    warmth: edit.warmth / 100,
  };
}

/**
 * Пересчёт одного кадра из исходных снимков: держит свой контекст WebGL и снимки, нужные кадру.
 * Для живого предпросмотра снимки грузятся уменьшенными (maxPx), для сохранения — в полном размере проявки.
 */
export class FrameRenderer {
  readonly recipe: Recipe;
  private canvas = document.createElement('canvas');
  private developer: Developer;
  private cache = new Map<string, Source>();
  private shapes: { a: PhotoShape[]; b: PhotoShape[] };
  lost = false;

  private constructor(
    readonly dev: Development,
    private rolls: [Roll, Roll],
    private maxPx: number,
  ) {
    this.recipe = makeRecipe(dev.n, dev.seed, dev.params.settings);
    this.shapes = {
      a: rolls[0].photos.map((p) => ({ portrait: p.h > p.w })),
      b: rolls[1].photos.map((p) => ({ portrait: p.h > p.w })),
    };
    this.developer = new Developer(this.canvas);
    this.canvas.addEventListener('webglcontextlost', () => (this.lost = true));
  }

  static async open(dev: Development, maxPx: number): Promise<FrameRenderer> {
    const [a, b] = await Promise.all([getRoll(dev.rollA), getRoll(dev.rollB)]);
    if (!a || !b) throw new Error('One of the rolls was deleted — this frame can’t be re-developed');
    return new FrameRenderer(dev, [a, b], maxPx);
  }

  async render(i: number, edit: FrameEdit, ppm: number): Promise<ImageData> {
    const recipe = editedRecipe(this.recipe, i, edit);
    const look = editLook(this.dev, edit);
    const need = this.developer.needed(i, recipe, look, this.shapes);
    const keys = new Set([...need.a.map((k) => `a${k}`), ...need.b.map((k) => `b${k}`)]);
    for (const key of keys) {
      if (this.cache.has(key)) continue;
      const roll = key[0] === 'a' ? this.rolls[0] : this.rolls[1];
      const blob = await rollPhoto(roll, Number(key.slice(1)));
      if (!blob) throw new Error(`A photo from “${roll.name}” is missing`);
      const img = await decode(blob, this.maxPx);
      this.cache.set(key, this.developer.upload(img));
      if (img instanceof ImageBitmap) img.close();
    }
    const srcA: (Source | undefined)[] = [];
    const srcB: (Source | undefined)[] = [];
    for (const [key, src] of this.cache) if (keys.has(key)) (key[0] === 'a' ? srcA : srcB)[Number(key.slice(1))] = src;
    const img = this.developer.renderFrame(i, recipe, look, srcA, srcB, ppm, this.shapes, editOptions(edit));
    if (this.lost) throw new Error('The phone interrupted rendering — try again');
    return img;
  }

  private disposed = false;

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cache.forEach((src) => this.developer.release(src));
    this.cache.clear();
    this.developer.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
