# Cabin interior, part 4a: furnishing the living room and hall — design

Status: proposed, November 21, 2026. Awaiting approval. Nothing is built.

This is the first slice of part 4 of `2026-11-17-cabin-interior-design.md` (the parent). The parent's intent, goals, non-goals and anti-goals still hold, and its "Furnishing" section is the brief. Parts 1 to 3 are built and merged; part 3's "contract for part 4" (`2026-11-20-cabin-interior-part-3-light-design.md`, As built) is the starting point and is widened here in one place.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction.

## Intent

The two rooms a visitor meets first stop being an empty shell and become somewhere a person lives: a sofa and armchairs drawn up to the fire, books, a seat under the casement, coats and boots by the door. They are furnished to a finished standard, small dressing included, so that the owner can judge the look on real rooms before sixteen more are made the same way.

Why these two first **(owner's decision)**: the living room is the hardest room (the most pieces, the fire, the casement, the thinnest speed margin). Settling the way furniture is made, grounded and paid for there means the other rooms are mostly new entries, not new problems.

## Goals

- The living room and the entry hall are furnished so their purpose reads at a glance, by day and by lamp and fire light, in the painted look.
- A way of making furniture that the remaining rooms reuse: shape helpers, piece recipes, and placement as data in the blueprint.
- Furniture stops the walker; every doorway, the stair and the front door stay reachable, and the visitor can stand at the fire, at the casement and at the bookshelf.
- Furniture takes the house's painted-in light and sits on the floor (it does not look as if it floats).
- The speed limit of part 3 still holds.
- Still behind `?interior=1`.

## Non-goals

- The other sixteen rooms. They stay bare, and are seen bare through these rooms' openings, until their own plans.
- Sitting, or anything else the visitor can operate. **(call, restating the parent)**
- Cast shadows. Grounding is painted, as below.
- Light sources: table and standing lamps glow but add no light of their own to the room. **(call)**
- Any change to the blueprint's rooms, openings, windows, fireplace or fittings, or to where the stair is and how it is walked. The stair gains a newel, a rail and balusters to look at (see The stair's rail).
- Server, world-state or persisted-state changes. Sound.
- New art files, unless the captures show the existing brushwork is too coarse and the owner agrees to plates (see Surfaces).
- Removing the `?interior=1` switch.

## Anti-goals

- A dollhouse or blockout: pieces that read as bare boxes, square to the walls, evenly tinted.
- Furniture that floats, or that is as bright underneath and inside as on top.
- A room that is in the way: a visitor snagged on furniture between the front door and any opening, or unable to walk up to the fire.
- Two visitors seeing different rooms: nothing about the furniture or its lamps may depend on the visitor.
- A furnished living room that drops a device off the `full` tier it holds in the yard.

## Constraints found in the project

- The blueprint is authored data in `shared/lakeside-interior.js`; `validInterior` (`shared/interior.js`) checks it. `obstacles` are plan rectangles `{floor, a, d}` with no height and no turn; today they hold the two chimney breasts. `obstaclesFit` requires each to lie in one room and leave that room's openings reachable by a flood that keeps the eye 0.25 m off everything. `fittingsFit` forbids a wall lamp standing in an obstacle and lets a hanging lamp hang over one.
- `buildInterior` (`public/space/interior/index.js`) makes every surface through `face`: a `sheet` (`public/space/geometry.js`) cut about every 0.4 m, whose vertices are then given light and spill weights by an inner function (`weighed`) that reads only a geometry's positions and normals, the storey, and a `place` at which to weigh. Anything with positions and normals can be weighed the same way.
- The lit materials (`public/space/interior/light.js`) are a patched `MeshBasicMaterial` sharing one set of uniforms. The shell uses two: `surface` (boards, joinery) and `plastered`; the fireplace adds one over the stone texture. All brushwork is the `hills` brush texture except the stone.
- `fallBack()` puts every lit surface back on flat Lambert materials; the fireplace and the fittings each take part.
- Added light (lamp halos, flames) lives in `inside.overlay` and costs an extra draw whenever a lit part of it lies over a live pane.
- The living room: fireplace on the gable wall (a = 0) centred at d = 3.5, its slab reaching to a = 1.0; the casement window on the front wall at a = 4.2, sill 0.8 m, 1.4 m wide; a wide opening to the hall on a = 7 over d 2–5; a wide opening to the kitchen on d = 7 over a 3.5–6; a hanging lamp at [3.8, 3.5], lowest point 2.0 m up.
- The hall: front door at a = 9, its leaf standing open into the hall along a = 8.5 over d 0–1; the visitor arrives at [9, 0.8]; the stair along a 9.6–11 from d = 1.5 to 5.4, closed in beneath; the study door on a = 11 over d 0.3–1.3; the passage door on a = 11 over d 5.7–6.7; the wide opening to the dining room on d = 7 over a 7.6–10.4; a wall lamp at [10.2, 0.2].
- Speed (part 3, As built): the checked pose (living room facing its window) costs 1.04–1.05 times a yard frame by day and 1.02–1.05 at night against a limit of 1.1. An unchecked pose, at night from [3.8, 5.5] facing the window with the lit lamp in view, measured 1.10. The interior's first build takes about 110 ms.
- The wheelbarrow (`public/space/scene/wheelbarrow.js`) shows the project's sculpted style: rings, lathes and tubes with per-vertex paint.

