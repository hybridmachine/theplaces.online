# The Painted Look (Navigable Yard, Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the walkable yard (`?space=1`) read as the oil painting it came from, from every reachable spot, using code-painted art exported once into asset files.

**Architecture:** An offline exporter runs a canvas stroke painter in headless Chromium and writes a WebP art bundle. Authored placement (path, oak, woods, ground cover) lives in a pure shared module. A new scene module tree builds painted geometry from that data and the bundle, replacing the flat blockout part by part. A full-screen painterly pass and a three-step tier meter sit in the view. The owner's walk is the acceptance test.

**Tech Stack:** Plain ES modules, no build step. three.js 0.170.0 (vendored). `node:test`. Development-only Playwright for export, captures and the browser check.

**Spec:** `docs/superpowers/specs/2026-11-16-painted-look-design.md` (parent: `docs/superpowers/specs/2026-11-15-navigable-yard-design.md`).

**Reference spike:** branch `claude/painted-look-spike`, commit `019fc29`, files `public/space/painted-textures.js`, `painted-look.js`, `painted-dressing.js`. Read it with `git show 019fc29:<path>`. It is a reference for what worked, not code to copy wholesale: it has no tests, paints at load time, draws two cabin walls inside-out, and lights the windows at night.

## Global Constraints

- The default page (`/`) must not request three.js, any `public/space/` module, or any file under `public/assets/lakeside-space-v1/`. Its behaviour does not change.
- Axes outside three.js: x east, y north, z up, metres. three is `(X, Y, Z) = (x, z, −y)` through `toThree`. Yaw is azimuth clockwise from north.
- `shared/lakeside-space.js` does not change: layout, arrival pose and colliders stay as they are.
- Art bundle: `public/assets/lakeside-space-v1/`, WebP at quality 0.9, total no larger than 4,000,000 bytes, described by `export.json`. Supplied plates live as PNG under `artwork/lakeside-space-v1/plates/<slot>.png` and are never overwritten.
- All randomness in painting and placement comes from fixed seeds. Two exports on the same machine and two page loads give the same result.
- Cards are fixed in the world and never turn to face the camera. Card materials are alpha-tested (no sorting, no blending).
- Every solid surface a visitor can walk around is drawn facing outward with a single-sided material. `DoubleSide` is allowed only on thin cards and the roof.
- No invented life: no window glow, smoke, or moving foliage. Windows are dark at every hour.
- "Keep this view" stays hidden in the 3D view.
- Tiers: `full`, `light`, `plain`. The meter steps down only; target 24 fps.
- The only change under `src/` is the `.webp` content type.
- Pixel ratio stays capped at 1.6; the app's 30 fps loop stays.
- Every new non-vendor `.js`/`.mjs` file joins the `check` chain in `package.json` as `&& node --check <path>`.
- Work on branch `claude/painted-look`. `git add` only the files each task names.

## Review Focus

1. A missing, corrupt or slow art bundle must end in the 2D painting with no toast, never a half-painted yard. → Tasks 5 and 13.
2. Walking behind the cabin, past each gable and round the oak must never show a see-through surface. → Tasks 6 and 7.
3. A slow device must settle one tier lower and stay there; a hidden tab or a single long frame must not trigger a step. → Task 11.
4. Resizing the window or changing zoom with the pass on must not leave a stretched, stale or blank frame. → Task 10.
5. GPU context loss with render targets alive must still fall back to the painting and free everything. → Tasks 10 and 13.

---

### Task 1: Art slots and WebP serving

**Files:**
- Create: `shared/lakeside-space-art.js`, `test/space-art.test.js`
- Modify: `src/server.js:12` (add `'.webp': 'image/webp'` to `types`), `package.json`

**Interfaces — produces:**

```js
export const SPACE_ART = /* deep-frozen */ {
  version: 1, base: '/assets/lakeside-space-v1/', budgetBytes: 4_000_000, quality: .9,
  // metres: world distance one tile covers
  surfaces: {
    meadow: {file: 'meadow.webp', size: 1024, metres: 6},   earth: {file: 'earth.webp', size: 1024, metres: 5},
    shore:  {file: 'shore.webp',  size: 1024, metres: 5},   stone: {file: 'stone.webp', size: 1024, metres: 2.4},
    slate:  {file: 'slate.webp',  size: 1024, metres: 2.6}, bark:  {file: 'bark.webp',  size: 1024, metres: 2},
    water:  {file: 'water.webp',  size: 1024, metres: 14},  drystone: {file: 'drystone.webp', size: 512, metres: 2},
    hills:  {file: 'hills.webp',  size: 512,  metres: 220},
  },
  panels: {door: {file: 'door.webp', width: 256, height: 512}, window: {file: 'window.webp', width: 256, height: 256}},
  cards: {file: 'cards.webp', size: 2048, cell: 512,
    cells: {oak: [0, 1, 2, 3], woods: [4, 5], dab: [6, 7], grass: [8, 9, 10], flower: [11], reeds: [12, 13]}},
};
// One entry per file: {slot, file, width, height, alpha}. alpha is true only for 'cards'.
export function artFiles(art = SPACE_ART)
// Cell index (row-major, 4 per row, row 0 at the top) → [u, v, w, h] in texture space with v up.
export function cellRect(index, art = SPACE_ART)
```

- [ ] **Step 1: Write the failing test** `test/space-art.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {SPACE_ART, artFiles, cellRect} from '../shared/lakeside-space-art.js';

test('every art slot names one distinct WebP file', () => {
  const files = artFiles();
  assert.equal(files.length, 12);
  assert.equal(new Set(files.map(f => f.file)).size, 12);
  assert.equal(new Set(files.map(f => f.slot)).size, 12);
  for (const f of files) { assert.match(f.file, /^[a-z]+\.webp$/); assert.ok(f.width > 0 && f.height > 0); }
  assert.deepEqual(files.filter(f => f.alpha).map(f => f.slot), ['cards']);
  assert.ok(Object.isFrozen(SPACE_ART) && Object.isFrozen(SPACE_ART.surfaces.meadow));
});
test('card cells tile the atlas without overlap', () => {
  const used = Object.values(SPACE_ART.cards.cells).flat();
  assert.equal(new Set(used).size, used.length);
  assert.ok(used.every(i => Number.isInteger(i) && i >= 0 && i < 16));
  assert.deepEqual(cellRect(0), [0, .75, .25, .25]);
  assert.deepEqual(cellRect(15), [.75, 0, .25, .25]);
});
```

- [ ] **Step 2: Run** `node --test test/space-art.test.js` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `shared/lakeside-space-art.js` and add the `.webp` type to `src/server.js`.
- [ ] **Step 4: Run** `node --test test/space-art.test.js` — Expected: 2 pass. Run `npm test` — Expected: all pass.
- [ ] **Step 5: Add both new files to `check`, commit**

