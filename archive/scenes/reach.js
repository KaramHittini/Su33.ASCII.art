// Reach scene: Spider-Man's arm reaches down from above for someone's falling hand — and misses.
// Ray-marched SDF (arm/hand/glove sculpt shared in spirit with the retired swing.js), pure function of t.
// World: metres, y up, camera looks down -z at the near-meeting point (origin).
// 0-3 the hands close in (slow motion), ~3.0 fingertips almost touch, 3.2 the falling hand slips away,
// he strains after her, fires a web line that falls short (4.3), lets it go (6.3), the hand clenches
// into a trembling fist on empty air (7) and withdraws; city lights blur far below; fade out at the end.
import * as THREE from 'three';

const DUR = 11;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const sm = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const st = (t, a, b) => sm((t - a) / (b - a));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// rotate v around axis k (unit) by angle a
function rot(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uAspect, uTanHalf, uResY, uTime;
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
uniform vec3 uJ[8];      // 0-3 his shoulder, elbow, wrist, finger dir tip; 4-7 hers
uniform vec3 uBk[2];     // elbow bulge (back of arm)
uniform vec3 uPalm[2];   // palm normals
uniform vec4 uCurl[2];   // finger curl (index..pinky)
uniform float uSplay[2]; // finger spread
uniform vec3 uKey;
uniform vec3 uWebA, uWebB; // web strand ends
uniform float uWeb, uWebSag, uWebWig;

#define TAU 6.28318530718

float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdRBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdRC(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
  vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv);
  float y2 = y * y * l2; float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
void U(inout vec2 r, float d, float id, float k) {
  float h = max(k - abs(r.x - d), 0.0) / k;
  float m = min(r.x, d) - h * h * k * 0.25;
  r = vec2(m, d < r.x ? id : r.y);
}

// hand: x toward the thumb, y along the fingers, z out of the palm; sc scales the whole hand
float handSdf(vec3 p, vec3 wr, vec3 tp, vec3 pn, vec4 cu, float splay, float side, float sc) {
  vec3 hy = normalize(tp - wr);
  vec3 hz = normalize(pn - hy * dot(pn, hy));
  vec3 hx = cross(hy, hz);
  vec3 d = (p - wr) / sc;
  vec3 l = vec3(dot(d, hx) * side, dot(d, hy), dot(d, hz));
  float h = sdRBox(l - vec3(0.0, 0.047, -0.003), vec3(0.036, 0.046, 0.014), 0.012); // palm
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = 0.026 - fi * 0.0175;
    float L = i == 0 ? 0.074 : (i == 1 ? 0.082 : (i == 2 ? 0.077 : 0.062));
    float c = i == 0 ? cu.x : (i == 1 ? cu.y : (i == 2 ? cu.z : cu.w));
    float sa = (1.5 - fi) * 0.17 * splay;
    vec3 d0 = vec3(sin(sa), cos(sa), 0.0);
    vec3 b = vec3(x, 0.088 - (i == 3 ? 0.008 : 0.0), -0.003);
    float a1 = c * 1.5, a2 = c * 3.0;
    vec3 j1 = b + (d0 * cos(a1) + vec3(0.0, 0.0, sin(a1))) * L * 0.52;
    vec3 j2 = j1 + (d0 * cos(a2) + vec3(0.0, 0.0, sin(a2))) * L * 0.48;
    float fr = 0.0102 - fi * 0.0008;
    h = smin(h, min(sdCap(l, b, j1, fr), sdCap(l, j1, j2, fr * 0.86)), 0.007);
  }
  for (int i = 0; i < 4; i++) {                                    // knuckles on the back of the hand
    h = smin(h, length(l - vec3(0.026 - float(i) * 0.0175, 0.088, -0.014)) - 0.0095, 0.012);
  }
  h = smin(h, length(l - vec3(0.025, 0.03, 0.01)) - 0.017, 0.015);   // thumb-base muscle
  float ts = 0.008 * splay;
  vec3 t0 = vec3(0.028, 0.018, 0.004), t1 = vec3(0.056 + ts, 0.05, 0.02 - ts * 0.4), t2 = vec3(0.066 + ts * 1.8, 0.083, 0.03 - ts * 0.8);
  h = smin(h, min(sdCap(l, t0, t1, 0.013), sdCap(l, t1, t2, 0.0105)), 0.012);
  return h * sc;
}

