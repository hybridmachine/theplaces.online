# Cabin Interior Part 4a (Living Room and Hall Furnishing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?interior=1`, the living room and the entry hall are furnished to a finished standard: pieces that stop the walker, take the painted-in light, sit on the floor, and are made by a kit the other rooms will reuse.

**Architecture:** Where each piece stands is data in the blueprint. A pure module in `shared/` knows each kind's footprint and standing, and derives the walker's obstacles; `validInterior` gains the furniture's rules. A drawing module beside `fireplace.js` holds flat kit helpers built on `buildInterior`'s `face`, sculpted helpers weighed per vertex by the same light field, and one recipe per kind. All furniture merges into five meshes. Grounding is one transparent dark mesh laid on the floor; lamp shades are one emitted mesh following the living room's lamp dial. No light sources, no halos, nothing in the overlay.

**Tech Stack:** Plain ES modules, three.js 0.170 (vendored at `public/assets/vendor/three-0.170.0.module.js`, handed in), `node --test`, the Playwright script `scripts/check-space-browser.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-21-cabin-interior-part-4a-living-hall-furnishing-design.md` (first slice of part 4 of `docs/superpowers/specs/2026-11-17-cabin-interior-design.md`; read both, and the "As built" section of `2026-11-20-cabin-interior-part-3-light-design.md`, especially "The contract for part 4").

## Global Constraints

- Everything new is behind `?interior=1`. Without it nothing a visitor sees changes, and the yard-unchanged browser check keeps passing with all differences 0.
- No server, world-state or persisted-state change. No new art files: `artFiles().length` is unchanged. If brushwork reads too coarse after trying a finer `tile`, stop and ask the owner; do not add plates.
- No change to the blueprint's rooms, openings, windows, fireplace or fittings, or to `stair` and how it is walked.
- Nothing about furniture or its lamps depends on the visitor: irregularities come from fixed seeds; lamp shades follow the living room's lamp dial only.
- No `Light` objects, no cast shadows, no halos on the new lamps, nothing added to `inside.overlay`.
- Only these pieces may be sculpted (curved geometry not made by `face`): sofa and armchair arms and backs, newel and balusters, lamp bases and shades, log basket and logs, jug and candlesticks, umbrella stand, coats, hat and throw. Everything else is kit.
- Other rooms stay bare.
- Speed: at `[4.2, 3]` facing the living window a frame costs at most 1.1 times a yard frame, by day and under the `night` study. At `[3.8, 5.5]` facing the window at night the furnished frame costs at most 0.05 (of a yard frame) more than the bare one on the same run. Both spots stay standable.
- Budget: at most 6 added draw calls; at most 60 ms added to the interior's first build.
- If furniture fails to build: rooms stay bare, the walker uses the chimney breasts alone, one warning, nothing thrown per frame.
- Furniture takes part in `fallBack()`.
- Pure modules live in `shared/`, take no three.js, and have Node tests. Every new `.js` file is added to the `check` script in `package.json` in the task that creates it.
- Interior frame, metres: `a` 0–18, `d` 0–12, z up from the ground floor; three x = a, y = up, z = −d (`toThree`).
- Sizes, positions, turns and colours below are starting values to tune by eye against the captures. Tests refer to the blueprint and exported constants, never to copies of their numbers, except where a test pins a rule's own number (0.9 m, 0.25 m).
- Work on branch `claude/interior-furnishing-living-hall` (not `main`). Commit after each task with the repository's attribution line. The first commit includes the spec and this plan.

## Review Focus

