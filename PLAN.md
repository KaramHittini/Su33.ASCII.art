# PLAN — interests.karamhittini.com (ASCII cinematic loop)

## Goal
A single full-screen page, black background, nothing clickable. A looping monochrome
animation where EVERYTHING is drawn with characters: a-z A-Z and the symbols
`/.,<>?;':"[]{}~\`!@#$%^&*()_+-=|\`. Sequence (loops forever):
1. Eye opens (from closed), iris + pupil visible, camera zooms into the pupil until the screen is black. (~8s)
2. A Spider-Man–style figure swings across a city on web lines, side view. Small label `SPIDER-MAN`. (~11s)
3. Su-33 flies in from the side, camera cranes up to top-down, the jet explodes into labelled parts + armaments, holds, fades. (~20s)
Then back to 1.

## Acceptance criteria
- `npm run build` succeeds; `npm run dev` shows the loop with no console errors.
- Pure monochrome (white/grey glyphs on #000). No color anywhere.
- No interactive elements, no cursor change, no scrollbars, no text selection.
- ~60fps on a laptop; on narrow screens (<700px) cells are larger (fewer columns).
- `prefers-reduced-motion: reduce` → playback at 0.5 speed and no glyph shimmer.
- Debug URL params work: `?scene=eye|swing|su33` plays only that scene on loop; `?t=<seconds>` starts the full loop at that global time.

## Architecture (fixed — all steps must follow it)
- Vite + vanilla JS (ES modules) + `three` (npm). No framework, no TypeScript.
- Files:
  - `index.html` — `<canvas id="c">`, `<div id="labels">`, imports `/src/main.js`.
  - `src/style.css` — black bg, overflow hidden, `user-select:none`, `cursor:none`, labels in monospace, small (11–13px), white at 0.85 opacity, letter-spacing .1em.
  - `src/ascii.js` — `export class AsciiRenderer` (see below).
  - `src/timeline.js` — sequences scenes, fades, loop, debug params.
  - `src/labels.js` — `setLabels(list)` renders/updates HTML labels in `#labels`; each `{id, text, x, y}` with x,y in 0..1 screen coords (0,0 = top-left). Labels type-in letter by letter on first appearance (~25ms/char), removed when absent from list.
  - `src/scenes/index.js` — `export const sceneFactories = [createEyeScene, createSwingScene, createSu33Scene]`.
  - `src/scenes/eye.js`, `src/scenes/swing.js`, `src/scenes/su33.js` — one scene each.
- **Scene contract** (every scene file default-free, named export):
  ```js
  export function createXScene(ctx) // ctx = { THREE, aspect }  (aspect = cols*cellW / (rows*cellH) i.e. screen aspect)
  // returns:
  {
    name: 'eye' | 'swing' | 'su33',
    duration: Number,            // seconds
    fadeIn: Boolean, fadeOut: Boolean, // timeline applies 0.6s brightness fade at start/end when true
    scene: THREE.Scene,          // background must be black (scene.background = null; clear color black)
    camera: THREE.Camera,
    update(t, p, dt) {},         // t = local seconds, p = t/duration (0..1), dt seconds. Must be deterministic from t (so ?t= seeking works); dt only for optional smoothing.
    resize(aspect) {},           // update camera aspect / projection
    labels() { return [] }       // [{id, text, x, y}] in 0..1 screen coords; may project 3D points
  }
  ```
  Scenes output BRIGHTNESS only: use white/grey materials and lights; luminance becomes glyph density. Use MeshStandardMaterial / MeshLambertMaterial with white color or ShaderMaterial outputting grey.
- **AsciiRenderer** (`src/ascii.js`):
  - Builds a glyph atlas at runtime: draw every char of the charset into an offscreen canvas (bold monospace), measure pixel coverage, sort ascending, prepend space `' '`. Atlas = one row of N cells, uploaded as a `CanvasTexture` (nearest filtering).
  - Cell size in CSS px: desktop cellW=8, cellH=14; if `innerWidth < 700`: cellW=10, cellH=17. Multiply by devicePixelRatio (cap DPR at 2) for drawing-buffer px. cols = floor(w/cellW), rows = floor(h/cellH).
  - Each frame: render the scene into a `WebGLRenderTarget` sized `cols*2 × rows*2` (linear filter), then draw a fullscreen quad with a ShaderMaterial that: finds the cell for the fragment, samples the RT at the cell center (linear filter averages the 2×2), luminance → `pow(lum, gamma)` (gamma uniform ~0.8) × `uBrightness` (fade) → glyph index; optional shimmer: if `uShimmer>0`, add ±1 index jitter from a hash of (cell, floor(time*8)) only when lum is mid-range. Outputs `vec3(glyphAlpha * shade)` where shade = 0.55 + 0.45*lum (so bright areas are also brighter), on pure black.
  - API: `constructor(canvas)`, `setSize(w,h)`, `get aspect()`, `render(scene, camera, {brightness, time, shimmer})`.
