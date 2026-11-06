// Su-33 (Flanker-D) procedural model, shared by every scene.
//
// AXIS CONVENTION (scene axes, metres): nose points +X, up is +Y, starboard (right wing) is +Z.
// Origin = 10.6 m aft of the nose tip (near the CG), on the centreline, ~mid fuselage height.
// Real scale: 21.2 m long, 14.7 m span, fin tip ~3.4 m above origin.
// Wheels-down ground contact is at y = GROUND_Y (-2.8) with the gear extended (setGear(1)).
//
// Internally the airframe is described in "model coords" (x aft from nose, y right, z up) and mapped
// with T(x, y, z) -> [OX - x, z, y].
//
// Angle conventions for control surfaces: positive = trailing edge DOWN (canards, stabs, flaps).
import * as THREE from 'three';

export const LEN = 21.2;
export const SPAN = 14.7;
export const OX = 10.6;
export const GROUND_Y = -2.8;
export const T = (x, y, z) => [OX - x, z, y];
const ID = (x, y, z) => [x, y, z];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;

// Monotone-ish cubic interpolation through rows [x, v1, v2, ...].
export function hermite(tab, x) {
  let i = 0;
  while (i < tab.length - 2 && x > tab[i + 1][0]) i++;
  const a = tab[i], b = tab[i + 1];
  const pa = tab[i - 1] || a, pb = tab[i + 2] || b;
  const h = b[0] - a[0];
  const t = clamp01((x - a[0]) / h);
  const t2 = t * t, t3 = t2 * t;
  const out = [];
  for (let k = 1; k < a.length; k++) {
    const m0 = (b[k] - pa[k]) / (b[0] - pa[0] || 1);
    const m1 = (pb[k] - a[k]) / (pb[0] - a[0] || 1);
    out.push(
      (2 * t3 - 3 * t2 + 1) * a[k] + (t3 - 2 * t2 + t) * h * m0 +
      (-2 * t3 + 3 * t2) * b[k] + (t3 - t2) * h * m1
    );
  }
  return out;
}

// Super-ellipse cross-section ring (model coords), starting at the top, going to starboard.
function sec(x, w, top, bot, zc, p = 2, N = 24, yc = 0) {
  const pts = [];
  w = Math.max(0, w); top = Math.max(0, top); bot = Math.max(0, bot);
  for (let j = 0; j < N; j++) {
    const a = (j / N) * Math.PI * 2;
    const s = Math.sin(a), c = Math.cos(a);
    const y = yc + w * Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
    const k = Math.pow(Math.abs(c), 2 / p);
    pts.push([x, y, zc + (c >= 0 ? top * k : -bot * k)]);
  }
  return pts;
}

// ---------- tables ----------
const RADOME = [
  [0, 0, -0.17], [0.15, 0.1, -0.16], [0.5, 0.23, -0.15], [1.0, 0.37, -0.12],
  [1.5, 0.47, -0.09], [2.0, 0.56, -0.05], [2.5, 0.62, -0.02], [3.0, 0.65, 0],
];
// fuselage: [x, halfwidth, top, bottom, zc, superellipse p]
const FUS = [
  [3.0, 0.65, 0.65, 0.65, 0, 2],
  [3.6, 0.67, 0.7, 0.62, 0, 2.2],
  [4.5, 0.7, 0.78, 0.58, 0, 2.6],
  [5.5, 0.74, 0.76, 0.6, 0, 3],
  [6.5, 0.84, 0.72, 0.64, 0, 3.4],
  [7.5, 0.98, 0.7, 0.68, 0, 3.8],
  [8.6, 1.08, 0.74, 0.74, -0.05, 4],
  [9.6, 1.14, 0.82, 0.78, -0.05, 4],
  [11, 1.12, 0.68, 0.78, -0.05, 4.2],
  [13, 1.08, 0.56, 0.7, -0.05, 4],
  [15, 0.95, 0.42, 0.55, -0.1, 3.5],
  [16, 0.7, 0.34, 0.45, -0.1, 3],
  [17.5, 0.42, 0.28, 0.38, -0.1, 2.8],
  [19, 0.23, 0.2, 0.28, -0.1, 2.4],
  [20.2, 0.15, 0.14, 0.2, -0.1, 2.2],
  [20.8, 0.1, 0.09, 0.12, -0.1, 2],
  [21.0, 0, 0, 0, -0.1, 2],
];
export const fusTop = (x) => {
  const v = hermite(FUS, Math.max(3, Math.min(21, x)));
  return v[3] + v[1];
};
const CANOPY = [
  [4.45, 0, 0], [4.7, 0.28, 0.26], [5.2, 0.46, 0.5], [5.8, 0.5, 0.6],
  [6.4, 0.46, 0.55], [7.0, 0.34, 0.34], [7.5, 0.15, 0.12], [7.7, 0, 0],
];

// airfoil-ish wing
const WROOT = 2.6, WFOLD = 4.9, WTIP = 7.35;
const wingLE = (y) => 10.9 + 0.82 * (y - 2.6);
const wingTE = (y) => lerp(15.8, 16.2, (y - 2.6) / 4.75);
const wingTh = (y) => lerp(0.36, 0.12, (y - 2.6) / 4.75);
const WZC = -0.1;
const prof = (c) => (c <= 0.3 ? Math.pow(c / 0.3, 0.6) : Math.pow((1 - c) / 0.7, 0.9));
const wingPt = (y, c, s, off = 0) => [
  lerp(wingLE(y), wingTE(y), c), s * y, WZC + 0.5 * wingTh(y) * prof(c) + off,
];
const CH = 0.72; // control-surface hinge, fraction of chord

// ---------- explode vectors: [dx aft, dy outward, dz up] in model space ----------
const OFF = {
  fus: [0, 0, 0], radome: [-4.8, 0, 0.2], canopy: [-1.4, 0, 3.4], airbrake: [2.2, 0, 2.6],
  lerx: [-1.0, 1.1, -0.4], canard: [-3.4, 3.5, 1.0], intake: [-3.8, 2.8, -1.0],
  wing: [1.0, 3.8, 0.3], nacelle: [3.0, 3.7, -0.5], nozzle: [6.6, 2.5, -0.3],
  tail: [4.0, 7.4, 0.4], stab: [6.0, 3.3, 0.2], hook: [5.2, 0, -1.2],
};
const ORDER = {
  fus: 0, radome: 1, canopy: 2, airbrake: 3, lerx: 4, canard: 5, intake: 6, wing: 7,
  nacelle: 8, nozzle: 9, tail: 10, stab: 11, gearN: 12, gearM: 13, door: 13, hook: 14, missile: 15,
};

