// Мультик — приложение (SPEC 1.3, дизайн «в стиле iOS»).
// Экраны: Плёнки · Новая плёнка · Смешать · Проявка идёт · Просмотр · Проявки.

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
const LOOK_NAMES: Record<string, string> = { F: 'Белое сливается', E: 'Пересвет', D: 'Плотная', B: 'Portra' };

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
  { id: 'shift', label: 'Сдвиг', title: 'СДВИГ ВТОРОЙ ПЛЁНКИ', min: -36, max: 36, major: 6, fmt: (v) => `${v > 0 ? '+' : ''}${v} мм`, short: (v) => `${v > 0 ? '+' : ''}${v}` },
  { id: 'white', label: 'Белое', title: 'СЛИЯНИЕ БЕЛОГО', min: 0, max: 10, major: 5, fmt: (v) => (v ? `${v} из 10 — ${v < 4 ? 'мягко' : v < 8 ? 'сливается' : 'сплошное белое'}` : 'выкл'), short: String },
  { id: 'leaks', label: 'Засветки', title: 'ЗАСВЕТКИ', min: 0, max: 10, major: 5, fmt: (v) => (v ? `${v} из 10 кадров` : 'нет'), short: String },
  { id: 'exposure', label: 'Пересвет', title: 'ПЕРЕСВЕТ', min: 0, max: 20, major: 5, fmt: (v) => `+${(v / 10).toFixed(1)} EV`, short: (v) => `+${(v / 10).toFixed(1)}` },
  { id: 'dust', label: 'Пыль', title: 'ПЫЛЬ И ВОЛОСКИ', min: 0, max: 10, major: 5, fmt: (v) => (v ? String(v) : 'нет'), short: String },
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
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const frames = (n: number) => `${n} ${plural(n, 'кадр', 'кадра', 'кадров')}`;

const ICON = {
  plus: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>',
  more: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.8" fill="currentColor"/><circle cx="10" cy="10" r="1.8" fill="currentColor"/><circle cx="16" cy="10" r="1.8" fill="currentColor"/></svg>',
  rolls: '<svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true"><rect x="3" y="3" width="20" height="18" rx="3" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3 7.5h20M3 16.5h20" stroke="currentColor" stroke-width="1.6"/></svg>',
  devs: '<svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true"><circle cx="10" cy="12" r="7" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="16" cy="12" r="7" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  lab: '<svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true"><path d="M5 7h16M5 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="7" r="2.6" fill="var(--bar)" stroke="currentColor" stroke-width="1.8"/><circle cx="16" cy="17" r="2.6" fill="var(--bar)" stroke="currentColor" stroke-width="1.8"/></svg>',
  mix: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="7.5" cy="10" r="5.5" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12.5" cy="10" r="5.5" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  swap: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3v13M6 16l-3-3M6 16l3-3M14 17V4M14 4l-3 3M14 4l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  back: '<svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2L2 10l8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  share: '<svg width="24" height="26" viewBox="0 0 24 26" aria-hidden="true"><path d="M12 2v14M12 2l-4 4M12 2l4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v11A1.5 1.5 0 0 0 5.5 24h13a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 18.5 10H17" stroke="currentColor" stroke-width="1.9" fill="none"/></svg>',
  heart: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 22s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 13 7.6a4.8 4.8 0 0 1 8.5 3.2C21.5 16.8 13 22 13 22z" stroke="currentColor" stroke-width="1.9" fill="FILL"/></svg>',
  again: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M21 13a8 8 0 1 1-2.4-5.7M21 4v4h-4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
};

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

