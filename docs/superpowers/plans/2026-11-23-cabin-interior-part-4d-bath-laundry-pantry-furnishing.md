# Cabin Interior Part 4d (Ground-Floor Bathroom, Laundry and Pantry Furnishing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?interior=1`, the ground-floor bathroom, laundry and pantry are furnished in the accepted layout, and a queued room's furniture is drawn only when the visitor is in that room or one of its doorways is in view.

**Architecture:** A pure doorway test joins `seenFrom` in `shared/sight.js`; `inside.showFrom` takes the view's planes as a second argument and `SpaceView.updateSight` supplies them each frame. New kinds, placements and spots are data in `shared/`; rule 8 widens to all ten ground-floor rooms. The three rooms join the end of the build queue, each as its own mesh set of at most 4 meshes, built from 4a's kit by new recipes.

**Tech Stack:** Plain ES modules, three.js 0.170 (vendored, handed in), `node --test`, the Playwright script `scripts/check-space-browser.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-23-cabin-interior-part-4d-bath-laundry-pantry-furnishing-design.md`. Read it, and the design and As built sections of the 4a, 4b and 4c specs it names. `docs/superpowers/plans/2026-11-22-cabin-interior-part-4c-study-passage-master-furnishing.md` shows how the last slice's tasks were cut.

## Global Constraints

- Everything new is behind `?interior=1`; the yard-unchanged browser check keeps passing.
- No textures, plates, tiles, water or mirror reflection. No new lit material, no new mesh name, no new art files. The seven furnished rooms are not re-tuned.
- No `Light` objects, no lamp shades in the new sets, no cast shadows, nothing added to `inside.overlay`.
- No change to the blueprint's rooms, openings, windows or fittings, or to `seenFrom`. No server or persisted-state change. No runtime dependency.
- Nothing depends on the visitor: irregularities come from fixed seeds; the queue's order is fixed; the doorway test is a pure function of the blueprint and the view's planes.
- Only these may be sculpted: the bathtub's body and feet, the basin's bowl and pedestal, the toilet's bowl and cistern, the wash tub's body, the shower curtain's folds, towels, sacks, the baskets' rims, cloths on the rack, the pantry's jars and crocks (coarsely). Everything else is kit, through `face`/`lit`.
- Every new recipe picks tints through `pal.surface(name, …)` and emits under `SURFACES[name].mesh`. A new `SURFACES` name must map to an existing mesh.
- A piece against a wall stands at the wall's face, 0.075 m inside the room's line.
- The first build (door wanted) is unchanged and its furniture cost stays at most 80 ms against bare.
- Queue order: `['kitchen', 'dining', 'study', 'passage', 'master', 'bath-ground', 'laundry', 'pantry']`.
- Each new queued room: at most 30 ms to build in its frame (median of three loads), at most 4 meshes, no `shades`; the three together at most 70 ms; all eight queued rooms together under 180 ms.
- New speed pose `[14.6, 5.5]` facing `[17.9, 5.5]`, by day and under the night study with the bathroom's lamp lit by fixture: at most 1.1 times a yard frame, at most 0.05 above the same pose under `&furnish=4c`, at most 4 added draw calls against that.
- The five existing speed poses, against `&furnish=4c`: no more than 0.01 of a yard frame worse and no more draw calls, unless a new room's pieces are in the picture (then that room's meshes and at most 0.02).
- Checks 73 (`ALL_LIVING_BUDGET` 4) and 82 (`SPEED2_CALLS` 8) keep their limits. No limit is loosened.
- The six speed spots do not move (five existing, one new at the end).
- Pure modules live in `shared/`, take no three.js, and have Node tests. Tests refer to the blueprint and exported constants, not copies of their numbers, except a rule's own number (0.9 m, 0.25 m).
- Sizes, positions and turns below are starting values that pass `validInterior`; adjust within the rules and record each change for As built.
- A new `.js`/`.mjs` file is added to `npm run check`. A capture meant to be kept gets its own `!` line in `.gitignore`.
- Work on branch `claude/interior-furnishing-bath-laundry-pantry` (not `main`). Commit after each task with the repository's attribution line. The first commit includes the spec and this plan.