- A remembered place that now lies inside the sofa must fall back to the arrival pose, not strand the visitor in a piece (Task 2).
- No standable pocket: every standable ground-floor point in the living room and hall must be reachable from the arrival spot, so a visitor placed anywhere (a check's pose, a remembered place) can always walk out (Task 2).
- A blueprint entry with an unknown kind, or set on a parent that does not exist, must make `validInterior` false and must not throw in `buildFurniture`; the piece is skipped (Tasks 1, 3).
- `fallBack()` called with the furniture built and the lamp lit must leave the furniture drawn, the shades glowing and the grounding in place, with no throw (Task 5).
- An art bundle with no stone surface must still draw the jug and candlesticks, plain (Task 4).

## File Structure

- Create `shared/furniture.js`: kinds, footprints, derived obstacles, the bare blueprint. Pure.
- Modify `shared/lakeside-interior.js`: `breasts`, `furniture`, `stairRail`, `spots`; `obstacles` becomes derived.
- Modify `shared/interior.js`: clearance parameter on `floorArea`; `furnitureFit` inside `validInterior`.
- Create `public/space/interior/furniture-kit.js`: flat and sculpted helpers.
- Create `public/space/interior/furniture.js`: recipes and `buildFurniture`.
- Modify `public/space/interior/index.js`: hand `face`, `lit` and tints to `buildFurniture`; `furnished`; `fallBack`.
- Modify `public/space/space-view.js`, `public/scene-description.js`, `public/app.js`: bare walking on failure, `&bare=1` under `?check`, the description clause.
- Modify `scripts/check-space-browser.mjs`: moved spots, new checks and captures.
- Tests: `test/furniture.test.js`, `test/interior-furniture.test.js`; additions to `test/interior.test.js`, `test/place-memory.test.js`, `test/walker.test.js`, `test/space-view.test.js`.

---

### Task 1: Kinds, footprints and derived obstacles

**Files:**
- Create: `shared/furniture.js`
- Test: `test/furniture.test.js`
- Modify: `package.json` (`check` script: `node --check shared/furniture.js`)

**Interfaces:**
- Produces:
  - `KINDS`: frozen map, kind → `{standing: 'solid' | 'walk-over' | 'wall-hung' | 'set-on', size: [across, deep], height}` in metres. A piece faces its local −deep side; `turn` (radians, anticlockwise seen from above) rotates it about `at`. Kinds: `sofa` [2.2, .9], `armchair` [.85, .85], `low-table` [1.0, .6], `side-table` [.45, .45], `console` [1.8, .35], `bookshelf` [2.6, .35], `window-seat` [1.8, .48], `standing-lamp` [.3, .3], `log-basket` [.45, .45], `fire-irons` [.2, .2], `boot-bench` [1.25, .38], `umbrella-stand` [.3, .3], `newel` [.12, .12] (all solid); `rug`, `runner`, `doormat` (walk-over; size from the entry's `size`); `hooks`, `picture`, `mirror` (wall-hung; entry has `wall: 'a' | 'd'`, `line`, `along: [lo, hi]`, `z`); `table-lamp`, `cushion`, `throw`, `clock`, `jug`, `candlestick`, `book`, `cup`, `coat`, `hat`, `boots` (set-on; entry has `on`: a piece id, or `'mantel'`).
  - `footprint(entry) → {a: [lo, hi], d: [lo, hi]} | null`: for solid and walk-over kinds, the square-on rectangle bounding the turned piece; `null` for wall-hung, set-on and unknown kinds. An entry's own `size` overrides the kind's.
  - `corners(entry) → [[a, d] × 4] | null`: the turned rectangle itself (for drawing and grounding).
  - `solidObstacles(interior) → [{floor, a, d, id}]`: one per solid entry of `interior.furniture`, floor from the entry's room; unknown kinds and rooms are skipped.
  - `obstaclesOf(interior) → [...interior.breasts, ...solidObstacles(interior)]`.
  - `bareInterior(interior) →` a frozen copy with `furniture: []` and `obstacles: interior.breasts`.

- [ ] **Step 1: Write the failing tests** in `test/furniture.test.js`:

```js
test('a square-on piece keeps its size; a quarter turn swaps it', () => {
  const sofa = {id: 's', kind: 'sofa', room: 'living', at: [5, 3.5], turn: 0};
  assert.deepEqual(round(footprint(sofa)), {a: [3.9, 6.1], d: [3.05, 3.95]});
  assert.deepEqual(round(footprint({...sofa, turn: Math.PI / 2})), {a: [4.55, 5.45], d: [2.4, 4.6]});
});
test('a turned piece gives the square-on rectangle that bounds it', () => {
  const f = footprint({id: 'c', kind: 'armchair', room: 'living', at: [2, 2], turn: Math.PI / 4}), w = .85 * Math.SQRT2;
  near(f.a[1] - f.a[0], w); near(f.d[1] - f.d[0], w); near((f.a[0] + f.a[1]) / 2, 2);
});
test('only solid kinds become obstacles, on their room\'s floor', () => { /* rug, picture, table-lamp, unknown kind → none; sofa → one with floor 0 and its id */ });
test('an entry\'s own size overrides the kind\'s', ...);
test('bareInterior keeps the breasts and drops the furniture', () => { /* obstacles deepEqual breasts; furniture length 0; rooms untouched; frozen */ });
test('footprint of an unknown kind is null and nothing throws', ...);
```

- [ ] **Step 2: Run** `node --test test/furniture.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `shared/furniture.js`** with the interface above. No imports.
- [ ] **Step 4: Run** `node --test test/furniture.test.js` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** (`git add docs/superpowers shared/furniture.js test/furniture.test.js package.json`).

---

### Task 2: The two rooms in the blueprint, and the rules that say they are valid

**Files:**
- Modify: `shared/lakeside-interior.js`, `shared/interior.js`
- Test: `test/interior.test.js`, `test/place-memory.test.js`, `test/walker.test.js`

**Interfaces:**
- Consumes: `footprint`, `solidObstacles`, `obstaclesOf`, `bareInterior`, `KINDS` (Task 1).
- Produces:
  - Blueprint fields: `breasts` (today's two obstacle rectangles), `furniture` (entries), `stairRail: {newel: [9.5, 1.42], height: .9, newelHeight: 1.1, ends: 3.84}`, `spots: {hearth: [1.7, 3.5], casement: [4.2, .95], bookshelf: [1.8, 6.1], speed: [[4.2, 3], [3.8, 5.5]]}`, and `obstacles: obstaclesOf({breasts, furniture, rooms})` computed in the file before freezing.
  - `floorArea(I, floor, p, clear = I.eyeClear)`: every use of `I.eyeClear` inside takes `clear`.
  - `reachable(I, floor, from, to, clear = I.eyeClear) → boolean` exported from `shared/interior.js`, built on the existing `flood`, which gains the same `clear` parameter.
  - `validInterior` also requires `furnitureFit(I)` when `I.furniture` is present (a blueprint without `furniture` or `breasts` is judged as today, so existing test blueprints still pass).

Starting entries (floor ranges shown as the footprint they should produce; choose `at`, `turn` to give them):

| id | kind | footprint a × d | notes |
|---|---|---|---|
| `hearth-rug` | rug | 1.4–3.8 × 2.5–4.5 | turn ≈ 0.03 |
| `low-table` | low-table | 2.3–2.9 × 3.0–4.0 | on the rug |
| `sofa` | sofa | 4.5–5.4 × 2.4–4.6 | faces the fire (−a) |
| `console` | console | 5.4–5.75 × 2.6–4.4 | against the sofa's back |
| `armchair-front` | armchair | centre [2.2, 1.7] | turned about 35° toward the hearth |
| `armchair-back` | armchair | centre [2.3, 5.4] | turned about −30°, not a mirror image |
| `side-table` | side-table | 3.0–3.45 × 1.3–1.75 | carries `table-lamp` |
| `window-seat` | window-seat | 3.3–5.1 × 0.075–0.555 | top below the 0.8 m sill |
| `bookshelf` | bookshelf | 0.5–3.1 × 6.575–6.925 | on the d = 7 wall, clear of the kitchen opening (a 3.5–6) |
| `standing-lamp` | standing-lamp | centre [3.3, 6.7] | |
| `log-basket` | log-basket | centre [0.85, 5.0] | beside the breast |
| `fire-irons` | fire-irons | centre [0.65, 2.25] | |
| `boot-bench` | boot-bench | 7.075–7.455 × 0.35–1.6 | hall's a = 7 wall, behind the open leaf |
| `umbrella-stand` | umbrella-stand | centre [8.05, 0.3] | in the leaf's pocket |
| `runner` | runner | 8.2–9.2 × 1.6–6.2 | turn ≈ 0.02 |
| `doormat` | doormat | 8.55–9.45 × 0.2–0.7 | |
| `newel` | newel | from `stairRail.newel` | the one piece allowed beside the stair |

Wall-hung: `hooks` on the hall face of a = 7 over d 0.35–1.6 at z 1.6; `mirror` on the same wall over d 5.6–6.2 at z 1.5; `picture-1` on the living room's front wall over a 1.2–2.0 at z 1.5; `picture-2` on the living face of a = 7 over d 5.6–6.4; `picture-3` on the gable wall over d 5.2–6.0. Set-on: `table-lamp` on `side-table`; `clock`, `jug`, two `candlestick` on `'mantel'`; three `cushion` on `sofa`, one on each armchair, two on `window-seat`; `throw` on `sofa`; `book` and `cup` on `low-table`; three `coat` and a `hat` on `hooks`; `boots` on `boot-bench`.

`furnitureFit(I)` rules, each returning false when broken:

1. every entry has a unique `id`, a known kind and a room that exists;
2. a footprint lies inside its room's rectangle (walk-over and solid);
3. solid footprints do not overlap each other, a breast, the door leaf's sweep (the quarter disc of radius `door.width` about the hinge `[doorLeaf.a, 0]`), a doorway's passage (an opening's span, 0.5 m either side of its line), or the stair's box (`stair.a` × `stair.d`); the `newel` kind is exempt from the stair only if it lies within 0.2 m outside the stair's foot corner `[stair.a[0], stair.d[0]]`;
4. no solid footprint contains a wall fitting's `[a, d]` or comes within 0.6 m of the fire's mouth front (`a` from `breast.depth` to `breast.depth + 0.6`, `d` within the mouth's width);
5. a wall-hung entry's `line` is a wall line of its room, its `along` range lies in the room and overlaps no opening span on that line, no wall window, and no wall fitting within 0.3 m;
6. a set-on entry's `on` is `'mantel'` or the id of a solid or wall-hung entry;
7. from `entry.position`, with the usual clearance: every opening of the house (the existing check), each of `spots.hearth`, `spots.casement`, `spots.bookshelf`, both `spots.speed`, and the stair foot are reachable;
8. from `entry.position` with clearance 0.45: each hall opening's doorway point, the stair foot, and the living–kitchen doorway point are reachable (a 0.9 m walker).

- [ ] **Step 1: Write the failing tests.**

In `test/interior.test.js`:

```js
test('the furnished blueprint is valid', () => assert.equal(validInterior(I), true));
test('the bare blueprint is valid and a 0.9 m walker already gets everywhere rule 8 names', () => { /* validInterior(bareInterior(I)); reachable(bare, 0, I.entry.position, target, .45) for each target */ });
test('the walker\'s obstacles are the breasts and one rectangle per solid piece', () =>
  assert.deepEqual(I.obstacles, [...I.breasts, ...solidObstacles(I)]));
test('the speed spots and the named spots are standable', () => { for (const p of [...I.spots.speed, I.spots.hearth, I.spots.casement, I.spots.bookshelf]) assert.ok(floorArea(I, 0, p)); });
test('no standable pocket: every standable grid point of the living room and hall is reachable from the arrival spot', () => { /* 0.1 m grid over a 0–11, d 0–7; floorArea ⇒ reachable */ });
// one test per rule 1–8: `withFurniture(change)` builds a copy of I with one entry altered or added (obstacles re-derived) and expects validInterior false:
//  duplicate id; unknown kind; sofa moved to straddle a = 7; sofa over the low table; a console across the hall–living doorway;
//  a bench in the leaf's sweep; a table on the stair foot; a newel 0.5 m from the corner; a basket in front of the mouth; a bench under the hall lamp [10.2, .2];
//  a picture across the hall–living opening; a lamp set on 'nothing'; a ring of benches closing the hearth spot; a console narrowing the hall–dining way to 0.6 m.
```

In `test/walker.test.js`: a walker pressed into the sofa's front from `[4.2, 3.5]` heading +a stops at least 0.25 m short and slides along it when heading diagonally (same assertions as the existing chimney-breast test, read from the sofa's obstacle).

In `test/place-memory.test.js`: a version 2 record with `place: 'cabin', floor: 0` at the sofa's centre falls back to the arrival pose; the same record at `spots.hearth` loads.

- [ ] **Step 2: Run** `node --test test/interior.test.js test/walker.test.js test/place-memory.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Add the `clear` parameter** to `floorArea` and `flood`, and export `reachable`.
- [ ] **Step 4: Add `breasts`, `furniture`, `stairRail`, `spots` and the derived `obstacles`** to `shared/lakeside-interior.js`. If the bare-blueprint test of rule 8 fails for a target before any furniture is added, stop and report: the rule needs the owner's word, not a quiet change.
- [ ] **Step 5: Implement `furnitureFit`** in `shared/interior.js` and call it from `validInterior`. Adjust the starting entries until the real blueprint passes; record any footprint that had to move by more than 0.2 m in the commit message.
- [ ] **Step 6: Run** `npm test` and `npm run check`. Expected: PASS, including every existing interior, light, window-view and fittings test (the light field does not read obstacles; if a light test moves, find out why before touching it).
- [ ] **Step 7: Commit.**

---

### Task 3: The kit, the wiring, and the flat pieces

**Files:**
- Create: `public/space/interior/furniture-kit.js`, `public/space/interior/furniture.js`
- Modify: `public/space/interior/index.js`, `package.json`
- Test: `test/interior-furniture.test.js`

**Interfaces:**
- Consumes: `KINDS`, `footprint`, `corners` (Task 1); the blueprint's `furniture` (Task 2); from `buildInterior`: `face`, `tint`, `tints`, `materials`, `light`, and a new closure `lit(geometry, roomId) → geometry` that calls the existing inner `weighed(geometry, into(roomOf(roomId)), storey)`.
- Produces:
  - `furniture-kit.js`: `createKit(THREE, {face, lit, tint}) → {board, box, post, cushion, books, framed, placed}`.
    - `placed(entry) → (x, y, z) → [a, d, z]`: maps a piece's local metres (x across, y deep, z up from its floor) into the interior frame at the entry's `at` and `turn`.
    - `board(at, [x0, x1], [y0, y1], [z0, z1], colour, {tile})`, `box(at, …same…, {tile, broken = .012, tuck})`, `post(at, [x, y], [z0, z1], radius, colour)`, `cushion(at, [x0, x1], [y0, y1], [z0, z1], colour, {seed})`, `books(at, [x0, x1], y, z0, {height, seed})`, `framed(wallEntry, colour)`: each returns an array of geometries carrying `position`, `normal`, `uv`, `color`, `light`, `spill`.
    - `box` draws six faces, pulls each corner in by up to `broken` from the seed, and multiplies the colour of faces listed in `tuck` (`'under'`, `'back'`, `'inside'`) by `TUCK = .45`. `cushion` is a box cut at least 4 × 4 whose top and sides bulge and whose top sags toward a seeded dent; never six flat faces.
  - `furniture.js`: `buildFurniture(THREE, {interior, art, light, face, lit, tint, tints, materials}) → {object, setLight(dials), fallBack(flat), dispose(), counts: {vertices, meshes}}`. `object` is a `Group` named `furniture` holding at most these meshes: `furniture-wood` (the shell's `surface` material), `furniture-cloth` (the shell's `leafed`, double-sided), `furniture-stone`, `shades`, `grounding`. Tasks 4 and 5 fill the last three. `RECIPES`: kind → `(kit, entry, palette) → {wood?: [], cloth?: [], stone?: []}`. An entry whose kind has no recipe, or whose recipe throws, is skipped with one `console.warn` for the whole build.
  - `buildInterior`'s return gains `furnished` (true when `buildFurniture` returned) and `furniture` (its `counts`, or null). A throw from `buildFurniture` is caught: one warning (`"The cabin's furniture could not be built; its rooms stay bare."`), `furnished` false. `fallBack()` calls the furniture's.

Recipes in this task (kit only): `rug`, `runner`, `doormat` (a 1 cm slab, edges uneven, a darker border band); `low-table`, `side-table`, `console` (top board, four posts, a lower shelf on the console); `bookshelf` (carcass with `tuck: ['inside']`, five shelves, `books` runs with seeded gaps, some leaning or lying flat); `window-seat` (a boxed bench to 0.45 m); `boot-bench` (seat board, two ends, an open shelf beneath); `hooks` (a board on the wall with pegs as short posts); `picture`, `mirror` (`framed`); `book`, `cup`, `clock`; `cushion` on any parent (set on the parent's seat height: `KINDS[parent.kind].seat`, which this task adds to the sofa, armchair and window-seat kinds).

Palette (linear tints, starting values; `LIT_*` when `light` exists, as `fireplace.js` does): oak `[1.05, .78, .5]`, dark oak `[.6, .42, .28]`, rug red `[.95, .4, .3]`, ochre `[1.1, .85, .45]`, upholstery green `[.5, .62, .48]`, faded blue `[.5, .6, .75]`, linen `[1.2, 1.12, .95]`. Each piece varies its tint through `tint(colour, seed, spread)` with its own seed.

- [ ] **Step 1: Write the failing tests** in `test/interior-furniture.test.js` (build as `test/interior-fireplace.test.js` does):

```js
test('the furniture is built with the rooms, in at most five meshes', () => { /* inside.furnished === true; scene.getObjectByName('furniture').children.length <= 5; names within the five above */ });
test('every solid piece is drawn inside its own footprint, and stands on its floor', () => { /* per-entry box via a `pieceBox(id)` the builder exposes on the result for tests: a/d within footprint ± .02, z[0] within .02 of the floor */ });
test('furniture vertices carry light and spill, and the sofa\'s fire-facing side takes more fire than its back', () => { /* attributes present on furniture-wood; mean `light`.z (fire) of vertices with normal toward −a > those toward +a */ });
test('the insides of the bookshelf are darker than its sides', ...);   // mean colour of 'inside' faces <= TUCK * 1.1 of the sides'
test('a cushion is not a box: its top is not flat', ...);              // z spread across top vertices > .02
test('the window seat stays under the sill, and the bookshelf clear of the kitchen opening', ...);
test('an entry with a kind that has no recipe is skipped without a throw', ...);   // build with a blueprint whose furniture adds {kind: 'nonesuch'}
test('a furniture build that throws leaves the rooms built and bare', ...);        // blueprint with `furniture: null` reaching buildFurniture ⇒ furnished false, scene has walls
test('given up for the flat light, the furniture takes the flat materials', ...);  // after fallBack(): furniture-wood.material.isMeshLambertMaterial
test('the same furniture twice: two builds give identical positions', ...);       // seeds only
```

- [ ] **Step 2: Run** `node --test test/interior-furniture.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `furniture-kit.js`.**
- [ ] **Step 4: Implement `furniture.js`** with the recipes above, and wire `buildInterior` (add `lit`, call `buildFurniture` after the fittings, add to `scene`, extend `fallBack` and `dispose`).
- [ ] **Step 5: Run** `npm test` and `npm run check`. Expected: PASS.
- [ ] **Step 6: Look at it.** `npm start`, open `/?space=1&interior=1&check`, walk both rooms. Fix what is plainly wrong (a piece through a wall, a table in the air) before going on.
- [ ] **Step 7: Commit.**

---

### Task 4: The sculpted pieces and the stair's rail

**Files:**
- Modify: `public/space/interior/furniture-kit.js`, `public/space/interior/furniture.js`
- Test: `test/interior-furniture.test.js`

**Interfaces:**
- Consumes: `createKit`, `placed`, `lit`, `RECIPES` (Task 3); `tube` from `public/space/geometry.js`; `interior.stairRail` (Task 2).
- Produces:
  - Kit additions: `turned(at, [x, y], profile, colourOf, {segments = 12})` (a lathe about a vertical axis; `profile` is `[[radius, z], …]`), `roll(at, from, to, radius, colour, {sides = 8})` (a round bar between two local points), `drape(at, pointOf, across, down, colour, {seed})` (a double-sided sheet over `pointOf(s, t)` with seeded folds). Each sets `uv` and `color` and returns geometry passed through `lit` for the entry's room.
  - Recipes: `sofa`, `armchair` (kit base and seat; arms and back top as `roll`s over boxes; seat and back cushions), `standing-lamp`, `table-lamp` (`turned` base and stem; the shade goes to `shades`, Task 5: in this task it is drawn in `furniture-cloth`), `log-basket` (a `turned` basket, three or four `roll` logs), `fire-irons`, `jug`, `candlestick` (`turned`, in `furniture-stone`), `umbrella-stand`, `coat`, `hat`, `throw` (`drape`), `boots`, `newel`.
  - `stairRail(kit, interior) → {wood: []}`: the newel (a `turned` post to `newelHeight` with a cap); a handrail `roll` along a = `stair.a[0]` from the newel, rising parallel to the flight at `height` above the treads, ending where it meets the ground ceiling (`stairRail.ends`, d ≈ 3.84) beneath the landing's existing board rail; one `turned` baluster per tread from the tread's height to the rail. Weighed in the hall.
  - `furniture-stone` uses `light.material({map: art.surfaces.stone})`, or the plain lit material when the art has no stone, and its own Lambert under `fallBack`, as `fireplace.js` does.

- [ ] **Step 1: Write the failing tests:**

```js
test('the sofa and armchairs have rounded arms: their vertices are not all on six planes', ...);
test('the armchairs are not mirror images of one another', ...);                 // turns differ in size, cushions' dents differ
test('the stair has a newel at its foot, a rail that rises with the flight and ends at the ceiling, and a baluster a tread', () => {
  /* newel box centred on stairRail.newel, top at newelHeight; rail z at d = 2.5 within .03 of height + floorRise * (2.5 − stair.d[0]) / run;
     nothing of the rail above groundCeiling or beyond d = stairRail.ends + .05; baluster count === tread count below the ceiling */ });
test('nothing of the rail stands where the stair is walked', ...);                // every rail and baluster vertex has a <= stair.a[0] + .06
test('the landing\'s board rail is untouched', ...);                               // the 'stair' mesh's vertex count equals the bare build's
test('with no stone in the art, the jug and candlesticks are still drawn', ...);
test('sculpted pieces carry light: no vertex of furniture-wood, -cloth or -stone has an all-zero light weight', ...);
test('counts are reported', ...);                                                 // inside.furniture.vertices > 0, meshes <= 5
```

- [ ] **Step 2: Run** the file. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the kit additions, the recipes and `stairRail`.
- [ ] **Step 4: Check the walker against the rail by hand in the browser**: from the hall, walk into the flight's open side at several heights. The stringer and `floorArea`'s stair box should already stop the eye 0.25 m off a = 9.6. If the eye can reach the rail anywhere, add that finding and a blueprint obstacle for it, with a test, before going on.
- [ ] **Step 5: Run** `npm test`, `npm run check`. Expected: PASS.
- [ ] **Step 6: Commit.**

---

### Task 5: Grounding and the lamps' shades

**Files:**
- Modify: `public/space/interior/furniture.js`
- Test: `test/interior-furniture.test.js`

**Interfaces:**
- Consumes: `corners` (Task 1); `lightSum` and the dials from `shared/interior-light.js`; `field.weigh` through a new `weightsAt(point, normal, roomId)` argument handed in by `buildInterior`.
- Produces:
  - Mesh `grounding`: for each solid piece except the newel and the standing lamp's foot ring (which take a 0.2 m disc), a patch over the turned footprint grown by `GROUND.reach = .22` m, 3 mm above the floor, cut 3 × 3 so the inner cell is the footprint drawn in by 0.05 m. Vertex colour black with alpha `GROUND.dark = .42` on the inner vertices and 0 on the rim. One `MeshBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: −1})`, `renderOrder` below the panes'. It stays in the rooms' scene (not the overlay) and is not a lit material, so `fallBack()` leaves it alone.
  - Mesh `shades`: the two lamps' shades (`turned`), one `MeshBasicMaterial`. `setLight(dials)` sets its colour to `SHADE_PALE` times the room's light at the shade without its own lamp (as `fittings.js` does for an unlit glass), mixed toward `SHADE_WARM = [1.9, 1.25, .6]` by the living room's lamp level. No halo.
  - `buildInterior.setLight(dials)` also calls the furniture's.

- [ ] **Step 1: Write the failing tests:**

```js
test('every solid piece has a patch on the floor beneath it, darkest under it and nothing at its rim', ...);
test('the grounding lies just above the floor and inside the piece\'s room', ...);   // z within [.002, .006]; a/d inside the room's rectangle (clipped at walls)
test('the patch turns with a turned piece', ...);                                    // armchair-front's inner cell matches corners(), not footprint()
test('the shades are pale with the lamp out and warm with it lit, by the living room\'s dial alone', () => {
  /* setLight(dials with lamps[living] = 0) → colour r/b < 1.4; = 1 → r/b > 2; changing another room's level changes nothing */ });
test('the shade never jumps: its colour at level .5 lies between its colours at 0 and 1', ...);
test('given up for the flat light with the lamp lit: furniture drawn, shades still warm, grounding in place, nothing thrown', ...);
test('no light source and nothing new in the overlay', ...);                         // scene has no isLight; overlay child count equals the bare build's
```

- [ ] **Step 2: Run** the file. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `grounding`, `shades` and `setLight`. Clip a patch at its room's wall faces so no dark shows through a doorway or on a wall's far side.
- [ ] **Step 4: Run** `npm test`, `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit.**

---

### Task 6: Bare walking on failure, the check-only bare switch, and the description

**Files:**
- Modify: `public/space/space-view.js`, `public/scene-description.js`, `public/app.js`
- Test: `test/space-view.test.js`, and the scene-description tests where `sceneText`'s indoor text is tested today (find with `grep -rn "Inside the cabin" test/`)

**Interfaces:**
- Consumes: `bareInterior` (Task 1); `inside.furnished` (Task 3).
- Produces:
  - `SpaceView`: with `?check` and `&bare=1` in the URL, the view's interior is `bareInterior(LAKESIDE_INTERIOR)` from construction (no furniture built, bare walking). Without `?check`, `bare` is ignored.
  - `SpaceView`: when `buildInside` finds `inside.furnished === false`, indoor stepping uses `bareInterior(this.interior)` from then on (`this.walkPlan`, which is `this.interior` otherwise). Place memory and the passage keep the furnished blueprint.
  - `SpaceView.furnished` getter: `!!this.inside?.furnished`.
  - `sceneText(…, {…, furnished = false})`: when `room` is set and `furnished`, a fixed clause follows the room's sentence. Exact copy: living room, `A sofa and two armchairs are drawn up to the fire.`; entry hall, `Coats hang by the door and the stair climbs ahead.`; any other room, nothing. Order: `Inside the cabin, in the living room. A sofa and two armchairs are drawn up to the fire. ` then the lit text as today. `app.js` passes `furnished: view.furnished`. The clause does not make the announcer speak on its own (it changes only with the room).

- [ ] **Step 1: Write the failing tests:** `sceneText` with `room: 'living room', furnished: true` contains the living clause once, before the lit text; with `furnished: false` or `room: 'kitchen'` contains neither clause; the announcer's `changed` result is the same with and without `furnished` for an unchanged room. In `test/space-view.test.js`, following its existing stubs: a view whose `inside.furnished` is false steps through the sofa's place and stops at the chimney breast; a furnished one stops at the sofa.
- [ ] **Step 2: Run** those files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit.**

---

### Task 7: Browser checks, captures and speed

**Files:**
- Modify: `scripts/check-space-browser.mjs`
- Create (generated): captures under `docs/interior-validation/`, updated `browser-results.json`

**Interfaces:**
- Consumes: `&bare=1` (Task 6); `window.__space.inside.furnished`, `.furniture` (Task 3); `LAKESIDE_INTERIOR.spots`.

- [ ] **Step 1: Move the spots furniture now covers,** each to the nearest standable spot that tests the same thing, and list every move in the commit message and in the spec's "As built" (Task 8). Known: the parallax pair `[3.2, 3]` / `[5.2, 3]` (the second is inside the sofa: use `[3.2, 3]` and `[4.25, 3]`, and if less than a tenth of the pane then differs, take the pair along d = 1.2 at a 3.4 and 5.2, where the floor is clear between the window seat and the fire group); `duskPose` at `[5.9, 3.5]` and the capture at `[6.4, 3.5]` (inside or against the console: use `[6.2, 5.2]` looking at the same target); floor samples at `[4.2, 1]`, `[4.2, 4.6]` and by the hearth (check each against the rug and the grounding patches; move only those that are covered). `[4.2, 3]` and `[3.8, 5.5]` do not move. Run the script; every existing check must pass before any new one is added.
- [ ] **Step 2: Add the checks** (numbered on from the last, in the script's `check(…)` style):
  - with `?interior=1` the interior reports `furnished` and at most 5 furniture meshes; with `&bare=1` it reports none; without `?interior=1` nothing is built (the existing shut-door check still holds);
  - walking from the hall opening straight at the sofa stops short of it; walking from the door to the kitchen opening by `W` and turns arrives in the kitchen;
  - the low floor capture: the mean luminance of the floor crop just under the sofa's front edge is at most 0.85 of the open floor 0.6 m in front of it, under the same light;
  - at night with the living lamp lit by fixture, the table lamp's shade crop is warmer (red over blue) and brighter than with the lamp out;
  - two other loads at the same held world moment draw the furnished living room within 2% of the first (the existing same-moment method);
  - speed, day and `night` study, at `[4.2, 3]`: at most 1.1 (the existing checks, unchanged in method);
  - speed at `[3.8, 5.5]` facing the window under the `night` study with the lamp lit: furnished and `&bare=1` measured in the same run by the existing method; furnished minus bare at most 0.05; both figures recorded;
  - draw calls added by furniture (`renderer.info.render.calls` furnished minus bare at the living capture pose) at most 6; first-build time furnished minus bare at most 60 ms (median of three loads each); vertex count recorded;
  - after `inside.fallBack()` both rooms are still drawn with furniture (mean luminance above 0.1, furniture meshes present);
  - no page or console errors in these visitors.
- [ ] **Step 3: Add the captures** (`furnish-*.jpg`): living room from the hall opening at clear noon, under overcast, at night with lamp and fire; from the hearth looking back at the sofa and casement; the window seat with the casement open; the bookshelf close to; the low floor view of the sofa and an armchair; the hall from the front door by day and at night under the low lamp; the stair foot with newel and rail; the hooks and bench behind the open door; both rooms after `fallBack()`.
- [ ] **Step 4: Run** the script as the repository documents it (see the header of `scripts/check-space-browser.mjs` for the command and ports; close any other page drawing the scene first, as part 3's "Measured" notes). Expected: every check passes. If a speed check fails, apply the spec's remedies in order (fewer cuts in kit faces, coarser sculpted forms, fewer dressing pieces), re-run, and record what was cut. If it still fails, stop and report to the owner with the figures; do not drop a must-have.
- [ ] **Step 5: Commit** the script, the captures and `browser-results.json`.

---

### Task 8: Tune by eye, and write down what was built

**Files:**
- Modify: `public/space/interior/furniture.js`, `shared/lakeside-interior.js` (values only), the spec (append "As built")
- Regenerate: captures

- [ ] **Step 1: Read every `furnish-*.jpg` capture** against the spec's anti-goals and its three review questions. Look for: a piece reading as a bare box; anything square to the walls that should not be; even tints; a piece that floats or whose patch reads as a hard-edged rectangle; brushwork smeared across small pieces (try a finer `tile` first); the red overshoot part 3 notes on bright brushwork, now on the rug by the fire.
- [ ] **Step 2: Adjust** tints, seeds, sizes, turns, `GROUND`, `TUCK`, `SHADE_*` and brush scale. Blueprint moves must keep `validInterior` true and the two speed spots standable.
- [ ] **Step 3: Run** `npm test`, `npm run check` and the browser script again; retake the captures. Expected: all pass.
- [ ] **Step 4: Append "As built" to the spec:** the final placements where they differ from this plan; every check spot moved and why; which pieces were sculpted; how grounding is drawn; measured speed at both poses furnished and bare, draw calls, build time, vertex count; anything cut for speed; known weak points. Change the spec's status line to "built behind `?interior=1`, awaiting owner review".
- [ ] **Step 5: Commit.** Do not open a pull request or remove the switch; the owner reviews the captures first.
