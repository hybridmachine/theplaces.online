# Cabin interior, part 4b: furnishing the kitchen and dining room — design

Status: built behind `?interior=1`, awaiting owner review (November 21, 2026). See As built at the end.

This is the second slice of part 4 of `2026-11-17-cabin-interior-design.md` (the parent). Its first slice, `2026-11-21-cabin-interior-part-4a-living-hall-furnishing-design.md` (4a), is built and merged, and its design and As built sections are the starting point: everything there about how a piece is described, made, lit, grounded, checked and allowed to fail holds here unless this document says otherwise.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction.

## Intent

The kitchen and the dining room stop being bare rooms seen through the living room's and the hall's openings, and become the working and eating end of the house: a range on the back wall with pans above it, a farmhouse table, a dresser of plates; a table laid for six by the back window.

What the owner said after walking 4a's rooms (November 21, 2026):

- The layout of the living room and hall is good. The arrangement below was shown to the owner and accepted with nothing missing.
- The painted look does not work well on objects; they will want more realistic textures. That is a later piece of work, not this one. This slice is about layout: which pieces, where, how they are walked round.

## Goals

- Both rooms furnished so their purpose reads at a glance, by day and by lamp light, made the way 4a's pieces are made.
- Furniture stops the walker; every opening of both rooms stays reachable, a visitor can walk living room → kitchen → dining room → hall without snagging, and can stand at the range, at the dresser and at the dining window.
- The stutter at the front door does not grow (see The build, spread out).
- The speed limit still holds.
- Still behind `?interior=1`.

## Non-goals

- Textures, plates, or any change to how surfaces are painted. 4a's known weak points (strong brushwork on small pieces, flat cloth, faint grounding) are inherited as they are and are not tuned here. **(owner's decision)**
- The other fourteen rooms, including the pantry and laundry seen through the kitchen's doors.
- Anything the visitor can operate or sit on.
- New light: the range is cold and gives no glow; nothing here lights the room. **(call)**
- Any change to the blueprint's rooms, openings, windows or fittings. Both rooms' hanging lamps stay where they are.
- Cast shadows, sound, server or persisted-state changes, new art files.
- Re-tuning 4a's rooms.

## Anti-goals

- A furnished kitchen that makes the door stutter longer for every visitor.
- Furniture that appears while the visitor is looking at its room.
- A dining room where the chairs fence the visitor off from the window.
- Pieces made in a way the later texture work would have to take apart (see Surfaces, named).
- Two visitors seeing different rooms.

## Constraints found in the project

- **The kitchen** is a 2.5–7, d 7–12. Its openings: to the living room on d = 7 over a 3.5–6; to the dining room on a = 7 over d 7.5–11.5 (open plan); the laundry door on a = 2.5 over d 7.8–8.8; the pantry door on a = 2.5 over d 10.2–11.2. Hanging lamp at [4.75, 9.5]. No window. Its only unbroken wall is the back wall (d = 12); the a = 2.5 wall has 1.4 m between the two doors.
- **The dining room** is a 7–11, d 7–12. Its openings: to the hall on d = 7 over a 7.6–10.4; the open side to the kitchen. The back window is at a = 10 (9.3–10.7), sill 0.8 m. Hanging lamp at [9, 9.5]. Its only unbroken wall is a = 11.
- Rule 3 of `furnitureFit` (`shared/interior.js`) keeps solid pieces out of a box half a metre either side of every opening's line, over its span. On the back wall this stops a kitchen worktop at a = 6.5 and starts a dining sideboard at a = 7.5. Solid footprints may not overlap each other, so a chair cannot be tucked under a table.
- Rule 8's 0.9 m walk is cut down to the hall and living room (`FURNISHED`, `furnishedWay`, `wideTargets`).
- The interior is first built in the yard, when the door is wanted (`space-view.js`: the visitor within about 1.5 m of the door and facing it), or at load for a visitor who starts indoors. So the build's cost is a stutter seen from the yard as the door swings. Today: about 186 ms in all, of which 4a's furniture is about 64 ms against an 80 ms budget.
- From the arrival spot the dining room is in view through the hall's wide opening, and the kitchen is in view from most of the living room.
- All furniture is merged into five meshes (wood, cloth, stone, shades, grounding), built by `buildFurniture` in one go.
- `scripts/check-space-browser.mjs` already stands and reads in these two rooms: the `kitchen` capture pose [6.4, 7.6]; the dining window's pane spot [10, 9]; check 43's sideways view from [3.2, 10]; check 59's pose in the dining room and its wall strip and floor patch; check 66's floor line through the kitchen–dining opening.

