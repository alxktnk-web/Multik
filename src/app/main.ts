// Мультик — приложение (SPEC 1.3). Дизайн: тёмный «кинематографичный» iOS — как Камера и редактор Фото:
// чёрный фон, крупные заголовки, карточки со снимками, плавающая стеклянная панель вкладок, жёлтые акценты.
// Экраны: Плёнки · Новая плёнка · Смешать · Проявка идёт · Просмотр · Проявки. Интерфейс на английском.

import { ALGO_VERSION, DEFAULT_SETTINGS } from '../core/recipe';
import { randomSeed } from '../core/rng';
import { runDevelopment } from './develop';
import {
  createDev,
  createRoll,
  deleteDev,
  deleteRoll,
  devFrame,
  devThumb,
  getDev,
  getRoll,
  listDevs,
  listRolls,
  nextRollNumber,
  renameRoll,
  requestPersistence,
  rollThumb,
  saveDev,
  type Development,
  type PhotoMeta,
  type Roll,
} from './store';

const app = document.getElementById('app')!;
const LENGTHS = [6, 12, 24, 36];
const MIX_LOOKS = ['F', 'E', 'D', 'B'];
const LOOK_NAMES: Record<string, string> = { F: 'Melted', E: 'Blown', D: 'Dense', B: 'Portra' };

interface Param {
  id: 'shift' | 'white' | 'leaks' | 'exposure' | 'dust';
  label: string;
  title: string;
  min: number;
  max: number;
  major: number;
  fmt: (v: number) => string;
  short: (v: number) => string;
}

const PARAMS: Param[] = [
  { id: 'shift', label: 'Shift', title: 'SECOND ROLL SHIFT', min: -36, max: 36, major: 6, fmt: (v) => `${v > 0 ? '+' : ''}${v} mm`, short: (v) => `${v > 0 ? '+' : ''}${v}` },
  { id: 'white', label: 'Whites', title: 'WHITE MERGE', min: 0, max: 10, major: 5, fmt: (v) => (v ? `${v}/10 · ${v < 4 ? 'soft' : v < 8 ? 'merging' : 'solid white'}` : 'off'), short: String },
  { id: 'leaks', label: 'Leaks', title: 'LIGHT LEAKS', min: 0, max: 10, major: 5, fmt: (v) => (v ? `${v} in 10 frames` : 'none'), short: String },
  { id: 'exposure', label: 'Exposure', title: 'OVEREXPOSURE', min: 0, max: 20, major: 5, fmt: (v) => `+${(v / 10).toFixed(1)} EV`, short: (v) => `+${(v / 10).toFixed(1)}` },
  { id: 'dust', label: 'Dust', title: 'DUST & HAIRS', min: 0, max: 10, major: 5, fmt: (v) => (v ? `${v}/10` : 'none'), short: String },
];

type Screen = 'home' | 'newRoll' | 'mix' | 'developing' | 'result';

const state = {
  screen: 'home' as Screen,
  tab: 'rolls' as 'rolls' | 'devs',
  rolls: [] as Roll[],
  devs: [] as Development[],
  selection: [] as string[],
  // новая плёнка
  draft: { name: '', length: 12, files: [] as File[], busy: '' },
  // смешать
  mix: {
    swap: false,
    look: 'F',
    param: 'shift' as Param['id'],
    values: { shift: -12, white: 6, leaks: 2, exposure: 8, dust: 4 } as Record<Param['id'], number>,
    randomShift: true,
    flip: true,
    full: false,
  },
  dev: null as Development | null,
  developing: { stop: false, error: '' },
  view: 0,
  sheet: null as null | { kind: 'rollActions' | 'rename' | 'devActions'; id: string },
};