```bash
git add shared/lakeside-space-art.js test/space-art.test.js src/server.js package.json
git commit -m "Name the yard's art slots and serve WebP"
```

---

### Task 2: The stroke painter and exporter (surfaces)

**Files:**
- Create: `scripts/space-painter/painter.js`, `scripts/space-painter/regions.js`, `scripts/prepare-space-assets.mjs`, `public/assets/lakeside-space-v1/*.webp` (nine surfaces), `public/assets/lakeside-space-v1/export.json`, `docs/space-validation/art-sheet.png`
- Modify: `test/space-art.test.js`, `package.json`, `.gitignore` (keep `docs/space-validation/art-sheet.png`)

**Interfaces:**
- Consumes: `SPACE_ART`, `artFiles` (Task 1).
- Produces:
  - `scripts/space-painter/regions.js`: `export const REGIONS` — named rectangles in native painting pixels (1672 × 941) for meadow, earth, stone, slate, bark, water, hills, foliage, reeds, shore. Start from the spike's `REGIONS` and check each against the painting by eye.
  - `scripts/space-painter/painter.js` (browser canvas code, no imports outside `scripts/space-painter/` and `shared/`): `export async function paintSlot(slot, painting): Promise<HTMLCanvasElement>` where `painting` is an `ImageData` of `public/assets/lakeside-day.png`. Throws for an unknown slot.
  - `node scripts/prepare-space-assets.mjs [--only slot,slot]` writes the bundle. With `--only`, other entries in `export.json` are kept.
  - `export.json`: `{version: 1, quality: .9, files: [{slot, file, width, height, alpha, seed, source: 'painted' | 'plate', bytes, sha256}]}`, `files` in `artFiles()` order.

How the exporter works: launch headless Chromium through `createRequire(import.meta.url)('playwright')`; open a page on a made-up origin and answer its requests from disk with `page.route` (serving `scripts/space-painter/`, `shared/` and `public/assets/lakeside-day.png` only); in the page, decode the painting, call `paintSlot`, and return `canvas.toBlob(…, 'image/webp', SPACE_ART.quality)` bytes. For each slot: if `artwork/lakeside-space-v1/plates/<slot>.png` exists, decode it in the page, require the slot's exact width and height (and, for `cards`, at least one transparent pixel), and encode it instead of painting. Write files, then `export.json`, then a contact sheet of all slots to `docs/space-validation/art-sheet.png`. Exit non-zero if any slot fails or the total exceeds `budgetBytes`.

Painting rules (spec, "How it is painted"): each texture starts from its region's mean colour and is built from thousands of bristle-streaked, tapered strokes with colours sampled from the region; direction and length suit the material (short upright dabs for meadow, horizontal for water, blocky varied dabs for stone, long vertical for bark, slope-following for slate); strokes wrap so the texture tiles; every random number comes from a seed fixed per slot.

- [ ] **Step 1: Append the failing bundle test**

```js
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir = new URL('../public/assets/lakeside-space-v1/', import.meta.url);
test('the committed art bundle matches its manifest and budget', () => {
  const manifest = JSON.parse(readFileSync(new URL('export.json', dir), 'utf8'));
  assert.equal(manifest.version, SPACE_ART.version); assert.equal(manifest.quality, SPACE_ART.quality);
  const listed = new Map(manifest.files.map(f => [f.slot, f]));
  let total = 0;
  for (const want of artFiles().filter(f => listed.has(f.slot) || BUNDLE_COMPLETE)) {
    const got = listed.get(want.slot); assert.ok(got, `missing ${want.slot}`);
    assert.deepEqual([got.file, got.width, got.height, got.alpha], [want.file, want.width, want.height, want.alpha]);
    assert.ok(['painted', 'plate'].includes(got.source)); assert.ok(Number.isInteger(got.seed));
    const bytes = readFileSync(new URL(got.file, dir));
    assert.equal(bytes.length, got.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), got.sha256);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF'); assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP');
    total += bytes.length;
  }
  assert.ok(total <= SPACE_ART.budgetBytes, `${total} bytes`);
  const extra = readdirSync(dir).filter(n => n !== 'export.json' && !manifest.files.some(f => f.file === n));
  assert.deepEqual(extra, []);
});
```

Define `const BUNDLE_COMPLETE = false;` at the top of the test file for this task; Task 3 sets it to `true`. With it false, the nine surface slots must still all be present: add `assert.ok(Object.keys(SPACE_ART.surfaces).every(s => listed.has(s)));`.

- [ ] **Step 2: Run** `node --test test/space-art.test.js` — Expected: FAIL, `export.json` not found.
- [ ] **Step 3: Implement the painter for the nine surfaces, the region table and the exporter.** `npm install --no-save playwright` if `node_modules` lacks it.
- [ ] **Step 4: Export and look.** Run `node scripts/prepare-space-assets.mjs`. Open `docs/space-validation/art-sheet.png` and each texture beside the painting. Each must read as brushwork in the painting's palette, and must tile: check a 2 × 2 tiling of each for seams and for an obvious repeating blotch. Iterate until they do.
- [ ] **Step 5: Run it twice** and confirm `export.json` is byte-identical between runs (`shasum` before and after).
- [ ] **Step 6: Run** `node --test test/space-art.test.js` and `npm test` — Expected: all pass.
- [ ] **Step 7: Add the three scripts to `check`, commit**

```bash
git add scripts/space-painter scripts/prepare-space-assets.mjs public/assets/lakeside-space-v1 docs/space-validation/art-sheet.png test/space-art.test.js package.json .gitignore
git commit -m "Paint and export the yard's surface textures"
```

---

### Task 3: Cards, panels and plate slots

**Files:**
- Modify: `scripts/space-painter/painter.js`, `scripts/prepare-space-assets.mjs` (only if needed), `test/space-art.test.js` (`BUNDLE_COMPLETE = true`), `ARTWORK.md`
- Create: `public/assets/lakeside-space-v1/cards.webp`, `door.webp`, `window.webp`; `artwork/lakeside-space-v1/plates/README.md`

**Interfaces:**
- Consumes: `paintSlot`, the exporter (Task 2); `SPACE_ART.cards.cells` (Task 1).
- Produces: the complete twelve-file bundle.

What each cell holds (straight alpha, each shape inside its 512 px cell with at least 8 px of clear margin so neighbours never bleed):
- `oak` (4 cells): lobed, irregular leaf clumps, lighter at the top and darker beneath, with small sky gaps inside the mass. Not round puffs.
- `woods` (2): broader, flatter tree-mass clumps in a narrow sage-to-moss range.
- `dab` (2): loose single and paired brush dabs for breaking edges (roof ridge, eaves, wall top).
- `grass` (3): tufts of long blades fanning from a base at the cell's bottom edge, varied height.
- `flower` (1): a cow-parsley-like cream umbel on a thin stem.
- `reeds` (2): upright reed clusters, some with seed heads.
- `door`: a weathered dark green plank door with a painted frame. `window`: a dark glazed casement with pale painted bars and frame, no light inside.

