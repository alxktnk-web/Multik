// Конвейер проявки одного кадра на WebGL2 (см. ARCHITECTURE.md, «Конвейер одного кадра»).

import { FRAME_H, FRAME_W, expand, frameA, intersects, type Placement, type Rect } from '../core/geometry';
import { LEAK_KINDS, placements, type PhotoShape, type Recipe } from '../core/recipe';
import type { Look } from '../looks';
import { BLUR, DOWN_BRIGHT, FILM, LEAKS, PLACE, VERT } from './shaders';

/** Запас вокруг кадра на радиус самого широкого размытия (3σ), чтобы на краях не было швов, мм. */
const marginMm = (look: Look) => Math.max(3, 3 * look.halSigmaLargeMm + 0.5);

/** Правка кадра: баланс проходов и тон после основной кривой (панель Edit). */
/** Правка одного снимка до наложения (пульт: каналы Bottom / Top). Значения −1…+1, кроме gain, glow, soft. */
export interface PassTone {
  gain: number;
  contrast: number;
  black: number;
  whites: number;
  saturation: number;
  warmth: number;
  /** доля света этого снимка, идущая в ореол, 0…2 */
  glow: number;
  /** дополнительная мягкость объектива, ступени мип-уровня 0…2 */
  soft: number;
}

export const NEUTRAL_PASS: PassTone = { gain: 1, contrast: 0, black: 0, whites: 0, saturation: 0, warmth: 0, glow: 1, soft: 0 };

export interface FrameOptions {
  passA?: PassTone;
  passB?: PassTone;
  /**
   * Пересчитать только последний шаг (кривая, ореол по силе, зерно, пыль): сложение снимков и размытие ореола
   * берутся из прошлого вызова для того же кадра. Для живого предпросмотра в пульте.
   */
  filmOnly?: boolean;
  /** таблица кривых 256 × RGBA8 (R, G, B — каналы, A — яркость) */
  curveLut?: Uint8Array;
  /** −1…+1 */
  black?: number;
  contrast?: number;
  saturation?: number;
  warmth?: number;
}