// --- утилиты ---

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const urls = new Map<string, string>();
async function blobUrl(key: string, load: () => Promise<Blob | undefined>): Promise<string> {
  const cached = urls.get(key);
  if (cached) return cached;
  const blob = await load();
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}
function dropUrl(key: string) {
  const u = urls.get(key);
  if (u) URL.revokeObjectURL(u);
  urls.delete(key);
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const frames = (n: number) => `${n} frame${n === 1 ? '' : 's'}`;
const rollNo = (n: number) => `ROLL ${String(n).padStart(2, '0')}`;
const today = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
const ambient = (url: string) => (url ? `<div class="ambient" style="background-image:url('${url}')"></div>` : '');

const ICON = {
  plus: '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>',
  more: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.8" fill="currentColor"/><circle cx="10" cy="10" r="1.8" fill="currentColor"/><circle cx="16" cy="10" r="1.8" fill="currentColor"/></svg>',
  rolls: '<svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true"><rect x="3" y="3" width="20" height="18" rx="3" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3 7.5h20M3 16.5h20" stroke="currentColor" stroke-width="1.6"/></svg>',
  devs: '<svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true"><circle cx="10" cy="12" r="7" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="16" cy="12" r="7" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  lab: '<svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true"><path d="M5 7h16M5 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="7" r="2.6" fill="#1c1c1e" stroke="currentColor" stroke-width="1.8"/><circle cx="16" cy="17" r="2.6" fill="#1c1c1e" stroke="currentColor" stroke-width="1.8"/></svg>',
  mix: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="7.5" cy="10" r="5.5" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12.5" cy="10" r="5.5" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  swap: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3v13M6 16l-3-3M6 16l3-3M14 17V4M14 4l-3 3M14 4l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  back: '<svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2L2 10l8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  share: '<svg width="24" height="26" viewBox="0 0 24 26" aria-hidden="true"><path d="M12 2v14M12 2l-4 4M12 2l4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v11A1.5 1.5 0 0 0 5.5 24h13a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 18.5 10H17" stroke="currentColor" stroke-width="1.9" fill="none"/></svg>',
  heart: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 22s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 13 7.6a4.8 4.8 0 0 1 8.5 3.2C21.5 16.8 13 22 13 22z" stroke="currentColor" stroke-width="1.9" fill="FILL"/></svg>',
  again: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M21 13a8 8 0 1 1-2.4-5.7M21 4v4h-4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.5l2.6 2.6L11 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
};

/**
 * Обложка пустой библиотеки: два «кадра» плёнки, сложенные светом (screen = сложение света),
 * второй перевёрнут на 180° (фильм-свап) и медленно ездит — как сдвиг второй плёнки.
 * Красный ореол вокруг солнца и засветка у края — те же приметы, что даёт настоящая проявка.
 * Рисунок векторный: никаких фотографий пользователя.
 */
const HERO = `<svg class="hero-art" viewBox="0 0 360 230" role="img" aria-label="Two film frames exposed on top of each other">
  <defs>
    <linearGradient id="hA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241047"/><stop offset=".5" stop-color="#e2445c"/><stop offset=".85" stop-color="#ffa64d"/><stop offset="1" stop-color="#ffd27a"/></linearGradient>
    <linearGradient id="hB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8f1ff"/><stop offset=".55" stop-color="#4b8fe0"/><stop offset="1" stop-color="#0c2142"/></linearGradient>
    <linearGradient id="hLeak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2d1a"/><stop offset=".4" stop-color="#ff7a1a" stop-opacity=".7"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></linearGradient>
    <radialGradient id="hSun"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#fff7dc"/><stop offset="1" stop-color="#fff7dc" stop-opacity="0"/></radialGradient>
    <clipPath id="cA"><rect x="16" y="36" width="216" height="162" rx="9"/></clipPath>
    <clipPath id="cB"><rect width="216" height="162" rx="9"/></clipPath>
    <filter id="hHalo" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <g style="isolation:isolate">
    <g clip-path="url(#cA)">
      <rect x="16" y="36" width="216" height="162" fill="url(#hA)"/>
      <circle cx="152" cy="132" r="40" fill="#ff3b1f" opacity=".8" filter="url(#hHalo)"/>
      <circle cx="152" cy="132" r="24" fill="url(#hSun)"/>
      <path d="M16 198V152l34-26 24 18 36-38 40 42 30-18 52 30v38z" fill="#1a0c2c"/>
      <rect x="16" y="36" width="44" height="162" fill="url(#hLeak)" style="mix-blend-mode:screen"/>
    </g>
    <g class="hero-b" style="mix-blend-mode:screen">
      <g transform="translate(128 30) rotate(180 108 81)" clip-path="url(#cB)">
        <rect width="216" height="162" fill="url(#hB)"/>
        <path d="M0 136q60-14 118-2t98-4v32H0z" fill="#06101e"/>
        <path d="M150 162c-3-40-9-72-18-100" stroke="#06101e" stroke-width="6" fill="none" stroke-linecap="round"/>
        <g stroke="#06101e" stroke-width="5" fill="none" stroke-linecap="round">
          <path d="M132 62c-22-12-40-8-54 4"/><path d="M132 62c-12-22-32-28-46-26"/><path d="M132 62c18-20 38-22 52-16"/><path d="M132 62c24-6 40 4 48 18"/><path d="M132 62c-2-22 6-34 14-40"/>
        </g>
        <path d="M52 40l7 5 7-5M70 30l5 4 5-4" stroke="#06101e" stroke-width="2" fill="none" stroke-linecap="round"/>
      </g>
    </g>
  </g>
</svg>`;

function go(screen: Screen) {
  state.screen = screen;
  state.sheet = null;
  void render();
}

async function refresh() {
  [state.rolls, state.devs] = await Promise.all([listRolls(), listDevs()]);
  state.selection = state.selection.filter((id) => state.rolls.some((r) => r.id === id));
}

// --- экран: Плёнки / Проявки ---

function tabBar(): string {
  return `<nav class="tabbar" aria-label="Sections">
    <button type="button" data-tab="rolls" class="${state.tab === 'rolls' ? 'on' : ''}">${ICON.rolls}<span>Rolls</span></button>
    <button type="button" data-tab="devs" class="${state.tab === 'devs' ? 'on' : ''}">${ICON.devs}<span>Developed</span></button>
    <a href="./lab/">${ICON.lab}<span>Lab</span></a>
  </nav>`;
}

function header(title: string, actions = ''): string {
  return `<header class="head">
    <div><small class="kicker">${today()}</small><h1 class="large">${title}</h1></div>
    <div class="head-actions">${actions}</div>
  </header>`;
}

async function renderHome(): Promise<string> {
  if (state.tab === 'devs') return (await renderDevs()) + tabBar();

  const covers = await Promise.all(
    state.rolls.map((r) => Promise.all([0, 1, 2].filter((i) => i < r.photos.length).map((i) => blobUrl(`rt:${r.id}:${i}`, () => rollThumb(r.id, i))))),
  );
  const sel = state.selection;
  const add = `<button type="button" class="roll-add" data-new>${ICON.plus}<b>New roll</b><small>6 · 12 · 24 · 36 photos</small></button>`;

  if (!state.rolls.length) {
    return `<div class="screen">
      ${header('Multik')}
      <section class="hero">
        <div class="hero-frame">${HERO}</div>
        <h2>Two rolls. One frame.</h2>
        <p>Load a roll of photos, then another. Multik runs them through the camera twice — light adds up, whites melt together, red halation glows at the edges.</p>
        <button type="button" class="capsule yellow" data-new>${ICON.plus}Load your first roll</button>
      </section>
      <ol class="steps">
        <li><span>1</span><div><b>Load a roll</b><small>Pick 6, 12, 24 or 36 photos and name it. That’s one pass.</small></div></li>
        <li><span>2</span><div><b>Load another</b><small>Today or next month — rolls wait in your library.</small></div></li>
        <li><span>3</span><div><b>Develop</b><small>Pick any two rolls, turn the dials, and get a whole roll of double exposures.</small></div></li>
      </ol>
    </div>${tabBar()}`;
  }

  const hint =
    sel.length === 2
      ? 'Two rolls picked — ready to develop.'
      : sel.length === 1
        ? 'Now pick the second roll.'
        : state.rolls.length === 1
          ? 'Load one more roll to start mixing.'
          : 'Tap two rolls to expose them together.';
  const cards = state.rolls
    .map((r, k) => {
      const idx = sel.indexOf(r.id);
      const [c0, c1, c2] = covers[k];
      const cls = `roll${idx >= 0 ? ' sel' : ''}${sel.length === 2 && idx < 0 ? ' dim' : ''}`;
      return `<div class="${cls}">
        <button type="button" class="roll-cover" data-pick="${r.id}" aria-pressed="${idx >= 0}" aria-label="${esc(r.name)}">
          ${c2 ? `<span class="stack s2" style="background-image:url('${c2}')"></span>` : ''}
          ${c1 ? `<span class="stack s1" style="background-image:url('${c1}')"></span>` : ''}
          <span class="cover">
            ${c0 ? `<img src="${c0}" alt="">` : ''}
            <span class="roll-title"><small>${rollNo(r.number)}</small><b>${esc(r.name)}</b><em>${frames(r.length)} · ${fmtDate(r.createdAt)}</em></span>
            <span class="badge">${idx >= 0 ? idx + 1 : ''}</span>
          </span>
        </button>
        <button type="button" class="glass-btn more" data-roll-more="${r.id}" aria-label="Roll actions">${ICON.more}</button>
      </div>`;
    })
    .join('');
  const fab =
    sel.length === 2
      ? `<button type="button" class="fab" data-mix>${ICON.mix}Mix 2 rolls</button>`
      : sel.length === 1
        ? `<div class="fab ghost" aria-live="polite">1 of 2 picked</div>`
        : '';
  return `<div class="screen">
    ${header('Rolls', `<button type="button" class="glass-btn" data-new aria-label="New roll">${ICON.plus}</button>`)}
    <p class="sub">${hint}</p>
    <div class="grid">${cards}${add}</div>
    ${fab}
  </div>${tabBar()}`;
}

async function renderDevs(): Promise<string> {
  const thumbs = await Promise.all(
    state.devs.map((d) => Promise.all(Array.from({ length: Math.min(3, d.done) }, (_, i) => blobUrl(`ft:${d.id}:${i}`, () => devThumb(d.id, i))))),
  );
  const cards = state.devs
    .map((d, k) => {
      const unfinished = d.done < d.n;
      const [t0, t1, t2] = thumbs[k];
      return `<div class="dev-card">
        <button type="button" class="dev-open" data-open-dev="${d.id}">
          <span class="dev-art${t1 ? '' : ' single'}">
            ${t0 ? `<img src="${t0}" alt="">` : '<span class="ph"></span>'}
            ${t1 ? `<img src="${t1}" alt="">` : ''}
            ${t1 ? (t2 ? `<img src="${t2}" alt="">` : '<span class="ph"></span>') : ''}
          </span>
          <span class="dev-meta">
            <b>${esc(d.titleA)} <i>×</i> ${esc(d.titleB)}</b>
            <small>${fmtDateTime(d.createdAt)} · ${frames(d.n)}${d.likes.length ? ` · <span class="hearts">♥ ${d.likes.length}</span>` : ''}</small>
            ${unfinished ? `<span class="pill">Resume · ${d.done} of ${d.n}</span>` : ''}
          </span>
        </button>
        <button type="button" class="glass-btn more" data-dev-more="${d.id}" aria-label="Development actions">${ICON.more}</button>
      </div>`;
    })
    .join('');
  const empty = `<section class="hero small">
      <div class="hero-frame">${HERO}</div>
      <h2>Nothing developed yet</h2>
      <p>${state.rolls.length >= 2 ? 'Pick two rolls on the Rolls tab and tap Mix.' : 'Load two rolls first — then mix them here into double exposures.'}</p>
      <button type="button" class="capsule glass" data-tab="rolls">Go to Rolls</button>
    </section>`;
  return `<div class="screen">
    ${header('Developed')}
    ${state.devs.length ? `<div class="dev-list">${cards}</div>` : empty}
  </div>`;
}

// --- экран: Новая плёнка ---

async function renderNewRoll(): Promise<string> {
  const d = state.draft;
  const thumbs = d.files.map((f, i) => {
    const key = `draft:${i}:${f.name}:${f.size}`;
    if (!urls.has(key)) urls.set(key, URL.createObjectURL(f));
    return `<button type="button" class="pick" data-unpick="${i}" aria-label="Remove photo ${i + 1}"><img src="${urls.get(key)}" alt=""><span>×</span></button>`;
  });
  const empty = Array.from({ length: Math.max(0, d.length - d.files.length) }, (_, k) => `<div class="cell"><span>${d.files.length + k + 1}</span></div>`);
  const ready = d.files.length === d.length && !d.busy;
  const full = d.files.length >= d.length;
  return `<div class="screen sheet-bg">
    <div class="sheet">
      <div class="grabber"></div>
      <div class="sheet-nav">
        <button type="button" class="link" data-cancel-new>Cancel</button>
        <b>New Roll</b>
        <button type="button" class="link strong" data-save-roll ${ready ? '' : 'disabled'}>Save</button>
      </div>
      <div class="group">
        <label class="row"><span>Name</span><input id="roll-name" type="text" value="${esc(d.name)}" maxlength="60" autocomplete="off"></label>
      </div>
      <div class="section-title">Roll length</div>
      <div class="segmented" role="radiogroup" aria-label="Roll length">
        ${LENGTHS.map((n) => `<button type="button" role="radio" aria-checked="${n === d.length}" data-length="${n}">${n}</button>`).join('')}
      </div>
      <div class="section-title split"><span>Frames</span><span class="${full ? 'ok' : ''}">${d.files.length} of ${d.length}</span></div>
      <div class="picks">${thumbs.join('')}${empty.join('')}</div>
      ${d.files.length > d.length ? `<p class="note warn">That’s more photos than the roll holds. Remove ${d.files.length - d.length} or pick a longer roll.</p>` : ''}
      <label class="capsule wide ${full ? 'glass' : 'yellow'} file-btn">${ICON.plus}${d.files.length ? 'Add more photos' : 'Choose photos'}<input id="roll-files" type="file" accept="image/*" multiple hidden></label>
      <p class="note">${d.busy ? esc(d.busy) : 'Photos stay on this device. You can mix this roll with any other.'}</p>
    </div>
  </div>`;
}

async function prepare(file: File): Promise<{ full: Blob; thumb: Blob; meta: PhotoMeta }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 4000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const t = document.createElement('canvas');
  const ts = 360 / Math.max(c.width, c.height);
  t.width = Math.round(c.width * ts);
  t.height = Math.round(c.height * ts);
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
  const toBlob = (cv: HTMLCanvasElement, q: number) =>
    new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the photo'))), 'image/jpeg', q));
  return { full: await toBlob(c, 0.92), thumb: await toBlob(t, 0.8), meta: { w: c.width, h: c.height } };
}

