# The living yard (phase 3) — design

Parent design: [2026-11-15-navigable-yard-design.md](2026-11-15-navigable-yard-design.md). Phase 2: [2026-11-16-painted-look-design.md](2026-11-16-painted-look-design.md).

Lines marked **(call)** are the builder's proposals, not the owner's decisions. The owner should check those while reading.

## Intent

The walkable yard is painted but still. Everything that lives in the 2D painting should live in the yard too, from the same shared world, so that a visitor who has found a favourite spot can stop and watch: wind moving through the oak and the grass, a light coming on in the cottage, smoke from the chimney, the bird going about its day, rain passing and the path drying, a fish rising on the lake.

The owner walked the phase 2 yard and had no complaints ("renders nicely, animates cleanly"). Phase 3 builds on the yard as it stands; nothing in the phase 2 look is reopened.

## What the owner has decided

- **Each system is rebuilt as a real 3D thing**, not the 2D layers stood up as flat pictures. It has to hold up from anywhere a visitor can stand, including under the nest and beside a lit window.
- The phase 2 look is accepted as the base.

## Goals

- Wind, cottage (two window lights, casement, hearth smoke), bird and nest, rain with its wet traces and drips, and lake ripples are all present in the `?space=1` view.
- Each is driven by the existing shared sampler and the same server snapshot as the 2D page. At the same moment, two visitors, and the 2D page beside the 3D one, agree on every shared fact: which windows are lit, where the bird is and where it is going, whether the hearth is burning, how wet the path is, whether a fish is rising and where.
- Each holds up at close range and from every side a visitor can reach.
- Sound, scene descriptions, the bird and cottage details in the about dialog, field notes, pause, light studies and reduced motion behave in the yard as they do on the painting.

## Non-goals

