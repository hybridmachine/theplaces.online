# The Living Yard (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring wind, the cottage's lights, casement and smoke, rain with its wet traces and drips, lake ripples, and the bird with its nest into the walkable `?space=1` yard, driven by the existing shared samplers and server snapshot.

**Architecture:** One shared layout (`shared/lakeside-life.js`) gives every existing id a 3D anchor derived from the oak, cabin and shoreline. One presenter per system under `public/space/life/` turns a sampler's pose into 3D objects, behind a single `createLife` entry that `SpaceView` calls each frame; a presenter that throws is dropped and the rest carry on. Wind runs in the card materials' vertex shader; ripples and wetness run in the lake and ground materials.

**Tech Stack:** Plain ES modules, no build step. three.js 0.170.0 (vendored, `public/assets/vendor/three-0.170.0.module.js`). `node:test`. Optional dev-only Playwright for `scripts/check-space-browser.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-16-living-yard-design.md` (parents: `2026-11-15-navigable-yard-design.md`, `2026-11-16-painted-look-design.md`, same folder).

## Global Constraints

- Axes: x east, y north, z up, metres; three = `toThree([x, y, z]) = [x, z, -y]`; yaw is azimuth clockwise from north. z = 0 is the lake.
- The default page (`/`) must request nothing whose URL contains `three-`, `/space/` or `lakeside-space-v1`. All new browser code is under `public/space/` or reached only from it.
- No change to server code, saved state, or the 2D layouts' values and `version: 1`. `shared/lakeside-bird.js`, `-cottage.js`, `-weather.js`, `-coincidences.js`, `-foliage.js` are read, never edited.
- Existing sampler outputs do not change: every existing test in `test/` passes unmodified, except `test/space-scene.test.js`'s art-slot count (12 → 13) and its `stubArt` panels.
- Nothing the visitor does reaches world state or the network. No reaction to the visitor's position anywhere.
- Shared facts (lit rooms, casement, hearth, bird place and route progress, wetness, ripple place and age) come only from the snapshot through the existing samplers. Only rain streak positions and the distant birds are visitor-local, as in 2D.
- Wind blows toward the south: bearing `Math.PI`, unit direction `[0, -1]`.
- Studies, pause and reduced motion follow `Painting.render` (`public/painting.js` lines 100–182): a study uses `cottageFixture(study)` and `surfaceFixture(study)` and omits the bird, smoke and distant birds; reduced motion omits smoke, drips and distant birds, settles the bird, snaps the casement, and holds foliage still.
- Solid surfaces stay single-sided and wound outward. Blending is allowed only for smoke, rain, drips, the puddle and the window glow; these use `depthWrite: false` and draw after the solid scene. Foliage cards stay alpha-tested.
- Motion is quiet. When in doubt, less.
- Life is identical on all three tiers.
- `npm test` and `npm run check` pass after every task. Every new `.js`/`.mjs` file is added to the `check` chain in `package.json` in the task that creates it.
- Do not read, commit or push `docs/security-audit-2026-09-19.md`. Do not commit `.claude/`.
- Work on branch `claude/living-yard`. Commit messages are plain sentences in the repository's existing style.

## Review Focus

