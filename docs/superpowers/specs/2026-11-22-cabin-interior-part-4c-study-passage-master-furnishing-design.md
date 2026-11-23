# Cabin interior, part 4c: furnishing the study, closet passage and master bedroom — design

Status: built behind `?interior=1`, awaiting owner review (November 22, 2026). See As built at the end.

This is the third slice of part 4 of `2026-11-17-cabin-interior-design.md` (the parent). The first two, `2026-11-21-cabin-interior-part-4a-living-hall-furnishing-design.md` (4a) and `2026-11-21-cabin-interior-part-4b-kitchen-dining-furnishing-design.md` (4b), are built and merged. Their design and As built sections are the starting point: everything there about how a piece is described, made, lit, grounded, queued, checked and allowed to fail holds here unless this document says otherwise.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction. Items marked **(owner)** were decided by the owner on November 22, 2026.

## Intent

The wing east of the hall stops being three bare rooms. Through the door at the stair foot there is a study with a desk at the window and a wall of books; past the stair, a short passage of wardrobes; and beyond it the master bedroom, with a made bed seen through its door.

What the owner decided:

- The next block of work is more furnishing, and it covers these three rooms together. The ground-floor bath stays bare for now and will show bare through its door from the passage, as the pantry and laundry do from the kitchen. **(owner)**
- The arrangement under What goes in each room was shown as a plan and accepted. **(owner)**
- The desk lamp and the two bedside lamps glow with their own room's lamp, drawn as the living room's table lamp is, by giving a room with lamps its own shade mesh. **(owner)**

## Goals

- All three rooms furnished so their purpose reads at a glance, by day and by lamp light, made the way 4a's and 4b's pieces are made.
- Furniture stops the walker. Every opening of the three rooms stays reachable; a visitor can walk hall → study and hall → passage → master bedroom without snagging, and can stand beside the desk at the window, before the bookshelves, between the wardrobes and at the foot of the bed.
- A lamp's shade in any room follows that room's lamp, the same for every visitor.
- The stutter at the front door does not grow, and no pose that 4a or 4b checks gets slower because these rooms exist.
- Still behind `?interior=1`.

## Non-goals

- Textures, plates, or any change to how surfaces are painted. The known weak points of 4a and 4b (heavy brushwork on small pieces, faint grounding) are inherited as they are. **(owner, from 4b)**
- The other eleven rooms, including the ground-floor bath seen through the passage.
- Anything the visitor can operate, sit on or lie on.
- New light. The desk lamp and bedside lamps give no light to the room and have no pool or halo; only their shades change. **(call, as 4a)**
- Any change to the blueprint's rooms, openings, windows or fittings. The passage's wall lamp and the two hanging lamps stay where they are.
- Cast shadows, sound, server or persisted-state changes, new art files.
- Re-tuning 4a's or 4b's rooms, beyond what Shades and Out of sight below require of their code.

## Anti-goals

- A longer stutter at the door.
- Furniture that appears, or goes missing, while the visitor can see where it stands.
- A desk that fences the visitor off from the study window's view.
- A bedside lamp that stays dark while its room's lamp is lit, or glows while it is out.
- Two visitors seeing different rooms.
- Pieces made in a way the later texture work would have to take apart.

## Constraints found in the project

