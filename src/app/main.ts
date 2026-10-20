// Мультик — приложение (SPEC 1.3). Дизайн: тёмный «кинематографичный» iOS — как Камера и редактор Фото:
// чёрный фон, крупные заголовки, карточки со снимками, плавающая стеклянная панель вкладок, приглушённые зелёные акценты.
// Экраны: Плёнки · Новая плёнка · Смешать · Проявка идёт · Просмотр · Проявки. Интерфейс на английском.

import { ALGO_VERSION, DEFAULT_SETTINGS } from '../core/recipe';
import { randomSeed } from '../core/rng';
import { FrameRenderer, runDevelopment } from './develop';
import { openEditor } from './edit';
import { panelHtml, layoutButton, updatePanelChanges, migrateSetupTools } from './panels';
import { initPwa, updateNotice } from './pwa';
import { bindPhotoZoom } from './zoom';
import { viewerDrag, type MovingLayer, type ViewerDraft } from './viewer-drag';
import type { FrameEdit } from '../core/edit';
import {
  createDev,
  createRoll,
  deleteDev,
  deleteRoll,
  displayFrame,
  displayThumb,
  exportFrame,
  rotateFrame,
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
/** Крутилки экрана перед проявкой (макет v2 «D»). */
interface Knob {
  id: 'shift' | 'leaks' | 'halo' | 'white';
  label: string;
  min: number;
  max: number;
  bipolar: boolean;
  fmt: (v: number) => string;
}
const SETUP_KNOBS: Knob[] = [
  { id: 'shift', label: 'Shift', min: -36, max: 36, bipolar: true, fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} mm` },
  { id: 'leaks', label: 'Leaks', min: 0, max: 10, bipolar: false, fmt: (v) => `${v * 10}%` },
  { id: 'halo', label: 'Halo', min: 0, max: 10, bipolar: false, fmt: (v) => `${v * 20}%` },
  { id: 'white', label: 'Whites', min: 0, max: 10, bipolar: false, fmt: (v) => `${v}/10` },
];

type Screen = 'home' | 'newRoll' | 'mix' | 'developing' | 'result' | 'edit';

// один вид обработки (M «Melted»), пока Александр не утвердит способ (14.10.2026); экспозиция и пыль — по умолчанию
const MIX_DEFAULTS = {
  swap: false,
  look: 'M',
  values: { shift: -12, white: 4, leaks: 0, halo: 5, exposure: 0, dust: 4 } as Record<'shift' | 'white' | 'leaks' | 'halo' | 'exposure' | 'dust', number>,
  randomShift: true,
  flip: true,
  full: false,
};
type MixState = typeof MIX_DEFAULTS;
// v6: выключаем случайные засветки; остальные сохранённые настройки сохраняем.
const MIX_KEY = 'multik-mix-v6';

// последние настройки «Смешать» запоминаются на этом устройстве (удобство, не данные)
function loadMix(): MixState {
  try {
    const current = localStorage.getItem(MIX_KEY);
    const saved = JSON.parse(current ?? localStorage.getItem('multik-mix-v5') ?? 'null') as Partial<MixState> | null;
    if (saved && !current) saved.values = { ...MIX_DEFAULTS.values, ...saved.values, leaks: 0 };
    if (saved) return { ...MIX_DEFAULTS, ...saved, look: 'M', values: { ...MIX_DEFAULTS.values, ...saved.values }, swap: false };
  } catch {
    // нет доступа к хранилищу — берём значения по умолчанию
  }
  return { ...MIX_DEFAULTS, values: { ...MIX_DEFAULTS.values } };
}
function saveMix() {
  try {
    localStorage.setItem(MIX_KEY, JSON.stringify(state.mix));
  } catch {
    // не страшно
  }
}

const state = {
  screen: 'home' as Screen,
  tab: 'rolls' as 'rolls' | 'devs',
  rolls: [] as Roll[],
  devs: [] as Development[],
  selection: [] as string[],
  // новая плёнка
  draft: { name: '', length: 12, files: [] as File[], busy: '', error: '' },
  // смешать
  mix: loadMix(),
  dev: null as Development | null,
  developing: { stop: false, error: '' },
  view: 0,
  sheet: null as null | { kind: 'rollActions' | 'rename' | 'devActions' | 'confirmRoll' | 'confirmDev'; id: string },
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
  edit: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="9" stroke="currentColor" stroke-width="1.9" fill="none"/><path d="M13 4a9 9 0 0 1 0 18Z" fill="currentColor"/></svg>',
  adjust: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M4 8h18M4 18h18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="9" cy="8" r="3" fill="#000" stroke="currentColor" stroke-width="1.9"/><circle cx="17" cy="18" r="3" fill="#000" stroke="currentColor" stroke-width="1.9"/></svg>',
  dice: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>',
  rotate: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  save: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/></svg>',
  saved: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  sliders: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 4v16M12 4v16M18 4v16"/><rect x="3.5" y="13" width="5" height="3" rx="1" fill="#000" stroke="currentColor"/><rect x="9.5" y="7" width="5" height="3" rx="1" fill="#000" stroke="currentColor"/><rect x="15.5" y="11" width="5" height="3" rx="1" fill="#000" stroke="currentColor"/></svg>',
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
  if (state.screen === 'mix' && screen !== 'mix') closeSample();
  state.screen = screen;
  state.sheet = null;
  for (const key of urls.keys()) {
    if ((screen !== 'result' && key.startsWith('ff:')) || (screen !== 'newRoll' && key.startsWith('draft:'))) dropUrl(key);
  }
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
    <div><h1 class="large">${title}</h1></div>
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
        <p>Two sets of photos. A little chance. Something new.</p>
        <button type="button" class="capsule accent" data-new>${ICON.plus}Load your first roll</button>
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
    ${header('Rolls', `${layoutButton('rolls')}<button type="button" class="glass-btn" data-new aria-label="New roll">${ICON.plus}</button>`)}
    <div class="grid">${cards}</div>
    ${panelHtml('rolls', 'Roll library', [
      { id: 'add', label: 'New roll shortcut', html: add, placement: 'more' },
      { id: 'guide', label: 'Selection hint', html: `<p class="sub">${hint}</p>`, placement: 'more' },
    ], () => { void render(); })}
    ${fab}
  </div>${tabBar()}`;
}

async function renderDevs(): Promise<string> {
  const thumbs = await Promise.all(
    state.devs.map((d) => Promise.all(Array.from({ length: Math.min(3, d.done) }, (_, i) => blobUrl(`ft:${d.id}:${i}`, () => displayThumb(d, i))))),
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
    ${header('Developed', layoutButton('developed'))}
    ${state.devs.length ? `<div class="dev-list">${cards}</div>` : empty}
    ${panelHtml('developed', 'Developed library', [{ id: 'guide', label: 'Help', html: '<p class="note">Open a roll to edit, save or favourite its frames.</p>', placement: 'more' }], () => { void render(); })}
  </div>`;
}

// --- экран: Новая плёнка ---

async function renderNewRoll(): Promise<string> {
  const d = state.draft;
  const thumbs = d.files.map((f, i) => {
    const key = `draft:${i}:${f.name}:${f.size}`;
    if (!urls.has(key)) urls.set(key, URL.createObjectURL(f));
    return `<button type="button" class="pick" data-unpick="${i}" ${d.busy ? 'disabled' : ''} aria-label="Remove photo ${i + 1}"><img src="${urls.get(key)}" alt=""><span>×</span></button>`;
  });
  const empty = Array.from({ length: Math.max(0, d.length - d.files.length) }, (_, k) => `<div class="cell"><span>${d.files.length + k + 1}</span></div>`);
  const ready = d.files.length === d.length && !d.busy;
  const full = d.files.length >= d.length;
  return `<div class="screen sheet-bg">
    <div class="sheet">
      <div class="grabber"></div>
      <div class="sheet-nav">
        <button type="button" class="link" data-cancel-new ${d.busy ? 'disabled' : ''}>Cancel</button>
        <div class="sheet-title"><b>New Roll</b>${layoutButton('new-roll')}</div>
        <button type="button" class="link strong" data-save-roll ${ready ? '' : 'disabled'}>Save</button>
      </div>
      ${panelHtml('new-roll', 'New roll', [
        { id: 'name', label: 'Roll name', html: `<div class="group">
        <label class="row"><span>Name</span><input id="roll-name" type="text" value="${esc(d.name)}" maxlength="60" autocomplete="off"></label>
      </div>` },
        { id: 'length', label: 'Roll length', html: `<div class="section-title">Roll length</div>
      <div class="segmented" role="radiogroup" aria-label="Roll length">
        ${LENGTHS.map((n) => `<button type="button" role="radio" aria-checked="${n === d.length}" data-length="${n}" ${d.busy ? 'disabled' : ''}>${n}</button>`).join('')}
      </div>` },
      ], () => { void render(); })}
      <div class="section-title split"><span>Frames</span><span class="${full ? 'ok' : ''}">${d.files.length} of ${d.length}</span></div>
      <div class="picks">${thumbs.join('')}${empty.join('')}</div>
      ${d.files.length > d.length ? `<p class="note warn">That’s more photos than the roll holds. Remove ${d.files.length - d.length} or pick a longer roll.</p>` : ''}
      <label class="capsule wide ${full ? 'glass' : 'accent'} file-btn">${ICON.plus}${d.files.length ? 'Add more photos' : 'Choose photos'}<input id="roll-files" type="file" accept="image/*" multiple hidden ${d.busy ? 'disabled' : ''}></label>
      <p class="note${d.error ? ' warn' : ''}" role="status">${esc(d.error || d.busy || 'Photos stay on this device.')}</p>
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
  if (d.busy || d.files.length !== d.length) return;
  d.busy = 'Preparing photos…';
  d.error = '';
  const files = [...d.files];
  try {
    const name = d.name.trim() || `Roll ${await nextRollNumber()}`;
    const photos = [];
    for (let i = 0; i < files.length; i++) {
      d.busy = `Preparing frames: ${i + 1} of ${files.length}…`;
      await render();
      photos.push(await prepare(files[i]));
    }
    await createRoll(name, d.length, photos);
    void requestPersistence();
    d.files.forEach((f, i) => dropUrl(`draft:${i}:${f.name}:${f.size}`));
    state.draft = { name: '', length: 12, files: [], busy: '', error: '' };
    await refresh();
    state.tab = 'rolls';
    go('home');
  } catch (e) {
    d.busy = '';
    d.error = `Couldn’t save: ${(e as Error).message}. Replace the photo or try again.`;
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
  migrateSetupTools();
  const pair = mixRolls();
  if (!pair) return '<div class="screen dark"><p class="sub">Pick two rolls first.</p></div>';
  const [a, b] = pair;
  const m = state.mix;
  const [ca, cb] = await Promise.all([blobUrl(`rt:${a.id}:0`, () => rollThumb(a.id, 0)), blobUrl(`rt:${b.id}:0`, () => rollThumb(b.id, 0))]);
  const row = (r: Roll, url: string, label: string, top: boolean) => `<div class="srow">
      <span class="sthumb">${url ? `<img src="${url}" alt="" class="${top && m.flip ? 'flipped' : ''}">` : ''}</span>
      <small>${label}</small><b>${esc(r.name)}</b>
      ${top
        ? `<button type="button" class="sicon${m.flip ? ' on' : ''}" data-toggle="flip" aria-pressed="${m.flip}" aria-label="Rotate the top roll 180°">${ICON.rotate}</button>`
        : `<button type="button" class="sicon" data-swap aria-label="Swap top and bottom">${ICON.swap}</button>`}
    </div>`;
  const knobItems = SETUP_KNOBS.map((k) => {
      const random = k.id === 'shift' && m.randomShift;
      return { id: k.id, label: k.label, kind: 'knob' as const, placement: 'main' as const, changed: k.id === 'shift' ? !m.randomShift : m.values[k.id] !== MIX_DEFAULTS.values[k.id], html: `<div class="sknob" data-k="${k.id}" role="slider" tabindex="0" aria-label="${k.label}" aria-valuemin="${k.min}" aria-valuemax="${k.max}" aria-valuenow="${m.values[k.id]}">
        <output>${random ? 'random' : k.fmt(m.values[k.id])}</output>
        <svg width="84" height="84" viewBox="0 0 54 54" aria-hidden="true">
          <circle cx="27" cy="27" r="23" fill="#1c1c1e" stroke="rgba(255,255,255,0.10)" stroke-width="3.5"/>
          <circle class="karc" cx="27" cy="27" r="23" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round"/>
          <line class="kptr" x1="27" y1="27" x2="27" y2="12" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="27" cy="27" r="3.5" fill="#fff"/>
        </svg>
        <small>${k.label}</small>
      </div>` };
    });
  const panel = panelHtml('setup', 'Mix rolls', [
    { id: 'sources', label: 'Source rolls', html: `<div class="srows">${row(b, cb, 'TOP', true)}${row(a, ca, 'BOTTOM', false)}</div>` },
    ...knobItems,
    { id: 'quality', label: 'Export quality', placement: 'more', changed: m.full,
      html: `<div class="quality-row"><span>Export quality</span><button type="button" class="chip-mp${m.full ? ' on' : ''}" data-toggle="full" aria-pressed="${m.full}">${m.full ? '12 MP' : '3 MP'}</button></div>` },
  ], () => { void render(); });
  return `<div class="screen dark setup">
    ${ambient(ca)}
    <div class="mbar">
      <button type="button" class="round-btn big" data-home aria-label="Cancel">${ICON.close}</button>
      <span class="scount">${frames(Math.min(a.length, b.length))}</span>
      ${layoutButton('setup')}
    </div>
    <div class="ssample">
      <canvas id="setup-canvas" width="900" height="675" aria-label="Sample frame from these two rolls"></canvas>
      <span class="sbadge" id="sample-status" role="status">Preview</span>
      <button type="button" class="sdice" data-sample-dice aria-label="Another sample frame">${ICON.dice}</button>
    </div>
    <div class="setup-tools">${panel}</div>

    <div class="bottom"><button type="button" class="capsule accent wide" data-develop>${ICON.mix}Develop</button></div>
  </div>`;
}

/** Крутилки экрана перед проявкой: тянуть вверх/вправо — больше; двойное касание сдвига — снова «случайно». */
function bindSetupKnobs() {
  const paintKnob = (el: HTMLElement, k: Knob) => {
    const m = state.mix;
    const v = m.values[k.id];
    const random = k.id === 'shift' && m.randomShift;
    const t = random ? 0.5 : (v - k.min) / (k.max - k.min);
    const C = 2 * Math.PI * 23;
    const arc = el.querySelector('.karc')!;
    if (random) arc.setAttribute('stroke-dasharray', `0 ${C}`);
    else if (k.bipolar) {
      arc.setAttribute('stroke-dasharray', `${(Math.abs(t - 0.5) * 0.75 * C).toFixed(1)} ${C.toFixed(1)}`);
      arc.setAttribute('transform', `rotate(${t >= 0.5 ? 270 : 270 - (0.5 - t) * 270} 27 27)`);
    } else {
      arc.setAttribute('stroke-dasharray', `${(t * 0.75 * C).toFixed(1)} ${C.toFixed(1)}`);
      arc.setAttribute('transform', 'rotate(135 27 27)');
    }
    const ang = ((135 + t * 270) * Math.PI) / 180;
    const ptr = el.querySelector('.kptr')!;
    ptr.setAttribute('x2', (27 + 15 * Math.cos(ang)).toFixed(1));
    ptr.setAttribute('y2', (27 + 15 * Math.sin(ang)).toFixed(1));
    el.querySelector('output')!.textContent = random ? 'random' : k.fmt(v);
    el.setAttribute('aria-valuenow', String(v));
    const changes = new Set(SETUP_KNOBS.filter((knob) => knob.id === 'shift' ? !m.randomShift : m.values[knob.id] !== MIX_DEFAULTS.values[knob.id]).map((knob) => knob.id as string));
    if (m.full) changes.add('quality');
    updatePanelChanges('setup', changes);
  };
  let lastTap = { id: '', t: 0 };
  document.querySelectorAll<HTMLElement>('.sknob').forEach((el) => {
    const k = SETUP_KNOBS.find((x) => x.id === el.dataset.k)!;
    paintKnob(el, k);
    let start: null | { x: number; y: number; v: number; id: number } = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (lastTap.id === k.id && now - lastTap.t < 320) {
        if (k.id === 'shift') state.mix.randomShift = true;
        else state.mix.values[k.id] = MIX_DEFAULTS.values[k.id];
        lastTap = { id: '', t: 0 };
        paintKnob(el, k);
        saveMix();
        void drawSample();
        return;
      }
      lastTap = { id: k.id, t: now };
      start = { x: e.clientX, y: e.clientY, v: state.mix.values[k.id], id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      // крутилка — движением пальца вбок (решение Александра 14.10): вправо — больше; полный ход ≈ 500 px
      const delta = (e.clientX - start.x) / 500;
      const v = Math.max(k.min, Math.min(k.max, Math.round(start.v + delta * (k.max - k.min))));
      if (v === state.mix.values[k.id] && !(k.id === 'shift' && state.mix.randomShift)) return;
      if (Math.abs(e.clientX - start.x) < 4) return;
      state.mix.values[k.id] = v;
      if (k.id === 'shift') state.mix.randomShift = false;
      paintKnob(el, k);
      saveMix();
      void drawSample();
    });
    const end = () => {
      start = null;
      saveMix();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      state.mix.values[k.id] = Math.max(k.min, Math.min(k.max, state.mix.values[k.id] + dir));
      if (k.id === 'shift') state.mix.randomShift = false;
      paintKnob(el, k);
      saveMix();
      void drawSample();
    });
  });
  void drawSample();
}

/**
 * Образец перед проявкой: один кадр из случайной пары снимков двух выбранных плёнок, в маленьком размере.
 * Крутилки «сдвиг», «засветки», «белое» и поворот верхней плёнки сразу меняют его.
 */
let sampleGeneration = 0;
const sample = { renderer: null as FrameRenderer | null, key: '', frame: 0, seed: 1, busy: false, pending: false, img: null as ImageData | null };
function putSample() {
  const cv = document.getElementById('setup-canvas') as HTMLCanvasElement | null;
  if (!cv || !sample.img) return;
  cv.width = sample.img.width;
  cv.height = sample.img.height;
  cv.getContext('2d')!.putImageData(sample.img, 0, 0);
}
function closeSample() {
  sampleGeneration++;
  sample.img = null;
  sample.renderer?.dispose();
  sample.renderer = null;
  sample.key = '';
}
async function drawSample() {
  putSample();
  if (sample.busy) {
    sample.pending = true;
    return;
  }
  const pair = mixRolls();
  if (!pair || state.screen !== 'mix') return;
  sample.busy = true;
  try {
    const [a, b] = pair;
    const params = mixParams();
    const n = Math.min(a.length, b.length, a.photos.length, b.photos.length);
    const key = `${a.id}|${b.id}|${sample.seed}`;
    if (sample.key !== key || !sample.renderer) {
      closeSample();
      const generation = sampleGeneration;
      const virtual: Development = {
        id: 'sample', createdAt: '', rollA: a.id, rollB: b.id, titleA: a.name, titleB: b.name,
        seed: sample.seed, n, params, algo: ALGO_VERSION, done: 0, likes: [],
      };
      const renderer = await FrameRenderer.open(virtual, 900);
      if (generation !== sampleGeneration || state.screen !== 'mix') {
        renderer.dispose();
        return;
      }
      sample.renderer = renderer;
      sample.key = key;
      sample.frame = Math.min(sample.frame, n - 1);
    }
    const generation = sampleGeneration;
    const renderer = sample.renderer;
    renderer.setParams(params);
    const img = await renderer.renderOriginal(sample.frame, 25);
    if (generation !== sampleGeneration || state.screen !== 'mix') return;
    sample.img = img;
    putSample();
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      const status = document.getElementById('sample-status');
      if (status) status.textContent = 'Preview unavailable. Try another frame.';
    }
  } finally {
    sample.busy = false;
    if (sample.pending) {
      sample.pending = false;
      void drawSample();
    }
  }
}

