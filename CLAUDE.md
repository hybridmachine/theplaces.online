# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"A View": a full-window living painting of one shared, persistent world (The Lakeside Cottage), served by a small Node server. The page opens a walkable 3D yard and enterable two-storey cabin interior by default (three.js), falling back to the original 2D painting (`?space=0`). `?interior=0` keeps the cabin door shut (yard only, no stencil buffer).

Node.js 24 or newer. There are **no runtime dependencies and no build step**: the browser loads the ES modules in `public/` and `shared/` as written, SQLite is `node:sqlite`, and three.js is vendored at `public/assets/vendor/`. Playwright and Sharp are optional development tools only; do not add runtime packages.

## Commands

```sh
npm start                              # http://127.0.0.1:4173, world in data/world.sqlite
npm run dev                            # same, restarting on change
npm test                               # node --test test/*.test.js
node --test test/interior.test.js      # one file
node --test --test-name-pattern "vertical field of view" test/space-view.test.js   # one test
npm run check                          # node --check over an explicit list of files
```

- `PORT` and `A_VIEW_DB` select the port and SQLite file. For anything experimental, run against a throwaway database so the real world in `data/` is not advanced or migrated: `A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4174 npm start`.
- `npm run check` is a hand-maintained list in `package.json`. **A new `.js`/`.mjs` file must be added to it**, or CI does not syntax-check it.
- CI (`.github/workflows/checks.yml`) runs on Node 24 and 26: `shellcheck` on `scripts/deploy.sh` and `deploy/*.sh`, then `npm run check`, then `npm test`. The browser suites do not run in CI.

### Browser check suites

`scripts/check-*-browser.mjs` drive a real page with Playwright against a server you start yourself; each has its own default port (the space suite uses 4190) and writes captures and a results JSON under `docs/*-validation/`.

```sh
A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start
node scripts/check-space-browser.mjs
```

Shared environment options: `SKY_PREVIEW_URL` (another base URL), `BROWSER_EXECUTABLE` (an existing Chromium), `SKY_GPU=metal`, and a per-suite `*_VALIDATION_DIR`. They need `npx playwright install chromium` once. Checks in `check-space-browser.mjs` are numbered in run order and the specs and PR descriptions refer to them by number, so add new checks at the end.

The pages take `?check` for fixtures: `?check&tier=full|light|plain` locks a render tier, `&interior=0` disables the cabin interior, `&hide=0` disables unseen-room furniture hiding, and `&bare=1` (no furniture) and `&furnish=first|4b|4c|4d|4e` (slice baselines) exist for comparison captures. Unlinked developer studies live under `/dev/` (for example `/dev/sky-study.html`) and are refused when `NODE_ENV=production`.

`scripts/prepare-*-assets.mjs` regenerate the art bundles (Sharp); the 3D art in `public/assets/lakeside-space-v1/` is painted in code from fixed seeds by `scripts/space-painter/`, so exports are reproducible.

## Architecture

### Three layers

- **`shared/`** — pure, deterministic modules imported by both the server and the browser (served at `/shared/`). The rules of the world live here: clock and calendar, weather, wind, sky, bird, cottage, coincidences, and all geometry and validation for the 3D space. Files named `lakeside-*.js` are the authored data for this scene (blueprints, layouts, routes); the unprefixed neighbour holds the rules that read it (`interior.js` validates `lakeside-interior.js`, and so on).
- **`src/`** — `server.js` (static files, `/api/world`, `/api/stream` SSE, `/api/notes`, security headers) and `store.js` (`WorldStore`: one JSON state row plus an `events` table in SQLite). GET/HEAD only; nothing a visitor does changes the world.
- **`public/`** — the browser. `app.js` is the entry; `world-client.js` owns snapshot ordering and display time; `painting.js` and the `*-renderer.js` files are the 2D painting; `public/space/` is the 3D view.

### The shared world and its two clocks

Every visitor sees the same world. The server ticks every 2 s and pushes a **complete snapshot** over SSE (no deltas, so reconnects never replay). Clients do not simulate; they *sample* pure functions in `shared/` at a displayed time, which is how the 2D painting and the 3D yard stay in agreement.

