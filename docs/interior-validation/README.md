# Cabin interior validation (parts 1–5)

Recorded November 17–25, 2026 across parts 1–5 (shell, live windows and open door, painted-in light, furnishing slices `4a`–`4f`, and default-on switch removal in part 5). Checks and captures ran on an Apple M1 laptop using Node.js 26, Playwright, and Chrome/Chromium through `--use-gl=angle` (ANGLE Metal), against a disposable SQLite database on port 4190 (`data/world.sqlite` untouched).

## What this is

A two-storey, 18 × 12 m per floor interior inside the 9 × 6 m lakeside stone cottage — now enabled by default (`?interior=0` keeps the door shut, mirroring `?space=0` for the 2D painting). Eighteen rooms across both floors:

- **Ground floor (10 rooms):** entry hall, living room (with stone fireplace), kitchen, dining room, study, closet passage, master bedroom, ground-floor bathroom, laundry, and pantry.
- **Upper floor (8 rooms, under pitched roof slopes):** landing, library nook (with roof-pitch sloped bookcases), second and third bedrooms, sky room (with roof window and telescope), upstairs bathroom, box room, and linen cupboard.

All interior geometry is authored in code (`public/space/interior/`) from fixed seeds, reusing the `lakeside-space-v1` WebP brush textures under vertex-authored light (`shared/interior-light.js`, no scene light sources). Live windows (six windows plus the open front door) render the shared yard into the frame via stencil masking. Furniture builds lazily in two stages (`hall` + `living` at the door; ground-floor queued rooms flushed on entry; upper-floor queued rooms built quietly in background frames and flushed near/on the stair or on indoor upstairs startup), and unseen queued rooms are hidden per frame via room-sight and frustum-plane checks (`shared/sight.js`).

## Committed captures

Representative JPEG frames (quality 85, 1440 × 810 or 1672 × 941, kept selectively via `.gitignore`) under this directory cover every part:

- **Shell & threshold (part 1):** `door-shut.jpg`, `door-opening.jpg`, `door-open.jpg`, `hall.jpg`, `living-room.jpg`, `kitchen.jpg`, `landing.jpg`, `sky-room.jpg`.
- **Live windows & open door (part 2):** `window-living.jpg`, `window-study.jpg`, `window-dining.jpg`, `window-bedroom-2.jpg`, `window-bedroom-3.jpg`, `window-sky-room.jpg`, `door-from-hall.jpg`, `living-left.jpg`, `living-right.jpg`, `living-rain.jpg`, `living-night.jpg`, `dining-from-kitchen.jpg`, `hall-two-views.jpg`.
- **Painted-in light (part 3):** `light-living-noon.jpg`, `light-living-overcast.jpg`, `light-living-dusk.jpg`, `light-living-night.jpg`, `light-living-out.jpg`, `light-hall-night.jpg`, `light-master-day.jpg`, `light-master-lit.jpg`, `light-kitchen-dining.jpg`, `light-doorway-night.jpg`, `light-halo-window.jpg`, `light-fallback.jpg`.
- **Furnished ground floor (parts 4a–4d):** `furnish-living-{noon,overcast,night}.jpg`, `furnish-hearth-back.jpg`, `furnish-window-seat-open.jpg`, `furnish-bookshelf.jpg`, `furnish-table-lamp-night.jpg`, `furnish-low-floor.jpg`, `furnish-hall-{day,night}.jpg`, `furnish-stair-foot.jpg`, `furnish-hooks-bench.jpg`, `furnish-kitchen-{day,night,from-hearth,west-wall}.jpg`, `furnish-range.jpg`, `furnish-dresser.jpg`, `furnish-dining-{day,night,window,from-kitchen-side,from-arrival}.jpg`, `furnish-low-dining-floor.jpg`, `furnish-study-{day,night,desk,reading}.jpg`, `furnish-passage-{day,lit}.jpg`, `furnish-master-{day,night,bed-lit,bed-out,wardrobes}.jpg`, `furnish-hall-to-{study,master}.jpg`, `furnish-low-bed-floor.jpg`, `furnish-bath-{day,lit,wall,tub-shower,from-wardrobes}.jpg`, `furnish-low-tub-floor.jpg`, `furnish-laundry-{door,inside}-{day,lit}.jpg`, `furnish-pantry-{door,inside}-{day,lit}.jpg`, `furnish-pantry-shelf-close.jpg`.
- **Furnished upper floor (parts 4e–4f):** `furnish-landing-{day,lit}.jpg`, `furnish-nook-{day,lit,slope-close}.jpg`, `furnish-bedroom2-{day,lit,chest}.jpg`, `furnish-bedroom3-{day,lit,desk}.jpg`, `furnish-skyroom-{day,lit,close}.jpg`, `furnish-hall-up-stairwell.jpg`, `furnish-bath-upper-{from-nook,lit,eave,basin}.jpg`, `furnish-box-room-{day,lit}.jpg`, `furnish-linen-{day,lit,eave}.jpg`.
- **Flat-light fallback (`inside.fallBack()`):** `furnish-fallback-*.jpg` for all 18 rooms.

