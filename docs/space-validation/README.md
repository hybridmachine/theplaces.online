# Walkable yard validation (painted look, living yard)

Recorded November 16, 2026 (the painted look, branch `claude/painted-look`) and November 17, 2026 (the living things, branch `claude/living-yard`), against `?space=1`. The server ran from this worktree against a disposable SQLite database; production state and deployment were untouched. The checks and captures used Node.js 26.7.0, Playwright 1.65.1 and its Chromium headless shell with `--use-gl=angle`, which selected "ANGLE Metal Renderer: Apple M1" on an Apple M1 laptop.

## What this is

The yard drawn from painted geometry: ground, lake, drystone wall, the stone cabin under a slate roof, the old oak, a band of woods and a small grove beyond the wall, ground cover, and four rings of far hills, all textured from the WebP art bundle in `public/assets/lakeside-space-v1/` (13 files, 1,821,202 bytes), under the shared procedural sky, through a painterly pass. A tier meter steps the pass down on a slow device: `full` (the pass at full filter resolution), `light` (the pass at 0.6 of it), `plain` (no pass). This pack is for the owner to decide whether the look is good enough.

## What phase 3 added (the living yard)

The painting's living things, drawn in the yard by presenters under `public/space/life/` and placed by `shared/lakeside-life.js`: wind in the oak, woods, shrubs, grass and reeds; the cottage's two front windows lit by their rooms (the lit panel is emitted light, with a warm light laid on the yard outside after dark), the main room's casement swinging open, and hearth smoke from the chimney; rain streaks round the visitor, the wet path and shore stones, a puddle on the path and drips under the oak's lowest clumps; the rings of a rising fish at three spots on the lake; the small bird at the oak perch, the nest, the sheltering place behind the oak, the roof ridge and in flight between them, with its nest filling a twig at a time; and three distant birds crossing the far sky. Every shared fact (which rooms are lit, the casement's angle, the hearth, where the bird is along which route, how wet the ground is, where and how old a ripple is) comes from the same snapshot and the same samplers as the 2D painting; only the rain's streak positions and the distant birds are the visitor's own, as in 2D. Studies, pause and reduced motion follow the painting (a study omits smoke, bird, ripples and distant birds; reduced motion omits smoke, drips and distant birds, settles the bird, snaps the casement and holds the foliage still). Life is identical on all three tiers.

## The review pack

All captures are 1440 × 810, device pixel ratio 1, taken by `scripts/capture-space-review.mjs` with the view locked on a tier (`?tier=`, honoured only with `check`) and the interface hidden. They are saved as JPEG at quality 90 so the pack stays small (11 MB for 44 frames: 6.2 MB for the 23 painted-look frames, 5.2 MB for the 21 life frames); the comparison image is a JPEG at the same quality.

- [arrival-vs-painting.jpg](arrival-vs-painting.jpg): the painting, the arrival capture at the same height, and the two laid over each other at half strength (`--compare`).
- By day on `full` and on `plain`, the eight named poses: `arrival`, `cabin-front` (2.5 m from the door), `cabin-back`, `gable-north`, `gable-south`, `shore`, `woods`, `canopy` (under the oak, looking up). In [review/](review/) as `<pose>-day-full.jpg` and `<pose>-day-plain.jpg`.
- The arrival pose at dawn, day, dusk, night and rain on `full`: `arrival-<study>-full.jpg`.
- The three views where the woods meet the water, the weakest corners, by day on `full`: `woods-end-northwest` (from [-11, 20], looking south), `woods-end-north-gable` (from [16, 16], looking east past the cabin's north gable), `woods-end-northeast` (from [20, 12], into the north-east corner).
- The living things, on `full`, from `--life` as `review/life-<what>-full.jpg` (21 frames; about 15 were planned, and each of the bird's places, the three ripple spots and the nest's two stages wanted its own frame). Each names its own study, pose and fixture in `scripts/capture-space-review.mjs`:
  - `life-windows-night-path` (lit windows at night from the path), `life-windows-night-beside` (from 1.8 m out, beside the left window), `life-casement-open-day` (the casement open by day).
  - `life-smoke-day` (smoke over the chimney by day), `life-smoke-glow-night` (the smoke and the window glow together at night).
  - `life-rain-eave-rain` (from under the eave, looking along the wall), `life-rain-walking-rain` (a frame while walking in rain), `life-path-day` and `life-path-rain` (the same view of the path and puddle, dry and in rain).
  - `life-ripple-shore-reflection`, `life-ripple-open-water`, `life-ripple-near-water` (a ring four seconds old at each spot, from the arrival).
  - `life-bird-perch`, `life-bird-nest`, `life-bird-shelter` (from behind the oak), `life-bird-roof`, and `life-bird-flight-a` / `life-bird-flight-b` (the roof flight 6.5 s in, and 60 ms later, for the wings); `life-nest-5` and `life-nest-12` (the nest with 5 and with 12 pieces brought, so 15 and 36 twig strokes); `life-far-birds-day` (the three distant birds).
  - These frames are built to be seen, not to be live: a fixture sets what the presenter shows, and the smoke, ripple, nest and distant-bird frames also tell the life it is not under a study (so it draws what a live visit would) while the light and weather stay the named study's; the hearth is set burning and the nest's materials set in the snapshot the life is handed, and the life's clock set for the distant birds. None of this reaches a visitor or the server.

Reproduce with a server running, for example:

```sh
SKY_PREVIEW_URL=http://127.0.0.1:4190 node scripts/capture-space-review.mjs --tier full
SKY_PREVIEW_URL=http://127.0.0.1:4190 node scripts/capture-space-review.mjs --tier plain --only arrival,cabin-front,cabin-back,gable-north,gable-south,shore,woods,canopy
for s in dawn dusk night rain; do SKY_PREVIEW_URL=http://127.0.0.1:4190 node scripts/capture-space-review.mjs --only arrival --study $s; done
SKY_PREVIEW_URL=http://127.0.0.1:4190 node scripts/capture-space-review.mjs --compare
SKY_PREVIEW_URL=http://127.0.0.1:4190 node scripts/capture-space-review.mjs --life --tier full
```

## Matching the arrival view

Judged by eye against `public/assets/lakeside-day.png` with the overlay. The oak's trunk frames the left and its canopy now runs across the top from the trunk to past the middle, where the painting's foliage is fullest (two short low limbs were added, to the north-east and east; the canopy has 29 clumps). The cabin's face, roof line, door and two windows sit where the painting has them, a little larger; the chimney is now on the far (north) gable as in the painting. The path leads to the door, the shore curves away to the right, and the hills sit behind. A grove of eight tall trees beyond the east wall, in loose uneven rows with the back ones standing into the woods, now rises behind and to the left of the cabin, where the painting has its dense band of trees. The eaves have their own dark soffits and boards, so no slate joint shows from below, and the eave line dips and lifts along its length. The nearest far ridge rolls more and its mist lies in separate banks rather than one pale stripe. The lake sits higher in the frame than in the painting (accepted).

## Automated evidence

`node scripts/check-space-browser.mjs` — last run: **31 PASS, 0 FAIL**, exit code 0, no page errors. Full detail, numbered as below, is in [space-browser-results.json](space-browser-results.json).

1. `/` requests nothing whose URL contains `three-`, `/space/` or `lakeside-space-v1`, and `#space` stays hidden.
2. `/?space=1&check` loads all thirteen bundle files with status 200 and content type `image/webp`, with no console errors.
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
13. The windows are lit by their rooms. Under the night study, from 2.5 m in front of the door, the middle of each front window (the mean of a 9 × 9 patch, so a glazing bar does not decide it) is brighter than the wall beside it and warm (red above blue); from 2.5 m behind the cabin the back window, whose room is never lit, is darker than the wall; under the day study the front windows are not brighter than the wall. Each point is projected through the camera from the dressing's own data.
14. Without WebGL2 the 2D view is shown.
15. Losing the WebGL context returns to the 2D view within 2 s.
16. At 390 × 844 the vertical field of view is at most 75° and the frame is drawn.
17. A scene build that fails (meadow texture aborted) shows the 2D view and gives its WebGL context back.
18. With `cards.webp` aborted, the 2D view is shown, `#space` is hidden, there is no toast and no page error.
19. With `stone.webp` answered 200 with an empty body, the same.
20. Left to itself, the tier meter settles on `full` and locks within about 6 s of the view being shown.
21. A running view stepped down live (its meter swapped for a stub answering `light`, then `plain` locked) reports each tier and pass mode, runs the filter at 0.6 on `light`, releases the pass on `plain`, and draws a non-blank frame after each step and after a resize with no pass.
22. With neither float colour-buffer extension (`EXT_color_buffer_float`, `EXT_color_buffer_half_float`) the view starts locked on `plain`, builds no painterly pass, draws the yard, and raises no GL error. The extensions are withheld from the page by the check; no real browser lacking them was tested.
23. With `fixture.cottagePose` `{main: 0, second: 0, open: 1}` the pixels over the front-left window differ from the same view with `open: 0`, and two `open: 0` frames agree.
24. Two frames 1.5 s apart differ over the oak's crown (the projected centres of its sprays); with reduced motion emulated they are identical there.
25. Under the rain study the mean luminance over the path ahead is lower than under the day study, `life.status.rain` is `'active'`, and a view along the front wall from 0.2 m outside it, under the eave (the layout's own `sheltered()` gives 0 there), equals the same view with the rain presenter's object hidden, while in the open hiding it changes the picture.
26. With `fixture.coincidence = coincidenceFixture(4, id)` for each of the three spots (no study, motion on) the lake over the spot differs from the same frame with the ring taken away (drawn in the same call, so nothing has moved), and `coincidenceActive` is true.
27. With `fixture.bird` at the oak perch, the nest, the sheltering place, the roof perch and mid-way along the roof flight, hiding the `bird` group changes pixels at its projected place, seen from where the bird is actually seen: the perch and roof perch from the arrival pose aimed at them, the nest from beneath the crown (any of 2.5 m out at 60° and 270°, 4 m out at 90° and 300° from the oak; all four show it), the sheltering bird from 5.5 m out at bearing 315° behind the oak, and the flight from 3 m west and 4 m south of its point. From the arrival pose, aimed at the sheltering bird, hiding the group changes no pixels: the trunk stands in the way.
28. Under a study with no fixture, `life.status.bird` is `'idle'` and the bird group is not visible.
29. No page errors or console errors from the living things in checks 23–28.
30. With the rain presenter's update and the ripple presenter's build stubbed to throw (the two files are replaced by the check's routes), the yard still draws, those two report `'failed'` and every other presenter reports `'active'` or `'idle'`, with no page error.
31. Frame cost per tier under the day and the rain studies (recorded, below); a view left alone under the rain study still settles on the full tier, locked, within 7 s, with the rain active.

Check 1 is unchanged and still passes: the default page requests nothing of the yard. Check 2 asserts thirteen files; check 13 replaces the old "windows stay dark" check, which no longer describes the yard. The checks drive the yard through `window.__space` (honoured only under `?check`): `fixture` (`{cottagePose, surface, coincidence: {state, now}, bird: {state, now}}`) sets what a presenter shows, and `life.status` reports each presenter as `'active'`, `'idle'` or `'failed'`. Under a study the ripple is omitted even with a fixture (`rippleNow` returns null), so check 26 runs with no study; the ripple and the bird both need motion on.

### Frame rate and counts (checks 11 and 31)

At the arrival pose under the day study, 1440 × 810, pixel ratio 1, on the Apple M1 through ANGLE/Metal in headless Chromium. Before is phase 2's last run; after is this run (check 11). The yard now has 29 draw calls and 328,032 triangles, where it had 28 and 327,968.

| Tier | rAF callbacks per second | Synchronous frame, before (median of 20) | Synchronous frame, after | Triangles | Draw calls |
|---|---|---|---|---|---|
| full | 60 | 10.7 ms | 12.0 ms | 328,032 | 29 |
| light | 60 | 8.7 ms | 9.8 ms | 328,032 | 29 |
| plain | 60 | 7.2 ms | 5.8 ms | 328,032 | 29 |

Under the rain study (check 31), where the rain presenter rebuilds up to 2400 streaks on the CPU every frame (about 1,570 survive the roof and crown's shelter at the arrival), with the life's own update timed over 4 s of live frames (the rain now hashes each streak once and allocates nothing per streak, which halved its update from about 1.2 ms to 0.6 ms):

| Tier | Study | rAF callbacks per second | Synchronous frame (median of 20) | Life update on the CPU (median, slowest) | Streaks drawn | Triangles | Draw calls |
|---|---|---|---|---|---|---|---|
| full | day | 60 | 11.1 ms | 0.1 ms, 0.2 ms | 0 | 328,032 | 29 |
| full | rain | 60 | 11.7 ms | 0.6 ms, 0.8 ms | 1,578 | 328,074 | 31 |
| light | day | 60 | 8.6 ms | 0.1 ms, 0.2 ms | 0 | 328,032 | 29 |
| light | rain | 60 | 8.9 ms | 0.6 ms, 0.9 ms | 1,582 | 328,074 | 31 |
| plain | day | 60 | 5.6 ms | 0.1 ms, 0.2 ms | 0 | 328,032 | 29 |
| plain | rain | 60 | 8.3 ms | 0.6 ms, 0.9 ms | 1,579 | 328,074 | 31 |

The callback count is capped by the display (about 60 per second), so it says only that every tier keeps up here. The synchronous time is one frame drawn and then read back so the GPU has finished; it is the better measure of headroom, and it varies by a millisecond or two from run to run and from one study to the next (in this run the plain tier's rain row is 2.7 ms slower than its day row and the others under a millisecond; earlier runs had the rain rows no slower, so this is mostly that noise). Triangles and draw calls are the scene alone (`renderer.info.render` after a plain scene render); the pass adds a few full-screen draws. The life's update is measured by wrapping `life.update` in the page, so it includes everything every presenter does each frame; by day it is about a tenth of a millisecond and under rain about 1.3 ms, almost all of it the streaks. A view left alone under the rain study still settles on `full` and locks (check 31), as one left alone with no study does (check 20). The app itself draws at most 30 frames per second.

## What was not measured

- No phone, tablet or integrated-GPU measurement. Whether `full` holds 24 fps on modest hardware, and where the meter settles there, is unknown.
- Headless rendering is not a performance measurement; the numbers above are one machine's GPU through ANGLE.
- Only Chromium was exercised. Safari, Firefox and touch input are untested.
- The frame cost with the bird, the lit windows and the smoke all drawn together was not measured; the cost rows are the day and rain studies, which omit the bird and the smoke, and the life's update was timed live, not under every fixture. Their cost is a few meshes and a handful of lights, but it is a claim, not a number.
- No visual capture of the drips under the oak, of dusk or dawn with the windows lit, of the lamp light on the yard outside the windows other than in `life-windows-night-*`, or of the wet shore stones; the checks cover the drips only as far as the presenter being active under rain.
- Reduced motion was checked for the wind (check 24) and not otherwise: the settled bird, the snapped casement and the absent smoke were not looked at in the browser.
- The distant birds' flicking wings and the bird's wing beat in live frames were seen only as still frames (`life-far-birds-day`, `life-bird-flight-a` and `-b`), never as motion.

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

The living things, in the order the owner will meet them (see the `life-*` frames):

- **The bird's places (accepted by the owner's delegate, stated plainly here).** The oak's leaves were not changed in this phase, so the bird is hard to find. The perch (on limb 1) is seen from the arrival view only when looking up about 0.3 rad; the bird, now drawn 36 cm long, faces the arrival there, so it shows head-on as a small dark head with a pale eye over a lighter breast, about fifteen pixels across, in a gap between dark limbs (`life-bird-perch`): findable when looked for, not noticed in passing. The nest (on limb 2) is hidden by leaves from the arrival and from the path and is seen only from beneath the crown, about 2.5 m out at bearings 60° and 270° or 4 m out at 90° and 300° from the oak, and even there it is a small dark tangle against leaves (`life-bird-nest`, `life-nest-5`, `life-nest-12`; the stage with 12 pieces is only a little bigger than the one with 5). The sheltering bird (on limb 7, 4.4 m up) is hidden from the arrival by the trunk and found from about bearing 315° at 5.5 m behind the oak, a small dark patch against the bark (`life-bird-shelter`). The roof perch and the bird in flight read clearly against the sky (`life-bird-roof`, `life-bird-flight-a`); from the arrival itself the bird on the ridge, 22 m off, is a small dark bird shape with its cocked tail, no longer a speck.
- **The bird's colouring.** Its body is a dark olive close to the bark and leaves behind it (the breast is a little lighter than the 2D bird's, #8f7d5c), so on the oak it is seen by its shape and a little by its movement, not by contrast. In flight, seen from behind, its wings stand up in a V and the beat reads as a small change in the angle between frames (`life-bird-flight-a`, `-b`); how it looks in motion at 30 frames per second was not looked at.
- **Smoke.** By day it is a faint, ragged, wavering plume above the chimney that widens as it rises (`life-smoke-day`); its edges are broken and it has a kink where the wander turns, so it reads as smoke rather than the earlier smooth beam, though close to (8 m) the overlapping puffs still merge into one soft plume with a paler, slightly warm middle rather than separate puffs. It starts a little above the chimney top, where the puffs are still thin. At night, together with the window glow, it is a faint amber-brown wisp (`life-smoke-glow-night`), tinted dark, not lit by the lamps. It now fogs with the cottage.
- **Rain.** The streaks are thin and sparse from under the eave and when walking (`life-rain-eave-rain`, `life-rain-walking-rain`); they read as rain, but look drawn in a single weight and one length. Under rain the clouds' posterised edges are still the most computer-made thing in the pack.
- **Wet path and puddle.** The path darkens clearly in rain and a small, pale, soft-edged patch appears on it (`life-path-rain` against `life-path-day`); the puddle reads as a smudge of sky colour and not as a hollow holding water.
- **Ripples.** A ring four seconds old is a thin pale ellipse; from the arrival the shore-reflection and open-water spots are small and far, and a visitor must be looking at the right place at the right moment to notice one (`life-ripple-*`). The near-water ring is the clearest.
- **Casement and windows.** The lit windows and the warm light on the stone beside them look good at night (`life-windows-night-*`). The open casement is a single dark flat leaf standing out from the wall (`life-casement-open-day`); it shows no glass or reflection of its own.
- **Distant birds.** Three tiny dark marks low over the far hills (`life-far-birds-day`), tinted with the sky as in 2D; at 900 m they are a few pixels wide, so their flicking wings are not readable.

The `plain` tier against `full`: harder, aliased silhouettes (oak leaves, grass, the roof edge); the woods band is smoother and blobbier with less brushwork; the ground texture smears more at grazing angles; the water is cleaner and more even. It is the same place, recognisably less painted.

## Reproduction

```sh
npm install --no-save playwright
npx playwright install chromium-headless-shell
A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start
node scripts/check-space-browser.mjs
```

The check also needs a world with a snapshot to press the light-study buttons against, which a throwaway database gives after a few seconds; it takes about three minutes, the 40-second walks and the 7-second settle among them.

The check reads `SKY_PREVIEW_URL` (default `http://127.0.0.1:4190`), `BROWSER_EXECUTABLE`, `SKY_GPU` and `SPACE_VALIDATION_DIR` (default `docs/space-validation`); the capture script reads `SKY_PREVIEW_URL`, `BROWSER_EXECUTABLE` and `SKY_GPU`. Playwright is a development-only, optional tool. The check rewrites [arrival.png](arrival.png) and [remembered.png](remembered.png); the review pack and the comparison image are kept in Git.
