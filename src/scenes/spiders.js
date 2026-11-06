// Spider swarm transition: ~160 realistic spiders crawl from the bottom-right to the top-left.
// Three species x 8 gait frames are pre-rendered once (top-down, segmented hairy legs, shaded
// bodies); per frame we only drawImage with a transform. Canvas2D -> transparent plane over the scene.
const DUR = 3;
const MAXDIM = 1024;
const S0 = 384; // sprite resolution (square); mips 384/192/96
const MIPS = [384, 192, 96];
const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const LX = 0.2, LY = 0.95; // light direction in sprite space (rotates with the spider)

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- species definitions (units: sprite half-size)
const SPECIES = [
  { // hairy chunky tarantula
    name: 'tarantula', cx: 0.15, crx: 0.21, cry: 0.18, ax: -0.2, arx: 0.31, ary: 0.27,
    L: 0.84, w: 0.078, hair: 1.0, swing: 0.3,
    legDeg: [[58, 20], [80, 50], [102, 128], [122, 156]], lm: [0.95, 0.88, 0.9, 1.0],
    segShade: [0.9, 1, 0.95, 0.9, 0.85, 0.8], bodyHair: 520, pal: 0.92, pattern: 'tar',
    palp: 1.25,
  },
  { // striped wolf spider
    name: 'wolf', cx: 0.15, crx: 0.2, cry: 0.14, ax: -0.19, arx: 0.31, ary: 0.19,
    L: 0.95, w: 0.064, hair: 0.55, swing: 0.34,
    legDeg: [[62, 24], [82, 54], [100, 126], [118, 152]], lm: [0.95, 0.88, 0.92, 1.0],
    segShade: [1, 1, 0.8, 1, 0.78, 1], bodyHair: 260, pal: 1.0, pattern: 'wolf',
    palp: 1.0,
  },
  { // compact jumping spider
    name: 'jumper', cx: 0.12, crx: 0.22, cry: 0.19, ax: -0.19, arx: 0.2, ary: 0.17,
    L: 0.68, w: 0.072, hair: 0.35, swing: 0.3,
    legDeg: [[64, 26], [82, 56], [100, 124], [118, 150]], lm: [1.05, 0.85, 0.85, 0.98],
    segShade: [1, 1, 0.75, 1, 0.75, 1], bodyHair: 150, pal: 1.05, pattern: 'jump',
    palp: 0.9,
  },
];

const FR = [0.09, 0.27, 0.1, 0.2, 0.21, 0.13]; // coxa femur patella tibia metatarsus tarsus
const RR = [0.8, 1.0, 0.9, 0.74, 0.56, 0.4, 0.26]; // radius multiplier at each joint point
const RMIN = 0.03;
const K = 0.92; // sprite content scale (leaves room for the halo)
const HALO = 0.05;

function grey(v) {
  v = Math.max(0, Math.min(255, Math.round(v)));
  return 'rgb(' + v + ',' + v + ',' + v + ')';
}

function capsule(g, x1, y1, r1, x2, y2, r2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.beginPath();
  g.arc(x1, y1, r1, a + Math.PI / 2, a + Math.PI * 1.5);
  g.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
  g.closePath();
}

