# The painted look (navigable yard, phase 2) — design

Status: built on branch `claude/painted-look`, November 16, 2026; awaiting the owner's review of the look.

This is phase 2 of `docs/superpowers/specs/2026-11-15-navigable-yard-design.md`, which remains the parent design. Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction.

## Intent

The walkable yard should read as the oil painting it came from, from wherever a visitor can stand, at any hour and in any weather. Phase 1 proved the place can be walked; it looks like a computer model. Phase 2 makes it look painted. It ends with the owner walking it and deciding whether it is beautiful enough to go on to the living systems (phase 3).

## What the owner has decided

- **Look C.** The owner walked a spike with three looks and chose the third: painted surfaces, broken silhouettes, and a painterly pass over the whole frame. Their words: it is looking good.
- **Art made in code.** No image-generation tool is available to the builder. Textures and brush cards are painted by code from colours sampled out of the original painting.
- **Painted once into asset files**, the way the project's other art is produced, not painted in the browser at page load.
- **A defect to guard against.** In the spike the back of the cabin was see-through, because two walls were only drawn from the inside. The real build must be correct from every side a visitor can reach.

## Goals

- From every reachable spot, surfaces show brushwork, no straight polygon edge meets the sky, and the frame as a whole reads as paint.
- The arrival view echoes the original painting: oak framing the left, cabin left of centre with its door and windows, the path leading to the door, lake to the right, misty hills beyond.
- It holds at dawn, day, dusk, night and in rain, using the existing shared light and sky.
- Every visitor sees the same brushwork.
- A weak device still gets a painted place, without the full-frame pass.
- Any single piece of code-painted art can later be replaced by a generated plate as a file swap, with no code change.

## Non-goals

- The living systems in 3D: wind in foliage, cottage lights and smoke, the bird, rain traces, ripples. That is phase 3. Phase 2 must not fake them: windows stay dark at night, for example, because window light is shared world state. **(call)**
- Touch walking, accessibility descriptions for the 3D view, the 2D fallback for devices below 20 fps, and making the 3D view the default. Phase 4.
- "Keep this view" in the 3D view. It stays hidden there. **(call)**
- New generated artwork. The design leaves a slot for each piece; whether to fill any is the owner's later choice.
- Seasons, snow, growth.

## Anti-goals

- A photo filter. If the full-frame pass smooths the picture into a blurred photograph instead of adding to the brushwork, it has failed.
- A textured game level. Painted surfaces on hard-edged boxes is Look A, which the owner did not choose.
- Camera-facing cards that swim or turn as the visitor walks.
- Any difference in the default 2D page.

## Constraints from the project

- The default page must not load three.js or any yard code or assets. Everything here is reached only through the `?space=1` path.
- Plain ES modules, no build step. three.js 0.170.0 is the only third-party runtime code.
- Art is produced by offline scripts (`scripts/prepare-*-assets.mjs`), exported under `public/assets/<bundle>-v1/` with an `export.json`, validated by a Node test, and recorded with its provenance in `ARTWORK.md`. Image tooling is development-only and never ships.
- The server serves `.png` with a one-day cache lifetime under `/assets/`. It has no entry for JPEG or WebP today; this phase adds one for WebP (see the art bundle).
- World layout lives in `shared/lakeside-space.js` in metres (x east, y north, z up). The cabin and oak have colliders there that must agree with what is drawn.
- Lights, fog and sky come from `public/space/space-view.js` and `public/space/sky-dome.js` (phase 1). The sky dome already looks painted and is not redesigned here.
- The existing frame loop caps at 30 fps and the pixel ratio at 1.6.

## Approaches considered

1. **Paint once into asset files — chosen by the owner.** A script paints the textures and cards and saves them as images; the page loads them. Every visitor sees identical brushwork, the art can be inspected as files, and a generated plate replaces a code-painted one by swapping a file. Cost: a few megabytes of extra download for 3D visitors.
2. **Paint at page load.** What the spike does. No new files, but it adds load time (about 0.6 s on a fast laptop, more on phones), the art cannot be reviewed ahead of time, and generated plates would need a separate path.
3. **Both.** Files for the base art and load-time painting for variation. More moving parts for little gain.

## Design

### The spike is the reference, not the base

The spike is on branch `claude/painted-look-spike` (commit `019fc29`), in `public/space/painted-textures.js`, `painted-look.js` and `painted-dressing.js`. It was written for speed. Phase 2 reimplements Look C with tests and review, reading the spike for what worked: the stroke painter, the source regions in the painting, the card atlas layout, the cabin and oak shapes, and the filter. The spike branch is deleted when phase 2 merges. **(call)**

### The art bundle

