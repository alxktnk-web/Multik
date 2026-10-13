// Панель правки готового кадра (макет «Multik — Edit panel», утверждён Александром 13.10.2026).
// Пять разделов: Basic (крутилки), Overlay (наложение и свет), Leaks, Tone (кривые), Texture.
// Пока крутишь — кадр пересчитывается из исходных снимков в уменьшенном размере; Done — полный размер.

import {
  EDIT_SECTIONS,
  LEAK_KIND_NAMES,
  baseEdit,
  countChanges,
  curveTable,
  leakEdge,
  moveLeak,
  resetKeys,
  type Channel,
  type CurvePoint,
  type FrameEdit,
} from '../core/edit';
import { FRAME_W, frameA } from '../core/geometry';
import { LEAK_KINDS, randomLeak, type LeakKind } from '../core/recipe';
import { Rng, randomSeed } from '../core/rng';
import { FrameRenderer, encode } from './develop';
import { devOriginal, resetEditedFrame, saveEditedFrame, type Development } from './store';

type Tab = keyof typeof EDIT_SECTIONS;

interface Slider {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  bipolar?: boolean;
  get: (e: FrameEdit) => number;
  set: (e: FrameEdit, v: number) => void;
  fmt: (v: number) => string;
  ends?: [string, string];
}

const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const pct = (v: number) => `${Math.round(v * 100)}`;

const ICON = {
  basic: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16"/></svg>',
  overlay: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="12" height="10" rx="1.5"/><rect x="9" y="9" width="12" height="10" rx="1.5"/></svg>',
  leaks: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M20 3v18"/><path d="M20 6c-5 1-9 3-12 6 3 3 7 5 12 6"/></svg>',
  tone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 20C9 20 8 4 21 4"/><circle cx="9" cy="14" r="1.6" fill="currentColor"/></svg>',
  texture: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="7" r="1.3"/><circle cx="12" cy="5" r="1"/><circle cx="17" cy="9" r="1.4"/><circle cx="8" cy="13" r="1"/><circle cx="14" cy="14" r="1.3"/><circle cx="19" cy="17" r="1"/><circle cx="7" cy="19" r="1.4"/><circle cx="13" cy="20" r="1"/></svg>',
  balance: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
  exposure: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  whites: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/></svg>',
  original: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>',
  undo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  redo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>',
  rotate: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  dice: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>',
};

/** Крутилки раздела Basic: значения шкалы — целые шаги (как у «Смешать»). */
interface Dial {
  id: 'balance' | 'exposure' | 'whites' | 'leakGain';
  label: string;
  title: string;
  icon: string;
  min: number;
  max: number;
  major: number;
  toStep: (e: FrameEdit) => number;
  fromStep: (e: FrameEdit, s: number) => void;
  fmt: (e: FrameEdit) => string;
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
  app.innerHTML = `<div class="screen dark edit"><div class="edit-busy"><span class="spinner"></span>Opening frame…</div></div>`;

  let renderer: FrameRenderer;
  try {
    renderer = await FrameRenderer.open(dev, 1700);
  } catch (e) {
    app.innerHTML = `<div class="screen dark edit"><div class="edit-busy">${(e as Error).message}<button type="button" class="capsule glass" data-ed="close">Back</button></div></div>`;
    app.querySelector('[data-ed="close"]')?.addEventListener('click', () => host.onClose(dev, false));
    return;
  }
  const recipe = renderer.recipe;
  const base = baseEdit(recipe, i, dev.params.whiteMerge ?? 0);
  // правка из старой версии могла не знать новых полей — дополняем значениями проявки
  let edit: FrameEdit = structuredClone({ ...base, ...dev.edits?.[i] });
  const hadEdit = !!dev.edits?.[i];
  const undo: FrameEdit[] = [];
  const redo: FrameEdit[] = [];
  let snapshot = structuredClone(edit);
  let tab: Tab = 'basic';
  let dial: Dial['id'] = 'balance';
  let leakSel = 0;
  let channel: Channel = 'l';
  const nameA = dev.titleA;
  const nameB = dev.titleB;

