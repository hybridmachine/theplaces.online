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

## 1. Server Setup & Suite Output Controls

Never point a test server at `data/world.sqlite`. Most suites drive a local
server you start yourself against a temporary SQLite database on the suite's
default port (or pass `SKY_PREVIEW_URL`); two suites start their own ephemeral
server and ignore `SKY_PREVIEW_URL`.

| Suite | Script | Server / Port | Output Dir & Env Override |
| :--- | :--- | :--- | :--- |
| 3D yard & cabin interior (135 checks) | `scripts/check-space-browser.mjs` | Manual, `4190` | `SPACE_VALIDATION_DIR` (`docs/space-validation/`), `INTERIOR_VALIDATION_DIR` (`docs/interior-validation/`) |
| 3D visual review pack | `scripts/capture-space-review.mjs` | Manual, `4190` | Hard-coded `docs/space-validation/` |
| Dynamic sky / celestial / display | `scripts/check-{sky,celestial}-browser.mjs`, `check-sky-display.mjs` | Manual, `4174` | `SKY_VALIDATION_DIR` (`docs/sky-validation/` or `docs/celestial-validation/`) |
| Field notes | `scripts/check-field-notes-browser.mjs` | Manual, `4175` | `NOTES_VALIDATION_DIR` (`docs/field-notes-validation/`) |
| Keep this view | `scripts/check-keep-view-browser.mjs` | Manual, `4176` | `KEEP_VALIDATION_DIR` (`docs/keep-view-validation/`) |
| Sound (Chromium) | `scripts/check-sound-browser.mjs` | Manual, `4177` | `SOUND_VALIDATION_DIR` (`docs/sound-validation/`) |
| Quiet coincidences | `scripts/check-coincidences-browser.mjs` | Manual, `4181` | `COINCIDENCE_VALIDATION_DIR` (`docs/coincidences-validation/`) |
| Bird / cottage / foliage / weather | `scripts/check-{bird,cottage,foliage,weather}-browser.mjs` | Manual, `4174` | **Hard-coded** `docs/<feature>-validation/` (no env override) |
| Sound (Firefox) | `scripts/check-sound-firefox.mjs` | **Self-hosted ephemeral port** (ignores `SKY_PREVIEW_URL`) | `SOUND_VALIDATION_DIR` (`docs/sound-validation/`) |
| Engagement review | `scripts/check-engagement-browser.mjs` | **Self-hosted ephemeral port** (ignores `SKY_PREVIEW_URL`; optional `ENGAGEMENT_ROOT`) | **Hard-coded** `docs/engagement-validation/` (no env override) |

For manual-server suites, start a throwaway server first:
```sh
TMP_DB_DIR="$(mktemp -d)"
A_VIEW_DB="$TMP_DB_DIR/world.sqlite" PORT=4190 node src/server.js
```

For `scripts/check-sound-firefox.mjs`, do **not** start a server and note that
it launches Firefox directly via `FIREFOX_EXECUTABLE` (defaulting to the Windows
path `C:\Program Files\Mozilla Firefox\firefox.exe`), not `BROWSER_EXECUTABLE`.
On macOS:
```sh
FIREFOX_EXECUTABLE="/Applications/Firefox.app/Contents/MacOS/firefox" \
  node scripts/check-sound-firefox.mjs
```

## 2. Run the Suite (macOS & GPU Gotchas)

- **Installed Chrome fallback (Playwright suites):** If Playwright's bundled
  Chromium shell is not installed, export `BROWSER_EXECUTABLE` so child `node`
  commands inherit it:
  ```sh
  export BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ```
- **Prevent display-sleep throttling (critical for build/speed budgets):**
  Unattended macOS screen lock drops refresh to ~30 Hz and throttles CPU build
  times ~1.4×. Wrap long runs with `caffeinate -di`:
  ```sh
  TMP_OUT="$(mktemp -d)"
  caffeinate -di env \
    BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    SPACE_VALIDATION_DIR="$TMP_OUT/space" \
    INTERIOR_VALIDATION_DIR="$TMP_OUT/interior" \
    node scripts/check-space-browser.mjs
  ```
- **Shared environment overrides:**
  - `SKY_PREVIEW_URL` — target base URL for manual-server suites (e.g., `http://127.0.0.1:4190`)
  - `SKY_GPU=metal` — opt into Chrome's ANGLE Metal backend (default is ANGLE)
  - `ABBA_PAIRS` — even integer ≥ 2 for `check-space-browser.mjs` ABBA passes (default `2`)
  - `NOON_PORT` — port for the clear-noon helper server spawned by check 52
  - Output redirection works **only** on scripts that read an explicit env var
    (`SPACE_VALIDATION_DIR`, `INTERIOR_VALIDATION_DIR`, `SKY_VALIDATION_DIR`,
    `NOTES_VALIDATION_DIR`, `KEEP_VALIDATION_DIR`, `SOUND_VALIDATION_DIR`,
    `COINCIDENCE_VALIDATION_DIR`). `bird`, `cottage`, `foliage`, `weather`, and
    `engagement` hard-code their `docs/*-validation/` paths and will overwrite
    repo evidence if run directly.

## 3. Public Opt-Outs, `?check` Fixtures & Review Captures

- **Public visitor opt-out flags (always active without `?check`):**
  - `?space=0` — 2D painting fallback (checked directly in `public/app.js`; never loads three.js)
  - `?interior=0` — disable cabin interior (checked in `interiorSwitch` before `?check`; closed door, no stencil buffer)
  - Never gate either flag behind `?check`, as that breaks existing visitor links.
- **`?check`-gated test fixtures (ignored unless `?check` is present):**
  - `?check&tier=full|light|plain` — lock render tier
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
3. **Selective image commits without clobbering work:** `.gitignore` ignores
   generated images in `docs/*-validation/` and re-includes specific
   representative frames with `!`. Add a `!` line in `.gitignore` for any new
   kept capture. For `check-space-browser.mjs`, run with `SPACE_VALIDATION_DIR`
   and `INTERIOR_VALIDATION_DIR` pointed at temporary directories first, then
   copy back only the specific `browser-results.json` or retained captures
   selected for the PR—avoid directory-wide `git checkout` commands that can wipe
   unstaged changes to retained frames.
4. **Honest doc sync:** Every number published in `docs/*-validation/README.md`
   and the feature spec's **As built** section must match the committed
   `browser-results.json` 1-to-1, including any transient timing misses.

## 5. Teardown & Verification

- Stop the background server and remove `$TMP_DB_DIR` (and `$TMP_OUT` if used).
- Run `git status -sb` to confirm `data/world.sqlite` is untouched and no
  unintended capture files are modified.
- Run `node --check scripts/check-space-browser.mjs` if you edited the suite.