- Timeline: global clock (performance.now, scaled 0.5 under reduced motion), find current scene by cumulative durations, call `update`, compute fade brightness from fadeIn/fadeOut, render, `setLabels(scene.labels())`. On resize: `ascii.setSize`, all scenes `resize(aspect)`. Pause rendering when `document.hidden`.

## Steps
- [x] **1. Scaffold + engine** (sonnet/builder). `npm create`-free: write `package.json` (scripts dev/build/preview, deps `three`, devDeps `vite`), `index.html`, `src/style.css`, `src/main.js`, `src/ascii.js`, `src/timeline.js`, `src/labels.js`, `src/scenes/index.js`, and STUB scenes `eye.js`/`swing.js`/`su33.js` (each: a white rotating `TorusKnot` lit by a directional light, durations 8/11/20, one label with its name). `npm install`. Done-check: `npm run build` passes; dev server shows rotating ASCII torus knots cycling with fades + labels; `?scene=` and `?t=` work.
- [x] **2. Eye scene** (sonnet/builder) — replace `src/scenes/eye.js` only. Fullscreen-quad ShaderMaterial (orthographic camera) drawing a procedural eye in brightness: almond eye opening (two arcs) with eyelid open amount, eyelid edge lines + a few lashes, sclera mid-grey with soft shading toward corners, iris with radial fibre streaks (noise on angle) + darker limbal ring, pupil pure black, small specular highlight. Timeline (8s, fadeIn:false, fadeOut:false): 0–0.6s black; 0.6–2.8s eyelids open with ease + one tiny half-blink flutter; 2.8–4.2s pupil dilates slightly, slight eye drift; 4.2–8s camera zooms toward pupil center (exponential scale, ~1→60), highlight stays put, last ~0.6s fully black. Correct aspect handling (no stretching). No labels. Done-check: `?scene=eye` reads clearly as an eye at desktop and 390px width, ends fully black.
- [x] **3. Swing scene** (sonnet/builder) — replace `src/scenes/swing.js` only. 11s, fadeIn:true, fadeOut:true. Side-view perspective camera. City: rows of box buildings at 2–3 depths (dim grey far, brighter near) with sparse lit window dots, scrolling/parallax as camera tracks the hero. Hero: humanoid built from capsules/spheres (head, torso, upper/lower arms & legs) in a Group, white material, posed procedurally. Motion: 3 pendulum swings: attach to anchor point high ahead → swing arc (pendulum with ease) → release at top → short ballistic arc with tuck/spread pose → next attach. Web line = thin bright cylinder/line from hand to anchor while attached. Camera follows horizontally, slight lag. Label `{id:'swing', text:'SPIDER-MAN', x:0.06, y:0.9}` from 1s. Deterministic from t. Done-check: `?scene=swing` clearly reads as a figure swinging on a line through a city.
- [x] **4. Su-33 scene** (sonnet/builder) — replace `src/scenes/su33.js` only. 20s, fadeIn:true, fadeOut:true. Procedural low-poly Su-33 built from primitives, every part its own Group so it can be exploded: fuselage+long nose, canopy, canards (2), main wings (2, large, swept), horizontal stabilizers (2), twin vertical tails, two engine nacelles + nozzles (wide spaced), intakes, tail stinger, landing gear (nose + 2 main), tail hook. Armaments: 2× R-73 (wingtips), 4× R-27 (underwing), 2× R-73 inner? keep ~6–8 missiles total as cylinders + fins. White/light grey materials, directional + ambient light so form reads. Sequence: 0–5s side view, jet flies in from left and settles centre (slight bank/bob); 5–9s camera cranes smoothly up and over to top-down (jet nose pointing up-screen); 9–13s explode: each part tweens outward along its own offset vector (staggered, easeOutCubic), missiles fan out below/around; 13–18s hold with very slow drift; labels appear for each part group during explode/hold: `FUSELAGE, CANOPY, CANARDS, WINGS, STABILIZERS, VERTICAL TAILS, AL-31F ENGINES, INTAKES, LANDING GEAR, TAIL HOOK, R-73, R-27` (projected 3D positions → 0..1 screen coords, offset slightly from part); title label `{id:'title', text:'SU-33 FLANKER-D', x:0.06, y:0.9}` from 1s. Done-check: `?scene=su33` reads as a twin-tail Flanker side view, top-down, then a clean exploded view with labels on screen (not off-edge) at 1440 and 390 width.
- [x] **5. Verify** (checker): `npm run build`; run `npm run preview`, use Playwright to screenshot `?scene=eye&t=1.5`, `t=3`, `t=6`, `?scene=swing&t=4`, `?scene=su33&t=3,8,15` at 1440×900 and 390×844; check no console errors, monochrome, labels in viewport.