## Approaches considered

The pieces are made 4a's way; that was settled there. What is open here is the cost of building them, since two more rooms will not fit in what is left of the first build's budget.

1. **One build, a bigger budget.** Everything is built when the door is wanted, as now, and the furniture budget is raised by about 60 ms a slice. Nothing new to write. The stutter at the door grows with every slice: roughly 250 ms after this one and over 400 ms once every room is furnished.
2. **The build, spread out — chosen (call).** The shell and 4a's two rooms are built when the door is wanted, exactly as now. The remaining furnished rooms are built in the frames that follow, one room a frame, and are all in place before the visitor can see indoors. The door's stutter stays where the owner approved it; each later frame carries a small, bounded cost. It needs a queue, a per-room mesh set, and a rule for the visitor who starts indoors.
3. **Each room built when the visitor nears it.** The least work up front, but both of these rooms are in view from where the visitor arrives or from the next room, so furniture would appear while looked at. Ruled out by the anti-goal.

The owner asked for the design to be written before choosing; 2 is the author's pick and is the one decision here most worth the owner's eye.

## Design

### What goes in each room

Must-haves are the parent's. The arrangement is the one the owner accepted. Dressing is the author's **(call)**. Sizes and positions are intended, not exact: the builder may adjust within the rules under Placement.

Kitchen:

- **Back wall, a 2.6–6.5, 0.6 m deep:** a sink unit toward the pantry (about 1.3 m), the range in the middle (about 1.0 m, near a = 4.4), a plain worktop toward the dining room (about 1.6 m). The range has a flue pipe rising to the ceiling. **(call)**
- **A pan rail** on the back wall above the range and worktop, with four or five pans hanging from it.
- **The dresser** on the a = 2.5 wall between the laundry and pantry doors (about 1.2 m wide, 0.45 deep, d 8.9–10.1): cupboard below, open shelves of plates above.
- **The table** under the lamp at [4.75, 9.5], about 1.5 × 0.8 m, long side along `a`. Two chairs on its living-room side.
- **Dressing:** a kettle on the range and a cloth over its rail; jars and a breadboard on the worktop; a bowl and a loaf on the table; plates, a few cups and a jug on the dresser.

Dining room:

- **The table for six** under the lamp at [9, 9.5], about 1.8 × 0.9 m, long side along `d` (front to back). Two chairs on each long side, one at each end.
- **A rug** under the table and chairs (walk-over).
- **The sideboard** on the back wall between the kitchen side and the window (about a 7.5–9.1, 0.45 deep, no taller than is sensible beside a 0.8 m sill). Not on the a = 11 wall: there it would leave under half a metre behind the chairs and close off the window.
- **Dressing:** a jug and a stack of plates on the sideboard; a pair of candlesticks and a bowl on the table; two framed pictures on the a = 11 wall.

```
 d=12 ┌[sink unit ][ range ][ worktop ]····┬[ sideboard ]═window═─┐
      │           (pan rail above)         ┆             ↑stand   │
pantry▯                                    ┆        ▫             │
      │                                    ┆    ▫ ┌────┐ ▫        │ pictures
      ▐dresser      ┌──────────┐           ┆      │table│  ◦lamp  │ on this
      ▐             │  table ◦ │           ┆    ▫ └────┘ ▫        │ wall
laundry▯            └──────────┘           ┆        ▫   (rug)     │
      │               ▫      ▫             ┆                      │
 d=7  └──────┬── to living ──┬─────────────┴┬───── to hall ─────┬─┘
     a=2.5  3.5              6             a=7   7.6          10.4 a=11
```

Chairs stand at their table's edge, pulled out a hand's width, since footprints may not overlap; one or two are a few degrees askew. **(call)** Nothing else is square and even either, by the same seeded irregularity as 4a.

### Placement: the rules, widened

4a's rules 1 to 7 apply to the new pieces as written. In addition:

