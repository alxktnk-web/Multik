// Лаборатория: выбор двух пачек фото, проявка в нескольких вариантах вида, сравнение рядом.

import { ALGO_VERSION, DEFAULT_SETTINGS, makeRecipe, type Recipe, type RecipeSettings } from '../core/recipe';
import { randomSeed } from '../core/rng';
import { Developer, type Source } from '../gl/pipeline';
import { LOOKS } from '../looks';
import { Feedback, type Verdict } from './feedback';

/** Длинная сторона снимка: чуть больше ширины кадра, чтобы не тратить память телефона зря. */
const sourcePx = (ppm: number) => Math.min(4000, Math.round(36 * ppm * 1.15));

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  filesA: [] as File[],
  filesB: [] as File[],
  seed: randomSeed(),
  busy: false,
};

$('version').textContent = `Версия конвейера ${ALGO_VERSION}`;

/** Та же лаборатория на claude.ai: там отметки попадают в хранилище, которое читает Claude. */
const CLAUDE_LAB_URL = 'https://claude.ai/artifact/BpQdeYrYDxU3kJsFPBLzS1';

const feedback = new Feedback();
let lastRecipe: Recipe | null = null;

function showFeedbackMode() {
  const claude = feedback.mode === 'claude';
  const marked = [...feedback.marks.values()].filter((m) => m.verdict || m.comment).length;
  const status = $('fbStatus');
  if (claude) {
    status.textContent = `Отметки сохраняются на этой странице, Claude их видит. Отмечено кадров: ${marked}.`;
  } else {
    status.innerHTML = `Отметки сохраняются только в этом браузере. Отмечено кадров: ${marked}. Чтобы Claude видел их сам, открывайте <a href="${CLAUDE_LAB_URL}" target="_blank" rel="noopener">лабораторию на claude.ai</a> — или нажмите «Скопировать отзывы» и пришлите текст.`;
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
  const text = feedback.exportText() || 'Отметок пока нет.';
  try {
    await navigator.clipboard.writeText(text);
    $('copyMarks').textContent = 'Скопировано';
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
  $('saveNote').textContent = 'Заметка сохранена';
  setTimeout(() => ($('saveNote').textContent = 'Сохранить заметку'), 2000);
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

function updateCounts() {
  $('countA').textContent = `${state.filesA.length} фото`;
  $('countB').textContent = `${state.filesB.length} фото`;
  const n = Math.min(state.filesA.length, state.filesB.length);
  $('framesInfo').textContent = n
    ? `Кадров на плёнке: ${n}.` + (state.filesA.length !== state.filesB.length ? ' Лишние фото большей пачки не используются.' : '')
    : 'Выберите фото для обоих проходов. Кадров будет столько, сколько фото в меньшей пачки.';
  ($('develop') as HTMLButtonElement).disabled = n === 0 || state.busy;
}

$<HTMLInputElement>('passA').addEventListener('change', (e) => {
  state.filesA = [...((e.target as HTMLInputElement).files ?? [])];
  updateCounts();
});
$<HTMLInputElement>('passB').addEventListener('change', (e) => {
  state.filesB = [...((e.target as HTMLInputElement).files ?? [])];
  updateCounts();
});

const shift = $<HTMLInputElement>('shift');
const shiftOut = $('shiftOut');
shift.addEventListener('input', () => (shiftOut.textContent = `${shift.value} мм`));
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

async function decode(file: File, maxPx: number): Promise<ImageBitmap | HTMLCanvasElement> {
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
  return new Promise((resolve) => c.toBlob((b) => resolve(URL.createObjectURL(b!)), 'image/jpeg', 0.9));
}

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
  box.innerHTML = `<button type="button" class="like" aria-pressed="false" aria-label="Нравится">👍</button><button type="button" class="dislike" aria-pressed="false" aria-label="Не нравится">👎</button><input class="comment" id="c-${id}" type="text" placeholder="Комментарий" />`;
  const save = (verdict: Verdict, comment: string) =>
    feedback.save(
      { version: ALGO_VERSION, seed: recipe.seed, frame, look: lookId, lookName, verdict, comment, shiftMm: Number(recipe.shiftMm.toFixed(1)), details: describe(recipe) },
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
  const parts = [`Рецепт № ${recipe.seed}`, `сдвиг ${recipe.shiftMm.toFixed(1)} мм`];
  if (recipe.settings.swapRotate) parts.push('вторая плёнка перевёрнута');
  if (recipe.leaks.length) {
    parts.push(`засветки у кадров ${recipe.leaks.map((l) => l.frame + 1).join(', ')}`);
  }
  if (recipe.fogs.length) parts.push(`засвечены концы: ${recipe.fogs.map((f) => (f.dir === 1 ? 'начало' : 'конец')).join(', ')}`);
  return parts.join(' · ');
}

let urls: string[] = [];

async function develop() {
  const n = Math.min(state.filesA.length, state.filesB.length);
  const looks = LOOKS.filter((l) => looksBox.querySelector<HTMLInputElement>(`input[value="${l.id}"]`)!.checked);
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

    const load = async (files: File[]) => {
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
    const srcA = await load(state.filesA);
    const srcB = await load(state.filesB);

    const summary = document.createElement('p');
    summary.className = 'summary';
    summary.textContent = describe(recipe);
    results.append(summary);

    for (let i = 0; i < n; i++) {
      const block = document.createElement('section');
      block.className = 'frame';
      block.innerHTML = `<h3>Кадр ${i + 1}</h3><div class="variants"></div>`;
      results.append(block);
      const grid = block.querySelector('.variants')!;
      for (const look of looks) {
        const img = dev.renderFrame(i, recipe, look, srcA, srcB, ppm);
        const url = await toUrl(img);
        urls.push(url);
        const fig = document.createElement('figure');
        fig.className = 'variant';
        fig.innerHTML = `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Кадр ${i + 1}, вариант ${look.id}" /></a><figcaption>Кадр ${i + 1} · вариант ${look.id} · рецепт ${recipe.seed}</figcaption>`;
        fig.append(markControls(recipe, i + 1, look.id, look.name, thumbOf(img)));
        grid.append(fig);
        refreshMarks();
        tick();
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } catch (e) {
    error.hidden = false;
    error.textContent = `Не получилось проявить: ${(e as Error).message}`;
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