- **The study** is a 11–18, d 0–4. One opening: the hall door on a = 11 over d 0.3–1.3. Front window at a = 13.8 (13.1–14.5), sill 0.8 m. Hanging lamp at [14.5, 2]. Unbroken walls: the back wall (d = 4, 7 m) and the gable (a = 18, 4 m). Its lamp is the world's `second` light directly (`roomLamps`).
- **The closet passage** is a 11–14, d 4–7. Three openings: the hall door on a = 11 over d 5.7–6.7; the bath door on a = 14 over d 5–6; the master door on d = 7 over a 12–13. Wall lamp at [12.5, 4.2], 1.8 m up, in the middle of its only unbroken wall (d = 4).
- **The master bedroom** is a 11–18, d 7–12. One opening: the passage door on d = 7 over a 12–13. No window. Hanging lamp at [14.5, 9.5]. Unbroken walls: the back wall (d = 12), the gable (a = 18), the dining side (a = 11), and d = 7 from a = 13.5 on.
- Rule 3 keeps solid pieces out of a box half a metre either side of each opening's line over its span; rule 4 keeps a solid piece from standing over a wall lamp's point; rule 9 keeps anything taller than the sill out of the 0.6 m in front of a wall window. Footprints may not overlap.
- Rule 8's 0.9 m walk covers `FURNISHED = ['hall', 'living', 'kitchen', 'dining']`, with ways through the kitchen and dining room (`throughWays`).
- `furnishLater` is `['kitchen', 'dining']`. Each queued room is built in its own frame as its own mesh set of at most 4 meshes (wood, cloth, stone, grounding). `buildRest` builds what is left at once before the entry's fade-in, or at load for a visitor who starts indoors.
- **Shades are the living room's alone.** `public/space/interior/furniture.js` has `SHADE_ROOM = 'living'`; a set's `shades` mesh takes one colour a frame from that room's lamp level and the light at the shades. A queued set is specified to have no shade mesh; nothing in `buildFurniture` forbids one, but check 71 counts at most 4 meshes for a queued set and exactly three sets.
- **Nothing is hidden by room.** Each mesh is culled only by the view's frustum (three.js's per-mesh test). A mesh behind a wall but inside the frustum is still drawn. 4b's speed pose at [5.2, 7.9] faces the dining window, with the master bedroom directly behind the dining room's a = 11 wall, and that pose has a thin margin by day (+0.044 against +0.05).
- `&furnish=first` (with `?check`) strips every queued room, giving 4a's build alone. There is no switch that gives "the rooms through 4b".
- `scripts/check-space-browser.mjs` has 89 numbered checks; new ones go at the end.

## Approaches considered

The pieces are made 4a's way and queued 4b's way; both were settled there. What was open here is how a lamp in a queued room is drawn.

1. **A shade mesh for each room that has lamps — chosen (owner).** A queued room with lamps gets a fifth mesh for its shades, coloured each frame from that room's own lamp level. The shades look exactly as the living room's do. It costs one more draw call in the study and one in the master bedroom, and 4b's "at most 4 meshes for a queued room" becomes 5 for a room with lamps.
2. **Shades painted through the room's light.** Shades go into the cloth mesh with a strong lamp weight. No new mesh, but they would not match the living room's shades, whose colours 4a tuned after the first version read as pasted on, and a shade lit this way can get no brighter than a lit wall.
3. **Shades that never glow.** Cheapest, but a dark bedside lamp in a lit room reads as wrong and departs from the parent's "bedside tables with lamps".

## Design

### What goes in each room

Must-haves are the parent's. The arrangement is the one the owner accepted. Dressing is the author's **(call)**. Sizes and positions are intended, not exact: the builder may adjust within the rules under Placement.

Study:

- **The desk** under the front window, about 1.5 × 0.7 m, centred on a = 13.8, its top at 0.75 m (under the 0.8 m sill). **Its chair** on the room side at about [13.8, 1.15], facing the window.
- **Two bookshelves** side by side along the back wall (the existing kind, 2.6 m each), about a 12.1–17.4.
- **The reading chair** (the existing armchair) in the east front corner at about [17.0, 1.0], turned toward the middle of the room, with **a side table** beside it at about [16.1, 0.5] (rule 3 goes by the turned chair's bounding box, so the two are set a few centimetres apart, wherever the chair's turn puts that).
- **A rug** in the middle, about 3.0 × 1.6 m at [14.6, 2.3].
- **Dressing:** a desk lamp, two or three books and a cup on the desk; a book on the side table; a picture on the gable wall.

Closet passage:

- **Two wardrobes** on the d = 4 wall, one each side of the wall lamp: about 1.0 m wide, 0.6 deep, 2.0 tall, at a 11.2–12.2 and a 12.8–13.8. The lamp's point at a = 12.5 stays in the 0.6 m gap between them.
- **A runner** across the floor between the hall door and the bath door (walk-over). **(call)**
- Nothing else: the floor between the three doors stays clear.

Master bedroom:

- **The double bed**, about 1.6 × 2.05 m, its head against the back wall, centred on a = 14.5, so it is the first thing seen through the door.
- **Two bedside tables** (the existing side table) either side of the head at about [13.4, 11.65] and [15.6, 11.65], **each with a lamp** (the existing table lamp).
- **A blanket chest** at the foot, about 1.2 × 0.45 m at [14.5, 9.55].
- **A rug** under the bed and chest, about 3.0 m across and 3.2 m front to back, showing either side of the bed and beyond the chest.
- **Wardrobes** on the gable wall: two of the passage's kind side by side, about d 8.5–10.5.
- **Dressing:** two pillows and a folded blanket on the bed; a book on one bedside table; a picture above the bed's head; a picture on the a = 11 wall.

```
 d=0  ┌──────────────═══window═══────────────────────────┐
      ▯ door            [ desk ]            ▫table       │
 hall ▯                    ▫chair              ┌──┐      │ picture
      │              ┌ ─ ─ ─ ─ ─ ─ ─ ┐         │ch│      │
      │                    rug   ◦lamp         └──┘      │
      │              └ ─ ─ ─ ─ ─ ─ ─ ┘                   │
 d=4  ├──[  bookshelf  ][  bookshelf  ]──────────────────┤
      │[wardr]•[wardr]│                                  │
      │               ▯ bath                             │
 hall ▯   (runner)    ▯        bath (bare)               │
 d=7  ├────▯door▯─────┴──────────────────────────────────┤
      │                                                  │
      │                                             ┌───┐│
      │           ┌ ─ ─ ─[ chest ]─ ─ ─ ┐  ◦lamp    │war││
      │                 ┌─────────┐                 │dr.││
      │           │     │   bed   │     │           └───┘│
      │               ▫ │         │ ▫                    │
 d=12 └───────────┴─ ───┴─────────┴──── ┴────────────────┘
     a=11   12  13    14                               a=18
```

Nothing is square and even, by the same seeded irregularity as 4a and 4b.

### Placement: the rules, widened

Rules 1 to 7 and 9 apply to the new pieces as written. In addition:

