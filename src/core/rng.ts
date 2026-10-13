// xoshiro128** — маленький быстрый ГПСЧ с сидом: одинаковый сид даёт одинаковую плёнку.

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

export class Rng {
  private s = new Uint32Array(4);

  constructor(seed: number) {
    // splitmix32 разворачивает один сид в четыре слова состояния
    let x = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      this.s[i] = (z ^ (z >>> 16)) >>> 0;
    }
  }

  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** [0, 1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Fisher–Yates; возвращает новую перестановку 0..n-1 */
  permutation(n: number): number[] {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
