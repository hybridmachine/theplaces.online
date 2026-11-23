# Cabin interior, part 4d: furnishing the ground-floor bathroom, laundry and pantry — design

Status: design, awaiting owner approval (November 23, 2026).

This is the fourth slice of part 4 of `2026-11-17-cabin-interior-design.md` (the parent). The first three, `2026-11-21-cabin-interior-part-4a-living-hall-furnishing-design.md` (4a), `2026-11-21-cabin-interior-part-4b-kitchen-dining-furnishing-design.md` (4b) and `2026-11-22-cabin-interior-part-4c-study-passage-master-furnishing-design.md` (4c), are built and merged. Their design and As built sections are the starting point: everything there about how a piece is described, made, lit, grounded, queued, hidden, checked and allowed to fail holds here unless this document says otherwise.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction. Items marked **(owner)** were decided by the owner on November 23, 2026.

## Intent

The ground floor is finished. The three doors that still open onto bare rooms (the bath off the closet passage, the laundry and the pantry off the kitchen) open onto rooms whose purpose reads at a glance. After this slice every room a visitor can reach without climbing the stair is furnished.

What the owner decided:

- The eleven rooms still bare are furnished in three slices: 4d is the ground-floor bathroom, laundry and pantry; 4e is the upstairs bedrooms, landing, sky room and library nook; 4f is the upstairs bathroom, box room and linen cupboard. **(owner)**
- The arrangement under What goes in each room was shown as plans and accepted. **(owner)**
- A room's furniture is drawn only when one of its doorways is in view (the doorway test, under Out of sight), rather than relaxing the draw-call budgets or re-laying the rooms. **(owner)**

## Goals

- All three rooms furnished with the parent's must-haves, by day and by lamp light, made the way 4a to 4c's pieces are made.
- Furniture stops the walker. Each room's door stays reachable and a visitor can walk in and stand in the middle of each room without snagging.
- The laundry and pantry read correctly through their doors from the kitchen, and the bathroom through its door from the passage.
- The stutter at the front door does not grow, and no pose that 4a, 4b or 4c checks gets slower beyond the limits under Speed.
- Still behind `?interior=1`.

## Non-goals

