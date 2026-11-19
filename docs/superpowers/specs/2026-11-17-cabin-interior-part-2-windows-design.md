# Cabin interior, part 2: live windows and the open door — design

Status: proposed, November 17, 2026. Awaiting approval. Nothing is built.

This is part 2 of `2026-11-17-cabin-interior-design.md` (the parent). The parent's intent, goals, non-goals and anti-goals all still hold; this document only settles what the parent left open for this part, and records one change to it.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction.

## Intent

Standing in the cabin, the six windows and the open front door are real openings onto the living yard. The view is the yard itself, at true scale, from where that opening sits on the outside of the cabin, and it shifts as you walk past the glass exactly as a real window's would. Why now: it is the riskiest part of the interior for speed, and the first thing that gives the bare rooms an orientation.

## Goals

- All six windows and the front door (while it is open) show the live yard with all its life: sky, sun, moon, stars, clouds, wind, rain, bird, ripples, path lights, chimney smoke.
- The view shifts correctly with every step and turn, on both floors and on the stair.
- The living room window is the casement; its leaf stands open indoors whenever the world's casement is open.
- A device that holds the `full` tier in the yard holds it in the living room facing the window.
- Still behind `?interior=1`.

## Non-goals

- Light and furnishing (parts 3 and 4). Rooms stay flat-lit plaster.
- Seeing into the cabin from the yard. The doorway seen from outside stays the flat dim tone.
- Reflections on the glass, dirt, curtains, raindrops running down the pane. **(call)**
- Anything the visitor can open or shut.
- Any server, world-state or persisted-state change. No new art files.

## Anti-goals

- A view that reads as a screen: one that lags the visitor, stutters, or does not shift with movement.
- A tilted horizon, or a sun or moon in a different part of the sky than the yard has.
- The cabin's own walls, roof or the trees behind it blocking a view.
- Rain, birds or smoke appearing inside a room.
- Two visitors seeing different yards through the same window at the same moment.

## Constraints found in the project