- Location: `public/assets/lakeside-space-v1/`, with `export.json` recording version, each file's name, dimensions, alpha convention, seed, and a content hash.
- **Format: WebP at quality 90.** Brushwork is noisy and PNG stores it badly. Measured on the spike's own textures: eleven surface textures plus the 2048 × 2048 card atlas come to 19.2 MB as PNG and 2.3 MB as WebP at quality 90. The card atlas keeps its alpha in WebP. This needs one new line in the server's content-type table (`.webp`), which is the only change under `src/`. **(call)**
- **Surface textures**, tileable, about 1024 × 1024: meadow, bare path earth, shore stones, cottage stone, slate, bark, lake water strokes, yard-wall stone, and the hill bands. Door and window panels as small non-tiling images.
- **Card atlas**, straight alpha, cells of about 512 px: oak leaf clumps, woodland clumps, loose dabs, grass tufts, reeds, flowers.
- Total bundle no larger than 4 MB. **(call)**
- **How it is painted.** Each texture starts from the mean colour of a named region of `public/assets/lakeside-day.png` and is built from thousands of bristle-streaked, tapered strokes whose colours are sampled from that region, with direction and length suited to the material. Strokes wrap at the edges so textures tile. All randomness comes from fixed seeds.
- **How it is exported.** The painter is browser canvas code. An export script runs it in headless Chromium through the development-only Playwright the check scripts already use, and writes the WebP files and `export.json`. The committed files are the truth; a different Chromium may rasterise slightly differently, so re-exporting is a deliberate act, not part of any test. **(call)**
- The painter and its source-region table live outside the files a visitor loads.

### Plate slots

Every file in the bundle is a slot. A generated plate fills a slot when it has the slot's name, dimensions and alpha convention. Supplied plates are kept as PNG under `artwork/lakeside-space-v1/plates/`; the export script encodes a supplied plate for its slot instead of painting it, so re-exporting never overwrites generated art. `ARTWORK.md` records, per slot, whether it is code-painted or generated, and the prompt for any generated one. **(call)**

The four slots where code is weakest, and where a plate would help most:

| Slot | What a plate would be |
|---|---|
| Far hills and mist | A 360° band of layered misty fells with a soft sky edge |
| Oak leaf clumps | About eight lobed, lacy clumps in the oak's style |
| Distant woodland | A few tree-line silhouettes in sage and moss with lit tops |
| Foreground grass and flowers | A sheet of long-grass tufts, cow parsley and reeds |

As built, the far-hills slot (`hills`) is not a band: it is a brushwork tile that repeats both ways over the slopes. The hill silhouettes, the ragged crest and the mist are made in geometry and shader, so a hills plate changes the hills' paint but not their line. The oak, woodland and ground-cover plates are not separate files: they are cells of the one `cards` atlas.

Phase 2 makes the best code-painted version of each. The owner's review decides whether any needs a plate.

### The place, rebuilt for paint

The flat blockout is replaced, not dressed. The blockout meshes are removed once the painted scene covers them; there is no visitor-facing flat tier. **(call)**

- **Ground.** The terrain keeps its shape and reach. It blends meadow, a worn earth path from the arrival spot to the cabin door, and a stony band at the shore, with a slow large-scale tint so the meadow never reads as a repeating carpet.
- **Lake.** Horizontal strokes that take their colour from the live sky.
- **Cabin.** Rebuilt slightly out of true: stone walls with a little lean and bulge, an overhanging slate roof with a sag and an eave thickness, a chimney, a painted door and two windows on the front, one small window on the back, and dabs breaking the ridge, eaves and corners. Shrubs at its foot. Its walls stay inside the existing collider with margin. The colliders in `shared/lakeside-space.js` do not change: they cover solid walls and the trunk, not eaves, canopy or shrubs, so a visitor can brush through shrub cards and stand under the eaves. **(call)**
- **Oak.** A tapered, forked trunk at the existing position with real limbs reaching into clumps of leaf cards. Clumps are lobed and irregular, attached to limbs, lighter above and darker beneath, with sky showing through. No clump floats free of the tree.
- **Woods.** Rows of card clumps beyond the wall, in a narrow range of sage and moss so they sit back instead of reading as camouflage.
- **Ground cover.** Instanced grass tufts, denser where a visitor walks and thinning beyond the wall; reeds in patches along the shore; sparse cream flowers. Near the arrival spot the grass is kept low enough that the path and the cabin's foot are visible.
- **Hills.** Layered silhouettes with atmospheric colour and a soft, painted sky edge, in place of the faceted ring.
- **Yard wall.** Stone with coping and moss.
- **Cards.** Fixed in the world, never turning to face the camera. Alpha-tested so they need no sorting.
- **Placement is authored data.** The path, clump positions and scatter seeds live in a shared layout module beside `shared/lakeside-space.js`, with fixed seeds, so every visitor gets the same tree and phase 3 can attach wind and perches to named parts. **(call)**
- **Correct from every side.** Every solid surface a visitor can walk around is drawn facing outward. Double-sided drawing is reserved for thin cards and the roof's overhang.

### The painterly pass