- [ ] **Step 1: Set `BUNDLE_COMPLETE = true`** and run `node --test test/space-art.test.js` — Expected: FAIL, missing `cards`.
- [ ] **Step 2: Implement the card atlas and the two panels in the painter.**
- [ ] **Step 3: Export and look.** `node scripts/prepare-space-assets.mjs`; view the sheet over a mid-grey and a sky-blue ground (the sheet should show the atlas over both). Edges must be broken and painterly, with no hard rectangular cell boundary and no fringe of the wrong colour.
- [ ] **Step 4: Prove the plate path.** Copy any 2048 × 2048 PNG with transparency to `artwork/lakeside-space-v1/plates/cards.png`, run `node scripts/prepare-space-assets.mjs --only cards`, and confirm `export.json` says `"source": "plate"` for `cards` and the other eleven entries are unchanged. Then try a wrongly sized PNG and confirm a non-zero exit that names the slot and the expected size. Remove the test plate and re-export `cards`.
- [ ] **Step 5: Write `artwork/lakeside-space-v1/plates/README.md`** (how to supply a plate: file name, size, alpha, the command) and an `ARTWORK.md` section "Walkable yard, version 1" recording that all twelve slots are code-painted from `lakeside-day.png`, the regions used, the seeds, the export command, and the four slots the spec lists as candidates for generated plates with a draft prompt for each in the style of the existing prompts.
- [ ] **Step 6: Run** `npm test` — Expected: all pass.
- [ ] **Step 7: Commit**

```bash
git add scripts/space-painter public/assets/lakeside-space-v1 artwork/lakeside-space-v1 docs/space-validation/art-sheet.png test/space-art.test.js ARTWORK.md
git commit -m "Paint the brush cards and panels, and accept supplied plates"
```

---

### Task 4: Authored placement