- `SpaceView.render` (`public/space/space-view.js`) draws one scene per frame: the yard, or indoors the interior scene, either straight to the canvas (`plain` tier) or through `PainterlyPass.render(scene, camera, {water})`.
- The pass (`public/space/painterly-pass.js`) draws the scene into one 4-sample target with a depth texture, then filters. It reads that depth for three things: untouched depth means sky (left unbrushed), distance sets how far the near brush marks reach, and a pixel whose world height (from the camera's `eye` and `unproject` matrices) is the lake's level is treated as water (no marks). Indoors `water` is false, because the ground floor lies at the lake's height.
- The yard carries on indoors: sky, light and `life.update` run every frame whichever scene is drawn.
- Some yard things are placed by the visitor's camera: the sky dome is centred on it (`sky-dome.js`), the rain falls round it (`life/rain.js`), the far birds sit at a fixed distance from it and face it (`life/far-birds.js`), the smoke's puffs face it (`life/smoke.js`). The ground's shader uses three's own `cameraPosition`.
- The yard uses custom shader materials in `scene/ground.js`, `cover.js`, `hills.js`, `lights.js`, `life/smoke.js` and `sky-dome.js`. Nothing uses clipping planes or the stencil buffer today.
- The interior scene (`public/space/interior/index.js`) is built in its own frame with one flat glass mesh (`glass`) for all panes and the doorway, coloured by `setSky`. The blueprint (`shared/lakeside-interior.js`) gives each window's interior place; the cabin's exterior anchors come from `shared/lakeside-dressing.js` (`cabinFrame`, and the panel-centre function beside it).
- The interior ceiling slope (1.7 m rise over 6 m) is much shallower than the exterior roof's (2 m over 3 m).
- Indoors the door's swing value already exists: `createPassage` (`public/space/passage.js`) opens it while the visitor is within 2.5 m of the hall's entry spot. The shell has no door leaf indoors; the doorway is always a pane of sky colour.
- The tier meter measures indoor frames but may only step down from them, never lock.

## Approaches considered

1. **A picture on each pane.** Each visible opening gets its own small off-screen picture of the yard, shown on the glass and brushed with the room. Each view's cost can be dialled (resolution, refresh rate). Slightly soft at reduced resolution.
2. **Holes into the yard — chosen by the owner.** The yard is drawn straight into the frame wherever glass is visible, from the shifted viewpoint. Always sharp and never a frame behind; but every opening in view is a further drawing of the yard each frame, with no resolution or refresh dial, and it reaches into the painterly pass's handling of depth and water.
3. **One shared picture, refreshed one window at a time.** A cheaper form of 1; views can visibly lag.

The owner picked 2: the glass should be a true opening, not a picture of one.

## Design

### The viewpoint

- Each opening has an interior pane (its rectangle in the interior frame) and an exterior anchor (a point on the outside of the cabin), as the parent lists them.
- For each opening, the yard is seen from the visitor's own eye carried from the interior frame into the yard by a turn about the vertical and a shift, chosen so the pane's centre lands on the anchor and the pane's outward direction lands on the cabin face's outward direction. Never a tilt and never a scale. So: an eye at the pane's centre is at the anchor; a step of 1 m along the wall indoors is 1 m along the cabin's wall outside; the horizon is level through every opening; and the sun stands where it stands in the yard.
- Roof windows use the same rule with the interior pane keeping its interior slope. Their anchors sit on the exterior roof slope above their rooms' halves of the cabin, as the parent says; the sky room's on the back slope at the chimney end. The steeper exterior roof is simply not drawn (below). **(call)**
- This mapping is a pure function of the blueprint, the dressing and the eye, in `shared/`, with Node tests.

### What is drawn through an opening

- Everything in the yard except the cabin's own exterior (walls, roof, chimney, panels, door, and the cottage's glow and casement leaf on it). Chimney smoke is still drawn.
- Nothing nearer than the pane. Because the eye can stand many metres back from a window, the carried eye can be well behind the cabin, among the trees; anything between it and the pane's plane must be cut away, exactly at that plane.
- Things placed by the camera follow the carried eye for that opening: the sky dome is centred on it, the far birds and the smoke face it, and the rain falls round the cabin's outside, so it is seen through every window and never indoors. **(call)**
- Wall windows and the door show the yard from the glass outward only; the plaster reveal, sill and frame belong to the room.

### How it meets the frame

The owner chose that the yard is drawn into the frame itself, not onto a texture. Within that, the builder decides the means, to these rules:

- Through the glass the yard has the same sharpness as the room, in the same frame as the visitor's movement. No view is ever a frame late.
- The painterly pass brushes room and view as one picture, on `full` and `light`. On `plain` the same openings are live, drawn straight to the canvas.
- Sky seen through glass is treated as sky by the pass (left unbrushed, as outdoors).
- The lake seen through glass must not carry near brush marks that swim over it. The pass today finds water from one camera's matrices and is told there is none indoors; the builder either teaches it about glass pixels, or treats everything seen through glass as distant (painted, without the near impasto and bristle marks). The second is acceptable. **(call)**
- An opening only partly in view, or partly hidden by a wall, a doorway or the stair, shows only through its visible part. Two openings in view at once each show their own view, also where they are close together on screen.
- The yard's own picture, drawn from outdoors, is unchanged: every existing yard capture and test stays as it is.

### Which openings are live

- An opening is drawn only when its pane is in the camera's view, faces the visitor, and is on the visitor's floor or in sight up or down the stairwell. The builder may add a coarser test of which openings can be seen from which room.
- No dial exists for resolution or refresh (that is the price of approach 2), so the dial is the number of live openings. At most three are live in a frame on `full`, two on `light` and `plain`, chosen by how much of the screen each covers; any beyond that keep the shell's flat horizon-coloured glass. **(call)** This replaces the parent's "on the `plain` tier the views may be coarser and refresh less often".
- Which openings are live is a pure rule with Node tests.