- The scene renders to a target; a full-screen shader applies an edge-preserving, direction-following smoothing filter (the spike's structure-tensor Kuwahara; plain Kuwahara looked like a photo filter), then a linen weave and a restrained impasto light on stroke edges.
- Two faults seen in the spike are fixed: bright rims where dark shapes meet the sky, and the weave showing too strongly on flat sky.
- The sky's own painted clouds are not smeared.

### Tiers

| Tier | What the visitor gets | When |
|---|---|---|
| Full | Painted scene plus the pass at full resolution | Default |
| Light | Painted scene plus the pass at reduced resolution | Frame rate under the target with the full pass |
| Plain | Painted scene, no pass (the spike's Look B) | Still under the target |

- The tier is chosen from measured frame rate in the first seconds after the view is shown, steps down only, and holds for the page's life. The target is 24 fps. **(call)**
- As built (`public/space/tier.js`): after 1.5 s of settling, frame intervals are gathered over a 3 s window, and the tier steps down one only when the window's median interval is more than 8 % longer than a frame at 24 fps (the tolerance keeps a 48 Hz display, whose median is exactly that frame, on its tier). An interval over 2 s is a stall or a hidden tab and empties the window; more than eight stalls in a row count as a very slow device. After a step down it settles and measures again; a window that holds locks the tier, and plain locks at once.
- The Plain tier must stand on its own as a painted place. It is reviewed as carefully as Full.
- Falling back to the 2D painting below 20 fps stays in phase 4.

### Light and weather

- Textures are plain colour; the existing lights and fog do the hour and the weather.
- Rain is currently too bright because only one of the two lights dims with cloud. Both dim. (Carried from phase 1.)
- Stars fade out in small windows because of how their size is attenuated. A floor is put under it. (Carried from phase 1.)
- No invented life: no window glow, smoke, or moving foliage.

### Matching the arrival view

The arrival pose is unchanged. The painted scene is tuned against the original painting laid over a capture from that pose: the oak's trunk and canopy on the left, the cabin's face and roof line, the path's line to the door, the shore's curve, the hill line. Judged by eye; the parent design already accepts that the lake sits higher in the frame than in the painting.

### Carried from phase 1

Done in this phase because they touch the same code:

- A test that the cabin and oak colliders contain the solid parts that are drawn (walls and trunk, from the ground to eye height), with margin.
- A test that the scene builds, names its parts, and disposes everything.
- The view does not wait for the cloud atlas before showing, and does not move the visitor before it is shown.
- The GPU context is released if setup fails part-way.
- Small tests for `toThree`, the field-of-view rule and the sky colours.

Left for later: the walker's step cap (phase 4) and the remaining small test gaps listed in the phase 1 plan's "Carried forward" section. **(call)**

### The owner's review

Phase 2 ends with the owner walking the place. The builder prepares, for Full and Plain tiers:

- captures from the arrival pose, close to the cabin's front, behind the cabin, each gable end, the shore looking back, the middle of the yard facing the north woods, and under the oak looking up;
- the arrival pose at dawn, day, dusk, night and rain;
- the arrival capture beside the original painting.

These go under `docs/space-validation/`. The owner's judgement is the acceptance test. If the answer is "not yet", the owner names what is wrong and whether a generated plate should fill a slot.

### Checks

- **Bundle test (Node):** every file in `export.json` exists and its hash matches; total size within budget. Dimensions and alpha are checked by the export script when it writes the files, since Node has no image decoder here.
- **Layout test (Node):** the shared dressing layout is valid, deterministic, and keeps the cabin and oak inside their colliders.
- **All-round test:** from a ring of viewpoints round the cabin and round the oak, nothing is see-through. The builder chooses how to prove it (ray tests against the built geometry, or pixel checks in the browser).
- **Tier logic test (Node):** the tier choice is a pure function of measured frame times; it steps down, never up.
- **Browser check:** the existing `scripts/check-space-browser.mjs` keeps passing, and gains: assets load without errors, each tier draws, a missing or corrupt bundle falls back to the 2D painting, and frame rate per tier is recorded in the results file.
- `npm test` and `npm run check` pass; new modules join the `check` chain.

### Performance

The spike's Look C drew about 304,000 triangles and three extra full-screen passes, and held the 60 fps display cap on an M1; headroom was not measured and nothing was measured on a phone or an integrated GPU. Phase 2 records frame rate per tier on the builder's machine and states plainly what was not measured. The terrain's outer skirt, which is most of the triangle count, may be coarsened if it helps. **(call)**

## Left to the builder

- File and module layout under `public/space/`, and where the painter and export script live.
- Stroke counts, stroke shapes, texture sizes within the budget, and atlas cell layout.
- Exact cabin and oak shapes, clump counts, grass density, card sizes.
- The filter's radius, resolution steps, and how tier measurement is windowed.
- How the all-round test proves nothing is see-through.
- Whether any texture should be smaller or larger than 1024 px within the budget.