function mixParams(): Development['params'] {
  const m = state.mix;
  return {
    lookId: 'M', exposureTenths: 0, whiteMerge: m.values.white, haloAmount: m.values.halo / 5, highlightVariation: true, ppm: m.full ? 111 : 56,
    settings: {
      ...DEFAULT_SETTINGS,
      shiftMode: m.randomShift ? 'random' : 'manual', shiftMm: m.values.shift,
      swapRotate: m.flip, endFog: m.values.leaks > 0, leaks: m.values.leaks > 0, leakChance: m.values.leaks / 10,
      dust: true, dustLevel: MIX_DEFAULTS.values.dust,
    },
  };
}
let startingDevelopment = false;

async function startDevelopment(reuse?: Development) {
  if (startingDevelopment || developmentTask) return;
  startingDevelopment = true;
  try {
  let dev: Development;
  if (reuse) {
    dev = await createDev({ ...reuse, seed: randomSeed(), algo: ALGO_VERSION, edits: undefined });
  } else {
    const pair = mixRolls();
    if (!pair) return;
    const [a, b] = pair;
    saveMix();
    dev = await createDev({
      rollA: a.id,
      rollB: b.id,
      titleA: a.name,
      titleB: b.name,
      seed: sample.seed,
      n: Math.min(a.length, b.length, a.photos.length, b.photos.length),
      algo: ALGO_VERSION,
      params: mixParams(),
    });
  }
  await develop(dev);
  } finally { startingDevelopment = false; }
}