  const previewPx = Math.min(1400, Math.round(Math.min(window.innerWidth, 760) * Math.min(window.devicePixelRatio || 1, 3)));
  const ppm = previewPx / FRAME_W;

  const DIALS: Dial[] = [
    { id: 'balance', label: 'Balance', title: 'BALANCE A ↔ B', icon: ICON.balance, min: -20, max: 20, major: 5,
      toStep: (e) => Math.round(e.balance * 10), fromStep: (e, s) => (e.balance = s / 10),
      fmt: (e) => (e.balance === 0 ? 'even' : `${e.balance > 0 ? 'A' : 'B'} +${Math.abs(e.balance).toFixed(1)}`) },
    { id: 'exposure', label: 'Exposure', title: 'EXPOSURE', icon: ICON.exposure, min: -20, max: 20, major: 5,
      toStep: (e) => Math.round(e.exposure * 10), fromStep: (e, s) => (e.exposure = s / 10), fmt: (e) => `${signed(e.exposure)} EV` },
    { id: 'whites', label: 'Whites', title: 'WHITE MERGE', icon: ICON.whites, min: 0, max: 10, major: 5,
      toStep: (e) => e.whites, fromStep: (e, s) => (e.whites = s), fmt: (e) => (e.whites ? `${e.whites}/10` : 'off') },
    { id: 'leakGain', label: 'Leak', title: 'LEAK STRENGTH', icon: ICON.leaks, min: 0, max: 20, major: 5,
      toStep: (e) => Math.round(e.leakGain * 10), fromStep: (e, s) => (e.leakGain = s / 10), fmt: (e) => `${pct(e.leakGain)}%` },
  ];

  const SLIDERS: Record<string, Slider> = {
    balance: { key: 'balance', label: 'Balance', min: -2, max: 2, step: 0.1, bipolar: true, get: (e) => e.balance, set: (e, v) => (e.balance = v),
      fmt: (v) => (v === 0 ? 'even' : `${v > 0 ? 'A' : 'B'} +${Math.abs(v).toFixed(1)}`), ends: [nameA, nameB] },
    shiftMm: { key: 'shiftMm', label: 'Shift of 2nd pass', min: -36, max: 36, step: 0.5, bipolar: true, get: (e) => e.shiftMm, set: (e, v) => (e.shiftMm = v), fmt: (v) => `${signed(v)} mm` },
    exposure: { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.1, bipolar: true, get: (e) => e.exposure, set: (e, v) => (e.exposure = v), fmt: (v) => `${signed(v)} EV` },
    whites: { key: 'whites', label: 'Whites merge', min: 0, max: 10, step: 1, get: (e) => e.whites, set: (e, v) => (e.whites = v), fmt: (v) => (v ? `${v}` : 'off') },
    halation: { key: 'halation', label: 'Halation', min: 0, max: 2, step: 0.05, get: (e) => e.halation, set: (e, v) => (e.halation = v), fmt: pct },
    glow: { key: 'glow', label: 'Glow', min: 0, max: 2, step: 0.05, get: (e) => e.glow, set: (e, v) => (e.glow = v), fmt: pct },
    black: { key: 'black', label: 'Black point', min: -100, max: 100, step: 1, bipolar: true, get: (e) => e.black, set: (e, v) => (e.black = v), fmt: (v) => signed(v, 0) },
    contrast: { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, bipolar: true, get: (e) => e.contrast, set: (e, v) => (e.contrast = v), fmt: (v) => signed(v, 0) },
    saturation: { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, bipolar: true, get: (e) => e.saturation, set: (e, v) => (e.saturation = v), fmt: (v) => signed(v, 0) },
    warmth: { key: 'warmth', label: 'Highlight warmth', min: -100, max: 100, step: 1, bipolar: true, get: (e) => e.warmth, set: (e, v) => (e.warmth = v), fmt: (v) => signed(v, 0) },
    grain: { key: 'grain', label: 'Grain', min: 0, max: 2, step: 0.05, get: (e) => e.grain, set: (e, v) => (e.grain = v), fmt: pct },
    dust: { key: 'dust', label: 'Dust & hairs', min: 0, max: 1, step: 0.05, get: (e) => e.dust, set: (e, v) => (e.dust = v), fmt: pct },
    leakStrength: { key: 'leakStrength', label: 'Strength', min: 0, max: 4, step: 0.05, get: (e) => e.leaks[leakSel]?.strength ?? 0, set: (e, v) => e.leaks[leakSel] && (e.leaks[leakSel].strength = v), fmt: (v) => `${Math.round(v * 25)}` },
    leakWidth: { key: 'leakWidth', label: 'Width', min: 2, max: 30, step: 0.5, get: (e) => e.leaks[leakSel]?.width ?? 0, set: (e, v) => e.leaks[leakSel] && (e.leaks[leakSel].width = v), fmt: (v) => `${v.toFixed(1)} mm` },
    leakHue: { key: 'leakHue', label: 'Colour', min: 0, max: 1, step: 0.01, get: (e) => e.leaks[leakSel]?.hue ?? 0, set: (e, v) => e.leaks[leakSel] && (e.leaks[leakSel].hue = v),
      fmt: (v) => (v < 0.3 ? 'orange' : v < 0.65 ? 'red' : 'magenta') },
  };

