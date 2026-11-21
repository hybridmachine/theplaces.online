# Cabin interior, part 3: light — design

Status: built behind `?interior=1`, awaiting owner review; run only on desktop Chromium on one Mac.

This is part 3 of `2026-11-17-cabin-interior-design.md` (the parent). The parent's intent, goals, non-goals and anti-goals still hold, and its "Light" section is the brief; this document settles what that section left open and records two changes to it. Part 2 (`2026-11-17-cabin-interior-part-2-windows-design.md`) is built and merged.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction.

## Intent

The house is lit the way the painting would light it. By day the rooms take the sky's light through their windows, brightest by the glass and cooler under cloud. After dusk the lamps and the fire take over, warm and uneven, following the resident no visitor ever meets. At any hour a visitor can read each room and find the way out. Why now: the shell is the same flat brightness at noon and midnight, so the live windows show a night yard from a day-bright room.

## Goals

- Rooms brighten and cool with the world's daylight, dim under overcast, and are brightest near their windows. Windowless rooms borrow a weaker share through their doorways.
- Lamps and fire follow shared state and the clock only, by the parent's rules (restated below).
- The light has sources to come from: the living room's stone fireplace with its fire and embers, and one simple lamp fitting in every room. **(owner's decision, changing the parent's order: these were listed under furnishing)**
- No room is ever too dark to find the way out of.
- The cost of a frame indoors does not grow with the number of rooms lit.
- Still behind `?interior=1`.

## Non-goals

- Furniture, and the table, desk and bedside lamps that sit on it (part 4).
- Cast shadows of any kind, including the visitor's own. **(call)**
- Shafts or patches of direct sun on floors and walls. Daylight is soft sky light only. **(call)**
- Anything the visitor can switch, light or put out.
- New light falling on the yard from the cabin, beyond the two window glows that exist. **(call)**
- Any server, world-state or persisted-state change. No new art files.
- Sound (the fire is silent in this part). **(call)**

## Anti-goals

- Two visitors seeing different lamps or a different fire at the same moment.
- A lit room brightening the far side of its own walls.
- A dark house: any standable spot from which the way on cannot be seen.
- Evenly lit rooms, which the parent already counts as failure.
- A lamp or a fire that pops on or off in one frame.
- Flicker for a visitor who has asked for reduced motion.

## Constraints found in the project

- The interior scene (`public/space/interior/index.js`) is lit by one constant `HemisphereLight`; plaster also has a constant emissive base. Its surfaces are sheets cut every 0.4 m with a per-vertex tint (`sheet` in `public/space/geometry.js`), drawn with `MeshLambertMaterial` over the `hills` brush texture.
- The world's cottage (`shared/cottage.js`) carries `rooms.main` and `rooms.second` (booleans, with `lastLightAt` for each), a pending action that fades a light between 0 and 1, `casement`, and `hearth: {on, since, lastBurn}`. `sampleCottage` gives `{main, second, open}` as 0–1; nothing yet samples the hearth for drawing except the smoke (`smokePuffs`).
- `calendar.light` is the world's daylight, 0–1; the yard takes night as `1 − calendar.light` (`shared/sky.js`, `life/cottage.js`). Weather gives `cloud` and overcast (`lightLevels` in `public/space/space-view.js`). The sky's zenith and horizon colours reach the interior each frame through `setSky`.
- The path lights (`public/space/scene/lights.js`) use no light sources: an emitted lamp, an added halo, a pool on the ground.
- From the yard the open doorway is one flat dark tone (`DOORWAY` in `public/space/scene/cabin.js`); the parent says it should be warm when the hall lamp is lit.
- `inSight` and `wallSegments` (`shared/window-views.js`, `shared/interior.js`) already answer "is there a wall between these two points on this floor".
- The walking rules know walls, openings, the stair and one obstacle, the open door leaf (`doorLeaf`). There is no general obstacle yet.
- The scene description names the room the visitor is in (`public/scene-description.js`).
- Studies (`cottageFixture`) fix the room lights for `night`, `dusk` and `open`; they say nothing of the hearth.
- The speed check requires a frame in the living room facing its window to cost at most 1.1 times a yard frame.

