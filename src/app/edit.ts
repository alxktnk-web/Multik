// Правка кадра — «пульт» (макет «Multik — Edit panel», v2, утверждён Александром 14.10.2026).
// Сверху превью, ниже три канала: Bottom (снимок первой плёнки), Top (снимок второй), Mix (общее).
// У снимков — свет, контраст, чёрное, белое, свечение, цвет, тепло, мягкость, поворот: всё до наложения,
// поэтому в превью сразу видно, как меняется их взаимодействие. Done — кадр в полном размере.

import {
  baseEdit,
  countChanges,
  editedRecipe,
  storedEdit,
  type Channel,
  type FrameEdit,
  type MixEdit,
  type PhotoEdit,
} from '../core/edit';
import { FRAME_W, frameA } from '../core/geometry';
import { placements, randomLeak } from '../core/recipe';
import { Rng, randomSeed } from '../core/rng';
import { FrameRenderer, encode } from './develop';
import { devOriginal, resetEditedFrame, rollThumb, saveEditedFrame, type Development } from './store';

type IconId = 'sun' | 'contrast' | 'black' | 'white' | 'halo' | 'leak' | 'grain' | 'dust' | 'drop' | 'warm' | 'soft';

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
}

const ICONS: Record<IconId | 'x' | 'check' | 'undo' | 'original' | 'rotate' | 'shift' | 'dice' | 'mix', string> = {
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
      c('whites', 'Whites', 'white', 0, 10, 1, (v) => String(v)),
      c('halo', 'Halo', 'halo', 0, 2, 0.05, pct),
      c('leaks', 'Leaks', 'leak', 0, 2, 0.05, pct),
      c('contrast', 'Contrast', 'contrast', -1, 1, 0.01, hundred, true),
      c('black', 'Black', 'black', -1, 1, 0.01, hundred, true),
    ],
    knobs: [c('grain', 'Grain', 'grain', 0, 2, 0.05, pct), c('dust', 'Dust', 'dust', 0, 1, 0.05, pct), c('glow', 'Glow', 'soft', 0, 2, 0.05, pct)],
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
  let dev = host.dev;
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
  const base = baseEdit(recipe, i, dev.params.whiteMerge ?? 0);
  const saved = storedEdit(dev.edits?.[i]);
  let edit: FrameEdit = structuredClone(saved ?? base);
  const hadEdit = !!dev.edits?.[i];
  const undo: FrameEdit[] = [];
  let snapshot = structuredClone(edit);
  let channel: Channel = 'bottom';
  const rng = new Rng(randomSeed());

  // миниатюры снимков этого кадра: нижний — кадр первой плёнки, верхний — тот кадр второй, что больше всего в окне
  const shapes = {
    a: renderer.rolls[0].photos.map((p) => ({ portrait: p.h > p.w })),
    b: renderer.rolls[1].photos.map((p) => ({ portrait: p.h > p.w })),
  };
  const { b: placedB } = placements(editedRecipe(recipe, i, base), shapes.a, shapes.b);
  const f = frameA(i);
  const mainB = placedB.reduce((best, p) => {
    const ov = Math.max(0, Math.min(p.rect.x + p.rect.w, f.x + f.w) - Math.max(p.rect.x, f.x));
    return ov > best.ov ? { ov, photo: p.photo } : best;
  }, { ov: -1, photo: 0 }).photo;
  const [thumbA, thumbB] = await Promise.all([rollThumb(dev.rollA, recipe.orderA[i]), rollThumb(dev.rollB, mainB)]);
  const urlA = thumbA ? URL.createObjectURL(thumbA) : '';
  const urlB = thumbB ? URL.createObjectURL(thumbB) : '';

  const previewPx = Math.min(1400, Math.round(Math.min(window.innerWidth, 760) * Math.min(window.devicePixelRatio || 1, 3)));
  const ppm = previewPx / FRAME_W;

  // --- предпросмотр: не больше одного пересчёта одновременно, последний запрос не теряется ---
  let busy = false;
  let pending = false;
  let lastImg: ImageData | null = null;
  async function draw() {
    if (busy) {
      pending = true;
      return;
    }
    busy = true;
    try {
      lastImg = await renderer.render(i, edit, ppm);
      putPreview();
    } catch (e) {
      const c = app.querySelector('.edit-count');
      if (c) c.textContent = (e as Error).message;
    }
    busy = false;
    if (pending) {
      pending = false;
      void draw();
    }
  }
  function putPreview() {
    const cv = app.querySelector<HTMLCanvasElement>('#edit-canvas');
    if (!cv || !lastImg) return;
    if (cv.width !== lastImg.width || cv.height !== lastImg.height) {
      cv.width = lastImg.width;
      cv.height = lastImg.height;
    }
    cv.getContext('2d')!.putImageData(lastImg, 0, 0);
  }

  function commit() {
    if (JSON.stringify(snapshot) === JSON.stringify(edit)) return;
    undo.push(snapshot);
    snapshot = structuredClone(edit);
    const u = app.querySelector<HTMLButtonElement>('[data-ed="undo"]');
    if (u) u.disabled = false;
  }

  const controls = () => (channel === 'mix' ? mixControls() : photoControls(channel));
  const all = () => {
    const c = controls();
    return [...c.faders, ...c.knobs];
  };
  const changed = (c: Control) => Math.abs(c.get(edit) - c.get(base)) > 1e-6;
  const frac = (c: Control, v: number) => (v - c.min) / (c.max - c.min);

  function faderHtml(c: Control): string {
    return `<div class="hrow${changed(c) ? ' on' : ''}" data-c="${c.id}">
      <span class="ficon" aria-hidden="true">${ICONS[c.icon]}</span>
      <div class="htrack" role="slider" tabindex="0" aria-label="${c.label}" aria-valuemin="${c.min}" aria-valuemax="${c.max}" aria-valuenow="${c.get(edit)}">
        ${c.bipolar ? '<i class="hzero"></i>' : ''}<i class="hfill"></i><i class="hthumb"></i>
      </div>
      <output>${c.fmt(c.get(edit))}</output>
    </div>`;
  }
  function knobHtml(c: Control): string {
    return `<div class="knob${changed(c) ? ' on' : ''}" data-c="${c.id}" role="slider" tabindex="0" aria-label="${c.label}" aria-valuemin="${c.min}" aria-valuemax="${c.max}" aria-valuenow="${c.get(edit)}">
      <svg width="50" height="50" viewBox="0 0 54 54" aria-hidden="true">
        <circle cx="27" cy="27" r="23" fill="#1c1c1e" stroke="rgba(255,255,255,0.10)" stroke-width="4"/>
        <circle class="karc" cx="27" cy="27" r="23" fill="none" stroke="${c.tint ?? '#fff'}" stroke-width="4" stroke-linecap="round"/>
        <line class="kptr" x1="27" y1="27" x2="27" y2="12" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <circle cx="27" cy="27" r="4" fill="#fff"/>
      </svg>
      <output>${c.fmt(c.get(edit))}</output>
      <small>${c.label}</small>
    </div>`;
  }

  /** Обновляет вид одного регулятора без перерисовки экрана (иначе оборвётся жест). */
  function updateControl(c: Control) {
    const el = app.querySelector<HTMLElement>(`[data-c="${c.id}"]`);
    if (!el) return;
    const v = c.get(edit);
    el.classList.toggle('on', changed(c));
    const slider = el.matches('[role="slider"]') ? el : el.querySelector<HTMLElement>('[role="slider"]');
    slider?.setAttribute('aria-valuenow', String(v));
    const t = frac(c, v);
    el.querySelector('output')!.textContent = c.fmt(v);
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

  function actionsHtml(): string {
    if (channel === 'mix') {
      return `<div class="mactions">
        <button type="button" class="mpill shift${Math.abs(edit.mix.shiftMm - base.mix.shiftMm) > 1e-6 ? ' on' : ''}" data-ed="shift" aria-label="Shift the top photo: drag left or right">${ICONS.shift}<span>${sign(edit.mix.shiftMm)} mm</span></button>
        <button type="button" class="mpill" data-ed="dice" aria-label="New random light leak">${ICONS.dice}<span>Leak</span></button>
      </div>`;
    }
    const turns = edit[channel].turns;
    const on = turns !== base[channel].turns;
    return `<div class="mactions"><button type="button" class="mpill${on ? ' on' : ''}" data-ed="rotate" aria-label="Rotate this photo by 90°, now ${turns * 90}°">${ICONS.rotate}<span>${turns * 90}°</span></button></div>`;
  }

  function tabHtml(ch: Channel): string {
    const on = ch === channel;
    const label = { bottom: 'Bottom', top: 'Top', mix: 'Mix' }[ch];
    const url = ch === 'bottom' ? urlA : urlB;
    const turns = ch === 'mix' ? 0 : edit[ch].turns;
    const art = ch === 'mix' ? ICONS.mix : url ? `<img src="${url}" alt="" style="transform: rotate(${-turns * 90}deg)">` : '';
    return `<button type="button" role="tab" aria-selected="${on}" class="mtab${on ? ' on' : ''}" data-ed="channel" data-arg="${ch}"><span class="mthumb">${art}</span>${label}</button>`;
  }

  function paint() {
    const c = controls();
    app.innerHTML = `<div class="screen dark mixer">
      <div class="mbar">
        <button type="button" class="round-btn big" data-ed="cancel" aria-label="Cancel">${ICONS.x}</button>
        <div class="mbar-mid">
          <button type="button" class="round-btn big" data-ed="original" aria-label="Hold to see the frame before edits">${ICONS.original}</button>
          <button type="button" class="round-btn big" data-ed="undo" aria-label="Undo" ${undo.length ? '' : 'disabled'}>${ICONS.undo}</button>
        </div>
        <button type="button" class="round-btn big yes" data-ed="done" aria-label="Done">${ICONS.check}</button>
      </div>
      <div class="epreview">
        <canvas id="edit-canvas" width="${previewPx}" height="${Math.round((previewPx * 3) / 4)}" aria-label="Frame ${i + 1} preview"></canvas>
        <img id="edit-original" alt="" hidden>
      </div>
      <p class="edit-count" aria-live="polite"></p>
      <div class="mtabs" role="tablist" aria-label="Channel">${(['bottom', 'top', 'mix'] as Channel[]).map(tabHtml).join('')}</div>
      <div class="mknobs">${c.knobs.map(knobHtml).join('')}</div>
      <div class="mrows">${c.faders.map(faderHtml).join('')}</div>
      ${actionsHtml()}
    </div>`;
    all().forEach(updateControl);
    putPreview();
    bindOriginal();
    void draw();
  }

  // --- жесты: фейдер — палец по высоте; крутилка — вверх/вправо больше; двойное касание — сброс ---
  let drag: null | { c: Control; el: HTMLElement; kind: 'fader' | 'knob' | 'shift'; x0: number; y0: number; v0: number; id: number } = null;
  let lastTap = { id: '', t: 0 };
  const snap = (c: Control, v: number) => Math.max(c.min, Math.min(c.max, Math.round(v / c.step) * c.step));
  const shiftControl: Control = {
    id: 'mix.shiftMm', label: 'Shift', icon: 'leak', min: -36, max: 36, step: 0.5,
    get: (e) => e.mix.shiftMm, set: (e, v) => (e.mix.shiftMm = v), fmt: (v) => `${sign(v)} mm`,
  };

  function valueAt(e: PointerEvent): number {
    const d = drag!;
    if (d.kind === 'fader') {
      // ползунок едет за пальцем относительно места касания — без скачка при нажатии
      const w = d.el.querySelector('.htrack')!.getBoundingClientRect().width;
      return snap(d.c, d.v0 + ((e.clientX - d.x0) / w) * (d.c.max - d.c.min));
    }
    if (d.kind === 'knob') {
      // в 4 раза медленнее, чем был: полный ход крутилки — около 720 px пальцем
      const delta = (e.clientX - d.x0 - (e.clientY - d.y0)) / 720;
      return snap(d.c, d.v0 + delta * (d.c.max - d.c.min));
    }
    return snap(d.c, d.v0 + (e.clientX - d.x0) / 6);
  }

  const onDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    const shiftBtn = target.closest<HTMLElement>('[data-ed="shift"]');
    const el = target.closest<HTMLElement>('[data-c]');
    if (!el && !shiftBtn) return;
    const c = shiftBtn ? shiftControl : all().find((x) => x.id === el!.dataset.c);
    if (!c) return;
    e.preventDefault();
    const now = performance.now();
    if (lastTap.id === c.id && now - lastTap.t < 320) {
      c.set(edit, c.get(base)); // двойное касание — значение проявки
      lastTap = { id: '', t: 0 };
      afterChange(c, shiftBtn ?? el!);
      commit();
      return;
    }
    lastTap = { id: c.id, t: now };
    const kind = shiftBtn ? 'shift' : el!.classList.contains('hrow') ? 'fader' : 'knob';
    drag = { c, el: (shiftBtn ?? el)!, kind, x0: e.clientX, y0: e.clientY, v0: c.get(edit), id: e.pointerId };
    drag.el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const v = valueAt(e);
    if (v === drag.c.get(edit)) return;
    drag.c.set(edit, v);
    afterChange(drag.c, drag.el);
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    commit();
  };
  function afterChange(c: Control, el: HTMLElement) {
    if (c === shiftControl) {
      el.classList.toggle('on', Math.abs(edit.mix.shiftMm - base.mix.shiftMm) > 1e-6);
      el.querySelector('span')!.textContent = `${sign(edit.mix.shiftMm)} mm`;
    } else updateControl(c);
    void draw();
  }
  // клавиатура: стрелки двигают регулятор в фокусе
  const onKey = (e: KeyboardEvent) => {
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
    const show = async () => {
      if (!originalUrl) {
        const blob = await devOriginal(dev.id, i);
        if (blob) originalUrl = URL.createObjectURL(blob);
      }
      img.src = originalUrl;
      img.hidden = false;
    };
    const hide = () => (img.hidden = true);
    btn.addEventListener('pointerdown', () => void show());
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, hide);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const onClick = async (e: Event) => {
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
    app.removeEventListener('pointerdown', onDown);
    app.removeEventListener('pointermove', onMove);
    app.removeEventListener('pointerup', onUp);
    app.removeEventListener('pointercancel', onUp);
    app.removeEventListener('keydown', onKey);
    app.removeEventListener('click', onClick);
    for (const u of [urlA, urlB, originalUrl]) if (u) URL.revokeObjectURL(u);
  }

  function close(changedFrame: boolean) {
    detach();
    renderer.dispose();
    host.onClose(dev, changedFrame);
  }

  async function save() {
    const unchanged = countChanges(edit, base) === 0;
    if (unchanged && !hadEdit) return close(false);
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
          const [jpeg, thumb] = await Promise.all([encode(img), encode(img, 480, 0.8)]);
          dev = await saveEditedFrame(dev, i, edit, jpeg, thumb);
        } finally {
          full.dispose();
        }
      }
      close(true);
    } catch (e) {
      busyBox.textContent = `Couldn’t save: ${(e as Error).message}`;
      setTimeout(() => busyBox.remove(), 3000);
      renderer = await FrameRenderer.open(dev, 1700);
    }
  }

  paint();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
