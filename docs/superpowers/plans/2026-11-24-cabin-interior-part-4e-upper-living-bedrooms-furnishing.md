# Cabin Interior Part 4e (Upstairs Bedrooms, Landing, Sky Room and Library Nook Furnishing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended or superpowers:executing-plans to implement this plan task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?interior=1`, furnish the five main upstairs rooms (`landing`, `bedroom-2`, `bedroom-3`, `sky-room`, `nook`) in the owner-approved layouts, gate cross-floor visibility through the stairwell opening, build floor 1 in a second stage so front-door entry time does not grow, and enforce pitched-ceiling clearance and floor-1 walkability rules.

**Architecture:** `shared/sight.js` adds `stairWellBox(I)` to gate opposite-floor rooms and gives `landing`/`hall` the stairwell as an opening box. `shared/interior.js` adds Rule 10 (ceiling clearance under the pitched roof), `stairTop(I)`, floor-1 Rule 7 reachability (`upperSpots`), and floor-1 Rule 8 (`FURNISHED_UPPER`, `upperThroughWays`). `shared/furniture.js` and `shared/lakeside-interior.js` hold the eight new kinds, placements, `upperSpots`, `furnishUpper`, and `SLICE_4E`. `public/space/interior/index.js` and `public/space/space-view.js` split the build queue into floor 0 (`furnishLater`) and floor 1 (`furnishUpper`), flushing floor 1 only on approaching/climbing the stair or starting upstairs, and guard `SpaceView.furnished` by per-room build status. `public/space/interior/furniture.js` adds the new recipes, including slope-fitted bookshelves querying `ceilingHeight`.