async function saveNewRoll() {
  const d = state.draft;
  const name = d.name.trim() || `Roll ${await nextRollNumber()}`;
  try {
    const photos = [];
    for (let i = 0; i < d.files.length; i++) {
      d.busy = `Preparing frames: ${i + 1} of ${d.files.length}…`;
      await render();
      photos.push(await prepare(d.files[i]));
    }
    await createRoll(name, d.length, photos);
    void requestPersistence();
    d.files.forEach((f, i) => dropUrl(`draft:${i}:${f.name}:${f.size}`));
    state.draft = { name: '', length: 12, files: [], busy: '' };
    await refresh();
    state.tab = 'rolls';
    go('home');
  } catch (e) {
    d.busy = `Couldn’t save: ${(e as Error).message}. Try other photos or free up some space.`;
    await render();
  }
}

// --- экран: Смешать ---

function mixRolls(): [Roll, Roll] | null {
  const [a, b] = state.selection.map((id) => state.rolls.find((r) => r.id === id));
  if (!a || !b) return null;
  return state.mix.swap ? [b, a] : [a, b];
}

async function renderMix(): Promise<string> {
  const pair = mixRolls();
  if (!pair) return '<div class="screen dark"><p class="sub">Pick two rolls first.</p></div>';
  const [a, b] = pair;
  const m = state.mix;
  const [ca, cb] = await Promise.all([blobUrl(`rt:${a.id}:0`, () => rollThumb(a.id, 0)), blobUrl(`rt:${b.id}:0`, () => rollThumb(b.id, 0))]);
  const p = PARAMS.find((q) => q.id === m.param)!;
  const randomShift = p.id === 'shift' && m.randomShift;
  const value = m.values[p.id];
  const ticks = Array.from({ length: p.max - p.min + 1 }, (_, i) => `<i class="${i % p.major === 0 ? 'major' : ''}"></i>`).join('');
  return `<div class="screen dark">
    ${ambient(ca)}
    <div class="bar3">
      <button type="button" class="link white" data-home>Cancel</button>
      <b>Mix</b>
      <span></span>
    </div>
    <div class="pair">
      <figure class="pass p1"><img src="${ca}" alt=""><figcaption><small>PASS 1</small>${esc(a.name)} · ${a.length}</figcaption></figure>
      <figure class="pass p2"><img src="${cb}" alt="" class="${m.flip ? 'flipped' : ''}"><figcaption><small>PASS 2${m.flip ? ' · FLIPPED' : ''}</small>${esc(b.name)} · ${b.length}</figcaption></figure>
      <button type="button" class="swap" data-swap aria-label="Swap passes">${ICON.swap}</button>
    </div>
    <p class="sub center">${frames(Math.min(a.length, b.length))} · the shorter roll sets the count</p>
    <div class="looks" role="radiogroup" aria-label="Look">
      ${MIX_LOOKS.map((id) => `<button type="button" role="radio" aria-checked="${id === m.look}" data-look="${id}" class="${id === m.look ? 'on' : ''}"><span class="look-dot look-${id}">${id}</span><small>${LOOK_NAMES[id]}</small></button>`).join('')}
    </div>
    <div class="dial-box">
      <div class="dial-head"><small>${p.title}</small><b>${randomShift ? 'random' : p.fmt(value)}</b></div>
      <div class="dial-wrap">
        <div class="dial${randomShift ? ' muted' : ''}" id="dial"><div class="ticks">${ticks}</div></div>
        <div class="needle"></div>
      </div>
      <div class="params">
        ${PARAMS.map((q) => `<button type="button" data-param="${q.id}" class="${q.id === m.param ? 'on' : ''}"><span>${q.id === 'shift' && m.randomShift ? '?' : q.short(m.values[q.id])}</span><small>${q.label}</small></button>`).join('')}
      </div>
      <div class="chips">
        <button type="button" data-toggle="randomShift" aria-pressed="${m.randomShift}">Random shift</button>
        <button type="button" data-toggle="flip" aria-pressed="${m.flip}">Flip second roll</button>
        <button type="button" data-toggle="full" aria-pressed="${m.full}">12 MP</button>
      </div>
    </div>
    <div class="bottom"><button type="button" class="capsule yellow wide" data-develop>Develop</button></div>
  </div>`;
}

