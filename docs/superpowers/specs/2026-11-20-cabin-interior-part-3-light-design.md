# Cabin interior, part 3: light — design

Status: proposed, November 20, 2026. Awaiting approval. Nothing is built.

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
