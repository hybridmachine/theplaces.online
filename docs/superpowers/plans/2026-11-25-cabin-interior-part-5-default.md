# Cabin Interior Part 5 (Interior Default, ABBA Hardening & Close-Out Docs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended or superpowers:executing-plans to implement this plan task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the cabin interior by default (mirroring `?space=0` with `?interior=0` as opt-out and keeping `?interior=1` harmless), harden the four ABBA speed-regression checks in `scripts/check-space-browser.mjs`, verify all 135 browser checks pass, and update all project documentation (`README.md`, `DESIGN.md`, `ARTWORK.md`, `CLAUDE.md`, parent spec, 4f spec status, `docs/space-validation/README.md`, and a new `docs/interior-validation/README.md`).

**Architecture:** Minimal runtime change: flip `interiorSwitch` in `public/space/space-view.js` from opt-in (`!== '1'`) to opt-out (`=== '0'`). All laziness, stencil gating, fallback paths, and `PlaceMemory` validation already follow `this.interior !== null`. In `scripts/check-space-browser.mjs`, factor the four duplicated ABBA loops (checks 94, 107, 119, 128) into one shared `measureAbba(...)` helper using per-round paired `roomMs / yardMs` ratios and 6 balanced pairs (`3 AB + 3 BA`), drop `&interior=1` from the interior checks, flip check 32 to `&interior=0` and check 49 to compare `&interior=0` vs default, and append checks 134–135.