## Decisions
- Procedural Su-33 (no external model) for v1: no licensing risk, parts already separate for the explode. Can swap to a CC GLB later.
- Generic humanoid figure for Spider-Man (no ripped assets).
- HTML labels (monospace) instead of in-grid glyph labels — simpler, crisp.
- Deploy: Vercel project + `interests.karamhittini.com` domain — only after user confirms.

## Risks
- Eye shader readability in ASCII → tune gamma/contrast.
- Low-res ASCII may lose thin parts (web line, missiles) → make them slightly thicker/brighter than realistic.

---
# v2 (user feedback 2026-11-06)
Engine already changed: cells 5x9 CSS px everywhere (~290x100 cells desktop, ~78x93 on 390x844). `ascii.render(scene, camera, {brightness,time,shimmer,overlays:[{scene,camera}]})` draws overlays on top of the base scene (no clear) before the ASCII pass.

New loop: eye (8s) → swing/Spider-Man (14s) → [spider-swarm transition overlay, 3s centred on the swing→su33 boundary] → su33 (20s) → loop.

- [x] **6. Spider swarm transition + timeline overlays** (builder): new `src/scenes/spiders.js` (`createSpiderSwarm(ctx)` → {scene,camera,duration:3,update(t,p),resize(aspect)}) + `transitions` export in `src/scenes/index.js` + timeline support. Swing fadeOut=false, su33 fadeIn=false (swarm hides the cut).
- [x] **7. Eye: spider web inside the pupil** (builder, eye.js only).
- [x] **8. Spider-Man scene rewrite** (builder, swing.js only): no city; detailed 2D vector Spider-Man drawn to a CanvasTexture with a camera transform; zoom out of his mask eye → bust (below shoulders) → looks right → zoom out to below torso → spider-sense → leaps off the rooftop ledge.
- [x] **9. Su-33 accuracy rewrite** (builder, su33.js + src/scenes/su33/*): lofted fuselage from real proportions, detailed parts, no part labels (title only), keep fly-in → top-down → explode.
- [x] **10. Verify** (checker).

---
# v3 (user feedback 2026-11-06): "ugly and unrealistic" → realism pass
Engine: density ramp is now 20 clean coverage levels, ONE glyph each (ALT=1; ALT>1 adds same-coverage alternates); edge threshold 0.55 (strong outlines only). Realism must come from smooth 3D shading.
- [x] 11. Spider-Man: raymarched SDF sculpted figure (Opus, swing.js). Same story beats; comic-real shading, web pattern, framed lenses, crouch (ref: perched pose) and leap toward camera with reaching hand.
- [x] 12. Su-33: realism rewrite (Opus fork, su33.js): accurate planform, smooth shading, monochrome camo/panel lines, dramatic 3/4 camera like refs, then top-down, explode.
- [x] 13. Eye: anatomical LEFT eye (inner corner screen-left), angry (low angled brow, furrow, lowered upper lid, raised lower lid) (builder, eye.js).
- [x] 14. Spiders: realistic segmented hairy spiders, ~160, depth layers, cached sprite gait frames (builder, spiders.js).
- [x] 15. Verify (checker).
