# Navigable yard and cabin — design

Status: proposed, November 15, 2026. Awaiting approval. Nothing is built.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction.

## Intent

The Lakeside Cottage stops being a fixed view and becomes a small place. A visitor walks the yard and around the cabin with the WASD keys, finds a spot they like, and stays to watch the shared world from there. When they open the page again, they are standing where they left off, looking the same way.

This is not a game. It is a beautiful, pleasant, painterly 3D space that rewards slow exploration and long watching.

## Goals

- Free first-person movement within the yard and around the cabin exterior.
- The place still reads as an oil painting, from any spot the visitor can reach.
- Everything that lives today keeps living, driven by the same shared server state: sky, sun, moon, stars, clouds, wind in foliage, rain and drying traces, cottage lights, casement and smoke, the bird, lake ripples.
- The visitor's position and gaze are remembered in their browser and restored on return.
- A first-time visitor arrives at the original painting's viewpoint.

## Non-goals (this piece of work)

- The cabin interior. Doors and windows are not enterable. **(call)**
- Walking beyond the yard: the far shore, hills and open lake are backdrop.
- Seeing other visitors, or any per-visitor state on the server.
- Spatial audio; the existing synthesized ambience is unchanged. **(call)**
- Seasonal change, new scenes, VR.

## Anti-goals

- Game feel: no HUD, crosshair, objectives, jumping, head-bob, or pointer capture by default.
- A clean CG or photoreal look. Hard polygon silhouettes and smooth plastic shading count as failure even if navigation works.
- Any change that makes two visitors' worlds disagree. Where the viewer stands must never affect world state.

## Constraints found in the project

- Today the scene is a 1672 × 941 painting pair drawn on one WebGL quad (`public/painting.js`), with optional layers for sky, foliage, weather and cottage. There is no 3D geometry.
- Every living element is authored in native painting pixels: `shared/lakeside-bird.js`, `-foliage.js`, `-cottage.js`, `-weather.js`, `-coincidences.js`.
- The sky is already a real coordinate system (`shared/celestial.js`: x east, y north, z up) projected through one fixed camera (`shared/celestial-projection.js`: facing east, 100° horizontal field of view, eye-level at 43% of image height).
- World state, clock, events and field notes (`shared/world.js`, `src/store.js`) do not depend on the viewer.
- The project has no third-party runtime code, no build step, and serves plain ES modules. Node tests cover pure modules; optional Playwright scripts cover the browser.
- The working renderer targets low-power GPUs, caps device pixel ratio at 1.6, and falls back to the static painting when WebGL is unavailable.

## Approaches considered

1. **Modelled scene with painted surfaces — chosen by the owner.** Real geometry for ground, lake, cabin and oak trunk; leaves, grass, reeds and far hills as brushed cards; a painterly pass over the frame. Full freedom of movement, and all living systems keep working. Cost: the original painting is not reproduced stroke for stroke; the look has to be re-earned.
2. **Painting projected onto estimated depth.** Keeps the exact painting but tears after a few steps. A parallax effect, not a navigable place.
3. **Generated 3D capture (Gaussian splat).** Closest to the painting when still, but a frozen snapshot: relighting, moving foliage, window light and bird occlusion all fight it, and it smears away from the source view.

Approach 1 was picked because the living world is the point, and it is the only option where finding your own spot and watching holds up.

## Design

### Space

- A new shared module (suggested `shared/lakeside-space.js`) is the single authored description of the place in metres, using the same axes as `celestial.js` (x east, y north, z up). It holds: terrain height function, shoreline, path, cabin footprint and openings, oak trunk and limb positions, walkable boundary, colliders, the arrival pose, and 3D anchors for the bird (nest, perches, shelter, flight curves), windows and casement, wet patches, puddle, drips, and the three ripple spots.
- Anchor and route ids match the existing 2D ones exactly, so server state needs no change. Confirmed in the code: persisted state refers to places only by id (`locationId`, `routeId`, room names, scalar wetness values), never by pixel.
- Validation pins `routeVersion` and `layoutVersion` to the 2D layouts' `version: 1`. The 3D layout must not bump those versions.
- Three things have no ids today and get 3D equivalents authored by the builder: the nest-building forage flight (a hard-coded spline in `birdPose`, `shared/world.js`), and the client-only distant birds and reeds in `public/painting.js`.
- The layout is derived from the painting: from the arrival pose, the cabin, door, oak, path and near shoreline sit in recognisably the same arrangement as in the painting. This is judged by eye against an overlay, not a pixel match. **(call)**
- **The sky stays true; the painting's lake does not.** The painting is not perspective-correct: its far shore sits about 10° below the sky camera's horizon, which no level lake seen from walking height can do. The 3D place keeps the real horizon and the existing sky camera bearing and field of view, so the sun and moon rise at the same moment in the 3D place and the 2D painting. The cost is that the lake and far shore ride higher in the frame at the arrival view than in the painting. Standing the arrival pose on a gentle rise above the water recovers a little of the painting's downward look. No tilted dome or non-level backdrop. **(call)**
- The existing 2D pixel layouts stay untouched for the fallback painting.
- **What the painting never shows** (decided by the owner): the yard's unseen sides are enclosed by a low stone wall with woodland beyond, built from the existing textures. The cabin gets a plain back wall with one small window, unlit and outside the cottage routine. The existing clear-sky plates and cloud layers wrap the full dome. No lane, gate or garden.