**Tech Stack:** Plain ES modules, three.js 0.170 (vendored), `node --test`, Playwright (`scripts/check-space-browser.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-25-cabin-interior-part-5-default-design.md`. Read it alongside `2026-11-17-cabin-interior-design.md` and `2026-11-24-cabin-interior-part-4f-upper-bath-box-linen-furnishing-design.md` before starting.

## Global Constraints

- **No runtime bloat or startup regression.** Interior geometry must remain lazy (`buildInside()` only runs on indoor startup or when approaching the door within 1.5 m). `?space=0` must still request nothing of `three-`, `/space/`, or `lakeside-space-v1`.
- **No blueprint, furniture, light, or window behaviour changes.** Only `interiorSwitch` changes in runtime code.
- **No loosened budgets.** All build-time limits, mesh limits, draw-call limits, and ABBA speed thresholds (`0.01` / `0.02`) stay unchanged.
- **Stable check numbers.** Checks **1–133** in `scripts/check-space-browser.mjs` keep their exact numbers; new checks are appended at **134–135**.
- **Housekeeping.** No new `.js`/`.mjs` files are expected; if any are added, add them to `npm run check` in `package.json`. Never touch `data/world.sqlite` — always run browser checks against a throwaway `A_VIEW_DB`.
- **Branch.** Work on `claude/interior-default` (branched off 4f; rebase onto `main` once PR #33 merges). Commit after each task.

## Review Focus

- **Opt-out & fixture precedence.** `interiorSwitch('?interior=0')` returns `null`, `interiorSwitch('?interior=0&check&bare=1')` returns `null`, `interiorSwitch('')` and `interiorSwitch('?interior=1')` return `LAKESIDE_INTERIOR`, and `&bare=1` / `&furnish=...` still require `?check`. Task 1.
- **ABBA math & symmetry.** `measureAbba` uses per-round `rMs / yMs` ratios inside each page load, compares `a.ratio - b.ratio` across an even number of balanced pairs (default 6: `3 AB + 3 BA`), keeps every `0.01` / `0.02` limit and draw-call assertion intact, and logs both ratio diffs and raw-ms diffs. Task 2.
- **Default yard untouched.** Checks 1–31 (including 40 s walks in check 5, frame rates in checks 11 & 31, tier settling in check 20, lit windows in check 13) and check 49 (arrival pixel equality vs `?interior=0`) all pass with the interior active by default, and check 134 proves `inside === null` at arrival. Tasks 2–3.
- **Honest documentation.** `README.md`, `DESIGN.md`, `ARTWORK.md`, `CLAUDE.md`, `docs/interior-validation/README.md`, and the specs stay factual, concise, and consistent with measured numbers. Task 4.

## File Structure

- `public/space/space-view.js`: flip `interiorSwitch` from opt-in (`!== '1'`) to opt-out (`=== '0'`).
- `test/space-view.test.js`: update and expand `interiorSwitch` unit tests for default-on, `?interior=0`, `?interior=1`, and `?check` fixtures.
- `scripts/check-space-browser.mjs`: extract `measureAbba`, update checks 32–133 to test the default page (with `?interior=0` for checks 32 & 49), add checks 134–135.
- `README.md`, `DESIGN.md`, `ARTWORK.md`, `CLAUDE.md`, `docs/space-validation/README.md`: update for default-on interior and art/design provenance.
- `docs/interior-validation/README.md` (new): interior validation guide, capture index, budgets, and honest limits.
- `docs/superpowers/specs/2026-11-17-cabin-interior-design.md`, `docs/superpowers/specs/2026-11-24-cabin-interior-part-4f-upper-bath-box-linen-furnishing-design.md`, `docs/superpowers/specs/2026-11-25-cabin-interior-part-5-default-design.md`: status updates and As built / Measured records.

---

### Task 1: Flip `interiorSwitch` to default-on with `?interior=0` opt-out

**Files:**
- Modify: `public/space/space-view.js`
- Test: `test/space-view.test.js`

**Interfaces:**
- `interiorSwitch(search)`:
  - `''` → `LAKESIDE_INTERIOR`
  - `'?interior=1'` → `LAKESIDE_INTERIOR`
  - `'?interior=0'` → `null`
  - `'?interior=0&check&bare=1'` → `null`
  - `'?check&bare=1'` → bare interior
  - `'?check&furnish=first|4b|4c|4d|4e'` → corresponding slice fixture (ignored without `?check`; `&bare=1` wins over `&furnish=`).

- [ ] **Step 1: Write failing tests** in `test/space-view.test.js`:
  - Add a dedicated test covering `interiorSwitch('') === I`, `interiorSwitch('?interior=1') === I`, `interiorSwitch('?interior=0') === null`, `interiorSwitch('?interior=0&check') === null`, `interiorSwitch('?interior=0&check&bare=1') === null`, `interiorSwitch('?interior=0&check&furnish=first') === null`, and `interiorSwitch('?check&bare=1')` returning bare without `interior=1`.
  - Update the `&furnish=first|4b|4c|4d|4e` and `hidingSwitch` tests (lines 738–813) so they exercise default queries (`?check&furnish=...`) and also verify `?interior=1&check&furnish=...` still works identically.
- [ ] **Step 2: Run** `node --test test/space-view.test.js`. Expected: FAIL (because `interiorSwitch('')` still returns `null`).
- [ ] **Step 3: Implement** the one-line change and updated comment in `public/space/space-view.js` (`if (params.get('interior') === '0') return null;`).
- [ ] **Step 4: Run** `npm run check && npm test`. Expected: PASS (all unit tests green).
- [ ] **Step 5: Commit** (including the Part 5 spec and this plan):
  `git commit -m "Enable the cabin interior by default; ?interior=0 keeps the door shut"`

---

### Task 2: Harden ABBA timing and update browser checks for default-on interior

**Files:**
- Modify: `scripts/check-space-browser.mjs`

**Interfaces:**
- Add shared helper `measureAbba(specs, baseQuery, {pairs = ABBA_PAIRS, buildRest = false} = {})` where `ABBA_PAIRS` parses `process.env.ABBA_PAIRS` (default `6`, even ≥ 2):
  - Runs `pairs` alternating pairs (`pair % 2 === 0 ? [['all', ''], ['base', baseQuery]] : [['base', baseQuery], ['all', '']]`).
  - Inside each page load, for each spec grouped by `study`, runs 6 rounds (`k = 0..5`) of back-to-back 20-frame yard and room draws, computing per-round `rMs / yMs` ratios; drops warmup round `0` and returns `{ratio, roomMs, yardMs}`.
  - Computes per-spec `pairDiffs` (`+(a.ratio - b.ratio).toFixed(3)`), `rawPairDiffs` (`+((a.roomMs - b.roomMs) / ((a.yardMs + b.yardMs) / 2)).toFixed(3)`), median `diff`, median `all` and `base` ratios, and `quiet`.
- Update existing checks (preserving numbers 1–133):
  - Check **32**: load `${base}/?check&interior=0`; update description to `?interior=0`.
  - Check **33**: load `${base}/?check` (default); update description to default page.
  - Checks **39–48**, **50–133**: remove `&interior=1` from page URLs (leaving `${base}/?check&tier=full...` or `${base}/?check`).
  - Check **49**: compare `['?check&interior=0', '?check&interior=0', '?check']`; update description to default vs `?interior=0`.
  - Check **71**: update description from `?interior=1` / without `?interior=1` to default / `?interior=0`.
  - Checks **94, 107, 119, 128**: replace duplicated ABBA loops with `measureAbba(...)`, keeping all limits (`NOISE = 0.01`, `0.02` for visible doorways) and draw-call assertions unchanged.
- Append new checks:
  - Check **134**: default load (`/?check`) at arrival keeps `inside === null`, `!!passage === true`, WebGL2 `stencil === true`; legacy `/?check&interior=1` enters the entry hall cleanly with 0 errors.
  - Check **135**: seeded version-2 indoor place (`floor: 1`, `upperSpots.linenShelf`) falls back to arrival with `inside === null` under `/?check&interior=0`, and restores `linen cupboard` on frame 1 with all floor-1 furniture and the linen description clause under `/?check`, with 0 errors.

- [ ] **Step 1: Refactor ABBA checks 94, 107, 119, 128** onto `measureAbba(...)`.
- [ ] **Step 2: Update checks 32–133** for default-on interior and `?interior=0` opt-out, and append checks **134–135**.
- [ ] **Step 3: Syntax check** with `npm run check`. Expected: PASS.
- [ ] **Step 4: Commit**:
  `git commit -m "Harden ABBA speed checks and update browser suite for default-on interior"`

---

### Task 3: Run full 135-check browser verification

**Files:**
- Updated outputs: `docs/space-validation/space-browser-results.json`, `docs/interior-validation/browser-results.json` (plus any refreshed captures if needed — check `git status` / `git diff --stat` to ensure no unintended capture churn).

- [ ] **Step 1: Start a throwaway server** on port 4190:
  ```sh
  A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start
  ```
- [ ] **Step 2: Run the full suite** (awake, not thermally throttled):
  ```sh
  node scripts/check-space-browser.mjs
  ```
  Expected: **135 PASS, 0 FAIL**, exit code `0`, 0 page or console errors.
- [ ] **Step 3: Inspect the results JSON** for:
  - Check 11 & 31 yard frame costs (confirm default stencil has no noticeable regression and tier settles on `full`, locked).
  - Check 49 arrival pixel diff between `?interior=0` and default (`<= 0.02`, expected near `0`).
  - Checks 94, 107, 119, 128 ABBA pair diffs (confirm clean margins across all 6 pairs).
  - Checks 126, 134, 135 build times and lifecycle assertions.
- [ ] **Step 4: Stop the throwaway server** and verify `data/world.sqlite` is untouched (`git status`).
- [ ] **Step 5: Commit** updated validation results (`docs/interior-validation/browser-results.json` and `docs/space-validation/space-browser-results.json` if appropriate — inspect diff first).

---

### Task 4: Update documentation and record Part 5 as built

**Files:**
- Modify: `README.md`, `DESIGN.md`, `ARTWORK.md`, `CLAUDE.md`, `docs/space-validation/README.md`, `docs/superpowers/specs/2026-11-17-cabin-interior-design.md`, `docs/superpowers/specs/2026-11-24-cabin-interior-part-4f-upper-bath-box-linen-furnishing-design.md`, `docs/superpowers/specs/2026-11-25-cabin-interior-part-5-default-design.md`
- Create: `docs/interior-validation/README.md`

- [ ] **Step 1: Update `README.md`:**
  - Retitle `## Walking the yard (preview)` → `## Walking the yard and cabin`.
  - Document that the cabin door opens by default when approached (`?interior=0` keeps the door shut, mirroring `?space=0`).
  - Update Honest limits: 135 checks, link to `docs/interior-validation/README.md`, plain list of interior limits.
- [ ] **Step 2: Update `DESIGN.md`:**
  - Update the implementation checkpoint note and clarify the "Each scene has an authored camera and composition" working assumption for the walkable 3D yard and cabin interior (keeping the original September 18 proposal intact).
- [ ] **Step 3: Update `ARTWORK.md`:**
  - Add `## Cabin interior, version 1` recording texture reuse (`lakeside-space-v1`), vertex-authored light, deterministic code-authored geometry, and artistic limits.
- [ ] **Step 4: Update `CLAUDE.md` and `docs/space-validation/README.md`:**
  - Reflect that the cabin interior is on by default (`?interior=0` opts out) and update check 52's note in `docs/space-validation/README.md`.
- [ ] **Step 5: Create `docs/interior-validation/README.md`:**
  - Summarize Parts 1–5, committed captures, checks 32–135, measured build/frame budgets, what was not measured, what still looks weakest, and reproduction steps.
- [ ] **Step 6: Update specs:**
  - Mark `2026-11-24-cabin-interior-part-4f-upper-bath-box-linen-furnishing-design.md` status approved & merged.
  - Mark `2026-11-17-cabin-interior-design.md` status complete (parts 1–5) and add a brief **As built** summary.
  - Add **As built** and **Measured** sections to `2026-11-25-cabin-interior-part-5-default-design.md` with the numbers from Task 3.
- [ ] **Step 7: Final verification:**
  - Run `npm run check && npm test`. Expected: PASS.
  - Check `git status` and `git diff --stat` to ensure no stray files or unintended edits.
- [ ] **Step 8: Commit**:
  `git commit -m "Document the default-on cabin interior, add interior validation README and record Part 5 as built"`

---

### Post-merge (once PR #33 merges to `main`)

- [ ] Rebase `claude/interior-default` onto `origin/main` (`git fetch origin && git rebase origin/main`), re-run `npm run check && npm test`, and open the Part 5 PR.
