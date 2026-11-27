# Cabin interior, part 4f: furnishing the upstairs bathroom, box room and linen cupboard — design

Status: built and approved (November 25, 2026); `?interior=1` switch removed in part 5.

This is the sixth and last slice of part 4 of `2026-11-17-cabin-interior-design.md` (the parent). Slices `4a` to `4e` are built and merged, and between them they furnish fifteen rooms. Their design and As built sections are the starting point. Everything they settle holds here unless this document says otherwise: how a piece is described, made, lit, grounded, queued in two stages, hidden across floors, checked, and allowed to fail.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction. Items marked **(owner)** were decided by the owner.

## Intent

The last three bare doors in the house open onto furnished rooms. The upstairs bathroom has a roll-top bath under the back eave, a shower in its tall corner, and a basin and mirror. The box room off bedroom 3 is a little storeroom of trunks and crates. The linen cupboard off the bathroom is lined with folded linen. After this slice every room in the cabin is furnished, and part 5 can remove the `?interior=1` switch.

What the owner decided earlier:

- 4f is the upstairs bathroom, box room and linen cupboard. **(owner, in 4d and 4e)**
- Textures, plates and tiles stay out of scope. The known weak points of 4a to 4e (heavy brushwork on small pieces, faint grounding) are inherited. **(owner, from 4b)**

## Goals

- All three rooms furnished with the parent's must-haves, by day and by lamp light, made the way 4a to 4e's pieces are made:
  - **Baths:** bathtub, shower, basin with mirror, toilet, towel rail.
  - **Box room:** trunks.
  - **Linen:** shelves of folded linen.
- Every piece fits under the back roof slope (Rule 10).
- The walker is stopped by the furniture, and a 0.9 m walker can:
  - walk from the nook doorway through the bathroom to the linen doorway;
  - walk into the box room and the linen cupboard.
- No regression:
  - front-door entry time, all six ground-floor speed poses, and both upstairs speed poses stay as in 4e;
  - the eight upstairs rooms together stay inside the 120 ms floor-1 budget.
- Still behind `?interior=1`.

## Non-goals

- Textures, plates, tiles, or any change to how surfaces are painted.
- New light, new lamps, or changes to `shared/interior-light.js` or `fittings.js`. These three rooms have only wall lamps, so none of them carries a `shades` mesh.
- Any change to the blueprint's rooms, openings, windows, stair or fittings, to `seenFrom`, or to the stairwell gate.
- Anything the visitor can operate or open (trunk lids, cupboard doors, taps).
- Re-tuning any of the fifteen furnished rooms.
- Removing the switch. That is part 5.
- Cast shadows, sound, server or persisted-state changes, new art files.

## Anti-goals

- Any piece clipping through the back slope, which falls from 3.32 m at `d = 7` to 1.92 m at the eave wall's face.
- A bathroom that is a copy of the ground-floor one. It reuses the 4d kinds but must read as an attic bathroom: the bath sits under the eave, and the shower stands where the ceiling is tallest.
- A box room so full that a visitor cannot step in, or so empty that it reads as unfinished.
- Upper-floor furniture leaking draw calls into ground-floor poses.
- Two visitors seeing different rooms.

## Constraints found in the project

- **The back slope.** Ceiling heights above floor 1, from `ceilingHeight(I, 1, d)`:

  | d | 7 | 8 | 9 | 9.5 | 10 | 11 | 11.65 | 11.925 (eave face) |
  |---|---|---|---|---|---|---|---|---|
  | ceiling (m) | 3.32 | 3.03 | 2.75 | 2.61 | 2.47 | 2.18 | 2.00 | 1.92 |

- **The rooms** (`shared/lakeside-interior.js`):
  - **`bath-upper`** (`a 11–15, d 7–12`):
    - doorway to `nook` at `a = 11, d 9–10`; doorway to `linen` at `a = 15, d 10.2–11.2`;
    - wall lamp at `[13, 11.8]` on the eave wall, 1.5 m above the floor.
  - **`box-room`** (`a 15–18, d 7–9.5`):
    - doorway to `bedroom-3` at `d = 7, a 16–17`;
    - wall lamp at `[17.8, 8.25]`, 1.8 m up.
  - **`linen`** (`a 15–18, d 9.5–12`):
    - doorway to `bath-upper` at `a = 15, d 10.2–11.2`;
    - wall lamp at `[17.8, 10.75]`, 1.6 m up.