- **Rule 8, the 0.9 m walk,** runs over seven rooms: `FURNISHED` gains `study`, `passage` and `master`. From the arrival spot a walker 0.9 m wide must reach every opening of those rooms, the bath door included. 4a's and 4b's own targets must still pass. **(call)**
- **Ways through and in (call).** Within the passage alone, 0.9 m walks from the hall door to the master door and to the bath door. The study and the master bedroom have one door each, so a way through means nothing there; instead, within each room alone, a 0.9 m walk from its door to one named spot: before the bookshelves in the study, and at the foot of the bed in the master bedroom.
- **New named spots** in `spots`, each standable and reachable by the ordinary 0.25 m rule **(call)**: beside the desk at the window (about [15.0, 0.7], where the yard is seen past the desk's end); before the bookshelves (about [14.6, 3.1]); between the wardrobes' fronts and the doors in the passage (about [12.5, 5.4]); at the foot of the bed (about [14.5, 8.8]); and at a bedside (about [12.7, 11.0]). The ways to the desk spot and the bedside are held only to the ordinary rule.
- **Two new speed spots** (below) are added to `spots.speed`. The existing three do not move.
- No solid piece taller than the sill stands in front of the study window; the desk and its chair's back are the only things there, and the chair's back may rise above the sill only outside rule 9's 0.6 m. If the chair cannot satisfy rule 9 where drawn, it moves back from the desk, not the desk from the window.
- A remembered place that now falls inside a piece falls back, as today.

### New kinds

Added to `shared/furniture.js`: the desk, the wardrobe, the double bed, the blanket chest (solid); pillows and a folded blanket (set on). The desk lamp is the existing table lamp unless the builder finds it reads wrong on a desk, in which case a new set-on kind that also draws through `shades`. Bookshelves, the armchair, the side table, the chair, rugs, the runner, pictures, books, the cup and the table lamp are existing kinds. A set-on piece may be set on the bed; the bed's kind carries a `seat` at its mattress top, since a set-on piece sits at its parent's `seat ?? height` and would otherwise float at the headboard's height.

### How a piece is made

4a's kit and recipes, extended in the same files, under the same rule for what may be sculpted. Allowed sculpted here **(call)**: the bed's posts or turned feet, its pillows and folded blanket (rolled or draped), the bedclothes' fall at the sides and foot, the wardrobes' and desk's knobs, the chest's handles. Everything else is kit: boxes with broken edges, boards, framed panels, as the dresser and sideboard are.

Light on furniture, tucked surfaces (under the desk, under the bed's frame) and grounding patches are 4a's, unchanged. Every solid piece gets its patch.

Surfaces are named as in 4b: every new recipe picks its tints through `pal.surface(name, …)` and emits under `SURFACES[name].mesh`. Bed linen and the blanket are `cloth`. No new lit material.

### Shades, a room at a time

- A mesh set may carry a `shades` mesh whatever rooms it holds. A set's shades all stand in one room: the first build's in the living room, a queued room's in that room. A set whose shades would stand in two rooms is a build error for that set (it does not occur in this blueprint). **(call)**
- `setLight` colours a set's shades from the lamp level of **the room its shades stand in**, and the light at those shades without their own room's lamp, by the rule 4a tuned (`SHADE_PALE`, `SHADE_WARM`, `SHADE_FORM`), unchanged. `SHADE_ROOM` goes.
- So the desk lamp follows the study's lamp (the world's `second` light) and the bedside lamps follow the master bedroom's lamp, with that room's own delay and fade. The living room's two lamps behave exactly as they do now; 4a's check of the lit shade's colour must read as before.
- After `fallBack()` the shades carry on, as today.

### The build, spread out

4b's queue, with three more rooms: `furnishLater` becomes `['kitchen', 'dining', 'study', 'passage', 'master']`, in that order, the same for every visitor. **(call)** The first build at the door is unchanged and keeps its 80 ms limit. Everything is built before the entry's fade-in, or at the cut with reduced motion, or at load for a visitor who starts indoors, as in 4b. A room whose build throws stays bare and is dropped from the walk, as in 4b.

### Out of sight, not drawn

Found while writing this: a set behind a wall is still drawn if it is inside the view's frustum. Three more sets, and every later slice, would be paid for at poses that cannot see them, 4b's thin-margin pose first. So **(call)**:

- `shared/` gains a pure, deterministic table of which rooms can be seen from which: room B is seen from room A if a straight sight line at eye height runs from somewhere a visitor can stand in A, through one or more openings, to somewhere in B. A room sees itself. The stair blocks no sight line (its low treads are under eye height), and it joins the hall and the landing both ways. The definition decides; no room is listed by hand. It is worked out from the blueprint's rooms and openings, generously: where the sampling is unsure, B counts as seen.
- Each frame indoors, a queued room's set is drawn only if its room is seen from the room the visitor is in. The first build's set (hall and living room) is always drawn, as today. In the yard, on the stair, and whenever the visitor's room is unknown, every built set is drawn, as today. (On the stair the walker's floor stays the upper one until the foot while the ground floor is in view over the treads.)
- Hiding never changes what is built, the walk, the counts or the description: only whether a set is drawn this frame.
- If the table cannot be built, nothing is hidden.
- This applies to 4b's kitchen and dining sets too, which is the only change to 4b's behaviour.

### Speed

- 4a's two poses and 4b's pose keep their limits. With all seven rooms furnished they may not read worse than with the rooms through 4b on the same run by more than run-to-run noise (0.01 of a yard frame), and their draw calls may not grow.
- **Two new poses**, each by day and under the night study with the room's lamp lit by fixture **(call)**: in the study just inside its door (about [11.9, 0.8]) facing along the room to the reading chair, with the window's live view in frame; and in the master bedroom just inside its door (about [12.5, 7.9]) facing the bed. Limit for each: 1.1 times a yard frame, and no more than 0.05 above the same pose with only the rooms through 4b furnished.
- **What "added" is measured against (call):** the interior with the rooms through 4b furnished. The check-only `&furnish=` switch is widened so that, beside `first`, it can name the rooms to leave bare or the slice to stop at; its form is the builder's. `&furnish=first` keeps its meaning.
- **Mesh sets:** at most 5 meshes for a queued room with lamps (study, master), at most 4 for one without (passage). 4b's check 71 is reworded to say so, and its count of sets becomes six.
- **Budget (call):** at most 6 added draw calls at each new pose; each room's queued build at most 40 ms in its frame (median of three loads); the three new rooms' builds together at most 100 ms; a visitor who starts indoors has everything built at load, and that load's furniture time is recorded with all seven rooms. Vertices reported.
- If a limit is missed, 4a's remedies in order: fewer cuts in kit faces, coarser sculpted forms, fewer dressing pieces. Then come back to the owner. Dropping a must-have is the owner's decision.

