// Procedural models: F-5E Tiger II, F-20A Tigershark, MiG-21bis.
// Model space (metres): x = aft from nose tip, y = right, z = up. Each builder returns {group, OX, nozMats, plumes}.
import { makeKit, hermite, sec, lerp, clamp01 } from './kit.js';

const DARK = 0x070707, NOZ = 0x6e6e6e, GLASS = 0x2a2a2a;

const fusTopFn = (FUS) => (x) => {
  const v = hermite(FUS, Math.max(FUS[0][0], Math.min(FUS[FUS.length - 1][0], x)));
  return v[3] + v[1];
};

function fuselage(K, FUS, color, camo, { step = 0.4, N = 26 } = {}) {
  const rings = [];
  const x0 = FUS[0][0], x1 = FUS[FUS.length - 1][0];
  for (let x = x0; x < x1 - 1e-6; x += step) {
    const [w, top, bot, zc, p] = hermite(FUS, x);
    rings.push(sec(x, w, top, bot, zc, p, N));
  }
  const [w, top, bot, zc, p] = hermite(FUS, x1);
  rings.push(sec(x1, w, top, bot, zc, p, N));
  return K.mesh(K.loft(rings, { capEnd: true }), color, { camo });
}

function canopy(K, FUS, CAN, frames) {
  const g = K.mk();
  const top = fusTopFn(FUS);
  const x0 = CAN[0][0], x1 = CAN[CAN.length - 1][0];
  const ringAt = (x, k = 1) => {
    const [w, h] = hermite(CAN, x);
    return sec(x, w * k, h * k + 0.14, 0.14, top(x) - 0.14, 2.4, 20);
  };
  const glass = [];
  for (let x = x0 + 0.01; x < x1 - 0.02; x += 0.16) glass.push(ringAt(x));
  glass.push(ringAt(x1 - 0.01));
  g.add(K.mesh(K.loft(glass), GLASS));
  for (const [a, b] of frames) {
    const r = [];
    for (let x = a; x <= b + 1e-6; x += (b - a) / 3) r.push(ringAt(x, 1.04));
    g.add(K.mesh(K.loft(r), 0xf0f0f0));
  }
  const rail = [];
  for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.2) rail.push([x, 0, top(x) + hermite(CAN, x)[1] + 0.012]);
  g.add(K.strip(rail, 0.05, 0xf0f0f0, [0, 1, 0]));
  return g;
}

function plume(K, x, y, z, r, len) {
  const geo = new K.THREE.ConeGeometry(r, len, 14, 1, true);
  geo.rotateZ(Math.PI / 2);
  geo.translate(-len / 2, 0, 0); // base at origin, tip trailing aft (-X scene)
  const m = new K.THREE.Mesh(geo, new K.THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, blending: K.THREE.AdditiveBlending, side: K.THREE.DoubleSide,
  }));
  m.position.set(...K.T(x, y, z));
  return m;
}

function nozzle(K, id, x0, x1, y, z, r0, r1, petals = 16) {
  const g = K.mk();
  const rings = [];
  for (const [x, r] of [[x0, r0], [lerp(x0, x1, 0.4), lerp(r0, r1, 0.35)], [x1, r1]]) {
    const ring = sec(x, r, r, r, z, 2, petals * 2, y);
    ring.forEach((p, j) => {
      const k = j % 2 ? 0.95 : 1;
      p[1] = y + (p[1] - y) * k;
      p[2] = z + (p[2] - z) * k;
    });
    rings.push(ring);
  }
  g.add(K.mesh(K.loft(rings), NOZ, { flat: true, id }));
  g.add(K.mesh(K.loft([sec(x0 + 0.1, r0 * 0.9, r0 * 0.9, r0 * 0.9, z, 2, 24, y), sec(x1 - 0.05, r1 * 0.88, r1 * 0.88, r1 * 0.88, z, 2, 24, y)]), DARK));
  g.add(K.mesh(K.fan(sec(x1 - 0.1, r1 * 0.88, r1 * 0.88, r1 * 0.88, z, 2, 24, y)), DARK, { flat: true }));
  return g;
}