  // --- предпросмотр ---
  let busy = false;
  let pending = false;
  let failed = '';
  let lastImg: ImageData | null = null;
  async function draw() {
    if (busy) {
      pending = true;
      return;
    }
    busy = true;
    try {
      const img = await renderer.render(i, edit, ppm);
      lastImg = img;
      const cv = app.querySelector<HTMLCanvasElement>('#edit-canvas');
      if (cv) {
        if (cv.width !== img.width || cv.height !== img.height) {
          cv.width = img.width;
          cv.height = img.height;
        }
        cv.getContext('2d')!.putImageData(img, 0, 0);
      }
      failed = '';
    } catch (e) {
      failed = (e as Error).message;
      const n = app.querySelector('.edit-count');
      if (n) n.textContent = failed;
    }
    busy = false;
    if (pending) {
      pending = false;
      void draw();
    }
  }

  // --- история ---
  function commit() {
    if (JSON.stringify(snapshot) === JSON.stringify(edit)) return;
    undo.push(snapshot);
    redo.length = 0;
    snapshot = structuredClone(edit);
    updateMeta();
  }
  function setEdit(next: FrameEdit) {
    edit = next;
    snapshot = structuredClone(edit);
    leakSel = Math.min(leakSel, Math.max(0, edit.leaks.length - 1));
    paint();
    void draw();
  }

  function updateMeta() {
    const n = countChanges(edit, base);
    const c = app.querySelector('.edit-count');
    if (c && !failed) c.textContent = n ? `${n} edit${n === 1 ? '' : 's'}` : 'No edits';
    app.querySelector<HTMLButtonElement>('[data-ed="undo"]')!.disabled = !undo.length;
    app.querySelector<HTMLButtonElement>('[data-ed="redo"]')!.disabled = !redo.length;
  }

  // --- разметка ---
  function sliderHtml(s: Slider): string {
    const v = s.get(edit);
    const changed = s.key.startsWith('leak') ? false : v !== s.get(base);
    return `<div class="eslider${changed ? ' changed' : ''}" data-slider="${s.key}">
      <label><span>${s.label}</span><output>${s.fmt(v)}</output></label>
      <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}" aria-label="${s.label}" style="${trackStyle(s, v, changed)}">
      ${s.ends ? `<div class="eends"><span>${esc(s.ends[0])} (A)</span><span>${esc(s.ends[1])} (B)</span></div>` : ''}
    </div>`;
  }
  function trackStyle(s: Slider, v: number, changed: boolean): string {
    const at = ((v - s.min) / (s.max - s.min)) * 100;
    const from = s.bipolar ? Math.min(50, at) : 0;
    const to = s.bipolar ? Math.max(50, at) : at;
    const fill = changed ? '#ffd60a' : 'rgba(255,255,255,0.75)';
    const rest = 'rgba(118,118,128,0.32)';
    return `--track: linear-gradient(90deg, ${rest} ${from}%, ${fill} ${from}%, ${fill} ${to}%, ${rest} ${to}%)`;
  }
  function group(title: string, keys: string[], resetKeys: (keyof FrameEdit)[], extra = ''): string {
    return `<section class="egroup">
      <div class="egroup-head"><h2>${title}</h2><button type="button" data-ed="reset" data-arg="${resetKeys.join(',')}">Reset</button></div>
      ${keys.map((k) => sliderHtml(SLIDERS[k])).join('')}${extra}
    </section>`;
  }
  function toggle(label: string, on: boolean, action: string): string {
    return `<div class="etoggle"><span>${label}</span><button type="button" role="switch" aria-checked="${on}" aria-label="${label}" data-ed="${action}"><i></i></button></div>`;
  }

