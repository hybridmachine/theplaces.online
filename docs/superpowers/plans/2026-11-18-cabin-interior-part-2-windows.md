# Cabin Interior Part 2 (Live Windows and the Open Door) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?interior=1`, the cabin's six windows and its open front door show the live yard, drawn straight into the frame through the glass from the visitor's own eye carried outside, so the view shifts exactly as a real window's would.

**Architecture:** Each opening has a rigid map (a turn about the vertical and a shift, never a tilt or a scale) from the interior frame to the yard, taking the pane's centre to an anchor on the cabin's outside. Each frame indoors the rooms are drawn first, with every live pane writing its own number into the stencil buffer and no depth; then, for each live opening, the yard scene is drawn into the same target with a second camera (the visitor's camera carried through that opening's map), kept to that pane's stencil number, cut at the pane's plane by one global clipping plane, with the cabin's exterior hidden. Depth stays true throughout (same view-space on both sides of the glass), so the painterly pass's sky, distance and water tests keep working; the pass is only told each view's screen rectangle and eye matrix so it can find the lake through glass.

**Tech Stack:** Plain ES modules, three.js 0.170 (vendored at `public/assets/vendor/three-0.170.0.module.js`, handed in), `node --test`, the Playwright script `scripts/check-space-browser.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-17-cabin-interior-part-2-windows-design.md` (part 2 of `docs/superpowers/specs/2026-11-17-cabin-interior-design.md`; read both)

## Global Constraints

- Everything new is behind `?interior=1`. Without it nothing a visitor sees changes; every existing test and every existing yard capture stays as it is.
- No server, world-state or persisted-state change. No new art files: `artFiles().length` is unchanged.
- Nothing indoors depends on what a visitor did, only on shared state and the clock. The door's swing and the number of live openings are per-visitor presentation.
- The map through an opening is a turn about the vertical plus a shift. Never a tilt, never a scale.
- The yard is drawn into the frame itself. No view is drawn to a texture, and no view is ever a frame late. Falling back to pictures on the panes is not allowed.
- At most three openings are live in a frame on `full`, two on `light` and `plain`; the rest keep the shell's flat horizon-coloured glass.
- Rain, birds and smoke never appear inside a room. Rain falls round the cabin's outside.
- The cabin's exterior (walls, roof, chimney, panels, door, the cottage's glow and casement leaf) is not drawn in any view; chimney smoke is.
- If the views cannot be set up, panes keep the flat horizon colour, the interior carries on, and nothing is thrown per frame.
- Pure modules live in `shared/` (or `public/space/` when only the view uses them), take no three.js, and have Node tests. Every new `.js` file is added to the `check` script in `package.json`.
- Interior frame, metres: `a` 0–18 along the front wall from the chimney end, `d` 0–12 from the front wall, z up from the ground floor; three x = a, y = up, z = −d (`toThree`). Yard: x east, y north, z up.
- Speed: the median frame time in the living room facing the window is no more than 1.1 times the yard's arrival pose, same machine, both on `full`.
- Commit after each task, on a feature branch (not `main`), with the repository's attribution line.

## Review Focus

- A visitor far to one side of a window (in the kitchen, seeing the dining window 7 m along the wall) carries the eye out past the cabin's gable, among trees and rising ground: nothing nearer than the pane's plane may show, including the terrain, the lake and the path lights' halos (Task 5 test and Task 8 capture).
- Two openings in view at once whose screen rectangles overlap (the door and the living window seen from the stair) must each show only their own view (Task 7 test on stencil numbers; Task 8 capture).
- A remembered place standing where the open door leaf now is must fall back to the arrival pose, not strand the visitor inside the leaf (Task 3 test).
- A device whose tier is already locked from the yard and which is slow with three openings in view must still shed openings (Task 4 test).
- A context without a stencil buffer, or a view set-up that throws, must leave every pane flat-coloured with one warning and no error per frame (Task 7 test).

---

### Task 1: The openings and the carried eye

**Files:**
- Create: `shared/window-views.js`
- Test: `test/window-views.test.js`
- Modify: `package.json` (`check` script)

