# The raised bed garden — design (short)

Lines marked **(call)** are the builder's proposals, not the owner's decisions.

## Intent

A small kitchen garden by the cottage that a visitor sees on arriving in the walkable yard: raised beds with tomatoes, corn and a few bean stalks. Approved by the owner on 2026-11-17 as described here.

## Goals

- Two timber raised beds on the grass in front of the cottage's left (north, chimney) end, between the oak and the path, about 14 m ahead of the arrival spot, in the arrival frame.
- Corn (eight to ten stalks) at the left end, rising in the gap between the oak trunk and the cottage and clear of the left window; a few bean stalks on a small pole teepee in the middle; four staked tomato plants with red fruit at the path end, low under the window.
- Real 3D: holds up from every side a visitor can walk to. Leaves sway with the yard's wind.
- A visitor walks round the beds; ground cover keeps off them.

## Non-goals

- Growth, seasons, harvest; the bird using the garden; any server or world state. **(call)**
- Any change to the default 2D painting, or to what it downloads.
- Re-exporting the painted art.

## Anti-goals

- Hiding the cottage's front-left window (its light is a shared fact) or blocking the path.
- Flat pictures that turn to face the visitor.

## Constraints found

- The default page is a fixed painted plate; only the `?space=1` yard can take the garden.
- From the arrival spot the oak trunk fills the left of the frame; only a narrow gap shows between it and the cottage's left edge, so a garden truly beside the north gable would be mostly hidden.
- The card atlas (`cards.webp`, 16 cells) has two free cells; its cell streams are pinned so approved cells repaint identically.

## Approaches

1. **Built from geometry and the atlas's existing neutral dabs, tinted — chosen.** Stalks, poles and stakes as tubes; leaves, tassels and fruit as tinted `dab` cards, as the cabin's shrubs are. No art re-export, holds up close.
2. **New painted card cells per crop.** Closest to the grass and flowers, but needs three cells where two are free, a re-export, and crossed cards read flat at walking distance for plants this large.
3. **Beds beside the north gable.** Literally "left of the cottage", but hidden behind the oak from the arrival spot.

## Design

- **Layout** in `shared/lakeside-dressing.js`: a `garden` entry (bed centres, size, height, yaw) and a pure, seeded `gardenPlan(space, dressing)` returning beds and plants (`corn`, `bean`, `tomato`, with positions and sizes). **(call)**
- **Colliders**: each bed is a box collider in `shared/lakeside-space.js`, which also keeps scattered grass and flowers off them.
- **Scene**: `public/space/scene/garden.js` builds a `garden` part: board sides in the dark brushed board paint, earth on top, tubes for stalks and poles, tinted dabs for leaves, tassels, ears and fruit, swaying with the shared wind uniforms.
- **Tests**: the plan is deterministic, the beds are in the yard, off the path, clear of the cabin and oak, not walkable; every plant stands in a bed; the scene builds the part with finite geometry.
- **Check**: capture from the arrival spot; nudge the beds until all three crops read clearly and the left window is clear.

## Left to the builder

Exact bed coordinates, plant counts within the ranges above, colours, sway amounts.
