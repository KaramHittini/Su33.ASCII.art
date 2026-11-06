# HANDOFF — interests.karamhittini.com

**State (v3 realism pass, 2026-11-06):** monochrome ASCII loop, Vite + three.js. Loop = eye (8s) → Spider-Man (14s) → spider-swarm overlay (3s, centred on 22s) → Su-33 (20s) = 42s.
- Engine `src/ascii.js`: 5x9 px cells; 20 tone levels, ONE glyph each (`ALT` const; >1 = same-coverage alternates); Sobel edge glyphs only on strong outlines (threshold 0.55).
- `eye.js`: anatomical LEFT eye (`INNER = -1`, flip to 1), angry brow/lids, web in pupil, zoom into hub.
- `swing.js`: ray-marched SDF Spider-Man (IK joints, comic web pattern, angry framed lenses; poses stand/crouch/dive). Beats: out of lens → bust → looks right → waist → spider-sense → perched crouch (3/4 low angle) → dives off the ledge.
- `spiders.js`: 86 pre-rendered segmented spiders (3 species × 8 gait frames) with black halos. Texture must stay NoColorSpace (sRGB made legs too dim).
- `su33.js`: lofted Su-33, procedural camo, 3/4 hero shot → top-down → explode; title label only.

**Run:** `npm run dev` · `npm run build` · debug `?scene=eye|swing|spiders|su33`, `?t=<sec>`, `?freeze`. Parallel playwright: `playwright-cli -s=<name>` per agent.

**Verified:** build passes; full 45s loop 0 console errors; screenshots of every scene at 1440x900 + 390x844.

**Weak spots:** middle of the spider swarm is a dense mass (edge spiders read well); Spider-Man full-body shots are smaller/dimmer than the bust; Su-33 exploded view is small (missile columns widen the frame).

**Not done:** deploy (new Vercel project + `interests.karamhittini.com`) — needs user go-ahead. Not a git repo.
