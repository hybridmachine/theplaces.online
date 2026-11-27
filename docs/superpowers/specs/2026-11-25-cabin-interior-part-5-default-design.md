# Cabin interior, part 5: interior on by default, ABBA hardening and close-out docs — design

Status: built, awaiting review (November 25, 2026).

This is the fifth and final part of `2026-11-17-cabin-interior-design.md` (the parent). Parts 1–4 (`shell`, `live windows`, `light`, and furnishing slices `4a`–`4f`) are built and complete behind `?interior=1`. Every one of the cabin's eighteen rooms is furnished, lit, walkable and validated. This part removes the opt-in gate so the cabin interior is open by default, hardens the browser suite's ABBA timing checks (the Part 4 close-out item recorded in 4f), and brings the project's documentation up to date.

Items marked **(call)** were decided by the author of this document, not by the project owner, and are open to correction. Items marked **(owner)** were decided by the owner.

## Intent

A visitor who opens the page walks into the lakeside yard as before, and when they walk up to the cottage's front door it swings open on its own — no URL switch required. Walking through carries them into the eighteen-room two-storey home, and walking back out returns them to the yard. A visitor who wants the yard alone can pass `?interior=0`, mirroring `?space=0` for the 2D painting.

Part 5 also closes out the Part 4 verification work by hardening the four duplicated ABBA speed-regression checks in `scripts/check-space-browser.mjs` against thermal and GPU-clock jitter, and updates `README.md`, `DESIGN.md`, `ARTWORK.md`, `CLAUDE.md`, the parent spec, and a new `docs/interior-validation/README.md`.

What the owner decided:

- Part 5 covers default-on interior, docs/tests, and ABBA timing hardening from the 4f close-out. **(owner)**
- `?interior=0` disables the interior unconditionally (mirroring `?space=0`), and `?interior=1` remains a harmless no-op for existing bookmarks. **(owner)**
- Add `docs/interior-validation/README.md` matching `docs/space-validation/README.md`. **(owner)**

## Goals

- Opening `/` (or `/?space=1`) enables the cabin interior by default: the front door opens when approached, the interior builds lazily on demand (not at page load in the yard), all eighteen rooms are walkable, lit and furnished, and version-2 indoor place memory restores automatically.
- Opening `/?interior=0` disables the interior cleanly: no stencil buffer requested on canvas or pass, no passage created, door stays shut, no interior built, doorway panel untouched, and version-2 indoor place records fall back to the arrival pose.
- Opening `/?interior=1` continues to work identically to `/` so old links or bookmarks do not break.
- `?check` fixtures (`&bare=1`, `&furnish=first|4b|4c|4d|4e`, `&hide=0`) continue to work with `?check` alone (without needing `&interior=1`), stay ignored without `?check`, and are overridden by `?interior=0`.
- All four ABBA speed-regression checks in `scripts/check-space-browser.mjs` (checks 94, 107, 119, 128) share one hardened helper that normalizes per-round room-to-yard ratios and balances pairs symmetrically, without loosening any performance budget or draw-call limit.
- `README.md`, `DESIGN.md`, `ARTWORK.md`, `CLAUDE.md`, `docs/space-validation/README.md`, the parent interior spec, the 4f spec status, and a new `docs/interior-validation/README.md` accurately describe the finished cabin interior and its honest limits.
- Zero regression across all existing Node tests (`npm test`), syntax checks (`npm run check`), and the full browser suite (checks 1–133 updated for default-on interior, plus new checks 134–135).

## Non-goals

