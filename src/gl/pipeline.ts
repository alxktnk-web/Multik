// Конвейер проявки одного кадра на WebGL2 (см. ARCHITECTURE.md, «Конвейер одного кадра»).

import { FRAME_H, FRAME_W, expand, frameA, intersects, type Placement, type Rect } from '../core/geometry';
import { placements, type Recipe } from '../core/recipe';
import type { Look } from '../looks';
import { BLUR, DOWN_BRIGHT, FILM, LEAKS, PLACE, VERT } from './shaders';

/** Запас вокруг кадра, чтобы ореол и засветки соседей попадали в кадр без швов, мм. */
const MARGIN_MM = 3;

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

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 недоступен в этом браузере');
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
      throw new Error('Браузер не умеет рисовать в float-текстуры');
    }
    gl.getExtension('OES_texture_float_linear');
    this.gl = gl;
    this.quad = this.makeQuad();
    this.place = this.program(PLACE);
    this.leaks = this.program(LEAKS);
    this.down = this.program(DOWN_BRIGHT);
    this.blur = this.program(BLUR);
    this.film = this.program(FILM);
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

  release(src: Source): void {
    this.gl.deleteTexture(src.tex);
  }

  /**
   * Проявляет кадр i плёнки A. Возвращает RGBA-пиксели кадра сверху вниз.
   * ppm — пикселей на миллиметр (111 ≈ 4000 px по ширине кадра).
   */
  renderFrame(i: number, recipe: Recipe, look: Look, srcA: Source[], srcB: Source[], ppm: number): ImageData {
    const gl = this.gl;
    const { a, b } = placements(recipe, srcA, srcB);
    const frame = frameA(i);
    const win = expand(frame, MARGIN_MM);
    const winW = Math.round(win.w * ppm);
    const winH = Math.round(win.h * ppm);
    const acc = this.target('acc', winW, winH, true);

    gl.bindVertexArray(this.quad);
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fbo);
    gl.viewport(0, 0, winW, winH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // 1–2. каждый снимок, попадающий в окно, — свет складывается
    const draw = (p: Placement, src: Source) => {
      if (!intersects(p.rect, win)) return;
      this.drawPlaced(p, src, win, ppm, winW, winH, look);
    };
    a.forEach((p) => draw(p, srcA[p.photo]));
    b.forEach((p) => draw(p, srcB[p.photo]));

    // 3. засветки и засвеченные концы
    this.drawLeaks(recipe, win, ppm, winW, winH, look);
    gl.disable(gl.BLEND);

    // 4. ореол: выделение светов на ½ и ¼ разрешения, два размытия
    const half = this.target('half', Math.ceil(winW / 2), Math.ceil(winH / 2), true);
    const q1 = this.target('q1', Math.ceil(half.w / 2), Math.ceil(half.h / 2), true);
    const q2 = this.target('q2', q1.w, q1.h, true);
    const hs = this.target('hs', q1.w, q1.h, true);
    const hl = this.target('hl', q1.w, q1.h, true);
    this.downsample(acc, half, look.halThreshold, true);
    this.downsample(half, q1, 0, false);
    const qppm = ppm / 4;
    this.blurPass(q1, q2, [1, 0], look.halSigmaSmallMm * qppm);
    this.blurPass(q2, hs, [0, 1], look.halSigmaSmallMm * qppm);
    this.blurPass(hs, q2, [1, 0], look.halSigmaLargeMm * qppm);
    this.blurPass(q2, hl, [0, 1], look.halSigmaLargeMm * qppm);

    // 5–8. плёнка и вырезка кадра
    const outW = Math.round(FRAME_W * ppm);
    const outH = Math.round(FRAME_H * ppm);
    const out = this.target('out', outW, outH, false);
    this.drawFilm(i, recipe, look, frame, win, ppm, acc, hs, hl, out);

    const pixels = new Uint8ClampedArray(outW * outH * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.readPixels(0, 0, outW, outH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return new ImageData(flipRows(pixels, outW, outH), outW, outH);
  }

  private drawPlaced(p: Placement, src: Source, win: Rect, ppm: number, winW: number, winH: number, look: Look) {
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
    gl.uniform1f(u.uGain, p.gain * look.passGain);
    gl.uniform1f(u.uCorner, look.cornerMm);
    gl.uniform1f(u.uSoft, look.softMm);
    gl.uniform1f(u.uVig, look.vignette);
    gl.uniform1f(u.uHLStart, look.hlStart);
    gl.uniform1f(u.uHLBoost, look.hlBoost);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawLeaks(recipe: Recipe, win: Rect, ppm: number, winW: number, winH: number, look: Look) {
    const leaks = recipe.leaks.filter((l) => Math.abs(l.x - (win.x + win.w / 2)) < win.w / 2 + l.width * 4).slice(0, 8);
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
    gl.uniform4fv(u['uLeakB[0]'], pad(leaks.flatMap((l) => [l.hue, l.yCenter, l.seed, 0]), 32));
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

  private drawFilm(i: number, recipe: Recipe, look: Look, frame: Rect, win: Rect, ppm: number, acc: Target, hs: Target, hl: Target, out: Target) {
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
      throw new Error(`Не удалось создать буфер ${name} ${w}×${h}`);
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

function pad(values: number[], length: number): Float32Array {
  const a = new Float32Array(length);
  a.set(values.slice(0, length));
  return a;
}

function flipRows(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const row = w * 4;
  for (let y = 0; y < h; y++) out.set(src.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
  return out;
}