- **Rule 8, the 0.9 m walk,** now runs over the hall, living room, kitchen and dining room together. From the arrival spot a walker 0.9 m wide must reach each opening of those four rooms (the pantry and laundry doors and the kitchen–dining opening included) and the stair foot. 4a's own targets must still pass. **(call)**
- **Rule 8 also asks for the ways through.** Reaching a doorway from one side proves nothing about the room beyond it, so two more 0.9 m walks are required, each within one room alone (that room and its openings, as `furnishedWay` cuts the floor down today): across the dining room from the kitchen–dining doorway to the hall–dining doorway, and across the kitchen from the living–kitchen doorway to the kitchen–dining doorway and to each of the pantry and laundry doors. These are what a table or chair can break, and what the tests break. **(call)** If the 0.1 m flood grid leaves the dining room's way along its hall side too thin to be sure of, the builder may set the dining table up to 0.15 m off the lamp's centre toward the window.
- **New named spots** in `spots`, each standable and reachable by the ordinary 0.25 m rule: at the range; in front of the dresser; at the dining window (in front of the glass, about [10, 11.4]). **(call)** The way down the a = 11 wall to the window is aimed at 0.9 m but is held only to the ordinary rule, as the way in among the fire group is. The gaps between chairs need not be walkable.
- **A new speed spot** (below) is added to `spots.speed` and must stay standable. 4a's two do not move.
- No solid piece stands under a wall lamp or blocks the dining window's view from its spot above sill height (the sideboard stays clear of the window's span). **(call)**
- A remembered place that now falls inside a piece falls back, as today.

### New kinds

Added to `shared/furniture.js` with footprints and standings: the range, the sink unit, the worktop, the dresser, the two tables, a chair, the sideboard (solid); the pan rail (wall-hung); pans, the kettle, the cloth, jars, the breadboard, the loaf, bowls, plates, cups (set on). The rug, pictures, jug and candlesticks are existing kinds. Whether the two tables and the three back-wall units are separate kinds or one kind with a `size` is the builder's. A wall-hung piece may hang above a solid one (the rail above the worktop), as a picture may today.

### How a piece is made

4a's kit and recipes, extended in the same files, under the same rule for what may be sculpted. Allowed sculpted here **(call)**: chair legs and back spindles; the pans, kettle, jug, bowls, plates and cups (spun); the loaf; the cloth (draped); the flue pipe, the range's rail and the tap. Everything else is kit: boxes with broken edges, boards, posts, framed panels.

Light on furniture, tucked surfaces (under the tables, inside the dresser's shelves, under the worktop's overhang) and grounding patches are 4a's, unchanged, using its coarse weighing. Every solid piece, each chair included, gets its patch.

### Surfaces, named

The owner intends a later change to realistic textures. So that it does not have to take recipes apart **(call)**:

- No new lit material is added here. Iron, copper, enamel and china are tints on the existing wood, cloth and stone materials, as 4a's pieces are.
- Each part of a recipe states the surface it stands for (wood, cloth, stone, iron, copper, china) by name where it picks its tint, in one place per recipe, so a later pass can map a surface name to a texture. 4a's recipes are not reworked for this.
- No effort goes into tuning brush scale or tints beyond making each piece read as what it is.

### The build, spread out

- When the door is wanted, the interior is built as today: the shell, the fireplace, the fittings, and the furniture of the hall and living room. That build's cost must not grow: 4a's check of it (furnished against bare, at most 80 ms added) keeps its limit and counts only those two rooms.
- The furniture of the remaining furnished rooms (here, the kitchen, then the dining room) is built in the frames after that one, one room a frame. Each such build is its own mesh set, added to the interior's scene when done. **(call)**
- **By the time the entry's fade-in begins, every furnished room is built.** If the queue is not empty then, what is left is built at once, before the fade-in. With reduced motion (a plain cut) the same holds at the cut. **(call)**
- A visitor who starts indoors (a remembered place) gets everything built at load, in one go, as today.
- `&bare=1` and a failed build behave as in 4a. A room whose queued build throws stays bare, with one warning naming it; its pieces go into `skipped`, and the walker drops them by `withoutPieces`, as for a single failed piece. Until a room's build has run, the walker already walks by the furnished blueprint (nothing can be standing there yet).
- `furnished`, the counts, `pieceBox`, `setLight`, `fallBack` and `dispose` cover the later rooms once built. The description's `furnished` clause for a room is used only once that room is built.
- The order of rooms in the queue is fixed, the same for every visitor.

### Speed