## Approaches considered

1. **Painted-in light — chosen by the owner.** When the house is built, every patch of every surface is given fixed weights: how much daylight reaches it, how much its room's lamp gives it, how much the fire does. Each frame only a few dials move. No light sources, flat cost, no leaking through walls. Light is only as fine as the patches, and nothing casts a moving shadow.
2. **Real lights.** A light source per lit room and one at the fire. Simple, and furniture is lit for free, but without shadows they shine through walls, and every surface pays for every lamp each frame.
3. **Painted-in light plus one real light for the fire.** A livelier fire, for some leaking and a real light's cost across the whole house.

The owner picked 1.

## Design

### The light a surface takes

Every vertex of every interior surface (walls, floors, ceilings, stair, rail, window frames and bars, the leaves, the fireplace, the fittings' own unlit parts) carries four weights, each 0–1, worked out once when the interior is built:

- **day**: the sky's light through glass. From each pane on that floor that the point can see past the interior walls, a share that falls with distance from the pane and with how squarely the surface faces it; summed and capped. A point that sees no pane takes a weaker borrowed share from the nearest doorway that does. The front doorway counts as a pane only in the hall's weights, at half strength, since the door is usually shut. **(call)**
- **lamp**: the room's own fitting. Falls with distance from the fitting and with facing; a point takes light only from fittings of the room it belongs to, and a doorway's reveal takes the brighter of its two rooms. **(call)**
- **fire**: the living room's hearth, falling with distance from the fire's mouth and with facing, reaching points that can see the mouth past the walls, so a little reaches the hall through the wide opening. Zero on the upper floor.
- **room**: which room the vertex belongs to, so each room's lamp can be dialled on its own.

These come from one pure function of the blueprint, in `shared/`, with Node tests: given a floor, a point and the way its surface faces, it returns the weights. Part 4 will call the same function to light furniture. **(call)**

### The dials

Each frame a pure function of shared state and the clock gives:

- **Daylight**: its strength from `calendar.light` and the overcast, its colour from the sky's own colours that frame (cooler and greyer under cloud, warm at dusk and dawn as the sky is).
- **Night fill**: a dim blue everywhere, strongest when daylight is gone, so nothing is black.
- **Dark and awake**, the two things the lamps go by:
  - *dark* is the path lights' own level (`pathLightLevel`, from the sun's height): 0 by day, rising smoothly to 1 through dusk. Indoors and out, lamps answer the same dusk. **(call)**
  - the house is *awake* while at least one of `main` and `second` is lit. It woke at the earlier `lastLightAt` of the lights now lit, and fell asleep at the later `lastLightAt` of the two once both are out; a second light coming on does not wake it again. **(call)**
- **Each room's lamp**, 0–1:
  - living room: the world's `main` light, with its fade;
  - study: the world's `second` light, with its fade;
  - hall and landing: the night lamp, following *dark* at a low level, and at full level while the house is also awake; **(call)**
  - every other room: lit by *dark* and *awake* together. Each room answers the dusk at its own point, a threshold on *dark* fixed per room from a seed (between 0.3 and 0.9), and answers the house waking or falling asleep after its own delay, fixed per room from the seed (between 5 and 90 seconds), with a fade of about 2 seconds. Both are read from shared state and the clock alone, with nothing to solve for, so every visitor sees the same room light at the same moment, and one who arrives later sees it already lit. **(call)**
- **The fire**, 0–1, and its embers:
  - burning while `hearth.on`, rising over about 20 seconds from `hearth.since`;
  - after it goes out (`lastBurn.end`), embers glow and die away over about 30 minutes; with no `lastBurn` the hearth is cold; **(call)**
  - a flicker of a few per cent on the fire's light, from the world's clock so it is the same for every visitor; steady under reduced motion.