1. **A snapshot with a missing or invalid subsystem** (`world.cottage`, `world.bird`, `world.environment`, `world.coincidences`, `world.nest` absent or failing its `valid…State`): that presenter shows nothing and reports inactive; no throw, no NaN reaching a uniform. Tested in Task 2 (entry) and each presenter's task.
2. **A presenter that throws during `update`**: it is dropped for the page's life, the others keep updating, the yard keeps drawing, and its flag reads unavailable. Tested in Task 2.
3. **Very long uptime** (`motionSeconds` of 10⁷ and more): sway inputs passed to the shader stay small and finite, and the JavaScript twin stays equal to `sampleFoliage`. Tested in Task 3.
4. **A stale snapshot** (`sampleSurface` returns `null` after 60 s without a refresh): wet traces fall back to dry rather than freezing uniforms at garbage; the puddle and drips are absent. Tested in Task 7.
5. **Switching study, pause or reduced motion mid-action** (bird mid-route, casement mid-swing, ripple mid-life): the next frame shows exactly what `Painting.render` would for that combination. Tested in Tasks 4, 8 and 10.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/lakeside-life.js` (new) | `lifeLayout(space, dressing)`: all 3D anchors, wind bearing, sway table; `validLifeLayout`; `sheltered`; `smokePlace`; `birdPlace` |
| `shared/foliage.js` (modify) | extract `foliageMotion` from `sampleFoliage`; add `windClock` |
| `shared/cottage.js` (modify) | `smokePuffs` puffs gain `age` |
| `shared/world.js`, `shared/bird.js` (modify) | export `foragePick`; add `birdProgress` |
| `shared/lakeside-dressing.js` (modify) | `openingCentre`, `ridgePoint`, `chimneyTop` helpers if absent |
| `shared/lakeside-space-art.js` (modify) | `panels.windowLit` |
| `scripts/space-painter/painter.js`, `scripts/prepare-space-assets.mjs` (modify) | paint and export `window-lit.webp` |
| `public/space/geometry.js` (modify) | `sway` vertex attribute in `cardBatch`, `SWAY_UNIFORMS`, sway in `cardMaterial` |
| `public/space/scene/cover.js`, `trees.js`, `cabin.js`, `ground.js`, `index.js` (modify) | pass sway data; per-window materials and casement; wetness, puddle and ripple hooks |
| `public/space/life/index.js` (new) | `createLife`: builds presenters, runs them, isolates failures, reports status |
| `public/space/life/wind.js`, `cottage.js`, `smoke.js`, `rain.js`, `traces.js`, `ripples.js`, `bird.js`, `nest.js`, `far-birds.js` (new) | one presenter each |
| `public/space/space-view.js` (modify) | build and call life; real status flags; `fixture` hook under `check` |
| `test/life-layout.test.js`, `test/life.test.js`, `test/bird-progress.test.js` (new); `test/foliage.test.js`, `test/cottage.test.js`, `test/space-scene.test.js`, `test/space-art.test.js` (modify) | Node tests |
| `scripts/check-space-browser.mjs`, `scripts/capture-space-review.mjs` (modify) | browser checks and review captures |
| `README.md`, `ARTWORK.md`, `docs/space-validation/README.md` (modify) | documentation |

A presenter is `create<Name>(THREE, ctx) → {update(frame) → boolean, dispose()}`; `update` returns whether the thing is active this frame.

- `ctx = {scene, yard, space, dressing, art, layout}` (`scene` is the `THREE.Scene`, `yard` is `buildScene`'s result).
- `frame = {snapshot, now, epoch, calendar, weather, study, motion, motionSeconds, realSeconds, camera, fixture}`. `motion` is false under reduced motion. `fixture` is `null` except under `?check` (Task 2).

---

### Task 1: The life layout

**Files:**
- Create: `shared/lakeside-life.js`, `test/life-layout.test.js`
- Modify: `shared/lakeside-dressing.js` (helpers), `test/dressing.test.js`, `package.json` (`check`)

**Interfaces:**
- Consumes: `LAKESIDE_SPACE`, `LAKESIDE_DRESSING`, `oakPlan`, `cabinFront`, `doorPosition`, `terrainHeight`, `shoreDistance`, `LAKESIDE_BIRD.routes` / `.locations`, `LAKESIDE_COINCIDENCES.locations`, `LAKESIDE_WEATHER.drips`.
- Produces:
  - In `shared/lakeside-dressing.js` (add only those not already there; read the file first): `openingCentre(space, dressing, id) → [x, y, z]` (centre of door or window panel `id`, on the wall's outer face), `ridgePoint(space, dressing, along) → [x, y, z]` (`along` in metres from the cabin's centre along its length, on the ridge line including the sag), `chimneyTop(space, dressing) → [x, y, z]`.
  - `WIND = {bearing: Math.PI, direction: [0, -1], gustSpeed: 6}` (m/s the gust front travels).
  - `SWAY = {grass: {type: 'grass', exposure: .85, reach: .08}, reeds: {type: 'grass', exposure: 1, reach: .16}, flowers: {type: 'grass', exposure: .7, reach: .06}, oak: {type: 'leaf', exposure: .9, reach: .05}, shrub: {type: 'leaf', exposure: .5, reach: .03}, woods: {type: 'leaf', exposure: .6, reach: .04}}` (`reach` in metres at weight 1).
  - `lifeLayout(space = LAKESIDE_SPACE, dressing = LAKESIDE_DRESSING)` → frozen object, memoised per argument pair:
    - `wind`, `sway` as above.
    - `cottage: {rooms: {main: 'front-left', second: 'front-right'}, casement: {window: 'front-left', leaf: 'left', maxAngle: 1.2}, chimney: [x, y, z], lights: {main: [x, y, z], second: [x, y, z]}}` — each light .35 m out from its window's centre along the wall's outward normal.
    - `weather: {puddle: {center: [x, y], radius: [.55, .3], turn}, drips: [{id: 'drip-0', clump, top: [x, y, z], fall: 2, seed: 37}, {id: 'drip-1', clump, top, fall: 2, seed: 111}], shelter: {roof: {center, half: [hx, hy], yaw, height}, oak: {center: [x, y], radius, base, share: .35}}}` — puddle centre on the path polyline 2.5–4 m east of the arrival; drips under the two lowest oak clumps on the arrival side, `top` at the clump's underside; `roof.half` is the cabin's half size plus the eave and gable overhangs; `oak.radius` covers the clumps, `oak.base` is the lowest clump underside.
    - `ripples: {'shore-reflection': {center: [x, y], radius: 2}, 'open-water': {…}, 'near-water': {…}}`.
    - `bird: {length: .18, locations: {nest, 'oak-perch', 'oak-shelter', 'roof-perch'} each {point: [x, y, z], facing}, routes: {[id]: {from, to, points: [p0, p1, p2, p3], durationMs}}, forage: {points: [8 × [x, y, z]]}}` — `point` is where the feet rest; `routes` has exactly the keys of `LAKESIDE_BIRD.routes` with the same `durationMs`, reverse routes being the reversed points as in 2D; `forage.points[0]` and `[7]` are the nest, `[3]` and `[4]` the same spot on the ground on the bank.
    - `farBirds: {azimuth: [92°, 150°] in radians, elevation: [.14, .2], period: 135, crossing: 23}`.
  - `validLifeLayout(layout, space, dressing) → boolean`.
  - `sheltered(layout, [x, y, z]) → number` in [0, 1]: the share of rain that reaches the point (0 under the roof footprint below the roof, `oak.share` under the crown below `oak.base`… see test, 1 in the open).

- [ ] **Step 1: Write the failing tests** in `test/life-layout.test.js` (`const L = lifeLayout()`), asserting:
  - `validLifeLayout(L, S, D)` is true; a copy with a route duration changed, a missing ripple id, or a perch moved 1 m off its limb is invalid.
  - `Object.keys(L.bird.routes).sort()` deep-equals `Object.keys(LAKESIDE_BIRD.routes).sort()` and each `durationMs` is equal; `Object.keys(L.bird.locations)` equals the 2D location ids; `Object.keys(L.ripples)` equals the 2D ripple ids.
  - `nest`, `oak-perch` and `oak-shelter` each lie within .35 m of some `oakPlan` limb or trunk polyline; `roof-perch` equals `ridgePoint` at its `along` within .02 m.
  - The shelter is hidden from the arrival view: the horizontal segment from the arrival eye to `oak-shelter.point` passes within `space.oak.radius * .8` of the oak's axis before reaching the point; `nest` and `oak-perch` do not.
  - Every route sampled at 40 points (cubic Bézier) and the forage curve sampled at 80 (the Catmull-Rom of `birdPose`) stays above `terrainHeight + .25` except within .3 m of an endpoint or the forage ground spot, stays outside the oak collider circle below 3 m, and is above `roof.height` wherever inside the cabin collider box.
  - Each ripple centre has `shoreDistance < -(radius + 1)`, lies within ±45° of the arrival yaw as seen from the arrival position, and their bearings from the arrival increase in the order `shore-reflection`, `open-water`, `near-water`.
  - The puddle centre is within `dressing.pathHalfWidth` of the path polyline; both drips have `top[2] - fall >= terrainHeight - .05` and lie inside `shelter.oak.radius`.
  - `sheltered` returns 0 just outside the front door under the eave at 1.6 m, `oak.share` 1 m from the trunk at 1.6 m, 1 at the arrival position, and 1 ten metres above the roof.
  - `L.cottage.lights.main` is within .4 m of `openingCentre(S, D, 'window-front-left')` and outside the cabin collider's wall line; `L.cottage.chimney` equals `chimneyTop(S, D)`.
  - `lifeLayout()` called twice returns the same frozen object.
- [ ] **Step 2: Run** `node --test test/life-layout.test.js` — expect failure: module not found.
- [ ] **Step 3: Add the dressing helpers** with one test each in `test/dressing.test.js` (window centres are 1.45 m above the door threshold height for the front windows; `ridgePoint(…, 0)[2]` is the ground at the cabin plus `ridgeHeight` less the sag at mid-length; `chimneyTop` is `dressing.cabin.chimney.rise` above the ridge at `chimney.along`). Reuse the placement maths `public/space/scene/cabin.js` already uses for panels and the chimney; if that maths lives only in `cabin.js`, move it into the dressing module and have `cabin.js` call it, so drawn and anchored positions cannot differ.
- [ ] **Step 4: Implement `shared/lakeside-life.js`.** Anchors that sit on something are computed from `oakPlan`, the dressing helpers and the path, never typed as absolute coordinates. Place by these rules: `nest` in the fork where a limb on the arrival-facing side leaves the trunk; `oak-perch` 60% along an arrival-side limb; `oak-shelter` against the trunk on the side opposite the arrival, between 3 and 4.5 m up; `roof-perch` on the ridge toward the south gable. Ripples: start from `shore-reflection ≈ [24, -5.5]`, `open-water ≈ [30, -12]`, `near-water ≈ [14, -10]` and adjust until the tests pass.
- [ ] **Step 5: Run** `node --test test/life-layout.test.js test/dressing.test.js test/space-scene.test.js` — expect pass. Then `npm test && npm run check`.
- [ ] **Step 6: Commit** — "Give every living thing's id a place in the yard".

---

### Task 2: The life entry and its wiring into the view

**Files:**
- Create: `public/space/life/index.js`, `test/life.test.js`
- Modify: `public/space/space-view.js`, `test/space-view.test.js`, `package.json`

**Interfaces:**
- Consumes: `lifeLayout`; presenters (none yet — the entry takes a list).
- Produces:
  - `createLife(THREE, ctx, makers = PRESENTERS) → {update(frame), status, dispose()}`. `PRESENTERS` is an ordered object `{wind, cottage, smoke, rain, traces, ripples, bird, nest, farBirds}` of `create…` functions, filled in by later tasks (starts empty). `status[name]` is `'active' | 'idle' | 'failed'`. A maker or an `update` that throws marks that name `'failed'`, disposes it if it was built, logs one `console.warn`, and never runs it again.
  - `lifeFrame({snapshot, now, study, motion, motionSeconds, realSeconds, camera, conditions, fixture}) → frame` (adds `epoch`, `calendar`, `weather`).
  - `SpaceView`: `this.life`; `birdRenderer.valid` is `status.bird !== 'failed'`; `birdActive` is `status.bird === 'active'`; `cottageActive` is `status.cottage === 'active'`; `coincidenceActive` is `status.ripples === 'active'`. Under `?check`, `this.fixture` (default `null`) is passed through as `frame.fixture`; without `check` it is always `null`.

- [ ] **Step 1: Write the failing tests** in `test/life.test.js` with stub makers:
  - two makers, one whose `update` throws on its second call: after three `update` calls the thrower has run twice, the other three times, `status` is `{a: 'failed', b: 'active'}`, the thrower's `dispose` was called once.
  - a maker that throws while being built: `status` is `'failed'`, others still built.
  - `update` returning false gives `'idle'`.
  - `dispose()` disposes every live presenter once and a second call does nothing.
  - `lifeFrame` with `snapshot.world` lacking `cottage`, `bird`, `environment`, `coincidences` and `nest` returns a frame without throwing.
- [ ] **Step 2: Run** `node --test test/life.test.js` — expect failure.
- [ ] **Step 3: Implement `createLife` and `lifeFrame`.**
- [ ] **Step 4: Wire `SpaceView`:** build life in `build()` after the yard (`ctx.layout = lifeLayout(this.space, this.dressing)`), call `this.life.update(lifeFrame(…))` in `render()` after the light is applied and before drawing, dispose it in `releaseScene` (add `'life'` first in its list). Replace the four constant flags with getters reading `this.life?.status`.
- [ ] **Step 5: Extend `test/space-view.test.js`** only if it already constructs a view; otherwise the getters are covered by the browser check in Task 11. Run `npm test && npm run check`.
- [ ] **Step 6: Commit** — "Run the yard's living things behind one entry that survives any one of them failing".

---

### Task 3: Wind

**Files:**
- Modify: `shared/foliage.js`, `test/foliage.test.js`, `public/space/geometry.js`, `public/space/scene/cover.js`, `trees.js`, `cabin.js`, `test/space-scene.test.js`
- Create: `public/space/life/wind.js`

**Interfaces:**
- Consumes: `SWAY`, `WIND` (Task 1); `sampleWind`.
- Produces:
  - `foliageMotion(seconds, {type, exposure, maxDisplacement, random, delay}, seed = 941, windOverride = null) → {bend, flutter, lift, gust}` in `shared/foliage.js`: the body of `sampleFoliage` with `random` and `delay` as inputs. `sampleFoliage` becomes a call to it with `random = seedValue(seed, patch.id)` and `delay = x / 520 + y / 1800`.
  - `WIND_WRAP = 4096`; `windClock(motionSeconds, seed = 941) → {time, crest, broad, settle, strength}`: `time` is `motionSeconds mod WIND_WRAP`; `crest`, `broad`, `settle` are the 17.3 s, 31.7 s and 8.1 s phases (radians, in [0, 2π)) at zero delay with the same offsets `sampleFoliage` uses; `strength` is `clamp(sampleWind(motionSeconds) / .53)`.
  - `cardBatch().add(centre, right, up, cell, bottom, top, lit, flip, sway = null)`: `sway` is `{kind, random}`; the geometry gains attribute `sway` (vec4 per vertex: weight, random, reach, leaf flag 0/1). Weight is 0 with no `sway`; for leaf kinds .6 on the card's lower edge and 1 on its upper; reach and the flag come from `SWAY[kind]`.
  - Cover instances: geometry attribute `sway` on `crossedCards` (weight = the card's height coordinate 0–1) plus per-instance `swayKind` (vec3: random, reach, exposure).
  - `SWAY_UNIFORMS = {windClock: {value: Vector4(time, crest, broad, settle)}, windStrength: {value: 0}, windAlong: {value: Vector2(0, -1)}}` in `geometry.js`, one shared object referenced by every card material; `cardMaterial` and `coverMaterial` add the vertex displacement, in world space, along `windAlong` (bend + flutter) and up (lift), using gust delay `dot(worldPosition.xz in yard axes, windAlong) / WIND.gustSpeed`.
  - `createWind(THREE, ctx)` presenter: each frame sets the uniforms from `windClock(frame.motionSeconds)`; returns true.

- [ ] **Step 1: Write the failing tests** in `test/foliage.test.js`:
  - for each of the ten `LAKESIDE_FOLIAGE.patches` and seconds in `[0, 12.5, 1e3, 1e7 + .25]`, `foliageMotion(t, {type, exposure, maxDisplacement, random: <same hash>, delay: x/520 + y/1800})` deep-equals `sampleFoliage(t, patch)`. (Export `seedValue` for this.)
  - `windClock(1e7 + .25)`: all five values finite, `0 <= time < 4096`, phases in `[0, 2π)`, and `Math.sin(crest - TAU * d / 17.3)` equals the sine `sampleFoliage` uses for delay `d = 3` to 1e-6.
  - `foliageMotion` with `exposure: 0` returns bend, flutter and lift of 0.
- [ ] **Step 2: Run** `node --test test/foliage.test.js` — expect failure on the new tests, the existing ones still passing.
- [ ] **Step 3: Refactor `shared/foliage.js`** and add `windClock`. Run the whole file's tests: all pass.
- [ ] **Step 4: Add the scene test** in `test/space-scene.test.js`: after `buildScene`, the oak's `leaves`, the woods' `masses`, the grove's `grove-leaves` and each cover mesh have a `sway` attribute of item size 4 with finite values, weights in [0, 1], and at least one weight above .5; cover meshes also have `swayKind`; the cabin's roof dabs have weight 0 everywhere and its shrubs do not. Run — expect failure.
- [ ] **Step 5: Implement** the attribute in `cardBatch` and `crossedCards`, pass `{kind, random}` from `trees.js` (oak leaves `'oak'`; woods masses, grove leaves and undergrowth `'woods'`) and `cabin.js` (shrubs `'shrub'`; dabs none), and the per-instance `swayKind` in `cover.js` from `SWAY[kind]`. Add the shader displacement and bump both `customProgramCacheKey` strings. The shader formula is `foliageMotion`'s, with per-card periods taken from `random` and `windClock.time`.
- [ ] **Step 6: Implement `createWind`**, register it as `PRESENTERS.wind`.
- [ ] **Step 7: Run** `npm test && npm run check`. Start the server and look at `?space=1`: leaves and grass move gently, roots and trunks do not, and a gust can be seen crossing from north to south. Reduce amounts rather than leave anything restless.
- [ ] **Step 8: Commit** — "Let the wind move the oak, the grass and the reeds".

---

### Task 4: Cottage windows, light and casement

**Files:**
- Modify: `shared/lakeside-space-art.js`, `test/space-art.test.js`, `test/space-scene.test.js`, `scripts/space-painter/painter.js`, `public/space/art-loader.js`, `public/space/scene/cabin.js`, `public/space/scene/index.js`, `public/assets/lakeside-space-v1/` (new file and `export.json`), `ARTWORK.md`
- Create: `public/space/life/cottage.js`

**Interfaces:**
- Consumes: `layout.cottage`; `sampleCottage`, `cottageFixture`; `frame`.
- Produces:
  - `SPACE_ART.panels.windowLit = {file: 'window-lit.webp', width: 256, height: 256}`; painter slot `windowLit` (seed 61): the same frame and glazing bars as `window`, the glass a warm lamp-lit ochre, brighter toward the middle, bars dark against it. `artFiles().length` is 13; loaded art has `art.panels.windowLit`.
  - `cabin.setCottage({main, second, open})` on `buildCabin`'s result, re-exported as `yard.setCottage`: front windows each have their own material that mixes the dark and lit panel by the room's value (0–1) and emits the lit colour by that value (unaffected by scene light); the back window is untouched. The left leaf of `window-front-left` is a separate two-sided mesh `casement`, hinged on its outer vertical edge, rotated outward by `open * layout.cottage.casement.maxAngle`; the opening behind it shows the same dark-to-lit mix.
  - `cottagePose(frame) → {main, second, open} | null`: `frame.fixture?.cottagePose ?? (frame.study ? cottageFixture(frame.study) : sampleCottage(frame.snapshot.world.cottage, frame.now, {reducedMotion: !frame.motion}))`.
  - `createCottage(THREE, ctx)`: two `PointLight`s at `layout.cottage.lights`, colour `#ffb561`, `distance` 5, `decay` 2, always in the scene; intensity `room value × (1 − calendar.light) × 2.2`. Returns true when the pose is not null; with a null pose sets windows dark, casement shut, lights 0 and returns false.

