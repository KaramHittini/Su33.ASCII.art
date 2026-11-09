// Weapons scene: the Su-33 fires an R-27 (drops from the belly, motor lights, long smoke trail) and an
// R-73 (rails off the wing), then banks and dumps two fans of flares. It levels out, three wingmen join in a
// finger-four (the far-left one rolls inverted), and the formation lights burners and pulls away. Deterministic in t.
// Co-moving frame: the jet stays near the origin, the air (smoke, flares, cloud deck) streams past along -X.
// Model axes: metres, nose +X, up +Y, starboard +Z.
import * as THREE from 'three';
import { buildSu33, makeLights, aimLights } from '../su33/model.js';

const DUR = 18;
const T_LEVEL = 10.2;  // lead back to wings-level after the flare break
const T_GO = 16.3;     // formation burners on, pulls away
const FOV = 34;
const V_AIR = 120;   // how fast smoke left in the air streams back past the jet (m/s, cinematic)
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const sm = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;

// ---------- soft point sprites (smoke / flame / flares) ----------
function makePoints(n) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: `
      attribute float aSize; attribute vec3 aCol; varying vec3 vCol; uniform float uScale;
      void main() {
        vCol = aCol;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.25, r);
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,          // brightest wins: dense smoke never saturates to a white bar
    blendEquation: THREE.MaxEquation,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  let k = 0;
  return {
    pts,
    reset() { k = 0; },
    push(p, size, lum, r = 1, g = 1, b = 1) {
      if (k >= n || lum <= 0.002) return;
      geo.attributes.position.setXYZ(k, p.x, p.y, p.z);
      geo.attributes.aSize.setX(k, size);
      geo.attributes.aCol.setXYZ(k, lum * r, lum * g, lum * b);
      k++;
    },
    commit() {
      geo.setDrawRange(0, k);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aCol.needsUpdate = true;
    },
  };
}

// ---------- backdrop: dusk sky dome + a cloud deck far below that streams past ----------
function makeBackdrop(scene) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          float k = pow(clamp(y, 0.0, 1.0), 0.38);
          vec3 zen = vec3(0.05, 0.07, 0.30), mid = vec3(0.20, 0.17, 0.50), hor = vec3(0.85, 0.46, 0.28);
          vec3 sky = mix(hor, mix(mid, zen, smoothstep(0.35, 1.0, k)), smoothstep(0.0, 0.5, k));
          float sd = max(dot(vDir, normalize(vec3(0.6, 0.12, -0.8))), 0.0);
          vec3 sun = vec3(1.0, 0.86, 0.6) * 0.45 * pow(sd, 300.0) + vec3(1.0, 0.55, 0.22) * (0.10 * pow(sd, 12.0) + 0.10 * pow(sd, 40.0));
          vec3 c = y > 0.0 ? sky + sun : vec3(0.5, 0.3, 0.22) * 0.5 + sun * 0.5;
          c = pow(clamp(c, 0.0, 1.0), vec3(1.15));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: { uOff: { value: 0 } },
      depthWrite: false, transparent: true,
      vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uOff;
        varying vec3 vW;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = vec2(vW.x + uOff, vW.z) * 0.006;
          float c = 0.5 * n(p) + 0.3 * n(p * 2.3 + 7.0) + 0.2 * n(p * 5.1 + 3.0);
          c = smoothstep(0.45, 0.8, c);
          float d = length(vW.xz - cameraPosition.xz);
          float fade = exp(-d / 1400.0);
          vec3 sunDir = normalize(vec3(0.6, 0.0, -0.8));
          vec3 vd = normalize(vW - cameraPosition);
          float sd = max(dot(normalize(vec3(vd.x, 0.0, vd.z)), sunDir), 0.0);
          vec3 far = vec3(0.30, 0.17, 0.13);
          float L = 0.02 + 0.22 * c;
          vec3 near = L * vec3(0.55, 0.72, 1.2) + vec3(1.0, 0.5, 0.25) * (pow(sd, 3.0) * c * 0.2);
          gl_FragColor = vec4(mix(far, near, fade), 1.0);
        }`,
    })
  );
  deck.rotation.x = -Math.PI / 2;
  deck.renderOrder = -1;
  deck.frustumCulled = false;
  scene.add(dome, deck);
  return {
    update(t, cam) {
      dome.position.copy(cam.position);
      deck.position.set(cam.position.x, -320, cam.position.z);
      deck.material.uniforms.uOff.value = V_AIR * t;
    },
  };
}