// ---------- materials ----------
const mats = {};
const CAMO = new Set([0xd0d0d0, 0xc4c4c4, 0xcdcdcd, 0xd6d6d6, 0xdcdcdc, 0xd8d8d8, 0xc9c9c9, 0xbcbcbc, 0xbdbdbd, 0xbfbfbf, 0xbababa]);
const GLOSS = { 0x2a2a2a: [0.12, 0.2], 0x6e6e6e: [0.3, 0.7] }; // canopy glass, nozzle metal

// Grey source colours are re-coloured here: `hue` is a linear RGB direction; the grey's luminance is kept
// (so the ASCII glyph choice / contrast is unchanged) and only the hue is added.
const HUE_CAMO = [0.42, 0.74, 1.0];   // Russian Navy light grey-blue upper camo
const HUE_GREY = [0.66, 0.84, 1.0];   // generic airframe greys: faintly blue
const HUE_DARK = [0.62, 0.80, 1.0];   // panel lines, dark trim
const colourize = (hex, h) => {
  const col = new THREE.Color(hex);
  const k = 0.2126 * h[0] + 0.7152 * h[1] + 0.0722 * h[2];
  col.r = Math.min(1, col.r * h[0] / k); col.g = Math.min(1, col.g * h[1] / k); col.b = Math.min(1, col.b * h[2] / k);
  return col;
};
const SPECIAL = {
  0x2a2a2a: [1.0, 0.72, 0.38],   // canopy glass: dark, gold/bronze sheen
  0xe4e4e4: [1.0, 0.97, 0.90],   // radome: warm off-white
  0xf5f5f5: [1.0, 0.98, 0.93],   // missile bodies
  0x3a3a3a: [0.60, 0.70, 1.0],   // missile seeker band: dark blue-black
  0x3c3c3c: [0.85, 0.9, 1.0],    // tyres
  0x7a7a7a: [0.70, 0.82, 1.0],   // missile fins
  0xeeeeee: [1.0, 1.0, 1.0],     // gear legs: white
  0x8a8a8a: [0.70, 0.82, 1.0],
  0x1e1e1e: [0.9, 0.8, 0.6],     // IRST ball
  0xd01818: null,                // star red (literal)
  0xf4f4f4: null,                // star outline white (literal)
};
const matColour = (c) => {
  if (c === 0xd01818 || c === 0xf4f4f4) return new THREE.Color(c);
  if (c === 0x6e6e6e) return new THREE.Color(1, 1, 1); // nozzle: vertex colours carry the heat tint
  if (SPECIAL[c]) return colourize(c, SPECIAL[c]);
  if (CAMO.has(c)) return colourize(c, HUE_CAMO);
  return colourize(c, c < 0x70 ? HUE_DARK : HUE_GREY);
};