function bindDial() {
  const dial = document.getElementById('dial');
  if (!dial) return;
  const p = PARAMS.find((q) => q.id === state.mix.param)!;
  dial.scrollLeft = (state.mix.values[p.id] - p.min) * 8;
  // значение меняет только палец (или колесо мыши), а не установка шкалы при открытии экрана
  let touched = false;
  for (const ev of ['pointerdown', 'touchstart', 'wheel']) dial.addEventListener(ev, () => (touched = true), { passive: true });
  let raf = 0;
  dial.addEventListener('scroll', () => {
    if (!touched) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const v = Math.max(p.min, Math.min(p.max, p.min + Math.round(dial.scrollLeft / 8)));
      if (v === state.mix.values[p.id] && !(p.id === 'shift' && state.mix.randomShift)) return;
      state.mix.values[p.id] = v;
      if (p.id === 'shift') state.mix.randomShift = false;
      const head = document.querySelector('.dial-head b');
      if (head) head.textContent = p.fmt(v);
      const btn = document.querySelector(`[data-param="${p.id}"] span`);
      if (btn) btn.textContent = p.short(v);
      dial.classList.remove('muted');
      document.querySelector('[data-toggle="randomShift"]')?.setAttribute('aria-pressed', String(state.mix.randomShift));
    });
  });
}

