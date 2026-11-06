import * as THREE from 'three';
import { sceneFactories, transitions } from './scenes/index.js';
import { setLabels } from './labels.js';

const FADE = 0.6;

export class Timeline {
  constructor(ascii) {
    this.ascii = ascii;
    const params = new URLSearchParams(location.search);
    const ctx = { THREE, aspect: ascii.aspect };
    this.scenes = sceneFactories.map((f) => f(ctx));
    const only = params.get('scene');
    this.trans = transitions.map((tr) => ({ ...tr, inst: tr.factory(ctx) }));
    this.only = this.scenes.find((s) => s.name === only)
      || this.trans.map((tr) => tr.inst).find((s) => s.name === only) || null;
    this.list = this.only ? [this.only] : this.scenes;
    this.total = this.list.reduce((a, s) => a + s.duration, 0);
    const t0 = parseFloat(params.get('t'));
    this.time = Number.isFinite(t0) ? t0 : 0;
    this.freeze = params.has('freeze'); // debug: hold time at ?t= for exact screenshots
    this.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.last = performance.now();
    this.hidden = document.hidden;
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      this.last = performance.now();
    });
  }

  resize() {
    const a = this.ascii.aspect;
    for (const s of this.scenes) s.resize(a);
    for (const tr of this.trans) tr.inst.resize(a);
  }

  frame(now) {
    if (this.hidden) { this.last = now; return; }
    const reduced = this.mq.matches;
    const dt = this.freeze ? 0 : Math.min(Math.max((now - this.last) / 1000, 0), 0.25) * (reduced ? 0.5 : 1);
    this.last = now;
    this.time += dt;
    let g = ((this.time % this.total) + this.total) % this.total;
    let scene = this.list[this.list.length - 1];
    for (const s of this.list) {
      if (g < s.duration) { scene = s; break; }
      g -= s.duration;
    }
    const t = g;
    const gAll = ((this.time % this.total) + this.total) % this.total;
    const p = t / scene.duration;
    scene.update(t, p, dt);
    let b = 1;
    if (scene.fadeIn && t < FADE) b = Math.min(b, t / FADE);
    if (scene.fadeOut && t > scene.duration - FADE) b = Math.min(b, (scene.duration - t) / FADE);
    b = Math.max(0, Math.min(1, b));
    const overlays = [];
    if (!this.only) {
      for (const tr of this.trans) {
        let start = 0, B = -1;
        for (const s of this.list) {
          if (s.name === tr.to) { B = start; break; }
          start += s.duration;
        }
        if (B < 0) continue;
        let delta = gAll - B;
        delta -= Math.round(delta / this.total) * this.total;
        const half = tr.duration / 2;
        if (delta >= -half && delta < half) {
          const tt = delta + half;
          tr.inst.update(tt, tt / tr.duration, dt);
          overlays.push({ scene: tr.inst.scene, camera: tr.inst.camera });
        }
      }
    }
    this.ascii.render(scene.scene, scene.camera, {
      overlays,
      brightness: b,
      time: this.time,
      shimmer: reduced ? 0 : 1,
    });
    setLabels(scene.labels());
    if (!this.labelsEl) this.labelsEl = document.getElementById('labels');
    if (this.labelsEl) this.labelsEl.style.opacity = b.toFixed(3);
  }
}
