// Jets scene: three back-to-back cinematic passes (F-5E Tiger II -> F-20A Tigershark -> MiG-21bis).
// Each jet is shown in a "flight frame" F attached to the camera: F.x = along the screen's long axis
// (screen-right on landscape, screen-up on portrait), F.y = across, F.z = toward the camera.
// Everything is a deterministic function of t. Debug: ?jet=0|1|2&view=plan|side|front|rear|bot|q3|r3 shows a single model.
import { buildF5E, buildF20A, buildMiG21 } from './jets/models.js';
import { clamp01, lerp } from './jets/kit.js';

const FOV = 30;
const DURATION = 16;
const PASS = DURATION / 3;
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };

// dir: +1 left->right (or bottom->top in portrait). yaw 0 = nose along F.x, +yaw swings the nose away from the camera.
const SHOTS = [
  { label: 'F-5E TIGER II', id: 'f5', build: buildF5E, dir: 1, yaw: [-0.62, 0.5], roll: [0.5, 0.38], pitch: [0.05, 0.1], dutch: -0.12, y: [0.02, -0.04], fx: 0.74 },
  { label: 'F-20A TIGERSHARK', id: 'f20', build: buildF20A, dir: -1, yaw: [Math.PI + 0.55, Math.PI - 0.6], roll: [0.34, 0.3], pitch: [0.04, 0.16], dutch: 0.14, y: [-0.04, 0.06], fx: 0.74 },
  { label: 'MIG-21BIS', id: 'mig', build: buildMiG21, dir: 1, yaw: [-0.5, 0.12], roll: [3.55, 1.45], pitch: [0.0, 0.02], dutch: 0.2, y: [0.0, 0.0], fx: 0.74 },
];