- With a study selected, daylight, night fill and *dark* come from the study's own hour and weather; the room lights are the study's fixture as today, the house is awake if the fixture lights either room, every delay and fade is taken as finished (the settled picture), and the fire burns in the `night` and `dusk` studies and is cold otherwise. **(call)**

### Never dark

With every lamp out at midnight under full overcast, every standable spot on both floors still takes enough light that walls, floor and doorways can be told apart on a dim screen. The night fill and the hall and landing lamps guarantee it; a Node test asserts a floor under the summed light at every standable grid point, and browser captures show it.

### How it is drawn

- The interior's surfaces stop using real light sources. Their colour is their painted tint and brushwork times the sum of the dials times the weights. The builder decides whether that is a patch to the existing materials or a small material of its own. **(call)**
- The painterly pass runs over the result unchanged, and the live windows are untouched: glass still adds nothing.
- The same on every tier.

### The fireplace

- On the living room's gable wall (a = 0), centred at d = 3.5, where the parent puts it. The cabin's outside stack stands at that same gable end but on the ridge, which the doubled interior would put near d = 6; the two are deliberately not lined up, as nothing else about this cabin's inside and outside is. **(call)** The fireplace: a stone chimney breast 2.0 m wide standing 0.5 m into the room up to the ceiling, an opening 1.1 m wide and 0.9 m high, a stone hearth slab reaching 0.5 m further into the room at floor level, and a timber mantel shelf above the opening. Stone as the cabin's outside walls are painted, from the existing surfaces. **(call)**
- In the mouth: a bed of embers and a few flame shapes. The flames show only while the fire burns, and sway from the world's clock (still under reduced motion); the embers' glow follows the ember dial. They are emitted, as the path lamps are, with a soft added glow; they are not light sources.
- The breast continues plain through bedroom 2 above (1.2 m wide, 0.4 m deep), with no fireplace. **(call)**
- The breast is solid on both floors: the walking rules gain rectangular obstacles (the door leaf stays as it is), kept clear of by the eye's usual 0.25 m. The hearth slab is not an obstacle; it is walked over. A remembered place inside a breast falls back as usual. **(call)**

### The fittings

- One per room, placed in the blueprint. **(call)**:
  - a hanging lamp from the ceiling (a short rod, a shade, a glass) in the living room, study, kitchen, dining room, master bedroom, bedrooms 2 and 3, the sky room and the library nook, hung clear of a walking head (lowest point at least 2.0 m above the floor) and of the roof windows;
  - a wall lamp (a bracket and a glass, about 1.8 m up) in the hall beside the front door, on the landing at the head of the stair, in the closet passage, both baths, the laundry, the pantry, the box room and the linen cupboard.
- The glass is pale by day and, lit, glows warm with a soft halo, as the path lamps do; its brightness follows its room's lamp dial.
- Nothing a fitting is made of stands where a visitor walks, so they need no obstacle.

### From the yard

- The open doorway's flat tone warms with the hall lamp and stays dark with it out, as the parent asks. Since the hall's night lamp burns from dusk to dawn, the doorway is warm every night.
- The front windows' glow and the light they lay on the yard are unchanged; they already follow `main` and `second`.

### The description

- Indoors the scene description says what is lit in the room the visitor stands in: its lamp, and in the living room the fire or its embers. Announced when it changes, as room changes are.

### Speed and failure

- The speed check's limit stays: a frame in the living room facing its window costs at most 1.1 times a yard frame, measured as it is now, by day and again under the `night` study with the lamp and fire lit (the yard measured under the same study). If it is missed, the remedy is to make the lit surfaces cheaper, and then to come back to the owner; the flat fallback below is for failure, not for speed.
- If the lit materials cannot be set up, the interior falls back to its present flat light and carries on, with one warning. **(call)**

### Checks

