# Cabin Interior Part 4c (Study, Closet Passage and Master Bedroom Furnishing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?interior=1`, the study, the closet passage and the master bedroom are furnished in the accepted layout, their lamps' shades follow their own rooms' lamps, and furniture that cannot be seen from the visitor's room is not drawn.

**Architecture:** New kinds, placements and spots are data in `shared/`; rule 8 widens to seven rooms. `buildFurniture` colours a set's shades from the room they stand in instead of the living room. A new pure module, `shared/sight.js`, works out which rooms see which from the blueprint; `buildInterior` exposes `showFrom(roomId)` and `SpaceView` calls it each frame. The three rooms join 4b's queue.

**Tech Stack:** Plain ES modules, three.js 0.170 (vendored, handed in), `node --test`, the Playwright script `scripts/check-space-browser.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-22-cabin-interior-part-4c-study-passage-master-furnishing-design.md`. Read it, and the design and As built sections of the 4a and 4b specs it names, which it builds on. `docs/superpowers/plans/2026-11-21-cabin-interior-part-4b-kitchen-dining-furnishing.md` shows how the last slice's tasks were cut.

## Global Constraints

- Everything new is behind `?interior=1`; the yard-unchanged browser check keeps passing.
- No texture, plate, brush-scale or tint tuning beyond making a piece read as what it is. No new lit material, no new art files. 4a's and 4b's rooms are not re-tuned.
- No `Light` objects; the desk and bedside lamps give no light, pool or halo; nothing added to `inside.overlay`; no cast shadows.
- No change to the blueprint's rooms, openings, windows or fittings. No server or persisted-state change. No runtime dependency.
- Nothing depends on the visitor: irregularities come from fixed seeds; the queue's order is fixed; the seen-from table is a pure function of the blueprint.
- Only these may be sculpted: the bed's posts or feet, pillows, folded blanket and the bedclothes' fall; knobs on the wardrobes and desk; the chest's handles. Everything else is kit, through `face`/`lit`.
- Every new recipe picks tints through `pal.surface(name, …)` and emits under `SURFACES[name].mesh`.
- The first build (door wanted) is unchanged and its furniture cost stays at most 80 ms against bare.
- Queue order: `['kitchen', 'dining', 'study', 'passage', 'master']`.
- Each queued room: at most 40 ms to build in its frame; at most 5 meshes with lamps (study, master), at most 4 without (passage, kitchen, dining). Study, passage and master together at most 100 ms.
- New speed poses `[11.9, 0.8]` (study, facing the reading chair) and `[12.5, 7.9]` (master, facing the bed), by day and under the night study with the room's lamp lit by fixture: at most 1.1 times a yard frame, at most 0.05 above the same pose with only the rooms through 4b furnished, at most 6 added draw calls against that.
- The three existing speed poses: with all seven rooms furnished, no more than 0.01 of a yard frame worse than with the rooms through 4b, and no more draw calls.
- The five speed spots do not move.
- Pure modules live in `shared/`, take no three.js, and have Node tests. Tests refer to the blueprint and exported constants, not copies of their numbers, except a rule's own number (0.9 m, 0.25 m).
- Sizes, positions and turns below are starting values; adjust within the validity rules and record the change for As built.
- A new `.js`/`.mjs` file is added to `npm run check` in `package.json`. A capture meant to be kept gets its own `!` line in `.gitignore`.
- Work on branch `claude/interior-furnishing-study-passage-master` (not `main`). Commit after each task with the repository's attribution line. The first commit includes the spec and this plan.

## Review Focus

- A visitor standing on a doorway's line or on the stair: nothing they can see is hidden. For every opening, each of its two rooms sees the other; on the stair everything is drawn (Tasks 1, 6).
- The seen-from table throws or comes back malformed: nothing is ever hidden, and one warning is logged (Task 6).
- A queued room built after `showFrom` was last called: the new set takes the current answer at once, not on the next room change (Task 6).
- A set with shades in a room whose lamp level is missing or not finite: the shades are pale, never `NaN` or black; and after `fallBack()` a set built later still colours its shades (Task 2).
- A visitor remembered inside the bed or a wardrobe falls back to the arrival pose; one remembered in the passage sees the master bedroom's furniture through its door on the first frame (Tasks 5, 6).

## File Structure

