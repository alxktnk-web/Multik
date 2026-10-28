import { multiply, scale, translate, type Matrix } from '../model/transforms';
import { stripFrame, stripSourceToFilm, visibleStripOffsets, type FilmStripScene } from '../model/film-strip';
import type { RectMm, SourceRef } from '../model/types';
import type { Decoded } from './assets';

// Experimental raw-layer proof, not the production shader path. It deliberately
// does not apply Levels, halo or mix profiles, and is not used by the renderer.
export type StripWindow = { width: number; height: number; crop: RectMm };
export type StripWindowDraw = { offset: number; source: SourceRef; sourceToPixels: Matrix };
export const STRIP_WINDOW_MAX_EDGE = 4096;
export const STRIP_WINDOW_MAX_PIXELS = 4_194_304;
export const STRIP_WINDOW_MAX_DRAWS = 32;

/** Plan the same crop mapping for either a preview window or an export tile. */
export function planStripWindow(scene: FilmStripScene, layerIndex: 0 | 1, window: StripWindow): StripWindowDraw[] {
  const {width, height, crop} = window;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > STRIP_WINDOW_MAX_EDGE || height > STRIP_WINDOW_MAX_EDGE || width * height > STRIP_WINDOW_MAX_PIXELS) throw Error('Film strip window exceeds resource limit');
  const offsets = visibleStripOffsets(scene.frame, scene.layers[layerIndex], scene.filmStrip.gapMm, 0, crop);
  if (offsets.length > STRIP_WINDOW_MAX_DRAWS) throw Error('Film strip window has too many frames');
  const filmToPixels = multiply(scale(width / crop.width, height / crop.height), translate(-crop.x, -crop.y));
  return offsets.map(offset => ({offset, source: {...stripFrame(scene.filmStrip.layers[layerIndex], offset).source}, sourceToPixels: multiply(filmToPixels, stripSourceToFilm(scene, layerIndex, offset))}));
}

/** Serial, bounded and transparent raw raster for the proof; caller owns returned canvas. */
export async function rasterizeStripWindow(
  scene: FilmStripScene, layerIndex: 0 | 1, window: StripWindow,
  decode: (source: SourceRef) => Promise<Decoded>,
  signal: AbortSignal,
  makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): Promise<HTMLCanvasElement> {
  const plan = planStripWindow(scene, layerIndex, window);
  signal.throwIfAborted();
  const canvas = makeCanvas();
  canvas.width = window.width; canvas.height = window.height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Could not prepare film strip window');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const item of plan) {
      signal.throwIfAborted();
      const decoded = await decode(item.source);
      try {
        signal.throwIfAborted();
        ctx.setTransform(...item.sourceToPixels);
        ctx.drawImage(decoded.image, 0, 0, 1, 1);
      } finally { decoded.close(); }
    }
    return canvas;
  } catch (error) {
    canvas.width = canvas.height = 1;
    throw error;
  }
}