## Automated evidence

`scripts/check-space-browser.mjs` runs **135 numbered checks** (checks **1–31** for the yard and living things, checks **32–135** for the cabin interior, recorded in [browser-results.json](browser-results.json)):

- **32–39 (Shell & threshold):** `?interior=0` keeps the door shut and builds no interior; default page opens the door and fades into the hall with `waterMask === 0`; stair climb rises 3 m to floor 1; version-2 indoor place memory restores room and floor; Return button fades to arrival; walking out faces away from the door; forced build failure keeps the door shut with one warning.
- **40–51 (Live windows & open door):** all 6 windows and the open door render live yard views, shift with parallax, show rain streaks only through glass, darken at night, respond to the open casement, stay live on `plain`, leave arrival yard pixels unchanged versus `?interior=0` (check 49), and hold `≤ 1.1×` yard frame cost (check 50).
- **52–70 (Light):** clear noon gradient (dedicated clock-shifted noon server), overcast dimming, dusk lamp glow, burning fire and warm hearth slab, midnight legibility with all lamps out, hall night lamp asleep, master lamp contrast, light passing through openings without leaking through solid walls, doorway warmth from the yard, deterministic pixel identity, zero Three.js light sources, night speed `≤ 1.1×` yard (check 63), halo over live roof pane, and `fallBack()` keeping rooms lit and windows live.
- **71–133 (Furnishing, slices 4a–4f):** 17 merged furniture sets (`76,627` vertices in `65` meshes across all 18 rooms), walker collision and clear ways through, build-time budgets, per-room lamp shade tracking, pixel-identical unseen-room hiding (`0` differing pixels vs `&hide=0` including 360° turns), two-stage build lifecycle, determinism, `fallBack()` across every room, and paired speed / ABBA regression checks (`94`, `107`, `119`, `128`).
- **134–135 (Part 5 default-on & opt-out):** default load stays lazy at arrival (`inside === null`, `passage` active, WebGL2 `stencil === true`), legacy `?interior=1` still enters cleanly, and a remembered version-2 indoor pose falls back to yard arrival under `?interior=0` while restoring indoors by default.

### Budgets and measured figures (Apple M1, Chrome/ANGLE, 1440 × 810, tier `full`)

Figures below come directly from the committed awake 60 Hz run in [browser-results.json](browser-results.json) (**133 / 135 PASS** across the full suite, **102 / 104** interior checks passing, **0** page or console errors):

- **Total interior furniture:** `17` sets, `65` meshes, `76,627` vertices across all `18` rooms.
- **Build times (all 6 build checks PASS, awake 60 Hz, median of 3 loads):**
  - First build at the door (`73`: `hall` + `living`, added over `&bare=1`): **`+63.0 ms`** first-only / **`+63.8 ms`** full (limit `≤ 80 ms`).
  - Floor-0 queued 8 rooms (`83`, `90`, `104`): **`146.2 ms`** total (`kitchen 31.1 ms`, `dining 26.6 ms`, `study 29.5 ms`, `passage 4.3 ms`, `master 17.1 ms` [3-sum `50.9 ms`], `bath-ground 10.9 ms`, `laundry 9.2 ms`, `pantry 17.5 ms` [3-sum `37.6 ms`]; limit `< 180 ms`).
  - Floor-1 queued 8 rooms (`116`, `126`): **`108.7 ms`** total (`landing 4.0 ms`, `bedroom-2 10.6 ms`, `bedroom-3 11.4 ms`, `sky-room 11.2 ms`, `nook 29.9 ms` [5-sum `67.1 ms`]; `bath-upper 12.7 ms`, `box-room 9.8 ms`, `linen 19.1 ms` [3-sum `41.6 ms`]; limits `≤ 50 ms` for 4f, `≤ 120 ms` for all 8).
