// Отметки Александра в лаборатории: 👍 / 👎 и комментарий к кадру + общие заметки.
// На странице claude.ai пишутся в хранилище страницы (db), и Claude читает их сам;
// миниатюра кадра — в asset-хранилище той же страницы. Вне claude.ai — только этот браузер.

export type Verdict = 'like' | 'dislike' | null;

export interface Mark {
  version: string;
  seed: number;
  frame: number;
  look: string;
  lookName: string;
  verdict: Verdict;
  comment: string;
  shiftMm: number;
  details: string;
  thumb: string | null;
  updatedAt: string;
}

interface DocSnap {
  id: string;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
}
interface CollectionRef {
  doc(id?: string): DocRef;
  onSnapshot(next: (s: { docs: DocSnap[] }) => void, error?: (e: { code: string }) => void): () => void;
}
interface Db {
  collection(path: string): CollectionRef;
}
interface Assets {
  upload(blob: Blob, options?: { type?: string }): Promise<{ id: string; url: string }>;
}
type ClaudeWindow = Window & { claude?: { use(name: string): Promise<unknown> } };

const LOCAL_KEY = 'multik-lab-marks';

export class Feedback {
  mode: 'claude' | 'local' = 'local';
  marks = new Map<string, Mark>();
  private db: Db | null = null;
  private assets: Assets | null = null;
  private queue = new Map<string, Promise<void>>();
  private listeners: (() => void)[] = [];

  async init(): Promise<void> {
    this.loadLocal();
    const claude = (window as ClaudeWindow).claude;
    if (!claude?.use) return;
    const [db, assets] = await Promise.all([claude.use('db'), claude.use('assets')]);
    this.db = db as Db | null;
    this.assets = assets as Assets | null;
    if (!this.db) return;
    this.mode = 'claude';
    this.db.collection('marks').onSnapshot(
      (snap) => {
        this.marks.clear();
        for (const d of snap.docs) this.marks.set(d.id, d.data() as unknown as Mark);
        this.emit();
      },
      () => {
        this.mode = 'local';
        this.emit();
      },
    );
    this.emit();
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  static id(seed: number, frame: number, look: string): string {
    return `${seed}-${frame}-${look}`;
  }

  /** Сохраняет отметку; миниатюра загружается один раз, при первой отметке кадра. */
  save(mark: Omit<Mark, 'updatedAt' | 'thumb'>, thumb: (() => Promise<Blob>) | null): Promise<void> {
    const id = Feedback.id(mark.seed, mark.frame, mark.look);
    const prev = this.queue.get(id) ?? Promise.resolve();
    const next = prev.then(async () => {
      const existing = this.marks.get(id);
      let thumbId = existing?.thumb ?? null;
      if (!thumbId && thumb && this.assets) {
        try {
          thumbId = (await this.assets.upload(await thumb(), { type: 'image/jpeg' })).id;
        } catch {
          thumbId = null;
        }
      }
      const full: Mark = { ...mark, thumb: thumbId, updatedAt: new Date().toISOString() };
      this.marks.set(id, full);
      this.emit();
      if (this.mode === 'claude' && this.db) {
        await this.db.collection('marks').doc(id).set({ ...full });
      } else {
        this.saveLocal();
      }
    });
    this.queue.set(id, next.catch(() => undefined));
    return next;
  }

  /** Плёнка из библиотеки — чтобы Claude видел, какие плёнки и рецепты проявлялись. */
  async roll(id: string, data: Record<string, unknown>): Promise<void> {
    if (this.mode === 'claude' && this.db) await this.db.collection('rolls').doc(id).set(data);
  }

  async note(text: string, context: Record<string, unknown>): Promise<void> {
    const entry = { text, at: new Date().toISOString(), ...context };
    if (this.mode === 'claude' && this.db) {
      await this.db.collection('notes').doc().set(entry);
    } else {
      const notes = JSON.parse(safeGet(`${LOCAL_KEY}-notes`) ?? '[]') as unknown[];
      notes.push(entry);
      safeSet(`${LOCAL_KEY}-notes`, JSON.stringify(notes));
    }
  }

  /** Текст всех отметок — для режима без claude.ai: скопировать и прислать в чат. */
  exportText(): string {
    const lines = [...this.marks.values()]
      .filter((m) => m.verdict || m.comment)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((m) => `${m.verdict === 'like' ? '👍' : m.verdict === 'dislike' ? '👎' : '💬'} recipe ${m.seed}, frame ${m.frame}, look ${m.look}${m.comment ? ` — ${m.comment}` : ''} [${m.version}; ${m.details}]`);
    const notes = (JSON.parse(safeGet(`${LOCAL_KEY}-notes`) ?? '[]') as { text: string }[]).map((n) => `📝 ${n.text}`);
    return [...lines, ...notes].join('\n');
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  private loadLocal() {
    try {
      const raw = safeGet(LOCAL_KEY);
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Mark>)) this.marks.set(k, v);
    } catch {
      /* пустое хранилище — нормально */
    }
  }

  private saveLocal() {
    safeSet(LOCAL_KEY, JSON.stringify(Object.fromEntries(this.marks)));
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* хранилище браузера недоступно */
  }
}