export function createJetsScene(ctx) {
  const { THREE } = ctx;
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(FOV, ctx.aspect, 1, 800);
  const tanH = Math.tan((FOV * Math.PI) / 360);

  const key = new THREE.DirectionalLight(0xffffff, 3.0);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xffffff, 2.4);
  scene.add(rim, rim.target);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.4));
  const fill = new THREE.DirectionalLight(0xffffff, 0.9); // from the camera so shadow sides still read
  scene.add(fill, fill.target);

  const rig = new THREE.Group();
  scene.add(rig);
  const cache = {};
  const jets = SHOTS.map((sh) => {
    const j = sh.build(THREE, cache);
    j.group.visible = false;
    rig.add(j.group);
    j.plumes.forEach((p) => { p.userData.plume = true; });
    // vertex cloud (jet-local scene coords), plumes excluded
    j.group.updateMatrixWorld(true);
    let total = 0;
    j.group.traverse((o) => { if (o.isMesh && !o.userData.plume) total += o.geometry.attributes.position.count; });
    const step = Math.max(1, Math.floor(total / 2500));
    const pts = [];
    const v = new THREE.Vector3();
    j.group.traverse((o) => {
      if (!o.isMesh || o.userData.plume) return;
      const pa = o.geometry.attributes.position;
      for (let i = 0; i < pa.count; i += step) pts.push(v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).clone());
    });
    j.pts = pts;
    return j;
  });

  const S = { aspect: ctx.aspect };
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();
  const _r = new THREE.Vector3(), _u = new THREE.Vector3(), tmp = new THREE.Vector3(), target = new THREE.Vector3();
  let lastT = 0;

  const pose = (sh, u) => {
    const e = smooth(u);
    _e.set(lerp(sh.roll[0], sh.roll[1], e), lerp(sh.yaw[0], sh.yaw[1], e), lerp(sh.pitch[0], sh.pitch[1], e), 'YZX');
    return _q.setFromEuler(_e);
  };

  // ---- per-shot distance fit (aspect dependent) ----
  function fitShots() {
    const portrait = S.aspect < 1;
    const Al = portrait ? tanH : tanH * S.aspect, As = portrait ? tanH * S.aspect : tanH;
    SHOTS.forEach((sh, i) => {
      let D = 0, W = 0;
      for (const uu of [0.3, 0.5, 0.7]) {
        pose(sh, uu);
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const p of jets[i].pts) {
          _p.copy(p).applyQuaternion(_q);
          if (_p.x < x0) x0 = _p.x; if (_p.x > x1) x1 = _p.x;
          if (_p.y < y0) y0 = _p.y; if (_p.y > y1) y1 = _p.y;
        }
        const w = x1 - x0, h = y1 - y0;
        W = Math.max(W, w);
        D = Math.max(D, w / (2 * Al * sh.fx), h / (2 * As * 0.9));
      }
      sh.D = D; sh.Al = Al; sh.As = As;
      sh.X0 = Al * D * 1.45 + 0.65 * W;
    });
  }

  // ---- debug single-model view ----
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const DBG = params.has('jet') ? { jet: Math.max(0, Math.min(2, +params.get('jet') || 0)), view: params.get('view') || 'q3' } : null;
  const VIEWS = {
    plan: [0, 1, 0, 0, 0, -1], bot: [0, -1, 0, 0, 0, 1], side: [0, 0, 1, 0, 1, 0], front: [1, 0, 0, 0, 1, 0],
    rear: [-1, 0, 0, 0, 1, 0], q3: [0.8, 0.45, 0.9, 0, 1, 0], r3: [-0.8, 0.45, 0.9, 0, 1, 0],
  };
  function debugPose() {
    const jet = jets[DBG.jet];
    jets.forEach((j, i) => { j.group.visible = i === DBG.jet; });
    rig.rotation.set(0, 0, 0);
    jet.group.position.set(0, 0, 0);
    jet.group.quaternion.identity();
    jet.group.scale.setScalar(1);
    jet.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    jet.pts.forEach((p) => box.expandByPoint(p));
    const c = box.getCenter(new THREE.Vector3());
    const vw = VIEWS[DBG.view] || VIEWS.q3;
    const d = new THREE.Vector3(vw[0], vw[1], vw[2]).normalize();
    camera.up.set(vw[3], vw[4], vw[5]);
    let D = 40;
    const v = new THREE.Vector3();
    for (let it = 0; it < 6; it++) {
      camera.position.copy(c).addScaledVector(d, D);
      camera.lookAt(c);
      camera.updateMatrixWorld(true);
      let m = 0;
      for (const p of jet.pts) { v.copy(p).project(camera); m = Math.max(m, Math.abs(v.x), Math.abs(v.y)); }
      D *= m / 0.86;
    }
    camera.position.copy(c).addScaledVector(d, D);
    camera.lookAt(c);
    camera.updateMatrixWorld(true);
    target.copy(c);
    jet.plumes.forEach((p) => { p.visible = false; });
    return jet;
  }

  function aimLights() {
    _r.setFromMatrixColumn(camera.matrixWorld, 0);
    _u.setFromMatrixColumn(camera.matrixWorld, 1);
    tmp.copy(camera.position).sub(target).normalize();
    key.position.copy(target).addScaledVector(_r, -30).addScaledVector(_u, 30).addScaledVector(tmp, 20);
    key.position.y += 45;
    key.target.position.copy(target);
    rim.position.copy(target).addScaledVector(_r, 25).addScaledVector(_u, 20).addScaledVector(tmp, -45);
    rim.target.position.copy(target);
    fill.position.copy(target).addScaledVector(tmp, 40).addScaledVector(_r, 8).addScaledVector(_u, -6);
    fill.target.position.copy(target);
    key.target.updateMatrixWorld(); rim.target.updateMatrixWorld(); fill.target.updateMatrixWorld();
  }

  function applyState(t) {
    lastT = t;
    if (DBG) {
      debugPose();
      aimLights();
      return;
    }
    const i = Math.max(0, Math.min(2, Math.floor(t / PASS)));
    const sh = SHOTS[i];
    const u = clamp01((t - i * PASS) / PASS);
    const portrait = S.aspect < 1;
    jets.forEach((j, k) => { j.group.visible = k === i; });
    const jet = jets[i];

    rig.rotation.set(0, 0, sh.dutch + (portrait ? Math.PI / 2 : 0));
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.up.set(0, 1, 0);

    const v = 2 * u - 1;
    const prof = 0.5 * v + 0.5 * v * v * v; // slow through the middle, fast at the edges
    const depth = sh.D * (1 + 0.45 * v * v);
    const px = sh.dir * sh.X0 * prof;
    const py = depth * sh.As * lerp(sh.y[0], sh.y[1], u);
    jet.group.position.set(px, py, -depth);
    jet.group.quaternion.copy(pose(sh, u));
    jet.group.scale.setScalar(1);

    // afterburner glow
    const fl = 0.85 + 0.15 * Math.sin(t * 47) + 0.08 * Math.sin(t * 91);
    jet.nozMats.forEach((m) => m.emissive.setScalar(0.9 * fl));
    jet.plumes.forEach((p) => { p.visible = true; p.scale.set(0.8 + 0.25 * fl, 1, 1); p.material.opacity = 0.2 * fl; });

    camera.updateMatrixWorld(true);
    rig.updateMatrixWorld(true);
    jet.group.getWorldPosition(target);
    aimLights();
  }

  function labels() {
    const i = Math.max(0, Math.min(2, Math.floor(lastT / PASS)));
    const lt = lastT - i * PASS;
    return lt >= 0.4 && lt <= PASS - 0.2 ? [{ id: SHOTS[i].id, text: SHOTS[i].label, x: 0.06, y: 0.9 }] : [];
  }

  fitShots();
  applyState(0);

  return {
    name: 'jets',
    duration: DURATION,
    fadeIn: false,
    fadeOut: false,
    scene,
    camera,
    update(t) {
      applyState(t);
    },
    resize(aspect) {
      S.aspect = aspect;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      fitShots();
      applyState(lastT);
    },
    labels,
  };
}