async function startDevelopment(reuse?: Development) {
  let dev: Development;
  if (reuse) {
    dev = await createDev({ ...reuse, seed: randomSeed(), algo: ALGO_VERSION });
  } else {
    const pair = mixRolls();
    if (!pair) return;
    const [a, b] = pair;
    const m = state.mix;
    dev = await createDev({
      rollA: a.id,
      rollB: b.id,
      titleA: a.name,
      titleB: b.name,
      seed: randomSeed(),
      n: Math.min(a.length, b.length, a.photos.length, b.photos.length),
      algo: ALGO_VERSION,
      params: {
        lookId: m.look,
        exposureTenths: m.values.exposure,
        whiteMerge: m.values.white,
        ppm: m.full ? 111 : 56,
        settings: {
          ...DEFAULT_SETTINGS,
          shiftMode: m.randomShift ? 'random' : 'manual',
          shiftMm: m.values.shift,
          swapRotate: m.flip,
          leaks: m.values.leaks > 0,
          leakChance: m.values.leaks / 10,
          dust: m.values.dust > 0,
          dustLevel: m.values.dust,
        },
      },
    });
  }
  await develop(dev);
}

// --- экран: Проявка идёт ---

async function develop(dev: Development) {
  state.dev = dev;
  state.developing = { stop: false, error: '' };
  go('developing');
  try {
    dev = await runDevelopment(
      dev,
      (p) => {
        state.dev = p.dev;
        if (state.screen === 'developing') void render();
      },
      () => state.developing.stop,
    );
    state.dev = dev;
    await refresh();
    if (dev.done >= dev.n && state.screen === 'developing') {
      state.view = 0;
      go('result');
    } else if (state.screen === 'developing') {
      state.tab = 'devs';
      go('home');
    }
  } catch (e) {
    state.developing.error = (e as Error).message;
    await refresh();
    if (state.screen === 'developing') void render();
  }
}

