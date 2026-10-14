// Проявка в приложении: кадр за кадром, в памяти только снимки, нужные текущему кадру.
// Каждый готовый кадр сразу сохраняется — после прерывания проявка продолжается с того же места.

import { composeKey, editedRecipe, glowTint, type FrameEdit, type PhotoEdit } from '../core/edit';
import { frameA, type Rect } from '../core/geometry';
import { luminance, photoUv, wandMask } from '../core/glow';
import { balanceGains, makeRecipe, placements, type PhotoShape, type Recipe } from '../core/recipe';
import { Developer, type FrameOptions, type GlowOptions, type PassTone, type Source } from '../gl/pipeline';
import { LOOKS, withWhiteMerge, type Look } from '../looks';
import { getRoll, rollPhoto, rollThumb, saveFrame, type Development, type Roll } from './store';

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

// --- правка кадра (пульт) ---

/** Вид проявки с правками канала Mix: слияние белого, ореол, мягкое свечение, зерно. */
export function editLook(dev: Development, edit: FrameEdit): Look {
  const base = LOOKS.find((l) => l.id === dev.params.lookId) ?? LOOKS[0];
  const look = withWhiteMerge({ ...base, exposure: 2 ** (dev.params.exposureTenths / 10) }, edit.mix.whites);
  return {
    ...look,
    halSmall: look.halSmall * edit.mix.halo,
    halLarge: look.halLarge * edit.mix.halo,
    bloom: look.bloom * edit.mix.glow,
    grain: look.grain * edit.mix.grain,
  };
}

const passTone = (p: PhotoEdit, balance: number): PassTone => ({
  gain: 2 ** p.light * balance,
  contrast: p.contrast,
  black: p.black,
  whites: p.whites,
  saturation: p.color,
  warmth: p.warmth,
  glow: p.glow,
  soft: p.soft * 2,
});

export function editOptions(edit: FrameEdit): FrameOptions {
  // баланс: вправо — сильнее верхний (второй проход), сумма весов постоянна
  const g = balanceGains(-(edit.mix.balance ?? 0));
  return { passA: passTone(edit.bottom, g.a), passB: passTone(edit.top, g.b), contrast: edit.mix.contrast, black: edit.mix.black };
}

/**
 * Пересчёт одного кадра из исходных снимков: держит свой контекст WebGL и снимки, нужные кадру.
 * Для живого предпросмотра снимки грузятся уменьшенными (maxPx), для сохранения — в полном размере проявки.
 * Если меняются только настройки последнего шага (белое, ореол, зерно, общий контраст), сложение снимков
 * не повторяется. Если iOS отобрала графику (приложение было свёрнуто), контекст создаётся заново.
 */
export class FrameRenderer {
  readonly recipe: Recipe;
  private canvas!: HTMLCanvasElement;
  private developer!: Developer;
  private cache = new Map<string, Source>();
  private shapes: { a: PhotoShape[]; b: PhotoShape[] };
  private lastCompose = '';
  private lost = false;
  /** маски палочки: ключ «a12» / «b3» → текстура и описание, по которому она построена */
  private masks = new Map<string, { tex: WebGLTexture; key: string }>();
  private lumCache = new Map<string, { lum: Float32Array; w: number; h: number }>();
  private disposed = false;

  private constructor(
    readonly dev: Development,
    readonly rolls: [Roll, Roll],
    private maxPx: number,
  ) {
    this.recipe = makeRecipe(dev.n, dev.seed, dev.params.settings);
    this.shapes = {
      a: rolls[0].photos.map((p) => ({ portrait: p.h > p.w })),
      b: rolls[1].photos.map((p) => ({ portrait: p.h > p.w })),
    };
    this.reset();
  }

  private reset() {
    this.cache.clear();
    this.masks.clear();
    this.lastCompose = '';
    this.lost = false;
    this.canvas = document.createElement('canvas');
    this.developer = new Developer(this.canvas);
    this.canvas.addEventListener('webglcontextlost', () => (this.lost = true));
  }

  static async open(dev: Development, maxPx: number): Promise<FrameRenderer> {
    const [a, b] = await Promise.all([getRoll(dev.rollA), getRoll(dev.rollB)]);
    if (!a || !b) throw new Error('One of the rolls was deleted — this frame can’t be re-developed');
    return new FrameRenderer(dev, [a, b], maxPx);
  }

