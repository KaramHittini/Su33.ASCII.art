// Symbiote scene: black-suit ray-marched SDF Spider-Man crouched on the ledge against a big moon.
// Pure function of t. World units = metres, y up, he faces +z. Derived from swing.js.
// 0-2 only the white lenses in close-up, 2-6 pull back, 6-9 orbit, ~9.2 springs up out of frame.
// Debug: ?orbit=<deg> (turntable at ?t=), ?ot=head for a head close-up.
import * as THREE from 'three';

const DUR = 10;
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
  let dl = clamp(len(d), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 0.02);
  const dir = nrm(d);
  const x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let p = sub(pole, mul(dir, dot(pole, dir)));
  p = nrm(p);
  const mid = add(add(a, mul(dir, x)), mul(p, h));
  return [mid, add(a, mul(dir, dl))];
}
// direction the middle joint bulges toward (elbow back / knee front)
function bendDir(a, mid, c, fallback) {
  const d = nrm(sub(c, a));
  const v = sub(mid, a);
  const perp = sub(v, mul(d, dot(v, d)));
  return len(perp) > 1e-4 ? nrm(perp) : fallback;
}

// ---- poses (targets, feet on the ledge top y=0; ledge front edge z=0.32) ----
// hd* = finger direction, palm* = palm normal, curl* = [index, middle, ring, pinky] 0 open .. 1 fist
const POSES = {
  stand: {
    pelvis: [0, 0.98, 0], pitch: 0.03, roll: 0,
    wrL: [0.31, 0.92, 0.07], hdL: [0.06, -1, 0.12], palmL: [-1, 0, 0.15], curlL: [0.55, 0.62, 0.66, 0.7], poleArmL: [0.3, 0, -1],
    wrR: [-0.31, 0.92, 0.07], hdR: [-0.06, -1, 0.12], palmR: [1, 0, 0.15], curlR: [0.55, 0.62, 0.66, 0.7], poleArmR: [-0.3, 0, -1],
    anL: [0.12, 0.09, -0.03], toL: [0.15, 0.06, 0.15], poleLegL: [0.1, 0, 1],
    anR: [-0.12, 0.09, -0.03], toR: [-0.15, 0.06, 0.15], poleLegR: [-0.1, 0, 1],
  },
  crouch: {
    pelvis: [0, 0.4, -0.2], pitch: 0.78, roll: 0.03,
    wrL: [0.3, 0.47, 0.38], hdL: [0.0, -0.9, 0.45], palmL: [-0.3, 0.1, -1], curlL: [0.35, 0.45, 0.5, 0.55], poleArmL: [1, 0.2, -0.2],
    wrR: [-0.1, 0.13, 0.27], hdR: [0.05, -0.55, 1], palmR: [0, -1, -0.55], curlR: [0.18, 0.15, 0.2, 0.25], poleArmR: [-1, 0, 0.1],
    anL: [0.18, 0.09, 0.08], toL: [0.22, 0.03, 0.27], poleLegL: [0.45, 0.6, 1],
    anR: [-0.17, 0.09, 0.06], toR: [-0.21, 0.03, 0.25], poleLegR: [-0.45, 0.6, 1],
  },
  leap: { // dive: body stretched forward, arms reaching, web-shooter hands, legs trailing
    pelvis: [0, 0.62, 0.1], pitch: 1.3, roll: -0.1,
    wrL: [0.42, 0.92, 0.7], hdL: [0.35, 0.15, 1], palmL: [0.2, -1, 0.1], curlL: [0.0, 1.0, 1.0, 0.0], poleArmL: [1, -0.3, 0],
    wrR: [-0.36, 1.02, 0.74], hdR: [-0.35, 0.2, 1], palmR: [-0.2, -1, 0.2], curlR: [0.0, 1.0, 1.0, 0.0], poleArmR: [-1, -0.3, 0],
    anL: [0.12, 0.5, -0.76], toL: [0.13, 0.48, -0.93], poleLegL: [0, -1, 0.2],
    anR: [-0.13, 0.36, -0.55], toR: [-0.14, 0.26, -0.68], poleLegR: [0, -1, 0.5],
  },
};
function blendPose(a, b, u) {
  const o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? a[k].map((v, i) => lerp(v, b[k][i], u)) : lerp(a[k], b[k], u);
  return o;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uAspect, uTanHalf, uResY, uTime, uLit, uGlow, uMoonI, uMoonR;
uniform vec3 uTend[48];
uniform vec4 uTendB[6];
uniform vec2 uMoonPos;
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
uniform vec3 uJ[20];
uniform vec3 uArmB[2];  // elbow bulge direction (back of the arm)
uniform vec3 uLegF[2];  // knee bulge direction (front of the leg)
uniform vec3 uPalm[2];  // palm normals
uniform vec4 uCurl[2];  // finger curl (index, middle, ring, pinky)
uniform mat3 uTorso, uHead;
uniform float uBody; // 0 hides the character
uniform vec3 uKey;

#define TAU 6.28318530718

float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
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

// ---- head (head-local: origin skull centre, z forward, x his left) ----
float headSdf(vec3 hq) {
  vec3 ha = vec3(abs(hq.x), hq.yz);
  float h = sdEll(hq - vec3(0.0, 0.022, -0.016), vec3(0.08, 0.09, 0.098));          // cranium
  h = smin(h, sdEll(hq - vec3(0.0, -0.034, 0.03), vec3(0.068, 0.08, 0.072)), 0.04); // face mass
  h = smin(h, sdRC(ha, vec3(0.06, -0.032, -0.022), vec3(0.025, -0.1, 0.066), 0.022, 0.018), 0.03); // jaw
  h = smin(h, sdEll(hq - vec3(0.0, -0.102, 0.072), vec3(0.027, 0.02, 0.021)), 0.022); // chin
  h = smin(h, sdEll(ha - vec3(0.046, -0.02, 0.06), vec3(0.026, 0.018, 0.02)), 0.025); // cheekbones
  h = smin(h, sdEll(hq - vec3(0.0, 0.03, 0.066), vec3(0.064, 0.017, 0.022)), 0.03);   // brow
  h = smin(h, sdRC(hq, vec3(0.0, 0.008, 0.09), vec3(0.0, -0.034, 0.104), 0.008, 0.011), 0.018); // nose
  h = smin(h, sdEll(ha - vec3(0.077, -0.004, -0.008), vec3(0.012, 0.027, 0.018)), 0.014); // ears under the mask
  h = smax(h, -sdEll(hq - vec3(0.0, -0.068, 0.103), vec3(0.03, 0.006, 0.012)), 0.01); // mouth crease
  return h;
}

// ---- torso (pelvis-local: y up, z forward) ----
float torsoSdf(vec3 q) {
  vec3 qa = vec3(abs(q.x), q.yz);
  float t = sdEll(q - vec3(0.0, 0.32, -0.012), vec3(0.158, 0.17, 0.112));                // ribcage
  t = smin(t, sdEll(qa - vec3(0.07, 0.365, 0.06), vec3(0.085, 0.062, 0.054)), 0.022);   // pecs
  t = smin(t, sdRC(qa, vec3(0.136, 0.375, -0.03), vec3(0.086, 0.15, -0.02), 0.064, 0.038), 0.04); // lats
  t = smin(t, sdEll(q - vec3(0.0, 0.395, -0.05), vec3(0.15, 0.115, 0.08)), 0.04);          // upper back
  t = smin(t, sdRC(qa, vec3(0.025, 0.525, -0.04), vec3(0.18, 0.47, -0.035), 0.05, 0.036), 0.05); // traps
  t = smin(t, sdEll(q - vec3(0.0, 0.15, 0.002), vec3(0.116, 0.14, 0.088)), 0.05);        // abdomen
  for (int i = 0; i < 3; i++) {                                                          // abs
    float fi = float(i);
    t = smin(t, sdEll(qa - vec3(0.027, 0.243 - fi * 0.058, 0.074 - fi * 0.004), vec3(0.024, 0.024, 0.016)), 0.012);
  }
  t = smin(t, sdEll(qa - vec3(0.098, 0.08, 0.0), vec3(0.044, 0.075, 0.068)), 0.03);    // obliques
  t = smin(t, sdEll(q - vec3(0.0, -0.005, -0.01), vec3(0.12, 0.1, 0.09)), 0.05);       // pelvis
  t = smin(t, sdEll(qa - vec3(0.055, -0.035, -0.05), vec3(0.062, 0.072, 0.056)), 0.03); // glutes
  return t;
}

// ---- hand (x toward the thumb, y along the fingers, z out of the palm) ----
float handSdf(vec3 p, vec3 wr, vec3 tp, vec3 pn, vec4 cu, float side) {
  vec3 hy = normalize(tp - wr);
  vec3 hz = normalize(pn - hy * dot(pn, hy));
  vec3 hx = cross(hy, hz);
  vec3 d = p - wr;
  vec3 l = vec3(dot(d, hx) * side, dot(d, hy), dot(d, hz));
  float h = sdRBox(l - vec3(0.0, 0.047, -0.003), vec3(0.036, 0.046, 0.015), 0.012); // palm
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = 0.026 - fi * 0.0175;
    float L = i == 0 ? 0.074 : (i == 1 ? 0.082 : (i == 2 ? 0.077 : 0.062));
    float c = i == 0 ? cu.x : (i == 1 ? cu.y : (i == 2 ? cu.z : cu.w));
    vec3 b = vec3(x, 0.088 - (i == 3 ? 0.008 : 0.0), -0.003);
    float a1 = c * 1.5, a2 = c * 3.0;
    vec3 j1 = b + vec3(0.0, cos(a1), sin(a1)) * L * 0.52;
    vec3 j2 = j1 + vec3(0.0, cos(a2), sin(a2)) * L * 0.48;
    float fr = 0.0102 - fi * 0.0008;
    h = smin(h, min(sdCap(l, b, j1, fr), sdCap(l, j1, j2, fr * 0.88)), 0.007);
  }
  vec3 t0 = vec3(0.028, 0.018, 0.004), t1 = vec3(0.056, 0.05, 0.02), t2 = vec3(0.064, 0.085, 0.03);
  h = smin(h, min(sdCap(l, t0, t1, 0.013), sdCap(l, t1, t2, 0.0105)), 0.012);         // thumb
  return h;
}