### The description

One fixed clause per room, as for the other four **(call)**: for the study, that a desk stands at the window and books line the back wall; for the passage, that wardrobes stand along one wall; for the master bedroom, that a double bed stands against the back wall with a lamp at each side. A clause is used only once its room is built, and says nothing about whether a lamp is lit (the lit text does that). Wording is the builder's.

### Checks

- **Node tests:** each new kind's footprint and standing; the real blueprint valid with nothing skipped; rule 8 over seven rooms, with a blueprint that blocks the passage between its doors, one that blocks the study's way in and one that blocks the master bedroom's; each new named spot, with a blueprint that covers it; walking and sliding along the bed and a wardrobe; a remembered place inside a new piece falls back; the queue's order; a set's shades follow their own room's lamp and not the living room's; the seen-from table (the kitchen and the study do not see the master bedroom; the hall sees the study and the passage; the passage sees the master bedroom; the kitchen does see the study, by the line through the living room's and hall's openings to the study door, which is the generous reading at work; every room sees itself; the table is the same on two builds).
- **Browser captures** under `docs/interior-validation/`:
  - the study from its door by day, and at night with its lamp lit;
  - the desk and the window from the room side, with the yard beyond;
  - the bookshelves and the reading corner;
  - the passage from the hall door, wardrobes either side of the lamp, by day and lit;
  - the master bedroom from its door by day, and at night with its lamp lit;
  - the bed, bedside tables and lamps close to, lit and out;
  - the wardrobes on the gable wall;
  - the study door seen from the hall, and the master bedroom seen through the passage from the hall door, to show what the hall now looks through to;
  - a low view along the floor under the bed;
  - all three rooms after `fallBack()`.
- **Browser checks**, numbered from 90: the two new speed poses, against the rooms through 4b; the draw-call and queued-build budgets; 4a's and 4b's poses no worse and their draw calls no higher; the desk lamp's shade pale with the study's lamp out and warm with it lit, while the living room's stays as its own lamp says, and the same for a bedside lamp; hiding makes no difference to the picture (at each new pose, each existing speed pose and the hall capture pose, a frame with hiding on and a frame with it forced off differ by nothing); from the kitchen pose the master bedroom's set is not drawn, and from the passage it is; at the first indoor frame after entering through the door every furnished room is built; the same with reduced motion; started indoors in the master bedroom, all built at the first frame and its clause in the description; the same furniture on two loads at the same world moment; the yard-unchanged check still passes.
- **Existing checks keep passing**, with 4a's allowance: a spot or sampled patch that a new piece now covers may move to the nearest clear place that still tests the same thing, each move listed in the plan and then in As built. The builder finds which need it; any check that stands or samples in these three rooms is suspect (part 3's windowless-room capture in the master bedroom, the study's pane spot, anything reading the passage's wall). The five speed spots may not move.
- New modules added to `npm run check`.

### What the owner reviews

The captures. Three questions: is each room's layout right when seen built; do the wardrobes either side of the passage's lamp read well, or should they move; and do the desk and bedside lamps read as part of their rooms' light.

## Left to the builder

- File and helper names, the shapes of the new kinds and blueprint entries, and whether like pieces share a kind.
- Every size, position, turn and tint within the rules above; the exact spots.
- Which allowed pieces are in fact sculpted, and how finely.
- How the seen-from table is sampled and where in `shared/` it lives; how the frame toggles sets.
- The form of the widened `&furnish=` switch.
- The count and exact choice of dressing pieces within the budget.
- The wording of the description clauses.

