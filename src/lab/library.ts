// Библиотека плёнок лаборатории: выбранные снимки хранятся в IndexedDB этого браузера
// (на устройстве, никуда не отправляются), чтобы проявлять ту же плёнку снова без повторного выбора.

export interface Roll {
  id: string;
  number: number;
  createdAt: string;
  n: number;
  namesA: string[];
  namesB: string[];
  /** рецепты, которыми плёнку проявляли, по порядку */
  seeds: number[];
}

const DB_NAME = 'multik-lab';
const ROLLS = 'rolls';
const PHOTOS = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ROLLS)) db.createObjectStore(ROLLS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const photoKey = (rollId: string, pass: 'a' | 'b', i: number) => `${rollId}:${pass}:${i}`;

export class Library {
  private db: IDBDatabase | null = null;
  available = false;

  async init(): Promise<void> {
    try {
      this.db = await open();
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  async list(): Promise<Roll[]> {
    if (!this.db) return [];
    const rolls = await request(this.db.transaction(ROLLS).objectStore(ROLLS).getAll() as IDBRequest<Roll[]>);
    return rolls.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Сохраняет две пачки (уже уменьшенные JPEG) как новую плёнку. */
  async create(a: Blob[], b: Blob[], namesA: string[], namesB: string[]): Promise<Roll> {
    const db = this.db!;
    const existing = await this.list();
    const roll: Roll = {
      id: `r${Date.now().toString(36)}`,
      number: existing.reduce((m, r) => Math.max(m, r.number), 0) + 1,
      createdAt: new Date().toISOString(),
      n: Math.min(a.length, b.length),
      namesA,
      namesB,
      seeds: [],
    };
    const tx = db.transaction([ROLLS, PHOTOS], 'readwrite');
    tx.objectStore(ROLLS).put(roll);
    a.forEach((blob, i) => tx.objectStore(PHOTOS).put(blob, photoKey(roll.id, 'a', i)));
    b.forEach((blob, i) => tx.objectStore(PHOTOS).put(blob, photoKey(roll.id, 'b', i)));
    await done(tx);
    return roll;
  }

  async photos(roll: Roll): Promise<{ a: Blob[]; b: Blob[] }> {
    const store = this.db!.transaction(PHOTOS).objectStore(PHOTOS);
    const get = (pass: 'a' | 'b', count: number) =>
      Promise.all(Array.from({ length: count }, (_, i) => request(store.get(photoKey(roll.id, pass, i)) as IDBRequest<Blob>)));
    const [a, b] = await Promise.all([get('a', roll.namesA.length), get('b', roll.namesB.length)]);
    return { a, b };
  }

  async addSeed(roll: Roll, seed: number): Promise<Roll> {
    if (roll.seeds.includes(seed)) return roll;
    const next = { ...roll, seeds: [...roll.seeds, seed] };
    const tx = this.db!.transaction(ROLLS, 'readwrite');
    tx.objectStore(ROLLS).put(next);
    await done(tx);
    return next;
  }

  async remove(roll: Roll): Promise<void> {
    const tx = this.db!.transaction([ROLLS, PHOTOS], 'readwrite');
    tx.objectStore(ROLLS).delete(roll.id);
    roll.namesA.forEach((_, i) => tx.objectStore(PHOTOS).delete(photoKey(roll.id, 'a', i)));
    roll.namesB.forEach((_, i) => tx.objectStore(PHOTOS).delete(photoKey(roll.id, 'b', i)));
    await done(tx);
  }
}