vec2 map(vec3 p) {
  vec2 c = vec2(1e5, 0.0);
  // --- his arm (suit) ---
  {
    vec3 sh = uJ[0], el = uJ[1], wr = uJ[2], tp = uJ[3], bk = uBk[0];
    float d = sdRC(p, sh, el, 0.052, 0.037);
    d = smin(d, sdRC(p, mix(sh, el, 0.3) - bk * 0.014, mix(sh, el, 0.82) - bk * 0.01, 0.045, 0.032), 0.025);
    d = smin(d, sdRC(p, mix(sh, el, 0.2) + bk * 0.017, mix(sh, el, 0.78) + bk * 0.012, 0.043, 0.031), 0.025);
    U(c, d, 4.0, 0.05);
    float f = sdRC(p, el, wr, 0.042, 0.026);
    f = smin(f, sdRC(p, mix(el, wr, 0.06), mix(el, wr, 0.55), 0.047, 0.031), 0.03);
    f = smin(f, length(p - el - bk * 0.012) - 0.036, 0.02);
    U(c, f, 5.0, 0.025);
    if (length(p - wr) < 0.26) U(c, handSdf(p, wr, tp, uPalm[0], uCurl[0], uSplay[0], 1.0, 1.0), 6.0, 0.018);
  }
  // --- the falling person's arm: sleeve + bare, slender hand ---
  {
    vec3 sh = uJ[4], el = uJ[5], wr = uJ[6], tp = uJ[7];
    if (length(p - el) < 0.75 + c.x) {
      float d = sdRC(p, sh, el, 0.05, 0.046);
      U(c, d, 9.0, 0.02);
      float f = sdRC(p, el, wr, 0.036, 0.024);
      f = smin(f, sdRC(p, mix(el, wr, 0.05), mix(el, wr, 0.5), 0.038, 0.028), 0.02);
      U(c, f, 7.0, 0.02);
      // loose sleeve over the forearm, open cuff
      vec3 cuffA = el, cuffB = mix(el, wr, 0.62);
      vec3 sd = normalize(cuffB - cuffA);
      float sh2 = clamp(dot(p - cuffA, sd) / length(cuffB - cuffA), 0.0, 1.0);
      float flap = 0.0045 * sin(sh2 * 18.0 - uTime * 22.0 + atan(p.x - el.x, p.z - el.z) * 3.0) * sh2;
      float sl = sdRC(p, cuffA, cuffB, 0.052, 0.047) - flap;
      U(c, sl, 9.0, 0.012);
      if (length(p - wr) < 0.24) U(c, handSdf(p, wr, tp, uPalm[1], uCurl[1], uSplay[1], -1.0, 0.9), 8.0, 0.016);
    } else {
      c = vec2(min(c.x, length(p - el) - 0.7), c.y);
    }
  }
  // --- web line he fires after her: falls short, sags, drifts ---
  if (uWeb > 0.001) {
    vec3 prev = uWebA;
    float dw = 1e5;
    for (int i = 1; i <= 10; i++) {
      float s = float(i) / 10.0;
      vec3 q = mix(uWebA, uWebB, s) + vec3(0.0, -uWebSag * s * s, 0.0)
             + uWebWig * s * vec3(sin(s * 9.0 + uTime * 6.0), 0.0, cos(s * 7.0 + uTime * 4.5));
      dw = min(dw, sdCap(p, prev, q, 0.0045 * uWeb));
      prev = q;
    }
    dw = min(dw, length(p - prev) - 0.012 * uWeb); // glob at the tip
    U(c, dw, 10.0, 0.004);
  }
  return c;
}

vec3 calcNormal(vec3 p, float e) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x +
                   k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}
