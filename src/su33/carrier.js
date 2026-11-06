// Aircraft carrier "Admiral Kuznetsov" + sea + dawn sky, real scale (~305 m).
// Frame: bow +X, up +Y, starboard +Z, flight-deck surface y = 0, sea y = SEA_Y.
// The straight deck runs x -155..85, the 14-degree ski-jump ramp x 85..150, the island sits on the starboard side,
// and the angled landing deck leaves the centreline at ANG degrees to port (-Z) toward the stern.
import * as THREE from 'three';

export const SEA_Y = -26;
export const ANG = (6.8 * Math.PI) / 180;
export const RAMP_X0 = 85, RAMP_X1 = 150, RAMP_ANG = (14 * Math.PI) / 180;
const RAMP_H = ((RAMP_X1 - RAMP_X0) * Math.tan(RAMP_ANG)) / 2;
export const rampY = (x) => {
  const u = Math.min(1, Math.max(0, (x - RAMP_X0) / (RAMP_X1 - RAMP_X0)));
  return RAMP_H * u * u;
};
export const rampSlope = (x) => {
  const u = Math.min(1, Math.max(0, (x - RAMP_X0) / (RAMP_X1 - RAMP_X0)));
  return Math.atan(2 * RAMP_H * u / (RAMP_X1 - RAMP_X0));
};
// angled deck: centreline point at distance s from its forward end O, heading toward the stern/port
export const AO = { x: 30, z: -1 };
export const AD = { x: -Math.cos(ANG), z: -Math.sin(ANG) }; // aft direction along the strip
export const ANP = { x: Math.sin(ANG), z: -Math.cos(ANG) }; // port-side normal of the strip
export const stripPt = (s, off = 0) => ({ x: AO.x + s * AD.x + off * ANP.x, z: AO.z + s * AD.z + off * ANP.z });
export const STRIP_HW = 12.5;
export const WIRES = [76, 88, 100, 112];
export const WIRE_CATCH = 2;