**Files:**
- Create: `shared/lakeside-dressing.js`, `test/dressing.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `LAKESIDE_SPACE`, `terrainHeight`, `shoreDistance`, `walkable` (`shared/space.js`).
- Produces (all pure; same input, same output):

```js
export const LAKESIDE_DRESSING = /* deep-frozen */ {
  version: 1, seed: 617,
  path: [[-9,-5],[-4,-1.6],[0,0],[3.5,.3],[7.5,1.6],[11.5,3.4],[15,5],[18.1,5.95]], pathHalfWidth: .55, shoreBand: 1.6,
  cabin: {eave: .4, gable: .3, sag: .09,
    door: {face: 'front', along: 0, width: 1, height: 2},
    windows: [{id: 'front-left', face: 'front', along: -2.4, sill: 1, width: .8, height: .9},
              {id: 'front-right', face: 'front', along: 2.4, sill: 1, width: .8, height: .9},
              {id: 'back', face: 'back', along: .5, sill: 1.2, width: .6, height: .6}],
    chimney: {along: 3.8, size: .8, rise: 1.05}},
  oak: {clumps: 24, canopyHeight: 9.6},
  cover: {grass: 5200, reeds: 260, flowers: 90, lowRadius: 6},
};
// +1 or −1: which long face of the cabin looks toward the arrival position (the 'front').
export function cabinFront(space)
// World position [x, y] of the middle of the door's threshold.
export function doorPosition(space, dressing)
// Blend weights for the ground at a point; they sum to 1.
export function groundBlend(space, dressing, x, y) // → {meadow, earth, shore}
// The oak as named parts: trunk and limbs are polylines of [x, y, z, radius]; every clump names the limb it sits on.
export function oakPlan(space, dressing) // → {trunk, limbs: [{id, points}], clumps: [{id, limb, center: [x,y,z], radius}]}
export function woodsPlan(space, dressing) // → [{id, center: [x,y,z], radius}]
// kind: 'grass' | 'reeds' | 'flowers' → [{x, y, scale, turn, cell}] (cell indexes into SPACE_ART.cards.cells[kind])
export function scatter(space, dressing, kind)
```

- [ ] **Step 1: Write the failing test** `test/dressing.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {shoreDistance, terrainHeight, walkable} from '../shared/space.js';
import {LAKESIDE_DRESSING as D, cabinFront, doorPosition, groundBlend, oakPlan, scatter, woodsPlan} from '../shared/lakeside-dressing.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
test('placement is deterministic', () => {
  for (const make of [() => oakPlan(S, D), () => woodsPlan(S, D), () => scatter(S, D, 'grass'), () => scatter(S, D, 'reeds'), () => scatter(S, D, 'flowers')])
    assert.deepEqual(make(), make());
});
test('the front of the cabin faces the arrival spot and the path ends at its door', () => {
  const door = doorPosition(S, D), c = S.cabin.center;
  assert.ok(dist(door, S.arrival.position) < dist(c, S.arrival.position));
  assert.ok(dist(D.path.at(-1), door) < 1.5, `${door}`);
  assert.ok(walkable(S, D.path[2]));
  assert.ok([1, -1].includes(cabinFront(S)));
});
test('the ground is earth on the path, stones at the water and meadow elsewhere', () => {
  const sum = b => b.meadow + b.earth + b.shore;
  const onPath = groundBlend(S, D, 7.5, 1.6), meadow = groundBlend(S, D, -8, 14), shore = groundBlend(S, D, 8, -6.6);
  assert.ok(onPath.earth > .8); assert.ok(meadow.meadow > .9); assert.ok(shore.shore > .6);
  for (const b of [onPath, meadow, shore]) assert.ok(Math.abs(sum(b) - 1) < 1e-9);
});
test('the oak is one tree: every clump sits on a limb and none floats free', () => {
  const oak = oakPlan(S, D), [ox, oy] = S.oak.position;
  assert.equal(oak.clumps.length, D.oak.clumps);
  assert.equal(new Set(oak.clumps.map(c => c.id)).size, oak.clumps.length);
  assert.ok(dist(oak.trunk[0], [ox, oy]) < .3);
  for (const clump of oak.clumps) {
    const limb = oak.limbs.find(l => l.id === clump.limb); assert.ok(limb, clump.id);
    const tip = limb.points.at(-1);
    assert.ok(Math.hypot(tip[0] - clump.center[0], tip[1] - clump.center[1], tip[2] - clump.center[2]) <= clump.radius, clump.id);
    assert.ok(clump.center[2] - clump.radius > terrainHeight(S, ox, oy) + 3, 'canopy clears head height');
  }
  for (const limb of oak.limbs) assert.ok(dist(limb.points[0], [ox, oy]) < 1.2, `${limb.id} starts at the trunk`);
});
test('woods stand beyond the wall, never in the yard or the lake', () => {
  const woods = woodsPlan(S, D); assert.ok(woods.length >= 20);
  for (const w of woods) { assert.equal(walkable(S, [w.center[0], w.center[1]]), false); assert.ok(shoreDistance(S, w.center[0], w.center[1]) > 0); }
});
test('ground cover keeps off the cabin, the trunk, the path and the water', () => {
  const grass = scatter(S, D, 'grass'), reeds = scatter(S, D, 'reeds'), flowers = scatter(S, D, 'flowers');
  assert.equal(grass.length, D.cover.grass); assert.equal(reeds.length, D.cover.reeds); assert.equal(flowers.length, D.cover.flowers);
  for (const g of [...grass, ...flowers]) {
    assert.ok(shoreDistance(S, g.x, g.y) > 0, 'on land');
    assert.ok(groundBlend(S, D, g.x, g.y).earth < .5, 'not on the path');
    // Inside the yard, away from the water's edge, cover stands only where a visitor could: never in the cabin or the trunk.
    if (inYard(g) && shoreDistance(S, g.x, g.y) > .5) assert.ok(walkable(S, [g.x, g.y]), `${g.x},${g.y}`);
  }
  for (const r of reeds) assert.ok(Math.abs(shoreDistance(S, r.x, r.y)) < 2.5, 'reeds hug the shore');
  // Near the arrival spot the grass stays low, so the path and the cabin's foot can be seen.
  const near = grass.filter(g => dist([g.x, g.y], S.arrival.position) < D.cover.lowRadius);
  assert.ok(near.length > 20); assert.ok(near.every(g => g.scale <= .6));
  // More grass where a visitor walks than beyond the wall.
  const inside = grass.filter(inYard).length; assert.ok(inside > grass.length * .6, `${inside}`);
});
function inYard(g) { const [a, , c] = S.wall; return g.x > a[0] && g.x < c[0] && g.y > a[1] && g.y < c[1]; }
```

- [ ] **Step 2: Run** `node --test test/dressing.test.js` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `shared/lakeside-dressing.js`.** Use one small seeded generator; derive a separate stream per kind from `dressing.seed` so adding flowers never moves the grass.
- [ ] **Step 4: Run** `node --test test/dressing.test.js` — Expected: 6 pass. `npm test` — all pass.
- [ ] **Step 5: Add to `check`, commit**

```bash
git add shared/lakeside-dressing.js test/dressing.test.js package.json
git commit -m "Author where the yard's path, tree, woods and ground cover go"
```

---

### Task 5: Loading the art, and painted ground

**Files:**
- Create: `public/space/geometry.js`, `public/space/art-loader.js`, `public/space/scene/index.js`, `public/space/scene/ground.js`, `test/space-scene.test.js`, `scripts/capture-space-review.mjs`
- Modify: `public/space/blockout.js` (export its part builders), `public/space/space-view.js`, `package.json`

**Interfaces:**
- Consumes: `SPACE_ART`, `artFiles` (Task 1); the bundle (Tasks 2–3); `LAKESIDE_DRESSING`, `groundBlend` (Task 4).
- Produces:
  - `public/space/geometry.js`: `toThree` (moved here; `blockout.js` and `space-view.js` import and re-export it), plus shared helpers the later scene tasks need (a parametric sheet with world-scaled UVs and a chosen outward side, a tapered tube along a polyline, geometry merging, card quads from an atlas cell). No import of three: THREE is passed in.
  - `public/space/art-loader.js`: `loadSpaceArt(THREE, renderer, art = SPACE_ART, {timeoutMs = 15000} = {}): Promise<{surfaces: {[slot]: Texture}, panels: {door, window}, cards: Texture, dispose()}>`. Surfaces repeat-wrap with mipmaps and anisotropy up to 8; all are sRGB. Rejects if any file fails, times out, or decodes to the wrong size.
  - `public/space/scene/index.js`: `buildScene(THREE, {space, dressing, art}): {group, parts, setSky({zenith, horizon}), dispose()}`. `parts` has named children `terrain`, `lake`, `wall`, `cabin`, `oak`, `woods`, `cover`, `hills`. In this task `terrain`, `lake` and `wall` are painted; the rest come from the blockout's own builders and are replaced in Tasks 6–9.
  - `SpaceView.init()` awaits `loadSpaceArt` and returns `false` when it rejects (after disposing what it created), so `app.js` falls back to the 2D painting.
  - `node scripts/capture-space-review.mjs [--only name,name] [--tier full|plain] [--study day|dawn|dusk|night|rain]` saves 1440 × 810 captures to `docs/space-validation/review/` from these named poses: `arrival`, `cabin-front`, `cabin-back`, `gable-north`, `gable-south`, `shore`, `woods`, `canopy`. It follows the launch pattern of `scripts/check-space-browser.mjs` (`SKY_PREVIEW_URL`, `--use-gl=angle`) and sets `window.__space.state` for each pose. `--tier` is accepted now and takes effect from Task 11.

Ground rules:
- Terrain keeps the phase 1 shape and reach (1 m grid plus the 10 m skirt to ±1500). Its material blends the `meadow`, `earth` and `shore` textures by `groundBlend` weights stored per vertex, and multiplies in a slow large-scale tint so the meadow never reads as a repeating carpet.
- Lake: the `water` texture laid as horizontal strokes, coloured each frame from `setSky`.
- Wall: `drystone`, with coping and moss dabs along the top from the `dab` cells.

- [ ] **Step 1: Write the failing test** `test/space-scene.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D} from '../shared/lakeside-dressing.js';
import {SPACE_ART, artFiles} from '../shared/lakeside-space-art.js';
import {toThree} from '../public/space/geometry.js';
import {buildScene} from '../public/space/scene/index.js';