function sideIntake(K, rows, yc, zc, s, color, camo, lipX) {
  const g = K.mk();
  const rings = rows.map(([x, w, h, p]) => sec(x, w, h, h, zc, p, 24, s * yc));
  g.add(K.mesh(K.loft(rings), color, { camo }));
  const [x, w, h, p] = rows[0];
  g.add(K.mesh(K.fan(sec(lipX, w * 0.9, h * 0.92, h * 0.92, zc, p, 24, s * yc)), DARK, { flat: true }));
  // bright lip ring
  g.add(K.mesh(K.loft([sec(x - 0.02, w * 1.04, h * 1.04, h * 1.04, zc, p, 24, s * yc), sec(x + 0.1, w * 1.0, h * 1.0, h * 1.0, zc, p, 24, s * yc)]), 0xeeeeee));
  return g;
}

// ============================ F-5E TIGER II ============================
export function buildF5E(THREE, cache) {
  const OX = 7.0;
  const K = makeKit(THREE, (x, y, z) => [OX - x, z, y], cache);
  const g = K.mk();
  const AIR = 0xd0d0d0, PL = 0xcbcbcb, C = { camo: 0 };
  const FUS = [
    [0.7, 0, 0, 0, -0.12, 2], [1.2, 0.12, 0.11, 0.09, -0.12, 2.2], [2, 0.27, 0.22, 0.2, -0.1, 2.3], [3, 0.42, 0.3, 0.3, -0.08, 2.4],
    [4, 0.56, 0.42, 0.4, -0.05, 2.5], [5, 0.7, 0.5, 0.48, -0.02, 2.6], [6, 0.8, 0.55, 0.5, 0, 2.6], [7.5, 0.8, 0.58, 0.5, 0, 2.6],
    [9, 0.74, 0.58, 0.48, 0, 2.6], [10.5, 0.68, 0.55, 0.45, 0, 2.6], [12, 0.64, 0.47, 0.4, 0, 2.5], [13.3, 0.62, 0.38, 0.36, 0, 2.4],
  ];
  const CAN = [[3.1, 0, 0], [3.35, 0.18, 0.2], [3.8, 0.32, 0.44], [4.5, 0.36, 0.52], [5.2, 0.32, 0.44], [5.8, 0.2, 0.24], [6.3, 0, 0.04]];
  const top = fusTopFn(FUS);
  g.add(fuselage(K, FUS, AIR, 0));
  g.add(K.rod(K.T(0.8, 0, -0.12), K.T(0, 0, -0.12), 0.025, 0xdddddd, 6));
  g.add(canopy(K, FUS, CAN, [[3.3, 3.5], [4.55, 4.7], [5.8, 5.95]]));
  g.add(K.strip([[6.4, 0, 0.6], [9, 0, 0.62], [12, 0, 0.48]], 0.04, 0x5a5a5a));
  // nose panel lines
  g.add(K.strip([[1.9, 0, 0.2], [3.2, 0, 0.32]], 0.03, 0x666666));

  const nozMats = [], plumes = [];
  const wingDef = (s) => ({
    ys: [0.45, 0.9, 1.5, 2.2, 2.9, 3.5, 3.92], LE: (y) => 6.1 + 0.66 * (y - 0.5), TE: (y) => 10.5 - 0.17 * (y - 0.5),
    th: (y) => lerp(0.2, 0.07, (y - 0.5) / 3.4), zc: -0.12, s,
  });
  for (const s of [1, -1]) {
    // intakes: semicircular, just behind the cockpit
    g.add(sideIntake(K, [[4.6, 0.3, 0.42, 2.4], [5.0, 0.32, 0.45, 2.4], [6.4, 0.3, 0.44, 2.4], [7.8, 0.2, 0.34, 2.4], [9.0, 0.06, 0.13, 2], [9.5, 0, 0, 2]],
      0.76, -0.02, s, AIR, 0, 4.64));
    // wing
    const W = K.wing(wingDef(s));
    g.add(K.mesh(W.geo, 0xd2d2d2, C));
    const line = (y0, y1, c0, c1, w = 0.035) => {
      const pts = [];
      for (let i = 0; i <= 4; i++) pts.push(W.pt(lerp(y0, y1, i / 4), lerp(c0, c1, i / 4), 1, 0.012));
      g.add(K.strip(pts, w, 0x4d4d4d));
    };
    line(1.95, 3.85, 0.72, 0.74); // aileron hinge
    line(0.85, 1.9, 0.7, 0.72); // flap hinge
    line(0.9, 3.85, 0.17, 0.17, 0.03); // LE flap
    line(1.93, 1.93, 0.72, 1);
    // LERX
    g.add(K.mesh(K.hplate([[4.2, 0.55], [5.4, 0.93], [6.4, 1.3], [7.0, 1.8], [7.5, 1.8], [7.5, 0.5]], -0.1, 0.06, s), PL, { camo: 0, flat: true }));
    // wingtip rail + AIM-9
    g.add(K.mesh(K.vplate([[8.3, -0.07], [10.3, -0.07], [10.3, -0.17], [8.5, -0.17]], s * 3.95, 0.08), 0xbfbfbf, { flat: true }));
    const m = K.missile({ L: 2.9, r: 0.08, nose: 0.55, tailSpan: 0.34, canSpan: 0.24 });
    m.position.set(...K.T(7.7 + 1.45, s * 4.05, -0.12));
    g.add(m);
    // all-moving tailplane
    g.add(K.mesh(K.hplate([[11.85, 0.6], [12.95, 2.1], [13.5, 2.1], [13.4, 0.6]], -0.12, 0.07, s), 0xd8d8d8, { flat: true }));
    g.add(K.strip([[12.7, s * 0.7, -0.07], [13.3, s * 2.05, -0.07]], 0.03, 0x555555));
    // twin nozzles
    const nz = nozzle(K, 'f5' + s, 12.95, 13.9, s * 0.31, 0.0, 0.31, 0.27, 12);
    g.add(nz);
    nozMats.push(K.mat(NOZ, { flat: true, id: 'f5' + s }));
    const pl = plume(K, 13.9, s * 0.31, 0, 0.26, 1.8);
    g.add(pl); plumes.push(pl);
  }
  // single swept fin
  g.add(K.mesh(K.vplate([[8.9, 0.45], [11.15, 3.0], [12.55, 3.0], [13.05, 0.4]], 0, 0.1), 0xc4c4c4, { camo: 0, flat: true }));
  g.add(K.mesh(K.vplate([[11.0, 2.98], [12.57, 2.98], [12.57, 3.12], [11.12, 3.12]], 0, 0.13), 0xe6e6e6, { flat: true }));
  for (const sd of [-1, 1]) {
    g.add(K.strip([[12.0, sd * 0.055, 0.5], [11.95, sd * 0.055, 1.8], [11.9, sd * 0.055, 2.95]], 0.04, 0x4d4d4d, [0, 1, 0]));
  }
  // dorsal fairing + belly keel
  g.add(K.mesh(K.hplate([[7.3, -0.5], [12.2, -0.5], [12.2, 0.5], [7.3, 0.5]], -0.5, 0.04), 0xb8b8b8, { flat: true }));
  return { group: g, OX, nozMats, plumes };
}

