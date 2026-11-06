// Pugachev's Cobra. ~3 s banked afterburner turn with wingtip vapour, then the nose snaps past vertical
// (~115 deg) while the flight path stays level and speed collapses, LERX vapour streams, and the jet drops
// back to level and accelerates away. Side-on / slight front-3/4 tracking camera that lags the jet, so the
// slowdown and the final surge read against the sky/cloud deck. Deterministic: jet + camera tracks are
// pre-integrated into tables and sampled by t.

import { buildSu33, makeLights, aimLights, T } from '../su33/model.js';
import { createSky, createTrail } from '../su33/sky.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

const FOV = 30;
const DURATION = 12;
const T0 = -4, DT = 1 / 120;
const TAU = 0.35;           // camera lag (s)
const V0 = 55;              // cruise speed (m/s, scene units)
const PITCH_MAX = 2.0;      // ~115 deg

// ---------- analytic flight profile ----------
const yawAt = (t) => 0.5 * (1 - smooth(0.2, 3.5, t));
const rollAt = (t) => 1.0 * (1 - smooth(2.5, 3.9, t)) * smooth(-2, 0, t) + 0.9 * (1 - smooth(-2, 0, t));
function pitchAt(t) {
  const turn = 0.07 * (1 - smooth(2.8, 4.0, t));
  if (t < 4.4) return turn;
  if (t < 5.3) return lerp(turn, PITCH_MAX, easeIO((t - 4.4) / 0.9));
  if (t < 5.95) return PITCH_MAX + 0.07 * Math.sin((t - 5.3) * 4.5) - 0.05 * smooth(5.3, 5.95, t);
  if (t < 7.1) {
    const k = easeIO((t - 5.95) / 1.15);
    return lerp(PITCH_MAX - 0.05, 0, k) - 0.1 * Math.sin(k * Math.PI) * k;
  }
  return -0.1 * 0 + 0.05 * Math.exp(-(t - 7.1) * 2) * Math.sin((t - 7.1) * 6);
}
function speedAt(t) {
  if (t < 4.5) return V0;
  if (t < 6.8) return lerp(V0, 36, smooth(4.5, 5.6, t));
  if (t < 7.6) return lerp(36, 52, smooth(6.8, 7.6, t));
  return lerp(52, 190, smooth(7.6, 11.5, t));
}
const rateAt = (t) => (pitchAt(t + 0.02) - pitchAt(t - 0.02)) / 0.04;

// pre-integrated tables: jet position + lagged camera target
const NS = Math.round((DURATION + 2 - T0) / DT) + 1;
const JX = new Float32Array(NS), JY = new Float32Array(NS), JZ = new Float32Array(NS);
const CX = new Float32Array(NS), CY = new Float32Array(NS), CZ = new Float32Array(NS);
(function build() {
  let x = 0, z = 0, y = 0;
  const vx0 = V0 * Math.cos(yawAt(T0)), vz0 = -V0 * Math.sin(yawAt(T0));
  let ex = x - vx0 * TAU, ez = z - vz0 * TAU, ey = 0;
  const a = 1 - Math.exp(-DT / TAU);
  for (let i = 0; i < NS; i++) {
    const t = T0 + i * DT;
    y = 1.5 * Math.sin(t * 0.7) * (1 - smooth(4, 6, t)) + 3.5 * smooth(5.0, 6.3, t) * (1 - smooth(6.3, 8.5, t));
    JX[i] = x; JY[i] = y; JZ[i] = z;
    ex += (x - ex) * a; ez += (z - ez) * a; ey += (y - ey) * (1 - Math.exp(-DT / 0.9));
    CX[i] = ex + vx0 * TAU; CZ[i] = ez + vz0 * TAU; CY[i] = ey;
    const v = speedAt(t), yw = yawAt(t);
    x += v * Math.cos(yw) * DT;
    z += -v * Math.sin(yw) * DT;
  }
})();
function samp(tab, t) {
  const f = clamp((t - T0) / DT, 0, NS - 1.001);
  const i = Math.floor(f), k = f - i;
  return tab[i] * (1 - k) + tab[i + 1] * k;
}