- Textures, plates, tiles, or any change to how surfaces are painted. The bathroom floor and walls stay the boards and plaster they are. The known weak points of 4a to 4c (heavy brushwork on small pieces, faint grounding) are inherited. **(owner, from 4b)**
- Water in the tub, basin or wash tub; a reflection in the mirror (it is the hall's existing flat mirror kind). **(call)**
- The eight upstairs rooms (4e and 4f), and anything those slices will need: slope-aware pieces, building the upper floor later than the entry, rule 8 upstairs.
- Anything the visitor can operate, sit on or step into. The shower is a solid piece.
- New light, new lamps, lamp shades. None of the three rooms has a table lamp, so no set here carries a `shades` mesh.
- Any change to the blueprint's rooms, openings, windows or fittings.
- Any change to the seen-from table itself (`shared/sight.js`'s `seenFrom`). The doorway test is added beside it.
- Cast shadows, sound, server or persisted-state changes, new art files.
- Re-tuning the seven furnished rooms.

## Anti-goals

- A longer stutter at the door.
- Furniture that appears, or goes missing, while the visitor can see where it stands.
- A kitchen pose made slower by two small rooms behind the visitor.
- A bathroom that reads as a store room: the tub, basin and toilet must be recognisable at the door.
- Two visitors seeing different rooms.
- Pieces made in a way the later texture work would have to take apart.

## Constraints found in the project

- **The bathroom** (`bath-ground`, named "bathroom") is a 14–18, d 4–7. One opening: the passage door on a = 14 over d 5–6. No window. Wall lamp at [16, 4.2], 1.8 m up, on the d = 4 wall.
- **The laundry** is a 0–2.5, d 7–9.5. One opening: the kitchen door on a = 2.5 over d 7.8–8.8. No window. Wall lamp at [0.2, 8.25] on the a = 0 wall, directly opposite the door.
- **The pantry** is a 0–2.5, d 9.5–12. One opening: the kitchen door on a = 2.5 over d 10.2–11.2. No window. Wall lamp at [0.2, 10.75] on the a = 0 wall, directly opposite the door.
- Rule 3 keeps solid pieces out of a box half a metre either side of each opening's line over its span, and footprints may not overlap. Rule 4 keeps any solid piece, whatever its height, from standing over a wall lamp's point; so nothing solid stands against the lamp wall at the lamp in any of the three rooms.
- Rule 8's 0.9 m walk covers `FURNISHED`, seven rooms, with `throughWays` entries for each queued room. Its targets already include the bath, laundry and pantry doorway points, because those doors touch furnished rooms.
- `furnishLater` is `['kitchen', 'dining', 'study', 'passage', 'master']`. Each queued room is built in its own frame as its own mesh set; `buildRest` builds what is left before the entry's fade-in, or at load for a visitor who starts indoors. The five queued rooms measured 108.8 ms together in 4c; starting indoors measured 170.3 ms.
- **The seen-from table alone will rarely hide these rooms.** `shared/sight.js` is generous: as measured today, the laundry and pantry are seen from every room except the master bedroom and each other, and the bathroom from every room except the study. So these sets would be drawn almost everywhere indoors, kept out of a frame only by three.js's per-mesh frustum test.
- **Two existing poses would then draw them behind walls.** With the real camera (100° horizontal field of view, 1440 × 810, eye 1.6 m): at 4b's speed pose [5.2, 7.9], facing the dining window, the bathtub on the d = 7 wall is wholly inside the frustum (2 to 4 unseen draw calls; check 82's `SPEED2_CALLS` allows 8 and reads 7). At the living room's capture pose [6.2, 5.2], facing the fireplace, the whole laundry and the pantry's north shelf unit are inside it (up to 8 unseen draw calls; check 73's `ALL_LIVING_BUDGET` allows 4 and reads 0). Tight bounding volumes cannot fix either. The master bedroom's pose [12.5, 7.9] misses the bathroom by about 0.5 m.
- `&furnish=first` strips every queued room; `&furnish=4b` strips 4c's rooms (`SLICE_4C`) and keeps the rest queued.
- `SURFACES` already has `enamel` (the kitchen sink's) and `china`, both in the `stone` mesh, and `iron` and `copper` in the `wood` mesh.
- `scripts/check-space-browser.mjs` has 103 numbered checks; new ones go at the end.
- The description's clauses are keyed by room name; the ground-floor bath is "bathroom" and the upper one "upstairs bathroom", so a "bathroom" clause does not leak upstairs.

## Approaches considered

How the eleven remaining rooms are divided:

1. **Three slices — chosen (owner).** 4d finishes the ground floor with no new machinery. 4e carries everything the upper floor needs for the first time. 4f is the last three small rooms.
2. **Two slices by floor.** Fewer reviews, but an eight-room slice that also introduces all the upstairs machinery.
3. **One slice.** One review, but the largest change yet and the hardest to keep inside the budgets.

How a new room behind a wall is kept out of a frame that cannot see it:

1. **The doorway test — chosen (owner).** A queued room's set is drawn only if the visitor is in that room or one of its doorways is inside the view. Small, cannot change the picture, and it serves 4e and 4f as well.
2. **Relax the budgets** of checks 73 and 82. Nothing to build, but 4b's kitchen pose already has a thin margin and every later slice would add to the cost.
3. **Re-lay the rooms.** Moving the tub fixes the kitchen pose only; the laundry cannot be moved out of the living room's view.

How 4d's pieces are built: there is one sensible way. 4a's kit and recipes, 4b's queue and 4c's hiding all apply as they are; these rooms have no windows, no table lamps and nothing new in light or sight. Two smaller alternatives were set aside:

- **Jars as set-on pieces on the pantry shelves.** A set-on piece sits at one height (its parent's `seat ?? height`), so it cannot fill several shelves. The shelves draw their own jars instead, as the bookshelf draws its books. **(call)**
- **Folding the laundry and pantry into the kitchen's mesh set** to save draw calls. It would grow the kitchen's queued build past its 40 ms limit and its bounding volume into poses that now exclude it. Each room keeps its own set. **(call)**

## Design

### What goes in each room

Must-haves are the parent's. The arrangement is the one the owner accepted. Dressing is the author's **(call)**. Sizes and positions are intended, not exact: the builder may adjust within the rules under Placement. A piece against a wall stands at the wall's face, 0.075 m inside the room's line (walls are 0.15 m thick, centred on the line), as every existing piece does; a footprint that reaches the line itself fails `obstaclesFit`. The positions below, with stand-in kinds of these sizes, were run through `validInterior` and pass rules 1 to 9, the widened rule 8 and the three ways in.

Bathroom:

- **The basin** on the d = 4 wall left of the lamp, about 0.6 × 0.45 m at [15.1, 4.3], on a pedestal or a small washstand, with **the mirror** (the existing kind) hung above it.
- **The toilet** on the same wall right of the lamp, about 0.45 × 0.7 m at [16.7, 4.425], with a low cistern against the wall. The lamp's point at a = 16 stays clear between the two.
- **The shower** in the north-east corner, about 0.9 × 0.9 m at [17.475, 4.525], 2.0 m tall: a tray, a rail and a curtain drawn across its two open sides.
- **The bathtub** along the d = 7 wall, about 1.7 × 0.75 m at [16.3, 6.55], a roll-top tub on feet, about 0.6 m to its rim.
- **A towel rail** hung on the gable wall (a = 18) over about d 5.3–6.1 at 1.2 m, with a towel on it.
- **A bath mat** (walk-over) on the floor beside the tub, about 0.9 × 0.55 m at [16.3, 5.75].
- **Dressing:** a second towel folded on the tub's rim or the rail; a jug or a cup at the basin. Nothing on the floor between the door and the tub.

```
 d=4 ┬──[basin]───•───[wc]─────┬───────┐
     │  mirror   lamp          │shower │
     ▯ door                    └───────┤
     ▯            (mat)                │ towel rail
     │         [     bathtub     ]     │
 d=7 └─────────────────────────────────┘
    a=14                             a=18
```

Laundry:

- **The wash tub** against the d = 7 wall, about 0.9 × 0.6 m at [0.9, 7.375]: a deep tub on a stand, about 0.85 m to its rim.
- **A standing drying rack** against the d = 9.5 wall, about 1.0 × 0.45 m at [1.3, 9.2], about 1.2 m tall, with cloths hung over its rails.
- **Two baskets** on the floor by the lamp wall, south of the lamp's point, about 0.45 m across at [0.3, 8.7] and [0.3, 9.2]; one holds folded linen.
- **Dressing:** two or three cloths on the rack; a washboard or a bar of soap at the tub.

```
 d=7   ┌──[ wash tub ]────┐
       │                  │
  lamp •                  ▯ door
       │ (basket)         ▯
       │ (basket)[ rack ] │
 d=9.5 └──────────────────┘
      a=0               a=2.5
```

Pantry:

- **Two shelf units** of jars, one on the d = 9.5 wall and one on the d = 12 wall, each about 2.0 × 0.35 m and 2.0 m tall, at [1.1, 9.75] and [1.1, 11.75], facing each other. Jars, crocks and a tin or two on every shelf, drawn by the shelf's own recipe.
- **Sacks** on the floor by the lamp wall north of the lamp's point, about 0.5 × 0.45 m at [0.325, 10.15], and **crates** south of it at [0.325, 11.35], one stacked on another.
- **Dressing:** a string of onions or a ham is allowed only if hung from a shelf unit's side and drawn by that recipe; nothing is hung on the lamp wall.

```
 d=9.5 ┌──[   shelves   ]──┐
       │ (sacks)           │
  lamp •                   ▯ door
       │ (crates)          ▯
       │  [   shelves   ]  │
 d=12  └───────────────────┘
      a=0                a=2.5
```

Nothing is square and even, by the same seeded irregularity as 4a to 4c.

### Placement: the rules, widened

Rules 1 to 7 and 9 apply to the new pieces as written. In addition:

- **Rule 8, the 0.9 m walk,** runs over all ten ground-floor rooms: `FURNISHED` gains `bath-ground`, `laundry` and `pantry`. The earlier slices' targets must still pass. **(call)**
- **Ways in (call).** Each room has one door, so, as for the study and master bedroom, within each room alone a 0.9 m walk runs from its door to one named spot in the middle of its clear floor.
- **New named spots** in `spots`, each standable and reachable by the ordinary 0.25 m rule and by the 0.9 m way in **(call)**: `bath` at about [15.5, 5.5], `laundry` at about [1.6, 8.3], `pantry` at about [1.5, 10.7].
- **One new speed spot** is added to the end of `spots.speed` (below). The existing five do not move.
- A remembered place that now falls inside a piece falls back, as today.

### New kinds

Added to `shared/furniture.js` **(call)**:

- solid: the basin, the toilet, the shower, the bathtub, the wash tub, the drying rack, the basket, the pantry shelf unit, the sack, the crate;
- walk-over: the bath mat (or the existing `doormat` or `rug` kind with a size, if it reads right);
- wall-hung: the towel rail;
- set-on: the towel (on the rail, as coats sit on the hooks), and any small dressing not covered by `jug`, `cup` or `cloth`.

The mirror, the jug, the cup and the cloth are existing kinds. Whether like pieces share a kind (sack and crate, the two tubs) is the builder's.

### How a piece is made

4a's kit and recipes, extended in the same files, under the same rule for what may be sculpted. Allowed sculpted here **(call)**: the bathtub's body and feet, the basin's bowl and pedestal, the toilet's bowl and cistern, the wash tub's body, the shower curtain's folds, the towels, the sacks, the baskets' weave rims, the cloths on the rack, and the pantry's jars and crocks (coarsely: they are many). Everything else is kit: the shower's tray and rail, the drying rack's frame, the shelf units, the crates, the washstand if there is one.

Surfaces are named as in 4b: every new recipe picks its tints through `pal.surface(name, …)` and emits under `SURFACES[name].mesh`. The tub, basin and toilet are `enamel`; crocks are `china`; the wash tub is `copper` or `enamel`; towels, the curtain, sacks and linen are `cloth`. A new named surface (wicker for the baskets, say) may be added to `SURFACES` only if it maps to an existing mesh. No new lit material and no new mesh name.

Light on furniture, tucked surfaces (inside the tub and basin, under the tub, behind the curtain, the backs of the shelves) and grounding patches are 4a's, unchanged. Every solid piece gets its patch.

### The build, spread out

`furnishLater` becomes `['kitchen', 'dining', 'study', 'passage', 'master', 'bath-ground', 'laundry', 'pantry']`, in that order, the same for every visitor. **(call)** The first build at the door is unchanged and keeps its 80 ms limit. Everything is built before the entry's fade-in, or at the cut with reduced motion, or at load for a visitor who starts indoors. A room whose build throws stays bare and is dropped from the walk. All as in 4b and 4c.

A new export `SLICE_4D = ['bath-ground', 'laundry', 'pantry']` sits beside `SLICE_4C`.

### Out of sight: the doorway test

4c's hiding stays, and one test is added to it. **(owner; the details below are calls)**

- Each frame indoors, a queued room's set is drawn only if both hold: its room is seen from the visitor's room by the seen-from table, as today; and the visitor is in that room, or at least one of the room's openings is inside the view's frustum.
- An opening is taken as a box: its span along the wall, the floor to `doorHead`, the wall's thickness. The test is generous: a box that touches the frustum counts, the near plane is ignored, and a box that holds the camera counts.
- It is sound because walls are opaque and the interior has no mirrors that reflect: every sight line into a room from outside it crosses one of that room's openings. Window views draw the yard, not other rooms.
- It applies to every queued room, 4b's and 4c's included, which is the only change to their behaviour. The first build's set (hall and living room) is always drawn, as today. In the yard, on the stair, whenever the visitor's room is unknown, and with `&hide=0`, nothing changes from today.
- The geometry of the test is a pure function in `shared/` (beside `seenFrom`), given the frustum's planes and the blueprint, so it can be tested in Node; the frame calls it from where `showFrom` is called now.
- Hiding never changes what is built, the walk, the counts or the description. If the test cannot be made, sets are drawn by the table alone.
- Only ground-floor rooms are queued in this slice. Whether the test is sound for upper-floor rooms seen over the stairwell is 4e's question, not this one's.

### Speed

- **Existing five poses.** With all ten rooms furnished, against the rooms through 4c on the same run: no slower by more than run-to-run noise (0.01 of a yard frame), and no more draw calls — except at a pose where pieces of a new room are actually in the picture (shown by pixels that differ from `&furnish=4c` inside that room's doorway). There, draw calls may rise by that room's meshes and the frame by at most 0.02; each such pose is listed in As built. **(call)**
- **Checks 73 and 82 keep their budgets** (`ALL_LIVING_BUDGET` 4, `SPEED2_CALLS` 8) and must still pass. Because the doorway test also hides 4b's and 4c's sets, draw calls at existing poses may fall; a pose's recorded figure is updated in As built, and no limit is loosened.
- **One new pose**, by day and under the night study with the bathroom's lamp lit by fixture **(call)**: in the bathroom just inside its door, about [14.6, 5.5], facing along the room to the gable. Limit: 1.1 times a yard frame, and no more than 0.05 above the same pose with the rooms through 4c furnished.
- **What "added" is measured against (call):** the check-only `&furnish=` switch gains `4c`, which strips `SLICE_4D` and keeps the rest queued. `first` and `4b` keep their meanings (`4b` now strips 4c's and 4d's rooms).
- **Mesh sets:** nine in all. Each of the three new sets has at most 4 meshes (wood, cloth, stone, grounding) and no `shades` mesh. 4c's check 71 is reworded to say so.
- **Budget (call):** at most 4 added draw calls at the new pose; each room's queued build at most 30 ms in its frame (median of three loads); the three together at most 70 ms; so the eight queued rooms together stay under 180 ms before the fade-in. A visitor who starts indoors has everything built at load, and that load's furniture time is recorded with all ten rooms. Vertices reported.
- If a limit is missed, 4a's remedies in order: fewer cuts in kit faces, coarser sculpted forms (the pantry's jars first), fewer dressing pieces. Then come back to the owner. Dropping a must-have is the owner's decision.

### The description

One fixed clause per room, as for the other seven **(call)**: for the bathroom, that a bathtub stands along one wall with a basin and mirror opposite; for the laundry, that a wash tub and a drying rack stand there; for the pantry, that shelves of jars line two walls. A clause is used only once its room is built, and says nothing about whether a lamp is lit. Wording is the builder's.

### Checks

- **Node tests:** each new kind's footprint and standing; the real blueprint valid with nothing skipped; rule 8 over ten rooms, with one blueprint per new room that blocks its way in; each new named spot, with a blueprint that covers it; walking and sliding along the bathtub and a pantry shelf unit; a remembered place inside a new piece falls back; the queue's order; `SLICE_4D`; no new set has shades; the doorway test (an opening in front of the camera is in view, one behind it is not, one that holds the camera is; from 4b's pose [5.2, 7.9] facing the dining window the bathroom's door is not in view; from the living capture pose facing the fireplace neither the laundry's nor the pantry's door is; from the kitchen's `dresser` spot facing west both are; the visitor's own room is always drawn; the result is the same on two calls).
- **Browser captures** under `docs/interior-validation/`:
  - the bathroom from its door by day, and at night with its lamp lit;
  - the basin, mirror, lamp and toilet wall, square on;
  - the bathtub and the shower corner;
  - the laundry from the kitchen through its door, and from inside, by day and lit;
  - the pantry from the kitchen through its door, and from inside, by day and lit;
  - one pantry shelf unit close to;
  - the kitchen's west wall with both doors in frame, to show what the kitchen now looks through to;
  - the bathroom seen from the passage's `wardrobes` spot;
  - a low view along the floor under the bathtub;
  - all three rooms after `fallBack()`.
- **Browser checks**, numbered from 104: the new speed pose against the rooms through 4c; its draw-call budget; the three queued-build budgets and their sum; the five existing poses' speed and draw calls as under Speed; at the first indoor frame after entering through the door all ten rooms are built; the same with reduced motion; started indoors in the bathroom, all built at the first frame and its clause in the description; hiding makes no difference to the picture (at all six speed poses, the living and hall capture poses and the kitchen's west-wall capture pose, a frame with hiding on and a frame with `&hide=0` differ by nothing); a slow turn through a full circle at the kitchen's `dresser` spot and at the passage's `wardrobes` spot, sampled every 15°, differs by nothing from `&hide=0` at any step; from [5.2, 7.9] the bathroom's set is not drawn, and from the living capture pose the laundry's and pantry's are not; from the bathroom pose its set is drawn; the same furniture on two loads at the same world moment; after `fallBack()` the three rooms' meshes are present and lit; the yard-unchanged check still passes.
- **Existing checks keep passing**, with 4a's allowance: a spot or sampled patch that a new piece now covers may move to the nearest clear place that still tests the same thing, each move listed in the plan and then in As built. Any check that stands or samples in these three rooms is suspect (part 3's lamp captures of the small rooms, anything reading the bath's or pantry's walls, tests that use these rooms as "an unfurnished room"). The six speed spots may not move.
- New modules, if any, added to `npm run check`. Check 71's wording and counts are updated for nine sets.
- A capture meant to be kept gets its own `!` line in `.gitignore`.

### What the owner reviews

The captures. Three questions: does the bathroom read as a bathroom from the passage door; do the laundry and pantry read well through their doors from the kitchen, with the lamp opposite each door left bare; and are the pantry shelves full enough, or too busy.

## Left to the builder

- File and helper names, the shapes of the new kinds and blueprint entries, and whether like pieces share a kind.
- Every size, position, turn and tint within the rules above; the exact spots.
- Which allowed pieces are in fact sculpted, and how finely; how many jars a shelf holds.
- Whether the basin stands on a pedestal or a washstand; whether the wash tub is copper or enamel.
- The count and exact choice of dressing pieces within the budget.
- The wording of the description clauses.
- Where the doorway test lives in `shared/`, its signature, and how the frame gets the frustum's planes to it.
- The README's interior section and the spec's As built section, written when the work lands.
