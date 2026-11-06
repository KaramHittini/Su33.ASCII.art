const INNER = -1; // -1: inner corner on screen-left (person's left eye); 1 flips
// Procedural eye drawn in a fullscreen fragment shader (brightness only).
const VERT = `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
const float INNER = ${INNER.toFixed(1)};
uniform float uT;
varying vec2 vP;
uniform float uAspect;

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x),
             mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
// periodic noise over angle a (radians), N fibres
float angNoise(float a, float N, float seed) {
  float u = (a / 6.2831853 + 0.5) * N;
  float i = floor(u), f = fract(u);
  f = f * f * (3.0 - 2.0 * f);
  float i0 = mod(i, N), i1 = mod(i + 1.0, N);
  return mix(hash(i0 + seed), hash(i1 + seed), f);
}

float segD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
  return length(pa - ba * h);
}
float spokeAng(float i) {
  float n = mod(i, 11.0);
  float wr = floor(i / 11.0);
  return (n + 0.6 * (hash(n * 7.3 + 1.0) - 0.5)) * 6.2831853 / 11.0 + wr * 6.2831853 - 3.14159265;
}
vec2 webPt(float i, float k, float P, float Mr) {
  float n = mod(i, 11.0);
  float wr = floor(i / 11.0);
  float f = k + i / 11.0;
  float rr = P * 0.94 * pow(max(f, 0.0) / Mr, 0.88);
  rr *= 1.0 + 0.06 * (hash(n * 3.7 + (k + wr) * 1.9) - 0.5);
  float an = spokeAng(i);
  return vec2(cos(an), sin(an)) * rr;
}
// web luminance 0..1 at pupil-local point q, thread half-width pw (eye units)
float webLum(vec2 q, float r, float a, float P, float pw, float t, float Mr) {
  float j = floor((a + 3.14159265) / (6.2831853 / 11.0));
  float d = 1e3;
  for (int di = -1; di <= 1; di++) {
    float i = j + float(di);
    float an = spokeAng(i);
    d = min(d, segD(q, vec2(0.0), vec2(cos(an), sin(an)) * 0.94 * P));
  }
  float dSp = d;
  float dR = 1e3;
  for (int di = -1; di <= 2; di++) {
    float i = j + float(di);
    for (int kk = 0; kk < 9; kk++) {
      float k = float(kk);
      if (k + 1.0 > Mr + 0.01) continue;
      vec2 A = webPt(i, k, P, Mr);
      vec2 B = webPt(i + 1.0, k, P, Mr);
      vec2 M = (A + B) * 0.5 * 0.93;
      dR = min(dR, min(segD(q, A, M), segD(q, M, B)));
    }
  }
  float ringFade = 1.0;
  float spFade = 1.0;
  float th = (1.0 - smoothstep(pw * 0.55, pw * 1.0, dSp)) * spFade;
  float tr = (1.0 - smoothstep(pw * 0.55, pw * 1.0, dR)) * ringFade;
  float hub = 1.0 - smoothstep(pw * 1.8, pw * 3.0, r);
  float w = max(max(th, tr), hub);
  float shim = 0.88 + 0.22 * pow(0.5 + 0.5 * sin(a * 2.0 - t * 1.3 + r / P * 5.0), 3.0);
  float edge = 1.0 - smoothstep(0.90, 1.0, r / P);
  return w * 0.9 * (0.94 + 0.06 * shim) * edge;
}

float lidShape(float m, float pk, float exIn, float exOut) {
  float tt = m > pk ? (m - pk) / (1.0 - pk) : (m - pk) / (1.0 + pk);
  float k = max(1.0 - tt * tt, 0.0);
  return pow(k, m > pk ? exIn : exOut);
}
float cornerY(float m, float open) { return -0.06 * m * (0.3 + 0.7 * open); }
float upperY(float m, float open, float Hu) {
  return open * lidShape(m, 0.15, 0.55, 0.95) * (Hu - 0.20 * m) + cornerY(m, open);
}
float lowerY(float m, float open) {
  return -open * lidShape(m, -0.3, 0.9, 1.0) * 0.39 + cornerY(m, open);
}
float browY(float m, float bo, float t, float port) {
  float u = (0.80 - m) / 2.0;
  return 0.15 + (0.40 + 0.14 * port) * (0.8 - m) + 0.08 * sin(clamp(u, 0.0, 1.0) * 3.14159)
       + (1.0 - bo) * 0.26 + 0.004 * sin(t * 21.0 + m * 3.0) * bo;
}
float furrow(float m, float y, float mf, float y0, float y1, float tilt, out float hi) {
  float cx = mf + tilt * (y - y0) + 0.03 * sin(y * 8.0 + mf * 5.0);
  float d = abs(m - cx);
  float env = smoothstep(y0, y0 + 0.12, y) * (1.0 - smoothstep(y1 - 0.18, y1, y));
  hi = (1.0 - smoothstep(0.02, 0.05, abs(d - 0.05))) * env;
  return (1.0 - smoothstep(0.008, 0.026, d)) * env;
}

void main() {
  float t = uT;
  vec2 s = vP;
  s.x *= uAspect;
  float W = uAspect >= 1.0 ? 0.70 * uAspect : 1.50 * uAspect;
  float port = 1.0 - smoothstep(0.6, 1.0, uAspect);

  // --- timeline ---
  float bo = smoothstep(0.6, 2.8, t);
  float openT = bo;
  float open = openT * openT * (3.0 - 2.0 * openT);
  open = smoothstep(0.0, 1.0, open);
  float fl = exp(-pow((t - 2.0) / 0.12, 2.0));
  open *= 1.0 - 0.28 * fl * step(0.6, t);
  open = clamp(open, 0.0, 1.0);

  float dil = 1.0 + 0.22 * smoothstep(2.8, 3.6, t) - 0.10 * smoothstep(3.6, 4.2, t);
  float dr = smoothstep(2.4, 3.4, t);
  vec2 pc = dr * vec2(0.07 * sin(t * 1.3), 0.025 * cos(t * 0.9)) + vec2(-0.02 * dr, 0.0);

  float tz = clamp((t - 4.2) / 3.8, 0.0, 1.0);
  float zoom = exp(log(60.0) * tz);
  float inv = 1.0 / zoom;
  vec2 e = s / W * inv + pc * (1.0 - inv);
  e.x += 0.12 * port * INNER * inv;   // portrait: show a bit more of the inner corner / brow

  float m = e.x * INNER;     // +1 at inner corner, -1 at outer corner
  float y = e.y;
  float Hu = 0.23 * mix(1.0, 1.10, port);
  float up = upperY(m, open, Hu);
  float lw = lowerY(m, open);
  float h = y - up;
  float hlo = lw - y;

  // --- skin ---
  float sk = 0.28;
  float yb = browY(m, bo, t, port);
  float rel = y - yb;
  float relB = (rel - 0.34) / 0.26;
  sk += 0.09 * exp(-relB * relB);                        // brow-bone highlight
  float relS = (y - (up + 0.16)) / 0.22;
  sk -= 0.12 * exp(-relS * relS) * (0.6 + 0.4 * clamp(m, 0.0, 1.0));   // socket shadow
  float relC = (y - (lw - 0.55)) / 0.28;
  sk += 0.08 * exp(-relC * relC) * smoothstep(1.4, -0.4, m);           // cheek highlight
  float relU = (y - (lw - 0.14)) / 0.07;
  sk -= 0.045 * exp(-relU * relU);                         // under-eye line
  sk -= 0.05 * smoothstep(0.9, 1.7, m);                    // nose-side shadow
  sk *= 1.0 - 0.18 * smoothstep(0.8, 2.2, length(e * vec2(0.8, 0.7)));
  // eyelid fold + crease following the slant
  float cg = 0.10 * open;
  float fold = smoothstep(0.0, 0.03, h) * (1.0 - smoothstep(cg, cg + 0.05, h));
  sk += 0.04 * fold;
  float crease = (1.0 - smoothstep(0.006, 0.018, abs(h - cg - 0.02))) * (1.0 - smoothstep(0.75, 0.95, abs(m)));
  sk -= 0.16 * crease * (0.3 + open);

  // furrows between brow inner end and the screen edge
  float fh1, fh2, fh3;
  float f1 = furrow(m, y, 1.02, 0.12, 0.85, 0.25, fh1);
  float f2 = furrow(m, y, 1.20, 0.15, 0.95, 0.20, fh2);
  float f3 = furrow(m, y, 1.35, 0.10, 0.70, 0.30, fh3);
  sk -= 0.17 * max(max(f1, f2), f3) * bo;
  sk += 0.11 * max(max(fh1, fh2), fh3) * bo;

  // brow: many fine hair strokes flowing outward and slightly up
  float u = (0.80 - m) / 2.0;
  float hw = mix(0.21, 0.06, smoothstep(0.25, 1.0, u));
  hw *= (1.0 + 0.5 * port) * sqrt(clamp(u / 0.07, 0.0, 1.0)) * sqrt(clamp((1.0 - u) / 0.12, 0.0, 1.0));
  float nz = (vnoise(vec2(m * 40.0, y * 40.0)) - 0.5) * 0.02;
  float alpha = (1.0 - smoothstep(hw * 0.6, hw * 1.05, abs(rel) + nz)) * step(0.0, u) * step(u, 1.0);
  float g = (rel + 0.42 * m) * 45.0;
  float gi = floor(g);
  float across = 1.0 - smoothstep(0.18, 0.45, abs(fract(g) - 0.5));
  float along = -m + 0.42 * rel;
  float af = fract(along * 3.0 + hash(gi) * 1.0);
  float alongM = smoothstep(0.0, 0.1, af) * (1.0 - smoothstep(0.65, 0.8, af));
  float hair = across * alongM * (0.7 + 0.3 * hash(gi + 5.0));
  float core = 1.0 - smoothstep(hw * 0.45, hw * 0.8, abs(rel));
  float browVal = mix(mix(0.15, 0.03, clamp(hair + 0.2, 0.0, 1.0)), 0.03, core);
  float litS = (rel - hw - 0.07) / 0.09;
  sk += 0.12 * exp(-litS * litS) * step(0.0, u) * (1.0 - smoothstep(0.9, 1.0, u)) * smoothstep(0.0, 0.1, u);
  sk = mix(sk, browVal, alpha * 0.95);

  // --- eyeball ---
  float inside = smoothstep(-0.006, 0.006, up - y) * smoothstep(-0.006, 0.006, y - lw)
               * step(abs(m), 1.0) * smoothstep(0.004, 0.02, up - lw);
  vec2 q = e - pc;
  float r = length(q);
  float a = atan(q.y, q.x);
  float R = 0.55;
  float P = 0.50 * R * dil;

  float distUp = max(up - y, 0.0);
  float distLo = max(y - lw, 0.0);
  float sclera = 0.84 - 0.20 * m * m;
  sclera -= 0.22 * exp(-distUp * 9.0) + 0.08 * exp(-distLo * 14.0);
  sclera -= 0.07 * smoothstep(0.6, 1.0, m);

  float rn = r / R;
  float fib = angNoise(a, 48.0, 3.0) * 0.6 + angNoise(a, 19.0, 9.0) * 0.4;
  float rad = vnoise(vec2(a * 6.0, rn * 4.0));
  float streak = smoothstep(0.40, 0.75, fib * (0.65 + 0.7 * rad));
  float irisB = mix(0.42, 0.68, streak);
  irisB = mix(irisB, 0.40, 0.5 * (1.0 - smoothstep(0.3, 0.6, rn)));
  float ring = smoothstep(0.90, 0.93, rn);
  irisB = mix(irisB, 0.12, ring);
  irisB *= 1.0 - 0.35 * exp(-distUp * 8.0);

  float irisMask = 1.0 - smoothstep(0.995, 1.015, rn);
  float pupilMask = 1.0 - smoothstep(P - 0.004, P + 0.004, r);

  float b = mix(sclera, irisB, irisMask);
  b = mix(b, 0.0, pupilMask);
  if (r < P) {
    float zm = 1.0 / inv;
    float pw = mix(0.014, 0.010, smoothstep(1.0, 3.0, zm)) * inv / W;
    float Mr = 6.5 + 2.5 * smoothstep(1.3, 3.0, zm);
    b = max(b, webLum(q, r, a, P, pw, t, Mr) * pupilMask);
  }
  vec2 hp = q - vec2(0.078, 0.09) * dil;
  float hl = 1.0 - smoothstep(0.032, 0.040, length(hp));
  b = mix(b, 1.0, hl);

  // caruncle (tear-duct bump) with a wet highlight
  float cmx = 0.86;
  float cyc = 0.5 * (upperY(cmx, open, Hu) + lowerY(cmx, open));
  vec2 cd = vec2((m - cmx) / 0.075, (y - cyc) / 0.060);
  float car = 1.0 - smoothstep(0.85, 1.0, length(cd));
  float carB = 0.50 - 0.12 * cd.y + 0.10 * (1.0 - length(cd));
  b = mix(b, carB, car);
  b = mix(b, 0.95, 1.0 - smoothstep(0.10, 0.26, length(cd - vec2(-0.25, 0.35))));

  float col = mix(sk, b, inside);

  // --- lid margins (thickness + rim) ---
  float lim = 1.0 - smoothstep(0.95, 1.1, abs(m));
  float darkU = smoothstep(-0.003, 0.001, h) * (1.0 - smoothstep(0.024, 0.036, h));
  col = mix(col, 0.05, darkU * 0.9 * lim);
  float rimU = smoothstep(0.024, 0.032, h) * (1.0 - smoothstep(0.045, 0.06, h));
  col += 0.07 * rimU * lim;
  float wet = smoothstep(0.0, 0.004, distLo) * (1.0 - smoothstep(0.016, 0.028, distLo)) * inside;
  col = mix(col, 0.66, wet * 0.8);
  float darkL = (1.0 - smoothstep(0.0, 0.014, abs(hlo - 0.007))) * step(0.0, hlo);
  col = mix(col, 0.10, darkL * 0.8 * lim);
  float rimL = smoothstep(0.016, 0.022, hlo) * (1.0 - smoothstep(0.04, 0.06, hlo));
  col += 0.06 * rimL * lim;

  // --- upper lashes: long, curving outward ---
  float m0 = m + 0.9 * h + 2.0 * h * h;
  float uL = m0 * 11.0;
  float cellU = floor(uL);
  float fuU = fract(uL) - 0.5;
  float lenU = (0.10 + 0.12 * hash(cellU + 1.0)) * (0.4 + 0.6 * open) * (0.55 + 0.45 * smoothstep(0.8, -0.8, m0));
  float tw = 0.28 * (1.0 - 0.75 * clamp(h / max(lenU, 0.001), 0.0, 1.0));
  float lashU = (1.0 - smoothstep(tw * 0.5, tw, abs(fuU))) * step(0.0, h) * step(h, lenU)
              * step(-0.85, m0) * step(m0, 0.75);
  col = mix(col, 0.04, lashU * 0.9);
  // lower lashes: short, sparse
  float m1 = m + 0.8 * hlo;
  float uLo = m1 * 9.0;
  float cellL = floor(uLo);
  float fuL = fract(uLo) - 0.5;
  float lenL = (0.04 + 0.04 * hash(cellL + 40.0)) * (0.4 + 0.6 * open);
  float lashL = (1.0 - smoothstep(0.10, 0.22, abs(fuL))) * step(0.0, hlo) * step(hlo, lenL)
              * step(0.5, hash(cellL + 20.0)) * step(abs(m1), 0.8);
  col = mix(col, 0.05, lashL * 0.8);

  // --- final fade to black, last 0.6s fully black ---
  col *= 1.0 - smoothstep(6.6, 7.4, t);
  col *= 1.0 - smoothstep(6.8, 7.4, t);
  col *= step(t, 7.4);
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(vec3(col), 1.0);
}
`;

export function createEyeScene(ctx) {
  const { THREE } = ctx;
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uT: { value: 0 },
      uAspect: { value: ctx.aspect || 1 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  return {
    name: 'eye',
    duration: 8,
    fadeIn: false,
    fadeOut: false,
    scene,
    camera,
    update(t) {
      material.uniforms.uT.value = t;
    },
    resize(aspect) {
      material.uniforms.uAspect.value = aspect;
    },
    labels() {
      return [];
    },
  };
}