// --- экран: Проявка идёт ---

let developmentTask: Promise<void> | null = null;
function develop(dev: Development): Promise<void> {
  if (developmentTask) return developmentTask;
  developmentTask = performDevelopment(dev).finally(() => { developmentTask = null; });
  return developmentTask;
}
async function performDevelopment(dev: Development) {
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
  const thumbs = await Promise.all(Array.from({ length: d.done }, (_, i) => blobUrl(`ft:${d.id}:${i}`, () => displayThumb(d, i))));
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
          <circle class="arc"${d.done ? '' : ' hidden'} cx="100" cy="100" r="88" stroke="var(--accent)" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${(frac * circ).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 100 100)"/>
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
  const full = await blobUrl(`ff:${d.id}:${i}`, () => displayFrame(d, i));
  const thumbs = await Promise.all(Array.from({ length: d.done }, (_, k) => blobUrl(`ft:${d.id}:${k}`, () => displayThumb(d, k))));
  const liked = d.likes.includes(i);
  return `<div class="screen dark result">
    ${ambient(thumbs[i] ?? '')}
    <div class="mbar">
      <button type="button" class="round-btn big back" data-back-devs aria-label="Back to developed rolls">${ICON.back}</button>
      <span class="scount">${i + 1} / ${d.n}</span>
      <button type="button" class="round-btn big" data-dev-more="${d.id}" aria-label="More">${ICON.more}</button>
    </div>
    <div class="viewer" id="viewer">
      <div class="viewer-photo"><img src="${full}" alt="Frame ${i + 1}" draggable="false"></div>
    </div>
    <div class="viewer-layer" role="group" aria-label="Move a film layer">
      <span data-drag-hint>${currentViewerDraft() ? 'Drag to move' : 'Drag slowly'}</span>
      <button type="button" data-viewer-layer="top" aria-pressed="${movingLayer === 'top'}">Top</button>
      <button type="button" data-viewer-layer="bottom" aria-pressed="${movingLayer === 'bottom'}">Bottom</button>
      <button type="button" data-viewer-undo aria-label="Undo last layer shift" ${currentViewerDraft()?.undo || (viewerUndo?.dev === d.id && viewerUndo.frame === i) ? '' : 'hidden'}>↶</button>
    </div>
    ${panelHtml('viewer', 'Frame viewer', [{ id: 'filmstrip', label: 'Filmstrip', html: `<div class="filmstrip" id="filmstrip">${thumbs
      .map((u, k) => `<button type="button" data-view="${k}" class="${k === i ? 'on' : ''}"><img src="${u}" alt="Frame ${k + 1}">${d.likes.includes(k) ? '<span>♥</span>' : ''}</button>`)
      .join('')}</div>` }], () => { void render(); })}
    <nav class="vbar" aria-label="Frame actions">
      <button type="button" class="vbtn${liked ? ' liked' : ''}" data-like aria-pressed="${liked}" aria-label="Favorite">${ICON.heart.replace('FILL', liked ? 'currentColor' : 'none')}</button>
      <button type="button" class="vbtn save" data-save-one aria-label="Save to Photos">${ICON.save}</button>
      <button type="button" class="vbtn" data-rotate-frame aria-label="Rotate the whole frame 90° clockwise">${ICON.rotate}</button>
      <button type="button" class="vbtn" data-edit aria-label="Edit this frame">${ICON.sliders}</button>
    </nav>
  </div>`;
}

