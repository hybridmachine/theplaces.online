# Cabin interior — design

Status: parts 1–5 built; cabin interior on by default (`?interior=0` keeps the door shut), November 25, 2026.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction.

## Intent

The cabin becomes a place you can go into. From the yard it stays the small stone cottage of the painting. Through its door is a large, warm, two-storey home: lit, furnished, walkable, with real windows onto the same living yard, lake and sky.

It is a magical cabin: 9 × 6 m outside, 18 × 12 m per floor inside. The mismatch is the charm and is never explained.

This is still not a game. The interior rewards the same slow wandering and long watching as the yard, now from a chair by the fire or a bedroom roof window.

## Goals

- Walk in through the front door, through every room on both floors, and back out.
- A blueprint of two floors with: a full bathroom on each floor, a study, a common living area with a fireplace, three bedrooms (master downstairs, two smaller upstairs), a kitchen, a pantry, and the extra rooms proposed below.
- Windows show the live yard, from where each window sits on the outside of the cabin, shifting as you move past the glass.
- The interior is lit: daylight through windows, lamps and firelight after dusk, tied to the cottage state the world already has.
- Nicely appointed: every room furnished so its purpose reads at a glance, in the painted look.
- The remembered place works indoors: a visitor who stops in the study returns to the study.

## Non-goals

- Changing the cabin's exterior. No new windows, dormers or doors appear outside. **(call)**
- Meeting the resident. The cottage state has a resident whose routine drives the lights, casement and hearth; they are never seen. Their traces are: the lamp lit in the room they are in, the fire, the open casement. **(call)**
- Things the visitor can operate: switches, taps, drawers, interior doors. **(call)**
- Any server or world-state change. No new persisted state.
- Sound changes. The existing ambience plays unchanged indoors. **(call)**
- A cellar, attic, or rooms beyond this blueprint.

## Anti-goals

- Anything that makes two visitors' worlds disagree. Every light, flame and open window indoors must follow from the shared world state and clock, never from what a visitor did or where they stand.
- Game feel: no prompts ("press E to enter"), no HUD, no loading screen.
- A clean CG or dollhouse look. Flat plaster walls with hard edges and evenly lit rooms count as failure.
- A dark house. No room may ever be too dark to find the way out of, at any hour.
- Windows that read as screens: a view that does not shift when you move, or a visibly stuttering one.

## Constraints found in the project

- The cabin (`public/space/scene/cabin.js`, `shared/lakeside-dressing.js`) is 9 × 6 m, walls 2.6 m, ridge 4.6 m. Front face: a door at the centre and windows 2.4 m either side (`front-left`, `front-right`). Back face: one small window 0.5 m off centre. The chimney stands 3.8 m toward the north gable, the same end as `front-left`. The door and windows are painted panels on a solid block.
- The cottage state (`shared/cottage.js`) already carries `rooms.main`, `rooms.second`, `casement`, `hearth.on`, and a resident located in `main-room`, `second-room` or between them. `lifeLayout` maps `main` to `front-left` (which has the casement) and `second` to `front-right`. `public/space/life/cottage.js` and `smoke.js` present these outside.
- Walking (`shared/walker.js`, `shared/space.js`) is two-dimensional. Eye height is ground height plus 1.6 m, ground height comes from the yard's terrain function, and "walkable" means inside the yard wall, above the water, outside every collider. The cabin's collider stands 0.4 m outside its walls. There is no notion of floors.
- The view (`public/space/space-view.js`) owns one scene, one camera, a hemisphere and a directional light, fog, the sky dome, and an optional full-frame painterly pass with three tiers (`full`, `light`, `plain`) chosen by a frame-time meter. Frames are capped at 30 fps, pixel ratio at 1.6, GPU preference low-power.
- The path lights (`public/space/scene/lights.js`) deliberately use no real light sources: emitted lamps, added halos and pools.
- Place memory (`public/space/place-memory.js`) stores a version 1 record of position, yaw and pitch, validated by the yard's `walkable`.
- All geometry is authored in code; three.js is vendored; there is no build step and there are no model files.

## Approaches considered

1. **Separate interior, windows as live pictures — chosen by the owner.** The interior is its own space. The door opens as you reach it and a short fade carries you in. Each window in view shows the yard drawn from that window's place on the outside wall, shifting correctly as you move, at reduced resolution and only while on screen. Cost: the yard is drawn a second time whenever a window is in view.
2. **True portals, no fade.** The door and windows are literal holes into the yard, so entering has no cut. The most magical, but it fights the full-frame painterly pass, and is the hardest to keep fast and seamless when the inside is four times the outside.
3. **Fixed-view windows.** Each window shows the yard from one fixed spot. Cheapest, but the view does not shift as you move, so it reads as a screen, which is an anti-goal.

