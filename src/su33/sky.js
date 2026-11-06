// Reusable flight backdrop: dusk sky gradient, low sun, cloud banks above, a cloud deck far below, plus an
// analytic ribbon-trail helper (wingtip / LERX vapour). Fully deterministic from (t, camera).
//
//   const sky = createSky(scene);            // adds a fullscreen background mesh (renderOrder -100)
//   sky.update(t, camera);                   // call every frame AFTER the camera is placed
//   sky.setSun(az, el)                       // optional: sun direction (world azimuth about +Y, elevation rad)
//
//   const trail = createTrail(scene, { segments: 40, width: 0.4, grow: 1.2, maxAge: 1.6 });
//   trail.update(camera, (age, out) => { out.set(x, y, z); return intensity01; }, { widthScale: 1 });
//   // sampler(age, out): write the WORLD position of the emitter `age` seconds ago, return its vapour
//   // intensity at that moment (0..1). Brightness fades with age, width grows with age.
import * as THREE from 'three';

const SKY_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vNdc;
uniform mat3 uRot;
uniform vec3 uCam;
uniform vec2 uTan;
uniform float uT;
uniform vec3 uSun;
uniform float uDeck;   // deck depth below world y=0

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(uRot * vec3(vNdc.x * uTan.x, vNdc.y * uTan.y, -1.0));
  float e = d.y;
  float sd = max(dot(d, uSun), 0.0);

  // dusk gradient: navy zenith -> violet-blue -> warm peach horizon band
  float up = clamp(e, 0.0, 1.0);
  float k = pow(up, 0.38);
  vec3 zen = vec3(0.05, 0.07, 0.30), mid = vec3(0.20, 0.17, 0.50), hor = vec3(0.85, 0.46, 0.28);
  vec3 c = mix(hor, mix(mid, zen, smoothstep(0.35, 1.0, k)), smoothstep(0.0, 0.5, k));
  float g1 = pow(sd, 6.0) * 0.10, g2 = pow(sd, 40.0) * 0.20, g3 = pow(sd, 700.0) * 0.55;
  vec3 glowC = vec3(1.0, 0.45, 0.16) * g1 + vec3(1.0, 0.6, 0.28) * g2 + vec3(1.0, 0.86, 0.6) * g3;
  c += glowC;
  float glow = g1 + g2 + g3;
  vec3 horizon = vec3(0.85, 0.46, 0.28) + glowC * 1.1;

  if (e > 0.0) {
    // cloud banks: three streaky layers (near ones sweep past fast)
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float h = 45.0 + fi * 130.0 - uCam.y;
      float t = h / max(e, 0.012);
      vec2 w = uCam.xz + d.xz * t;
      float sc = 0.0105 / (1.0 + fi * 1.7);
      vec2 q = vec2(w.x * sc * 0.28, w.y * sc * 1.1) + vec2(uT * 0.01 * (fi + 1.0), fi * 9.3);
      float n = fbm(q);
      float cov = smoothstep(0.50, 0.70, n);
      float lit = smoothstep(0.0, 0.25, fbm(q + vec2(0.06, 0.05)) - n + 0.12);
      float tone = 0.07 + 0.20 * lit + pow(sd, 3.0) * 0.5 * lit;
      // lit from below on the sun side: pink-orange; blue-grey in shadow
      float warm = lit * smoothstep(0.0, 0.7, pow(sd, 0.35)) + pow(sd, 6.0) * 0.5;
      vec3 hue = mix(vec3(0.62, 0.72, 1.05), vec3(1.25, 0.68, 0.48), clamp(warm, 0.0, 1.0));
      hue = mix(hue, vec3(1.3, 0.6, 0.6), 0.25 * lit * pow(sd, 2.0));
      vec3 cl = tone * hue;
      float fog = exp(-t * 0.00055);
      cov *= fog * smoothstep(0.0, 0.05, e);
      c = mix(c, cl, cov * (0.85 - fi * 0.12));
    }
    // extra wisps right at the horizon
    c = mix(c, horizon, exp(-e * 22.0) * 0.5);
  } else {
    // cloud deck / sea far below: dark blue with warm highlights toward the sun
    float t = (uDeck + uCam.y) / max(-e, 0.0008);
    vec2 w = uCam.xz + d.xz * t;
    vec2 q = vec2(w.x * 0.0030, w.y * 0.0085);
    float n = fbm(q);
    float n2 = fbm(q + vec2(-0.010, 0.014) * 3.0);
    float shade = clamp(0.5 + (n - n2) * 9.0, 0.0, 1.0);
    float cov = smoothstep(0.38, 0.62, n);
    float deck = mix(0.03, 0.10, cov) + shade * cov * 0.2;
    float warmD = pow(sd, 3.0) * cov;
    vec3 dc = deck * vec3(0.55, 0.72, 1.2) + vec3(1.0, 0.5, 0.25) * (warmD * 0.22 + pow(sd, 8.0) * shade * cov * 0.15);
    float fog = exp(-t * 0.00032);
    c = mix(horizon, dc, fog);
    // smooth join at the horizon line
    c = mix(c, horizon, exp(e * 90.0) * 0.45);
  }
  c = pow(clamp(c, 0.0, 1.0), vec3(1.15));
  gl_FragColor = vec4(c, 1.0);
}`;

export function createSky(scene) {
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRot: { value: new THREE.Matrix3() },
      uCam: { value: new THREE.Vector3() },
      uTan: { value: new THREE.Vector2(1, 1) },
      uT: { value: 0 },
      uSun: { value: new THREE.Vector3(0.5, 0.08, -0.85).normalize() },
      uDeck: { value: 420 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  scene.add(mesh);
  const u = material.uniforms;
  return {
    mesh,
    setSun(az, el) {
      u.uSun.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    },
    setDeck(depth) { u.uDeck.value = depth; },
    update(t, camera) {
      camera.updateMatrixWorld(true);
      u.uRot.value.setFromMatrix4(camera.matrixWorld);
      u.uCam.value.copy(camera.position);
      const th = Math.tan((camera.fov * Math.PI) / 360);
      u.uTan.value.set(th * camera.aspect, th);
      u.uT.value = t;
    },
  };
}

// ---------- vapour ribbon ----------
export function createTrail(scene, opts = {}) {
  const N = opts.segments || 40;
  const width = opts.width ?? 0.4;
  const grow = opts.grow ?? 1.0;
  const maxAge = opts.maxAge ?? 1.5;
  const gain = opts.gain ?? 1.0;
  const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3);
  const idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, blending: THREE.AdditiveBlending, transparent: true,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 50;
  scene.add(mesh);
  const P = Array.from({ length: N }, () => new THREE.Vector3());
  const I = new Float32Array(N);
  const d = new THREE.Vector3(), v = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    mesh,
    update(camera, sampler, o = {}) {
      const ws = o.widthScale ?? 1;
      for (let i = 0; i < N; i++) I[i] = sampler((i / (N - 1)) * maxAge, P[i]) || 0;
      for (let i = 0; i < N; i++) {
        const a = i / (N - 1);
        const p0 = P[Math.max(0, i - 1)], p1 = P[Math.min(N - 1, i + 1)];
        d.copy(p1).sub(p0);
        v.copy(camera.position).sub(P[i]);
        s.crossVectors(d, v);
        if (s.lengthSq() < 1e-12) s.set(0, 1, 0); else s.normalize();
        const w = (width + grow * a) * ws * 0.5 * (i === 0 ? 0.5 : 1);
        const b = I[i] * gain * Math.pow(1 - a, 1.4) * Math.min(1, 0.4 + a * 14);
        for (let k = 0; k < 2; k++) {
          const j = (i * 2 + k) * 3, sg = k ? 1 : -1;
          pos[j] = P[i].x + s.x * w * sg; pos[j + 1] = P[i].y + s.y * w * sg; pos[j + 2] = P[i].z + s.z * w * sg;
          col[j] = b; col[j + 1] = b * 0.9; col[j + 2] = b * 0.76;   // vapour: white with a warm dusk tint
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