  async render(i: number, edit: FrameEdit, ppm: number): Promise<ImageData> {
    if (this.lost || this.developer.gl.isContextLost()) this.reset();
    const recipe = editedRecipe(this.recipe, i, edit);
    const look = editLook(this.dev, edit);
    const need = this.developer.needed(i, recipe, look, this.shapes);
    const keys = new Set([...need.a.map((k) => `a${k}`), ...need.b.map((k) => `b${k}`)]);
    // в памяти — только снимки этого кадра
    for (const [key, src] of this.cache) {
      if (!keys.has(key)) {
        this.developer.release(src);
        this.cache.delete(key);
      }
    }
    for (const key of keys) {
      if (this.cache.has(key)) continue;
      const roll = key[0] === 'a' ? this.rolls[0] : this.rolls[1];
      const blob = await rollPhoto(roll, Number(key.slice(1)));
      if (!blob) throw new Error(`A photo from “${roll.name}” is missing`);
      const img = await decode(blob, this.maxPx);
      this.cache.set(key, this.developer.upload(img));
      if (img instanceof ImageBitmap) img.close();
      this.lastCompose = '';
    }
    const srcA: (Source | undefined)[] = [];
    const srcB: (Source | undefined)[] = [];
    for (const [key, src] of this.cache) (key[0] === 'a' ? srcA : srcB)[Number(key.slice(1))] = src;
    const glow = edit.glows.length ? await this.glowOptions(i, edit, recipe) : undefined;
    const key = `${i}:${ppm}:${composeKey(edit)}`;
    const img = this.developer.renderFrame(i, recipe, look, srcA, srcB, ppm, this.shapes, { ...editOptions(edit), glow, filmOnly: key === this.lastCompose });
    if (this.lost) {
      this.reset();
      throw new Error('The phone interrupted rendering — try again');
    }
    this.lastCompose = key;
    return img;
  }

  /** Точки — в мм ленты; палочка — маска по миниатюре снимка, в его координатах (одинакова для превью и сохранения). */
  private async glowOptions(i: number, edit: FrameEdit, recipe: Recipe): Promise<GlowOptions> {
    const f = frameA(i);
    const { a, b } = placements(recipe, this.shapes.a, this.shapes.b);
    const spotsA: number[][] = [];
    const spotsB: number[][] = [];
    const wands: Record<string, { u: number; v: number; tol: number; strength: number }[]> = {};
    const covering = (list: typeof a, x: number, y: number) =>
      list.find((p) => x >= p.rect.x && x <= p.rect.x + p.rect.w && y >= p.rect.y && y <= p.rect.y + p.rect.h);
    for (const g of edit.glows) {
      const x = f.x + g.x;
      const y = f.y + g.y;
      const passes = g.source === 'both' ? (['a', 'b'] as const) : g.source === 'bottom' ? (['a'] as const) : (['b'] as const);
      for (const pass of passes) {
        if (g.kind === 'spot') {
          (pass === 'a' ? spotsA : spotsB).push([x, y, g.r, g.strength]);
          continue;
        }
        const p = covering(pass === 'a' ? a : b, x, y);
        if (!p) continue;
        const meta = (pass === 'a' ? this.rolls[0] : this.rolls[1]).photos[p.photo];
        const uv = photoUv(x, y, p.rect as Rect, p.turn, meta.w, meta.h);
        if (!uv) continue;
        (wands[`${pass}${p.photo}`] ??= []).push({ u: uv[0], v: uv[1], tol: g.tol, strength: g.strength });
      }
    }
    const masksA = new Map<number, WebGLTexture>();
    const masksB = new Map<number, WebGLTexture>();
    for (const [key, items] of Object.entries(wands)) {
      const desc = JSON.stringify(items);
      let m = this.masks.get(key);
      if (!m || m.key !== desc) {
        if (m) this.developer.deleteTexture(m.tex);
        const roll = key[0] === 'a' ? this.rolls[0] : this.rolls[1];
        const photo = Number(key.slice(1));
        const src = await this.photoLum(roll, photo);
        const data = new Uint8Array(src.w * src.h * 4);
        for (const it of items) {
          const mask = wandMask(src.lum, src.w, src.h, it.u, it.v, it.tol);
          const k = Math.min(1, it.strength / 2);
          for (let n = 0; n < mask.length; n++) data[n * 4] = Math.max(data[n * 4], Math.round(mask[n] * k * 255));
        }
        m = { tex: this.developer.uploadMask(data, src.w, src.h), key: desc };
        this.masks.set(key, m);
      }
      (key[0] === 'a' ? masksA : masksB).set(Number(key.slice(1)), m.tex);
    }
    return { spotsA, spotsB, masksA, masksB, tint: glowTint(edit.glowHue) };
  }

  private async photoLum(roll: Roll, photo: number) {
    const key = `${roll.id}:${photo}`;
    const hit = this.lumCache.get(key);
    if (hit) return hit;
    const blob = await rollThumb(roll.id, photo);
    if (!blob) throw new Error(`A photo from “${roll.name}” is missing`);
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const out = { lum: luminance(px, c.width, c.height), w: c.width, h: c.height };
    this.lumCache.set(key, out);
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.masks.forEach((m) => this.developer.deleteTexture(m.tex));
    this.masks.clear();
    this.cache.forEach((src) => this.developer.release(src));
    this.cache.clear();
    this.developer.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
