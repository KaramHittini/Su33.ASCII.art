// Swing scene (v3): ray-marched SDF Spider-Man, sculpted + lit like a comic render.
// Pure function of t. World units = metres, y up, he faces +z, his left = +x (screen right).
// Timeline: 0-3 pull out of his lens to a bust, 3-4.5 looks right, 4.5-6.5 pull back to the
// waist, 6.5-8.5 spider-sense, 8.5-10.3 perches on the ledge (low angle), 10.3-11.6 leaps at
// the camera reaching out, then the empty ledge (spider swarm covers the cut).
import * as THREE from 'three';

const DUR = 14;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const sm = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const st = (t, a, b) => sm((t - a) / (b - a));

// ---- tiny vec3 helpers (arrays) ----
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

// rotation as 3 column vectors [right, up, fwd]
function rotTorso(pitch, roll, yaw) {
  const m = (v) => {
    // Rz(roll) then Rx(pitch) then Ry(yaw)
    let [x, y, z] = v;
    [x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)];
    [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
    [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    return [x, y, z];
  };
  return { r: m([1, 0, 0]), u: m([0, 1, 0]), f: m([0, 0, 1]), m };
}
function rotHead(yaw, pitchUp, roll) {
  return rotTorso(-pitchUp, roll, yaw);
}
const apply = (R, v) => add(add(mul(R.r, v[0]), mul(R.u, v[1])), mul(R.f, v[2]));

function ik(a, c, l1, l2, pole) {
  let d = sub(c, a);
  let dl = clamp(len(d), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const dir = nrm(d);
  const x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let p = sub(pole, mul(dir, dot(pole, dir)));
  p = nrm(p);
  const mid = add(add(a, mul(dir, x)), mul(p, h));
  return [mid, add(a, mul(dir, dl))];
}

// ---- poses (targets, feet on the ledge top y=0; ledge front edge z=0.32) ----
const POSES = {
  stand: {
    pelvis: [0, 0.98, 0], pitch: 0.03, roll: 0,
    wrL: [0.27, 0.87, 0.03], hdL: [0.05, -1, 0.15], poleArmL: [0.3, 0, -1],
    wrR: [-0.27, 0.87, 0.03], hdR: [-0.05, -1, 0.15], poleArmR: [-0.3, 0, -1],
    anL: [0.12, 0.085, -0.02], toL: [0.15, 0.02, 0.17], poleLegL: [0.1, 0, 1],
    anR: [-0.12, 0.085, -0.02], toR: [-0.15, 0.02, 0.17], poleLegR: [-0.1, 0, 1],
  },
  crouch: {
    pelvis: [0, 0.4, -0.2], pitch: 0.78, roll: 0.03,
    wrL: [0.3, 0.46, 0.4], hdL: [0.0, -0.85, 0.5], poleArmL: [1, 0.2, -0.2],
    wrR: [-0.09, 0.15, 0.26], hdR: [0.0, -0.75, 0.66], poleArmR: [-1, 0, 0.1],
    anL: [0.18, 0.09, 0.08], toL: [0.22, 0.02, 0.28], poleLegL: [0.45, 0.6, 1],
    anR: [-0.17, 0.09, 0.06], toR: [-0.21, 0.02, 0.26], poleLegR: [-0.45, 0.6, 1],
  },
  leap: { // dive: body stretched forward, arms reaching, legs trailing
    pelvis: [0, 0.62, 0.1], pitch: 1.3, roll: -0.1,
    wrL: [0.2, 0.86, 0.78], hdL: [0, 0.1, 1], poleArmL: [1, -0.3, 0],
    wrR: [-0.14, 1.0, 0.82], hdR: [0, 0.2, 1], poleArmR: [-1, -0.3, 0],
    anL: [0.12, 0.5, -0.76], toL: [0.13, 0.48, -0.93], poleLegL: [0, -1, 0.2],
    anR: [-0.13, 0.36, -0.55], toR: [-0.14, 0.26, -0.68], poleLegR: [0, -1, 0.5],
  },
};
function blendPose(a, b, u) {
  const o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? mix3(a[k], b[k], u) : lerp(a[k], b[k], u);
  return o;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uAspect, uTanHalf, uResY, uTime, uSense, uSenseR;
uniform vec2 uSensePos;
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
uniform vec3 uJ[20];
uniform mat3 uTorso, uHead;
uniform float uBody; // 0 hides the character
uniform vec3 uKey;

#define TAU 6.28318530718

float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
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

float headSdf(vec3 hq) {
  vec3 ha = vec3(abs(hq.x), hq.yz);
  float h = sdEll(hq - vec3(0.0, 0.025, -0.012), vec3(0.087, 0.106, 0.104));
  h = smin(h, sdEll(hq - vec3(0.0, -0.045, 0.03), vec3(0.064, 0.072, 0.074)), 0.04);
  h = smin(h, sdEll(hq - vec3(0.0, -0.102, 0.05), vec3(0.033, 0.027, 0.03)), 0.03);
  h = smin(h, sdEll(hq - vec3(0.0, -0.024, 0.093), vec3(0.01, 0.022, 0.013)), 0.014);
  h = smin(h, sdEll(hq - vec3(0.0, 0.035, 0.078), vec3(0.066, 0.02, 0.022)), 0.025);
  return h;
}

float torsoSdf(vec3 q) {
  vec3 qa = vec3(abs(q.x), q.yz);
  float t = sdEll(q - vec3(0.0, 0.33, 0.0), vec3(0.158, 0.19, 0.112));
  t = smin(t, sdEll(qa - vec3(0.078, 0.365, 0.068), vec3(0.088, 0.066, 0.05)), 0.03);
  t = smin(t, sdEll(q - vec3(0.0, 0.15, 0.012), vec3(0.122, 0.16, 0.094)), 0.06);
  t = smin(t, sdEll(qa - vec3(0.032, 0.17, 0.08), vec3(0.04, 0.09, 0.028)), 0.03);
  t = smin(t, sdEll(q - vec3(0.0, 0.0, -0.005), vec3(0.148, 0.11, 0.1)), 0.05);
  t = smin(t, sdEll(qa - vec3(0.07, -0.045, -0.06), vec3(0.08, 0.09, 0.07)), 0.03);
  t = smin(t, sdEll(qa - vec3(0.115, 0.27, -0.025), vec3(0.07, 0.15, 0.09)), 0.04);
  t = smin(t, sdRC(qa, vec3(0.0, 0.48, -0.035), vec3(0.165, 0.445, -0.03), 0.056, 0.046), 0.045);
  return t;
}

vec2 mapChar(vec3 p) {
  vec2 c = vec2(1e5, 0.0);
  vec3 q = (p - uJ[0]) * uTorso;
  c = vec2(torsoSdf(q), 3.0);
  // neck
  vec3 hb = uJ[3] + uHead * vec3(0.0, -0.075, -0.018);
  U(c, sdRC(p, uJ[2], hb, 0.06, 0.05), 2.0, 0.035);
  // head
  if (length(p - uJ[3]) < 0.32) U(c, headSdf((p - uJ[3]) * uHead), 1.0, 0.025);
  else U(c, length(p - uJ[3]) - 0.13, 1.0, 0.025);
  // arms: deltoid, upper arm + bicep, forearm, hand
  for (int s = 0; s < 2; s++) {
    vec3 sh = s == 0 ? uJ[4] : uJ[8];
    vec3 el = s == 0 ? uJ[5] : uJ[9];
    vec3 wr = s == 0 ? uJ[6] : uJ[10];
    vec3 tp = s == 0 ? uJ[7] : uJ[11];
    float o = float(s) * 3.0;
    vec3 mid = (sh + tp) * 0.5;
    if (length(p - mid) - length(tp - sh) * 0.5 - 0.15 > c.x) continue;
    float d = length(p - sh) - 0.066;
    d = smin(d, sdRC(p, sh, el, 0.053, 0.04), 0.03);
    d = smin(d, length(p - mix(sh, el, 0.42)) - 0.05, 0.04);
    U(c, d, 4.0 + o, 0.045);
    float f = sdRC(p, el, wr, 0.043, 0.028);
    f = smin(f, length(p - mix(el, wr, 0.25)) - 0.045, 0.04);
    U(c, f, 5.0 + o, 0.025);
    U(c, sdRC(p, wr, tp, 0.034, 0.026), 6.0 + o, 0.02);
  }
  // legs: thigh + quad, shin + calf, foot
  for (int s = 0; s < 2; s++) {
    vec3 hp = s == 0 ? uJ[12] : uJ[16];
    vec3 kn = s == 0 ? uJ[13] : uJ[17];
    vec3 an = s == 0 ? uJ[14] : uJ[18];
    vec3 to = s == 0 ? uJ[15] : uJ[19];
    float o = float(s) * 3.0;
    vec3 mid = (hp + an) * 0.5;
    if (length(p - mid) - length(an - hp) * 0.5 - 0.3 > c.x) continue;
    float d = sdRC(p, hp, kn, 0.088, 0.056);
    d = smin(d, length(p - mix(hp, kn, 0.38)) - 0.085, 0.05);
    U(c, d, 10.0 + o, 0.05);
    float sh = sdRC(p, kn, an, 0.054, 0.034);
    sh = smin(sh, length(p - mix(kn, an, 0.3)) - 0.056, 0.05);
    U(c, sh, 11.0 + o, 0.025);
    float ft = sdRC(p, an, to, 0.043, 0.03);
    ft = smin(ft, length(p - an + vec3(0.0, 0.025, 0.0)) - 0.042, 0.03);
    U(c, ft, 12.0 + o, 0.025);
  }
  return c;
}

vec2 map(vec3 p) {
  // rooftop ledge: top y=0, front face z=0.32, slight bevel
  vec2 r = vec2(sdBox(p - vec3(0.0, -2.0, -1.34), vec3(1.25, 1.99, 1.65)) - 0.01, 20.0);
  if (uBody < 0.5) return r;
  float bound = length(p - uJ[0]) - 1.35;
  if (bound > 0.25) return vec2(min(r.x, bound), r.y);
  vec2 c = mapChar(p);
  return c.x < r.x ? c : r;
}

vec3 calcNormal(vec3 p, float e) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x +
                   k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}

float calcAO(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 4; i++) {
    float h = 0.006 + 0.03 * float(i * i) * 0.25;
    o += (h - map(p + n * h).x) * s;
    s *= 0.72;
  }
  return clamp(1.0 - 2.6 * o, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 20; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.015, 0.2);
    if (res < 0.02 || t > 1.6) break;
  }
  return clamp(res, 0.0, 1.0);
}