**Tech Stack:** Plain ES modules, three.js 0.170 (vendored, handed in), `node --test`, Playwright (`scripts/check-space-browser.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-24-cabin-interior-part-4e-upper-living-bedrooms-furnishing-design.md`. Read it alongside the 4a–4d specs and As built sections before starting.

## Global Constraints

- Everything new is behind `?interior=1`; the yard-unchanged browser check keeps passing.
- No textures, plates, tiles, or changes to how surfaces are painted. No new lit material, no new mesh name, no new art files. The ten ground-floor rooms are not re-tuned.
- No `Light` objects, no cast shadows, nothing added to `inside.overlay`. Only rooms with bedside or standing lamps (`bedroom-2`, `bedroom-3`, `nook`) carry a `shades` mesh; `landing` and `sky-room` have no `shades` mesh.
- No change to the blueprint's rooms, openings, windows, stair, or fittings, or to `seenFrom`. No server or persisted-state change. No runtime dependency.
- Nothing depends on the visitor: irregularities come from fixed seeds; build queue order is fixed; visibility tests are pure functions of the blueprint and camera planes.
- Only these new pieces may be sculpted: `single-bed` and `daybed` mattresses/bolsters (`cushion`/`roll`), `floor-cushion` (`cushion`), `telescope` brass tube, eyepiece, mount and tripod legs (`turned`/`roll`), and `chest-of-drawers` knobs (`turned`). Everything else is kit (`face`/`box`/`board`/`post`/`books`).
- Every new recipe picks tints through `pal.surface(name, …)` and emits under `SURFACES[name].mesh` (a new `SURFACES.brass` mapping to `wood` is permitted).
- Pieces against a wall stand at the wall's face (`0.075 m` inside the room line).
- Floor-0 `spots` and `spots.speed` (length 6) do not move or change shape. Floor-1 spots live in `upperSpots` and `upperSpots.speed` (length 2).
- Queue order: `furnishLater` (floor 0) unchanged (`['kitchen', 'dining', 'study', 'passage', 'master', 'bath-ground', 'laundry', 'pantry']`); `furnishUpper` (floor 1) is `['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room']`.
- Budgets (median of 3 loads): first build at door `<= 80 ms` over bare; 8 floor-0 queued rooms `< 180 ms`; each 4e room `<= 35 ms`; all 5 4e rooms together `<= 120 ms`; meshes `<= 4` (`landing`, `sky-room`) and `<= 5` (`bedroom-2`, `bedroom-3`, `nook`).
- Speed poses: all 6 ground-floor speed poses `<= +0.01` over `&furnish=4d` with **0 added draw calls**; checks 73 (`ALL_LIVING_BUDGET` 4) and 82 (`SPEED2_CALLS` 8) keep their limits. Upstairs speed poses (`upperSpots.speed[0]` `landing -> nook`, `upperSpots.speed[1]` `sky-room -> roof window/daybed`) `<= 1.1×` yard frame and `<= +0.05` over `&furnish=4d`, adding `<= +9` and `<= +4` draw calls respectively.
- Pure modules live in `shared/`, take no three.js, and have Node tests.
- Any new `.js`/`.mjs` file must be added to `npm run check` in `package.json`. Every kept capture gets a `!` line in `.gitignore`.
- Work on a dedicated feature branch (e.g. `claude/interior-furnishing-upper-rooms`, not `main`). Commit after each task. The first commit includes the spec and this plan.

## Review Focus

- **Cross-floor soundness:** Standing in `hall` looking up the stairwell must draw `landing` (via `stairWellBox` in `doorBoxes(I).landing`), while standing at any of the 6 ground-floor speed poses (where `wellBox` is out of view) must hide all 5 upper rooms with 0 unseen draw calls. Tasks 1, 2.
- **Ceiling slope fit:** No vertex of `sloped-bookshelf` may exceed `3.0 + ceilingHeight(I, 1, d)` at any `d` along its span, and Rule 10 must reject any non-sloped solid or wall-hung piece whose top exceeds the slope. Tasks 3, 6.
- **Two-stage build without popping or false claims:** Entering the front door flushes floor 0 only; approaching or stepping onto the stair flushes floor 1 before the visitor reaches the landing; `SpaceView.furnished` reports true only when the visitor's current room is actually in `inside.furnishedRooms`. Tasks 2, 7.
- **Existing upstairs poses stay standable:** `[8, 1]`, `[6.4, 7.6]`, `[3, 9]`, `[3.5, 5]`, `[14.5, 5]`, `[14.5, 6.6]`, `[3.5, 7.6]` remain clear in the blueprint. Tasks 4–6.
- **Upstairs lamp shades:** `bedroom-2`, `bedroom-3`, and `nook` shades respond to their own room's lamp dial and floor-1 light weights, never `living`'s. Tasks 5, 6, 8.

## File Structure

- `shared/sight.js` — `stairWellBox(I)`, stairwell opening added to `landing`/`hall` in `doorBoxes(I)`, cross-floor gate in `doorInView(boxes, roomId, planes, seen, fromRoomId)`.
- `shared/furniture.js` — 8 new kinds (`single-bed`, `chest-of-drawers`, `small-desk`, `daybed`, `floor-cushion`, `telescope`, `eave-bookshelf`, `sloped-bookshelf`); `withoutRooms` also filters `furnishUpper`.
- `shared/interior.js` — `stairTop(I)`, Rule 10 (ceiling clearance for solid, sloped, and wall-hung pieces), floor-1 Rule 7 (`upperSpots`), `FURNISHED_UPPER`, `upperThroughWays(I)`, floor-1 Rule 8.
- `shared/lakeside-interior.js` — 4e pieces, `upperSpots`, `furnishUpper`, `SLICE_4E`.
- `public/space/interior/index.js` — two-stage queue (`furnishLater` + `furnishUpper`), `buildRest(floor?)`, `pendingFor(floor)`, pass `from` into `doorInView`.
- `public/space/interior/furniture.js` — `SURFACES.brass`, recipes for the 8 new kinds (including slope-fitting `sloped-bookshelf`), extended parent placements for `pillow`, `blanket`, `cushion`, `throw`, `book`, `jug`, `cup`.
- `public/space/space-view.js` — `&furnish=4d` (and `4c`/`4b`/`first` strip `SLICE_4E`), stair-proximity floor-1 flush in `step()`, per-floor flush in `buildInside()`, per-room `furnished` check.
- `public/scene-description.js` — five clauses for `landing`, `second bedroom`, `third bedroom`, `sky room`, `library nook`.
- `scripts/check-space-browser.mjs` — check 71 reworded for 14 sets, checks 111–112 aligned to floor-0 entry, new checks 116–125 and captures.
- Tests: `test/sight.test.js`, `test/furniture.test.js`, `test/interior.test.js`, `test/interior-furniture.test.js`, `test/space-view.test.js`, `test/walker.test.js`, `test/place-memory.test.js`.
- Spec Status & As built, `README.md`, `.gitignore`.

---

### Task 1: Cross-floor stairwell visibility gate in `shared/sight.js`

**Files:**
- Modify: `shared/sight.js`
- Test: `test/sight.test.js`

**Interfaces:**
- Produces:
  - `stairWellBox(I) → Readonly<{a: [lo, hi], d: [lo, hi], z: [lo, hi]}> | null`: `{a: I.stair.a, d: I.stair.d, z: [I.groundCeiling, I.floorRise]}` when `I.stair` is defined, else `null`.
  - `doorBoxes(I)`: unchanged box shape, plus appends `stairWellBox(I)` to the upper stair room (`landing`, neighbour `'hall'`) and lower stair room (`hall`, neighbour `'landing'`). Stores room floors and `wellBox` on a private `WeakMap` keyed by the frozen result.
  - `doorInView(boxes, roomId, planes, seen = null, fromRoomId = null) → boolean`: when `fromRoomId` is given and `roomFloor(fromRoomId) !== roomFloor(roomId)` and `wellBox` exists, returns `false` if `!boxInView(wellBox, planes)`; otherwise evaluates `roomId`'s doorway boxes (including `wellBox` for `landing`/`hall`) filtered by `seen`. Backward compatible when `fromRoomId` is omitted or `null`.

- [ ] **Step 1: Write failing tests** in `test/sight.test.js`:
  - `'stairWellBox returns the stairwell ceiling-to-floor cutout'`: matches `I.stair.a`, `I.stair.d`, `[I.groundCeiling, I.floorRise]`, frozen; `null` when `I.stair` is absent.
  - `'doorBoxes includes the stairwell box on landing and hall'`: `doorBoxes(I).landing` contains `stairWellBox(I)` alongside its 3 floor-1 openings.
  - `'cross-floor poses with stairwell out of view hide all opposite-floor rooms'`: from all six ground-floor speed poses (`spots.speed[0..5]`) and the living capture pose `[6.2, 5.2]` facing `[0.5, 3.5]`, `doorInView(boxes, upperRoom, planes, seen, fromRoom)` is `false` for every floor-1 room (`landing`, `bedroom-2`, `bedroom-3`, `sky-room`, `nook`, `bath-upper`, `box-room`, `linen`).
  - `'from hall looking up the stairwell, landing is in view'`: from `[9, 0.8, 1.6]` facing `[10.3, 4.0, 3.2]`, `doorInView(boxes, 'landing', planes, seen, 'hall')` is `true`; facing `[9, 0, 1.6]` (front door, away from stair), it is `false`.
  - `'from sky-room facing the roof window, ground-floor queued rooms are hidden'`: eye at `[5.8, 9.5, 4.6]` facing `[3.5, 10.5, 4.4]`, `doorInView(boxes, 'kitchen', planes, seen, 'sky-room')` is `false`.
  - `'omitting fromRoomId preserves existing 4-argument behaviour'`.

- [ ] **Step 2: Run** `node --test test/sight.test.js`. Expected: FAIL (`stairWellBox` not exported / cross-floor leak).

- [ ] **Step 3: Implement** `stairWellBox` and the cross-floor gate in `shared/sight.js`. Keep `seenFrom` and `SIGHT` untouched.

- [ ] **Step 4: Run** `node --test test/sight.test.js`. Expected: PASS.

- [ ] **Step 5: Commit** (including the spec and this plan): `git commit -m "Gate cross-floor room visibility through the stairwell opening"`

---

### Task 2: Two-stage build queue and cross-floor `showFrom` wiring

**Files:**
- Modify: `shared/furniture.js` (`withoutRooms` also filters `furnishUpper`), `public/space/interior/index.js` (`furnishUpper` queue, `buildRest(floor?)`, `pendingFor(floor)`, pass `from` to `doorInView`), `public/space/space-view.js` (`buildInside`, `step`, `furnished` per-room check)
- Test: `test/interior-furniture.test.js`, `test/space-view.test.js`, `test/furniture.test.js`

**Interfaces:**
- Consumes: Task 1's 5-argument `doorInView`.
- Produces:
  - `withoutRooms(interior, roomIds, {keepQueue = false})`: filters both `furnishLater` and `furnishUpper` when `keepQueue: true`, or empties both when `keepQueue: false`.
  - `buildInterior`: reads `I.furnishLater` (floor 0) and `I.furnishUpper` (floor 1, defaulting to `[]`). Pieces in `furnishLater` or `furnishUpper` are excluded from `firstSet`.
    - `buildNext()` shifts the first room from the floor-0 queue if non-empty, else from the floor-1 queue, else returns `null`.
    - `buildRest(floor)`: if `floor === 0`, builds all remaining floor-0 rooms; if `floor === 1`, builds all remaining floor-1 rooms; if `floor == null`, builds all remaining rooms on both floors.
    - `pending` returns `[...queue0, ...queue1]`; `pendingFor(floor)` returns `[...(floor === 0 ? queue0 : queue1)]`.
    - `shown(from, target, planes)` calls `doorInView(boxes, target, planes, sightSets.get(from), from)`.
  - `SpaceView`:
    - `buildInside()` calls `this.inside.buildRest(this.state.floor)` when starting indoors.
    - `step()` indoors: on floor 0 calls `buildRest(0)`, then if within `1.5 m` of `stairFoot(I)` or `onStair(I, pos)` calls `buildRest(1)`, else `buildNext()`; on floor 1 calls `buildRest(1)`, then if within `1.5 m` of `stairTop(I)` (or `[10.2625, 5.5]`, switching to `stairTop` in Task 3) or `onStair` calls `buildRest(0)`, else `buildNext()`.
    - `furnished` getter / description plumbing passes `this.inside.furnishedRooms.includes(roomId)` so a queued room never emits its description clause before its set is built.

- [ ] **Step 1: Write failing tests**:
  - `test/furniture.test.js`: `withoutRooms` strips rooms from `furnishUpper` when `keepQueue: true` and empties `furnishUpper` when `keepQueue: false`.
  - `test/interior-furniture.test.js`: fixture blueprint with a floor-0 queued room and a floor-1 queued room:
    - `buildRest(0)` builds floor-0 room and leaves floor-1 room in `pending` and `pendingFor(1)`, with `pendingFor(0)` empty.
    - `buildNext()` after `buildRest(0)` builds the floor-1 room.
    - `buildRest(1)` flushes floor-1 without requiring floor-0 to flush first; `buildRest()` flushes both.
    - `showFrom('kitchen', planesFacingDiningWindow)` hides a built floor-1 room; `showFrom('hall', planesLookingUpStair)` shows `'landing'`.
  - `test/space-view.test.js`: with a fixture having a floor-1 room in `furnishUpper`: entering the front door flushes floor 0 and leaves floor 1 pending on the first indoor frame; stepping within `1.5 m` of `stairFoot` flushes floor 1; starting indoors on floor 1 flushes floor 1 on frame 1; an unbuilt room does not trigger its `FURNISHED_TEXT` clause.

- [ ] **Step 2: Run** `node --test test/furniture.test.js test/interior-furniture.test.js test/space-view.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** the changes in `shared/furniture.js`, `public/space/interior/index.js`, and `public/space/space-view.js`.

- [ ] **Step 4: Run** `npm test`. Expected: PASS (all existing 4a–4d tests still pass).

- [ ] **Step 5: Commit**: `git commit -m "Split interior furniture queue by floor and wire cross-floor doorway visibility"`

---

### Task 3: New kinds, ceiling-clearance rule (Rule 10), floor-1 walk rules, `upperSpots` and `&furnish=4d` (no new pieces yet)

**Files:**
- Modify: `shared/furniture.js`, `shared/interior.js`, `shared/lakeside-interior.js` (`upperSpots`, `SLICE_4E`, empty `furnishUpper: []`), `public/space/space-view.js` (`interiorSwitch`, `stairTop`)
- Test: `test/furniture.test.js`, `test/interior.test.js`, `test/space-view.test.js`

**Interfaces:**
- Produces:
  - `KINDS` additions in `shared/furniture.js`:

    | kind | standing | size | height | extra |
    |---|---|---|---|---|
    | `single-bed` | solid | `[1.05, 2.0]` | `1.0` | `seat: 0.55` |
    | `chest-of-drawers` | solid | `[1.0, 0.5]` | `0.9` | — |
    | `small-desk` | solid | `[1.2, 0.6]` | `0.75` | — |
    | `daybed` | solid | `[2.0, 0.9]` | `0.75` | `seat: 0.45` |
    | `floor-cushion` | solid | `[0.55, 0.55]` | `0.16` | — |
    | `telescope` | solid | `[0.65, 0.65]` | `1.45` | — |
    | `eave-bookshelf` | solid | `[3.0, 0.35]` | `1.88` | — |
    | `sloped-bookshelf` | solid | `[1.45, 0.35]` | `2.40` | `sloped: true, minHeight: 1.5` |

  - `shared/interior.js`:
    - Export `stairTop = I => [(I.stair.a[0] + I.stair.a[1] - I.wall / 2) / 2, I.stair.d[1] + .1]`.
    - Export `FURNISHED_UPPER = Object.freeze(['landing', 'bedroom-2', 'bedroom-3', 'sky-room', 'nook'])`.
    - Export `upperFurnishedWay(I, rooms = FURNISHED_UPPER)` and `upperWideTargets(I, rooms = FURNISHED_UPPER)` (mirroring `furnishedWay`/`wideTargets` on floor 1).
    - Export `upperThroughWays(I)`: floor-1 `0.9 m` ways through `landing`, `nook`, `bedroom-3`, and into `bedroom-2` and `sky-room`.
    - Rule 10 in `furnitureFit`: checks ceiling clearance for every solid piece (`height <= minC + EPS`, or for `sloped: true`: `minC >= (minHeight ?? 1.2) - EPS && height <= maxC + EPS`) and every wall-hung piece (`z - height / 2 >= -EPS && z + height / 2 <= minC + EPS`).
    - Floor-1 Rules 7 & 8 in `furnitureFit` when `I.upperSpots` is present: checks all floor-1 openings, `upperSpots` named spots, and `upperSpots.speed` reachable from `stairTop(I)` at `I.eyeClear`; checks `upperWideTargets` and `upperThroughWays` at `WIDE_CLEAR` (`0.45 m`).
  - `shared/lakeside-interior.js`:
    - `upperSpots`: `{ landingSeat: [8.4, 1.0], bed2: [3.5, 4.0], bed3: [14.5, 4.0], skyWindow: [3.5, 8.2], nookChair: [9.0, 9.2], speed: [[8.4, 5.8], [5.8, 9.5]] }`.
    - `export const SLICE_4E = Object.freeze(['landing', 'bedroom-2', 'bedroom-3', 'sky-room', 'nook'])`.
  - `public/space/space-view.js`:
    - `interiorSwitch`: `&furnish=4d` strips `SLICE_4E` with `keepQueue: true`; `&furnish=4c` strips `[...SLICE_4D, ...SLICE_4E]`; `&furnish=4b` strips `[...SLICE_4C, ...SLICE_4D, ...SLICE_4E]`; `&furnish=first` strips `[...furnishLater, ...(furnishUpper ?? [])]`.

- [ ] **Step 1: Write failing tests**:
  - `test/furniture.test.js`: every new kind's standing, size, height, `seat`/`sloped`/`minHeight`, and footprint at turns `0` and `π / 2`.
  - `test/interior.test.js`:
    - `stairTop(I)` is standable at `0.25 m` and `0.45 m`.
    - Rule 10: a `bookshelf` (`h 2.1 m`) against the floor-1 eave (`d = 0.25`, ceiling `1.97 m`) fails `validInterior`; `eave-bookshelf` (`h 1.88 m`) there passes; a `sloped-bookshelf` against `d = 10.1..11.55` passes, while one placed where `maxC < 2.40` (e.g. turned along `d = 11.75` where `maxC = 2.00`) fails; a `picture` hung on `d = 0` at `z = 1.7` (top `2.0 > 1.9`) fails while `z = 1.5` (top `1.8 <= 1.9`) passes.
    - `upperSpots` named spots and `upperSpots.speed` (length 2, in `landing` and `sky-room`) are standable and reachable from `stairTop`; covering any of them with a solid piece fails `validInterior`.
    - `FURNISHED_UPPER` has 5 rooms; blocking each room's way in `upperThroughWays` with a solid bar fails Rule 8 while leaving a clear side passes.
    - Floor-0 `I.spots.speed.length === 6` and `FURNISHED` (10 ground rooms) remain untouched.
  - `test/space-view.test.js`: `&furnish=4d` strips `SLICE_4E` and keeps `bath-ground`/`pantry` queued; `&furnish=4c` and `&furnish=4b` also strip `SLICE_4E`; without `?check`, `&furnish=4d` is ignored.

- [ ] **Step 2: Run** `node --test test/furniture.test.js test/interior.test.js test/space-view.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** in `shared/furniture.js`, `shared/interior.js`, `shared/lakeside-interior.js`, and `public/space/space-view.js`.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Add upstairs furniture kinds, ceiling-slope rule, floor-1 walks and upper spots"`

---

### Task 4: Furnish the landing and sky room

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/space/interior/furniture.js` (`SURFACES.brass`, `RECIPES.daybed`, `RECIPES['floor-cushion']`, `RECIPES.telescope`, `cushion` & `throw` on `daybed`), `public/scene-description.js`
- Test: `test/interior.test.js`, `test/interior-furniture.test.js`, `test/walker.test.js`, `test/place-memory.test.js`, `test/space-view.test.js`

**Interfaces:**
- Consumes: Task 3's kinds and `upperSpots`.
- Produces: `furnishUpper: ['landing', 'sky-room']` (temporarily, expanded in Tasks 5–6). Blueprint entries:

  | id | kind | room | placement |
  |---|---|---|---|
  | `landing-seat` | `window-seat` | `landing` | at `[9.8, 0.315]`, turn `π` |
  | `landing-runner` | `runner` | `landing` | at `[8.3, 3.5]`, turn `0.02`, size `[0.9, 3.8]` |
  | `picture-landing` | `picture` | `landing` | hung on `a = 7` over `d [1.2, 2.0]` at `z = 1.5` |
  | `cushion-landing-1`, `-2` | `cushion` | `landing` | on `landing-seat` |
  | `sky-rug` | `rug` | `sky-room` | at `[3.5, 9.6]`, turn `0.01`, size `[3.2, 2.8]` |
  | `daybed` | `daybed` | `sky-room` | at `[3.5, 10.7]`, turn `0` |
  | `floor-cushion-1` | `floor-cushion` | `sky-room` | at `[1.9, 9.5]`, turn `0.2` |
  | `floor-cushion-2` | `floor-cushion` | `sky-room` | at `[2.4, 8.6]`, turn `-0.3` |
  | `telescope` | `telescope` | `sky-room` | at `[4.9, 9.0]`, turn `-0.6` |
  | `cushion-daybed-1`, `-2` | `cushion` | `sky-room` | on `daybed` |
  | `throw-daybed` | `throw` | `sky-room` | on `daybed` |

  `FURNISHED_TEXT['landing']` and `FURNISHED_TEXT['sky room']` per the spec.

- [ ] **Step 1: Write failing tests**:
  - `test/interior.test.js`: blueprint valid with nothing skipped; `landing-seat` clear of landing wall lamp `[8.2, 0.2]`; existing upstairs check spots `[8, 1]`, `[6.4, 7.6]`, `[3, 9]`, `[3.5, 7.6]` standable.
  - `test/interior-furniture.test.js`: `landing` and `sky-room` each build with `<= 4` meshes and no `shades`; every vertex has `z >= 3.0` and valid floor-1 light weights; every solid piece has a grounding patch lifted at floor 1 (`z > 3.0`); `daybed` cushions and throw sit on the daybed seat (`z >= 3.4`); telescope top sits near `4.45 m` (`3.0 + 1.45`) and stays well below the ceiling; a throwing `daybed` recipe skips its cushions and throw without dropping `telescope`.
  - `test/walker.test.js`: walking on floor 1 from `upperSpots.skyWindow` toward `daybed` stops at its footprint less `eyeClear` and slides along it.
  - `test/place-memory.test.js`: a floor-1 record at `[3.5, 10.7]` (inside `daybed`) falls back to arrival; a record at `upperSpots.skyWindow` loads as floor 1.
  - `test/space-view.test.js`: started indoors at `upperSpots.skyWindow`, floor 1 is built on frame 1 and the description contains the sky room's clause.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** `SURFACES.brass` (`{mesh: 'wood', colour: 'brass'}` with `COLOURS.brass = [1.08, 0.86, 0.42]`), `daybed` (slatted timber frame, end rails, back rail, tufted mattress cushion), `floor-cushion` (plump woven cloth pillow), `telescope` (three splayed wooden tripod legs, dark iron mount, brass optical tube angled upward ~35° toward the roof window with eyepiece & dew shield), and `cushion`/`throw` support for `daybed`.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Furnish the upstairs landing and sky room"`

---

### Task 5: Furnish Bedroom 2 and Bedroom 3

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/space/interior/furniture.js` (`RECIPES['single-bed']`, `RECIPES['chest-of-drawers']`, `RECIPES['small-desk']`; `pillow`/`blanket` on `single-bed`, `book` on `small-desk`, `jug` on `chest-of-drawers`, `cup` on `side-table`), `public/scene-description.js`
- Test: `test/interior.test.js`, `test/interior-furniture.test.js`, `test/walker.test.js`, `test/place-memory.test.js`, `test/space-view.test.js`

**Interfaces:**
- Consumes: Task 3's kinds and `upperSpots`.
- Produces: `furnishUpper: ['landing', 'bedroom-2', 'bedroom-3', 'sky-room']`. Blueprint entries:

  | id | kind | room | placement |
  |---|---|---|---|
  | `bed2-rug` | `rug` | `bedroom-2` | at `[2.8, 1.9]`, turn `0.02`, size `[2.2, 2.4]` |
  | `bed-2` | `single-bed` | `bedroom-2` | at `[2.4, 1.075]`, turn `π` |
  | `bed2-side-table` | `side-table` | `bedroom-2` | at `[3.3, 0.35]`, turn `π` |
  | `bed2-chest` | `chest-of-drawers` | `bedroom-2` | at `[2.2, 6.65]`, turn `0` |
  | `bed2-chair` | `chair` | `bedroom-2` | at `[0.8, 1.4]`, turn `π + 0.5` |
  | `mirror-bed2` | `mirror` | `bedroom-2` | hung on `d = 7` over `a [1.9, 2.5]` at `z = 1.5` |
  | `picture-bed2` | `picture` | `bedroom-2` | hung on `a = 0` over `d [5.0, 5.8]` at `z = 1.5` |
  | `bed2-lamp` | `table-lamp` | `bedroom-2` | on `bed2-side-table` |
  | `pillow-bed2`, `blanket-bed2` | `pillow`, `blanket` | `bedroom-2` | on `bed-2` |
  | `book-bed2` | `book` | `bedroom-2` | on `bed2-side-table` |
  | `jug-bed2` | `jug` | `bedroom-2` | on `bed2-chest` |
  | `bed3-rug` | `rug` | `bedroom-3` | at `[15.3, 1.9]`, turn `-0.02`, size `[2.2, 2.4]` |
  | `bed-3` | `single-bed` | `bedroom-3` | at `[15.8, 1.075]`, turn `π` |
  | `bed3-side-table` | `side-table` | `bedroom-3` | at `[14.9, 0.35]`, turn `π` |
  | `bed3-desk` | `small-desk` | `bedroom-3` | at `[11.375, 3.0]`, turn `π / 2` |
  | `bed3-chair` | `chair` | `bedroom-3` | at `[12.05, 3.0]`, turn `-π / 2 - 0.08` |
  | `picture-bed3` | `picture` | `bedroom-3` | hung on `a = 18` over `d [3.0, 3.8]` at `z = 1.5` |
  | `bed3-lamp` | `table-lamp` | `bedroom-3` | on `bed3-side-table` |
  | `pillow-bed3`, `blanket-bed3` | `pillow`, `blanket` | `bedroom-3` | on `bed-3` |
  | `cup-bed3` | `cup` | `bedroom-3` | on `bed3-side-table` |
  | `book-bed3-1`, `-2` | `book` | `bedroom-3` | on `bed3-desk` |

  `FURNISHED_TEXT['second bedroom']` and `FURNISHED_TEXT['third bedroom']` per the spec.

- [ ] **Step 1: Write failing tests**:
  - `test/interior.test.js`: valid with nothing skipped; existing spots `[3.5, 5]`, `[14.5, 5]`, `[14.5, 6.6]` standable.
  - `test/interior-furniture.test.js`: `bedroom-2` and `bedroom-3` each build with `<= 5` meshes including `shades`; each room's `shades` reacts to its own room's lamp dial (`dials.lamps[roomIdx]`) and not `living`'s; every piece's `pieceBox` stays within its room and under `3.0 + ceilingHeight(I, 1, d)`.
  - `test/walker.test.js`: walking in `bedroom-2` stops and slides along `bed-2`.
  - `test/place-memory.test.js`: a floor-1 record inside `bed-2` falls back to arrival.
  - `test/space-view.test.js`: starting indoors in `bedroom-2` and `bedroom-3` emits their respective clauses.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** `single-bed` (oak/painted headboard + footboard, side rails, mattress), `chest-of-drawers` (4-drawer carcass with inset drawer fronts and brass/wood knobs), `small-desk` (compact writing table with apron drawers), and set-on placements. Differentiate blanket/rug tints slightly between Bedroom 2 and Bedroom 3 via their seeds/palettes so the two rooms feel distinct.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Furnish upstairs bedrooms 2 and 3"`

---

### Task 6: Furnish the library nook (slope-fitted bookshelves, chair, and lamp)

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/space/interior/furniture.js` (`NOOK_SHELF_BOOKS` constant, `RECIPES['eave-bookshelf']`, `RECIPES['sloped-bookshelf']`), `public/scene-description.js`
- Test: `test/interior.test.js`, `test/interior-furniture.test.js`, `test/walker.test.js`, `test/place-memory.test.js`, `test/space-view.test.js`

**Interfaces:**
- Consumes: Task 3's kinds and `upperSpots`.
- Produces: final `furnishUpper: ['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room']`. Blueprint entries:

  | id | kind | room | placement |
  |---|---|---|---|
  | `nook-rug` | `rug` | `nook` | at `[9.0, 10.3]`, turn `0.02`, size `[2.2, 2.0]` |
  | `nook-eave-shelves` | `eave-bookshelf` | `nook` | at `[9.0, 11.75]`, turn `0` |
  | `nook-shelves-west` | `sloped-bookshelf` | `nook` | at `[7.25, 10.825]`, turn `π / 2` |
  | `nook-shelves-east` | `sloped-bookshelf` | `nook` | at `[10.75, 10.825]`, turn `-π / 2` |
  | `nook-chair` | `armchair` | `nook` | at `[8.45, 10.7]`, turn `0.45` |
  | `nook-lamp` | `standing-lamp` | `nook` | at `[9.55, 11.05]`, turn `0` |

  `FURNISHED_TEXT['library nook']` per the spec.

- [ ] **Step 1: Write failing tests**:
  - `test/interior.test.js`: real blueprint valid with nothing skipped; `furnishUpper` matches `['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room']`; `SLICE_4E` equals the 5 rooms as a set.
  - `test/interior-furniture.test.js`:
    - `nook` builds with `<= 5` meshes including `shades` (following `nook`'s lamp dial, not `living`'s); with all 15 furnished rooms built, there are 14 sets.
    - **Slope-fit invariant:** iterate every vertex `[a, d, z]` of `nook-shelves-west`, `nook-shelves-east`, and `nook-eave-shelves` and assert `z <= I.floorRise + ceilingHeight(I, 1, d) - 0.01` AND that `nook-shelves-west`'s top rises by at least `0.30 m` from its south end (`d = 11.55`) to its north end (`d = 10.10`).
    - Deterministic vertex count over two builds.
  - `test/walker.test.js`: walking in `nook` stops and slides along `nook-eave-shelves`.
  - `test/place-memory.test.js`: a floor-1 record inside `nook-eave-shelves` falls back to arrival.
  - `test/space-view.test.js`: starting indoors at `upperSpots.nookChair` builds floor 1 on frame 1 and emits the library nook's clause.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** `eave-bookshelf` (full-width low bookcase with 5 shelves, vertical dividers, and `kit.books(...)` rows) and `sloped-bookshelf` (queries `ceilingHeight(interior, 1, d)` at the piece's world `d` along its span, builds trapezoid gable-cut uprights and a bevelled top board sitting `0.04 m` below the ceiling slope, plus horizontal shelves with `kit.books(...)` trimmed wherever the slope drops within `0.26 m` of a shelf). Keep a single book-density constant so vertex budgets can be tuned in one edit.

- [ ] **Step 4: Run** `npm run check && npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Furnish the library nook with slope-fitted bookshelves"`

---

### Task 7: Update any existing unit tests that assumed floor-1 rooms were unfurnished

**Files:**
- Inspect & update as needed: `test/interior-furniture.test.js`, `test/space-view.test.js`, `test/interior.test.js`

- [ ] **Step 1: Audit tests** referencing `'landing'`, `'nook'`, `'bedroom-2'`, `'bedroom-3'`, or `'sky-room'` as unfurnished rooms (or asserting exact total set/room counts like `10` rooms / `9` sets). Move any "unfurnished room" check to `'bath-upper'`, `'box-room'`, or `'linen'` (4f rooms) and record every change for As built.

- [ ] **Step 2: Run** `npm run check && npm test`. Expected: PASS with 0 failures.

- [ ] **Step 3: Commit** (if any changes needed): `git commit -m "Update unfurnished-room test assertions for part 4e"`

---

### Task 8: Browser checks (116–125), captures, and As built write-up

**Files:**
- Modify: `scripts/check-space-browser.mjs`, `docs/superpowers/specs/2026-11-24-cabin-interior-part-4e-upper-living-bedrooms-furnishing-design.md` (Status + As built), `README.md`, `.gitignore`
- Create: captures under `docs/interior-validation/`

Start a throwaway server (`A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start`), then run `node scripts/check-space-browser.mjs`. "Baseline" below is a load with `&furnish=4d`.

- [ ] **Step 1: Update existing checks if needed:**
  - Reword **check 71** for 14 sets: `<= 5` meshes in `sets[0]`, `study`, `master`, `bedroom-2`, `bedroom-3`, `nook`, and `<= 4` in the remaining 8 sets.
  - Verify **checks 111–112** (front-door entry) assert all 10 ground-floor rooms are built (`pendingFor(0)` is `[]`), consistent with floor 1 building in stage 2.
  - Run the suite against the existing 115 checks; verify all seven existing upstairs poses (`[8, 1]`, `[6.4, 7.6]`, `[3, 9]`, `[3.5, 5]`, `[14.5, 5]`, `[14.5, 6.6]`, `[3.5, 7.6]`) still pass untouched, and checks 73 and 82 hold their limits.

- [ ] **Step 2: Add checks 116–125** in order:
  - **116:** Queued builds of `landing`, `nook`, `bedroom-2`, `bedroom-3`, `sky-room` (median of 3 loads): each `<= 35 ms`, together `<= 120 ms`; meshes `<= 4` (`landing`, `sky-room`) and `<= 5` (`bedroom-2`, `bedroom-3`, `nook`); all 8 floor-0 queued rooms still `< 180 ms`; vertices recorded. Record load furniture time when starting indoors on floor 1 (`sky-room`).
  - **117:** Speed at `upperSpots.speed[0]` (`[8.4, 5.8]` facing `[9.0, 11.7]`, `landing -> nook`), day and night (nook lamp lit by `fixtureLamps`): `<= 1.1×` yard and `<= +0.05` over baseline; draw calls `<= +9` over baseline.
  - **118:** Speed at `upperSpots.speed[1]` (`[5.8, 9.5]` facing `[3.5, 10.5, 4.4]`, `sky-room -> daybed + roof window`), day and night (sky-room lamp lit): `<= 1.1×` yard and `<= +0.05` over baseline; draw calls `<= +4` over baseline.
  - **119:** All six ground-floor speed poses, day and night, ABBA paired vs baseline: `<= +0.01` of a yard frame and **0 added draw calls** at every pose.
  - **120:** Shades in `bedroom-2`, `bedroom-3`, and `nook` follow their own room's lamp dial (not `living`'s), while `living`'s shade still follows `living`'s lamp.
  - **121:** Hiding changes 0 pixels vs `&hide=0` at all 6 ground-floor speed poses, both upstairs speed poses, and every 15° of a 360° turn (24 frames each) at `upperSpots.nookChair` and `upperSpots.landingSeat`.
  - **122:** `shownRooms`: hides all 5 upper rooms at all 6 ground-floor speed poses; shows `'landing'` when standing in `hall` looking up the stairwell; hides ground-floor queued rooms at `upperSpots.speed[1]` (`sky-room`); shows every built room in the yard.
  - **123:** Two-stage build lifecycle: entering the front door with reduced motion finishes floor 0 (`pendingFor(0)` empty) without flushing floor 1; walking up the stair finishes all 5 floor-1 rooms before reaching `landing`; starting indoors in `sky-room` builds floor 1 on frame 1 and emits the sky room's clause in the description.
  - **124:** Determinism: two loads at the same world moment produce 0 pixel difference across all 5 new rooms, while baseline (`&furnish=4d`) differs in each.
  - **125:** After `inside.fallBack()`, all 5 rooms keep every mesh with mean luminance `> 0.1`; 0 page or console errors across all 4e visitors.

