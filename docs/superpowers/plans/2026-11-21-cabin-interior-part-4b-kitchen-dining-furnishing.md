# Cabin Interior Part 4b (Kitchen and Dining Room Furnishing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?interior=1`, the kitchen and the dining room are furnished in the accepted layout, made 4a's way, without lengthening the build that runs as the front door opens.

**Architecture:** New kinds, placements and named spots are data in `shared/`; `validInterior` gains the wider 0.9 m walk and the ways through each room. `buildFurniture` learns to build only some rooms' pieces, so `buildInterior` builds the hall and living room as now and keeps the blueprint's `furnishLater` rooms in a queue of per-room mesh sets. `SpaceView` builds one queued room a frame and empties the queue before the entry's fade-in.

**Tech Stack:** Plain ES modules, three.js 0.170 (vendored, handed in), `node --test`, the Playwright script `scripts/check-space-browser.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-21-cabin-interior-part-4b-kitchen-dining-furnishing-design.md`. Read it, and the design and As built sections of `docs/superpowers/specs/2026-11-21-cabin-interior-part-4a-living-hall-furnishing-design.md`, which it builds on.

## Global Constraints

- Everything new is behind `?interior=1`; the yard-unchanged browser check keeps passing.
- No texture, plate, brush-scale or tint tuning beyond making a piece read as what it is. No new lit material, no new art files. 4a's rooms are not re-tuned.
- No `Light` objects, no glow on the range, nothing added to `inside.overlay`, no cast shadows.
- No change to the blueprint's rooms, openings, windows or fittings. No server or persisted-state change.
- Nothing depends on the visitor: irregularities come from fixed seeds; the queue's order is fixed.
- Only these may be sculpted: chair legs and back spindles; pans, kettle, jug, bowls, plates, cups; the loaf; the cloth; the flue pipe, the range's rail, the tap. Everything else is kit.
- The first build (door wanted) builds only the hall's and living room's furniture, and its furniture cost stays at most 80 ms against bare.
- Each queued room: at most 4 meshes (wood, cloth, stone, grounding), at most 40 ms to build in its frame.
- Every furnished room is built before the entry's fade-in begins (or the cut, with reduced motion), and at load for a visitor who starts indoors.
- Speed: 4a's two poses keep their limits. At the new spot `[5.2, 7.9]` facing the dining window, by day and under the night study with both lamps lit: at most 1.1 times a yard frame, at most 0.05 above the same pose with only 4a's rooms furnished, at most 8 added draw calls against that.
- The three speed spots do not move.
- Pure modules live in `shared/`, take no three.js, and have Node tests. Tests refer to the blueprint and exported constants, not copies of their numbers, except a rule's own number (0.9 m, 0.25 m).
- Sizes, positions and turns below are starting values; the builder may adjust them within the validity rules.
- Work on branch `claude/interior-furnishing-kitchen-dining` (not `main`). Commit after each task with the repository's attribution line. The first commit includes the spec and this plan.

## Review Focus

- The queue is not empty when the visitor reaches the doorway (a fast walk, a slow device): what is left is built at once before the fade-in, never seen appearing (Task 5).
- A visitor remembered in the kitchen sees it furnished on the first frame; one remembered inside the kitchen table falls back to the arrival pose (Tasks 1, 5).
- A queued room whose build throws: the other rooms are still built, and the walker stops being blocked by that room's pieces even though an earlier walk plan was already worked out (Tasks 2, 5).
- `fallBack()` called while a room is still queued: that room, built afterwards, takes the flat materials too (Task 2).
- `dispose()` with rooms still queued, then `buildNext()`: nothing is built, nothing throws (Task 2).

## File Structure

