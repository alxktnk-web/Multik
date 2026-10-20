// Правка кадра — «пульт» (макет «Multik — Edit panel», v2, утверждён Александром 14.10.2026).
// Сверху превью, ниже три канала: Bottom (снимок первой плёнки), Top (снимок второй), Mix (общее).
// У снимков — свет, контраст, чёрное, белое, свечение, цвет, тепло, мягкость, поворот: всё до наложения,
// поэтому в превью сразу видно, как меняется их взаимодействие. Done — кадр в полном размере.

import {
  baseEdit,
  countChanges,
  editedRecipe,
  shiftRange,
  storedEdit,
  topFrameAt,
  type Channel,
  type FrameEdit,
  type GlowItem,
  type MixEdit,
  type PhotoEdit,
} from '../core/edit';
import { FRAME_H, FRAME_W } from '../core/geometry';
import { placements, randomLeak } from '../core/recipe';
import { Rng, randomSeed } from '../core/rng';
import { FrameRenderer, encodeFrame } from './develop';
import { panelHtml, layoutButton, updatePanelChanges, migrateMixTools, type PanelItem } from './panels';
import { frameTurns, devOriginal, resetEditedFrame, rollThumb, saveEditedFrame, type Development } from './store';
import { rotatePoint } from '../core/orientation';
import { drawOriented, orientedBlob } from './orientation';
import { bindPhotoZoom, type PhotoZoom } from './zoom';

type IconId = 'mix' | 'shift' | 'sun' | 'contrast' | 'black' | 'white' | 'halo' | 'leak' | 'grain' | 'dust' | 'drop' | 'warm' | 'soft';

interface Control {
  id: string;
  label: string;
  icon: IconId;
  min: number;
  max: number;
  step: number;
  bipolar?: boolean;
  get: (e: FrameEdit) => number;
  set: (e: FrameEdit, v: number) => void;
  fmt: (v: number) => string;
  /** цвет дуги крутилки */
  tint?: string;
  /** крутилка: изменение значения на пиксель движения пальца (иначе полный ход ≈ 500 px) */
  speed?: number;
  /** крутилка крутится движением пальца вверх-вниз (вверх — больше), а не вбок */
  vertical?: boolean;
  /** ползунок с миниатюрами снимков по краям (баланс) */
  ends?: boolean;
  /** ползунок без значка */
  plain?: boolean;
  /** двойное касание: своё действие вместо «значение проявки» */
  reset?: (e: FrameEdit) => void;
}

const ICONS: Record<IconId | 'x' | 'check' | 'undo' | 'original' | 'rotate' | 'shift' | 'dice' | 'mix' | 'spark' | 'spot' | 'wand' | 'trash', string> = {
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"/></svg>',
  spot: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke-dasharray="3 2.5"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>',
  wand: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20 15 9"/><path d="M17 3v4M15 5h4M20 9v2M19 10h2M11 3v2M10 4h2"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  contrast: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/></svg>',
  black: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>',
  white: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/></svg>',
  halo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2 2.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/></svg>',
  leak: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M20 3v18"/><path d="M20 6c-5 1-9 3-12 6 3 3 7 5 12 6"/></svg>',
  grain: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="7" r="1.4"/><circle cx="12" cy="5" r="1"/><circle cx="17" cy="9" r="1.5"/><circle cx="8" cy="13" r="1"/><circle cx="14" cy="14" r="1.4"/><circle cx="19" cy="17" r="1"/><circle cx="7" cy="19" r="1.5"/><circle cx="13" cy="20" r="1"/></svg>',
  dust: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="6" r="0.9" fill="currentColor"/><path d="M5 18c4-2 8 1 14-3"/></svg>',
  drop: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
  warm: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/></svg>',
  soft: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9" stroke-opacity="0.4"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  undo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  original: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>',
  rotate: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
  shift: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>',
  dice: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>',
  mix: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
};