float calcAO(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 5; i++) {
    float h = 0.004 + 0.02 * float(i * i) * 0.25;
    o += (h - map(p + n * h).x) * s;
    s *= 0.75;
  }
  return clamp(1.0 - 3.0 * o, 0.0, 1.0);
}
float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.01;
  for (int i = 0; i < 24; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.006, 0.12);
    if (res < 0.02 || t > 1.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

const float RED = 0.47, BLUE = 0.22, LINE = 0.02, SKIN = 0.66, CLOTH = 0.3;

vec2 material(vec3 p, float id, float pixW) {
  int k = int(id + 0.5);
  if (k == 8) return vec2(SKIN, 1.0);
  if (k == 10) return vec2(0.95, 1.0);
  vec3 A, B;
  if (k == 4) { A = uJ[0]; B = uJ[1]; } else if (k == 5) { A = uJ[1]; B = uJ[2]; } else if (k == 6) { A = uJ[2]; B = uJ[3]; }
  else if (k == 7) { A = uJ[5]; B = uJ[6]; } else { A = uJ[4]; B = uJ[5]; }
  vec3 ba = B - A; float L = length(ba); vec3 dir = ba / L;
  float h = dot(p - A, dir);
  vec3 rv = p - (A + dir * h); float rr = length(rv); vec3 rn = rv / max(rr, 1e-4);
  if (k == 7) { // bare forearm below the sleeve
    return vec2(SKIN * 0.96, 1.0);
  }
  if (k == 9) { // sleeve: soft fabric folds + dark cuff hem
    float fold = 0.5 + 0.5 * sin(h * 70.0 + 3.0 * sin(atan(rn.y, rn.x) * 2.0));
    float a = CLOTH * (0.94 + 0.06 * fold);
    vec3 cuff = mix(uJ[5], uJ[6], 0.62);
    if (abs(dot(p - cuff, normalize(uJ[6] - uJ[5]))) < 0.007) a = CLOTH * 0.45;
    return vec2(a, 2.0);
  }
  // his suit: web lines on red (glove + forearm), blue underside of the upper arm with a seam
  float base = RED, seam = 1e3;
  vec3 ref = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 ref2 = cross(dir, ref);
  float ang = atan(dot(rv, ref2), dot(rv, ref));
  float N = 6.0;
  float fs = fract(ang / TAU * N);
  float dsp = min(fs, 1.0 - fs) * TAU / N * rr;
  float D = k == 6 ? 0.05 : 0.07;
  float sag = 0.4 * D * 4.0 * fs * (1.0 - fs);
  float dr = abs(fract((h + sag) / D + 0.5) - 0.5) * D;
  float wd = min(dsp, dr);
  if (k == 4) {
    float e = dot(rn, uBk[0]) - 0.1;
    if (e > 0.0) base = BLUE;
    seam = abs(e) * rr;
  }
  if (base < 0.3) wd = 1e3;
  float w = max(0.0012, pixW * 0.75);
  float line = smoothstep(w, w * 0.4, wd);
  float lod = smoothstep(D * 0.3, D * 0.14, pixW);
  float a = mix(base, LINE, line * lod);
  float sw = max(0.0022, pixW * 0.7);
  a = mix(a, LINE, smoothstep(sw, sw * 0.45, seam));
  return vec2(a, 0.0);
}

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uCamRight * ndc.x * uTanHalf * uAspect + uCamUp * ndc.y * uTanHalf);
  vec3 ro = uCamPos;
  float t = 0.0, id = -1.0;
  for (int i = 0; i < 150; i++) {
    vec2 h = map(ro + rd * t);
    if (h.x < max(0.0001, t * 0.0009)) { id = h.y; break; }
    t += h.x * 0.9;
    if (t > 40.0) break;
  }
  float col = 0.0;
  if (id > 0.0) {
    vec3 p = ro + rd * t;
    float pixW = t * 2.0 * uTanHalf / uResY;
    vec3 n = calcNormal(p, max(0.0003, pixW * 0.5));
    vec2 m = material(p, id, pixW);
    vec3 L1 = uKey;
    vec3 L2 = normalize(vec3(0.6, -0.2, 0.75));
    float ndl = dot(n, L1);
    float dif = clamp((ndl + 0.12) / 1.12, 0.0, 1.0);
    float sh = ndl > -0.1 ? softShadow(p + n * 0.003, L1) : 0.0;
    float ao = calcAO(p, n);
    float fill = max(dot(n, L2), 0.0) + 0.7 * max(dot(n, normalize(vec3(0.15, -1.0, 0.35))), 0.0); // + city glow from below
    float fres = 1.0 - max(dot(n, -rd), 0.0);
    float rim = fres * fres * fres;
    float nh = max(dot(n, normalize(L1 - rd)), 0.0);
    if (m.y > 1.5) { // cloth: matte
      col = m.x * (0.14 * ao + 0.95 * dif * (0.3 + 0.7 * sh) * (0.6 + 0.4 * ao) + 0.3 * fill * ao) + 0.22 * rim * ao;
    } else if (m.y > 0.5) { // skin: soft wrap + gentle sheen
      float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
      col = m.x * (0.16 * ao + 0.95 * wrap * (0.35 + 0.65 * sh) * (0.65 + 0.35 * ao) + 0.3 * fill * ao)
          + 0.12 * pow(nh, 24.0) * sh + 0.25 * rim * ao;
    } else { // suit fabric
      float spec = (0.16 * pow(nh, 14.0) + 0.1 * pow(nh, 60.0)) * sh;
      col = m.x * (0.14 * ao + 0.98 * dif * (0.25 + 0.75 * sh) * (0.6 + 0.4 * ao) + 0.36 * fill * ao)
          + spec * step(0.1, m.x) + 0.32 * rim * ao * (0.4 + 0.6 * m.x);
    }
    col *= clamp(1.35 - 0.11 * t, 0.0, 1.0); // falls away into the dark
  } else {
    // the city far below: soft out-of-focus lights drifting up (we're falling toward them)
    vec2 sp = vec2(ndc.x * uAspect, ndc.y);
    for (int i = 0; i < 26; i++) {
      float fi = float(i);
      vec2 cc = vec2((hash(fi * 3.1) * 2.0 - 1.0) * max(uAspect, 0.6) * 1.1,
                     fract(hash(fi * 7.7) + uTime * (0.03 + 0.05 * hash(fi * 1.3))) * 2.6 - 1.7);
      float r = 0.02 + 0.05 * hash(fi * 5.1);
      float a = (0.07 + 0.17 * hash(fi * 9.2)) * smoothstep(0.5, -0.4, cc.y);
      col = max(col, a * smoothstep(r, r * 0.7, length(sp - cc)) * (0.75 + 0.25 * smoothstep(r * 0.3, r, length(sp - cc))));
    }
    // falling: thin wind streaks rushing upward past the camera
    float cols = 70.0;
    float ci = floor((ndc.x * uAspect + 3.0) * cols * 0.5);
    float r = hash(ci);
    if (r > 0.82) {
      float sp = 0.9 + 1.6 * hash(ci + 7.0);
      float y = fract(hash(ci + 3.0) + uTime * sp * 0.35) * 2.8 - 1.4;
      float Ls = 0.12 + 0.25 * hash(ci + 11.0);
      float fx = abs(fract((ndc.x * uAspect + 3.0) * cols * 0.5) - 0.5);
      float a = smoothstep(Ls, 0.0, abs(ndc.y - y)) * smoothstep(0.25, 0.05, fx);
      col = max(col, a * (0.1 + 0.14 * hash(ci + 5.0)));
    }
  }
  gl_FragColor = vec4(vec3(col), 1.0);
}
`;

export function createReachScene(ctx) {
  let aspect = ctx.aspect || 16 / 9;
  const FOV = 34;
  const tanHalf = Math.tan((FOV * Math.PI) / 360);
  const J = Array.from({ length: 8 }, () => new THREE.Vector3());
  const V2 = () => [new THREE.Vector3(), new THREE.Vector3()];
  const uniforms = {
    uAspect: { value: aspect },
    uTanHalf: { value: tanHalf },
    uResY: { value: 190 },
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uJ: { value: J },
    uBk: { value: V2() },
    uPalm: { value: V2() },
    uCurl: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uSplay: { value: [1, 1] },
    uKey: { value: new THREE.Vector3(...nrm([-0.35, 0.85, 0.45])) },
    uWebA: { value: new THREE.Vector3() },
    uWebB: { value: new THREE.Vector3() },
    uWeb: { value: 0 },
    uWebSag: { value: 0 },
    uWebWig: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let lastT = 0;

  // his wrist + finger direction over time (pure in t, also sampled at fixed times for the web line)
  function hisHand(t) {
    const reach = st(t, 0, 2.6);
    const brush = Math.exp(-Math.pow((t - 2.95) / 0.2, 2));          // fingertips graze hers
    const lunge = st(t, 3.25, 3.75) * (1 - st(t, 4.0, 4.3));          // strains after her
    const aim = st(t, 4.0, 4.3) * (1 - st(t, 6.4, 7.2));               // turns the wrist to fire a web
    const withdraw = st(t, 7.8, 10.6);
    const tremble = st(t, 7.0, 7.4) * 0.0028 * Math.sin(t * 37);
    const wr = [
      lerp(0.07, 0.035, reach) - 0.014 * lunge - 0.015 * aim + tremble,
      lerp(0.31, 0.178, reach) - 0.007 * brush - 0.055 * lunge - 0.035 * aim + 0.1 * withdraw,
      lerp(-0.02, 0.0, reach) - 0.04 * aim,
    ];
    const fd = nrm([lerp(-0.25, -0.18, reach) - 0.05 * aim, -1, 0.08 - 0.75 * aim]);
    const palm = nrm(add(mul([-0.15, -0.35, 0.92], 1 - aim), mul([0.05, -1, 0.25], aim)));
    return { wr, fd, palm, lunge, aim };
  }
  function herWrist(t) {
    const rise = st(t, 0, 2.6);
    const brush = Math.exp(-Math.pow((t - 2.95) / 0.2, 2));
    const u = Math.max(0, t - 3.15);
    const fall = [-0.12 * u * u - 0.03 * u, -0.34 * u * u - 0.05 * u, -1.25 * u * u];
    return add([lerp(-0.05, -0.025, rise), lerp(-0.34, -0.158, rise) + 0.007 * brush, lerp(0.03, 0.02, rise)], fall);
  }
  const T_SHOOT = 4.3, T_RELEASE = 6.3;
  const webStart = (t) => { const h = hisHand(t); return add(add(h.wr, mul(h.palm, 0.022)), mul(h.fd, 0.03)); };

  function solve(t) {
    // --- his arm: from above (screen top-right) ---
    const H = hisHand(t);
    const wrS = H.wr;
    const tipS = add(wrS, mul(H.fd, 0.15));
    const elS = add(wrS, mul(nrm([0.32, 1, -0.22 + 0.4 * H.aim]), 0.265));
    const shS = add(elS, mul(nrm([0.55, 1, -0.45 + 0.3 * H.aim]), 0.3));
    const thwip = st(t, 4.05, 4.25) * (1 - st(t, 6.2, 6.6));
    const clench = st(t, 6.9, 7.5);
    const open = [0.12, 0.1, 0.12, 0.16].map((c) => lerp(c, 0.03, H.lunge));
    const thw = [0.05, 1.0, 1.0, 0.05];
    const curlS = open.map((c, i) => lerp(lerp(c, thw[i], thwip), 1.0, clench));

    // --- her arm: from below (screen bottom-left) reaching up; slips at 3.15 and falls away ---
    const wrF = herWrist(t);
    const tumble = 0.5 * st(t, 3.3, 7);
    const fdF = nrm(rot(nrm([0.2, 1, -0.05]), [0, 0, 1], tumble * 0.6));
    const tipF = add(wrF, mul(fdF, 0.14));
    const elF = add(wrF, mul(nrm(rot([-0.3, -1, 0.18], [0, 0, 1], tumble * 0.6)), 0.25));
    const shF = add(elF, mul(nrm(rot([-0.45, -1, 0.35], [0, 0, 1], tumble * 0.6)), 0.29));
    const desperate = st(t, 3.2, 3.6);
    const limp = st(t, 5.0, 6.5);
    const curlF = [0.15, 0.12, 0.14, 0.18].map((c, i) => lerp(lerp(c, 0.45 + 0.05 * i, desperate), 0.35, limp));

    [shS, elS, wrS, tipS, shF, elF, wrF, tipF].forEach((v, i) => J[i].set(v[0], v[1], v[2]));
    const bend = (a, m, c) => { const d = nrm(sub(c, a)); const v = sub(m, a); const pp = sub(v, mul(d, dot(v, d))); return nrm(pp); };
    uniforms.uBk.value[0].set(...bend(shS, elS, wrS));
    uniforms.uBk.value[1].set(...bend(shF, elF, wrF));
    uniforms.uPalm.value[0].set(...H.palm);
    uniforms.uPalm.value[1].set(...nrm([0.15, 0.3, 0.94]));
    uniforms.uCurl.value[0].set(...curlS);
    uniforms.uCurl.value[1].set(...curlF);
    uniforms.uSplay.value[0] = lerp(lerp(lerp(1.0, 1.25, H.lunge), 0.5, thwip), 0.2, clench);
    uniforms.uSplay.value[1] = lerp(lerp(0.9, 0.55, desperate), 0.7, limp);

    // --- second try: a web line fired after her, it falls short, he lets it go ---
    let web = 0;
    if (t > T_SHOOT) {
      const a0 = webStart(Math.min(t, T_RELEASE));
      const aim = webStart(T_SHOOT);
      const goal = herWrist(T_SHOOT + 0.6);
      const D = nrm(sub(goal, aim));
      const maxL = 0.42 * len(sub(goal, aim));
      const g = 1 - Math.pow(1 - clamp((t - T_SHOOT) / 0.45), 3);
      let A = a0, B = add(aim, mul(D, maxL * g));
      if (t > T_RELEASE) { // let go: the strand drifts down after her
        const r = t - T_RELEASE;
        const off = [0.02 * r, -0.2 * r * r, -0.55 * r * r];
        A = add(A, off); B = add(B, off);
      }
      uniforms.uWebA.value.set(...A);
      uniforms.uWebB.value.set(...B);
      uniforms.uWebSag.value = 0.18 * st(t, 4.75, 6.3);
      uniforms.uWebWig.value = 0.025 * st(t, 4.6, 5.4);
      web = clamp((t - T_SHOOT) / 0.06) * (1 - st(t, 7.6, 8.6));
    }
    uniforms.uWeb.value = web;
  }

  function render(t) {
    solve(t);
    // camera: slow push-in on the gap, a jolt at the miss, then tilts down after the falling hand
    const push = st(t, 0, 2.6);
    const follow = st(t, 3.4, 6.0);
    const fitK = Math.max(1, 0.5 / aspect); // portrait: back off so both hands fit the width
    const target = [lerp(0.0, -0.04, follow), lerp(0.02, -0.15, follow), lerp(0, -0.35, follow)];
    let eye = [0.02, 0.1 + 0.06 * follow, lerp(0.98, 0.82, push) * fitK + 0.2 * follow];
    const jolt = 0.006 * Math.exp(-5 * Math.max(0, t - 3.2)) * (t > 3.2 ? 1 : 0)
      + 0.004 * Math.exp(-6 * Math.max(0, t - T_SHOOT)) * (t > T_SHOOT ? 1 : 0);
    eye = add(eye, [Math.sin(t * 53) * jolt, Math.cos(t * 41) * jolt, 0]);
    const f = nrm(sub(target, eye));
    const r = nrm(cross(f, [0, 1, 0]));
    const up = cross(r, f);
    uniforms.uCamPos.value.set(...eye);
    uniforms.uCamFwd.value.set(...f);
    uniforms.uCamRight.value.set(...r);
    uniforms.uCamUp.value.set(...up);
    uniforms.uAspect.value = aspect;
    uniforms.uTime.value = t;
  }

  return {
    name: 'reach',
    duration: DUR,
    fadeIn: true,
    fadeOut: true,
    scene,
    camera,
    update(t) {
      lastT = t;
      render(t);
    },
    resize(a) {
      aspect = a;
      render(lastT);
    },
    labels() {
      return lastT >= 0.8 ? [{ id: 'reach', text: 'TRYING', x: 0.06, y: 0.9 }] : [];
    },
  };
}