Two time domains are deliberate (see `DESIGN.md`): the **calendar** runs 365 world days per 30 real days (seasons, sun, moon), while **visible motion** (flights, the casement, smoke, rain) runs in real seconds. Anything that changes the world is a *committed action* with a start and an end, decided on a fixed real-time grid and persisted before it is shown; `nextCommitAt` in `store.js` is the earliest such boundary, and the client holds just before it until a snapshot containing its effects arrives. Catch-up after downtime must produce the same state and event order as continuous running, and opening the page must never start or hasten an event. Tests in `test/world.test.js` enforce this.

The world state is versioned (currently 5) and migrated forward inside the `WorldStore` constructor. Migrations introduce a feature at upgrade time without backfilling history, and older code cannot read a migrated database.

### Fallback is a first-class path

Each optional layer validates its own assets and, on any failure (missing bundle, shader error, context loss), removes itself whole and leaves the layer beneath intact: 3D falls back to the painting, each painting pass falls back to the original plate, a lit interior falls back to flat materials (`fallBack()`), and furniture that cannot be built leaves a room bare. New rendering code is expected to keep this shape, and to respect reduced motion, local pause and the private light studies, none of which write to the server.

### The 3D view (`public/space/`)

`space-view.js` (`SpaceView`) owns the renderer, the frame loop and the walker's state. `scene/` builds the yard, `life/` adds what moves (each module sampling the same `shared/` functions as the painting), `painterly-pass.js` is the post-process, and `tier.js` steps `full` → `light` → `plain` by measured frame time and never back up.

Coordinates: blueprints use an interior/plan frame `[a, d, z]` (a across, d depth, z up); three.js is y-up, and code converts as `[a, z, -d]` (`geometry.js`'s `toThree`). Walking is rule-based, not physics: `shared/walker.js` steps a pose against the blueprint's rooms, openings and obstacles.

The cabin interior is built lazily by `interior/index.js` (`buildInterior`) when the visitor nears the door:

- **Blueprint and rules.** `shared/lakeside-interior.js` is one frozen blueprint (rooms, openings, windows, fittings, furniture, named `spots`). `shared/interior.js` validates it with numbered rules (reachability, clear ways through at walker width, window and lamp clearances); the specs and tests cite the rule numbers. Moving a piece of furniture can fail a rule far from where it stands.
- **Light is painted in, not cast.** There are no scene lights indoors. `shared/interior-light.js` computes a light field; each vertex stores weights (`day`, `lamp`, `fire`, room index) and one shared material multiplies them by per-frame *dials* derived from the world snapshot. New geometry must go through `face`/`lit` so it carries those weights.
- **Furniture.** `shared/furniture.js` holds `KINDS` (footprint, height, how a piece stands: solid, walk-over, wall-hung, set-on) used by both the walker and the validator; `interior/furniture.js` holds `RECIPES`, one function per kind, built from the helpers in `furniture-kit.js` and merged into a few meshes per set. Rooms named in the blueprint's `furnishLater` are queued and built one per frame (`buildNext`), and all at once on entry (`buildRest`), to keep the first build inside its time budget. A piece that fails is skipped with everything set on it, and `SpaceView.walkPlan` drops skipped pieces so the walker never collides with something not drawn.
- **Windows** show the live yard drawn into the frame (`window-views.js`, `view-budget.js`), a bounded number at a time by tier.

### Budgets are tested

The space and interior work carries explicit budgets (first-build milliseconds, per-room build time, mesh and draw-call counts, frame cost at named `spots.speed` positions, asset bundle size). They are asserted in `scripts/check-space-browser.mjs` and recorded in each spec's "As built" section, so a change that adds meshes or materials should be checked against them.

## Conventions

- The accessible description (`public/scene-description.js`) must only claim what is actually drawn, including in fallback states.
- Features are designed before they are built: a spec in `docs/superpowers/specs/` and a plan in `docs/superpowers/plans/`, with an **As built** section added to the spec when the work lands. Older features have `*_IMPLEMENTATION_PLAN.md` files at the root. Read the relevant spec before changing a feature; it records decisions and measured numbers that the code does not.
- Validation captures are committed selectively: `.gitignore` ignores each `docs/*-validation/` directory's images and re-includes named representative frames. A new capture meant to be kept needs its own `!` line there.
- `README.md` documents behaviour and honest limits per feature and is kept current with the code; `ARTWORK.md` records artwork provenance.
- Deployment (`scripts/deploy.sh`, `deploy/`, `docs/deployment.md`) targets Ubuntu with Caddy and systemd, backs up SQLite before activating a release, and is covered by `test/deploy.test.js`.