Approach 1 was picked: real glass and a living world indoors, for the price of a fade at the door.

## Design

### Blueprint

The interior has its own frame, in metres: `a` runs along the front wall from the chimney (north gable) end, 0 to 18; `d` is depth from the front wall, 0 to 12. Rooms are given as `a` range × `d` range. Internal walls are 0.15 m thick, centred on the shared lines. **(call)**

Ground floor, ceiling 2.7 m **(call)**:

| Room | a | d | Notes |
|---|---|---|---|
| Living room | 0–7 | 0–7 | Fireplace on the gable wall (a = 0), centred on the room at d = 3.5. Front window at a = 4.2: the `main` room |
| Entry hall | 7–11 | 0–7 | Front door at a = 9. Stair along its a = 11 side |
| Study | 11–18 | 0–4 | Front window at a = 13.8: the `second` room |
| Closet passage | 11–14 | 4–7 | Wardrobes; links hall, bath and master |
| Full bath | 14–18 | 4–7 | Bath, shower, basin, toilet |
| Laundry | 0–2.5 | 7–9.5 | |
| Pantry | 0–2.5 | 9.5–12 | |
| Kitchen | 2.5–7 | 7–12 | |
| Dining | 7–11 | 7–12 | Back window, 1 m off the centre line on the side the exterior back window is |
| Master bedroom | 11–18 | 7–12 | No window; see Light |

Upper floor, floor level 3.0 m above the ground floor, under a pitched ceiling: 1.9 m at the front and back walls rising to 3.6 m along a ridge at d = 6, so a visitor can stand anywhere on the floor **(call)**:

| Room | a | d | Notes |
|---|---|---|---|
| Bedroom 2 | 0–7 | 0–7 | Roof window in the front slope |
| Landing | 7–11 | 0–7 | Stair arrives here; window seat at the front wall, without a window |
| Bedroom 3 | 11–18 | 0–7 | Roof window in the front slope |
| Sky room | 0–7 | 7–12 | A large roof window in the back slope, for the sun, moon and stars |
| Library nook | 7–11 | 7–12 | Open to the landing |
| Full bath | 11–15 | 7–12 | |
| Box room | 15–18 | 7–9.5 | Storage, opening off bedroom 3 |
| Linen | 15–18 | 9.5–12 | Opening off the bath |

The stair is one straight flight, 1.4 m wide, in the hall against the a = 11 wall, from d = 1.5 at the bottom to d = 5.4 at the top (a steep cottage stair), with a railed stairwell above it on the landing. This leaves 1.5 m of the a = 11 wall clear at each end of the flight: at the front (d 0–1.5) for the study door, and at the back (d 5.4–7) for the closet passage door downstairs and bedroom 3's door upstairs. The space under the flight is closed in and not walkable. **(call)**

What connects to what (every opening at least 0.9 m clear; exact positions left to the builder, who must keep them clear of the stair):

- Ground: front door–hall; hall–living (wide opening); hall–study (near the front wall, before the stair foot); hall–dining (wide opening); hall–closet passage (past the stair top); living–kitchen (wide opening); kitchen–dining (open plan); kitchen–pantry; kitchen–laundry; passage–bath; passage–master.
- Upper: landing–bedroom 2; landing–bedroom 3; landing–library nook (open); nook–sky room; nook–bath; bath–linen; bedroom 3–box room.

Rooms the owner asked for: both baths, study, living room with fireplace, three bedrooms, kitchen, pantry. Rooms added by the author **(call)**: entry hall, dining, laundry, closet passage, sky room, library nook, box room, linen.

Doorways have frames and doors standing open; nothing swings. **(call)**

### Entering and leaving

- When the visitor comes within about 1.5 m of the front door, facing it, the door swings open on its own; it closes again when they move away. This is presentation for that visitor only and is not world state.
- From the yard, the open doorway shows no view of the hall: only a flat, dim interior tone, warm when the hall lamp is lit and dark otherwise. The interior is not drawn from outside. **(call)**
- Walking on into the open doorway fades the view out and in over about 0.6 s **(call)**, and sets the visitor just inside the hall facing in. Walking out through the hall's doorway does the reverse and sets them on the threshold outside, facing out.
- With reduced motion the fade is a plain cut. **(call)**
- From the hall, the open front door shows the live yard, by the same means as a window.
- The quiet "return to the arrival view" control works indoors: fade, then stand at the arrival pose (no glide through walls). **(call)**
- Until the owner approves the interior, it sits behind a URL switch (`?interior=1`), and without it the door stays shut, as today. **(call)**

