# Navigable Yard, Phase 1: Walkable Blockout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?space=1`, a visitor can walk a plain, untextured 3D yard under the live shared sky with WASD, and returns to the spot where they stopped.

**Architecture:** One shared, pure description of the place in metres (`shared/lakeside-space.js`) plus pure movement and memory logic that Node can test. A new three.js view (`public/space/`) presents it and exposes the same small surface `public/app.js` already uses on `Painting`, so the app swaps renderers at start-up and falls back to the 2D painting on any failure. The server and world state are not touched.

**Tech Stack:** Plain ES modules, no build step. three.js 0.170.0 vendored as one file. `node:test`. Optional Playwright for the browser check.

**Spec:** `docs/superpowers/specs/2026-11-15-navigable-yard-design.md`. This plan covers the spec's phase 1 only. Phases 2–4 get their own plans.

## Global Constraints

- Axes everywhere outside three.js: x east, y north, z up, metres (same as `shared/celestial.js`). Convert only at the render boundary: three `(X, Y, Z) = (x, z, −y)`.
- Heading (`yaw`) is azimuth in radians, clockwise from north, as in `horizontalDirection`. Forward on the ground is `[sin yaw, cos yaw]`; right is `[cos yaw, −sin yaw]`. `pitch` is radians, up positive.
- z = 0 is the lake surface.
- Eye height 1.6 m. Walk 1.4 m/s; with Shift 2.4 m/s. Keyboard turn 1.2 rad/s. Pitch clamped to ±1.2 rad.
- Arrival pose: position `[0, 0]`, yaw `SKY_CAMERA.bearing` (90°), pitch 0. Horizontal field of view `SKY_CAMERA.horizontalFov` (100°); vertical field of view is derived from the aspect ratio and capped at 75°.
- No pointer capture, HUD, crosshair, jumping, head-bob, inertia or cast shadows.
- The viewer's position never reaches the server. No change under `src/`.
- `shared/lakeside-*.js` 2D layouts, their `version: 1` values, `public/painting.js` and all existing renderers stay byte-for-byte unchanged.
- The 2D painting is the default. The 3D view loads only with `?space=1`, via dynamic `import()`, so the default page never fetches three.js.
- Device pixel ratio capped at 1.6; the existing 30 fps loop in `public/app.js` drives rendering.
- Blockout only: flat muted colours taken from the painting's palette. No textures except the existing cloud atlas. No painterly pass.
- Every new non-vendor `.js` file is appended to the `check` script in `package.json` as `&& node --check <path>`.
- The working tree on `main` has unrelated uncommitted changes. Work on a branch or worktree, and `git add` only the files each task names.

## Review Focus

1. A saved place that is no longer valid (old version, tampered values, a spot now outside the walkable area) must put the visitor at the arrival pose, silently. → Task 3.
2. Keys still held when the window loses focus or a dialog opens must not leave the visitor walking. → Task 4.
3. A long gap between frames (tab hidden for minutes) must not carry the visitor through a wall or over the water. → Task 2.
4. No WebGL2, a failed three.js import, or a lost GPU context must leave the 2D painting working, with no error toast. → Tasks 6 and 10.
5. Storage that throws (private browsing, quota) must not stop walking or log errors every frame. → Task 3.

---

### Task 1: The place in metres

**Files:**
- Create: `shared/lakeside-space.js`, `shared/space.js`
- Test: `test/space.test.js`
- Modify: `package.json` (`check`)

**Interfaces:**
- Produces, from `shared/lakeside-space.js`: `LAKESIDE_SPACE` (frozen) with
  - `version: 1`, `eyeHeight: 1.6`
  - `arrival: {position: [0, 0], yaw: SKY_CAMERA.bearing, pitch: 0}`
  - `shoreline: [[-30,-14],[-4,-10],[8,-7],[20,-3],[34,4],[60,10],[120,14]]` — land lies to the left of this line as listed (north-west side)
  - `wall: [[-14,-16],[40,-16],[40,24],[-14,24]]` — outer polygon of the yard
  - `cabin: {center: [21,7], size: [9,6], yaw: 160*DEG, wallHeight: 2.6, ridgeHeight: 4.6}` — `yaw` is the azimuth of the long axis, so the long axis runs along `[sin yaw, cos yaw]` and a long face looks toward the arrival position
  - `oak: {position: [4.5,4.5], radius: 0.7, height: 14}`
  - `colliders: [{type:'box', center:[21,7], half:[4.9,3.4], yaw:160*DEG}, {type:'circle', center:[4.5,4.5], radius:1.1}]` — a box's `half[0]` lies along `[sin yaw, cos yaw]`, `half[1]` across it
  - `softMargin: 1.5`, `waterEdge: 0.05`
