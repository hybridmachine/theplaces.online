# Cabin interior, part 4a: furnishing the living room and hall — design

Status: built behind `?interior=1`, awaiting owner review (November 21, 2026). See As built at the end.

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

### Failure, as built

- If a single piece's recipe throws, that piece is skipped and warned about, but its obstacle still stops the walker, so the walker and the drawing then disagree for that piece. The real blueprint is tested to skip nothing. Carrying this to the next furnishing plan.

### One validity rule added

- `validInterior` also requires the blueprint's `obstacles` to equal `obstaclesOf` its furniture (the breasts followed by one rectangle per solid piece, the same rectangles in the same order). A blueprint whose obstacles drift from its furniture is invalid. A blueprint without `furniture` is judged as before, and `bareInterior` still validates.

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

## As built

Where the build departs from the design above, or settles what it left open. The pieces are drawn by `public/space/interior/furniture.js` from the kit in `furniture-kit.js`; their kinds and footprints are in `shared/furniture.js`; their places are the blueprint's `furniture` in `shared/lakeside-interior.js`.

### Placements

- Every piece stands where the plan's table put it, with these differences, all settled when the blueprint was first laid out and kept since: the back armchair is at [2.3, 5.25], not [2.3, 5.4]; the newel is at [9.55, 1.42], not [9.5, 1.42], just outside the flight's foot corner; the runner is 0.91 m wide (a 8.25 to 9.15), a little narrower than the plan's metre. No piece moved in the tuning.
- The hall's day and night captures now stand a step inside the front door ([9, 1], looking down the runner toward the dining opening) rather than in the doorway, where a third of the frame was the open door leaf. They show the hall as a visitor meets it: the runner, the stair with its rail, the mirror, and the living room through its opening. The hooks and bench are in their own capture, in the pocket behind the leaf.

### Rule 8, as read

- The 0.9 m walker's route (rule 8) is the usual flood run keeping 0.45 m off walls, the leaf and every solid piece, over **the hall and the living room only**: the ground floor is cut down to those two rooms and their openings (`furnishedWay`), so the route cannot go round through the kitchen or the dining room. Its targets are each hall opening's doorway point, the living-kitchen one and the stair foot. The pocket behind the door leaf and the way in among the fire group are held to the ordinary 0.25 m (rule 7).

### Which pieces are sculpted

- Sculpted (spun, rolled or draped, then weighed per vertex): the arm and back rolls of the sofa and armchairs; the newel, the handrail and the balusters; the lamps' bases and shades; the log basket and its logs; the jug and candlesticks; the umbrella stand, with its stick and umbrella; the three coats, the hat and the throw.
- Everything else is kit, through `face`: boxes with broken edges, boards, posts, cushions, book runs, framed panels and mats.
- The book runs are one geometry a run, weighed once (they draw what `face` would). The drapes (coats and throw) draw their back sheet a few millimetres behind the front and **give it the front's light** instead of weighing it again: a cloth's two sides are lit alike here, and weighing both doubled the drapes' build cost.

### How grounding is drawn

- One mesh (`grounding`), not lit: a patch a solid piece of black with a vertex alpha, the piece's turned footprint grown by 0.22 m (`GROUND.reach`), dark (alpha 0.42) over the footprint drawn in by 0.05 m and fading to nothing at its rim. The newel and the standing lamp take a round patch of radius 0.2 m. A patch lies 3 mm over the floor, or over the top of the rug the piece stands on, and stops at the walls' faces.
- It is drawn in the rooms' own scene, blended (transparent, no depth write, pulled toward the eye by a polygon offset), so it hides nothing drawn after it. Nothing of it is in the overlay, and it adds no pass.
- Tucked faces (undersides, the bookshelf's insides, the bench's back, the gap under the sofa) keep 0.45 of their tint (`TUCK`).

### The look, as tuned by eye (part 4a's task 8)