### Walking indoors

- The same keys, drag-to-look, speeds and eye height as in the yard. Whatever input the yard supports works indoors.
- The interior is described in a new shared module in the style of `shared/lakeside-space.js`: rooms, openings, the stair, window and door anchors, and furniture colliders, in the interior frame.
- The visitor's state gains which place they are in (yard or cabin) and, indoors, which floor. Indoors, "walkable" means inside a room or opening, outside furniture colliders, with at least 0.25 m between the eye and any wall **(call)**, so the camera never clips into plaster. Sliding along walls works as it does along the yard's colliders.
- On the stair, height follows position along the flight, smoothly. The visitor changes floor only by walking the stair. From the landing they cannot step into the stairwell.
- The walker stays a pure module with Node tests.

### Windows and the open door

- Six windows and one door look out: living room, study and dining on the ground floor; bedroom 2, bedroom 3 and the sky room in the roof; the front door when open.
- Each has an anchor on the cabin's exterior: the three wall windows and the door at the centres of their painted panels; the bedroom roof windows on the front roof slope above their rooms' halves of the cabin; the sky room's on the back slope at the chimney end. **(call)**
- The view through an opening is the yard drawn at true scale from a camera placed at the anchor, offset by exactly the visitor's offset from the interior opening's centre, so the view shifts as real glass would. Interior openings may therefore be larger than the exterior panels: wall windows about 1.4 × 1.5 m, bedroom roof windows about 1.0 × 1.4 m, the sky room's about 2.4 × 1.8 m. **(call)**
- In these views the cabin's own exterior is not drawn, so the wall and roof never block the view; everything else in the yard is, with all its life: sky, sun, moon, stars, clouds, wind, rain, bird, ripples, path lights, chimney smoke.
- The living room's window is the casement. When the world's casement is open, the leaf stands open indoors too.
- Only openings on screen are drawn. The builder sets the resolution, refresh rate and how many may update per frame, to meet the performance target below. Views should not visibly stutter on the `full` tier.
- On the `plain` tier the views may be coarser and refresh less often, but stay live. **(call)**
- Rain never falls indoors. It is seen through the glass.

### Light

- The yard's sun, moon and fog do not light the interior directly. Each room has its own soft, authored light, in keeping with "soft and authored, as in the painting".
- Daylight: rooms brighten and cool with the world's day/night value and dim under overcast, most strongly near their windows. Windowless rooms borrow a weaker share through their openings.
- Lamps and fire follow shared state only:
  - living room lamps are lit when `rooms.main` is lit; study lamps when `rooms.second` is lit, matching the glow seen from the yard;
  - the fire burns when `hearth.on`, with a warm flicker on the living room; otherwise the hearth holds dull embers or is cold, as the builder judges from the hearth's `since` and `lastBurn`;
  - every other room's lamps are lit only while the world is dark and at least one of `rooms.main` and `rooms.second` is lit, coming on a little apart per room by a fixed seed, the same for every visitor. The house goes to bed with its resident, so it is never bright inside while dark from the yard. **(call)**
  - the hall and stair keep one low night lamp from dusk to dawn, so the way out is always findable. **(call)**
- With lamps out at night a room keeps a dim blue fill, as the yard's night does, so nothing is black.
- How this is achieved (a few real lights, vertex-authored light, emitted lamps with added pools as the path lights do) is left to the builder, within the performance target.
- The painterly pass runs over the interior as it does the yard.

### Furnishing

Authored in code from simple forms, as the wheelbarrow and raised beds are, with painted surfaces and broken edges. Surfaces (plaster, floorboards, beams, fabric, tile) are made from the existing brush textures, tinted; new plates are requested from the owner, following `ARTWORK.md`, only if that proves too coarse. **(call)**

Each room's must-haves **(call)**; the builder may add small dressing:

- Living room: stone fireplace and mantel, hearth rug, sofa and two armchairs facing the fire, bookshelf, a window seat under the casement, lamps.
- Entry hall: coat hooks, boot bench, runner rug, the stair with a newel and rail.
- Study: desk and chair at the window, bookshelves, reading chair, desk lamp.
- Kitchen: range, sink, worktops, a central table, hanging pans, a dresser with crockery.
- Dining: table for six, chairs, a sideboard, a lamp above the table.
- Pantry: shelves of jars, sacks and crates. Laundry: tub, drying rack, baskets.
- Closet passage: wardrobes along one side.
- Baths: bathtub, shower, basin with mirror, toilet, towel rail.
- Master bedroom: double bed, two bedside tables with lamps, wardrobe, chest, rug.
- Bedrooms 2 and 3: a single bed under the slope, bedside table and lamp, small desk or chest, rug.
- Sky room: a daybed and floor cushions under the roof window, a small telescope on a tripod.
- Library nook: shelves to the ceiling slope, a reading chair, a lamp.
- Landing: window seat, a rail around the stairwell. Box room: trunks. Linen: shelves of folded linen.

### Remembered place

- The stored record gains the place and floor, under a new record version. A version 1 record still loads as a yard position.
- An indoor record is validated against the interior's walkable area; anything invalid falls back as today.
- While the interior is behind its switch, an indoor record loaded without the switch falls back to the arrival pose.
- "Forget visit memory" clears it as before. Nothing about position is sent to the server.

### Descriptions and fallback

- The scene description names the room the visitor is in and what is lit.
- The 2D painting and its fallback rules are untouched. If the interior fails to build, the door stays shut and the yard carries on.
- The interior's geometry is built when first needed, not at page load, so the yard's start-up time does not grow. **(call)**

### Parts

Each ends in an owner review.

1. **Shell.** The interior module, rooms, walls, openings, stair, plain surfaces and flat light; entering and leaving; walking both floors; remembered place. Windows and the doorway show a flat sky colour.
2. **Live windows and the open door.**
3. **Light.** Daylight, lamps, fire, night.
4. **Furnishing,** in this order: living room and hall, kitchen and dining, study, bedrooms and sky room, baths and the small rooms.

Then the switch is removed and README, `DESIGN.md` and `ARTWORK.md` are updated.

### Checks

- Node tests: the blueprint is valid (rooms do not overlap, every room is reachable from the front door, every opening is at least 0.9 m clear, the stair joins the floors); walking and sliding indoors; stair height; no stepping into the stairwell; place-memory validation for both record versions; lamp and fire rules as pure functions of shared state.
- An optional Playwright script in the style of `scripts/check-space-browser.mjs`, with captures of every room by day and night under `docs/interior-validation/`.
- New modules added to `npm run check`.
- Performance target: a device that holds the `full` tier in the yard holds it in the living room facing the window. **(call)**

## Left to the builder

- Module and file layout, and how the walker is generalised to places and floors.
- Exact door, opening and furniture positions within the rules above.
- How window views are drawn, their resolution and refresh rate, how the cabin exterior is left out of them, and how the roof-window views are fitted given that the interior ceiling slope differs from the exterior roof's.
- How rooms are lit, within the rules above.
- Colours, materials and small dressing of each room.
- The door's swing, the fade's exact timing, storage record shape.

## As built (parts 1–5)

All five parts are implemented and merged/enabled by default:

- **Part 1 (Shell):** `shared/lakeside-interior.js`, `shared/interior.js`, `shared/threshold.js`, `public/space/passage.js`, `public/space/interior/index.js`, and version-2 `PlaceMemory` (`public/space/place-memory.js`).
- **Part 2 (Live windows & open door):** `shared/window-views.js`, `public/space/window-views.js`, `public/space/view-budget.js`, stencil-masked live yard views into the frame (`2026-11-17-cabin-interior-part-2-windows-design.md`).
- **Part 3 (Light):** vertex-authored light field (`shared/interior-light.js`, `public/space/interior/light.js`), fireplace (`fireplace.js`), and lamp fittings (`fittings.js`) with zero scene light sources (`2026-11-20-cabin-interior-part-3-light-design.md`).
- **Part 4 (Furnishing, slices 4a–4f):** `shared/furniture.js`, `shared/sight.js`, `public/space/interior/furniture-kit.js`, `public/space/interior/furniture.js`, furnishing all 18 rooms across 17 merged sets (`76,627` vertices in `65` meshes) with two-stage lazy queuing and unseen-room hiding (`2026-11-21` through `2026-11-24` specs `4a`–`4f`).
- **Part 5 (Default on, ABBA hardening & close-out docs):** `interiorSwitch` flipped to on-by-default with `?interior=0` opt-out (mirroring `?space=0`), interleaved paused-tab speed/ABBA timing in `scripts/check-space-browser.mjs` (135 checks), and updated `README.md`, `DESIGN.md`, `ARTWORK.md`, `CLAUDE.md`, and `docs/interior-validation/README.md` (`2026-11-25-cabin-interior-part-5-default-design.md`).
