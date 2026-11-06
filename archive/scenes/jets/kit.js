// Shared modelling kit for the jets scene (techniques copied from su33.js).
// Model space (metres): x = aft from nose tip, y = right, z = up. Scene axes: nose +X, up +Y, right +Z.

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, k) => a + (b - a) * k;

// Cubic interpolation through rows [x, v1, v2, ...].
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

// Super-ellipse cross-section ring (model coords), from the top, going to starboard.
export function sec(x, w, top, bot, zc, p = 2, N = 24, yc = 0) {
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

// camo kinds: scale xyz, thresholds, edge softness, tone multipliers
const CAMO_KINDS = [
  { s: [0.5, 0.25, 0.42], t1: 0.46, t2: 0.58, e: 0.012, m: [0.76, 0.52] }, // F-5E: hard splinter
  { s: [0.33, 0.2, 0.3], t1: 0.47, t2: 0.6, e: 0.035, m: [0.88, 0.74] }, // F-20A: soft low-viz grey
  { s: [0.42, 0.22, 0.38], t1: 0.45, t2: 0.57, e: 0.02, m: [0.74, 0.5] }, // MiG-21: blotchy
];
const GLOSS = { 0x2a2a2a: [0.1, 0.25], 0x6e6e6e: [0.3, 0.7], 0x555555: [0.3, 0.7] };

export function makeKit(THREE, conv, cache) {
  const T = conv;
  const ID = (x, y, z) => [x, y, z];

  function mat(c, o = {}) {
    const { flat = false, off = false, camo = -1, id = '' } = o;
    const k = `${c}|${flat}|${off}|${camo}|${id}`;
    if (cache[k]) return cache[k];
    const [rough, metal] = GLOSS[c] || [0.42, 0.12];
    const m = new THREE.MeshStandardMaterial({
      color: c, flatShading: flat, roughness: rough, metalness: metal, side: THREE.DoubleSide,
      polygonOffset: off, polygonOffsetFactor: off ? -2 : 0, polygonOffsetUnits: off ? -2 : 0,
    });
    if (camo >= 0) {
      const C = CAMO_KINDS[camo];
      const f = (v) => v.toFixed(3);
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
  p = p * vec3(${f(C.s[0])}, ${f(C.s[1])}, ${f(C.s[2])});
  float n = 0.6 * vn(p + 3.1) + 0.3 * vn(p * 2.1 + 7.7) + 0.1 * vn(p * 4.3);
  float a = smoothstep(${f(C.t1 - C.e)}, ${f(C.t1 + C.e)}, n), b = smoothstep(${f(C.t2 - C.e)}, ${f(C.t2 + C.e)}, n);
  return mix(1.0, mix(${f(C.m[0])}, ${f(C.m[1])}, b), a);
}`)
          .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= camo(vCamo);');
      };
      m.customProgramCacheKey = () => 'jetcamo' + camo;
    }
    return (cache[k] = m);
  }
  const mesh = (geo, c, o) => new THREE.Mesh(geo, mat(c, o));

  function loft(rings, { capStart = false, capEnd = false, cv = T } = {}) {
    const N = rings[0].length, pos = [], idx = [];
    for (const r of rings) for (const p of r) pos.push(...cv(p[0], p[1], p[2]));
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
      pos.push(...cv(cx / N, cy / N, cz / N));
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

  function plate(poly, depth, map, cv = T) {
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const [x, y, z] = map(pa.getX(i), pa.getY(i), pa.getZ(i));
      const [X, Y, Z] = cv(x, y, z);
      pa.setXYZ(i, X, Y, Z);
    }
    g.computeVertexNormals();
    return g;
  }
  const hplate = (poly, z0, depth, s = 1) => plate(poly, depth, (u, v, w) => [u, s * v, z0 + w - depth / 2]);
  const vplate = (poly, y0, depth, s = 1) => plate(poly, depth, (u, v, w) => [u, s * (y0 + w - depth / 2), v]);

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
    return mesh(g, color, { flat: true, off: true });
  }

  // Thin airfoil-ish wing/tail surface. def: {ys, LE(y), TE(y), th(y), zc, s, peak}
  function wing(def) {
    const { ys, LE, TE, th, zc, s, peak = 0.4 } = def;
    const cs = [0, 0.03, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1];
    const prof = (c) => (c <= peak ? Math.pow(c / peak, 0.6) : Math.pow((1 - c) / (1 - peak), 0.9));
    const pt = (y, c, sg = 1, off = 0) => [lerp(LE(y), TE(y), c), s * y, zc + sg * 0.5 * th(y) * prof(c) + off];
    const rings = ys.map((y) => {
      const r = cs.map((c) => pt(y, c, 1));
      for (let k = cs.length - 2; k >= 1; k--) r.push(pt(y, cs[k], -1));
      return r;
    });
    return { geo: loft(rings, { capStart: true, capEnd: true }), pt };
  }

  const rod = (a, b, r, color, seg = 8) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), color);
    m.position.copy(A).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const mk = (x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    return g;
  };

  // Air-to-air missile, local axes nose +X, centred. kind: {L, r, nose, tailSpan, canSpan}
  function missile({ L, r, nose, tailSpan, canSpan }, finColor = 0x8a8a8a) {
    const g = new THREE.Group();
    const ringsAt = (x, rr) => {
      const pts = [];
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2;
        pts.push([x, rr * Math.cos(a), rr * Math.sin(a)]);
      }
      return pts;
    };
    const bodyEnd = L / 2 - nose;
    const rings = [ringsAt(-L / 2, r * 0.85), ringsAt(-L / 2 + 0.01, r * 0.95), ringsAt(-L / 2 + 0.4, r), ringsAt(bodyEnd, r)];
    for (const [f, k] of [[0.15, 0.97], [0.3, 0.9], [0.5, 0.75], [0.7, 0.55], [0.85, 0.32], [1, 0.0]]) rings.push(ringsAt(bodyEnd + nose * f, r * k));
    g.add(mesh(loft(rings, { cv: ID, capStart: true }), 0xf2f2f2));
    g.add(mesh(loft([ringsAt(bodyEnd + nose * 0.18, r * 1.01), ringsAt(bodyEnd + nose * 0.34, r * 0.97)], { cv: ID }), 0x3a3a3a));
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
        fg.rotateX((k * Math.PI) / 2 + Math.PI / 4);
        g.add(mesh(fg, color, { flat: true }));
      }
    };
    addFins(finGeo(-L / 2, 0.5, tailSpan, 0.2, 0.3, 0.03), finColor);
    addFins(finGeo(bodyEnd - 0.15, 0.3, canSpan, 0.1, 0.18, 0.025), finColor);
    return g;
  }

  return { THREE, T, ID, mat, mesh, loft, fan, plate, hplate, vplate, strip, wing, rod, mk, missile };
}