## As built

Where the build departs from the design above, or settles what it left open. The pure room-to-room visibility table (`SIGHT`, `seenFrom`) lives in `shared/sight.js`; the new kinds (`desk`, `wardrobe`, `double-bed` with `seat: 0.55`, `chest`, `pillow`, `blanket`) and `withoutRooms(I, rooms, {keepQueue})` live in `shared/furniture.js`; widened rule 8 (`FURNISHED` over all seven rooms, `throughWays` entries for `passage`, `study` and `master`) lives in `shared/interior.js`; `furnishLater: ['kitchen', 'dining', 'study', 'passage', 'master']`, `SLICE_4C`, the new pieces and the new named and speed spots live in `shared/lakeside-interior.js`. Per-set shade lighting (`lamps[shadeAt]` in place of `SHADE_ROOM`), the new recipes and parent-aware placements for `table-lamp`, `book` and `cup` live in `public/space/interior/furniture.js`; `showFrom(roomId)` and `shownRooms` live in `public/space/interior/index.js`; `&furnish=4b`, `&hide=0` and `updateSight()` live in `public/space/space-view.js`; the study, passage and master clauses live in `public/scene-description.js`.

### Placements

- Every study, passage and master piece stands where the plan's tables put it, with three small adjustments settled during testing and capture review:
  - **`passage-runner`** moved and shortened from `[12.5, 5.85]` (`2.6 × 0.8` m) to `[12.5, 5.6]` (`1.8 × 0.7` m). At `2.6` m wide its bounding sphere (`r = 1.36` m) clipped the left frustum plane of speed pose 2 (`[5.2, 7.9]` in the kitchen, where `passage` is in `shownRooms`), adding one unseen draw call (`42` vs `41`). At `1.8 × 0.7` m centred on `[12.5, 5.6]` it still bridges the hall-to-bath crossing while keeping `passage`'s bounding sphere outside pose 2's frustum (`41` vs `41`).
  - **`pillow-1` and `pillow-2`** sit at `oz = 0, tilt = 0.06` rather than `oz = 0.016` so `kit.cushion`'s taper lift leaves their bottoms within 6 mm of the mattress (`seat = 0.55` m).
  - **`bed-blanket`** widens `topX` from `hx - 0.038` to `hx - 0.018` so its side folds sit cleanly outside the `double-bed` mattress side drapes (`hx - 0.042 + 0.018`) without z-overlap in `furnish-low-bed-floor.jpg`.
- The **desk lamp** uses the existing `table-lamp` kind placed on the desk's east window corner (`[-0.52, 0.16]`), where it reads cleanly at desk height alongside two stacked books (`[0.42, 0.08]` / `[0.41, 0.09]`) and a cup (`[0.18, -0.14]`). No separate desk-lamp kind was needed.
- **Named spots** added: `spots.desk = [15.0, 0.7]`, `spots.shelves = [14.6, 3.1]`, `spots.wardrobes = [12.5, 5.4]`, `spots.bedFoot = [14.5, 8.8]`, `spots.bedside = [12.7, 11.0]`, and `spots.speed[3] = [11.9, 0.8]`, `spots.speed[4] = [12.5, 7.9]`. None of the three existing speed spots moved.

### Which pieces are sculpted

- **Sculpted** (`turned`, `roll`, `drape`, `cushion`, then weighed coarsely per vertex): desk drawer knobs, wardrobe door knobs, blanket-chest side handles; the double bed's four turned corner posts and the bedclothes' side and foot drapes; the two pillows and the folded blanket; plus the existing sculpted kinds reused here (`armchair`, `chair`, `table-lamp`, `cup`).
- **Kit** (through `face`): desk top/apron/legs/drawer fronts, wardrobe carcass/plinth/cornice/framed doors, double bed headboard/footboard/frame/mattress, blanket chest box/framed front/lid, study bookshelves, side tables, study and master rugs, passage runner, books and framed pictures.
- Every new recipe picks its tints through `pal.surface(name, ...)` and emits under `SURFACES[name].mesh` (`wood`, `cloth`, `stone` or `shades`). 4a's and 4b's recipes were left unchanged beyond making `table-lamp`, `book` and `cup` recognise their new parent kinds.