// distance (world) to web lines: radial spokes + sagging rings in polar coords (th, ph) at radius R
float webDist(float th, float ph, float R, float N, float D) {
  float s = ph / TAU * N;
  float fs = fract(s);
  float dsp = min(fs, 1.0 - fs) * TAU / N * max(sin(th), 0.05) * R;
  float sag = 0.5 * D * 4.0 * fs * (1.0 - fs);
  float dr = abs(fract((th + sag) / D + 0.5) - 0.5) * D * R;
  if (th < D * 0.7) dr = 1e3;
  return min(dsp, dr);
}

float lensSd(vec2 p) { // p.x = |x| (mirror), angry slanted teardrop
  vec2 c = vec2(0.045, 0.004);
  float a = 0.5;
  vec2 q = p - c;
  q = vec2(cos(a) * q.x + sin(a) * q.y, -sin(a) * q.x + cos(a) * q.y);
  float e = (length(q / vec2(0.046, 0.029)) - 1.0) * 0.029;
  vec2 A = vec2(0.006, -0.014), B = vec2(0.088, 0.034);
  vec2 dr = normalize(B - A);
  float line = dr.x * (p.y - A.y) - dr.y * (p.x - A.x);
  return max(e, line);
}

float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float emblem(vec2 e) { // chest spider, e in metres
  e.x = abs(e.x);
  float d = length(e / vec2(0.013, 0.024) - vec2(0.0, -0.2)) - 1.0;
  d = min(d * 0.013, length(e - vec2(0.0, 0.026)) - 0.009);
  float w = 0.0042;
  d = min(d, min(segD(e, vec2(0.006, 0.012), vec2(0.04, 0.036)), segD(e, vec2(0.04, 0.036), vec2(0.05, 0.076))) - w);
  d = min(d, min(segD(e, vec2(0.008, 0.004), vec2(0.05, 0.022)), segD(e, vec2(0.05, 0.022), vec2(0.07, 0.05))) - w);
  d = min(d, min(segD(e, vec2(0.008, -0.008), vec2(0.05, -0.022)), segD(e, vec2(0.05, -0.022), vec2(0.07, -0.052))) - w);
  d = min(d, min(segD(e, vec2(0.006, -0.018), vec2(0.04, -0.042)), segD(e, vec2(0.04, -0.042), vec2(0.05, -0.084))) - w);
  return d;
}