### The windows themselves

- Each window gets a painted wooden frame, a sill, and glazing bars in the pattern of the exterior panels, built in the room. They are near things in front of a far view, which is the strongest cue that the glass is real. **(call)**
- The living room window's casement leaf (the same leaf as outside: from the window's outer edge to its first glazing bar) swings by the world's casement value, the same for every visitor. It swings outward, as the yard shows it. **(call)** So it is a thing of the room that stands beyond the glass, in front of the yard's view; the means of drawing the view must allow for that.
- Roof windows get a frame at the top of their reveal, without bars. **(call)**
- The glass itself adds nothing: no tint, no reflection.

### The front door from inside

- The hall gets a door leaf swinging into the hall by the passage's existing door value. It hinges on the living-room side of the doorway (a = 8.5): on the other side the open leaf would leave only 0.5 m between its free edge and the stair foot, shutting off the study door. If the leaf seen from the yard hinges on the other edge, that one is changed to match, so the two agree. **(call)**
- The open leaf is solid: the visitor cannot walk through it. It is one thin fixed obstacle in the blueprint where the fully open leaf stands, whatever the swing value at that moment, so standing and remembered places are judged by one rule. The blueprint's validity test (every room reachable, every opening at least 0.9 m clear) must still pass with it. **(call)**
- While the leaf is at all open, the doorway is a live opening onto the yard, anchored at the exterior door panel's centre, counted among the live openings like a window. While it is shut the doorway is not drawn through at all.
- Entering, leaving and the fade are unchanged.

### Speed

- The target is the parent's: a device that holds `full` in the yard holds it in the living room facing the window. The check script records the median frame time at the yard's arrival pose and in the living room facing the window, both on `full`, into `docs/interior-validation/browser-results.json`. The target is met when the indoor figure is no more than 1.1 times the yard's on the same machine. **(call)** A figure merely under the tier meter's step-down line on a fast machine does not count.
- A step down of the tier is permanent and carries back out to the yard (`public/space/tier.js`), and up to three openings can be live at once. So that a crowded view indoors cannot cost a device its tier in the yard, a slow stretch indoors first lowers the number of live openings, one at a time down to one, and only with a single opening live may it step the tier down. The lowered number lasts while the visitor is indoors and is restored on the next entry. **(call)** This changes the meter's indoor rule; that indoor frames never lock the tier stays.
- If the target is missed, the order of remedies is: draw less of the yard through glass (things too small or far to matter through that opening), lower the live-opening cap, and only then come back to the owner. Falling back to pictures on the panes is not the builder's to choose.

### Failure

- If the views cannot be set up on a device, the panes keep the shell's flat horizon colour and the interior carries on. Nothing is thrown per frame. **(call)**

### Checks

- Node tests: the carried eye (centre lands on the anchor; a metre is a metre; level horizon for wall and roof windows; headings keep their angle to the wall); the cut plane sits on the pane; which openings are live, with the cap per tier and the door counted only when open; the casement leaf and the door leaf as pure functions of their values; the open door leaf stops the walker and the blueprint stays valid with it; a slow stretch indoors lowers the live openings before it lowers the tier.
- The Playwright script gains captures under `docs/interior-validation/`: each of the six windows and the open door by day; the living room window from two spots a couple of metres apart (the view must differ); one in rain; one at night; one from the yard to show it is unchanged.
- New modules are added to `npm run check`.

## Left to the builder

- Module and file layout.
- The means of drawing the yard into the frame and cutting it at the pane (marking the glass, clipping, drawing order), given that the yard has custom shader materials and the pass's target is multi-sampled with a depth texture.
- How camera-placed yard things are re-aimed per opening without running the whole of `life.update` again for each.
- Exact frame, bar and leaf dimensions and colours.
- Whether a room-to-opening sight table is worth having.
