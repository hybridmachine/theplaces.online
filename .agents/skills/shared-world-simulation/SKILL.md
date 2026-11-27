---
name: shared-world-simulation
description: >-
  Add or modify shared world simulation rules, SQLite persistence, schema
  migrations, SSE streaming, or 2D/3D synchronized life features. Use when
  editing shared/*.js, src/store.js, src/server.js, src/notes-store.js,
  public/world-client.js, or adding a new persistent world feature.
---

# Shared World Simulation & Persistence

Every visitor shares one persistent world. The server owns committed state;
clients never simulate or mutate the world.

## 1. Core Contracts

- **Two explicit time domains:**
  - *Calendar* (seasons, sun, moon, garden year): `365` world days per `30` real
    days (`73/6` ratio from `epoch`).
  - *Visible motion* (flights, casement swing, smoke, rain, ripples): elapsed
    real seconds.
  - Never multiply calendar rate into real-second motion or vice versa.
- **Data vs. rules split in `shared/`:**
  - `shared/lakeside-*.js` holds frozen authored data for this scene (routes,
    layouts, coordinates).
  - Unprefixed `shared/*.js` holds pure, deterministic functions imported by both
    the server (`src/`) and browser (`public/`, served at `/shared/`). No DOM or
    Three.js imports in `shared/`.
- **2D and 3D agreement:** Both `public/*-renderer.js` (2D) and
  `public/space/life/*.js` (3D) must sample the exact same pure functions in
  `shared/` at the client's displayed time.
- **Read-only visitor boundary:** `src/server.js` accepts `GET` and `HEAD` only.
  Opening the page, reloading, pausing, or toggling light studies must **never**
  start, hasten, or alter a world event.

## 2. Committed Actions, Ties & Catch-Up (`src/store.js`)

- Decide world changes on fixed real-time grids and persist committed actions
  (`start`, `end`) before displaying them.
- Add any new boundary timestamp to `nextCommitAt(state)` in `src/store.js`.
  `public/world-client.js` holds display time just before `nextCommitAt` until a
  snapshot containing the committed transition arrives.
- Preserve canonical tie-breaking order inside `WorldStore.advance`:
  1. Environment surface ticks (`advanceSurface`)
  2. Nest delivery completion
  3. Bird / cottage / coincidence completions
  4. Bird / cottage / coincidence decisions
- **Catch-up equivalence:** Catching up across hours, days, or months of downtime
  must yield the exact same state, revisions, and causal event order as
  continuous 2 s ticking. Keep bounded batches (`MAX_SURFACE_TICKS`,
  `MAX_WORLD_BOUNDARIES`); when still catching up, HTTP returns `503` with
  `Retry-After: 2`.
- **Complete snapshots over SSE:** `/api/stream` pushes complete JSON snapshots
  (never deltas). Reconnects and out-of-order HTTP responses must never rewind
  `world-client.js`.

## 3. Forward-Only Schema Migrations

World state is currently **version 5** in `src/store.js`. When introducing a new
persisted subsystem:
1. Increment the version inside `WorldStore`'s constructor transaction
   (`BEGIN IMMEDIATE` … `COMMIT`), initializing the new state at
   `Math.max(now, current.updatedAt)` **without backfilling history**.
2. Preserve `epoch`, existing subsystems, `events`, and `notesId`.
3. Add a strict `valid<Feature>State(...)` guard to the constructor's version
   check so corrupt or incompatible databases fail fast.
4. Keep `data/world.sqlite` untouched locally—always test migrations on temporary
   copies or in-memory/temp-dir SQLite files.
5. Document in `README.md` and `docs/deployment.md` that older releases cannot
   open the migrated version and require a pre-upgrade SQLite backup for manual
   rollback.

## 4. Client Modes, Fallbacks & Descriptions

Every visual/audio consumer of a world feature must explicitly define and test:
- **Reduced motion** (hold continuous motion or omit non-essential particles while
  lighting/state still stays accurate)
- **Local pause** (freeze displayed time and animation without affecting server)
- **Private light studies** (use fixed local fixture inputs; never mutate live
  state or advance visit memory)
- **Fallback isolation** (asset or shader failure removes only that layer and
  leaves the layer beneath intact)
- **Accessible text** (`public/scene-description.js` reports only what is drawn)

## 5. Verification

```sh
npm run check
node --test test/world.test.js test/world-client.test.js test/server-catchup.test.js test/server-config.test.js test/field-notes.test.js
node scripts/check-bird-state.mjs
node scripts/check-coincidences-state.mjs
node scripts/check-field-notes-state.mjs
```

Add dedicated tests covering deterministic sampling, boundary holding, restart
persistence, and catch-up vs. continuous equivalence before opening a PR.