- **Lamp shades** have form painted into their vertex tint, since the shades' mesh takes one colour a frame: a darker rim at the foot, brightest just above it, fading to a darker top edge, and the side away from the room's middle a little darker. Lit, the warm colour is [0.98, 0.62, 0.30], under 1 even at the brightest band, so the warmth shows on the shade instead of clipping to flat cream. (It was [1.9, 1.25, 0.6], and read as a pasted-on shape.) The browser check reads the lit shade at about (232, 189, 136).
- **The stair's joinery** (newel, rail, balusters) is a dark walnut stain ([0.26, 0.17, 0.11]) with the brushwork laid coarse (3 m a tile), so each thin part takes an even stain and reads apart from the treads.
- **The palette is faded**: the reds and blues were moved toward grey, and the hall runner is a worn grey-blue (`slate`) instead of a saturated blue. The hearth rug no longer shows the red overshoot part 3 noted on bright brushwork.
- **The window seat** has two fielded panels on its front (stiles and rails standing 2 cm proud, their undersides darkened, the panels a shade darker), a seat board overhanging by 4 cm, and a long squab cushion (0.07 m) that sags. Its two loose cushions are smaller and plumper, and taper to a seam at their edges: one is propped against the wall, the other lies askew. The seat and its cushions stay under the 0.8 m sill.
- **The drapes'** fold troughs are darkened in the tint (up to 0.3 where the cloth hangs free). The coarse weighing rounds normals too coarsely for a fold's own turn to change its light. The throw is ochre now, not blue, and its cells are 7 cm.
- **The bookshelf's runs are full again.** Part 4a's task 7 had stopped every other run at 0.6 of its half-shelf to save build time; that bought nothing measurable in the browser, so it was undone.

### Light on furniture: the coarse weighing

- Furniture is weighed once per cell of a 0.3 m lattice, with normals rounded to 0.5 (`WEIGH_GRID`, `WEIGH_TURN` in `public/space/interior/index.js`). Rounding to 0.5 can turn a normal by about 35°.
- Over all the furniture's front-facing vertices, the mean error against the exact field is about 0.013 (day). The worst is 0.29, on a few rail-cap and runner vertices and on drape backs, which by design take their front's light.
- Two tests pin the error:
  - within 0.12, every seventh vertex of the sofa, bookshelf, boot bench and umbrella stand;
  - within 0.1, every vertex of the sofa's cushions, its arm rolls and its three loose cushions, where a stepped light would show. Measured worst there: day 0.078, fire 0.028.
- A turn of 0.25 with the same lattice drew the sofa's cushions and rolls no differently in the captures, and cost about 8 ms more in the browser. So 0.5 stands.

### Check spots moved

| Check | Was | Now | Why |
|---|---|---|---|
| 42, parallax | [3.2, 3] and [5.2, 3] | [3.2, 3] and [4.25, 3] | [5.2, 3] is inside the sofa |
| 52–54, the dusk pose | [5.9, 3.5] | [6.2, 5.2], same target | the console stands there |
| living-room.jpg | [6.4, 3.5] | [6.2, 5.2] | against the console |
| 56, midnight, the way into the hall | [1.6, 3.5], edges at 0.3 and 0.9 m | [4.4, 1.0], edges at 0.3 and 0.6 m | see below |
| furnish-hall-day.jpg, -night, fallback-hall | [9, 0.45] | [9, 1] | see Placements |

- Floor samples at [4.2, 1], [4.2, 4.6], by the hearth and at [4.4, 5.9] did not move: none lies under a rug or a patch.
- The speed spots [4.2, 3] and [3.8, 5.5] did not move, and stay standable.