- [ ] **Step 3: Take and inspect the captures** under `docs/interior-validation/`:
  - `landing` front window seat (day + lit);
  - `nook` from landing (day + lit) and sloped-shelf close-up against the roof pitch;
  - `bedroom-2` from its door (day + lit);
  - `bedroom-3` from its door (day + lit);
  - `sky-room` from its door (day + lit) and daybed/telescope close-up;
  - `hall` looking up the stairwell toward the landing seat;
  - all five rooms after `fallBack()`.
  Inspect every capture visually: verify sloped shelves hug the roof pitch with no poke-through or awkward gap, Bedroom 2 and Bedroom 3 read as distinct rooms, the telescope and daybed read clearly under the sky-room window, and nothing floats or sinks. Add `!` lines in `.gitignore` for each kept capture.

- [ ] **Step 4: Run the full suite** (`node scripts/check-space-browser.mjs`). Expected: 125/125 passing, 0 page/console errors. If any budget is missed, apply the spec's remedies in order (fewer kit cuts, fewer books per shelf in `nook`, coarser sculpted forms, fewer dressing pieces) and re-run; if a must-have would have to go, stop and report.

- [ ] **Step 5: Write up.** Update the 4e spec's Status line to "built behind `?interior=1`, awaiting owner review" and add its **As built** section (placements, sculpted vs kit breakdown, stairwell gate details, two-stage queue timings, check changes, measured numbers for checks 116–125, any weak points seen in captures). Update `README.md`'s interior section to document the 5 upstairs rooms, the two-stage upper-floor build, and the stairwell visibility gate. Run `npm run check && npm test`.

- [ ] **Step 6: Commit**: `git commit -m "Check and capture the upstairs rooms for part 4e, and record what was built"`