let rotatingFrame = false;
let viewerBusy = false;
let movingLayer: MovingLayer = 'top';
let quickEdit: ReturnType<typeof viewerDrag> | undefined;
let viewerDraft: { dev: string; frame: number; draft: ViewerDraft } | null = null;
function currentViewerDraft() {
  return viewerDraft?.dev === state.dev?.id && viewerDraft?.frame === state.view ? viewerDraft.draft : undefined;
}
let viewerUndo: { dev: string; frame: number; edit: FrameEdit | null } | null = null;
async function step(dir: number) {
  if (rotatingFrame || viewerBusy) return;
  const d = state.dev;
  if (!d || !d.done) return;
  if (!await commitViewer()) return;
  state.view = (state.view + dir + d.done) % d.done;
  return render();
}

async function commitViewer(): Promise<boolean> {
  if (viewerBusy) return false;
  if (quickEdit && !await quickEdit.commit()) return false;
  viewerDraft = null;
  return true;
}

/**
 * Просмотр кадра: свайп влево/вправо — листать; долгое нажатие на кадр — системное меню «Поделиться»
 * с полноразмерным JPEG («Сохранить изображение» кладёт его в Фото). Меню вызывается на отпускании пальца:
 * Safari разрешает navigator.share только из жеста, а touchend им считается. Своё системное меню картинки
 * отключено (-webkit-touch-callout: none), чтобы не всплывали два меню сразу.
 */