export interface Source {
  tex: WebGLTexture;
  width: number;
  height: number;
  portrait: boolean;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

interface Program {
  prog: WebGLProgram;
  u: Uniforms;
}

export class Developer {
  readonly gl: WebGL2RenderingContext;
  private quad: WebGLVertexArrayObject;
  private place: Program;
  private leaks: Program;
  private down: Program;
  private blur: Program;
  private film: Program;
  private targets = new Map<string, Target>();
  /** какой кадр сейчас сложен в acc/hs/hl (для filmOnly) */
  private composed = '';
  private curveTex: WebGLTexture;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
      throw new Error('This browser can’t render to float textures');
    }
    gl.getExtension('OES_texture_float_linear');
    this.gl = gl;
    this.quad = this.makeQuad();
    this.place = this.program(PLACE);
    this.leaks = this.program(LEAKS);
    this.down = this.program(DOWN_BRIGHT);
    this.blur = this.program(BLUR);
    this.film = this.program(FILM);
    this.curveTex = gl.createTexture()!;
  }

  /** Загружает снимок в текстуру sRGB8 — выборка из неё сразу даёт линейный свет. */
  upload(image: TexImageSource & { width: number; height: number }): Source {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tex, width: image.width, height: image.height, portrait: image.height > image.width };
  }

  /** Какие снимки каждого прохода нужны для кадра i (по пересечению с окном кадра). */
  needed(i: number, recipe: Recipe, look: Look, shapes: { a: PhotoShape[]; b: PhotoShape[] }): { a: number[]; b: number[] } {
    const { a, b } = placements(recipe, shapes.a, shapes.b);
    const win = expand(frameA(i), marginMm(look));
    return {
      a: a.filter((p) => intersects(p.rect, win)).map((p) => p.photo),
      b: b.filter((p) => intersects(p.rect, win)).map((p) => p.photo),
    };
  }

  release(src: Source): void {
    this.gl.deleteTexture(src.tex);
  }

  /**
   * Проявляет кадр i плёнки A. Возвращает RGBA-пиксели кадра сверху вниз.
   * ppm — пикселей на миллиметр (111 ≈ 4000 px по ширине кадра).
   */
  renderFrame(
    i: number,
    recipe: Recipe,
    look: Look,
    srcA: (Source | undefined)[],
    srcB: (Source | undefined)[],
    ppm: number,
    shapes?: { a: PhotoShape[]; b: PhotoShape[] },
    opts: FrameOptions = {},
  ): ImageData {
    const gl = this.gl;
    const { a, b } = placements(recipe, shapes?.a ?? (srcA as Source[]), shapes?.b ?? (srcB as Source[]));
    const frame = frameA(i);
    const win = expand(frame, marginMm(look));
    const winW = Math.round(win.w * ppm);
    const winH = Math.round(win.h * ppm);
    const half = { w: Math.ceil(winW / 2), h: Math.ceil(winH / 2) };
    const q = { w: Math.ceil(half.w / 2), h: Math.ceil(half.h / 2) };
    const ready = opts.filmOnly && this.composed === `${i}:${winW}x${winH}`;
    const acc = this.target('acc', winW, winH, true);
    const hs = this.target('hs', q.w, q.h, true);
    const hl = this.target('hl', q.w, q.h, true);
    gl.bindVertexArray(this.quad);
    if (!ready) this.compose(recipe, look, a, b, srcA, srcB, win, ppm, acc, hs, hl, opts);
    this.composed = `${i}:${winW}x${winH}`;

    // 5–8. плёнка и вырезка кадра
    const outW = Math.round(FRAME_W * ppm);
    const outH = Math.round(FRAME_H * ppm);
    const out = this.target('out', outW, outH, false);
    this.drawFilm(i, recipe, look, frame, win, ppm, acc, hs, hl, out, opts);

    const img = new ImageData(outW, outH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.readPixels(0, 0, outW, outH, gl.RGBA, gl.UNSIGNED_BYTE, img.data);
    flipRows(img.data, outW, outH);
    return img;
  }

  /** Шаги 1–4: снимки обоих проходов, засветки, ореол. Результат — в acc, hs, hl. */
  private compose(
    recipe: Recipe,
    look: Look,
    a: Placement[],
    b: Placement[],
    srcA: (Source | undefined)[],
    srcB: (Source | undefined)[],
    win: Rect,
    ppm: number,
    acc: Target,
    hs: Target,
    hl: Target,
    opts: FrameOptions,
  ) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fbo);
    gl.viewport(0, 0, acc.w, acc.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // 1–2. каждый снимок, попадающий в окно, — свет складывается
    const visible = [
      ...a.map((p) => [p, srcA[p.photo], opts.passA ?? NEUTRAL_PASS] as const),
      ...b.map((p) => [p, srcB[p.photo], opts.passB ?? NEUTRAL_PASS] as const),
    ].filter(([p, src]) => src && intersects(p.rect, win)) as [Placement, Source, PassTone][];
    for (const [p, src, t] of visible) this.drawPlaced(p, src, win, ppm, acc.w, acc.h, look, t, false);

    // 3. засветки и засвеченные концы
    this.drawLeaks(recipe, win, ppm, acc.w, acc.h, look, false);

    // 4. ореол: свет выделяется на каждом проходе отдельно (в половинном разрешении, по полноразмерным
    // отсчётам), затем сумма уменьшается ещё вдвое и размывается двумя радиусами
    const half = this.target('half', Math.ceil(acc.w / 2), Math.ceil(acc.h / 2), true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, half.fbo);
    gl.viewport(0, 0, half.w, half.h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const [p, src, t] of visible) this.drawPlaced(p, src, win, ppm / 2, half.w, half.h, look, t, true);
    this.drawLeaks(recipe, win, ppm / 2, half.w, half.h, look, true);
    gl.disable(gl.BLEND);

    const q1 = this.target('q1', hs.w, hs.h, true);
    const q2 = this.target('q2', hs.w, hs.h, true);
    this.downsample(half, q1, 0, false);
    const qppm = ppm / 4;
    this.blurPass(q1, q2, [1, 0], look.halSigmaSmallMm * qppm);
    this.blurPass(q2, hs, [0, 1], look.halSigmaSmallMm * qppm);
    this.blurPass(hs, q2, [1, 0], look.halSigmaLargeMm * qppm);
    this.blurPass(q2, hl, [0, 1], look.halSigmaLargeMm * qppm);
  }

  private drawPlaced(p: Placement, src: Source, win: Rect, ppm: number, winW: number, winH: number, look: Look, t: PassTone, extract: boolean) {
    const gl = this.gl;
    const { prog, u } = this.place;
    gl.useProgram(prog);
    gl.uniform4f(u.uRect, (p.rect.x - win.x) * ppm, (p.rect.y - win.y) * ppm, p.rect.w * ppm, p.rect.h * ppm);
    gl.uniform2f(u.uTarget, winW, winH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(u.uImg, 0);
    gl.uniform2f(u.uImgSize, src.width, src.height);
    gl.uniform1i(u.uTurn, p.turn);
    gl.uniform2f(u.uFrame, FRAME_W, FRAME_H);
    gl.uniform1f(u.uGain, p.gain * look.passGain * t.gain);
    gl.uniform4f(u.uPassTone, t.contrast, t.black, t.whites, t.saturation);
    gl.uniform1f(u.uPassWarm, t.warmth);
    gl.uniform1f(u.uPassGlow, t.glow);
    gl.uniform1f(u.uCorner, look.cornerMm);
    gl.uniform1f(u.uSoft, look.softMm);
    gl.uniform1f(u.uVig, look.vignette);
    gl.uniform1f(u.uHLStart, look.hlStart);
    gl.uniform1f(u.uHLBoost, look.hlBoost);
    gl.uniform1f(u.uGradScale, 2 ** (look.lensSoftness + t.soft) * (extract ? 0.5 : 1));
    gl.uniform1f(u.uThreshold, look.halThreshold);
    gl.uniform1i(u.uExtract, extract ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawLeaks(recipe: Recipe, win: Rect, ppm: number, winW: number, winH: number, look: Look, extract: boolean) {
    const leaks = recipe.leaks.filter((l) => !l.off && Math.abs(l.x - (win.x + win.w / 2)) < win.w / 2 + l.width * 4).slice(0, 8);
    const fogs = recipe.fogs.filter((f) => (f.dir === 1 ? win.x < f.edge + 30 : win.x + win.w > f.edge - 30));
    if (!leaks.length && !fogs.length) return;
    const gl = this.gl;
    const { prog, u } = this.leaks;
    gl.useProgram(prog);
    gl.uniform4f(u.uRect, 0, 0, winW, winH);
    gl.uniform2f(u.uTarget, winW, winH);
    gl.uniform2f(u.uWinOrigin, win.x, win.y);
    gl.uniform1f(u.uPpm, ppm);
    gl.uniform1f(u.uFilmH, FRAME_H);
    gl.uniform1f(u.uGain, look.leakGain);
    gl.uniform1i(u.uLeakCount, leaks.length);
    gl.uniform4fv(u['uLeakA[0]'], pad(leaks.flatMap((l) => [l.x, l.dir, l.width, l.strength]), 32));
    gl.uniform4fv(u['uLeakB[0]'], pad(leaks.flatMap((l) => [l.hue, l.yCenter, l.seed, LEAK_KINDS.indexOf(l.kind ?? 'stripe')]), 32));
    gl.uniform1f(u.uThreshold, look.halThreshold);
    gl.uniform1i(u.uExtract, extract ? 1 : 0);
    gl.uniform1i(u.uFogCount, fogs.length);
    gl.uniform4fv(u['uFog[0]'], pad(fogs.flatMap((f) => [f.edge, f.dir, f.strength, f.seed]), 8));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private downsample(src: Target, dst: Target, threshold: number, extract: boolean) {
    const gl = this.gl;
    const { prog, u } = this.down;
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.uniform4f(u.uRect, 0, 0, dst.w, dst.h);
    gl.uniform2f(u.uTarget, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(u.uSrc, 0);
    gl.uniform2f(u.uSrcTexel, 1 / src.w, 1 / src.h);
    gl.uniform1f(u.uThreshold, threshold);
    gl.uniform1i(u.uExtract, extract ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private blurPass(src: Target, dst: Target, dir: [number, number], sigma: number) {
    const gl = this.gl;
    const { prog, u } = this.blur;
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.uniform4f(u.uRect, 0, 0, dst.w, dst.h);
    gl.uniform2f(u.uTarget, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(u.uSrc, 0);
    gl.uniform2f(u.uDir, dir[0] / src.w, dir[1] / src.h);
    gl.uniform1f(u.uSigma, Math.max(sigma, 0.5));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawFilm(i: number, recipe: Recipe, look: Look, frame: Rect, win: Rect, ppm: number, acc: Target, hs: Target, hl: Target, out: Target, opts: FrameOptions) {
    const gl = this.gl;
    const { prog, u } = this.film;
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, out.w, out.h);
    gl.uniform4f(u.uRect, 0, 0, out.w, out.h);
    gl.uniform2f(u.uTarget, out.w, out.h);
    [acc, hs, hl].forEach((t, k) => {
      gl.activeTexture(gl.TEXTURE0 + k);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
    });
    gl.uniform1i(u.uAcc, 0);
    gl.uniform1i(u.uHalS, 1);
    gl.uniform1i(u.uHalL, 2);
    gl.uniform2f(u.uWinSize, acc.w, acc.h);
    gl.uniform2f(u.uFrameOrigin, frame.x, frame.y);
    gl.uniform2f(u.uWinOrigin, win.x, win.y);
    gl.uniform1f(u.uPpm, ppm);
    gl.uniform1f(u.uHalSmall, look.halSmall);
    gl.uniform1f(u.uHalLarge, look.halLarge);
    gl.uniform3fv(u.uHalTint, look.halTint);
    gl.uniform1f(u.uBloom, look.bloom);
    gl.uniform1f(u.uMottle, look.mottle);
    gl.uniform1f(u.uExposure, look.exposure);
    gl.uniform3fv(u.uContrast, look.contrast);
    gl.uniform3fv(u.uOffset, look.offsetStops);
    gl.uniform3fv(u.uBlack, look.black);
    gl.uniform3fv(u.uWhite, look.white);
    gl.uniform3fv(u.uShadowTint, look.shadowTint);
    gl.uniform3fv(u.uHiTint, look.highlightTint);
    gl.uniform1f(u.uSat, look.saturation);
    gl.uniform1f(u.uHiSat, look.highlightSaturation);
    gl.uniform1f(u.uClipLow, look.clipLow);
    gl.uniform1f(u.uClipHigh, look.clipHigh);
    gl.uniform1f(u.uTone, look.tone === 'faithful' ? 1 : 0);
    gl.uniform1f(u.uPunch, look.punch ?? 0);
    gl.uniform1f(u.uShoulder, look.shoulder ?? 0.6);
    gl.uniform1f(u.uW0, look.w0 ?? 0);
    gl.uniform1f(u.uW1, look.w1 ?? 0);
    const user = !!(opts.curveLut || opts.black || opts.contrast || opts.saturation || opts.warmth);
    gl.uniform1f(u.uUserOn, user ? 1 : 0);
    gl.uniform1f(u.uUBlack, opts.black ?? 0);
    gl.uniform1f(u.uUContrast, opts.contrast ?? 0);
    gl.uniform1f(u.uUSat, opts.saturation ?? 0);
    gl.uniform1f(u.uUWarm, opts.warmth ?? 0);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, opts.curveLut ?? IDENTITY_LUT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u.uCurve, 3);
    gl.uniform1f(u.uGrain, look.grain);
    gl.uniform1f(u.uGrainMm, look.grainMm);
    gl.uniform1f(u.uGrainChroma, look.grainChroma);
    gl.uniform1f(u.uSeed, (recipe.seed % 1000) * 0.731);
    const dust = recipe.dust[i].slice(0, 32);
    gl.uniform1i(u.uDustCount, dust.length);
    gl.uniform3fv(u['uDust[0]'], pad(dust.flatMap((d) => [d.x, d.y, d.r]), 96));
    const hairs = recipe.hairs[i].slice(0, 2);
    gl.uniform1i(u.uHairCount, hairs.length);
    gl.uniform4fv(u['uHair[0]'], pad(hairs.flatMap((h) => [h.x0, h.y0, h.x1, h.y1]), 8));
    gl.uniform1fv(u['uHairBend[0]'], pad(hairs.map((h) => h.bend), 2));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private target(name: string, w: number, h: number, float: boolean): Target {
    const gl = this.gl;
    const old = this.targets.get(name);
    if (old && old.w === w && old.h === h) return old;
    if (old) {
      gl.deleteTexture(old.tex);
      gl.deleteFramebuffer(old.fbo);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Could not create buffer ${name} ${w}×${h}`);
    }
    const t = { tex, fbo, w, h };
    this.targets.set(name, t);
    return t;
  }

  private program(fs: string): Program {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    const u: Uniforms = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
    for (let k = 0; k < count; k++) {
      const info = gl.getActiveUniform(prog, k)!;
      u[info.name] = gl.getUniformLocation(prog, info.name);
      if (info.name.endsWith('[0]')) u[info.name.slice(0, -3)] = u[info.name];
    }
    return { prog, u };
  }

  private makeQuad(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return vao;
  }
}

const IDENTITY_LUT = (() => {
  const t = new Uint8Array(256 * 4);
  for (let k = 0; k < 256; k++) t.fill(k, k * 4, k * 4 + 4);
  return t;
})();

function pad(values: number[], length: number): Float32Array {
  const a = new Float32Array(length);
  a.set(values.slice(0, length));
  return a;
}

/** Переворот строк на месте — без второй полноразмерной копии кадра в памяти. */
function flipRows(px: Uint8ClampedArray, w: number, h: number): void {
  const row = w * 4;
  const tmp = new Uint8ClampedArray(row);
  for (let y = 0; y < h >> 1; y++) {
    const top = y * row;
    const bottom = (h - 1 - y) * row;
    tmp.set(px.subarray(top, top + row));
    px.copyWithin(top, bottom, bottom + row);
    px.set(tmp, bottom);
  }
}