async function renderHome(): Promise<string> {
  const tabBar = `<nav class="tabbar">
    <button type="button" data-tab="rolls" class="${state.tab === 'rolls' ? 'on' : ''}">${ICON.rolls}<span>Плёнки</span></button>
    <button type="button" data-tab="devs" class="${state.tab === 'devs' ? 'on' : ''}">${ICON.devs}<span>Проявки</span></button>
    <a href="./lab/">${ICON.lab}<span>Лаборатория</span></a>
  </nav>`;
  if (state.tab === 'devs') return (await renderDevs()) + tabBar;

  const covers = await Promise.all(state.rolls.map((r) => blobUrl(`rt:${r.id}:0`, () => rollThumb(r.id, 0))));
  const sel = state.selection;
  const hint =
    sel.length === 2
      ? 'Выбрано 2 — смешаем в двойную экспозицию'
      : sel.length === 1
        ? 'Выберите ещё одну плёнку'
        : state.rolls.length
          ? 'Нажмите на две плёнки, чтобы смешать их'
          : '';
  const cards = state.rolls
    .map((r, k) => {
      const idx = sel.indexOf(r.id);
      const dim = sel.length === 2 && idx < 0 ? ' dim' : '';
      return `<div class="roll${dim}">
        <button type="button" class="roll-cover" data-pick="${r.id}" aria-pressed="${idx >= 0}" aria-label="${esc(r.name)}">
          ${covers[k] ? `<img src="${covers[k]}" alt="">` : '<div class="ph"></div>'}
          <span class="badge${idx >= 0 ? ' on' : ''}">${idx >= 0 ? idx + 1 : ''}</span>
        </button>
        <div class="roll-text">
          <div><b>${esc(r.name)}</b><span>${frames(r.length)} · ${fmtDate(r.createdAt)}</span></div>
          <button type="button" class="icon-btn" data-roll-more="${r.id}" aria-label="Действия с плёнкой">${ICON.more}</button>
        </div>
      </div>`;
    })
    .join('');
  const empty = `<div class="empty">
      <div class="empty-icon">${ICON.rolls}</div>
      <b>Пока нет плёнок</b>
      <p>Плёнка — это один проход: выберите фото, дайте название. Потом смешайте две любые плёнки в двойную экспозицию.</p>
      <button type="button" class="capsule" data-new>Снять первую плёнку</button>
    </div>`;
  return `<div class="screen light">
    <header class="nav-right"><button type="button" class="round" data-new aria-label="Новая плёнка">${ICON.plus}</button></header>
    <h1 class="large">Плёнки</h1>
    ${hint ? `<p class="sub">${hint}</p>` : ''}
    ${state.rolls.length ? `<div class="grid">${cards}</div>` : empty}
    ${sel.length === 2 ? `<button type="button" class="fab" data-mix>${ICON.mix}Смешать 2 плёнки</button>` : ''}
  </div>${tabBar}`;
}

async function renderDevs(): Promise<string> {
  const thumbs = await Promise.all(state.devs.map((d) => (d.done ? blobUrl(`ft:${d.id}:0`, () => devThumb(d.id, 0)) : Promise.resolve(''))));
  const rows = state.devs
    .map((d, k) => {
      const unfinished = d.done < d.n;
      return `<div class="dev-row">
        <button type="button" class="dev-open" data-open-dev="${d.id}">
          ${thumbs[k] ? `<img src="${thumbs[k]}" alt="">` : '<div class="ph"></div>'}
          <div class="dev-text">
            <b>${esc(d.titleA)} × ${esc(d.titleB)}</b>
            <span>${fmtDateTime(d.createdAt)} · ${frames(d.n)}${d.likes.length ? ` · ♥ ${d.likes.length}` : ''}</span>
            ${unfinished ? `<span class="chip">Проявлено ${d.done} из ${d.n} — продолжить</span>` : ''}
          </div>
        </button>
        <button type="button" class="icon-btn" data-dev-more="${d.id}" aria-label="Действия с проявкой">${ICON.more}</button>
      </div>`;
    })
    .join('');
  return `<div class="screen light">
    <header class="nav-right"></header>
    <h1 class="large">Проявки</h1>
    ${state.devs.length ? `<div class="list">${rows}</div>` : `<div class="empty"><div class="empty-icon">${ICON.devs}</div><b>Проявок пока нет</b><p>Выберите две плёнки и нажмите «Смешать».</p></div>`}
  </div>`;
}

// --- экран: Новая плёнка ---