let clearPhotoZoom: (() => void) | undefined;
function bindViewer() {
  const box = document.getElementById('viewer');
  const img = box?.querySelector('img');
  if (!box || !img) return;
  quickEdit = viewerDrag({
    dev: state.dev!, frame: state.view, box, image: img, layer: () => movingLayer,
    draft: currentViewerDraft(),
    changed: draft => {
      viewerDraft = { dev: state.dev!.id, frame: state.view, draft };
      const undo = app.querySelector<HTMLButtonElement>('[data-viewer-undo]');
      if (undo) undo.hidden = !draft.undo && !(viewerUndo?.dev === state.dev?.id && viewerUndo?.frame === state.view);
      const hint = app.querySelector('[data-drag-hint]');
      if (hint) hint.textContent = 'Drag to move';
    },
    busy: value => {
      viewerBusy = value; box.classList.toggle('adjusting', value);
      app.querySelectorAll<HTMLButtonElement>('.result button').forEach(button => { button.disabled = value; });
    },
    error: showError,
    saved: async (next, before, undo) => {
      viewerUndo = undo ? null : { dev: next.id, frame: state.view, edit: before };
      state.dev = next;
      state.devs = state.devs.map(dev => dev.id === next.id ? next : dev);
      viewerDraft = null;
      dropUrl(`ff:${next.id}:${state.view}`); dropUrl(`ft:${next.id}:${state.view}`);
    },
  });
  const releaseZoom = bindPhotoZoom(box, img.parentElement!, {
    drag: quickEdit.gesture,
    onSwipe: direction => { void step(direction); },
    onMouseTap: x => { const r = box.getBoundingClientRect(); void step(x < r.left + r.width / 2 ? -1 : 1); },
    onHold: () => {
      if (viewerBusy) return;
      const save = document.querySelector<HTMLButtonElement>('[data-save-one]');
      if (save) void shareFrames([state.view], save);
    },
  });
  const mountedEdit = quickEdit;
  clearPhotoZoom = () => { releaseZoom(); mountedEdit.dispose(); quickEdit = undefined; };
}

