// Launch scene: Su-33 unfolds its wings on Kuznetsov's deck, lights the afterburners behind the rising blast deflector,
// accelerates up the deck and leaps off the 14-degree ski-jump, climbing away with the gear coming up.
// Deterministic from t.
import { buildSu33, makeLights, aimLights, GROUND_Y } from '../su33/model.js';
import { buildCarrier, rampY, rampSlope, RAMP_X1 } from '../su33/carrier.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const DEG = Math.PI / 180;

const DURATION = 14;
const X0 = 8;          // launch position (root x)
const T_REL = 3.9;     // restraint released, run begins
const ACC = 11;        // m/s^2 along the deck
const T_LIP = T_REL + Math.sqrt((2 * (RAMP_X1 - X0)) / ACC);
const V_LIP = ACC * (T_LIP - T_REL);
const JY = -GROUND_Y;  // root height above a surface it stands on

export function createLaunchScene(ctx) {
  const { THREE } = ctx;
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(32, ctx.aspect, 0.5, 9000);
  const lights = makeLights(scene);
  lights.key.intensity = 5.5; lights.rim.intensity = 3.6;
  lights.hemi.groundColor.set(0xa0a0a0); lights.hemi.intensity = 1.8;
  // dusk grade: warm low-sun key, cool sky rim and fill
  lights.key.color.set(0xffe9d2); lights.rim.color.set(0x9fb8ff); lights.hemi.color.set(0xa4bcf8); lights.hemi.groundColor.set(0x8a7868);
  const carrier = buildCarrier();
  scene.add(carrier.group);
  const jet = buildSu33({ missiles: true });
  scene.add(jet.root);
  const rig = jet.rig;
  const S = { aspect: ctx.aspect };
  let lastT = 0;

  // flight path after the lip (numerically integrated, deterministic)
  function airborne(tau) {
    let x = RAMP_X1, y = rampY(RAMP_X1) + JY, v = V_LIP, g = 0;
    const gam = (u) => (14 - 3.5 * smooth(0, 1.1, u) + 11 * smooth(1.0, 4.2, u)) * DEG;
    const dt = 0.04;
    for (let u = 0; u < tau; u += dt) {
      const h = Math.min(dt, tau - u);
      g = gam(u);
      x += v * Math.cos(g) * h;
      y += v * Math.sin(g) * h;
      v += 7 * h;
    }
    g = gam(tau);
    return { x, y, pitch: g + 5 * DEG * smooth(0, 0.7, tau) };
  }

  const pos = new THREE.Vector3(), cam = new THREE.Vector3(), tgt = new THREE.Vector3();

  function applyState(t) {
    lastT = t;
    const tr = t - T_REL;
    let x, y, pitch = 0, sink = 0;
    if (t < T_REL) {
      x = X0; y = JY; pitch = 0;
      y += 0.012 * Math.sin(t * 53) * smooth(2.4, 3.4, t);
    } else if (t < T_LIP) {
      x = X0 + 0.5 * ACC * tr * tr;
      y = rampY(x) + JY;
      pitch = rampSlope(x);
    } else {
      const a = airborne(t - T_LIP);
      x = a.x; y = a.y; pitch = a.pitch;
    }
    const aboveLip = t - T_LIP;
    jet.root.position.set(x, y, 0);
    jet.root.rotation.set(0, 0, pitch);
    // configuration
    rig.setWingFold(1 - smooth(0.4, 2.4, t));
    rig.setStabFold(1 - smooth(0.4, 2.0, t));
    rig.setFlaps(smooth(1.6, 2.6, t) * (1 - smooth(T_LIP + 3.5, T_LIP + 5, t)));
    rig.setCanards(0.12 * smooth(2.2, 3.2, t) + 0.2 * smooth(T_LIP - 1.4, T_LIP - 0.2, t) - 0.25 * smooth(T_LIP + 2.5, T_LIP + 4, t));
    rig.setStabs(-0.2 * smooth(T_LIP - 1.0, T_LIP + 0.2, t) + 0.15 * smooth(T_LIP + 2.0, T_LIP + 3.5, t));
    rig.setGear(1 - smooth(T_LIP + 0.5, T_LIP + 2.0, t));
    const ab = smooth(2.4, 3.4, t);
    rig.setAfterburner(ab, ab);
    jet.update(t);
    carrier.setDeflector(smooth(1.4, 2.6, t));
    carrier.update(t, camera);

    // ----- cameras -----
    const kp = S.aspect < 1 ? 2.4 : 1;
    let fov = 32;
    if (t < T_REL) {
      // low deck-level 3/4 from the front-port, slow push-in and drift
      const k = t / T_REL;
      cam.set(X0 + 64 - 10 * k, 1.8 + 0.6 * k, -22 - 2 * k);
      cam.sub(tgt.set(X0 + 1, 0, 0)).multiplyScalar(kp).add(tgt);
      tgt.set(X0 + 2, 5.2, 0);
      fov = 18 - 2 * k;
    } else {
      // port-side tracking shot, then a static watch as it leaves the ramp
      const cx = Math.min(x * 0.6 + 34, 112);
      cam.set(cx, 3.2 + 0.0, -38 * kp);
      tgt.set(lerp(cx, x, 0.9), Math.max(y + 1, 5), 0);
      fov = 34 - 12 * smooth(T_LIP, DURATION, t);
      if (t > T_LIP) {
        // keep the climbing jet in frame with a long lens
        tgt.set(x, y, 0);
      }
    }
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.copy(cam);
    camera.up.set(0, 1, 0);
    camera.lookAt(tgt);
    camera.updateMatrixWorld(true);
    pos.set(x, y, 0);
    aimLights(camera, pos, lights);
  }
  applyState(0);

  return {
    name: 'launch',
    duration: DURATION,
    fadeIn: true,
    fadeOut: false,
    scene,
    camera,
    model: jet,
    update(t) { applyState(t); },
    resize(aspect) {
      S.aspect = aspect;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      applyState(lastT);
    },
    labels() {
      return lastT >= 0.6 ? [{ id: 'title', text: 'SKI-JUMP LAUNCH', x: 0.06, y: 0.9 }] : [];
    },
  };
}