- 4a's two checked poses keep their limits and must not get worse because these rooms exist behind them.
- **A new pose** is measured, by day and under the night study with both rooms' lamps lit by fixture: standing in the kitchen near the living-room opening (about [5.2, 7.9]), facing the dining window across both tables. Limit: 1.1 times a yard frame, and no more than 0.05 above the same pose with `&bare=1` on the same run. **(call)**
- **What "added" is measured against (call):** the interior with only 4a's two rooms furnished, not `&bare=1`, which strips 4a's furniture too. A check-only switch beside `&bare=1` gives that build (the queue left empty), and the walker then walks by the blueprint without the queued rooms' pieces. The 0.05 speed allowance above is against that build as well.
- **Mesh sets (call):** a queued room has its own set of at most 4 meshes (wood, cloth, stone, grounding; no shades). Nothing is merged into 4a's five meshes after the fact, so there is no second upload of them. This is the cost of spreading the build: more draw calls when several rooms are in view.
- Budget for these two rooms **(call)**: at most 8 added draw calls at the new pose; each room's queued build at most 40 ms in its frame (median of three loads); vertices reported.
- Two of 4a's checks are reworded to fit, not loosened for 4a's rooms: check 71's "at most 5 furniture meshes" becomes at most 5 for the first build and at most 4 for each queued room; check 73's "at most 6 added draw calls at the living room's capture pose" and its 80 ms are measured with only 4a's rooms furnished against bare, as they were. With all four rooms furnished, the calls at that living-room pose are recorded and may be at most 4 more.
- If a limit is missed, 4a's remedies in its order: fewer cuts in kit faces, coarser sculpted forms, fewer dressing pieces. Then come back to the owner. Dropping a must-have, or a chair, is the owner's decision.

### The description

One fixed clause per room, after its name, as for 4a's rooms: for the kitchen, that a range stands on the back wall and a table in the middle; for the dining room, that a table is laid for six by the window. Wording is the builder's. **(call)**

### Checks

- Node tests: each new kind's footprint and standing; the real blueprint valid, with nothing skipped; rule 8 over four rooms, with a blueprint that blocks the way through the kitchen and one that blocks the way through the dining room; each new named spot, with a blueprint that covers it; walking and sliding along the kitchen table and a dining chair; a remembered place inside a new piece falls back; the queue (order fixed, a throwing room leaves the others built and drops its pieces from the walk, everything built at once when starting indoors).
- Browser captures under `docs/interior-validation/`:
  - the kitchen from the living-room opening by day, and at night with its lamp lit;
  - the range, pan rail and worktops close to;
  - the dresser;
  - the dining room from the hall opening by day, and at night with its lamp lit;
  - the dining table from the kitchen side, with the window beyond;
  - at the dining window, looking out;
  - the kitchen seen from the living room's hearth, and the dining room seen from the arrival spot, to show what the first two rooms now look through to;
  - a low view along the floor under the dining table;
  - both rooms after `fallBack()`.
- Browser checks: the new speed pose, furnished and bare; the draw-call and queued-build budgets; the door-time build no dearer than 4a's limit; at the first indoor frame after entering through the door every furnished room's furniture is present; the same with reduced motion; started indoors, all present at the first frame; the same furniture on two loads at the same world moment; the yard-unchanged check still passes.
- Existing checks keep passing, with 4a's allowance: a spot or sampled patch that a new piece now covers may move to the nearest clear place that still tests the same thing, each move listed in the plan and then in As built. Known to need it: the dining pane spot [10, 9] (beside a chair), check 43's [3.2, 10] (beside the dresser), and checks 59 and 66, whose wall strip, floor patch and floor line in the dining room and through the opening will have tables, chairs or the rug on them. Where no clear place tests the same light, the reading is taken with the furniture hidden, as 4a did for check 56, and that is said. The three speed spots may not move.
- New modules added to `npm run check`.

### What the owner reviews

The captures. Two questions: is each room's layout right when seen built; and is spreading the build acceptable as it behaves at the door. The look of the surfaces is not under review here.

## Left to the builder

- File and helper names, the shapes of the new kinds and blueprint entries, and whether like pieces share a kind.
- Every size, position, turn and tint within the rules above; the exact spots.
- Which allowed pieces are in fact sculpted, and how finely.
- How the queue is driven, and how the "all built before the fade-in" rule is enforced.
- The count and exact choice of dressing pieces within the budget.
- The wording of the description clauses.

## As built