### Rendering

- three.js, pinned to one version and vendored as a static file under `public/vendor/`, no build step, licence recorded. This is the project's first third-party runtime code. **(call)**
- New code lives in its own modules (suggested `public/space/`), not inside `painting.js`.
- Geometry is authored in code: a heightfield yard, a lake plane, a cabin built from simple walls and roof planes, a swept oak trunk and limbs, and many alpha-brushed cards for leaves, grass, reeds and far hills. No modelling tool or model files in the first version. **(call)**
- Painted look, in three parts:
  - surfaces textured from the existing artwork (stone, slate, bark, grass, earth, water, the clear-sky plates and cloud atlas) plus procedural brush variation;
  - silhouettes broken by brushed cards, so no straight polygon edge meets the sky;
  - a full-frame painterly pass (an edge-preserving smoothing filter plus linen grain).
- New generated art is not required for the first version. If the reused textures prove too coarse, new plates are requested from the owner, following the provenance practice in `ARTWORK.md`. **(call)**
- Light is soft and authored, as in the painting: ambient and one gentle directional term blended by the existing day/night value, aimed along the sun or moon. No cast shadows at first. **(call)**

### The living world in 3D

Each system keeps its existing shared sampling function and gets a new 3D presentation.

| System | Presentation |
|---|---|
| Sun, moon, stars | Drawn on a sky dome from `celestial.js` directions directly; hills and oak hide them by real depth |
| Clouds | The two existing cloud layers on the dome, from `sky.js` state |
| Wind | `sampleFoliage` drives sway of the oak and grass cards; the ten authored patches keep their ids |
| Rain and traces | Rain near the viewer; path darkening, shore stone, puddle and oak drips at their 3D anchors |
| Cottage | Two window glows, a hinged casement, smoke puffs from `smokePuffs` at the chimney |
| Bird | The existing bird placed and flown along 3D curves with the same ids and durations |
| Ripples | Rings on the lake surface at the three fixed spots |

Light studies, local pause, field notes, sound, and scene descriptions keep working. Reduced motion keeps its current meaning for the world; the visitor's own movement is still allowed but without eased glides.

### Moving

- W A S D and the arrow keys walk; dragging with the mouse looks around. No pointer capture. Q and E turn, so the keyboard alone is enough. **(call)**
- A slow walk, about 1.4 m/s, at a fixed eye height of 1.6 m following the ground. Shift walks a little faster. **(call)**
- The visitor cannot pass through the cabin walls or the oak trunk, or walk into the lake past the water's edge. They slide along obstacles. The yard boundary slows them gently to a stop; there is no visible wall.
- Keys are ignored while a dialog or text field has focus.
- One quiet control returns to the arrival view with a slow glide.
- Touch: drag to look and tap the ground to walk there. This comes in the last phase. **(call)**

### Remembered place

- Stored in the browser's local storage beside the existing visit memory, under its own key, as a small versioned record: position, heading, pitch, time saved.
- Written when the visitor has been still for a few seconds and when the page is hidden.
- On load the record is validated (finite, inside the walkable area, right version). Anything invalid is ignored and the visitor arrives at the painting's viewpoint.
- The existing **Forget visit memory** button also clears it, and its wording is updated to say so.
- Nothing about position is sent to the server.

### Fallback and rollout

- The current 2D living painting is left working and untouched. **(call)**
- The 3D place is built alongside it behind a URL switch, and becomes the default only after the owner judges the look good enough.
- If WebGL or the 3D setup fails, or the GPU context is lost and cannot be restored, the page shows the existing painting.
- Phones and weak GPUs are in scope once 3D is the default. The painted look must hold in the surfaces and cards alone; the full-frame painterly pass is an enhancement that may run at lower resolution or switch off. A device that still cannot hold about 20 fps gets the 2D living painting. A phone measurement is part of the phase 4 gate. **(call)**
- The server already serves `.js` under `public/` and sets no content security policy, so the new files need no server change.

### Phases

1. **Walkable blockout.** Space module, terrain, lake, cabin block, trunk, sky dome with live sun, moon, clouds and day/night, walking, bounds, remembered place. Behind the switch.
2. **The painted look.** Textures, foliage and grass cards, hills, painterly pass, arrival view matched to the painting. Owner review: is it beautiful enough to continue?
3. **Life.** Wind, cottage, bird, rain and traces, ripples.
4. **Becoming the default.** Touch, accessibility descriptions, performance pass, README, `ARTWORK.md` and `DESIGN.md` updates (the "each scene has an authored camera" assumption changes).

### Checks

- Node tests for the pure parts: space layout validity, bounds and sliding, place-memory validation, 3D bird routes agreeing with existing ids and durations.
- An optional Playwright script in the style of the existing `scripts/check-*-browser.mjs`, with captures under `docs/space-validation/`.
- New modules added to `npm run check`.
- Performance target: the existing 30 fps cap held on an integrated laptop GPU at the current pixel-ratio cap. **(call)**

## Left to the builder

- The three.js version, file layout and module boundaries.
- Exact dimensions of the yard, cabin and oak, and the walkable boundary shape.
- The painterly filter's algorithm and resolution.
- Card counts, texture sizes and how textures are cut from existing artwork.
- Storage key name, write timing, and the URL switch's name.
