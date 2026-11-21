# Cabin Interior Part 3 (Light) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?interior=1`, the cabin's rooms take the sky's light through their windows by day and their lamps' and fire's light after dusk, from a stone fireplace and a lamp fitting in every room, with no light sources and no room ever dark.

**Architecture:** Light is painted in. When the interior is built every vertex is given four fixed weights (day, lamp, fire, room index) by one pure function of the blueprint; each frame a second pure function of the shared world state and the clock produces a handful of dials (daylight colour, night fill, a level per room, the fire). One small material patch sums dials times weights in the vertex shader and multiplies the surface's painted colour by it. The interior scene loses its real light. The fireplace's flames and embers and the fittings' glass are emitted with an added halo, as the path lights are.

**Tech Stack:** Plain ES modules, three.js 0.170 (vendored at `public/assets/vendor/three-0.170.0.module.js`, handed in), `node --test`, the Playwright script `scripts/check-space-browser.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-20-cabin-interior-part-3-light-design.md` (part 3 of `docs/superpowers/specs/2026-11-17-cabin-interior-design.md`; read both, and the part 2 design's "As built" section)

## Global Constraints

- Everything new is behind `?interior=1`. Without it nothing a visitor sees changes; every existing test and every yard capture stays as it is, and the yard-unchanged browser check (49) keeps passing with all differences 0.
- No server, world-state or persisted-state change. No new art files: `artFiles().length` is unchanged.
- Every lamp, flame and ember follows shared state and the clock only, the same for every visitor at the same moment. Nothing depends on where a visitor stands or what they did.
- No light sources in the interior scene: no `Light` objects of any kind. The cost of a frame does not grow with the number of rooms lit.
- A point takes lamp light only from fittings of its own room, and daylight and firelight only from panes and the fire's mouth it can see past the interior walls.
- No lamp or fire changes in one frame: every change fades (about 2 s for lamps, about 20 s for the fire's rise). Under reduced motion nothing flickers or sways.
- *Dark* is `pathLightLevel(calendar)` (`shared/path-lights.js`). The house is *awake* while `rooms.main` or `rooms.second` is lit.
- With every lamp out at midnight under full overcast, no standable spot is dark (Task 3's floor).
- If the lit surfaces cannot be set up, the interior keeps its present flat light and carries on, with one warning; nothing is thrown per frame.
- Pure modules live in `shared/`, take no three.js, and have Node tests. Every new `.js` file is added to the `check` script in `package.json`.
- Interior frame, metres: `a` 0–18, `d` 0–12, z up from the ground floor; three x = a, y = up, z = −d (`toThree`).
- Speed: a frame in the living room facing its window costs at most 1.1 times a yard frame, by day and under the `night` study, measured as check 50 measures it.
- Strengths, falloffs and colours given below are starting values to tune by eye against the captures; tests refer to the exported constants, never to copies of their numbers.
- Commit after each task, on a feature branch (not `main`), with the repository's attribution line.

## Review Focus

- A visitor who arrives hours after dusk must find the other rooms' lamps already lit, not coming on in sequence from their arrival (Task 3 test with `now` far past the wake time).
- A world whose cottage state is missing or invalid must still give a lit, findable house: night fill and the hall and landing lamps, other lamps and fire out, no throw (Task 3 test).
- A remembered place inside the chimney breast, on either floor, must fall back to the arrival pose (Task 1 test).
- Reduced motion switched on mid-visit must still the fire's flicker and the flames' sway on the next frame without changing how bright the room is on average (Task 3 and Task 5 tests).
- A room lit beside a dark one must not brighten the dark room's side of their shared wall, including inside a doorway's reveal (Task 2 test).

---

### Task 1: The fireplace, the fittings and solid obstacles in the blueprint

**Files:**
- Modify: `shared/lakeside-interior.js`, `shared/interior.js`
- Test: `test/interior.test.js`, `test/walker.test.js`, `test/place-memory.test.js`

**Interfaces:**
- Produces, on `LAKESIDE_INTERIOR`:
  - `fireplace: {a: 0, d: 3.5, breast: {width: 2, depth: .5}, mouth: {width: 1.1, height: .9}, slab: .5, mantel: 1.25, upper: {width: 1.2, depth: .4}}` (`mantel` is the shelf's height above the floor);
  - `obstacles: [{floor: 0, a: [0, .5], d: [2.5, 4.5]}, {floor: 1, a: [0, .4], d: [2.9, 4.1]}]` (the two breasts);
  - `fittings`, one per room, `{room, kind: 'hanging' | 'wall', at: [a, d, z]}` where `at` is the glass's centre and z is above the ground floor:

    | room | kind | at |
    |---|---|---|
    | living | hanging | [3.8, 3.5, 2.15] |
    | study | hanging | [14.5, 2, 2.15] |
    | kitchen | hanging | [4.75, 9.5, 2.15] |
    | dining | hanging | [9, 9.5, 2.15] |
    | master | hanging | [14.5, 9.5, 2.15] |
    | hall | wall | [10.2, .2, 1.8] |
    | passage | wall | [12.5, 4.2, 1.8] |
    | bath-ground | wall | [16, 4.2, 1.8] |
    | laundry | wall | [.2, 8.25, 1.8] |
    | pantry | wall | [.2, 10.75, 1.8] |
    | bedroom-2 | hanging | [3.5, 5, 5.15] |
    | bedroom-3 | hanging | [14.5, 5, 5.15] |
    | sky-room | hanging | [5.8, 8, 5.15] |
    | nook | hanging | [9, 9.5, 5.15] |
    | landing | wall | [8.2, .2, 4.5] |
    | bath-upper | wall | [13, 11.8, 4.5] |
    | box-room | wall | [17.8, 8.25, 4.8] |
    | linen | wall | [17.8, 10.75, 4.6] |

  - `lightSeed: 20261120`.
- `floorArea(I, floor, p)` returns false within `eyeClear` of any obstacle rectangle of that floor.
- `validInterior(I)` additionally requires: each obstacle inside one room of its floor and leaving every opening of that room reachable (the existing ground-floor flood, and the same flood on floor 1 from the stair's top); exactly one fitting per room, its `at` inside its room's rectangle; a hanging fitting's glass at least 2.0 m above its floor and at least 0.3 m below the ceiling there (`ceilingHeight`), and not under a roof window's rectangle; a wall fitting within 0.3 m of one of its room's wall lines and between 1.4 and 1.9 m above its floor; no fitting inside an obstacle.

A fitting may be moved up to 0.5 m from the table if a rule above or the built geometry demands it; say so in the report.

- [ ] **Step 1: Write the failing tests:**

```js
// interior.test.js
test('the blueprint has a fireplace, one fitting for every room, and is still valid', …)       // validInterior(I); I.fittings.length === I.rooms.length; every room id appears once
test('the chimney breasts are solid on both floors and the hearth slab is not', …)              // floorArea(I, 0, [.3, 3.5]) false; [.5 + eyeClear − .01, 3.5] false; [1.2, 3.5] true (on the slab's reach); floorArea(I, 1, [.2, 3.5]) false; [1, 3.5] true
test('a hanging lamp that a head would meet, or one under a roof window, is invalid', …)        // living fitting z 1.9 → false; bedroom-2 fitting moved to [3.5, 2.7, …] → false
test('a wall lamp away from its room's walls, a fitting in the wrong room, or a room without one is invalid', …)
test('an obstacle that shuts a room off is invalid', …)                                          // an obstacle across the hall–living opening → false
// walker.test.js
test('holding W into the chimney breast from any side never enters it', …)                      // floor 0 from [2, 3.5] heading −a, from [.3, 1.5] heading +d, from [.3, 5.5] heading −d; floor 1 likewise
// place-memory.test.js
test('a remembered place inside a chimney breast falls back to the arrival pose', …)            // floor 0 [.25, 3.5] and floor 1 [.2, 3.5]
```

- [ ] **Step 2: Run** `node --test test/interior.test.js test/walker.test.js test/place-memory.test.js`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check && npm test`. Expected: PASS, every existing test included.
- [ ] **Step 5: Commit** — "Give the cabin a fireplace, a lamp for every room and solid chimney breasts".

### Task 2: The light a point takes

**Files:**
- Create: `shared/interior-light.js`
- Test: `test/interior-light.test.js`
- Modify: `package.json` (`check` script)

**Interfaces:**
- Consumes: the blueprint (Task 1); `viewOpenings` panes (`centre`, `across`, `up`, `outward`, `half`, `floor`, `room`, `kind`) from `shared/window-views.js`; `wallSegments`, `roomAt` from `shared/interior.js`.
- Produces:
  - `createLightField(interior, openings) → {weigh(floor, point, normal) → {day, lamp, fire, room}, roomIndex(id) → number}`. `point` and `normal` are `[a, d, z]` in the interior frame, `normal` a unit vector out of the surface into the room; `day`, `lamp`, `fire` are 0–1; `room` is the index in `interior.rooms` of the room the surface belongs to (the room holding the point moved 0.05 m along its normal; −1 if none). Built once per interior: it caches each floor's hiding wall runs.
  - `LIGHT = {day: {reach: 6, borrow: .35, door: .5, floor: .12}, lamp: {reach: 5, floor: .15}, fire: {reach: 6}}` (exported, frozen): starting values.
- Rules (the design's "The light a surface takes"):
  - **Clear line:** a plan line between two points on a floor is clear when it crosses no solid interior wall run strictly inside both (the same test `inSight` uses, including the stair's top end; the flight's open side and the door leaf do not block light). Export the helper `window-views.js` already has for this rather than writing a second one.
  - **day:** for each pane on the point's floor whose plan line from the point to one of three targets (the pane's centre and its two quarter points across) is clear, a share `facing × falloff`, where `falloff = 1 / (1 + (dist / reach × 3)²)` with `dist` the 3D distance to the nearest clear target and `facing = max(0, n · toPane) × .7 + .3`. The door's pane counts only for points whose room is `hall`, times `door`. Shares are summed and capped at 1. A point that sees no pane takes `borrow` times the day weight at the middle of the nearest opening of its room (by plan distance) whose other room has a pane, judged from that opening's middle at 1.5 m height facing up; if no such opening, `floor`. Every point's day weight is at least `floor`.
  - **lamp:** from the fitting of the point's own room only: `max(lamp.floor, (max(0, n · toLamp) × .6 + .4) / (1 + (dist / reach × 3)²))`. A point with `room` −1 takes 0.
  - **fire:** 0 on floor 1. On floor 0, from the mouth's centre (`[fireplace.breast.depth, fireplace.d, fireplace.mouth.height / 2]`), if the plan line from the point to it is clear: `(max(0, n · toFire) × .7 + .3) / (1 + (dist / reach × 3)²)`; else 0.

- [ ] **Step 1: Write the failing tests:**

```js
test('a wall beside a window is brighter by day than the far wall of the same room', …)        // living: floor point [4.2, .6] > [4.2, 6.5], both facing up
test('a point takes no daylight from a window behind a wall', …)                                // the master bedroom's floor (windowless): day equals the borrowed share, well under the dining room's by its window
test('a windowless room is dimmer than its neighbour but not dark', …)                          // master centre day ≥ LIGHT.day.floor and < dining centre day
test('the front door lends daylight to the hall only, at half strength', …)
test('a lamp lights its own room and not the far side of its walls', …)                         // kitchen fitting: kitchen wall face at a = 7 − wall/2 facing −a has lamp > .3; the dining face of the same wall (a = 7 + wall/2, facing +a) takes the dining lamp only: equal to weigh computed with the kitchen fitting removed
test('inside a doorway each face takes the lamp of the room it faces', …)
test('firelight reaches the hall through the wide opening and nothing behind the wall beside it', …)   // hall point [8, 3.5] fire > 0; hall point [8, 6.5] fire === 0; kitchen [3, 8] fire === 0; any floor-1 point 0
test('every weight is between 0 and 1 and the room index names the room the surface faces', …)   // sweep of floor, wall and ceiling points on both floors
test('weights are the same on every call', …)
```

- [ ] **Step 2: Run** `node --test test/interior-light.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `shared/interior-light.js`.
- [ ] **Step 4:** Add it to `check`; run `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Work out the light each point of the cabin takes from its windows, its lamp and the fire".

### Task 3: The dials

**Files:**
- Modify: `shared/interior-light.js`
- Test: `test/interior-light.test.js`

**Interfaces:**
- Consumes: `pathLightLevel(calendar)` (`shared/path-lights.js`); the cottage state (`rooms`, `lastLightAt`, `hearth`), `sampleCottage`, `cottageFixture`, `validCottageState` (`shared/cottage.js`); `floorArea` (`shared/interior.js`); Task 2's field.
- Produces:
  - `DIALS` (exported, frozen): `{fill: [.10, .13, .22], warm: [1, .71, .38], fireWarm: [1, .55, .22], day: 1.15, lamp: 1.1, fire: .9, night: .35, hallLow: .35, fade: 2000, delay: [5000, 90000], threshold: [.3, .9], fireRise: 20000, emberFall: 1800000, flicker: .06, floor: .07}`. Colours are linear.
  - `houseAwake(cottage) → {on: boolean, since: number}`: awake while `rooms.main || rooms.second`; `since` is the earliest `lastLightAt` among the lights now lit, or, asleep, the later of the two `lastLightAt`. An invalid state is `{on: false, since: −Infinity}`.
  - `roomLamps(interior, {dark, pose, awake, now, settled = false}) → number[]`, one level 0–1 per room in `interior.rooms` order: `living` is `pose.main`; `study` is `pose.second`; `hall` and `landing` are `dark × (hallLow + (1 − hallLow) × wake)`; every other room is `gate × wake`, where `gate` rises smoothly from 0 to 1 as `dark` passes that room's threshold (a 0.1-wide ramp starting at the threshold, which is fixed per room from `interior.lightSeed` within `threshold`), and `wake` is 0–1: the fade (over `fade` ms) that starts `delay_r` after `awake.since`, toward 1 if `awake.on` and toward 0 if not, where `delay_r` is fixed per room from the seed within `delay`. For hall and landing `delay_r` is 0. `settled` takes every delay and fade as finished.
  - `fireLevel(hearth, now, {settled = false}) → {fire, embers}`, each 0–1: `fire` rises linearly over `fireRise` from `hearth.since` while `hearth.on`, else 0; `embers` is 1 while the fire burns, and after it goes out falls linearly to 0 over `emberFall` from `lastBurn.end`; 0 with no `lastBurn`. Unreadable hearth: both 0.
  - `flicker(seconds, motion) → number` near 1: `1 + DIALS.flicker × (a sum of three sines of the world's seconds)`, exactly 1 without `motion`.
  - `interiorDials({interior, calendar, weather, sky, cottage, pose, now, seconds, motion, study}) → {day: [r, g, b], fill: [r, g, b], lamps: number[], fire: number, embers: number, doorway: number}`:
    - `day` = the sky's colour that frame (the mean of `sky.zenith` and `sky.horizon`, converted from display to linear, normalised to a brightest channel of 1) times `DIALS.day × clamp(calendar.light) × (1 − .35 × overcast)`, with `overcast` as `lightLevels` in `public/space/space-view.js` takes it (move that helper to `shared/` and use it from both);
    - `fill` = `DIALS.fill × DIALS.night × (1 − .7 × clamp(calendar.light))`, never less than `DIALS.fill × DIALS.night × .3`;
    - `lamps` = `roomLamps(…) × DIALS.lamp`; `fire` = `fireLevel(…).fire × DIALS.fire × flicker(seconds, motion)`; `embers` as given; `doorway` = the hall's lamp level (0–1, before `DIALS.lamp`);
    - with `study` set: `pose` is `cottageFixture(study)`, awake if it lights either room, `settled` true, and the fire burns (`fire` 1, `embers` 1) for `night` and `dusk` and is cold otherwise.
  - `lightAt(field, dials, floor, point, normal) → [r, g, b]`: `day × w.day + fill + warm × lamps[w.room] × w.lamp + fireWarm × fire × w.fire` (the sum the shader computes; Task 4 mirrors it, and part 4 will light furniture with it).

- [ ] **Step 1: Write the failing tests:**

```js
test('the house wakes at the first light and sleeps at the last; a second light does not wake it again', …)
test('the living room and the study follow the world's two lights, with their fades', …)
test('the hall and landing burn low from dusk to dawn and fully while the house is awake', …)       // dark 1, asleep long ago → hallLow; awake long ago → 1; dark 0 → 0
test('the other rooms need the dark and a waking house, each after its own delay', …)               // awake since t0: at t0 + 4 s all 0; at t0 + 95 s all 1; in between they differ; each room's delay within DIALS.delay
test('a visitor arriving hours after the house woke finds every room already lit', …)               // now = since + 3 h → all 1, with no dependence on any earlier call
test('each room answers the dusk at its own point', …)                                              // dark .25 → all other rooms 0; dark 1 → 1; thresholds within DIALS.threshold and not all equal
test('when the house sleeps the rooms go out apart, and the hall falls back to low', …)
test('the delays and thresholds are the same on every call and for every visitor', …)               // two fresh calls deep-equal
test('the fire rises over twenty seconds, and its embers die away over half an hour', …)
test('a hearth that never burned is cold; an unreadable one is cold', …)
test('the fire flickers by a few per cent, and not at all under reduced motion', …)                 // |flicker − 1| ≤ DIALS.flicker over 1000 samples, not constant; motion false → exactly 1; the mean over a minute within 1% of 1
test('daylight follows the sky: strong at noon, dim under overcast, gone at night', …)
test('a study shows the settled picture, with the fire lit at night and dusk', …)
test('a world with no readable cottage still lights the way: fill and the hall and landing lamps', …)   // cottage null → no throw; hall and landing levels follow dark at hallLow; others 0; fire 0
test('no standable spot is dark at midnight under full overcast with every lamp out', …)
  // dials for calendar.light 0, dark 1, asleep long ago, overcast 1, hearth cold; for every standable point on a 0.4 m grid on both floors,
  // the brightest channel of lightAt(field, dials, floor, [a, d, base], [0, 0, 1]) (the floor there) is at least DIALS.floor, and the same for a wall point at 1.5 m facing it
```

- [ ] **Step 2: Run** the test file. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Turn the world's lights, hearth and dusk into the cabin's lamps and fire".

### Task 4: Surfaces lit by their weights

**Files:**
- Create: `public/space/interior/light.js`
- Modify: `public/space/interior/index.js`, `public/space/geometry.js` (only if `mergeGeometries` drops attributes it does not know)
- Test: `test/interior-scene.test.js`, `test/interior-lit.test.js`
- Modify: `package.json` (`check` script)

**Interfaces:**
- Consumes: `createLightField` (Task 2), `DIALS` and the dials' shape (Task 3).
- Produces:
  - `createInteriorLight(THREE, {rooms}) → {material(options) → THREE.Material, set(dials), uniforms, dispose()}`. `material({map, side, stencil…})` is a `MeshBasicMaterial` with `vertexColors: true`, patched with `onBeforeCompile` to read a `light` vertex attribute (vec4: day, lamp, fire, room index) and multiply the surface's colour by a varying `vLight = day × aLight.x + fill + warm × lamps[int(aLight.w)] × aLight.y + fireWarm × fire × aLight.z`, computed in the vertex shader; a room index of −1 takes no lamp. All materials share one set of uniforms (`day`, `fill`, `lamps[rooms]`, `fire`, `warm`, `fireWarm`). `set(dials)` copies a Task 3 dials object into them.
  - `buildInterior(THREE, {interior, art, openings})` now: gives every surface vertex a `light` attribute from `field.weigh(floor, point, normal)` (the floor is 1 for points at or above `interior.floorRise`, except the stair, whose vertices take the floor of the storey their height is nearer); draws floors, ceilings, walls, stair, frames and both leaves with `createInteriorLight`'s materials (the casement leaf keeping its stencil settings and render order); has no `Light` object in its scene; and returns, besides what it returns today, `setLight(dials)`, `field` and `lit: boolean`.
  - Plaster's present pale emissive base becomes part of its vertex tint (so plaster stays paler than boards); tune the tints so the living room at noon under a clear sky reads about as bright as it does today.
  - Failure: if creating the lit materials throws, `buildInterior` warns once (`"The cabin's light could not be set up; its rooms stay evenly lit."`), builds with the present Lambert materials and one `HemisphereLight` exactly as today, and returns `lit: false` with a `setLight` that does nothing.

- [ ] **Step 1: Write the failing tests:**

```js
// interior-lit.test.js
test('the lit material sums the dials by a vertex's weights, as lightAt does', …)        // evaluate the patch's formula in JS from the uniforms set by set(dials) for sample weights; equals lightAt within 1e-6
test('every lit material shares one set of uniforms, and set(dials) fills them', …)
test('the shader patch declares the light attribute and a lamp array sized to the rooms', …)   // run onBeforeCompile on a stub shader object; vertexShader contains the attribute, `lamps[18]`, and the varying; fragmentShader multiplies diffuse by it
// interior-scene.test.js
test('every surface vertex carries its light weights, and they are the field's', …)      // floors, ceilings, walls, stair, frames, casement, door-leaf: attribute `light` present, count equals position count, every value finite, day/lamp/fire in 0–1; ten sampled floor vertices equal field.weigh there
test('the interior holds no light source', …)                                              // scene.traverse finds no isLight
test('setLight moves the shared uniforms and nothing else', …)
test('if the lit materials cannot be made the rooms stay evenly lit, with one warning', …) // a THREE stub whose MeshBasicMaterial throws: lit false, one HemisphereLight, existing named parts built, setLight a no-op
```

Update the existing shell test that asserts a `HemisphereLight` is present.

- [ ] **Step 2: Run** `node --test test/interior-lit.test.js test/interior-scene.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Read how three 0.170's `MeshBasicMaterial` shader names its diffuse colour and where vertex colour is applied before writing the patch.
- [ ] **Step 4:** Add the new file to `check`; run `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Light the cabin's surfaces by their painted-in weights".

### Task 5: The fireplace

**Files:**
- Create: `public/space/interior/fireplace.js`
- Modify: `public/space/interior/index.js`
- Test: `test/interior-fireplace.test.js`
- Modify: `package.json` (`check` script)

**Interfaces:**
- Consumes: `interior.fireplace` (Task 1); `field.weigh`; `createInteriorLight`'s materials; `art.surfaces.stone` (the cabin's wall stone) and `art.surfaces.hills`; the halo material in `public/space/scene/lights.js` (export a factory from there and reuse it; do not copy the shader).
- Produces:
  - `buildFireplace(THREE, {interior, art, light, field}) → {object: THREE.Group, setFire({fire, embers, seconds, motion}), dispose()}`. In the group, named meshes: `breast` (stone, 2.0 × 0.5 m, floor to ceiling, with the mouth 1.1 × 0.9 m cut into it 0.35 m deep and a dark stone back), `slab` (stone, the breast's width, reaching `slab` further into the room, 0.05 m high), `mantel` (timber shelf 2.2 m wide, 0.2 m deep, 0.08 m thick, its top at `mantel`), `breast-upper` (plain, plaster, 1.2 × 0.4 m, floor 1 to its ceiling), `embers` (a low bed in the mouth), `flames` (three to five upright cards in the mouth) and `fire-glow` (a halo at the mouth). Breast, slab, mantel and upper breast carry `light` weights and use the lit materials; embers, flames and the glow are emitted (`MeshBasicMaterial`, additive for the glow).
  - `setFire`: flames visible only while `fire > .02`, their height and opacity following `fire`, swaying by the world's `seconds` (not at all without `motion`); the embers' colour from dark to orange by `embers`; the glow's opacity following `fire`, or a faint glow by `embers` when the fire is out.
  - `buildInterior` adds the group to its scene and returns `setFire`. The living room's gable wall and bedroom 2's keep their plaster behind the breasts (no hole is cut).

- [ ] **Step 1: Write the failing tests:**

```js
test('the fireplace stands on the living room's gable wall where the blueprint puts it', …)   // breast box a 0–.5, d 2.5–4.5, z 0–2.7; slab to a = 1.0; mantel top at 1.25; upper breast a 0–.4, d 2.9–4.1, z 3.0–ceiling
test('the breasts fill the blueprint's obstacles and nothing of the fireplace stands beyond them where a visitor walks', …)   // every vertex above 0.1 m and below 2.0 m lies within an obstacle rectangle grown by 0.12 m (the mantel's overhang), or within the slab's height
test('the flames show only while the fire burns, and stand still under reduced motion', …)    // setFire fire 0 → flames invisible; fire 1 → visible; two different seconds with motion → different card positions; without motion → identical
test('the embers glow after the fire and are dark when cold', …)
test('nothing in the fireplace is a light source, and its stone takes the room's light', …)   // no isLight; breast has a `light` attribute with fire weight > 0 on the hearth slab's top
```

- [ ] **Step 2: Run** `node --test test/interior-fireplace.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Add the file to `check`; run `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Build the living room's stone fireplace, its fire and its embers".

### Task 6: The lamp fittings

**Files:**
- Create: `public/space/interior/fittings.js`
- Modify: `public/space/interior/index.js`
- Test: `test/interior-fittings.test.js`
- Modify: `package.json` (`check` script)

**Interfaces:**
- Consumes: `interior.fittings` (Task 1); `field.weigh`; the lit materials; the halo factory (Task 5).
- Produces:
  - `buildFittings(THREE, {interior, light, field}) → {object: THREE.Group, setLamps(levels: number[]), dispose()}`. One group per fitting named `lamp-<room>`: a hanging lamp is a thin dark rod from the ceiling above `at` down to a small shade over a glass centred on `at`; a wall lamp is a short dark bracket from the nearest wall line to a glass centred on `at`. Ironwork carries `light` weights and uses the lit materials. All glasses are one `InstancedMesh` (or one merged mesh with a per-vertex room index) drawn with an emitted material whose colour runs from pale glass by day to warm and bright by its room's level; all halos likewise, their opacity following the level. No light sources.
  - `setLamps(levels)` takes the dials' `lamps` array (per room, in `interior.rooms` order).
  - `buildInterior` adds the group and calls `setLamps` from `setLight(dials)`.

- [ ] **Step 1: Write the failing tests:**

```js
test('every room has its lamp where the blueprint puts it', …)                 // 18 groups; each glass centre equals its fitting's `at` (in three's axes)
test('a hanging lamp hangs from the ceiling above it and a wall lamp is bracketed to its wall', …)   // rod top at the ceiling height there; bracket reaches a wall line of its room
test('no part of a fitting hangs lower than 1.95 m over a floor a visitor can stand on', …)          // hanging fittings' lowest vertex; wall fittings stand out at most 0.25 m from their wall
test('a glass is pale when out and warm when lit, by its own room's level only', …)                 // setLamps with one room at 1: only that glass and halo change
test('the fittings hold no light source', …)
```

- [ ] **Step 2: Run** `node --test test/interior-fittings.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Add the file to `check`; run `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Hang a lamp in every room of the cabin".

### Task 7: The world drives the light

**Files:**
- Modify: `public/space/space-view.js`, `public/space/scene/cabin.js`, `public/space/scene/index.js`, `public/scene-description.js`, `public/app.js`
- Test: `test/space-view.test.js`, `test/space-scene.test.js`, `test/scene-description.test.js` (create if the description has no test file; otherwise the file that tests `sceneText`)

**Interfaces:**
- Consumes: `interiorDials` (Task 3); `inside.setLight`, `inside.setFire` (Tasks 4–6).
- Produces:
  - `SpaceView.render`: every frame with the interior switched on, computes `dials = interiorDials({interior, calendar, weather, sky: {zenith, horizon}, cottage: snapshot.world.cottage, pose, now, seconds: motionSeconds, motion, study})` once (where `pose` is the cottage pose the life already samples, or a check fixture's), and calls `yard.setDoorway(dials.doorway)`; indoors also `inside.setLight(dials)` and `inside.setFire({fire, embers, seconds: motionSeconds, motion})`. With `?check`, `this.fixture.hearth` (`{fire, embers}`) and `this.fixture.lamps` (a per-room array) override the dials, for captures. `SpaceView.lit` → `{room, lamp: boolean, fire: 'burning' | 'embers' | 'cold' | null}` for the room the visitor is in (`fire` null outside the living room; `lamp` true when that room's level is above 0.5), or null in the yard.
  - `yard.setDoorway(level)`: the doorway's flat tone (`cabin.js`) runs from its present dark `DOORWAY` to a warm dim tone (`[.42, .26, .12]` linear) by `level`. Without the interior it is never called and the doorway is as today.
  - `sceneText(…, {…, room, lit})`: indoors, after the room, one short sentence from `lit`: the lamp lit or not, and in the living room the fire burning, its embers glowing, or the hearth cold. `SceneDescriber.rendered` also updates when `lit` changes. `app.js` passes `painter.lit`.
  - A dial computation that throws is treated like a failed light set-up: one warning, `setLight` no longer called, the rooms keep their last light.

- [ ] **Step 1: Write the failing tests:**

```js
// space-view.test.js (the existing rig)
test('indoors each frame the rooms are given the dials and the fire its level', …)
test('at night with the main room lit, the living room's lamp dial is up and the description says so', …)
test('the doorway warms with the hall's lamp, and is never touched without the interior', …)
test('a check fixture can set the hearth and the lamps', …)
test('under reduced motion the fire's dial does not change from frame to frame', …)
test('a dial computation that throws warns once and leaves the rooms as they were', …)
test('outdoors with the interior on, the rooms are not touched but the doorway is', …)
// space-scene.test.js
test('the doorway's tone runs from dark to warm', …)
// scene description
test('indoors the description says what is lit in the room', …)                 // lamp lit / not; living room: fire burning, embers, cold
test('the description is refreshed when a lamp or the fire changes', …)
```

- [ ] **Step 2: Run** those files. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Look at it.** With a throwaway Playwright script (as `scripts/check-space-browser.mjs` launches Chromium; server on a spare port with a temporary database; captures to a temporary directory, none committed), capture the living room at noon, at night with the lamp and fire lit, and at night with everything out; the hall at night; and the kitchen lit beside the dining room. Read them and tune `LIGHT`, `DIALS` and the tints until: by day the rooms are brightest by their windows and not flat; at night the lamp and fire read warm and uneven; with everything out the room is dim blue but its walls, floor and doorways are plain to see; the dining room's side of the kitchen wall takes no kitchen light. Say in the report what each final capture shows.
- [ ] **Step 6: Commit** — "Drive the cabin's lamps and fire from the world, and say what is lit".

### Task 8: Browser checks, captures and the speed figure

**Files:**
- Modify: `scripts/check-space-browser.mjs`, `.gitignore` (retained captures), `README.md` (the interior note and the script's check count)
- Output: `docs/interior-validation/*.jpg`, `docs/interior-validation/browser-results.json`

**Interfaces:**
- Consumes: `window.__space` under `?check` (`.lit`, `.inside.lit`, `.fixture`, `.drawIndoors`, `.liveViews`), the script's existing interior helpers (`indoorRead`, `paneBox`, `facing`, `timeFrames`, `studyLight`, `setPose`).

New checks after the existing ones, all with `?check&interior=1`, poses computed from the shared modules:

- [ ] **Step 1: Add the checks and captures:**
  - The living room at noon: a floor patch by the window is brighter than a floor patch across the room (mean luminance, patches placed from the blueprint and projected); capture `light-living-noon.jpg`.
  - The same pose under the overcast study: the frame's mean luminance is lower than at noon; `light-living-overcast.jpg`.
  - Dusk study: the living room's lamp glass is warm (redder than blue) and the room's far wall is warmer than at noon; `light-living-dusk.jpg`.
  - Night study with the fire: flames visible in the mouth's crop, the hearth slab warmer than the far floor; `light-living-night.jpg`.
  - Night with every lamp and the fire forced out by fixture: the frame is dim, and the hall–living opening's crop differs from the wall crop beside it by a visible margin (the way on can be seen); `light-living-out.jpg`.
  - The hall and stair at night, asleep: the wall lamp's glass glows; `light-hall-night.jpg`.
  - The master bedroom by day and lit: `light-master-day.jpg`, `light-master-lit.jpg`; lit is brighter and warmer.
  - The kitchen lit by fixture with the dining room out, seen from the dining room: the dining side of the shared wall is no brighter than with the kitchen out too; `light-kitchen-dining.jpg`.
  - The doorway from the yard at night with the door open: its crop is warmer than by day; `light-doorway-night.jpg`.
  - Same moment, same light: two loads with the world held still (as check 49 holds it) at a night moment draw the same interior frame (differences within 2%).
  - `inside.lit` is true and the interior scene holds no light source.
  - Speed, as check 50: the existing day figure still passes; add the same measurement under the `night` study (yard and living room both under it, the lamp and fire lit); both ratios ≤ 1.1; record both.
  - The interior's build time (the first `buildInside`) in milliseconds, recorded, not asserted.
  - No page or console errors.
- [ ] **Step 2: Run** `SPACE_VALIDATION_DIR=<temp dir> node scripts/check-space-browser.mjs` twice end to end. Expected: every check passes both times. If a speed check fails, leave it failing, change no threshold, and report the figures.
- [ ] **Step 3: Read** each new capture and say in the report what it shows, including anything that looks wrong.
- [ ] **Step 4:** Retain the ten `light-*.jpg` captures with `!` lines in `.gitignore`; update the README. Run `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Check the cabin's light in the browser and record its cost".