- Any change to the cabin's blueprint, rooms, furniture, recipes, light field, live windows, walker rules, or exterior dressing.
- Interactive fixtures (taps, switches, drawers, interior doors, or looking through the sky room's telescope — the telescope remains deferred to a future block).
- New textures, art plates, sound changes, touch controls, server changes, or world-state migrations.
- Changing any performance budget, build-time budget, mesh limit, or draw-call limit.

## Anti-goals

- Building interior geometry on page load when the visitor starts in the yard (startup time in the yard must stay lazy).
- Breaking `?space=0` (the 2D painting must still request nothing of `three-`, `/space/`, or `lakeside-space-v1`).
- Masking real performance regressions in the ABBA hardening by widening tolerances or hiding raw timings.
- Renumbering existing checks 1–133 in `scripts/check-space-browser.mjs` (specs and PRs cite checks by number).

## Constraints found in the project

- **`public/space/space-view.js` (`interiorSwitch`):** currently lines 55–66 return `null` unless `params.get('interior') === '1'`. Flipping line 57 to `if (params.get('interior') === '0') return null;` flips the default cleanly while keeping all `?check` comparison fixtures (`&bare=1`, `&furnish=first|4b|4c|4d|4e`) intact.
- **What changes on a default yard load when `this.interior` is non-null:**
  - `init()` requests `{stencil: true}` on the WebGL2 canvas context.
  - `makePass()` requests `{stencil: !this.targetUnsure(renderer)}` on `PainterlyPass` (`DepthStencilFormat` / `UnsignedInt248Type`).
  - `this.passage` is created (pure JS state machine, negligible cost).
  - `render()` runs `this.lightRooms(...)` each frame in the yard to set the exterior doorway's warm glow from the hall lamp (`yard.setDoorway`).
  - `buildInside()` remains strictly lazy: it only runs if `this.state.place === 'cabin'` at startup or once `doorWanted(...)` triggers within 1.5 m of the front door facing it.
- **Checks 1–31 in `scripts/check-space-browser.mjs`:**
  - Check 5 runs four 40-second `Shift+W` walks from `arrival` (`[0, 0]`) along bearings `0, π/2, π, 3π/2`. None of those rays passes within `openWithin` (1.5 m) of the cabin's front door (`[18.18, 5.97]`): bearing `π/2` runs along `y = 0` south of the cabin toward the shoreline.
  - Check 13 inspects the front windows from 2.5 m out (`> 1.5 m`), so the door stays shut.
  - Checks 11, 20–22 and 31 measure frame cost and tier settling on `/?space=1&check`, which now exercises the default stencil-enabled yard directly.
- **ABBA timing root cause (checks 94, 107, 119, 128):**
  - The four checks duplicate the same ~45-line loop and each run 5 pairs (`pair = 0..4`: `AB, BA, AB, BA, AB` — asymmetric, 3 AB vs 2 BA).
  - Each pair computes `(a.roomMs - b.roomMs) / ((a.yardMs + b.yardMs) / 2)`. Because page load `A` and page load `B` run tens of seconds apart, any CPU/GPU frequency scaling shift (thermal boost or macOS power throttling) scales both `roomMs` and `yardMs` together, yet `a.roomMs - b.roomMs` leaks the entire frequency shift directly into the delta against the `0.01` budget.
  - By contrast, `measureSpeed` (checks 50, 63, 78, 81, 91, 92, 105, 117, 118, 127) already compares normalized `costRatio` (`roomMs / yardMs`). Computing the paired `roomMs / yardMs` ratio *per round* inside each page load (where yard and room are timed ~200 ms apart) and comparing `a.ratio - b.ratio` across **6 balanced pairs** (`3 AB + 3 BA`) cancels both frequency scaling and linear thermal drift without changing any threshold (`0.01` / `0.02`).
- **Documentation state:**
  - `README.md` still titles the 3D section `## Walking the yard (preview)` and qualifies the cabin interior with `With ?interior=1`.
  - `DESIGN.md` still lists "Each scene has an authored camera and composition" as an unamended assumption.
  - `ARTWORK.md` ends at `## Walkable yard, version 1` and has no provenance note for the cabin interior.
  - `CLAUDE.md` still says `The cabin interior is still behind ?interior=1.`
  - `docs/space-validation/README.md` line 154 mentions `check 52, behind ?interior=1`.
  - `docs/interior-validation/README.md` does not exist yet.

## Approaches considered

How the URL flag behaves after removing the opt-in gate:

1. **On by default, `?interior=0` opts out unconditionally — chosen (owner).** Mirrors `?space=0` from PR #23 (`claude/space-default`). Gives both visitors and browser checks (32, 49) a clean, zero-stencil yard-only mode, while `?interior=1` stays a harmless no-op so old links keep working.
2. **`?interior=0` honoured only under `?check`.** Works for tests, but breaks symmetry with `?space=0` and removes a visitor escape hatch on unfamiliar GPUs.
3. **Remove the flag completely.** Forces retiring checks 32 and 49 and leaves no easy way to isolate yard-only regressions or stencil overhead.

How ABBA timing checks (94, 107, 119, 128) are hardened:

1. **Shared `measureAbba` helper with per-round paired ratios (`rs[k] / ys[k]`), `a.ratio - b.ratio` pair diffs, and 6 balanced pairs (`3 AB + 3 BA`) — chosen (call).** Fixes the frequency-scaling math flaw and the 3-vs-2 pair asymmetry directly, eliminates ~180 lines of duplication, keeps every `0.01` / `0.02` budget and draw-call limit intact, and records both ratio-based and raw-ms diffs in `browser-results.json`.
2. **Loosen `NOISE` from `0.01` to `0.03`.** Rejected: weakens the regression guard instead of fixing the biased estimator.
3. **Keep 5 pairs and only retry failing poses.** Rejected: retrying only failures introduces selection bias.

## Design

### 1. Default-on switch (`public/space/space-view.js`)

`interiorSwitch(search)` changes its opt-in check to an opt-out check:

```js
// The cabin interior is on by default; ?interior=0 leaves the door shut (mirroring ?space=0).
// With ?check, &bare=1 builds the view from the bare blueprint (no furniture), &furnish=first strips the queued rooms and
// &furnish=4b..4e strip later slices while keeping earlier queues, to compare captures; without ?check all are ignored.
// &bare=1 wins over &furnish=.
export function interiorSwitch(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search);
  if (params.get('interior') === '0') return null;
  if (!params.has('check')) return LAKESIDE_INTERIOR;
  if (params.get('bare') === '1') return bareInterior(LAKESIDE_INTERIOR);
  if (params.get('furnish') === 'first') return withoutRooms(LAKESIDE_INTERIOR, [...LAKESIDE_INTERIOR.furnishLater, ...(LAKESIDE_INTERIOR.furnishUpper ?? [])]);
  if (params.get('furnish') === '4b') return withoutRooms(LAKESIDE_INTERIOR, [...SLICE_4C, ...SLICE_4D, ...SLICE_4E, ...SLICE_4F], {keepQueue: true});
  if (params.get('furnish') === '4c') return withoutRooms(LAKESIDE_INTERIOR, [...SLICE_4D, ...SLICE_4E, ...SLICE_4F], {keepQueue: true});
  if (params.get('furnish') === '4d') return withoutRooms(LAKESIDE_INTERIOR, [...SLICE_4E, ...SLICE_4F], {keepQueue: true});
  if (params.get('furnish') === '4e') return withoutRooms(LAKESIDE_INTERIOR, SLICE_4F, {keepQueue: true});
  return LAKESIDE_INTERIOR;
}
```

No other runtime code changes are needed: `SpaceView`, `PlaceMemory`, `buildInterior`, `windowViews`, `PainterlyPass`, and `SceneDescriber` already govern all interior behaviour off `this.interior !== null` and keep `buildInside()` lazy.

### 2. Hardened ABBA timing helper (`scripts/check-space-browser.mjs`)

Extract one shared helper `measureAbba(specs, baseQuery, {pairs = 6, buildRest = false} = {})` **(call)** used by checks **94**, **107**, **119**, and **128**:

- **Balanced ordering:** `pairs` defaults to `6` (even, `AB, BA, AB, BA, AB, BA` — `3 AB + 3 BA`), configurable via `ABBA_PAIRS` (must be an even integer ≥ 2 if overridden) for fast local diagnostic runs, defaulting to `6` for full validation.
- **Per-round ratio normalization inside the page:** in each of the 6 rounds (`k = 0..5`), time 20 forced yard frames (`yMs`) and 20 forced room frames (`rMs`) back-to-back, compute `ratios.push(rMs / yMs)` alongside `ys.push(yMs)` and `rs.push(rMs)`. Discard warmup round `0`; return `{ratio: +med(ratios.slice(1)).toFixed(4), roomMs: +med(rs.slice(1)).toFixed(3), yardMs: +med(ys.slice(1)).toFixed(3)}`.
- **Frequency-invariant pair diff:** for each pair `i`, compute:
  - `pairDiff = +(a.ratio - b.ratio).toFixed(3)` (used for the pass/fail check against `NOISE = 0.01` or `0.02`);
  - `rawMsDiff = +((a.roomMs - b.roomMs) / ((a.yardMs + b.yardMs) / 2)).toFixed(3)` (recorded alongside `pairDiffs` in `browser-results.json` for transparency).
- **Same limits, same draw-call checks:** every pose's threshold (`≤ +0.01`, or `≤ +0.02` where a new room is visible through an open doorway) and every draw-call assertion stays identical to Parts 4c–4f.

### 3. Browser suite updates (`scripts/check-space-browser.mjs`)

Existing check numbers **1–133** stay in place:

- **Check 32:** visits `/?check&interior=0` and asserts that 2 s at the door facing it leaves the door shut and builds no interior (`shutAngle < 1e-6 && !shutBuilt`).
- **Check 33:** visits `/?check` (default, no `&interior=1`) and asserts the door opens and holding W fades into the entry hall with `waterMask === 0`.
- **Checks 34–48, 50–133:** drop `&interior=1` from their page URLs so the entire interior suite runs against the default page (`/?check&tier=full...`).
- **Check 49:** compares `['?check&interior=0', '?check&interior=0', '?check']` (two yard-only controls against the default interior-enabled page) over the whole frame and cabin crop.
- **Check 71:** updates wording from `?interior=1` to default / `?interior=0`.
- **Checks 94, 107, 119, 128:** call `measureAbba(...)`.

Two new checks added at the end (**134–135**):

- **134 (default laziness & `?interior=1` compatibility):**
  - On a fresh default load (`/?check`, at the arrival pose), `window.__space.inside === null`, `!!window.__space.passage === true`, and the WebGL2 canvas context reports `stencil === true`.
  - On a legacy `/?check&interior=1` load, approaching the door and holding W opens the door and enters the entry hall cleanly, with 0 page or console errors.
- **135 (remembered indoor place with `?interior=0` vs default):**
  - Seeding a valid version-2 indoor record (`floor: 1`, `upperSpots.linenShelf`) in `localStorage`:
    - Loading `/?check&interior=0` falls back to the yard arrival pose, keeps `inside === null` and `passage === null`, and raises 0 errors.
    - Loading `/?check` (default) restores `place === 'cabin'`, `floor === 1`, `room === 'linen cupboard'` on frame 1 with all floor-1 furniture built and the linen clause in `#scene-description`, and raises 0 errors.

### 4. Documentation updates

- **`README.md`:**
  - Retitle `## Walking the yard (preview)` to `## Walking the yard and cabin`.
  - Remove the `With ?interior=1` gate from the cabin interior bullet; state clearly that walking up to the cottage's front door opens it by default, and that `?interior=0` keeps the door shut (no stencil buffer, no interior built, mirroring `?space=0`).
  - Update **Honest limits** with the 135-check count, link to [interior validation evidence](docs/interior-validation/README.md), and plain statements of the interior's known weak points (coarse brushwork on small pieces, faint grounding without cast shadows, non-interactive fixtures/telescope, single-machine Chromium/ANGLE measurements only).
- **`DESIGN.md`:**
  - Add a brief note to the implementation checkpoint at the top (and clarify line 22's original "Each scene has an authored camera and composition" working assumption) explaining that The Lakeside Cottage evolved into a walkable 3D yard with an enterable two-storey cabin interior, with the fixed-camera 2D painting preserved as fallback and via `?space=0`. Keep the original proposal text intact.
- **`ARTWORK.md`:**
  - Add `## Cabin interior, version 1` recording that no generated plates, external 3D models, or additional texture bundles were introduced; interior architecture and all 18 rooms' furniture reuse the `lakeside-space-v1` brush textures tinted procedurally under vertex-authored light (`shared/interior-light.js`, `public/space/interior/light.js`), with geometry authored deterministically from fixed seeds in `public/space/interior/`. Record known artistic limits.
- **`CLAUDE.md`:**
  - Update line 7 (`The cabin interior is on by default (?interior=0 keeps the door shut).`) and line 37 (`&interior=0`, `&bare=1`, `&furnish=first|4b|4c|4d|4e`).
- **`docs/space-validation/README.md`:**
  - Update line 154 (`check 52`, no longer `behind ?interior=1`).
- **`docs/superpowers/specs/2026-11-17-cabin-interior-design.md`:**
  - Mark Status complete (parts 1–5 built, interior on by default with `?interior=0` opt-out) and add a short **As built** summary linking Parts 1–5.
- **`docs/superpowers/specs/2026-11-24-cabin-interior-part-4f-upper-bath-box-linen-furnishing-design.md`:**
  - Update Status from awaiting review to approved and merged.
- **`docs/interior-validation/README.md` (new):**
  - Mirror `docs/space-validation/README.md`: overview of the 18-room interior, index of committed captures by part (shell, windows, light, ground floor 4a–4d, upper floor 4e–4f, fallbacks), automated evidence summary (checks 32–135 in `browser-results.json`), measured build times / vertex & mesh totals / frame costs, what was not measured, what still looks weakest, and reproduction steps.

### Checks

- **Node tests (`npm test`):**
  - `test/space-view.test.js`: default `interiorSwitch('') === I`, `interiorSwitch('?interior=1') === I`, `interiorSwitch('?interior=0') === null`, `interiorSwitch('?interior=0&check&bare=1') === null`, and `?check&bare=1` / `?check&furnish=first|4b|4c|4d|4e` working without `interior=1` while still ignored without `?check`.
  - Existing `interior: null` tests in `test/space-view.test.js` and `test/place-memory.test.js` remain green.
- **Syntax checks (`npm run check`):** all files pass.
- **Browser suite (`scripts/check-space-browser.mjs`):** full 135-check run against a throwaway database on port 4190, expecting **135 / 135 PASS** and 0 page or console errors.

## Left to the builder

- Exact helper signature and JSON diagnostic field names inside `measureAbba(...)` in `scripts/check-space-browser.mjs`.
- Exact prose in `README.md`, `DESIGN.md`, `ARTWORK.md`, `CLAUDE.md`, and `docs/interior-validation/README.md`, within the factual constraints above.
- Writing the **As built** and **Measured** sections of this spec after the full 135-check browser run completes.

## As built

Where the build settled or improved on the design above:

- **Default-on switch (`public/space/space-view.js`, `test/space-view.test.js`):** `interiorSwitch(search)` changed from `params.get('interior') !== '1'` to `params.get('interior') === '0'`. `/` and `?interior=1` enable the interior (built lazily on approaching the door or starting indoors), `?interior=0` disables it cleanly (no stencil buffer, no passage, version-2 indoor place records fall back to yard arrival), and all `?check` comparison fixtures (`&bare=1`, `&furnish=first|4b|4c|4d|4e`) continue to require `?check` and yield to `?interior=0`.
- **Interleaved paused-tab timing (`scripts/check-space-browser.mjs`):**
  - The initial 6-pair sequential `measureAbba` prototype showed that dividing by separate per-load `yardMs` *increased* variance (`Var(rA/yA - rB/yB) ≈ 2× Var((rA - rB)/Y)`) and running `all` vs `base` on sequential pages ~35 s apart with 20 per-frame `readPixels` stalls still suffered ±0.02–0.04 thermal/IPC jitter.
  - `measureAbba` was refined to open `ABBA_PAIRS` (default `2`, even) balanced context pairs (`all`/`base` then `base`/`all`, cancelling context-creation-order bias), wait for a completed `SpaceView.render` advancing `lastStep` (`waitRender`) after each pose/fixture change before freezing background rAF so strictly one context touches the GPU at a time, flush with `readPixels` once before and once after each 20-frame batch, and run 6 tightly interleaved ABBA rounds per load (12 balanced pairs total, ~200 ms apart).
  - The same `waitRender` + paused-rAF + batch-`readPixels` + interleaved pairing (`measureSpeedPair`, preserving per-page yard normalization `a.ms / yardMsT - b.ms / yardMsB` across 6 yard rounds so tab-speed differences cannot hide a `+0.05` regression) was applied to `measureSpeed` (checks `50`, `63`) and the 8 paired speed checks (`78`, `81`, `91`, `92`, `105`, `117`, `118`, `127`), keeping every budget (`≤ 1.1×`, `≤ +0.05`, `≤ +0.01`, `≤ +0.02`) and every draw-call assertion unchanged.
- **Browser suite updates (`scripts/check-space-browser.mjs`):** preserved exact check numbers `1–133` (check `32` tests `?check&interior=0`, check `49` compares `?check&interior=0` against default `?check`, checks `33–133` exercise the default URL without `&interior=1`), and appended checks **`134`** (default arrival laziness + legacy `?interior=1` entry) and **`135`** (version-2 indoor place memory fallback under `?interior=0` vs restoration by default).
- **Documentation:** updated `README.md` (re-titled `Walking the yard and cabin`), `DESIGN.md`, `ARTWORK.md` (added `Cabin interior, version 1`), `CLAUDE.md`, `docs/space-validation/README.md`, `docs/superpowers/specs/2026-11-17-cabin-interior-design.md`, and `docs/superpowers/specs/2026-11-24-cabin-interior-part-4f-upper-bath-box-linen-furnishing-design.md`; created `docs/interior-validation/README.md`.

## Measured

- **Syntax checks (`npm run check`) & unit tests (`npm test`):** **`897 / 897`** passing across all test files (`61 / 61` in `test/space-view.test.js`), 0 failures, 0 skipped.
- **Default-on yard & interior checks (`scripts/check-space-browser.mjs`, committed awake 60 Hz run in `docs/interior-validation/browser-results.json`, Apple M1, Chrome/ANGLE, 1440 × 810, tier `full`, **133 / 135 PASS**, 0 page or console errors):**
  - **Yard checks 1–31** with default stencil enabled: **31 / 31 PASS** (check 11 `full: 11.6 ms`, `light: 9.2 ms`, `plain: 5.2 ms`; check 31 `full day: 11.4 ms`, `full rain: 11.5 ms`, settles and locks on `full`).
  - **Default-on, opt-out & parity checks (`32`, `33`, `49`, `71`, `134`, `135`):** **ALL PASS** — `?interior=0` keeps door shut with no stencil/interior; default load stays lazy at arrival (`inside: false`, `passage: true`, `stencil: true`), matches `?interior=0` arrival pixels (check `49`), opens the door and enters the hall cleanly, keeps `?interior=1` working identically, and restores/falls back version-2 indoor place memory cleanly.
  - **Awake 60 Hz build budgets (`73`, `83`, `90`, `104`, `116`, `126`):** **6 / 6 PASS** — first build `+63.0 ms` first-only / `+63.8 ms` full (`≤ 80 ms`); floor-0 queued 8 rooms `146.2 ms` (`< 180 ms`); floor-1 queued 8 rooms `108.7 ms` (`4e` 5 rooms `67.1 ms`, `4f` 3 rooms `41.6 ms`; `≤ 50 ms` / `≤ 120 ms`).
  - **Interleaved GPU speed & ABBA checks (`50`, `63`, `78`, `81`, `91`, `92`, `94`, `105`, `107`, `117`, `118`, `119`, `127`, `128`):** **12 / 14 PASS** with **0 added draw calls** at every non-visible pose (`s0..s5`, `u1`) and `+7` at `u0` — passing checks `50` (`1.057×`), `63` (`1.012×`), `78` (`+0.040`), `91` (`+0.022`/`-0.040`), `92` (`-0.017`/`-0.001`), `105` (`+0.013`/`+0.010`), `117` (`+0.012`/`+0.023`), `118` (`+0.013`/`+0.039`), `127` (`-0.008`/`+0.006`), and ABBA `94` (`[-0.021, +0.010]`), `107` (`[-0.011, +0.010]`), `119` (`[-0.002, +0.005]`). Two transient GPU-jitter misses are recorded verbatim in the committed `browser-results.json`: check `81` day (`1.111×`, `+0.077`; night passed `1.057×`, `-0.012`, `+7` draw calls passed in `82`) and check `128` `s3-night` (`+0.012` vs `+0.010` with `31/31` draw calls; the other 15/16 poses passed within `[-0.008, +0.009]`).