export function createCobraScene(ctx) {
  const { THREE } = ctx;
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(FOV, ctx.aspect, 1, 3000);
  const tanH = Math.tan((FOV * Math.PI) / 360);

  const sky = createSky(scene);
  sky.setSun(0.05, 0.085);
  const lights = makeLights(scene);
  lights.key.intensity *= 1.15; lights.hemi.intensity *= 1.1;
  const model = buildSu33({ missiles: true });
  const { root, rig } = model;
  scene.add(root);

  const tipL = createTrail(scene, { segments: 56, width: 0.22, grow: 0.6, maxAge: 1.4, gain: 0.7 });
  const tipR = createTrail(scene, { segments: 56, width: 0.22, grow: 0.6, maxAge: 1.4, gain: 0.7 });
  const lerxL = createTrail(scene, { segments: 36, width: 0.3, grow: 1.1, maxAge: 1.0, gain: 0.85 });
  const lerxR = createTrail(scene, { segments: 36, width: 0.3, grow: 1.1, maxAge: 1.0, gain: 0.85 });

  const S = { aspect: ctx.aspect, D: 70 };
  let lastT = 0;

  const holder = new THREE.Object3D();
  const _lp = new THREE.Vector3();
  function poseAt(tt) {
    holder.position.set(samp(JX, tt), samp(JY, tt), samp(JZ, tt));
    holder.rotation.set(rollAt(tt), yawAt(tt), pitchAt(tt), 'YZX');
    holder.updateMatrixWorld(true);
  }
  const tipI = (tt) =>
    0.95 * smooth(0.3, 1.2, tt) * (1 - smooth(3.1, 3.9, tt)) +
    0.55 * smooth(4.5, 5.0, tt) * (1 - smooth(6.6, 7.4, tt)) +
    0.5 * smooth(7.3, 8.3, tt) * (1 - smooth(9.0, 10.0, tt));
  const lerxI = (tt) => smooth(4.55, 5.0, tt) * (1 - smooth(6.4, 7.0, tt));
  function emitter(local, intensity, tNow) {
    return (age, out) => {
      const tt = tNow - age;
      poseAt(tt);
      out.set(local[0], local[1], local[2]).applyMatrix4(holder.matrixWorld);
      return intensity(tt);
    };
  }
  const wL = T(13.6, -7.2, 0.35), wR = T(13.6, 7.2, 0.35);
  const lL = T(5.2, -1.3, 0.3), lR = T(5.2, 1.3, 0.3);

  const target = new THREE.Vector3();
  function applyState(t) {
    lastT = t;
    poseAt(t);
    root.position.copy(holder.position);
    root.rotation.copy(holder.rotation);

    const rate = rateAt(t);
    const hold = smooth(5.0, 5.4, t) * (1 - smooth(6.1, 6.6, t));
    const c = clamp(rate * 0.28, -0.55, 0.55) + 0.12 * hold;
    rig.set({
      canards: c,
      stabs: -c * 0.9,
      airbrake: 0.85 * smooth(5.1, 5.5, t) * (1 - smooth(6.0, 6.6, t)),
      flaps: 0.25 * hold,
      ab: lerp(0.85, 0.55, smooth(3.8, 4.6, t)) * (1 - smooth(4.6, 5.0, t)) + 0.55 * smooth(4.6, 5.0, t) * (1 - smooth(6.4, 7.0, t)) + smooth(6.6, 7.4, t),
    });
    model.update(t);

    // camera: slightly in front of the beam, a bit below the jet so the horizon sits in the lower third
    target.set(samp(CX, t), samp(CY, t), samp(CZ, t));
    const D = S.D;
    camera.position.set(target.x + D * 0.3, target.y - D * 0.09, target.z + D * 0.955);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    aimLights(camera, holder.position, lights);
    sky.update(t, camera);

    const ws = S.aspect < 1 ? 1.8 : 1;
    tipL.update(camera, emitter(wL, tipI, t), { widthScale: ws });
    tipR.update(camera, emitter(wR, tipI, t), { widthScale: ws });
    lerxL.update(camera, emitter(lL, lerxI, t), { widthScale: ws });
    lerxR.update(camera, emitter(lR, lerxI, t), { widthScale: ws });
    root.updateMatrixWorld(true);
  }

  function layout() {
    const portrait = S.aspect < 1;
    const visW = portrait ? 27 : 64;
    S.D = visW / (2 * tanH * S.aspect);
  }

  layout();
  applyState(0);

  return {
    name: 'cobra',
    duration: DURATION,
    fadeIn: false,
    fadeOut: false,
    scene,
    camera,
    update(t) { applyState(t); },
    resize(aspect) {
      S.aspect = aspect;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      layout();
      applyState(lastT);
    },
    labels() {
      return lastT >= 0.4 ? [{ id: 'title', text: "PUGACHEV'S COBRA", x: 0.06, y: 0.9 }] : [];
    },
  };
}