- [ ] **Step 1: Write the failing tests:** `test/space-art.test.js` — `artFiles()` has 13 entries including slot `windowLit`, 256 × 256, no alpha. `test/space-scene.test.js` — update `stubArt` and the slot count; after `scene.setCottage({main: 1, second: .5, open: 1})` the `window-front-left` and `window-front-right` materials differ from each other and from `window-back`'s, the `casement` mesh exists and its rotation differs from the one after `setCottage({main: 0, second: 0, open: 0})`, and the all-round solidity test still passes with the casement open. Add `cottagePose` cases to `test/life.test.js`: a study gives `cottageFixture(study)`; `motion: false` mid-casement action gives `open` equal to the settled value; an invalid `world.cottage` gives `null`.
- [ ] **Step 2: Run** the three files — expect failure.
- [ ] **Step 3: Paint and export the panel:** add the painter slot, then `node scripts/prepare-space-assets.mjs --only windowLit` (needs the dev-only Playwright install, see `docs/space-validation/README.md`). Confirm only `window-lit.webp` and `export.json` changed and the bundle is under `budgetBytes`. Record it in `ARTWORK.md` under "Walkable yard, version 1".
- [ ] **Step 4: Implement** the cabin materials, casement and `setCottage`; the loader's panel; `createCottage`; register `PRESENTERS.cottage`.
- [ ] **Step 5: Run** `npm test && npm run check`. Look at the night study from the path and from beside the windows, and the dusk study; check the day study shows no glow. Measure the arrival frame as `scripts/check-space-browser.mjs` check 11 does: if it rose by more than 2 ms or the tier no longer settles on `full`, replace the two lights with a blended warm glow quad on the ground under each window and say so in the commit message.
- [ ] **Step 6: Commit** — "Light the cottage's rooms and swing its casement in the yard".

