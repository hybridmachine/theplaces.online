# Cabin interior, part 4e: furnishing the upstairs bedrooms, landing, sky room and library nook — design

Status: built behind `?interior=1`, awaiting owner review (November 24, 2026).

This is the fifth slice of part 4 of `2026-11-17-cabin-interior-design.md` (the parent). The first four (`4a` living room and hall, `4b` kitchen and dining, `4c` study, closet passage and master bedroom, `4d` ground-floor bathroom, laundry and pantry) are built and merged, finishing the ground floor. Their design and As built sections are the starting point: everything there about how a piece is described, made, lit, grounded, queued, hidden, checked and allowed to fail holds here unless this document says otherwise.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction. Items marked **(owner)** were decided by the owner on November 23–24, 2026.

## Intent

The stair now leads somewhere inhabited. Climbing from the hall opens onto a furnished landing with a front window seat, an open library nook whose shelves climb to the roof pitch, a sky room with a daybed and telescope under the big back roof window, and two distinct upstairs bedrooms under the front slope. Only the three small back-east rooms (`bath-upper`, `box-room`, `linen`, slice 4f) remain bare.

What the owner decided:

- Slice 4e furnishes the five main upstairs rooms (`landing`, `bedroom-2`, `bedroom-3`, `sky-room`, `nook`) and introduces the upstairs machinery; slice 4f finishes the upstairs bathroom, box room and linen cupboard. **(owner)**
- Cross-floor visibility is gated by a stairwell-opening box in `shared/sight.js`, and `landing` treats the stairwell as one of its openings. **(owner)**
- Upper-floor rooms are built in a second stage (`furnishUpper`) after floor 0 finishes, flushed synchronously only when approaching/stepping onto the stair or starting indoors on floor 1, so front-door entry cost stays unchanged from 4d. **(owner)**
- Upper-floor validation adds a ceiling-clearance rule (Rule 10) for the pitched roof, plus floor-1 reachability and 0.9 m walks (Rules 7 and 8) using a sibling `upperSpots` record so existing floor-0 `spots` contracts remain untouched. **(owner)**
- The five room arrangements under What goes in each room were shown as plans and accepted. **(owner)**

## Goals

- All five upstairs rooms furnished with the parent's must-haves, by day and by lamp light, made the way 4a to 4d's pieces are made.
- Sloped library shelves follow the upper ceiling's pitch cleanly without poking through the roof plaster.
- Furniture stops the walker on floor 1. Every floor-1 room opening and named spot is reachable from the stair top, and a 0.9 m walker passes through the landing, library nook, and Bedroom 3's passage to the box-room door, and into Bedroom 2 and the sky room without snagging.
- Front-door entry time and all six ground-floor speed poses do not regress from 4d (0 unseen cross-floor draw calls at every existing speed pose).
- Upstairs speed poses hold the frame and draw-call budgets with their live roof windows active.
- Still behind `?interior=1`.

## Non-goals