## Approaches considered

1. **A furniture kit of flat helpers, pieces as data.** Helpers built on `face` (board, box, post, cushion, books), piece recipes from them, placement in the blueprint. Smallest change to part 3's contract; softness rests on the cushion helper alone.
2. **Each piece written out by hand,** as the fireplace is. No abstraction, but a dozen pieces here and about sixty later repeat it, and positions live in drawing code where the walking tests cannot see them.
3. **The kit plus sculpted forms — chosen by the owner.** The same kit and blueprint entries as 1, and pieces that need curves use spun and ringed geometry as the wheelbarrow does, with their light worked out per vertex afterwards. The richest shapes; it widens part 3's contract, adds vertices to the room with the thinnest margin, and gives two ways to make a piece.

The owner picked 3. The design below limits its two costs: one rule for which pieces may be sculpted, and a budget.

## Design

### What goes in each room

The parent's must-haves, plus the author's additions **(call)** and small dressing **(call)**. Exact sizes and positions are the builder's, within the rules under Placement; the plan below shows the intended arrangement.

Living room:

- Must-haves (parent): the stone fireplace and mantel (built in part 3), a hearth rug, a sofa and two armchairs facing the fire, a bookshelf, a window seat under the casement, lamps.
- Added: a low table on the rug; a side table by one armchair carrying a table lamp; a standing lamp by the bookshelf; a console table behind the sofa.
- Dressing: books on the shelves, some leaning or lying flat, with a few gaps; cushions on the sofa, chairs and window seat; a throw over one sofa arm; a log basket and fire irons by the hearth; a few things on the mantel (a clock, a jug, a pair of candlesticks); two or three framed pictures on the walls; a book and a cup on the low table.

Entry hall:

- Must-haves (parent): coat hooks, a boot bench, a runner rug, the stair with a newel and rail.
- Added: balusters under the stair rail; a small framed mirror.
- Dressing: two or three coats and a hat on the hooks; boots under the bench; an umbrella stand; a doormat inside the door.

Intended arrangement (front wall at the bottom; not to scale):