## Review Focus

- A visitor standing in a doorway, looking along the wall away from the room: that room is still drawn (the opening's box holds the camera). Task 1.
- Looking steeply down at a threshold or up at a door head: the doorway counts as in view when any part of its box, floor to `doorHead`, touches the view. Task 1.
- The view's planes missing, empty or holding a non-finite number (a zero-size canvas, a lost context): the doorway test hides nothing and the seen-from table alone decides. Tasks 1, 2.
- A queued room built after `showFrom` was last called takes the current answer, planes included, at once. Task 2.
- Turning the view while the world is paused or with reduced motion: visibility follows the camera on that same frame, never one frame late. Tasks 2, 6.
- A visitor remembered inside the bathtub or a pantry shelf falls back to the arrival pose; one who starts indoors in the pantry sees it furnished on the first frame. Tasks 4, 5.

## File Structure

- `shared/sight.js` — gains `doorBoxes`, `boxInView`, `doorInView`.
- `shared/furniture.js` — new kinds.
- `shared/interior.js` — `FURNISHED` of ten rooms; `throughWays` gains three ways in.
- `shared/lakeside-interior.js` — the pieces, the spots, `furnishLater`, `SLICE_4D`.
- `public/space/interior/furniture.js` — recipes for the new kinds; `cloth`, `jug` and `towel` placements that know their parent.
- `public/space/interior/index.js` — `showFrom(roomId, planes)`.
- `public/space/space-view.js` — the view's planes in the interior frame; `&furnish=4c`.
- `public/scene-description.js` — three clauses.
- `scripts/check-space-browser.mjs` — checks 104–115, captures; check 71 reworded.
- Tests: `test/sight.test.js`, `test/furniture.test.js`, `test/interior.test.js`, `test/interior-furniture.test.js`, `test/space-view.test.js`, `test/walker.test.js`, `test/place-memory.test.js`.
- The spec's Status and As built, `README.md`, `.gitignore`.

---

### Task 1: The doorway test, as a pure function

**Files:**
- Modify: `shared/sight.js`
- Test: `test/sight.test.js`

**Interfaces:**
- Produces, all in the interior frame `[a, d, z]`, z in metres above the ground floor:
  - `doorBoxes(I) → Readonly<Record<roomId, ReadonlyArray<{a: [lo, hi], d: [lo, hi], z: [lo, hi]}>>>`: one box per opening for each of its two rooms. Along the wall: the opening's `span`. Across it: `at ± I.wall / 2`. Height: `floor * I.floorRise` to that plus `I.doorHead`.
  - `boxInView(box, planes) → boolean`. `planes` is an array of `[na, nd, nz, c]`; a point is inside a plane when `na·a + nd·d + nz·z + c ≥ 0`. False only when all eight corners are outside one same plane. True when `planes` is not an array, is empty, or holds a non-finite number.
  - `doorInView(boxes, roomId, planes) → boolean`: true when any of the room's boxes is in view, and true when the room has no boxes.
- The caller passes the four side planes only (no near, no far).

- [ ] **Step 1: Write the failing tests** in `test/sight.test.js`. Build planes with a test helper `planesFrom({at: [a, d, z], facing: [a, d], fovH = 100°, aspect = 1440 / 810, pitch = 0})` (four side planes through `at`).
  - `'doorBoxes: one box per opening per room'`: `doorBoxes(I)['bath-ground']` has one box with `a: [13.925, 14.075]`, `d: [5, 6]`, `z: [0, I.doorHead]` (read the numbers from the blueprint's opening and `wall`); `passage` has three; an upper-floor room's box starts at `I.floorRise`; the result is frozen and deep-equal on two calls.
  - `'an opening ahead is in view, one behind is not'`: from `spots.dresser` (eye 1.6 m) facing `[0, 9.5]`, `laundry` and `pantry` are in view; facing `[7, 9.5]`, neither is.
  - `'4b's kitchen pose does not see the bathroom door'`: from `spots.speed[2]` facing the dining window `[10, 12]`, `doorInView(boxes, 'bath-ground', planes)` is false.
  - `'the living capture pose sees neither small room's door'`: from `[6.2, 5.2]` facing `[0, 3.5]`, `laundry` and `pantry` are false.
  - `'a box that holds the camera is in view'`: eye at `[14, 5.5, 1.6]` facing `[11, 5.5]` (away from the bathroom): `bath-ground` is true.
  - `'pitch'`: eye at `[13.6, 5.5, 1.6]` (0.4 m from the bath door) facing `[14, 5.5]`: `bath-ground` is true at pitch 0, at −60° (looking down at the threshold) and at +40° (up at the door head); from the same eye facing `[11, 5.5]` at pitch 0, `bath-ground` is false.
  - `'unusable planes hide nothing'`: `boxInView(box, null)`, `[]`, and planes with a `NaN` are all true; `doorInView(boxes, 'no-such-room', planes)` is true.

- [ ] **Step 2: Run** `node --test test/sight.test.js`. Expected: FAIL, `doorBoxes` is not exported.

- [ ] **Step 3: Implement** the three functions in `shared/sight.js`. No three.js. `seenFrom` and `SIGHT` are untouched.

- [ ] **Step 4: Run** `node --test test/sight.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Add the doorway test: whether one of a room's openings is inside the view"` (with the spec and this plan).

---

### Task 2: Draw a queued room only when a doorway is in view

**Files:**
- Modify: `public/space/interior/index.js` (`showFrom`, about line 377; `buildNext`), `public/space/space-view.js` (`updateSight`, about line 254)
- Test: `test/interior-furniture.test.js` (beside 4c's `showFrom` tests), `test/space-view.test.js`

**Interfaces:**
- Consumes: `doorBoxes`, `doorInView` (Task 1).
- Produces:
  - `inside.showFrom(roomId | null, planes = null)`: a queued room's set is visible when `roomId` is `null`; or the table says its room is seen from `roomId` and (`planes` is `null`, or the room is `roomId`, or `doorInView(boxes, room, planes)`). Both arguments are remembered and applied to a set as `buildNext` adds it. `doorBoxes` is built once in `buildInterior` inside a `try`; if it throws, one `console.warn` and the table alone decides.
  - `SpaceView.viewPlanes() → Array<[na, nd, nz, c]> | null`: the camera's four side planes for the frame about to be drawn, converted to the interior frame; `null` when they cannot be worked out. `updateSight` passes it as the second argument whenever it passes a room id, and `null` otherwise.
  - `buildInterior`'s options gain `doors = doorBoxes`, injectable as `sight` is.

- [ ] **Step 1: Write the failing tests.**
  - `test/interior-furniture.test.js`, with 4b's `buildQueued` fixture and Task 1's `planesFrom`:
    - `'a seen room whose door is out of view is hidden'`: after `buildRest()`, `showFrom('kitchen', planesFrom(spots.dresser facing [7, 9.5]))` leaves `shownRooms` with `'kitchen'` and `'dining'` and without `'study'`; with planes from the same eye facing `[11, 0.8]` (the hall–study door), `'study'` is shown again.
    - `'the visitor's own room is always shown'`: `showFrom('master', planes facing the gable)` includes `'master'`.
    - `'no planes, the table alone'`: `showFrom('kitchen')` gives exactly what 4c's test expects.
    - `'null room shows everything'` whatever the planes.
    - `'a room built after showFrom takes the current answer'`: `showFrom('kitchen', planes facing east)` before any `buildNext()`, then `buildRest()`: `shownRooms` has no `'study'`.
    - `'no door boxes, nothing more hidden'`: build with a `doors` that throws; one warning; `showFrom('kitchen', planes)` equals `showFrom('kitchen')`.
    - `counts`, `furnishedRooms` and `skipped` are the same before and after.
  - `test/space-view.test.js`: a view placed at `spots.speed[2]` facing the dining window has `shownRooms` without `'passage'` and `'study'`; turned to face `[0, 3.5]` through the living opening and drawn once with the world paused, `shownRooms` changes on that draw; on the stair, in the yard and with `?check&hide=0` every built room is shown; `viewPlanes()` returns `null` for a zero-size canvas and nothing is hidden then.

- [ ] **Step 2: Run** `node --test test/interior-furniture.test.js test/space-view.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** `viewPlanes` takes the planes from the camera's projection and world matrices as they will be used for this draw (update the camera's matrices first if the draw has not yet), then carries them into the interior frame through the interior object's world matrix and the `[a, z, −d]` convention. `updateSight` already runs at the top of `drawIndoors`; keep it there.

- [ ] **Step 4: Run** `npm test`. Expected: PASS, 4c's hiding tests included.

- [ ] **Step 5: Commit**: `git commit -m "Hide a queued room's furniture when none of its doorways is in view"`

---

### Task 3: Kinds, the wider walk, spots and the comparison switch (no new pieces yet)

**Files:**
- Modify: `shared/furniture.js`, `shared/interior.js`, `shared/lakeside-interior.js` (spots, `SLICE_4D`), `public/space/space-view.js` (`interiorSwitch`, about lines 50–59)
- Test: `test/furniture.test.js`, `test/interior.test.js`, `test/space-view.test.js`

**Interfaces:**
- Produces:
  - `KINDS` gains, as `[wide, deep]` and height in metres:

    | kind | standing | size | height |
    |---|---|---|---|
    | `basin` | solid | 0.6 × 0.45 | 0.85 |
    | `toilet` | solid | 0.45 × 0.7 | 0.8 |
    | `shower` | solid | 0.9 × 0.9 | 2.0 |
    | `bathtub` | solid | 1.7 × 0.75 | 0.6 |
    | `wash-tub` | solid | 0.9 × 0.6 | 0.85 |
    | `drying-rack` | solid | 1.0 × 0.45 | 1.2 |
    | `basket` | solid | 0.45 × 0.45 | 0.4 |
    | `pantry-shelf` | solid | 2.0 × 0.35 | 2.0 |
    | `sack` | solid | 0.5 × 0.45 | 0.6 |
    | `crate` | solid | 0.5 × 0.45 | 0.6 |
    | `bath-mat` | walk-over | — | 0.015 |
    | `towel-rail` | wall-hung | — | 0.05 |
    | `towel` | set-on | — | 0.6 |

  - `SLICE_4D = Object.freeze(['bath-ground', 'laundry', 'pantry'])`, exported beside `SLICE_4C`.
  - `spots.bath = [15.5, 5.5]`, `spots.laundry = [1.6, 8.3]`, `spots.pantry = [1.5, 10.7]`; `spots.speed[5] = [14.6, 5.5]`.
  - `FURNISHED` gains `'bath-ground'`, `'laundry'`, `'pantry'`. `throughWays(I)` gains one entry per new room: from its door's doorway point to its named spot.
  - `interiorSwitch`: `&furnish=4c` strips `SLICE_4D` with `keepQueue`; `&furnish=4b` strips `SLICE_4C` and `SLICE_4D` with `keepQueue`; `first` unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `test/furniture.test.js`: each new kind's standing and footprint at a turn of 0 and π/2; `towel` may be set on `towel-rail`, `bathtub` and `basket` (rule 6 accepts solid and wall-hung parents).
  - `test/interior.test.js`: the real blueprint is valid; `FURNISHED` has ten rooms and equals the ground floor's room ids as a set; for each new room, a blueprint with a solid 2.0 × 0.5 block across its way in fails rule 8 and one with the block against a far wall passes; each new named spot is standable, and a blueprint with a solid piece over it is invalid; `spots.speed.length === 6`, `spots.speed[5]` is in `bath-ground`, and the existing tests that name the first five by index keep passing unchanged.
  - `test/space-view.test.js`: `interiorSwitch('?check&furnish=4c')` has no piece in `SLICE_4D` rooms and still queues `'master'`; `&furnish=4b` has none in `SLICE_4C` or `SLICE_4D` rooms; without `?check` both are ignored.

- [ ] **Step 2: Run** `node --test test/furniture.test.js test/interior.test.js test/space-view.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Find tests that use `bath-ground`, `laundry` or `pantry` as "an unfurnished room" and note them; they change in Tasks 4 and 5.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Add the bathroom, laundry and pantry kinds, spots and the walk through all ten ground-floor rooms"`

---

### Task 4: The bathroom's pieces

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/space/interior/furniture.js` (`RECIPES.basin`, `.toilet`, `.shower`, `.bathtub`, `['bath-mat']`, `['towel-rail']`, `.towel`; `jug` on a basin), `public/scene-description.js`
- Test: `test/interior.test.js`, `test/interior-furniture.test.js`, `test/walker.test.js`, `test/place-memory.test.js`, `test/space-view.test.js`

**Interfaces:**
- Consumes: Task 3's kinds and spots.
- Produces: `furnishLater` ends `…, 'master', 'bath-ground'`. Blueprint entries:

  | id | kind | placement |
  |---|---|---|
  | `basin` | `basin` | at `[15.1, 4.3]`, turn π |
  | `toilet` | `toilet` | at `[16.7, 4.425]`, turn π |
  | `shower` | `shower` | at `[17.475, 4.525]`, turn π |
  | `bathtub` | `bathtub` | at `[16.3, 6.55]`, turn 0 |
  | `bath-mat` | `bath-mat` | at `[16.3, 5.75]`, turn 0.03, size `[0.9, 0.55]` |
  | `mirror-bath` | `mirror` | hung on `d` = 4 over a `[14.8, 15.4]` at z 1.5 |
  | `towel-rail` | `towel-rail` | hung on `a` = 18 over d `[5.3, 6.1]` at z 1.2 |
  | `towel-rail-1` | `towel` | on `towel-rail` |
  | `towel-tub` | `towel` | on `bathtub` |
  | `jug-basin` | `jug` | on `basin` |

  `FURNISHED_TEXT['bathroom'] = 'A bathtub stands along one wall, a basin and mirror opposite. '`

- [ ] **Step 1: Write the failing tests.**
  - `test/interior.test.js`: the blueprint is valid with nothing skipped; the queue's order; no solid piece's footprint holds the bathroom lamp's point.
  - `test/interior-furniture.test.js`: the `bath-ground` set builds with at most 4 meshes, none named `shades`, every mesh name one of `wood`, `cloth`, `stone`, grounding; every solid piece has a grounding patch; every vertex carries light weights (the existing weights assertion, run over this set); `towel` on the rail hangs below z 1.2 and on the tub rests at the rim height; a recipe that throws for `bathtub` leaves `towel-tub` skipped with it and the rest built.
  - `test/walker.test.js`: walking from `spots.bath` toward the tub stops at its footprint less the walker's radius and slides along it.
  - `test/place-memory.test.js`: a record at `[16.3, 6.55]` (inside the tub) falls back to the arrival pose.
  - `test/space-view.test.js`: started indoors at `spots.bath`, the first frame has `pending: []` and the description holds the bathroom's clause; with `furnished: false` it does not; the upstairs bathroom never gets the clause.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.** Surfaces: tub, basin bowl, toilet in `enamel`; towels, curtain and mat in `cloth`; rail, shower rail and tub feet in `iron`; pedestal or washstand the builder's choice. The shower, turned π, is open on its front and on the side toward the room (the −a side): the curtain hangs across both. Tucked surfaces (inside the tub and basin, under the tub, behind the curtain) use 4a's tucked weight. Keep the set's bounds inside the room.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Furnish the ground-floor bathroom"`

---

### Task 5: The laundry's and the pantry's pieces

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/space/interior/furniture.js` (`RECIPES['wash-tub']`, `['drying-rack']`, `.basket`, `['pantry-shelf']`, `.sack`, `.crate`; `cloth` on a rack; `towel` in a basket), `public/scene-description.js`
- Test: the same five files as Task 4

**Interfaces:**
- Consumes: Task 3's kinds and spots; Task 4's `towel` recipe.
- Produces: `furnishLater` is the Global Constraints' list. Blueprint entries:

  | id | kind | placement |
  |---|---|---|
  | `wash-tub` | `wash-tub` | at `[0.9, 7.375]`, turn π |
  | `drying-rack` | `drying-rack` | at `[1.3, 9.2]`, turn 0 |
  | `basket-1`, `basket-2` | `basket` | at `[0.3, 8.7]` and `[0.3, 9.2]` |
  | `cloth-rack-1…3` | `cloth` | on `drying-rack` |
  | `linen-basket` | `towel` | on `basket-2` |
  | `pantry-shelf-1` | `pantry-shelf` | at `[1.1, 9.75]`, turn π |
  | `pantry-shelf-2` | `pantry-shelf` | at `[1.1, 11.75]`, turn 0 |
  | `sacks` | `sack` | at `[0.325, 10.15]`, turn 0 |
  | `crates` | `crate` | at `[0.325, 11.35]`, turn 0 |

  `FURNISHED_TEXT['laundry'] = 'A wash tub and a drying rack stand here. '`; `FURNISHED_TEXT['pantry'] = 'Shelves of jars line two walls. '`

- [ ] **Step 1: Write the failing tests**, as Task 4's, for these two rooms: validity with nothing skipped and the final queue order; each set at most 4 meshes, no `shades`, patches and weights; cloths on the rack hang at different heights along its rails; the pantry shelf draws jars on at least four shelves and its vertex count is deterministic over two builds; the two shelf units' sets' bounding box stays inside the pantry's `a` and `d` ranges, and the laundry's inside the laundry's (this is what keeps them out of poses that face away if the doorway test is off); walking along a pantry shelf stops and slides; a record inside `pantry-shelf-1` falls back; started indoors at `spots.pantry`, the first frame has `pending: []` and the pantry's clause; `test/interior-furniture.test.js`: with all ten rooms built there are nine sets.
  Also update the tests Task 3 noted that used one of these rooms as unfurnished: move each to an upper-floor room that tests the same thing, and list the change for As built.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.** Surfaces: wash tub `copper`; rack, shelves and crates `wood`; sacks, cloths and linen `cloth`; jars and crocks `china` with a few in `stone`; baskets through a new `SURFACES.wicker = {mesh: 'wood', colour: …}` only if `oak` does not read as wicker. The crate kind draws two crates, one stacked askew on the other, inside its footprint. Jars are turned forms of at most 6 sides and 4 rings; the shelf recipe takes their number per shelf from one constant so the budget remedy is one edit.

- [ ] **Step 4: Run** `npm run check && npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Furnish the laundry and the pantry"`

---

### Task 6: Browser checks, captures and As built

**Files:**
- Modify: `scripts/check-space-browser.mjs`, the spec (Status line; As built), `README.md`, `.gitignore`
- Create: captures under `docs/interior-validation/`

Start the server as `CLAUDE.md` says (`A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start`), then `node scripts/check-space-browser.mjs`. "Baseline" below is a load with `&furnish=4c`.

- [ ] **Step 1: Reword check 71** for nine sets: at most 5 meshes in the first set and in `study` and `master`, at most 4 in the others. Run the suite; for each existing check that now fails because it stands, samples or captures in one of the three rooms, move its spot to the nearest clear place that tests the same thing or load it with `&furnish=4c`, and list each change for As built. Checks 73 and 82 must pass with their limits unchanged; if a recorded draw-call figure fell because of the doorway test, note the new figure.

- [ ] **Step 2: Add checks, in this order, numbered from 104:**
  - 104: queued builds of `bath-ground`, `laundry`, `pantry`, median of three loads: each ≤ 30 ms, together ≤ 70 ms, all eight queued rooms < 180 ms; meshes ≤ 4 each; vertices recorded. Record the furniture time of a load started indoors in the bathroom.
  - 105: speed at `[14.6, 5.5]` facing `[17.9, 5.5]`, day and night (bathroom lamp lit by `fixtureLamps`): ≤ 1.1× a yard frame and ≤ +0.05 over baseline.
  - 106: draw calls at that pose: ≤ +4 over baseline.
  - 107: the five existing speed poses, day and night, in 4c's ABBA pairing: ≤ +0.01 over baseline and draw calls not higher; where pixels inside a new room's doorway differ from baseline, that room's meshes and ≤ +0.02 are allowed and the pose is recorded.
  - 108: hiding changes no pixel: at the six speed poses, the living and hall capture poses and the kitchen west-wall capture pose, a default frame and an `&hide=0` frame at the same paused world moment differ by 0.
  - 109: the same comparison at every 15° of a full turn at `spots.dresser` and at `spots.wardrobes` (24 frames each): 0 at every step.
  - 110: `shownRooms` at `[5.2, 7.9]` facing the dining window has no `'bath-ground'`; at the living capture pose has no `'laundry'` and no `'pantry'`; at the bathroom pose has `'bath-ground'`; in the yard has every built room.
  - 111: entering through the door, at the first indoor frame `pending` is `[]` and all ten rooms are in `furnishedRooms`. 112: the same with reduced motion.
  - 113: started indoors in the bathroom: `pending: []`, `furnished: true`, the description holds the bathroom's clause.
  - 114: two loads at the same world moment draw the same bathroom, laundry and pantry (0 difference), and a baseline load differs in each.
  - 115: after `inside.fallBack()` all three rooms keep every mesh and their mean luminance is in the range 4c's `fallBack()` check uses.

- [ ] **Step 3: Take the captures** the spec lists under Checks: bathroom from its door by day and lit; basin, mirror, lamp and toilet wall; tub and shower corner; laundry through its door from the kitchen and from inside, day and lit; pantry the same; one shelf unit close to; the kitchen's west wall with both doors; the bathroom from `spots.wardrobes`; low under the tub; all three after `fallBack()`. Look at each: the tub, basin and toilet must be recognisable from the door, and nothing may float or sink. Add a `!` line to `.gitignore` for each one kept.

- [ ] **Step 4: Run the whole suite.** Expected: every check passes, 0 page or console errors. If a budget is missed, apply the spec's remedies in order (fewer cuts in kit faces, coarser sculpted forms starting with the pantry's jars, fewer dressing pieces) and re-run; if a must-have would have to go, stop and report.

- [ ] **Step 5: Write up.** Spec: Status line to "built behind `?interior=1`, awaiting owner review"; an **As built** section in 4c's shape (where things live; placements changed from this plan's tables; which pieces are sculpted; the doorway test as built and any draw-call figures it lowered; check spots and checks changed; measured numbers for checks 104–107; anything cut for speed; known weak points as the captures show them). `README.md`: the interior section names the three rooms, says the whole ground floor is furnished, and says a room's furniture is drawn only when one of its doorways is in view. Run `npm run check && npm test`.

- [ ] **Step 6: Commit**: `git commit -m "Check and capture the bathroom, laundry and pantry, and record what was built"`