- Positional sound (louder near the water, the bird's call coming from the oak). Sound stays as it is. A later piece of its own. **(call)**
- Touch walking, accessibility descriptions of what the visitor is looking at, the 2D fallback below 20 fps, making 3D the default. Phase 4.
- New world behaviour or server state: no new bird habits, no new cottage routine, no rain rings on the lake, no cast shadows, no cabin interior, no opening door. **(call)**
- "Keep this view" in the yard. Still hidden.
- Reworking phase 2's weak spots (woods ends, lake colour, dusk warmth).

## Anti-goals

- Anything the visitor does changing the world. The bird never flees or notices; nothing can be touched. Where a visitor stands is never sent anywhere.
- Shared facts that differ between visitors or between the 2D and 3D pages.
- A busy scene. The painting's motion is quiet and so is this: most of the time the yard is nearly still, with a breath of wind.
- Any difference in the default 2D page, including what it downloads.
- Flat pictures that turn to face the visitor, for anything a visitor can walk up to.

## Constraints found in the project

- The samplers already exist and are pure: `sampleFoliage` (`shared/foliage.js`), `sampleCottage` and `smokePuffs` (`shared/cottage.js`), `sampleBird` (`shared/bird.js`) and the nest-building `birdPose` (`shared/world.js`), `sampleSurface` and `dripPose` (`shared/surface-weather.js`), `sampleCoincidence` (`shared/coincidences.js`). Only their placement is 2D: every anchor in the `shared/lakeside-*.js` layouts is in painting pixels.
- Saved world state refers to places only by id: bird `locationId` and `routeId`, room names `main` and `second`, ripple `locationId`, scalar wetness values, `nest.materials` (0 to 12). The 2D layouts' `version: 1` values are pinned by validation and must not change.
- `SpaceView.render(snapshot, now, study)` already receives the full snapshot and the study, and already keeps the frozen motion clock for reduced motion. It currently reports `birdRenderer.valid`, `birdActive`, `cottageActive` and `coincidenceActive` as false; `public/app.js` passes those to sound and to the scene description.
- How the painting treats studies, pause and reduced motion is in `Painting.render` (`public/painting.js`): a study uses `cottageFixture(study)` and `surfaceFixture(study)`, omits the bird, the smoke and the distant birds; reduced motion omits smoke, reeds, distant birds and drips, settles the bird and snaps the casement.
- The yard's cards are merged, fixed geometry drawn with one alpha-tested Lambert material (`cardMaterial` in `public/space/geometry.js`); grass is about 8,000 cards. The ground and the lake have their own shader hooks (`public/space/scene/ground.js`). Windows are named panels `window-front-left`, `window-front-right`, `window-back` sharing one material (`public/space/scene/cabin.js`). The oak is described as named limbs and clumps by `oakPlan` (`shared/lakeside-dressing.js`).
- Phase 2 rule: cards are alpha-tested, never blended. Smoke, rain, the puddle's edge and window glow need blending; they are few, small and drawn after the solid scene. **(call)**
- The default page must not load three.js or anything under `public/space/`. No build step; three.js 0.170.0 is the only third-party runtime code.

## Approaches

1. **Each system rebuilt as a real 3D thing — chosen by the owner.** Every system keeps its sampler and gets a small 3D presenter, placed by new 3D anchors that reuse the existing ids. Holds from anywhere. Most work; the bird is the largest piece.
2. **The 2D layers stood up in the yard** as flat pictures at the right spots. Quick, and identical to the painting from the arrival view, but the art is about 60 pixels across and made for one distant viewpoint: blurry and flat up close, and the bird would turn to face the walker.
3. **A mix**: flat for what is far, 3D for what can be approached. Saves little, because the water's edge and the ground under the drips can be reached too.

## Design

### One layout for life in 3D

A new shared module, suggested `shared/lakeside-life.js`, holds every 3D anchor in metres (x east, y north, z up), keyed by the existing ids. It has a validator and a Node test, like the other layouts.

- Anchors that sit on something are **derived from that thing**, not typed as numbers: perches from `oakPlan` limbs and the cabin's ridge, windows and chimney from the dressing's cabin data, drips from named low oak clumps. If the oak or cabin is retuned, life moves with it. **(call)**
- The 2D layouts are not touched.
- Nothing saved refers to the ten foliage patch ids, so they get no 3D counterpart; in the yard all foliage moves (see Wind). This replaces the parent design's line that the patches "keep their ids". **(call)**

### Presenters

New code lives under `public/space/life/`, one module per system, behind one entry point that `SpaceView` calls each frame with the snapshot, the displayed time, the conditions, the motion clock, whether motion is allowed, the study, and the camera. Each presenter builds its objects once and updates them in place.

- A presenter that throws is dropped for the life of the page and the rest carry on; the yard never falls back to the painting because one living thing failed. Its flag then reports it as unavailable, as the painting's optional layers do. **(call)**
- `SpaceView` reports real values for `birdRenderer.valid`, `birdActive`, `cottageActive` and `coincidenceActive`, so sound and descriptions work with no change to `app.js` beyond what that needs.
- Life is the same on all three tiers.

### Wind

- **One wind bearing: the wind blows toward the south** (from the left to the right of the arrival view). This is the direction the painting already implies: its smoke drifts to screen right and its gusts reach the right of the frame later. Gust travel, smoke drift and rain slant all use it. The clouds on the dome wrap the sky and are left as they are. **(call)**
- All card foliage sways: the oak's clumps, ground grass, reeds, flowers, the shrubs at the cabin, and, at a reduced amount, the woods and grove. Hills do not.
- Sway is computed in the card material's vertex shader from the same formula as `sampleFoliage` (mean bend, travelling gust, slow sway, settling, leaf flutter), with the card's world position standing in for the pixel position in the gust delay, so gusts visibly cross the yard. Strength comes from `sampleWind` at the motion clock.
- Each card vertex carries a weight (0 where it is rooted or attached, 1 at its free tip) and each card a stable random phase. Roots and attachment points never move.
- Clock values are prepared in JavaScript and passed as phases, so the shader never sees large time values and motion stays smooth after days of uptime.
- Each kind of card (grass, reed, flower, oak leaf, shrub, woods) has its own type, exposure and largest movement in a small table in the layout, defined by the builder. **(call)**
- Amounts are a starting point for the owner's eye: grass tips move up to about a tenth of the blade's height in a full gust; leaf clumps bend a few centimetres with a faster, smaller flutter. In the 2D painting the motion is subtle and it should be here. **(call)**
- Reduced motion: the motion clock is already frozen, so foliage holds still.

### Cottage

- **Rooms.** `main` is the front-left window, `second` the front-right, matching the painting. The back window is never lit (parent design).
- **Window light.** Each front window gets its own material and a lit version of the window panel, painted by the existing painter as one new panel in the art bundle (warm glass, dark glazing bars). The pane blends from dark to lit by the sampler's value for that room and glows by its own light, so it reads at night and is barely visible by day.
- **Light on the yard.** Each lit window also lays a soft warm light on the wall reveal, the ground and the grass outside. Its strength is the room's value times the darkness of the displayed moment (one minus the calendar's `light`, so a night or dusk study shows it and a day study does not). Built as one small short-range light per front window, two in all, always present in the scene and set to zero when unlit, so shaders never recompile. If the yard then no longer settles on the full tier on the builder's machine, or the frame at the arrival pose costs more than 2 ms extra, a painted glow on the ground replaces them. **(call)**
- **Casement.** The left leaf of the `main` window is its own thin two-sided pane, hinged on its outer edge, swinging outward by the sampler's `open` value. Behind it the opening shows the room: dark, or lit.
- **Smoke.** `smokePuffs` already gives each puff's age and wind drift. A small shared function maps a puff into the yard: it leaves the chimney top, rises several metres over its life, drifts along the wind bearing by the same integrated wind, and grows from about a quarter of a metre to about a metre. Puffs are soft round shapes that face the viewer (they are round, so this does not read as turning), blended, very faint, tinted by the light. `smokePuffs` gains an `age` field; its existing values do not change. **(call)**