export function createWeaponsScene(ctx) {
  let aspect = ctx.aspect || 16 / 9;
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.5, 5000);
  const tanH = Math.tan((FOV * Math.PI) / 360);
  const lights = makeLights(scene);
  const backdrop = makeBackdrop(scene);
  const jet = buildSu33({ missiles: true });
  const { root, rig } = jet;
  scene.add(root);

  // ---------- wingmen (finger-four; offsets from the lead in the co-moving frame; screen-left = port = -Z) ----------
  const WING = [
    { slot: [-11, 0.4, -15], t0: 9.6, inverted: true },  // far left: rolls inverted once in position
    { slot: [-11, 0.4, 15], t0: 9.9 },
    { slot: [-22, 0.8, 30], t0: 10.2 },
  ].map((w) => {
    const m = buildSu33({ missiles: true });
    m.rig.set({ fold: 0, stabFold: 0, gear: 0, hook: 0, ab: 0 });
    m.root.visible = false;
    scene.add(m.root);
    return { ...w, m };
  });
  const JOIN = 3.0; // seconds to slide from behind/below into the slot

  // missile → its transform relative to the airframe (taken once, wings unfolded)
  rig.set({ fold: 0, stabFold: 0, gear: 0, hook: 0, ab: 0 });
  root.updateMatrixWorld(true);
  const pick = (kind, side) => rig.missiles.find((m) => m.kind === kind && m.side === side)
    || rig.missiles.find((m) => m.kind === kind);
  const shots = [
    { e: pick('R-27', -1), t0: 1.0, drop: 0.35, accel: 140 },   // ejected down, then motor lights
    { e: pick('R-73', -1), t0: 3.1, drop: 0.0, accel: 190 },    // rail launch, motor lights at once
  ].filter((s) => s.e);
  for (const s of shots) {
    s.rel = s.e.mesh.matrixWorld.clone();
    s.fly = s.e.mesh.clone(true);
    s.fly.matrixAutoUpdate = false;
    s.fly.visible = false;
    scene.add(s.fly);
  }

  const fx = makePoints(6000);
  scene.add(fx.pts);
  // point sizes in render-target pixels: scale by whatever we're drawing into (ASCII RT or the canvas)
  fx.pts.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget();
    const h = rt ? rt.height : renderer.domElement.height;
    fx.pts.material.uniforms.uScale.value = h / (2 * tanH);
  };

  // ---------- jet pose in the co-moving frame ----------
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
  const V_GO = 40, TAU_GO = 0.45;
  const awayAt = (t) => { const u = Math.max(0, t - T_GO); return V_GO * (u - TAU_GO * (1 - Math.exp(-u / TAU_GO))); };
  // formation turbulence: each jet gets its own small, irregular bobbing / rocking (sums of incommensurate sines)
  const wob = (seed, t, amp, out) => {
    const f = (a, b, c) => Math.sin(t * a + seed * b) + 0.6 * Math.sin(t * c + seed * 1.7 * b) + 0.35 * Math.sin(t * (a + c) * 1.3 + seed * 2.9);
    out.x = amp * 0.45 * f(1.3, 1.1, 2.9);
    out.y = amp * 0.6 * f(1.7, 2.3, 3.7);
    out.z = amp * 0.4 * f(1.1, 3.1, 2.3);
    out.roll = amp * 0.07 * f(2.1, 0.7, 4.3);
    out.pitch = amp * 0.025 * f(1.9, 1.9, 3.3);
    out.yaw = amp * 0.02 * f(1.5, 2.7, 2.6);
    return out;
  };
  const W = {};
  function jetPose(t) {
    const bank = -0.95 * sm(5.4, 6.3, t) * (1 - sm(9.0, T_LEVEL, t));
    const pitch = 0.04 * Math.sin(t * 0.7) + 0.16 * sm(5.6, 6.4, t) * (1 - sm(9.0, T_LEVEL, t));
    const roll = bank + 0.06 * Math.sin(t * 0.9) * (1 - sm(5.4, 6.0, t));
    const away = awayAt(t);                                            // burners on, pulls away
    const climb = 1.2 * (Math.min(t, T_LEVEL) - 5.6) * sm(5.6, 8, t) + 0.8 * sm(8.6, T_LEVEL + 0.6, t);
    const pos = new THREE.Vector3(away, 0.6 * Math.sin(t * 0.8) + Math.max(0, climb), 0);
    _e.set(roll, 0, pitch, 'XYZ');
    return { pos, quat: _q.clone().setFromEuler(_e) };
  }
  const jetMatrix = (t) => { const p = jetPose(t); return new THREE.Matrix4().compose(p.pos, p.quat, _s); };

  // ---------- missile flight (co-moving frame) ----------
  const _p = new THREE.Vector3(), _fwd = new THREE.Vector3(), _dn = new THREE.Vector3();
  function missileAt(s, t) {
    // pose at launch, then fly along its body axis; the jet keeps up with the air, so the missile pulls ahead
    const M0 = jetMatrix(s.t0).multiply(s.rel);
    const a = Math.max(0, t - s.t0);
    const ign = s.drop > 0 ? s.drop : 0;
    const burn = Math.max(0, a - ign);
    _fwd.set(1, 0, 0).transformDirection(M0);
    _dn.set(0, -1, 0);
    const dropDist = 0.5 * 9.8 * Math.min(a, ign + 0.4) ** 2 * 1.6;
    _p.setFromMatrixPosition(M0).addScaledVector(_fwd, 0.5 * s.accel * burn * burn).addScaledVector(_dn, dropDist);
    return { pos: _p.clone(), M0, burning: a > ign, burn };
  }

  // ---------- flares ----------
  const FL = [];
  for (let salvo = 0; salvo < 2; salvo++) {
    for (let i = 0; i < 10; i++) {
      FL.push({ te: 6.4 + salvo * 1.6 + i * 0.08, o: i % rig.flareOrigins.length, side: i % 2 ? 1 : -1, spread: 0.6 + 0.4 * ((i * 7) % 5) / 4 });
    }
  }
  const K = 1.6, VF = 34, G = 2.2;
  const _v = new THREE.Vector3(), _o = new THREE.Vector3();
  function flareAt(f, age, out) {
    const M = jetMatrix(f.te);
    _o.copy(rig.flareOrigins[f.o]).applyMatrix4(M);
    // ejected up and outward in the jet's frame, slowed by drag, then sinking slowly, left behind by the airflow
    _v.set(-6, 20 * f.spread, f.side * 15 * f.spread).applyQuaternion(_q.setFromRotationMatrix(M));
    const dr = (1 - Math.exp(-K * age)) / K;
    out.copy(_o).addScaledVector(_v, dr);
    out.x -= VF * (age - dr);
    out.y -= 0.5 * G * age * age;
    return out;
  }

  // ---------- cameras ----------
  const fitD = (halfW, halfH) => Math.max(halfH / tanH, halfW / (tanH * aspect));
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), _c3 = new THREE.Vector3();
  function cameraAt(t) {
    // beat 1: low port-side 3/4, the missiles streak off to screen-right
    const D1 = fitD(17, 9);
    const c1 = new THREE.Vector3(-0.15 * D1, -0.3 * D1, -0.95 * D1);
    const t1 = new THREE.Vector3(-2 + 3 * sm(1.2, 4.5, t), -1.2, 0);
    // beat 2: behind and below the jet as it banks — the flares fan out like wings
    const D2 = fitD(50, 32);
    const c2 = new THREE.Vector3(-0.8 * D2, -0.22 * D2, 0.55 * D2);
    const t2 = new THREE.Vector3(-26, -10, 0);
    const k = sm(5.1, 6.1, t);
    camPos.lerpVectors(c1, c2, k);
    camTgt.lerpVectors(t1, t2, k);
    // beat 3: behind, above and a little left of the finger-four (port wingman = screen-left)
    const k3 = sm(9.2, 11.0, t);
    if (k3 > 0) {
      const D3 = fitD(40, 17);
      const lead = jetPose(Math.min(t, T_GO));
      const c = new THREE.Vector3(-11, 0, 7.5).add(lead.pos);
      _c3.set(-0.9 * D3, 0.4 * D3, -0.12 * D3).add(c);
      camPos.lerp(_c3, k3);
      camTgt.lerp(c, k3);
    }
    if (t > T_GO) camTgt.x += awayAt(t) * 0.5 * sm(T_GO, T_GO + 1.6, t);
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camTgt);
    camera.updateMatrixWorld(true);
  }

  let lastT = 0;
  function render(t) {
    lastT = t;
    const P = jetPose(t);
    root.position.copy(P.pos);
    root.quaternion.copy(P.quat);
    // lead rides the same turbulence as the wingmen once the formation forms (camera does not follow it)
    {
      const amp = sm(10.4, 11.8, t);
      if (amp > 0) {
        wob(0.3, t, amp, W);
        root.position.x += W.x; root.position.y += W.y; root.position.z += W.z;
        _e.set(W.roll, W.yaw, W.pitch, 'XYZ');
        root.quaternion.multiply(_q.setFromEuler(_e));
      }
    }
    rig.set({ fold: 0, stabFold: 0, gear: 0, hook: 0, canards: -0.08 * sm(5.6, 6.4, t), stabs: -0.12 * sm(5.6, 6.4, t), ab: 0.25 + 0.75 * sm(T_GO - 0.3, T_GO + 0.2, t) });
    jet.update(t);
    root.updateMatrixWorld(true);
    // wingmen: climb in from behind/below on partial burner, settle into the slot, hold; far-left rolls inverted
    for (const w of WING) {
      const a = (t - w.t0) / JOIN;
      w.m.root.visible = a > 0;
      if (a <= 0) continue;
      const k = 1 - Math.pow(1 - clamp01(a), 3);
      const side = Math.sign(w.slot[2]);
      w.m.root.position.set(
        P.pos.x + w.slot[0] - 30 * (1 - k),
        P.pos.y + w.slot[1] - 40 * (1 - k) + 0.3 * Math.sin(t * 0.8 + w.slot[2]),
        w.slot[2] + side * 10 * (1 - k),
      );
      const roll = -side * 0.3 * Math.sin(Math.PI * clamp01(a)) + (w.inverted ? -Math.PI * sm(13.0, 14.3, t) : 0)
        + 0.03 * Math.sin(t * 1.1 + w.slot[0]);
      const pitch = 0.35 * (1 - k) + 0.02 * Math.sin(t * 0.7 + w.slot[2]);
      wob(w.slot[0] * 0.37 + w.slot[2] * 0.11, t, 0.4 + 0.6 * k, W);
      w.m.root.position.x += W.x; w.m.root.position.y += W.y; w.m.root.position.z += W.z;
      _e.set(roll + W.roll, W.yaw, pitch + W.pitch, 'XYZ');
      w.m.root.quaternion.setFromEuler(_e);
      const ab = Math.max(0.25 + 0.55 * (1 - k), 0.25 + 0.75 * sm(T_GO - 0.3, T_GO + 0.2, t));
      w.m.rig.set({ fold: 0, stabFold: 0, gear: 0, hook: 0, ab, stabs: -0.1 * (1 - k) });
      w.m.update(t);
      w.m.root.updateMatrixWorld(true);
    }
    cameraAt(t);
    aimLights(camera, camTgt, lights);
    backdrop.update(t, camera);

    fx.reset();
    // missiles + smoke trails
    for (const s of shots) {
      const launched = t >= s.t0;
      s.e.mesh.visible = !launched;
      s.fly.visible = launched && t < s.t0 + 4;
      if (!launched) continue;
      const m = missileAt(s, t);
      _m.copy(m.M0).setPosition(m.pos);
      s.fly.matrix.copy(_m);
      s.fly.matrixWorldNeedsUpdate = true;
      if (!m.burning) continue;
      _fwd.set(1, 0, 0).transformDirection(m.M0);
      fx.push(m.pos.clone().addScaledVector(_fwd, -2.2), 2.2, 1.0, 1.0, 0.95, 0.75);    // motor flame: white-yellow core
      fx.push(m.pos.clone().addScaledVector(_fwd, -3.4), 1.4, 0.8, 1.0, 0.55, 0.2);   // -> orange
      const tIgn = s.t0 + s.drop;
      const N = 900;
      for (let j = 0; j < N; j++) {
        const tau = tIgn + (t - tIgn) * (j / N);
        const age = t - tau;
        const q = missileAt(s, tau).pos;
        q.x -= V_AIR * age;                                                       // smoke stays in the air
        q.y += 0.6 * age;
        const cool = clamp01(age / 3);                                            // warm grey near the missile -> blue-grey
        fx.push(q, 1.6 + 2.6 * Math.sqrt(age), 0.45 * Math.exp(-age / 2.4), lerp(1.0, 0.62, cool), lerp(0.88, 0.74, cool), lerp(0.74, 1.0, cool));
      }
    }
    // flares: bright heads + falling smoke curls
    const _f = new THREE.Vector3();
    for (const f of FL) {
      const age = t - f.te;
      if (age < 0 || age > 5) continue;
      const burn = Math.exp(-age / 2.2);
      fx.push(flareAt(f, age, _f), 4.4, Math.min(1, burn * 1.3), 1.0, 0.62, 0.2);               // amber glow
      fx.push(flareAt(f, age, _f), 2.4, Math.min(1, burn * 1.2), 1.0, 0.97, 0.88);                 // white-hot core
      for (let j = 1; j <= 110; j++) {
        const a2 = age - j * 0.018;
        if (a2 < 0) break;
        const sa = age - a2;
        fx.push(flareAt(f, a2, _f).clone().add(new THREE.Vector3(0, 0.4 * sa, 0)), 1.2 + 1.6 * sa, 0.55 * Math.exp(-sa / 1.6) * (0.6 + 0.4 * burn), lerp(1.0, 0.7, clamp01(sa / 2)), lerp(0.92, 0.72, clamp01(sa / 2)), lerp(0.8, 0.78, clamp01(sa / 2)));
      }
    }
    fx.commit();
  }

  return {
    name: 'weapons',
    duration: DUR,
    fadeIn: false,
    fadeOut: false,
    scene,
    camera,
    update(t) { render(t); },
    resize(a) {
      aspect = a;
      camera.aspect = a;
      camera.updateProjectionMatrix();
      render(lastT);
    },
    labels() {
      if (lastT > 0.5 && lastT < 5.3) return [{ id: 'wpn', text: 'R-27ER / R-27ET / R-73 LAUNCH', x: 0.06, y: 0.9 }];
      if (lastT > 5.8 && lastT < 9.6) return [{ id: 'wpn', text: 'FLARES', x: 0.06, y: 0.9 }];
      if (lastT > 10.4 && lastT < 17.6) return [{ id: 'wpn', text: 'FORMATION', x: 0.06, y: 0.9 }];
      return [];
    },
  };
}