const float RED = 0.5, BLUE = 0.13, LINE = 0.03;

// returns albedo in x, kind in y (0 suit, 1 lens, 2 ledge)
vec2 material(vec3 p, float id, float pixW) {
  float base = RED, wd = 1e3, wsp = 0.03;
  if (id > 19.5) {
    float n = fract(sin(dot(floor(p * 30.0), vec3(12.9, 78.2, 37.7))) * 43758.5);
    float a = (0.17 + 0.04 * n) * (0.5 + 0.5 * smoothstep(-1.6, -0.1, p.y));
    if (p.y > -0.03 && p.z > 0.25) a = 0.34; // worn top edge
    return vec2(a, 2.0);
  }
  if (id < 2.5) { // head + neck: mask web around the face, lenses
    vec3 hq = (p - uJ[3]) * uHead;
    if (id < 1.5 && hq.z > 0.0) {
      float ls = lensSd(vec2(abs(hq.x), hq.y));
      if (ls < 0.0) {
        float s = 0.0024;
        vec2 m = vec2(abs(hq.x), hq.y);
        float g = min(abs(fract((m.x + m.y) / s) - 0.5), abs(fract((m.x - m.y) / s) - 0.5));
        float mesh = smoothstep(0.12, 0.0, g) * smoothstep(s * 0.45, s * 0.15, pixW);
        return vec2(mix(0.97, 0.62, mesh) * (0.9 + 0.1 * smoothstep(-0.02, 0.0, ls)), 1.0);
      }
      if (ls < 0.0095) return vec2(0.01, 0.0);
    }
    vec3 o = vec3(0.0, -0.006, 0.0);
    vec3 a = normalize(vec3(0.0, -0.08, 1.0));
    vec3 ax = vec3(1.0, 0.0, 0.0);
    vec3 ay = normalize(cross(a, ax));
    vec3 v = hq - o; float R = length(v); vec3 vn = v / R;
    float th = acos(clamp(dot(vn, a), -1.0, 1.0));
    float ph = atan(dot(vn, ay), dot(vn, ax));
    wsp = 0.19 * R;
    wd = webDist(th, ph, R, 22.0, 0.19);
  } else if (id < 3.5) { // torso
    vec3 q = (p - uJ[0]) * uTorso;
    float sz = q.z >= 0.0 ? 1.0 : -1.0;
    if (abs(q.x) > 0.105 + 0.02 * sin(q.y * 9.0) && q.y < 0.4 && q.y > -0.02) base = BLUE;
    if (q.y < 0.03) base = BLUE;
    if (sz > 0.0 && q.y > 0.22 && emblem(vec2(q.x, q.y - 0.355)) < 0.0) return vec2(0.02, 0.0);
    if (base > 0.3) {
      vec3 o = vec3(0.0, 0.32, 0.0);
      vec3 a = normalize(vec3(0.0, 0.05, sz));
      vec3 ax = vec3(1.0, 0.0, 0.0);
      vec3 ay = normalize(cross(a, ax));
      vec3 v = q - o; float R = length(v); vec3 vn = v / R;
      float th = acos(clamp(dot(vn, a), -1.0, 1.0));
      float ph = atan(dot(vn, ay), dot(vn, ax));
      wsp = 0.15 * R;
      wd = webDist(th, ph, R, 26.0, 0.15);
    }
  } else { // limbs
    int k = int(id + 0.5);
    vec3 A, B; float hl = 0.0;
    if (k == 4) { A = uJ[4]; B = uJ[5]; } else if (k == 5) { A = uJ[5]; B = uJ[6]; } else if (k == 6) { A = uJ[6]; B = uJ[7]; }
    else if (k == 7) { A = uJ[8]; B = uJ[9]; } else if (k == 8) { A = uJ[9]; B = uJ[10]; } else if (k == 9) { A = uJ[10]; B = uJ[11]; }
    else if (k == 10) { A = uJ[12]; B = uJ[13]; } else if (k == 11) { A = uJ[13]; B = uJ[14]; } else if (k == 12) { A = uJ[14]; B = uJ[15]; }
    else if (k == 13) { A = uJ[16]; B = uJ[17]; } else if (k == 14) { A = uJ[17]; B = uJ[18]; } else { A = uJ[18]; B = uJ[19]; }
    vec3 ba = B - A; float L = length(ba); vec3 dir = ba / L;
    float h = dot(p - A, dir);
    vec3 rv = p - (A + dir * h); float rr = length(rv);
    vec3 ref = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 ref2 = cross(dir, ref);
    float ang = atan(dot(rv, ref2), dot(rv, ref));
    float N = 7.0;
    float fs = fract(ang / TAU * N);
    float dsp = min(fs, 1.0 - fs) * TAU / N * rr;
    float D = 0.06;
    float sag = 0.35 * D * 4.0 * fs * (1.0 - fs);
    float dr = abs(fract((h + sag) / D + 0.5) - 0.5) * D;
    wd = min(dsp, dr); wsp = D;
    if (k == 10 || k == 13) base = BLUE;
    if ((k == 11 || k == 14) && h / L < 0.45) base = BLUE;
    if (k == 4 || k == 7) {
      vec3 toT = normalize(uJ[0] + uTorso * vec3(0.0, 0.3, 0.0) - A);
      if (dot(normalize(rv), toT) > 0.25 && h > 0.04) base = BLUE;
    }
    if (base < 0.3) wd = 1e3;
  }
  float w = max(0.0016, pixW * 0.55);
  float line = smoothstep(w, w * 0.4, wd);
  float lod = smoothstep(wsp * 0.55, wsp * 0.2, pixW); // fade web where it can't be resolved
  float a = mix(base, base * 0.82, 1.0 - lod);
  a = mix(a, LINE, line * lod);
  return vec2(a, 0.0);
}

