import { describe, expect, it } from 'vitest';
import { FRAME_W, PITCH, expand, frameA, intersects } from './geometry';
import { baseEdit, composeKey, countChanges, curveTable, editedRecipe, storedEdit } from './edit';
import { photoUv, wandMask } from './glow';
import { DEFAULT_SETTINGS, balanceGains, makeRecipe, placements, sampleShift } from './recipe';
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

  it('засветки примерно на половине кадров, трёх типов, разной силы', () => {
    let leaks = 0;
    const kinds = new Set<string>();
    const strengths: number[] = [];
    for (let s = 0; s < 200; s++) {
      for (const l of makeRecipe(36, s).leaks) {
        leaks++;
        kinds.add(l.kind);
        strengths.push(l.strength);
      }
    }
    const perFrame = leaks / (200 * 36);
    expect(perFrame).toBeGreaterThan(0.45);
    expect(perFrame).toBeLessThan(0.55);
    expect([...kinds].sort()).toEqual(['burn', 'glow', 'stripe']);
    strengths.sort((a, b) => a - b);
    // много слабых, редко очень сильные
    expect(strengths[Math.floor(strengths.length / 2)]).toBeLessThan(1.6);
    expect(strengths[strengths.length - 1]).toBeGreaterThan(3);
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

describe('Правка кадра', () => {
  it('баланс A ↔ B не меняет сумму света и меняет отношение в 2^b раз', () => {
    for (const b of [-2, -0.7, 0, 1, 2]) {
      const g = balanceGains(b);
      expect(g.a + g.b).toBeCloseTo(2, 10);
      expect(g.a / g.b).toBeCloseTo(2 ** b, 10);
    }
  });

  it('кривая проходит через точки и монотонна', () => {
    const t = curveTable([
      [0, 0.05],
      [0.3, 0.2],
      [0.5, 0.6],
      [1, 0.95],
    ]);
    expect(t[0]).toBeCloseTo(0.05, 5);
    expect(t[255]).toBeCloseTo(0.95, 5);
    expect(t[Math.round(0.5 * 255)]).toBeCloseTo(0.6, 1);
    for (let k = 1; k < 256; k++) expect(t[k]).toBeGreaterThanOrEqual(t[k - 1] - 1e-6);
    const id = curveTable([
      [0, 0],
      [1, 1],
    ]);
    expect(id[128]).toBeCloseTo(128 / 255, 5);
  });

  it('правка без изменений не меняет рецепт кадра', () => {
    const r = makeRecipe(12, 31);
    for (let i = 0; i < 12; i++) {
      const base = baseEdit(r, i, 4);
      expect(countChanges(base, base)).toBe(0);
      const e = editedRecipe(r, i, base);
      expect(e.leaks.length).toBe(r.leaks.length);
      expect(e.shiftMm).toBeCloseTo(r.shiftMm, 1);
    }
  });

  it('поворот нижнего снимка касается только этого кадра, верхний — по правке; шаг 90°', () => {
    const r = makeRecipe(6, 3, { ...DEFAULT_SETTINGS, exposureJitter: false });
    const shapes = Array.from({ length: 6 }, () => ({ portrait: false }));
    const base = baseEdit(r, 2, 4);
    expect(base.top.turns).toBe(2);
    const e = editedRecipe(r, 2, { ...base, bottom: { ...base.bottom, turns: 1 }, top: { ...base.top, turns: 3 } });
    const { a, b } = placements(e, shapes, shapes);
    expect(a.map((p) => p.turn)).toEqual([0, 0, 1, 0, 0, 0]);
    expect(b.every((p) => p.turn === 3)).toBe(true);
    const unchanged = placements(editedRecipe(r, 2, base), shapes, shapes);
    expect(unchanged.b.every((p) => p.turn === 2)).toBe(true);
  });

  it('старая правка с поворотом «да/нет» читается как 180°', () => {
    const r = makeRecipe(6, 3);
    const base = baseEdit(r, 0, 4);
    const old = { ...base, bottom: { ...base.bottom, turns: undefined, rotate: true } };
    expect(storedEdit(old)!.bottom.turns).toBe(2);
  });

  it('настройки последнего шага не требуют повторного сложения снимков', () => {
    const r = makeRecipe(6, 9);
    const base = baseEdit(r, 1, 4);
    const film = { ...base, mix: { ...base.mix, whites: 8, halo: 1.5, grain: 0, contrast: 0.3 } };
    expect(composeKey(film)).toBe(composeKey(base));
    const photo = { ...base, bottom: { ...base.bottom, contrast: 0.4 } };
    expect(composeKey(photo)).not.toBe(composeKey(base));
    expect(countChanges(photo, base)).toBe(1);
  });

  it('правки первой панели (v1) не подхватываются', () => {
    expect(storedEdit({ balance: 1 })).toBeNull();
    const r = makeRecipe(6, 9);
    expect(storedEdit(baseEdit(r, 0, 4))).not.toBeNull();
  });
});

describe('Гало', () => {
  it('точка кадра попадает в те же координаты снимка, что и в шейдере (с поворотом)', () => {
    const rect = { x: 0, y: 0, w: 36, h: 27 };
    expect(photoUv(18, 13.5, rect, 0, 4000, 3000)).toEqual([0.5, 0.5]);
    const [u, v] = photoUv(9, 6.75, rect, 0, 4000, 3000)!;
    expect(u).toBeCloseTo(0.25, 5);
    expect(v).toBeCloseTo(0.25, 5);
    const [u2, v2] = photoUv(9, 6.75, rect, 2, 4000, 3000)!;
    expect(u2).toBeCloseTo(0.75, 5);
    expect(v2).toBeCloseTo(0.75, 5);
    // горизонтальный снимок, повёрнутый на 90°, стоит в кадре вертикально: поля по бокам — вне снимка
    expect(photoUv(1, 13.5, rect, 1, 4000, 3000)).toBeNull();
    expect(photoUv(18, 13.5, rect, 1, 4000, 3000)).not.toBeNull();
  });

  it('палочка выделяет светлый предмет и не заливает тёмное вокруг', () => {
    const w = 40;
    const h = 30;
    const lum = new Float32Array(w * h).fill(0.2);
    for (let y = 10; y < 16; y++) for (let x = 10; x < 20; x++) lum[y * w + x] = 0.95; // «кроссовок»
    for (let y = 0; y < h; y++) for (let x = 32; x < 40; x++) lum[y * w + x] = 0.9; // светлая стена отдельно
    const m = wandMask(lum, w, h, 12 / (w - 1), 12 / (h - 1), 0.3);
    expect(m[12 * w + 14]).toBe(1);
    expect(m[25 * w + 5]).toBe(0);
    expect(m[12 * w + 36]).toBe(0);
  });
});
