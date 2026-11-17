# Walkable yard validation (painted look)

Recorded November 16, 2026, against `?space=1` on branch `claude/painted-look`. The server ran from this worktree against a disposable SQLite database; production state and deployment were untouched. The checks and captures used Node.js 26.7.0, Playwright 1.65.1 and its Chromium headless shell with `--use-gl=angle`, which selected "ANGLE Metal Renderer: Apple M1" on an Apple M1 laptop.

## What this is

The yard drawn from painted geometry: ground, lake, drystone wall, the stone cabin under a slate roof, the old oak, a band of woods and a small grove beyond the wall, ground cover, and four rings of far hills, all textured from the WebP art bundle in `public/assets/lakeside-space-v1/` (12 files, 1,813,622 bytes), under the shared procedural sky, through a painterly pass. A tier meter steps the pass down on a slow device: `full` (the pass at full filter resolution), `light` (the pass at 0.6 of it), `plain` (no pass). This pack is for the owner to decide whether the look is good enough.

## The review pack

All captures are 1440 × 810, device pixel ratio 1, taken by `scripts/capture-space-review.mjs` with the view locked on a tier (`?tier=`, honoured only with `check`) and the interface hidden. They are saved as JPEG at quality 90 so the pack stays small (6.2 MB for 23 frames); the comparison image is a JPEG at the same quality.