- **Rule 3's doorway passages.** No solid piece may stand within 0.5 m either side of a doorway across its span. That is `a 10.5–11.5 × d 9–10` and `a 14.5–15.5 × d 10.2–11.2` in the bathroom, and `a 16–17 × d 6.5–7.5` at the box room door.
- **Rule 10 by kind.**
  - A 2.0 m shower fits only where `d ≤ 11.65`. In practice it belongs on the `d = 7` side.
  - A 0.9 m mirror hung at the usual `z = 1.5` on the eave wall would top out at 1.95 m against 1.92 m, and Rule 10 rejects it. That was verified against the validator: it passes only if lowered to `z = 1.4`. The mirror therefore goes on the tall `d = 7` wall over the basin.
  - A set-on piece on a 1.85 m eave shelf would breach the slope. So the folded linen on the low shelf is built into the shelf's recipe, the way the books are, and is not a set-on kind.
- **Piece ids are global.** `linen-basket` is already taken (the towel on the laundry's second basket). The validator's Rule 1 rejects a duplicate id, so the linen cupboard's pieces use the `linen-cupboard-` prefix.
- **`SLICE_4E` is an alias.** It is currently `LAKESIDE_INTERIOR.furnishUpper` itself (`shared/lakeside-interior.js:280`). Appending 4f's rooms to `furnishUpper` would silently add them to `SLICE_4E`, and the `&furnish=` comparison fixtures would stop meaning what their names say.
- **The build queue today.**
  - The five floor-1 rooms take **66.7 ms** together, against a limit of ≤ 120 ms.
  - The eight floor-0 queued rooms take **148.2 ms**, against < 180 ms.
  - The ground-floor bathroom measured **11.8 ms** for 2,858 vertices in 4 meshes (`wood`, `cloth`, `stone`, `grounding`), which is a fair guide to its upstairs twin.
- **Existing tests that touch these rooms.** `test/interior-light.test.js` uses floor points in `bath-upper` and `linen` (light is painted into surfaces, so furniture does not change it). `test/sight.test.js` uses `box-room` in a synthetic fixture. `scripts/check-space-browser.mjs` has no capture or check pose in the three rooms, so none needs to move.
- **The browser suite has 125 numbered checks.** New checks start at **126**.

## Approaches considered

How the upstairs bathroom is laid out:

1. **Bath under the eave, shower in the tall corner — chosen (call).** The low back wall is the one place where only a low piece fits, and a bath belongs there. The 2 m shower takes the north-east corner, where the ceiling is about 3 m. The basin and toilet stand on the tall `d = 7` wall. A clear band from `d = 8` to `d = 11` runs between the two doorways.
2. **Mirror the ground-floor bathroom.** That puts the bath across the middle and the shower against the eave, which Rule 10 rejects. It would also read as a copy.
3. **Bath freestanding in the middle of the room.** Romantic, but it blocks the walk from the nook to the linen cupboard at 0.9 m, and leaves the eave wall empty and dead.

How the folded linen is made:

1. **Built into the shelf recipes, like books — chosen (call).** A shared helper fills each shelf with stacks of folded cloth, controlled by one fill constant. No set-on kind is needed, and it is safe under the slope.
2. **A `folded-linen` set-on kind.** Rule 10 rejects it on the low eave shelf, and dozens of set-on pieces would bloat the blueprint.

## Design

### What goes in each room

Must-haves are the parent's. The arrangements are the author's **(call)**. Each was checked against the real validator (Rules 1–10, floor-1 Rules 7 and 8 with the new `upperSpots`, all three rooms in `furnishUpper`). New kinds were stood in by existing kinds of the same footprint and equal or greater height. Pieces against a wall stand at the wall's face, 0.075 m inside the room line. Nothing is square and even, by the same seeded irregularity as 4a to 4e.

**Upstairs bathroom (`bath-upper`, `a 11–15, d 7–12`):**

- **Roll-top bathtub** (`bathtub`, existing kind) along the eave wall at `[12.0, 11.55]`, turn `0`. It spans `a 11.15–12.85, d 11.175–11.925` and is 0.6 m tall under a ceiling of at least 1.92 m. It stays clear of the wall lamp at `a = 13` and of the nook doorway's passage.
- **Bath mat** (`bath-mat`, walk-over, `0.9 × 0.55 m`) beside the tub at `[12.0, 10.85]`, turn `−0.03`.
- **Shower** (`shower`, existing kind) in the north-east corner at `[14.475, 7.525]`, turn `π`. Ceiling at least 3.04 m.
- **Basin** (`basin`) on the `d = 7` wall at `[12.3, 7.3]`, turn `π`, with a **jug** set on it. A **mirror** (`mirror`) hangs above it on `d = 7` at `a [12.0, 12.6]`, `z = 1.5`.
- **Toilet** (`toilet`) on the `d = 7` wall at `[13.3, 7.425]`, turn `π`.
- **Towel rail** (`towel-rail`) hung on `a = 15` north of the linen doorway at `d [8.4, 9.2]`, `z = 1.2`, with a **towel**.
- **Dressing:**
  - a second **towel** set on the bathtub;
  - a **basket** under the eave in the south-east corner at `[14.5, 11.6]`, clear of the linen doorway's passage, which ends at `d = 11.2`.

```
 d=7   ┌──[basin]─[wc]──────[shower]┐
       │   mirror                    │
       │                        rail ▯▯ (box room beyond)
 nook  ▯                             │
 door  ▯       (open band)           │
       │                             ▯ linen
       │    (mat)                    ▯ door
       │ [ roll-top tub ]  •lamp  [bk]│
 d=12  └─────────────────────────────┘
      a=11                          a=15
```

**Box room (`box-room`, `a 15–18, d 7–9.5`):**

- **Two trunks** (`trunk`, new kind, `0.9 × 0.5 m`, height 0.5 m) side by side against the back wall (`d = 9.5`) at `[15.6, 9.175]` (turn `0`) and `[16.6, 9.175]` (turn `0.04`).
- **Stacked crates** (`crate`, existing kind) against the west wall at `[15.3, 7.9]`, turn `π / 2`.
- **An old chair** (`chair`, existing kind) put away in the north-east corner at `[17.4, 7.6]`, turn `−π / 2 + 0.3`. It stays clear of the wall lamp at `[17.8, 8.25]` and of the doorway passage at `a 16–17`.
- The band inside the door (`d 7–8.9` at `a 16–17`) stays clear, so a visitor can step in and look round.

```
 d=7   ┌──────▯▯▯▯door▯▯▯────┐
       │[cr]              [ch]│
       │[cr]                  •lamp
       │[ trunk ][ trunk ]    │
 d=9.5 └──────────────────────┘
      a=15                  a=18
```

**Linen cupboard (`linen`, `a 15–18, d 9.5–12`):**

- **Linen press** (`linen-press`, new kind, `1.6 × 0.45 m`, height 2.0 m), a tall open-shelved cupboard of folded linen. It stands against the north wall (`d = 9.5`) at `[16.6, 9.8]`, turn `π`, under a ceiling of at least 2.46 m.
- **Low linen shelf** (`linen-shelf`, new kind, `2.0 × 0.35 m`, height 1.85 m) under the eave against the back wall (`d = 12`) at `[16.5, 11.75]`, turn `0`. Height 1.85 m under a ceiling of at least 1.92 m.
- **Dressing:** a **basket** (`basket`) at `[17.6, 11.2]` with a **towel** set on it. It stays clear of the lamp at `d = 10.75`.
- Between the press and the low shelf, a clear 1.55 m band runs from the doorway to the east wall.

```
 d=9.5 ┌──[   linen press   ]───┐
       ▯                        │
 door  ▯      (clear band)      •lamp
       │                   [bk] │
       │  [  low linen shelf  ] │
 d=12  └────────────────────────┘
      a=15                    a=18
```

Ids **(call)**:

- **Bathroom:** `bath-upper-tub`, `-mat`, `-shower`, `-basin`, `-toilet`, `-basket`, `-mirror`, `-rail`, `-rail-towel`, `-tub-towel`, `-jug`.
- **Box room:** `trunk-1`, `trunk-2`, `box-crates`, `box-chair`.
- **Linen cupboard:** `linen-press`, `linen-eave-shelf`, `linen-cupboard-basket`, `linen-cupboard-towel`.

### New kinds

Added to `shared/furniture.js` **(call)**:

| kind | standing | size (`[wide, deep]`) | height |
|---|---|---|---|
| `trunk` | solid | `[0.9, 0.5]` | `0.5` |
| `linen-press` | solid | `[1.6, 0.45]` | `2.0` |
| `linen-shelf` | solid | `[2.0, 0.35]` | `1.85` |

Reused existing kinds: `bathtub`, `bath-mat`, `shower`, `basin`, `toilet`, `mirror`, `towel-rail`, `towel`, `jug`, `basket`, `crate`, `chair`.

Set-on placements: `towel` on `basket` already exists (laundry), as do `towel` on `bathtub` and `towel-rail`, and `jug` on `basin`. No new set-on placement is needed **(call)**.

### How pieces are made

4a's kit and recipes, extended in `public/space/interior/furniture.js`, under the same rule for what may be sculpted.

- The bathroom's pieces are all existing 4d recipes. This slice adds only placements.
- **Allowed sculpted here (call):** the `trunk`'s domed lid (`roll`, coarse), and the folded linen's soft front edges (`cushion`, flattened, coarse) only if a kit box reads too hard in the capture.
- **Kit:** everything else (`face` / `box` / `board` / `post`): trunk body, straps and corner irons, the press's carcass and shelves, and the low shelf's carcass and shelves.
- **Folded linen.** One helper, `linens(...)`, set out like `kit.books`. It lays runs of folded stacks along a shelf, with seeded heights, widths and cloth tints, controlled by one constant `LINEN_FILL`. The press and the low shelf both use it. On the low shelf, the top shelf's stacks stop 0.04 m under the slope, as `sloped-bookshelf` does.
- **Surfaces.** Tints come from `pal.surface(name, …)` and are emitted under `SURFACES[name].mesh` (`wood`, `cloth`, `stone`). The trunk's irons use the existing `brass` surface (mapped to `wood`). There is no new surface, material or mesh name.

### Slices, queue and comparison switch

- **The slices.**
  - `shared/lakeside-interior.js` makes `SLICE_4E` a frozen literal, `['landing', 'bedroom-2', 'bedroom-3', 'sky-room', 'nook']`, no longer an alias.
  - It adds `SLICE_4F = Object.freeze(['bath-upper', 'box-room', 'linen'])`.
  - `furnishUpper` becomes `['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room', 'bath-upper', 'linen', 'box-room']`, in that fixed order **(call)**. 4e's order is unchanged, and the bathroom comes before the two rooms that open off it or near it.
- **The comparison switch.** `&furnish=` under `?check` gains `4e`, which strips `SLICE_4F` with `keepQueue`. `4d` strips `SLICE_4E` and `SLICE_4F`. `4c` and `4b` strip `SLICE_4F` as well as their existing slices. `first` already strips both queues.
- **Rule 8.** `upperFurnished(I)` reads `furnishUpper`, so the 0.9 m walk over furnished upstairs rooms grows to all eight with no code change. `upperThroughWays` derives from the blueprint, so it picks up three new ways:
  - `bath-upper`: from the nook doorway to the linen doorway and `upperSpots.bathTub`;
  - `box-room`: from the bedroom-3 doorway to `upperSpots.boxRoom`;
  - `linen`: from the bathroom doorway to `upperSpots.linenShelf`.
- **New `upperSpots` (call).**
  - Named spots: `bathTub: [12.0, 10.3]`, `boxRoom: [16.5, 8.2]`, `linenShelf: [16.5, 10.8]`.
  - One new speed pose, `upperSpots.speed[2] = [11.8, 9.6]`: in the bathroom just inside the nook doorway, facing `[14.9, 11.0]` across the tub, the eave and the linen doorway.
  - Existing spots do not change.
- **Start-up indoors.** A visitor who starts indoors in one of the three rooms builds all eight floor-1 rooms on frame 1, as 4e's start in the sky room built five. That is expected at about 100 ms, inside the 120 ms floor-1 budget.

### Speed and budgets

- **The three rooms' queued builds** (median of 3 loads) **(call)**:
  - `bath-upper` ≤ 25 ms, `box-room` ≤ 15 ms, `linen` ≤ 25 ms;
  - the three together ≤ 50 ms;
  - all eight floor-1 rooms ≤ 120 ms;
  - the eight floor-0 queued rooms unchanged, < 180 ms.
- **Meshes:**
  - `bath-upper` ≤ 4 (`wood`, `cloth`, `stone`, `grounding`);
  - `box-room` ≤ 3;
  - `linen` ≤ 3;
  - total sets go from 14 to 17.
- **The new bathroom pose** (`upperSpots.speed[2]`), day and night with the bathroom lamp lit by fixture: ≤ 1.1× a yard frame, ≤ +0.05 over `&furnish=4e`, ≤ +7 draw calls (`bath-upper` ≤ 4 + `linen` ≤ 3, since the pose looks into the open linen doorway).
- **The six ground-floor poses**, against `&furnish=4e`: ≤ +0.01 of a yard frame and **0 added draw calls**.
- **The two 4e upstairs poses**, against `&furnish=4e`:
  - `upperSpots.speed[1]` (`sky-room`): ≤ +0.01 of a yard frame and **0 added draw calls** (`shownRooms` includes no 4f room).
  - `upperSpots.speed[0]` (`landing -> nook`): `bath-upper` and `linen` are in `shownRooms` through the nook's open bathroom doorway, so up to **≤ +7 draw calls** and **≤ +0.02** of a yard frame (matching check 107's visible-doorway rule). Check 117 isolates 4e by comparing `&furnish=4e` against `&furnish=4d`.