  function panelHtml(): string {
    if (tab === 'basic') {
      const d = DIALS.find((x) => x.id === dial)!;
      const ticks = Array.from({ length: d.max - d.min + 1 }, (_, k) => `<i class="${k % d.major === 0 ? 'major' : ''}"></i>`).join('');
      return `<div class="ebasic">
        <div class="ebasic-head"><small>${d.title}</small><b id="dial-value">${d.fmt(edit)}</b></div>
        <div class="edials">${DIALS.map((x) => dialHtml(x)).join('')}</div>
        <div class="dial-wrap"><div class="dial" id="edit-dial"><div class="ticks">${ticks}</div></div><div class="needle"></div></div>
        <div class="erotate">
          <button type="button" data-ed="rotateA" aria-pressed="${edit.rotateA}">${ICON.rotate}<span>Rotate A 180°</span></button>
          <button type="button" data-ed="flip" aria-pressed="${edit.flip}">${ICON.rotate}<span>Rotate B 180°</span></button>
        </div>
        <div class="center"><button type="button" class="ereset" data-ed="reset" data-arg="${EDIT_SECTIONS.basic.join(',')}">Reset Basic</button></div>
      </div>`;
    }
    if (tab === 'overlay') {
      return group('OVERLAY', ['balance', 'shiftMm'], ['balance', 'shiftMm', 'rotateA', 'flip'],
        toggle(`Rotate 1st pass 180° · ${esc(nameA)}`, edit.rotateA, 'rotateA') + toggle(`Rotate 2nd pass 180° · ${esc(nameB)}`, edit.flip, 'flip')) +
        group('LIGHT', ['exposure', 'whites', 'halation', 'glow'], ['exposure', 'whites', 'halation', 'glow']);
    }
    if (tab === 'texture') return group('TEXTURE', ['grain', 'dust'], ['grain', 'dust']);
    if (tab === 'tone') {
      return `<section class="egroup">
          <div class="egroup-head"><h2>CURVE</h2>
            <div class="echannels" role="radiogroup" aria-label="Curve channel">
              ${(['l', 'r', 'g', 'b'] as Channel[]).map((c) => `<button type="button" role="radio" aria-checked="${c === channel}" aria-label="${{ l: 'Luminance', r: 'Red', g: 'Green', b: 'Blue' }[c]} curve" class="ch-${c}" data-ed="channel" data-arg="${c}"></button>`).join('')}
            </div>
            <button type="button" data-ed="reset" data-arg="curves">Reset</button>
          </div>
          <div class="ecurve" id="edit-curve">${curveSvg()}</div>
          <p class="ehint">Tap to add a point · drag to move · drag off the box to remove</p>
        </section>` + group('TONE', ['black', 'contrast', 'saturation', 'warmth'], ['black', 'contrast', 'saturation', 'warmth']);
    }
    // засветки
    const chips = edit.leaks
      .map((l, k) => `<button type="button" class="echip${k === leakSel ? ' on' : ''}${l.off ? ' off' : ''}" aria-pressed="${k === leakSel}" data-ed="leak" data-arg="${k}">${k + 1} · ${LEAK_KIND_NAMES[l.kind]}</button>`)
      .join('');
    const l = edit.leaks[leakSel];
    const card = l
      ? `<section class="egroup">
        ${toggle(`Leak ${leakSel + 1} on`, !l.off, 'leakOn')}
        <div class="eseg" role="radiogroup" aria-label="Leak type">${LEAK_KINDS.map((k) => `<button type="button" role="radio" aria-checked="${k === l.kind}" data-ed="kind" data-arg="${k}">${LEAK_KIND_NAMES[k]}</button>`).join('')}</div>
        ${sliderHtml(SLIDERS.leakStrength)}${sliderHtml(SLIDERS.leakWidth)}
        <div class="eslider hue" data-slider="leakHue"><label><span>Colour</span><output>${SLIDERS.leakHue.fmt(l.hue)}</output></label>
          <input type="range" min="0" max="1" step="0.01" value="${l.hue}" aria-label="Leak colour"></div>
        <div class="erow"><span>Edge</span><div class="eseg small" role="radiogroup" aria-label="Edge">${(['left', 'right'] as const).map((e) => `<button type="button" role="radio" aria-checked="${leakEdge(l, i) === e}" data-ed="edge" data-arg="${e}">${e === 'left' ? 'Left' : 'Right'}</button>`).join('')}</div></div>
        <div class="ebuttons"><button type="button" data-ed="variant">${ICON.dice}Another variant</button><button type="button" class="danger" data-ed="removeLeak">Remove</button></div>
      </section>`
      : `<p class="ehint big">No light leaks on this frame. Add one — it comes out random each time.</p>`;
    return `<div class="echips">${chips}<button type="button" class="echip add" data-ed="addLeak">${ICON.plus}Add leak</button></div>${card}`;
  }