**Interfaces:**
- Consumes: `LAKESIDE_INTERIOR` (`windows`, `door`, `wall`, `floorRise`, `doorHead`), `ceilingHeight(I, floor, d)` from `shared/interior.js`; `cabinFrame`, `openingCentre`, `cabinFront` from `shared/lakeside-dressing.js`.
- Produces:
  - `viewOpenings(interior, space, dressing) → Opening[]`, frozen, in the order `living, study, dining, bedroom-2, bedroom-3, sky-room, door`. `Opening = {id, kind: 'wall'|'roof'|'door', floor, room, centre: [a, d, z], across: [a, d, z], up: [a, d, z], outward: [a, d, z], half: [w, h], anchor: [x, y, z], turn}`. `centre` is the pane's middle in the interior frame; `across` and `up` are unit vectors in the pane; `outward` is the pane's unit normal out of the room; `half` its half-extents along `across` and `up`; `anchor` the yard point the centre maps to; `turn` the angle (radians, counter-clockwise seen from above) that takes interior directions to yard directions.
  - `carry(opening, [a, d, z]) → [x, y, z]`: a point in the interior frame, in the yard.
  - `carryDirection(opening, [a, d, z]) → [x, y, z]`.
  - `cutPlane(opening) → {point: [x, y, z], normal: [x, y, z]}` in the yard: things with `(p − point) · normal < 0` are not drawn.

Values the spec and the code pin:

- Wall panes sit at the wall's outside face (`d = −wall/2` on the front, `12 + wall/2` on the back), centred at `[w.a, ·, w.sill + w.height/2]`, half-extents `[w.width/2, w.height/2]`. The door's pane: centre `[door.a, −wall/2, doorHead/2]`, half `[door.width/2, doorHead/2]`.
- Roof panes sit `0.15` m (the shell's `ROOF_REVEAL`; export it from `shared/lakeside-interior.js` as `roofReveal: .15` and use it in `public/space/interior/index.js` too) above the ceiling over `w.a ± w.width/2`, `w.d`; `up` runs up the slope, `outward` is the slope's upward normal.
- Anchors: `living → openingCentre(…, 'window-front-left')`, `study → 'window-front-right'`, `dining → 'window-back'`, `door → 'door'`. Roof windows, with `f = cabinFrame(space, dressing)`: `f.at(along, b, f.roofZ(along, b) + .05)` where `b = ±f.front · f.W / 2` (front slope for `bedroom-2` and `bedroom-3`, back for `sky-room`) and `along = −f.L / 2` for `bedroom-2` and `sky-room` (the chimney end), `+f.L / 2` for `bedroom-3`.
- `turn` is fixed by one rule for every opening: the horizontal part of `outward` maps to the outward direction of the cabin face it is on (`±f.front · f.v`). Verified for this cabin: `front = 1`, interior `a` maps to `f.u`, `d` to `−f.v`.

- [ ] **Step 1: Write the failing tests** in `test/window-views.test.js`:

```js
test('there are seven openings, each on its own room and floor', …)   // ids in the order above; door kind 'door', floor 0, room 'hall'
test('an eye at a pane's centre is at its anchor', …)                  // carry(o, o.centre) ≈ o.anchor within 1e-9, all seven
test('a metre indoors is a metre outdoors, and up stays up', …)        // |carry(p) − carry(q)| = |p − q| for random pairs; carryDirection(o, [0,0,1]) = [0,0,1]
test('each pane looks out of the cabin face it is anchored to', …)     // horizontal carryDirection(o, o.outward) is parallel to ±front·v, sign by face
test('the windows keep their order along the front wall', …)           // (anchor(living) − anchor(door)) · f.u < 0 < (anchor(study) − anchor(door)) · f.u, and the same signs for carry(door, living.centre), carry(door, study.centre)
test('the cut plane lies in the pane and faces out', …)                // cutPlane(o).point ≈ o.anchor; normal ≈ carryDirection(o, o.outward); all four pane corners carried satisfy |(p − point)·normal| < 1e-9
test('roof panes follow the interior slope and sit above the ceiling', …) // centre z = floorRise + ceilingHeight(I, 1, dMid) + .15; outward has positive z; bedroom panes lean to the front (outward d < 0), the sky room's to the back
```

- [ ] **Step 2: Run** `node --test test/window-views.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `shared/window-views.js` to the interfaces above.
- [ ] **Step 4: Run** `node --test test/window-views.test.js`. Expected: PASS.
- [ ] **Step 5:** Add `node --check shared/window-views.js` to `check`; run `npm run check && npm test`. Expected: PASS.
- [ ] **Step 6: Commit** — "Say where each window looks out from, and carry an eye through it".

### Task 2: Which openings are live

**Files:**
- Modify: `shared/window-views.js`
- Test: `test/window-views.test.js`

**Interfaces:**
- Consumes: `Opening` from Task 1; `roomAt` from `shared/interior.js`.
- Produces:
  - `LIVE_CAP = {full: 3, light: 2, plain: 2}` (frozen).
  - `screenShare(opening, view) → number` in 0–1: the share of the screen covered by the bounding rectangle of the pane's four corners, clipped to the screen; 0 when the eye is on the outward side of the pane or all corners are behind the eye; when some but not all corners are behind the eye, 1. `view = {eye: [a, d, z], yaw, pitch, fov, aspect}`, with `yaw` clockwise from +d and `fov` the vertical field of view in radians, as `SpaceView`'s camera has them.
  - `liveOpenings(openings, interior, state, view, {limit, doorOpen}) → string[]`: ids, largest `screenShare` first, at most `limit`. An opening is eligible when its share is above `0.0005`, it is not the door unless `doorOpen > 0`, and its floor is `state.floor` or the visitor's room is `hall` or `landing` (the stairwell joins the floors).

- [ ] **Step 1: Write the failing tests:**

```js
test('facing the living room window from the room, it is the only live opening', …)  // state floor 0, position [4.2, 3], yaw π (toward d = 0) → ['living']
test('a pane behind the visitor, or seen from its outward side, has no share', …)
test('the door counts only while it stands open', …)                                // hall, facing the door: doorOpen 0 → not listed; doorOpen .2 → listed
test('upstairs windows are not live from a ground floor room, but are from the hall and landing', …)
test('the limit keeps the largest on screen', …)                                    // a pose with three eligible, limit 2 → the two with the larger screenShare, in order
test('the caps are three on full and two on light and plain', …)
```

- [ ] **Step 2: Run** the test file. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** `LIVE_CAP`, `screenShare`, `liveOpenings`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Decide which windows are live from where the visitor stands".

### Task 3: The hall's open door leaf is solid

**Files:**
- Modify: `shared/lakeside-interior.js`, `shared/interior.js`
- Test: `test/interior.test.js`, `test/walker.test.js`, `test/place-memory.test.js`

**Interfaces:**
- Produces: `interior.doorLeaf = {a: 8.5, d: [0, 1], thick: .05}` (the fully open leaf: hinged on the living-room edge of the doorway, standing into the hall along `a = 8.5`); `floorArea` returns false within `thick/2 + eyeClear` of that segment on floor 0; `validInterior` requires `doorLeaf`, requires the hinge at `door.a − door.width/2`, and requires that `entry.position` and every ground-floor opening of the hall remain standable and joined with the leaf in place.

The exterior door already hinges on this edge (`public/space/scene/cabin.js`, the panel's `s = 0` edge is `along − width/2`, the chimney side), so nothing outside changes.

- [ ] **Step 1: Write the failing tests:**

```js
// interior.test.js
test('the open door leaf is an obstacle and the interior is still valid', …)   // validInterior(I); floorArea(I, 0, [8.5, .5]) === false; floorArea(I, 0, [8.5 ± .27, .5]) === false; floorArea(I, 0, [9, .8]) === true; floorArea(I, 1, [8.5, .5]) unchanged
test('a leaf hinged on the stair side, or shutting off the study door, is invalid', …)  // doorLeaf.a = 9.5 → false
// walker.test.js
test('holding W into the open door leaf from either side never crosses it', …)  // from [9, .8] heading −a and from [8, .6] heading +a, 5 s of steps: a never crosses 8.5 while d < 1
test('the living room, the study and the stair are all still reached from the entry spot', …)
// place-memory.test.js
test('a remembered place inside the door leaf falls back to the arrival pose', …)
```

- [ ] **Step 2: Run** those three files. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** the blueprint entry and the two rule changes.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, including every existing interior, walker, threshold and passage test.
- [ ] **Step 5: Commit** — "Make the hall's open door leaf solid".

### Task 4: Shed openings before shedding the tier

**Files:**
- Create: `public/space/view-budget.js`
- Modify: `public/space/tier.js`
- Test: `test/view-budget.test.js`, `test/tier.test.js`
- Modify: `package.json` (`check` script)

**Interfaces:**
- Consumes: `LIVE_CAP` (Task 2).
- Produces:
  - `createViewBudget({target = 24, settleMs = 1500, windowMs = 3000, stallMs = 2000} = {}) → {limit(tier) → number, frame(t, {indoors, live})}`. `limit(tier)` is `min(LIVE_CAP[tier], allowed)`, where `allowed` starts at 3. Fed every rendered frame: while `indoors` and `live > 1`, it gathers frame intervals exactly as the tier meter does (same settle, window, stall and 1.08 tolerance rules; export the meter's `TOLERANCE` and `median` from `tier.js` and reuse them), and a slow window lowers `allowed` by one, down to 1, then settles. Going from outdoors to indoors sets `allowed` back to 3. It runs whether or not the tier is locked.
  - `createTierMeter(…).frame(t, {indoors, hold})`: with `hold` true the frame is not measured and the window is settled afresh, as on stepping indoors or out. Everything else in the meter is unchanged.
- `SpaceView` (Task 7) passes `hold = indoors && liveCount > 1`, so only a view with at most one live opening can cost the tier.

- [ ] **Step 1: Write the failing tests:**

```js
// view-budget.test.js
test('a fast device keeps three openings on full and two on light and plain', …)
test('a slow stretch indoors with three live sheds one, then another, and stops at one', …)   // frames 60 ms apart against the 24 fps target
test('nothing is shed outdoors, or indoors with one opening live', …)
test('coming back indoors restores the full allowance', …)
test('a hidden tab or one long stall is not a measurement', …)
// tier.test.js
test('held frames are not measured: a slow held stretch indoors leaves the tier alone', …)
test('once the hold ends, a slow window with one opening live steps the tier down as before', …)
test('a locked full tier is untouched by anything indoors', …)
```

- [ ] **Step 2: Run** `node --test test/view-budget.test.js test/tier.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Add the new file to `check`; run `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Shed live windows before stepping the tier down indoors".

### Task 5: The yard can be drawn from a carried eye

**Files:**
- Modify: `public/space/scene/index.js`, `public/space/scene/ground.js`, `public/space/scene/lights.js`, `public/space/life/index.js`, `public/space/life/smoke.js`, `public/space/life/far-birds.js`, `public/space/life/rain.js`, `public/space/sky-dome.js`
- Test: `test/space-scene.test.js`, `test/life.test.js`, `test/sky.test.js`

**Interfaces:**
- Produces:
  - `yard.setCabinShown(shown: boolean)`: shows or hides the cabin's exterior, everything `buildCabin` returns in `object` (walls, roof, chimney, panels, door, doorway, casement leaf). Path lights, smoke and everything else are untouched.
  - `yard.cottage → {main, second, open}`: the last pose given to `setCottage` (so the interior can follow the casement).
  - Every yard material honours `renderer.clippingPlanes`. Built-in materials and those patched with `onBeforeCompile` already do. The three raw `ShaderMaterial`s that draw yard things (the lake in `ground.js`, the path-light halo in `lights.js`, the smoke in `life/smoke.js`) get `clipping: true` and three's four clipping chunks (`clipping_planes_pars_vertex`, `clipping_planes_vertex` after an `mvPosition` is computed, `clipping_planes_pars_fragment`, `clipping_planes_fragment` first in `main`). The sky dome's materials stay unclipped.
  - `life.aim(camera)`: re-aims what faces or follows the camera, without advancing anything. Presenters may offer `aim(camera)`; the smoke (puffs face the camera) and the far birds (placed from the camera, facing it) do. A presenter whose `aim` throws is given up like one whose `update` throws.
  - `lifeFrame({…, rainAt})`: when `rainAt` (a three `Vector3`) is given, the rain falls round it instead of round `camera.position`.
  - `sky.centreOn(position)`: moves the dome to a three `Vector3` without recomputing anything.

- [ ] **Step 1: Write the failing tests:**

```js
// space-scene.test.js
test('hiding the cabin hides its walls, roof, chimney, panels and door and nothing else', …)   // parts.cabin.visible false; every other part's visible unchanged; shown again restores
test('the yard remembers the cottage pose it was last given', …)
test('the lake, the halos and the smoke are clipped by a global plane; the sky is not', …)     // material.clipping === true and vertexShader/fragmentShader include the four chunk names; sky dome materials have clipping false
// life.test.js
test('aiming turns the smoke and places the far birds for another camera without advancing them', …)   // update(frame); positions/time state equal before and after aim(other), quaternions follow other
test('a presenter whose aim throws is given up and the rest carry on', …)
test('rain falls round rainAt when it is given', …)                                           // all streak x, z within RAIN.radius of rainAt, not of camera.position
// sky.test.js
test('centring the dome moves it and changes no uniform', …)
```

- [ ] **Step 2: Run** those files. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.** Read three's `ShaderChunk` sources for the four clipping chunks in the vendored file before editing the shaders; the vertex chunk needs `mvPosition`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Run** `node scripts/check-space-browser.mjs` (the server must be running as that script's header says). Expected: every existing check passes and the yard captures are unchanged to the eye; this proves the shader edits did not alter the yard.
- [ ] **Step 6: Commit** — "Let the yard be drawn from another eye, cut at a plane, without its cabin".

### Task 6: Window frames, the casement, the door leaf, and a pane per opening

**Files:**
- Modify: `public/space/interior/index.js`
- Test: `test/interior-scene.test.js`

**Interfaces:**
- Consumes: `viewOpenings` (Task 1); `interior.doorLeaf` (Task 3); `CASEMENT.maxAngle` (1.2) from `shared/lakeside-dressing.js`.
- Produces, on what `buildInterior(THREE, {interior, art, openings})` returns:
  - One mesh per opening named `pane-<id>`, a rectangle on the opening's pane, with two materials it switches between through `setLive(ids: string[])`: flat (the shell's horizon-coloured `MeshBasicMaterial`, shared) and marker. A marker material has `colorWrite: false, depthWrite: false, depthTest: true, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilRef: n`, where `n` is the id's place in the list given to `setLive`, from 1. Panes have `renderOrder` above every other room mesh, so a pane marks only where it is truly visible. The merged `glass` mesh is gone.
  - `stencilOf(id) → number` (0 when not live).
  - `setCasement(open: number)`: 0–1, swings the living room window's leaf outward by `open × 1.2` rad about its low-`a` edge.
  - `setDoor(open: number)`: 0–1, swings the hall's door leaf into the hall by `open × 1.45` rad about the edge at `a = 8.5`, so that fully open it stands on `interior.doorLeaf`.
  - `setSky`, `scene`, `dispose` as today.
- Built in the room, in the painted look of the shell's rail (`dark` boards): for each wall window a frame 0.07 m wide round the hole, a sill board standing 0.06 m into the room, and glazing bars 0.03 m wide at thirds across and up (the exterior panel's pattern), all at the wall's outside face just inside the pane; for each roof window a 0.07 m frame at the top of its reveal, no bars; the casement leaf (the window's low-`a` third, with its own frame and one pane of bars) as a separate two-sided mesh named `casement`, lying just outside the pane; the door leaf as a separate two-sided mesh named `door-leaf`, 1 × 2.1 m, 0.05 m thick. The living window has no fixed bars over the leaf's third.

- [ ] **Step 1: Write the failing tests:**

```js
test('each opening has its own pane, flat until made live', …)            // seven pane-<id> meshes; all on the flat material; no mesh named 'glass'
test('live panes mark the stencil with their own number and write no colour or depth', …)   // setLive(['door', 'living']) → stencilOf('door') 1, stencilOf('living') 2, others 0; material flags as above; setLive([]) restores flat
test('panes are drawn after everything else in the room', …)
test('the flat panes still take the sky's horizon colour', …)
test('the casement swings outward about its chimney-side edge', …)        // setCasement(1): the leaf's free edge is at d < −wall/2 (outside) and its hinge edge has not moved; setCasement(0): leaf in the pane's plane
test('the door leaf swings into the hall and, open, stands on the blueprint's leaf', …)   // setDoor(1): bounding box within .1 of a = 8.5, d 0–1, z 0–2.1; setDoor(0): spans a 8.5–9.5 at d ≈ 0
test('frames and bars lie inside the room side of each pane and nothing solid stands in an opening', …)   // existing ray test still passes; bars' boxes within the window holes
```

- [ ] **Step 2: Run** `node --test test/interior-scene.test.js`. Expected: FAIL on the new tests (the existing `glass` assertions are replaced by the pane ones).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Frame the windows, hang the casement and the hall door, and give each opening its own pane".

### Task 7: Draw the yard through the live panes

**Files:**
- Create: `public/space/window-views.js`
- Modify: `public/space/painterly-pass.js`, `public/space/space-view.js`
- Test: `test/window-view-draw.test.js`, `test/space-view.test.js`
- Modify: `package.json` (`check` script)

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 5, 6.
- Produces:
  - `createWindowViews(THREE, {openings, yardScene, yard, life, sky}) → {prepare(camera, ids, stencilOf) → View[], draw(renderer), dispose()}`.
    - `prepare` sets up, for each id, a second `PerspectiveCamera` with the main camera's projection, its position `carry(opening, eye)` and its yaw the main camera's plus `opening.turn` (same pitch, rotation order `YXZ`), and returns `View = {id, ref, camera, plane: THREE.Plane, rect: [u0, v0, u1, v1], eye: Matrix4}`. `rect` is the pane's bounding rectangle on screen in 0–1 texture coordinates (the whole screen if any corner is behind the eye); `eye` is that camera's `matrixWorld`.
    - `draw(renderer)` draws each prepared view into whatever target is bound: `yard.setCabinShown(false)`; for each view `sky.centreOn(view.camera.position)`, `life.aim(view.camera)`, `renderer.clippingPlanes = [view.plane]`, stencil test locked to `EQUAL view.ref` with no stencil writes, `renderer.autoClear = false`, `renderer.render(yardScene, view.camera)`. Afterwards everything is put back: stencil unlocked and off, `clippingPlanes = []`, `autoClear` as it was, the cabin shown, the sky centred on and the life aimed at the main camera. The restore runs in a `finally`.
    - Locking the stencil state across a `render` call is three's own `MaskPass` pattern (`renderer.state.buffers.stencil.setTest/setFunc/setOp/setLocked`); read `setLocked` in the vendored three before writing it.
  - `PainterlyPass`: the scene target gains a stencil buffer (`stencilBuffer: true`, its depth texture `DepthStencilFormat` with `UnsignedInt248Type`). `render(scene, camera, {water = true, views = null} = {})`: after the scene is drawn into the scene target and before the filter, calls `views.draw(renderer)` if given. The `CANVAS` shader gains `viewCount` (int, 0–3), `viewRect[3]` (vec4) and `viewEye[3]` (mat4): a pixel inside `viewRect[k]` (the first that contains it) takes its world position from `viewEye[k]` and is tested for water as outdoors; all other pixels behave as today (`waterMask` as given). With `views` null, `viewCount` is 0 and the pass behaves exactly as before.
  - `SpaceView`:
    - the canvas context is asked for `stencil: true`;
    - when the interior is built, `viewOpenings` is computed once and handed to `buildInterior`; `createWindowViews` is made lazily with it, inside a `try`: a throw, or a context whose `getContextAttributes().stencil` is false, sets `this.viewsFailed = true` with one `console.warn("The cabin's windows could not be opened; they stay blank.", error)`, and from then on no pane is ever made live;
    - each frame indoors: `inside.setCasement(yard.cottage.open)`, `inside.setDoor(door)` (the passage's value), `ids = liveOpenings(openings, interior, state, view, {limit: budget.limit(tier), doorOpen: door})`, `inside.setLive(ids)`, `views.prepare(camera, ids, inside.stencilOf)`; `lifeFrame` is given `rainAt` = the cabin's centre at eye height (three coordinates); the interior is drawn through the pass with `{water: false, views}`, or on `plain` `renderer.render(inside.scene, camera)` then `views.draw(renderer)`;
    - `budget.frame(now, {indoors, live: ids.length})` and `meter.frame(now, {indoors, hold: indoors && ids.length > 1})`;
    - outdoors nothing changes: no views, no stencil use, `rainAt` absent;
    - `get liveViews()` returns the ids live in the last frame (for the browser check).

- [ ] **Step 1: Write the failing tests:**

```js
// window-view-draw.test.js (three in Node, a recording stub renderer as test/space-view.test.js uses)
test('a view's camera stands at the carried eye, turned by the opening's turn, with the visitor's pitch and projection', …)
test('a view's plane keeps what is beyond the pane and cuts what is nearer', …)        // plane.distanceToPoint(anchor + n) > 0 > plane.distanceToPoint(anchor − n)
test('each view is drawn only where its own stencil number is', …)                    // recorded: setFunc(EQUAL, ref, 0xff) before each render, one render per view, in order
test('the cabin is hidden only while views are drawn, and everything is put back even if a draw throws', …)
test('the sky and the life follow each view's camera and end on the visitor's', …)
test('the screen rectangle of a pane partly behind the eye is the whole screen', …)
// space-view.test.js
test('outdoors nothing is live and the pass is given no views', …)
test('indoors facing the living room window, its pane is live and the yard is drawn once more', …)
test('with the door shut the doorway is not drawn through; opening it makes it live', …)
test('no more openings are live than the tier's cap and the budget allow', …)
test('a context without stencil leaves every pane flat, with one warning and no error per frame', …)
test('a view set-up that throws leaves every pane flat, with one warning', …)
test('more than one live opening holds the tier meter; one does not', …)
test('rain is centred on the cabin while the visitor is indoors', …)
```

- [ ] **Step 2: Run** `node --test test/window-view-draw.test.js test/space-view.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `public/space/window-views.js`, the pass changes and the `SpaceView` wiring.
- [ ] **Step 4:** Add the new file to `check`; run `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Look at it.** Start the dev server through the project's preview configuration, open `/?interior=1&check`, walk in, and confirm in the living room that the yard shows through the window, sharp, shifting as you step sideways, with the glazing bars in front of it; then on `&tier=plain`. If a multi-sampled target with a depth-stencil texture does not work in this three version (blank or erroring frames), keep the stencil on a depth-stencil renderbuffer and resolve depth to the texture as three's `resolveDepthBuffer` allows, or drop the scene target's `samples` only while views are live; note which in the commit message.
- [ ] **Step 6: Commit** — "Draw the living yard through the cabin's windows and its open door".

### Task 8: Browser checks, captures and the speed figure

**Files:**
- Modify: `scripts/check-space-browser.mjs`, `README.md` (the `?interior=1` note, one line saying the windows are live)
- Output: `docs/interior-validation/*.jpg`, `docs/interior-validation/browser-results.json`

**Interfaces:**
- Consumes: `SpaceView.liveViews`, `tier`, the script's existing `visitor`, `setPose`, `indoorsState`, `studyLight`, `shotJpeg`, `check` helpers and its interior section (checks 32–39).

New checks, numbered after the existing ones, all with `?check&interior=1`:

- [ ] **Step 1: Add the checks and captures:**
  - Each of the six windows by day, from a pose in its room facing it (roof windows with the pitch needed to see them): `liveViews` includes its id, the pane's pixels are not the flat horizon colour, capture `window-<id>.jpg`.
  - The open door from the hall: `door` is live, capture `door-from-hall.jpg`; from 3 m back in the hall with the leaf shut, `door` is not live.
  - Parallax: the living room window from `[3.2, 3]` and `[5.2, 3]`, both facing the front wall; the two pane crops differ by more than the script's existing "frames differ" threshold; captures `living-left.jpg`, `living-right.jpg`.
  - Sideways cut: from the kitchen, looking along the wall at the dining window; the pane shows sky or yard, not a single flat near-colour; capture `dining-from-kitchen.jpg`.
  - Two at once: from the stair foot facing the front wall with the door open; `liveViews` has at least two ids; capture `hall-two-views.jpg`.
  - Rain (`studyLight` rain): streaks inside the living window's pane crop, none in a wall crop beside it; capture `living-rain.jpg`.
  - Night: capture `living-night.jpg`; the pane is darker than by day.
  - The casement: with the cottage fixture's casement open, capture `casement-open.jpg`.
  - On `&tier=plain`: the living window is live and not flat.
  - The yard from outdoors, at the arrival pose, with and without `?interior=1`: the two frames match within the script's threshold (the yard is unchanged).
  - Speed: on `&tier=full`, the median of 120 frame intervals at the arrival pose and in the living room at `[4.2, 3]` facing the window; check that indoor ≤ 1.1 × yard; both figures written to the results.
  - No page or console errors in any of these visitors.
- [ ] **Step 2: Run** `node scripts/check-space-browser.mjs`. Expected: every check passes, old and new. If the speed check fails, apply the spec's remedies in order (draw less of the yard through glass, then lower `LIVE_CAP`), and if it still fails stop and report the figures; do not switch to textures.
- [ ] **Step 3: Read** each new capture and confirm by eye: sharp view, level horizon, bars in front of the yard, no cabin wall or near tree across any pane, no rain in the room.
- [ ] **Step 4: Run** `npm run check && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — "Check the cabin's windows in the browser and record their cost".