// Textures without images: enough to build and inspect geometry in Node.
export function stubArt() {
  const t = () => new THREE.Texture();
  return {surfaces: Object.fromEntries(Object.keys(SPACE_ART.surfaces).map(k => [k, t()])), panels: {door: t(), window: t()}, cards: t(), dispose() {}};
}
test('toThree maps east, north, up to three', () => { assert.deepEqual(toThree([1, 2, 3]), [1, 3, -2]); });
test('the scene builds its named parts with finite geometry and disposes them', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  for (const name of ['terrain', 'lake', 'wall', 'cabin', 'oak', 'woods', 'cover', 'hills']) assert.ok(scene.parts[name], name);
  let meshes = 0, disposed = 0;
  scene.group.traverse(o => { if (!o.geometry) return; meshes++;
    const p = o.geometry.getAttribute('position'); for (let i = 0; i < p.count * 3; i++) assert.ok(Number.isFinite(p.array[i]), o.name);
    o.geometry.addEventListener('dispose', () => disposed++); });
  assert.ok(meshes >= 8);
  scene.setSky({zenith: [.6, .7, .76], horizon: [.83, .83, .75]});
  scene.dispose(); assert.equal(disposed, meshes);
});
test('the art slots the scene needs all exist', () => { assert.equal(artFiles().length, 12); });
```

- [ ] **Step 2: Run** `node --test test/space-scene.test.js` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `geometry.js`, `art-loader.js`, `scene/index.js`, `scene/ground.js`; export the blockout's cabin, oak and hills builders for `scene/index.js` to use meanwhile; switch `SpaceView` from `buildBlockout` to `loadSpaceArt` + `buildScene`, calling `scene.setSky` with the dome's colours each frame.
- [ ] **Step 4: Run** `node --test test/space-scene.test.js` and `npm test` — Expected: all pass.
- [ ] **Step 5: Write the capture script, then look.** Start a server (`A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start`), run `node scripts/capture-space-review.mjs --only arrival,shore,woods --study day`, and view the captures. Expected: brushed meadow with no visible tiling from the arrival pose or at your feet, a worn path leading toward the cabin, a stony band at the water, horizontal strokes on the lake in the sky's colour, a stone wall with a broken top edge. Iterate until so.
- [ ] **Step 6: Check the failure path.** Temporarily rename `public/assets/lakeside-space-v1/meadow.webp`, load `/?space=1`, and confirm the 2D painting is shown with no toast and no uncaught error; restore the file.
- [ ] **Step 7: Run** `node scripts/check-space-browser.mjs` — Expected: all existing checks pass.
- [ ] **Step 8: Add new files to `check`, commit**

```bash
git add public/space/geometry.js public/space/art-loader.js public/space/scene public/space/blockout.js public/space/space-view.js test/space-scene.test.js scripts/capture-space-review.mjs package.json
git commit -m "Load the art bundle and paint the ground, lake and wall"
```

---

### Task 6: The cabin

**Files:**
- Create: `public/space/scene/cabin.js`
- Modify: `public/space/scene/index.js`, `public/space/blockout.js` (remove its cabin builder), `test/space-scene.test.js`

**Interfaces:**
- Consumes: `geometry.js` helpers, `art` (Task 5); `LAKESIDE_DRESSING.cabin`, `cabinFront`, `doorPosition` (Task 4).
- Produces: `buildCabin(THREE, {space, dressing, art}): {object, dispose()}`. `object` is a group named `cabin` whose children are named `walls`, `roof`, `chimney`, `openings`, `shrubs`, `dabs`. `walls`, `roof` and `chimney` are each one merged `Mesh`; `openings` is a group with one child per door or window. `walls` and `chimney` use single-sided materials.

What it is (spec, "Cabin"): stone walls with a little lean and bulge, sitting slightly below the lowest ground under the footprint; an overhanging slate roof (`eave`, `gable`) with a sag along the ridge and a visible eave thickness; a chimney; the door and two windows on the front face and one small window on the back, as panels set just proud of the wall; dabs breaking the ridge, eaves and corners; a few shrubs at its foot made of `woods`/`dab` cards. No light in the windows.

- [ ] **Step 1: Append the failing tests**

```js
import {eyePosition} from '../shared/walker.js';
import {terrainHeight} from '../shared/space.js';
const fromThree = v => [v.x, -v.z, v.y];