  function dialHtml(d: Dial): string {
    const s = d.toStep(edit);
    const zero = d.toStep(base);
    const frac = Math.abs(s - zero) / (d.max - d.min);
    const on = d.id === dial;
    const color = on ? '#ffd60a' : d.id === 'leakGain' ? '#ff5a36' : '#ffffff';
    const ring = frac > 0 ? `<circle cx="28" cy="28" r="25" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(frac * 157).toFixed(1)} 157" transform="rotate(-90 28 28)"/>` : '';
    return `<button type="button" class="edial${on ? ' on' : ''}" data-ed="dial" data-arg="${d.id}" aria-pressed="${on}">
      <span><svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="25" fill="${on ? 'rgba(255,214,10,0.12)' : 'rgba(118,118,128,0.24)'}" stroke="${on ? 'rgba(255,214,10,0.25)' : 'rgba(255,255,255,0.12)'}" stroke-width="3"/>${ring}</svg>${d.icon}</span>
      <small>${d.label}</small></button>`;
  }

  // кривая: 300 × 180 в координатах SVG
  const CW = 300;
  const CH = 180;
  function curveSvg(): string {
    const pts = edit.curves[channel];
    const table = curveTable(pts);
    const color = { l: '#ffffff', r: '#ff453a', g: '#30d158', b: '#0a84ff' }[channel];
    let d = '';
    for (let k = 0; k <= 60; k++) {
      const x = k / 60;
      const y = table[Math.round(x * 255)];
      d += `${k ? 'L' : 'M'}${(x * CW).toFixed(1)} ${((1 - y) * CH).toFixed(1)}`;
    }
    const grid = [0.25, 0.5, 0.75].map((g) => `M${g * CW} 0V${CH}M0 ${g * CH}H${CW}`).join('');
    return `<svg viewBox="-8 -8 ${CW + 16} ${CH + 16}" role="img" aria-label="Tone curve">
      <path d="${grid}" stroke="rgba(235,235,245,0.1)" stroke-width="1"/>
      <path d="M0 ${CH}L${CW} 0" stroke="rgba(235,235,245,0.22)" stroke-dasharray="4 4"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2.2"/>
      ${pts.map(([x, y], k) => `<circle cx="${x * CW}" cy="${(1 - y) * CH}" r="${k === dragIdx ? 9 : 7}" fill="${k === dragIdx ? '#ffd60a' : color}" stroke="#000" stroke-width="1.5"/>`).join('')}
    </svg>`;
  }
  let dragIdx = -1;

