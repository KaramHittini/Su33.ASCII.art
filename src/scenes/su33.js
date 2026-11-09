// Su-33 (Flanker-D) scene: lofted procedural jet with monochrome camo, fly-in to a banked front-3/4 hero shot
// -> crane to top-down -> exploded view. Framing is fitted to the real vertex cloud every step.
// Model space (metres): x = aft from nose tip, y = right, z = up. Scene axes: nose +X, up +Y, right +Z.
// Everything is deterministic from t.

import { buildSu33, makeLights, aimLights, T, GROUND_Y } from '../su33/model.js';
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const smooth = (a, b, v) => {
  const k = clamp01((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};

const FOV = 30;
const T_EXPLODE = 9;
const T_HOLD = 13;
const T_RE = 16, T_CR = 19, T_EX = 21.4, T_END = 25.0;
const T_BURN = 1.3; // afterburner fully lit this long after T_EX; the jet then accelerates hard out of frame
const AZ_E = 1.25, EL_E = 0.32, ROLL_E = -0.1, PITCH_E = 0.03;


export function createSu33Scene(ctx) {
  const { THREE } = ctx;
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(FOV, ctx.aspect, 1, 800);
  const tanH = Math.tan((FOV * Math.PI) / 360);
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('rig') && params.get('rig') !== '0';

  // ---------- model + lights ----------
  const lights = makeLights(scene);
  const model = buildSu33();
  const { root, parts, rig } = model;
  scene.add(root);
  const missileParts = parts.filter((p) => p.kind === 'missile');
  const gearPart = parts.find((p) => p.kind === 'gearM');

  // ---------- layout (aspect-dependent) ----------
  const S = { aspect: ctx.aspect, Dexp: 60, cx: 0, exitX: 60 };

  function setMissileLayout() {
    const portrait = S.aspect < 1;
    const r27 = missileParts.filter((p) => p.m.kind === 'R-27');
    const r73 = missileParts.filter((p) => p.m.kind === 'R-73');
    const place = (p, mx, my) => {
      const [X, Y, Z] = T(mx, my, 0.2);
      p.off = [X - p.base.x, Y - p.base.y, Z - p.base.z];
    };
    if (portrait) {
      r27.forEach((p, i) => (i < 5 ? place(p, 32, -4.8 + i * 2.4) : place(p, 42, -2.4 + (i - 5) * 2.4)));
      [-4.8, -2.4, 2.4, 4.8].forEach((y, i) => place(r73[i], 37, y));
    } else {
      for (const s of [-1, 1]) {
        const mine = missileParts.filter((p) => p.m.ls === s).sort((a, b) => a.m.slot - b.m.slot);
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
      p.e = e;
      p.g.position.set(p.base.x + p.off[0] * e, p.base.y + p.off[1] * e, p.base.z + p.off[2] * e);
    }
  }

  // ---------- framing: fit the real vertex cloud of the assembled jet ----------
  const PTS = [];
  function gatherPts() {
    PTS.length = 0;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    let total = 0;
    root.traverseVisible((o) => { if (o.isMesh) total += o.geometry.attributes.position.count; });
    const step = Math.max(1, Math.floor(total / 2500));
    const v = new THREE.Vector3();
    root.traverseVisible((o) => {
      if (!o.isMesh) return;
      const pa = o.geometry.attributes.position;
      for (let i = 0; i < pa.count; i += step) PTS.push(v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).clone());
    });
    W.length = 0;
    for (const p of PTS) W.push(p.clone());
  }
  placeParts(() => 0, 0);
  const W = [];
  gatherPts();
  const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4();
  const _e = new THREE.Euler();
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
  const DIR_A = new THREE.Vector3(), DIR_E = new THREE.Vector3();
  const azA = () => (S.aspect < 1 ? 2.6 : AZ_A), elA = () => (S.aspect < 1 ? 0.72 : EL_A);
  const FE = { D: 0, tgt: new THREE.Vector3() };
  const EXIT_FX = () => (S.aspect < 1 ? 0.9 : 0.6);
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
    sph(AZ_E, EL_E, DIR_E);
    fit(DIR_E, UP_Y, ROLL_E, PITCH_E, EXIT_FX(), a < 1 ? 0.4 : 0.5, FE);
    {
      _r.setFromMatrixColumn(camera.matrixWorld, 0);
      const halfW = FE.D * tanH * a;
      S.exitX = ((halfW + 21) / Math.max(Math.abs(_r.x), 0.5)) * 1.2;
    }
    setMissileLayout();
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    placeParts(() => 1, 0);
    rig.setGear(1);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const H = box.max.x - box.min.x;
    const Wd = box.max.z - box.min.z;
    S.cx = (box.max.x + box.min.x) / 2;
    S.Dexp = Math.max(H / (portrait ? 0.76 : 0.86) / (2 * tanH), Wd / (portrait ? 0.92 : 0.8) / (2 * tanH * a));
    S.Dexp = Math.max(S.Dexp, FB.D);
    rig.setGear(0);
  }

  // ---------- state ----------
  const target = new THREE.Vector3();
  const dir = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3();
  let lastT = 0;
  const OMAX = Math.max(...parts.map((p) => p.order));
  function applyState(t) {
    lastT = t;
    const s = easeInOutCubic(clamp01((t - 5) / 4));
    const rr = easeInOutCubic(clamp01((t - T_RE) / 3));
    const eg = t < T_RE ? easeOutCubic(clamp01((t - T_EXPLODE) / (T_HOLD - T_EXPLODE))) : 1 - rr;
    const h = clamp01((t - T_HOLD) / (T_RE - T_HOLD)) * (t < T_RE ? 1 : 1 - rr);
    const enter = easeOutCubic(clamp01(t / 4.0));
    const live = 1 - s;
    const c = easeInOutCubic(clamp01((t - T_CR) / (T_EX - T_CR)));

    // attitude: banked rear-3/4 cruise -> level for the top-down -> slight bank for the exit
    let roll = lerp(ROLL_A, 0, s) + (0.35 * (1 - enter) + 0.03 * Math.sin(t * 1.1)) * live;
    let pitch = lerp(PITCH_A, 0, s) + 0.02 * Math.sin(t * 0.8) * live;
    if (t >= T_CR) { roll = ROLL_E * c; pitch = PITCH_E * c; }
    const k = 1 - enter;
    let exitX = 0, pitchX = 0;
    if (t >= T_EX) {
      // slow roll while the burners light, then a hard acceleration (clears the frame ~2.8 s after T_EX)
      const tau = t - T_EX, b = Math.max(0, tau - T_BURN);
      exitX = S.exitX * (0.04 * tau + 0.3 * b * b);
      pitchX = 0.05 * Math.min(1, tau / 3);
    }
    root.rotation.set(roll, 0, pitch + pitchX);
    root.position.set(-48 * k + 0.25 * Math.sin(t * 0.7) * live + exitX, 3 * k + 0.15 * Math.sin(t * 1.3) * live, -4 * k);

    if (t < T_RE) placeParts((p) => easeOutCubic(clamp01((t - T_EXPLODE - p.order * 0.1) / 2.1)), h);
    else placeParts((p) => 1 - easeInOutCubic(clamp01((t - T_RE - (OMAX - p.order) * 0.07) / 1.5)), h);

    // gear is retracted in flight; it deploys as the parts fly apart in the exploded view
    rig.setGear(Math.min(1, (gearPart.e || 0) * 2.5));
    // afterburner: nozzles glow first, plumes light as the jet starts to leave
    const glow = smooth(T_CR + 0.8, T_EX + 1.2, t) * (1.0 + 0.15 * Math.sin(t * 40));
    rig.setAfterburner(smooth(T_EX - 0.3, T_EX + 1.6, t), glow);
    model.update(t);

    setFov(t < 5 ? FOV_A : t < T_EXPLODE ? lerp(FOV_A, FOV, s) : FOV);
    const portrait = S.aspect < 1;
    if (t < 5) {
      dir.copy(DIR_A); up.copy(UP_Y); target.copy(FA.tgt);
      camera.position.copy(target).addScaledVector(dir, FA.D);
    } else if (t < T_EXPLODE) {
      // crane up and over, re-fitting the frame every step so nothing clips
      const el = lerp(elA(), Math.PI / 2 - 1e-4, s), az = lerp(azA(), 0, s);
      sph(az, el, dir);
      up.copy(UP_Y).lerp(UP_X, smooth(0.15, 0.85, s)).normalize();
      fit(dir, up, roll, pitch, lerp(portrait ? 0.94 : 0.8, portrait ? 0.9 : 0.8, s), lerp(portrait ? 0.62 : 0.74, 0.8, s), FC);
      target.copy(FC.tgt);
      camera.position.copy(target).addScaledVector(dir, FC.D);
    } else if (t < T_CR) {
      // exploded view (and reassembly): top-down, slight tilt toward the tail during the hold
      const tilt = 0.12 * smooth(0, 1, h);
      dir.set(-Math.sin(tilt), Math.cos(tilt), 0);
      up.copy(UP_X);
      target.set(lerp(FB.tgt.x, S.cx, eg), 0, lerp(FB.tgt.z, 0, eg));
      camera.position.copy(target).addScaledVector(dir, lerp(FB.D, S.Dexp, eg) * (1 + 0.03 * h));
    } else if (t < T_EX) {
      // crane down from top-down to the nose-left 3/4 view
      sph(lerp(0, AZ_E, c), lerp(Math.PI / 2 - 1e-4, EL_E, c), dir);
      up.copy(UP_X).lerp(UP_Y, smooth(0.15, 0.85, c)).normalize();
      fit(dir, up, roll, pitch, lerp(portrait ? 0.9 : 0.8, EXIT_FX(), c), lerp(0.8, portrait ? 0.4 : 0.5, c), FC);
      target.copy(FC.tgt);
      camera.position.copy(target).addScaledVector(dir, FC.D);
    } else {
      // camera holds the final nose-left framing while the jet leaves
      sph(AZ_E, EL_E, dir);
      up.copy(UP_Y);
      target.copy(FE.tgt);
      camera.position.copy(target).addScaledVector(dir, FE.D);
    }
    camera.up.copy(up);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    aimLights(camera, target, lights);
    root.updateMatrixWorld(true);
  }

  function labels() {
    if (DEBUG) return [{ id: 'title', text: debugLabel, x: 0.06, y: 0.9 }];
    return lastT >= 1 ? [{ id: 'title', text: 'SU-33 FLANKER-D', x: 0.06, y: 0.9 }] : [];
  }

  // ---------- debug rig view: ?scene=su33&rig=1&fold=&gear=&hook=&ab=&flaps=&airbrake=&probe=&canards=&stabs=&view=q3|side|plan|front|rear ----------
  const num = (k, d = 0) => { const v = parseFloat(params.get(k)); return Number.isFinite(v) ? v : d; };
  const RIGP = {
    fold: num('fold'), stabFold: num('stabfold', num('fold')), gear: num('gear'), hook: num('hook'), ab: num('ab'),
    flaps: num('flaps'), airbrake: num('airbrake'), probe: num('probe'), canards: num('canards'), stabs: num('stabs'),
  };
  const VIEW = params.get('view') || 'q3';
  const VIEWS = {
    q3: [new THREE.Vector3(0.8, 0.5, 0.75).normalize(), UP_Y],
    side: [new THREE.Vector3(0, 0, 1), UP_Y],
    plan: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)],
    front: [new THREE.Vector3(1, 0, 0), UP_Y],
    rear: [new THREE.Vector3(-1, 0, 0), UP_Y],
  };
  const FD = { D: 0, tgt: new THREE.Vector3() };
  function setupDebug() {
    placeParts(() => 0, 0);
    rig.set(RIGP);
    gatherPts();
    const [d, u] = VIEWS[VIEW] || VIEWS.q3;
    setFov(FOV);
    fit(d, u, 0, 0, 0.82, 0.8, FD);
    target.copy(FD.tgt);
    camera.position.copy(target).addScaledVector(d, FD.D);
    camera.up.copy(u);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    aimLights(camera, target, lights);
  }
  function applyRig(t) {
    lastT = t;
    model.update(t);
  }
  const debugLabel = `RIG ${VIEW} fold ${RIGP.fold} gear ${RIGP.gear} hook ${RIGP.hook} ab ${RIGP.ab}`.toUpperCase();

  if (DEBUG) setupDebug();
  else { computeDists(); applyState(0); }

  return {
    name: 'su33',
    duration: T_END,
    fadeIn: false,
    fadeOut: false,
    scene,
    camera,
    model,
    update(t) {
      if (DEBUG) applyRig(t); else applyState(t);
    },
    resize(aspect) {
      S.aspect = aspect;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      if (DEBUG) { setupDebug(); return; }
      computeDists();
      applyState(lastT);
    },
    labels,
  };
}