---

### Task 5: Hearth smoke

**Files:**
- Modify: `shared/cottage.js`, `test/cottage.test.js`, `shared/lakeside-life.js`, `test/life-layout.test.js`
- Create: `public/space/life/smoke.js`

**Interfaces:**
- Consumes: `smokePuffs(state, epoch, now)`; `layout.cottage.chimney`, `layout.wind.direction`.
- Produces:
  - Each puff from `smokePuffs` gains `age` (0–1); `x`, `y`, `r`, `alpha` are unchanged.
  - `SMOKE = {rise: 6, drift: .12, radius: [.25, 1.1], sway: .15}`; `smokePlace(puff, layout) → {position: [x, y, z], radius, alpha}`: starts at the chimney top, rises `rise × age`, moves `puff.x × drift` metres along the wind direction, wanders `sway × sin(age × 5)` across it, radius from `radius[0]` to `radius[1]` by age, alpha `puff.alpha`.
  - `createSmoke(THREE, ctx)`: 16 pooled viewer-facing soft round quads (alpha from a radial falloff in the fragment shader, blended, `depthWrite: false`), colour `rgb(209, 206, 188)` scaled by `.3 + .7 × calendar.light`, opacity `alpha × 2.5` capped at .3. Shows nothing and returns false when `frame.study`, `!frame.motion`, or the cottage state is invalid.