float tri(float x) { return abs(fract(x) - 0.5) * 4.0 - 1.0; }

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uCamRight * ndc.x * uTanHalf * uAspect + uCamUp * ndc.y * uTanHalf);
  vec3 ro = uCamPos;
  float t = 0.0, id = -1.0;
  for (int i = 0; i < 140; i++) {
    vec3 p = ro + rd * t;
    vec2 h = map(p);
    if (h.x < max(0.00015, t * 0.0012)) { id = h.y; break; }
    t += h.x * 0.92;
    if (t > 25.0) break;
  }
  float col = 0.0;
  if (id > 0.0) {
    vec3 p = ro + rd * t;
    float pixW = t * 2.0 * uTanHalf / uResY;
    vec3 n = calcNormal(p, max(0.0004, pixW * 0.5));
    vec2 m = material(p, id, pixW);
    vec3 L1 = uKey;
    vec3 L2 = normalize(vec3(0.7, 0.05, 0.45));
    float dif = max(dot(n, L1), 0.0);
    float sh = dif > 0.0 ? softShadow(p + n * 0.004, L1) : 0.0;
    float ao = calcAO(p, n);
    float fill = max(dot(n, L2), 0.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    vec3 hv = normalize(L1 - rd);
    float spec = pow(max(dot(n, hv), 0.0), 36.0) * sh;
    if (m.y > 1.5) { // ledge
      col = m.x * (0.12 * ao + 0.85 * dif * sh + 0.2 * fill);
    } else if (m.y > 0.5) { // lens glows
      col = m.x * (0.88 + 0.12 * dif) + 0.2 * spec;
    } else {
      col = m.x * (0.16 * ao + 1.0 * dif * (0.25 + 0.75 * sh) + 0.3 * fill) + 0.42 * spec * step(0.1, m.x) + 0.38 * rim * ao;
    }
  }
  // spider-sense: zig-zag lines radiating around the head (screen space)
  if (uSense > 0.001) {
    vec2 pp = vec2(ndc.x * uAspect, ndc.y);
    vec2 c = vec2(uSensePos.x * uAspect, uSensePos.y);
    vec2 d = pp - c;
    float R = uSenseR;
    float px = 2.0 / uResY;
    float best = 1e3;
    for (int b = 0; b < 6; b++) {
      float side = b < 3 ? -1.0 : 1.0;
      float ba = side * (0.55 + 0.5 * float(b - (b < 3 ? 0 : 3)));
      for (int l = 0; l < 3; l++) {
        float an = ba + (float(l) - 1.0) * 0.17;
        vec2 dir = vec2(sin(an), cos(an));
        vec2 nr = vec2(-dir.y, dir.x);
        float al = dot(d, dir);
        float r0 = R * (1.25 + 0.12 * float(l)), r1 = R * (2.7 + 0.35 * float(l == 1));
        if (al < r0 || al > r1) continue;
        float u = (al - r0) / (r1 - r0);
        float target = R * 0.09 * tri(u * 4.0 + float(l) * 0.3);
        best = min(best, abs(dot(d, nr) - target));
      }
    }
    float flick = 0.75 + 0.25 * sin(uTime * 40.0);
    col = max(col, smoothstep(px * 2.2, px * 0.6, best) * uSense * flick);
  }
  gl_FragColor = vec4(vec3(col), 1.0);
}
`;

export function createSwingScene(ctx) {
  let aspect = ctx.aspect || 16 / 9;
  const FOV = 30;
  const tanHalf = Math.tan((FOV * Math.PI) / 360);
  const J = Array.from({ length: 20 }, () => new THREE.Vector3());
  const uniforms = {
    uAspect: { value: aspect },
    uTanHalf: { value: tanHalf },
    uResY: { value: 190 },
    uTime: { value: 0 },
    uSense: { value: 0 },
    uSenseR: { value: 0.3 },
    uSensePos: { value: new THREE.Vector2() },
    uCamPos: { value: new THREE.Vector3() },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uJ: { value: J },
    uTorso: { value: new THREE.Matrix3() },
    uHead: { value: new THREE.Matrix3() },
    uBody: { value: 1 },
    uKey: { value: new THREE.Vector3() },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let lastT = 0;

  const setMat = (M, R) => M.set(R.r[0], R.u[0], R.f[0], R.r[1], R.u[1], R.f[1], R.r[2], R.u[2], R.f[2]);

  function poseAt(t) {
    let pose;
    if (t < 8.5) pose = POSES.stand;
    else if (t < 10.25) pose = blendPose(POSES.stand, POSES.crouch, st(t, 8.5, 9.25));
    else pose = blendPose(POSES.crouch, POSES.leap, st(t, 10.25, 10.55));
    // coil before the leap
    const coil = st(t, 9.8, 10.2) * (1 - st(t, 10.25, 10.4));
    pose = { ...pose, pelvis: add(pose.pelvis, [0, -0.06 * coil, -0.03 * coil]) };
    // breathing
    const br = Math.sin(t * 2.1) * 0.004;
    pose.pelvis = add(pose.pelvis, [0, br, 0]);
    return pose;
  }

  function headAngles(t) {
    let yaw = 0.9 * st(t, 3.0, 4.3);
    yaw *= 1 - st(t, 6.5, 6.75); // snaps back on spider-sense
    let pitch = -0.04 + 0.08 * st(t, 6.5, 6.75) * (1 - st(t, 8.4, 9.0));
    if (t > 8.5) pitch = lerp(pitch, -0.42, st(t, 8.6, 9.3)); // glares down at the low camera
    if (t > 10.25) pitch = lerp(-0.42, 0.05, st(t, 10.25, 10.6));
    yaw += 0.015 * Math.sin(t * 1.3);
    return { yaw, pitch };
  }

  function solve(t) {
    const pose = poseAt(t);
    // leap: launch at the camera and pass just above it
    let off = [0, 0, 0];
    if (t > 10.25) {
      // spring forward off the ledge, rise a little, then drop past the edge
      const u = Math.max(0, (t - 10.3) / 1.2);
      off = [0.05 * u, 0.42 * Math.sin(Math.PI * Math.min(u, 1) * 0.55) - 1.5 * u * u, 2.3 * u];
    }
    const P = add(pose.pelvis, off);
    const R = rotTorso(pose.pitch, pose.roll, 0);
    const neck = add(P, apply(R, [0, 0.49, -0.02]));
    const ha = headAngles(t);
    const H = rotHead(ha.yaw, ha.pitch, 0);
    const headC = add(add(neck, apply(R, [0, 0.05, 0.01])), apply(H, [0, 0.105, 0.0]));
    const shL = add(P, apply(R, [0.185, 0.445, -0.03]));
    const shR = add(P, apply(R, [-0.185, 0.445, -0.03]));
    const hipL = add(P, apply(R, [0.095, -0.05, 0]));
    const hipR = add(P, apply(R, [-0.095, -0.05, 0]));
    const [elL, wrL] = ik(shL, add(pose.wrL, off), 0.3, 0.265, pose.poleArmL);
    const [elR, wrR] = ik(shR, add(pose.wrR, off), 0.3, 0.265, pose.poleArmR);
    const tipL = add(wrL, mul(nrm(pose.hdL), 0.15));
    const tipR = add(wrR, mul(nrm(pose.hdR), 0.15));
    const [knL, anL] = ik(hipL, add(pose.anL, off), 0.45, 0.44, pose.poleLegL);
    const [knR, anR] = ik(hipR, add(pose.anR, off), 0.45, 0.44, pose.poleLegR);
    const toL = add(anL, mul(nrm(sub(pose.toL, pose.anL)), 0.17));
    const toR = add(anR, mul(nrm(sub(pose.toR, pose.anR)), 0.17));
    const js = [P, mix3(P, neck, 0.6), neck, headC, shL, elL, wrL, tipL, shR, elR, wrR, tipR,
      hipL, knL, anL, toL, hipR, knR, anR, toR];
    js.forEach((v, i) => J[i].set(v[0], v[1], v[2]));
    setMat(uniforms.uTorso.value, R);
    setMat(uniforms.uHead.value, H);
    return { headC, H, P };
  }

  // ---- camera shots ----
  const fit = (H, W) => Math.max(H, W / aspect) / tanHalf;
  function shotBust() {
    const target = [0, 1.585, 0.01];
    const dir = nrm([0, -0.03, 1]);
    return { target, eye: add(target, mul(dir, fit(0.25, 0.15))) };
  }
  function shotWaist() {
    const target = [0, 1.32, 0.02];
    const dir = nrm([0.02, -0.05, 1]);
    return { target, eye: add(target, mul(dir, fit(0.56, 0.3))) };
  }
  function shotWide() {
    const target = [0.02, 0.46, 0.06];
    const dir = nrm([1, -0.28, 0.42]);
    return { target, eye: add(target, mul(dir, fit(0.62, 0.62))) };
  }

  function cameraAt(t, head) {
    let eye, target;
    const bust = shotBust();
    if (t < 3.0) {
      // pull out of his (screen-right) lens
      const lens = add(head.headC, apply(head.H, [0.043, 0.008, 0.083]));
      const fwd = head.H.f;
      const u = sm(t / 3.0);
      const d0 = 0.018, d1 = len(sub(bust.eye, bust.target));
      const d = d0 * Math.pow(d1 / d0, u);
      target = mix3(lens, bust.target, sm(clamp((t - 0.6) / 2.4)));
      const dir = nrm(mix3(fwd, nrm(sub(bust.eye, bust.target)), u));
      eye = add(target, mul(dir, d));
    } else if (t < 4.5) {
      ({ eye, target } = bust);
    } else if (t < 8.5) {
      const w = shotWaist();
      const u = st(t, 4.5, 6.5);
      target = mix3(bust.target, w.target, u);
      const d = lerp(len(sub(bust.eye, bust.target)), len(sub(w.eye, w.target)), u);
      eye = add(target, mul(nrm(mix3(sub(bust.eye, bust.target), sub(w.eye, w.target), u)), d));
    } else {
      const w = shotWaist(), wd = shotWide();
      const u = st(t, 8.5, 9.4);
      target = mix3(w.target, wd.target, u);
      eye = mix3(w.eye, wd.eye, u);
      // follow the dive: pull back and pan with him
      const k = st(t, 10.15, 10.9);
      if (k > 0) {
        const dir = sub(wd.eye, wd.target);
        const fol = add(head.P, [0, 0.0, 0.35]);
        const tg = mix3(wd.target, [fol[0], Math.max(fol[1], -0.4), Math.min(fol[2], 1.6)], k * 0.7);
        target = tg;
        eye = add(tg, mul(dir, 1 + 0.75 * k));
      }
      // after the leap drift up a touch toward the empty sky
      target = add(target, [0, 0.25 * st(t, 11.4, 14), 0]);
    }
    // spider-sense jolt
    const shake = 0.012 * Math.exp(-6 * Math.max(0, t - 6.5)) * (t > 6.5 ? 1 : 0);
    eye = add(eye, [Math.sin(t * 61) * shake, Math.cos(t * 47) * shake, 0]);
    return { eye, target };
  }

  function render(t) {
    const head = solve(t);
    const { eye, target } = cameraAt(t, head);
    const f = nrm(sub(target, eye));
    const r = nrm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    uniforms.uCamPos.value.set(...eye);
    uniforms.uCamFwd.value.set(...f);
    uniforms.uCamRight.value.set(...r);
    uniforms.uCamUp.value.set(...u);
    uniforms.uAspect.value = aspect;
    uniforms.uTime.value = t;
    uniforms.uBody.value = t < 12.2 ? 1 : 0;
    const kl = nrm(mix3([-0.55, 0.75, 0.55], [0.85, 0.65, 0.45], st(t, 8.5, 9.4)));
    uniforms.uKey.value.set(...kl);
    // spider-sense placement: project the head
    const v = sub(head.headC, eye);
    const z = dot(v, f);
    uniforms.uSensePos.value.set(dot(v, r) / (z * tanHalf * aspect), dot(v, u) / (z * tanHalf));
    uniforms.uSenseR.value = 0.13 / (z * tanHalf);
    const s = st(t, 6.55, 6.75) * (1 - st(t, 8.2, 8.7));
    uniforms.uSense.value = s * (0.8 + 0.2 * Math.sin(t * 9));
  }

  return {
    name: 'swing',
    duration: DUR,
    fadeIn: true,
    fadeOut: false,
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
      return lastT >= 3 ? [{ id: 'swing', text: 'SPIDER-MAN', x: 0.06, y: 0.9 }] : [];
    },
  };
}
