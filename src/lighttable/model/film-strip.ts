import { around, inverse, multiply, point, rotation, scale, sourceToFilm, translate, type Matrix } from './transforms';
import { copyComposition, fitSource, type Composition, type Layer, type Placement, type Point, type RectMm, type SourceRef } from './types';

// Preparatory scene format. No existing scene is upgraded implicitly; this type is
// not yet persisted or rendered by the application.
export type StripSource = { source: SourceRef; size: Point };
export type StripSnapshot = { center: number; frames: Placement[] };
export type FilmStripScene = Composition & {
  filmStrip: { version: 1; gapMm: number; layers: [StripSnapshot, StripSnapshot] };
};
export const FILM_GAP_MM = 1.2;
const MAX_FRAMES = 1000;

/** Freeze both ordered recipe sides, including duplicates, before any later recipe edit. */
export function createFilmStripSnapshot(base: Composition, sides: [readonly StripSource[], readonly StripSource[]], center: number): FilmStripScene {
  if (sides[0].length !== sides[1].length || !Number.isInteger(center) || sides.some(side => side.length < 1 || side.length > MAX_FRAMES || center >= side.length || center < 0)) throw Error('Invalid film strip center');
  const layers = sides.map((side, i) => {
    const frames: Placement[] = side.map(({source, size}) => {
      if (!source || typeof source.assetId !== 'string' || !source.assetId || source.assetRevision !== 1) throw Error('Invalid film strip source');
      return {source: {...source}, rect: fitSource(Math.max(size.x, size.y), Math.min(size.x, size.y)), turns: (size.y > size.x ? 1 : 0) as 0 | 1, gain: 1};
    });
    if (frames[center].source.assetId !== base.layers[i].placements[0].source.assetId || frames[center].source.assetRevision !== base.layers[i].placements[0].source.assetRevision) throw Error('Film strip center does not match composition');
    // The existing central placement, including its exact geometry and gain, is authoritative.
    frames[center] = structuredClone(base.layers[i].placements[0]);
    return {center, frames};
  }) as [StripSnapshot, StripSnapshot];
  return {...copyComposition(base), filmStrip: {version: 1, gapMm: FILM_GAP_MM, layers}};
}

export function stripFrame(strip: StripSnapshot, offset: number): Placement {
  if (!Number.isInteger(offset) || !strip.frames.length || !Number.isInteger(strip.center) || strip.center < 0 || strip.center >= strip.frames.length) throw Error('Invalid film strip position');
  return strip.frames[((strip.center + offset) % strip.frames.length + strip.frames.length) % strip.frames.length];
}

/** The offset is in layer coordinates, so layer translation, rotation and scale affect the whole strip. */
export function stripSourceToFilm(scene: FilmStripScene, layerIndex: 0 | 1, offset: number): Matrix {
  const layer = scene.layers[layerIndex], placement = stripFrame(scene.filmStrip.layers[layerIndex], offset);
  const shifted: Placement = {...placement, rect: {...placement.rect, x: placement.rect.x + offset * (scene.frame.widthMm + scene.filmStrip.gapMm)}};
  return sourceToFilm(scene.frame, layer, shifted);
}

/** Conservative positions touching the film crop, including source-space halo padding. */
export function visibleStripOffsets(frame: Composition['frame'], layer: Layer, gapMm: number, haloPaddingMm: number, crop: RectMm = {x: 0, y: 0, width: frame.widthMm, height: frame.heightMm}): number[] {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width <= 0 || crop.height <= 0 || !Number.isFinite(gapMm) || gapMm < 0 || !Number.isFinite(haloPaddingMm) || haloPaddingMm < 0 || !Number.isFinite(layer.transform.scale ?? 1) || (layer.transform.scale ?? 1) <= 0) throw Error('Invalid strip geometry');
  const t = layer.transform;
  const layerToFilm = multiply(translate(t.xMm, t.yMm), around(multiply(rotation(t.turns), scale(t.scale ?? 1)), frame.widthMm / 2, frame.heightMm / 2));
  const filmToLayer = inverse(layerToFilm);
  const {x, y, width, height} = crop;
  const corners = [{x, y}, {x: x + width, y}, {x, y: y + height}, {x: x + width, y: y + height}].map(p => point(filmToLayer, p));
  const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
  const pitch = frame.widthMm + gapMm;
  const first = Math.ceil((minX - frame.widthMm - haloPaddingMm) / pitch);
  const last = Math.floor((maxX + haloPaddingMm) / pitch);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > 1000) throw Error('Film strip geometry exceeds resource limit');
  return Array.from({length: Math.max(0, last - first + 1)}, (_, i) => first + i);
}
