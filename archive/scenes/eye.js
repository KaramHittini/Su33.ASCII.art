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

  float col = b * inside;

  // --- thin lid rim hugging the aperture edge (only a few px) ---
  float lim = 1.0 - smoothstep(0.92, 1.02, abs(m));
  float rimU = smoothstep(-0.002, 0.002, h) * (1.0 - smoothstep(0.006, 0.016, h));
  float rimL = smoothstep(-0.002, 0.002, hlo) * (1.0 - smoothstep(0.006, 0.014, hlo));
  col = max(col, (rimU + rimL) * 0.55 * lim * (0.4 + 0.6 * open));

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
