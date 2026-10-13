// Лаборатория: выбор двух пачек фото, проявка в нескольких вариантах вида, сравнение рядом.

import { ALGO_VERSION, DEFAULT_SETTINGS, makeRecipe, type Recipe, type RecipeSettings } from '../core/recipe';
import { randomSeed } from '../core/rng';
import { Developer, type Source } from '../gl/pipeline';
import { LOOKS, withWhiteMerge } from '../looks';
import { Feedback, type Verdict } from './feedback';
import { Library, type Roll } from './library';

/** Длинная сторона снимка: чуть больше ширины кадра, чтобы не тратить память телефона зря. */
const sourcePx = (ppm: number) => Math.min(4000, Math.round(36 * ppm * 1.15));

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const photos = (n: number) => plural(n, 'photo');

const state = {
  filesA: [] as File[],
  filesB: [] as File[],
  /** плёнка из библиотеки, если фото взяты оттуда */
  roll: null as Roll | null,
  seed: randomSeed(),
  busy: false,
};

const library = new Library();
const blobs = new Map<string, Blob>();
let downloads: { save(r: { filename: string; data: Blob }): Promise<unknown> } | null = null;
void (window as Window & { claude?: { use(n: string): Promise<unknown> } }).claude
  ?.use('downloads')
  .then((d) => (downloads = d as typeof downloads));

$('version').textContent = `Pipeline version ${ALGO_VERSION}`;

/** Та же лаборатория на claude.ai: там отметки попадают в хранилище, которое читает Claude. */
// кнопка «назад в приложение» — только там, где лаборатория лежит рядом с приложением (Pages, dev), не на claude.ai
if (/\/lab\/(index\.html)?$/.test(location.pathname)) $('backToApp').hidden = false;

const CLAUDE_LAB_URL = 'https://claude.ai/artifact/BpQdeYrYDxU3kJsFPBLzS1';

const feedback = new Feedback();
let lastRecipe: Recipe | null = null;

function showFeedbackMode() {
  const claude = feedback.mode === 'claude';
  const marked = [...feedback.marks.values()].filter((m) => m.verdict || m.comment).length;
  const status = $('fbStatus');
  if (claude) {
    status.textContent = `Marks are saved on this page, and Claude can see them. Frames marked: ${marked}.`;
  } else {
    status.innerHTML = `Marks are saved only in this browser. Frames marked: ${marked}. To let Claude see them directly, open <a href="${CLAUDE_LAB_URL}" target="_blank" rel="noopener">the lab on claude.ai</a>, or tap Copy feedback and send the text.`;
  }
  $('copyMarks').hidden = claude;
  $('thumbRow').hidden = !claude;
  refreshMarks();
}
feedback.onChange(showFeedbackMode);
void feedback.init().then(showFeedbackMode);

function refreshMarks() {
  document.querySelectorAll<HTMLElement>('.mark').forEach((el) => {
    const m = feedback.marks.get(el.dataset.id!);
    el.querySelector('.like')!.setAttribute('aria-pressed', String(m?.verdict === 'like'));
    el.querySelector('.dislike')!.setAttribute('aria-pressed', String(m?.verdict === 'dislike'));
    const input = el.querySelector<HTMLInputElement>('.comment')!;
    if (document.activeElement !== input) input.value = m?.comment ?? '';
  });
}

$('copyMarks').addEventListener('click', async () => {
  const text = feedback.exportText() || 'No marks yet.';
  try {
    await navigator.clipboard.writeText(text);
    $('copyMarks').textContent = 'Copied';
  } catch {
    const ta = $<HTMLTextAreaElement>('note');
    ta.value = text;
    ta.select();
  }
});

$('saveNote').addEventListener('click', async () => {
  const ta = $<HTMLTextAreaElement>('note');
  const text = ta.value.trim();
  if (!text) return;
  await feedback.note(text, { version: ALGO_VERSION, seed: lastRecipe?.seed ?? state.seed });
  ta.value = '';
  $('saveNote').textContent = 'Note saved';
  setTimeout(() => ($('saveNote').textContent = 'Save note'), 2000);
});

const looksBox = $('looks');
for (const look of LOOKS) {
  const row = document.createElement('label');
  row.className = 'look';
  row.innerHTML = `<input type="checkbox" value="${look.id}"${look.defaultOn ? ' checked' : ''} /><span><b>${look.id} · ${look.name}</b><small>${look.note}</small></span>`;
  looksBox.append(row);
}

const showSeed = () => ($('seed').textContent = String(state.seed));
showSeed();

function frameCount(): number {
  return state.roll ? state.roll.n : Math.min(state.filesA.length, state.filesB.length);
}

