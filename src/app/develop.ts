// Проявка в приложении: кадр за кадром, в памяти только снимки, нужные текущему кадру.
// Каждый готовый кадр сразу сохраняется — после прерывания проявка продолжается с того же места.

import { makeRecipe } from '../core/recipe';
import { Developer, type Source } from '../gl/pipeline';
import { LOOKS, withWhiteMerge, type Look } from '../looks';
import { getRoll, rollPhoto, saveFrame, type Development } from './store';

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
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось сохранить кадр'))), 'image/jpeg', quality));
}

export interface Progress {
  frame: number;
  thumb: Blob;
  dev: Development;
}

/** Проявляет кадры dev.done … n−1. Возвращает обновлённую проявку. */
export async function runDevelopment(dev: Development, onFrame: (p: Progress) => void, shouldStop: () => boolean): Promise<Development> {
  const [rollA, rollB] = await Promise.all([getRoll(dev.rollA), getRoll(dev.rollB)]);
  if (!rollA || !rollB) throw new Error('Одна из плёнок удалена — эту проявку уже не продолжить');
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
        if (!blob) throw new Error(`Не найден снимок плёнки «${roll.name}»`);
        const img = await decode(blob, maxPx);
        cache.set(key, developer.upload(img));
        if (img instanceof ImageBitmap) img.close();
      }
      const srcA: (Source | undefined)[] = [];
      const srcB: (Source | undefined)[] = [];
      for (const [key, src] of cache) (key[0] === 'a' ? srcA : srcB)[Number(key.slice(1))] = src;
      const img = developer.renderFrame(i, recipe, look, srcA, srcB, ppm, shapes);
      if (lost) throw new Error('Телефон прервал проявку — продолжите её из списка проявок');
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