- Textures, plates, tiles, or any change to how surfaces are painted. The known weak points of 4a to 4d (heavy brushwork on small pieces, faint grounding) are inherited. **(owner, from 4b)**
- The three remaining upstairs rooms (`bath-upper`, `box-room`, `linen`, slice 4f).
- Anything the visitor can operate, sit on, lie on, or look through (the telescope is a static piece; floor cushions are solid obstacles).
- New light, new lamps, or changes to `shared/interior-light.js` or `fittings.js`. Only rooms with bedside or standing lamps (`bedroom-2`, `bedroom-3`, `nook`) carry a `shades` mesh, following each room's existing lamp dial.
- Any change to the blueprint's rooms, openings, windows, stair, or fittings.
- Any change to `seenFrom` itself (`shared/sight.js`'s table stays untouched); the stairwell gate is added beside it in `doorBoxes` / `doorInView`.
- Cast shadows, sound, server or persisted-state changes, new art files.
- Re-tuning any of the ten ground-floor rooms.

## Anti-goals

- Growing the front-door entry stutter or floor-0 load time by building upper-floor furniture before the visitor climbs the stair.
- Unseen upper-floor furniture leaking draw calls into ground-floor poses (or unseen ground-floor furniture leaking into upstairs poses) when the stairwell is out of view.
- Landing furniture disappearing while visible from the hall through the stairwell.
- Any piece clipping through the pitched ceiling (`1.90 m` at the eaves rising to `3.60 m` at the ridge).
- Two identical cloned bedrooms; Bedroom 2 and Bedroom 3 must read as distinct rooms.
- Two visitors seeing different rooms.

## Constraints found in the project

- **Upper floor geometry (`shared/lakeside-interior.js`):** floor level `z = 3.0 m` (`floorRise = 3.0`), pitched ceiling `1.90 m` above floor 1 at `d = 0` and `d = 12` rising linearly to `3.60 m` at `ridgeAt = 6` (`ceilingHeight(I, 1, d)`). Stairwell cutout is `a: [9.6, 11], d: [1.5, 5.4]`; `stairTop` is `[10.2625, 5.5]`, standable at both `0.25 m` and `0.45 m` clearance (`floorArea` excludes `d <= 5.4` on floor 1).
- **The five rooms:**
  - `landing`: `a 7–11, d 0–7`. Stairwell `a 9.6–11, d 1.5–5.4` (shell already builds the railing along `a = 9.6` and `d = 1.5`). Openings: `bedroom-2` (`a = 7, d 3–4`), `bedroom-3` (`a = 11, d 5.7–6.7`), `nook` (`d = 7, a 7.5–10.5`). Wall lamp at `[8.2, 0.2, 4.5]` on `d = 0` — Rule 4 forbids any solid piece from overlapping `[8.2, 0.2]`.
  - `bedroom-2`: `a 0–7, d 0–7`. Upper chimney breast `a 0–0.4, d 2.9–4.1`. Roof window `a 3–4, d 2–3.4`. Opening to `landing` (`a = 7, d 3–4`). Hanging lamp `[3.5, 5, 5.15]`.
  - `bedroom-3`: `a 11–18, d 0–7`. Roof window `a 14–15, d 2–3.4`. Openings: `landing` (`a = 11, d 5.7–6.7`) and `box-room` (`d = 7, a 16–17`). Hanging lamp `[14.5, 5, 5.15]`.
  - `sky-room`: `a 0–7, d 7–12`. Large roof window `a 2.3–4.7, d 8.6–10.4` on the back slope. Opening to `nook` (`a = 7, d 9–10`). Hanging lamp `[5.8, 8, 5.15]`.
  - `nook`: `a 7–11, d 7–12`. Openings: `landing` (`d = 7, a 7.5–10.5`), `sky-room` (`a = 7, d 9–10`), `bath-upper` (`a = 11, d 9–10`). Hanging lamp `[9, 9.5, 5.15]`. Back eave wall `d = 12` has ceiling `1.92 m` at the inner face (`d = 11.925`); side walls `a = 7` and `a = 11` south of the doors (`d 10.1–11.55`) slope from `2.44 m` down to `2.03 m`.
- **Cross-floor visibility leak measured today:** `seenFrom(I)` links every ground room seeing `hall` with every upper room seeing `landing`. Testing `doorInView` against all six ground-floor speed poses and the living capture pose with the real 100° camera (1440 × 810) shows `wellInView = false` at all seven poses, yet `doorInView` alone returns true for 2–7 upper rooms at `s1`–`s5` because their upper doorway boxes sit in the frustum behind the solid ground-floor ceiling. Conversely, `landing`'s `doorBoxes` currently omit the stairwell opening itself, so looking up the stairwell from `hall` could fail to include `landing`.
- **Existing floor-1 browser check poses** (`scripts/check-space-browser.mjs`): `[8, 1]` (`landing.jpg`), `[6.4, 7.6]` (`sky-room.jpg`), `[3, 9]` (return-to-arrival), `paneSpots`: `bedroom-2 [3.5, 5]`, `bedroom-3 [14.5, 5]`, `sky-room [3.5, 7.6]`, and `roofPose` in `bedroom-3` at `[14.5, 6.6]`. Every proposed placement keeps all seven standable with no check-spot moves required.
- **Build queue today:** `furnishLater` holds 8 ground-floor rooms taking `145.2 ms` total (limit `< 180 ms`) before fade-in. `buildFurniture` already resolves `lift = room.floor * I.floorRise`, grounding height, and `storey(z)` light weights for floor 1, and `shadeAt` supports any room in `I.rooms`.
- **Existing `I.spots` contract:** `shared/interior.js` and `test/interior.test.js` assume every entry in `I.spots` and `I.spots.speed` (length 6) is a floor-0 `[a, d]` point. Adding a sibling `I.upperSpots` keeps all floor-0 contracts intact.
- **`scripts/check-space-browser.mjs` has 115 numbered checks;** new ones go from 116 onward.

## Approaches considered

How cross-floor visibility is kept sound without leaking draw calls:

1. **Stairwell-opening gate in `shared/sight.js` — chosen (owner).** Add `stairWellBox(I)` (`a: I.stair.a, d: I.stair.d, z: [I.groundCeiling, I.floorRise]`). Include it in `doorBoxes(I).landing` (neighbour `'hall'`) and `doorBoxes(I).hall` (neighbour `'landing'`). When the visitor's room and the target room are on **different floors**, require `boxInView(wellBox, planes)` in addition to `doorInView(boxes, target, planes, seen)`. Because the ceiling between floors is solid everywhere outside the stairwell, every cross-floor sight line must cross `wellBox`; this gives 0 unseen cross-floor draw calls at all six existing speed poses while never hiding `landing` or any visible upper room from the hall.
2. **Restrict `seenFrom` across floors by 3D raycasting.** Heavier, changes `seenFrom` (non-goal), and still wouldn't help poses in `hall` facing away from the stair.
3. **Always draw all upper rooms.** Leaks 15–25 unseen draw calls into ground-floor speed poses and breaks checks 73 and 82.

When upper-floor rooms are built:

1. **Two-stage queue (`furnishLater` + `furnishUpper`) — chosen (owner).** Ground-floor queued rooms (`furnishLater`, 8 rooms) behave identically to 4d (`buildRest(0)` at cabin entry). Upper-floor rooms (`furnishUpper`, starting with 4e's 5 rooms in order `['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room']`) queue behind floor 0: `buildNext()` steps through floor 0 first, then builds one floor-1 room per frame while indoors (or at the door if floor 0 already finished). `buildRest(1)` flushes floor 1 synchronously only when the visitor nears the stair foot (within `1.5 m` of `stairFoot`), steps onto the stair, or starts indoors on floor 1.
2. **Append floor 1 to `furnishLater` and flush all on front-door entry.** Would push reduced-motion entry and floor-0 startup past the 180 ms budget (and ~270 ms after 4f).
3. **Build floor 1 only on stepping onto the stair.** Risks a synchronous ~70–100 ms hitch on the first step of the stair; background one-per-frame building while downstairs eliminates that hitch in normal wandering while `buildRest(1)` guarantees readiness if a visitor walks straight up.

## Design

### What goes in each room

Must-haves are the parent's. The arrangements below were accepted by the owner; dressing is the author's **(call)**. Pieces against a wall stand at the wall's face (`0.075 m` inside the room line). Every position below was verified against Rules 1–10 and keeps all seven existing upstairs check poses clear.

**Landing (`landing`, `a 7–11, d 0–7`):**

- **Window seat** (`window-seat`, existing kind, `1.8 × 0.48 m`, height `0.45 m`) against the front wall (`d = 0`) east of the wall lamp, at `[9.8, 0.315]`, turn `π` (`a 8.9–10.7`, `0.7 m` clear of the wall lamp at `[8.2, 0.2]` and `0.945 m` clear of the stairwell rail at `d = 1.5`), with **two cushions** (`cushion`) set on it.
- **Runner rug** (`runner`, walk-over, `0.9 × 3.8 m`) along the west walkway at `[8.3, 3.5]`, turn `0.02`.
- **Dressing:** one framed **picture** (`picture`) hung on `a = 7` north of Bedroom 2's door (`d [1.2, 2.0]`, `z = 1.5`). The stairwell rail is already built by the shell.

```
 d=0  ┌────•──[ window seat ]─┐
      │   lamp                │
      │   (       )  ┌────────┤
      ▯   (runner )  │ stair- │
      ▯   (       )  │  well  │
      │              └────────▯ bed 3
 d=7  └───▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯───┘
     a=7      wide to nook   a=11
```

**Bedroom 2 (`bedroom-2`, `a 0–7, d 0–7`):**

- **Single bed** (`single-bed`, `1.05 × 2.0 m`, height `1.0 m`, seat `0.55 m`) head against the front slope (`d = 0`) at `[2.4, 1.075]`, turn `π`, with a **pillow** and **blanket** set on it.
- **Bedside table** (`side-table`, existing kind) at `[3.3, 0.35]`, turn `π`, with a **bedside lamp** (`table-lamp`, carrying Bedroom 2's `shades` mesh) and a **book** set on it.
- **Rug** (`rug`, walk-over, `2.2 × 2.4 m`) at `[2.8, 1.9]`, turn `0.02`.
- **Chest of drawers** (`chest-of-drawers`, `1.0 × 0.5 m`, height `0.9 m`) against the back wall (`d = 7`) at `[2.2, 6.65]`, turn `0`, with a **jug** set on it and a **mirror** (`mirror`) hung above it on `d = 7` (`a [1.9, 2.5]`, `z = 1.5`).
- **Dressing:** a wooden **chair** (`chair`, existing kind) angled in the north-west corner at `[0.8, 1.4]`, turn `π + 0.5`; a **picture** hung on `a = 0` south of the chimney breast (`d [5.0, 5.8]`, `z = 1.5`).

```
 d=0  ┌──[ch]──[ single bed ][side+lamp]──────────────┐
      │       (      rug       )                      │
      │                       ╔═roof win═╗            │
      █ breast                                        ▯ door
      █                                               ▯
      │                                               │
      │        [ chest of drawers ]                   │
 d=7  └───────────────────────────────────────────────┘
     a=0                                             a=7
```

**Bedroom 3 (`bedroom-3`, `a 11–18, d 0–7`):**

- **Single bed** (`single-bed`) head against the front slope (`d = 0`) at `[15.8, 1.075]`, turn `π`, with a **pillow** and **blanket**.
- **Bedside table** (`side-table`) at `[14.9, 0.35]`, turn `π`, with a **bedside lamp** (`table-lamp`, carrying Bedroom 3's `shades` mesh) and a **cup**.
- **Rug** (`rug`, walk-over, `2.2 × 2.4 m`) at `[15.3, 1.9]`, turn `-0.02`.
- **Small desk** (`small-desk`, `1.2 × 0.6 m`, height `0.75 m`) against `a = 11` in the roof window's light at `[11.375, 3.0]`, turn `π / 2`, with a **chair** (`chair`) at `[12.05, 3.0]`, turn `-π / 2 - 0.08`, and two **books** set on the desk.
- **Dressing:** a **picture** hung on the east gable (`a = 18`, `d [3.0, 3.8]`, `z = 1.5`). The south corridor between the landing door (`a = 11, d 5.7–6.7`) and box-room door (`d = 7, a 16–17`) stays completely clear.

```
 d=0  ┌────────────────────[side+lamp][ single bed ]──┐
      │                               (    rug     )  │
      │[desk] [ch]          ╔═roof win═╗              │
      │                                               │
      │                                               │
      ▯ landing door                                  │
 d=7  └──────────────────────────────▯▯───────────────┘
     a=11                         box-room           a=18
```

**Sky room (`sky-room`, `a 0–7, d 7–12`):**

- **Daybed** (`daybed`, `2.0 × 0.9 m`, height `0.75 m`, seat `0.45 m`) under the back slope and big roof window at `[3.5, 10.7]`, turn `0`, with **two cushions** and a **throw** set on it.
- **Rug** (`rug`, walk-over, `3.2 × 2.8 m`) centred under the roof window at `[3.5, 9.6]`, turn `0.01`.
- **Two floor cushions** (`floor-cushion`, solid, `0.55 × 0.55 m`, height `0.16 m`) on the rug beside the daybed at `[1.9, 9.5]` (turn `0.2`) and `[2.4, 8.6]` (turn `-0.3`).
- **Telescope on a tripod** (`telescope`, solid, `0.65 × 0.65 m`, height `1.45 m`) at `[4.9, 9.0]`, turn `-0.6`, its tube angled upward toward the roof window.

```
 d=7  ┌───────────────────────────────────────────────┐
      │                                               │
      │            ╔═════ roof window ═════╗          │
      │        (cush)   (    rug    )  [telescope]    ▯ door
      │             [     daybed     ]                ▯
 d=12 └───────────────────────────────────────────────┘
     a=0                                             a=7
```

**Library nook (`nook`, `a 7–11, d 7–12`):**

- **Eave bookcase** (`eave-bookshelf`, `3.0 × 0.35 m`, height `1.88 m`) along the `d = 12` eave wall at `[9.0, 11.75]`, turn `0`, fitting neatly under the `1.92 m` inner-face ceiling and packed with books.
- **Two sloped bookcases** (`sloped-bookshelf`, `1.45 × 0.35 m`, `sloped: true`, nominal height `2.40 m`, `minHeight: 1.5 m`) along `a = 7` at `[7.25, 10.825]` (turn `π / 2`) and along `a = 11` at `[10.75, 10.825]` (turn `-π / 2`), south of the sky-room and bath-upper doors (`d 10.10–11.55`), their carcasses and top boards sloped to follow `ceilingHeight(I, 1, d) - 0.04` (from `2.40 m` down to `1.99 m`) with books on each full shelf.
- **Rug** (`rug`, walk-over, `2.2 × 2.0 m`) at `[9.0, 10.3]`, turn `0.02`.
- **Reading chair** (`armchair`, existing kind) angled in the south pocket at `[8.45, 10.7]`, turn `0.45`.
- **Standing lamp** (`standing-lamp`, existing kind, carrying the nook's `shades` mesh) beside the chair at `[9.55, 11.05]`, turn `0` (height `1.60 m` under the `2.17 m` ceiling there).

```
 d=7  └───▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯───┐
      │                       │
      ▯ sky-room       bath ▯ │
      ▯                     ▯ │
      │║   [chair]  (lamp)  ║ │  ║ = sloped shelves
      │║   [ eave shelves ] ║ │
 d=12 └───────────────────────┘
     a=7                     a=11
```

Nothing is square and even, by the same seeded irregularity as 4a to 4d.

### Placement: Rules 7, 8 and new Rule 10

Rules 1 to 6 and 9 apply to floor-1 pieces as written (Rule 3's stairwell box already keeps floor-1 solids off the stairwell). In addition:

- **Rule 10, ceiling clearance (owner; details are calls):**
  - Every solid piece on floor `f` must fit under `ceilingHeight(I, f, d)` across its footprint `d = [d0, d1]`. Because `ceilingHeight` is concave with its ridge at `I.ridgeAt`, its minimum on `[d0, d1]` is at an endpoint: `minC = Math.min(ceilingHeight(I, f, d0), ceilingHeight(I, f, d1))`, `maxC = Math.max(ceilingHeight(I, f, d0), ceilingHeight(I, f, d1))`.
    - For a regular solid piece: `KINDS[e.kind].height <= minC + EPS`.
    - For a slope-fitted solid piece (`KINDS[e.kind].sloped === true`): `minC >= (k.minHeight ?? 1.2) - EPS` and `k.height <= maxC + EPS`.
  - Every wall-hung piece on floor `f` must have bottom `e.z - k.height / 2 >= 0` and top `e.z + k.height / 2 <= minC + EPS`, where `minC` is `ceilingHeight(I, f, e.line)` for `wall === 'd'` or `Math.min(ceilingHeight(I, f, e.along[0]), ceilingHeight(I, f, e.along[1]))` for `wall === 'a'`.
- **Rule 7, extended to floor 1 (owner):** `stairTop(I) = [(I.stair.a[0] + I.stair.a[1] - I.wall / 2) / 2, I.stair.d[1] + 0.1]` is exported beside `stairFoot(I)`. When `I.upperSpots` is present, every floor-1 opening, every named spot in `I.upperSpots` (excluding `speed`) and every spot in `I.upperSpots.speed` must be reachable on floor 1 from `stairTop(I)` at `I.eyeClear` (`0.25 m`).
- **Rule 8, extended to floor 1 (owner; spots are calls):**
  - `FURNISHED_UPPER = Object.freeze(['landing', 'bedroom-2', 'bedroom-3', 'sky-room', 'nook'])` sits beside `FURNISHED` (ground floor's 10 rooms stay unchanged).
  - A `0.9 m` walker (`WIDE_CLEAR = 0.45`) reaches every floor-1 opening touching `FURNISHED_UPPER` from `stairTop(I)` walking only through `FURNISHED_UPPER`.
  - `upperThroughWays(I)` tests at `0.9 m` clearance over each room cut down on floor 1:
    - `nook`: from `landing-nook` to `nook-sky-room`, `nook-bath-upper`, and `upperSpots.nookChair`;
    - `bedroom-3`: from `landing-bedroom-3` to `bedroom-3-box-room` and `upperSpots.bed3`;
    - `landing`: from `stairTop(I)` to `landing-bedroom-2`, `landing-bedroom-3`, `landing-nook`, and `upperSpots.landingSeat`;
    - `bedroom-2`: from `landing-bedroom-2` to `upperSpots.bed2`;
    - `sky-room`: from `nook-sky-room` to `upperSpots.skyWindow`.
- **New `upperSpots` record** in `shared/lakeside-interior.js` **(call)**:
  - Named spots: `landingSeat: [8.4, 1.0]`, `bed2: [3.5, 4.0]`, `bed3: [14.5, 4.0]`, `skyWindow: [3.5, 8.2]`, `nookChair: [9.0, 9.2]`.
  - Speed spots (`upperSpots.speed`): `[[8.4, 5.8], [5.8, 9.5]]` (`landing` facing south into `nook`; `sky-room` facing west-south-west across the daybed, floor cushions, telescope and large roof window). Ground-floor `spots` and `spots.speed` (6 spots) do not change.

### New kinds

Added to `shared/furniture.js` **(call)**:

| kind | standing | size (`[wide, deep]`) | height | extra |
|---|---|---|---|---|
| `single-bed` | solid | `[1.05, 2.0]` | `1.0` | `seat: 0.55` |
| `chest-of-drawers` | solid | `[1.0, 0.5]` | `0.9` | — |
| `small-desk` | solid | `[1.2, 0.6]` | `0.75` | — |
| `daybed` | solid | `[2.0, 0.9]` | `0.75` | `seat: 0.45` |
| `floor-cushion` | solid | `[0.55, 0.55]` | `0.16` | — |
| `telescope` | solid | `[0.65, 0.65]` | `1.45` | — |
| `eave-bookshelf` | solid | `[3.0, 0.35]` | `1.88` | — |
| `sloped-bookshelf` | solid | `[1.45, 0.35]` | `2.40` | `sloped: true, minHeight: 1.5` |

Reused existing kinds: `window-seat`, `runner`, `rug`, `side-table`, `chair`, `armchair`, `standing-lamp`, `picture`, `mirror`, `table-lamp`, `pillow`, `blanket`, `cushion`, `throw`, `book`, `cup`, `jug`.

### How pieces are made

4a's kit and recipes, extended in `public/space/interior/furniture.js`, under the same rule for what may be sculpted. Allowed sculpted here **(call)**: the `single-bed` and `daybed` mattresses/bolsters (using `cushion` / `roll`), the `floor-cushion` plump pillows (`cushion`), the `telescope` brass tube, eyepiece, mount and round tripod legs (`turned` / `roll`), and the `chest-of-drawers` wooden knobs (`turned`). Everything else is kit (`face` / `box` / `board` / `post` / `books`): bed frames and headboards, chest carcass and drawer fronts, small desk, daybed slatted frame, and both bookcase carcasses and shelves.

For `sloped-bookshelf`: the recipe queries `ceilingHeight(interior, 1, d)` at the piece's world `d` across its span, bevels its side panels and top board to `ceilingHeight(I, 1, d) - 0.04` (so it hugs the plaster slope without clipping it), and places horizontal shelves + `kit.books(...)` at every shelf height that clears the slope by at least `0.26 m` (trimming the top shelf's book span where the slope comes down).

Surfaces pick tints through `pal.surface(name, …)` and emit under `SURFACES[name].mesh` (`wood`, `cloth`, `stone`, plus `shades` for lamps). One new named surface `brass` (`{mesh: 'wood', colour: 'ochre'}` or a dedicated `brass` linear colour `[1.08, 0.86, 0.42]` mapped to `wood`) is allowed for the telescope tube and drawer pulls; no new material and no new mesh name.

Set-on placements extended for new parents:
- `pillow` and `blanket` recognise `single-bed` (one pillow centred at the headboard end, blanket folded across the foot, scaled to `1.05 m` width).
- `cushion` and `throw` recognise `daybed` (two cushions along the back rail, throw draped across one end).
- `book` recognises `small-desk` (same tidy stack as `desk`) and `jug` recognises `chest-of-drawers`.
- `cup` on `side-table` sits tucked opposite `table-lamp`.

### Two-stage build queue

- `shared/lakeside-interior.js` keeps `furnishLater` as the 8 ground-floor rooms and adds `furnishUpper: ['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room']` (and exports `SLICE_4E = Object.freeze(['landing', 'bedroom-2', 'bedroom-3', 'sky-room', 'nook'])`).
- `buildInterior` maintains a two-stage queue: floor-0 rooms (`furnishLater`) first, followed by floor-1 rooms (`furnishUpper`).
  - `buildNext()` builds the next room in the combined queue (floor 0 first, then floor 1).
  - `buildRest(floor)` builds every pending room on `floor` (when `floor === 0`, flushes floor 0 only; when `floor === 1` or omitted, flushes everything remaining — or flushes floor 1 while leaving nothing on floor 1 pending). Specifically: `buildRest(0)` flushes floor-0 pending rooms only; `buildRest(1)` flushes floor-1 pending rooms only; `buildRest()` with no argument flushes all pending rooms (keeping backward compatibility with tests that call `buildRest()`).
  - `pending` continues to report all pending rooms (both floors), and `pendingFor(floor)` (or filtering by floor) lets callers and checks inspect each floor's queue.
- `SpaceView`:
  - `buildInside()` at load when `state.place === 'cabin'`: calls `this.inside.buildRest(this.state.floor)` so starting downstairs only blocks on floor 0, and starting upstairs blocks on floor 1 (and floor 0 still builds gently one per frame while upstairs, or when descending!).
  - `step()` while in the yard after `buildInside`: calls `this.inside.buildNext()` (one room per frame, floor 0 first, then floor 1 if lingering at the door).
  - `step()` while indoors:
    - On floor 0: `this.inside.buildRest(0)` ensures floor 0 is complete on entry; if near the stair foot (`Math.hypot(a - foot[0], d - foot[1]) <= 1.5`) or `onStair`, calls `this.inside.buildRest(1)`; otherwise calls `this.inside.buildNext()` so upper rooms finish quietly in background frames while the visitor wanders downstairs.
    - On floor 1: `this.inside.buildRest(1)` ensures floor 1 is complete; if near the stair top (`<= 1.5 m` of `stairTop`) or `onStair`, calls `this.inside.buildRest(0)`; otherwise calls `this.inside.buildNext()`.
- `&furnish=` under `?check`: gains `4d`, which strips `SLICE_4E` (emptying `furnishUpper` while keeping `furnishLater` intact). `4c` strips `SLICE_4D` and `SLICE_4E`; `4b` strips `SLICE_4C`, `SLICE_4D` and `SLICE_4E`; `first` strips both `furnishLater` and `furnishUpper`.

### Cross-floor visibility (`shared/sight.js`)

- Add `stairWellBox(I)`: returns `null` if `!I.stair`, else frozen `{a: [I.stair.a[0], I.stair.a[1]], d: [I.stair.d[0], I.stair.d[1]], z: [I.groundCeiling, I.floorRise]}`.
- `doorBoxes(I)`: when `I.stair` exists, appends `stairWellBox(I)` to the box list of the upper stair room (`landing`, paired with neighbour `'hall'`) and the lower stair room (`hall`, paired with neighbour `'landing'`). Also remembers each room's floor (`0` or `1`) and `wellBox` on the returned frozen object via `WeakMap` (keeping the plain `{a, d, z}` box shape unchanged).
- `doorInView(boxes, roomId, planes, seen = null, fromRoomId = null)`:
  - When `fromRoomId` is provided and `roomFloor(fromRoomId) !== roomFloor(roomId)` and `wellBox` exists: if `!boxInView(wellBox, planes)`, return `false` immediately!
  - Otherwise check each opening box of `roomId` (skipping neighbours outside `seen` when `seen` is provided), returning `true` if any box touches the frustum.
  - Because `landing`'s boxes now include `wellBox` (paired with `'hall'`), standing in `hall` (or `living`/`dining` where `'hall'` is in `seen`) and looking at the stairwell returns `true` for `landing`. Standing anywhere on floor 0 looking away from the stairwell returns `false` for EVERY floor-1 room. Standing anywhere on floor 1 looking away from the stairwell returns `false` for EVERY floor-0 queued room.
- `public/space/interior/index.js`: `shown(from, target, planes)` passes `from` as the 5th argument to `doorInView(boxes, target, planes, sightSets.get(from), from)`.

### Speed and budgets

- **Existing six ground-floor speed poses:** against `&furnish=4d`, no more than `+0.01` of a yard frame slower and **0 added draw calls** (because `wellInView = false` at all six poses).
- **Front-door entry (`check 73` & `check 104`):** first build stays `<= 80 ms` over `&bare=1`, living capture pose `ALL_LIVING_BUDGET = 4` unchanged (`+0` from 4e), `SPEED2_CALLS = 8` unchanged, and the 8 ground-floor queued rooms stay `< 180 ms` before fade-in (floor 1 is not flushed at the front door).
- **Two new upstairs speed poses**, day and night (with the room's lamp lit by fixture) **(call)**:
  1. `upperSpots.speed[0]` (`[8.4, 5.8]` on `landing` facing `[9.0, 11.7]` into `nook`, no live window in front): `<= 1.1×` yard frame and `<= +0.05` over `&furnish=4d`; `<= +9` added draw calls (`landing` ≤ 4 + `nook` ≤ 5).
  2. `upperSpots.speed[1]` (`[5.8, 9.5]` in `sky-room` facing `[3.5, 10.5, 4.4]` across daybed, telescope and live back roof window): `<= 1.1×` yard frame and `<= +0.05` over `&furnish=4d`; `<= +4` added draw calls (`sky-room` has no `shades`).
- **Queued build budgets for 4e (median of 3 loads, call):**
  - Each of the 5 rooms `<= 35 ms` in its frame (`nook` has three bookcases full of books, so allow 35 ms).
  - The 5 upstairs rooms together `<= 120 ms`.
  - Per-set mesh counts: `landing` ≤ 4 (no shades), `sky-room` ≤ 4 (no shades), `bedroom-2` ≤ 5 (with shades), `bedroom-3` ≤ 5 (with shades), `nook` ≤ 5 (with shades). Total sets: 14 (9 ground + 5 upper). Check 71 is reworded for 14 sets.
- **Budget remedies in order:** fewer cuts in kit faces, fewer books per shelf in `nook` (controlled by one constant), coarser sculpted forms (telescope / floor cushions), fewer dressing pieces.

### The description

Five fixed clauses added to `FURNISHED_TEXT` in `public/scene-description.js` **(call)**:
- `'landing'`: `'A cushioned seat stands against the front wall above the stair. '`
- `'second bedroom'`: `'A single bed stands under the slope, a lamp beside it and a chest opposite. '`
- `'third bedroom'`: `'A single bed stands under the slope and a desk catches the roof light. '`
- `'sky room'`: `'A daybed and cushions lie under the roof window, a small telescope beside them. '`
- `'library nook'`: `'Shelves climb to the roof slope around a reading chair and lamp. '`

A clause appears only once its room is built (`SpaceView.furnished` checks `inside.furnishedRooms.includes(room.id)` — wait: verify `SpaceView.furnished` checks per-room built status! If it currently only checks `inside.furnished`, update it so a floor-1 room whose build hasn't finished yet never claims furniture before it is drawn!).

### Checks

- **Node tests:**
  - `test/sight.test.js`: `stairWellBox`, `landing` and `hall` include the stairwell box; cross-floor poses where `wellBox` is out of view hide every opposite-floor room (explicitly testing all 6 ground-floor speed poses + living capture pose against all 5 new upper rooms, and upstairs `sky-room`/`nook` poses against ground-floor rooms); standing in `hall` looking up the stairwell shows `landing`; standing on `landing` looking down the stairwell shows cross-floor rooms whose doors are in view.
  - `test/furniture.test.js`: all 8 new kinds' standing, size, height, `sloped` flag, and set-on compatibility (`pillow`/`blanket` on `single-bed`, `cushion`/`throw` on `daybed`, `book` on `small-desk`, `jug` on `chest-of-drawers`, `cup` on `side-table`).
  - `test/interior.test.js`: real blueprint valid with nothing skipped; Rule 10 rejects a solid piece taller than the eave ceiling, a wall-hung piece whose top exceeds the slope, and a sloped piece placed where ceiling < `minHeight` or > `maxC`; Rule 7 checks `stairTop`, `upperSpots`, and `upperSpots.speed`; Rule 8 checks `FURNISHED_UPPER` and `upperThroughWays` (with blocking-piece tests for each of the 5 rooms); `furnishUpper` order and `SLICE_4E`.
  - `test/interior-furniture.test.js`: all 5 upper sets build cleanly within mesh limits (`shades` only in `bedroom-2`, `bedroom-3`, `nook`); every vertex carries floor-1 light weights (`z >= 3.0`); `sloped-bookshelf` max vertex `z` stays below `3.0 + ceilingHeight(I, 1, d)` across its whole span; two-stage queue (`buildRest(0)` leaves floor 1 pending; `buildRest(1)` flushes floor 1; `buildNext()` finishes floor 0 then floor 1); cross-floor `showFrom` hides upper rooms when `wellBox` is out of view and shows `landing` when looking up the stairwell; per-room failure skips dependents without affecting other rooms.
  - `test/walker.test.js`: walking on floor 1 stops and slides along `daybed`, `bed-2`, and `nook-eave-shelves`.
  - `test/place-memory.test.js`: a floor-1 saved pose inside `daybed` or `bed-2` falls back to arrival; floor-1 named spots load cleanly.
  - `test/space-view.test.js`: `&furnish=4d`, `&furnish=4c`, `&furnish=4b`, `&furnish=first`; entering through front door flushes floor 0 only (`pending` still holds floor-1 rooms unless already built in yard frames) and climbing/approaching the stair flushes floor 1; starting indoors on floor 1 builds floor 1 on frame 1 and emits the room's description clause; unfurnished room never emits its clause before its set is built.
- **Browser captures** under `docs/interior-validation/`:
  - `landing` facing the front window seat (day and lamp lit);
  - `nook` from the landing looking into the sloped shelves, armchair and lamp (day and lit);
  - `nook` sloped bookcase close-up showing the roof-pitch fit;
  - `bedroom-2` from its door (day and lit, showing bed under slope, lamp, chest);
  - `bedroom-3` from its door (day and lit, showing bed under slope, lamp, desk);
  - `sky-room` from its door (day and lit, showing daybed, floor cushions, telescope, roof window);
  - `sky-room` telescope and daybed close-up;
  - `hall` looking up the stairwell toward the landing seat (proving nothing pops);
  - all five rooms after `fallBack()`.
- **Browser checks**, numbered from **116**:
  - 116: queued builds of the 5 upstairs rooms (median of 3 loads): each `<= 35 ms`, together `<= 120 ms`; meshes `<= 4` (`landing`, `sky-room`) and `<= 5` (`bedroom-2`, `bedroom-3`, `nook`); `furnishLater` (floor 0) unchanged `< 180 ms`; vertices recorded.
  - 117: speed at `upperSpots.speed[0]` (`landing -> nook`), day and night (nook lamp lit): `<= 1.1×` yard and `<= +0.05` over `&furnish=4d`; draw calls `<= +9`.
  - 118: speed at `upperSpots.speed[1]` (`sky-room -> roof window/daybed`), day and night (sky-room lamp lit): `<= 1.1×` yard and `<= +0.05` over `&furnish=4d`; draw calls `<= +4`.
  - 119: all six ground-floor speed poses, day and night, ABBA paired vs `&furnish=4d`: `<= +0.01` and **0 added draw calls**.
  - 120: shades in `bedroom-2`, `bedroom-3`, and `nook` follow their own room's lamp (not `living`'s), while `living`'s shade still follows `living`'s lamp.
  - 121: hiding changes 0 pixels vs `&hide=0` at all 6 ground-floor speed poses, both upstairs speed poses, and a 360° turn (every 15°) at `upperSpots.nookChair` and `upperSpots.landingSeat`.
  - 122: `shownRooms` hides all 5 upper rooms at ground-floor speed poses 0–5; shows `landing` when looking up the stairwell from `hall`; hides ground-floor queued rooms at `sky-room` facing the roof window; shows every built room in the yard.
  - 123: two-stage build lifecycle: entering the front door with reduced motion finishes floor 0 (`pending` has no floor-0 rooms) without blocking on floor 1; walking up the stair finishes all 5 floor-1 rooms before reaching the landing; starting indoors in `sky-room` builds floor 1 on frame 1 and puts the sky room's clause in the description.
  - 124: determinism: two loads at the same world moment draw identical pixels in all five rooms (0 difference), while `&furnish=4d` differs in each.
  - 125: `fallBack()` keeps all meshes in all five rooms with mean luminance > 0.1; 0 page or console errors across all 4e visitors.
- Check 71 reworded for 14 sets; checks 111–112 updated if needed to assert all 10 ground-floor rooms are built on front-door entry (since floor 1 builds in stage 2).

### What the owner reviews

The captures. Four questions:
1. Do Bedroom 2 and Bedroom 3 feel comfortably distinct while both reading clearly as sloped-eave bedrooms?
2. Does the library nook's wrap-around shelving follow the ceiling pitch cleanly without looking heavy or clipping?
3. Does the sky room (daybed, floor cushions, telescope under the big roof window) read naturally at a glance?
4. Does the landing window seat sit comfortably beside the wall lamp and stairwell rail?

## Left to the builder

- Exact geometry details, wood/cloth tints, and sculpted segment counts within the budgets.
- Exact book-per-shelf constant for `eave-bookshelf` and `sloped-bookshelf`.
- Exact angle and leg splay of the tripod telescope so it aims naturally toward the sky-room roof window.
- Exact distance threshold (`~1.5 m`) for flushing floor 1 near the stair foot (and floor 0 near the stair top).
- Updating `README.md` and writing the spec's As built section when the work lands.

## As built

Where the build departs from the design above, or settles what it left open.

- **Cross-floor visibility (`shared/sight.js`, `public/space/interior/index.js`):** `stairWellBox(I)` returns `{a: I.stair.a, d: I.stair.d, z: [I.groundCeiling, I.floorRise]}`. `doorBoxes(I)` appends `stairWellBox(I)` to `landing` (neighbour `'hall'`) and `hall` (neighbour `'landing'`), and stores room floors + `well` in `BOX_META`. `doorInView(boxes, roomId, planes, seen, fromRoomId)` gates opposite-floor rooms on `boxInView(well, planes)` before checking opening boxes. `inside.showFrom` passes `from` through to `doorInView`.
- **Two-stage build queue (`shared/furniture.js`, `public/space/interior/index.js`, `public/space/space-view.js`):** `withoutRooms` filters both `furnishLater` and `furnishUpper`. `buildInterior` keeps separate floor-0 (`furnishLater`) and floor-1 (`furnishUpper`) queues, exposing `buildRest(floor)` and `pendingFor(floor)`. `SpaceView.buildInside()` flushes only `state.floor` (or both queues if an older remembered pose lacks `floor`); `SpaceView.step()` indoors flushes `state.floor`, skips background builds on the entry `move` frame, and flushes the opposite floor when `onStair(I, pos)` or within **`STAIR_FLUSH_RADIUS = 1.0 m`** of `stairFoot(I)` / `stairTop(I)` (tightened from `1.5 m` because `I.entry.position` `[9, 0.8]` lies `1.40 m` from `stairFoot(I)` `[10.2625, 1.4]`). Note: starting indoors from a remembered pose near `stairTop(I)` before floor 0 drains in the background will flush the floor-0 queue (~148 ms) in one frame; accepted for now.
- **Rules & spots (`shared/furniture.js`, `shared/interior.js`, `shared/lakeside-interior.js`):** eight new solid kinds (`single-bed`, `chest-of-drawers`, `small-desk`, `daybed`, `floor-cushion`, `telescope`, `eave-bookshelf`, `sloped-bookshelf`); Rule 10 validates solid, sloped (`sloped: true, minHeight: 1.5`, floor-1 only, single side of `I.ridgeAt`), set-on-solid/mantel, and wall-hung ceiling clearance against `ceilingHeight(I, floor, d)`; `stairTop(I)` (also used by `obstaclesFit`), `upperFurnishedWay` / `upperWideTargets` (defaulting to `I.furnishUpper`), blueprint-derived `upperThroughWays`, `upperSpots`, `furnishUpper: ['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room']`, and `SLICE_4E` (re-exporting `LAKESIDE_INTERIOR.furnishUpper`). Ground-floor `spots` and `spots.speed` (6 spots) are unchanged. In `shared/interior.js`, `furnitureFit` reuses each subgraph's `flood()` across multiple targets, keeping `validInterior(I)` ~4× faster.
- **Placements changed from the plan's initial tables:**
  - `bed2-chair` moved from `[0.8, 1.4]` (turn `π + 0.5`) to `[5.9, 1.4]` (turn `π - 0.5`, north-east corner of Bedroom 2) so the existing upper chimney-breast walk test spot `[0.4, 1.5]` in `test/walker.test.js` stays standable without changing the test.
  - `telescope` turn settled to `-1.91` rad at `[4.9, 9.0]` so its optical tube aims directly up toward the sky-room roof window (`[3.5, 9.5]`) while staying wholly inside its `0.65 × 0.65 m` footprint.
- **Sculpted vs kit (`public/space/interior/furniture.js`):**
  - **Sculpted:** `daybed` mattress cushion and two end bolsters (`cushion`, `roll`), `floor-cushion` (`cushion`, height factor `0.78` with low `taper: 0.15` so cushions rest flush on the rug), `telescope` tripod legs, spreader struts, hub, brass tube and finder (`roll`, `turned`), `single-bed` mattress and draped bedclothes (`cushion`, `drape`), `chest-of-drawers` brass knobs (`turned`), and `small-desk` drawer knobs (`roll`).
  - **Kit:** bed frames/headboards/footboards, chest carcass and drawer fronts, small desk carcass/legs, daybed timber frame/slats, `eave-bookshelf` carcass/shelves/books, and `sloped-bookshelf` trapezoid carcass, bevelled top board (through `kit.grid`), clipped shelves, and `kit.books`. One new surface `SURFACES.brass` (`COLOURS.brass = [1.08, 0.86, 0.42]`, mapped to `wood`) was added; no new material or mesh name.
- **Budget tuning:** On the first full browser run, `nook` measured `35.5 ms` (`10,791` vertices) against the `35 ms` per-room limit. Applying the planned one-constant remedy (`NOOK_BOOK_FILL = 0.78` in `public/space/interior/furniture.js`) reduced `nook` to `8,919` vertices and **`30.0 ms`** median while leaving natural breathing space on the shelves.
- **Checks and tests updated:**
  - `test/interior-furniture.test.js` updated `laterRooms`, synthetic `withoutRooms` fixtures, and set count (`9 -> 14`).
  - `test/space-view.test.js` updated floor-0 entry/start tests to assert `pendingFor(0)` empty (since floor 1 builds in stage 2).
  - `scripts/check-space-browser.mjs`: check 71 reworded for 14 sets; floor-0 entry/start checks (`84, 85, 99–101, 111–113`) check `pendingFor(0)`; added checks **116–125** and 20 captures under `docs/interior-validation/` (with `!` lines in `.gitignore`). No existing upstairs check poses moved.

### Measured

- **Unit tests:** `526 / 526` passing across all 12 interior/space/sight/furniture/walker/place-memory suites; `node --check` passes across all tracked modules.
- **Browser suite (`scripts/check-space-browser.mjs`, 1440 × 810, tier `full`, Chrome with `SKY_GPU=metal`, 0 page or console errors):**
  - **Queued builds (check 116, median of 3 loads, limits ≤ 35 ms each, 5-room sum ≤ 120 ms, 8 floor-0 rooms < 180 ms):**
    - `landing`: **4.1 ms** (`959` vertices, `3` meshes)
    - `nook`: **30.0 ms** (`8,919` vertices, `4` meshes)
    - `bedroom-2`: **10.3 ms** (`2,993` vertices, `5` meshes, with `shades`)
    - `bedroom-3`: **11.2 ms** (`2,662` vertices, `5` meshes, with `shades`)
    - `sky-room`: **11.1 ms** (`2,423` vertices, `3` meshes)
    - Five upstairs rooms together: **66.7 ms** (limit `120` ms).
    - Eight floor-0 queued rooms together: **148.2 ms** (limit `< 180` ms).
    - Total across all 15 furnished rooms (14 sets): **65,990 vertices in 56 meshes**.
  - **Upstairs speed & draw calls vs `&furnish=4d`:**
    - Check 117 (`upperSpots.speed[0]` `[8.4, 5.8]`, `landing -> nook`): day **0.850×** (`+0.002`), night **0.835×** (`+0.002`), draw calls **+8** (`27` vs `19`, limit `≤ +9`).
    - Check 118 (`upperSpots.speed[1]` `[5.8, 9.5]`, `sky-room -> daybed & roof window`): day **1.026×** (`−0.010`), night **1.035×** (`+0.009`), draw calls **+3** (`34` vs `31`, limit `≤ +4`).
  - **Ground-floor speed & draw calls vs `&furnish=4d` (check 119):** **0 added draw calls** across all six poses (`s0: 44/44, s1: 52/52, s2: 41/41, s3: 31/31, s4: 14/14, s5: 14/14`). In the non-Metal run all 12 day/night ABBA pairs passed within `+0.01` (`max +0.009`); in the Metal run 10 of 12 were within `+0.005` while `s0-day` (`+0.013`) and `s2-night` (`+0.012`) showed ~0.002–0.003 of GPU timing jitter (and check 73's `full` first build was `+69.1 ms` against the `80 ms` budget).
  - **Shades, hiding, lifecycle, determinism and fallback (checks 120–125):** all passed — upstairs shades follow their own room's lamp dial; hiding changes **0** pixels across all 8 speed poses and full 360° turns (24 frames each) at `upperSpots.nookChair` and `upperSpots.landingSeat`; `shownRooms` hides all 5 upper rooms at all 6 ground poses, shows `landing` looking up the stairwell from `hall`, and hides ground queued rooms in `sky-room`; reduced-motion entry flushes floor 0 only while climbing the stair finishes floor 1 before reaching `landing`; start-indoors in `sky-room` builds floor 1 on frame 1 with its clause; determinism shows **0** differing pixels across all 5 rooms; `fallBack()` keeps every mesh lit above `0.1` luminance with 0 errors.

