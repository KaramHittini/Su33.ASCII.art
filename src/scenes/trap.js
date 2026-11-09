// Trap scene: Su-33 on final approach to Kuznetsov's angled deck (gear, hook, flaps down, nose-up), touchdown, the hook
// snags the third arrestor wire (it stretches into a V), a violent stop inside ~85 m, then wings and stabilators fold.
// Deterministic from t.
import { buildSu33, makeLights, aimLights, GROUND_Y } from '../su33/model.js';
import { buildCarrier, stripPt, AD, ANP, ANG, WIRES, WIRE_CATCH, STRIP_HW } from '../su33/carrier.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const DEG = Math.PI / 180;

const DURATION = 14;
const JY = -GROUND_Y;
const V_APP = 56;               // m/s relative to the deck
const GS = Math.tan(3.5 * DEG); // glide slope
const S_TD = 124;               // main wheels touch (root position along the strip)
const T_TD = 6.4;
const HOOK_AFT = 9.55;          // hook tip is this far aft of the root
const S_CATCH = WIRES[WIRE_CATCH] - HOOK_AFT;
const T_CATCH = T_TD + (S_TD - S_CATCH) / V_APP;
const DECEL = (V_APP * V_APP) / (2 * 85);
const T_STOP = T_CATCH + V_APP / DECEL;
const HOOK_TIP = [-9.55, -2.16, 0];
const T_CUT = 5.3;              // chase cam -> deck cam