const sign = (v: number, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
const pct = (v: number) => `${Math.round(v * 100)}`;
const hundred = (v: number) => sign(v * 100);

function photoControls(ch: 'bottom' | 'top'): { faders: Control[]; knobs: Control[] } {
  const p = (e: FrameEdit): PhotoEdit => e[ch];
  const c = (id: keyof PhotoEdit, label: string, icon: IconId, min: number, max: number, step: number, fmt: (v: number) => string, bipolar = false, tint?: string): Control => ({
    id: `${ch}.${id}`,
    label,
    icon,
    min,
    max,
    step,
    bipolar,
    tint,
    fmt,
    get: (e) => p(e)[id] as number,
    set: (e, v) => ((p(e) as unknown as Record<string, number>)[id] = v),
  });
  return {
    faders: [
      c('light', 'Light', 'sun', -2, 2, 0.1, (v) => sign(v, 1), true),
      c('contrast', 'Contrast', 'contrast', -1, 1, 0.01, hundred, true),
      c('black', 'Black', 'black', -1, 1, 0.01, hundred, true),
      c('whites', 'Whites', 'white', -1, 1, 0.01, hundred, true),
      c('glow', 'Glow', 'halo', 0, 2, 0.05, pct),
    ],
    knobs: [
      c('color', 'Colour', 'drop', -1, 1, 0.01, hundred, true, ch === 'top' ? '#64d2ff' : '#ffb340'),
      c('warmth', 'Warmth', 'warm', -1, 1, 0.01, hundred, true, '#ff9f0a'),
      c('soft', 'Soft', 'soft', 0, 1, 0.01, pct, false, '#ffffff'),
    ],
  };
}

function mixControls(): { faders: Control[]; knobs: Control[] } {
  const c = (id: keyof MixEdit, label: string, icon: IconId, min: number, max: number, step: number, fmt: (v: number) => string, bipolar = false): Control => ({
    id: `mix.${id}`,
    label,
    icon,
    min,
    max,
    step,
    bipolar,
    tint: '#ffffff',
    fmt,
    get: (e) => e.mix[id],
    set: (e, v) => (e.mix[id] = v),
  });
  return {
    faders: [
      { ...c('balance', 'Balance', 'mix', -3, 3, 0.05, (v) => sign(v, 1), true), ends: true },
      c('whites', 'Whites', 'white', 0, 10, 1, (v) => String(v)),
      c('halo', 'Halo', 'halo', 0, 2, 0.05, pct),
      c('leaks', 'Leaks', 'leak', 0, 2, 0.05, pct),
      c('contrast', 'Contrast', 'contrast', -1, 1, 0.01, hundred, true),
      c('black', 'Black', 'black', -1, 1, 0.01, hundred, true),
    ],
    knobs: [c('dust', 'Dust', 'dust', 0, 1, 0.05, pct), c('glow', 'Glow', 'soft', 0, 2, 0.05, pct)],
  };
}

export interface EditorHost {
  app: HTMLElement;
  dev: Development;
  frame: number;
  onClose: (dev: Development, changed: boolean) => void;
}

export async function openEditor(host: EditorHost): Promise<void> {
  const { app, frame: i } = host;
  migrateMixTools();
  const turns = frameTurns(host.dev, i);
  const previewSource = document.createElement('canvas');
  const zoom: PhotoZoom = { scale: 1, x: 0, y: 0 };
  let clearZoom: (() => void) | undefined;
  let dev = host.dev;
  let closed = false;
  let saving = false;
  const fullPpm = dev.params.ppm;
  app.innerHTML = `<div class="screen dark mixer"><div class="edit-busy"><span class="spinner"></span></div></div>`;

  let renderer: FrameRenderer;
  try {
    renderer = await FrameRenderer.open(dev, 1700);
  } catch (e) {
    app.innerHTML = `<div class="screen dark mixer"><div class="edit-busy">${esc((e as Error).message)}<button type="button" class="capsule glass" data-ed="cancel">Back</button></div></div>`;
    app.querySelector('[data-ed="cancel"]')?.addEventListener('click', () => host.onClose(dev, false));
    return;
  }
  const recipe = renderer.recipe;
  const base = baseEdit(recipe, i, dev.params.whiteMerge ?? 0, dev.params.haloAmount ?? 1);
  const saved = storedEdit(dev.edits?.[i]);
  let edit: FrameEdit = structuredClone(saved ?? base);
  const hadEdit = !!dev.edits?.[i];
  const undo: FrameEdit[] = [];
  let snapshot = structuredClone(edit);
  let channel: Channel = 'mix';
  // инструмент «Гало»: точки (spot) и волшебная палочка (wand)
  let tool: 'none' | 'glow' = 'none';
  let glowMode: GlowItem['kind'] = 'wand';
  let glowSource: GlowItem['source'] = 'bottom';
  let glowSel = -1;
  const glowNext = { r: 5, tol: 0.35, strength: 1.2 };
  const rng = new Rng(randomSeed());

  // миниатюры снимков этого кадра: нижний — кадр первой плёнки, верхний — тот кадр второй, что больше всего в окне
  const shapes = {
    a: renderer.rolls[0].photos.map((p) => ({ portrait: p.h > p.w })),
    b: renderer.rolls[1].photos.map((p) => ({ portrait: p.h > p.w })),
  };
  // при сдвиге в окно может встать другой кадр второй плёнки — тогда миниатюра Top меняется
  const mainB = (e: FrameEdit): number | null => {
    const { j } = topFrameAt(i, e.mix.shiftMm);
    if (j < 0 || j >= recipe.n) return null;
    return placements(editedRecipe(recipe, i, e), shapes.a, shapes.b).b[j].photo;
  };
  const thumbUrl = async (roll: string, photo: number | null) => {
    const blob = photo === null ? null : await rollThumb(roll, photo);
    return blob ? URL.createObjectURL(blob) : '';
  };
  const mainA = (e: FrameEdit): number | null => {
    const { j } = topFrameAt(i, e.mix.bottomShiftMm);
    return j < 0 || j >= recipe.n ? null : recipe.orderA[j];
  };
  let photoA = mainA(edit);
  let urlA = await thumbUrl(dev.rollA, photoA);
  let photoB = mainB(edit);
  let urlB = await thumbUrl(dev.rollB, photoB);
  let thumbGeneration = 0;
  async function refreshTopThumb() {
    const a = mainA(edit), b = mainB(edit);
    if (a === photoA && b === photoB) return;
    const generation = ++thumbGeneration;
    const [nextA, nextB] = await Promise.all([thumbUrl(dev.rollA, a), thumbUrl(dev.rollB, b)]);
    if (closed || generation !== thumbGeneration) {
      for (const url of [nextA, nextB]) if (url) URL.revokeObjectURL(url);
      return;
    }
    for (const url of [urlA, urlB]) if (url) URL.revokeObjectURL(url);
    photoA = a; photoB = b; urlA = nextA; urlB = nextB;
    if (tool === 'none') paint();
  }

  const previewPx = Math.min(1400, Math.round(Math.min(window.innerWidth, 760) * Math.min(window.devicePixelRatio || 1, 3)));
  const ppm = previewPx / FRAME_W;

  // --- предпросмотр: не больше одного пересчёта одновременно, последний запрос не теряется ---
  let busy = false;
  let pending = false;
  let lastImg: ImageData | null = null;
  async function draw() {
    if (closed || saving) return;
    if (busy) {
      pending = true;
      return;
    }
    busy = true;
    try {
      const img = await renderer.render(i, structuredClone(edit), ppm);
      if (closed || saving) return;
      lastImg = img;
      putPreview();
    } catch (e) {
      if (closed || saving || (e as Error).name === 'AbortError') return;
      const c = app.querySelector('.edit-count');
      if (c) c.textContent = (e as Error).message;
    } finally { busy = false; }

    if (pending && !closed && !saving) {
      pending = false;
      void draw();
    }
  }
  function putPreview() {
    const cv = app.querySelector<HTMLCanvasElement>('#edit-canvas');
    if (!cv || !lastImg) return;
    previewSource.width = lastImg.width;
    previewSource.height = lastImg.height;
    previewSource.getContext('2d')!.putImageData(lastImg, 0, 0);
    drawOriented(cv, previewSource, lastImg.width, lastImg.height, turns);
  }

  function commit() {
    if (JSON.stringify(snapshot) === JSON.stringify(edit)) return;
    undo.push(snapshot);
    snapshot = structuredClone(edit);
    const u = app.querySelector<HTMLButtonElement>('[data-ed="undo"]');
    if (u) u.disabled = false;
    void refreshTopThumb();
  }

  /** Крутилки инструмента «Гало»: относятся к выбранной точке, а если ничего не выбрано — к следующей. */
  function glowControls(): Control[] {
    const item = (e: FrameEdit) => e.glows[glowSel] ?? (glowNext as unknown as GlowItem);
    const knob = (id: 'r' | 'tol' | 'strength', label: string, icon: IconId, min: number, max: number, step: number, fmt: (v: number) => string, tint: string): Control => ({
      id: `glow.${id}`, label, icon, min, max, step, tint, fmt,
      get: (e) => item(e)[id],
      set: (e, v) => {
        if (e.glows[glowSel]) e.glows[glowSel][id] = v;
        else glowNext[id] = v;
      },
    });
    const hue: Control = {
      id: 'glow.hue', label: 'Colour', icon: 'warm', min: -1, max: 1, step: 0.05, bipolar: true, tint: '#ff9f0a',
      fmt: (v) => (v < -0.3 ? 'orange' : v > 0.3 ? 'red' : 'coral'), get: (e) => e.glowHue, set: (e, v) => (e.glowHue = v),
    };
    const first = glowMode === 'spot'
      ? knob('r', 'Radius', 'soft', 1, 12, 0.5, (v) => `${v.toFixed(1)} mm`, '#ffffff')
      : knob('tol', 'Tolerance', 'contrast', 0, 1, 0.05, pct, '#ffffff');
    return [first, knob('strength', 'Strength', 'halo', 0, 2, 0.05, pct, '#ff5a36'), hue];
  }

  const range = shiftRange(recipe, i);
  const layerShift = (id: 'shiftMm' | 'bottomShiftMm', label: string): Control => ({
    id: id === 'shiftMm' ? 'mix.shift' : 'mix.bottomShift', label, icon: 'shift',
    min: range.min, max: range.max, step: 0.1, tint: '#ffffff', speed: 0.5, vertical: true,
    get: e => e.mix[id],
    set: (e, v) => { e.mix[id] = Math.max(range.min, Math.min(range.max, v)); },
    fmt: v => `${sign(v, 1)} mm`,
  });
  const shiftKnobs = [layerShift('shiftMm', 'Top'), layerShift('bottomShiftMm', 'Bottom')];
  const controls = () => {
    if (tool === 'glow') return { faders: [], knobs: glowControls() };
    if (channel !== 'mix') return photoControls(channel);
    const m = mixControls();
    return { ...m, knobs: [...shiftKnobs, ...m.knobs] };
  };
  const all = () => { const c = controls(); return [...c.faders, ...c.knobs]; };
  const changed = (c: Control) => Math.abs(c.get(edit) - c.get(base)) > 1e-6;
  const frac = (c: Control, v: number) => (v - c.min) / (c.max - c.min);

  function faderHtml(c: Control): string {
    const end = (url: string, turns: number) => `<span class="mthumb bend" aria-hidden="true">${url ? `<img src="${url}" alt="" style="transform: rotate(${-turns * 90}deg)">` : ''}</span>`;
    const left = c.ends ? end(urlA, edit.bottom.turns) : `<span class="ficon" aria-hidden="true">${c.plain ? '' : ICONS[c.icon]}</span>`;
    return `<div class="control-caption"><span>${c.label}</span><output data-value="${c.id}">${c.fmt(c.get(edit))}</output></div><div class="hrow${changed(c) ? ' on' : ''}${c.ends ? ' ends' : ''}" data-c="${c.id}">
      ${left}
      <div class="htrack" role="slider" tabindex="0" aria-label="${c.label}" aria-valuemin="${c.min}" aria-valuemax="${c.max}" aria-valuenow="${c.get(edit)}">
        ${c.bipolar ? '<i class="hzero"></i>' : ''}<i class="hfill"></i><i class="hthumb"></i>
      </div>
      ${c.ends ? end(urlB, edit.top.turns) : ''}
    </div>`;
  }
  function knobHtml(c: Control, cls = ''): string {
    return `<div class="knob${cls}${changed(c) ? ' on' : ''}" data-c="${c.id}" role="slider" tabindex="0" aria-label="${c.label}" aria-valuemin="${c.min}" aria-valuemax="${c.max}" aria-valuenow="${c.get(edit)}">
      <svg width="50" height="50" viewBox="0 0 54 54" aria-hidden="true">
        <circle cx="27" cy="27" r="23" fill="#1c1c1e" stroke="rgba(255,255,255,0.10)" stroke-width="4"/>
        <circle class="karc" cx="27" cy="27" r="23" fill="none" stroke="${c.tint ?? '#fff'}" stroke-width="4" stroke-linecap="round"/>
        <line class="kptr" x1="27" y1="27" x2="27" y2="12" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <circle cx="27" cy="27" r="4" fill="#fff"/>
      </svg>
      <small>${c.label}</small>
    </div>`;
  }

  /** Обновляет вид одного регулятора без перерисовки экрана (иначе оборвётся жест). */
  function updateControl(c: Control) {
    const el = app.querySelector<HTMLElement>(`[data-c="${c.id}"]`);
    if (!el) return;
    const v = c.get(edit);
    const output = app.querySelector(`[data-value="${c.id}"]`);
    if (output) output.textContent = c.fmt(v);
    updatePanelChanges(panelId(), new Set(all().filter(changed).map((item) => item.id)));
    el.classList.toggle('on', changed(c));
    const slider = el.matches('[role="slider"]') ? el : el.querySelector<HTMLElement>('[role="slider"]');
    slider?.setAttribute('aria-valuenow', String(v));
    const t = frac(c, v);
    if (el.classList.contains('hrow')) {
      const fill = el.querySelector<HTMLElement>('.hfill')!;
      fill.style.left = `${c.bipolar ? Math.min(50, t * 100) : 0}%`;
      fill.style.width = `${c.bipolar ? Math.abs(t - 0.5) * 100 : t * 100}%`;
      el.querySelector<HTMLElement>('.hthumb')!.style.left = `${t * 100}%`;
    } else {
      const C = 2 * Math.PI * 23;
      const arc = el.querySelector<SVGCircleElement>('.karc')!;
      if (c.bipolar) {
        const len = Math.abs(t - 0.5) * 0.75 * C;
        arc.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${C.toFixed(1)}`);
        arc.setAttribute('transform', `rotate(${t >= 0.5 ? 270 : 270 - (0.5 - t) * 270} 27 27)`);
      } else {
        arc.setAttribute('stroke-dasharray', `${(t * 0.75 * C).toFixed(1)} ${C.toFixed(1)}`);
        arc.setAttribute('transform', 'rotate(135 27 27)');
      }
      const ang = ((135 + t * 270) * Math.PI) / 180;
      const ptr = el.querySelector('.kptr')!;
      ptr.setAttribute('x2', (27 + 15 * Math.cos(ang)).toFixed(1));
      ptr.setAttribute('y2', (27 + 15 * Math.sin(ang)).toFixed(1));
    }
  }

  function glowPill(): string {
    const n = edit.glows.length;
    return `<button type="button" class="mpill${n ? ' on' : ''}" data-ed="glow" aria-label="Contour halo on a bright object">${ICONS.wand}<span>Halo${n ? ` ${n}` : ''}</span></button>`;
  }

  function actionsHtml(): string {
    if (channel === 'mix') {
      return `<div class="mactions">${glowPill()}
        <button type="button" class="mpill" data-ed="dice" aria-label="New random light leak">${ICONS.dice}<span>Leak</span></button>
      </div>`;
    }
    const turns = edit[channel].turns;
    const on = turns !== base[channel].turns;
    return `<div class="mactions"><button type="button" class="mpill${on ? ' on' : ''}" data-ed="rotate" aria-label="Rotate this photo by 90°, now ${turns * 90}°">${ICONS.rotate}<span>${turns * 90}°</span></button>${glowPill()}</div>`;
  }

  function tabHtml(ch: Channel): string {
    const on = ch === channel;
    const label = { bottom: 'Bottom', top: 'Top', mix: 'Mix' }[ch];
    const url = ch === 'bottom' ? urlA : urlB;
    const turns = ch === 'mix' ? 0 : edit[ch].turns;
    const art = ch === 'mix' ? ICONS.mix : url ? `<img src="${url}" alt="" style="transform: rotate(${-turns * 90}deg)">` : '';
    return `<button type="button" role="tab" aria-selected="${on}" class="mtab${on ? ' on' : ''}" data-ed="channel" data-arg="${ch}"><span class="mthumb">${art}</span>${label}</button>`;
  }

  /** Метки инструмента «Гало» поверх превью: круги точек и номера мест палочки. */
  function marksHtml(): string {
    return edit.glows
      .map((g, k) => {
        const point = rotatePoint(g.x / FRAME_W, g.y / FRAME_H, turns);
        const left = point.x * 100;
        const top = point.y * 100;
        const on = k === glowSel ? ' on' : '';
        if (g.kind === 'spot') {
          const w = ((2 * g.r) / (turns % 2 ? FRAME_H : FRAME_W)) * 100;
          const h = ((2 * g.r) / (turns % 2 ? FRAME_W : FRAME_H)) * 100;
          return `<span class="gspot${on}" style="left:${left - w / 2}%;top:${top - h / 2}%;width:${w}%;height:${h}%"></span><span class="gdot${on}" style="left:${left}%;top:${top}%">${k + 1}</span>`;
        }
        return `<span class="gdot wand${on}" style="left:${left}%;top:${top}%">${k + 1}</span>`;
      })
      .join('');
  }

  const panelId = () => tool === 'glow' ? `edit.glow.${glowMode}` : `edit.${channel}`;
  function controlPanel(): string {
    const c = controls();
    const knobs = c.knobs;
    const primary = tool === 'glow' ? knobs.map((k) => k.id) : channel === 'mix'
      ? ['mix.shift', 'mix.bottomShift', 'mix.balance', 'mix.whites', 'mix.leaks', 'mix.halo']
      : [`${channel}.color`, `${channel}.warmth`, `${channel}.light`, `${channel}.contrast`];
    const items: PanelItem[] = [
      ...knobs.map((k) => ({ id: k.id, label: k.label, kind: 'knob' as const, html: knobHtml(k, shiftKnobs.includes(k) ? ' coarse' : ''), changed: changed(k) })),
      ...c.faders.map((k) => ({ id: k.id, label: k.label, kind: 'row' as const, html: faderHtml(k), changed: changed(k) })),
    ];
    items.forEach((item) => { item.placement = primary.includes(item.id) ? 'main' : 'more'; });
    return panelHtml(panelId(), tool === 'glow' ? 'Glow' : { bottom: 'Bottom photo', top: 'Top photo', mix: 'Mix' }[channel], items, paint);
  }

  function paintGlow() {
    clearZoom?.();
    const c = glowControls();
    const panel = controlPanel();
    const src = (id: GlowItem['source'], label: string, art: string) =>
      `<button type="button" role="tab" aria-selected="${glowSource === id}" class="mtab${glowSource === id ? ' on' : ''}" data-ed="glow-src" data-arg="${id}"><span class="mthumb">${art}</span>${label}</button>`;
    const chips = edit.glows
      .map((g, k) => `<button type="button" class="gchip${k === glowSel ? ' on' : ''}" data-ed="glow-sel" data-arg="${k}" aria-label="Glow ${k + 1}">${g.kind === 'spot' ? ICONS.spot : ICONS.wand}${k + 1}</button>`)
      .join('');
    app.innerHTML = `<div class="screen dark mixer glow">
      <div class="mbar">
        <button type="button" class="round-btn big" data-ed="glow-exit" aria-label="Back to the mixer">${ICONS.x}</button>
        <div class="gmode" role="radiogroup" aria-label="Glow tool">
          <button type="button" role="radio" aria-checked="${glowMode === 'spot'}" data-ed="glow-mode" data-arg="spot">${ICONS.spot}Spot</button>
          <button type="button" role="radio" aria-checked="${glowMode === 'wand'}" data-ed="glow-mode" data-arg="wand">${ICONS.wand}Wand</button>
        </div>
        <button type="button" class="round-btn big yes" data-ed="glow-exit" aria-label="Done with glow">${ICONS.check}</button>
      </div>
      <div class="epreview${turns % 2 ? ' portrait' : ''}"><div class="preview-content">
        <canvas id="edit-canvas" width="${previewPx}" height="${Math.round((previewPx * 3) / 4)}" aria-label="Frame ${i + 1} preview — tap to add glow"></canvas>
        <div class="gmarks">${marksHtml()}</div>
      </div></div>
      <p class="edit-count" aria-live="polite"></p>
      <div class="mtabs" role="tablist" aria-label="Glow comes from">
        ${src('bottom', 'Bottom', urlA ? `<img src="${urlA}" alt="" style="transform: rotate(${-edit.bottom.turns * 90}deg)">` : '')}
        ${src('top', 'Top', urlB ? `<img src="${urlB}" alt="" style="transform: rotate(${-edit.top.turns * 90}deg)">` : '')}
        ${src('both', 'Both', ICONS.mix)}
      </div>
      <div class="gchips">${chips}<span class="ghint">${ICONS.spark}${glowMode === 'spot' ? 'Tap the photo to add a spot' : 'Tap a bright object'}</span></div>
      <div class="editor-tools">${panel}</div>
      <div class="mactions">${layoutButton(panelId())}${glowSel >= 0 ? `<button type="button" class="mpill danger" data-ed="glow-del">${ICONS.trash}<span>Delete</span></button>` : ''}</div>
    </div>`;
    c.forEach(updateControl);
    bindPreviewZoom();
    putPreview();
    void draw();
  }

  function paint() {
    if (tool === 'glow') return paintGlow();
    clearZoom?.();
    const scroll = app.querySelector('.editor-tools')?.scrollTop ?? 0;
    const panel = controlPanel();
    app.innerHTML = `<div class="screen dark mixer">
      <div class="mbar">
        <button type="button" class="round-btn big" data-ed="cancel" aria-label="Cancel">${ICONS.x}</button>
        <div class="mbar-mid">
          <button type="button" class="round-btn big" data-ed="original" aria-label="Hold to see the frame before edits">${ICONS.original}</button>
          <button type="button" class="round-btn big" data-ed="undo" aria-label="Undo" ${undo.length ? '' : 'disabled'}>${ICONS.undo}</button>
          ${layoutButton(panelId())}
        </div>
        <button type="button" class="round-btn big yes" data-ed="done" aria-label="Done">${ICONS.check}</button>
      </div>
      <div class="epreview${turns % 2 ? ' portrait' : ''}"><div class="preview-content">
        <canvas id="edit-canvas" width="${previewPx}" height="${Math.round((previewPx * 3) / 4)}" aria-label="Frame ${i + 1} preview"></canvas>
        <img id="edit-original" alt="" hidden>
      </div></div>
      <p class="edit-count" aria-live="polite"></p>
      <div class="mtabs" role="tablist" aria-label="Channel">${(['bottom', 'top', 'mix'] as Channel[]).map(tabHtml).join('')}</div>
      <div class="editor-tools">${panel}</div>
      ${actionsHtml()}
    </div>`;
    all().forEach(updateControl);
    app.querySelector('.editor-tools')!.scrollTop = scroll;
    putPreview();
    bindOriginal();
    bindPreviewZoom();
    void draw();
  }

  // --- жесты: фейдер — палец по высоте; крутилка — вверх/вправо больше; двойное касание — сброс ---
  let drag: null | { c: Control; el: HTMLElement; kind: 'fader' | 'knob'; x0: number; y0: number; v0: number; id: number } = null;
  let lastTap = { id: '', t: 0 };
  const snap = (c: Control, v: number) => Math.max(c.min, Math.min(c.max, Math.round(v / c.step) * c.step));

  function valueAt(e: PointerEvent): number {
    const d = drag!;
    if (d.kind === 'fader') {
      // ползунок едет за пальцем относительно места касания — без скачка при нажатии
      const w = d.el.querySelector('.htrack')!.getBoundingClientRect().width;
      return snap(d.c, d.v0 + ((e.clientX - d.x0) / w) * (d.c.max - d.c.min));
    }
    // крутилка — движением пальца вбок, как на экране перед проявкой: вправо — больше; полный ход ≈ 500 px.
    // крутилка сдвига — вверх-вниз: вверх — больше
    const dx = d.c.vertical ? d.y0 - e.clientY : e.clientX - d.x0;
    return snap(d.c, d.v0 + (d.c.speed ? dx * d.c.speed : (dx / 500) * (d.c.max - d.c.min)));
  }

  let glowDrag: null | { id: number; k: number } = null;
  /** Точка превью → мм внутри кадра. */
  function frameMm(e: PointerEvent): { x: number; y: number } | null {
    const cv = app.querySelector<HTMLCanvasElement>('#edit-canvas');
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const point = rotatePoint((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, -turns);
    const x = point.x * FRAME_W;
    const y = point.y * FRAME_H;
    return x < 0 || y < 0 || x > FRAME_W || y > FRAME_H ? null : { x, y };
  }
  function bindPreviewZoom() {
    let before: GlowItem[] = [], selected = -1;
    clearZoom = bindPhotoZoom(app.querySelector('.epreview')!, app.querySelector('.preview-content')!, {
      state: zoom, doubleTap: tool !== 'glow',
      onStart: () => { before = structuredClone(edit.glows); selected = glowSel; },
      onNavigate: () => {
        if (tool !== 'glow') return;
        // A pinch/pan must not leave behind a glow from its first finger.
        glowDrag = null; edit.glows = before; glowSel = selected;
        repaintMarks(); void draw();
      },
    });
  }
  function repaintMarks() {
    const m = app.querySelector('.gmarks');
    if (m) m.innerHTML = marksHtml();
  }

  const onDown = (e: PointerEvent) => {
    if (saving || closed) return;
    const target = e.target as HTMLElement;
    if (tool === 'glow' && target.closest('.epreview')) {
      const at = frameMm(e);
      if (!at) return;
      e.preventDefault();
      let k = edit.glows.findIndex((g) => Math.hypot(g.x - at.x, g.y - at.y) < 2.5);
      if (k < 0) {
        edit.glows.push({ kind: glowMode, source: glowSource, x: at.x, y: at.y, r: glowNext.r, tol: glowNext.tol, strength: glowNext.strength });
        k = edit.glows.length - 1;
        void draw();
      }
      glowSel = k;
      glowMode = edit.glows[k].kind;
      glowDrag = { id: e.pointerId, k };
      app.querySelector('.epreview')!.setPointerCapture(e.pointerId);
      return;
    }
    const el = target.closest<HTMLElement>('[data-c]');
    if (!el) return;
    const c = all().find((x) => x.id === el.dataset.c);
    if (!c) return;
    e.preventDefault();
    const now = performance.now();
    if (lastTap.id === c.id && now - lastTap.t < 320) {
      if (c.reset) c.reset(edit);
      else c.set(edit, c.get(base)); // двойное касание — значение проявки
      lastTap = { id: '', t: 0 };
      afterChange(c, el);
      commit();
      return;
    }
    lastTap = { id: c.id, t: now };
    const kind = el.classList.contains('hrow') ? 'fader' : 'knob';
    drag = { c, el, kind, x0: e.clientX, y0: e.clientY, v0: c.get(edit), id: e.pointerId };
    drag.el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (glowDrag && e.pointerId === glowDrag.id) {
      const at = frameMm(e);
      if (!at) return;
      const g = edit.glows[glowDrag.k];
      g.x = at.x;
      g.y = at.y;
      repaintMarks();
      void draw();
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const v = valueAt(e);
    if (v === drag.c.get(edit)) return;
    drag.c.set(edit, v);
    afterChange(drag.c, drag.el);
  };
  const onUp = (e: PointerEvent) => {
    if (glowDrag && e.pointerId === glowDrag.id) {
      glowDrag = null;
      commit();
      paintGlow();
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    commit();
  };
  function afterChange(c: Control, _el: HTMLElement) {
    // обе крутилки сдвига показывают одно значение
    if (shiftKnobs.includes(c)) shiftKnobs.forEach(updateControl);
    else updateControl(c);
    if (tool === 'glow') repaintMarks();
    void draw();
  }
  // клавиатура: стрелки двигают регулятор в фокусе
  const onKey = (e: KeyboardEvent) => {
    if (saving || closed) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
    if (!el || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const c = all().find((x) => x.id === el.dataset.c);
    if (!c) return;
    e.preventDefault();
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1;
    c.set(edit, snap(c, c.get(edit) + dir * Math.max(c.step, (c.max - c.min) / 40)));
    afterChange(c, el);
    commit();
  };

  // --- «Original»: держишь — видишь кадр до правок ---
  let originalUrl = '';
  function bindOriginal() {
    const btn = app.querySelector<HTMLButtonElement>('[data-ed="original"]');
    const img = app.querySelector<HTMLImageElement>('#edit-original');
    if (!btn || !img) return;
    let held = false;
    const show = async () => {
      held = true;
      if (!originalUrl) {
        const blob = await orientedBlob(await devOriginal(dev.id, i), turns, 1800);
        if (blob && !closed) originalUrl = URL.createObjectURL(blob);
      }
      if (!held || closed || !img.isConnected) return;
      img.src = originalUrl;
      img.hidden = false;
    };
    const hide = () => { held = false; img.hidden = true; };
    btn.addEventListener('pointerdown', () => void show());
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, hide);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const onClick = async (e: Event) => {
    if (saving || closed) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]');
    if (!el) return;
    const arg = el.dataset.arg ?? '';
    switch (el.dataset.ed) {
      case 'channel':
        channel = arg as Channel;
        return paint();
      case 'rotate':
        if (channel !== 'mix') edit[channel].turns = (edit[channel].turns + 1) % 4;
        commit();
        return paint();
      case 'glow':
        tool = 'glow';
        glowSource = channel === 'mix' ? 'both' : channel;
        glowSel = edit.glows.length ? 0 : -1;
        glowMode = glowSel >= 0 ? edit.glows[0].kind : 'wand';
        return paint();
      case 'glow-exit':
        tool = 'none';
        return paint();
      case 'glow-mode':
        glowMode = arg as GlowItem['kind'];
        glowSel = -1;
        return paint();
      case 'glow-src':
        glowSource = arg as GlowItem['source'];
        if (edit.glows[glowSel]) {
          edit.glows[glowSel].source = glowSource;
          commit();
        }
        return paint();
      case 'glow-sel':
        glowSel = Number(arg);
        glowMode = edit.glows[glowSel].kind;
        glowSource = edit.glows[glowSel].source;
        return paint();
      case 'glow-del':
        edit.glows.splice(glowSel, 1);
        glowSel = -1;
        commit();
        return paint();
      case 'dice': {
        // новая случайная засветка вместо прежних у этого кадра
        edit.leaks = [randomLeak(rng, i)];
        if (edit.mix.leaks === 0) edit.mix.leaks = 1;
        commit();
        return paint();
      }
      case 'undo': {
        const prev = undo.pop();
        if (!prev) return;
        edit = prev;
        snapshot = structuredClone(edit);
        void refreshTopThumb();
        return paint();
      }
      case 'cancel':
        return close(false);
      case 'done':
        return save();
    }
  };

  app.addEventListener('pointerdown', onDown);
  app.addEventListener('pointermove', onMove);
  app.addEventListener('pointerup', onUp);
  app.addEventListener('pointercancel', onUp);
  app.addEventListener('keydown', onKey);
  app.addEventListener('click', onClick);

  function detach() {
    clearZoom?.();
    app.removeEventListener('pointerdown', onDown);
    app.removeEventListener('pointermove', onMove);
    app.removeEventListener('pointerup', onUp);
    app.removeEventListener('pointercancel', onUp);
    app.removeEventListener('keydown', onKey);
    app.removeEventListener('click', onClick);
    for (const u of [urlA, urlB, originalUrl]) if (u) URL.revokeObjectURL(u);
  }

  function close(changedFrame: boolean) {
    if (closed) return;
    closed = true;
    pending = false;
    detach();
    renderer.dispose();
    previewSource.width = previewSource.height = 1;
    host.onClose(dev, changedFrame);
  }

  async function save() {
    if (saving || closed) return;
    const unchanged = countChanges(edit, base) === 0;
    if (unchanged && !hadEdit) return close(false);
    saving = true;
    pending = false;
    const busyBox = document.createElement('div');
    busyBox.className = 'edit-busy overlay-busy';
    busyBox.innerHTML = '<span class="spinner"></span>';
    app.querySelector('.mixer')?.append(busyBox);
    try {
      if (unchanged) {
        dev = await resetEditedFrame(dev, i);
      } else {
        renderer.dispose();
        const full = await FrameRenderer.open(dev, Math.min(4000, Math.round(36 * fullPpm * 1.15)));
        try {
          const img = await full.render(i, edit, fullPpm);
          const [jpeg, thumb] = await encodeFrame(img);
          dev = await saveEditedFrame(dev, i, edit, jpeg, thumb);
        } finally {
          full.dispose();
        }
      }
      close(true);
    } catch (e) {
      busyBox.textContent = `Couldn’t save: ${(e as Error).message}`;
      setTimeout(() => busyBox.remove(), 3000);
      try { renderer.dispose(); renderer = await FrameRenderer.open(dev, 1700); } catch { /* The next save can retry; Cancel remains available. */ }
    } finally { saving = false; }
  }

  paint();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
