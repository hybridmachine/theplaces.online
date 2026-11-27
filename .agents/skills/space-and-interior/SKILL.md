---
name: space-and-interior
description: >-
  Author or modify the 3D walkable yard, yard life, cabin interior blueprint,
  furniture recipes, live window views, or vertex-baked indoor lighting. Use when
  editing shared/lakeside-space*.js, shared/lakeside-interior.js, shared/interior*.js,
  shared/furniture.js, shared/walker.js, or public/space/**.
---

# 3D Space & Cabin Interior Development

## 1. Read the Relevant Spec First

Before editing 3D yard or interior code, read the matching spec in
`docs/superpowers/specs/` (for example `2026-11-17-cabin-interior-design.md` and
the relevant Part 2–5 spec). Specs record geometry decisions, rule numbers, and
measured performance budgets that are not repeated in code.

## 2. Architectural Invariants

### Coordinates & Walking
- Blueprints use `[a, d, z]` (`a` across, `d` depth, `z` up). Three.js is Y-up;
  convert via `toThree` in `public/space/geometry.js` (`[a, z, -d]`).
- Walking is rule-based in `shared/walker.js` (no physics engine). Collision
  comes from the blueprint's rooms, openings, obstacles, and built furniture.

### Frozen Blueprint & Numbered Validation Rules
- `shared/lakeside-interior.js` is one frozen blueprint (18 rooms across floors
  0 and 1, openings, windows, fittings, furniture, named `spots`).
- `shared/interior.js` (`validInterior`) enforces tiling, stair geometry, window
  clearances, lamp clearances, and **numbered furniture rules 1–8**:
  1. Known `KINDS` entry in an existing room
  2. Footprint inside its room
  3. Solid piece clear of other solids, chimney breasts, door-leaf sweep, doorway
     passages, and stair (newel apart)
  4. Clear of wall lamps and fireplace mouth
  5. Wall-hung piece on a room wall clear of openings, front door, windows, wall lamps
  6. Set-on piece resting on a valid holder in the same room (or fireplace mantel)
  7. Reachability flood from entry (floor 0) / stair top (floor 1) to all openings,
     named spots, and stair foot
  8. Wide-walker clearance (`0.9 m`, `WIDE_CLEAR = 0.45`) through hall and living room
- Moving a single piece can break a flood or clearance rule far from that room.
  Always run `node --test test/interior.test.js test/furniture.test.js test/walker.test.js`.

### Vertex-Baked Indoor Light (Zero Scene Lights)
- There are **no runtime Three.js lights indoors**.
- `shared/interior-light.js` computes per-vertex weights (`day`, `lamp`, `fire`,
  room index). One shared material (`public/space/interior/light.js`) multiplies
  them by per-frame *dials* from the shared world snapshot.
- Every new indoor geometry piece must flow through the `face`/`lit` builders so
  it carries light weights and cleanly degrades via `fallBack()` to flat materials
  if the lit shader fails to compile.

### Furniture Pipeline, Lazy Queue & Sightline Culling
- Define metadata (`footprint`, height, class: solid / walk-over / wall-hung /
  set-on) in `shared/furniture.js` (`KINDS`), and geometry in
  `public/space/interior/furniture.js` (`RECIPES`) using `furniture-kit.js`.
  Merge pieces into minimal meshes per room set.
- `furnishLater` queues rooms in two stages: floor 0 builds one room per frame
  after the door is wanted (flushed on cabin entry); floor 1 builds in background
  frames (flushed near the stair or on upstairs load).
- If a recipe throws, skip that piece and anything set on it; `SpaceView.walkPlan`
  must drop skipped pieces so the walker never collides with unbuilt geometry.
- `shared/sight.js` hides unseen rooms based on room adjacency, doorway frustum
  planes, and stairwell visibility.

### Live Window Views & Tiering
- `public/space/window-views.js` and `public/space/view-budget.js` render the
  live yard into open doorways/windows using the stencil buffer (max 3 live on
  `full`, 2 on `light`/`plain`; `?interior=0` requests no stencil buffer).
- `public/space/tier.js` only steps down (`full` → `light` → `plain`), never up.

### Honest Accessible Descriptions & Fallbacks
- `public/scene-description.js` must only mention rooms, furniture, lights, or
  views that actually built and rendered—including in bare, queued, or fallback
  states.
- Any failure in 3D falls back cleanly to the 2D painting; interior build failure
  keeps the door shut and leaves the yard running.

## 3. Budgets & Verification

Check changes against the budgets documented in `docs/interior-validation/README.md`:
- First build at door (`hall` + `living` over `&bare=1`): `≤ 80 ms`
- Floor-0 queued 8 rooms: `< 180 ms`; Floor-1 queued 8 rooms: `≤ 120 ms`
- Speed poses: `≤ 1.1×` yard, paired slice delta `≤ +0.05`
- ABBA regression: `0` added draw calls at non-visible poses, delta `≤ +0.01` (`≤ +0.02` visible)

Run unit checks before browser validation:
```sh
npm run check
node --test test/space*.test.js test/interior*.test.js test/furniture.test.js test/walker.test.js test/sight.test.js test/window-view*.test.js
```

If you added any new `.js` file under `shared/` or `public/space/`, register it
in `package.json`'s `scripts.check` list, then verify in Chromium with the
`browser-validation` skill.