function updateCounts() {
  $('countA').textContent = photos(state.roll ? state.roll.namesA.length : state.filesA.length);
  $('countB').textContent = photos(state.roll ? state.roll.namesB.length : state.filesB.length);
  const n = frameCount();
  $('rollInfo').hidden = !state.roll;
  if (state.roll) $('rollInfo').textContent = `Photos from the library: roll #${state.roll.number}. Choose new photos to start another roll.`;
  $('framesInfo').textContent = n
    ? `Frames on the roll: ${n}.` + (state.filesA.length !== state.filesB.length ? ' Extra photos in the larger set are not used.' : '')
    : 'Choose photos for both passes. The roll gets as many frames as the smaller set has photos.';
  ($('develop') as HTMLButtonElement).disabled = n === 0 || state.busy;
}

$<HTMLInputElement>('passA').addEventListener('change', (e) => {
  state.filesA = [...((e.target as HTMLInputElement).files ?? [])];
  state.roll = null;
  updateCounts();
});
$<HTMLInputElement>('passB').addEventListener('change', (e) => {
  state.filesB = [...((e.target as HTMLInputElement).files ?? [])];
  state.roll = null;
  updateCounts();
});

const white = $<HTMLInputElement>('white');
const whiteOn = $<HTMLInputElement>('whiteOn');
const whiteLabel = () => ($('whiteOut').textContent = whiteOn.checked ? `${white.value} of 10` : 'per look');
white.addEventListener('input', whiteLabel);
whiteOn.addEventListener('change', () => {
  white.disabled = !whiteOn.checked;
  whiteLabel();
});
/** слияние белого, с которым проявлена текущая плёнка (null — у каждого варианта своё) */
let whiteLevel: number | null = null;
// поправка экспозиции поверх каждого варианта, в ступенях: 0 — как задумано в варианте
const ev = $<HTMLInputElement>('ev');
const evText = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)} EV`;
ev.addEventListener('input', () => ($('evOut').textContent = evText(Number(ev.value))));
let evLevel = 0;

const shift = $<HTMLInputElement>('shift');
const shiftOut = $('shiftOut');
shift.addEventListener('input', () => (shiftOut.textContent = `${shift.value} mm`));
document.querySelectorAll<HTMLInputElement>('input[name=shiftMode]').forEach((r) =>
  r.addEventListener('change', () => (shift.disabled = r.value === 'random' && r.checked)),
);

$('reroll').addEventListener('click', () => {
  state.seed = randomSeed();
  showSeed();
});

function readSettings(): RecipeSettings {
  const checked = (id: string) => $<HTMLInputElement>(id).checked;
  const manual = document.querySelector<HTMLInputElement>('input[name=shiftMode]:checked')?.value === 'manual';
  return {
    ...DEFAULT_SETTINGS,
    shiftMode: manual ? 'manual' : 'random',
    shiftMm: Number(shift.value),
    swapRotate: checked('swap'),
    reverseOrder: checked('reverse'),
    leaks: checked('leaks'),
    endFog: checked('fog'),
    dust: checked('dust'),
    exposureJitter: checked('jitter'),
  };
}

async function decode(file: Blob, maxPx: number): Promise<ImageBitmap | HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  if (scale === 1) return bmp;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

function toUrl(img: ImageData): Promise<string> {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return new Promise((resolve) =>
    c.toBlob(
      (b) => {
        const url = URL.createObjectURL(b!);
        blobs.set(url, b!);
        resolve(url);
      },
      'image/jpeg',
      0.92,
    ),
  );
}

/** Снимок для библиотеки: уже повёрнутый по EXIF и уменьшенный до 4000 px JPEG. */
async function toStored(file: File): Promise<Blob> {
  const img = await decode(file, 4000);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  if (img instanceof ImageBitmap) img.close();
  return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/jpeg', 0.92));
}

// --- сохранение кадра ---
async function saveImage(url: string, filename: string, button: HTMLButtonElement) {
  const blob = blobs.get(url);
  if (!blob) return;
  const label = button.textContent;
  try {
    if (downloads) {
      await downloads.save({ filename, data: blob });
    } else {
      const file = new File([blob], filename, { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      }
    }
    button.textContent = 'Saved';
  } catch {
    button.textContent = 'Couldn’t save';
  }
  setTimeout(() => (button.textContent = label), 2000);
}

const viewer = $('viewer');
const viewerImg = $<HTMLImageElement>('viewerImg');
let viewerFile = '';
function openViewer(url: string, caption: string, filename: string) {
  viewerImg.src = url;
  viewerImg.alt = caption;
  viewerFile = filename;
  $('viewerCaption').textContent = caption;
  viewer.hidden = false;
}
$('viewerClose').addEventListener('click', () => (viewer.hidden = true));
viewer.addEventListener('click', (e) => e.target === viewer && (viewer.hidden = true));
document.addEventListener('keydown', (e) => e.key === 'Escape' && (viewer.hidden = true));
$('viewerSave').addEventListener('click', (e) => saveImage(viewerImg.src, viewerFile, e.currentTarget as HTMLButtonElement));

// --- библиотека плёнок ---
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function renderLibrary() {
  const box = $('library');
  if (!library.available) {
    box.innerHTML = '<p class="muted small">The library isn’t available in this browser.</p>';
    return;
  }
  const rolls = await library.list();
  if (!rolls.length) {
    box.innerHTML = '<p class="muted small">Developed rolls will appear here. Photos are stored only on this device, in browser storage.</p>';
    return;
  }
  box.innerHTML = '';
  for (const roll of rolls) {
    const likes = [...feedback.marks.values()].filter((m) => roll.seeds.includes(m.seed) && m.verdict === 'like').length;
    const row = document.createElement('div');
    row.className = 'roll' + (state.roll?.id === roll.id ? ' current' : '');
    row.innerHTML = `<div class="roll-info"><b>Roll #${roll.number}</b><span>${plural(roll.n, 'frame')} · ${formatDate(roll.createdAt)} · ${plural(roll.seeds.length, 'development')}${likes ? ` · 👍 ${likes}` : ''}</span><span class="roll-seeds">Recipes: ${roll.seeds.join(', ') || '—'}</span></div><div class="roll-actions"><button type="button" class="ghost again">Develop again</button><button type="button" class="ghost fresh">New recipe</button><button type="button" class="ghost danger remove">Delete</button></div>`;
    const pick = async (seed: number) => {
      state.roll = roll;
      state.seed = seed;
      showSeed();
      updateCounts();
      await develop();
    };
    row.querySelector('.again')!.addEventListener('click', () => pick(roll.seeds.at(-1) ?? randomSeed()));
    row.querySelector('.fresh')!.addEventListener('click', () => pick(randomSeed()));
    const remove = row.querySelector<HTMLButtonElement>('.remove')!;
    remove.addEventListener('click', async () => {
      if (remove.dataset.confirm !== '1') {
        remove.dataset.confirm = '1';
        remove.textContent = 'Delete roll?';
        return;
      }
      await library.remove(roll);
      if (state.roll?.id === roll.id) state.roll = null;
      updateCounts();
      void renderLibrary();
    });
    box.append(row);
  }
}
void library.init().then(renderLibrary);
feedback.onChange(() => void renderLibrary());

