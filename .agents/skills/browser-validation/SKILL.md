---
name: browser-validation
description: >-
  Run Playwright browser check suites, visual review captures, and ABBA
  performance checks for A View. Use when verifying 3D yard or cabin interior
  changes, running scripts/check-*-browser.mjs or scripts/capture-space-review.mjs,
  debugging GPU timing or visual regressions, or updating validation artifacts.
---

# Browser Validation & Capture Workflow

All browser suites drive a real page via optional dev-only Playwright against a
local server you start yourself. They do **not** run in CI.

## 1. Start a Throwaway Server

Never point a test server at `data/world.sqlite`. Always use a temporary SQLite
database on the suite's default port (or pass `SKY_PREVIEW_URL`):

| Suite | Script | Default Port | Validation Output Dir |
| :--- | :--- | :--- | :--- |
| 3D yard & cabin interior (135 checks) | `scripts/check-space-browser.mjs` | `4190` | `docs/space-validation/`, `docs/interior-validation/` |
| 3D visual review pack | `scripts/capture-space-review.mjs` | `4190` | `docs/space-validation/review/` |
| Dynamic sky / celestial / display | `scripts/check-{sky,celestial}-browser.mjs`, `check-sky-display.mjs` | `4174` | `docs/sky-validation/`, `docs/celestial-validation/` |
| Field notes | `scripts/check-field-notes-browser.mjs` | `4175` | `docs/field-notes-validation/` |
| Keep this view | `scripts/check-keep-view-browser.mjs` | `4176` | `docs/keep-view-validation/` |
| Sound (Chromium / Firefox) | `scripts/check-sound-{browser,firefox}.mjs` | `4177` | `docs/sound-validation/` |
| Quiet coincidences | `scripts/check-coincidences-browser.mjs` | `4181` | `docs/coincidences-validation/` |
| Foliage / weather / cottage / bird | `scripts/check-{foliage,weather,cottage,bird,engagement}-browser.mjs` | `4174` | `docs/<feature>-validation/` |

```sh
TMP_DB_DIR="$(mktemp -d)"
A_VIEW_DB="$TMP_DB_DIR/world.sqlite" PORT=4190 node src/server.js
```

## 2. Run the Suite (macOS & GPU Gotchas)

- **Installed Chrome fallback:** If Playwright's bundled Chromium shell is not
  installed, set:
  ```sh
  BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ```
- **Prevent display-sleep throttling (critical for build/speed budgets):**
  Unattended macOS screen lock drops refresh to ~30 Hz and throttles CPU build
  times ~1.4×. Wrap long runs with `caffeinate -di`:
  ```sh
  caffeinate -di env \
    BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    node scripts/check-space-browser.mjs
  ```
- **Shared environment overrides:**
  - `SKY_PREVIEW_URL` — target base URL (e.g., `http://127.0.0.1:4190`)
  - `SKY_GPU=metal` — opt into Chrome's ANGLE Metal backend (default is ANGLE)
  - `ABBA_PAIRS` — even integer ≥ 2 for `check-space-browser.mjs` ABBA passes (default `2`)
  - `NOON_PORT` — port for the clear-noon helper server spawned by check 52
  - `SPACE_VALIDATION_DIR` / `INTERIOR_VALIDATION_DIR` / `*_VALIDATION_DIR` — redirect outputs for scratch runs without dirtying `docs/*-validation/`

## 3. Useful `?check` Fixtures & Review Captures

- Query fixtures (honoured only with `?check`):
  - `?check&tier=full|light|plain` — lock render tier
  - `?interior=0` — disable cabin interior (closed door, no stencil buffer)
  - `?space=0` — 2D painting fallback (never loads three.js)
  - `?check&hide=0` — disable sightline hiding of unseen rooms
  - `?check&bare=1` — unfurnished interior baseline
  - `?check&furnish=first|4b|4c|4d|4e` — slice furnishing baselines
- Review packs:
  ```sh
  node scripts/capture-space-review.mjs --only arrival,cabin-front --tier full --study day
  node scripts/capture-space-review.mjs --compare
  node scripts/capture-space-review.mjs --life
  node scripts/capture-space-review.mjs --garden --only day-230,year-2
  ```
- Unlinked developer studies live under `/dev/` (e.g. `/dev/sky-study.html`,
  `/dev/sound-study.html`) and return 404 when `NODE_ENV=production`.

## 4. Extending Checks & Committing Validation Evidence

1. **Preserve check numbers:** Specs and PRs reference checks in
   `scripts/check-space-browser.mjs` by their 1-based run number (currently
   `1–135`). Always **append** new checks at the end; never renumber existing ones.
2. **Wait for rendered pose before timing:** `app.js` caps `SpaceView.render` at
   30 fps. Before pausing a tab or timing GPU batches, use `waitRender(page)` (wait
   for `lastStep` to advance), not `requestAnimationFrame`.
3. **Selective image commits:** `.gitignore` ignores generated images in
   `docs/*-validation/` and re-includes specific representative frames with `!`.
   Add a `!` line in `.gitignore` for any new kept capture, and restore untouched
   tracked images (`git checkout -- 'docs/interior-validation/*.jpg'`) if a run
   regenerates them without visual changes.
4. **Honest doc sync:** Every number published in `docs/*-validation/README.md`
   and the feature spec's **As built** section must match the committed
   `browser-results.json` 1-to-1, including any transient timing misses.

## 5. Teardown & Verification

- Stop the background server and remove `$TMP_DB_DIR`.
- Run `git status -sb` to confirm `data/world.sqlite` is untouched and no
  unintended capture files are modified.
- Run `node --check scripts/check-space-browser.mjs` if you edited the suite.