// Shared material; camo-tone greys get the 3-tone value-noise camouflage shader (blue-grey patches).
export function makeMaterial(c, flat = false, off = false) {
  const k = `${c}|${flat}|${off}`;
  if (mats[k]) return mats[k];
  const [rough, metal] = GLOSS[c] || [0.42, 0.12];
  const m = new THREE.MeshStandardMaterial({
    color: matColour(c), flatShading: flat, roughness: rough, metalness: metal, side: THREE.DoubleSide,
    polygonOffset: off, polygonOffsetFactor: off ? -2 : 0, polygonOffsetUnits: off ? -2 : 0,
  });
  if (c === 0x6e6e6e) m.vertexColors = true;
  if (CAMO.has(c)) {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCamo;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamo = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vCamo;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 camo(vec3 p){
  p = vec3(p.x * 0.55, p.y * 0.2, p.z * 0.42);
  float n = 0.6 * vn(p + 3.1) + 0.3 * vn(p * 2.1 + 7.7) + 0.1 * vn(p * 4.3);
  float a = smoothstep(0.44, 0.47, n), b = smoothstep(0.56, 0.59, n);
  return mix(vec3(1.0), mix(vec3(0.76, 0.84, 0.92), vec3(0.52, 0.66, 0.84), b), a);
}`)
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= camo(vCamo);');
    };
    m.customProgramCacheKey = () => 'su33camo';
  }
  return (mats[k] = m);
}
const mesh = (geo, c, flat = false, off = false) => new THREE.Mesh(geo, makeMaterial(c, flat, off));

// ---------- lights ----------
let _lights = null;
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _tmp = new THREE.Vector3();
// Key + rim + hemisphere rig tuned for the ASCII renderer. Returns {key, rim, hemi}.
export function makeLights(scene) {
  const key = new THREE.DirectionalLight(0xfff4e6, 3.6);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xd6e4ff, 2.4);
  scene.add(rim, rim.target);
  const hemi = new THREE.HemisphereLight(0xe2ecff, 0x3a342c, 1.2);
  scene.add(hemi);
  _lights = { key, rim, hemi };
  return _lights;
}
// Re-aim the rig for the current camera: key from the camera's upper-left (and high in world space),
// rim from behind the subject. `lights` defaults to the last rig from makeLights().
export function aimLights(camera, target, lights = _lights) {
  if (!lights) return;
  const { key, rim } = lights;
  _r.setFromMatrixColumn(camera.matrixWorld, 0);
  _u.setFromMatrixColumn(camera.matrixWorld, 1);
  _tmp.copy(camera.position).sub(target).normalize();
  key.position.copy(target).addScaledVector(_r, -30).addScaledVector(_u, 30).addScaledVector(_tmp, 20);
  key.position.y += 45;
  key.target.position.copy(target);
  rim.position.copy(target).addScaledVector(_r, 25).addScaledVector(_u, 20).addScaledVector(_tmp, -45);
  rim.target.position.copy(target);
  key.target.updateMatrixWorld(); rim.target.updateMatrixWorld();
}

// ---------- geometry helpers ----------
// Join consecutive rings (arrays of [x,y,z] model points) into a surface.
function loft(rings, { capStart = false, capEnd = false, conv = T } = {}) {
  const N = rings[0].length, pos = [], idx = [];
  for (const r of rings) for (const p of r) pos.push(...conv(p[0], p[1], p[2]));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * N + j, b = i * N + ((j + 1) % N), c = (i + 1) * N + j, d = (i + 1) * N + ((j + 1) % N);
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (ri) => {
    let cx = 0, cy = 0, cz = 0;
    for (const p of rings[ri]) { cx += p[0]; cy += p[1]; cz += p[2]; }
    const ci = pos.length / 3;
    pos.push(...conv(cx / N, cy / N, cz / N));
    for (let j = 0; j < N; j++) idx.push(ci, ri * N + j, ri * N + ((j + 1) % N));
  };
  if (capStart) cap(0);
  if (capEnd) cap(rings.length - 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const fan = (ring) => loft([ring, ring], { capStart: true });

function plate(poly, depth, map, conv = T) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const [x, y, z] = map(pa.getX(i), pa.getY(i), pa.getZ(i));
    const [X, Y, Z] = conv(x, y, z);
    pa.setXYZ(i, X, Y, Z);
  }
  g.computeVertexNormals();
  return g;
}
const hplate = (poly, z0, depth, s = 1) => plate(poly, depth, (u, v, w) => [u, s * v, z0 + w - depth / 2]);
const vplate = (poly, y0, depth, s = 1) => plate(poly, depth, (u, v, w) => [u, s * (y0 + w - depth / 2), v]);

// Ribbon following a model-space polyline (panel lines, rudder lines).
function strip(pts, w, color, ref = [0, 0, 1]) {
  const pos = [], idx = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let n = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]];
    const l = Math.hypot(...n) || 1;
    n = n.map((v) => (v / l) * (w / 2));
    pos.push(...T(p[0] - n[0], p[1] - n[1], p[2] - n[2]), ...T(p[0] + n[0], p[1] + n[1], p[2] + n[2]));
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return mesh(g, color, true, true);
}

// Cylinder between two scene-space points.
const rod = (a, b, r, color, seg = 8) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), color);
  m.position.copy(A).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
};
const wheel = (rad, w, X, Y, Z, color = 0x3c3c3c) => {
  const g = new THREE.CylinderGeometry(rad, rad, w, 18);
  g.rotateX(Math.PI / 2);
  const m = mesh(g, color);
  m.position.set(X, Y, Z);
  return m;
};
const mk = (x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
};
// Group whose origin is the hinge point P (scene coords); children built in absolute scene coords
// are re-expressed relative to it. parentP = hinge of the enclosing pivot (if nested).
function pivot(P, children, parentP = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(P[0] - parentP[0], P[1] - parentP[1], P[2] - parentP[2]);
  for (const c of children) { c.position.x -= P[0]; c.position.y -= P[1]; c.position.z -= P[2]; g.add(c); }
  return g;
}

// ---------- missiles (local axes: nose +X) ----------
const MK = {
  'R-73': { L: 2.9, r: 0.115, nose: 0.75 },
  'R-27': { L: 4.0, r: 0.16, nose: 1.0 },
};
function missile(kind, hang) {
  const { L, r, nose } = MK[kind];
  const g = new THREE.Group();
  const rings = [];
  const ringsAt = (x, rr) => {
    const pts = [];
    for (let j = 0; j < 14; j++) {
      const a = (j / 14) * Math.PI * 2;
      pts.push([x, rr * Math.cos(a), rr * Math.sin(a)]);
    }
    return pts;
  };
  const bodyEnd = L / 2 - nose;
  rings.push(ringsAt(-L / 2, r * 0.85));
  rings.push(ringsAt(-L / 2 + 0.01, r * 0.92));
  rings.push(ringsAt(-L / 2 + 0.4, r));
  rings.push(ringsAt(bodyEnd, r));
  for (const [f, k] of [[0.15, 0.97], [0.3, 0.9], [0.5, 0.75], [0.7, 0.55], [0.85, 0.32], [1, 0.0]]) {
    rings.push(ringsAt(bodyEnd + nose * f, r * k));
  }
  g.add(mesh(loft(rings, { conv: ID, capStart: true }), 0xf5f5f5));
  const band = [ringsAt(bodyEnd + nose * 0.2, r * 1.01), ringsAt(bodyEnd + nose * 0.34, r * 0.97)];
  g.add(mesh(loft(band, { conv: ID }), 0x3a3a3a));
  const finGeo = (xr, c, span, ct, sw, th) => {
    const shape = new THREE.Shape([
      new THREE.Vector2(xr, r * 0.6), new THREE.Vector2(xr + c, r * 0.6),
      new THREE.Vector2(xr + sw + ct, r + span), new THREE.Vector2(xr + sw, r + span),
    ]);
    const fg = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false });
    fg.translate(0, 0, -th / 2);
    return fg;
  };
  const addFins = (geo, color) => {
    for (let k = 0; k < 4; k++) {
      const fg = geo.clone();
      fg.rotateX((k * Math.PI) / 2);
      g.add(mesh(fg, color, true));
    }
  };
  if (kind === 'R-73') {
    addFins(finGeo(-L / 2, 0.55, 0.3, 0.2, 0.3, 0.035), 0x7a7a7a);
    addFins(finGeo(bodyEnd - 0.1, 0.35, 0.27, 0.12, 0.2, 0.03), 0x7a7a7a);
    addFins(finGeo(-L / 2 + 0.7, 0.9, 0.1, 0.5, 0.2, 0.03), 0xe8e8e8);
  } else {
    addFins(finGeo(-L / 2, 0.6, 0.42, 0.25, 0.35, 0.04), 0x7a7a7a);
    addFins(finGeo(-L / 2 + 1.2, 0.8, 0.2, 0.45, 0.3, 0.035), 0x8a8a8a);
  }
  if (hang > 0) {
    const sh = new THREE.Shape([
      new THREE.Vector2(-L * 0.26, r * 0.6), new THREE.Vector2(L * 0.2, r * 0.6),
      new THREE.Vector2(L * 0.14, r + hang), new THREE.Vector2(-L * 0.2, r + hang),
    ]);
    const pg = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false });
    pg.translate(0, 0, -0.035);
    g.add(mesh(pg, 0xbdbdbd, true));
  }
  return g;
}
// [kind, nose x (model), y (positive), z, hang]
const MSL = [
  ['R-73', 14.0, 7.53, -0.14, 0],
  ['R-73', 12.5, 4.3, -0.64, 0.42],
  ['R-27', 8.4, 1.45, -1.6, 0.2],
  ['R-27', 11.0, 3.0, -0.66, 0.42],
  ['R-27', 12.6, 5.6, -0.66, 0.42],
];
// Station local nose axis == airframe axis; centre of the missile body sits at T(xn + L/2, s*y, z).
// Exposed so launch scenes can place a launched missile: world pos of a missile = root * station pos.

// ---------- afterburner plume ----------
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
function lathePlume(L, r0, bulge, peak, N = 16, hotC = [1, 0.55, 0.16], coolC = [0.45, 0.42, 1.0]) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const d = i / N;
    const r = r0 * (1 + bulge * Math.sin(Math.min(1, d * 3) * Math.PI / 2)) * Math.pow(1 - d, 0.8);
    pts.push(new THREE.Vector2(Math.max(r, 0.002), d * L));
  }
  const g = new THREE.LatheGeometry(pts, 22);
  const pa = g.attributes.position, col = [];
  for (let i = 0; i < pa.count; i++) {
    const k = peak * Math.pow(Math.max(0, 1 - pa.getY(i) / L), 1.15);
    const d = pa.getY(i) / L, c = mixc(hotC, coolC, Math.min(1, Math.max(0, (d - 0.35) / 0.55)));
    col.push(k * c[0], k * c[1], k * c[2]);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.rotateZ(Math.PI / 2); // +Y (lathe axis) -> -X (aft)
  return g;
}
const PLUME_MAT = () => new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

// ===========================================================================
// buildSu33(opts) -> { root, parts, rig, update(t), dims, T }
//   root   : THREE.Group in scene axes (see top). Add it to your scene; move/rotate it freely.
//   parts  : explode registry [{g, kind, off:[x,y,z scene], off0, base:Vector3, order, m?}]
//   rig    : control surfaces / gear / weapons (see below)
//   update(t): animated flicker (afterburner); call every frame (optional).
// opts: { missiles: true }  (set false for a clean airframe, e.g. for the arrested-landing scenes)
// ===========================================================================
export function buildSu33(opts = {}) {
  const withMissiles = opts.missiles !== false;
  const root = new THREE.Group();
  const parts = [];
  const addPart = (g, kind, off, ord, extra = {}) => {
    root.add(g);
    const p = { g, kind, off: [-off[0], off[2], off[1]], base: g.position.clone(), order: ord, ...extra };
    p.off0 = p.off.slice();
    parts.push(p);
    return p;
  };
  const setOff = (p, o) => { p.off = o.slice(); p.off0 = o.slice(); };

  const AIR = 0xd0d0d0, AIR2 = 0xc4c4c4, PLATE = 0xcdcdcd, DARK = 0x070707;
  const R = {
    wingFold: [], stabFold: [], canards: [], stabs: [], flaps: [], aileron: [],
    gearN: null, gearM: [], hook: null, airbrake: null, probe: null, plumes: [], nozzleMats: [],
  };
  const nozMat = makeMaterial(0x6e6e6e, true, false);

  // ---------- fuselage + radome ----------
  {
    const g = mk();
    const rings = [];
    for (let x = 3; x <= 21.001; x += 0.5) {
      const [w, top, bot, zc, p] = hermite(FUS, Math.min(21, x));
      rings.push(sec(Math.min(21, x), w, top, bot, zc, p));
    }
    g.add(mesh(loft(rings), AIR));
    g.add(mesh(hplate([[8.2, -0.8], [8.2, 0.8], [15.0, 0.75], [15.0, -0.75]], -0.76, 0.05), AIR2, true));
    // spine + fuselage panel lines
    g.add(strip([[7.6, 0, 0.72], [9.6, 0, 0.82], [13, 0, 0.52]], 0.04, 0x5a5a5a));
    for (const s of [-1, 1]) {
      g.add(strip([[3.4, s * 0.62, 0.15], [5.0, s * 0.7, 0.2], [6.6, s * 0.84, 0.15]], 0.025, 0x707070)); // avionics bay seam
      g.add(strip([[11.4, s * 0.55, 0.62], [14.8, s * 0.48, 0.46]], 0.03, 0x606060, [0, 1, 0])); // spine fairing edges
      g.add(strip([[16.0, s * 0.38, 0.2], [20.0, s * 0.18, 0.1]], 0.025, 0x707070)); // stinger seam
    }
    // stinger tip: shorter on the Su-33 (no long rear boom), small ECM fairing
    g.add(rod(T(20.4, 0, 0.0), T(21.15, 0, -0.04), 0.05, 0xc8c8c8, 6));
    addPart(g, 'fus', OFF.fus, ORDER.fus);
  }
  {
    const g = mk();
    const rings = RADOME.map(([x, r, zc]) => sec(x, r, r, r, zc, 2, 24));
    g.add(mesh(loft(rings, { capEnd: false }), 0xe4e4e4));
    g.add(rod(T(0.1, 0, -0.17), T(-0.55, 0, -0.17), 0.028, 0xdddddd, 6)); // pitot
    g.add(strip([[2.9, 0.65, 0.0], [2.9, 0, 0.65], [2.9, -0.65, 0.0]], 0.03, 0x555555, [1, 0, 0])); // radome joint
    addPart(g, 'radome', OFF.radome, ORDER.radome);
  }
  // ---------- canopy, frame, IRST, refuelling probe ----------
  {
    const g = mk();
    const ringAt = (x, k = 1) => {
      const [w, h] = hermite(CANOPY, x);
      const zc = fusTop(x) - 0.14;
      return sec(x, w * k, h * k + 0.14, 0.14, zc, 2.4, 20);
    };
    const glass = [];
    for (let x = 4.46; x <= 7.69; x += 0.18) glass.push(ringAt(x));
    glass.push(ringAt(7.7));
    g.add(mesh(loft(glass), 0x2a2a2a));
    for (const [a, b] of [[4.62, 4.84], [5.78, 5.96], [7.0, 7.18]]) {
      const r = [];
      for (let x = a; x <= b + 1e-6; x += (b - a) / 3) r.push(ringAt(x, 1.04));
      g.add(mesh(loft(r), 0xf2f2f2));
    }
    // aft fairing hump behind the canopy
    const hump = [];
    for (const [x, k] of [[7.5, 0.1], [8.1, 0.7], [8.8, 0.55], [9.6, 0.1]]) {
      hump.push(sec(x, 0.42 * k + 0.05, 0.3 * k + 0.02, 0.1, fusTop(x) - 0.05, 2.4, 14));
    }
    g.add(mesh(loft(hump), AIR));
    const rail = [];
    for (let x = 4.7; x <= 7.5; x += 0.2) rail.push([x, 0, fusTop(x) + hermite(CANOPY, x)[1] + 0.01]);
    g.add(strip(rail, 0.05, 0xf2f2f2, [0, 1, 0]));
    // IRST ball
    const bm = mesh(new THREE.SphereGeometry(0.17, 14, 12), 0x1e1e1e);
    bm.position.set(...T(4.15, 0.2, fusTop(4.15) + 0.04));
    g.add(bm);
    const fair = [sec(3.7, 0.04, 0.04, 0.04, fusTop(3.7), 2, 12, 0.2), sec(4.15, 0.16, 0.17, 0.12, fusTop(4.15), 2, 12, 0.2),
      sec(4.6, 0.12, 0.1, 0.08, fusTop(4.6) + 0.02, 2, 12, 0.2)];
    g.add(mesh(loft(fair), AIR));
    // refuelling probe: housing offset to port; telescoping probe tube + nose slides forward
    const pr = [];
    for (const [x, k] of [[4.3, 0.05], [4.7, 0.9], [5.4, 1], [6.0, 0.4]]) {
      pr.push(sec(x, 0.09 * k, 0.09 * k, 0.05 * k, fusTop(x) + 0.1, 2, 10, -0.48));
    }
    g.add(mesh(loft(pr), 0xbdbdbd));
    const pz = fusTop(5) + 0.1;
    const probe = new THREE.Group();
    probe.add(rod(T(5.9, -0.48, pz), T(4.6, -0.48, pz), 0.035, 0xdedede, 8));
    probe.add(rod(T(4.6, -0.48, pz), T(4.25, -0.48, pz), 0.014, 0xf0f0f0, 6));
    g.add(probe);
    R.probe = probe;
    addPart(g, 'canopy', OFF.canopy, ORDER.canopy);
  }
  // ---------- dorsal airbrake (hinged at the aft edge) ----------
  {
    const g = mk();
    const plateM = mesh(plate([[7.9, -0.45], [9.9, -0.52], [9.9, 0.52], [7.9, 0.45]], 0.06,
      (u, v, w) => [u, v, fusTop(u) + w - 0.01]), 0xbcbcbc, true);
    const l1 = strip([[8.0, -0.4, fusTop(8) + 0.06], [9.8, -0.46, fusTop(9.8) + 0.06]], 0.025, 0x4a4a4a);
    const l2 = strip([[8.0, 0.4, fusTop(8) + 0.06], [9.8, 0.46, fusTop(9.8) + 0.06]], 0.025, 0x4a4a4a);
    const H = T(9.9, 0, fusTop(9.9));
    const pv = pivot(H, [plateM, l1, l2]);
    g.add(pv);
    R.airbrake = pv;
    addPart(g, 'airbrake', OFF.airbrake, ORDER.airbrake);
  }

  // ---------- arrestor hook (under the stinger) ----------
  {
    const g = mk();
    g.add(mesh(plate([[17.9, -0.22], [19.1, -0.22], [19.1, 0.22], [17.9, 0.22]], 0.04, (u, v, w) => [u, v, -0.34 + w]), 0xa8a8a8, true));
    const H = T(18.2, 0, -0.32);
    const a = rod(T(18.2, 0, -0.32), T(20.5, 0, -0.36), 0.06, 0xb0b0b0, 6);
    const b = rod(T(20.5, 0, -0.36), T(20.88, 0, -0.2), 0.05, 0xe0e0e0, 6);
    const c = rod(T(18.5, -0.18, -0.34), T(18.5, 0.18, -0.34), 0.04, 0xa0a0a0, 6); // hinge pin
    const pv = pivot(H, [a, b, c]);
    g.add(pv);
    R.hook = { pv, H };
    addPart(g, 'hook', OFF.hook, ORDER.hook);
  }

  // ---------- gear (all pivots; fully extended = rest pose, y=0) ----------
  const NOSE_Y = GROUND_Y; // wheel bottom
  {
    const g = mk();
    const WR = 0.34;
    const cz = GROUND_Y + WR; // wheel centre height
    const parts_ = [];
    parts_.push(rod(T(4.55, 0, -0.5), T(4.65, 0, cz), 0.07, 0xeeeeee, 8));        // oleo
    parts_.push(rod(T(4.3, 0, -0.6), T(4.62, 0, -1.4), 0.03, 0xeeeeee, 6));       // drag brace
    parts_.push(rod(T(4.55, 0, -1.4), T(4.8, 0, -1.8), 0.025, 0xdddddd, 6));      // torque link
    parts_.push(rod(T(4.65, -0.22, cz), T(4.65, 0.22, cz), 0.04, 0xeeeeee, 6));  // axle
    for (const sy of [-1, 1]) parts_.push(wheel(WR, 0.13, ...T(4.65, sy * 0.19, cz)));
    parts_.push(mesh(plate([[4.2, -0.12], [5.0, -0.12], [5.0, 0.12], [4.2, 0.12]], 0.2, (u, v, w) => [u, v, cz + 0.2 + w]), 0xaaaaaa, true)); // mudguard
    const H = T(4.55, 0, -0.5);
    const pv = pivot(H, parts_);
    g.add(pv);
    R.gearN = { pv, H };
    const p = addPart(g, 'gearN', [0, 0, 0], ORDER.gearN);
    setOff(p, [3.2, -1.7, 0]);
    const d = mk();
    d.add(mesh(hplate([[4.0, -0.34], [5.4, -0.3], [5.4, 0.3], [4.0, 0.34]], -0.62, 0.04), 0xbababa, true));
    const q = addPart(d, 'door', [-3.6, 0, -1.2], ORDER.door);
    setOff(q, [3.6, -1.2, 0]);
  }

  // ---------- paired parts ----------
  for (const s of [1, -1]) {
    // LERX / centre wing root plate
    {
      const g = mk();
      g.add(mesh(hplate([[6.4, 0.7], [7.4, 0.78], [8.3, 0.92], [9.1, 1.16], [9.8, 1.55], [10.45, 2.0], [10.9, 2.6], [15.8, 2.6], [16.0, 1.0], [15, 0.75], [8, 0.7]], 0.0, 0.09, s), PLATE, true));
      g.add(strip([[8.6, s * 0.95, 0.05], [10.3, s * 2.2, 0.05]], 0.03, 0x666666));
      g.add(strip([[11.5, s * 0.95, 0.05], [11.7, s * 2.55, 0.05]], 0.03, 0x666666));
      g.add(strip([[7.0, s * 0.8, 0.05], [9.5, s * 1.4, 0.05]], 0.025, 0x777777)); // LERX edge
      addPart(g, 'lerx', [OFF.lerx[0], OFF.lerx[1] * s, OFF.lerx[2]], ORDER.lerx);
    }
    // Canard (all-moving, pivots about ~mid-chord)
    {
      const g = mk();
      const c = mesh(hplate([[7.9, 1.15], [10.0, 3.3], [10.6, 3.3], [9.6, 1.15]], 0.2, 0.07, s), 0xdcdcdc, true);
      const line = strip([[8.6, s * 1.4, 0.24], [9.8, s * 3.1, 0.24]], 0.025, 0x555555);
      g.add(mesh(hplate([[7.7, 0.85], [7.9, 1.15], [9.6, 1.15], [9.8, 0.85]], 0.18, 0.1, s), 0xbdbdbd, true)); // root fairing
      const pv = pivot(T(8.75, s * 1.15, 0.2), [c, line]);
      g.add(pv);
      R.canards.push(pv);
      addPart(g, 'canard', [OFF.canard[0], OFF.canard[1] * s, OFF.canard[2]], ORDER.canard);
    }
    // Intake
    {
      const g = mk();
      const zc = -0.675, yc = s * 1.45;
      const rings = [];
      for (const [x, rk] of [[6.8, 0.55], [7.4, 0], [8.3, 0], [9.6, 0]]) {
        const r = sec(x, 0.45, 0.575, 0.575, zc, 10, 24, yc).map((p) => {
          const f = (p[2] - (zc - 0.575)) / 1.15;
          return [p[0] + rk * f, p[1], p[2]];
        });
        rings.push(r);
      }
      g.add(mesh(loft(rings), 0xc9c9c9));
      g.add(mesh(fan(sec(8.2, 0.42, 0.54, 0.54, zc, 10, 24, yc)), DARK, true));
      g.add(mesh(vplate([[6.15, -0.1], [7.45, -0.1], [7.45, -1.2], [6.75, -1.2]], s * 0.97, 0.04), 0xbbbbbb, true));
      g.add(strip([[6.9, s * 1.45, -0.1], [8.6, s * 1.45, -0.12]], 0.03, 0x555555)); // ramp line
      addPart(g, 'intake', [OFF.intake[0], OFF.intake[1] * s, OFF.intake[2]], ORDER.intake);
    }
    // Nacelle
    {
      const g = mk();
      const NAC = [
        [9.0, 0.45, 0.55, 0.575, 6], [9.8, 0.5, 0.6, 0.6, 4], [11, 0.6, 0.625, 0.625, 2.6],
        [13, 0.625, 0.625, 0.625, 2.2], [17, 0.62, 0.62, 0.62, 2.1], [19.1, 0.58, 0.58, 0.58, 2],
      ];
      const rings = [];
      for (let x = 9.0; x <= 19.101; x += 0.5) {
        const [w, top, bot, p] = hermite(NAC, Math.min(19.1, x));
        rings.push(sec(Math.min(19.1, x), w, top, bot, -0.675, p, 24, s * 1.5));
      }
      g.add(mesh(loft(rings), AIR));
      g.add(strip([[10.4, s * 1.5, -0.05], [18.0, s * 1.5, -0.1]], 0.025, 0x777777));
      for (const x of [12.5, 15.0, 17.2]) g.add(strip([[x, s * 0.9, -0.55], [x, s * 1.5, -0.04], [x, s * 2.1, -0.55]], 0.02, 0x707070, [1, 0, 0])); // access panel rings
      addPart(g, 'nacelle', [OFF.nacelle[0], OFF.nacelle[1] * s, OFF.nacelle[2]], ORDER.nacelle);
    }
    // Nozzle + afterburner plume
    {
      const g = mk();
      const rings = [];
      for (const [x, r] of [[19.1, 0.58], [19.55, 0.55], [20.2, 0.5]]) {
        const ring = sec(x, r, r, r, -0.675, 2, 36, s * 1.5);
        ring.forEach((p, j) => {
          const k = j % 2 ? 0.95 : 1;
          p[1] = s * 1.5 + (p[1] - s * 1.5) * k;
          p[2] = -0.675 + (p[2] + 0.675) * k;
        });
        rings.push(ring);
      }
      const nozG = loft(rings);
      {
        const hot = [[0.34, 0.20, 0.08], [0.26, 0.17, 0.10], [0.12, 0.15, 0.30]]; // bronze -> heat-blued titanium
        const pc = [], N = rings[0].length;
        for (let i = 0; i < nozG.attributes.position.count; i++) pc.push(...hot[Math.min(2, Math.floor(i / N))]);
        nozG.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
      }
      g.add(mesh(nozG, 0x6e6e6e, true));
      const inner = [];
      for (const x of [19.3, 19.9]) inner.push(sec(x, 0.44, 0.44, 0.44, -0.675, 2, 24, s * 1.5));
      g.add(mesh(loft(inner), DARK));
      g.add(mesh(fan(sec(19.95, 0.44, 0.44, 0.44, -0.675, 2, 24, s * 1.5)), DARK, true));
      // plume: outer sheath, hot core, shock diamonds. Emissive (MeshBasic), additive.
      const pl = new THREE.Group();
      pl.position.set(...T(20.15, s * 1.5, -0.675));
      pl.visible = false;
      const outer = new THREE.Mesh(lathePlume(8.5, 0.5, 0.2, 0.8, 16, [1, 0.5, 0.14], [0.4, 0.38, 1.0]), PLUME_MAT());
      const core = new THREE.Mesh(lathePlume(5.6, 0.34, 0.1, 0.8, 16, [1, 0.92, 0.62], [0.9, 0.8, 1.0]), PLUME_MAT());
      pl.add(outer, core);
      const diamonds = [];
      const dm = new THREE.MeshBasicMaterial({ color: 0xa8b8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      for (let i = 0; i < 6; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), dm);
        const d0 = 0.9 + i * 1.0;
        d.position.set(-d0, 0, 0);
        d.scale.set(0.38 - i * 0.03, 0.27 - i * 0.03, 0.27 - i * 0.03);
        diamonds.push({ m: d, d0 });
        pl.add(d);
      }
      g.add(pl);
      R.plumes.push({ g: pl, outer, core, diamonds, ph: s * 1.7 });
      addPart(g, 'nozzle', [OFF.nozzle[0], OFF.nozzle[1] * s, OFF.nozzle[2]], ORDER.nozzle);
    }
    // Wing: fixed inner panel + folding outer panel, flaperon (inner) and aileron (outer)
    {
      const g = mk();
      const cs = [0, 0.04, 0.12, 0.25, 0.4, 0.55, CH];
      const csRear = [CH, 0.78, 0.86, 0.94, 1];
      const frontRing = (y) => {
        const r = cs.map((c) => wingPt(y, c, s));
        for (let k = cs.length - 2; k >= 1; k--) {
          const c = cs[k];
          r.push([lerp(wingLE(y), wingTE(y), c), s * y, WZC - 0.4 * wingTh(y) * prof(c)]);
        }
        return r;
      };
      const rearRing = (y) => {
        const r = csRear.map((c) => wingPt(y, c, s));
        for (let k = csRear.length - 2; k >= 1; k--) {
          const c = csRear[k];
          r.push([lerp(wingLE(y), wingTE(y), c), s * y, WZC - 0.4 * wingTh(y) * prof(c)]);
        }
        return r;
      };
      const ysIn = [WROOT, 3.2, 3.9, 4.6, WFOLD], ysOut = [WFOLD, 5.3, 6.0, 6.7, WTIP];
      g.add(mesh(loft(ysIn.map(frontRing), { capStart: true, capEnd: true }), 0xd6d6d6));
      const line = (list, y0, y1, c0, c1, w = 0.035) => {
        const pts = [];
        for (let i = 0; i <= 4; i++) pts.push(wingPt(lerp(y0, y1, i / 4), lerp(c0, c1, i / 4), s, 0.012));
        list.push(strip(pts, w, 0x4d4d4d));
      };
      const inner = [], outerL = [];
      line(inner, 2.7, 4.8, 0.2, 0.2, 0.03); // slat joint
      line(outerL, 5.0, 7.25, 0.2, 0.2, 0.03);
      line(inner, 4.75, 4.75, 0.5, 0.72, 0.03);
      for (const m of inner) g.add(m);
      // fixed trailing-edge filler is the flaperon / aileron (hinged, below)
      const flapAt = (y0, y1) => {
        const ys = [y0, lerp(y0, y1, 0.5), y1];
        const m = mesh(loft(ys.map(rearRing), { capStart: true, capEnd: true }), 0xd0d0d0);
        const A = T(lerp(wingLE(y0), wingTE(y0), CH), s * y0, WZC);
        const B = T(lerp(wingLE(y1), wingTE(y1), CH), s * y1, WZC);
        const axis = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]).multiplyScalar(s).normalize();
        return { m, A, axis };
      };
      // flaperon (inner)
      {
        const f = flapAt(WROOT, WFOLD);
        const pv = pivot(f.A, [f.m]);
        g.add(pv);
        R.flaps.push({ pv, axis: f.axis });
      }
      // hinge fairing along the fold line (top surface)
      g.add(rod(T(wingLE(WFOLD) + 0.4, s * WFOLD, WZC + 0.17), T(wingTE(WFOLD) - 0.4, s * WFOLD, WZC + 0.1), 0.07, 0x9a9a9a, 6));
      // outer panel: wing, aileron, wingtip launch rail. Hinge axis is along the fold line (x direction).
      const outerMeshes = [mesh(loft(ysOut.map(frontRing), { capStart: true, capEnd: true }), 0xd6d6d6), ...outerL];
      outerMeshes.push(mesh(vplate([[13.9, -0.06], [16.95, -0.06], [16.95, -0.2], [14.3, -0.2]], s * 7.36, 0.08), 0xc0c0c0, true));
      outerMeshes.push(mesh(vplate([[13.95, -0.04], [14.3, -0.04], [14.3, -0.2], [14.1, -0.2]], s * 7.36, 0.14), 0xb0b0b0, true));
      const FP = T(13.0, s * WFOLD, WZC + 0.05);
      const ail = flapAt(WFOLD, WTIP);
      const ailPivot = pivot(ail.A, [ail.m], FP);
      const foldPv = pivot(FP, outerMeshes);
      foldPv.add(ailPivot);
      g.add(foldPv);
      R.wingFold.push({ pv: foldPv, s });
      R.aileron.push({ pv: ailPivot, axis: ail.axis });
      addPart(g, 'wing', [OFF.wing[0], OFF.wing[1] * s, OFF.wing[2]], ORDER.wing);
    }
    // Tail boom + vertical tail + ventral fin
    {
      const g = mk();
      const yb = s * 2.35;
      const boom = [];
      for (const [x, r] of [[13.2, 0.04], [13.8, 0.2], [14.6, 0.31], [15.5, 0.33], [19, 0.33], [19.8, 0.26], [20.3, 0.1], [20.45, 0]]) {
        boom.push(sec(x, r, r + 0.02, r, -0.2, 2.2, 20, yb));
      }
      g.add(mesh(loft(boom), AIR));
      g.add(mesh(vplate([[15.0, 0.1], [17.7, 3.25], [18.9, 3.25], [19.4, 0.1]], yb, 0.12), 0xbfbfbf, true));
      for (const side of [-1, 1]) {
        const yy = yb + side * 0.067;
        g.add(strip([[18.55, yy, 0.15], [18.45, yy, 1.5], [18.4, yy, 3.2]], 0.04, 0x4d4d4d, [0, 1, 0]));
        g.add(strip([[16.0, yy, 0.9], [17.3, yy, 2.1]], 0.025, 0x707070, [0, 1, 0]));
        g.add(strip([[17.2, yy, 3.0], [18.6, yy, 3.0]], 0.02, 0x707070, [0, 1, 0]));
      }
      g.add(mesh(vplate([[17.65, 3.25], [18.92, 3.25], [18.92, 3.4], [17.78, 3.4]], yb, 0.16), 0xe6e6e6, true));
      g.add(mesh(vplate([[16.0, -0.4], [17.8, -0.4], [17.55, -1.43], [16.9, -1.43]], yb, 0.1), 0xbfbfbf, true));
      // Red stars (white outline) on both faces of the fin
      const star = (cx, cz, R) => {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.4 : R;
          pts.push([cx + rr * Math.cos(a) * 0.9, cz + rr * Math.sin(a)]);
        }
        return pts;
      };
      for (const side of [-1, 1]) {
        g.add(mesh(vplate(star(17.55, 1.75, 0.84), yb + side * 0.066, 0.012), 0xf4f4f4, true, true));
        g.add(mesh(vplate(star(17.55, 1.75, 0.66), yb + side * 0.072, 0.012), 0xd01818, true, true));
      }
      addPart(g, 'tail', [OFF.tail[0], OFF.tail[1] * s, OFF.tail[2]], ORDER.tail);
    }
    // All-moving stabilator, outer panel folds up
    {
      const g = mk();
      const YF = 3.6;
      const fx0 = 17.7 + 2.5 * ((YF - 2.35) / 2.6), fx1 = 20.6 + 0.4 * ((YF - 2.35) / 2.6);
      const inb = mesh(hplate([[17.7, 2.35], [fx0, YF], [fx1, YF], [20.6, 2.35]], -0.2, 0.1, s), 0xd8d8d8, true);
      const outb = mesh(hplate([[fx0, YF], [20.2, 4.95], [21.0, 4.95], [fx1, YF]], -0.2, 0.1, s), 0xd8d8d8, true);
      const l1 = strip([[18.9, s * 2.4, -0.14], [fx0 + 0.1, s * YF, -0.14]], 0.03, 0x555555);
      const l2 = strip([[fx0 + 0.1, s * YF, -0.14], [20.2, s * 4.9, -0.14]], 0.03, 0x555555);
      const PP = T(19.4, s * 2.35, -0.2);
      const FPt = T(19.8, s * YF, -0.2);
      const fold = pivot(FPt, [outb, l2], PP);
      const pitch = pivot(PP, [inb, l1]);
      pitch.add(fold);
      g.add(pitch);
      R.stabs.push(pitch);
      R.stabFold.push({ pv: fold, s });
      addPart(g, 'stab', [OFF.stab[0], OFF.stab[1] * s, OFF.stab[2]], ORDER.stab);
    }
    // Main gear
    {
      const g = mk();
      const yy = s * 1.5;
      const items = [
        rod(T(12.2, yy, -1.1), T(12.3, yy, -2.3), 0.075, 0xeeeeee, 8),
        rod(T(12.9, yy, -1.0), T(12.35, yy, -1.9), 0.04, 0xeeeeee, 6),
        rod(T(11.9, yy, -1.0), T(12.3, yy, -1.7), 0.03, 0xaaaaaa, 6),
        wheel(0.5, 0.3, ...T(12.3, yy, -2.3)),
        wheel(0.26, 0.34, ...T(12.3, yy, -2.3), 0xdddddd),
      ];
      const H = T(12.2, yy, -1.1);
      const pv = pivot(H, items);
      g.add(pv);
      R.gearM.push({ pv, H, s });
      const p = addPart(g, 'gearM', [0, 0, 0], ORDER.gearM);
      setOff(p, [0, -1.8, 0]);
      const d = mk();
      d.add(mesh(hplate([[11.7, 1.05], [13.4, 1.05], [13.4, 1.95], [11.7, 1.95]], -1.33, 0.04, s), 0xbababa, true));
      const q = addPart(d, 'door', [4.6, 0, 0], ORDER.door);
      setOff(q, [-4.6, -1.2, 0]);
    }
  }

  // ---------- missiles ----------
  const missiles = [];
  const outerMsl = []; // missiles outboard of the wing fold: follow the outer panel
  if (withMissiles) {
    for (const s of [-1, 1]) {
      MSL.forEach(([kind, xn, y, z, hang], slot) => {
        const g = missile(kind, hang);
        g.position.set(...T(xn + MK[kind].L / 2, s * y, z));
        const p = addPart(g, 'missile', [0, 0, 0], ORDER.missile + slot * 0.15 + (s > 0 ? 0.05 : 0), { m: { kind, s, slot } });
        const entry = {
          mesh: g, kind, side: s, station: slot, part: p, launched: false,
          // Detach from the airframe: returns the missile Object3D re-expressed in WORLD space
          // (no parent). Add it to your scene and fly it. The airframe stops managing it.
          detach() {
            root.updateWorldMatrix(true, false);
            g.updateWorldMatrix(true, false);
            const m = g.matrixWorld.clone();
            g.removeFromParent();
            const i = parts.indexOf(p);
            if (i >= 0) parts.splice(i, 1);
            m.decompose(g.position, g.quaternion, g.scale);
            entry.launched = true;
            return g;
          },
        };
        missiles.push(entry);
        if (y > WFOLD) outerMsl.push({ p, s });
      });
    }
  }

  // ---------- flare dispensers (airframe-local positions) ----------
  const flareOrigins = [];
  for (const s of [-1, 1]) {
    flareOrigins.push(new THREE.Vector3(...T(19.0, s * 2.35, -0.2 + 0.36)));  // tail boom, aft
    flareOrigins.push(new THREE.Vector3(...T(20.4, s * 0.16, 0.05)));          // stinger sides
  }

  // ---------- rig ----------
  const state = { ab: 0, glow: 0 };
  const rig = {
    // Outer wing panels fold up about the fold line (0 = spread, 1 = vertical-ish).
    setWingFold(f) {
      for (const w of R.wingFold) w.pv.rotation.x = -w.s * 1.75 * f;
      for (const m of outerMsl) {
        if (f === 0 && !m.on) continue;
        const a = -m.s * 1.75 * f, c = Math.cos(a), sn = Math.sin(a);
        const H = T(13.0, m.s * WFOLD, WZC + 0.05), b = m.p.base;
        const dy = b.y - H[1], dz = b.z - H[2];
        m.p.g.position.set(b.x, H[1] + dy * c - dz * sn, H[2] + dy * sn + dz * c);
        m.p.g.rotation.x = a;
        m.on = f !== 0;
      }
    },
    // Stabilator outer panels fold up.
    setStabFold(f) { for (const w of R.stabFold) w.pv.rotation.x = -w.s * 1.4 * f; },
    // Canards (rad, + = trailing edge down), both together.
    setCanards(rad) { for (const c of R.canards) c.rotation.z = rad; },
    // All-moving stabilators (rad, + = trailing edge down), both together.
    setStabs(rad) { for (const c of R.stabs) c.rotation.z = rad; },
    // Flaperons + ailerons droop (0..1).
    setFlaps(f) {
      for (const a of R.flaps) a.pv.quaternion.setFromAxisAngle(a.axis, 0.6 * f);
      for (const a of R.aileron) a.pv.quaternion.setFromAxisAngle(a.axis, 0.38 * f);
    },
    // 0 = retracted (hidden in the belly/intake tunnel), 1 = extended and on the ground at y = GROUND_Y.
    setGear(f) {
      const k = 1 - clamp01(f);
      R.gearN.pv.rotation.z = -k * 1.5;
      R.gearN.pv.position.set(R.gearN.H[0], R.gearN.H[1] + k * 0.45, R.gearN.H[2]);
      for (const m of R.gearM) {
        m.pv.rotation.x = m.s * k * 1.5;
        m.pv.position.set(m.H[0], m.H[1] + k * 0.5, m.H[2]);
      }
    },
    // Arrestor hook (0 = stowed, 1 = down).
    setHook(f) { R.hook.pv.rotation.z = 0.8 * clamp01(f); },
    // Dorsal airbrake (0..1).
    setAirbrake(f) { R.airbrake.rotation.z = 0.85 * clamp01(f); },
    // In-flight refuelling probe extends forward (0..1).
    setProbe(f) { R.probe.position.x = 1.7 * clamp01(f); },
    // Afterburner plumes with shock diamonds behind both nozzles. glow = nozzle emissive (default = ab).
    setAfterburner(v, glow = v) {
      state.ab = clamp01(v);
      nozMat.emissive.setRGB(clamp01(glow), clamp01(glow) * 0.34, clamp01(glow) * 0.07);
      for (const p of R.plumes) {
        p.g.visible = state.ab > 0.02;
        if (!p.g.visible) p.g.scale.setScalar(1e-4); // keep hidden plumes out of bounding boxes
      }
      rig.update(0);
    },
    // Flicker; called by the model's update(t). Safe to call each frame.
    update(t = 0) {
      const a = state.ab;
      for (const p of R.plumes) {
        if (!p.g.visible) continue;
        const f = 1 + 0.05 * Math.sin(t * 41 + p.ph) + 0.03 * Math.sin(t * 67 + p.ph * 2);
        const len = (0.25 + 0.75 * a) * f;
        p.g.scale.set(len, 0.55 + 0.45 * a, 0.55 + 0.45 * a);
        p.diamonds.forEach((d, i) => {
          d.m.position.x = -(d.d0 + 0.08 * Math.sin(t * 29 + i * 1.3 + p.ph));
          d.m.visible = a > 0.35 + i * 0.07;
        });
      }
    },
    // Convenience: apply a set of settings at once.
    set(o = {}) {
      if (o.fold != null) rig.setWingFold(o.fold);
      if (o.stabFold != null) rig.setStabFold(o.stabFold);
      if (o.canards != null) rig.setCanards(o.canards);
      if (o.stabs != null) rig.setStabs(o.stabs);
      if (o.flaps != null) rig.setFlaps(o.flaps);
      if (o.gear != null) rig.setGear(o.gear);
      if (o.hook != null) rig.setHook(o.hook);
      if (o.airbrake != null) rig.setAirbrake(o.airbrake);
      if (o.probe != null) rig.setProbe(o.probe);
      if (o.ab != null) rig.setAfterburner(o.ab);
    },
    missiles,
    flareOrigins,
  };
  rig.set({ fold: 0, stabFold: 0, canards: 0, stabs: 0, flaps: 0, gear: 0, hook: 0, airbrake: 0, probe: 0, ab: 0 });

  return {
    root, parts, rig,
    update: (t) => rig.update(t),
    dims: { LEN, SPAN, OX, GROUND_Y },
    T,
  };
}