// ============================ F-20A TIGERSHARK ============================
export function buildF20A(THREE, cache) {
  const OX = 7.05;
  const K = makeKit(THREE, (x, y, z) => [OX - x, z, y], cache);
  const g = K.mk();
  const AIR = 0xd2d2d2, PL = 0xcdcdcd, C = { camo: 1 };
  const FUS = [
    [0.6, 0, 0, 0, -0.12, 2], [1.2, 0.16, 0.12, 0.1, -0.12, 2.3], [2.2, 0.38, 0.24, 0.22, -0.1, 2.5], [3.2, 0.52, 0.36, 0.34, -0.07, 2.6],
    [4.2, 0.66, 0.46, 0.44, -0.04, 2.6], [5.2, 0.78, 0.54, 0.5, 0, 2.7], [6.5, 0.88, 0.6, 0.58, 0, 2.8], [8.0, 0.9, 0.64, 0.62, 0, 2.8],
    [9.5, 0.86, 0.64, 0.62, 0, 2.8], [11, 0.8, 0.6, 0.6, 0, 2.6], [12.3, 0.74, 0.55, 0.55, 0, 2.3], [13.0, 0.68, 0.5, 0.5, 0, 2.1],
  ];
  const CAN = [[3.3, 0, 0], [3.6, 0.22, 0.24], [4.2, 0.38, 0.52], [5.1, 0.44, 0.62], [6.0, 0.38, 0.5], [6.8, 0.2, 0.26], [7.3, 0, 0.06]];
  g.add(fuselage(K, FUS, AIR, 1));
  g.add(K.rod(K.T(0.65, 0, -0.12), K.T(0, 0, -0.12), 0.025, 0xdddddd, 6));
  g.add(canopy(K, FUS, CAN, [[3.45, 3.62], [5.1, 5.25], [6.7, 6.85]]));
  g.add(K.strip([[7.4, 0, 0.66], [9.5, 0, 0.68], [12, 0, 0.55]], 0.04, 0x5a5a5a));
  g.add(K.strip([[1.8, 0, 0.22], [3.2, 0, 0.35]], 0.03, 0x666666));

  const nozMats = [], plumes = [];
  for (const s of [1, -1]) {
    g.add(sideIntake(K, [[4.9, 0.34, 0.48, 2.6], [5.3, 0.37, 0.51, 2.6], [6.7, 0.34, 0.49, 2.6], [8.1, 0.26, 0.38, 2.4], [9.5, 0.1, 0.16, 2], [10.1, 0, 0, 2]],
      0.84, -0.02, s, AIR, 1, 4.94));
    const W = K.wing({
      ys: [0.5, 0.95, 1.6, 2.3, 2.95, 3.5, 3.92], LE: (y) => 6.3 + 0.66 * (y - 0.6), TE: (y) => 10.45 - 0.17 * (y - 0.6),
      th: (y) => lerp(0.21, 0.07, (y - 0.5) / 3.4), zc: -0.12, s,
    });
    g.add(K.mesh(W.geo, 0xd6d6d6, C));
    const line = (y0, y1, c0, c1, w = 0.035) => {
      const pts = [];
      for (let i = 0; i <= 4; i++) pts.push(W.pt(lerp(y0, y1, i / 4), lerp(c0, c1, i / 4), 1, 0.012));
      g.add(K.strip(pts, w, 0x4d4d4d));
    };
    line(2.0, 3.85, 0.72, 0.74);
    line(1.0, 1.95, 0.7, 0.72);
    line(1.0, 3.85, 0.17, 0.17, 0.03);
    line(1.97, 1.97, 0.72, 1);
    // large LERX
    g.add(K.mesh(K.hplate([[3.4, 0.45], [5.0, 0.95], [6.3, 1.55], [7.26, 2.2], [8.0, 2.2], [8.0, 0.5]], -0.06, 0.12, s), 0xe2e2e2, { flat: true }));
    g.add(K.strip([[4.6, s * 0.72, -0.05], [6.8, s * 1.9, -0.05]], 0.03, 0x666666));
    // wingtip AIM-9
    g.add(K.mesh(K.vplate([[8.4, -0.07], [10.4, -0.07], [10.4, -0.17], [8.6, -0.17]], s * 3.95, 0.08), 0xbfbfbf, { flat: true }));
    const m = K.missile({ L: 2.9, r: 0.08, nose: 0.55, tailSpan: 0.34, canSpan: 0.24 });
    m.position.set(...K.T(7.8 + 1.45, s * 4.05, -0.12));
    g.add(m);
    // tailplane (larger)
    g.add(K.mesh(K.hplate([[11.8, 0.7], [12.9, 2.25], [13.6, 2.25], [13.45, 0.7]], -0.1, 0.07, s), 0xd8d8d8, { flat: true }));
    g.add(K.strip([[12.7, s * 0.8, -0.05], [13.35, s * 2.2, -0.05]], 0.03, 0x555555));
  }
  // single large F404 nozzle
  g.add(nozzle(K, 'f20', 12.8, 14.16, 0, 0, 0.66, 0.54, 14));
  nozMats.push(K.mat(NOZ, { flat: true, id: 'f20' }));
  const pl = plume(K, 14.16, 0, 0, 0.5, 2.4);
  g.add(pl); plumes.push(pl);
  // taller fin
  g.add(K.mesh(K.vplate([[8.8, 0.5], [11.1, 3.3], [12.75, 3.3], [13.2, 0.45]], 0, 0.1), 0xc8c8c8, { camo: 1, flat: true }));
  g.add(K.mesh(K.vplate([[10.95, 3.28], [12.77, 3.28], [12.77, 3.42], [11.07, 3.42]], 0, 0.13), 0xe6e6e6, { flat: true }));
  for (const sd of [-1, 1]) {
    g.add(K.strip([[12.15, sd * 0.055, 0.5], [12.0, sd * 0.055, 2.0], [11.95, sd * 0.055, 3.25]], 0.04, 0x4d4d4d, [0, 1, 0]));
  }
  return { group: g, OX, nozMats, plumes };
}

