// Su-33 (Flanker-D) scene: lofted procedural jet with monochrome camo, fly-in to a banked front-3/4 hero shot
// -> crane to top-down -> exploded view. Framing is fitted to the real vertex cloud every step.
// Model space (metres): x = aft from nose tip, y = right, z = up. Scene axes: nose +X, up +Y, right +Z.
// Everything is deterministic from t.

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const smooth = (a, b, v) => {
  const k = clamp01((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};

const FOV = 30;
const LEN = 21.2;
const SPAN = 14.7;
const OX = 10.6; // model x of the scene origin
const T = (x, y, z) => [OX - x, z, y];
const ID = (x, y, z) => [x, y, z];
const T_EXPLODE = 9;
const T_HOLD = 13;

// Monotone-ish cubic interpolation through rows [x, v1, v2, ...].
function hermite(tab, x) {
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

// ---------- fuselage tables ----------
// radome: [x, r, zc]
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
const fusTop = (x) => {
  const [, top, , zc] = (() => { const v = hermite(FUS, Math.max(3, Math.min(21, x))); return [v[0], v[1], v[2], v[3]]; })();
  return zc + top;
};
// canopy bubble: [x, halfwidth, height above fuselage top]
const CANOPY = [
  [4.45, 0, 0], [4.7, 0.28, 0.26], [5.2, 0.46, 0.5], [5.8, 0.5, 0.6],
  [6.4, 0.46, 0.55], [7.0, 0.34, 0.34], [7.5, 0.15, 0.12], [7.7, 0, 0],
];

// airfoil-ish wing
const wingLE = (y) => 10.9 + 0.82 * (y - 2.6);
const wingTE = (y) => lerp(15.8, 16.2, (y - 2.6) / 4.75);
const wingTh = (y) => lerp(0.36, 0.12, (y - 2.6) / 4.75);
const WZC = -0.1;
const prof = (c) => (c <= 0.3 ? Math.pow(c / 0.3, 0.6) : Math.pow((1 - c) / 0.7, 0.9));
const wingPt = (y, c, s, off = 0) => [
  lerp(wingLE(y), wingTE(y), c), s * y, WZC + 0.5 * wingTh(y) * prof(c) + off,
];

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

export function createSu33Scene(ctx) {
  const { THREE } = ctx;
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(FOV, ctx.aspect, 1, 800);
  const tanH = Math.tan((FOV * Math.PI) / 360);

  // ---------- lights ----------
  const key = new THREE.DirectionalLight(0xffffff, 3.6);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xffffff, 2.4);
  scene.add(rim, rim.target);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 1.2));

  // ---------- helpers ----------
  const mats = {};
  const CAMO = new Set([0xd0d0d0, 0xc4c4c4, 0xcdcdcd, 0xd6d6d6, 0xdcdcdc, 0xd8d8d8, 0xc9c9c9, 0xbcbcbc, 0xbdbdbd, 0xbfbfbf, 0xbababa]);
  const GLOSS = { 0x2a2a2a: [0.12, 0.2], 0x6e6e6e: [0.3, 0.7] }; // canopy glass, nozzle metal
  const mat = (c, flat = false, off = false) => {
    const k = `${c}|${flat}|${off}`;
    if (mats[k]) return mats[k];
    const [rough, metal] = GLOSS[c] || [0.42, 0.12];
    const m = new THREE.MeshStandardMaterial({
      color: c, flatShading: flat, roughness: rough, metalness: metal, side: THREE.DoubleSide,
      polygonOffset: off, polygonOffsetFactor: off ? -2 : 0, polygonOffsetUnits: off ? -2 : 0,
    });
    if (CAMO.has(c)) {
      // Monochrome naval camo: 3 soft-edged tones from 3D value noise in airframe space.
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
float camo(vec3 p){
  p = vec3(p.x * 0.55, p.y * 0.2, p.z * 0.42);
  float n = 0.6 * vn(p + 3.1) + 0.3 * vn(p * 2.1 + 7.7) + 0.1 * vn(p * 4.3);
  float a = smoothstep(0.44, 0.47, n), b = smoothstep(0.56, 0.59, n);
  return mix(1.0, mix(0.8, 0.64, b), a);
}`)
          .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= camo(vCamo);');
      };
      m.customProgramCacheKey = () => 'su33camo';
    }
    return (mats[k] = m);
  };
  const mesh = (geo, c, flat = false, off = false) => new THREE.Mesh(geo, mat(c, flat, off));

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
  // Flat fan over one ring (e.g. dark intake back plate).
  const fan = (ring) => loft([ring, ring], { capStart: true });

  // Thin extruded plate. poly in 2D, extruded `depth`; map(u,v,w) -> model xyz.
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
    const g = new THREE.CylinderGeometry(rad, rad, w, 16);
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

  // ---------- part registry ----------
  const root = new THREE.Group();
  scene.add(root);
  const parts = [];
  const addPart = (g, kind, off, ord, extra = {}) => {
    root.add(g);
    const p = {
      g, kind, off: [-off[0], off[2], off[1]], base: g.position.clone(), order: ord, ...extra,
    };
    p.off0 = p.off.slice();
    parts.push(p);
    return p;
  };

  const AIR = 0xd0d0d0, AIR2 = 0xc4c4c4, PLATE = 0xcdcdcd, DARK = 0x070707;

  // ---------- fuselage + radome ----------
  {
    const g = mk();
    const rings = [];
    for (let x = 3; x <= 21.001; x += 0.5) {
      const [w, top, bot, zc, p] = hermite(FUS, Math.min(21, x));
      rings.push(sec(Math.min(21, x), w, top, bot, zc, p));
    }
    g.add(mesh(loft(rings), AIR));
    // belly keel plate between nacelles (flat pancake underside)
    g.add(mesh(hplate([[8.2, -0.8], [8.2, 0.8], [15.0, 0.75], [15.0, -0.75]], -0.76, 0.05), AIR2, true));
    // panel line down the spine
    g.add(strip([[7.6, 0, 0.72], [9.6, 0, 0.82], [13, 0, 0.52]], 0.04, 0x5a5a5a));
    addPart(g, 'fus', OFF.fus, ORDER.fus);
  }
  {
    const g = mk();
    const rings = RADOME.map(([x, r, zc]) => sec(x, r, r, r, zc, 2, 24));
    g.add(mesh(loft(rings, { capEnd: false }), 0xe4e4e4));
    g.add(rod(T(0.1, 0, -0.17), T(-0.55, 0, -0.17), 0.028, 0xdddddd, 6)); // pitot
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
    // centre rail along the canopy
    const rail = [];
    for (let x = 4.7; x <= 7.5; x += 0.2) rail.push([x, 0, fusTop(x) + hermite(CANOPY, x)[1] + 0.01]);
    g.add(strip(rail, 0.05, 0xf2f2f2, [0, 1, 0]));
    // IRST ball
    const ball = new THREE.SphereGeometry(0.17, 12, 10);
    const bm = mesh(ball, 0x1e1e1e);
    bm.position.set(...T(4.15, 0.2, fusTop(4.15) + 0.04));
    g.add(bm);
    const fair = [sec(3.7, 0.04, 0.04, 0.04, fusTop(3.7) + 0.0, 2, 12, 0.2), sec(4.15, 0.16, 0.17, 0.12, fusTop(4.15), 2, 12, 0.2),
      sec(4.6, 0.12, 0.1, 0.08, fusTop(4.6) + 0.02, 2, 12, 0.2)];
    g.add(mesh(loft(fair), AIR));
    // refuelling probe bulge (port side)
    const pr = [];
    for (const [x, k] of [[4.3, 0.05], [4.7, 0.9], [5.4, 1], [6.0, 0.4]]) {
      pr.push(sec(x, 0.09 * k, 0.09 * k, 0.05 * k, fusTop(x) + 0.1, 2, 10, -0.48));
    }
    g.add(mesh(loft(pr), 0xbdbdbd));
    addPart(g, 'canopy', OFF.canopy, ORDER.canopy);
  }
  // ---------- dorsal airbrake ----------
  {
    const g = mk();
    g.add(mesh(plate([[7.9, -0.45], [9.9, -0.52], [9.9, 0.52], [7.9, 0.45]], 0.06,
      (u, v, w) => [u, v, fusTop(u) + w - 0.01]), 0xbcbcbc, true));
    g.add(strip([[8.0, -0.4, fusTop(8) + 0.06], [9.8, -0.46, fusTop(9.8) + 0.06]], 0.025, 0x4a4a4a));
    g.add(strip([[8.0, 0.4, fusTop(8) + 0.06], [9.8, 0.46, fusTop(9.8) + 0.06]], 0.025, 0x4a4a4a));
    addPart(g, 'airbrake', OFF.airbrake, ORDER.airbrake);
  }

  // ---------- fixed single stinger boom pieces are in fuselage; arrestor hook ----------
  {
    const g = mk();
    g.add(rod(T(18.0, 0, -0.3), T(20.5, 0, -0.55), 0.06, 0xb0b0b0, 6));
    g.add(rod(T(20.5, 0, -0.55), T(20.85, 0, -0.35), 0.05, 0xe0e0e0, 6));
    g.add(mesh(plate([[17.9, -0.22], [19.1, -0.22], [19.1, 0.22], [17.9, 0.22]], 0.04, (u, v, w) => [u, v, -0.34 + w]), 0xa8a8a8, true));
    addPart(g, 'hook', OFF.hook, ORDER.hook);
  }

  // ---------- gear ----------
  const NOSE_RET = 1.5, MAIN_RET = 1.6;
  {
    const g = mk(0, NOSE_RET, 0);
    g.add(rod(T(4.55, 0, -0.5), T(4.65, 0, -1.5), 0.06, 0xbbbbbb, 8));
    g.add(rod(T(4.3, 0, -0.6), T(4.62, 0, -1.2), 0.03, 0xbbbbbb, 6));
    g.add(rod(T(4.65, -0.2, -1.65), T(4.65, 0.2, -1.65), 0.035, 0xbbbbbb, 6));
    for (const sy of [-1, 1]) g.add(wheel(0.3, 0.13, ...T(4.65, sy * 0.15, -1.65)));
    addPart(g, 'gearN', [0, 0, -(NOSE_RET + 1.7)].map((v, i) => (i === 2 ? v : v)), ORDER.gearN);
    parts[parts.length - 1].off = [3.2, -(NOSE_RET + 1.7), 0];
    parts[parts.length - 1].off0 = parts[parts.length - 1].off.slice();
    const d = mk();
    d.add(mesh(hplate([[4.0, -0.34], [5.4, -0.3], [5.4, 0.3], [4.0, 0.34]], -0.62, 0.04), 0xbababa, true));
    addPart(d, 'door', [-3.6, 0, -1.2], ORDER.door);
    parts[parts.length - 1].off = [3.0 + 0.6, -1.2, 0];
    parts[parts.length - 1].off0 = parts[parts.length - 1].off.slice();
  }

  // ---------- paired parts ----------
  for (const s of [1, -1]) {
    // LERX / centre wing root plate
    {
      const g = mk();
      g.add(mesh(hplate([[6.4, 0.7], [7.4, 0.78], [8.3, 0.92], [9.1, 1.16], [9.8, 1.55], [10.45, 2.0], [10.9, 2.6], [15.8, 2.6], [16.0, 1.0], [15, 0.75], [8, 0.7]], 0.0, 0.09, s), PLATE, true));
      // panel lines on LERX
      g.add(strip([[8.6, s * 0.95, 0.05], [10.3, s * 2.2, 0.05]], 0.03, 0x666666));
      g.add(strip([[11.5, s * 0.95, 0.05], [11.7, s * 2.55, 0.05]], 0.03, 0x666666));
      addPart(g, 'lerx', [OFF.lerx[0], OFF.lerx[1] * s, OFF.lerx[2]], ORDER.lerx);
    }
    // Canard
    {
      const g = mk();
      g.add(mesh(hplate([[7.9, 1.15], [10.0, 3.3], [10.6, 3.3], [9.6, 1.15]], 0.2, 0.07, s), 0xdcdcdc, true));
      g.add(mesh(hplate([[7.7, 0.85], [7.9, 1.15], [9.6, 1.15], [9.8, 0.85]], 0.18, 0.1, s), 0xbdbdbd, true)); // root fairing
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
      const back = sec(8.2, 0.42, 0.54, 0.54, zc, 10, 24, yc);
      g.add(mesh(fan(back), DARK, true));
      // splitter plate
      g.add(mesh(vplate([[6.15, -0.1], [7.45, -0.1], [7.45, -1.2], [6.75, -1.2]], s * 0.97, 0.04), 0xbbbbbb, true));
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
      g.add(strip([[10.4, s * 1.5, -0.05], [18.0, s * 1.5, -0.1]], 0.025, 0x777777)); // top seam
      addPart(g, 'nacelle', [OFF.nacelle[0], OFF.nacelle[1] * s, OFF.nacelle[2]], ORDER.nacelle);
    }
    // Nozzle
    {
      const g = mk();
      const rings = [];
      for (const [x, r] of [[19.1, 0.58], [19.55, 0.55], [20.2, 0.5]]) {
        const ring = sec(x, r, r, r, -0.675, 2, 32, s * 1.5);
        ring.forEach((p, j) => {
          const k = j % 2 ? 0.955 : 1;
          p[1] = s * 1.5 + (p[1] - s * 1.5) * k;
          p[2] = -0.675 + (p[2] + 0.675) * k;
        });
        rings.push(ring);
      }
      g.add(mesh(loft(rings), 0x6e6e6e, true));
      const inner = [];
      for (const x of [19.3, 19.9]) inner.push(sec(x, 0.44, 0.44, 0.44, -0.675, 2, 24, s * 1.5));
      g.add(mesh(loft(inner), DARK));
      g.add(mesh(fan(sec(19.95, 0.44, 0.44, 0.44, -0.675, 2, 24, s * 1.5)), DARK));
      addPart(g, 'nozzle', [OFF.nozzle[0], OFF.nozzle[1] * s, OFF.nozzle[2]], ORDER.nozzle);
    }
    // Wing with wingtip rail
    {
      const g = mk();
      const ys = [2.6, 3.2, 3.9, 4.6, 5.3, 6.0, 6.7, 7.35];
      const cs = [0, 0.04, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 1];
      const rings = ys.map((y) => {
        const r = cs.map((c) => wingPt(y, c, s));
        for (let k = cs.length - 2; k >= 1; k--) {
          const c = cs[k];
          r.push([lerp(wingLE(y), wingTE(y), c), s * y, WZC - 0.4 * wingTh(y) * prof(c)]);
        }
        return r;
      });
      g.add(mesh(loft(rings, { capStart: true, capEnd: true }), 0xd6d6d6));
      // panel lines: wing fold, flaperon, aileron, LE slat joint
      const line = (y0, y1, c0, c1, w = 0.035) => {
        const pts = [];
        for (let i = 0; i <= 4; i++) pts.push(wingPt(lerp(y0, y1, i / 4), lerp(c0, c1, i / 4), s, 0.012));
        g.add(strip(pts, w, 0x4d4d4d));
      };
      line(4.9, 4.9, 0.0, 1.0, 0.05); // fold line
      line(2.8, 4.75, 0.72, 0.72); // flaperon hinge
      line(5.05, 7.2, 0.74, 0.76); // aileron hinge
      line(2.7, 7.25, 0.2, 0.2, 0.03); // slat line
      line(2.75, 2.75, 0.72, 1.0);
      line(4.75, 4.75, 0.72, 1.0);
      line(7.25, 7.25, 0.76, 1.0);
      // wingtip missile launch rail
      g.add(mesh(vplate([[13.9, -0.06], [16.95, -0.06], [16.95, -0.2], [14.3, -0.2]], s * 7.36, 0.08), 0xc0c0c0, true));
      g.add(mesh(vplate([[13.95, -0.04], [14.3, -0.04], [14.3, -0.2], [14.1, -0.2]], s * 7.36, 0.14), 0xb0b0b0, true));
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
      // vertical tail
      g.add(mesh(vplate([[15.0, 0.1], [17.7, 3.25], [18.9, 3.25], [19.4, 0.1]], yb, 0.12), 0xbfbfbf, true));
      for (const side of [-1, 1]) {
        const yy = yb + side * 0.067;
        g.add(strip([[18.55, yy, 0.15], [18.45, yy, 1.5], [18.4, yy, 3.2]], 0.04, 0x4d4d4d, [0, 1, 0]));
        g.add(strip([[16.0, yy, 0.9], [17.3, yy, 2.1]], 0.025, 0x707070, [0, 1, 0]));
      }
      g.add(mesh(vplate([[17.65, 3.25], [18.92, 3.25], [18.92, 3.4], [17.78, 3.4]], yb, 0.16), 0xe6e6e6, true));
      // ventral fin
      g.add(mesh(vplate([[16.0, -0.4], [17.8, -0.4], [17.55, -1.43], [16.9, -1.43]], yb, 0.1), 0xbfbfbf, true));
      addPart(g, 'tail', [OFF.tail[0], OFF.tail[1] * s, OFF.tail[2]], ORDER.tail);
    }
    // All-moving stabilator
    {
      const g = mk();
      g.add(mesh(hplate([[17.7, 2.35], [20.2, 4.95], [21.0, 4.95], [20.6, 2.35]], -0.2, 0.1, s), 0xd8d8d8, true));
      g.add(strip([[18.9, s * 2.4, -0.14], [20.2, s * 4.9, -0.14]], 0.03, 0x555555));
      addPart(g, 'stab', [OFF.stab[0], OFF.stab[1] * s, OFF.stab[2]], ORDER.stab);
    }
    // Main gear (retracted in flight)
    {
      const g = mk(0, MAIN_RET, 0);
      const yy = s * 1.5;
      g.add(rod(T(12.2, yy, -1.1), T(12.3, yy, -2.3), 0.07, 0xbbbbbb, 8));
      g.add(rod(T(12.9, yy, -1.0), T(12.35, yy, -1.9), 0.04, 0xbbbbbb, 6));
      g.add(wheel(0.5, 0.3, ...T(12.3, yy, -2.3)));
      g.add(wheel(0.26, 0.34, ...T(12.3, yy, -2.3), 0xdddddd));
      addPart(g, 'gearM', [0, 0, 0], ORDER.gearM);
      const p = parts[parts.length - 1];
      p.off = [0, -(MAIN_RET + 1.8), 0];
      p.off0 = p.off.slice();
      const d = mk();
      d.add(mesh(hplate([[11.7, 1.05], [13.4, 1.05], [13.4, 1.95], [11.7, 1.95]], -1.33, 0.04, s), 0xbababa, true));
      addPart(d, 'door', [4.6, 0, 0], ORDER.door);
      const q = parts[parts.length - 1];
      q.off = [-4.6, -1.2, 0];
      q.off0 = q.off.slice();
    }
  }

  // ---------- missiles (local axes: nose +X, built at true scale with mild exaggeration) ----------
  const MK = {
    'R-73': { L: 2.9, r: 0.115, nose: 0.75, canard: true },
    'R-27': { L: 4.0, r: 0.16, nose: 1.0, canard: false },
  };
  function missile(kind, hang) {
    const { L, r, nose, canard } = MK[kind];
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
    // seeker band
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
      addFins(finGeo(-L / 2, 0.55, 0.3, 0.2, 0.3, 0.035), 0x7a7a7a); // tail
      addFins(finGeo(bodyEnd - 0.1, 0.35, 0.27, 0.12, 0.2, 0.03), 0x7a7a7a); // canards
      addFins(finGeo(-L / 2 + 0.7, 0.9, 0.1, 0.5, 0.2, 0.03), 0xe8e8e8); // body strakes
    } else {
      addFins(finGeo(-L / 2, 0.6, 0.42, 0.25, 0.35, 0.04), 0x7a7a7a);
      addFins(finGeo(-L / 2 + 1.2, 0.8, 0.2, 0.45, 0.3, 0.035), 0x8a8a8a);
    }
    // pylon / hanger
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
  // [kind, side, nose x, y (positive), z, hang]
  const MSL = [
    ['R-73', 14.0, 7.53, -0.14, 0],
    ['R-73', 12.5, 4.3, -0.64, 0.42],
    ['R-27', 8.4, 1.45, -1.6, 0.2],
    ['R-27', 11.0, 3.0, -0.66, 0.42],
    ['R-27', 12.6, 5.6, -0.66, 0.42],
  ];
  const missileParts = [];
  for (const s of [-1, 1]) {
    MSL.forEach(([kind, xn, y, z, hang], slot) => {
      const g = missile(kind, hang);
      g.position.set(...T(xn + MK[kind].L / 2, s * y, z));
      const p = addPart(g, 'missile', [0, 0, 0], ORDER.missile + slot * 0.15 + (s > 0 ? 0.05 : 0), { m: { kind, s, slot } });
      missileParts.push(p);
    });
  }

  // ---------- layout (aspect-dependent) ----------
  const S = { aspect: ctx.aspect, Dexp: 60, cx: 0 };

  function setMissileLayout() {
    const portrait = S.aspect < 1;
    const r27 = missileParts.filter((p) => p.m.kind === 'R-27');
    const r73 = missileParts.filter((p) => p.m.kind === 'R-73');
    const place = (p, mx, my) => {
      const [X, Y, Z] = T(mx, my, 0.2);
      p.off = [X - p.base.x, Y - p.base.y, Z - p.base.z];
    };
    if (portrait) {
      r27.forEach((p, i) => (i < 5 ? place(p, 32, -4.8 + i * 2.4) : place(p, 37, 0)));
      [-4.8, -2.4, 2.4, 4.8].forEach((y, i) => place(r73[i], 37, y));
    } else {
      for (const s of [-1, 1]) {
        const mine = missileParts.filter((p) => p.m.s === s).sort((a, b) => a.m.slot - b.m.slot);
        mine.forEach((p, i) => place(p, 10.5, s * (12.6 + i * 1.15)));
      }
    }
    const zk = portrait ? 0.75 : 1;
    for (const p of parts) {
      if (p.kind === 'missile') continue;
      p.off = [p.off0[0], p.off0[1], p.off0[2] * zk];
    }
  }

  function placeParts(e0, h) {
    const k = 1 + 0.04 * h;
    for (const p of parts) {
      const e = e0(p) * k;
      p.g.position.set(p.base.x + p.off[0] * e, p.base.y + p.off[1] * e, p.base.z + p.off[2] * e);
    }
  }

  // ---------- framing: fit the real vertex cloud of the assembled jet ----------
  const PTS = [];
  {
    placeParts(() => 0, 0);
    root.updateMatrixWorld(true);
    let total = 0;
    root.traverse((o) => { if (o.isMesh) total += o.geometry.attributes.position.count; });
    const step = Math.max(1, Math.floor(total / 2500));
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const pa = o.geometry.attributes.position;
      for (let i = 0; i < pa.count; i += step) PTS.push(v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).clone());
    });
  }
  const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4();
  const _e = new THREE.Euler();
  const W = PTS.map((p) => p.clone());
  // Returns {D, tgt} so the jet (rotated by euler) fills fx/fy of the half-screen from direction dir.
  function fit(dir, up, rx, rz, fx, fy, out) {
    const th = Math.tan((camera.fov * Math.PI) / 360);
    _m.makeRotationFromEuler(_e.set(rx, 0, rz));
    const box = new THREE.Box3();
    for (let i = 0; i < PTS.length; i++) { W[i].copy(PTS[i]).applyMatrix4(_m); box.expandByPoint(W[i]); }
    const tgt = box.getCenter(out.tgt);
    let D = out.D || 50;
    for (let it = 0; it < 7; it++) {
      camera.position.copy(tgt).addScaledVector(dir, D);
      camera.up.copy(up);
      camera.lookAt(tgt);
      camera.updateMatrixWorld(true);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of W) {
        _v.copy(p).project(camera);
        if (_v.x < x0) x0 = _v.x; if (_v.x > x1) x1 = _v.x;
        if (_v.y < y0) y0 = _v.y; if (_v.y > y1) y1 = _v.y;
      }
      _r.setFromMatrixColumn(camera.matrixWorld, 0);
      _u.setFromMatrixColumn(camera.matrixWorld, 1);
      tgt.addScaledVector(_r, ((x0 + x1) / 2) * D * th * camera.aspect).addScaledVector(_u, ((y0 + y1) / 2) * D * th);
      D *= Math.max((x1 - x0) / 2 / fx, (y1 - y0) / 2 / fy);
    }
    out.D = D;
    return out;
  }
  const sph = (az, el, out = new THREE.Vector3()) =>
    out.set(-Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az));
  // Shot A: rear 3/4 from above-left, banked (ref: rear-3/4 photo). Shot B: top-down nose-up.
  const AZ_A = 2.0, EL_A = 0.6, ROLL_A = -0.15, PITCH_A = 0.04, FOV_A = 24;
  const UP_Y = new THREE.Vector3(0, 1, 0), UP_X = new THREE.Vector3(1, 0, 0);
  const DIR_A = new THREE.Vector3();
  const azA = () => (S.aspect < 1 ? 2.6 : AZ_A), elA = () => (S.aspect < 1 ? 0.72 : EL_A);
  const FA = { D: 0, tgt: new THREE.Vector3() }, FB = { D: 0, tgt: new THREE.Vector3() }, FC = { D: 0, tgt: new THREE.Vector3() };

  function setFov(f) {
    if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); }
  }
  function computeDists() {
    const a = S.aspect, portrait = a < 1;
    sph(azA(), elA(), DIR_A);
    setFov(FOV_A);
    fit(DIR_A, UP_Y, ROLL_A, PITCH_A, portrait ? 0.94 : 0.82, portrait ? 0.62 : 0.74, FA);
    setFov(FOV);
    fit(sph(0, Math.PI / 2 - 1e-4), UP_X, 0, 0, portrait ? 0.9 : 0.8, 0.8, FB);
    setMissileLayout();
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    placeParts(() => 1, 0);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const H = box.max.x - box.min.x;
    const Wd = box.max.z - box.min.z;
    S.cx = (box.max.x + box.min.x) / 2;
    S.Dexp = Math.max(H / (portrait ? 0.76 : 0.86) / (2 * tanH), Wd / (portrait ? 0.92 : 0.8) / (2 * tanH * a));
    S.Dexp = Math.max(S.Dexp, FB.D);
  }

  // ---------- state ----------
  const target = new THREE.Vector3();
  const dir = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3();
  let lastT = 0;
  function aimLights() {
    _r.setFromMatrixColumn(camera.matrixWorld, 0);
    _u.setFromMatrixColumn(camera.matrixWorld, 1);
    tmp.copy(camera.position).sub(target).normalize();
    // key: from camera's upper-left; rim: from behind the jet so the outline catches light.
    key.position.copy(target).addScaledVector(_r, -30).addScaledVector(_u, 30).addScaledVector(tmp, 20);
    key.position.y += 45; // keep the sun high in world space so top surfaces read in the top-down
    key.target.position.copy(target);
    rim.position.copy(target).addScaledVector(_r, 25).addScaledVector(_u, 20).addScaledVector(tmp, -45);
    rim.target.position.copy(target);
    key.target.updateMatrixWorld(); rim.target.updateMatrixWorld();
  }
  function applyState(t) {
    lastT = t;
    const s = easeInOutCubic(clamp01((t - 5) / 4));
    const eg = easeOutCubic(clamp01((t - T_EXPLODE) / (T_HOLD - T_EXPLODE)));
    const h = clamp01((t - T_HOLD) / 5);
    const enter = easeOutCubic(clamp01(t / 4.0));
    const live = 1 - s;

    // attitude: banked rear-3/4 cruise -> level for the top-down
    const roll = lerp(ROLL_A, 0, s) + (0.35 * (1 - enter) + 0.03 * Math.sin(t * 1.1)) * live;
    const pitch = lerp(PITCH_A, 0, s) + 0.02 * Math.sin(t * 0.8) * live;
    root.rotation.set(roll, 0, pitch);
    // fly-in: overtakes the camera from behind-right and settles into the frame
    const k = 1 - enter;
    root.position.set(-48 * k + 0.25 * Math.sin(t * 0.7) * live, 3 * k + 0.15 * Math.sin(t * 1.3) * live, -4 * k);

    placeParts((p) => easeOutCubic(clamp01((t - T_EXPLODE - p.order * 0.1) / 2.1)), h);

    setFov(t < 5 ? FOV_A : t < T_EXPLODE ? lerp(FOV_A, FOV, s) : FOV);
    if (t < 5) {
      dir.copy(DIR_A); up.copy(UP_Y); target.copy(FA.tgt);
      camera.position.copy(target).addScaledVector(dir, FA.D);
    } else if (t < T_EXPLODE) {
      // crane up and over, re-fitting the frame every step so nothing clips
      const el = lerp(elA(), Math.PI / 2 - 1e-4, s), az = lerp(azA(), 0, s);
      sph(az, el, dir);
      up.copy(UP_Y).lerp(UP_X, smooth(0.15, 0.85, s)).normalize();
      const portrait = S.aspect < 1;
      fit(dir, up, roll, pitch, lerp(portrait ? 0.94 : 0.8, portrait ? 0.9 : 0.8, s), lerp(portrait ? 0.62 : 0.74, 0.8, s), FC);
      target.copy(FC.tgt);
      camera.position.copy(target).addScaledVector(dir, FC.D);
    } else {
      // exploded view: top-down, slight tilt toward the tail during the hold so depth reads
      const tilt = 0.12 * smooth(0, 1, h);
      dir.set(-Math.sin(tilt), Math.cos(tilt), 0);
      up.copy(UP_X);
      target.set(lerp(FB.tgt.x, S.cx, eg), 0, lerp(FB.tgt.z, 0, eg));
      camera.position.copy(target).addScaledVector(dir, lerp(FB.D, S.Dexp, eg) * (1 + 0.03 * h));
    }
    camera.up.copy(up);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    aimLights();
    root.updateMatrixWorld(true);
  }

  function labels() {
    return lastT >= 1 ? [{ id: 'title', text: 'SU-33 FLANKER-D', x: 0.06, y: 0.9 }] : [];
  }

  computeDists();
  applyState(0);

  return {
    name: 'su33',
    duration: 20,
    fadeIn: false,
    fadeOut: true,
    scene,
    camera,
    update(t) {
      applyState(t);
    },
    resize(aspect) {
      S.aspect = aspect;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      computeDists();
      applyState(lastT);
    },
    labels,
  };
}