- `shared/furniture.js` — new kinds; `piecesIn`, `withoutRooms`.
- `shared/interior.js` — rule 8 widened, ways through, any-named-spot rule, the window rule.
- `shared/lakeside-interior.js` — `furnishLater`, the new pieces, the new spots.
- `public/space/interior/furniture.js` — `only` option, `SURFACES`, the new recipes.
- `public/space/interior/furniture-kit.js` — helpers only if a new recipe needs one.
- `public/space/interior/index.js` — the queue of furniture sets.
- `public/space/space-view.js` — driving the queue; `&furnish=first`; per-room `furnished`.
- `public/scene-description.js` — two clauses.
- `scripts/check-space-browser.mjs` — captures, checks, moved spots.
- Tests: `test/furniture.test.js`, `test/interior.test.js`, `test/interior-furniture.test.js`, `test/space-view.test.js`, `test/place-memory.test.js`.

---

### Task 1: Kinds, helpers and rules (no new pieces in the blueprint yet)

**Files:**
- Modify: `shared/furniture.js`, `shared/interior.js`, `shared/lakeside-interior.js` (spots and `furnishLater` only)
- Test: `test/furniture.test.js`, `test/interior.test.js`

**Interfaces:**
- Produces, in `shared/furniture.js`:
  - `KINDS` entries — solid: `'sink-unit'` `[1.3, .6]` h .9; `range` `[1.0, .6]` h .9; `worktop` `[1.6, .6]` h .9; `dresser` `[1.2, .45]` h 2.0; `'kitchen-table'` `[1.5, .8]` h .75; `'dining-table'` `[1.8, .9]` h .75; `chair` `[.45, .45]` h .9, `seat: .45`; `sideboard` `[1.6, .45]` h .85. Wall-hung: `'pan-rail'` h .05. Set-on: `pan` .3, `kettle` .22, `cloth` .05, `jar` .18, `breadboard` .03, `loaf` .1, `bowl` .1, `plates` .12, `cup` .09 (existing).
  - `piecesIn(interior, roomIds: string[]) -> string[]` — ids of the furniture entries whose `room` is one of them.
  - `withoutRooms(interior, roomIds: string[]) -> interior` — `withoutPieces(interior, piecesIn(interior, roomIds))` with `furnishLater` set to `[]`.
- Produces, in `shared/interior.js`:
  - `FURNISHED = ['hall', 'living', 'kitchen', 'dining']` (exported); `furnishedWay(I, rooms = ['hall', 'living'])`; `wideTargets(I, rooms = ['hall', 'living'])` keeps today's meaning for its default.
  - `throughWays(I) -> {room, from: [a, d], to: [a, d][]}[]`: dining from the kitchen–dining doorway point to the hall–dining one; kitchen from the living–kitchen doorway point to the kitchen–dining, kitchen–laundry and kitchen–pantry ones.
- Produces, in the blueprint: `furnishLater: ['kitchen', 'dining']`; `spots` gains `range: [4.4, 10.9]`, `dresser: [3.5, 9.5]`, `diningWindow: [10, 11.4]`, and `speed` a third entry `[5.2, 7.9]`.

