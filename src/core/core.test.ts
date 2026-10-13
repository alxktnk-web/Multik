import { describe, expect, it } from 'vitest';
import { FRAME_W, PITCH, expand, frameA, intersects } from './geometry';
import { DEFAULT_SETTINGS, makeRecipe, placements, sampleShift } from './recipe';
import { Rng } from './rng';

describe('Rng', () => {
  it('одинаковый сид — одинаковая последовательность', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('перестановка содержит каждый индекс ровно один раз', () => {
    const p = new Rng(7).permutation(36);
    expect([...p].sort((x, y) => x - y)).toEqual(Array.from({ length: 36 }, (_, i) => i));
  });

  it('next() в [0, 1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('Сдвиг', () => {
  it('в пределах ±36 мм и чаще 5–15 мм', () => {
    const r = new Rng(3);
    let typical = 0;
    for (let i = 0; i < 5000; i++) {
      const s = Math.abs(sampleShift(r));
      expect(s).toBeLessThanOrEqual(FRAME_W);
      if (s >= 5 && s <= 15) typical++;
    }
    expect(typical / 5000).toBeGreaterThan(0.75);
  });

  it('ручной сдвиг ограничен длиной кадра', () => {
    const r = makeRecipe(6, 1, { ...DEFAULT_SETTINGS, shiftMode: 'manual', shiftMm: 50 });
    expect(r.shiftMm).toBe(FRAME_W);
  });
});

describe('Рецепт', () => {
  it('воспроизводим по сиду', () => {
    expect(makeRecipe(12, 99)).toEqual(makeRecipe(12, 99));
  });

  it('засветки примерно на каждом пятом кадре', () => {
    let leaks = 0;
    for (let s = 0; s < 200; s++) leaks += makeRecipe(36, s).leaks.length;
    const perFrame = leaks / (200 * 36);
    expect(perFrame).toBeGreaterThan(0.15);
    expect(perFrame).toBeLessThan(0.25);
  });

  it('выключенные эффекты не попадают в рецепт', () => {
    const r = makeRecipe(12, 5, { ...DEFAULT_SETTINGS, leaks: false, endFog: false, dust: false, exposureJitter: false });
    expect(r.leaks).toHaveLength(0);
    expect(r.fogs).toHaveLength(0);
    expect(r.dust.flat()).toHaveLength(0);
    expect(r.evA.every((e) => e === 0)).toBe(true);
  });
});

describe('Раскладка', () => {
  const shapes = (n: number, portrait: number[] = []) => Array.from({ length: n }, (_, i) => ({ portrait: portrait.includes(i) }));

  it('кадры A идут с шагом 38 мм', () => {
    expect(frameA(3).x).toBe(3 * PITCH);
  });

  it('вертикальный снимок поворачивается, film swap добавляет 180°', () => {
    const r = makeRecipe(4, 11, { ...DEFAULT_SETTINGS, swapRotate: true });
    const { a, b } = placements(r, shapes(4, [0]), shapes(4, [0]));
    const pa = a.find((p) => p.photo === 0)!;
    const pb = b.find((p) => p.photo === 0)!;
    expect(pa.turn).toBe(1);
    expect(pb.turn).toBe(3);
    expect(b.filter((p) => p.photo !== 0).every((p) => p.turn === 2)).toBe(true);
  });

  it('обратный порядок переворачивает последовательность снимков B', () => {
    const base = { ...DEFAULT_SETTINGS, exposureJitter: false };
    const fwd = placements(makeRecipe(5, 2, { ...base, reverseOrder: false }), shapes(5), shapes(5)).b.map((p) => p.photo);
    const rev = placements(makeRecipe(5, 2, { ...base, reverseOrder: true }), shapes(5), shapes(5)).b.map((p) => p.photo);
    expect(rev).toEqual([...fwd].reverse());
  });

  it('при сдвиге 10 мм в окно кадра A попадают два кадра B', () => {
    const r = makeRecipe(6, 4, { ...DEFAULT_SETTINGS, shiftMode: 'manual', shiftMm: 10 });
    const { b } = placements(r, shapes(6), shapes(6));
    const win = expand(frameA(2), 0);
    expect(b.filter((p) => intersects(p.rect, win))).toHaveLength(2);
  });
});

describe('Независимые потоки случайности', () => {
  it('отключение пыли и засветок не меняет порядок кадров и сдвиг', () => {
    const on = makeRecipe(12, 77);
    const off = makeRecipe(12, 77, { ...DEFAULT_SETTINGS, dust: false, leaks: false, endFog: false, exposureJitter: false });
    expect(off.orderA).toEqual(on.orderA);
    expect(off.orderB).toEqual(on.orderB);
    expect(off.shiftMm).toBe(on.shiftMm);
  });
});
