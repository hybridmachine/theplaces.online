# Path Lights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five low path lights along the last stretch of the path to the cottage door, glowing from dusk to early dawn and dark by day, in the walkable yard.

**Architecture:** A pure layout (`pathLightPlan`) and a pure timing function (`pathLightLevel`) in `shared/`; a `lights` scene part built from them with a `setPathLights(level)` setter; a `pathLights` life presenter that feeds the level from each frame's calendar.

**Tech Stack:** Plain ES modules, three.js 0.170 (handed in), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-17-path-lights-design.md`

## Global Constraints

- Yard only (`?space=1`); nothing in the default 2D painting or its downloads changes.
- No new light sources in the scene, no server or world state, no colliders.
- No new art files: `artFiles().length` stays 13.
- World axes x east, y north, z up, metres; three.js is passed in so everything runs in Node.
- Every new file is added to the `check` script in `package.json`.

## Review Focus

- Midsummer and midwinter: the lights must be off at noon and on at midnight on every day of the year (Task 1 test).
- The evening and morning ramps must not jump at noon or midnight, where the rule switches halves (Task 1 test).
- A frame with no usable calendar must leave the lights dark, not throw (Task 3 test).
- Level 0 must hide the pools entirely, so day costs no blending (Task 2 test).
- The lights must not shift any ground cover or walkable ground (Task 2: `S.colliders` untouched; existing dressing tests pass unchanged).

---

### Task 1: When the lights are on, and where they stand

**Files:**
- Create: `shared/path-lights.js`
- Modify: `shared/lakeside-dressing.js` (a `pathLights` entry in `LAKESIDE_DRESSING`; export `pathLightPlan`)
- Modify: `package.json` (`check`)
- Test: `test/path-lights.test.js`

**Interfaces:**
- Produces: `pathLightLevel(calendar) → number` in [0, 1], reading `calendar.elevation` (radians) and `calendar.hour`; 0 when either is not finite.
- Produces: `LAKESIDE_DRESSING.pathLights = {count: 5, from: 1.6, spacing: 1.6, offset: .4, height: .45, pool: 1.3}` — `from` is metres back along the path from its end at the door to the first light, `offset` is metres outside the path's half width.
- Produces: `pathLightPlan(space, dressing) → [{id: 'path-light-N', side: 1 | -1, foot: [x, y, z], lamp: [x, y, z]}]`, nearest the door first, sides alternating, `foot[2]` the terrain height, `lamp` `height` above it.

- [ ] **Step 1: Write the failing tests** in `test/path-lights.test.js`:
  - `the level`: with `calendar(epoch, …)` over a whole year at hourly steps, level is 0 whenever `hour` is within 2 h of 12 and 1 whenever within 1 h of 0; `viewConditions(epoch, now, 'dusk')` and `'night'` give ≥ .9, `'dawn'` and no study at 15:30 give 0; evening: 1 at elevation −.02, 0 at +.06; morning: 0 at elevation −.08, 1 at −.2; `pathLightLevel({})` is 0; successive values a minute apart across noon and midnight differ by less than .05.
  - `the plan`: deterministic (`deepEqual` twice); `count` lights; sides alternate; every `foot` is `walkable`, has `groundBlend(...).earth < .35`, lies within `pathHalfWidth + offset ± .05` of the path, is more than .5 m from every bed collider's edge and more than .5 m outside the cabin collider; all within 9 m of `doorPosition`; lamp is `height` above foot; neighbours at least 1.2 m apart.
- [ ] **Step 2: Run** `node --test test/path-lights.test.js` — expect failure on the missing module.
- [ ] **Step 3: Implement `pathLightLevel`.** Evening (`hour ≥ 12`): `1 − smooth(−.02, .06, elevation)`. Morning: `1 − smooth(−.19, −.09, elevation)`. `smooth` from `shared/world.js`.
- [ ] **Step 4: Implement `pathLightPlan`.** Walk the path polyline backwards from its last point by `from + k · spacing`; at each, step `pathHalfWidth + offset` to the left or right of the path's direction, alternating, the first on the side away from the beds.
- [ ] **Step 5: Run the test and the whole suite** (`npm test`, `npm run check`) — all pass.

### Task 2: The lights in the scene

**Files:**
- Create: `public/space/scene/lights.js`
- Modify: `public/space/scene/index.js` (a `lights` part; `setPathLights(level)`)
- Modify: `package.json` (`check`)
- Test: `test/space-scene.test.js`

**Interfaces:**
- Consumes: `pathLightPlan`, `LAKESIDE_DRESSING.pathLights` (Task 1).
- Produces: `buildPathLights(THREE, {space, dressing, art}) → {object, setLevel(level)}`; `object.name === 'lights'` with children `stakes` (Lambert, bark paint), `lamps` (emitted warm colour, intensity following the level) and `pools` (additive, no depth write, `visible` false at level 0).
- Produces: `scene.setPathLights(level)` on what `buildScene` returns; `scene.parts.lights`.

- [ ] **Step 1: Write the failing test** `the path lights are drawn: stakes, lamps and pools of light that follow the level`: the three children exist with finite positions; the part's box spans every planned foot and stands no higher than `height + .1` above the highest foot; after build the lamps' `emissiveIntensity` is 0 and `pools.visible` is false; `setPathLights(1)` makes the intensity positive, the pools visible with opacity > 0; `setPathLights(0)` returns them; values outside 0–1 are clamped. Add `'lights'` to the named-parts test.
- [ ] **Step 2: Run** `node --test test/space-scene.test.js` — expect failure.
- [ ] **Step 3: Implement `buildPathLights`.** Stake: a `tube` from just under the ground to the lamp; hood: a short wider `tube` capping it; lamp: a small tube under the hood in its own emissive material; pool: a disc of `pool` radius draped on `terrainHeight` + 2 cm, vertex colours falling off from the centre to black at the rim, `AdditiveBlending`, `depthWrite: false`, `fog: false`.
- [ ] **Step 4: Wire into `buildScene`** and run the suite.

### Task 3: The lights follow the sun

**Files:**
- Create: `public/space/life/path-lights.js`
- Modify: `public/space/life/index.js` (`pathLights: createPathLights` in `PRESENTERS`)
- Modify: `package.json` (`check`)
- Test: `test/life.test.js`

**Interfaces:**
- Consumes: `pathLightLevel` (Task 1), `yard.setPathLights` (Task 2).
- Produces: `createPathLights(THREE, {yard}) → {update(frame) → boolean, dispose()}`; `update` sets the level from `frame.calendar` and returns whether it is above 0; `dispose` sets 0.

- [ ] **Step 1: Write the failing test** `the path lights follow the sun: lit at night, dark by day and when let go`: with a stub yard recording levels — night calendar (`elevation: −.5, hour: 1`) → 1 and `true`; day (`elevation: .6, hour: 13`) → 0 and `false`; `calendar: undefined` → 0, no throw; `dispose()` → 0.
- [ ] **Step 2: Run, implement, run the whole suite.**

### Task 4: Look at it

- [ ] Start the dev server, open `/?space=1` with the `dusk`, `night` and day studies, capture from the arrival spot and from near the door; tune lamp colour, glow strength and pool size until the lights read as small warm lamps at dusk and night and as plain dark stakes by day.
- [ ] `npm test` and `npm run check` pass.
