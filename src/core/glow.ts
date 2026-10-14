// Инструмент «Гало»: где на снимке точка кадра и какую область выделяет волшебная палочка.

import { FRAME_H, FRAME_W, type Rect } from './geometry';

/**
 * Координаты снимка (0…1, начало — левый верхний угол) для точки внутри уложенного кадра —
 * та же математика, что в шейдере PLACE: вписывание без кадрирования и поворот на turn четвертей.
 */
export function photoUv(px: number, py: number, rect: Rect, turn: number, imgW: number, imgH: number): [number, number] | null {
  const p = [px - rect.x, py - rect.y];
  const odd = turn % 2 === 1;
  const isz = odd ? [imgH, imgW] : [imgW, imgH];
  const s = Math.min(FRAME_W / isz[0], FRAME_H / isz[1]);
  const q = [(p[0] - FRAME_W / 2) / (isz[0] * s) + 0.5, (p[1] - FRAME_H / 2) / (isz[1] * s) + 0.5];
  if (q[0] < 0 || q[0] > 1 || q[1] < 0 || q[1] > 1) return null;
  switch (turn % 4) {
    case 1:
      return [1 - q[1], q[0]];
    case 2:
      return [1 - q[0], 1 - q[1]];
    case 3:
      return [q[1], 1 - q[0]];
    default:
      return [q[0], q[1]];
  }
}

/** Яркость (0…1) по RGBA-пикселям снимка. */
export function luminance(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) out[k] = (0.2126 * rgba[k * 4] + 0.7152 * rgba[k * 4 + 1] + 0.0722 * rgba[k * 4 + 2]) / 255;
  return out;
}

/**
 * Волшебная палочка: связная светлая область вокруг точки касания.
 * Если палец попал чуть мимо светлого предмета, затравкой берётся самое светлое место рядом.
 * tol 0…1 — насколько темнее затравки могут быть захваченные места. Возвращает 0…1 с мягким краем.
 */
export function wandMask(lum: Float32Array, w: number, h: number, u: number, v: number, tol: number): Float32Array {
  let sx = Math.max(0, Math.min(w - 1, Math.round(u * (w - 1))));
  let sy = Math.max(0, Math.min(h - 1, Math.round(v * (h - 1))));
  const reach = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  let best = lum[sy * w + sx];
  for (let y = Math.max(0, sy - reach); y <= Math.min(h - 1, sy + reach); y++) {
    for (let x = Math.max(0, sx - reach); x <= Math.min(w - 1, sx + reach); x++) {
      if (lum[y * w + x] > best + 0.02) {
        best = lum[y * w + x];
        sx = x;
        sy = y;
      }
    }
  }
  const floor = best * (1 - 0.15 - 0.6 * Math.max(0, Math.min(1, tol)));
  const mask = new Float32Array(w * h);
  const stack = [sy * w + sx];
  const seen = new Uint8Array(w * h);
  seen[stack[0]] = 1;
  const limit = Math.round(w * h * 0.25); // не больше четверти снимка — палочка не заливает небо целиком
  let count = 0;
  while (stack.length && count < limit) {
    const k = stack.pop()!;
    if (lum[k] < floor) continue;
    mask[k] = 1;
    count++;
    const x = k % w;
    const y = (k - x) / w;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (!seen[n]) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return softEdge(mask, w, h, 2);
}

/** Два прохода коробочного размытия — мягкий край выделения. */
function softEdge(m: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= w) continue;
        s += m[y * w + xx];
        n++;
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= h) continue;
        s += tmp[yy * w + x];
        n++;
      }
      out[y * w + x] = Math.max(m[y * w + x], s / n);
    }
  }
  return out;
}