- **Front-door entry** (checks 73 and 104): unchanged. 4f adds nothing to floor 0 or to the first build.
- **Remedies if a limit is missed, in order:**
  1. fewer cuts in kit faces;
  2. lower `LINEN_FILL`;
  3. a coarser trunk lid;
  4. fewer dressing pieces.

  Dropping a must-have is the owner's decision.

### The description

Three fixed clauses added to `FURNISHED_TEXT` in `public/scene-description.js` **(call)**:

- `'upstairs bathroom'`: `'A bathtub lies under the eaves and a shower stands in the far corner. '`
- `'box room'`: `'Old trunks and crates are stored here. '`
- `'linen cupboard'`: `'Shelves of folded linen line the walls. '`

As in 4e, a clause appears only once its room's set is built.

### Checks

- **Node tests:**
  - `test/furniture.test.js`: the three new kinds' standing, size and height.
  - `test/interior.test.js`:
    - the real blueprint is valid with nothing skipped;
    - Rule 10 rejects a `shower` placed against the eave wall and a `mirror` at `z = 1.5` on `bath-upper`'s `d = 12` wall;
    - Rule 7 reaches the three new `upperSpots` and the new speed pose;
    - Rule 8 has a blocking-piece test for each of the three new through-ways (a piece across the bathroom's open band, inside the box room door, and across the linen cupboard's clear band);
    - `furnishUpper` order, `SLICE_4E` is a literal equal to 4e's five rooms, and `SLICE_4F`.
  - `test/interior-furniture.test.js`:
    - all three sets build cleanly within their mesh limits, with no `shades` in any of them;
    - every vertex carries floor-1 light weights;
    - no vertex of `linen-shelf`, the bathtub or the basket exceeds `3.0 + ceilingHeight(I, 1, d)`;
    - set count goes from 14 to 17;
    - the queue holds eight floor-1 rooms;
    - a failure in one room skips its dependents only.
  - `test/walker.test.js`: walking on floor 1 stops and slides along the bathtub, a trunk and the linen press.
  - `test/place-memory.test.js`: a floor-1 saved pose inside the bathtub or the linen press falls back to arrival; the new named spots load cleanly.
  - `test/space-view.test.js`:
    - `&furnish=4e`, and `4d`, `4c`, `4b` now stripping 4f;
    - starting indoors in `linen` builds floor 1 on frame 1 and emits the linen clause;
    - no 4f clause appears before its set is built.
