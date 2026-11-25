# Cabin Interior Part 4f (Upstairs Bathroom, Box Room and Linen Cupboard Furnishing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended or superpowers:executing-plans to implement this plan task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?interior=1`, furnish the last three rooms (`bath-upper`, `box-room`, `linen`) in the layouts of the spec, so that every room in the cabin is furnished. The pieces must fit under the back roof slope, keep the 0.9 m ways through and into them, and stay inside the floor-1 build budget.

**Architecture:** Mostly data. The bathroom reuses 4d's kinds and recipes. `shared/furniture.js` gains three kinds (`trunk`, `linen-press`, `linen-shelf`). `shared/lakeside-interior.js` gains the pieces, three `upperSpots` and one upstairs speed pose. It turns `SLICE_4E` from an alias into a literal and adds `SLICE_4F`, and `furnishUpper` grows to eight rooms. `public/space/interior/furniture.js` gains three recipes and a `linens(...)` fill helper. `public/space/space-view.js` gains `&furnish=4e`. Nothing in `shared/interior.js`, `shared/sight.js` or `public/space/interior/index.js` should need to change: Rule 8 and `upperThroughWays` already derive from `furnishUpper` and the blueprint.

**Tech Stack:** Plain ES modules, three.js 0.170 (vendored, handed in), `node --test`, Playwright (`scripts/check-space-browser.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-24-cabin-interior-part-4f-upper-bath-box-linen-furnishing-design.md`. Read it alongside the 4d and 4e specs and their As built sections before starting.

## Global Constraints

- **Gating.** Everything new is behind `?interior=1`, and the browser check that the yard is unchanged keeps passing.
- **Surfaces and light.**
  - No textures, plates, tiles or changes to how surfaces are painted.
  - No new lit material, mesh name, surface name or art file.
  - No `Light` objects and no cast shadows.
  - None of the three rooms carries a `shades` mesh.
- **What stays put.**
  - No change to the blueprint's rooms, openings, windows, stair or fittings.
  - No change to `seenFrom` or the stairwell gate.
  - The fifteen furnished rooms are not re-tuned.
  - No server or persisted-state change, and no runtime dependency.
- **Determinism.** Nothing depends on the visitor. Irregularities come from fixed seeds, and the queue order is fixed.
- **Sculpting.** Only the `trunk`'s domed lid (`roll`) and, if needed, the folded linen's soft front edges (`cushion`, flattened) may be sculpted. Everything else is kit.
- **Placement.**
  - Pieces against a wall stand at the wall's face, 0.075 m inside the room line.
  - Piece ids are unique across the whole blueprint. `linen-basket` is taken, so the linen cupboard's pieces use the `linen-cupboard-` prefix.
- **Spots.** Floor-0 `spots` and `spots.speed` (length 6) do not change. `upperSpots` gains `bathTub`, `boxRoom` and `linenShelf`, and `upperSpots.speed` gains a third entry, `[11.8, 9.6]`. The existing entries do not move.
- **Queue order.** `furnishLater` is unchanged. `furnishUpper` is `['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room', 'bath-upper', 'linen', 'box-room']`.
- **Build budgets** (median of 3 loads):
  - `bath-upper` ≤ 25 ms, `box-room` ≤ 15 ms, `linen` ≤ 25 ms;
  - the three together ≤ 50 ms;
  - all eight floor-1 rooms ≤ 120 ms;
  - the eight floor-0 queued rooms < 180 ms;
  - first build at the door ≤ 80 ms over bare;
  - meshes: `bath-upper` ≤ 4, `box-room` ≤ 3, `linen` ≤ 3.
- **Speed poses.**
  - All six ground-floor poses: ≤ +0.01 over `&furnish=4e`, with **0 added draw calls**.
  - The two 4e upstairs poses against `&furnish=4e`: `u1` (`sky-room`) ≤ +0.01 with **0 added draw calls**; `u0` (`landing -> nook`) ≤ +0.02 and **≤ +7 added draw calls** (`bath-upper` and `linen` are in `shownRooms` through the open doorway).
  - The bathroom pose (`u2`, `[11.8, 9.6]` facing `[14.9, 11.0, 4.3]`): ≤ 1.1× yard, ≤ +0.05 over `&furnish=4e`, **≤ +7 draw calls** (`bath-upper` ≤ 4 + `linen` ≤ 3, since it looks into the open linen doorway).
- **Housekeeping.** Any new `.js`/`.mjs` file goes into `npm run check` in `package.json`. Every kept capture gets a `!` line in `.gitignore`.
- **Branch.** Work on a dedicated feature branch (`claude/interior-furnishing-upper-small-rooms`), not `main`. Commit after each task. The first commit includes the 4e review approval/future-telescope note, the 4f spec, and this plan.

## Review Focus

- **Slope fit.** No vertex of `linen-shelf` (or its folded linen), the bathtub or either basket may exceed `3.0 + ceilingHeight(I, 1, d)`. Rule 10 must still reject a shower against the eave and a mirror at `z = 1.5` on the eave wall. Tasks 2, 3, 4.
- **Slice fixtures mean what they say.** `SLICE_4E` is exactly 4e's five rooms whatever `furnishUpper` holds. `&furnish=4e` strips only 4f, and `4d`, `4c`, `4b` also strip 4f. Task 1.
- **Ways through.** The nook-to-linen walk through the bathroom, and the walks into the box room and the linen cupboard, pass at 0.9 m. A blocking piece in each fails Rule 8. Tasks 2–4.
- **Floor-1 budget with eight rooms.** Starting indoors upstairs builds eight rooms on frame 1, within 120 ms. Tasks 5, 6.

## File Structure

- `shared/furniture.js`: three new kinds.
- `shared/lakeside-interior.js`: 4f pieces, `upperSpots` additions, `furnishUpper` (8 rooms), literal `SLICE_4E`, `SLICE_4F`.
- `public/space/interior/furniture.js`: `linens(...)` helper, `LINEN_FILL`, and recipes for `trunk`, `linen-press` and `linen-shelf`.
- `public/space/space-view.js`: `&furnish=4e`, and `4d`/`4c`/`4b` strip `SLICE_4F`.
- `public/scene-description.js`: three clauses.
- `scripts/check-space-browser.mjs`: check 71 reworded for 17 sets, check 116's floor-1 total settled, new checks 126–133 and captures.
- Tests: `test/furniture.test.js`, `test/interior.test.js`, `test/interior-furniture.test.js`, `test/space-view.test.js`, `test/walker.test.js`, `test/place-memory.test.js`.
- Spec status and As built, the parent spec's part 4 marked complete, `README.md`, `.gitignore`.

---

### Task 1: Slice lists and the `&furnish=4e` fixture (no new pieces yet)

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/space/space-view.js`
- Test: `test/interior.test.js`, `test/space-view.test.js`

**Interfaces:**
- Produces:
  - `export const SLICE_4E = Object.freeze(['landing', 'bedroom-2', 'bedroom-3', 'sky-room', 'nook'])`, a literal, no longer `LAKESIDE_INTERIOR.furnishUpper`.
  - `export const SLICE_4F = Object.freeze(['bath-upper', 'box-room', 'linen'])`.
  - `interiorSwitch` handles each `&furnish=` value (all with `keepQueue: true`, all only under `?check`):
    - `4e` strips `SLICE_4F`;
    - `4d` strips `[...SLICE_4E, ...SLICE_4F]`;
    - `4c` strips `[...SLICE_4D, ...SLICE_4E, ...SLICE_4F]`;
    - `4b` strips `[...SLICE_4C, ...SLICE_4D, ...SLICE_4E, ...SLICE_4F]`.

- [ ] **Step 1: Write failing tests:**
  - In `test/interior.test.js`: replace `assert.equal(SLICE_4E, I.furnishUpper)` (line 545) with `assert.notEqual(SLICE_4E, I.furnishUpper)` and check `SLICE_4E` deep-equals the five 4e rooms and `SLICE_4F` deep-equals `['bath-upper', 'box-room', 'linen']`.
  - In `test/space-view.test.js`: `&furnish=4e` keeps all five 4e rooms queued and built (and strips `SLICE_4F`), `&furnish=4d`/`4c`/`4b` also strip `SLICE_4F`, and without `?check`, `&furnish=4e` is ignored.
- [ ] **Step 2: Run** `node --test test/interior.test.js test/space-view.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** (with the 4e spec's owner approval & future-telescope note, the 4f spec, and this plan): `git commit -m "Make the 4e slice a literal and add the 4f slice and &furnish=4e fixture"`

---

### Task 2: New kinds, spots and the eight-room upstairs queue

**Files:**
- Modify: `shared/furniture.js`, `shared/lakeside-interior.js`
- Test: `test/furniture.test.js`, `test/interior.test.js`

**Interfaces:**
- Produces:
  - `KINDS` gains three entries:
    - `trunk: solid([.9, .5], .5)`;
    - `'linen-press': solid([1.6, .45], 2.0)`;
    - `'linen-shelf': solid([2.0, .35], 1.85)`.
  - `upperSpots` gains `bathTub: [12.0, 10.3]`, `boxRoom: [16.5, 8.2]`, `linenShelf: [16.5, 10.8]`, and `speed` becomes `[[8.4, 5.8], [5.8, 9.5], [11.8, 9.6]]`.
  - `furnishUpper` gains `'bath-upper', 'linen', 'box-room'`. The three rooms are still bare, so Rules 7 and 8 must pass on the empty rooms.

- [ ] **Step 1: Write failing tests:**
  - **Kinds:** each new kind's standing, size, height and footprint at turns `0` and `π / 2`.
  - **The new spots:** standable and reachable from `stairTop`; covering any of them with a solid piece fails `validInterior`.
  - **Rule 10, in the bathroom:**
    - a `shower` at `[14.475, 11.475]` fails;
    - a `mirror` on `d = 12` at `z = 1.5` fails, and passes at `z = 1.4`;
    - a `linen-shelf` against the linen cupboard's eave wall passes;
    - a `linen-press` there fails.
  - **The queue:** `upperThroughWays(I)` now includes ways for `bath-upper` (to the linen doorway and `bathTub`), `box-room` (to `boxRoom`) and `linen` (to `linenShelf`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Update `test/interior.test.js` lines 535 (`withoutRooms(I, [...SLICE_4E, ...SLICE_4F])`), 547 (`upperSpots.speed.length === 3`), and 619–620 (`I.furnishUpper` has all 8 rooms in order, equal to `[...SLICE_4E, 'bath-upper', 'linen', 'box-room']`).
- [ ] **Step 5: Commit**: `git commit -m "Add the trunk and linen kinds, the 4f spots and queue the last three upstairs rooms"`

---

### Task 3: Furnish the upstairs bathroom

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/scene-description.js`
- Test: `test/interior.test.js`, `test/interior-furniture.test.js`, `test/walker.test.js`, `test/place-memory.test.js`

**Interfaces:**
- Produces these blueprint entries (all existing kinds and recipes):

  | id | kind | placement |
  |---|---|---|
  | `bath-upper-tub` | `bathtub` | at `[12.0, 11.55]`, turn `0` |
  | `bath-upper-mat` | `bath-mat` | at `[12.0, 10.85]`, turn `−0.03`, size `[0.9, 0.55]` |
  | `bath-upper-shower` | `shower` | at `[14.475, 7.525]`, turn `π` |
  | `bath-upper-basin` | `basin` | at `[12.3, 7.3]`, turn `π` |
  | `bath-upper-toilet` | `toilet` | at `[13.3, 7.425]`, turn `π` |
  | `bath-upper-basket` | `basket` | at `[14.5, 11.6]` |
  | `bath-upper-mirror` | `mirror` | hung on `d = 7` over `a [12.0, 12.6]` at `z = 1.5` |
  | `bath-upper-rail` | `towel-rail` | hung on `a = 15` over `d [8.4, 9.2]` at `z = 1.2` |
  | `bath-upper-rail-towel` | `towel` | on `bath-upper-rail` |
  | `bath-upper-tub-towel` | `towel` | on `bath-upper-tub` |
  | `bath-upper-jug` | `jug` | on `bath-upper-basin` |

  Also `FURNISHED_TEXT['upstairs bathroom']`, as worded in the spec.

- [ ] **Step 1: Write failing tests:**
  - **Blueprint:** valid with nothing skipped.
  - **Rule 8:** a solid bar across `d 8–11` at `a = 13` fails.
  - **Mesh build:** the set builds with ≤ 4 meshes and no `shades`; every vertex is at `z ≥ 3.0` with floor-1 light weights; no tub or basket vertex exceeds `3.0 + ceilingHeight(I, 1, d)`.
  - **Walker:** from `bathTub` toward the tub, it stops and slides.
  - **Place memory:** a floor-1 record at `[12.0, 11.55]` falls back to arrival.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** If a 4d recipe places its set-on pieces by assumptions that do not hold under the slope (towel drape height, for example), fix it in the recipe without changing the ground-floor bathroom's output. Check that with a vertex-hash test on `bath-ground`'s set.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Furnish the upstairs bathroom: bath under the eave, shower in the tall corner"`

---

### Task 4: Furnish the box room and the linen cupboard

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/space/interior/furniture.js`, `public/scene-description.js`
- Test: `test/interior.test.js`, `test/interior-furniture.test.js`, `test/walker.test.js`, `test/place-memory.test.js`

**Interfaces:**
- Produces:
  - Blueprint entries:

    | id | kind | room | placement |
    |---|---|---|---|
    | `trunk-1` | `trunk` | `box-room` | at `[15.6, 9.175]`, turn `0` |
    | `trunk-2` | `trunk` | `box-room` | at `[16.6, 9.175]`, turn `0.04` |
    | `box-crates` | `crate` | `box-room` | at `[15.3, 7.9]`, turn `π / 2` |
    | `box-chair` | `chair` | `box-room` | at `[17.4, 7.6]`, turn `−π / 2 + 0.3` |
    | `linen-press` | `linen-press` | `linen` | at `[16.6, 9.8]`, turn `π` |
    | `linen-eave-shelf` | `linen-shelf` | `linen` | at `[16.5, 11.75]`, turn `0` |
    | `linen-cupboard-basket` | `basket` | `linen` | at `[17.6, 11.2]` |
    | `linen-cupboard-towel` | `towel` | `linen` | on `linen-cupboard-basket` |

  - In `public/space/interior/furniture.js`:
    - `linens(at, [x0, x1], y, z0, {height, seed, colours})`: runs of folded stacks, set out like `kit.books`.
    - `LINEN_FILL`: one constant for how full the shelves are.
    - `RECIPES.trunk`: kit body, straps, `brass` corner irons, and a coarse `roll` domed lid.
    - `RECIPES['linen-press']`: kit carcass, five shelves, `linens` on each.
    - `RECIPES['linen-shelf']`: kit carcass and three shelves, `linens` on each. The top run stops 0.04 m under `ceilingHeight(interior, 1, d)`.
  - `FURNISHED_TEXT['box room']` and `FURNISHED_TEXT['linen cupboard']`, as worded in the spec.

- [ ] **Step 1: Write failing tests:**
  - **Blueprint:** valid.
  - **Rule 8:** a solid piece inside the box room door at `[16.5, 7.9]` fails; a bar across the linen band at `a = 16.5, d 10.1–11.5` fails.
  - **Mesh build:** both sets build within their mesh limits; no `linen-shelf` vertex (folded linen included) exceeds `3.0 + ceilingHeight(I, 1, d)`; a throwing `trunk` recipe skips only the trunk.
  - **Walker:** stops at `trunk-1` and slides along `linen-press`.
  - **Place memory:** a record inside `linen-press` falls back to arrival.
  - **Description:** set count is 17.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Furnish the box room with trunks and the linen cupboard with folded linen"`

---

### Task 5: Space-view lifecycle and descriptions

**Files:**
- Modify: as needed in `public/space/space-view.js` (no behaviour change is expected)
- Test: `test/space-view.test.js`

- [ ] **Step 1: Write tests:**
  - Starting indoors at `upperSpots.linenShelf` builds all eight floor-1 rooms on frame 1, and the description carries the linen clause.
  - Entering by the front door still leaves `pendingFor(0)` empty and floor 1 queued.
  - No 4f clause appears before its set is built (fake an unbuilt `bath-upper`).
  - The `&furnish=4d`, `4c` and `4b` fixtures leave the 4f rooms bare.
- [ ] **Step 2: Run** `npm test`. Expected: PASS. Fix anything that fails.
- [ ] **Step 3: Commit**: `git commit -m "Cover the eight-room upstairs queue in the space-view tests"`

---

### Task 6: Browser checks (126–133), captures and As built

**Files:**
- Modify: `scripts/check-space-browser.mjs`, `.gitignore`, the spec, the parent spec, `README.md`

- [ ] **Step 1:** Update existing browser checks in `scripts/check-space-browser.mjs`:
  - Reword check 71 for 17 sets.
  - Change `const UPPER_FIVE = I.furnishUpper` (line 1803) to `const UPPER_FIVE = SLICE_4E`, so check 116 keeps 4e's five-room sum while check 126 owns the 4f three-room sum (≤ 50 ms) and the eight-room floor-1 total (≤ 120 ms).
  - Have check 117 compare `&furnish=4e` against `&furnish=4d` (so 4e's `+9` draw-call limit stays isolated now that `bath-upper` and `linen` are visible through the nook doorway), while check 128 tests `all` against `&furnish=4e` at `u0` (≤ +7 calls, ≤ +0.02) and `u1` (0 added calls, ≤ +0.01).
- [ ] **Step 2:** Add checks **126–133** as the spec words them, and the captures:
  - `bath-upper-from-nook`, `bath-upper-lit`, `bath-upper-eave`;
  - `box-room-day`, `box-room-lit`;
  - `linen-day`, `linen-lit`, `linen-eave`;
  - fallback frames.

  Add a `!` line in `.gitignore` for each kept frame.
- [ ] **Step 3: Run** the whole suite against a throwaway database:
  ```sh
  A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start
  node scripts/check-space-browser.mjs
  ```
  Expected: 133 of 133 pass, with 0 page or console errors. If a budget is missed, apply the spec's remedies in order and re-run.
- [ ] **Step 4:** Write the As built and Measured sections in the 4f spec. Set its status to *"built behind `?interior=1`, awaiting owner review"*. In the parent spec, mark part 4 complete.
- [ ] **Step 5:** Update `README.md`: eighteen rooms furnished, and name the three new rooms.
- [ ] **Step 6: Run** `npm run check && npm test`. Expected: PASS.
- [ ] **Step 7: Commit**: `git commit -m "Check and capture the upstairs bathroom, box room and linen cupboard; record 4f as built"`