async function renderDeveloping(): Promise<string> {
  const d = state.dev!;
  const thumbs = await Promise.all(Array.from({ length: d.done }, (_, i) => blobUrl(`ft:${d.id}:${i}`, () => devThumb(d.id, i))));
  const frac = d.n ? d.done / d.n : 0;
  const circ = 2 * Math.PI * 88;
  const err = state.developing.error;
  return `<div class="screen dark">
    ${ambient(thumbs[thumbs.length - 1] ?? '')}
    <div class="bar3">
      <button type="button" class="link white" data-stop>${err ? 'Back' : 'Stop'}</button>
      <b>${esc(d.titleA)} × ${esc(d.titleB)}</b>
      <span></span>
    </div>
    <div class="progress">
      <div class="ring">
        <svg width="210" height="210" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="88" stroke="rgba(255,255,255,0.12)" stroke-width="10" fill="none"/>
          <circle class="arc"${d.done ? '' : ' hidden'} cx="100" cy="100" r="88" stroke="#ffd60a" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${(frac * circ).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 100 100)"/>
        </svg>
        <div><b>${d.done}</b><span>of ${frames(d.n)}</span></div>
      </div>
      <h2>${err ? 'Developing stopped' : 'Developing your roll'}</h2>
      <p>${err ? esc(err) : 'Keep the app open. If it gets interrupted, resume from Developed — it picks up at the same frame.'}</p>
    </div>
    <div class="strip">${thumbs.map((u) => `<img src="${u}" alt="">`).join('')}${Array.from({ length: d.n - d.done }, () => '<span></span>').join('')}</div>
  </div>`;
}

// --- экран: Просмотр ---