function thumbOf(img: ImageData): Promise<Blob> {
  const w = 640;
  const h = Math.round((img.height / img.width) * w);
  const full = document.createElement('canvas');
  full.width = img.width;
  full.height = img.height;
  full.getContext('2d')!.putImageData(img, 0, 0);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(full, 0, 0, w, h);
  return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
}

function markControls(recipe: Recipe, frame: number, lookId: string, lookName: string, thumb: Promise<Blob>): HTMLElement {
  const id = Feedback.id(recipe.seed, frame, lookId);
  const box = document.createElement('div');
  box.className = 'mark';
  box.dataset.id = id;
  box.innerHTML = `<button type="button" class="like" aria-pressed="false" aria-label="Like">👍</button><button type="button" class="dislike" aria-pressed="false" aria-label="Dislike">👎</button><input class="comment" id="c-${id}" type="text" placeholder="Comment" />`;
  const save = (verdict: Verdict, comment: string) =>
    feedback.save(
      { version: ALGO_VERSION, seed: recipe.seed, frame, look: lookId, lookName, verdict, comment, shiftMm: Number(recipe.shiftMm.toFixed(1)), details: describe(recipe) + (whiteLevel === null ? '' : ` · white merge ${whiteLevel}`) + (evLevel ? ` · exposure ${evText(evLevel)}` : '') },
      $<HTMLInputElement>('sendThumb').checked ? () => thumb : null,
    );
  const current = () => feedback.marks.get(id);
  const toggle = (v: Exclude<Verdict, null>) => save(current()?.verdict === v ? null : v, current()?.comment ?? '');
  box.querySelector('.like')!.addEventListener('click', () => toggle('like'));
  box.querySelector('.dislike')!.addEventListener('click', () => toggle('dislike'));
  const input = box.querySelector<HTMLInputElement>('.comment')!;
  const commit = () => {
    if (input.value.trim() !== (current()?.comment ?? '')) void save(current()?.verdict ?? null, input.value.trim());
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  return box;
}

function describe(recipe: Recipe): string {
  const parts = [`Recipe #${recipe.seed}`, `shift ${recipe.shiftMm.toFixed(1)} mm`];
  if (recipe.settings.swapRotate) parts.push('second roll flipped');
  if (recipe.leaks.length) {
    parts.push(`light leaks on frames ${recipe.leaks.map((l) => l.frame + 1).join(', ')}`);
  }
  if (recipe.fogs.length) parts.push(`fogged ends: ${recipe.fogs.map((f) => (f.dir === 1 ? 'start' : 'end')).join(', ')}`);
  return parts.join(' · ');
}

let urls: string[] = [];

async function develop() {
  const n = frameCount();
  whiteLevel = whiteOn.checked ? Number(white.value) : null;
  evLevel = Number(ev.value);
  const looks = LOOKS.filter((l) => looksBox.querySelector<HTMLInputElement>(`input[value="${l.id}"]`)!.checked)
    .map((l) => (whiteLevel === null ? l : withWhiteMerge(l, whiteLevel)))
    .map((l) => ({ ...l, exposure: l.exposure * 2 ** evLevel }));
  if (!n || !looks.length) return;
  state.busy = true;
  updateCounts();
  const error = $('error');
  error.hidden = true;
  const progress = $<HTMLProgressElement>('progress');
  progress.hidden = false;
  progress.value = 0;
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const results = $('results');
  results.innerHTML = '';

  const canvas = document.createElement('canvas');
  let dev: Developer | null = null;
  const sources: Source[] = [];
  try {
    dev = new Developer(canvas);
    const recipe = makeRecipe(n, state.seed, readSettings());
    lastRecipe = recipe;
    const ppm = Number($<HTMLSelectElement>('size').value);
    const total = n * 2 + n * looks.length;
    let done = 0;
    const tick = () => (progress.value = ++done / total);

    // фото: из библиотеки или новые — тогда сначала сохраняем их как новую плёнку
    let photosA: Blob[];
    let photosB: Blob[];
    if (state.roll) {
      ({ a: photosA, b: photosB } = await library.photos(state.roll));
    } else {
      photosA = [];
      photosB = [];
      for (const f of state.filesA) photosA.push(await toStored(f));
      for (const f of state.filesB) photosB.push(await toStored(f));
      if (library.available) {
        state.roll = await library.create(photosA, photosB, state.filesA.map((f) => f.name), state.filesB.map((f) => f.name));
      }
    }
    if (state.roll) {
      state.roll = await library.addSeed(state.roll, state.seed);
      const r = state.roll;
      void feedback.roll(r.id, { number: r.number, createdAt: r.createdAt, n: r.n, seeds: r.seeds, namesA: r.namesA, namesB: r.namesB, version: ALGO_VERSION });
      updateCounts();
      void renderLibrary();
    }

    const load = async (files: Blob[]) => {
      const out: Source[] = [];
      for (const f of files.slice(0, n)) {
        const img = await decode(f, sourcePx(ppm));
        const src = dev!.upload(img);
        if (img instanceof ImageBitmap) img.close();
        out.push(src);
        sources.push(src);
        tick();
      }
      return out;
    };
    const srcA = await load(photosA);
    const srcB = await load(photosB);

    const summary = document.createElement('p');
    summary.className = 'summary';
    summary.textContent = describe(recipe);
    results.append(summary);

    for (let i = 0; i < n; i++) {
      const block = document.createElement('section');
      block.className = 'frame';
      block.innerHTML = `<h3>Frame ${i + 1}</h3><div class="variants"></div>`;
      results.append(block);
      const grid = block.querySelector('.variants')!;
      for (const look of looks) {
        const img = dev.renderFrame(i, recipe, look, srcA, srcB, ppm);
        const url = await toUrl(img);
        urls.push(url);
        const fig = document.createElement('figure');
        fig.className = 'variant';
        const caption = `Frame ${i + 1} · look ${look.id} · recipe ${recipe.seed}`;
        const filename = `multik-${recipe.seed}-${i + 1}${look.id}.jpg`;
        fig.innerHTML = `<img src="${url}" alt="Frame ${i + 1}, look ${look.id}" /><figcaption>${caption}</figcaption>`;
        fig.querySelector('img')!.addEventListener('click', () => openViewer(url, caption, filename));
        const controls = markControls(recipe, i + 1, look.id, look.name, thumbOf(img));
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'save';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => saveImage(url, filename, saveBtn));
        controls.append(saveBtn);
        fig.append(controls);
        grid.append(fig);
        refreshMarks();
        tick();
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } catch (e) {
    error.hidden = false;
    error.textContent = `Couldn’t develop: ${(e as Error).message}`;
    console.error(e);
  } finally {
    sources.forEach((s) => dev?.release(s));
    dev?.gl.getExtension('WEBGL_lose_context')?.loseContext();
    progress.hidden = true;
    state.busy = false;
    updateCounts();
  }
}

$('develop').addEventListener('click', develop);
updateCounts();

// для автоматических прогонов лаборатории (scripts/lab-shot.mjs)
(window as unknown as { __setSeed: (s: number) => void }).__setSeed = (s) => {
  state.seed = s;
  showSeed();
};