```
 d=7 ┌──[bookshelf]──┬─── to kitchen ───┬┬──── to dining ─────┬──────┐
     │  (std lamp)                      ││                    │ to   │
     │        (armchair)                ││  r                 │passage
     │                      ┌────┐┌┐                          ├──────┤
 fire▓▓ slab [   rug    ]   │sofa││c│  to hall   u            │ stair│
     ▓▓ logs [low table] ×  │    ││ │                         │  up  │
     │                      └────┘└┘             n            │      │
     │   (armchair)(side table+lamp)     ││      n   newel ●──┤      │
     │                                   ││  r               ─┴──────┤
     │                                   ││bench             to study│
     │            [ window seat ]        ││hooks  │leaf  mat         │
 d=0 └────────────══casement══───────────┴┴───────┴─[door]───lamp────┘
     a=0                 4.2            a=7      8.5   9          a=11
```
(`c` is the console, between the sofa's back and the hall opening; `×` is the spot [4.2, 3] the speed check stands on.)

- The fire group sits in the gable half of the room: sofa facing the fire with its back to the hall opening, the console against its back, an armchair either side turned in toward the hearth, the rug and low table between. The sofa's front is no nearer the fire than about a = 4.6, so the visitor can stand between it and the low table.
- The bookshelf stands on the back wall (d = 7) between the corner and the kitchen opening.
- The hooks and bench are on the hall's a = 7 wall, in the pocket behind the open door leaf; the runner leads from the door toward the dining opening.

### How a piece is described

- The blueprint gains `furniture`: a list of entries, each `{id, kind, room, at, turn}` plus whatever its kind needs (a length, a parent). `at` is the piece's place on the floor in the interior frame; `turn` is its rotation in plan.
- A new pure module in `shared/` knows each kind's footprint and its standing: **solid** (stops the walker), **walk-over** (rugs, the doormat), **wall-hung** (hooks, pictures, the mirror: on a wall, no footprint on the floor), or **set on** another piece (the table lamp on the side table, the mantel's things, cushions).
- The walker's obstacles become the chimney breasts plus one rectangle per solid piece, derived by that module. A turned piece gives the square-on rectangle that bounds it; the walker does not learn turned shapes. **(call)**
- `validInterior` gains the furniture's rules:
  - every piece lies inside its room; solid footprints do not overlap each other, the breasts, the stair, the door leaf's sweep or a doorway (the newel is the one exception to the stair, below);
  - every opening of the house is still reachable (the existing flood), and so are named standing spots: on the hearth rug facing the fire, at the casement in front of the window seat, in front of the bookshelf, at the stair foot, and the arrival spot; **(call)**
  - a walker 0.9 m wide can get from the arrival spot to each of the hall's openings and the stair foot, and through the living room from the hall opening to the kitchen opening: the same flood, run keeping 0.45 m off walls, the leaf and every solid piece. It is a walked route, not a straight line. The pocket behind the door leaf, and the way in among the fire group, need only the usual 0.25 m; **(call)**
  - the two spots the speed is measured from, [4.2, 3] and [3.8, 5.5], stay standable, so the figures stay comparable with part 3's; **(call)**
  - a wall-hung piece lies on a wall line of its room, clear of openings, windows and wall lamps; a piece set on another names a parent that exists;
  - no solid piece stands under the wall lamp's place or in front of the fire's mouth.
- A remembered place that now falls inside a piece falls back as an invalid indoor place does today.

### The stair's rail

- The newel, the flight's handrail and its balusters are fixtures of the stair, drawn by the furniture module but not `furniture` entries with a room. **(call)**
- The rail runs up the flight's open hall side (the a = 9.6 edge, above the plastered stringer that is there today) from the newel at the foot to where the flight passes through the ceiling, and on up to meet the landing's existing board rail, which stays as it is. Nothing else on the landing changes.
- The newel stands at the foot corner, just outside the flight, and is a small solid obstacle so the eye cannot stand in it; the stair foot must stay reachable (the 0.9 m route above). The rail and balusters need no obstacle: the stringer and the stair's own walking rule already keep the eye off that edge. The builder confirms this against the walker and adds an obstacle only if it proves false.

### How a piece is made

- A new drawing module beside `fireplace.js` and `fittings.js` holds the kit and the recipes, and is built by `buildInterior`.
- **The kit**: helpers that produce lit geometry from `face` — a board, a box with its edges broken, a post, a soft cushion form (bulged, sagging, never a box), a run of books, a framed panel.
- **A recipe** per kind assembles helpers in the piece's own frame; placement and turn come from the blueprint entry.
- **Sculpted forms** are allowed where a flat helper would read wrong: the rolled arms and backs of the sofa and armchairs, the turned newel and balusters, lamp bases and shades, the log basket and logs, the jug and candlesticks, the umbrella stand, coats and the throw. Everything else is kit. **(call)**
- **The contract with part 3, widened**: `buildInterior` offers, beside `face`, the weighing it already does internally, for any geometry that has positions and normals. A sculpted piece is weighed per vertex by the same light field, at its own vertices, in its own room. Nothing else about the light changes; `lightAt` and the shader's sum are untouched. **(call)**
- All furniture of both rooms is merged into as few meshes as its materials allow, built with the rest of the interior on first entry.
- Furniture takes part in `fallBack()`.

### Light on furniture

- Furniture takes day, lamp, fire and spill light from the field as the walls do. The field does not know furniture exists, so no piece shades another or the room.
- What the field cannot give is painted in at build time **(call)**:
  - **tucked surfaces** — undersides, the insides of shelves, the gap under the sofa, the back of the bench under the coats — are darkened in their vertex tint;
  - **grounding** — a soft dark patch on the floor under and just around each solid piece, darkest where the piece meets the floor. It is not a shadow: it does not move with the hour or the lamps. It is drawn without a pass of its own and without the overlay. How (darkening laid over the floor, or the floor under a piece rebuilt finer) is the builder's.