- **Speed and ABBA regression (part 5 interleaved paused-tab batching, 12 / 14 PASS):**
  - Passing speed checks: `50` (`1.057×`), `63` (`1.012×`), `78` (`+0.040`), `91` (day `1.063×`, `+0.022`; night `0.995×`, `-0.040`), `92` (day `0.816×`, `-0.017`; night `0.842×`, `-0.001`), `105` (day `0.816×`, `+0.013`; night `0.830×`, `+0.010`), `117` (day `0.832×`, `+0.012`; night `0.833×`, `+0.023`), `118` (day `1.066×`, `+0.013`; night `1.062×`, `+0.039`), `127` (day `0.832×`, `-0.008`; night `0.831×`, `+0.006`).
  - Passing ABBA checks: `94` (`[-0.021, +0.010]`), `107` (`[-0.011, +0.010]`), `119` (`[-0.002, +0.005]`), with **0 added draw calls** at every non-visible pose (`s0..s5`, `u1`) and `+7` at `u0`.
  - Two transient GPU-timing misses in the committed run: check `81` (`[5.2, 7.9]` dining window) recorded day `1.111×` / `+0.077` against `≤ 1.1×` / `≤ +0.05` (night passed at `1.057×` / `-0.012`, and draw calls passed at `+7` in check `82`), and check `128` (16-pose ABBA vs `&furnish=4e`) passed 15 of 16 poses (`[-0.008, +0.009]`, `u0` `+0.003`/`-0.001`) with `0` added draw calls at `s0..s5` and `u1` while `s3-night` (study, `31/31` draw calls) landed at `+0.012` against `+0.010`.
- **Node unit tests:** `897 / 897` passing across the repository (`npm test`), and all syntax checks passing (`npm run check`).

*Power-throttling caveat:* When macOS enters screen-lock / 30 Hz low-power throttling during a long unattended run, CPU build times scale ~1.4× across all rooms while GPU frame ratios remain valid; run with the machine awake for build-budget verification.

## What was not measured

- No phone, tablet, or integrated-GPU (non-Apple-Silicon) measurement indoors; whether `full` holds 24 fps on modest hardware with 1–3 live windows is unknown.
- Only Chrome/Chromium through ANGLE/Metal on macOS was exercised; Safari, Firefox, Linux/Windows GPU drivers, and touch navigation remain untested.
- `WEBGL_multisampled_render_to_texture` behaviour is covered by Node unit tests (`test/space-view.test.js`), not on a physical mobile GPU that exposes the extension.

## What still looks weakest

- **Brush scale on small furniture:** reusing the yard's broad brush textures makes fine furniture details (crockery, books, lamp fittings, folded linen) look coarser up close than the room shells.
- **Grounding without cast shadows:** darkened floor strips keep pieces from floating, yet remain subtle under bright daylight or in low-angle views.
- **Shared surface palettes:** plaster, boards, fabric, wood, and stone are tinted from the yard's bundle without dedicated interior tile, rug-pattern, or wallpaper plates.
- **Non-interactive interiors:** switches, taps, drawers, cupboard doors, interior doors, and the sky room's telescope are purely visual (an interactive sky-room telescope is deferred to a future block).

## Reproduction

```sh
A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start
BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/check-space-browser.mjs
```

Environment overrides: `SKY_PREVIEW_URL` (default `http://127.0.0.1:4190`), `BROWSER_EXECUTABLE`, `SKY_GPU=metal`, `NOON_PORT`, `ABBA_PAIRS` (even integer `≥ 2`, default `2` balanced context pairs × 6 rounds = 12 pairs), `SPACE_VALIDATION_DIR`, and `INTERIOR_VALIDATION_DIR`.