### Out of sight (`shared/sight.js`)

- `seenFrom(I)` samples standing eye points on a `0.5` m grid (`SIGHT.grid = 0.5`) inside every room (plus its centre and `0.25` m in from each opening's centre), tests segments against wall segments whose openings are widened by `0.1` m at each jamb (`SIGHT.widen = 0.1`, generous reading), keeps the table symmetric and reflexive, and joins the stair's ground and upper floors both ways. Running on `LAKESIDE_INTERIOR` takes ~15 ms at build time.
- Notice a consequence of the generous sight definition: from `living`, a diagonal sightline runs through three doorways (`living–hall`, `hall–passage`, `passage–master`), so `living` sees `master`, whereas `kitchen` does not see `master` (`shownRooms` drops `master` at `[5.2, 7.9]` and shows it again from `spots.wardrobes` and the yard).

### Check spots and checks changed

| Check | Was | Now | Why |
|---|---|---|---|
| 71, furniture mesh count | 3 sets; at most 5 in `sets[0]`, at most 4 in each queued set | 6 sets; at most 5 in `sets[0]` and in queued sets with lamps (`study`, `master`), at most 4 in queued sets without (`kitchen`, `dining`, `passage`) | three more queued sets, two of which carry a `shades` mesh |
| `test/interior.test.js`, unfurnished hanging-lamp standability | `solid('master', [14.5, 9.5])` | `solid('bedroom-2', [3.5, 5])` | `blanket-chest` now stands directly under `master`'s hanging lamp at `[14.5, 9.55]` |
| `test/interior-furniture.test.js`, single-set queue fixtures | stripped `['kitchen', 'dining']` | strip `I.furnishLater` | keeps `study` and `master` lamps out of the first build so the `shades in two rooms` check holds |
| `test/space-view.test.js`, queue expectations | asserted `['kitchen', 'dining']` | reads `I.furnishLater` | covers all five queued rooms |

Existing browser checks 40 (`paneSpots.study`), 58 (`masterPose` windowless-room capture) and 67 (`more` with `&furnish=first`) needed no spot moves.

### Measured

Full browser check suite (`scripts/check-space-browser.mjs`): headless Chrome through ANGLE on Apple Silicon, 1440 × 810, tier `full`, on a quiet machine. **103 of 103 checks passed**, 0 page or console errors. `docs/interior-validation/browser-results.json` holds checks 32–103 (72 entries, all passing).

- **First build at the door (check 73):** `&furnish=first` adds **+63.4 ms** over `&bare=1` (full load's first build **+62.7 ms**; medians: first `201.2 ms`, full `200.5 ms`, bare `137.8 ms`) against the **80 ms** budget. Draw calls at the living capture pose: **+5** (`&furnish=first` vs `&bare=1`), **+0** more with all seven rooms furnished.
- **Queued per-room builds (checks 83 & 90, median of 3 loads, limits ≤ 40 ms each, three new rooms ≤ 100 ms):**
  - `study`: **29.6 ms** (`29.6, 29.9, 29.2` ms), `10,821` vertices in `5` meshes.
  - `passage`: **4.4 ms** (`4.4, 4.2, 5.0` ms), `1,258` vertices in `3` meshes.
  - `master`: **17.4 ms** (`17.3, 17.4, 17.4` ms), `4,240` vertices in `4` meshes.
  - Three new rooms together: **51.4 ms** (limit `100` ms).
  - Earlier queued rooms: `kitchen` **30.4 ms** (`5,501`v, `4`m), `dining` **27.0 ms** (`5,192`v, `4`m); `sets[0]` (`living`, `hall`): `12,092`v, `5`m (`64.2` ms).
  - Started indoors in `master` (all 7 rooms built at load, check 101): **170.3 ms** furniture total.
  - Total across all seven furnished rooms: **39,104 vertices in 25 meshes**.
- **Speed at `[11.9, 0.8]` (study facing reading chair, study window live, check 91, limits ≤ 1.1x yard and ≤ +0.05 over `&furnish=4b`):**
  - Day: **1.035x** yard (`11.8 ms` vs `11.4 ms`), against `&furnish=4b` `1.027x` (**+0.008**).
  - Night (study lamp lit by fixture): **1.044x** yard (`11.9 ms` vs `11.4 ms`), against `&furnish=4b` `1.035x` (**+0.009**).
- **Speed at `[12.5, 7.9]` (master bedroom facing bed, check 92, limits ≤ 1.1x yard and ≤ +0.05 over `&furnish=4b`):**
  - Day: **0.841x** yard (`9.5 ms` vs `11.3 ms`), against `&furnish=4b` `0.841x` (**+0.000**).
  - Night (master lamp lit by fixture): **0.833x** yard (`9.5 ms` vs `11.4 ms`), against `&furnish=4b` `0.833x` (**+0.000**).
- **Draw calls at the two new poses (check 93, limit ≤ +6 over `&furnish=4b`):** study **+5** (`31` vs `26`), master **+4** (`14` vs `10`).
- **Existing three speed poses vs `&furnish=4b` (check 94, 5 ABBA-balanced pairs, 20-frame span timing, limit ≤ +0.01 of a yard frame and no added draw calls):**
  - `[4.2, 3]`: day **+0.002**, night **+0.004**, `44 / 44` draw calls.
  - `[3.8, 5.5]`: day **+0.002**, night **+0.000**, `52 / 52` draw calls.
  - `[5.2, 7.9]`: day **−0.008**, night **+0.001**, `41 / 41` draw calls.
- **Shades, hiding, entry, determinism and fallback (checks 95–103):**
  - Desk lamp shade reads `rgb(56, 63, 80)` pale when study is out & living lit, `rgb(236, 193, 139)` warm when study is lit & living out (matching living reference `rgb(231, 188, 135)`), while living's shade tracks its own lamp.
  - Bedside lamp 1 shade reads `rgb(53, 60, 77)` pale when master is out & living lit, `rgb(229, 187, 134)` warm when master is lit & living out.
  - Hiding unseen rooms changes **0** of `5,184` sampled pixels across all five speed poses and the hall capture pose (`default` vs `&hide=0`), hides `master` from `[5.2, 7.9]`, and shows it from `spots.wardrobes` and the yard.
  - Normal and reduced-motion entry both report `pending: []` with all 7 rooms built on the first indoor frame; starting indoors in `master` builds all 7 rooms (`170.3 ms`) and includes the master bedroom's clause in the description; 2-load determinism reads **0** differing pixels (`&furnish=4b` differs in `29.2%` study / `31.5%` master); after `inside.fallBack()` all meshes stay present with mean luminance `0.579` (study), `0.635` (passage) and `0.630` (master).

### Cut for speed

- Nothing was cut: every planned piece and dressing item built and drew within budget (`passage-runner` was shortened from `2.6` to `1.8` m only so its bounding sphere stays outside speed pose 2's frustum).

### Known weak points, as the captures show them

- **Brushwork weight (inherited from 4a/4b, out of scope here):** wood furniture, wardrobe panels, books, the cup, knobs and handles carry the strong `hills` / `stone` brushwork, so small pieces read with heavy strokes and will benefit from the planned texture pass (`SURFACES` is in place for it).
- **Grounding patches are subtle by day:** visible under the bed and chest in `furnish-low-bed-floor.jpg`, faint at standing height.
- **Passage wardrobe niche:** the two wardrobes either side of the wall lamp leave a `0.6` m recess between them that frames the lamp cleanly from inside the passage (`furnish-passage-day.jpg` / `furnish-passage-lit.jpg`), though the doorway edge trims part of the left wardrobe from the hall (`furnish-hall-to-master.jpg`) — open to owner review.
- **Hall-to-master sightline:** from the hall doorway (`furnish-hall-to-master.jpg`), the line of sight through the passage doorway reaches the master rug and the gable wardrobes rather than the bed, because the bed stands east of the passage–master doorway (`a = 14.5` vs doorway `a = 12–13`).
