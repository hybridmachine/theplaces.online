# Path lights by the cottage — design (short)

Lines marked **(call)** are the builder's proposals, not the owner's decisions.

## Intent

Low path lights near the house that light up from dusk to early dawn and are off during the day. Approved by the owner on 2026-11-17 as described here.

## Goals

- Five low lights, staggered on both sides of the last stretch of the path up to the cottage door, about 0.4 m off its edge, clear of the garden beds. **(call: count, spacing, stretch)**
- Each a dark stake about 45 cm tall with a small hooded warm lamp, real 3D like the garden. **(call)**
- After dusk each lamp glows and lays a soft warm pool on the ground beside it.
- They follow the sun alone: fading on as dusk falls, fading off as the sky first lightens, well before sunrise; dark all day.

## Non-goals

- Any resident action, server or world state, field note or sound. **(call)**
- Any change to the default 2D painting or to what it downloads.
- Colliders: the stakes stand well below the eye, so a visitor walks over them. **(call)**

## Anti-goals

- Lights that show lit by day, or still burning in full morning light.
- A cost that slows the yard on slow devices.

## Constraints found

- The default page is a fixed painted plate; only the `?space=1` yard can take the lights.
- The yard already carries two real point lights (the cottage rooms), always in the scene so its shaders never rebuild. Every further one is paid for by every lit surface.
- `calendar.elevation` (radians) is known every frame; the `dusk` study stands at sunset + 9 min and the `dawn` study at sunrise + 9 min.

## Approaches

1. **Emitted lamp and a painted pool of light on the ground, driven by the sun's height — chosen.** One number, 0–1, from the calendar; no new light sources, no state.
2. **A real point light per lamp.** Lights the grass and the beds truly, but takes the yard from two point lights to seven on every surface.
3. **Painted into the plate / new card art.** Needs a re-export of approved art, and the default painting is fixed.

## Design

- **Layout** in `shared/lakeside-dressing.js`: a `pathLights` entry (count, the stretch back from the door, offset from the path's edge, height, pool radius) and a pure `pathLightPlan(space, dressing)` returning each light's `foot`, `lamp` point and side.
- **Timing** in `shared/path-lights.js`: `pathLightLevel(calendar)` → 0–1 from the sun's elevation. In the evening it rises as the sun sets (fully on a few minutes after sunset); in the morning it falls while the sun is still well below the horizon (out before civil dawn ends).
- **Scene**: `public/space/scene/lights.js` builds a `lights` part: stakes and hoods in the dark bark paint, an emitted lamp, and a soft additive pool on the ground at each; `setPathLights(level)` on the scene.
- **Life**: a `pathLights` presenter sets the level each frame from the frame's calendar, so studies (`dusk`, `night`, `dawn`, day) show the right state.
- **Tests**: the plan is deterministic, each light is in the yard, walkable ground, off the path's earth, clear of the beds, cabin and oak, alternating sides; the level is 1 at night and the dusk study, 0 by day and at the dawn study, and never lit at noon in any season; the scene builds the part and the level changes lamp and pool.
- **Check**: capture the yard at the dusk, night and day studies.

## Left to the builder

Exact positions, colours, glow strength and pool size, tuned against the captures.