Rules added to `furnitureFit` (numbered on from 4a's):
- Rule 7 now requires **every** entry of `spots` other than `speed` (not only the three it names today), each `speed` spot and the stair foot to be reachable from the arrival spot at the ordinary clearance.
- Rule 8 keeps today's check unchanged (hall and living, cut down), and adds: (8b) over `furnishedWay(I, FURNISHED)`, every doorway point of a ground-floor opening touching a `FURNISHED` room, and the stair foot, reachable from the arrival spot at `WIDE_CLEAR`; (8c) for each of `throughWays(I)`, every `to` reachable from `from` at `WIDE_CLEAR` over `furnishedWay(I, [room])`.
- Rule 9: no solid piece taller than a wall window's `sill` overlaps the rectangle 0.6 m deep in front of that window's span, in the window's room.

- [ ] **Step 1: Write the failing tests.** In `test/furniture.test.js`: each new kind's standing and footprint (a chair turned π/2 keeps `[.45, .45]`; a `dining-table` turned π/2 is 0.9 along `a` and 1.8 along `d`); `piecesIn` on a three-piece interior; `withoutRooms` drops those rooms' pieces and what is set on them, re-derives `obstacles`, and has `furnishLater` `[]`. In `test/interior.test.js`, each built from `LAKESIDE_INTERIOR` plus entries through a small local helper `withPieces(extra, spots?)` that re-derives `obstacles` with `obstaclesOf`:

```js
test('the real blueprint is valid, with the new spots and the third speed spot', ...)          // validInterior(LAKESIDE_INTERIOR) === true
test('a table across the kitchen blocks the way through it', ...)        // kitchen-table size [3.9, .8] at [4.75, 9.5] → false
test('a table across the dining room blocks the way through it', ...)    // dining-table size [3.4, .9] at [9, 8.2], turn 0 → false
test('a piece on a new named spot makes the blueprint invalid', ...)     // a chair at spots.range, at spots.dresser, at spots.diningWindow → false each
test('a piece on the third speed spot makes the blueprint invalid', ...)
test('a sideboard under the dining window makes the blueprint invalid; a chair there does not', ...)  // sideboard at [10, 11.7] → false; a 0.45 m window-seat kind there → true
test('throughWays names the dining room once and the kitchen once, by doorway points of the blueprint', ...)
test('a kitchen table as planned leaves a 0.9 m way to the pantry and laundry doors', ...)  // kitchen-table at [4.75, 9.5], dresser at [2.8, 9.5] turn π/2 → true
```

- [ ] **Step 2: Run** `node --test test/furniture.test.js test/interior.test.js`. Expected: the new tests fail (unknown kinds, missing exports).
- [ ] **Step 3: Implement** the kinds, `piecesIn`, `withoutRooms`, the blueprint's `furnishLater` and spots, and the rules above. If the dining way-through test passes only on a single row of the 0.1 m flood grid, note it for Task 4, which may move the table up to 0.15 m toward the window.
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including every existing test.
- [ ] **Step 5: Commit** (`Interior 4b: kinds, ways through and spots for the kitchen and dining room`).

### Task 2: Furniture built by room, and the queue

**Files:**
- Modify: `public/space/interior/furniture.js`, `public/space/interior/index.js`
- Test: `test/interior-furniture.test.js`

**Interfaces:**
- Consumes: `piecesIn`, the blueprint's `furnishLater`.
- Produces:
  - `buildFurniture(THREE, {..., only = null})` — `only` is a `Set` of room ids or null; with it, only entries whose `room` is in it are made, grounded and reported; a set-on piece is resolved against the whole blueprint as now.
  - `buildInterior(...)` result:
    - `pending: string[]` — room ids not yet built, in `furnishLater`'s order (a copy; empty for a blueprint with no `furnishLater` or no furniture).
    - `buildNext(): string | null` — builds the next room's set, adds its object to the scene, and returns its id; null when none is left or after `dispose()`.
    - `buildRest(): void` — `buildNext()` until null.
    - `furnishedRooms: string[]` — rooms whose furniture is built (the first build's rooms, then each queued room as it is built; a room whose build threw is not in it).
    - `furniture` (counts): `{vertices, meshes, sets: [{rooms: string[], vertices, meshes, ms}]}`, totals over all built sets; `ms` is the set's own build time by `performance.now()`.
    - `skipped`, `pieceBox`, `setLight`, `fallBack`, `dispose` cover every built set. `furnished` keeps its meaning (the first build's furniture is drawn).
- Behaviour pinned:
  - The first build makes the pieces of every room **not** in `furnishLater`.
  - A queued room's build that throws: one warning naming the room; every id of `piecesIn(I, [room])` is added to `skipped`; later rooms still build.
  - After `fallBack(flat)`, a set built later is given `fallBack(flat)` as soon as it is built.
  - A queued room with no pieces builds nothing and is still taken off `pending`.

- [ ] **Step 1: Write the failing tests** in `test/interior-furniture.test.js`, using a test blueprint: the real one plus one `chair` in the kitchen at `[4.75, 8.5]` and one in the dining room at `[9, 8.3]` (obstacles re-derived), and a `chair` recipe passed through `recipes` (a `kit` box) so the tests do not depend on Task 3:

```js
test('the first build draws only the rooms not queued; the queue is the blueprint\'s, in order', ...)
  // pieceBox('sofa') set, pieceBox(kitchen chair) null, pending equals ['kitchen', 'dining'], furnishedRooms has hall and living only
test('buildNext builds one room and returns its id; buildRest empties the queue', ...)
  // 'kitchen' → pieceBox(kitchen chair) set, pending ['dining']; buildRest → pending [], buildNext() === null
test('a queued set has at most four meshes and reports its own counts and time', ...)
  // furniture.sets.length 3; sets[1].rooms equals ['kitchen']; sets[1].meshes <= 4; Number.isFinite(sets[1].ms)
test('a queued room whose recipe throws leaves the rest built, warns once and names its pieces in skipped', ...)
test('given up for the flat light before a room is built, that room takes the flat materials when built', ...)
test('disposed with rooms queued, buildNext builds nothing and does not throw', ...)
test('the same queued room twice: two builds give identical positions', ...)
test('a blueprint built bare has nothing pending', ...)   // bareInterior(...) → pending []
```

Update `'the furniture is built with the rooms, in at most five meshes'` to assert at most 5 for `sets[0]`.

- [ ] **Step 2: Run** `node --test test/interior-furniture.test.js`. Expected: the new tests fail.
- [ ] **Step 3: Implement.** In `index.js`, keep one list of sets; the existing single `furniture` becomes the first set, and the per-set calls (`setLight`, `fallBack`, `dispose`, `pieceBox`, counts, `skipped`) loop over the list. Each queued build uses its own `coarseWeigh()`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** (`Interior 4b: furniture built room by room from a queue`).

### Task 3: The kitchen's pieces

**Files:**
- Modify: `public/space/interior/furniture.js` (and `furniture-kit.js` only for a helper two recipes share), `shared/lakeside-interior.js`
- Test: `test/interior-furniture.test.js`, `test/interior.test.js`, `test/place-memory.test.js`

**Interfaces:**
- Produces: `SURFACES` (exported from `furniture.js`): `{wood, cloth, stone, iron, copper, china, enamel}`, each `{mesh: 'wood' | 'cloth' | 'stone', colour: <a key of COLOURS>}`; the palette gains `pal.surface(name, k, spread, times)` returning that surface's tint. **Every new recipe takes its tints through `pal.surface` and returns its geometry under `SURFACES[name].mesh`**, so a later texture pass can find each surface by name. 4a's recipes are left as they are.
- Produces: recipes for `sink-unit`, `range`, `worktop`, `dresser`, `kitchen-table`, `chair`, `pan-rail`, `pan`, `kettle`, `cloth`, `jar`, `breadboard`, `loaf`, `bowl`, `plates`, `cup` (extended to stand on a dresser shelf).

Blueprint entries (kitchen; turn 0 faces −d):

| id | kind | at / wall | turn |
|---|---|---|---|
| `sink-unit` | sink-unit | [3.25, 11.62] | 0 |
| `range` | range | [4.4, 11.62] | 0 |
| `worktop` | worktop | [5.7, 11.62] | 0 |
| `dresser` | dresser | [2.8, 9.5] | π/2 |
| `kitchen-table` | kitchen-table | [4.75, 9.5] | 0 |
| `chair-kitchen-1`, `-2` | chair | [4.35, 8.82], [5.15, 8.82] | π + .06, π − .1 |
| `pan-rail` | pan-rail | wall `d` line 12, along [4.0, 6.2], z 1.75 | |

Set on: five `pan` on `pan-rail`; `kettle` and `cloth` on `range`; three `jar` and `breadboard` on `worktop`; `bowl-kitchen` and `loaf` on `kitchen-table`; three `plates` and two `cup` on `dresser`.

What each must show: the range a dark iron body with a rail along its front and a flue pipe rising from its back to the ceiling (drawn only; the footprint is the body's); the sink unit a worktop with a sunk basin and a tap; the dresser a cupboard below and open shelves above, their insides tucked (`TUCK`), plates standing on the shelves; chairs with four legs, a seat and a spindle back; the tables' undersides tucked.

- [ ] **Step 1: Write the failing tests.**

```js
// test/interior.test.js
test('the real blueprint with the kitchen furnished is valid', ...)
// test/interior-furniture.test.js (after buildRest())
test('the real blueprint skips nothing once every room is built', ...)                 // skipped equals []
test('every solid kitchen piece is drawn inside its footprint and stands on the floor; the flue alone rises above the range\'s height, to the ceiling', ...)
test('the kitchen is one queued set of at most four meshes', ...)
test('the pans hang below the rail and in front of the wall\'s face, none in the worktop or the range', ...)
test('the plates stand within the dresser\'s box, above its cupboard', ...)
test('the insides of the dresser\'s shelves are darker than its sides', ...)           // as the bookshelf's test
test('nothing in the kitchen hangs lower than 2 m over a standable point', ...)        // pans and flue are over solid pieces
test('every surface named in SURFACES maps to a mesh that exists and a colour in the palette', ...)
test('every kitchen solid has a grounding patch', ...)
// test/place-memory.test.js
test('a remembered place inside the kitchen table falls back', ...)                    // [4.75, 9.5] indoors, floor 0
```

- [ ] **Step 2: Run** `node --test test/interior.test.js test/interior-furniture.test.js test/place-memory.test.js`. Expected: fail (no entries, no recipes).
- [ ] **Step 3: Implement** `SURFACES`, the recipes and the entries. Add the palette colours the surfaces name (iron, copper, china, enamel) to `COLOURS`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including the walking tests of 4a.
- [ ] **Step 5: Commit** (`Interior 4b: the kitchen furnished`).

### Task 4: The dining room's pieces

**Files:**
- Modify: `public/space/interior/furniture.js`, `shared/lakeside-interior.js`
- Test: `test/interior-furniture.test.js`, `test/interior.test.js`, `test/walker.test.js`

**Interfaces:**
- Consumes: `chair`, `bowl`, `plates`, `pal.surface` from Task 3.
- Produces: recipes for `dining-table`, `sideboard`; `jug` and `candlestick` extended to stand on a piece's top when their parent is not the mantel (the mantel's narrowing stays for the mantel only).

Blueprint entries (dining room):

| id | kind | at / wall | turn |
|---|---|---|---|
| `dining-rug` | rug, size [2.9, 3.6] | [9, 9.5] | .02 |
| `dining-table` | dining-table | [9, 9.5] | π/2 |
| `chair-dining-1`, `-2` | chair (kitchen side) | [8.28, 9.05], [8.28, 9.95] | π/2 + .05, π/2 |
| `chair-dining-3`, `-4` | chair (window side) | [9.72, 9.05], [9.72, 9.95] | −π/2, −π/2 − .08 |
| `chair-dining-5` | chair (hall end) | [9, 8.33] | π |
| `chair-dining-6` | chair (back end) | [9, 10.67] | 0 |
| `sideboard` | sideboard | [8.3, 11.7] | 0 |
| `picture-4`, `picture-5` | picture | wall `a` line 11, along [8.2, 9.0] and [9.9, 10.7], z 1.5 | |

Set on: `jug-sideboard` and `plates-sideboard` on `sideboard`; two `candlestick` and `bowl-dining` on `dining-table`.

- [ ] **Step 1: Write the failing tests.**

```js
// test/interior.test.js
test('the real blueprint with both rooms furnished is valid', ...)
test('the dining window spot is reachable down the side wall', ...)       // reachable(I, 0, I.entry.position, I.spots.diningWindow)
test('the way down the side wall to the window is 0.9 m wide', ...)       // reachable(..., [10.44, 11.2], .45); if this cannot hold, delete the test and say so in As built (the spec holds it only to 0.25 m)
// test/interior-furniture.test.js (after buildRest())
test('every solid dining piece is drawn inside its footprint and stands on the floor', ...)
test('the dining room is one queued set of at most four meshes', ...)
test('the six dining chairs face the table: each chair\'s back is on its side away from the table\'s middle', ...)
test('the chairs are not all alike: two are turned off square', ...)
test('the table\'s things stand on its top, and the lamp above it hangs clear of them', ...)   // every vertex of candlesticks and bowl below the dining fitting's z − .3
test('the sideboard and its things stay left of the window\'s span', ...)
test('the jug on the sideboard is its full width; the one on the mantel is still narrowed', ...)
test('the real blueprint skips nothing once every room is built', ...)   // still holds
// test/walker.test.js
test('walking at a dining chair stops the eye\'s clearance short of it and slides along it', ...)
test('walking from the hall opening round the table to the dining window arrives', ...)
```

- [ ] **Step 2: Run** those three files. Expected: fail.
- [ ] **Step 3: Implement** the recipes and entries. If Task 1 noted a thin way through, set `dining-table` (and its chairs, rug and set-on pieces with it) up to 0.15 m toward the window.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** (`Interior 4b: the dining room furnished`).

### Task 5: Driving the queue from the view; the description

**Files:**
- Modify: `public/space/space-view.js`, `public/scene-description.js`, `public/app.js` only if it passes `furnished` through
- Test: `test/space-view.test.js`, `test/world-client.test.js` or wherever `sceneText`'s `furnished` is tested today

**Interfaces:**
- Consumes: `inside.pending`, `buildNext`, `buildRest`, `furnishedRooms`, `skipped`; `withoutRooms`.
- Produces in `SpaceView`:
  - The frame's update calls `inside.buildNext()` at most once a frame while `inside.pending.length`, and never in the frame in which `buildInside()` first ran.
  - `buildRest()` is called (a) right after `buildInside()` when the view is built with the visitor already in the cabin, and (b) at the moment the entry passage hands the visitor indoors, before the first indoor frame is drawn, with or without reduced motion.
  - With `?check`, `&furnish=first` gives the view `withoutRooms(LAKESIDE_INTERIOR, LAKESIDE_INTERIOR.furnishLater)`; without `?check` it is ignored. `&bare=1` wins over it.
  - `walkPlan` re-derives its part plan whenever `inside.skipped` has grown (key the memo by `skipped.length`).
  - `furnished` (the getter the description uses) is true only when the room the visitor is in has its id in `inside.furnishedRooms`.
- Produces in `scene-description.js`: `FURNISHED_TEXT` gains `'kitchen': 'A range stands on the back wall and a table in the middle. '` and `'dining room': 'A table is laid for six by the window. '`.

- [ ] **Step 1: Write the failing tests** in `test/space-view.test.js`, in the style of its existing interior tests (a stubbed renderer and `buildInterior` seam if the file has one; else through the public state):

```js
test('after the door is wanted, each later frame builds one queued room, the first frame none', ...)
test('the visitor handed indoors with rooms still queued finds every room built before that frame is drawn', ...)
test('the same with reduced motion', ...)
test('a view that starts in the cabin has every room built at once', ...)
test('a queued room that fails is dropped from the walk plan, even after a walk plan was already read', ...)
  // read walkPlan, make the dining room's build throw, buildNext twice, then canStep into where the dining table stands is true
test('&furnish=first with ?check furnishes only the first rooms and walks without the others\' pieces; without ?check it is ignored', ...)
test('furnished is false in a room still queued and true once it is built', ...)
```

And for the description: `sceneText` in the kitchen and in the dining room with `furnished: true` contains its clause; with `furnished: false` it does not.

- [ ] **Step 2: Run** `node --test test/space-view.test.js test/world-client.test.js`. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run check`. Expected: all pass.
- [ ] **Step 5: Commit** (`Interior 4b: the furniture queue driven from the view`).

### Task 6: Browser checks, captures and As built

**Files:**
- Modify: `scripts/check-space-browser.mjs`, the spec (As built), `docs/interior-validation/*`, `package.json` (version, as earlier parts did)

**Interfaces:**
- Consumes: `&furnish=first`, `inside.furniture.sets`, `inside.pending`, `I.spots`.

Existing checks, changed (each to be listed in As built with what it became):

| Check | Now | Becomes | Why |
|---|---|---|---|
| 71 | at most 5 furniture meshes | at most 5 in `sets[0]` and at most 4 in each later set | per-room sets |
| 73 | furnished against `&bare=1`: at most 6 calls, at most 80 ms | `&furnish=first` against `&bare=1`, same limits; with all rooms furnished the calls at that pose are recorded and at most 4 more | the first build is 4a's rooms only |
| pane spot `dining` | [10, 9] | a standable spot by the window, starting from [10.45, 11] | beside a chair |
| 43 | from [3.2, 10] | a standable kitchen spot that still looks along the back wall at the dining window, starting from [3.4, 10.6] | beside the dresser |
| 59, 66 | default load | loaded with `&furnish=first` | their wall strip, floor patch and floor line are the shell's light, now behind tables, chairs, the rug and the sideboard |

Every moved spot is asserted standable in the check itself, as 4a's check 42 does.

New captures (`furnish-*.jpg`, poses computed from the blueprint): `kitchen-day`, `kitchen-night` (its lamp lit by fixture) from the living–kitchen opening; `range` close to; `dresser`; `dining-day`, `dining-night` from the hall–dining opening; `dining-from-kitchen-side` with the window beyond; `dining-window` at `spots.diningWindow` looking out; `kitchen-from-hearth` from `spots.hearth`; `dining-from-arrival` from the entry pose; `low-dining-floor`; `fallback-kitchen`, `fallback-dining`.

New checks:
1. Speed at `spots.speed[2]` facing the dining window, day and night study with the kitchen's and dining room's lamps lit by fixture: at most 1.1 times a yard frame; at most 0.05 above the same pose with `&furnish=first` on the same run.
2. Draw calls at that pose: at most 8 more than with `&furnish=first`. Vertices recorded per set.
3. Each queued set's `ms`, median of three loads: at most 40.
4. Entering through the door by holding W: at the first frame with `place === 'cabin'`, `inside.pending` is empty and both rooms' meshes are in the scene. The same with reduced motion emulated.
5. A load that starts indoors (stored place in the kitchen): `pending` empty at the first frame, and the description carries the kitchen's clause.
6. Walking from the living–kitchen opening by W and turns through the kitchen and the dining room into the hall arrives in the hall; walking straight at the kitchen table from `[4.75, 7.9]` stops the eye's clearance short of it, and with `&furnish=first` goes past.
7. The same moment draws the same furnished kitchen on three loads within 2%; a `&furnish=first` load differs by more.
8. After `inside.fallBack()` both rooms are still drawn with their furniture.
9. No page or console errors in these visitors.

- [ ] **Step 1: Add** the changed checks, new checks and captures to the script.
- [ ] **Step 2: Run** `node scripts/check-space-browser.mjs` on a quiet machine. Expected: every check passes. If a speed, call or build limit is missed, apply the spec's remedies in order (fewer cuts in kit faces, coarser sculpted forms, fewer dressing pieces) and re-run; if a must-have or a chair would have to go, stop and ask the owner.
- [ ] **Step 3: Look at every capture.** Fix only what is wrong as layout: a piece in a wall, floating, facing the wrong way, in the way of an opening or the window. Do not tune surfaces.
- [ ] **Step 4: Write the spec's As built section**: placements as they ended, every moved check spot, which pieces are sculpted, the measured speeds, calls, vertices and build times, anything cut, and known weak points as the captures show them. Set the spec's status line.
- [ ] **Step 5: Run** `npm test && npm run check`. Expected: pass.
- [ ] **Step 6: Commit** (`Interior 4b: checks, captures and as built`) with the captures and `browser-results.json`.