- [arrival-vs-painting.jpg](arrival-vs-painting.jpg): the painting, the arrival capture at the same height, and the two laid over each other at half strength (`--compare`).
- By day on `full` and on `plain`, the eight named poses: `arrival`, `cabin-front` (2.5 m from the door), `cabin-back`, `gable-north`, `gable-south`, `shore`, `woods`, `canopy` (under the oak, looking up). In [review/](review/) as `<pose>-day-full.jpg` and `<pose>-day-plain.jpg`.
- The arrival pose at dawn, day, dusk, night and rain on `full`: `arrival-<study>-full.jpg`.
- The three views where the woods meet the water, the weakest corners, by day on `full`: `woods-end-northwest` (from [-11, 20], looking south), `woods-end-north-gable` (from [16, 16], looking east past the cabin's north gable), `woods-end-northeast` (from [20, 12], into the north-east corner).

Reproduce with a server running, for example:

```sh
SKY_PREVIEW_URL=http://127.0.0.1:4190 node scripts/capture-space-review.mjs --tier full
SKY_PREVIEW_URL=http://127.0.0.1:4190 node scripts/capture-space-review.mjs --tier plain --only arrival,cabin-front,cabin-back,gable-north,gable-south,shore,woods,canopy
for s in dawn dusk night rain; do SKY_PREVIEW_URL=http://127.0.0.1:4190 node scripts/capture-space-review.mjs --only arrival --study $s; done
SKY_PREVIEW_URL=http://127.0.0.1:4190 node scripts/capture-space-review.mjs --compare
```

## Matching the arrival view

Judged by eye against `public/assets/lakeside-day.png` with the overlay. The oak's trunk frames the left and its canopy now runs across the top from the trunk to past the middle, where the painting's foliage is fullest (two short low limbs were added, to the north-east and east; the canopy has 29 clumps). The cabin's face, roof line, door and two windows sit where the painting has them, a little larger; the chimney is now on the far (north) gable as in the painting. The path leads to the door, the shore curves away to the right, and the hills sit behind. A grove of eight tall trees beyond the east wall, in loose uneven rows with the back ones standing into the woods, now rises behind and to the left of the cabin, where the painting has its dense band of trees. The eaves have their own dark soffits and boards, so no slate joint shows from below, and the eave line dips and lifts along its length. The nearest far ridge rolls more and its mist lies in separate banks rather than one pale stripe. The lake sits higher in the frame than in the painting (accepted).

## Automated evidence

`node scripts/check-space-browser.mjs` — last run: **22 PASS, 0 FAIL**, exit code 0, no page errors. Full detail, numbered as below, is in [space-browser-results.json](space-browser-results.json).

1. `/` requests nothing whose URL contains `three-`, `/space/` or `lakeside-space-v1`, and `#space` stays hidden.
2. `/?space=1&check` loads all twelve bundle files with status 200 and content type `image/webp`, with no console errors.
3. The view arrives exactly at `LAKESIDE_SPACE.arrival`.
4. Holding W for 2 s walks 2.2–3.2 m east with no drift.
5. Shift+W for 40 s from four headings stays on walkable ground.
6. Opening `#about-dialog` while W is held stops walking.
7. After 3.5 s standing still, a reload returns to the same place.
8. **Forget visit memory** returns the next visit to the arrival pose.
9. **Forget visit memory** on the default page forgets the place for the next 3D visit.
10. Each of `?tier=full`, `light`, `plain` draws a non-blank frame and reports that tier in `window.__space.tier`.
11. Frame rate per tier (recorded, not asserted): see below.
12. After resizing to 390 × 844 and back to 1280 × 720, the centre pixel differs from a corner pixel and the canvas backing size is the viewport times the pixel ratio.
13. Under the night study, the middle of the front-left window, projected from the dressing data, has luminance below 0.25 and is darker than the stone wall beside it; under the day study the same point stays below 0.25 while the wall is clearly lighter, so the sample is on the glass.
14. Without WebGL2 the 2D view is shown.
15. Losing the WebGL context returns to the 2D view within 2 s.
16. At 390 × 844 the vertical field of view is at most 75° and the frame is drawn.
17. A scene build that fails (meadow texture aborted) shows the 2D view and gives its WebGL context back.
18. With `cards.webp` aborted, the 2D view is shown, `#space` is hidden, there is no toast and no page error.
19. With `stone.webp` answered 200 with an empty body, the same.
20. Left to itself, the tier meter settles on `full` and locks within about 6 s of the view being shown.
21. A running view stepped down live (its meter swapped for a stub answering `light`, then `plain` locked) reports each tier and pass mode, runs the filter at 0.6 on `light`, releases the pass on `plain`, and draws a non-blank frame after each step and after a resize with no pass.
22. With neither float colour-buffer extension (`EXT_color_buffer_float`, `EXT_color_buffer_half_float`) the view starts locked on `plain`, builds no painterly pass, draws the yard, and raises no GL error. The extensions are withheld from the page by the check; no real browser lacking them was tested.

### Frame rate and counts (check 11)

At the arrival pose under the day study, 1440 × 810, pixel ratio 1, on the Apple M1 through ANGLE/Metal in headless Chromium:

| Tier | rAF callbacks per second | Synchronous frame (median of 20) | Triangles | Draw calls |
|---|---|---|---|---|
| full | 60 | 10.7 ms | 327,968 | 28 |
| light | 60 | 8.7 ms | 327,968 | 28 |
| plain | 60 | 7.2 ms | 327,968 | 28 |

The callback count is capped by the display (about 60 per second), so it says only that every tier keeps up here. The synchronous time is one frame drawn and then read back so the GPU has finished; it is the better measure of headroom. It varies by a few milliseconds between runs (earlier runs the same evening gave 11.6, 7.7 and 8.3 ms, and 11.0, 8.4 and 5.3 ms; the last run gave 11.4, 9.2 and 8.0 ms). Triangles and draw calls are the scene alone (`renderer.info.render` after a plain scene render); the pass adds a few full-screen draws. The app itself draws at most 30 frames per second.

## What was not measured

- No phone, tablet or integrated-GPU measurement. Whether `full` holds 24 fps on modest hardware, and where the meter settles there, is unknown.
- Headless rendering is not a performance measurement; the numbers above are one machine's GPU through ANGLE.
- Only Chromium was exercised. Safari, Firefox and touch input are untested.

## What still looks weakest

Slot by slot:

- **Woods (parked for the owner).** Where the woods end near the water they step down as steep, terraced masses with near-vertical end faces: plain in `woods-end-northwest` (the bluff on the right), `woods-end-north-gable` (left of the grove) and `woods-end-northeast` (left). Five rounds did not converge; the owner decides whether to spend more here or use a generated plate.
- **Woods (parked, minor).** A faint pale fringe along the woods' top edge, visible at 1:1 against the sky.
- **Woods crowns under the pass.** On `full` the bristle pass leaves a felt-like fuzz on the woods' rounded crowns (`woods-day-full`, `gable-south-day-full`); the band reads as soft domes of moss more than as trees.
- **Grove.** From inside the yard (`woods-end-north-gable`, `woods-end-northeast`) the grove now reads as a dense copse with crowns hanging low over the wall and only short lengths of trunk showing, but it still stands as its own clump in front of where the woods band steps down, with sky between them, and its crowns are a little darker and crisper than the band's soft domes.
- **Oak.** The crown is full from the arrival pose, but from beneath (`canopy`) the limbs meet the trunk as tubes from one ring and the bark is coarse streaks. At night the oak's leaves stay noticeably light against the dark sky (`arrival-night-full`).
- **Cabin.** The eave is now a dark brushed band without plank joints, but seen from right under the gable (`woods-end-northeast`) the verge's underside is still a large dark brushed plane, though lighter than the eaves'. The shrubs at the cabin's foot are cut from the woods cells and show straight card edges at the gable ends (`gable-north`).
- **Ground cover.** The foreground grass is shorter and tamer than the painting's knee-high verge (kept low so the path and the cabin's foot stay in view), and the flower heads are flat close up. The meadow texture smears into streaks at grazing angles (`gable-south`, `cabin-back`).
- **Lake.** Paler and flatter than the painting's: a pale grey-blue with fine regular ripple lines, no reflected hills or sky.
- **Hills.** The nearest ridge now rolls, but the far ridges are still pale, smooth and alike; the mist is sparse compared with the painting's valley drifts. Under rain the ridges stay greener than the grey sky.
- **Sky under rain.** The rain clouds have hard, posterised edges (`arrival-rain-full`), the most computer-made thing in the pack.
- **Dusk and dawn.** Both are dim and grey at the arrival pose; neither has the painting's warmth.

The `plain` tier against `full`: harder, aliased silhouettes (oak leaves, grass, the roof edge); the woods band is smoother and blobbier with less brushwork; the ground texture smears more at grazing angles; the water is cleaner and more even. It is the same place, recognisably less painted.

## Reproduction

```sh
npm install --no-save playwright
npx playwright install chromium-headless-shell
A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start
node scripts/check-space-browser.mjs
```

The check reads `SKY_PREVIEW_URL` (default `http://127.0.0.1:4190`), `BROWSER_EXECUTABLE`, `SKY_GPU` and `SPACE_VALIDATION_DIR` (default `docs/space-validation`); the capture script reads `SKY_PREVIEW_URL`, `BROWSER_EXECUTABLE` and `SKY_GPU`. Playwright is a development-only, optional tool. The check rewrites [arrival.png](arrival.png) and [remembered.png](remembered.png); the review pack and the comparison image are kept in Git.