function bodyPath(g, cx, rx, ry, front, rear) {
  // egg shape; front/rear modulate half-width on the front/rear half
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const th = (i / 64) * TAU;
    const c = Math.cos(th), s = Math.sin(th);
    const k = c > 0 ? 1 - front * c : 1 + rear * -c;
    const x = cx + rx * c, y = ry * s * k;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function shadeFill(g, cx, rx, ry, pal, stops) {
  g.save();
  g.translate(cx, 0);
  g.scale(1, ry / rx);
  const gr = g.createRadialGradient(LX * rx * 0.3, (LY * rx * 0.45), 0, LX * rx * 0.3, (LY * rx * 0.45), rx * 1.55);
  for (const [o, v] of stops) gr.addColorStop(o, grey(v * pal));
  g.fillStyle = gr;
  g.fill();
  g.restore();
}

const BODY_STOPS = [[0, 250], [0.2, 205], [0.5, 150], [0.82, 85], [1, 48]];

// ---------------------------------------------------------------- legs
function computeLeg(sp, i, side, k) {
  const th = (k / 8) * TAU;
  const grp = (i + (side > 0 ? 1 : 0)) & 1;
  const ph = th + grp * Math.PI;
  const s = Math.sin(ph), c = Math.cos(ph);
  const f1 = sp.legDeg[i][0] * D2R - 0.5 * sp.swing * s;
  const f2 = sp.legDeg[i][1] * D2R - sp.swing * s;
  const lift = Math.max(0, c) * 0.07;
  const L = sp.L * sp.lm[i];
  const hx = sp.cx + sp.crx * (0.5 - i * 0.36);
  const hy = side * sp.cry * 0.68;
  const bend = i < 2 ? -1 : 1;
  const angs = [f1, f1, (f1 + f2) / 2, f2, f2 + bend * 0.1, f2 + bend * 0.22];
  const pts = [[hx, hy]];
  let x = hx, y = hy;
  for (let j = 0; j < 6; j++) {
    const len = L * FR[j] * (j >= 3 ? 1 - lift : 1);
    x += Math.cos(angs[j]) * len;
    y += side * Math.sin(angs[j]) * len;
    pts.push([x, y]);
  }
  return pts;
}

function drawLegs(g, sp, k, sid) {
  for (let i = 0; i < 4; i++) {
    for (let side = -1; side <= 1; side += 2) {
      const pts = computeLeg(sp, i, side, k);
      const rad = RR.map((m) => Math.max(RMIN, sp.w * m));
      const pad = 0.01;
      // outline
      g.fillStyle = '#242424';
      for (let j = 0; j < 6; j++) {
        capsule(g, pts[j][0], pts[j][1], rad[j] + pad, pts[j + 1][0], pts[j + 1][1], rad[j + 1] + pad);
        g.fill();
      }
      g.beginPath(); g.arc(pts[2][0], pts[2][1], rad[1] * 1.1 + pad, 0, TAU); g.fill();
      g.beginPath(); g.arc(pts[3][0], pts[3][1], rad[3] * 1.22 + pad, 0, TAU); g.fill();
      // fills
      const base = 150 * sp.pal;
      for (let j = 0; j < 6; j++) {
        const p = pts[j], q = pts[j + 1];
        g.fillStyle = grey(base * sp.segShade[j]);
        capsule(g, p[0], p[1], rad[j], q[0], q[1], rad[j + 1]);
        g.fill();
        // highlight stripe toward the light
        const nx = -(q[1] - p[1]), ny = q[0] - p[0];
        const nl = Math.hypot(nx, ny) || 1;
        let ux = nx / nl, uy = ny / nl;
        if (ux * LX + uy * LY < 0) { ux = -ux; uy = -uy; }
        const o1 = rad[j] * 0.38, o2 = rad[j + 1] * 0.38;
        g.strokeStyle = grey(225 * sp.pal);
        g.globalAlpha = 1;
        g.lineCap = 'round';
        g.lineWidth = Math.max(0.008, (rad[j] + rad[j + 1]) * 0.34);
        g.beginPath();
        g.moveTo(p[0] + ux * o1, p[1] + uy * o1);
        g.lineTo(q[0] + ux * o2, q[1] + uy * o2);
        g.stroke();
        // dark underside edge
        g.strokeStyle = '#303030';
        g.globalAlpha = 0.5;
        g.lineWidth = Math.max(0.005, (rad[j] + rad[j + 1]) * 0.22);
        g.beginPath();
        g.moveTo(p[0] - ux * rad[j] * 0.78, p[1] - uy * rad[j] * 0.78);
        g.lineTo(q[0] - ux * rad[j + 1] * 0.78, q[1] - uy * rad[j + 1] * 0.78);
        g.stroke();
        g.globalAlpha = 1;
      }
      // joint bulges
      for (const [pi, rr] of [[2, rad[1] * 1.04], [3, rad[3] * 1.2]]) {
        const gr = g.createRadialGradient(pts[pi][0] + LX * rr * 0.4, pts[pi][1] + LY * rr * 0.4, 0, pts[pi][0], pts[pi][1], rr);
        gr.addColorStop(0, grey(175 * sp.pal));
        gr.addColorStop(0.5, grey(105 * sp.pal));
        gr.addColorStop(1, grey(55 * sp.pal));
        g.fillStyle = gr;
        g.beginPath(); g.arc(pts[pi][0], pts[pi][1], rr, 0, TAU); g.fill();
      }
      // bristly hairs (same positions every frame)
      const hr = mulberry32(sid * 1000 + i * 50 + (side > 0 ? 25 : 0));
      g.lineCap = 'round';
      g.strokeStyle = grey(200 * sp.pal);
      g.lineWidth = 0.0055 + 0.003 * sp.hair;
      for (let j = 1; j < 6 && sp.hair > 0; j++) {
        const p = pts[j], q = pts[j + 1];
        const sl = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const n = Math.round(sl / 0.03 * (0.5 + sp.hair));
        const tx = (q[0] - p[0]) / (sl || 1), ty = (q[1] - p[1]) / (sl || 1);
        for (let h = 0; h < n; h++) {
          const t = hr();
          const r = rad[j] + (rad[j + 1] - rad[j]) * t;
          const sgn = hr() < 0.5 ? -1 : 1;
          const bx = p[0] + (q[0] - p[0]) * t - ty * sgn * r * 0.9;
          const by = p[1] + (q[1] - p[1]) * t + tx * sgn * r * 0.9;
          const hl = (0.014 + hr() * 0.02) * (0.7 + sp.hair * 0.6) + r * 0.5;
          const a = 0.9 + hr() * 0.5;
          const dx = -ty * sgn * Math.cos(a) + tx * Math.sin(a);
          const dy = tx * sgn * Math.cos(a) + ty * Math.sin(a);
          g.globalAlpha = 0.55 + hr() * 0.4;
          g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + dx * hl, by + dy * hl); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------- body
function drawAbdomen(g, sp, sid) {
  const { ax, arx, ary, pal } = sp;
  // spinnerets (behind rear edge, drawn first so abdomen overlaps their base)
  for (const yy of [-0.03, 0.03]) {
    g.fillStyle = '#222';
    capsule(g, ax - arx * 0.85, yy, 0.026, ax - arx - 0.07, yy * 0.8, 0.02); g.fill();
    g.fillStyle = grey(140 * pal);
    capsule(g, ax - arx * 0.85, yy, 0.02, ax - arx - 0.065, yy * 0.8, 0.014); g.fill();
  }
  bodyPath(g, ax, arx, ary, -0.1, 0.0);
  g.fillStyle = '#262626';
  g.save(); g.translate(ax, 0); g.scale(1.03, 1.05); g.translate(-ax, 0); g.fill(); g.restore();
  bodyPath(g, ax, arx, ary, -0.1, 0.0);
  shadeFill(g, ax, arx, ary, pal, BODY_STOPS);
  g.save();
  bodyPath(g, ax, arx, ary, -0.1, 0.0);
  g.clip();
  // pattern
  if (sp.pattern === 'wolf') {
    g.fillStyle = 'rgba(25,25,25,0.55)';
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.ellipse(ax - arx * 0.05, sgn * ary * 0.5, arx * 0.78, ary * 0.17, 0, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(245,245,245,0.55)';
    g.beginPath(); g.moveTo(ax + arx * 0.7, 0); g.quadraticCurveTo(ax + arx * 0.1, -ary * 0.3, ax - arx * 0.85, 0);
    g.quadraticCurveTo(ax + arx * 0.1, ary * 0.3, ax + arx * 0.7, 0); g.fill();
  }
  // folium / chevrons
  g.lineCap = 'round'; g.lineJoin = 'round';
  const nChev = sp.pattern === 'jump' ? 4 : 5;
  g.strokeStyle = sp.pattern === 'tar' ? 'rgba(15,15,15,0.7)' : 'rgba(10,10,10,0.9)';
  for (let c = 0; c < nChev; c++) {
    const x0 = ax + arx * (0.4 - c * 0.28);
    const wy = ary * (0.62 - c * 0.07);
    g.lineWidth = ary * (0.15 - c * 0.012);
    g.beginPath();
    g.moveTo(x0 - arx * 0.24, -wy); g.lineTo(x0, 0); g.lineTo(x0 - arx * 0.24, wy);
    g.stroke();
  }
  if (sp.pattern === 'jump') {
    g.fillStyle = 'rgba(240,240,240,0.7)';
    for (const sgn of [-1, 1]) { g.beginPath(); g.arc(ax + arx * 0.15, sgn * ary * 0.38, ary * 0.1, 0, TAU); g.fill(); }
  }
  // hair texture radiating from the pedicel
  const hr = mulberry32(sid * 777 + 13);
  g.lineCap = 'round';
  const ox = ax + arx * 0.9;
  for (let h = 0; h < sp.bodyHair; h++) { // (0 for non-giants)
    const x = ax + (hr() * 2 - 1) * arx, y = (hr() * 2 - 1) * ary;
    if (((x - ax) / arx) ** 2 + (y / ary) ** 2 > 1.02) continue;
    const a = Math.atan2(y, x - ox) + (hr() - 0.5) * 0.5;
    const len = 0.025 + hr() * 0.035 * (0.5 + sp.hair);
    const light = hr() < 0.6;
    g.strokeStyle = light ? 'rgba(235,235,235,0.5)' : 'rgba(20,20,20,0.4)';
    g.lineWidth = 0.006 + 0.004 * sp.hair;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  // specular highlight
  const hx = ax + LX * arx * 0.25, hy = LY * ary * 0.4;
  const sg = g.createRadialGradient(hx, hy, 0, hx, hy, arx * 0.55);
  sg.addColorStop(0, 'rgba(255,255,255,0.55)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sg;
  g.fillRect(ax - arx, -ary, arx * 2, ary * 2);
  g.restore();
  // rim
  bodyPath(g, ax, arx, ary, -0.1, 0.0);
  g.strokeStyle = 'rgba(15,15,15,0.8)';
  g.lineWidth = 0.012;
  g.stroke();
}

function drawEyes(g, sp) {
  const { cx, crx, cry } = sp;
  const eyes = [];
  if (sp.pattern === 'jump') {
    eyes.push([0.82, 0.3, 0.05], [0.5, 0.66, 0.03], [0.1, 0.62, 0.022], [0.62, 0.12, 0.014]);
  } else if (sp.pattern === 'wolf') {
    eyes.push([0.9, 0.16, 0.02], [0.88, 0.4, 0.02], [0.58, 0.58, 0.037], [0.2, 0.68, 0.03]);
  } else {
    eyes.push([0.72, 0.13, 0.032], [0.6, 0.3, 0.02], [0.8, 0.38, 0.016]);
  }
  for (const [ex, ey, er] of eyes) {
    for (const sgn of [-1, 1]) {
      const x = cx + crx * ex, y = sgn * cry * ey;
      g.fillStyle = '#111';
      g.beginPath(); g.arc(x, y, er * 1.15, 0, TAU); g.fill();
      g.fillStyle = '#2a2a2a';
      g.beginPath(); g.arc(x, y, er * 0.9, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.arc(x - er * 0.3, y - er * 0.3, Math.max(0.006, er * 0.28), 0, TAU); g.fill();
    }
  }
}

function drawCephalothorax(g, sp, k) {
  const { cx, crx, cry, pal } = sp;
  bodyPath(g, cx, crx, cry, 0.28, 0.0);
  g.fillStyle = '#262626';
  g.save(); g.translate(cx, 0); g.scale(1.04, 1.07); g.translate(-cx, 0); g.fill(); g.restore();
  bodyPath(g, cx, crx, cry, 0.28, 0.0);
  shadeFill(g, cx, crx, cry, pal, BODY_STOPS);
  g.save();
  bodyPath(g, cx, crx, cry, 0.28, 0.0);
  g.clip();
  if (sp.pattern === 'wolf') {
    g.fillStyle = 'rgba(240,240,240,0.5)';
    g.fillRect(cx - crx, -cry * 0.22, crx * 2, cry * 0.44);
  }
  // radial grooves from the fovea
  const fx = cx - crx * 0.12;
  g.strokeStyle = 'rgba(25,25,25,0.5)';
  g.lineWidth = 0.011;
  g.lineCap = 'round';
  for (let a = 0; a < 8; a++) {
    const ang = (a + 0.5) * Math.PI / 4;
    const c = Math.cos(ang), s = Math.sin(ang);
    g.beginPath();
    g.moveTo(fx + c * crx * 0.2, s * cry * 0.2);
    g.lineTo(fx + c * crx * 0.88, s * cry * 0.88);
    g.stroke();
  }
  g.fillStyle = 'rgba(15,15,15,0.85)';
  g.beginPath(); g.ellipse(fx, 0, crx * 0.12, cry * 0.07, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(15,15,15,0.5)';
  g.beginPath(); g.ellipse(cx + crx * 0.55, 0, crx * 0.34, cry * 0.5, 0, 0, TAU); g.fill();
  // specular
  const hx = cx + LX * crx * 0.2, hy = LY * cry * 0.4;
  const sg = g.createRadialGradient(hx, hy, 0, hx, hy, crx * 0.6);
  sg.addColorStop(0, 'rgba(255,255,255,0.6)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sg;
  g.fillRect(cx - crx, -cry, crx * 2, cry * 2);
  g.restore();
  g.strokeStyle = 'rgba(15,15,15,0.85)';
  g.lineWidth = 0.012;
  bodyPath(g, cx, crx, cry, 0.28, 0.0);
  g.stroke();
  drawEyes(g, sp);
}

function drawFront(g, sp, k) {
  const { cx, crx, cry, pal } = sp;
  const th = (k / 8) * TAU;
  const fxs = cx + crx * 0.92;
  // chelicerae + fangs
  for (const sgn of [-1, 1]) {
    const y0 = sgn * cry * 0.3, y1 = sgn * cry * 0.26;
    const x1 = fxs + 0.085;
    g.fillStyle = '#222';
    capsule(g, fxs - 0.01, y0, cry * 0.27 + 0.01, x1, y1, cry * 0.22 + 0.01); g.fill();
    const gr = g.createRadialGradient(fxs + 0.02, y0 + LY * 0.02, 0, fxs + 0.03, y0, cry * 0.4);
    gr.addColorStop(0, grey(220 * pal)); gr.addColorStop(1, grey(95 * pal));
    g.fillStyle = gr;
    capsule(g, fxs - 0.01, y0, cry * 0.27, x1, y1, cry * 0.22); g.fill();
    // fang
    g.strokeStyle = '#111'; g.lineCap = 'round'; g.lineWidth = 0.022;
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(x1 + 0.06, y1, x1 + 0.07, y1 - sgn * 0.05); g.stroke();
    g.strokeStyle = grey(200); g.lineWidth = 0.009;
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(x1 + 0.055, y1, x1 + 0.065, y1 - sgn * 0.045); g.stroke();
  }
  // pedipalps (3 segments + bulb), small stepping motion
  const pl = 0.16 * sp.palp;
  for (const sgn of [-1, 1]) {
    const wob = Math.sin(th + (sgn > 0 ? Math.PI : 0)) * 0.05;
    const p0 = [cx + crx * 0.78, sgn * cry * 0.72];
    const p1 = [p0[0] + pl * 0.5, p0[1] + sgn * pl * 0.5 + wob * 0.2];
    const p2 = [p1[0] + pl * 0.75, p1[1] - sgn * pl * 0.2 + wob];
    const p3 = [p2[0] + pl * 0.45, p2[1] - sgn * pl * 0.42];
    const rr = [0.03, 0.026, 0.02, 0.022].map((r) => r * (0.9 + 0.25 * sp.hair));
    const pts = [p0, p1, p2, p3];
    g.fillStyle = '#222';
    for (let j = 0; j < 3; j++) { capsule(g, pts[j][0], pts[j][1], rr[j] + 0.008, pts[j + 1][0], pts[j + 1][1], rr[j + 1] + 0.008); g.fill(); }
    g.fillStyle = grey(165 * pal);
    for (let j = 0; j < 3; j++) { capsule(g, pts[j][0], pts[j][1], rr[j], pts[j + 1][0], pts[j + 1][1], rr[j + 1]); g.fill(); }
    g.fillStyle = grey(205 * pal);
    g.beginPath(); g.arc(p3[0], p3[1], rr[3] * 1.15, 0, TAU); g.fill();
    g.strokeStyle = grey(215 * pal); g.lineWidth = 0.006;
    for (let h = 0; h < (sp.hair > 0 ? 6 * sp.hair + 3 : 0); h++) {
      const j = (h % 3), t = ((h * 0.37) % 1);
      const bx = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, by = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 0.02, by + sgn * (h & 1 ? 0.025 : -0.015)); g.stroke();
    }
  }
}

function renderSprite(sp, k, sid) {
  const c = document.createElement('canvas');
  c.width = c.height = S0;
  const g = c.getContext('2d');
  g.translate(S0 / 2, S0 / 2);
  g.scale((S0 / 2) * K, (S0 / 2) * K);
  g.lineJoin = 'round';
  drawLegs(g, sp, k, sid);
  drawAbdomen(g, sp, sid);
  drawCephalothorax(g, sp, k);
  drawFront(g, sp, k);
  // black halo baked under the sprite (silhouette dilated)
  const sil = document.createElement('canvas');
  sil.width = sil.height = S0;
  const sg = sil.getContext('2d');
  sg.drawImage(c, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#000';
  sg.fillRect(0, 0, S0, S0);
  const hc = document.createElement('canvas');
  hc.width = hc.height = S0;
  const hg = hc.getContext('2d');
  const hr = HALO * (S0 / 2) * K;
  for (let a = 0; a < 16; a++) hg.drawImage(sil, Math.cos(a / 16 * TAU) * hr, Math.sin(a / 16 * TAU) * hr);
  for (let a = 0; a < 8; a++) hg.drawImage(sil, Math.cos(a / 8 * TAU) * hr * 0.5, Math.sin(a / 8 * TAU) * hr * 0.5);
  hg.drawImage(c, 0, 0);
  c.width = S0; // reset
  c.getContext('2d').drawImage(hc, 0, 0);
  // mips
  const out = [c];
  for (let m = 1; m < MIPS.length; m++) {
    const mc = document.createElement('canvas');
    mc.width = mc.height = MIPS[m];
    const mg = mc.getContext('2d');
    mg.imageSmoothingEnabled = true;
    mg.imageSmoothingQuality = 'high';
    mg.drawImage(out[m - 1], 0, 0, MIPS[m], MIPS[m]);
    out.push(mc);
  }
  return out;
}

// ---------------------------------------------------------------- swarm
export function createSpiderSwarm(ctx) {
  const { THREE } = ctx;
  let aspect = ctx.aspect;

  // sprites[species][frame] = [mip0, mip1, mip2]
  // sprites[hairy][species][frame] = [mip0, mip1, mip2]; only giants get (sparse) hair
  const sprites = [0, 1].map((hairy) => SPECIES.map((sp0, si) => {
    const sp = hairy ? { ...sp0, hair: sp0.hair * 0.5, bodyHair: Math.round(sp0.bodyHair * 0.3) } : { ...sp0, hair: 0, bodyHair: 0 };
    const arr = [];
    for (let k = 0; k < 8; k++) arr.push(renderSprite(sp, k, si + 1));
    return arr;
  }));

  const rnd = mulberry32(90210);
  const R = (a, b) => a + (b - a) * rnd();
  const spiders = [];
  function add(layer, size, alpha, tc, vn, spd) {
    spiders.push({
      layer, size, alpha, tc, vn, spd,
      jit: R(-0.16, 0.16),
      sp: Math.floor(rnd() * 3),
      wAmp: R(0.005, 0.02) * (layer === 2 ? 2 : 1), wFreq: R(2, 5), wPh: R(0, TAU),
      ph: rnd(),
    });
  }
  for (let i = 0; i < 20; i++) add(0, R(0.14, 0.18), R(0.7, 0.85), R(0.9, 2.1), R(-1.05, 1.05), R(1, 1.25));
  for (let i = 0; i < 60; i++) add(1, R(0.2, 0.28), R(0.92, 1), R(0.95, 2.05), R(-1.05, 1.05), R(1, 1.25));
  const FGV = [-0.7, -0.4, -0.1, 0.12, 0.42, 0.7];
  const FGT = [1.75, 1.3, 1.46, 1.54, 1.7, 1.28];
  for (let i = 0; i < 6; i++) add(2, R(0.45, 0.6), 1, FGT[i] + R(-0.04, 0.04), FGV[i] + R(-0.04, 0.04), R(1.25, 1.5));
  spiders.sort((a, b) => a.layer - b.layer || a.size - b.size);

  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  let CW = 0, CH = 0;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace; // greys straight through (sRGB decode made legs too dim for the glyph ramp)
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  camera.position.z = 5;
  const scene = new THREE.Scene();
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(plane);

  function size(a) {
    aspect = a;
    if (a >= 1) { CW = MAXDIM; CH = Math.max(2, Math.round(MAXDIM / a)); }
    else { CH = MAXDIM; CW = Math.max(2, Math.round(MAXDIM * a)); }
    canvas.width = CW; canvas.height = CH;
    texture.dispose();
  }
  size(aspect);

  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.clearRect(0, 0, CW, CH);
    const W = aspect;
    const th = Math.atan2(1, W);
    const dx = Math.cos(th), dy = Math.sin(th);
    const halfDiag = Math.hypot(W, 1) / 2;
    const vmax = (W / 2) * dy + 0.5 * dx + 0.05;
    const ref = Math.min(CH, CW * 1.5); // size reference in px
    const travel = Math.atan2(-dy, -dx);

    for (const s of spiders) {
      const lim = Math.min(s.tc, DUR - s.tc);
      const vel = ((halfDiag + s.size * 0.5 + 0.12) / lim) * s.spd;
      const along = vel * (t - s.tc);
      const ja = travel + s.jit;
      const wv = s.wAmp * Math.sin(s.wFreq * t + s.wPh);
      const wd = s.wAmp * s.wFreq * Math.cos(s.wFreq * t + s.wPh);
      const v = s.vn * vmax + wv;
      // path point (screen-height units, y down)
      const px = W / 2 + Math.cos(ja) * along + (-dy) * v;
      const py = 0.5 + Math.sin(ja) * along + dx * v;
      const X = px * CH, Y = py * CH;
      const spanPx = s.size * ref;
      if (X < -spanPx || X > CW + spanPx || Y < -spanPx || Y > CH + spanPx) continue;
      // heading from velocity incl. wander
      const vx = Math.cos(ja) * vel + (-dy) * wd;
      const vy = Math.sin(ja) * vel + dx * wd;
      const hd = Math.atan2(vy, vx);
      // gait frame from distance travelled
      const stride = Math.max(s.size * 0.3, vel / 4.5);
      let ph = (vel * t) / stride + s.ph;
      ph -= Math.floor(ph);
      const fr = Math.min(7, Math.floor(ph * 8));
      // sprite lateral span ~ 1.75 * (S0/2) of the sprite
      const dispPx = spanPx / (1.75 * K) * 2;
      let mi = 0;
      for (let m = 0; m < MIPS.length; m++) if (MIPS[m] >= dispPx) mi = m;
      const spr = sprites[s.layer === 2 ? 1 : 0][s.sp][fr][mi];
      const sc = dispPx / MIPS[mi];
      const c = Math.cos(hd) * sc, sn = Math.sin(hd) * sc;
      g.setTransform(c, sn, -sn, c, X, Y);
      g.globalAlpha = s.alpha;
      g.drawImage(spr, -MIPS[mi] / 2, -MIPS[mi] / 2);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    texture.needsUpdate = true;
  }

  draw(0);

  return {
    name: 'spiders',
    duration: DUR,
    fadeIn: false,
    fadeOut: false,
    scene,
    camera,
    labels() { return []; },
    update(t) { draw(t); },
    resize(a) { size(a); draw(0); },
  };
}