// ============================ MiG-21bis ============================
export function buildMiG21(THREE, cache) {
  const OX = 7.35;
  const K = makeKit(THREE, (x, y, z) => [OX - x, z, y], cache);
  const g = K.mk();
  const AIR = 0xcfcfcf, C = { camo: 2 };
  const FUS = [
    [2.2, 0.57, 0.57, 0.57, 0, 2], [3.2, 0.62, 0.62, 0.62, 0, 2], [4.6, 0.68, 0.7, 0.68, 0, 2.1], [6.0, 0.74, 0.78, 0.72, 0, 2.2],
    [7.2, 0.74, 0.96, 0.72, 0, 2.4], [9.0, 0.72, 0.98, 0.7, 0, 2.6], [10.5, 0.66, 0.9, 0.64, 0, 2.6], [12, 0.6, 0.78, 0.58, 0, 2.4],
    [13.2, 0.56, 0.58, 0.54, 0, 2.1], [13.9, 0.55, 0.55, 0.52, 0, 2],
  ];
  const CAN = [[4.5, 0, 0], [4.85, 0.28, 0.28], [5.4, 0.4, 0.5], [6.1, 0.38, 0.52], [6.8, 0.26, 0.3], [7.3, 0.1, 0.1], [7.6, 0, 0]];
  g.add(fuselage(K, FUS, AIR, 2, { N: 28 }));
  // circular nose intake with shock cone
  {
    const ring = (x, r) => sec(x, r, r, r, 0, 2, 28);
    g.add(K.mesh(K.loft([ring(2.2, 0.57), ring(2.2, 0.51)]), 0xe8e8e8));
    g.add(K.mesh(K.loft([ring(2.2, 0.51), ring(3.4, 0.45)]), DARK, { flat: true }));
    g.add(K.mesh(K.fan(ring(3.4, 0.45)), DARK, { flat: true }));
    const cone = [[1.25, 0], [1.4, 0.05], [1.8, 0.15], [2.2, 0.23], [2.6, 0.27], [3.3, 0.27]].map(([x, r]) => sec(x, r, r, r, 0, 2, 20));
    g.add(K.mesh(K.loft(cone), 0xe0e0e0));
    // pitot boom above the lip
    g.add(K.rod(K.T(2.3, 0, 0.6), K.T(0, 0, 0.62), 0.03, 0xdddddd, 6));
    g.add(K.rod(K.T(2.4, 0, 0.56), K.T(2.0, 0, 0.62), 0.045, 0xdddddd, 6));
  }
  g.add(canopy(K, FUS, CAN, [[4.55, 4.75], [5.9, 6.05], [7.2, 7.4]]));
  g.add(K.strip([[7.6, 0, 0.98], [9.2, 0, 1.0], [12, 0, 0.8]], 0.04, 0x5a5a5a));
  // dorsal spine fairing flank lines
  for (const s of [-1, 1]) g.add(K.strip([[7.4, s * 0.55, 0.62], [9.6, s * 0.6, 0.6], [12, s * 0.5, 0.45]], 0.03, 0x666666));

  const nozMats = [], plumes = [];
  for (const s of [1, -1]) {
    const W = K.wing({
      ys: [0.5, 0.9, 1.5, 2.1, 2.7, 3.2, 3.575], LE: (y) => 6.3 + 1.54 * (y - 0.65), TE: (y) => 11.5 + 0.07 * (y - 0.65),
      th: (y) => lerp(0.27, 0.08, (y - 0.5) / 3.1), zc: -0.1, s, peak: 0.45,
    });
    g.add(K.mesh(W.geo, 0xd2d2d2, C));
    const line = (y0, y1, c0, c1, w = 0.035) => {
      const pts = [];
      for (let i = 0; i <= 4; i++) pts.push(W.pt(lerp(y0, y1, i / 4), lerp(c0, c1, i / 4), 1, 0.012));
      g.add(K.strip(pts, w, 0x4d4d4d));
    };
    line(2.2, 3.5, 0.75, 0.75); // aileron hinge
    line(0.8, 2.1, 0.78, 0.78); // flap hinge
    line(2.1, 2.1, 0.76, 1);
    // wing fence
    g.add(K.mesh(K.vplate([[8.1, -0.04], [8.5, 0.3], [11.0, 0.3], [11.2, -0.04]], s * 2.05, 0.05), 0xe0e0e0, { flat: true }));
    // pylon + AA-2 Atoll
    g.add(K.mesh(K.vplate([[8.7, -0.15], [10.4, -0.15], [10.2, -0.5], [8.9, -0.5]], s * 2.1, 0.06), 0xbfbfbf, { flat: true }));
    const m = K.missile({ L: 2.8, r: 0.07, nose: 0.5, tailSpan: 0.3, canSpan: 0.26 });
    m.position.set(...K.T(8.2 + 1.4, s * 2.1, -0.55));
    g.add(m);
    // swept all-moving tailplane
    g.add(K.mesh(K.hplate([[12.3, 0.52], [13.8, 2.15], [14.3, 2.15], [13.75, 0.52]], -0.02, 0.07, s), 0xd8d8d8, { flat: true }));
    g.add(K.strip([[13.2, s * 0.6, 0.03], [14.0, s * 2.1, 0.03]], 0.03, 0x555555));
  }
  // tall swept fin with rudder line
  g.add(K.mesh(K.vplate([[9.2, 0.8], [12.5, 2.9], [13.95, 2.9], [14.0, 0.5]], 0, 0.1), 0xc6c6c6, { camo: 2, flat: true }));
  g.add(K.mesh(K.vplate([[12.4, 2.88], [13.97, 2.88], [13.97, 3.0], [12.5, 3.0]], 0, 0.12), 0xe6e6e6, { flat: true }));
  for (const sd of [-1, 1]) g.add(K.strip([[13.3, sd * 0.055, 0.55], [13.3, sd * 0.055, 2.85]], 0.04, 0x4d4d4d, [0, 1, 0]));
  // drag-chute housing at the fin root
  g.add(K.mesh(K.loft([sec(13.2, 0.05, 0.05, 0.05, 0.66, 2, 14), sec(13.7, 0.2, 0.2, 0.18, 0.66, 2, 14), sec(14.6, 0.14, 0.14, 0.12, 0.62, 2, 14), sec(14.75, 0, 0, 0, 0.6, 2, 14)]), 0xbdbdbd));
  // ventral fin
  g.add(K.mesh(K.vplate([[11.0, -0.45], [13.6, -0.45], [13.5, -1.05], [12.4, -1.05]], 0, 0.09), 0xc0c0c0, { camo: 2, flat: true }));
  // single nozzle
  g.add(nozzle(K, 'mig', 13.85, 14.7, 0, 0, 0.56, 0.5, 14));
  nozMats.push(K.mat(NOZ, { flat: true, id: 'mig' }));
  const pl = plume(K, 14.7, 0, 0, 0.46, 2.2);
  g.add(pl); plumes.push(pl);
  return { group: g, OX, nozMats, plumes };
}