### Rain and its traces

- **Rain.** Thin blended streaks in a volume that travels with the visitor, count and opacity by rain strength as in the painting, falling fast and slanted along the wind bearing by wind strength. Streak positions are local to each visitor, as they are in 2D, and run on the displayed motion clock as in 2D, so they hold still when the view is paused.
- **Shelter.** No streaks under the cabin's roof and eaves; under the oak's crown they thin to about a third, and the drips take over. A visitor can stand dry under the eave and watch. **(call)**
- **Path.** The whole earth path darkens and cools with `pathWetness`, through the ground material. **(call: the painting darkens only its lower path because that is all it shows.)**
- **Shore stones.** The stony shore band darkens with `stoneWetness`.
- **Puddle.** One shallow puddle at a fixed spot on the path a few metres ahead of the arrival view, where the painting has it: a small irregular patch just above the ground, showing the sky's colour like the lake, growing and fading with `puddleStorage`.
- **Drips.** The two drip sources sit under two named low clumps of the oak. `dripPose` decides when each falls, exactly as now; in the yard a drop falls about two metres to the ground in the same 0.65 s.
- Under a rain study the fixtures drive the same surfaces.

### Ripples

- The three ripple locations (`shore-reflection`, `open-water`, `near-water`) get positions on the lake, each in open water clear of the shore and reeds and inside the arrival view, in the same left-to-right order as in the painting, with a radius of about two metres.
- The rings are drawn by the lake's own material: the 2D ring rule (three rings spreading from the centre, broken into arcs, fading with age) is added to the lake shader, bending the lake's strokes and lifting their light along each ring. One ripple at a time, as the world allows.

### Bird and nest

