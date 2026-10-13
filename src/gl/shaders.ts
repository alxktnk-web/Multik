// Шейдеры конвейера. Координаты в пикселях цели идут сверху вниз (как у картинки).

export const VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
uniform vec4 uRect;   // x, y, w, h в пикселях цели
uniform vec2 uTarget; // размер цели
out vec2 vUV;
void main() {
  vUV = aPos;
  vec2 px = uRect.xy + aPos * uRect.zw;
  vec2 ndc = px / uTarget * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}`;

const COMMON = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// пиксель цели (сверху вниз) -> текстурные координаты
vec2 pxToUv(vec2 px, vec2 size) { return vec2(px.x / size.x, 1.0 - px.y / size.y); }
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
`;

/** Один снимок, уложенный в кадровое окно. Смешивание ONE+ONE: свет складывается. */
export const PLACE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 o;
uniform sampler2D uImg;
uniform vec2 uImgSize;
uniform int uTurn;
uniform vec2 uFrame;
uniform float uGain, uCorner, uSoft, uVig, uHLStart, uHLBoost, uLensSoft;
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = vUV * uFrame;
  vec2 c = uFrame * 0.5;
  float d = sdRoundBox(p - c, c - uSoft, uCorner);
  float gate = 1.0 - smoothstep(-uSoft, uSoft, d);
  vec2 isz = (uTurn == 1 || uTurn == 3) ? uImgSize.yx : uImgSize;
  float s = min(uFrame.x / isz.x, uFrame.y / isz.y);
  vec2 q = (p - c) / (isz * s) + 0.5;
  if (any(lessThan(q, vec2(0.0))) || any(greaterThan(q, vec2(1.0)))) { o = vec4(0.0); return; }
  vec2 uv;
  if (uTurn == 0) uv = q;
  else if (uTurn == 1) uv = vec2(1.0 - q.y, q.x);
  else if (uTurn == 2) uv = 1.0 - q;
  else uv = vec2(q.y, 1.0 - q.x);
  vec3 col = texture(uImg, uv, uLensSoft).rgb; // sRGB8 -> линейный свет; сдвиг мип-уровня смягчает резкость iPhone
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float h = smoothstep(uHLStart, 1.0, l);
  col *= 1.0 + uHLBoost * h * h;
  vec2 r = (p - c) / c;
  float vig = 1.0 - uVig * pow(dot(r, r) * 0.5, 1.5);
  o = vec4(col * uGain * vig * gate, 1.0);
}`;

/** Засветки и засвеченные концы плёнки — свет, добавленный в координатах ленты. */
export const LEAKS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 o;
uniform vec2 uTarget;
uniform vec2 uWinOrigin; // мм ленты в левом верхнем углу окна
uniform float uPpm;
uniform float uFilmH;
uniform float uGain;
uniform int uLeakCount;
uniform vec4 uLeakA[8]; // x, dir, width, strength
uniform vec4 uLeakB[8]; // hue, yCenter, seed, -
uniform int uFogCount;
uniform vec4 uFog[2];   // edge, dir, strength, seed
${COMMON}
void main() {
  vec2 s = uWinOrigin + vUV * uTarget / uPpm;
  vec3 add = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uLeakCount) break;
    vec4 A = uLeakA[i];
    vec4 B = uLeakB[i];
    float t = (s.x - A.x) * A.y;
    float w = A.z;
    float fall = t >= 0.0 ? exp(-t / w) : exp(t / (0.25 * w));
    float yv = s.y / uFilmH;
    float vert = B.y < 0.0 ? 1.0 : exp(-pow((yv - B.y) / 0.55, 2.0));
    float wob = 0.7 + 0.3 * vnoise(vec2(s.y * 0.12 + B.z, B.z));
    float tt = clamp(abs(t) / w, 0.0, 1.0);
    vec3 base = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.08, 0.03), smoothstep(0.0, 0.6, tt));
    vec3 col = mix(base, vec3(0.85, 0.03, 0.35), B.x * smoothstep(0.15, 1.0, tt));
    add += col * A.w * fall * vert * wob;
  }
  for (int i = 0; i < 2; i++) {
    if (i >= uFogCount) break;
    vec4 F = uFog[i];
    float rag = (vnoise(vec2(s.y * 0.9 + F.w, F.w)) - 0.5) * 1.2 + (vnoise(vec2(s.y * 3.1, F.w * 2.0)) - 0.5) * 0.4;
    float dist = (s.x - (F.x + rag)) * F.y; // > 0 — уже нормальная плёнка
    float core = 1.0 - smoothstep(-0.15, 0.15, dist);
    float fringe = exp(-max(dist, 0.0) / 0.8) * (1.0 - core);
    float glow = exp(-max(dist, 0.0) / 4.0);
    add += F.z * (core * vec3(6.0) + fringe * vec3(2.5, 0.35, 0.06) + glow * vec3(0.5, 0.12, 0.04));
  }
  o = vec4(add * uGain, 1.0);
}`;

/** Уменьшение в 2 раза с выделением ярких мест (вход ореола). */
export const DOWN_BRIGHT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 o;
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform float uThreshold;
uniform int uExtract;
void main() {
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);
  // каждый отсчёт попадает ровно в центр текселя источника: выделение светов идёт
  // в полном разрешении, поэтому маленькая яркая точка не теряется при уменьшении
  vec3 c = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec2 off = vec2(k == 0 || k == 2 ? -0.5 : 0.5, k < 2 ? -0.5 : 0.5);
    vec3 t = texture(uSrc, uv + uSrcTexel * off).rgb;
    if (uExtract == 1) {
      float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
      t *= max(l - uThreshold, 0.0) / max(l, 1e-4);
    }
    c += 0.25 * t;
  }
  o = vec4(c, 1.0);
}`;

/** Раздельное гауссово размытие. */
export const BLUR = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 o;
uniform sampler2D uSrc;
uniform vec2 uDir; // шаг в текстурных координатах на один пиксель вдоль оси
uniform float uSigma; // в пикселях
void main() {
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);
  float step = max(1.0, uSigma * 3.0 / 16.0);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = -16; i <= 16; i++) {
    float x = float(i) * step;
    float w = exp(-0.5 * x * x / (uSigma * uSigma));
    acc += texture(uSrc, uv + uDir * x).rgb * w;
    wsum += w;
  }
  o = vec4(acc / wsum, 1.0);
}`;