// First surface hit by a ray from `eye` toward `target`, among the meshes of `objects` (one object or an array), left in place in the scene.
function firstHit(objects, eye, target) {
  const list = [].concat(objects); for (const o of list) o.updateWorldMatrix(true, true);
  const origin = new THREE.Vector3(...toThree(eye)), dir = new THREE.Vector3(...toThree(target)).sub(origin).normalize();
  const ray = new THREE.Raycaster(origin, dir); ray.params.Points = {threshold: 0};
  const hits = [];
  for (const object of list) object.traverse(o => { if (o.isMesh) { const side = o.material.side; o.material.side = THREE.DoubleSide; hits.push(...ray.intersectObject(o, false).map(h => ({...h, side}))); o.material.side = side; } });
  hits.sort((a, b) => a.distance - b.distance);
  return {hit: hits[0], dir};
}
test('the cabin is solid from every side a visitor can stand', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), cabin = scene.parts.cabin, [cx, cy] = S.cabin.center;
  const solid = ['walls', 'roof', 'chimney'].map(name => cabin.getObjectByName(name));
  for (let k = 0; k < 36; k++) {
    const a = k / 36 * Math.PI * 2, x = cx + Math.sin(a) * 9, y = cy + Math.cos(a) * 9;
    const eye = [x, y, terrainHeight(S, x, y) + S.eyeHeight];
    for (const z of [.6, 1.5, 2.4]) {
      const {hit, dir} = firstHit(solid, eye, [cx, cy, terrainHeight(S, cx, cy) + z]);
      assert.ok(hit, `nothing drawn at bearing ${k * 10}, height ${z}`);
      const facing = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(dir) < 0;
      assert.ok(facing || hit.side === THREE.DoubleSide, `inside-out surface at bearing ${k * 10}, height ${z} on ${hit.object.name}`);
      assert.notEqual(hit.side === THREE.DoubleSide && hit.object.name === 'walls', true, 'walls must be single-sided');
    }
  }
  scene.dispose();
});
test('the cabin walls stay inside the collider, clear of where a visitor can stand', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), walls = scene.parts.cabin.getObjectByName('walls');
  const box = S.colliders.find(c => c.type === 'box'), u = [Math.sin(box.yaw), Math.cos(box.yaw)], v = [Math.cos(box.yaw), -Math.sin(box.yaw)];
  walls.updateMatrixWorld(true);
  const p = walls.geometry.getAttribute('position'), w = new THREE.Vector3(); let checked = 0;
  for (let i = 0; i < p.count; i++) {
    w.fromBufferAttribute(p, i).applyMatrix4(walls.matrixWorld); const [x, y, z] = fromThree(w);
    if (z > terrainHeight(S, x, y) + S.eyeHeight + .5) continue;
    const dx = x - box.center[0], dy = y - box.center[1];
    assert.ok(Math.abs(dx * u[0] + dy * u[1]) <= box.half[0] - .15 && Math.abs(dx * v[0] + dy * v[1]) <= box.half[1] - .15, `${x},${y}`); checked++;
  }
  assert.ok(checked > 50); scene.dispose();
});
test('the cabin has a door and two windows in front and one small window behind', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  assert.equal(scene.parts.cabin.getObjectByName('openings').children.length, 4); scene.dispose();
});
```

- [ ] **Step 2: Run** `node --test test/space-scene.test.js` — Expected: FAIL (no `walls` child on the blockout cabin).
- [ ] **Step 3: Implement `buildCabin`** and use it from `scene/index.js`; delete the blockout's cabin builder.
- [ ] **Step 4: Run** `node --test test/space-scene.test.js` — Expected: all pass.
- [ ] **Step 5: Look.** `node scripts/capture-space-review.mjs --only cabin-front,cabin-back,gable-north,gable-south,arrival --study day`, then `--only cabin-front --study night`. Expected: stonework reads as painted up close with brush-sized detail; the roof overhangs and its edges are broken, not ruled; the back wall and both gables are solid stone; the door and windows sit on the wall, not floating; at night the windows are dark. Iterate until so.
- [ ] **Step 6: Run** `npm test` — all pass. Commit.

```bash
git add public/space/scene/cabin.js public/space/scene/index.js public/space/blockout.js test/space-scene.test.js
git commit -m "Rebuild the cabin in paint, solid from every side"
```

---

### Task 7: The oak and the woods

**Files:**
- Create: `public/space/scene/trees.js`
- Modify: `public/space/scene/index.js`, `public/space/blockout.js` (remove its oak builder and the woodland blobs), `test/space-scene.test.js`

**Interfaces:**
- Consumes: `oakPlan`, `woodsPlan` (Task 4); `geometry.js`, `art` (Task 5).
- Produces: `buildOak(THREE, {space, dressing, art}): {object, dispose()}` — group `oak` with children `trunk` (one merged `Mesh`, single-sided, `bark`), `limbs`, `leaves` (one merged card mesh; each clump's cards carry its id in `leaves.userData.clumps: [{id, start, count}]` so phase 3 can sway them). `buildWoods(THREE, …): {object, dispose()}` — group `woods`.

What they are (spec, "Oak", "Woods"): the trunk follows `oakPlan().trunk`, limbs follow `limbs`, and each clump is a cluster of fixed cards from the `oak` cells around its centre, lighter above and darker beneath (vertex colour), irregular in outline, with sky showing through. Woods are rows of `woods`-cell clumps in a narrow sage-to-moss range that sit back.

- [ ] **Step 1: Append the failing tests**

```js
import {oakPlan} from '../shared/lakeside-dressing.js';
test('the oak trunk is solid from all round and stays inside its collider', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), trunk = scene.parts.oak.getObjectByName('trunk'), [ox, oy] = S.oak.position;
  assert.notEqual(trunk.material.side, THREE.DoubleSide);
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, x = ox + Math.sin(a) * 4, y = oy + Math.cos(a) * 4, eye = [x, y, terrainHeight(S, x, y) + S.eyeHeight];
    const {hit, dir} = firstHit(trunk, eye, [ox, oy, terrainHeight(S, ox, oy) + 1.4]);
    assert.ok(hit, `no trunk at bearing ${k * 15}`);
    assert.ok(hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(dir) < 0, `inside-out at ${k * 15}`);
  }
  trunk.updateMatrixWorld(true); const p = trunk.geometry.getAttribute('position'), w = new THREE.Vector3(), r = S.colliders.find(c => c.type === 'circle').radius;
  for (let i = 0; i < p.count; i++) { w.fromBufferAttribute(p, i).applyMatrix4(trunk.matrixWorld); const [x, y, z] = fromThree(w);
    if (z < terrainHeight(S, ox, oy) + S.eyeHeight + .5) assert.ok(Math.hypot(x - ox, y - oy) <= r - .1, `${x},${y},${z}`); }
  scene.dispose();
});
test('every planned clump has leaves, and the leaves never face the camera', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), leaves = scene.parts.oak.getObjectByName('leaves');
  assert.deepEqual(leaves.userData.clumps.map(c => c.id).sort(), oakPlan(S, D).clumps.map(c => c.id).sort());
  assert.ok(leaves.userData.clumps.every(c => c.count >= 6));
  assert.equal(leaves.material.transparent, false); assert.ok(leaves.material.alphaTest > 0);
  // Fixed in the world: an ordinary mesh with no per-frame hook that could turn it toward the camera.
  assert.equal(leaves.isMesh, true); assert.equal(leaves.onBeforeRender, THREE.Object3D.prototype.onBeforeRender);
  scene.dispose();
});
```

- [ ] **Step 2: Run** — Expected: FAIL (the blockout oak has no `trunk` child).
- [ ] **Step 3: Implement `trees.js`**, use it from `scene/index.js`, delete the blockout's oak and woodland builders.
- [ ] **Step 4: Run** `node --test test/space-scene.test.js` — Expected: all pass.
- [ ] **Step 5: Look.** Captures `arrival`, `canopy`, `woods`, `shore` by day, and `arrival` at dusk. Expected: the oak frames the upper left of the arrival view with an irregular, lobed outline and no clump detached from the tree; from beneath, limbs and sky gaps; the woods read as one soft mass, not camouflage and not round puffs. Walk a few steps in the browser and confirm the leaves do not swim or turn. Iterate until so.
- [ ] **Step 6: Run** `npm test`. Commit.

```bash
git add public/space/scene/trees.js public/space/scene/index.js public/space/blockout.js test/space-scene.test.js
git commit -m "Paint the oak and the woods as fixed leaf cards"
```

---

### Task 8: Ground cover

**Files:**
- Create: `public/space/scene/cover.js`
- Modify: `public/space/scene/index.js`, `test/space-scene.test.js`

**Interfaces:**
- Consumes: `scatter` (Task 4); `geometry.js`, `art`.
- Produces: `buildCover(THREE, {space, dressing, art}): {object, dispose()}` — group `cover` with children `grass`, `reeds`, `flowers`, each one `InstancedMesh` of crossed cards whose instance count equals `scatter(...).length`.

- [ ] **Step 1: Append the failing test**

```js
import {scatter} from '../shared/lakeside-dressing.js';
test('ground cover draws exactly what the layout scatters, in three draw calls', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), cover = scene.parts.cover;
  for (const kind of ['grass', 'reeds', 'flowers']) {
    const mesh = cover.getObjectByName(kind); assert.ok(mesh.isInstancedMesh, kind);
    assert.equal(mesh.count, scatter(S, D, kind).length); assert.ok(mesh.material.alphaTest > 0);
  }
  assert.equal(cover.children.length, 3); scene.dispose();
});
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** Each instance stands on `terrainHeight` at its point, with the layout's `scale` and `turn`; colour varies slightly per instance.
- [ ] **Step 4: Run** `node --test test/space-scene.test.js` — all pass.
- [ ] **Step 5: Look.** Captures `arrival`, `shore`, `woods`, `cabin-front`. Expected: grass reads as brushed tufts growing out of the painted ground, not spikes on a carpet; from the arrival pose the path and the foot of the cabin are visible; reeds stand in patches at the water; flowers are sparse. Iterate (in `shared/lakeside-dressing.js` counts and scales if needed, keeping Task 4's tests green).
- [ ] **Step 6: Run** `npm test`. Commit.

```bash
git add public/space/scene/cover.js public/space/scene/index.js test/space-scene.test.js shared/lakeside-dressing.js
git commit -m "Grow grass, reeds and flowers from the authored scatter"
```

---

### Task 9: The hills, and the end of the blockout

**Files:**
- Create: `public/space/scene/hills.js`
- Delete: `public/space/blockout.js`
- Modify: `public/space/scene/index.js`, `public/space/space-view.js` (import `toThree` from `geometry.js`), `package.json` (remove `blockout.js` from `check`), `test/space-scene.test.js`

**Interfaces:**
- Produces: `buildHills(THREE, {space, dressing, art}): {object, dispose()}` — group `hills`: layered silhouette bands round the yard using the `hills` texture, with atmospheric colour by distance and a soft, painted sky edge (alpha-tested irregular top, not a ruled line). No band's base may show above the terrain skirt or the lake from any pose in the yard.

- [ ] **Step 1: Append the failing test**

```js
import {existsSync} from 'node:fs';
test('the blockout is gone and the far hills close the view all round', () => {
  assert.equal(existsSync(new URL('../public/space/blockout.js', import.meta.url)), false);
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), hills = scene.parts.hills;
  for (const [x, y] of [[0, 0], [-10, 20], [30, 20], [-12, -8]]) {
    const eye = [x, y, terrainHeight(S, x, y) + S.eyeHeight];
    for (let k = 0; k < 72; k++) {
      const a = k / 72 * Math.PI * 2, far = [x + Math.sin(a) * 2000, y + Math.cos(a) * 2000, eye[2] + 2000 * Math.tan(.5 * Math.PI / 180)];
      assert.ok(firstHit(hills, eye, far).hit, `gap in the hills at bearing ${k * 5} from ${x},${y}`);
    }
  }
  scene.dispose();
});
```

(A ray half a degree above level must meet a hill in every direction.)

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement**, delete `blockout.js`, fix imports.
- [ ] **Step 4: Run** `node --test test/space-scene.test.js`, `npm test`, `npm run check` — all pass.
- [ ] **Step 5: Look.** Captures `arrival`, `shore`, `woods` by day and at dawn and in rain. Expected: misty layered hills with a soft edge, no pale flat stripes and no hard ridge line; the far shore dissolves into the fog colour. Iterate.
- [ ] **Step 6: Commit**

```bash
git add -A public/space test/space-scene.test.js package.json
git commit -m "Paint the far hills and retire the blockout"
```

---

### Task 10: The painterly pass

**Files:**
- Create: `public/space/painterly-pass.js`
- Modify: `public/space/space-view.js`, `package.json`

**Interfaces:**
- Produces: `class PainterlyPass { constructor(THREE, renderer); setSize(width, height, pixelRatio); setScale(scale /* 1 | .6 */); render(scene, camera); dispose(); }`. `render` draws the scene to a target and then to the canvas through the filter. `SpaceView` owns one, calls `setSize` from its resize handler, and exposes `view.pass` and a `view.setPass(mode /* 'full' | 'light' | 'off' */)` that Task 11 drives; with `'off'` the scene renders straight to the canvas.

What it does (spec, "The painterly pass"): the spike's structure-tensor, direction-following Kuwahara filter, then a linen weave and a restrained, clamped impasto light on stroke edges. Fix the two faults the spike had: bright rims where dark shapes meet the sky, and the weave showing too strongly on flat sky. The sky's painted clouds must not be smeared: keep the dome's own brushwork legible.

- [ ] **Step 1: Implement the pass and wire it into `SpaceView`** (default `'full'`). Dispose its targets and materials in `SpaceView.dispose()`.
- [ ] **Step 2: Look.** Capture all eight poses by day with the pass on, and `arrival` with `view.setPass('off')` for comparison. Expected: brushwork is added, not erased; nothing reads as a blurred photograph; no bright rim round the oak or roof against the sky; the weave is barely visible on open sky; clouds keep their painted edges. Iterate until so, then compare `arrival` at dusk and night.
- [ ] **Step 3: Resize and context loss.** In a headed or headless browser, resize the window from 1440 × 810 to 390 × 844 and back and confirm each frame fills the canvas with no stretched or blank frame (compare a centre and a corner pixel after each resize). Then run `node scripts/check-space-browser.mjs` — Expected: all pass, including context loss returning to the 2D view.
- [ ] **Step 4: Run** `npm test`, `npm run check`. Add to `check`, commit.

```bash
git add public/space/painterly-pass.js public/space/space-view.js package.json
git commit -m "Add the painterly pass over the frame"
```

---

### Task 11: Tiers

**Files:**
- Create: `public/space/tier.js`, `test/tier.test.js`
- Modify: `public/space/space-view.js`, `scripts/capture-space-review.mjs`, `package.json`

**Interfaces:**
- Produces:

```js
export const TIERS = Object.freeze(['full', 'light', 'plain']);
// Feed it the time of every rendered frame. It returns the tier to use from now on.
export function createTierMeter({target = 24, settleMs = 1500, windowMs = 3000, gapMs = 250, start = 'full'} = {})
// → {tier, locked, frame(nowMs): tier}
```

Rules: after each tier change (and at the start) ignore `settleMs`; then gather frames until `windowMs` of frame time has accumulated; a gap longer than `gapMs` between frames is discarded and restarts the window (a hidden tab or a stall is not a measurement). If the window's average rate is below `target`, step down one tier and measure again; otherwise lock. `plain` always locks. Once locked the tier never changes. `SpaceView` maps `full → setPass('full')`, `light → setPass('light')`, `plain → setPass('off')`, exposes `view.tier`, and accepts `?tier=full|light|plain` (with `check` in the URL only) to start locked at a tier for captures and tests.

- [ ] **Step 1: Write the failing test** `test/tier.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {TIERS, createTierMeter} from '../public/space/tier.js';

const run = (meter, fps, seconds, from = 0) => { let t = from; for (; t < from + seconds * 1000; t += 1000 / fps) meter.frame(t); return t; };
test('a fast device stays on the full tier and locks', () => {
  const m = createTierMeter(); run(m, 30, 10);
  assert.equal(m.tier, 'full'); assert.equal(m.locked, true);
});
test('a slow device steps down one tier at a time and stops where it holds', () => {
  const m = createTierMeter(); let t = run(m, 15, 6);
  assert.equal(m.tier, 'light'); assert.equal(m.locked, false);
  t = run(m, 28, 6, t); assert.equal(m.tier, 'light'); assert.equal(m.locked, true);
  run(m, 5, 30, t); assert.equal(m.tier, 'light', 'never changes once locked');
});
test('a very slow device ends on plain and never climbs back', () => {
  const m = createTierMeter(); let t = run(m, 10, 20);
  assert.equal(m.tier, 'plain'); assert.equal(m.locked, true);
  run(m, 60, 20, t); assert.equal(m.tier, 'plain');
});
test('a hidden tab or one long stall is not a measurement', () => {
  const m = createTierMeter(); let t = run(m, 30, 2);
  t += 60_000; t = run(m, 30, 2, t); t += 5_000; run(m, 30, 6, t);
  assert.equal(m.tier, 'full');
});
test('exactly on target holds; the tiers are ordered', () => {
  const m = createTierMeter({target: 24}); run(m, 24, 10); assert.equal(m.tier, 'full');
  assert.deepEqual([...TIERS], ['full', 'light', 'plain']);
});
```

- [ ] **Step 2: Run** `node --test test/tier.test.js` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `tier.js`** and wire the meter into `SpaceView.render` (one `frame(performance.now())` per rendered frame, starting only once the view is shown). Make `--tier` in the capture script pass `&tier=`.
- [ ] **Step 4: Run** `node --test test/tier.test.js` — Expected: 5 pass. `npm test` — all pass.
- [ ] **Step 5: Look at the plain tier.** `node scripts/capture-space-review.mjs --tier plain --study day`. It must stand as a painted place without the pass. If a surface only works with the pass, fix the surface.
- [ ] **Step 6: Add to `check`, commit**

```bash
git add public/space/tier.js test/tier.test.js public/space/space-view.js scripts/capture-space-review.mjs package.json
git commit -m "Step the painterly pass down on slow devices"
```

---

### Task 12: Light, weather and phase 1 leftovers

**Files:**
- Modify: `public/space/space-view.js`, `public/space/sky-dome.js`, `test/space-scene.test.js` (or a new `test/space-view.test.js` if cleaner)

Changes (spec, "Light and weather" and "Carried from phase 1"):
1. **Rain:** the hemisphere light dims with cloud as the directional light does. Under the `rain` study the yard must be visibly duller than under `day` at the same hour.
2. **Stars:** put a floor under the small-size attenuation in the star shader so stars remain visible when the drawing buffer is small. They must not become brighter than today at 1600 px and wider.
3. **Cloud atlas:** `SpaceView.init()` no longer awaits `sky.load()`; clouds appear when the atlas arrives. (It still awaits the art bundle.)
4. **No walking before the view is shown:** `SpaceView` does not step the walker, apply drags, or feed the tier meter until `init()` has resolved `true`. Drags received earlier are dropped.
5. **Context release:** if `init()` fails or throws after `getContext('webgl2')` succeeded, the context is released (`WEBGL_lose_context`) and everything created is disposed.
6. **Small tests:** export `verticalFov` from `space-view.js` only if that module can be imported in Node; otherwise move `verticalFov` to `geometry.js` and test it there: `verticalFov(16/9)` ≈ 67.6 (±0.1), `verticalFov(390/844)` = 75, `verticalFov(1)` = 75. Test `skyColours` from `sky-dome.js` (read its signature and return shape first): at full daylight with no dusk the zenith and horizon equal the day constants (`[157,179,193]/255`, `[211,211,191]/255` to 1e-6); at full night they equal those scaled by `[.22,.31,.43]`.

- [ ] **Step 1: Write the failing tests** for item 6 (and for item 1 if the light mix can be factored into a pure `lightLevels(calendar, weather)` helper: assert hemisphere intensity under `{cloud: .9}` is lower than under `{cloud: .18}` at equal `light`).
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement all six.**
- [ ] **Step 4: Run** `npm test` — all pass.
- [ ] **Step 5: Look.** `arrival` under `rain` beside `day`; `arrival` at `night` at 1440 × 810 and at 480 × 360 (stars visible in both). `node scripts/check-space-browser.mjs` — all pass.
- [ ] **Step 6: Commit**

```bash
git add public/space/space-view.js public/space/sky-dome.js public/space/geometry.js test
git commit -m "Dim rain, keep stars in small windows, and tidy the view's start-up"
```

---

### Task 13: The arrival view, the checks, and the review pack

**Files:**
- Modify: `scripts/check-space-browser.mjs`, `scripts/capture-space-review.mjs`, `docs/space-validation/README.md`, `README.md`, `.gitignore`, and whichever scene or dressing files the arrival tuning needs
- Create: `docs/space-validation/review/*.png` (the review pack), `docs/space-validation/arrival-vs-painting.jpg`

- [ ] **Step 1: Tune the arrival view against the painting.** Add `--compare` to the capture script: it saves the `arrival` capture beside `public/assets/lakeside-day.png` (scaled to the same height) and a 50 % overlay, as `arrival-vs-painting.jpg`. Adjust placement and shapes (in `shared/lakeside-dressing.js` and the scene modules, keeping every test green) until, judged by eye: the oak's trunk and canopy frame the left as in the painting; the cabin's face, roof line, door and windows are recognisable in the same place; the path leads to the door; the shore curves away to the right; the hill line sits behind. The lake sitting higher in the frame than in the painting is accepted (parent spec).
- [ ] **Step 2: Extend the browser check** with these, each recorded in the results JSON:
  1. `/` requests nothing whose URL contains `three-`, `/space/` or `lakeside-space-v1`.
  2. `/?space=1&check` requests all twelve bundle files with status 200 and content type `image/webp`, with no console errors.
  3. Each of `?tier=full`, `?tier=light`, `?tier=plain` draws a non-blank frame and reports that tier in `window.__space.tier`.
  4. With a request for `cards.webp` aborted (`page.route`), the 2D view is shown, `#space` is hidden, there is no toast, and no page error. The same with `stone.webp` answered by 200 and an empty body.
  5. Frame rate per tier: count `requestAnimationFrame` callbacks over 4 s at the arrival pose; record the number, the triangle count and draw calls from `renderer.info`. This is recorded, not asserted.
  6. After resizing the viewport to 390 × 844 and back to 1280 × 720, the centre pixel differs from a corner pixel and the canvas backing size matches the viewport times the pixel ratio.
  7. Windows are dark at night: under the `night` study, a pixel sampled inside the front-left window (project its centre from `doorPosition`/the dressing data, or expose the window centres on `window.__space` under `check`) has luminance below 0.25.
- [ ] **Step 3: Run** `node scripts/check-space-browser.mjs` — Expected: every check passes, exit 0.
- [ ] **Step 4: Make the review pack.** `node scripts/capture-space-review.mjs --tier full` and `--tier plain` for all eight poses by day; `--only arrival` for `dawn`, `day`, `dusk`, `night`, `rain` on the full tier; and `--compare`. View every capture yourself. Anything that looks computer-made, see-through, floating, or unlike the painting is fixed before the pack is final, or is listed honestly in the validation README.
- [ ] **Step 5: Write up.** `docs/space-validation/README.md`: what was captured, the frame rates and counts measured and on what machine, what was not measured (phones, integrated GPUs), and a plain list of what still looks weakest, slot by slot. `README.md`: update "Walking the yard (preview)" for the painted look, the tiers, and the art bundle; `.gitignore`: keep the review pack and comparison image.
- [ ] **Step 6: Run** `npm test` and `npm run check` — all pass.
- [ ] **Step 7: Commit**

```bash
git add scripts docs/space-validation README.md .gitignore shared public/space
git commit -m "Match the arrival view, check the painted yard, and prepare the review pack"
```

After this task the owner walks the yard. The spike branch `claude/painted-look-spike` is deleted only after the owner accepts the look and this branch merges.