- Produces, from `shared/space.js`:
  - `shoreDistance(space, x, y): number` — signed metres from the shoreline, positive inland
  - `terrainHeight(space, x, y): number` — for inland distance `d ≥ 0`: `min(0.2*d, 2.4 + 0.02*(d-12))` (the two meet at d = 12); for `d < 0`: `0.2*d`
  - `walkable(space, [x, y]): boolean` — inside `wall`, `terrainHeight ≥ waterEdge`, outside every collider
  - `edgeDistance(space, [x, y]): number` — metres to the nearer of the wall polygon and the water's edge; negative when outside
  - `validSpace(space): boolean`
  - `DEG` re-exported from `celestial.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {edgeDistance, shoreDistance, terrainHeight, validSpace, walkable} from '../shared/space.js';
import {SKY_CAMERA} from '../shared/celestial-projection.js';

test('the authored place is valid and the visitor arrives facing the painting', () => {
  assert.ok(validSpace(S));
  assert.deepEqual(S.arrival, {position: [0, 0], yaw: SKY_CAMERA.bearing, pitch: 0});
  assert.ok(walkable(S, S.arrival.position));
  assert.ok(edgeDistance(S, S.arrival.position) > S.softMargin);
});
test('ground meets the lake at zero and rises inland without steps', () => {
  assert.ok(Math.abs(terrainHeight(S, 8, -7)) < 1e-9);          // a shoreline vertex
  assert.ok(terrainHeight(S, 30, -12) < 0);                      // lake bed
  const h = terrainHeight(S, 0, 0); assert.ok(h > 1 && h < 4, `${h}`);
  for (let x = -14; x < 40; x += .25) {
    const step = Math.abs(terrainHeight(S, x + .25, 5) - terrainHeight(S, x, 5));
    assert.ok(step <= .25 * .2 + 1e-9, `step at ${x}`);
  }
  assert.ok(shoreDistance(S, 0, 0) > 0 && shoreDistance(S, 30, -12) < 0);
});
test('water, cabin, trunk and the far side of the wall are not walkable', () => {
  for (const p of [[30, -12], S.cabin.center, S.oak.position, [-15, 0], [41, 20], [0, 25]])
    assert.equal(walkable(S, p), false, `${p}`);
  for (const p of [[0, 0], [10, 2], [-10, 10], [30, 18]]) assert.equal(walkable(S, p), true, `${p}`);
});
test('non-finite input is never walkable', () => {
  for (const p of [[NaN, 0], [0, Infinity], [], null]) assert.equal(walkable(S, p), false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test test/space.test.js` — Expected: FAIL, cannot find module `shared/lakeside-space.js`.

- [ ] **Step 3: Implement both modules to the Interfaces above.** `validSpace` checks the version, finite numbers, a non-self-touching wall of at least three points, and that the arrival position is walkable.

- [ ] **Step 4: Run and confirm pass**

Run: `node --test test/space.test.js` — Expected: 4 pass. Then `npm test` — Expected: no existing test changes result.

- [ ] **Step 5: Add both files to `check`, run `npm run check`, commit**

```bash
git add shared/lakeside-space.js shared/space.js test/space.test.js package.json
git commit -m "Describe the lakeside yard in metres"
```

---

### Task 2: Walking

**Files:**
- Create: `shared/walker.js`
- Test: `test/walker.test.js`
- Modify: `package.json` (`check`)

**Interfaces:**
- Consumes: `walkable`, `edgeDistance`, `terrainHeight` from Task 1.
- Produces:
  - `WALK = Object.freeze({speed: 1.4, fast: 2.4, turn: 1.2, pitchLimit: 1.2, maxStep: .1, glideSeconds: 2.5})`
  - `stepWalker(space, state, input, dt): state` — pure. `state = {position: [x, y], yaw, pitch}`; `input = {forward, strafe, turn, fast, look: [dYaw, dPitch]}` with `forward`/`strafe`/`turn` in −1…1. Returns a new state.
  - `eyePosition(space, state): [x, y, z]` — ground height plus `space.eyeHeight`
  - `glide(from, to, t): state` — smoothstep blend for `t` in 0…1, turning the short way round

Movement rules the tests do not fully pin:
- `dt` is clamped to `WALK.maxStep`; the move is then applied in sub-steps no longer than 0.1 m.
- A sub-step that ends somewhere not walkable is retried with the direction rotated by ±15°, ±30°, ±45°, ±60°, ±75°, ±85° (nearest first, positive before negative), each shortened by the cosine of its angle. The first walkable candidate is taken; if none is, the visitor stays put. This slides along walls of any shape.
- Speed is multiplied by `clamp(edgeDistance / space.softMargin, 0, 1)` when the move heads toward the edge (edge distance would decrease), and is unscaled when heading away.
- Yaw is kept in `[0, 2π)`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {terrainHeight, walkable} from '../shared/space.js';
import {eyePosition, glide, stepWalker, WALK} from '../shared/walker.js';