/** Плёнка: ореол, «дыхание», неравномерность, зерно, кривая, пыль. Пишет готовый кадр. */
export const FILM = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 o;
uniform sampler2D uAcc, uHalS, uHalL;
uniform vec2 uTarget;     // размер кадра в пикселях
uniform vec2 uWinSize;    // размер окна в пикселях
uniform vec2 uFrameOrigin, uWinOrigin; // мм ленты
uniform float uPpm;
uniform float uHalSmall, uHalLarge, uBloom, uMottle, uExposure;
uniform vec3 uHalTint;
uniform vec3 uContrast, uOffset, uBlack, uWhite, uShadowTint, uHiTint;
uniform float uSat, uHiSat, uClipLow, uClipHigh;
uniform float uTone, uPunch; // uTone: 0 — кривая в логарифме экспозиции, 1 — «честная» (один проход = исходное фото)
uniform float uGrain, uGrainMm, uGrainChroma, uSeed;
uniform int uDustCount;
uniform vec3 uDust[32];
uniform int uHairCount;
uniform vec4 uHair[2];
uniform float uHairBend[2];
${COMMON}
vec3 grainAt(vec2 s) {
  float cell = max(uGrainMm, 1.0 / uPpm);
  vec2 g = s / cell + uSeed;
  float n0 = vnoise(g) - 0.5;
  vec3 nc = vec3(vnoise(g + 17.1), vnoise(g + 43.7), vnoise(g + 71.3)) - 0.5;
  float amp = uGrain * (uGrainMm / cell) * 2.0;
  return mix(vec3(n0), nc, uGrainChroma) * amp;
}
float segDist(vec2 p, vec2 a, vec2 b, float bend) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  vec2 n = normalize(vec2(-ab.y, ab.x));
  vec2 q = a + ab * t + n * bend * sin(t * 3.14159);
  return length(p - q);
}
void main() {
  vec2 px = vUV * uTarget;
  vec2 s = uFrameOrigin + px / uPpm;          // мм ленты
  vec2 local = px / uPpm;                     // мм внутри кадра
  vec2 wuv = pxToUv((s - uWinOrigin) * uPpm, uWinSize);
  vec3 lin = texture(uAcc, wuv).rgb;
  vec3 hs = texture(uHalS, wuv).rgb;
  vec3 hl = texture(uHalL, wuv).rgb;
  lin += uHalTint * (dot(hs, LUMA) * uHalSmall + dot(hl, LUMA) * uHalLarge);
  lin += hl * uBloom;
  lin *= 1.0 + uMottle * (vnoise(s * 0.15 + uSeed) - 0.5) * 2.0;

  vec3 e = log2(max(lin * uExposure, vec3(1e-5))) - log2(0.18);
  float dens = clamp((dot(e, LUMA) + 4.0) / 7.0, 0.0, 1.0); // 0 — тонкий негатив, 1 — плотный
  vec3 gr = grainAt(s) * mix(1.2, 0.5, dens);
  vec3 y;
  if (uTone < 0.5) {
    y = 0.5 + 0.5 * tanh(0.5 * uContrast * (e + gr - uOffset));
  } else {
    // «Честная» кривая: свет одного прохода возвращается в sRGB как был — чёрное второго прохода
    // ничего не меняет, это просто «дырка» для первого. Сумма двух проходов уходит в мягкое плечо
    // (наложение светлеет, как screen), всё ярче белого сливается в белый. Зерно — в ступенях.
    vec3 L = lin * uExposure * exp2(gr);
    const float KNEE = 0.6;
    vec3 sh = KNEE + (1.0 - KNEE) * (1.0 - exp(-(L - KNEE) / (1.0 - KNEE)));
    L = mix(L, sh, step(KNEE, L));
    y = mix(12.92 * L, 1.055 * pow(max(L, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, L));
    y = mix(y, y * y * (3.0 - 2.0 * y), uPunch); // лёгкая S-кривая «плёночности»
  }
  float ly = dot(y, LUMA);
  y = mix(vec3(ly), y, uSat * mix(1.0, uHiSat, smoothstep(0.65, 1.0, ly)));
  y += uShadowTint * (1.0 - ly) * (1.0 - ly) + uHiTint * ly * ly;
  y = (y - uClipLow) / max(uClipHigh - uClipLow, 1e-3);
  vec3 col = mix(uBlack, uWhite, clamp(y, 0.0, 1.0));

  for (int i = 0; i < 32; i++) {
    if (i >= uDustCount) break;
    vec3 d = uDust[i];
    float a = 1.0 - smoothstep(d.z * 0.5, d.z, length(local - d.xy));
    col = mix(col, vec3(0.96), a * 0.9);
  }
  for (int i = 0; i < 2; i++) {
    if (i >= uHairCount) break;
    float dist = segDist(local, uHair[i].xy, uHair[i].zw, uHairBend[i]);
    float a = 1.0 - smoothstep(0.02, 0.05, dist);
    col = mix(col, vec3(0.03), a * 0.85);
  }
  col += (hash12(px + uSeed) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;