- **The bird is a small painted model**, about 18 cm long: body, head, beak, tail, two wings that beat from the sampler's wing phase, legs when perched, a twig in the beak when carrying. Colours are the 2D bird's. It is lit by the yard's light and hidden by real depth; the 2D bark outline used to hide it is not needed.
- **Places.** `nest` in a fork of the oak on the side facing the arrival view; `oak-perch` on a limb; `oak-shelter` close in against the far side of the trunk under dense leaves (see below); `roof-perch` on the cabin's ridge. Each has a facing for the perched bird.
- **The sheltering bird can be found (decided by the owner).** In the painting the bird is not drawn while it shelters. In the yard it really sits at `oak-shelter`, hidden from the arrival view by the trunk itself, and a visitor who walks round the oak finds it there. The layout test checks that the trunk hides the shelter from the arrival pose. The description ("resting out of sight behind the oak") and the sound's rules are unchanged; the 2D `hidden` value is not used in the yard.
- **Routes.** Exactly the six route ids in `LAKESIDE_BIRD.routes`, with the same durations (4, 6 and 9 seconds), as 3D curves between those places, travelled with the same eased progress as in 2D so the bird is the same fraction of the way along at the same instant. A flying bird faces along its path; the 2D `direction` value is not used in the yard. Curves clear the trunk, the roof and the ground.
- **Nest building.** The out-and-back forage flight (down to the bank, a pause on the ground, back with a strand) becomes a 3D curve with the same timing split.
- **One source of truth for progress.** The timing in `sampleBird` and `birdPose` is exposed as a small shared "where along which path" result that both the 2D sampler and the 3D placement use, so the two cannot drift. `sampleBird`'s existing output does not change. **(call)**
- **Nest.** A small bowl of twig strokes at the nest place that fills in with `nest.materials`.
- **Rules carried over.** No bird in a light study. During nest building the bird is not shown at night. Reduced motion: the bird sits at its settled place.
- **Distant birds.** The painting's three far birds that cross the sky now and then (local to each visitor, daylight only, not in studies or reduced motion) cross the far sky over the lake on the same schedule and the same displayed clock, drawn on the sky dome.

### Studies, pause, reduced motion

Matched to `Painting.render` case by case (see Constraints). Pause freezes the world while the visitor can still walk through the held moment.

### Art

One new panel (the lit window) is added to the existing bundle by the existing export script, recorded in `export.json` and `ARTWORK.md`, within the existing size budget. The bird is coloured in code; smoke, rain and ripples need no art.

### Order of work

Wind, cottage, rain and traces, ripples, then the bird. Each is complete and viewable before the next starts, and the yard stays shippable behind its switch throughout.

### Checks

- **Layout test (Node):** every 2D id has a 3D anchor; route ids and durations equal the 2D ones; perches lie on their limb or ridge; ripple spots are in open water, inside the arrival view and in the painting's left-to-right order; routes stay above the ground and outside the trunk and roof; nothing is inside a collider.
- **Parity tests (Node):** the shared bird progress reproduces `sampleBird` and `birdPose` exactly; smoke mapping is a pure function of a puff; the wind's JavaScript twin of the shader formula gives the same bend and flutter as `sampleFoliage` for a patch of the same type, exposure and largest movement at the same gust delay.
- **Existing tests keep passing unchanged**, including everything about the 2D samplers.
- **Browser check** (`scripts/check-space-browser.mjs`), using fixtures injected through the existing `check` hook: lit front windows are warmer and brighter than the wall at night and the back window stays dark; the casement fixture changes the window; foliage differs between two frames with motion on and is identical with reduced motion; the rain study darkens the path and shows streaks in the open but none under the eave; a ripple fixture changes the lake at its spot; the bird is drawn at each place and mid-route; a study omits the bird; the default page still requests nothing from the yard. The existing night-window check changes from "dark" to this.
- **Frame cost:** recorded per tier at the arrival pose as in phase 2. The yard must still settle on the full tier on the builder's machine, and the added cost is stated. No phone measurement in this phase.
- **Owner's review:** captures of each system from near and far (lit windows at night from the path and from beside them, the casement open, smoke, rain from under the eave, the wet path and puddle, a ripple, the bird at each place and in flight, the nest part-built and complete) join `docs/space-validation/`. The owner's walk is the acceptance test.

## Left to the builder

- File and module boundaries under `public/space/life/` and the exact shape of the layout module.
- Exact anchor positions, curve control points, the puddle's outline and the ripple spots, placed by eye against the painting from the arrival view.
- Sway amounts, smoke rise and size, rain speed and count, glow colour and reach, tuned by eye and kept quiet.
- How the bird model is built and how its wings are hinged.
- How fixtures are injected for the browser check.