async function renderNewRoll(): Promise<string> {
  const d = state.draft;
  const thumbs = d.files.map((f, i) => {
    const key = `draft:${i}:${f.name}:${f.size}`;
    if (!urls.has(key)) urls.set(key, URL.createObjectURL(f));
    return `<button type="button" class="pick" data-unpick="${i}" aria-label="Убрать фото"><img src="${urls.get(key)}" alt=""><span>×</span></button>`;
  });
  const emptyCells = Math.max(0, d.length - d.files.length);
  const cells = thumbs.join('') + '<div class="cell"></div>'.repeat(Math.min(emptyCells, 12));
  const ready = d.files.length === d.length && !d.busy;
  return `<div class="screen sheet-bg">
    <div class="sheet">
      <div class="grabber"></div>
      <div class="sheet-nav">
        <button type="button" class="link" data-cancel-new>Отменить</button>
        <b>Новая плёнка</b>
        <button type="button" class="link strong" data-save-roll ${ready ? '' : 'disabled'}>Сохранить</button>
      </div>
      <div class="group">
        <label class="row"><span>Название</span><input id="roll-name" type="text" value="${esc(d.name)}" maxlength="60"></label>
      </div>
      <div class="section-title">Длина плёнки</div>
      <div class="segmented" role="radiogroup">
        ${LENGTHS.map((n) => `<button type="button" role="radio" aria-checked="${n === d.length}" data-length="${n}">${n}</button>`).join('')}
      </div>
      <div class="section-title split"><span>Кадры</span><span>${d.files.length} из ${d.length}</span></div>
      <div class="picks">${cells}</div>
      ${d.files.length > d.length ? `<p class="note warn">Выбрано больше, чем кадров на плёнке. Уберите ${d.files.length - d.length} или выберите длину побольше.</p>` : ''}
      <label class="capsule wide light-btn">Добавить из медиатеки<input id="roll-files" type="file" accept="image/*" multiple hidden></label>
      <p class="note">${d.busy ? esc(d.busy) : 'Фото остаются на этом устройстве. Плёнку можно смешивать с любой другой.'}</p>
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
    new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Не удалось прочитать фото'))), 'image/jpeg', q));
  return { full: await toBlob(c, 0.92), thumb: await toBlob(t, 0.8), meta: { w: c.width, h: c.height } };
}

async function saveNewRoll() {
  const d = state.draft;
  const name = d.name.trim() || `Плёнка ${await nextRollNumber()}`;
  try {
    const photos = [];
    for (let i = 0; i < d.files.length; i++) {
      d.busy = `Готовим кадры: ${i + 1} из ${d.files.length}…`;
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
    d.busy = `Не получилось сохранить: ${(e as Error).message}. Попробуйте другие фото или освободите место.`;
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
  if (!pair) return '<div class="screen dark"><p class="sub">Выберите две плёнки.</p></div>';
  const [a, b] = pair;
  const m = state.mix;
  const [ca, cb] = await Promise.all([blobUrl(`rt:${a.id}:0`, () => rollThumb(a.id, 0)), blobUrl(`rt:${b.id}:0`, () => rollThumb(b.id, 0))]);
  const p = PARAMS.find((q) => q.id === m.param)!;
  const randomShift = p.id === 'shift' && m.randomShift;
  const value = m.values[p.id];
  const ticks = Array.from({ length: p.max - p.min + 1 }, (_, i) => `<i class="${i % p.major === 0 ? 'major' : ''}"></i>`).join('');
  return `<div class="screen dark">
    <div class="bar3">
      <button type="button" class="link white" data-home>Отменить</button>
      <b>Смешать</b>
      <span></span>
    </div>
    <div class="pair">
      <figure class="pass p1"><img src="${ca}" alt=""><figcaption><small>ПРОХОД 1</small>${esc(a.name)} · ${a.length}</figcaption></figure>
      <figure class="pass p2"><img src="${cb}" alt="" class="${m.flip ? 'flipped' : ''}"><figcaption><small>ПРОХОД 2${m.flip ? ' · ПЕРЕВЁРНУТ' : ''}</small>${esc(b.name)} · ${b.length}</figcaption></figure>
      <button type="button" class="swap" data-swap aria-label="Поменять проходы местами">${ICON.swap}</button>
    </div>
    <p class="sub center">${frames(Math.min(a.length, b.length))} · по короткой плёнке</p>
    <div class="looks">
      ${MIX_LOOKS.map((id) => `<button type="button" data-look="${id}" class="${id === m.look ? 'on' : ''}"><span class="look-dot look-${id}">${id}</span><small>${LOOK_NAMES[id]}</small></button>`).join('')}
    </div>
    <div class="dial-box">
      <div class="dial-head"><small>${p.title}</small><b>${randomShift ? 'случайно' : p.fmt(value)}</b></div>
      <div class="dial-wrap">
        <div class="dial${randomShift ? ' muted' : ''}" id="dial"><div class="ticks">${ticks}</div></div>
        <div class="needle"></div>
      </div>
      <div class="params">
        ${PARAMS.map((q) => `<button type="button" data-param="${q.id}" class="${q.id === m.param ? 'on' : ''}"><span>${q.id === 'shift' && m.randomShift ? '?' : q.short(m.values[q.id])}</span><small>${q.label}</small></button>`).join('')}
      </div>
      <div class="chips">
        <button type="button" data-toggle="randomShift" aria-pressed="${m.randomShift}">Сдвиг случайно</button>
        <button type="button" data-toggle="flip" aria-pressed="${m.flip}">Перевернуть второй</button>
        <button type="button" data-toggle="full" aria-pressed="${m.full}">12 Мп</button>
      </div>
    </div>
    <div class="bottom"><button type="button" class="capsule yellow wide" data-develop>Проявить</button></div>
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
  return `<div class="screen dark">
    <div class="bar3">
      <button type="button" class="link white" data-stop>${state.developing.error ? 'Назад' : 'Остановить'}</button>
      <b>${esc(d.titleA)} × ${esc(d.titleB)}</b>
      <span></span>
    </div>
    <div class="progress">
      <div class="ring">
        <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="88" stroke="#2c2c2e" stroke-width="10" fill="none"/>
          <circle cx="100" cy="100" r="88" stroke="#ffd60a" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${(frac * circ).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 100 100)"/>
        </svg>
        <div><b>${d.done}</b><span>из ${frames(d.n)}</span></div>
      </div>
      <h2>${state.developing.error ? 'Проявка остановилась' : 'Проявляем плёнку'}</h2>
      <p>${state.developing.error ? esc(state.developing.error) : 'Не закрывайте приложение. Если проявка прервётся, её можно продолжить из «Проявок» — с того же кадра.'}</p>
    </div>
    <div class="strip">${thumbs.map((u) => `<img src="${u}" alt="">`).join('')}</div>
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
    <div class="bar3">
      <button type="button" class="link" data-back-devs>${ICON.back}Проявки</button>
      <div class="title2"><b>Кадр ${i + 1} из ${d.n}</b><small>${esc(d.titleA)} × ${esc(d.titleB)}</small></div>
      <span></span>
    </div>
    <div class="viewer">
      <button type="button" class="nav-zone left" data-step="-1" aria-label="Предыдущий кадр"></button>
      <img src="${full}" alt="Кадр ${i + 1}">
      <button type="button" class="nav-zone right" data-step="1" aria-label="Следующий кадр"></button>
    </div>
    <div class="filmstrip" id="filmstrip">${thumbs
      .map((u, k) => `<button type="button" data-view="${k}" class="${k === i ? 'on' : ''}"><img src="${u}" alt="Кадр ${k + 1}">${d.likes.includes(k) ? '<span>♥</span>' : ''}</button>`)
      .join('')}</div>
    ${d.likes.length ? `<div class="center pad"><button type="button" class="capsule glass" data-save-liked>Сохранить отмеченные в Фото · ${d.likes.length}</button></div>` : ''}
    <nav class="toolbar">
      <button type="button" data-save-one>${ICON.share}<span>Сохранить</span></button>
      <button type="button" data-like class="${liked ? 'liked' : ''}" aria-pressed="${liked}">${ICON.heart.replace('FILL', liked ? 'currentColor' : 'none')}<span>Нравится</span></button>
      <button type="button" data-again>${ICON.again}<span>Проявить заново</span></button>
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
      button.textContent = 'Не сохранилось';
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
    return `<div class="overlay" data-close-sheet><div class="action-sheet" role="dialog" aria-label="Действия с плёнкой">
      <div class="action-group"><div class="action-title">${esc(r.name)} · ${frames(r.length)}</div>
        <button type="button" data-rename="${r.id}">Переименовать</button>
        <button type="button" class="danger" data-delete-roll="${r.id}">Удалить плёнку</button></div>
      <div class="action-group"><button type="button" class="strong" data-close-sheet>Отменить</button></div>
    </div></div>`;
  }
  if (s.kind === 'rename') {
    const r = state.rolls.find((x) => x.id === s.id);
    if (!r) return '';
    return `<div class="overlay" data-close-sheet><div class="alert" role="dialog" aria-label="Переименовать плёнку">
      <b>Название плёнки</b>
      <input id="rename-input" type="text" value="${esc(r.name)}" maxlength="60">
      <div class="alert-buttons"><button type="button" data-close-sheet>Отменить</button><button type="button" class="strong" data-rename-save="${r.id}">Сохранить</button></div>
    </div></div>`;
  }
  const d = state.devs.find((x) => x.id === s.id);
  if (!d) return '';
  return `<div class="overlay" data-close-sheet><div class="action-sheet" role="dialog" aria-label="Действия с проявкой">
    <div class="action-group"><div class="action-title">${esc(d.titleA)} × ${esc(d.titleB)}</div>
      <button type="button" class="danger" data-delete-dev="${d.id}">Удалить проявку</button></div>
    <div class="action-group"><button type="button" class="strong" data-close-sheet>Отменить</button></div>
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
    return render();
  }
  if (ds.new !== undefined) {
    state.draft = { name: `Плёнка ${await nextRollNumber()}`, length: 12, files: [], busy: '' };
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
    dropUrl(`rt:${ds.deleteRoll}:0`);
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