const still = {forward: 0, strafe: 0, turn: 0, fast: false, look: [0, 0]};
const walk = (state, input, seconds, dt = 1 / 30) => {
  for (let i = 0, frames = Math.round(seconds / dt); i < frames; i++) state = stepWalker(S, state, {...still, ...input}, dt);
  return state;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('W walks forward along the heading at 1.4 m/s; Shift at 2.4', () => {
  const a = walk(S.arrival, {forward: 1}, 1);
  assert.ok(Math.abs(a.position[0] - 1.4) < 1e-6 && Math.abs(a.position[1]) < 1e-6, `${a.position}`);
  assert.ok(Math.abs(dist(walk(S.arrival, {forward: 1, fast: true}, 1).position, [0, 0]) - 2.4) < 1e-6);
});
test('diagonal walking is no faster than straight', () => {
  assert.ok(dist(walk(S.arrival, {forward: 1, strafe: 1}, 1).position, [0, 0]) <= 1.4 + 1e-6);
});
test('D strafes to the right of the heading', () => {
  assert.ok(walk(S.arrival, {strafe: 1}, 1).position[1] < -1);   // facing east, right is south
});
test('the visitor never ends up anywhere unwalkable, whatever they hold down', () => {
  for (const yaw of [0, .7, 1.57, 2.4, 3.14, 4.0, 4.71, 5.6]) {
    let state = {...S.arrival, yaw};
    for (let i = 0; i < 3000; i++) {
      state = stepWalker(S, state, {...still, forward: 1, fast: true}, 1 / 30);
      assert.ok(walkable(S, state.position), `yaw ${yaw} step ${i} at ${state.position}`);
      assert.ok(state.position.every(Number.isFinite));
    }
  }
});
test('walking into the cabin slides along it rather than stopping dead', () => {
  const start = {position: [10, 4], yaw: Math.PI / 2, pitch: 0};   // due east, meeting the long wall at an angle
  const touching = walk(start, {forward: 1}, 8), later = walk(touching, {forward: 1}, 8);
  assert.ok(dist(touching.position, later.position) > 2, `${touching.position} -> ${later.position}`);
});
test('a long frame gap moves no further than one clamped step', () => {
  const end = stepWalker(S, S.arrival, {...still, forward: 1, fast: true}, 600);
  assert.ok(dist(end.position, [0, 0]) <= WALK.fast * WALK.maxStep + 1e-9);
});
test('looking is clamped in pitch and wrapped in yaw', () => {
  const s = stepWalker(S, S.arrival, {...still, look: [-10, 9]}, 1 / 30);
  assert.equal(s.pitch, WALK.pitchLimit);
  assert.ok(s.yaw >= 0 && s.yaw < Math.PI * 2);
});
test('the eye rides 1.6 m above the ground', () => {
  assert.equal(eyePosition(S, S.arrival)[2], terrainHeight(S, 0, 0) + 1.6);
});
test('glide starts and ends exactly and turns the short way', () => {
  const from = {position: [5, 5], yaw: .1, pitch: .3}, to = {position: [0, 0], yaw: 6.2, pitch: 0};
  assert.deepEqual(glide(from, to, 0), from); assert.deepEqual(glide(from, to, 1), to);
  const mid = glide(from, to, .5).yaw; assert.ok(mid < .1 || mid > 6.2, `${mid}`);
});
```

- [ ] **Step 2: Run** `node --test test/walker.test.js` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `shared/walker.js`** to the Interfaces and rules above.
- [ ] **Step 4: Run** `node --test test/walker.test.js` — Expected: 9 pass.
- [ ] **Step 5: Add to `check`, commit**

```bash
git add shared/walker.js test/walker.test.js package.json
git commit -m "Add bounded first-person walking"
```

---

### Task 3: Remembered place

**Files:**
- Create: `public/space/place-memory.js`
- Test: `test/place-memory.test.js`
- Modify: `package.json` (`check`)

**Interfaces:**
- Consumes: `walkable` (Task 1), `WALK.pitchLimit` (Task 2).
- Produces:
  - `PLACE_KEY = 'a-view:place:lakeside-cottage'`, `STILL_MS = 3000`
  - `class PlaceMemory { constructor({storage, space, clock = Date.now}) }`
  - `load(): {position, yaw, pitch} | null`
  - `note(state, moving: boolean): void` — call every frame; writes once the visitor has been still for `STILL_MS` and the state differs from the last write
  - `flush(state): void` — writes now if different from the last write
  - `forget(): void`
- Stored record: `{version: 1, position: [x, y], yaw, pitch, savedAt}`.
- After any storage call throws, the instance stops touching storage for the rest of the page's life.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {PlaceMemory, PLACE_KEY, STILL_MS} from '../public/space/place-memory.js';

const store = (initial = {}) => { const m = new Map(Object.entries(initial)); let writes = 0;
  return {getItem: k => m.get(k) ?? null, setItem: (k, v) => { writes++; m.set(k, v); }, removeItem: k => m.delete(k), get writes() { return writes; }}; };
const spot = {position: [10, 2], yaw: 1, pitch: -.2};
const saved = record => store({[PLACE_KEY]: JSON.stringify(record)});
const good = {version: 1, ...spot, savedAt: 5};

test('a first visit has no remembered place', () => {
  assert.equal(new PlaceMemory({storage: store(), space: S}).load(), null);
});
test('a place is written only after three still seconds, and only once', () => {
  let now = 0; const storage = store(), memory = new PlaceMemory({storage, space: S, clock: () => now});
  memory.note(spot, true); now = 1000; memory.note(spot, false); now = 1000 + STILL_MS - 1; memory.note(spot, false);
  assert.equal(storage.writes, 0);
  now = 1000 + STILL_MS; memory.note(spot, false); now += 60_000; memory.note(spot, false);
  assert.equal(storage.writes, 1);
  assert.deepEqual(new PlaceMemory({storage, space: S}).load(), spot);
});
test('flush writes immediately; forget removes it', () => {
  const storage = store(), memory = new PlaceMemory({storage, space: S});
  memory.flush(spot); assert.deepEqual(memory.load(), spot);
  memory.forget(); assert.equal(memory.load(), null); assert.equal(storage.getItem(PLACE_KEY), null);
});
test('anything invalid is ignored, so the visitor arrives at the painting view', () => {
  for (const bad of [{...good, version: 2}, {...good, position: [30, -12]}, {...good, position: S.cabin.center},
    {...good, position: [NaN, 0]}, {...good, yaw: 'east'}, {...good, pitch: 3}, {...good, position: [1]}, null, 7])
    assert.equal(new PlaceMemory({storage: saved(bad), space: S}).load(), null, JSON.stringify(bad));
  assert.equal(new PlaceMemory({storage: store({[PLACE_KEY]: '{not json'}), space: S}).load(), null);
  assert.equal(new PlaceMemory({storage: store({[PLACE_KEY]: 'x'.repeat(600)}), space: S}).load(), null);
});
test('storage that throws is survived and not retried', () => {
  let calls = 0; const storage = {getItem() { calls++; throw new Error('denied'); }, setItem() { calls++; throw new Error('quota'); }, removeItem() { calls++; throw new Error('denied'); }};
  const memory = new PlaceMemory({storage, space: S});
  assert.equal(memory.load(), null); memory.flush(spot); memory.note(spot, false); memory.forget();
  assert.equal(calls, 1);
  assert.doesNotThrow(() => new PlaceMemory({storage: undefined, space: S}).flush(spot));
});
```

- [ ] **Step 2: Run** `node --test test/place-memory.test.js` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Reject stored text longer than 512 characters before parsing.
- [ ] **Step 4: Run** — Expected: 5 pass.
- [ ] **Step 5: Add to `check`, commit**

```bash
git add public/space/place-memory.js test/place-memory.test.js package.json
git commit -m "Remember where a visitor stopped"
```

---

### Task 4: Keys

**Files:**
- Create: `public/space/walk-keys.js`
- Test: `test/walk-keys.test.js`
- Modify: `package.json` (`check`)

**Interfaces:**
- Produces: `class WalkKeys { constructor(target, {blocked = () => false} = {}) }` — listens for `keydown`, `keyup` and `blur` on `target`; `input(): {forward, strafe, turn, fast}`; `moving(): boolean`; `release(): void`; `dispose(): void`.
- Mapping by `event.code`: forward `KeyW`/`ArrowUp`; back `KeyS`/`ArrowDown`; strafe left `KeyA`/`ArrowLeft`; strafe right `KeyD`/`ArrowRight`; turn left `KeyQ`; turn right `KeyE`; fast `ShiftLeft`/`ShiftRight`. Opposite keys cancel to 0.
- A `keydown` is ignored when `blocked()` is true, when Ctrl, Meta or Alt is held, or when `event.target` is an `input`, `textarea`, `select` or content-editable element. A handled arrow key calls `preventDefault()`.
- `input()` returns all zeros while `blocked()` is true, even for keys already held.

- [ ] **Step 1: Write the failing tests** (Node's global `EventTarget` and `Event` stand in for the window)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {WalkKeys} from '../public/space/walk-keys.js';

const key = (type, code, more = {}) => {
  const event = new Event(type, {cancelable: true});
  for (const [name, value] of Object.entries({code, ...more})) Object.defineProperty(event, name, {value});
  return event;
};
const zero = {forward: 0, strafe: 0, turn: 0, fast: false};

test('W A S D, arrows, Q E and Shift map to walking input', () => {
  const t = new EventTarget(), k = new WalkKeys(t);
  for (const c of ['KeyW', 'KeyD', 'KeyE', 'ShiftLeft']) t.dispatchEvent(key('keydown', c));
  assert.deepEqual(k.input(), {forward: 1, strafe: 1, turn: 1, fast: true}); assert.equal(k.moving(), true);
  t.dispatchEvent(key('keydown', 'KeyS')); assert.equal(k.input().forward, 0);
  for (const c of ['KeyW', 'KeyS', 'KeyD', 'KeyE', 'ShiftLeft']) t.dispatchEvent(key('keyup', c));
  assert.deepEqual(k.input(), zero);
  t.dispatchEvent(key('keydown', 'ArrowLeft')); t.dispatchEvent(key('keydown', 'KeyQ'));
  assert.deepEqual(k.input(), {forward: 0, strafe: -1, turn: -1, fast: false});
});
test('losing focus releases every key', () => {
  const t = new EventTarget(), k = new WalkKeys(t);
  t.dispatchEvent(key('keydown', 'KeyW')); t.dispatchEvent(new Event('blur'));
  assert.deepEqual(k.input(), zero); assert.equal(k.moving(), false);
});
test('an open dialog stops walking, including keys already held', () => {
  let open = false; const t = new EventTarget(), k = new WalkKeys(t, {blocked: () => open});
  t.dispatchEvent(key('keydown', 'KeyW')); open = true; assert.deepEqual(k.input(), zero);
  t.dispatchEvent(key('keydown', 'KeyD')); open = false; assert.equal(k.input().strafe, 0);
});
test('shortcuts and typing are left alone', () => {
  const t = new EventTarget(), k = new WalkKeys(t);
  t.dispatchEvent(key('keydown', 'KeyW', {ctrlKey: true}));
  t.dispatchEvent(key('keydown', 'KeyD', {target: {tagName: 'INPUT'}}));
  assert.deepEqual(k.input(), zero);
  const arrow = key('keydown', 'ArrowUp'), letter = key('keydown', 'KeyW');
  t.dispatchEvent(arrow); t.dispatchEvent(letter);
  assert.equal(arrow.defaultPrevented, true); assert.equal(letter.defaultPrevented, false);
});
test('dispose stops listening', () => {
  const t = new EventTarget(), k = new WalkKeys(t); k.dispose();
  t.dispatchEvent(key('keydown', 'KeyW')); assert.deepEqual(k.input(), zero);
});
```

The helper defines `target` as an own property because `Event.prototype.target` is a read-only getter; `WalkKeys` reads plain `event.target`.

- [ ] **Step 2: Run** `node --test test/walk-keys.test.js` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: 5 pass.
- [ ] **Step 5: Add to `check`, commit**

```bash
git add public/space/walk-keys.js test/walk-keys.test.js package.json
git commit -m "Map keys to walking input"
```

---

### Task 5: Sky bodies without a fixed camera

**Files:**
- Modify: `shared/sky.js` (add one export; `celestialPose` unchanged)
- Test: `test/sky.test.js` (append)

**Interfaces:**
- Produces: `skyBodies(calendar, {seed = 617, model = CELESTIAL_MODEL, worldMs = calendar.total} = {})` returning
  `{night, sun: {direction, angularDiameter, opacity, warmth}, moon: {direction, angularDiameter, opacity, phase, illumination}, sunDirection, stars: [{id, direction, radius, opacity}]}`.
  `direction` is the body's `apparentDirection` (east, north, up); stars use their plain `direction`. `angularDiameter` already includes `model.sizeScale`. Opacity, warmth and star light use exactly the formulas in `celestialPose`.

- [ ] **Step 1: Append the failing test**

```js
import {skyBodies} from '../shared/sky.js';
test('camera-free sky bodies agree with the projected pose', () => {
  for (const now of [0, 4e6, 9.1e7, 3.3e8, 1.2e9]) {
    const c = calendar(0, now), pose = celestialPose(c), sky = skyBodies(c);
    assert.equal(sky.night, pose.night);
    assert.equal(sky.sun.opacity, pose.sun.opacity); assert.equal(sky.sun.warmth, pose.sun.warmth);
    assert.equal(sky.moon.opacity, pose.moon.opacity); assert.equal(sky.moon.phase, pose.moon.phase);
    assert.deepEqual(sky.sun.direction, pose.sun.apparentDirection);
    assert.equal(sky.stars.length, pose.stars.length);
    sky.stars.forEach((s, i) => assert.equal(s.opacity, pose.stars[i].opacity));
    assert.ok(Math.abs(Math.hypot(...sky.moon.direction) - 1) < 1e-9);
  }
});
```

- [ ] **Step 2: Run** `node --test test/sky.test.js` — Expected: FAIL, `skyBodies` is not exported.
- [ ] **Step 3: Implement `skyBodies`** in `shared/sky.js`.
- [ ] **Step 4: Run** `node --test test/sky.test.js test/celestial.test.js` — Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add shared/sky.js test/sky.test.js
git commit -m "Expose sky bodies as directions for a free camera"
```

---

### Task 6: three.js, the view shell, and the switch

**Files:**
- Create: `public/assets/vendor/three-0.170.0.module.js`, `public/assets/vendor/three-LICENSE.txt`, `public/space/space-view.js`
- Modify: `public/index.html` (add `<canvas id="space" aria-hidden="true" hidden></canvas>` after `#life`), `public/style.css` (give `#space` the same full-window rule as `#painting`), `public/app.js`, `ARTWORK.md` or `README.md` (one line recording the vendored library, version and MIT licence), `package.json` (`check`)

The spec suggested `public/vendor/`. `public/assets/vendor/` is used instead because `src/server.js` gives only paths containing `/assets/` a one-day cache lifetime, and the file name carries the version.

**Interfaces:**
- Consumes: `LAKESIDE_SPACE`, `eyePosition`, `viewConditions`.
- Produces: `class SpaceView { constructor(canvas, {space = LAKESIDE_SPACE, onFailure} = {}) }` with
  - `async init(): Promise<boolean>` — `false` if a WebGL2 context cannot be created
  - `render(snapshot, now, study = null): {calendar, weather} | undefined` — same contract as `Painting.render`
  - `state: {position, yaw, pitch}` (starts at `space.arrival`)
  - `motion: boolean` (false under `prefers-reduced-motion`), and the read-only fields `app.js` reads from a painter: `birdRenderer = {valid: false}`, `birdActive = false`, `cottageActive = false`, `coincidenceActive = false`
  - `dispose(): void`
  - `onFailure()` is called once if the GPU context is lost.
  - When the page URL has a `check` parameter, the instance is assigned to `window.__space`.
- `toThree([x, y, z]): [x, z, -y]` exported from `space-view.js`.

- [ ] **Step 1: Vendor three.js**

```bash
cd "$(mktemp -d)" && npm pack three@0.170.0 && tar -xzf three-0.170.0.tgz
```

Copy `package/build/three.module.js` to `public/assets/vendor/three-0.170.0.module.js` and `package/LICENSE` to `public/assets/vendor/three-LICENSE.txt`.

Verify: `grep -cE "from ['\"]\./" public/assets/vendor/three-0.170.0.module.js` — Expected: `0` (self-contained). If it is not 0, stop and report; do not pick another version silently.

- [ ] **Step 2: Implement `SpaceView` as a shell.** A `WebGLRenderer` on `#space` (`antialias: true`, `powerPreference: 'low-power'`), pixel ratio `min(devicePixelRatio, 1.6)`, a `PerspectiveCamera` with rotation order `'YXZ'`, `rotation.y = -yaw`, `rotation.x = pitch`, positioned at `toThree(eyePosition(space, state))`, near 0.1, far 4000. Vertical field of view from the Global Constraints, recomputed on resize. For this task the scene holds one flat green ground plane so the result is visible. `render` computes `viewConditions(snapshot.world.epoch, now, study)`, draws, and returns it.

- [ ] **Step 3: Switch in `public/app.js`.** Replace the `painter` constant with a `let`. When `new URLSearchParams(location.search).get('space') === '1'`, dynamically import `./space/space-view.js`, construct it on `#space`, and `await init()`. On a rejected import, a `false` result, or a later `onFailure`: dispose the view, hide `#space`, and continue with `new Painting(...)` exactly as today, with no toast. While the 3D view is active, unhide `#space` and hide `#painting`, `#life` and `#fallback`.

- [ ] **Step 4: Verify by hand**

Run: `A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start`
- `http://127.0.0.1:4190/` — Expected: the 2D painting exactly as before; the network panel shows no request for `three-0.170.0.module.js`.
- `http://127.0.0.1:4190/?space=1` — Expected: a green plane to the horizon, no console errors, clock and weather labels still updating.
- Run `npm test && npm run check` — Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add public/assets/vendor public/space/space-view.js public/index.html public/style.css public/app.js package.json README.md
git commit -m "Add an optional three.js view behind ?space=1"
```

---

### Task 7: The blockout

**Files:**
- Create: `public/space/blockout.js`
- Modify: `public/space/space-view.js` (replace the green plane), `package.json` (`check`)

**Interfaces:**
- Consumes: `LAKESIDE_SPACE`, `terrainHeight`, `toThree`.
- Produces: `buildBlockout(THREE, space): {group, dispose()}` — a `THREE.Group` containing, as separately named children: `terrain`, `lake`, `cabin`, `oak`, `wall`, `hills`.

What each child is:
- `terrain`: a grid mesh over x −60…140, y −60…70 at 1 m spacing, heights from `terrainHeight`, moss green `#6f7f52`.
- `lake`: a flat plane at z = 0 reaching 1500 m east and south, `#9fb3b4`.
- `cabin`: walls from `space.cabin` (stone `#b9a67c`), a pitched roof to `ridgeHeight` with the ridge along the long axis (slate `#5f6468`), a chimney at one end, a dark door rectangle centred on the long face nearest the arrival position, one dark window either side of it, and one small dark window on the opposite face.
- `oak`: a tapered trunk at `space.oak` (bark `#4a3f33`) with a rough dark-green canopy mass above 5 m (`#4f6340`).
- `wall`: a stone wall 1.1 m high, 0.5 m thick along `space.wall`, omitted wherever the ground under it is below z = 0.3, `#9c927c`.
- `hills`: a ring of low ridge shapes 500–900 m out, tallest to the east (rising to about 5° above eye level seen from the arrival pose), muted blue-green `#7f958f`, plus woodland masses (`#4b5b43`) 8–25 m beyond the wall on its land sides.

All materials are `MeshLambertMaterial`, flat colour.

- [ ] **Step 1: Implement `buildBlockout` and add its group to the scene in `SpaceView.init`; call its `dispose` from `SpaceView.dispose`.**

- [ ] **Step 2: Verify by hand** at `http://127.0.0.1:4190/?space=1`.

Expected from the arrival view: the cabin left of centre, the oak trunk at the far left, water to the right and ahead, hills along the far shore. No gap between ground and water, nothing floating, no console errors.

- [ ] **Step 3: Add to `check`, run `npm run check`, commit**

```bash
git add public/space/blockout.js public/space/space-view.js package.json
git commit -m "Block out the yard, cabin, oak, wall and hills"
```

---

### Task 8: Live sky and light

**Files:**
- Create: `public/space/sky-dome.js`
- Modify: `public/space/space-view.js`, `package.json` (`check`)

**Interfaces:**
- Consumes: `skyBodies` (Task 5), `skyLighting`, `sampleCloudLayers`, `cloudAlpha`'s formula, `SCENES[0].sky` (layer config and the cloud atlas path), `toThree`.
- Produces: `class SkyDome { constructor(THREE, skyConfig) ; async load() ; update({calendar, weather, bodies, clouds, cameraPosition}) ; object3d ; dispose() }`.

Behaviour:
- A dome centred on the camera every frame, drawn first, never writing depth, so terrain, hills and the oak hide the sun, moon and stars by ordinary depth testing.
- Clear sky: a vertical gradient mixing day (`#9db3c1` top, `#d3d3bf` at the horizon, the RGB values in `ARTWORK.md`) and night (the same scaled by 0.22, 0.31, 0.43) by `calendar.light`, warmed near the horizon by `skyLighting(...).dusk`.
- Sun and moon: discs at `bodies.sun.direction` / `bodies.moon.direction`, angular size `angularDiameter`, opacity as given. The moon is shaded by phase toward `bodies.sunDirection`.
- Stars: one `THREE.Points` at `bodies.stars[i].direction`, per-star opacity as given.
- Clouds: the two layers from `sampleCloudLayers`, each mapped round the full dome between 4° and 60° altitude, scrolled by `phase / period`, density from the same threshold/softness/opacity/floor rule as `cloudAlpha`. Read `public/sky-renderer.js` `FRAGMENT` for how the atlas regions are addressed. If the atlas fails to load, the dome renders without clouds.
- Light: one `HemisphereLight` and one `DirectionalLight` in `SpaceView`, intensities and colours blended by `calendar.light`; the directional light points from the sun by day and from the moon by night. Scene fog matches the horizon colour, so the lake's far edge dissolves into it.
- Reduced motion: as in `Painting`, when `motion` is false the celestial time and cloud motion time are frozen at their first sampled values, while `calendar.light` and weather stay live. A change of `study` re-samples the frozen celestial time.

- [ ] **Step 1: Implement `SkyDome` and wire it into `SpaceView.render`.**

- [ ] **Step 2: Verify by hand** at `?space=1`, using the existing light studies in the About panel.

Expected: **dawn** shows the sun low over the eastern ridge straight ahead; **night** shows stars and a dark yard; **rain** shows heavy cloud; **Return to live** restores the present. The sun's bearing and height match the 2D page opened side by side on the same study.

- [ ] **Step 3: Add to `check`, run `npm run check`, commit**

```bash
git add public/space/sky-dome.js public/space/space-view.js package.json
git commit -m "Put the shared sky over the yard"
```

---

### Task 9: Walking the yard and coming back

**Files:**
- Modify: `public/space/space-view.js`, `public/app.js`, `public/index.html`, `public/style.css`

**Interfaces:**
- Consumes: `stepWalker`, `glide`, `WALK` (Task 2); `PlaceMemory` (Task 3); `WalkKeys` (Task 4).
- Produces on `SpaceView`:
  - `lookBy(dx, dy): void` — pixels of pointer drag; 0.004 rad per pixel; grab-style (dragging right turns the view left, dragging down tilts the view up)
  - `returnToArrival(): void` — a `WALK.glideSeconds` glide; an immediate jump when `motion` is false; any walking key or drag cancels the glide
  - `flushPlace(): void`, `forgetPlace(): void`

- [ ] **Step 1: In `SpaceView`,** create `WalkKeys` on `window` with `blocked` = any `<dialog>` open, and a `PlaceMemory` on `localStorage` (guard the property access with try/catch). In `init`, start from `memory.load() ?? space.arrival`. In `render`, advance with `stepWalker` using the real time since the previous `render` call, then call `memory.note(state, moving)`, where moving means keys held, a drag in progress, or a glide in progress. Release keys when the document becomes hidden.

- [ ] **Step 2: In `public/app.js`,** route the existing `#world` pointer drag to `painter.lookBy(dx, dy)` when that method exists, otherwise to `panBy(dx)` as today. Call `flushPlace()` in the existing `pagehide` handler and when the document becomes hidden. Add a second listener (`addEventListener`, leaving the existing `onclick` alone) on `#forget-visits` that calls `forgetPlace()`.

- [ ] **Step 3: In `public/index.html`,** add a `chrome` button `#arrival-button`, hidden by default, labelled "Return to the painting's view", shown only while the 3D view is active. Change the `#visit-storage` text to: "Visit memory and your place in the yard stay in this browser." On first activation of the 3D view in a page load, show the toast "Walk with W A S D. Drag to look."

- [ ] **Step 4: Verify by hand** at `?space=1`.

Expected:
- W A S D and the arrows walk; Q and E turn; Shift is brisker; dragging looks.
- Walking at the cabin, the oak, the water and the wall stops or slides, with no jitter.
- Opening the About panel while holding W stops the walk.
- Walk somewhere, stand still for four seconds, reload: same spot and gaze.
- **Return to the painting's view** glides back. **Forget visit memory**, then reload: the arrival view.
- `npm test && npm run check` pass.

- [ ] **Step 5: Commit**

```bash
git add public/space/space-view.js public/app.js public/index.html public/style.css
git commit -m "Walk the yard and return to a remembered place"
```

---

### Task 10: Browser check and notes

**Files:**
- Create: `scripts/check-space-browser.mjs`, `docs/space-validation/README.md`
- Modify: `package.json` (`check`), `.gitignore` (ignore `docs/space-validation/*.png` except `arrival.png` and `remembered.png`), `README.md`

**Interfaces:**
- Consumes: `window.__space` (Task 6, present with `&check`).

The script follows `scripts/check-coincidences-browser.mjs`: optional Playwright through `createRequire`, `SKY_PREVIEW_URL` (default `http://127.0.0.1:4190`), `BROWSER_EXECUTABLE`, a `check(name, pass, detail)` helper, results written to `docs/space-validation/space-browser-results.json`, non-zero exit on any failure or page error.

- [ ] **Step 1: Write the script with these checks**

1. `/` loads with no request whose URL contains `three-`, and `#space` is hidden.
2. `/?space=1&check` reaches `window.__space` with `state` equal to the arrival pose; save `arrival.png`.
3. Holding `KeyW` for 2 s moves `state.position[0]` east by between 2.2 and 3.2 m.
4. Holding `KeyW` with Shift for 40 s from four headings never leaves a position where `walkable` is false (import `/shared/space.js` in the page to test it).
5. Opening `#about-dialog` while `KeyW` is held leaves the position unchanged over 1 s.
6. After walking, waiting 3.5 s and reloading, `state` matches the pre-reload state to within 1e-6; save `remembered.png`.
7. After clicking `#forget-visits` and reloading, `state` is the arrival pose.
8. A page whose `HTMLCanvasElement.prototype.getContext` returns `null` for `'webgl2'` (injected with `addInitScript`) shows the 2D view: `#space` hidden, `#painting` or `#fallback` visible, no page errors.
9. Calling `loseContext()` from the `WEBGL_lose_context` extension on the 3D canvas returns the page to the 2D view within 2 s.
10. At a 390 × 844 viewport, the camera's vertical field of view is ≤ 75° and the frame is not blank (centre pixel differs from a corner pixel).

- [ ] **Step 2: Run it**

```bash
A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4190 npm start
```

```bash
node scripts/check-space-browser.mjs
```

Expected: ten `PASS` lines, exit code 0. Fix the view, not the check, for any failure.

- [ ] **Step 3: Write `docs/space-validation/README.md`** with the results and the two captures, and state plainly that this is an untextured blockout and that no phone or integrated-GPU frame-rate measurement has been taken. Add a short "Walking the yard (preview)" section to `README.md` giving the `?space=1` address, the controls, and the same limits.

- [ ] **Step 4: Run** `npm test && npm run check` — Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-space-browser.mjs docs/space-validation .gitignore package.json README.md
git commit -m "Check the walkable blockout in a browser"
```

## Carried forward

Found in the final whole-branch review and left for later phases.

**Phase 2**
- Test that the cabin and oak colliders contain their mesh footprints with margin (this also covers box orientation).
- Tests for edge slowdown and keyboard turn in the walker.
- `skyBodies` asserts for `angularDiameter`, illumination and `sunDirection`.
- Tests for `toThree`, `verticalFov` and `skyColours`.
- A unit test for `SpaceView.step()` decisions.
- An automated blockout build test.
- Release the WebGL2 context if init throws after `getContext`.
- Do not await the cloud atlas in init, and do not step the walker before the view is shown.
- Stars vanish on small drawing buffers: floor the area attenuation.
- The hemisphere light ignores cloud, so rain is too bright.
- The cloud repeat count round the dome needs the owner's eye.

**Phase 4**
- `WALK.maxStep` could rise to about 0.25 s (the walker already sub-steps every 0.1 m with a walkable test), keeping real-time walking down to about 4 fps, ahead of the 20 fps fallback gate.
- Touch input.
- Accessibility descriptions for the 3D view.
- Phone and integrated-GPU frame-rate measurement (the scene is about 242k triangles, mostly terrain skirt).

**Plan correction**
- Task 8's "dawn shows the sun straight ahead over the eastern ridge" was wrong for late spring at 49° N: sunrise azimuth is about 62°.
