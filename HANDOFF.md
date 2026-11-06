# HANDOFF — interests.karamhittini.com

**State (v7 Su-33 only, 2026-11-06):** monochrome ASCII loop, Vite + three.js. Loop ≈ 80s = launch (14) → su33 (27.5) → cobra (12) → weapons (12) → trap (14). Registry: `src/scenes/index.js`. Other scenes moved to `/archive` (not bundled).
- Engine `src/ascii.js`: glyph density ramp (20 levels), each glyph shaded by luminance (0.1..1) AND tinted with the scene hue (saturation x1.7); `?mono` = grey. Scenes render full colour (dusk palette, navy camo, orange burners).
- `src/su33/model.js`: shared articulated Su-33 — `buildSu33({missiles})` → {root, parts, rig, update}. Nose +X, up +Y, starboard +Z, metres; wheels at GROUND_Y=-2.8. rig: wing/stab fold, canards, stabs, flaps, gear, hook, airbrake, probe, afterburner plumes, missiles (detach), flareOrigins. `makeLights`/`aimLights(camera, target, lights)` — always pass `lights`.
- `src/su33/carrier.js`: Admiral Kuznetsov (ski-jump, angled deck, island, wires, deflector) + sea/sky. `src/su33/sky.js`: flight sky + vapour trail helper.
- Scenes: `launch.js` (wings unfold, burners, ski-jump), `su33.js` (hero → top-down → explode → reassemble → exits left), `cobra.js` (Pugachev's Cobra), `weapons.js` (R-27/R-73 launch with smoke trails, flare fans; point sprites with MAX blending), `trap.js` (approach, wire catch, wings fold).

**Run:** `npm run dev` · `npm run build` · `?scene=<name>&t=<sec>&freeze[&plain]`; model debug `?scene=su33&rig=1&fold=1&gear=1&hook=1&ab=1&view=q3|side|plan|front|rear`. Parallel playwright: `-s=<name>`. Note: carrier sea/sky only look right in the ASCII pass, not `?plain`.

**Verified:** build passes; full loop 0 console errors; ASCII screenshots of every scene (desktop); phone checked by builders (trap/launch phone re-framing not re-shot).

**Weak spots:** carrier deck/sea busy in ASCII (jet pops less); weapons beat 1 busy when the R-73 trail crosses the jet; trap→launch is a cut (jet position differs); afterburner plumes dim in ASCII.

**Not done:** deploy (new Vercel project + `interests.karamhittini.com`) — needs user go-ahead. Not a git repo.