- `shared/sight.js` (new) — `seenFrom(I)`: which rooms see which.
- `shared/furniture.js` — new kinds; `withoutRooms` gains `keepQueue`.
- `shared/interior.js` — `FURNISHED` of seven rooms; `throughWays` gains the passage's ways and the two ways in.
- `shared/lakeside-interior.js` — the pieces, the spots, `furnishLater`.
- `public/space/interior/furniture.js` — shades by room; recipes for the new kinds.
- `public/space/interior/index.js` — `showFrom`, `shownRooms`.
- `public/space/space-view.js` — `&furnish=4b`, `&hide=0`, the per-frame `showFrom` call.
- `public/scene-description.js` — three clauses.
- `scripts/check-space-browser.mjs` — checks 90–103, captures; check 71 reworded.
- `test/sight.test.js` (new), `test/furniture.test.js`, `test/interior.test.js`, `test/interior-furniture.test.js`, `test/space-view.test.js`, `test/walker.test.js`, `test/place-memory.test.js`.
- The spec's As built, `README.md`, `.gitignore`, `package.json`.

---

### Task 1: Which rooms see which

**Files:**
- Create: `shared/sight.js`, `test/sight.test.js`
- Modify: `package.json` (`check`: add `node --check shared/sight.js`)

**Interfaces:**
- Produces: `seenFrom(I) → Readonly<Record<roomId, readonly roomId[]>>` (frozen; every room id of `I.rooms` is a key; each list is in `I.rooms` order and includes the room itself). `SIGHT = {grid: .5, widen: .1}` exported.

- [ ] **Step 1: Write the failing tests** in `test/sight.test.js`, against `LAKESIDE_INTERIOR`:

```js
const S = seenFrom(I), sees = (a, b) => S[a].includes(b);
test('every room sees itself, and the table covers every room', () => {
  for (const r of I.rooms) assert.ok(sees(r.id, r.id));
  assert.deepEqual(Object.keys(S).sort(), I.rooms.map(r => r.id).sort());
});
test('the two rooms of every opening see each other', () => {
  for (const o of I.openings) { assert.ok(sees(o.rooms[0], o.rooms[1])); assert.ok(sees(o.rooms[1], o.rooms[0])); }
});
test('seeing is mutual', () => { for (const a of I.rooms) for (const b of I.rooms) assert.equal(sees(a.id, b.id), sees(b.id, a.id)); });
test('walls hide: the kitchen and the study do not see the master bedroom', () => {
  assert.ok(!sees('kitchen', 'master')); assert.ok(!sees('study', 'master')); assert.ok(!sees('dining', 'master'));
});
test('doors show: hall sees study and passage; passage sees master; kitchen sees the study through two openings', () => {
  assert.ok(sees('hall', 'study')); assert.ok(sees('hall', 'passage')); assert.ok(sees('passage', 'master')); assert.ok(sees('kitchen', 'study'));
});
test('the stair joins the floors: hall and landing see each other, and what each sees on its own floor', () => {
  assert.ok(sees('hall', 'landing'));
  for (const b of S.landing) if (I.rooms.find(r => r.id === b).floor === 1) assert.ok(sees('hall', b));
});
test('the same table on two builds, frozen', () => { assert.deepEqual(seenFrom(I), S); assert.ok(Object.isFrozen(S) && Object.isFrozen(S.hall)); });
test('a blueprint with an opening closed loses the sight through it', () => {
  const shut = {...I, openings: I.openings.filter(o => o.id !== 'passage-master')};
  assert.ok(!seenFrom(shut).passage.includes('master'));
});
```

- [ ] **Step 2: Run** `node --test test/sight.test.js`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `seenFrom(I)`.** The algorithm, since the tests do not fix it:
  - Sample points of each room on a `SIGHT.grid` lattice inset by `I.eyeClear` from its walls, plus each of its openings' `doorwayPoint`. Furniture is ignored (a wardrobe does not block sight here: generous).
  - Same floor: A sees B if some segment from a sample of A to a sample of B stays inside the building and, wherever it leaves one room for another, crosses their shared wall line within the span of an opening between those two rooms widened by `SIGHT.widen` at each end. Walk the segment by its crossings of room boundaries (rooms are axis-aligned rectangles; use `roomAt` on the midpoint between consecutive crossings).
  - Across floors: the stair's rooms are the hall (floor 0) and the landing (floor 1), found as the rooms containing `I.stair`'s box on each floor. A sees B on the other floor if A sees its own floor's stair room and B is seen from the other floor's stair room.
  - Make the result symmetric (if either direction is found, both hold) and freeze it.