  function overlayMarks(): string {
    if (tab !== 'leaks') return '';
    const used: Record<string, number[]> = { left: [], right: [] };
    return edit.leaks
      .map((l, k) => {
        const side = leakEdge(l, i);
        let top = l.yCenter < 0 ? 6 : Math.max(4, Math.min(86, l.yCenter * 100 - 5));
        // метки у одного края не должны закрывать друг друга
        while (used[side].some((t) => Math.abs(t - top) < 9)) top = top + 10 > 90 ? top - 10 : top + 10;
        used[side].push(top);
        return `<span class="emark${k === leakSel ? ' on' : ''}${l.off ? ' off' : ''}" style="${side}: 8px; top: ${top}%">${k + 1}</span>`;
      })
      .join('');
  }

  function paint() {
    const n = countChanges(edit, base);
    app.innerHTML = `<div class="screen dark edit">
      <div class="bar3">
        <button type="button" class="link white" data-ed="cancel">Cancel</button>
        <div class="title2"><b>Frame ${i + 1}</b><small>${esc(nameA)} × ${esc(nameB)}</small></div>
        <button type="button" class="done end" data-ed="done">Done</button>
      </div>
      <div class="epreview">
        <canvas id="edit-canvas" width="${previewPx}" height="${Math.round((previewPx * 3) / 4)}" aria-label="Frame preview"></canvas>
        <img id="edit-original" alt="" hidden>
        ${overlayMarks()}
      </div>
      <div class="etools">
        <button type="button" class="pill-btn" data-ed="original" aria-label="Hold to see the frame before edits">${ICON.original}Original</button>
        <span class="edit-count">${failed || (n ? `${n} edit${n === 1 ? '' : 's'}` : 'No edits')}</span>
        <div><button type="button" class="round-btn" data-ed="undo" aria-label="Undo" ${undo.length ? '' : 'disabled'}>${ICON.undo}</button>
        <button type="button" class="round-btn" data-ed="redo" aria-label="Redo" ${redo.length ? '' : 'disabled'}>${ICON.redo}</button></div>
      </div>
      <div class="epanel">${panelHtml()}</div>
      <nav class="etabs" aria-label="Edit sections">
        ${(['basic', 'overlay', 'leaks', 'tone', 'texture'] as Tab[]).map((t) => `<button type="button" data-ed="tab" data-arg="${t}" class="${t === tab ? 'on' : ''}" aria-pressed="${t === tab}">${ICON[t]}<span>${t[0].toUpperCase() + t.slice(1)}</span></button>`).join('')}
      </nav>
    </div>`;
    if (lastImg) {
      const cv = app.querySelector<HTMLCanvasElement>('#edit-canvas')!;
      cv.width = lastImg.width;
      cv.height = lastImg.height;
      cv.getContext('2d')!.putImageData(lastImg, 0, 0);
    }
    bindDial();
    bindCurve();
    bindOriginal();
    void draw();
  }