- Node tests: the weights (brightest by the glass; a point behind a wall takes nothing from that room's window or lamp; a windowless room is dimmer than its neighbour but not dark; the fire reaches the hall through the opening and not the kitchen side of the wall behind it); every dial as a pure function (each lamp rule, the per-room offsets the same on every call, the fire's rise, the embers' fall, no flicker under reduced motion); never dark; the breast stops the walker and the blueprint stays valid; fittings lie inside their rooms and clear of heads and roof windows.
- Browser captures under `docs/interior-validation/`: the living room at noon, under overcast, at dusk with the lamp lit, at night with the fire, and at night with everything out; the hall and stair at night; a windowless room (the master bedroom) by day and lit; the kitchen lit while the dining room beside it shows no light through the wall; the doorway from the yard at night; and one check that two loads at the same world moment draw the same lamps and fire.
- The existing interior checks keep passing, including the windows' and the yard-unchanged check.

## Left to the builder

- Module and file layout, and the names and shapes of the pure functions.
- The falloff curves and strengths, within the rules above, tuned by eye against the captures.
- How the weights are stored and how the surfaces are drawn with them.
- The exact shapes, sizes and colours of the fireplace and the fittings, and each fitting's exact place.
- How the flames and embers are drawn.
- The wording of the description.

## As built

Where the build departs from the design above, or settles what it left open. Constants named here are in `shared/interior-light.js` (`LIGHT`, `DIALS`) as they stand after the final fix wave.

### The dials

- **Each room follows each of the world's two lights on its own**, replacing *awake since*. A room fades toward a light's state from that light's `lastLightAt` plus the room's delay, over `DIALS.fade` (2 s), and takes the greater of its two follows. This relies on the cottage never changing one light twice within `LIGHT_REST_MS` (180 s), longer than the longest delay and fade (92 s), so each follow finishes before that light can change again and the greater-of never jumps. A light off since the cottage's `introducedAt` was never lit.
- **The fire rises over `DIALS.fireRise` (20 s) and falls over `DIALS.fireFall` (25 s)** from the level it had reached when it went out (a fire put out mid-rise does not jump up). **Its embers die over `DIALS.emberFall` (30 minutes) from the moment the hearth went out.** Both count from `hearth.since`, not `lastBurn.end`: the world clears `lastBurn` at the first decision more than 64 s after a burn ends, long before the embers are cold. A hearth whose `since` is the cottage's `introducedAt` never burned and is cold.
- **Daylight's colour is the sky's mixed toward a warm white**: the mean of the frame's zenith and horizon, normalised and mixed `dayMix` (0.6) of the way to `dayWhite` [1, 0.91, 0.76], then scaled to `DIALS.day` (2.3) × `calendar.light` × (1 − 0.35 × overcast). So plaster keeps its cream by day and still cools under a cold sky. The night fill is `fill` [0.12, 0.155, 0.26] × `night` (0.35), at least 0.3 of it by day.
- The hall and landing lamps burn at `hallLow` (0.35) from dusk to dawn and fully while either light of the house is on.

### The light a surface takes

- **Daylight** (`LIGHT.day`): from each pane in plan sight, `face` (0.4) whichever way the surface faces and the rest as it faces the pane, falling to a tenth at `reach` (10 m); the front door counts in the hall's weights only, at `door` (0.5); summed, capped at `cap` (0.55), never under `floor` (0.1), which it nears softly (the two taken as the sides of a right angle), so the little a far room takes still falls from its doorway to its far wall. **Borrowed daylight goes on from room to room, like for like**: an opening's share is the daylight the neighbour itself takes just inside it, on its floor (for a floor or ceiling beyond) or 1.5 m up on a surface looking on into the neighbour (for a wall beyond that faces the opening), from the panes or borrowed in its turn through the neighbour's other openings, settled for the whole house at build time. A point takes that share times `borrow` (1.25), falling over `through` (14 m) from the opening and **weighted by facing** the light as it comes down through the opening from `behind` (2 m) past its head (the floor and the far wall take it, a jamb or head in the doorway takes little, and `aside` (0.2) whichever way), and never more than `keep` (0.92) of it. So no floor beyond a doorway is brighter than the floor the light crossed to reach it, and a room two or more rooms from any pane (the passage, the ground bath, laundry, pantry, master bedroom, upper bath and linen) is brighter toward the doorway its light comes through than at its far wall. (The first form of this, a fixed `hop` of the best share at the neighbour's other openings, left six of those rooms brighter inside their doorway than the room outside it; fixed after the last review.) Every opening of the room counts; the best one gives the light.
- **Lamp light passes through openings, never through walls**, replacing "a point takes light only from fittings of the room it belongs to". A point takes its own room's fitting (never under `LIGHT.lamp.floor`, 0.15) and a spill from the fitting of a neighbouring room joined to its own by an opening when the plan line to that fitting crosses no solid wall run: the neighbour's weight by the same distance and facing rule, times `LIGHT.lamp.spill`, the stronger neighbour winning. The fix brief gave 0.7 as the spill; at 0.7 the kitchen-dining floor stepped by 0.124 at the wall line with the kitchen lamp full, over the brief's own 0.1 margin, so it is 0.85 (worst step 0.078). It falls only on a surface facing that fitting (fading in over the first few degrees of turn), so the far face of the wall beside the opening, which looks away from the lamp, takes none even right at the jamb where it could see the lamp past the corner. The floor beside a jamb still shows the edge of the spill blurred over one vertex cell (0.4 m): at the foot of the dining face of the kitchen-dining wall the floor is about 8% brighter with the kitchen lamp lit 0.25 m from the jamb, nothing at the corner. The spill is a second room index and weight per vertex (the `spill` attribute) read against the same `lamps` uniform array, so a frame costs the same however many rooms are lit.
- **Each reveal face takes the room it faces**, weighed in the room on its own side of the wall's centre line; **floors and ceilings are built room by room** and wall faces cut where rooms meet, so no vertex is weighed in the wrong room.
- `lightAt` returns light only, and the one JS sum is `lightSum` (used by `lightAt` and the unlit glasses); the shader's line in `public/space/interior/light.js` is pinned to it by a test that asserts the exact GLSL.

