/** Screen layout is independent of image settings. Hiding a control never changes its value. */
export type Placement = 'main' | 'more' | 'hidden';
export interface PanelItem {
  id: string;
  label: string;
  html: string;
  kind?: 'knob' | 'row' | 'block';
  placement?: Placement;
  changed?: boolean;
}
export interface PanelLayout { order: string[]; places: Record<string, Placement>; expanded: boolean; toolsRevision?: number }
const STORAGE_KEY = 'multik-layout-v1';
const memory: Record<string, unknown> = {};
let storageAvailable = true;
try { Object.assign(memory, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')); } catch { storageAvailable = false; }
const registry = new Map<string, { title: string; items: PanelItem[]; repaint: () => void }>();
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function normalizeLayout(value: unknown, items: Pick<PanelItem, 'id' | 'placement'>[]): PanelLayout {
  const saved = value && typeof value === 'object' ? value as Partial<PanelLayout> : {};
  const ids = new Set(items.map((item) => item.id));
  const order = [...new Set(Array.isArray(saved.order) ? saved.order.filter((id): id is string => typeof id === 'string' && ids.has(id)) : [])];
  for (const item of items) if (!order.includes(item.id)) order.push(item.id);
  const places: Record<string, Placement> = {};
  for (const item of items) {
    const place = saved.places?.[item.id];
    places[item.id] = place === 'main' || place === 'more' || place === 'hidden' ? place : item.placement ?? 'main';
  }
  return { order, places, expanded: saved.expanded === true, toolsRevision: saved.toolsRevision };
}
/** Apply the requested new Mix defaults once, then continue respecting customization. */
export function migrateMixTools(): void {
  const old = memory['edit.mix'] as Partial<PanelLayout> | undefined;
  if (old?.toolsRevision === 2) return;
  const first = ['mix.shift', 'mix.bottomShift', 'mix.leaks', 'mix.halo'];
  const remaining = Array.isArray(old?.order) ? old.order.filter(id => !first.includes(id) && id !== 'mix.grain' && id !== 'mix.shiftFine') : [];
  save('edit.mix', {
    order: [...first, ...remaining], expanded: old?.expanded === true, toolsRevision: 2,
    places: { ...old?.places, 'mix.shift': 'main', 'mix.bottomShift': 'main', 'mix.leaks': 'main', 'mix.halo': 'main' },
  });
}
function layout(id: string): PanelLayout { return normalizeLayout(memory[id], registry.get(id)?.items ?? []); }
export function migrateSetupTools(): void {
  const old = memory.setup as Partial<PanelLayout> | undefined;
  if (old?.toolsRevision === 1) return;
  const first = ['sources', 'leaks', 'halo'];
  save('setup', {
    order: [...first, ...(old?.order ?? []).filter(id => !first.includes(id))],
    places: { ...old?.places, leaks: 'main', halo: 'main' },
    expanded: old?.expanded === true, toolsRevision: 1,
  });
}
function save(id: string, next: PanelLayout): void {
  memory[id] = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); storageAvailable = true; } catch { storageAvailable = false; }
}
export function layoutButton(id: string, text = ''): string {
  return `<button type="button" class="layout-trigger${text ? ' with-label' : ''}" data-layout="${esc(id)}" aria-label="Customize screen" title="Customize screen"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>${text ? `<span>${esc(text)}</span>` : ''}</button>`;
}
export function panelHtml(id: string, title: string, items: PanelItem[], repaint: () => void): string {
  registry.set(id, { title, items, repaint });
  const config = layout(id);
  const ordered = config.order.map((key) => items.find((item) => item.id === key)!);
  const main = ordered.filter((item) => config.places[item.id] === 'main');
  const more = ordered.filter((item) => config.places[item.id] === 'more');
  const hiddenChanged = ordered.filter((item) => config.places[item.id] === 'hidden' && item.changed).length;
  const group = (entries: PanelItem[]) => {
    let result = '';
    let knobs = false;
    for (const item of entries) {
      if (item.kind === 'knob' && !knobs) { result += '<div class="panel-knobs">'; knobs = true; }
      if (item.kind !== 'knob' && knobs) { result += '</div>'; knobs = false; }
      result += `<div class="panel-item ${item.kind ?? 'block'}" data-panel-item="${esc(item.id)}">${item.html}</div>`;
    }
    return result + (knobs ? '</div>' : '');
  };
  return `<section class="personal-panel" data-panel="${esc(id)}">
    <div class="panel-primary">${group(main)}</div>
    ${more.length ? `<details class="panel-more" ${config.expanded ? 'open' : ''}><summary><span>More</span><span class="panel-active">${activeText(more.filter((item) => item.changed).length)}</span><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></summary><div class="panel-secondary">${group(more)}</div></details>` : ''}
    <button type="button" class="panel-hidden" data-layout="${esc(id)}" ${hiddenChanged ? '' : 'hidden'}>${hiddenChanged} hidden · active</button>
    ${!main.length && !more.length ? layoutButton(id, 'Choose tools') : ''}
  </section>`;
}
function activeText(n: number): string { return n ? `${n} active` : ''; }
export function updatePanelChanges(id: string, changes: Set<string>): void {
  const entry = registry.get(id);
  if (!entry) return;
  entry.items.forEach((item) => { item.changed = changes.has(item.id); });
  const config = layout(id);
  const panel = [...document.querySelectorAll<HTMLElement>('[data-panel]')].find((el) => el.dataset.panel === id);
  const active = panel?.querySelector('.panel-active');
  if (active) active.textContent = activeText(entry.items.filter((item) => item.changed && config.places[item.id] === 'more').length);
  const hidden = panel?.querySelector<HTMLButtonElement>('.panel-hidden');
  const n = entry.items.filter((item) => item.changed && config.places[item.id] === 'hidden').length;
  if (hidden) { hidden.hidden = !n; hidden.textContent = `${n} hidden · active`; }
}