- [ ] **Step 1: Write the failing tests:** `test/cottage.test.js` — every puff has `age` in [0, 1) and `y === -age * 70`. `test/life-layout.test.js` — `smokePlace` for age 0 is the chimney top with radius .25; for age .5 and `x = 10` it is 3 m higher and 1.2 m further south (± the sway term); alpha passes through.
- [ ] **Step 2: Run** — expect failure. **Step 3: Implement** both functions and the presenter; register `PRESENTERS.smoke`.
- [ ] **Step 4: Run** `npm test && npm run check`. To see it, in the browser console under `?space=1&check` set a fixture snapshot whose cottage `hearth.on` is true (see Task 11's fixture helper, or temporarily force it) and confirm faint smoke leaves the chimney and drifts south.
- [ ] **Step 5: Commit** — "Raise the hearth's smoke from the chimney".

---

### Task 6: Rain

**Files:**
- Create: `public/space/life/rain.js`
- Modify: `test/life.test.js`

**Interfaces:**
- Consumes: `sheltered(layout, point)`, `layout.wind`, `frame.weather`, `frame.motionSeconds`, `frame.camera`.
- Produces:
  - `RAIN = {count: 900, radius: 9, height: 7, speed: 9, length: .45, slant: .35}`.
  - `rainDrop(index, seconds, eye, wind) → [x, y, z]` (pure, exported): a stable column per index within `radius` of the eye (hashed from the index and the eye's position snapped to a 3 m grid, so streaks do not travel with the walker), falling at `speed`, wrapped over `height`, displaced along the wind direction by `slant × wind × height fallen`.
  - `createRain(THREE, ctx)`: one `LineSegments` of `count` streaks, blended, colour `rgb(223, 230, 224)`, opacity `.10 + rain × .13`; draws `round(count × rain)` of them, each only if a hash of its index is below `sheltered(layout, itsPosition)`. Returns `weather.rain > .05`; hidden otherwise. Uses `frame.motionSeconds`, so it holds under pause and reduced motion.

- [ ] **Step 1: Write the failing tests** in `test/life.test.js`: `rainDrop` is finite; the same inputs give the same output; advancing `seconds` by .1 lowers z by .9 (mod the wrap); with `wind = 0` x and y do not change as it falls and with `wind = .5` it moves toward −y; every drop is within `radius` horizontally of the eye; moving the eye by .5 m within one grid cell leaves a drop's column unchanged.
- [ ] **Step 2: Run** — expect failure. **Step 3: Implement**; register `PRESENTERS.rain`.
- [ ] **Step 4: Run** `npm test && npm run check`. Under the rain study: streaks in the open, none seen when standing against the front wall under the eave looking out along the wall, fewer under the oak.
- [ ] **Step 5: Commit** — "Let rain fall in the yard, and keep the eaves dry".

---

### Task 7: Wet path, shore stones, puddle and drips

**Files:**
- Modify: `public/space/scene/ground.js`, `public/space/scene/index.js`, `test/space-scene.test.js`, `test/life.test.js`
- Create: `public/space/life/traces.js`

**Interfaces:**
- Consumes: `sampleSurface`, `surfaceFixture`, `dripPose`; `layout.weather`.
- Produces:
  - `ground.setWet({path, stone})` and `yard.setWet`: terrain material uniform `wet` (vec2). In the fragment shader the earth layer is multiplied by `mix(vec3(1), vec3(.62, .64, .7), path × earthWeight)` and the shore layer by `mix(vec3(1), vec3(.66, .68, .74), stone × shoreWeight)`.
  - `surfaceNow(frame) → surface | null`: `frame.fixture?.surface ?? (frame.study ? surfaceFixture(frame.study) : sampleSurface(frame.snapshot.world.environment, frame.epoch, frame.now))`.
  - `createTraces(THREE, ctx)`: calls `yard.setWet`; owns the puddle (a 14-sided irregular flat patch at `layout.weather.puddle`, 1.5 cm above the terrain at its centre, following the ground, sky-coloured like the lake via `yard`'s sky colours, blended with a soft edge, opacity `smooth(.08, .3, puddleStorage) × .85`, hidden at 0) and two drip streaks (blended short vertical lines; for each `layout.weather.drips` source, `dripPose(frame.motionSeconds, {x: 0, y: 0, fall: 1, seed}, canopyStorage, weather.rain)` gives progress as its `y`; the drop is at `top[2] − fall × y`, opacity its `alpha`). Drips are omitted when `!frame.motion`. With a null surface: `setWet({path: 0, stone: 0})`, no puddle, no drips, returns false.

- [ ] **Step 1: Write the failing tests:** `test/space-scene.test.js` — `scene.setWet({path: .5, stone: .25})` does not throw and a second scene build is unaffected. `test/life.test.js` — `surfaceNow` returns the fixture under a study, `null` for a snapshot 61 s stale, and a surface for a fresh one; `createTraces` (built with a stub `yard` recording `setWet` calls) calls `setWet({path: 0, stone: 0})` and returns false for the stale frame, and passes `pathWetness` and `stoneWetness` through for the rain fixture.
- [ ] **Step 2: Run** — expect failure. **Step 3: Implement**; register `PRESENTERS.traces`. `buildScene` passes its current sky colours to whoever needs them (expose `yard.sky` set by `setSky`).
- [ ] **Step 4: Run** `npm test && npm run check`. Compare the day and rain studies from the arrival: the path and shore stones darken, the puddle shows the sky.
- [ ] **Step 5: Commit** — "Darken the path and shore in rain, fill the puddle, and drip from the oak".

---

### Task 8: Ripples

**Files:**
- Modify: `public/space/scene/ground.js`, `public/space/scene/index.js`, `test/space-scene.test.js`, `test/life.test.js`
- Create: `public/space/life/ripples.js`

**Interfaces:**
- Consumes: `sampleCoincidence(state, now)` (its `locationId`, `age`, `variation`); `layout.ripples`.
- Produces:
  - Lake uniforms `ripple` (vec4: centre x, centre y in yard axes, radius, age; age ≤ 0 means none) and `rippleSeed` (float). The fragment shader ports `lakeRipple` from `public/ripple-shader.js` with `p = (worldXY − centre) / radius`: its `xy` offsets the stroke lookups (`arcs` and the slow layer) by `ripple.xy × .6`, and its `z` brightens the colour by `colour × z × 12`.
  - `lake.userData.setRipple(r | null)`, re-exported as `yard.setRipple`, `r = {center: [x, y], radius, age, variation}`.
  - `rippleNow(frame, layout) → r | null`: `null` under a study; otherwise from `frame.fixture?.coincidence ?? {state: frame.snapshot.world.coincidences, now: frame.now}` through `sampleCoincidence`, placed at `layout.ripples[locationId]`.
  - `createRipples(THREE, ctx)`: sets it each frame; returns whether one is showing.

Read `Painting.render` and `sky-renderer.js` first for how the 2D page treats a ripple under reduced motion and pause (the drawn frame's `rippleActive`), and mirror it; state what you found in the report.

- [ ] **Step 1: Write the failing tests** in `test/life.test.js`: with `coincidenceFixture(4, 'open-water')` `rippleNow` returns the `open-water` centre and radius with age .4; under a study, with an invalid state, or outside the action's time it returns `null`. In `test/space-scene.test.js`: `scene.setRipple({center: [30, -12], radius: 2, age: .4, variation: 1})` then `scene.setRipple(null)` do not throw and the uniform's age ends ≤ 0.
- [ ] **Step 2: Run** — expect failure. **Step 3: Implement**; register `PRESENTERS.ripples`.
- [ ] **Step 4: Run** `npm test && npm run check`. With a fixture, look from the shore and from the arrival: rings spread and fade at each of the three spots, in the painting's left-to-right order.
- [ ] **Step 5: Commit** — "Let a rising fish ring the lake".

---

### Task 9: Where the bird is, in 3D

**Files:**
- Modify: `shared/world.js`, `shared/bird.js`, `shared/lakeside-life.js`, `test/life-layout.test.js`
- Create: `test/bird-progress.test.js`

**Interfaces:**
- Consumes: `LAKESIDE_BIRD`, `layout.bird`.
- Produces:
  - `foragePick(t) → {pick, flying, carrying}` exported from `shared/world.js` and used by `birdPose` (its segment index and fraction come from `pick`).
  - `birdProgress(state, legacyAction, now, {reducedMotion = false} = {})` in `shared/bird.js` → `null` for an invalid state, else one of:
    - `{kind: 'settled', locationId, direction}`
    - `{kind: 'route', routeId, from, to, t, u, wingPhase}` with `u = t²(3 − 2t)` and the same `wingPhase` as `sampleBird`
    - `{kind: 'forage', t, pick, flying, carrying, wingPhase}` (construction mode with a running action and motion allowed; otherwise construction mode is `settled` at `nest`)
    `sampleBird` is rewritten to derive its result from `birdProgress`; its output is unchanged.
  - `birdPlace(progress, layout) → {position: [x, y, z], heading, climb, flying, carrying, wingPhase} | null` in `shared/lakeside-life.js`: settled → the location's `point` and `facing`; route → the cubic Bézier of `layout.bird.routes[routeId].points` at `u`, heading and climb from its tangent, `flying` when `0 < t < 1`; forage → the Catmull-Rom of `layout.bird.forage.points` at `pick` exactly as `birdPose` does in 2D, heading from the tangent (the settled facing while on the ground).

- [ ] **Step 1: Write the failing tests** in `test/bird-progress.test.js`:
  - For every fixture `birdFixture(name)` in `shared/bird.js` and for hand-built states (settled at each location; mid-flight on each of the six routes at t = 0, .25, .5, 1; a `call` action; construction with an action at t = .2, .5, .8; reduced motion in each), `sampleBird`'s result deep-equals the value it returned before the refactor. Capture the expected values first by running the cases against the unmodified function and writing them into the test as literals.
  - `birdProgress` kinds match those cases; `u` is `t²(3 − 2t)`.
  - `birdPlace`: settled at `oak-perch` is `layout.bird.locations['oak-perch'].point`; a route at `u = 0` and `u = 1` is its endpoints; at `u = .5` the heading points from `from` toward `to` within 90°; forage at `t = .5` is the ground spot with `flying` false; `null` in gives `null` out.
- [ ] **Step 2: Run** — expect failure. **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — every existing bird, world and sound test passes unmodified. `npm run check`.
- [ ] **Step 5: Commit** — "Say where along which path the bird is, once, for the painting and the yard alike".

---

### Task 10: The bird, its nest, and the distant birds

**Files:**
- Create: `public/space/life/bird.js`, `public/space/life/nest.js`, `public/space/life/far-birds.js`
- Modify: `test/life.test.js`, `public/space/sky-dome.js` only if the distant birds need a hook to sit on the dome

**Interfaces:**
- Consumes: `birdProgress`, `birdPlace`, `layout.bird`, `layout.farBirds`, `frame`.
- Produces:
  - `birdNow(frame, layout) → place | null`: `null` under a study (unless `frame.fixture?.bird`); from `frame.fixture?.bird ?? {state: frame.snapshot.world.bird, now: frame.now}` with `frame.snapshot.world.action` as the legacy action; `null` when the state is in construction mode and `calendar.elevation < -.12`.
  - `createBird(THREE, ctx)`: a `Group` named `bird`, `layout.bird.length` long, built from flat-shaded vertex-coloured pieces in the 2D bird's colours (`#4a4b3b` body, `#736750` breast, `#393e32` head, beak and tail, `#4b5041` wings, `#d9d5b7` eye, `#62573f` legs, `#a88e63` twig): body, head, beak, tail, two wings each hinged at the shoulder, legs (shown when not flying), twig (shown when carrying). Wings beat by `sin(wingPhase)` when flying and motion is allowed, and fold otherwise. Positioned and turned by `place`; lit by the yard's lights; hidden by depth only. Returns whether it is shown.
  - `createNest(THREE, ctx)`: a small bowl of `3 × nest.materials` twig strokes (thin tubes or cards, colours `#b2a079` and `#5f5940`, placement hashed by index as in `Painting.drawNest`) at `layout.bird.locations.nest.point`; rebuilt only when `nest.materials` changes; nothing when `world.nest` is missing.
  - `farBirdsNow(seconds, light, layout) → [{azimuth, elevation, wing}] | []` (pure, exported): the timing of `Painting.drawDistantBirds` (`cycle = floor(seconds / 135)`, visible for the first 23 s, three birds, `light >= .4`), sweeping `layout.farBirds.azimuth` over the crossing. `createFarBirds`: three small dark two-stroke shapes placed on the sky at those directions, 900 m out; omitted under a study and when `!frame.motion`.

- [ ] **Step 1: Write the failing tests** in `test/life.test.js`: `birdNow` is `null` under a study, returns the fixture's place under a study when a fixture is given, is `null` for construction mode at night and a place by day, and with `motion: false` mid-route returns the settled place; `farBirdsNow` returns three birds at `seconds = 5`, none at `seconds = 30`, none at `light = .3`, azimuths inside the layout's range and moving southward as seconds increase; `createBird` builds with stub `ctx`, `update` with a flying place and with a perched place leaves all matrices finite, and `dispose` disposes every geometry it made; `createNest` with `materials` 0, 5 and 12 has 0, 15 and 36 strokes.
- [ ] **Step 2: Run** — expect failure. **Step 3: Implement**; register `PRESENTERS.bird`, `.nest`, `.farBirds`.
- [ ] **Step 4: Run** `npm test && npm run check`. With fixtures, look at the bird on each perch from the arrival and from close below, walk round the oak to find it in shelter, and watch one flight on each route and one forage trip. It should read as a small painted bird, not a toy; wings should not strobe at 30 fps (if they do, halve the visible beat rate while keeping `wingPhase` as the input).
- [ ] **Step 5: Commit** — "Put the bird and its nest in the oak, and far birds over the lake".

---

### Task 11: Browser checks, review captures and documents

**Files:**
- Modify: `scripts/check-space-browser.mjs`, `scripts/capture-space-review.mjs`, `docs/space-validation/README.md`, `docs/space-validation/space-browser-results.json` (regenerated), `docs/space-validation/review/` (new captures), `README.md`, `ARTWORK.md`, `docs/superpowers/specs/2026-11-16-living-yard-design.md` (an "As built" note only where the build differs)

**Interfaces:**
- Consumes: `window.__space` (with `fixture`, `life.status`), the fixtures `cottageFixture`, `surfaceFixture`, `birdFixture`, `coincidenceFixture`, `lifeLayout`.
- Produces: the checks and captures below.

- [ ] **Step 1: Add checks** (each a numbered `check(...)` in the existing style; all take their sample points by projecting layout anchors through `__space.camera`, as check 13 does):
  - Replace check 13: under the night study from 2.5 m in front of the door, the middle of each front window is brighter than the wall beside it and warm (red above blue); from behind the cabin the back window is darker than the wall; under the day study the front windows are not brighter than the wall.
  - With `fixture.cottagePose = {main: 0, second: 0, open: 1}` the pixels over the casement differ from `open: 0`.
  - Two frames 1.5 s apart differ within the oak's crown; with reduced motion emulated they are identical there.
  - Under the rain study the mean luminance over the path ahead is lower than under the day study, `life.status.rain` is `'active'`, and a frame looking along the front wall from under the eave equals the same frame with the rain presenter's object hidden, within noise.
  - With `fixture.coincidence = coincidenceFixture(4, id)` for each id the lake differs at that spot from the frame without it; `coincidenceActive` is true.
  - With `fixture.bird` at each of the four places and mid-way on one route, hiding the `bird` group changes pixels at its projected place; from the arrival pose the bird at `oak-shelter` changes none, and from behind the oak it does; under a study with no fixture `life.status.bird` is `'idle'`.
  - With a presenter stubbed to throw, the yard still draws and the others report `'active'` or `'idle'`.
  - The default page still requests nothing from the yard (existing check 1 unchanged and passing).
  - Frame cost per tier recorded as before; the left-alone tier still settles on `full`.
- [ ] **Step 2: Run** the check against a server on a throwaway database (commands in `docs/space-validation/README.md`): expect every check to pass with no page errors. Fix what fails in the code, not the check.
- [ ] **Step 3: Add review captures** to `scripts/capture-space-review.mjs` (`--life`): lit windows at night from the path and from beside them, the casement open by day, smoke, rain from under the eave, the wet path and puddle, each ripple spot, the bird at each place (the shelter from behind the oak), one mid-flight frame, the nest at 5 and at 12 strands. Run it on `full`; save under `docs/space-validation/review/` as JPEG quality 90.
- [ ] **Step 4: Update the documents:** `docs/space-validation/README.md` (what phase 3 added, the new checks renumbered, frame cost before and after, what was not measured, what still looks weakest among the living things); `README.md`'s "Walking the yard (preview)" section; `ARTWORK.md` if not done in Task 4.
- [ ] **Step 5: Run** `npm test && npm run check` and the browser check once more.
- [ ] **Step 6: Commit** — "Check the yard's living things in a browser and gather them for review".