Where the build departs from the design above, or settles what it left open. New kinds, `piecesIn` and `withoutRooms` live in `shared/furniture.js`; widened rule 8 (`FURNISHED`, `furnishedWay`, `wideTargets`, `throughWays`), rule 9 (wall-window sill clearance) and any-named-spot rule 7 live in `shared/interior.js`; `furnishLater: ['kitchen', 'dining']`, the new pieces and the new spots live in `shared/lakeside-interior.js`. `SURFACES`, `COLOURS` additions (`iron`, `copper`, `china`, `enamel`), `pal.surface` and the new recipes live in `public/space/interior/furniture.js`; per-room queued building (`pending`, `buildNext`, `buildRest`, `furnishedRooms`, per-set counts/timings) lives in `public/space/interior/index.js`; frame-by-frame queue driving, `&furnish=first` and per-room `furnished` live in `public/space/space-view.js`; the kitchen and dining clauses live in `public/scene-description.js`.

### Placements

- Every kitchen and dining piece stands where the plan's tables put it, with two small adjustments settled during testing and capture review:
  - **`pan-rail`** moved from `along: [4.0, 6.2]` to `along: [4.65, 6.45]` (still on wall `d = 12` at `z = 1.75`). At `[4.0, 6.2]` the rail cut straight through the range's flue pipe at `a = 4.4`. Starting at `4.65` leaves the flue cleanly clear while keeping all five pans over the range and worktop.
  - **`chair-dining-1..4`** moved 2 cm inward from `a = 8.28 / 9.72` to `8.30 / 9.70` (still clear of the dining table's `a = 8.55 / 9.45` edges). That gives the `a = 11` side-wall corridor to `[10.44, 11.2]` full 0.9 m clearance on the 0.1 m flood grid (pinned in `test/interior.test.js`).
- The **dining table** stayed centred under its lamp at `[9, 9.5]` (no shift toward the window was needed; the 0.9 m way through to the hall passes on row `d = 7.6`).
- The **`sink-unit`** counter top sits at `z = 0.82` m (basin floor at `0.66` m) so the copper tap arches to `z = 0.90` m and stays within `KINDS['sink-unit'].height` (`0.9` m).
- **Named spots** added: `spots.range = [4.4, 10.9]`, `spots.dresser = [3.5, 9.5]`, `spots.diningWindow = [10, 11.4]`, and `spots.speed[2] = [5.2, 7.9]`. None of the three speed spots moved.

### Which pieces are sculpted

- **Sculpted** (`turned`, `roll`, `drape`, then weighed coarsely per vertex): chair legs, back stiles and back spindles; the five hanging pans, the kettle (body, spout, arched handle), the sideboard's full-width jug, the kitchen and dining bowls, the dresser's display and stacked plates, the sideboard's plate stack, the dresser's two cups, the dining candlesticks; the cob loaf; the tea towel draped over the range's rail; the range's flue pipe and front towel rail; the sink's tap.
- **Kit** (through `face`): sink unit carcass/deck/basin, range body/doors/hotplates, worktop, dresser carcass/cupboard/shelves, kitchen table, dining table, sideboard, pan rail bar and brackets, the three worktop storage jars, the breadboard, the dining rug, and the two dining room framed pictures.
- Every new recipe picks its tints through `pal.surface(name, ...)` and emits geometry under `SURFACES[name].mesh` (`wood`, `cloth` or `stone`). 4a's recipes were left unchanged.

### Check spots and checks changed

| Check | Was | Now | Why |
|---|---|---|---|
| 40, pane spot `dining` | `[10, 9]` | `[10.45, 11]` (asserted standable) | `[10, 9]` is within `chair-dining-3`'s clearance |
| 43, dining window from kitchen | `[3.2, 10]` | `[3.5, 10]` (asserted standable) | `[3.2, 10]` is within the dresser's clearance; `[3.4, 10.6]` clipped too much of the pane behind the `d = 11.5` jamb |
| 59, kitchen–dining light leak | default load | loaded with `&furnish=first` | tests the shell's wall strip and floor patch behind the dining sideboard and table |
| 66, kitchen–dining floor line | default load | loaded with `&furnish=first` | tests the bare floor line across the opening, now under the dining rug and chairs |
| 71, furniture mesh count | at most 5 meshes total | at most 5 in `sets[0]` and at most 4 in each queued set | per-room mesh sets |
| 73, living capture draw calls & first-build time | furnished vs `&bare=1` (≤ 6 calls, ≤ 80 ms) | `&furnish=first` vs `&bare=1` (≤ 6 calls, ≤ 80 ms; full first build also ≤ 80 ms); all-furnished living calls recorded (≤ 4 more) | the door-time build is 4a's rooms only |
| `test/window-views.test.js`, outer wall dining eye | `0.5` m off the back wall (`[8.8, 11.575]`) | `0.9` m off the back wall (`[8.8, 11.175]`, asserted standable) | `[8.8, 11.575]` falls inside the sideboard |

### Measured

Full browser check suite (`scripts/check-space-browser.mjs`): headless Chrome through ANGLE on Apple Silicon, 1440 × 810, tier `full`, on a quiet machine. **89 of 89 checks passed**, 0 page or console errors. `docs/interior-validation/browser-results.json` holds checks 32–89 (58 entries, all passing).

- **First build at the door (check 73):** `&furnish=first` adds **+64.5 ms** over `&bare=1` (full load's first build **+65.0 ms**; medians: first `188.4 ms`, full `188.9 ms`, bare `123.9 ms`) against the **80 ms** budget. Draw calls at the living capture pose: **+5** (`&furnish=first` vs `&bare=1`, limit `6`), and **+0** more with all four rooms furnished (limit `4`).
- **Queued per-room builds (check 83, median of 3 loads, limit 40 ms):**
  - `kitchen`: **31.0 ms** (`31.0, 30.7, 31.6` ms), `5,501` vertices in `4` meshes (`furniture-wood` 4,173, `furniture-cloth` 90, `furniture-stone` 1,126, `grounding` 112).
  - `dining`: **26.9 ms** (`26.9, 26.9, 26.9` ms), `5,192` vertices in `4` meshes (`furniture-wood` 4,061, `furniture-cloth` 232, `furniture-stone` 771, `grounding` 128).
  - `sets[0]` (`living`, `hall`): `12,092` vertices in `5` meshes (`64.7` ms).
  - Total across all four furnished rooms: **22,785 vertices in 13 meshes**.
- **Speed at `[5.2, 7.9]` facing the dining window (check 81, limits ≤ 1.1x yard and ≤ +0.05 over `&furnish=first`):**
  - Day: **1.086x** yard (`12.6 ms` vs `11.6 ms`), against `&furnish=first` `1.042x` (**+0.044**).
  - Night (kitchen and dining lamps lit by fixture): **1.042x** yard (`12.3 ms` vs `11.8 ms`), against `&furnish=first` `1.061x` (**−0.019**).
- **Draw calls at `[5.2, 7.9]` (check 82):** **+7** (`41` all furnished vs `34` `&furnish=first`, limit `8`).
- **4a speed poses (checks 50, 63, 78, 79):** `[4.2, 3]` day **1.034x**, night **1.059x** (limit `1.1`); `[3.8, 5.5]` night **1.095x** vs bare `1.059x` (**+0.036**, limit `+0.05`).
- **Queue and entry checks (checks 84–88):** entering through the door with normal and reduced motion both report `pending: []` with both queued sets in the scene on the first indoor frame; starting indoors in the kitchen reports `pending: []`, `furnished: true` and includes the kitchen's description clause; kitchen 3-load determinism reads `0` difference (`&furnish=first` differs by `43.4%`); after `inside.fallBack()` kitchen mean luminance is `0.575` and dining `0.613` with all meshes present.

### Cut for speed

- Nothing was cut: every planned piece, chair and dressing item built and drew within budget.

### Known weak points, as the captures show them

- **Brushwork weight (inherited from 4a, out of scope here):** wood cabinetry, iron, copper pans, china plates/jars and the tea towel carry the strong `hills` / `stone` brushwork, so small pieces (jars, plates, breadboard, cups) read with heavy strokes and will benefit from the planned texture pass (`SURFACES` is in place for it).
- **Grounding patches are subtle by day:** visible under the dining table and chair legs in `furnish-low-dining-floor.jpg`, faint at standing height.
- **Sink counter step:** `sink-unit`'s counter sits at `0.82` m (8 cm below the adjacent range and worktop at `0.90` m) so the arched tap stays within the kind's `0.9` m height.
- **Thin daytime margin at `[5.2, 7.9]`:** `+0.044` against the `+0.05` allowance (in an earlier run on the same machine it read `+0.026`), sensitive to background load during timing.