document.addEventListener('keydown', (e) => {
  if (state.screen !== 'result' || state.sheet) return;
  if (e.key === 'ArrowLeft') void step(-1);
  if (e.key === 'ArrowRight') void step(1);
});

async function shareFrames(indices: number[], button: HTMLButtonElement) {
  if (quickEdit?.dirty()) {
    if (!await commitViewer()) return;
    await render();
  }
  const d = state.dev!;
  const files: File[] = [];
  for (const k of indices) {
    const blob = await exportFrame(d, k);
    if (blob) files.push(new File([blob], `multik-${d.seed}-${k + 1}.jpg`, { type: 'image/jpeg' }));
  }
  const label = button.innerHTML;
  const done = () => {
    if (!button.classList.contains('vbtn')) return;
    button.innerHTML = ICON.saved;
    setTimeout(() => (button.innerHTML = label), 1500);
  };
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files });
      done();
    } else {
      for (const f of files) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(f);
        a.download = f.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
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
  if (s.kind === 'confirmRoll' || s.kind === 'confirmDev') {
    const isRoll = s.kind === 'confirmRoll';
    return `<div class="overlay" data-close-sheet><div class="alert" role="dialog" aria-modal="true" aria-label="Confirm deletion"><b>Delete ${isRoll ? 'roll' : 'development'}?</b><p>This removes ${isRoll ? 'its source photos' : 'its frames and edits'} from this device. This cannot be undone.</p><div class="alert-buttons"><button type="button" data-close-sheet>Cancel</button><button type="button" class="danger" ${isRoll ? 'data-delete-roll' : 'data-delete-dev'}="${s.id}">Delete</button></div></div></div>`;
  }
  if (s.kind === 'rollActions') {
    const r = state.rolls.find((x) => x.id === s.id);
    if (!r) return '';
    const uses = state.devs.filter((d) => d.rollA === r.id || d.rollB === r.id).length;
    return `<div class="overlay" data-close-sheet><div class="action-sheet" role="dialog" aria-label="Roll actions">
      <div class="action-group"><div class="action-title">${esc(r.name)} · ${frames(r.length)}</div>
        <button type="button" data-rename="${r.id}">Rename</button>
        <button type="button" class="danger" data-confirm-roll="${r.id}" ${uses ? 'disabled' : ''}>Delete Roll</button>${uses ? `<p class="action-explanation">Used by ${uses} development${uses === 1 ? '' : 's'}. Keep the source roll to edit or resume those frames.</p>` : ''}</div>
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
  const d = state.devs.find((x) => x.id === s.id) ?? (state.dev?.id === s.id ? state.dev : undefined);
  if (!d) return '';
  return `<div class="overlay" data-close-sheet><div class="action-sheet" role="dialog" aria-label="Development actions">
    <div class="action-group"><div class="action-title">${esc(d.titleA)} × ${esc(d.titleB)}</div>
      <button type="button" data-again="${d.id}">Develop again</button>
      ${d.likes.length ? `<button type="button" data-save-liked="${d.id}">Save ${d.likes.length} favorite${d.likes.length === 1 ? '' : 's'}</button>` : ''}
      ${state.screen === 'result' ? layoutButton('viewer', 'Customize screen') : ''}<button type="button" class="danger" data-confirm-dev="${d.id}">Delete Development</button></div>
    <div class="action-group"><button type="button" class="strong" data-close-sheet>Cancel</button></div>
  </div></div>`;
}

// --- отрисовка и события ---

let rendering = Promise.resolve();
function render(): Promise<void> {
  rendering = rendering.then(async () => {
    if (state.screen === 'edit') return; // экран правки рисует себя сам (edit.ts)
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
    clearPhotoZoom?.(); clearPhotoZoom = undefined;
    app.innerHTML = html + renderSheet();
    if (state.screen === 'mix') {
      bindSetupKnobs();
      clearPhotoZoom = bindPhotoZoom(app.querySelector('.ssample')!, app.querySelector('#setup-canvas')!);
    }
    if (state.screen === 'result') {
      bindViewer();
      const fs = document.getElementById('filmstrip');
      const on = fs?.querySelector<HTMLElement>('.on');
      if (fs && strip !== undefined) fs.scrollLeft = strip;
      on?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
    document.getElementById('rename-input')?.focus();
    updateNotice();
  }).catch(showError);
  return rendering;
}

app.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'roll-name') state.draft.name = t.value;
});

app.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'roll-files' && !state.draft.busy) {
    state.draft.error = '';
    state.draft.files = [...state.draft.files, ...(t.files ?? [])];
    void render();
  }
});

app.addEventListener('click', (e) => { void handleClick(e).catch(showError); });
async function handleClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button, a, [data-close-sheet]');
  if (!el || rotatingFrame || viewerBusy) return;
  const ds = el.dataset;
  if (state.screen === 'newRoll' && state.draft.busy) return;
  if (state.screen === 'result' && (ds.backDevs !== undefined || ds.home !== undefined || ds.edit !== undefined)) {
    if (!await commitViewer()) return;
  }
  if (ds.layout && state.sheet) { state.sheet = null; return render(); }
  if (el.classList.contains('overlay') && e.target !== el) return;

  if (ds.tab) {
    state.tab = ds.tab as 'rolls' | 'devs';
    window.scrollTo(0, 0);
    return render();
  }
  if (ds.new !== undefined) {
    state.draft = { name: `Roll ${await nextRollNumber()}`, length: 12, files: [], busy: '', error: '' };
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
  if (ds.confirmRoll || ds.confirmDev) {
    state.sheet = { kind: ds.confirmRoll ? 'confirmRoll' : 'confirmDev', id: ds.confirmRoll || ds.confirmDev! };
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
    for (const key of urls.keys()) if (key.startsWith(`ff:${ds.deleteDev}:`) || key.startsWith(`ft:${ds.deleteDev}:`)) dropUrl(key);
    await refresh();
    if (state.dev?.id === ds.deleteDev) { state.dev = null; state.screen = 'home'; state.tab = 'devs'; }
    state.sheet = null;
    return render();
  }
  if (ds.mix !== undefined) {
    state.mix.swap = false;
    sample.seed = 1 + Math.floor(Math.random() * 99999);
    sample.frame = Math.floor(Math.random() * 6);
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
  if (ds.toggle) {
    const k = ds.toggle as 'flip' | 'full';
    state.mix[k] = !state.mix[k];
    saveMix();
    return render();
  }
  if (ds.sampleDice !== undefined) {
    const pair = mixRolls();
    const n = pair ? Math.min(pair[0].length, pair[1].length) : 1;
    sample.seed = (sample.seed * 7919 + 1) % 100000;
    sample.frame = Math.floor(Math.random() * n);
    return drawSample();
  }
  if (ds.develop !== undefined) {
    closeSample();
    return startDevelopment();
  }
  if (ds.stop !== undefined) {
    state.developing.stop = true;
    await developmentTask;
    state.tab = 'devs';
    await refresh();
    return go('home');
  }
  if (ds.openDev) {
    const d = await getDev(ds.openDev);
    if (!d) return;
    // прерванная проявка, начатая прошлой версией алгоритма, проявляется заново целиком — иначе плёнка выйдет из двух половин
    if (d.done < d.n && d.algo !== ALGO_VERSION) {
      const fresh = { ...d, done: 0, algo: ALGO_VERSION, edits: {} };
      await saveDev(fresh);
      return develop(fresh);
    }
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
  if (ds.step) return step(Number(ds.step));
  if (ds.view) {
    if (Number(ds.view) === state.view || !await commitViewer()) return;
    state.view = Number(ds.view);
    return render();
  }
  if (ds.rotateFrame !== undefined) {
    const d = state.dev!;
    const frame = state.view;
    rotatingFrame = true;
    (el as HTMLButtonElement).disabled = true;
    try {
      state.dev = await rotateFrame(d.id, frame);
      dropUrl(`ff:${d.id}:${frame}`);
      dropUrl(`ft:${d.id}:${frame}`);
      await render();
    } finally { rotatingFrame = false; (el as HTMLButtonElement).disabled = false; }
    return;
  }
  if (ds.viewerLayer) {
    movingLayer = ds.viewerLayer as MovingLayer;
    app.querySelectorAll<HTMLElement>('[data-viewer-layer]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.viewerLayer === movingLayer)));
    return;
  }
  if (ds.viewerUndo !== undefined) {
    if (quickEdit?.undoDraft()) return;
    if (viewerUndo && await quickEdit?.undo(viewerUndo.edit)) await render();
    return;
  }
  if (ds.like !== undefined) {
    const d = state.dev!;
    const i = state.view;
    d.likes = d.likes.includes(i) ? d.likes.filter((k) => k !== i) : [...d.likes, i].sort((x, y) => x - y);
    await saveDev(d);
    return render();
  }
  if (ds.saveOne !== undefined) return shareFrames([state.view], el as HTMLButtonElement);
  if (ds.saveLiked) {
    const d = state.devs.find((x) => x.id === ds.saveLiked) ?? state.dev!;
    state.dev = d;
    // меню «Поделиться» открывается прямо из нажатия (иначе Safari его не покажет), лист закрываем потом
    await shareFrames(d.likes, el as HTMLButtonElement);
    state.sheet = null;
    return render();
  }
  if (ds.resetMix !== undefined) {
    state.mix = { ...MIX_DEFAULTS, values: { ...MIX_DEFAULTS.values } };
    saveMix();
    return render();
  }
  if (ds.edit !== undefined) {
    viewerUndo = null; // A later editor save starts a new correction history.
    const d = state.dev!;
    const frame = state.view;
    clearPhotoZoom?.(); clearPhotoZoom = undefined;
    state.screen = 'edit';
    state.sheet = null;
    await rendering;
    return openEditor({
      app,
      dev: d,
      frame,
      onClose: async (next, changed) => {
        state.dev = next;
        if (changed) {
          dropUrl(`ff:${next.id}:${frame}`);
          dropUrl(`ft:${next.id}:${frame}`);
        }
        await refresh();
        go('result');
      },
    });
  }
  if (ds.again) {
    const d = state.devs.find((x) => x.id === ds.again) ?? state.dev!;
    const [a, b] = await Promise.all([getRoll(d.rollA), getRoll(d.rollB)]);
    if (!a || !b) return;
    return startDevelopment(d);
  }
}

function showError(error: unknown): void {
  document.getElementById('app-error')?.remove();
  const note = document.createElement('button');
  note.id = 'app-error';
  note.className = 'app-error';
  note.setAttribute('role', 'alert');
  note.textContent = `${error instanceof Error ? error.message : 'Something went wrong'}. Tap to dismiss.`;
  note.onclick = () => note.remove();
  document.body.append(note);
}

initPwa(() => state.screen === 'home' && !developmentTask && !startingDevelopment);
void refresh().then(render).catch(showError);