async function renderResult(): Promise<string> {
  const d = state.dev!;
  const i = Math.min(state.view, d.done - 1);
  const full = await blobUrl(`ff:${d.id}:${i}`, () => devFrame(d.id, i));
  const thumbs = await Promise.all(Array.from({ length: d.done }, (_, k) => blobUrl(`ft:${d.id}:${k}`, () => devThumb(d.id, k))));
  const liked = d.likes.includes(i);
  return `<div class="screen dark">
    ${ambient(thumbs[i] ?? '')}
    <div class="bar3">
      <button type="button" class="link" data-back-devs>${ICON.back}Developed</button>
      <div class="title2"><b>Frame ${i + 1} of ${d.n}</b><small>${esc(d.titleA)} × ${esc(d.titleB)}</small></div>
      <span></span>
    </div>
    <div class="viewer">
      <button type="button" class="nav-zone left" data-step="-1" aria-label="Previous frame"></button>
      <img src="${full}" alt="Frame ${i + 1}">
      <button type="button" class="nav-zone right" data-step="1" aria-label="Next frame"></button>
    </div>
    <div class="filmstrip" id="filmstrip">${thumbs
      .map((u, k) => `<button type="button" data-view="${k}" class="${k === i ? 'on' : ''}"><img src="${u}" alt="Frame ${k + 1}">${d.likes.includes(k) ? '<span>♥</span>' : ''}</button>`)
      .join('')}</div>
    ${d.likes.length ? `<div class="center pad"><button type="button" class="capsule glass" data-save-liked>Save ${d.likes.length} favorite${d.likes.length === 1 ? '' : 's'} to Photos</button></div>` : ''}
    <nav class="toolbar">
      <button type="button" data-save-one>${ICON.share}<span>Save</span></button>
      <button type="button" data-like class="${liked ? 'liked' : ''}" aria-pressed="${liked}">${ICON.heart.replace('FILL', liked ? 'currentColor' : 'none')}<span>Favorite</span></button>
      <button type="button" data-again>${ICON.again}<span>Develop again</span></button>
    </nav>
  </div>`;
}

async function shareFrames(indices: number[], button: HTMLButtonElement) {
  const d = state.dev!;
  const files: File[] = [];
  for (const k of indices) {
    const blob = await devFrame(d.id, k);
    if (blob) files.push(new File([blob], `multik-${d.seed}-${k + 1}.jpg`, { type: 'image/jpeg' }));
  }
  const label = button.innerHTML;
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files });
    } else {
      for (const f of files) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(f);
        a.download = f.name;
        a.click();
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      button.textContent = 'Couldn’t save';
      setTimeout(() => (button.innerHTML = label), 2000);
    }
  }
}

// --- листы действий ---

function renderSheet(): string {
  const s = state.sheet;
  if (!s) return '';
  if (s.kind === 'rollActions') {
    const r = state.rolls.find((x) => x.id === s.id);
    if (!r) return '';
    return `<div class="overlay" data-close-sheet><div class="action-sheet" role="dialog" aria-label="Roll actions">
      <div class="action-group"><div class="action-title">${esc(r.name)} · ${frames(r.length)}</div>
        <button type="button" data-rename="${r.id}">Rename</button>
        <button type="button" class="danger" data-delete-roll="${r.id}">Delete Roll</button></div>
      <div class="action-group"><button type="button" class="strong" data-close-sheet>Cancel</button></div>
    </div></div>`;
  }
  if (s.kind === 'rename') {
    const r = state.rolls.find((x) => x.id === s.id);
    if (!r) return '';
    return `<div class="overlay" data-close-sheet><div class="alert" role="dialog" aria-label="Rename roll">
      <b>Roll name</b>
      <input id="rename-input" type="text" value="${esc(r.name)}" maxlength="60">
      <div class="alert-buttons"><button type="button" data-close-sheet>Cancel</button><button type="button" class="strong" data-rename-save="${r.id}">Save</button></div>
    </div></div>`;
  }
  const d = state.devs.find((x) => x.id === s.id);
  if (!d) return '';
  return `<div class="overlay" data-close-sheet><div class="action-sheet" role="dialog" aria-label="Development actions">
    <div class="action-group"><div class="action-title">${esc(d.titleA)} × ${esc(d.titleB)}</div>
      <button type="button" class="danger" data-delete-dev="${d.id}">Delete Development</button></div>
    <div class="action-group"><button type="button" class="strong" data-close-sheet>Cancel</button></div>
  </div></div>`;
}

// --- отрисовка и события ---

let rendering = Promise.resolve();
function render(): Promise<void> {
  rendering = rendering.then(async () => {
    const html =
      state.screen === 'home'
        ? await renderHome()
        : state.screen === 'newRoll'
          ? await renderNewRoll()
          : state.screen === 'mix'
            ? await renderMix()
            : state.screen === 'developing'
              ? await renderDeveloping()
              : await renderResult();
    const strip = document.getElementById('filmstrip')?.scrollLeft;
    app.innerHTML = html + renderSheet();
    if (state.screen === 'mix') bindDial();
    if (state.screen === 'result') {
      const fs = document.getElementById('filmstrip');
      const on = fs?.querySelector<HTMLElement>('.on');
      if (fs && strip !== undefined) fs.scrollLeft = strip;
      on?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
    document.getElementById('rename-input')?.focus();
  });
  return rendering;
}

app.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'roll-name') state.draft.name = t.value;
});