let dialog: HTMLDialogElement | null = null;
let editing = '';
let returnFocus: HTMLElement | null = null;
function dialogContent(): string {
  const entry = registry.get(editing)!;
  const config = layout(editing);
  return `<div class="layout-head"><div><h2>Make it yours</h2><p>${esc(entry.title)}</p></div><button type="button" class="layout-done" data-layout-done>Done</button></div>
    <p class="layout-intro">Keep your favourites close. Everything else can wait in More.</p>
    <div class="layout-list">${config.order.map((id, index) => {
      const item = entry.items.find((item) => item.id === id)!;
      return `<div class="layout-row"><span>${esc(item.label)}</span><select data-layout-place="${esc(id)}" aria-label="Position of ${esc(item.label)}">${(['main', 'more', 'hidden'] as Placement[]).map((place) => `<option value="${place}" ${config.places[id] === place ? 'selected' : ''}>${{ main: 'On screen', more: 'In More', hidden: 'Hidden' }[place]}</option>`).join('')}</select><div class="layout-order"><button type="button" data-layout-move="${esc(id)}" data-dir="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move ${esc(item.label)} up">↑</button><button type="button" data-layout-move="${esc(id)}" data-dir="1" ${index === config.order.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(item.label)} down">↓</button></div></div>`;
    }).join('')}</div>
    <div class="layout-foot"><button type="button" data-layout-reset>Restore layout</button><span role="status">${storageAvailable ? 'Saved on this device' : 'Saved for this session only'}</span></div>`;
}
function openLayout(id: string): void {
  if (!registry.has(id)) return;
  editing = id;
  returnFocus = document.activeElement as HTMLElement;
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'layout-dialog';
    dialog.setAttribute('aria-label', 'Customize screen');
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      if (returnFocus?.isConnected) returnFocus.focus();
      else document.querySelector<HTMLElement>(`[data-layout="${editing}"]`)?.focus();
    });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog!.getBoundingClientRect(); const e = event as MouseEvent; if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog!.close(); } });
  }
  dialog.innerHTML = dialogContent();
  if (!dialog.open) dialog.showModal();
}
function applyLayout(next: PanelLayout, focus?: string): void {
  save(editing, next);
  registry.get(editing)?.repaint();
  if (!dialog) return;
  const scroll = dialog.scrollTop;
  dialog.innerHTML = dialogContent();
  dialog.scrollTop = scroll;
  if (focus) dialog.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
}

document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!target) return;
  if (target.dataset.layout) { openLayout(target.dataset.layout); return; }
  if (target.hasAttribute('data-layout-done')) { dialog?.close(); return; }
  if (target.hasAttribute('data-layout-reset')) {
    applyLayout(normalizeLayout(null, registry.get(editing)!.items), '[data-layout-reset]');
    return;
  }
  const id = target.dataset.layoutMove;
  if (id) {
    const config = layout(editing);
    const index = config.order.indexOf(id);
    const next = index + Number(target.dataset.dir);
    if (next < 0 || next >= config.order.length) return;
    [config.order[index], config.order[next]] = [config.order[next], config.order[index]];
    applyLayout(config, `[data-layout-move="${id}"][data-dir="${target.dataset.dir}"]:not(:disabled)`);
  }
});
document.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement;
  const id = target.dataset.layoutPlace;
  if (!id) return;
  const config = layout(editing);
  config.places[id] = target.value as Placement;
  applyLayout(config, `[data-layout-place="${id}"]`);
});
document.addEventListener('toggle', (event) => {
  const details = event.target as HTMLDetailsElement;
  if (!details.matches?.('.panel-more') || !details.isConnected) return;
  const id = details.closest<HTMLElement>('[data-panel]')!.dataset.panel!;
  const config = layout(id);
  if (config.expanded !== details.open) save(id, { ...config, expanded: details.open });
}, true);