- The faces of the sofa and chairs toward the fire take the fire's weight like any surface, so the group warms and flickers with it.
- **The table lamp and the standing lamp** glow with the living room's lamp dial (the world's `main` light, with its fade): shade pale by day, warm when lit. They give no light to the room and have no pool. Whether they carry a halo is the builder's, against the budget; if they do, it follows the fittings' overlay rule. **(call)**

### The look

- Wood, fabric and wicker use the shell's lit `surface` material and the `hills` brushwork; they differ by tint, by variation of tint within a piece, and by the scale the brushwork is laid at. The mantel's things and any stone use the stone material. **(call)**
- Colours follow the painting's palette: warm woods, a faded red or ochre in the rug, muted green or blue upholstery, nothing saturated. The builder chooses; the owner judges from the captures.
- Nothing is perfectly square or even: the rug a degree or two off the walls, the armchairs not mirror images, books of mixed heights, cushions dented, the bench's boots not paired neatly. Small fixed irregularities from a seed, the same for every visitor.
- **Surfaces.** If the captures show small pieces reading as coarse smears, the builder first tries a finer brush scale; if that fails, they stop and ask the owner for plates (a fabric and a wood grain), following `ARTWORK.md`. No plate is added without that.

### Speed

- The limit stays 1.1 times a yard frame at part 3's checked pose, by day and under the `night` study.
- A second pose is measured and recorded: at night from [3.8, 5.5] facing the window with the lamp in view (1.10 before furniture). It must not cost more than 0.05 above what it measures unfurnished on the same run. **(call)**
- Budget for the two rooms' furniture **(call)**: at most 6 added draw calls with no halo over a pane, and at most 60 ms added to the interior's first build. The builder reports the vertex count.
- If the limit is missed, the remedies in order: fewer cuts in kit faces, coarser sculpted forms, fewer dressing pieces. Then come back to the owner. Dropping a must-have is the owner's decision.

### The description

- Indoors the scene description gains one fixed clause per furnished room, after the room's name: for the living room, that a sofa and armchairs are drawn up to the fire; for the hall, that coats hang by the door and the stair climbs ahead. What is lit is reported as today. Wording is the builder's. **(call)**

### Failure

- If the furniture fails to build, the rooms stay bare, the walker uses the breasts alone as obstacles, and the interior carries on, with one warning. **(call)**

### Checks

- Node tests: each kind's footprint and standing; the bounding rectangle of a turned piece; derived obstacles; every rule under "How a piece is described", each with a blueprint that breaks it; the real blueprint valid; the named spots reachable; walking and sliding along a piece; a remembered place inside a piece falls back.
- Browser captures under `docs/interior-validation/`:
  - the living room from the hall opening at noon, under overcast, and at night with the lamp and fire lit;
  - from the hearth looking back at the sofa and the casement;
  - the window seat with the casement open;
  - the bookshelf close to;
  - a low view along the floor showing the grounding under the sofa and a chair;
  - the hall from the front door by day, and at night under the low night lamp;
  - the stair foot with the newel and rail;
  - the hooks and bench behind the open door;
  - both rooms after `fallBack()`.
- Browser checks: the two speed poses; furniture present indoors and absent with the switch off; the same furniture and lamp glow on two loads at the same world moment; the yard-unchanged check still passes.
- New modules added to `npm run check`; the existing interior checks keep passing, with this allowance **(call)**: `scripts/check-space-browser.mjs` stands on, and samples the floor at, several living-room spots that furniture will now cover (the parallax spots [3.2, 3] and [5.2, 3], the dusk pose [5.9, 3.5], the capture at [6.4, 3.5], floor samples at [4.2, 1], [4.2, 4.6] and by the hearth). Those may be moved to the nearest clear spot that still tests the same thing, each move listed in the plan. The speed spots may not move.

### What the owner reviews

The captures above. Three questions decide what the other rooms inherit: does the furniture look painted and lived-in, not modelled; does it sit on the floor; is this amount of dressing right, or too much or too little.

## Left to the builder

- Module and file names, and the shapes of the kit's helpers and the blueprint entries.
- Every size, position, turn and colour, within the rules above.
- Which of the allowed pieces are in fact sculpted, and how finely.
- How grounding and tucked darkening are drawn.
- Whether the lamps carry halos.
- The count and exact choice of dressing pieces, within the budget.
- The wording of the description clauses.
