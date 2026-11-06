import * as THREE from 'three';

// Sunset field of roses: fullscreen fragment shader (brightness only).
// Perspective rows of rose plants (far -> near) drawn over a hazy ground,
// backlit by a low sun. Deterministic function of time.
const VERT = `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform float uT;
uniform float uAspect;
varying vec2 vP;

const float F = 0.8;       // focal
const float CAMH = 1.0;    // camera height
const float RW = 0.17;     // bloom radius (world)
const float S = 0.42;      // row spacing
const float DNEAR = 1.0;
const float WCELL = 0.40;
const int NR = 26;
const float HAZEK = 0.11;

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x),
             mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}

vec2 SUN;

float skyLum(vec2 q, float t) {
  float y = max(q.y, 0.0);
  float base = 0.01 + 0.34 * exp(-y * 7.5);
  vec2 ds = q - SUN;
  float dist = length(ds);
  float glow = 0.34 * exp(-dist * 9.0) + 0.12 * exp(-dist * 3.2);
  float ang = atan(ds.y, ds.x);
  float rays = (0.5 + 0.5 * sin(ang * 19.0 + t * 0.15)) * (0.5 + 0.5 * sin(ang * 7.0 - t * 0.1 + 1.3));
  rays *= 0.12 * exp(-dist * 3.0) * smoothstep(0.0, 0.05, q.y);
  return base + glow + rays;
}

// leaf: returns coverage; lum via out param
float leafAt(vec2 w, vec2 c, float len, float wid, float ang, out float lum) {
  vec2 p = w - c;
  float ca = cos(ang), sa = sin(ang);
  vec2 lp = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y);
  float tp = clamp(abs(lp.x) / len, 0.0, 1.0);
  float ww = wid * (1.0 - 0.75 * tp * tp);
  float e = length(vec2(lp.x / len, lp.y / max(ww, 1e-4)));
  float m = 1.0 - smoothstep(0.9, 1.05, e);
  float side = lp.y / max(ww, 1e-4);
  lum = 0.04 + 0.10 * smoothstep(0.2, 1.0, side) + 0.05 * exp(-side * side * 14.0);
  return m;
}

float bloomLum(vec2 uu, float rn, float rings, float detail, float rnd) {
  float r = length(uu);
  float ang = atan(uu.y, uu.x) + rnd * 6.28;
  float a2 = ang + 2.6 * rn;
  float rc = rn * rings;
  float ri = floor(rc);
  float rf = fract(rc);
  float s = fract(a2 / 6.2832 * 3.0 + ri * 0.37 + rnd * 5.0);
  float sd = min(s, 1.0 - s);
  float seam = smoothstep(0.02, 0.24, sd);
  float lip = smoothstep(0.35, 0.98, rf);
  float inner = 0.35 + 0.65 * rf;
  float sunSide = 0.40 + 0.60 * clamp(uu.y / max(r, 0.05) * 0.9 + 0.35, 0.0, 1.0);
  float body = 0.08 + 0.24 * inner;
  float petal = (body * 0.8 + 0.85 * lip * sunSide) * (0.12 + 0.88 * seam);
  petal *= 0.45 + 0.55 * smoothstep(0.0, 0.38, rn);
  float avg = 0.32 + 0.15 * sunSide * smoothstep(0.3, 1.0, rn);
  float l = mix(avg, petal, detail);
  float edge = smoothstep(0.72, 1.0, rn) * sunSide;
  l += 0.30 * edge;
  return l;
}

void main() {
  float t = uT;
  float asp = uAspect;
  float m = max(1.0, 0.8 / asp);
  vec2 p = vec2(vP.x * asp * 0.5, vP.y * 0.5);
  vec2 q = vec2(p.x, p.y - 0.05) * m;

  SUN = vec2(0.17, 0.085 - t * 0.0022);
  float camX = 0.05 * t + sin(t * 0.2) * 0.06; // slow, calm drift
  float zc = 0.1 * S + t * 0.022;

  float hz = skyLum(vec2(q.x, 0.0), t);
  float col;

  if (q.y >= 0.0) {
    // ---------- sky ----------
    col = skyLum(q, t);
    // sun disc
    float ds = length(q - SUN);
    float disc = 1.0 - smoothstep(0.070, 0.082, ds);
    col = mix(col, 1.0, disc);
    // thin clouds lit from below
    vec2 cp = vec2(q.x * 1.6 + t * 0.012, q.y * 11.0);
    float n0 = vnoise(cp) * 0.65 + vnoise(cp * 2.7 + 5.0) * 0.35;
    vec2 cp2 = vec2(cp.x, cp.y - 0.22);
    float n1 = vnoise(cp2) * 0.65 + vnoise(cp2 * 2.7 + 5.0) * 0.35;
    float c0 = smoothstep(0.52, 0.72, n0) * smoothstep(0.04, 0.12, q.y) * smoothstep(0.55, 0.25, q.y);
    float c1 = smoothstep(0.52, 0.72, n1) * smoothstep(0.04, 0.12, q.y) * smoothstep(0.55, 0.25, q.y);
    float under = c0 * (1.0 - c1);
    float near = exp(-length(vec2(q.x - SUN.x, (q.y - SUN.y) * 0.5)) * 1.3);
    col = col * (1.0 - 0.45 * c0) + under * (0.12 + 0.6 * near);
    col = mix(col, 1.0, disc * 0.0);
  } else {
    // ---------- ground ----------
    vec2 qg = vec2(p.x, p.y - 0.05) * mix(1.0, m, 0.5);
    float d0 = min(CAMH * F / max(-qg.y, 1e-3), 80.0);
    vec2 gp = vec2(qg.x * d0 / F + camX, d0 + zc);
    float gn = vnoise(gp * 5.0) * 0.6 + vnoise(gp * 12.0) * 0.4;
    float g = 0.02 + 0.07 * gn * gn;
    col = mix(hz * 0.8, g, exp(-d0 * HAZEK));

    // ---------- rose rows, far to near ----------
    float k0 = floor(zc / S);
    float fr = zc / S - k0;
    for (int j = 0; j < NR; j++) {
      float idx = float(NR - 1 - j);
      float k = k0 + idx;
      float d = DNEAR + (idx - fr) * S;
      float wh = qg.y * d / F + CAMH;
      if (wh < -0.05 || wh > 1.06) continue;
      float wx = qg.x * d / F + camX;
      float haze = exp(-d * HAZEK);
      float alphaRow = smoothstep(0.45, 0.8, d) * smoothstep(float(NR) * S + DNEAR, float(NR - 4) * S + DNEAR, d + 2.0 * S) ;
      alphaRow = 1.0;
      float pxw = 0.006 * d / F;
      float stag = 0.5 * mod(k, 2.0);
      float cb = floor(wx / WCELL - stag);
      for (int o = -1; o <= 1; o++) {
        float c = cb + float(o);
        float hs = h21(vec2(c, k * 1.37 + 3.1));
        if (hs < 0.08) continue;
        float h2 = h21(vec2(c * 1.7 + 5.0, k + 9.0));
        float h3 = h21(vec2(c + 13.0, k * 2.1));
        float h4 = h21(vec2(c * 3.1, k * 0.7 + 41.0));
        float h5 = h21(vec2(c * 0.37 + 2.0, k * 1.9 + 7.0));
        float sc = 0.78 + 0.55 * h3;
        float hb = 0.50 + 0.30 * h4;
        float cx = (c + 0.5 + stag + (h2 - 0.5) * 0.5) * WCELL;
        float sw = sin(t * 0.8 + h3 * 6.28 + k * 0.45) * 0.028;
        float rad = RW * sc;
        float dx0 = wx - cx;
        if (abs(dx0) > rad * 2.4 + 0.1) continue;
        float tone = 0.85 + 0.45 * h5;
        float lowv;

        // stem
        if (d < 7.0) {
          float lean = sw * (wh / hb) * (wh / hb);
          float sdx = abs(wx - (cx + lean));
          float sw0 = max(0.022, pxw * 0.9);
          if (wh > 0.0 && wh < hb && sdx < sw0) {
            float sm = (1.0 - smoothstep(sw0 * 0.6, sw0, sdx)) * alphaRow;
            float sl = mix(hz, 0.05 + 0.04 * h5, haze);
            col = mix(col, sl, sm);
          }
        }
        // leaves
        for (int li = 0; li < 3; li++) {
          float fi = float(li);
          float side = (li == 1) ? 1.0 : -1.0;
          float lyy = hb - 0.15 - 0.11 * fi;
          float lxx = cx + side * 0.15 * sc;
          float lang = side * -0.55 + (h2 - 0.5) * 0.3 + (side > 0.0 ? 0.0 : 3.14159);
          vec2 lc = vec2(lxx + sw * 0.4, lyy);
          if (abs(wx - lc.x) > 0.26 * sc || abs(wh - lc.y) > 0.2 * sc) continue;
          float ll;
          float lm = leafAt(vec2(wx, wh), lc, 0.14 * sc, 0.05 * sc, lang * side * -1.0 + (side > 0.0 ? 0.5 : -0.5), ll);
          ll *= 0.8 + 0.5 * h5;
          ll = mix(hz, ll, haze);
          col = mix(col, ll, lm * alphaRow);
        }
        // bloom
        float ey = clamp(0.40 + 0.9 * (CAMH - hb) / d, 0.42, 0.95);
        vec2 uu = vec2(wx - (cx + sw), (wh - hb) / ey) / rad;
        float r = length(uu);
        if (r < 1.25) {
          col *= 1.0 - 0.55 * haze * alphaRow * (1.0 - smoothstep(1.0, 1.22, r));
          float ang = atan(uu.y, uu.x);
          float edgeN = 1.0 + 0.06 * sin(ang * 5.0 + h2 * 30.0) + 0.04 * sin(ang * 9.0 + h3 * 11.0);
          float aa = max(0.05, pxw / (rad * ey) * 1.2);
          float mask = 1.0 - smoothstep(edgeN - aa, edgeN + aa * 0.5, r);
          if (mask > 0.001) {
            float rn = r / edgeN;
            float detail = smoothstep(0.55, 0.12, aa);
            float rings = 1.9;
            float bl = bloomLum(uu, rn, rings, detail, h5) * tone;
            bl = mix(hz, bl, haze);
            col = mix(col, bl, mask * alphaRow);
          }
        }
      }
    }
    // sunward gain on field
    float gain = 1.0 + 0.9 * exp(-pow(q.x - SUN.x, 2.0) * 5.0) * exp(q.y * 5.0);
    col *= gain;
    col = mix(col, hz, smoothstep(-0.012, 0.0, q.y) * 0.6);
  }

  // drifting petals
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float h1 = h21(vec2(fi, 1.3)), h2 = h21(vec2(fi, 7.7)), h3 = h21(vec2(fi, 3.1));
    float hw = asp * 0.5 * m;
    float px = (fract(h1 - t * 0.012 * (0.6 + h2)) * 2.0 - 1.0) * hw * 1.05;
    float py = mix(-0.45, 0.30, h2) * m - t * 0.006 + sin(t * 0.9 + fi * 2.0) * 0.02;
    vec2 d2 = q - vec2(px, py);
    float a = t * (0.6 + h3) + fi;
    float ca = cos(a), sa = sin(a);
    vec2 lp = vec2(ca * d2.x + sa * d2.y, -sa * d2.x + ca * d2.y);
    float e = length(vec2(lp.x / 0.020, lp.y / 0.009));
    float pm = 1.0 - smoothstep(0.8, 1.1, e);
    float pl = 0.55 + 0.4 * exp(-pow(px - SUN.x, 2.0) * 3.0);
    col = mix(col, pl, pm);
  }

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(vec3(col), 1.0);
}
`;

export function createRosesScene(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uT: { value: 0 }, uAspect: { value: (ctx && ctx.aspect) || 1.6 } },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    name: 'roses',
    duration: 10,
    fadeIn: false,
    fadeOut: false,
    scene,
    camera,
    update(t) { mat.uniforms.uT.value = t; },
    resize(aspect) { mat.uniforms.uAspect.value = aspect; },
    labels() { return [{ id: 'peace', text: 'PEACE', x: 0.06, y: 0.9 }]; },
  };
}
