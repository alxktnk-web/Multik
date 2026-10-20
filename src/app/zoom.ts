/** Photo-only zoom: never changes the image, editing values, or exported crop. */
export interface PhotoZoom { scale: number; x: number; y: number }
interface Options {
  state?: PhotoZoom;
  onStart?: () => void;
  onNavigate?: () => void;
  onSwipe?: (direction: number) => void;
  onHold?: () => void;
  onMouseTap?: (x: number) => void;
  doubleTap?: boolean;
  drag?: { armed?: () => boolean; start: () => boolean; move: (dx: number, dy: number) => void; end: () => void; cancel: () => void };
}
export function bindPhotoZoom(box: HTMLElement, content: HTMLElement, options: Options = {}): () => void {
  const state = options.state ?? { scale: 1, x: 0, y: 0 };
  const abort = new AbortController();
  const signal = abort.signal;
  const points = new Map<number, { x: number; y: number }>();
  let down = { x: 0, y: 0, time: 0, type: '' };
  let start = { ...state, distance: 1, cx: 0, cy: 0 };
  let multi = false, navigating = false, moved = false;
  let dragging = false;
  let dragDecision: 'pending' | 'swipe' = 'pending';
  let lastTap = { x: 0, y: 0, time: -1000 };
  let tapTimer = 0;
  const center = () => { const r = box.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function paint() {
    state.scale = Math.max(1, Math.min(5, state.scale));
    const maxX = Math.max(0, (content.offsetWidth * state.scale - box.clientWidth) / 2);
    const maxY = Math.max(0, (content.offsetHeight * state.scale - box.clientHeight) / 2);
    state.x = state.scale === 1 ? 0 : Math.max(-maxX, Math.min(maxX, state.x));
    state.y = state.scale === 1 ? 0 : Math.max(-maxY, Math.min(maxY, state.y));
    content.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    box.dataset.zoom = state.scale.toFixed(3);
  }
  function navigate() {
    if (dragging) { dragging = false; options.drag?.cancel(); }
    if (!navigating) { navigating = true; options.onNavigate?.(); }
  }
  function baseline() {
    const p = [...points.values()];
    const c = center();
    const mid = p.length > 1 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0];
    start = { ...state, cx: mid.x - c.x, cy: mid.y - c.y, distance: p.length > 1 ? Math.max(1, Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y)) : 1 };
  }
  box.classList.add('photo-viewport');
  content.classList.add('photo-zoom-content');
  box.addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!points.size) {
      multi = navigating = moved = false;
      dragging = false; dragDecision = 'pending';
      down = { x: e.clientX, y: e.clientY, time: performance.now(), type: e.pointerType };
      options.onStart?.();
    }
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    box.setPointerCapture(e.pointerId);
    if (points.size > 1) { multi = true; navigate(); e.stopPropagation(); e.preventDefault(); }
    baseline();
  }, { capture: true, signal });
  box.addEventListener('pointermove', e => {
    if (!points.has(e.pointerId)) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved ||= Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
    const p = [...points.values()], c = center();
    if (p.length > 1) {
      const distance = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      const scale = Math.max(1, Math.min(5, start.scale * distance / start.distance));
      state.x = (p[0].x + p[1].x) / 2 - c.x - (start.cx - start.x) * scale / start.scale;
      state.y = (p[0].y + p[1].y) / 2 - c.y - (start.cy - start.y) * scale / start.scale;
      state.scale = scale;
      navigate(); paint();
    } else if (state.scale > 1 && moved) {
      navigate();
      state.x = start.x + p[0].x - c.x - start.cx;
      state.y = start.y + p[0].y - c.y - start.cy;
      paint();
    } else if (state.scale === 1 && moved && !multi && !navigating && options.drag) {
      const elapsed = performance.now() - down.time;
      if (!dragging && dragDecision === 'pending' && elapsed >= (options.drag.armed?.() ? 35 : 120)) {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) / elapsed < 0.65) dragging = options.drag.start();
        if (!dragging) dragDecision = 'swipe';
      }
      if (dragging) {
        options.drag.move(e.clientX - down.x, e.clientY - down.y);
        e.stopPropagation(); e.preventDefault();
      }
    }
    if (navigating) { e.stopPropagation(); e.preventDefault(); }
  }, { capture: true, signal });
  function end(e: PointerEvent, cancelled: boolean) {
    if (!points.has(e.pointerId)) return;
    points.delete(e.pointerId);
    if (cancelled) { navigate(); multi = true; }
    if (navigating || multi) { e.stopPropagation(); e.preventDefault(); }
    if (points.size) { baseline(); return; }
    if (dragging) {
      dragging = false; options.drag?.end(); e.stopPropagation(); e.preventDefault();
      lastTap.time = -1000; return;
    }
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!cancelled && !multi && !navigating) {
      if (state.scale === 1 && moved && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) options.onSwipe?.(dx < 0 ? 1 : -1);
      else if (!moved) {
        const now = performance.now();
        if (options.doubleTap !== false && now - lastTap.time < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 35) {
          clearTimeout(tapTimer); navigate(); e.stopPropagation();
          const c = center();
          state.scale = state.scale > 1 ? 1 : 2.5;
          state.x = (e.clientX - c.x) * (1 - state.scale);
          state.y = (e.clientY - c.y) * (1 - state.scale);
          lastTap.time = -1000; paint();
        } else if (now - down.time >= 450) options.onHold?.();
        else {
          lastTap = { x: e.clientX, y: e.clientY, time: now };
          if (down.type === 'mouse' && state.scale === 1 && options.onMouseTap) {
            tapTimer = window.setTimeout(() => { if (box.isConnected) options.onMouseTap?.(e.clientX); }, 330);
          }
        }
      }
    }
  }
  box.addEventListener('pointerup', e => end(e, false), { capture: true, signal });
  box.addEventListener('pointercancel', e => end(e, true), { capture: true, signal });
  box.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const c = center(), scale = Math.max(1, Math.min(5, state.scale * Math.exp(-e.deltaY * 0.01)));
    state.x = e.clientX - c.x - (e.clientX - c.x - state.x) * scale / state.scale;
    state.y = e.clientY - c.y - (e.clientY - c.y - state.y) * scale / state.scale;
    state.scale = scale; paint();
  }, { passive: false, signal });
  box.addEventListener('contextmenu', e => e.preventDefault(), { signal });
  const resize = new ResizeObserver(paint); resize.observe(box); resize.observe(content);
  paint();
  return () => { abort.abort(); resize.disconnect(); clearTimeout(tapTimer); };
}