### How it is drawn

- **A patched `MeshBasicMaterial`** (`public/space/interior/light.js`): its diffuse colour (map × vertex tint, plus plaster's pale base, which is surface colour and not light) times the per-vertex sum of the dials and weights, before three's tone mapping, so the painterly pass sees what it always has. Every lit material shares one set of uniforms.
- **The compile check and `fallBack()`**: after the first indoor draw SpaceView reads the lit programs' diagnostics; a program that would not run makes the interior call `fallBack()`, which puts every lit surface (shell, fireplace, fittings' ironwork) back on the flat Lambert materials under one hemisphere light, with one warning. A browser check calls `fallBack()` with a live window and finds the room drawn, `inside.lit` false, the hemisphere light present and the window still live.
- **The glasses' halos, the flames and the fire's glow are drawn after the live views**: they are added light and write no depth, so drawn with the rooms the yard drawn into a live pane afterwards cut them along the pane's edge. They are a scene of their own (`inside.overlay`) drawn, from the visitor's eye, into the same target after the views with the stencil test off and no clear, depth-tested against the rooms so the walls still hide them; through the painterly pass this happens in the pass's `views` hook (`over`, after its `draw`), before the filter. Each draw into the pass's multisampled target is resolved in full at its end by three (about 0.7 ms for depth and about as much for colour at 1440 × 810), so: the overlay is drawn after the views only when some lit part of it (each taken as its bounding sphere's square on screen) lies over a live pane's rectangle, and otherwise it is put back with the rooms and drawn with them; and only the last draw before the filter resolves its depth (the rooms and views resolve colour alone). Without both, the overlay's extra draw took the speed ratio from about 1.03 to 1.10 by day and 1.13 at night. The glasses themselves are opaque and stay with the rooms.
- **Fittings**: an unlit glass is a pale surface, `PALE` times the room's light at the glass (its day, fill, fire and spill, not its own lamp); lit it glows `WARM` and its halo (a ball of radius 0.18 m, opacity 0.55; a wall lamp's ends within 0.24 m of the wall's face, so a walking eye 0.25 m off is never inside it) is scaled by its room's level from a small uniform array.
- **The doorway's tone** (still the weakest of the yard captures: at full the shading by height is faint and it reads mostly as a warm panel): from the yard the open doorway is the dark `DOORWAY` tone warming toward `WARM_DOORWAY` by the hall lamp's level squared (so the low night lamp gives a dim warm tone and full is no brighter than the lit front windows), and, with the interior on only, shaded by height: warmest at the recess floor, darker toward its head, so it reads as a lit space and not a card. Without `?interior=1` it is the one flat tone it always was.

### The description

- A room's lamp counts as lit above 0.15 of full (`LAMP_SEEN`), so the hall's night lamp burning low is lit; the fire counts as burning above 0.05 of its level (`FIRE_SEEN`, by its level, not its flickering light) and its embers as glowing above 0.1.

### Never dark

- Never dark rests on the night fill alone: with every lamp out at midnight under full overcast the darkest standable sample is about 0.091 against the floor `DIALS.floor` (0.07), on 6,261 samples.

### Measured

- Speed (check 50 by day, 63 under the night study; forced frames, 1440 × 810, tier full, headless Chrome through ANGLE on an Apple M1): in two runs after the final fix wave, by day 1.038 and 1.053 times a yard frame, at night 1.053 and 1.016 (limit 1.1). In a pose not checked, at night from [3.8, 5.5] facing the living window with the lit lamp in view (its halo not over the pane, so drawn with the rooms), a probe measured 1.10: the lit interior's margin is thin wherever a lamp is in view.
- A yard frame alone costs about 12.5 ms by day or night. Part 2's figure of about 26 ms for a day yard frame was contention from another page left open and drawing during the measurement; that page is now closed first.
- Interior build (the first `buildInside`): 107 to 110 ms in headless Chrome (81 to 89 ms before the fix wave: weighing every opening for borrowed daylight and the spill costs about 20 ms more); the first indoor draw, where the lit programs compile, about 100 ms.

### Checks

- The browser script has 70 checks. Its cabin-light checks force lights with a check-only fixture (`?check` only): `lamps` (a level per room), `hearth` ({fire, embers}) and `cottagePose`; a `lamps` fixture also gives the yard's cottage windows the living room's and the study's levels, so a capture with those lamps out shows no window glow on the grass outside. For a true clear noon (no study gives one) the script starts a second server on a free port (`NOON_PORT` names one) with a fresh database and its `Date.now` moved to the next clear noon, and stops it on every way out.

### The contract for part 4

- `lightAt` returns light only (an RGB sum); it does not shade, tint or place anything.
- Furniture is to be built through `buildInterior`'s `face` (so its vertices carry the light and spill weights) with the lit materials, and must take part in `fallBack()`.
- Obstacles are height-less plan rectangles; they stop the walker and do not block light. Hanging fittings may hang over obstacles (a table under the dining lamp); wall fittings may not stand in one.

### Known weak points

- Dusk is nearly as bright as noon in the living room.
- The lit lamp's glass clips to white at its centre; its warmth shows only at its rim and in its halo.
- A 0.25 m strip of the hall wall past the hall-living jamb takes about +0.10 daylight from the living room's panes.
- Up to about 9% red overshoot on the brightest brushwork at noon or by a lamp, more with a daytime fire.
- Borrowed daylight two or more rooms from a pane is faint: about 0.11 to 0.16 on the floor by the doorway against the 0.1 floor, and within a few hundredths of the floor at the far walls. The linen cupboard and the ground bath vary by only about a tenth of their light.

