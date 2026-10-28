export type LayerId = 'a' | 'b';
export type QuarterTurns = 0 | 1 | 2 | 3;
export type Point = { x: number; y: number };
export type RectMm = Point & { width: number; height: number };
export type SourceRef = { assetId: string; assetRevision: number };
export type Transform = { xMm: number; yMm: number; turns: QuarterTurns; scale?: number };
export type Placement = { source: SourceRef; rect: RectMm; turns: QuarterTurns; gain: number };
export type Levels = { black: number; mid: number; white: number };
export type LevelPoint = keyof Levels;
export const neutralLevels: Readonly<Levels> = { black: 0, mid: .5, white: 1 };
export type StripSnapshot = { center: number; frames: Placement[] };
export type FilmStrip = { version: 1; gapMm: number; layers: [StripSnapshot, StripSnapshot] };
export type Layer = { levels?: Levels; id: LayerId; placements: Placement[]; transform: Transform };
export type Composition = {
  schema: 1;
  id: string;
  revision: number;
  mode: 'manual-pair';
  frame: { widthMm: number; heightMm: number; turns: QuarterTurns };
  layers: [Layer, Layer];
  profile: { id: 'lighttable-clean-v1'; version: 1 | 2 | 3 | 4 | 5 };
  effects: { halo: number; exposure: number; balance: number; contrast: number; haloRadius: number; haloThreshold: number };
  seed: number;
  filmStrip?: FilmStrip;
};
export type Viewport = { width: number; height: number; zoom: number; pan: Point };
export type ParameterId = keyof Composition['effects'];
export type XYId = 'lightXY' | 'haloXY';
export type Tool = { kind: 'layer' } | { kind: 'levels'; point: LevelPoint } | { kind: 'parameter'; parameter: ParameterId } | { kind: 'xy'; pair: XYId };
export const turns = (n: number): QuarterTurns => ((Math.round(n) % 4 + 4) % 4) as QuarterTurns;
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const effectDefaults = { halo: 0.35, exposure: 0, balance: 0, contrast: 1, haloRadius: 0.65, haloThreshold: 0.75 };
// Additive schema-1 defaults: old records remain readable without a database migration.
export const copyComposition = (value: Composition): Composition => {
  const copy=structuredClone(value);copy.effects={...effectDefaults,...copy.effects};
  // Preserve v8's 1 -> 2 normalization, but never migrate the opt-in profiles.
  if(copy.profile.version===1)copy.profile.version=2;
  return copy;
};

// Decoder applies EXIF. A film has one landscape direction; portrait sources lie sideways.
// Placement rotation is metadata, originals are never rewritten.
export function fitSource(width: number, height: number): RectMm {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw Error('Invalid source size');
  const scale = Math.min(36 / width, 27 / height);
  return { x: (36 - width * scale) / 2, y: (27 - height * scale) / 2, width: width * scale, height: height * scale };
}
export function createComposition(id: string, sources: [SourceRef, SourceRef], sizes: [Point, Point], seed = 51): Composition {
  return {
    schema: 1, id, revision: 0, mode: 'manual-pair', seed,
    frame: { widthMm: 36, heightMm: 27, turns: 0 },
    profile: { id: 'lighttable-clean-v1', version: 2 },
    effects: { ...effectDefaults },
    layers: sources.map((source, i) => ({ id: i ? 'b' : 'a', placements: [{ source, rect: fitSource(Math.max(sizes[i].x,sizes[i].y), Math.min(sizes[i].x,sizes[i].y)), turns: sizes[i].y>sizes[i].x?1:0, gain: 1 }], transform: { xMm: 0, yMm: 0, turns: 0 } })) as [Layer, Layer],
  };
}
