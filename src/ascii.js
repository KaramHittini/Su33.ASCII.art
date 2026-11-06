import * as THREE from 'three';

const CHARSET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  '/.,<>?;\':"[]{}~`!@#$%^&*()_+-=|\\';

const VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uGrid;      // cols, rows
uniform vec2 uCellPx;    // glyph cell size in drawing-buffer px
uniform vec2 uOffset;    // grid origin offset in px
uniform float uCount;    // density LEVEL count (each level has uAlt same-coverage glyphs)
uniform float uAlt;
uniform float uAtlasCount; // total glyphs in atlas
uniform float uEdgeBase; // atlas index of edge glyphs: - | / backslash
uniform float uEdgeThreshold;
uniform float uGamma;
uniform float uBrightness;
uniform float uShimmer;
uniform float uTime;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float lumAt(vec2 cell) {
  vec2 c2 = clamp(cell, vec2(0.0), uGrid - 1.0);
  vec3 c = texture2D(uScene, (c2 + 0.5) / uGrid).rgb;
  return clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
}

void main() {
  vec2 px = gl_FragCoord.xy - uOffset;
  vec2 cell = floor(px / uCellPx);
  if (px.x < 0.0 || px.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 inCell = floor(px - cell * uCellPx) + 0.5;
  vec3 c = texture2D(uScene, (cell + 0.5) / uGrid).rgb;
  float lum = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  float l = clamp(pow(lum, uGamma) * uBrightness, 0.0, 1.0);
  // Clean tonal ramp: level from luminance, then one of uAlt glyphs with the SAME coverage
  // (variety of letters/symbols without breaking the shading).
  float lev = clamp(floor(l * uCount + 0.15), 0.0, uCount - 1.0);
  if (l <= 0.012) lev = 0.0;
  float h = hash(cell + floor(uTime * 2.0 * uShimmer) * 0.137);
  float idx = lev * uAlt + floor(h * uAlt);
  float shade = (0.55 + 0.45 * l) * min(1.0, uBrightness * 1.5);
  // Sobel on neighbouring cell centres
  float tl = lumAt(cell + vec2(-1.0, 1.0)), tc = lumAt(cell + vec2(0.0, 1.0)), tr = lumAt(cell + vec2(1.0, 1.0));
  float ml = lumAt(cell + vec2(-1.0, 0.0)), mr = lumAt(cell + vec2(1.0, 0.0));
  float bl = lumAt(cell + vec2(-1.0, -1.0)), bc = lumAt(cell + vec2(0.0, -1.0)), br = lumAt(cell + vec2(1.0, -1.0));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float mx = max(max(max(tl, tc), max(tr, ml)), max(max(mr, bl), max(bc, br)));
  mx = max(mx, lum);
  float avg = (tl + tc + tr + ml + mr + bl + bc + br) * 0.125;
  if (uBrightness > 0.02 && length(vec2(gx, gy)) > uEdgeThreshold && mx >= 0.03 && lum >= avg) {
    // y-up (texture and screen agree). edge direction is perpendicular to gradient.
    vec2 g = vec2(gx / uCellPx.x, gy / uCellPx.y);
    float ang = atan(g.x, -g.y);            // angle of edge direction
    ang = mod(ang, 3.14159265);
    float bin = mod(floor(ang / 0.785398163 + 0.5), 4.0); // 0 horiz, 1 '/', 2 '|', 3 '\'
    idx = uEdgeBase + (bin < 0.5 ? 0.0 : (bin < 1.5 ? 2.0 : (bin < 2.5 ? 1.0 : 3.0)));
    shade = (0.55 + 0.45 * max(0.75, l)) * uBrightness; // edges must fade with the scene
  }
  vec2 uv = vec2((idx * uCellPx.x + inCell.x) / (uAtlasCount * uCellPx.x), inCell.y / uCellPx.y);
  float a = texture2D(uAtlas, uv).r;
  gl_FragColor = vec4(vec3(a * shade), 1.0);
}
`;

export class AsciiRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 1);
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.rt.texture },
        uAtlas: { value: null },
        uGrid: { value: new THREE.Vector2(1, 1) },
        uCellPx: { value: new THREE.Vector2(8, 14) },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uCount: { value: 1 },
        uAlt: { value: 1 },
        uAtlasCount: { value: 1 },
        uEdgeBase: { value: 0 },
        uEdgeThreshold: { value: 0.55 },
        uGamma: { value: 0.8 },
        uBrightness: { value: 1 },
        uShimmer: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.atlas = null;
    this.glyphW = 0;
    this.glyphH = 0;
    this.cols = 1;
    this.rows = 1;
    this.cellW = 8;
    this.cellH = 14;
    this.dpr = 1;
    this.fontFamily = 'monospace';
    this._size = null;
    const timeout = new Promise((r) => setTimeout(r, 2000, false));
    const load = document.fonts
      ? document.fonts.load('700 20px "JetBrains Mono"').then((f) => f && f.length > 0)
      : Promise.resolve(false);
    this.fontReady = Promise.race([load, timeout]).catch(() => false).then((ok) => {
      this.fontFamily = ok ? '"JetBrains Mono", monospace' : 'monospace';
      if (this._size) { this.glyphW = 0; this.setSize(...this._size); }
    });
  }

  get aspect() {
    return (this.cols * this.cellW) / (this.rows * this.cellH);
  }

  // Atlas glyph cell == drawing-buffer cell size (gw x gh px), nearest filtered => crisp.
  _buildAtlas(gw, gh) {
    const chars = Array.from(CHARSET);
    const fs = Math.min(gh * 0.85, gw / 0.6);
    const font = `700 ${fs}px ${this.fontFamily}`;
    const drawGlyph = (ctx, ch, x0) => {
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(ch, x0 + gw / 2, gh / 2 + fs * 0.04);
    };
    const m = document.createElement('canvas');
    m.width = gw; m.height = gh;
    const mctx = m.getContext('2d', { willReadFrequently: true });
    const scored = chars.map((ch) => {
      mctx.fillStyle = '#000';
      mctx.fillRect(0, 0, gw, gh);
      drawGlyph(mctx, ch, 0);
      const d = mctx.getImageData(0, 0, gw, gh).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i];
      return { ch, cov: sum };
    });
    scored.sort((a, b) => a.cov - b.cov);
    // Pick LEVELS evenly spaced in coverage; each level gets ALT glyphs of nearly equal coverage.
    const LEVELS = 20, ALT = 1;
    const lo = scored[0].cov, hi = scored[scored.length - 1].cov;
    const used = new Set();
    const levels = [[' ', ' ', ' ']];
    for (let k = 1; k < LEVELS; k++) {
      const target = lo + (hi - lo) * Math.pow(k / (LEVELS - 1), 1.15);
      const cand = scored
        .filter((c) => !used.has(c.ch))
        .sort((a, b) => Math.abs(a.cov - target) - Math.abs(b.cov - target));
      const tol = (hi - lo) * 0.035;
      const pick = [cand[0]];
      for (const c of cand.slice(1)) {
        if (pick.length >= ALT) break;
        if (Math.abs(c.cov - target) <= tol) pick.push(c);
      }
      pick.forEach((c) => used.add(c.ch));
      while (pick.length < ALT) pick.push(pick[pick.length - 1]);
      levels.push(pick.map((c) => c.ch));
    }
    this.ramp = levels.map((l) => l.join('')).join('|');
    const n = LEVELS;
    const sorted = [...levels.flat(), '-', '|', '/', '\\'];
    const cv = document.createElement('canvas');
    cv.width = sorted.length * gw; cv.height = gh;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    sorted.forEach((ch, i) => { if (ch !== ' ') drawGlyph(ctx, ch, i * gw); });
    if (this.atlas) this.atlas.dispose();
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.atlas = tex;
    this.material.uniforms.uAtlas.value = tex;
    this.material.uniforms.uCount.value = n;
    this.material.uniforms.uAtlasCount.value = sorted.length;
    this.material.uniforms.uAlt.value = ALT;
    this.material.uniforms.uEdgeBase.value = n * ALT;
    this.glyphW = gw;
    this.glyphH = gh;
  }

  setSize(w, h) {
    this._size = [w, h];
    // Small cells = more detail. Same size on phones (high DPR keeps glyphs crisp).
    this.cellW = 5;
    this.cellH = 9;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const gw = Math.round(this.cellW * this.dpr);
    const gh = Math.round(this.cellH * this.dpr);
    const bw = Math.max(1, Math.round(w * this.dpr));
    const bh = Math.max(1, Math.round(h * this.dpr));
    this.renderer.setSize(bw, bh, false); // CSS size is 100% x 100% via stylesheet
    this.cols = Math.max(1, Math.floor(bw / gw));
    this.rows = Math.max(1, Math.floor(bh / gh));
    if (gw !== this.glyphW || gh !== this.glyphH) this._buildAtlas(gw, gh);
    this.rt.setSize(this.cols * 2, this.rows * 2);
    const u = this.material.uniforms;
    u.uGrid.value.set(this.cols, this.rows);
    u.uCellPx.value.set(gw, gh);
    u.uOffset.value.set(
      Math.floor((bw - this.cols * gw) / 2),
      Math.floor((bh - this.rows * gh) / 2)
    );
  }

  // overlays: [{scene, camera}] drawn on top of the base scene (no clear) — used for transitions.
  render(scene, camera, { brightness = 1, time = 0, shimmer = 1, overlays = [] } = {}) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(scene, camera);
    if (overlays.length) {
      const ac = r.autoClear;
      r.autoClear = false;
      for (const o of overlays) { r.clearDepth(); r.render(o.scene, o.camera); }
      r.autoClear = ac;
    }
    r.setRenderTarget(null);
    const u = this.material.uniforms;
    u.uBrightness.value = brightness;
    u.uTime.value = time;
    u.uShimmer.value = shimmer;
    r.render(this.quadScene, this.quadCam);
  }
}