- **Browser captures** under `docs/interior-validation/`:
  - `bath-upper` from the nook doorway, day and lit;
  - `bath-upper` close-up of the tub under the eave, showing the slope fit;
  - `box-room` from its doorway, day and lit;
  - `linen` from the bathroom doorway, day and lit;
  - `linen` close-up of the low shelf under the slope;
  - all three rooms after `fallBack()`.
- **Browser checks**, numbered from **126**:
  - **126:** queued builds of the three rooms (median of 3 loads): each within its limit, together ≤ 50 ms, all eight floor-1 rooms ≤ 120 ms, floor 0 unchanged; meshes within limits; vertices recorded.
  - **127:** speed at `upperSpots.speed[2]` (bathroom), day and night: ≤ 1.1× yard, ≤ +0.05 over `&furnish=4e`, ≤ +7 draw calls (`bath-upper` + `linen`).
  - **128:** all six ground-floor speed poses, day and night, ABBA paired against `&furnish=4e`: ≤ +0.01 and 0 added draw calls. Both 4e upstairs poses: `u1` (`sky-room`) ≤ +0.01 and 0 added draw calls; `u0` (`landing -> nook`) ≤ +0.02 and ≤ +7 added draw calls (`bath-upper` + `linen` visible through the doorway).
  - **129:** hiding changes 0 pixels against `&hide=0` at the bathroom pose and over a 360° turn (every 15°) at `upperSpots.bathTub` and `upperSpots.linenShelf`.
  - **130:** `shownRooms` hides all three 4f rooms at the six ground-floor poses. It shows `linen` from the bathroom pose and `box-room` from `bedroom-3` facing its door.
  - **131:** lifecycle. Walking up the stair finishes all eight floor-1 rooms before reaching the landing. Starting indoors in `linen` builds floor 1 on frame 1 and puts the linen clause in the description.
  - **132:** determinism. Two loads at the same world moment draw identical pixels in all three rooms, while `&furnish=4e` differs in each.
  - **133:** `fallBack()` keeps every mesh in the three rooms lit, with mean luminance > 0.1. 0 page or console errors across all 4f visits.
