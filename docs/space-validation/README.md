# Walkable yard validation (phase 1 blockout)

Recorded November 15, 2026, against the `?space=1` blockout on branch `claude/navigable-yard`. The server ran on port 4190 against a disposable SQLite database; production state and deployment were untouched. The check used Node.js 26.7.0, Playwright 1.65.1 and its Chromium headless shell on an Apple M1.

## What this is

An untextured blockout. The yard, cabin, oak, wall, ground, water and hills are flat muted colours under the shared procedural sky; the only texture is the existing cloud atlas. There is no painterly pass. It is a test of walking, memory and fallback, not of how the place should look.

The [arrival frame](arrival.png) is the first view at `?space=1`: the arrival pose, looking east across the yard toward the cabin and the lake. The [remembered frame](remembered.png) is the view after walking, turning and looking up, standing still for 3.5 s and reloading the page.

## Automated evidence

`node scripts/check-space-browser.mjs` — last run: **10 PASS, 0 FAIL**, exit code 0, no page errors. Full detail is in [space-browser-results.json](space-browser-results.json).

1. `/` makes no request containing `three-` (50 requests in two seconds after load) and `#space` stays hidden.
2. `/?space=1&check` reaches `window.__space` with `state` exactly equal to `LAKESIDE_SPACE.arrival` (`[0, 0]`, yaw 90°, pitch 0).
3. Holding W (real keyboard) for 2.00 s walks 2.80 m east (window 2.2–3.2 m; 1.4 m/s × measured hold = 2.81 m), with no northward drift.
4. Shift+W held for 40 s from yaw 0°, 90°, 180° and 270°, four visitors walking at once, sampled every 250 ms (161 samples each): every sample is `walkable`. The walkers reached the north wall (24.0 m), the curving shore below the cabin (25.4 m east), the water's edge (8.7 m south) and the west wall (14.0 m).
5. With W held, opening `#about-dialog` leaves the position unchanged over 1 s.
6. After walking, turning (E) and a real mouse drag (pitch 0.2 rad), 3.5 s still, then reload: the restored state matches to within 1e-6, and the place key was already written to `localStorage` before the reload.
7. Field notes → **Forget visit memory** removes the place key; the reload arrives at the arrival pose.
8. With `getContext('webgl2')` patched to return `null` before any page script runs, `?space=1` shows the painting, `#space` stays hidden, and there are no page errors.
9. `loseContext()` on the 3D canvas's own context returns to the painting in under 20 ms (limit 2 s).
10. At 390 × 844 the vertical field of view is 75° (the cap) and the centre pixel differs from the top-left corner pixel of a freshly drawn frame.

The arrival frame measured 242,272 triangles in 13 draw calls (`renderer.info.render`).

## Browser configuration

The script launches Chromium with `--use-gl=angle`, which on this machine selected "ANGLE Metal Renderer: Apple M1" and held the app's 30 fps loop. Headless Chromium's default renderer here is SwiftShader (software Vulkan), which drew the scene at about 8.6 fps. That is below the walker's 0.1 s per-frame step cap, so walking ran slow: in a first run under SwiftShader, check 3 measured 1.68 m in 2.23 s, and the four parallel walkers took only 35–44 samples in 40 s. Those failures were the software rasteriser, not the view, so the script uses ANGLE by default. `SKY_GPU=metal` adds `--enable-gpu --use-angle=metal` as in the other suites. Check 3 kept the brief's fixed 2.2–3.2 m window; it did not need the elapsed-time variant.

## Limits

- No frame-rate measurement has been taken on a phone or on an integrated GPU. The scene is about 242,000 triangles in about a dozen draw calls; whether that holds 30 fps on modest hardware is unknown.
- Headless rendering, software or GPU-backed, is not a performance measurement. The SwiftShader figure above only explains the configuration choice.
- Only Chromium was exercised. Safari, Firefox and touch input are untested.
- The checks prove the walker stays on walkable ground for the sampled positions and headings; they do not prove every possible path.

## Reproduction

```sh
npm install --no-save playwright
npx playwright install chromium-headless-shell
A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start
node scripts/check-space-browser.mjs
```

The script reads `SKY_PREVIEW_URL` (default `http://127.0.0.1:4190`), `BROWSER_EXECUTABLE`, `SKY_GPU` and `SPACE_VALIDATION_DIR` (default `docs/space-validation`). Playwright is a development-only, optional tool, not a runtime dependency. Captures other than the two above are ignored by Git.
