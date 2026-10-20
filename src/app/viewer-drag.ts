import { baseEdit, shiftRange, storedEdit, type FrameEdit } from '../core/edit';
import { makeRecipe } from '../core/recipe';
import { quarterTurns } from '../core/orientation';
import { FrameRenderer, encodeFrame } from './develop';
import { drawOriented } from './orientation';
import { frameTurns, resetEditedFrame, saveEditedFrame, type Development } from './store';

export type MovingLayer = 'top' | 'bottom';
export interface ViewerDraft { edit: FrameEdit; undo: FrameEdit | null }
interface Host {
  dev: Development; frame: number; box: HTMLElement; image: HTMLImageElement;
  draft?: ViewerDraft;
  changed: (draft: ViewerDraft) => void;
  layer: () => MovingLayer;
  busy: (value: boolean) => void;
  saved: (dev: Development, before: FrameEdit | null, undo: boolean) => Promise<void>;
  error: (error: unknown) => void;
}
/** Holds a frame-local draft between gestures. Only explicit commit renders/stores the full frame. */
export function viewerDrag(host: Host) {
  const { dev, frame, box, image } = host;
  const recipe = makeRecipe(dev.n, dev.seed, dev.params.settings);
  const originalEdit = storedEdit(dev.edits?.[frame]);
  const base = baseEdit(recipe, frame, dev.params.whiteMerge ?? 0, dev.params.haloAmount ?? 1);
  const initial = structuredClone(originalEdit ?? base);
  const range = shiftRange(recipe, frame), turns = frameTurns(dev, frame);
  const preview = document.createElement('canvas');
  preview.className = 'viewer-live'; preview.hidden = true; preview.setAttribute('aria-hidden', 'true');
  image.parentElement!.append(preview);
  const source = document.createElement('canvas');
  let closed = false, saving = false, active = false, epoch = 0, armed = !!host.draft;
  let draft = structuredClone(host.draft?.edit ?? initial);
  let previous = structuredClone(host.draft?.undo ?? null), stroke = structuredClone(draft);
  let field: 'shiftMm' | 'bottomShiftMm' = 'shiftMm';
  let rendererPromise: Promise<FrameRenderer> | undefined;
  let pending = false, rendering: Promise<void> | null = null;
  let width = 1, height = 1;
  const same = (a: FrameEdit, b: FrameEdit) => JSON.stringify(a) === JSON.stringify(b);
  const dirty = () => !same(draft, initial);
  function notify() { host.changed({ edit: structuredClone(draft), undo: structuredClone(previous) }); }
  function showOriginal() { preview.hidden = true; image.style.visibility = ''; }
  function renderPreview() {
    epoch++;
    if (!dirty()) { pending = false; showOriginal(); return; }
    pending = true;
    if (rendering) return;
    rendering = (async () => {
      while (pending && !closed) {
        pending = false;
        const version = epoch, edit = structuredClone(draft);
        try {
          const renderer = await (rendererPromise ??= FrameRenderer.open(dev, 1100));
          const img = await renderer.render(frame, edit, Math.min(1000, Math.round(box.clientWidth * 2)) / 36);
          if (closed || version !== epoch) continue;
          source.width = img.width; source.height = img.height; source.getContext('2d')!.putImageData(img, 0, 0);
          drawOriented(preview, source, img.width, img.height, turns);
          preview.hidden = false; image.style.visibility = 'hidden';
        } catch (error) { if (!closed && version === epoch) host.error(error); }
      }
    })().finally(() => { rendering = null; });
  }
  function cancel() {
    if (!active) return;
    draft = structuredClone(stroke); active = false;
    renderPreview(); notify(); host.busy(false);
  }
  async function persist(edit: FrameEdit | null, undo: boolean): Promise<boolean> {
    if (closed || saving || active) return false;
    saving = true; host.busy(true);
    box.setAttribute('aria-busy', 'true');
    try {
      await rendering;
      let next: Development;
      if (edit === null) next = await resetEditedFrame(dev, frame);
      else {
        const full = await FrameRenderer.open(dev, Math.min(4000, Math.round(36 * dev.params.ppm * 1.15)));
        try {
          const img = await full.render(frame, edit, dev.params.ppm);
          const [jpeg, thumb] = await encodeFrame(img);
          next = await saveEditedFrame(dev, frame, edit, jpeg, thumb);
        } finally { full.dispose(); }
      }
      if (closed) return false;
      await host.saved(next, originalEdit, undo);
      return true;
    } catch (error) { if (!closed) host.error(error); return false; }
    finally { saving = false; box.removeAttribute('aria-busy'); host.busy(false); }
  }
  if (host.draft) renderPreview();
  return {
    dirty,
    commit: () => dirty() ? persist(structuredClone(draft), false) : Promise.resolve(true),
    gesture: {
      armed: () => armed,
      start() {
        if (closed || saving || active) return false;
        const r = image.getBoundingClientRect();
        const ratio = image.naturalWidth / image.naturalHeight;
        width = Math.min(r.width, r.height * ratio); height = width / ratio;
        if (!Number.isFinite(width) || width <= 0) return false;
        field = host.layer() === 'top' ? 'shiftMm' : 'bottomShiftMm';
        stroke = structuredClone(draft); active = armed = true;
        host.busy(true); return true;
      },
      move(dx: number, dy: number) {
        if (!active || saving) return;
        const t = quarterTurns(turns);
        const mm = (t % 2 ? dy / height : dx / width) * 36 * (t >= 2 ? -1 : 1);
        draft.mix[field] = Math.max(range.min, Math.min(range.max, stroke.mix[field] + mm));
        renderPreview();
      },
      end() {
        if (!active) return;
        active = false;
        if (!same(draft, stroke)) previous = structuredClone(stroke);
        notify(); host.busy(false);
      },
      cancel,
    },
    undoDraft() {
      if (!previous || active || saving) return false;
      draft = previous; previous = null; renderPreview(); notify(); return true;
    },
    undo: (edit: FrameEdit | null) => persist(edit, true),
    dispose() {
      closed = true; active = false; pending = false; epoch++;
      void Promise.resolve(rendering).then(async () => { try { (await rendererPromise)?.dispose(); } catch { /* opening already reported */ } });
      preview.remove(); source.width = source.height = 1; image.style.visibility = '';
    },
  };
}