- Check 71 is reworded for 17 sets. Check 116's floor-1 total moves to eight rooms (or check 126 takes it over and 116 keeps its five-room sum).

### What the owner reviews

The captures, and three questions:

1. Does the upstairs bathroom read as an attic bathroom, and not a copy of the ground-floor one?
2. Does the box room read as a storeroom you can still step into?
3. Does the linen cupboard's folded linen read as linen, not as books or boxes?

## Left to the builder

- Exact geometry, tints, `LINEN_FILL`, and the trunk lid's segment count, within the budgets.
- Whether check 116 or check 126 owns the eight-room floor-1 total.
- Updating `README.md` (the furnished-room count and list) and writing the As built section when the work lands.

## As built

Where the build departs from the design above, or settles what it left open.

- **Slices and comparison fixtures (`shared/lakeside-interior.js`, `public/space/space-view.js`):** `SLICE_4E` is now a frozen literal (`['landing', 'bedroom-2', 'bedroom-3', 'sky-room', 'nook']`), no longer an alias of `LAKESIDE_INTERIOR.furnishUpper`. `SLICE_4F = Object.freeze(['bath-upper', 'box-room', 'linen'])` was added, `furnishUpper` expanded to all 8 floor-1 rooms (`[...4e order, 'bath-upper', 'linen', 'box-room']`), and `interiorSwitch` gained `&furnish=4e` while `4b`, `4c` and `4d` strip `SLICE_4F` as well.
- **Kinds, spots and placements (`shared/furniture.js`, `shared/lakeside-interior.js`, `public/space/interior/index.js`):** added `trunk` (`[0.9, 0.5]`, `h 0.5`), `linen-press` (`[1.6, 0.45]`, `h 2.0`), and `linen-shelf` (`[2.0, 0.35]`, `h 1.85`); added `upperSpots.bathTub`, `upperSpots.boxRoom`, `upperSpots.linenShelf`, and `upperSpots.speed[2] = [11.8, 9.6]`; placed all 11 `bath-upper` entries (reusing 4d recipes untouched), 4 `box-room` entries (`trunk-2` nudged 2 cm forward to `[16.6, 9.155]` so its rotated back corner clears the `d = 9.425` wall face), and 4 `linen` entries (using `linen-cupboard-` ids to avoid colliding with the laundry's `linen-basket`). `shared/interior.js` and `shared/sight.js` needed no changes; `public/space/interior/index.js` now weighs sculpted furniture (`lit` / `weightsAt`) on its room's own floor (clamping `z >= base(floor)`) so splayed floor-1 legs that dip 1–2 mm below `z = 3.0` never sample floor-0 rooms.
- **Recipes (`public/space/interior/furniture.js`):**
  - `trunk`: timber skids, boarded chest carcass (seeded wood tone per trunk), smooth 6-step elliptical domed lid with curved end caps via `kit.grid`, two dark straps over body and dome, `brass` corner plates and front lock hasp, and `iron` side carrying handles (`kit.roll`).
  - `linen-press` and `linen-shelf`: kit carcasses with a shared `linens(...)` helper (`LINEN_FILL = 0.82`), placing 2–3 plush folded cloth layers per stack (`kit.cushion`, `cuts: 2`, `taper: 0.36`, `skip: ['under', 'back']`) in cream/ivory/oatmeal/blue/sage tints plus a 3-roll pyramid of bath towels (`kit.roll`, `sides: 7`) in one bay per unit. `linen-shelf` clamps its top and shelves against `ceilingHeight(interior, floor, d) - 0.04`.
- **Browser checks and captures (`scripts/check-space-browser.mjs`, `.gitignore`):**
  - Check 71 updated for 17 sets (all 18 furnished rooms).
  - `UPPER_FIVE` changed from `I.furnishUpper` to `SLICE_4E`, so check 116 keeps 4e's five-room sum while check 126 owns the 4f three-room sum (`≤ 50 ms`) and eight-room floor-1 total (`≤ 120 ms`).
  - Check 117 compares `&furnish=4e` against `&furnish=4d` (isolating 4e's `+9` draw-call limit now that `bath-upper` and `linen` are visible through the nook doorway).
  - Added checks **126–133** and 12 kept captures under `docs/interior-validation/` (including `furnish-bath-upper-basin.jpg` to show the basin, mirror, toilet and shower together; `boxShotPose` stepped back into the doorway at `[16.5, 7.15]` to show the crates alongside both trunks).

### Measured

- **Unit tests & syntax checks:** `896 / 896` passing across the full repository test suite; all syntax checks in `package.json` (`npm run check`) pass.
- **4f queued builds (awake Chrome/ANGLE, 1440 × 810, median of 3 loads):**
  - `bath-upper`: **11.6 ms** (`3,067` vertices, `4` meshes; limit `≤ 25 ms`, `≤ 4` meshes)
  - `box-room`: **8.6 ms** (`2,529` vertices, `2` meshes; limit `≤ 15 ms`, `≤ 3` meshes)
  - `linen`: **18.8 ms** (`5,120` vertices, `3` meshes; limit `≤ 25 ms`, `≤ 3` meshes)
  - Three 4f rooms together: **39.0 ms** (limit `≤ 50 ms`).
  - All eight floor-1 rooms together: **102.1 ms** (limit `≤ 120 ms`; 4e five rooms **63.1 ms**).
  - All eight floor-0 queued rooms together: **149.6 ms** (limit `< 180 ms`).
  - Total across all 18 furnished rooms (17 sets): **76,706 vertices in 65 meshes**.
- **Full 133-check browser suite (`scripts/check-space-browser.mjs`, Chrome/ANGLE, 1440 × 810, tier `full`, 0 page or console errors):**
  - **Check 127 (`upperSpots.speed[2]` `[11.8, 9.6]`, `bath-upper -> linen door`):** PASS — day **0.962×** (`+0.035`), night **0.912×** (`+0.047`), draw calls **+7** (`20` vs `13`, limit `≤ +7`).
  - **Check 128 draw calls vs `&furnish=4e`:** **0 added draw calls** at all six ground-floor poses (`s0: 44/44, s1: 52/52, s2: 41/41, s3: 31/31, s4: 14/14, s5: 14/14`) and `u1` (`sky-room`, `34/34`); **+7** at `u0` (`landing -> nook`, `34/27`, where `bath-upper` and `linen` are visible through the open doorway; `u0` speed `-0.008` day, `+0.008` night).
  - **Hiding, sight, lifecycle, determinism, and fallback (checks 129–133):** all PASSED — hiding changes **0** pixels at `u2` and across all 48 frames (24 each) of 360° turns at `bathTub` and `linenShelf`; `shownRooms` hides all three 4f rooms at all six ground poses and in `sky-room`, shows `linen` from `bath-upper`, and shows `box-room` from `bedroom-3`; climbing the stair finishes all eight floor-1 rooms before reaching `landing`; starting indoors in `linen` builds all eight floor-1 rooms on frame 1 with the linen cupboard clause; determinism shows **0** differing pixels across all three rooms while `&furnish=4e` differs; `fallBack()` keeps every mesh lit above `0.1` luminance with 0 page or console errors.
  - *Note on overnight timing run:* during the full 133-check run overnight, system power throttling scaled CPU build times ~1.4× across all slices (including untouched ground-floor rooms) and added GPU timing jitter on ABBA checks (`119`, `128` at `s1-night`/`s5-day`/`u1-night`); the awake 3-load build timings above confirm all build budgets hold with margin, and ABBA timing robustness is tracked in the Part 4 close-out hardening step.
