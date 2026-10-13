// Хранилище приложения на устройстве (IndexedDB): плёнки со снимками, проявки с готовыми кадрами.
// Модель SPEC 1.3: плёнка — один проход; проявка смешивает две любые плёнки.

import type { RecipeSettings } from '../core/recipe';

export interface PhotoMeta {
  w: number;
  h: number;
}

export interface Roll {
  id: string;
  number: number;
  name: string;
  createdAt: string;
  length: number;
  photos: PhotoMeta[];
}

export interface DevParams {
  lookId: string;
  settings: RecipeSettings;
  /** пересвет в десятых ступени (0…20) поверх кривой вида */
  exposureTenths: number;
  /** слияние белого 0…10: выше — близкие к белому яркости сливаются в сплошной белый */
  whiteMerge?: number;
  ppm: number;
}

export interface Development {
  id: string;
  createdAt: string;
  rollA: string;
  rollB: string;
  titleA: string;
  titleB: string;
  seed: number;
  n: number;
  params: DevParams;
  algo: string;
  /** сколько кадров уже проявлено и сохранено (проявка продолжается с этого места) */
  done: number;
  likes: number[];
}

const DB_NAME = 'multik-app';
const STORES = ['rolls', 'photos', 'thumbs', 'devs', 'frames', 'frameThumbs'] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, name === 'rolls' || name === 'devs' ? { keyPath: 'id' } : undefined);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(names: StoreName[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => void): Promise<void> {
  const t = (await db()).transaction(names, mode);
  fn(t);
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Не хватило места на устройстве'));
  });
}

async function getAll<T>(name: StoreName): Promise<T[]> {
  return wrap((await db()).transaction(name).objectStore(name).getAll() as IDBRequest<T[]>);
}

async function get<T>(name: StoreName, key: string): Promise<T | undefined> {
  return wrap((await db()).transaction(name).objectStore(name).get(key) as IDBRequest<T | undefined>);
}

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// --- плёнки ---

export async function listRolls(): Promise<Roll[]> {
  return (await getAll<Roll>('rolls')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRoll(id: string): Promise<Roll | undefined> {
  return get<Roll>('rolls', id);
}

export async function nextRollNumber(): Promise<number> {
  return (await getAll<Roll>('rolls')).reduce((m, r) => Math.max(m, r.number), 0) + 1;
}

export async function createRoll(name: string, length: number, photos: { full: Blob; thumb: Blob; meta: PhotoMeta }[]): Promise<Roll> {
  const roll: Roll = {
    id: uid('r'),
    number: await nextRollNumber(),
    name,
    createdAt: new Date().toISOString(),
    length,
    photos: photos.map((p) => p.meta),
  };
  await tx(['rolls', 'photos', 'thumbs'], 'readwrite', (t) => {
    t.objectStore('rolls').put(roll);
    photos.forEach((p, i) => {
      t.objectStore('photos').put(p.full, `${roll.id}:${i}`);
      t.objectStore('thumbs').put(p.thumb, `${roll.id}:${i}`);
    });
  });
  return roll;
}

export async function renameRoll(roll: Roll, name: string): Promise<void> {
  await tx(['rolls'], 'readwrite', (t) => t.objectStore('rolls').put({ ...roll, name }));
}

export async function deleteRoll(roll: Roll): Promise<void> {
  await tx(['rolls', 'photos', 'thumbs'], 'readwrite', (t) => {
    t.objectStore('rolls').delete(roll.id);
    roll.photos.forEach((_, i) => {
      t.objectStore('photos').delete(`${roll.id}:${i}`);
      t.objectStore('thumbs').delete(`${roll.id}:${i}`);
    });
  });
}

export function rollPhoto(roll: Roll, i: number): Promise<Blob | undefined> {
  return get<Blob>('photos', `${roll.id}:${i}`);
}

export function rollThumb(rollId: string, i: number): Promise<Blob | undefined> {
  return get<Blob>('thumbs', `${rollId}:${i}`);
}

// --- проявки ---

export async function listDevs(): Promise<Development[]> {
  return (await getAll<Development>('devs')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDev(id: string): Promise<Development | undefined> {
  return get<Development>('devs', id);
}

export async function createDev(d: Omit<Development, 'id' | 'createdAt' | 'done' | 'likes'>): Promise<Development> {
  const dev: Development = { ...d, id: uid('d'), createdAt: new Date().toISOString(), done: 0, likes: [] };
  await tx(['devs'], 'readwrite', (t) => t.objectStore('devs').put(dev));
  return dev;
}

export async function saveDev(dev: Development): Promise<void> {
  await tx(['devs'], 'readwrite', (t) => t.objectStore('devs').put(dev));
}

/** Кадр и отметка «проявлено до i» пишутся одной транзакцией — возобновление идёт с последнего сохранённого кадра. */
export async function saveFrame(dev: Development, i: number, full: Blob, thumb: Blob): Promise<Development> {
  const next = { ...dev, done: Math.max(dev.done, i + 1) };
  await tx(['devs', 'frames', 'frameThumbs'], 'readwrite', (t) => {
    t.objectStore('frames').put(full, `${dev.id}:${i}`);
    t.objectStore('frameThumbs').put(thumb, `${dev.id}:${i}`);
    t.objectStore('devs').put(next);
  });
  return next;
}

export function devFrame(devId: string, i: number): Promise<Blob | undefined> {
  return get<Blob>('frames', `${devId}:${i}`);
}

export function devThumb(devId: string, i: number): Promise<Blob | undefined> {
  return get<Blob>('frameThumbs', `${devId}:${i}`);
}

export async function deleteDev(dev: Development): Promise<void> {
  await tx(['devs', 'frames', 'frameThumbs'], 'readwrite', (t) => {
    t.objectStore('devs').delete(dev.id);
    for (let i = 0; i < dev.n; i++) {
      t.objectStore('frames').delete(`${dev.id}:${i}`);
      t.objectStore('frameThumbs').delete(`${dev.id}:${i}`);
    }
  });
}