- [ ] **Step 4: Run** `node --test test/sight.test.js` and `npm run check`. Expected: PASS.

- [ ] **Step 5: Commit** (with the spec and this plan): `git commit -m "Work out which of the cabin's rooms can be seen from which"`

---

### Task 2: A lamp's shade follows its own room's lamp

**Files:**
- Modify: `public/space/interior/furniture.js` (the shades' colour, about lines 45–53 and 830–853)
- Test: `test/interior-furniture.test.js`

**Interfaces:**
- Consumes: `buildFurniture(THREE, {…, only, name})` as it is.
- Produces: a set's `setLight(dials)` colours its `shades` mesh from `dials.lamps[k]`, `k` the index in `I.rooms` of the one room its shades stand in. `SHADE_ROOM` is removed. `buildFurniture` throws `Error('shades in two rooms: …')` if a set's shade pieces stand in more than one room.

- [ ] **Step 1: Write the failing tests** beside the existing shade tests in `test/interior-furniture.test.js`, using their fixture style: a blueprint copy with one `table-lamp` set on a `side-table` in the study, built with `only: new Set(['study'])`.
  - `'a study lamp's shade follows the study's lamp, not the living room's'`: with `lamps[study] = DIALS.lamp, lamps[living] = 0` the shade material's colour equals `SHADE_WARM`; with `lamps[study] = 0, lamps[living] = DIALS.lamp` it is the pale colour (each channel equal to `SHADE_PALE[c] * lightSum(dials, atShades, c)`, and not `SHADE_WARM`).
  - `'the living room's shades are unchanged'`: the first set's colour under the existing test's dials equals what the existing assertion pins.
  - `'a missing or non-finite lamp level leaves the shade pale and finite'`: `setLight({})` and `setLight({lamps: [NaN, …]})` give finite colour channels.
  - `'shades in two rooms are refused'`: a set built with `only: new Set(['study', 'master'])` and a lamp in each throws.

- [ ] **Step 2: Run** `node --test test/interior-furniture.test.js`. Expected: the new tests FAIL (study shade reads the living room's level).

- [ ] **Step 3: Implement.** In `atShades`, collect the room id of every shade range; throw if more than one; keep its `I.rooms` index in place of `livingAt`. Update the comments at lines 13, 45 and 832 that say "the living room's lamp".

- [ ] **Step 4: Run** `node --test test/interior-furniture.test.js test/interior-lit.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Colour a lamp's shade from its own room's lamp"`

---

### Task 3: Kinds, the wider walk, and the comparison switch (no new pieces yet)

**Files:**
- Modify: `shared/furniture.js`, `shared/interior.js`, `shared/lakeside-interior.js` (spots only), `public/space/space-view.js` (`interiorSwitch`)
- Test: `test/furniture.test.js`, `test/interior.test.js`, `test/space-view.test.js`

**Interfaces:**
- Produces:
  - `KINDS.desk = solid([1.5, .7], .75)`, `KINDS.wardrobe = solid([1.0, .6], 2.0)`, `KINDS['double-bed'] = solid([1.6, 2.05], 1.1, {seat: .55})`, `KINDS.chest = solid([1.2, .45], .5)`, `KINDS.pillow = setOn(.14)`, `KINDS.blanket = setOn(.1)`.
  - `FURNISHED = ['hall', 'living', 'kitchen', 'dining', 'study', 'passage', 'master']`.
  - `throughWays(I)` also returns `{room: 'passage', from: <hall–passage doorway>, to: [<passage–master doorway>, <passage–bath-ground doorway>]}`, `{room: 'study', from: <hall–study doorway>, to: [I.spots.shelves]}`, `{room: 'master', from: <passage–master doorway>, to: [I.spots.bedFoot]}`; an entry is left out when its opening or spot is missing.
  - `spots.desk = [15.0, .7]`, `spots.shelves = [14.6, 3.1]`, `spots.wardrobes = [12.5, 5.4]`, `spots.bedFoot = [14.5, 8.8]`, `spots.bedside = [12.7, 11.0]`; `spots.speed` gains `[11.9, .8]` and `[12.5, 7.9]` after the existing three.
  - `withoutRooms(interior, roomIds, {keepQueue = false} = {})`: with `keepQueue`, `furnishLater` is the interior's own less `roomIds`, frozen; without, emptied as now.
  - `SLICE_4C = ['study', 'passage', 'master']` exported from `shared/lakeside-interior.js`. `interiorSwitch`: with `?check`, `&furnish=4b` returns `withoutRooms(LAKESIDE_INTERIOR, SLICE_4C, {keepQueue: true})`; `&bare=1` still wins; `&furnish=first` unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `test/furniture.test.js`: each new kind's footprint and standing (as the existing kind tests); `'a piece set on the bed sits at its mattress, not its headboard'` (`KINDS['double-bed'].seat === .55`); `'withoutRooms with keepQueue keeps the other rooms queued'` (`furnishLater` of `['kitchen','dining','study']` less `['study']` is `['kitchen','dining']`, frozen; default call still gives `[]`).
  - `test/interior.test.js`: update the pinned `FURNISHED`; `'the real blueprint is valid'` still passes; `'rule 8: a blocked passage fails'` (a copy with a `chest` at `[12.5, 5.9]` turned to span the passage is invalid); `'rule 8: a blocked way into the study fails'` (a `bookshelf` at `[12.6, 2.6]` turned `Math.PI / 2`, standing across the room between the door and `spots.shelves` so that less than 0.9 m is left at either end); `'rule 8: a blocked way into the master bedroom fails'` (two wardrobes across `d = 8.2` from `a = 11.6` to `13.6`); each new spot, with a copy that stands a `chest` on it, is invalid; `throughWays(I)` names the rooms `['dining', 'kitchen', 'passage', 'study', 'master']`.
  - `test/space-view.test.js`: `interiorSwitch('?interior=1&check&furnish=4b')` has no piece in `SLICE_4C` rooms, keeps the kitchen's pieces and `furnishLater` equal to `['kitchen', 'dining']`; without `?check` it is `LAKESIDE_INTERIOR`; with `&bare=1` furniture is empty.

- [ ] **Step 2: Run** `node --test test/furniture.test.js test/interior.test.js test/space-view.test.js`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement** the Produces list. In the blocking tests, adjust the blocker's position until the copy fails for rule 8 alone (assert the same copy passes with `throughWays` entries for that room removed, as 4b's blocking tests do).

- [ ] **Step 4: Run** `npm test`. Expected: PASS, the real blueprint valid.

- [ ] **Step 5: Commit**: `git commit -m "Name the study's, passage's and bedroom's kinds and spots, and widen the 0.9 m walk to seven rooms"`

---

### Task 4: The study's pieces

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/space/interior/furniture.js` (`RECIPES.desk`)
- Test: `test/interior.test.js`, `test/interior-furniture.test.js`, `test/walker.test.js`

**Interfaces:**
- Consumes: Task 2's shades by room; Task 3's kinds and spots.
- Produces: blueprint entries, ids as given; `furnishLater` gains `'study'` after `'dining'`.

Starting placements (turn 0 faces −d):

| id | kind | at / wall | turn / size |
|---|---|---|---|
| `study-rug` | `rug` | `[14.6, 2.3]` | `.02`, size `[3.0, 1.6]` |
| `desk` | `desk` | `[13.8, .45]` | `Math.PI` (kneehole to the room) |
| `chair-desk` | `chair` | `[13.8, 1.15]` | `.04` (facing the window) |
| `bookshelf-study-1`, `-2` | `bookshelf` | `[13.4, 3.75]`, `[16.1, 3.75]` | `0` |
| `armchair-study` | `armchair` | `[17.0, 1.0]` | `-Math.PI / 2 - .5` (toward the room's middle) |
| `side-table-study` | `side-table` | `[16.1, .5]` | `0` |
| `picture-study` | `picture` | wall `a` = 18, along `[1.8, 2.6]`, z `1.5` | |
| `desk-lamp` | `table-lamp` | on `desk` | |
| `book-desk-1`, `-2`, `cup-desk` | `book`, `cup` | on `desk` | |
| `book-study-table` | `book` | on `side-table-study` | |

- [ ] **Step 1: Write the failing tests.** `test/interior.test.js`: the real blueprint is valid with these ids present and `I.furnishLater[2] === 'study'`; `'nothing taller than the sill stands before the study window'` (every solid study piece whose footprint meets `a 13.1–14.5, d 0–.6` has `KINDS[kind].height <= .8`). `test/walker.test.js`: walking from `spots.shelves` toward the desk stops at its footprint and slides along it. `test/interior-furniture.test.js`: a set built with `only: new Set(['study'])` skips nothing, has at most 5 meshes, has a `shades` mesh, and `pieceBox('desk')` tops out at `KINDS.desk.height` within 1 cm. The existing test `'a queued set has at most four meshes and reports its own counts and time'` is reworded to the new limit (5 with lamps, 4 without).

- [ ] **Step 2: Run** those three files. Expected: FAIL (no such pieces; no `desk` recipe).

- [ ] **Step 3: Add the entries and `RECIPES.desk`.** The desk is kit: a top with a broken edge, two pedestals with framed drawer fronts on the kneehole side, a plain back toward the window, knobs (the only sculpted part), the underside and kneehole tucked dark as the tables' are. Surfaces: `wood`; knobs `iron`. Where several pieces are set on the desk, place them as the worktop's jars and breadboard are placed (by the entry's index), the lamp at the window-side corner away from the chair. If the desk lamp reads wrong at desk height, stop and note it for As built before adding a kind.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Furnish the study: a desk at the window, a wall of books and a reading chair"`

---

### Task 5: The passage's and the master bedroom's pieces

**Files:**
- Modify: `shared/lakeside-interior.js`, `public/space/interior/furniture.js` (`RECIPES.wardrobe`, `['double-bed']`, `chest`, `pillow`, `blanket`)
- Test: `test/interior.test.js`, `test/interior-furniture.test.js`, `test/walker.test.js`, `test/place-memory.test.js`

**Interfaces:**
- Produces: blueprint entries, ids as given; `furnishLater` is `['kitchen', 'dining', 'study', 'passage', 'master']`.

| id | kind | at / wall | turn / size |
|---|---|---|---|
| `wardrobe-passage-1`, `-2` | `wardrobe` | `[11.7, 4.375]`, `[13.3, 4.375]` | `Math.PI` (doors to the room) |
| `passage-runner` | `runner` | `[12.5, 5.85]` | `.02`, size `[2.6, .8]` |
| `master-rug` | `rug` | `[14.5, 10.3]` | `.02`, size `[3.0, 3.2]` |
| `bed` | `double-bed` | `[14.5, 10.9]` | `0` (head on the back wall) |
| `bedside-1`, `-2` | `side-table` | `[13.4, 11.65]`, `[15.6, 11.65]` | `0` |
| `blanket-chest` | `chest` | `[14.5, 9.55]` | `0` |
| `wardrobe-master-1`, `-2` | `wardrobe` | `[17.625, 9.0]`, `[17.625, 10.0]` | `-Math.PI / 2` |
| `picture-master-1` | `picture` | wall `d` = 12, along `[14.1, 14.9]`, z `1.6` | |
| `picture-master-2` | `picture` | wall `a` = 11, along `[9.0, 9.8]`, z `1.5` | |
| `bedside-lamp-1`, `-2` | `table-lamp` | on `bedside-1`, `bedside-2` | |
| `pillow-1`, `-2`, `bed-blanket` | `pillow`, `blanket` | on `bed` | |
| `book-bedside` | `book` | on `bedside-1` | |

- [ ] **Step 1: Write the failing tests.** `test/interior.test.js`: the real blueprint valid, these ids present, `furnishLater` as above; `'the passage's wall lamp stands between its wardrobes'` (the lamp's `a` is strictly between the two footprints, and neither holds its point). `test/walker.test.js`: walking into the bed's side and into a passage wardrobe stops and slides. `test/place-memory.test.js`: a remembered ground-floor place at `[14.5, 10.9]` (inside the bed) and at `[11.7, 4.4]` (inside a wardrobe) falls back to the arrival pose; one at `spots.wardrobes` is kept. `test/interior-furniture.test.js`: sets built with `only` `passage` and `master` skip nothing; passage has at most 4 meshes and no `shades`; master has at most 5 with `shades`; `pieceBox('pillow-1')` sits within 2 cm above `KINDS['double-bed'].seat`; the master set's shades follow `lamps[master]`.

- [ ] **Step 2: Run** those files. Expected: FAIL.

- [ ] **Step 3: Add the entries and recipes.**
  - `wardrobe` (kit): carcass, plinth, cornice with a broken edge, two framed doors with the dresser's panel treatment, knobs sculpted. `wood`; knobs `iron`.
  - `double-bed`: kit frame, headboard to `KINDS['double-bed'].height` and a lower footboard, posts or turned feet sculpted; the mattress top at `seat`; bedclothes `cloth`, their fall at the sides and foot draped; the underside tucked dark.
  - `chest` (kit): boards, a lid standing 2 cm proud, handles sculpted. `wood`; handles `iron`.
  - `pillow` (rolled, tapering to a seam as the window seat's cushions do) at the head end, side by side by index; `blanket` (draped or folded) across the foot. `cloth`.
  - If the lamp's glass at `[12.5, 4.2]`, 1.8 m up, is touched by a wardrobe's cornice, narrow the wardrobes, not the gap.

- [ ] **Step 4: Run** `npm test` and `npm run check`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Furnish the closet passage and the master bedroom: wardrobes by the lamp, a made bed with a lamp at each side"`

---

### Task 6: Out of sight, not drawn; the description

**Files:**
- Modify: `public/space/interior/index.js`, `public/space/space-view.js`, `public/scene-description.js`
- Test: `test/interior-furniture.test.js` (beside 4b's queue tests, with their `buildQueued` fixture), `test/space-view.test.js`

**Interfaces:**
- Consumes: `seenFrom(I)` (Task 1); `onStair(I, p)` and `roomAt(I, floor, p)` from `shared/interior.js`.
- Produces:
  - `inside.showFrom(roomId | null)`: a queued room's set object is `visible` when `roomId` is `null`, the table is unavailable, or the table says its room is seen from `roomId`; the first set is always visible. The last argument is remembered and applied to a set as `buildNext` adds it.
  - `inside.shownRooms` (getter): the built rooms whose set is currently visible, in build order.
  - `SpaceView`: each frame with an interior, `inside.showFrom(r)` where `r` is the visitor's room id when `state.place === 'cabin'`, not `onStair`, and hiding is on; otherwise `null`. Hiding is off with `?check&hide=0` (a second export beside `interiorSwitch`: `hidingSwitch(search) → boolean`, true unless `?check` and `hide=0`).
  - `FURNISHED_TEXT` gains `'study'`, `'closet passage'`, `'master bedroom'`.

- [ ] **Step 1: Write the failing tests.**
  - `test/interior-furniture.test.js`: after `buildRest()`, `showFrom('kitchen')` leaves `shownRooms` without `'master'` and with `'kitchen'`, `'dining'`, `'study'`; `showFrom('passage')` includes `'master'`; `showFrom(null)` shows every built room; the first set's object stays visible throughout; `counts`, `furnishedRooms` and `skipped` are the same before and after hiding.
  - `'a room built after showFrom takes the current answer'`: `showFrom('kitchen')` before any `buildNext()`, then `buildRest()`: `shownRooms` has no `'master'`.
  - `'no table, nothing hidden'`: build with a `seenFrom` that throws (inject through `buildInterior`'s options as `sight`, default `seenFrom`); one `console.warn`; `showFrom('kitchen')` shows everything.
  - `test/space-view.test.js`: a view placed in the kitchen calls through so that `inside.shownRooms` lacks `'master'`; placed on the stair (`onStair` true) or in the yard, every built room is shown; with `?check&hide=0` every built room is shown from the kitchen; `hidingSwitch('?hide=0')` is `true` (ignored without `?check`); a view started in the passage reports `pending: []` and `shownRooms` including `'master'` on its first frame; `sceneText(…, {room: 'study', furnished: true})` includes the study's clause and `{furnished: false}` does not.

- [ ] **Step 2: Run** `node --test test/interior-furniture.test.js test/space-view.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Build the table once in `buildInterior` inside a `try`; keep each queued set's room beside it. Clause wording (fixed copy): study `'A desk stands at the window and books line the back wall. '`; closet passage `'Wardrobes stand along one wall. '`; master bedroom `'A double bed stands against the back wall, a lamp at each side. '`.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Draw a room's furniture only where it can be seen from, and describe the three new rooms"`

---

### Task 7: Browser checks, captures and As built

**Files:**
- Modify: `scripts/check-space-browser.mjs`, the spec (Status line; As built), `README.md`, `.gitignore`
- Create: captures under `docs/interior-validation/`

Start the server as `CLAUDE.md` says (`A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start`), then `node scripts/check-space-browser.mjs`. "Baseline" below is a load with `&furnish=4b`.

- [ ] **Step 1: Reword check 71**: at most 5 meshes in the first set and in a queued room with lamps (study, master), at most 4 in the others; six sets. Find every existing check that stands, samples or captures in the study, passage or master bedroom (part 3's windowless-room capture, the study's pane spot, any reading of the passage's wall) and run the suite to see which now fail; move each failing spot to the nearest clear place that tests the same thing, or load it with `&furnish=4b` as 4b did with `&furnish=first`, and list each change for As built.

- [ ] **Step 2: Add checks, in this order, numbered from 90:**
  - 90: queued builds of study, passage, master, median of three loads: each ≤ 40 ms, together ≤ 100 ms; meshes ≤ 5, ≤ 4, ≤ 5; vertices recorded. Also record, for a load started indoors in the master bedroom, the furniture time of all seven rooms.
  - 91: speed at `[11.9, 0.8]` facing `[17.0, 1.0]`, day and night (study lamp lit by `fixtureLamps`): ≤ 1.1× a yard frame and ≤ +0.05 over baseline.
  - 92: speed at `[12.5, 7.9]` facing `[14.5, 10.9]`, day and night (master lamp lit): same limits.
  - 93: draw calls at both new poses: ≤ +6 over baseline.
  - 94: the three existing speed poses, day and night: all-furnished no more than +0.01 over baseline, draw calls not higher.
  - 95: the desk lamp's shade (a patch read as check 75 reads the table lamp's): study lamp out and living lamp lit → pale; study lit and living out → warm, within check 75's tolerance of its warm reading; in both loads the living room's shade follows the living room's lamp.
  - 96: the same for `bedside-lamp-1` with the master bedroom's lamp.
  - 97: hiding changes no pixel: at each of the five speed poses and the hall's capture pose, a frame from a default load and one from `&hide=0` at the same paused world moment differ by 0.
  - 98: at `[5.2, 7.9]` `shownRooms` has no `'master'`; at `spots.wardrobes` it has `'master'`; in the yard it has every built room.
  - 99: entering through the door, at the first indoor frame `pending` is `[]` and all seven rooms are in `furnishedRooms`. 100: the same with reduced motion.
  - 101: started indoors in the master bedroom: `pending: []`, `furnished: true`, the description holds the master bedroom's clause.
  - 102: two loads at the same world moment draw the same study and the same master bedroom (0 difference), and a baseline load differs.
  - 103: after `inside.fallBack()` all three rooms keep every mesh and their mean luminance is in the range 4b's `fallBack()` check uses for the kitchen and dining room.

- [ ] **Step 3: Take the captures** the spec lists under Checks (study from its door by day and lit; desk and window; bookshelves and reading corner; passage by day and lit; master from its door by day and lit; bed and lamps close to, lit and out; gable wardrobes; study door from the hall; master through the passage from the hall door; low under the bed; all three after `fallBack()`). Add a `!` line to `.gitignore` for each one kept.

- [ ] **Step 4: Run the whole suite.** Expected: every check passes, 0 page or console errors. If a budget is missed, apply the spec's remedies in order (fewer cuts in kit faces, coarser sculpted forms, fewer dressing pieces) and re-run; if a must-have would have to go, stop and report.

- [ ] **Step 5: Write up.** Spec: Status line to "built behind `?interior=1`, awaiting owner review"; an **As built** section in 4b's shape (where things live; placements changed from this plan's tables; which pieces are sculpted; check spots and checks changed; measured numbers for checks 90–94; anything cut for speed; known weak points as the captures show them, the passage's wardrobes and lamp among them). `README.md`: the interior bullet names the three rooms and says furniture out of sight is not drawn. Run `npm run check && npm test`.

- [ ] **Step 6: Commit**: `git commit -m "Check and capture the study, passage and master bedroom, and record what was built"`