export function createTrapScene(ctx) {
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
  const jet = buildSu33({ missiles: false });
  scene.add(jet.root);
  const rig = jet.rig;
  const S = { aspect: ctx.aspect };
  let lastT = 0;

  const cam = new THREE.Vector3(), tgt = new THREE.Vector3(), jp = new THREE.Vector3(), hook = new THREE.Vector3();
  const off = new THREE.Vector3(), q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);

  // distance travelled along the strip (towards the bow) -> root s coordinate
  function sAt(t) {
    if (t <= T_TD) return S_TD + V_APP * (T_TD - t);
    if (t <= T_CATCH) return S_TD - V_APP * (t - T_TD);
    const u = Math.min(t, T_STOP) - T_CATCH;
    return S_CATCH - (V_APP * u - 0.5 * DECEL * u * u);
  }

  function applyState(t) {
    lastT = t;
    const s = sAt(t);
    const approach = Math.max(0, s - S_TD);
    const lat = (3.2 * Math.sin(t * 0.9 + 0.5) + 1.2) * clamp01(approach / 300);
    const c = stripPt(s, lat);
    const hY = JY + approach * GS + 0.05 * Math.sin(t * 2.3) * clamp01(approach / 60);
    const decelT = clamp01((t - T_CATCH) / (T_STOP - T_CATCH));
    const shake = t >= T_CATCH ? 0.35 * Math.exp(-(t - T_CATCH) * 1.6) * (t < T_STOP + 2 ? 1 : 0) : 0;
    // attitude: nose-up on approach, derotates on touchdown, dips under arrestment
    const pitch = 7 * DEG * (1 - smooth(T_TD - 0.1, T_TD + 0.35, t)) + 2 * DEG * (smooth(T_TD - 0.1, T_TD + 0.35, t) - smooth(T_CATCH, T_STOP + 0.6, t))
      - 2.6 * DEG * Math.sin(Math.PI * clamp01((t - T_CATCH) / 1.6)) * (1 - decelT * 0.5) + 0.008 * Math.sin(t * 31) * shake;
    const yaw = -ANG + 0.012 * Math.sin(t * 0.9 + 0.5) * clamp01(approach / 200);
    const roll = 0.03 * Math.cos(t * 0.9 + 0.5) * clamp01(approach / 200) + 0.012 * Math.sin(t * 37 + 1) * shake;
    jet.root.position.set(c.x, hY + 0.04 * Math.sin(t * 43) * shake, c.z);
    jet.root.rotation.set(roll, yaw, pitch, 'YZX');
    jet.root.updateMatrixWorld(true);

    // configuration
    rig.setGear(1);
    rig.setHook(1);
    // flaps droop to landing setting early on final, retract once stopped
    rig.setFlaps(smooth(0.3, 2.0, t) * (1 - smooth(T_STOP + 0.4, T_STOP + 1.4, t)));
    // airbrake: bleeds speed on final, stows for the full-power touchdown, then deploys under arrestment
    rig.setAirbrake(Math.max(
      smooth(0.8, 1.7, t) * (1 - smooth(T_TD - 1.8, T_TD - 0.9, t)),
      smooth(T_CATCH, T_CATCH + 0.45, t) * (1 - smooth(T_STOP + 0.3, T_STOP + 1.2, t)),
    ));
    rig.setCanards(0.2 * (1 - smooth(T_STOP, T_STOP + 1, t)));
    rig.setStabs(-0.1 * (1 - smooth(T_TD, T_TD + 0.6, t)));
    rig.setWingFold(smooth(T_STOP + 0.9, T_STOP + 2.9, t));
    rig.setStabFold(smooth(T_STOP + 1.8, T_STOP + 3.3, t));
    const ab = 0.85 * smooth(T_TD - 0.15, T_TD + 0.05, t) * (1 - smooth(T_CATCH - 0.05, T_CATCH + 0.3, t));
    rig.setAfterburner(ab, Math.max(ab, 0.25 * (1 - smooth(T_STOP, T_STOP + 2, t))));
    jet.update(t);

    // arrestor wire: straight until the hook takes it, then a V trailing the hook
    if (t >= T_CATCH) {
      hook.set(HOOK_TIP[0], HOOK_TIP[1], HOOK_TIP[2]);
      jet.root.localToWorld(hook);
      hook.y = Math.max(0.2, hook.y);
      carrier.setWire(hook);
    } else carrier.setWire(null);
    carrier.setDeflector(0);
    carrier.update(t, camera);

    // ----- cameras -----
    const kp = S.aspect < 1 ? 2.6 : 1;
    jp.copy(jet.root.position);
    let fov = 32;
    if (t < T_CUT) {
      // chase: behind and above-starboard of the jet, carrier growing ahead
      q.setFromAxisAngle(yAxis, yaw);
      off.set(-34, 5.5 + 3 * (1 - t / T_CUT), 12).multiplyScalar(kp).applyQuaternion(q);
      cam.copy(jp).add(off);
      off.set(32, -3.5, 0).applyQuaternion(q);
      tgt.copy(jp).add(off);
      fov = 36;
    } else {
      // deck view from the port sponson, across the strip, island behind; pans with the jet
      const sc = 92 - 36 * smooth(T_CATCH, T_STOP, t);
      const cp = stripPt(sc, -(STRIP_HW + 15 * kp));
      cam.set(cp.x, 2.4, cp.z);
      tgt.set(lerp(cp.x, c.x, 0.96), Math.max(1.5, hY * 0.7 + 0.6), lerp(cp.z, c.z, 0.96));
      fov = 28 - 4 * smooth(T_CATCH - 0.4, T_CATCH + 1, t) + 6 * smooth(T_STOP + 0.5, T_STOP + 3, t);
      // once stopped: crane up to an elevated front-port 3/4 so the wing fold reads clear of the island
      const kc = smooth(T_STOP + 0.2, T_STOP + 2.6, t);
      if (kc > 0) {
        off.set(26, 12, -24).multiplyScalar(kp).applyQuaternion(jet.root.quaternion);
        cam.lerp(off.add(jp), kc);
        tgt.lerp(off.copy(jp).add(new THREE.Vector3(-2, 0.5, 0)), kc);
        fov = lerp(fov, 34, kc);
      }
    }
    if (shake > 0 && t >= T_CUT) {
      const a = shake * 0.45;
      cam.x += a * (Math.sin(t * 61) + 0.6 * Math.sin(t * 37 + 1));
      cam.y += a * (Math.sin(t * 53 + 2) + 0.5 * Math.sin(t * 29));
      cam.z += a * 0.5 * Math.sin(t * 47 + 3);
    }
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.copy(cam);
    camera.up.set(0, 1, 0);
    camera.lookAt(tgt);
    if (shake > 0 && t >= T_CUT) {
      camera.rotateZ(0.02 * shake * Math.sin(t * 43));
      camera.rotateX(0.012 * shake * Math.sin(t * 57 + 1));
    }
    camera.updateMatrixWorld(true);
    aimLights(camera, jp, lights);
  }
  applyState(0);

  return {
    name: 'trap',
    duration: DURATION,
    fadeIn: false,
    fadeOut: true,
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
      return lastT >= 0.6 ? [{ id: 'title', text: 'ARRESTED LANDING', x: 0.06, y: 0.9 }] : [];
    },
  };
}