  // --- крутилка Basic ---
  function bindDial() {
    const el = app.querySelector<HTMLElement>('#edit-dial');
    if (!el) return;
    const d = DIALS.find((x) => x.id === dial)!;
    el.scrollLeft = (d.toStep(edit) - d.min) * 8;
    let touched = false;
    for (const ev of ['pointerdown', 'touchstart', 'wheel']) el.addEventListener(ev, () => (touched = true), { passive: true });
    let raf = 0;
    let settle = 0;
    el.addEventListener('scroll', () => {
      if (!touched) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const s = Math.max(d.min, Math.min(d.max, d.min + Math.round(el.scrollLeft / 8)));
        if (s === d.toStep(edit)) return;
        d.fromStep(edit, s);
        const v = app.querySelector('#dial-value');
        if (v) v.textContent = d.fmt(edit);
        const btn = app.querySelector(`[data-ed="dial"][data-arg="${d.id}"]`);
        if (btn) btn.outerHTML = dialHtml(d);
        updateMeta();
        void draw();
      });
      clearTimeout(settle);
      settle = window.setTimeout(commit, 400);
    });
  }

  // --- кривая ---
  function bindCurve() {
    const box = app.querySelector<HTMLElement>('#edit-curve');
    if (!box) return;
    const toCurve = (e: PointerEvent) => {
      const svg = box.querySelector('svg')!;
      const r = svg.getBoundingClientRect();
      const sx = (CW + 16) / r.width;
      const sy = (CH + 16) / r.height;
      return { x: ((e.clientX - r.left) * sx - 8) / CW, y: 1 - ((e.clientY - r.top) * sy - 8) / CH };
    };
    let removing = false;
    box.addEventListener('pointerdown', (e) => {
      const p = toCurve(e);
      const pts = edit.curves[channel];
      let best = -1;
      let dist = 0.06;
      pts.forEach(([x, y], k) => {
        const dd = Math.hypot(x - p.x, (y - p.y) * 0.6);
        if (dd < dist) {
          dist = dd;
          best = k;
        }
      });
      if (best < 0) {
        const x = Math.max(0.02, Math.min(0.98, p.x));
        const y = curveTable(pts)[Math.round(x * 255)];
        const next: CurvePoint[] = [...pts, [x, Math.abs(p.y - y) < 0.12 ? y : Math.max(0, Math.min(1, p.y))]];
        next.sort((a, b) => a[0] - b[0]);
        edit.curves[channel] = next;
        best = next.findIndex((q) => q[0] === x);
      }
      dragIdx = best;
      box.setPointerCapture(e.pointerId);
      box.innerHTML = curveSvg();
      void draw();
    });
    box.addEventListener('pointermove', (e) => {
      if (dragIdx < 0) return;
      const p = toCurve(e);
      const pts = edit.curves[channel].map((q) => [...q] as CurvePoint);
      const end = dragIdx === 0 || dragIdx === pts.length - 1;
      removing = !end && (p.y < -0.15 || p.y > 1.15);
      const lo = dragIdx > 0 ? pts[dragIdx - 1][0] + 0.02 : 0;
      const hi = dragIdx < pts.length - 1 ? pts[dragIdx + 1][0] - 0.02 : 1;
      pts[dragIdx] = [end ? pts[dragIdx][0] : Math.max(lo, Math.min(hi, p.x)), Math.max(0, Math.min(1, p.y))];
      edit.curves[channel] = pts;
      box.innerHTML = curveSvg();
      box.classList.toggle('removing', removing);
      void draw();
    });
    const up = () => {
      if (dragIdx < 0) return;
      if (removing) edit.curves[channel] = edit.curves[channel].filter((_, k) => k !== dragIdx);
      removing = false;
      dragIdx = -1;
      box.classList.remove('removing');
      box.innerHTML = curveSvg();
      commit();
      void draw();
    };
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
  }

  // --- «Original»: держишь — видишь кадр до правок ---
  function bindOriginal() {
    const btn = app.querySelector<HTMLButtonElement>('[data-ed="original"]');
    const img = app.querySelector<HTMLImageElement>('#edit-original');
    if (!btn || !img) return;
    const show = async () => {
      if (!img.src) {
        const blob = await devOriginal(dev.id, i);
        if (blob) img.src = URL.createObjectURL(blob);
      }
      img.hidden = false;
    };
    const hide = () => (img.hidden = true);
    btn.addEventListener('pointerdown', () => void show());
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, hide);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // --- события ---
  const onInput = (e: Event) => {
    const t = e.target as HTMLInputElement;
    const box = t.closest<HTMLElement>('[data-slider]');
    if (!box || t.type !== 'range') return;
    const s = SLIDERS[box.dataset.slider!];
    const v = Number(t.value);
    s.set(edit, v);
    const changed = !s.key.startsWith('leak') && v !== s.get(base);
    box.classList.toggle('changed', changed);
    box.querySelector('output')!.textContent = s.fmt(v);
    if (box.dataset.slider !== 'leakHue') t.setAttribute('style', trackStyle(s, v, changed));
    updateMeta();
    void draw();
  };
  const onChange = (e: Event) => {
    if ((e.target as HTMLInputElement).type === 'range') commit();
  };
  const rng = new Rng(randomSeed());
  const onClick = async (e: Event) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]');
    if (!el) return;
    const act = el.dataset.ed!;
    const arg = el.dataset.arg ?? '';
    switch (act) {
      case 'tab':
        tab = arg as Tab;
        return paint();
      case 'dial':
        dial = arg as Dial['id'];
        return paint();
      case 'channel':
        channel = arg as Channel;
        return paint();
      case 'leak':
        leakSel = Number(arg);
        return paint();
      case 'reset':
        edit = resetKeys(edit, base, arg.split(',') as (keyof FrameEdit)[]);
        if (arg.includes('leaks')) leakSel = 0;
        commit();
        return paint();
      case 'rotateA':
        edit.rotateA = !edit.rotateA;
        commit();
        return paint();
      case 'flip':
        edit.flip = !edit.flip;
        commit();
        return paint();
      case 'leakOn': {
        const l = edit.leaks[leakSel];
        if (l) l.off = !l.off;
        commit();
        return paint();
      }
      case 'kind': {
        const l = edit.leaks[leakSel];
        if (l) l.kind = arg as LeakKind;
        commit();
        return paint();
      }
      case 'edge': {
        const l = edit.leaks[leakSel];
        if (l) edit.leaks[leakSel] = moveLeak(l, i, arg as 'left' | 'right');
        commit();
        return paint();
      }
      case 'variant': {
        // другой рисунок той же засветки: тип, сила и край остаются
        const l = edit.leaks[leakSel];
        if (!l) return;
        const fresh = randomLeak(rng, i, l.kind);
        edit.leaks[leakSel] = { ...l, seed: fresh.seed, yCenter: fresh.yCenter, width: fresh.width };
        commit();
        return paint();
      }
      case 'addLeak': {
        const leak = randomLeak(rng, i);
        const f = frameA(i);
        if (Math.abs(leak.x - (leak.dir === 1 ? f.x : f.x + FRAME_W)) > 1.5) leak.x = leak.dir === 1 ? f.x - 0.5 : f.x + FRAME_W + 0.5;
        edit.leaks = [...edit.leaks, leak];
        leakSel = edit.leaks.length - 1;
        commit();
        return paint();
      }
      case 'removeLeak':
        edit.leaks = edit.leaks.filter((_, k) => k !== leakSel);
        leakSel = Math.max(0, leakSel - 1);
        commit();
        return paint();
      case 'undo': {
        const prev = undo.pop();
        if (!prev) return;
        redo.push(structuredClone(edit));
        return setEdit(prev);
      }
      case 'redo': {
        const next = redo.pop();
        if (!next) return;
        undo.push(structuredClone(edit));
        return setEdit(next);
      }
      case 'cancel':
        return close(false);
      case 'done':
        return save();
    }
  };
  app.addEventListener('input', onInput);
  app.addEventListener('change', onChange);
  app.addEventListener('click', onClick);

  function close(changed: boolean) {
    app.removeEventListener('input', onInput);
    app.removeEventListener('change', onChange);
    app.removeEventListener('click', onClick);
    renderer.dispose();
    host.onClose(dev, changed);
  }

  async function save() {
    const unchanged = countChanges(edit, base) === 0;
    if (unchanged && !hadEdit) return close(false);
    const busyBox = document.createElement('div');
    busyBox.className = 'edit-busy overlay-busy';
    busyBox.innerHTML = '<span class="spinner"></span>Developing the full frame…';
    app.querySelector('.edit')?.append(busyBox);
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
      busyBox.innerHTML = `Couldn’t save: ${esc((e as Error).message)}`;
      setTimeout(() => busyBox.remove(), 3000);
      renderer = await FrameRenderer.open(dev, 1700);
    }
  }

  paint();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