const SKY_GLSL = /* glsl */ `
uniform vec3 uSun;
float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
float skyLum(vec3 d, bool clouds){
  float e = clamp(d.y, -0.3, 1.0);
  float g = pow(1.0 - max(e, 0.0), 4.0);
  float c = mix(0.012, 0.13, g);
  float sd = max(dot(d, uSun), 0.0);
  c += 0.5 * pow(sd, 160.0) + 0.06 * pow(sd, 24.0) * g;
  if (clouds && d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.12) * 0.9;
    float n = fbm(p + vec2(3.1, 7.7));
    float band = smoothstep(0.0, 0.08, d.y) * (1.0 - smoothstep(0.25, 0.7, d.y));
    c *= 1.0 + band * (n - 0.5) * 1.1 + 0.25 * band * pow(sd, 3.0);
  }
  return c;
}
// Dusk palette: hue ramp (deep navy zenith -> violet -> warm orange at the horizon -> golden around the sun),
// normalised to unit luminance so skyLum() keeps full control of the brightness (ASCII glyph choice).
vec3 skyHue(vec3 d){
  float e = clamp(d.y, -0.3, 1.0);
  float k = pow(1.0 - max(e, 0.0), 2.4);
  vec3 h = mix(vec3(0.16, 0.28, 0.95), vec3(0.62, 0.42, 0.80), smoothstep(0.05, 0.55, k));
  h = mix(h, vec3(1.0, 0.50, 0.20), smoothstep(0.45, 0.92, k));
  float sd = max(dot(d, uSun), 0.0);
  h = mix(h, vec3(1.0, 0.78, 0.38), clamp(pow(sd, 6.0) * 1.4, 0.0, 1.0) * 0.85);
  h = mix(h, vec3(1.0, 0.95, 0.80), pow(sd, 120.0));
  return h / dot(h, vec3(0.2126, 0.7152, 0.0722));
}
vec3 skyCol(vec3 d, bool clouds){ return skyHue(d) * skyLum(d, clouds); }
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
${SKY_GLSL}
void main(){ gl_FragColor = vec4(skyCol(normalize(vDir), true), 1.0); }
`;
const SEA_VERT = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const SEA_FRAG = /* glsl */ `
varying vec3 vW;
uniform float uTime;
${SKY_GLSL}
float hw(float x){ return x < 60.0 ? 19.0 : 19.0 * clamp(1.0 - (x - 60.0) / 97.0, 0.0, 1.0); }
void main(){
  vec2 p = vec2(vW.x + uTime * 15.0, vW.z);
  vec2 g = vec2(0.0);
  vec2 k1 = vec2(0.055, 0.02), k2 = vec2(-0.03, 0.07), k3 = vec2(0.12, -0.09), k4 = vec2(0.2, 0.17), k5 = vec2(-0.31, 0.11), k6 = vec2(0.47, 0.36);
  g += 2.4 * k1 * cos(dot(k1, p) + uTime * 0.8);
  g += 1.7 * k2 * cos(dot(k2, p) - uTime * 0.7);
  g += 1.0 * k3 * cos(dot(k3, p) + uTime * 1.3);
  g += 0.55 * k4 * cos(dot(k4, p) - uTime * 1.9);
  g += 0.32 * k5 * cos(dot(k5, p) + uTime * 2.3);
  g += 0.18 * k6 * cos(dot(k6, p) - uTime * 3.1);
  vec3 n = normalize(vec3(-g.x * 0.5, 1.0, -g.y * 0.5));
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 R = reflect(-V, n); R.y = abs(R.y);
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 col = vec3(0.05, 1.2, 1.6) * 0.006 + skyCol(R, false) * F * 0.2;   // deep teal body + reflected dusk sky
  col += vec3(1.48, 0.92, 0.41) * 2.0 * pow(max(dot(R, uSun), 0.0), 400.0) * F; // warm orange sun glints
  // foam: hull side and long wake
  float d = abs(vW.z) - hw(vW.x);
  float foam = 0.0;
  if (vW.x < 160.0) {
    float nz = vnoise(p * vec2(0.35, 0.5) + vec2(0.0, uTime * 0.3)) * 0.6 + vnoise(p * 1.3) * 0.4;
    foam = smoothstep(4.0, 0.0, d) * smoothstep(0.25, 0.7, nz) * 0.35;
    float wk = 1.0 - smoothstep(0.0, 22.0 + max(-vW.x - 150.0, 0.0) * 0.1, abs(vW.z));
    float wl = smoothstep(-150.0, -165.0, vW.x) * (1.0 - smoothstep(-600.0, -150.0, vW.x));
    foam += wk * wl * smoothstep(0.35, 0.8, nz) * 0.3;
    // bow wave
    float bw = smoothstep(14.0, 0.0, length(vec2(vW.x - 158.0, vW.z * 0.5)));
    foam += bw * smoothstep(0.3, 0.7, nz) * 0.5;
  }
  col += vec3(1.0, 0.98, 0.94) * foam * 0.45;
  float fog = 1.0 - exp(-dist / 2600.0);
  col = mix(col, skyCol(normalize(vec3(-V.x, 0.0, -V.z)), false) * 0.7, fog);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildCarrier(sunDir = new THREE.Vector3(0.6, 0.05, 0.8)) {
  const group = new THREE.Group();
  const sun = sunDir.clone().normalize();
  const mats = new Map();
  const lam = (c) => {
    if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.04, side: THREE.DoubleSide }));
    return mats.get(c);
  };
  const basic = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
  const box = (x0, x1, y0, y1, z0, z1, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), lam(c));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    group.add(m);
    return m;
  };
  const meshFrom = (pos, idx, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    group.add(m);
    return m;
  };

  // ---------- sky + sea ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 32, 16),
    new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uSun: { value: sun } }, side: THREE.BackSide, depthWrite: false }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  const seaU = { uTime: { value: 0 }, uSun: { value: sun } };
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.ShaderMaterial({ vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, uniforms: seaU }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  sea.frustumCulled = false;
  group.add(sea);

  // ---------- flight deck ----------
  const pa = stripPt(186, STRIP_HW + 0.8);
  const P = [
    [-155, 20], [-140, 24], [55, 24], [85, 17], [150, 13], [157, 0], [150, -13], [85, -17],
    [stripPt(0, STRIP_HW + 1.2).x, stripPt(0, STRIP_HW + 1.2).z], [pa.x, pa.z],
  ];
  const Q = [
    [-150, 14], [-135, 16], [55, 17], [85, 13], [148, 8], [155, 0], [148, -8], [85, -13], [31, -14], [-150, -24],
  ];
  {
    // deck top: polygon P without the bow part (x > 85)
    const poly = [P[0], P[1], P[2], P[3], [85, -17], P[8], P[9]];
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, lam(0x3e5560));
    group.add(m);
    // hull
    const pos = [], idx = [];
    const n = P.length;
    for (let i = 0; i < n; i++) pos.push(P[i][0], -0.6, P[i][1]);
    for (let i = 0; i < n; i++) pos.push(Q[i][0], SEA_Y - 1.5, Q[i][1]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(i, j, n + i, j, n + j, n + i);
    }
    meshFrom(pos, idx, lam(0x8aa6bd)); // haze-grey hull
    // stern face is part of the ribbon; add a bright-ish waterline boot-topping band for readability
    // red boot-topping above a black waterline band
    const band = (y0, y1, col) => {
      const bp = [], bi = [];
      for (let i = 0; i < n; i++) bp.push(Q[i][0], y0, Q[i][1]);
      for (let i = 0; i < n; i++) bp.push(Q[i][0], y1, Q[i][1]);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; bi.push(i, j, n + i, j, n + j, n + i); }
      meshFrom(bp, bi, lam(col));
    };
    band(SEA_Y + 3.2, SEA_Y + 1.2, 0x6a1812);
    band(SEA_Y + 1.2, SEA_Y - 0.5, 0x1a1c20);
  }

  // ---------- ski-jump ramp ----------
  {
    const N = 40, pos = [], idx = [];
    const hwAt = (x) => 17 - (4 * (x - RAMP_X0)) / (RAMP_X1 - RAMP_X0);
    for (let i = 0; i <= N; i++) {
      const x = RAMP_X0 + ((RAMP_X1 - RAMP_X0) * i) / N, y = rampY(x), w = hwAt(x);
      pos.push(x, y, -w, x, y, w); // top
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    meshFrom(pos, idx, lam(0x4a606b));
    // side walls and lip face
    for (const sgn of [-1, 1]) {
      const wp = [], wi = [];
      for (let i = 0; i <= N; i++) {
        const x = RAMP_X0 + ((RAMP_X1 - RAMP_X0) * i) / N;
        wp.push(x, rampY(x), sgn * hwAt(x), x, -0.6, sgn * hwAt(x));
      }
      for (let i = 0; i < N; i++) { const a = i * 2; wi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      meshFrom(wp, wi, lam(0x86a2b8));
    }
    box(RAMP_X1, RAMP_X1 + 0.3, -0.6, RAMP_H, -13, 13, 0x586d78);
  }

  // ---------- markings ----------
  const mpos = [], midx = [], ypos = [], yidx = [];
  let useY = false; // yellow launch markings vs white
  const quad = (a, b, c, d) => {
    const P_ = useY ? ypos : mpos, I_ = useY ? yidx : midx, o = P_.length / 3;
    P_.push(...a, ...b, ...c, ...d); I_.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  };
  // line from (x0,z0) to (x1,z1), width w, on a surface y(x) (+ eps), subdivided
  const line = (x0, z0, x1, z1, w, yf = () => 0, eps = 0.06) => {
    const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(len / 2));
    const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
    for (let i = 0; i < steps; i++) {
      const ax = x0 + ((x1 - x0) * i) / steps, az = z0 + ((z1 - z0) * i) / steps;
      const bx = x0 + ((x1 - x0) * (i + 1)) / steps, bz = z0 + ((z1 - z0) * (i + 1)) / steps;
      const h = w / 2;
      quad([ax + nx * h, yf(ax) + eps, az + nz * h], [ax - nx * h, yf(ax) + eps, az - nz * h],
        [bx + nx * h, yf(bx) + eps, bz + nz * h], [bx - nx * h, yf(bx) + eps, bz - nz * h]);
    }
  };
  const dashed = (x0, z0, x1, z1, dash, gap, w, yf, eps) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    for (let s = 0; s < len; s += dash + gap) {
      const e = Math.min(len, s + dash);
      line(x0 + ux * s, z0 + uz * s, x0 + ux * e, z0 + uz * e, w, yf, eps);
    }
  };
  // straight deck: launch centreline (continues up the ramp), edge lines
  dashed(-120, 0, RAMP_X1 - 1, 0, 8, 5, 0.9, rampY, 0.07);
  line(-139, 22.5, 55, 22.5, 0.6);
  line(55, 22.5, 85, 15.6, 0.6);
  line(RAMP_X0, 15.6, RAMP_X1 - 1, 11.6, 0.6, rampY);
  line(RAMP_X0, -15.6, RAMP_X1 - 1, -11.6, 0.6, rampY);
  // launch position bars and take-off lines (two launch tracks either side of the centre)
  useY = true;
  for (const z of [-5.5, 5.5]) dashed(-20, z, 84, z, 14, 4, 0.5);
  for (const x of [-12, 8]) line(x, -8, x, 8, 0.6);
  line(RAMP_X0, -16, RAMP_X0, 16, 0.5);
  useY = false;
  // angled deck: edges, centreline, foul line, numerals-ish bars
  for (const off of [-STRIP_HW, STRIP_HW]) {
    const a = stripPt(-2, off), b = stripPt(186, off);
    line(a.x, a.z, b.x, b.z, 0.7);
  }
  {
    const a = stripPt(-2, 0), b = stripPt(186, 0);
    dashed(a.x, a.z, b.x, b.z, 6, 5, 0.8);
    const f1 = stripPt(55, -STRIP_HW), f2 = stripPt(55, STRIP_HW);
    line(f1.x, f1.z, f2.x, f2.z, 0.7);
    // arrow-chevrons on the landing area
    for (const s of [40, 150]) {
      const c = stripPt(s, 0), l = stripPt(s + 6, -5), r = stripPt(s + 6, 5);
      line(c.x, c.z, l.x, l.z, 0.8); line(c.x, c.z, r.x, r.z, 0.8);
    }
  }
  const marksMesh = meshFrom(mpos, midx, basic(0xdfe3e6));
  marksMesh.material.side = THREE.DoubleSide;
  meshFrom(ypos, yidx, basic(0xe6b422));

  // arrestor wires (static ones as flat strips, the catching wire is dynamic)
  const wpos = [], widx = [];
  WIRES.forEach((s, i) => {
    if (i === WIRE_CATCH) return;
    const a = stripPt(s, -STRIP_HW), b = stripPt(s, STRIP_HW), h = 0.2;
    const o = wpos.length / 3;
    const nx = AD.x * h, nz = AD.z * h;
    wpos.push(a.x + nx, 0.14, a.z + nz, a.x - nx, 0.14, a.z - nz, b.x + nx, 0.14, b.z + nz, b.x - nx, 0.14, b.z - nz);
    widx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  });
  meshFrom(wpos, widx, basic(0xdde2e6));
  const wireMat = basic(0xf0f0f0);
  const wireSeg = [new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 0.3), wireMat), new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 0.3), wireMat)];
  wireSeg.forEach((m) => { m.frustumCulled = false; group.add(m); });
  const wA = stripPt(WIRES[WIRE_CATCH], -STRIP_HW), wB = stripPt(WIRES[WIRE_CATCH], STRIP_HW);
  const A3 = new THREE.Vector3(wA.x, 0.2, wA.z), B3 = new THREE.Vector3(wB.x, 0.2, wB.z);
  // sheave housings at the wire ends
  for (const s of WIRES) for (const off of [-STRIP_HW - 0.8, STRIP_HW + 0.8]) { const q = stripPt(s, off); box(q.x - 0.8, q.x + 0.8, 0, 0.35, q.z - 0.8, q.z + 0.8, 0x667c8a); }
  const _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _ex = new THREE.Vector3(1, 0, 0);
  function place(m, a, b) {
    _d.subVectors(b, a);
    const len = Math.max(_d.length(), 1e-3);
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.copy(_q.setFromUnitVectors(_ex, _d.multiplyScalar(1 / len)));
    m.scale.set(len, 1, 1);
  }
  const mid = new THREE.Vector3().addVectors(A3, B3).multiplyScalar(0.5);
  // hookWorld: Vector3 of the hook tip, or null for an untouched (straight) wire
  function setWire(hookWorld) {
    const h = hookWorld || mid;
    const p = hookWorld ? new THREE.Vector3(h.x, Math.max(0.2, h.y), h.z) : mid;
    place(wireSeg[0], A3, p);
    place(wireSeg[1], p, B3);
  }
  setWire(null);

  // ---------- island superstructure (starboard) ----------
  {
    const G = 0x7c98b0, D = 0x4e6678, L = 0xb3c8d8, W = 0x101010;
    box(-12, 42, 0, 9, 14, 24, G); // base
    box(-5, 36, 9, 16, 15.5, 23.5, G); // bridge deck
    box(-2, 30, 16, 21, 16, 22.5, L); // pilot house
    box(-2.2, 30.2, 17.4, 19.2, 15.8, 22.7, W).material = basic(0x8a5a22); // bridge windows, warm lit at dusk
    box(-6, 4, 16, 29, 16, 21, G); // aft funnel / uptake block
    box(32, 42, 9, 22, 17, 23, D); // forward block
    box(9, 22, 21, 26, 17.5, 21.5, G); // radar room
    box(12, 18, 26, 36, 18.5, 20.5, G); // mast base
    // plate radar array and dishes
    box(-4, 6, 29, 33, 17.7, 19.3, L);
    box(-9, -3, 21, 27, 17, 21, D);
    box(20, 30, 21, 24, 17.6, 21.4, L);
    box(28, 31, 22, 31, 18.6, 20.4, G);
    // sponson / catwalk
    box(-12, 42, -0.6, 0.0, 24, 26, 0x5c7482);
  }
  // masts, spars, radar domes
  {
    const cyl = (x, y0, y1, z, r, c) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, y1 - y0, 10), lam(c));
      m.position.set(x, (y0 + y1) / 2, z); group.add(m);
    };
    cyl(15, 36, 62, 19.5, 0.5, 0x6f8798);
    cyl(15, 44, 45.5, 19.5, 3, 0x84a0b4);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), lam(0xdde2e6)); dome.position.set(15, 52, 19.5); group.add(dome);
    box(8, 22, 48, 49, 19, 20, 0x6f8798); // yard arm
    cyl(-1, 29, 42, 19.5, 0.35, 0x6f8798);
    box(-6, 4, 42, 43.5, 17.5, 21.5, 0x82a0b4); // big flat radar
  }

  // ---------- jet blast deflector (single, behind the launch position) ----------
  const DEF = { hingeX: -9, len: 5.8, w: 13 };
  box(DEF.hingeX - DEF.len - 0.2, DEF.hingeX + 0.2, 0, 0.05, -DEF.w / 2, DEF.w / 2, 0x101010); // recess
  const defPivot = new THREE.Group();
  defPivot.position.set(DEF.hingeX, 0.1, 0);
  const defPlate = new THREE.Mesh(new THREE.BoxGeometry(DEF.len, 0.35, DEF.w), lam(0x4e6270));
  defPlate.position.set(-DEF.len / 2, 0.15, 0);
  defPivot.add(defPlate);
  const ribs = new THREE.Mesh(new THREE.BoxGeometry(DEF.len * 0.9, 0.5, 0.35), lam(0x667e8c));
  for (const z of [-4.5, -1.5, 1.5, 4.5]) { const r = ribs.clone(); r.position.set(-DEF.len / 2, -0.2, z); defPivot.add(r); }
  group.add(defPivot);
  function setDeflector(k) { defPivot.rotation.z = -k * 0.95; }
  setDeflector(0);

  // ---------- "meatball" optical landing system, port side ----------
  {
    const q = stripPt(60, -STRIP_HW - 3);
    box(q.x - 1, q.x + 1, 0, 2.2, q.z - 0.6, q.z + 0.6, 0x8fa8b8);
    box(q.x - 0.4, q.x + 0.4, 2.2, 2.9, q.z - 0.4, q.z + 0.4, 0xff9a1a).material = basic(0xffa020); // meatball
  }

  // ---------- update ----------
  function update(t, camera) {
    seaU.uTime.value = t;
    if (camera) sky.position.copy(camera.position);
  }

  return { group, update, setDeflector, setWire, sun, mat: lam };
}