**Check 56, re-aimed.**
- From part 3's hearth pose ([1.6, 3.5]), the sofa and its console now hide the foot of the hall–living opening, so its right edge stepped only 0.017.
- From [4.4, 1.0], between the window seat and the side table, both lines of sight pass clear of the furniture. With the furniture hidden, the readings agree with those drawn, so it still reads the shell's own jambs.
- Above about 0.8 m no jamb step shows from there (the hall's far wall lies beyond the opening), so the edges are read at 0.3 and 0.6 m.
- The limits are unchanged. **The margin is thin**: the d = 5 jamb steps 0.027 at 0.3 m against the 0.02 limit.
- Part 3's pose is still read, with the furniture hidden, and recorded: the shell's steps there are 0.034 to 0.069, as part 3 left them.

### Measured

The full browser script (`scripts/check-space-browser.mjs`): headless Chrome through ANGLE on an Apple M1, on mains power, 1440 × 810, tier full. 80 of 80 checks passed in that run's console output. The saved file, `docs/interior-validation/browser-results.json`, holds checks 32–80 (49 entries, all passing); checks 1–31 passed in the same run, but their saved file (`docs/space-validation/space-browser-results.json`) was not re-committed by this branch.
- Check 76 (the furniture after `inside.fallBack()`) records no before/after brightness figure: it asserts only that both rooms are still drawn with furniture (mean luminance above 0.1, the furniture's meshes present). The capture (`fallback-living`) is the evidence of how it looks.

- **Speed at [4.2, 3] facing the window:** 1.04 times a yard frame by day (yard 12.6 ms, room 13.1 ms) and 1.04 under the night study. Limit 1.1. No bare run was taken at [4.2, 3]: bare was measured only at [3.8, 5.5], so these two figures are against a yard frame, not against the bare room.
- **Speed at [3.8, 5.5] at night with the lamp lit:** furnished 1.039, bare 1.065 on the same run, so −0.026. Limit +0.05.
  - The bare figure is the noisier of the two; its first round read 1.195. In part 4a's task 7 runs the difference was +0.010 to +0.024.
- **Draw calls:** +5 (47 against 42) at the living capture pose. Limit 6.
- **Vertices:** 12,092 in 5 meshes (wood, cloth, stone, shades, grounding).
- **First build:** the furniture adds **63.7 ms** to the interior's first build (median of three fresh loads each, furnished against `&bare=1`), against the **60 ms budget**.
  - Check 73 records and reports this figure; it does not assert it.
  - On this machine the figure moves with the machine's other load: 60.5 to 69 ms in part 4a's task 7, and 61 to 79 ms in this task's runs.
  - Two interleaved runs of nine loads each, on a quiet machine, gave 61.0 ms both for this build and for the build before this task's tuning. So the tuning costs about nothing measurable. It adds about 170 distinct weighings (3,290 to about 3,460), mostly for the full book runs and the window seat's cushions.
  - **Whether 60 ms is the right budget is the owner's to decide.**
- Interior first build in all (check 64): 186 ms. First indoor draw: 100 ms.

### Cut for speed

- The coarse weighing (above).
- Cushions cut 3 × 3 rather than 4 × 4; the window seat's loose cushions are cut 4 × 4 for their taper.
- Drape cells of 0.13 m (the throw's 0.07 m).
- Thicker books, so a run has fewer of them.
- The drapes' back sheets take their front's light.
- No dressing piece was cut.

### Known weak points, as the final captures show them

- **The throw** still reads as a flat panel down the sofa's outer arm, seen from the low view. Its folds are shallow against the brushwork.
- **The coats** read as flat cut-outs on the wall more than hung cloth.
- **The sofa's loose cushions**, seen square-on from the hearth, read as flat squares.
- **The brushwork is strong on every piece.** On cloth it outweighs the tints' and the folds' shading, and the window seat's panels read only faintly. A finer `tile` was not tried further; plates are the owner's call (see Surfaces).
- **Grounding is faint by day.** It reads under the sofa in the low view (the floor at its edge 0.74 of the open floor), but hardly elsewhere at standing height.
- **The mirror** is a pale blue-grey panel: it reflects nothing, and reads as glass only by its frame.
- **The shades** are lit by the living room's lamp dial alone. The standing lamp's shade glows as the table lamp's does, and neither lights the room (by design).
- **Check 56's thin margin** (0.027 against 0.02). From part 3's hearth pose, the sofa hides the doorway's foot.