// ---- boot (z along the foot, y up the shin) ----
float footSdf(vec3 p, vec3 kn, vec3 an, vec3 to) {
  vec3 fz = normalize(to - an);
  vec3 u0 = normalize(kn - an);
  vec3 fy = normalize(u0 - fz * dot(u0, fz));
  vec3 fx = cross(fy, fz);
  vec3 d = p - an;
  vec3 l = vec3(dot(d, fx), dot(d, fy), dot(d, fz));
  float f = sdRBox(l - vec3(0.0, -0.045, 0.06), vec3(0.04, 0.034, 0.105), 0.026);
  f = smin(f, sdEll(l - vec3(0.0, -0.035, -0.02), vec3(0.036, 0.05, 0.046)), 0.025);  // heel
  f = smin(f, sdEll(l - vec3(0.0, 0.0, 0.0), vec3(0.038, 0.045, 0.04)), 0.025);       // ankle
  return f;
}

vec2 mapChar(vec3 p) {
  vec3 q = (p - uJ[0]) * uTorso;
  vec2 c = vec2(torsoSdf(q), 3.0);
  // neck
  vec3 hb = uJ[3] + uHead * vec3(0.0, -0.06, -0.022);
  float nk = sdRC(p, uJ[2] - uTorso[1] * 0.02, hb, 0.072, 0.056);
  U(c, nk, 2.0, 0.06);
  // head
  if (length(p - uJ[3]) < 0.3) U(c, headSdf((p - uJ[3]) * uHead), 1.0, 0.02);
  else U(c, length(p - uJ[3]) - 0.13, 1.0, 0.02);
  // arms: deltoid, upper arm + biceps/triceps, forearm, hand
  for (int s = 0; s < 2; s++) {
    vec3 sh = s == 0 ? uJ[4] : uJ[8];
    vec3 el = s == 0 ? uJ[5] : uJ[9];
    vec3 wr = s == 0 ? uJ[6] : uJ[10];
    vec3 tp = s == 0 ? uJ[7] : uJ[11];
    vec3 bk = uArmB[s];
    float o = float(s) * 3.0;
    vec3 mid = (sh + tp) * 0.5;
    if (length(p - mid) - length(tp - sh) * 0.5 - 0.15 > c.x) continue;
    vec3 up = uTorso[1];
    float d = sdRC(p, sh + up * 0.012, mix(sh, el, 0.4), 0.064, 0.04);                    // deltoid
    d = smin(d, sdRC(p, sh, el, 0.05, 0.036), 0.03);
    d = smin(d, sdRC(p, mix(sh, el, 0.32) - bk * 0.014, mix(sh, el, 0.82) - bk * 0.01, 0.043, 0.031), 0.025); // biceps
    d = smin(d, sdRC(p, mix(sh, el, 0.22) + bk * 0.016, mix(sh, el, 0.78) + bk * 0.012, 0.041, 0.03), 0.025); // triceps
    U(c, d, 4.0 + o, 0.05);
    float f = sdRC(p, el, wr, 0.041, 0.025);
    f = smin(f, sdRC(p, mix(el, wr, 0.06), mix(el, wr, 0.55), 0.046, 0.03), 0.03);        // forearm muscle
    f = smin(f, length(p - el - bk * 0.012) - 0.035, 0.02);                                // elbow
    U(c, f, 5.0 + o, 0.025);
    if (length(p - wr) < 0.24) U(c, handSdf(p, wr, tp, uPalm[s], uCurl[s], s == 0 ? -1.0 : 1.0), 6.0 + o, 0.018);
  }
  // legs: thigh + quads, knee, shin + calf, boot
  for (int s = 0; s < 2; s++) {
    vec3 hp = s == 0 ? uJ[12] : uJ[16];
    vec3 kn = s == 0 ? uJ[13] : uJ[17];
    vec3 an = s == 0 ? uJ[14] : uJ[18];
    vec3 to = s == 0 ? uJ[15] : uJ[19];
    vec3 kf = uLegF[s];
    float o = float(s) * 3.0;
    vec3 mid = (hp + an) * 0.5;
    if (length(p - mid) - length(an - hp) * 0.5 - 0.3 > c.x) continue;
    float d = sdRC(p, hp, kn, 0.078, 0.047);
    d = smin(d, sdRC(p, mix(hp, kn, 0.18) + kf * 0.018, mix(hp, kn, 0.84) + kf * 0.014, 0.074, 0.04), 0.04); // quads
    d = smin(d, sdRC(p, mix(hp, kn, 0.1) - kf * 0.02, mix(hp, kn, 0.75) - kf * 0.016, 0.062, 0.042), 0.04); // hamstrings
    U(c, d, 10.0 + o, 0.05);
    float sh = sdRC(p, kn, an, 0.049, 0.031);
    sh = smin(sh, sdRC(p, mix(kn, an, 0.1) - kf * 0.022, mix(kn, an, 0.58) - kf * 0.01, 0.053, 0.033), 0.035); // calf
    sh = smin(sh, length(p - kn - kf * 0.014) - 0.044, 0.025);                                // kneecap
    U(c, sh, 11.0 + o, 0.03);
    U(c, footSdf(p, kn, an, to), 12.0 + o, 0.03);
  }
  // symbiote tendrils
  for (int i = 0; i < 6; i++) {
    vec4 tb = uTendB[i];
    if (length(p - tb.xyz) - tb.w > c.x + 0.02) continue;
    float d = 1e3;
    for (int k = 0; k < 7; k++) {
      float s0 = float(k) / 7.0, s1 = float(k + 1) / 7.0;
      d = smin(d, sdRC(p, uTend[i * 8 + k], uTend[i * 8 + k + 1], mix(0.022, 0.004, s0), mix(0.022, 0.004, s1)), 0.012);
    }
    U(c, d, 30.0, 0.03);
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
  for (int i = 1; i <= 5; i++) {
    float h = 0.005 + 0.024 * float(i * i) * 0.25;
    o += (h - map(p + n * h).x) * s;
    s *= 0.75;
  }
  return clamp(1.0 - 2.8 * o, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 22; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.012, 0.2);
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

float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float poly4(vec2 e, vec2 a, vec2 b, vec2 c, vec2 d, vec2 f, float w) {
  return min(min(segD(e, a, b), segD(e, b, c)), min(segD(e, c, d), segD(e, d, f))) - w;
}

// big angular symbiote eye, in wrapped face coords (u = arc around the head, v = height)
vec2 lensPt(int i) {
  if (i == 0) return vec2(0.016, -0.032);
  if (i == 1) return vec2(0.052, -0.012);
  if (i == 2) return vec2(0.088, 0.012);
  if (i == 3) return vec2(0.118, 0.046);
  if (i == 4) return vec2(0.084, 0.046);
  if (i == 5) return vec2(0.058, 0.04);
  if (i == 6) return vec2(0.032, 0.028);
  return vec2(0.012, 0.004);
}
float lensSd(vec2 p) {
  vec2 v0 = lensPt(0);
  float d = dot(p - v0, p - v0);
  float s = 1.0;
  for (int i = 0, j = 7; i < 8; j = i, i++) {
    vec2 vi = lensPt(i), vj = lensPt(j);
    vec2 e = vj - vi, w = p - vi;
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}

// classic black-suit spider in unwrapped torso coords e = (arc around the torso, y); legs wrap to the sides/back
float emblem(vec2 e) {
  float d = (length(vec2(e.x / 0.017, (e.y - 0.335) / 0.036)) - 1.0) * 0.017;
  d = min(d, (length(vec2(e.x / 0.01, (e.y - 0.39) / 0.013)) - 1.0) * 0.01);
  float w = 0.0085;
  d = min(d, poly4(e, vec2(0.01, 0.395), vec2(0.05, 0.43), vec2(0.12, 0.462), vec2(0.21, 0.48), vec2(0.31, 0.45), w));
  d = min(d, poly4(e, vec2(0.012, 0.372), vec2(0.06, 0.396), vec2(0.14, 0.412), vec2(0.23, 0.41), vec2(0.31, 0.385), w));
  d = min(d, poly4(e, vec2(0.012, 0.346), vec2(0.07, 0.35), vec2(0.15, 0.335), vec2(0.23, 0.31), vec2(0.31, 0.3), w));
  d = min(d, poly4(e, vec2(0.01, 0.318), vec2(0.05, 0.28), vec2(0.1, 0.22), vec2(0.17, 0.16), vec2(0.25, 0.12), w));
  return d;
}

// returns albedo in x, kind in y (0 suit, 1 white glow, 2 ledge)
vec2 material(vec3 p, float id, float pixW) {
  if (id > 29.5) return vec2(0.03, 0.0);
  if (id > 19.5) {
    vec3 g = p * 18.0; vec3 fl = floor(g); vec3 fr = fract(g); fr = fr * fr * (3.0 - 2.0 * fr);
    float n0 = fract(sin(dot(fl, vec3(12.9, 78.2, 37.7))) * 43758.5);
    float n1 = fract(sin(dot(fl + vec3(1.0, 0.0, 0.0), vec3(12.9, 78.2, 37.7))) * 43758.5);
    float n = mix(n0, n1, fr.x);
    float a = (0.14 + 0.05 * n) * (0.5 + 0.5 * smoothstep(-1.6, -0.1, p.y));
    if (p.y > -0.03 && p.z > 0.25) a = 0.3; // worn top edge
    return vec2(a, 2.0);
  }
  if (id < 2.5) {
    vec3 hq = (p - uJ[3]) * uHead;
    if (id < 1.5 && hq.z > -0.01) {
      vec2 m = vec2(atan(abs(hq.x), hq.z + 0.03) * 0.125, hq.y);
      if (lensSd(m) < 0.0) return vec2(1.0, 1.0);
    }
    return vec2(0.05, 0.0);
  }
  if (id < 3.5) {
    vec3 q = (p - uJ[0]) * uTorso;
    if (q.z > -0.02 && q.y > 0.1) {
      vec2 e = vec2(abs(atan(q.x, q.z)) * 0.13, q.y - 0.34) * 0.72 + vec2(0.0, 0.34);
      if (emblem(e) < 0.0) return vec2(0.95, 1.0);
    }
    return vec2(0.05, 0.0);
  }
  int k = int(id + 0.5);
  if (k == 6 || k == 9) { // back-of-hand patches
    vec3 wr = k == 6 ? uJ[6] : uJ[10];
    vec3 tp = k == 6 ? uJ[7] : uJ[11];
    vec3 pn = k == 6 ? uPalm[0] : uPalm[1];
    vec3 hy = normalize(tp - wr);
    vec3 hz = normalize(pn - hy * dot(pn, hy));
    vec3 hx = cross(hy, hz);
    vec3 d = p - wr;
    vec3 l = vec3(dot(d, hx), dot(d, hy), dot(d, hz));
    float wd = 0.03 - 0.3 * max(l.y - 0.012, 0.0);
    if (l.z < -0.004 && l.y > 0.012 && l.y < 0.098 && abs(l.x) < wd) return vec2(0.92, 1.0);
  }
  return vec2(0.05, 0.0);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float moonTex(vec2 q) { // q in disc units
  float m = vnoise(q * 2.3 + 4.0) * 0.6 + vnoise(q * 5.1) * 0.3 + vnoise(q * 11.0) * 0.1;
  float maria = smoothstep(0.48, 0.62, m);
  float cr = 0.0;
  vec2 g = q * 6.0; vec2 gi = floor(g);
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    vec2 c = gi + vec2(float(dx), float(dy));
    if (hash21(c + 1.7) < 0.5) continue;
    vec2 cp = c + vec2(hash21(c), hash21(c + 7.3)) * 0.7 + 0.15;
    float r = 0.2 + 0.25 * hash21(c + 3.1);
    float dd = length(g - cp) / r;
    cr += -0.15 * smoothstep(1.0, 0.7, dd) + 0.2 * smoothstep(0.78, 1.0, dd) * smoothstep(1.25, 1.0, dd);
  }
  return 0.64 - 0.1 * maria + 0.06 * (m - 0.5) + 0.07 * cr;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uCamRight * ndc.x * uTanHalf * uAspect + uCamUp * ndc.y * uTanHalf);
  vec3 ro = uCamPos;
  float t = 0.0, id = -1.0;
  for (int i = 0; i < 160; i++) {
    vec3 p = ro + rd * t;
    vec2 h = map(p);
    if (h.x < max(0.00015, t * 0.0012)) { id = h.y; break; }
    t += h.x * 0.9;
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
    vec3 L3 = normalize(vec3(-0.25, 0.4, -1.0)); // the moon behind him
    float ndl = dot(n, L1);
    float dif = clamp((ndl + 0.12) / 1.12, 0.0, 1.0);
    float sh = ndl > -0.1 ? softShadow(p + n * 0.004, L1) : 0.0;
    float ao = calcAO(p, n);
    float fill = max(dot(n, L2), 0.0);
    float fres = 1.0 - max(dot(n, -rd), 0.0);
    vec3 hv = normalize(L1 - rd);
    float nh = max(dot(n, hv), 0.0);
    if (m.y > 1.5) { // ledge
      col = uLit * m.x * (0.1 * ao + 0.7 * max(ndl, 0.0) * sh + 0.18 * fill);
    } else if (m.y > 0.5) { // white glow: lenses, emblem, hand patches
      col = uGlow * m.x * (0.92 + 0.08 * dif) * (0.9 + 0.1 * ao) * (m.x > 0.99 ? 1.0 : uLit);
    } else { // glossy black symbiote
      vec3 h3 = normalize(L3 - rd);
      float nh3 = max(dot(n, h3), 0.0);
      float rim = fres * fres * (0.3 + 0.7 * clamp(dot(n, L3) + 0.5, 0.0, 1.0));
      float spec = (1.0 * pow(nh, 40.0) + 0.1 * pow(nh, 9.0)) * sh;
      float spec3 = 0.9 * pow(nh3, 22.0);
      col = uLit * (m.x * (0.25 * ao + 0.8 * dif * (0.3 + 0.7 * sh)) + (spec + spec3 + 1.25 * rim + 0.08 * dif * sh) * (0.35 + 0.65 * ao));
    }
  } else if (uMoonI > 0.001) {
    vec2 pp = vec2(ndc.x * uAspect, ndc.y) - uMoonPos;
    float dd = length(pp) / uMoonR;
    if (dd < 1.05) {
      float disc = smoothstep(1.0, 0.95, dd);
      col = uMoonI * disc * moonTex(pp / uMoonR) * (1.0 - 0.14 * dd * dd);
    }
  }
  gl_FragColor = vec4(vec3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

export function createSymbioteScene(ctx) {
  let aspect = ctx.aspect || 16 / 9;
  const FOV = 30;
  const tanHalf = Math.tan((FOV * Math.PI) / 360);
  const J = Array.from({ length: 20 }, () => new THREE.Vector3());
  const TN = 6, TP = 8;
  const TEND = Array.from({ length: TN * TP }, () => new THREE.Vector3());
  const TENDB = Array.from({ length: TN }, () => new THREE.Vector4());
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const orbit = params.has('orbit') ? parseFloat(params.get('orbit')) : null;
  const orbitHead = params.get('ot') === 'head';
  const uniforms = {
    uAspect: { value: aspect },
    uTanHalf: { value: tanHalf },
    uResY: { value: 190 },
    uTime: { value: 0 },
    uLit: { value: 1 },
    uGlow: { value: 1 },
    uMoonI: { value: 0 },
    uMoonR: { value: 0.7 },
    uMoonPos: { value: new THREE.Vector2() },
    uTend: { value: TEND },
    uTendB: { value: TENDB },
    uCamPos: { value: new THREE.Vector3() },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uJ: { value: J },
    uArmB: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uLegF: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uPalm: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uCurl: { value: [new THREE.Vector4(), new THREE.Vector4()] },
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

  const T_UP = 9.2; // spring up
  const az = (t) => -0.3 + 0.15 * st(t, 2, 6) + 1.2 * st(t, 6, 9);

  function poseAt(t) {
    let pose = blendPose(POSES.crouch, POSES.crouch, 0);
    if (t > T_UP - 0.05) pose = blendPose(POSES.crouch, POSES.stand, st(t, T_UP - 0.05, T_UP + 0.35));
    const coil = st(t, 8.7, 9.15) * (1 - st(t, 9.2, 9.35));
    pose.pelvis = add(pose.pelvis, [0, -0.07 * coil + Math.sin(t * 2.1) * 0.006, -0.03 * coil]);
    pose.pitch += Math.sin(t * 2.1 + 0.6) * 0.012;
    const flex = (arr, ph) => arr.map((c, i) => clamp(c + 0.14 * Math.sin(t * 1.5 + ph + i * 0.8) + 0.05 * Math.sin(t * 3.1 + i), 0, 1));
    pose.curlL = flex(pose.curlL, 0.0);
    pose.curlR = flex(pose.curlR, 2.1);
    return pose;
  }

  function headAngles(t) {
    const yaw = 0.8 * clamp(az(t), -1.1, 1.1) + 0.04 * Math.sin(t * 1.1);
    let pitch = -0.14 + 0.03 * Math.sin(t * 0.9) - 0.04 * st(t, 2, 6);
    if (t > T_UP) pitch = lerp(pitch, 0.5, st(t, T_UP, T_UP + 0.4));
    return { yaw, pitch };
  }

  function solve(t) {
    const pose = poseAt(t);
    let off = [0, 0, 0];
    if (t > T_UP + 0.1) {
      const u = clamp((t - T_UP - 0.1) / 0.75);
      off = [0, 4.4 * u * u, 0.25 * u];
    }
    const P = add(pose.pelvis, off);
    const R = rotTorso(pose.pitch, pose.roll, 0);
    const neck = add(P, apply(R, [0, 0.51, -0.025]));
    const ha = headAngles(t);
    const H = rotHead(ha.yaw, ha.pitch, 0);
    const headC = add(add(neck, apply(R, [0, 0.045, 0.012])), apply(H, [0, 0.105, 0.0]));
    const shL = add(P, apply(R, [0.2, 0.465, -0.03]));
    const shR = add(P, apply(R, [-0.2, 0.465, -0.03]));
    const hipL = add(P, apply(R, [0.088, -0.05, 0]));
    const hipR = add(P, apply(R, [-0.088, -0.05, 0]));
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
    const back = mul(R.f, -1);
    uniforms.uArmB.value[0].set(...bendDir(shL, elL, wrL, back));
    uniforms.uArmB.value[1].set(...bendDir(shR, elR, wrR, back));
    uniforms.uLegF.value[0].set(...bendDir(hipL, knL, anL, R.f));
    uniforms.uLegF.value[1].set(...bendDir(hipR, knR, anR, R.f));
    uniforms.uPalm.value[0].set(...nrm(pose.palmL));
    uniforms.uPalm.value[1].set(...nrm(pose.palmR));
    uniforms.uCurl.value[0].set(...pose.curlL);
    uniforms.uCurl.value[1].set(...pose.curlR);
    setMat(uniforms.uTorso.value, R);
    setMat(uniforms.uHead.value, H);
    // symbiote tendrils: anchors on back / shoulders / forearm, sin-driven chains
    const defs = [
      { a: add(P, apply(R, [0.07, 0.42, -0.09])), d: [0.35, 0.8, -0.5], L: 0.5, ph: 0.0, A: 0.12 },
      { a: add(P, apply(R, [-0.07, 0.42, -0.09])), d: [-0.4, 0.85, -0.35], L: 0.55, ph: 1.7, A: 0.13 },
      { a: add(P, apply(R, [0.17, 0.5, -0.05])), d: [0.85, 0.5, -0.2], L: 0.4, ph: 3.1, A: 0.1 },
      { a: add(P, apply(R, [-0.17, 0.5, -0.05])), d: [-0.85, 0.5, -0.25], L: 0.42, ph: 4.3, A: 0.1 },
      { a: add(P, apply(R, [0.0, 0.36, -0.12])), d: [0.1, 0.6, -0.8], L: 0.45, ph: 5.2, A: 0.11 },
      { a: mix3(elL, wrL, 0.55), d: [0.7, 0.6, 0.2], L: 0.3, ph: 2.4, A: 0.08 },
    ];
    defs.forEach((df, i) => {
      const d = nrm(df.d);
      const w1 = nrm(cross(d, [0, 0, 1]));
      const w2 = cross(d, w1);
      for (let k = 0; k < TP; k++) {
        const s = k / (TP - 1);
        const amp = df.A * Math.pow(s, 1.2);
        const a1 = Math.sin(1.3 * t + df.ph - 3.2 * s);
        const a2 = 0.8 * Math.sin(0.9 * t + df.ph * 1.7 - 2.4 * s);
        const curl = 1.4 * s * s; // tips curl over like questing feelers
        const along = mul(d, df.L * Math.sin(Math.min(1, s) * 1.2) / Math.sin(1.2));
        const p = add(add(df.a, along), add(add(mul(w1, amp * a1 + 0.12 * df.L * curl), mul(w2, amp * a2)), [0, -0.1 * df.L * curl, 0]));
        TEND[i * TP + k].set(p[0], p[1], p[2]);
      }
      const c = add(df.a, mul(d, df.L * 0.5));
      TENDB[i].set(c[0], c[1], c[2], df.L * 0.5 + df.A + 0.08);
    });
    return { headC, H, P, R };
  }

  // ---- camera ----
  const fit = (H, W) => Math.max(H, W / aspect) / tanHalf;
  const WIDE_T = [0, 0.57, 0.08];

  function cameraAt(t, head) {
    if (orbit !== null) {
      const a = (orbit * Math.PI) / 180;
      const target = orbitHead ? head.headC : add(head.P, [0, 0.0, 0]);
      const d = orbitHead ? fit(0.17, 0.17) : fit(0.95, 0.6);
      return { target, eye: add(target, mul(nrm([Math.sin(a), 0.08, Math.cos(a)]), d)) };
    }
    const a = az(t);
    const dirW = nrm([Math.sin(a), 0.1, Math.cos(a)]);
    const dW = fit(0.58, 0.52);
    const ct = add(head.headC, apply(head.H, [0, 0.012, 0.07]));
    const cd = fit(0.1, 0.2) * (1.1 - 0.1 * st(t, 0, 2));
    const u = st(t, 2, 6);
    let target = mix3(ct, WIDE_T, u);
    const d = cd * Math.pow(dW / cd, u);
    const dir = nrm(mix3(head.H.f, dirW, u));
    target = add(target, [0, 0.3 * st(t, T_UP, 9.9), 0]);
    return { target, eye: add(target, mul(dir, d)) };
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
    uniforms.uBody.value = 1;
    const dbg = orbit !== null;
    uniforms.uLit.value = dbg ? 1 : 0.02 + 0.98 * st(t, 1.7, 3.2);
    uniforms.uGlow.value = dbg ? 1 : st(t, 0.25, 1.6) * (0.94 + 0.06 * Math.sin(t * 3.0));
    uniforms.uMoonI.value = dbg ? 1 : st(t, 3.4, 5.0);
    uniforms.uKey.value.set(...nrm([-0.55, 0.75, 0.55]));
    // moon: a world-anchored disc behind the crouch spot, projected to the screen
    const v = sub(add(WIDE_T, [0, 0.12, 0]), eye);
    const z = Math.max(dot(v, f), 0.3);
    uniforms.uMoonPos.value.set(dot(v, r) / (z * tanHalf), dot(v, u) / (z * tanHalf));
    uniforms.uMoonR.value = Math.min(0.9, (0.5 * Math.min(1, 0.6 + aspect * 0.6)) / (z * tanHalf));
  }

  return {
    name: 'symbiote',
    duration: 10,
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
      return lastT >= 2 ? [{ id: 'sym', text: 'SPIDER-MAN', x: 0.06, y: 0.9 }] : [];
    },
  };
}