app.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'roll-files') {
    state.draft.files = [...state.draft.files, ...(t.files ?? [])];
    void render();
  }
});

app.addEventListener('click', async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button, a, [data-close-sheet]');
  if (!el) return;
  const ds = el.dataset;
  if (el.classList.contains('overlay') && e.target !== el) return;

  if (ds.tab) {
    state.tab = ds.tab as 'rolls' | 'devs';
    window.scrollTo(0, 0);
    return render();
  }
  if (ds.new !== undefined) {
    state.draft = { name: `Roll ${await nextRollNumber()}`, length: 12, files: [], busy: '' };
    return go('newRoll');
  }
  if (ds.pick) {
    const sel = state.selection;
    const at = sel.indexOf(ds.pick);
    if (at >= 0) sel.splice(at, 1);
    else if (sel.length < 2) sel.push(ds.pick);
    else state.selection = [sel[0], ds.pick];
    return render();
  }
  if (ds.rollMore) {
    state.sheet = { kind: 'rollActions', id: ds.rollMore };
    return render();
  }
  if (ds.devMore) {
    state.sheet = { kind: 'devActions', id: ds.devMore };
    return render();
  }
  if (ds.closeSheet !== undefined) {
    state.sheet = null;
    return render();
  }
  if (ds.rename) {
    state.sheet = { kind: 'rename', id: ds.rename };
    return render();
  }
  if (ds.renameSave) {
    const r = state.rolls.find((x) => x.id === ds.renameSave);
    const name = (document.getElementById('rename-input') as HTMLInputElement).value.trim();
    if (r && name) await renameRoll(r, name);
    await refresh();
    state.sheet = null;
    return render();
  }
  if (ds.deleteRoll) {
    const r = state.rolls.find((x) => x.id === ds.deleteRoll);
    if (r) await deleteRoll(r);
    for (const i of [0, 1, 2]) dropUrl(`rt:${ds.deleteRoll}:${i}`);
    await refresh();
    state.sheet = null;
    return render();
  }
  if (ds.deleteDev) {
    const d = state.devs.find((x) => x.id === ds.deleteDev);
    if (d) await deleteDev(d);
    await refresh();
    state.sheet = null;
    return render();
  }
  if (ds.mix !== undefined) {
    state.mix.swap = false;
    return go('mix');
  }
  if (ds.cancelNew !== undefined || ds.home !== undefined) return go('home');
  if (ds.length) {
    state.draft.length = Number(ds.length);
    return render();
  }
  if (ds.unpick) {
    const i = Number(ds.unpick);
    state.draft.files.forEach((f, k) => dropUrl(`draft:${k}:${f.name}:${f.size}`));
    state.draft.files.splice(i, 1);
    return render();
  }
  if (ds.saveRoll !== undefined) return saveNewRoll();
  if (ds.swap !== undefined) {
    state.mix.swap = !state.mix.swap;
    return render();
  }
  if (ds.look) {
    state.mix.look = ds.look;
    return render();
  }
  if (ds.param) {
    state.mix.param = ds.param as Param['id'];
    return render();
  }
  if (ds.toggle) {
    const k = ds.toggle as 'randomShift' | 'flip' | 'full';
    state.mix[k] = !state.mix[k];
    return render();
  }
  if (ds.develop !== undefined) return startDevelopment();
  if (ds.stop !== undefined) {
    state.developing.stop = true;
    state.tab = 'devs';
    await refresh();
    return go('home');
  }
  if (ds.openDev) {
    const d = await getDev(ds.openDev);
    if (!d) return;
    if (d.done < d.n) return develop(d);
    state.dev = d;
    state.view = 0;
    return go('result');
  }
  if (ds.backDevs !== undefined) {
    state.tab = 'devs';
    await refresh();
    return go('home');
  }
  if (ds.step) {
    const d = state.dev!;
    state.view = (state.view + Number(ds.step) + d.done) % d.done;
    return render();
  }
  if (ds.view) {
    state.view = Number(ds.view);
    return render();
  }
  if (ds.like !== undefined) {
    const d = state.dev!;
    const i = state.view;
    d.likes = d.likes.includes(i) ? d.likes.filter((k) => k !== i) : [...d.likes, i].sort((x, y) => x - y);
    await saveDev(d);
    return render();
  }
  if (ds.saveOne !== undefined) return shareFrames([state.view], el as HTMLButtonElement);
  if (ds.saveLiked !== undefined) return shareFrames(state.dev!.likes, el as HTMLButtonElement);
  if (ds.again !== undefined) {
    const d = state.dev!;
    const [a, b] = await Promise.all([getRoll(d.rollA), getRoll(d.rollB)]);
    if (!a || !b) return;
    return startDevelopment(d);
  }
});

// офлайн-работа и установка на экран «Домой»
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

void refresh().then(render);
