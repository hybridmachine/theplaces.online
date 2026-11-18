# Cabin Interior Part 1 (Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `?interior=1`, the cabin's front door opens as the visitor reaches it, a fade carries them into a plain two-storey interior they can walk through room by room and up the stair, and their indoor place is remembered.

**Architecture:** The interior is a second "ground" for the existing walker: a pure blueprint (`shared/lakeside-interior.js`) with pure rules for where one can stand, how high the floor is, and when the threshold is crossed (`shared/interior.js`, `shared/threshold.js`). Indoors the position is `[a, d]` in the interior frame, used exactly as the yard's `[x, y]` (yaw is clockwise from +d), so `toThree`, the camera and the keys are reused unchanged. `SpaceView` holds a `place` and draws either the yard scene or a lazily built interior scene.

**Tech Stack:** Plain ES modules, three.js 0.170 (handed in), `node --test`, optional Playwright script.

**Spec:** `docs/superpowers/specs/2026-11-17-cabin-interior-design.md` (this plan covers "Parts → 1. Shell" only; live windows, light and furnishing are later plans)

## Global Constraints

- Everything new is behind `?interior=1`. Without it the door stays shut and nothing a visitor sees changes; every existing test passes unchanged.
- No server, world-state or persisted-state change other than the place record. No new art files: `artFiles().length` is unchanged.
- Nothing indoors depends on what a visitor did, only on shared state and the clock. The door's swing is per-visitor presentation.
- No prompts, HUD or loading screen. No visitor-operable things.
- Interior frame, metres: `a` 0–18 along the front wall from the chimney end, `d` 0–12 from the front wall, z up from the ground floor. Internal walls 0.15 m thick centred on room lines. The eye keeps 0.25 m from every wall face.
- Ground-floor ceiling 2.7 m. Upper floor at 3.0 m; its ceiling is 1.9 m at d = 0 and d = 12 rising linearly to 3.6 m at d = 6.
- Every opening is at least 0.9 m clear.
- Windows and the doorway seen from indoors show a flat sky colour in this part.
- Pure modules live in `shared/`, take no three.js, and have Node tests. Every new `.js` file is added to the `check` script in `package.json`.
- Eye height 1.6 m, walk 1.4 m/s, fast 2.4 m/s, as in the yard (`WALK`, `space.eyeHeight`).

## Review Focus

- A remembered indoor place loaded without `?interior=1` (or with a corrupt `floor`/`place`) must fall back to the arrival pose, not strand the visitor inside a solid cabin (Task 5 test).
- Holding W into any wall, corner, rail or the stairwell from any heading must never leave the walkable area or change floor (Task 3 test).
- Turning round halfway up the stair and walking back down must return to floor 0; the floor changes only by leaving the stair at an end (Task 3 test).
- Standing still at the door, or walking past it sideways, must not carry the visitor in; backing into the hall's doorway must not carry them out (Task 4 tests).
- If the interior scene fails to build, the door stays shut and the yard carries on with no fade and no thrown error per frame (Task 8 test).

---

### Task 1: The blueprint and its validity

**Files:**
- Create: `shared/lakeside-interior.js`, `shared/interior.js`
- Modify: `package.json` (`check`)
- Test: `test/interior.test.js`

**Interfaces:**
- Produces: `LAKESIDE_INTERIOR` (deep-frozen), shaped:
  - `version: 1, size: [18, 12], wall: .15, eyeClear: .25, floorRise: 3.0, groundCeiling: 2.7, eaveCeiling: 1.9, ridgeCeiling: 3.6, ridgeAt: 6, doorHead: 2.1`
  - `rooms: [{id, name, floor, a: [a0, a1], d: [d0, d1]}]`
  - `openings: [{id, floor, rooms: [idA, idB], line: 'a' | 'd', at, span: [lo, hi]}]` — `line: 'a'` means the wall lies on the line a = `at`, and `span` is its d range
  - `stair: {a: [9.6, 11], d: [1.5, 5.4]}` (foot at d = 1.5 on floor 0, top at d = 5.4 on floor 1)
  - `door: {a: 9, width: 1}` (in the front wall, d = 0, floor 0)
  - `windows: [{id, room, kind: 'wall' | 'roof', ...}]` (below)
  - `entry: {position: [9, .8], yaw: 0, pitch: 0}`
- Produces: `validInterior(I) → boolean`, `roomAt(I, floor, [a, d]) → room | null` (by room rectangle, walls ignored), `ceilingHeight(I, floor, d) → metres above that floor`.

Rooms (id, name, floor, a, d) — copy exactly:

| id | name | floor | a | d |
|---|---|---|---|---|
| living | living room | 0 | 0–7 | 0–7 |
| hall | entry hall | 0 | 7–11 | 0–7 |
| study | study | 0 | 11–18 | 0–4 |
| passage | closet passage | 0 | 11–14 | 4–7 |
| bath-ground | bathroom | 0 | 14–18 | 4–7 |
| laundry | laundry | 0 | 0–2.5 | 7–9.5 |
| pantry | pantry | 0 | 0–2.5 | 9.5–12 |
| kitchen | kitchen | 0 | 2.5–7 | 7–12 |
| dining | dining room | 0 | 7–11 | 7–12 |
| master | master bedroom | 0 | 11–18 | 7–12 |
| bedroom-2 | second bedroom | 1 | 0–7 | 0–7 |
| landing | landing | 1 | 7–11 | 0–7 |
| bedroom-3 | third bedroom | 1 | 11–18 | 0–7 |
| sky-room | sky room | 1 | 0–7 | 7–12 |
| nook | library nook | 1 | 7–11 | 7–12 |
| bath-upper | upstairs bathroom | 1 | 11–15 | 7–12 |
| box-room | box room | 1 | 15–18 | 7–9.5 |
| linen | linen cupboard | 1 | 15–18 | 9.5–12 |

Openings (id is `<roomA>-<roomB>`; line, at, span):

| floor | rooms | line | at | span |
|---|---|---|---|---|
| 0 | hall, living | a | 7 | 2–5 |
| 0 | hall, study | a | 11 | 0.3–1.3 |
| 0 | hall, passage | a | 11 | 5.7–6.7 |
| 0 | hall, dining | d | 7 | 7.6–10.4 |
| 0 | living, kitchen | d | 7 | 3.5–6 |
| 0 | kitchen, dining | a | 7 | 7.5–11.5 |
| 0 | kitchen, laundry | a | 2.5 | 7.8–8.8 |
| 0 | kitchen, pantry | a | 2.5 | 10.2–11.2 |
| 0 | passage, bath-ground | a | 14 | 5–6 |
| 0 | passage, master | d | 7 | 12–13 |
| 1 | landing, bedroom-2 | a | 7 | 3–4 |
| 1 | landing, bedroom-3 | a | 11 | 5.7–6.7 |
| 1 | landing, nook | d | 7 | 7.5–10.5 |
| 1 | nook, sky-room | a | 7 | 9–10 |
| 1 | nook, bath-upper | a | 11 | 9–10 |
| 1 | bath-upper, linen | a | 15 | 10.2–11.2 |
| 1 | bedroom-3, box-room | d | 7 | 16–17 |

Windows:

| id | room | kind | placement |
|---|---|---|---|
| living | living | wall | wall d = 0, centre a = 4.2, width 1.4, sill .8, height 1.5 |
| study | study | wall | wall d = 0, centre a = 13.8, width 1.4, sill .8, height 1.5 |
| dining | dining | wall | wall d = 12, centre a = 10, width 1.4, sill .8, height 1.5 |
| bedroom-2 | bedroom-2 | roof | centre a = 3.5, width 1.0, d 2.0–3.4 |
| bedroom-3 | bedroom-3 | roof | centre a = 14.5, width 1.0, d 2.0–3.4 |
| sky-room | sky-room | roof | centre a = 3.5, width 2.4, d 8.6–10.4 |

Store wall windows as `{wall: 'front' | 'back', a, width, sill, height}` and roof windows as `{a, width, d: [d0, d1]}`.

- [ ] **Step 1: Write the failing tests** in `test/interior.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {ceilingHeight, roomAt, validInterior} from '../shared/interior.js';

test('each floor is tiled exactly by its rooms: 18 × 12 with no overlap', () => {
  for (const floor of [0, 1]) {
    const rooms = I.rooms.filter(r => r.floor === floor);
    assert.equal(rooms.reduce((s, r) => s + (r.a[1] - r.a[0]) * (r.d[1] - r.d[0]), 0), 216);
    for (let a = .25; a < 18; a += .5) for (let d = .25; d < 12; d += .5)
      assert.equal(rooms.filter(r => a > r.a[0] && a < r.a[1] && d > r.d[0] && d < r.d[1]).length, 1, `${floor} ${a} ${d}`);
  }
});
test('the owner\'s rooms are all there', () => {
  for (const id of ['living', 'study', 'kitchen', 'pantry', 'master', 'bedroom-2', 'bedroom-3', 'bath-ground', 'bath-upper']) assert.ok(I.rooms.find(r => r.id === id), id);
  assert.equal(I.rooms.find(r => r.id === 'master').floor, 0);
});
test('every opening lies on the wall its two rooms share, is at least 0.9 m clear, and keeps off the stair', () => {
  for (const o of I.openings) {
    const [p, q] = o.rooms.map(id => I.rooms.find(r => r.id === id)), along = o.line === 'a' ? 'd' : 'a';
    assert.ok(p && q && p.floor === o.floor && q.floor === o.floor, o.id);
    assert.ok([p, q].every(r => r[o.line].includes(o.at)), `${o.id} on the shared line`);
    assert.ok([p, q].every(r => o.span[0] >= r[along][0] + I.wall / 2 && o.span[1] <= r[along][1] - I.wall / 2), `${o.id} within both rooms`);
    assert.ok(o.span[1] - o.span[0] >= .9, `${o.id} clear width`);
    if (o.line === 'a' && o.at === 11 && o.span[0] < 7) assert.ok(o.span[1] <= I.stair.d[0] || o.span[0] >= I.stair.d[1], `${o.id} beside the stair`);
  }
});
test('every room is reachable from the hall through openings and the stair', () => {
  const seen = new Set(['hall', 'landing']);   // the stair joins them
  for (let grew = true; grew;) { grew = false; for (const o of I.openings) { const [x, y] = o.rooms; if (seen.has(x) !== seen.has(y)) { seen.add(x); seen.add(y); grew = true; } } }
  assert.deepEqual(I.rooms.map(r => r.id).filter(id => !seen.has(id)), []);
});
test('the stair is 1.4 m wide, rises 3 m over 3.9 m, inside the hall and landing', () => {
  assert.deepEqual([I.stair.a, I.stair.d, I.floorRise], [[9.6, 11], [1.5, 5.4], 3]);
  assert.ok(I.door.a + I.door.width / 2 <= I.stair.a[0]);
});
test('ceilings: 2.7 m downstairs; 1.9 m at the eaves to 3.6 m at the ridge upstairs', () => {
  assert.equal(ceilingHeight(I, 0, 3), 2.7);
  for (const [d, h] of [[0, 1.9], [12, 1.9], [6, 3.6], [3, 2.75]]) assert.ok(Math.abs(ceilingHeight(I, 1, d) - h) < 1e-9, `${d}`);
});
test('windows sit in their rooms; roomAt finds rooms and nothing outside', () => {
  for (const w of I.windows) { const r = I.rooms.find(x => x.id === w.room); assert.ok(w.a - w.width / 2 >= r.a[0] + I.wall && w.a + w.width / 2 <= r.a[1] - I.wall, w.id); }
  assert.equal(roomAt(I, 0, [9, 1]).id, 'hall'); assert.equal(roomAt(I, 1, [9, 1]).id, 'landing'); assert.equal(roomAt(I, 0, [-1, 1]), null);
});
test('validInterior accepts the blueprint and rejects broken ones', () => {
  assert.ok(validInterior(I));
  const broken = f => { const c = structuredClone(I); f(c); return validInterior(c); };
  assert.ok(!broken(c => { c.version = 2; }));
  assert.ok(!broken(c => { c.rooms[0].a[1] = 8; }));                    // overlap
  assert.ok(!broken(c => { c.openings[0].span = [2, 2.5]; }));          // too narrow
  assert.ok(!broken(c => { c.openings = c.openings.filter(o => !o.rooms.includes('pantry')); }));   // unreachable
  assert.ok(!broken(c => { c.stair.d[1] = NaN; }));
});
```

- [ ] **Step 2: Run** `node --test test/interior.test.js` — expected: FAIL, modules not found.
- [ ] **Step 3: Implement** the data in `shared/lakeside-interior.js` (deep-freeze as `lakeside-space.js` does) and `validInterior`, `roomAt`, `ceilingHeight` in `shared/interior.js`. `validInterior` checks exactly what the tests above check (version 1, all numbers finite, tiling, openings, reachability, entry pose inside the hall).
- [ ] **Step 4: Run** `node --test test/interior.test.js` — expected: PASS. Add both files to `check`; run `npm run check`.
- [ ] **Step 5: Commit** — `git commit -m "Add the cabin interior's blueprint and its validity rules"`

---

### Task 2: Where one can stand, and how high the floor is

**Files:**
- Modify: `shared/interior.js`
- Test: `test/interior.test.js`

**Interfaces:**
- Consumes: `LAKESIDE_INTERIOR`, `roomAt`.
- Produces:
  - `onStair(I, [a, d]) → boolean` — inside the flight's walkable strip: a in [9.6 + eyeClear, 11 − wall/2 − eyeClear], d in [1.5, 5.4].
  - `floorArea(I, floor, [a, d]) → boolean` — standable floor of that storey, stair excluded.
  - `canStep(I, from, to) → boolean`, `from = {floor, position}`, `to = [a, d]` — the one rule for moving indoors.
  - `floorAfter(I, from, to) → 0 | 1` — the floor the visitor is on after a permitted step.
  - `indoorHeight(I, floor, [a, d]) → metres` above the ground floor.
  - `wallSegments(I, floor) → [{from: [a, d], to: [a, d], solid: boolean, opening: id | null}]` — every wall line of that storey (outer walls and each shared room line) cut into solid runs and opening runs, for the scene to build from.

Rules to implement (the tests pin them):

- `floorArea`: true when the point is inside a room of that floor shrunk by `wall/2 + eyeClear` (0.325) on every side, or inside an opening's passage: within 0.325 of the opening's line across it, and within its span shrunk by `eyeClear` at each end. In both cases false if inside the stair's shut-off box: a from 9.6 − eyeClear to 11, and d from 1.5 to 5.4 + eyeClear on floor 0 (the closed under-stair, open at the foot) or d from 1.5 − eyeClear to 5.4 on floor 1 (the railed stairwell, open at the top).
- `canStep`: if `to` is on the stair, allowed only when `from` is on the stair, or `from.floor === 0` and `from.position` d < 1.5, or `from.floor === 1` and `from.position` d > 5.4. Otherwise the target floor is `from.floor`, unless `from` is on the stair, when it is 0 for `to` d < 1.5 and 1 for `to` d > 5.4, and the step is refused for any other `to` (out through the flight's side); allowed when `floorArea(I, target, to)`.
- `floorAfter`: `from.floor` while `to` is on the stair; otherwise the target floor above.
- `indoorHeight`: on the stair, `floorRise × (d − 1.5) / 3.9` whatever `floor` says; otherwise `floor × floorRise`.

- [ ] **Step 1: Write the failing tests** (append):

```js
import {canStep, floorAfter, floorArea, indoorHeight, onStair, wallSegments} from '../shared/interior.js';

test('the eye keeps 0.325 m from room lines and can pass every opening', () => {
  assert.ok(floorArea(I, 0, [3.5, 3.5])); assert.ok(!floorArea(I, 0, [.3, 3.5])); assert.ok(!floorArea(I, 0, [6.8, 1]));
  for (const o of I.openings) {
    const mid = (o.span[0] + o.span[1]) / 2;
    for (const off of [-.3, 0, .3]) assert.ok(floorArea(I, o.floor, o.line === 'a' ? [o.at + off, mid] : [mid, o.at + off]), `${o.id} ${off}`);
    const edge = o.span[0] + .1;
    assert.ok(!floorArea(I, o.floor, o.line === 'a' ? [o.at, edge] : [edge, o.at]), `${o.id} jamb`);
  }
});
test('under the stair and the stairwell are shut; the entry pose is standable', () => {
  assert.ok(!floorArea(I, 0, [10.3, 3])); assert.ok(!floorArea(I, 1, [10.3, 3])); assert.ok(!floorArea(I, 1, [9.5, 3]));
  assert.ok(floorArea(I, 0, [10.3, 1])); assert.ok(floorArea(I, 1, [10.3, 6.2])); assert.ok(floorArea(I, 0, I.entry.position));
});
test('the stair is entered only at its foot from below and its top from above', () => {
  const stair = [10.3, 3];
  assert.ok(onStair(I, stair)); assert.ok(!onStair(I, [9.7, 3]));
  assert.ok(canStep(I, {floor: 0, position: [10.3, 1.45]}, [10.3, 1.55]));
  assert.ok(!canStep(I, {floor: 0, position: [10.3, 5.5]}, [10.3, 5.35]));     // from the hall behind the flight
  assert.ok(canStep(I, {floor: 1, position: [10.3, 5.45]}, [10.3, 5.35]));
  assert.ok(!canStep(I, {floor: 1, position: [10.3, 1.4]}, [10.3, 1.55]));
  assert.ok(!canStep(I, {floor: 0, position: [9.5, 3]}, stair));               // through the side
});
test('leaving the stair sets the floor by the end left; on it the floor is kept', () => {
  assert.equal(floorAfter(I, {floor: 0, position: [10.3, 5.35]}, [10.3, 5.45]), 1);
  assert.equal(floorAfter(I, {floor: 1, position: [10.3, 1.55]}, [10.3, 1.45]), 0);
  assert.equal(floorAfter(I, {floor: 0, position: [10.3, 2]}, [10.3, 2.1]), 0);
  assert.ok(canStep(I, {floor: 0, position: [10.3, 5.35]}, [10.3, 5.45]));
});
test('height follows the flight smoothly from 0 to 3 m', () => {
  assert.equal(indoorHeight(I, 0, [3, 3]), 0); assert.equal(indoorHeight(I, 1, [3, 3]), 3);
  assert.ok(Math.abs(indoorHeight(I, 0, [10.3, 3.45]) - 1.5) < 1e-9);
  assert.equal(indoorHeight(I, 0, [10.3, 1.5]), 0); assert.ok(Math.abs(indoorHeight(I, 1, [10.3, 5.4]) - 3) < 1e-9);
});
test('wall segments cover every wall line once, with each opening as one run', () => {
  for (const floor of [0, 1]) {
    const segs = wallSegments(I, floor), len = s => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
    assert.ok(segs.every(s => len(s) > 0 && (s.from[0] === s.to[0] || s.from[1] === s.to[1])));
    assert.deepEqual(segs.filter(s => s.opening).map(s => s.opening).sort(), I.openings.filter(o => o.floor === floor).map(o => o.id).sort());
    const outer = segs.filter(s => [0, 18].includes(s.from[0]) && s.from[0] === s.to[0] || [0, 12].includes(s.from[1]) && s.from[1] === s.to[1]);
    assert.ok(Math.abs(outer.reduce((n, s) => n + len(s), 0) - 60) < 1e-9);
  }
});
```

- [ ] **Step 2: Run** `node --test test/interior.test.js` — expected: FAIL, exports missing.
- [ ] **Step 3: Implement** the six functions in `shared/interior.js`. `wallSegments` does not include the front door or windows; the scene cuts those from `I.door` and `I.windows`.
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Say where a visitor can stand indoors and how the stair carries them"`

---

### Task 3: Walking indoors

**Files:**
- Modify: `shared/walker.js`
- Test: `test/walker.test.js`

**Interfaces:**
- Consumes: `canStep`, `floorAfter`, `indoorHeight` (Task 2).
- Produces:
  - `stepOn(ground, state, input, dt) → {position, yaw, pitch}` — today's `stepWalker` body, with `ground = {walkable(p, from), edgeDistance(p), softMargin}`; `from` is the position before the sub-step.
  - `stepWalker(space, state, input, dt)` — unchanged behaviour, now `stepOn` over the yard's `walkable` and `edgeDistance`.
  - `stepIndoors(interior, state, input, dt) → {place: 'cabin', floor, position, yaw, pitch}` — `state` carries `floor`; the floor is tracked per sub-step with `floorAfter`; no soft margin (`edgeDistance` returns `Infinity`).
  - `indoorEye(interior, state, eyeHeight) → [a, d, z]`.

- [ ] **Step 1: Write the failing tests** (append to `test/walker.test.js`):

```js
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {floorArea, onStair} from '../shared/interior.js';
import {indoorEye, stepIndoors} from '../shared/walker.js';

const indoors = (state, input, seconds, dt = 1 / 30) => {
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) state = stepIndoors(I, state, {...still, ...input}, dt);
  return state;
};
const entry = {place: 'cabin', floor: 0, ...I.entry};
const standable = s => onStair(I, s.position) || floorArea(I, s.floor, s.position);

test('indoors W walks along +d from the entry at 1.4 m/s', () => {
  const s = indoors(entry, {forward: 1}, 1);
  assert.ok(Math.abs(s.position[1] - (I.entry.position[1] + 1.4)) < 1e-6 && s.position[0] === 9 && s.floor === 0 && s.place === 'cabin');
});
test('held into any wall from any heading, the visitor stays standable and on their floor', () => {
  for (const start of [entry, {...entry, floor: 1, position: [9, 6.3]}, {...entry, position: [3.5, 3.5]}, {...entry, floor: 1, position: [3, 9]}])
    for (let k = 0; k < 16; k++) {
      let s = {...start, yaw: k * Math.PI / 8};
      for (let i = 0; i < 1500; i++) { s = stepIndoors(I, s, {...still, forward: 1, fast: true}, 1 / 30); assert.ok(standable(s), `${start.position} yaw ${k} step ${i} at ${s.position} floor ${s.floor}`); }
    }
});
test('up the stair to the landing, and down again', () => {
  let s = indoors({...entry, position: [10.3, 1.2]}, {forward: 1}, 4);
  assert.equal(s.floor, 1); assert.ok(s.position[1] > 5.4);
  assert.ok(Math.abs(indoorEye(I, s, 1.6)[2] - 4.6) < 1e-9);
  s = indoors({...s, yaw: Math.PI}, {forward: 1}, 4);
  assert.equal(s.floor, 0); assert.ok(s.position[1] < 1.5);
});
test('turning back halfway up returns to the floor one came from', () => {
  let s = indoors({...entry, position: [10.3, 1.2]}, {forward: 1}, 1.5);
  assert.ok(onStair(I, s.position)); assert.ok(indoorEye(I, s, 1.6)[2] > 1.7);
  s = indoors({...s, yaw: Math.PI}, {forward: 1}, 3);
  assert.equal(s.floor, 0);
});
test('from the landing one cannot walk into the stairwell', () => {
  const s = indoors({...entry, floor: 1, position: [9.3, 3], yaw: Math.PI / 2}, {forward: 1}, 1 / 3);
  assert.ok(s.position[0] <= 9.6 - I.eyeClear + 1e-9 && s.floor === 1 && !onStair(I, s.position));
});
```

- [ ] **Step 2: Run** `node --test test/walker.test.js` — expected: FAIL, exports missing.
- [ ] **Step 3: Implement.** Move the body of `stepWalker` and `advance` into `stepOn`/its helper taking `ground`; `advance` passes the current position as `from`. `stepIndoors` runs `stepOn` with a ground whose `walkable(p, from)` is `canStep(I, {floor, position: from}, p)`, updating a local `floor` with `floorAfter` each time a sub-step is accepted.
- [ ] **Step 4: Run** `node --test test/walker.test.js test/space.test.js` — expected: PASS, including every existing yard test untouched.
- [ ] **Step 5: Commit** — `git commit -m "Walk the interior's floors and stair with the yard's walker"`

---

### Task 4: The threshold

**Files:**
- Create: `shared/threshold.js`
- Modify: `package.json` (`check`)
- Test: `test/threshold.test.js`

**Interfaces:**
- Consumes: `doorPosition(space, dressing)`, `cabinFront(space)` from `shared/lakeside-dressing.js`; `LAKESIDE_INTERIOR`.
- Produces:
  - `THRESHOLD = {openWithin: 1.5, enterWithin: .7, facing: 60° in radians, leaveBefore: .45, outside: .9, swingSeconds: .8, fadeSeconds: .6}`
  - `doorOutward(space) → [x, y]` unit vector pointing out of the front wall.
  - `doorWanted(space, dressing, state) → boolean` — yard state within `openWithin` of the door's threshold and heading within `facing` of straight at the door.
  - `entering(space, dressing, state, input) → boolean` — `doorWanted`, within `enterWithin`, and `input.forward > 0`.
  - `leaving(interior, state, input) → boolean` — floor 0, a within the door's width, d < `leaveBefore`, heading within `facing` of −d (yaw π), and `input.forward > 0`.
  - `insidePose(interior) → {place: 'cabin', floor: 0, position, yaw, pitch}` from `interior.entry`.
  - `outsidePose(space, dressing) → {place: 'yard', position, yaw, pitch: 0}` — `outside` metres out from the threshold, facing out.

- [ ] **Step 1: Write the failing tests** in `test/threshold.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, doorPosition} from '../shared/lakeside-dressing.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {walkable} from '../shared/space.js';
import {floorArea} from '../shared/interior.js';
import {THRESHOLD as T, doorOutward, doorWanted, entering, insidePose, leaving, outsidePose} from '../shared/threshold.js';

const door = doorPosition(S, D), out = doorOutward(S), toDoor = Math.atan2(-out[0], -out[1]);
const at = (m, yaw = toDoor, side = 0) => ({position: [door[0] + out[0] * m - out[1] * side, door[1] + out[1] * m + out[0] * side], yaw, pitch: 0});
const W = {forward: 1}, none = {forward: 0};

test('the door opens for a visitor near and facing it, and not otherwise', () => {
  assert.ok(doorWanted(S, D, at(1.2))); assert.ok(!doorWanted(S, D, at(2)));
  assert.ok(!doorWanted(S, D, at(1.2, toDoor + Math.PI))); assert.ok(!doorWanted(S, D, at(1.2, toDoor + 1.2)));
  assert.ok(!doorWanted(S, D, S.arrival));
});
test('entering needs the visitor close, facing the door and walking forward', () => {
  assert.ok(walkable(S, at(.6).position), 'the spot is reachable outside the cabin collider');
  assert.ok(entering(S, D, at(.6), W));
  assert.ok(!entering(S, D, at(.6), none)); assert.ok(!entering(S, D, at(.6), {forward: -1}));
  assert.ok(!entering(S, D, at(1.0), W)); assert.ok(!entering(S, D, at(.6, toDoor + Math.PI / 2), {forward: 1}));
});
test('leaving needs the visitor in the doorway, facing out and walking forward', () => {
  const inDoor = {place: 'cabin', floor: 0, position: [9, .4], yaw: Math.PI, pitch: 0};
  assert.ok(leaving(I, inDoor, W));
  assert.ok(!leaving(I, inDoor, none)); assert.ok(!leaving(I, {...inDoor, yaw: 0}, {forward: -1}));
  assert.ok(!leaving(I, {...inDoor, position: [7.8, .4]}, W)); assert.ok(!leaving(I, {...inDoor, position: [9, .8]}, W));
  assert.ok(!leaving(I, {...inDoor, floor: 1}, W));
});
test('the poses either side are standable and do not trigger a return trip', () => {
  const inside = insidePose(I), outside = outsidePose(S, D);
  assert.ok(floorArea(I, 0, inside.position)); assert.ok(!leaving(I, inside, W));
  assert.ok(walkable(S, outside.position)); assert.ok(!entering(S, D, outside, W)); assert.ok(!doorWanted(S, D, outside));
  assert.ok(Math.abs(Math.hypot(outside.position[0] - door[0], outside.position[1] - door[1]) - T.outside) < 1e-9);
});
```

- [ ] **Step 2: Run** `node --test test/threshold.test.js` — expected: FAIL, module not found.
- [ ] **Step 3: Implement** `shared/threshold.js`. If "the spot is reachable" fails because the cabin collider (0.4 m outside the wall) covers 0.6 m, do not move the collider: raise `enterWithin` to the smallest value that makes it pass and say so in the commit message.
- [ ] **Step 4: Run** — expected: PASS. Add the file to `check`.
- [ ] **Step 5: Commit** — `git commit -m "Decide when the cabin door opens and when the threshold is crossed"`

---

### Task 5: Remembering an indoor place

**Files:**
- Modify: `public/space/place-memory.js`
- Test: `test/place-memory.test.js`

**Interfaces:**
- Consumes: `floorArea`, `onStair` (Task 2).
- Produces: `new PlaceMemory({storage, space, interior = null, clock})`. States passed to `note`/`flush` and returned by `load` now carry `place` (`'yard'` or `'cabin'`) and, indoors, `floor`. A yard state without `place` is treated as `'yard'`.
  - A yard place is written exactly as today (`version: 1`, no `place`), so older code still reads it.
  - An indoor place is written as `{version: 2, place: 'cabin', floor, position, yaw, pitch, savedAt}`.
  - `load()` returns `{place: 'yard', position, yaw, pitch}` for a valid version 1 record; `{place: 'cabin', floor, position, yaw, pitch}` for a valid version 2 record when `interior` was given; otherwise `null`.
  - Version 2 is valid when `place === 'cabin'`, `floor` is 0 or 1, the numbers are finite, pitch is within `WALK.pitchLimit`, and the position is `floorArea(interior, floor, p)` or `onStair(interior, p)`.

- [ ] **Step 1: Write the failing tests** (append; `store` is the file's existing fake storage; add `import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';`):

```js
test('an indoor place is stored as version 2 and restored with its floor', () => {
  const storage = store(), m = new PlaceMemory({storage, space: S, interior: I});
  m.flush({place: 'cabin', floor: 1, position: [3, 9], yaw: 1, pitch: .1});
  const r = JSON.parse(storage.getItem(PLACE_KEY));
  assert.equal(r.version, 2); assert.equal(r.place, 'cabin'); assert.equal(r.floor, 1);
  assert.deepEqual(new PlaceMemory({storage, space: S, interior: I}).load(), {place: 'cabin', floor: 1, position: [3, 9], yaw: 1, pitch: .1});
});
test('without the interior an indoor record is ignored; a yard record still loads as version 1', () => {
  const storage = store(); new PlaceMemory({storage, space: S, interior: I}).flush({place: 'cabin', floor: 0, position: [9, 3], yaw: 0, pitch: 0});
  assert.equal(new PlaceMemory({storage, space: S}).load(), null);
  const yard = store(); new PlaceMemory({storage: yard, space: S, interior: I}).flush({place: 'yard', position: [1, 1], yaw: 2, pitch: 0});
  assert.equal(JSON.parse(yard.getItem(PLACE_KEY)).version, 1);
  assert.deepEqual(new PlaceMemory({storage: yard, space: S}).load(), {place: 'yard', position: [1, 1], yaw: 2, pitch: 0});
});
test('a broken indoor record is ignored', () => {
  for (const bad of [{floor: 2}, {floor: '0'}, {place: 'attic'}, {position: [.1, .1]}, {position: [10.3, 3], floor: 1, yaw: NaN}, {pitch: 9}]) {
    const storage = store();
    storage.setItem(PLACE_KEY, JSON.stringify({version: 2, place: 'cabin', floor: 0, position: [9, 3], yaw: 0, pitch: 0, ...bad}));
    assert.equal(new PlaceMemory({storage, space: S, interior: I}).load(), null, JSON.stringify(bad));
  }
});
test('moving between floors at the same spot counts as a change', () => {
  const storage = store(), m = new PlaceMemory({storage, space: S, interior: I});
  m.flush({place: 'cabin', floor: 0, position: [3, 3], yaw: 0, pitch: 0}); m.flush({place: 'cabin', floor: 1, position: [3, 3], yaw: 0, pitch: 0});
  assert.equal(JSON.parse(storage.getItem(PLACE_KEY)).floor, 1);
});
```

The file's existing `deepEqual(... .load(), spot)` expectations (two of them) become `{place: 'yard', ...spot}`.

- [ ] **Step 2: Run** `node --test test/place-memory.test.js` — expected: FAIL.
- [ ] **Step 3: Implement** in `place-memory.js`: `same` and `plain` include `place` and `floor`; `load` and `flush` branch on version/place as above.
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Remember a place indoors, with its floor"`

---

### Task 6: The front door swings

**Files:**
- Modify: `public/space/scene/cabin.js`, `public/space/scene/index.js`
- Test: `test/space-scene.test.js`

**Interfaces:**
- Produces: `buildCabin(...)` returns `setDoor(open)` (0 shut to 1 open) beside `setCottage`; `buildScene(...)` returns `setDoor(open)` forwarding to it.
- The `door` mesh in `openings` becomes a leaf hinged on one vertical edge, built about its hinge exactly as the casement leaf is, swinging inward (away from the wall's outward side) by up to 1.45 rad. Behind it, a new mesh named `doorway` fills the door's rectangle with a flat dark tone (linear `[.035, .03, .025]`, `MeshBasicMaterial`), placed `PROUD / 2` proud of the wall so the shut door covers it. At `open = 0` the door's vertices are where they are today.

- [ ] **Step 1: Write the failing test** (append):

```js
test('the front door is shut by default, swings inward when opened, and shows a dark doorway behind', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), openings = scene.parts.cabin.getObjectByName('openings');
  const door = openings.getObjectByName('door'), doorway = openings.getObjectByName('doorway');
  assert.ok(door && doorway && doorway.material.isMeshBasicMaterial);
  const centre = () => { door.updateWorldMatrix(true, false); door.geometry.computeBoundingBox(); return door.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(door.matrixWorld); };
  const shut = centre(), want = new THREE.Vector3(...toThree(openingCentre(S, D, 'door')));
  assert.ok(shut.distanceTo(want) < .05, `shut door at its panel: ${shut.distanceTo(want)}`);
  scene.setDoor(1); const open = centre(), cabin = new THREE.Vector3(...toThree([S.cabin.center[0], S.cabin.center[1], want.y]));
  assert.ok(open.distanceTo(shut) > .3); assert.ok(open.distanceTo(cabin) < shut.distanceTo(cabin), 'swings inward');
  scene.setDoor(0); assert.ok(centre().distanceTo(shut) < 1e-6);
  scene.dispose();
});
```

- [ ] **Step 2: Run** `node --test test/space-scene.test.js` — expected: FAIL, `setDoor` not a function.
- [ ] **Step 3: Implement** in `cabin.js` and forward in `scene/index.js`. Clamp `open` to 0–1.
- [ ] **Step 4: Run** `node --test test/space-scene.test.js test/life-layout.test.js test/dressing.test.js` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Hinge the cabin's front door over a dark doorway"`

---

### Task 7: The interior shell

**Files:**
- Create: `public/space/interior/index.js`
- Modify: `package.json` (`check`)
- Test: `test/interior-scene.test.js`

**Interfaces:**
- Consumes: `wallSegments`, `ceilingHeight`, `LAKESIDE_INTERIOR`; `sheet`, `mergeGeometries`, `toThree` from `public/space/geometry.js`; the art bundle's `surfaces.stone` and `surfaces.hills` textures.
- Produces: `buildInterior(THREE, {interior, art}) → {scene, setSky({zenith, horizon}), dispose()}`.
  - `scene` is a `THREE.Scene` with meshes named `floors`, `ceilings`, `walls`, `stair`, `glass`, and its own `HemisphereLight` (sky `#f1e6d2`, ground `#6b5a48`, intensity 1.6) and no fog.
  - Interior `[a, d, z]` maps to three through `toThree`, with z measured from the ground floor.
  - `walls`: each solid run from `wallSegments` as a 0.15 m thick wall from its floor to the ceiling above it (upstairs: `ceilingHeight` at each point, so walls follow the slope); each opening run as a lintel from `doorHead` (2.1 m) up; outer walls cut for the front door (1 × 2.1 m at a = 9) and the three wall windows. Plaster: `surfaces.hills` tinted linear `[.86, .8, .7]`.
  - `floors`: one slab per storey (boards: `surfaces.hills` tinted `[.42, .3, .2]`), the upper one with the stairwell cut out (a 9.6–11, d 1.5–5.4). `ceilings`: flat at 2.7 m downstairs, two slopes upstairs, cut for the three roof windows.
  - `stair`: 15 equal treads and risers between d = 1.5 and 5.4, a 9.6–11, with a closed side wall on a = 9.6 below the flight and a 0.9 m rail on the landing's two open stairwell edges (the a = 9.6 side and the d = 1.5 end).
  - `glass`: one flat panel per window and one for the front doorway, `MeshBasicMaterial`, all sharing one material whose colour `setSky` sets to the horizon colour (display space, as `yard.setSky` receives it).
- All faces are wound to face into the rooms; no room surface is double-sided.

- [ ] **Step 1: Write the failing test** in `test/interior-scene.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {buildInterior} from '../public/space/interior/index.js';
import {stubArt} from './space-scene.test.js';

const box = m => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox; };
test('the shell builds its named parts with finite geometry inside the blueprint', () => {
  const {scene, dispose} = buildInterior(THREE, {interior: I, art: stubArt()});
  for (const name of ['floors', 'ceilings', 'walls', 'stair', 'glass']) {
    const m = scene.getObjectByName(name); assert.ok(m, name);
    const p = m.geometry.getAttribute('position'); assert.ok(p.count > 0 && [...p.array].every(Number.isFinite), name);
    const b = box(m);   // three: x = a, y = up, z = −d
    assert.ok(b.min.x >= -.2 && b.max.x <= 18.2 && b.min.z >= -12.2 && b.max.z <= .2 && b.min.y >= -.01 && b.max.y <= 6.7, `${name} ${JSON.stringify(b)}`);
  }
  assert.ok(scene.children.some(o => o.isHemisphereLight)); assert.equal(scene.fog, null);
  dispose();
});
test('the stair climbs 3 m in 15 treads, and the glass takes the sky colour', () => {
  const {scene, setSky, dispose} = buildInterior(THREE, {interior: I, art: stubArt()}), stair = box(scene.getObjectByName('stair'));
  assert.ok(stair.min.x >= 9.6 - .01 && stair.max.x <= 11.01 && Math.abs(stair.max.y - 3.9) < .05, 'treads to 3 m plus a 0.9 m rail');
  setSky({zenith: [.1, .2, .3], horizon: [.4, .5, .6]});
  const c = scene.getObjectByName('glass').material.color;
  assert.ok(Math.abs(c.r - .4) < .2 && c.b > c.r, 'horizon colour');
  dispose();
});
test('nothing solid stands in an opening, the doorway or the stair foot', () => {
  const {scene, dispose} = buildInterior(THREE, {interior: I, art: stubArt()}), walls = scene.getObjectByName('walls');
  const ray = new THREE.Raycaster(), hits = (from, to) => { const a = new THREE.Vector3(from[0], from[2], -from[1]), b = new THREE.Vector3(to[0], to[2], -to[1]);
    ray.set(a, b.clone().sub(a).normalize()); ray.far = a.distanceTo(b); return ray.intersectObject(walls).length; };
  walls.material.side = THREE.DoubleSide;
  for (const o of I.openings) {
    const mid = (o.span[0] + o.span[1]) / 2, z = o.floor * 3 + 1.6;
    assert.equal(hits(o.line === 'a' ? [o.at - .5, mid, z] : [mid, o.at - .5, z], o.line === 'a' ? [o.at + .5, mid, z] : [mid, o.at + .5, z]), 0, o.id);
  }
  assert.equal(hits([9, .5, 1.6], [9, -.5, 1.6]), 0, 'front doorway');
  assert.ok(hits([3.5, 3.5, 1.6], [-1, 3.5, 1.6]) > 0, 'the gable wall is solid');
  dispose();
});
```

- [ ] **Step 2: Run** `node --test test/interior-scene.test.js` — expected: FAIL, module not found.
- [ ] **Step 3: Implement** `public/space/interior/index.js` as specified under Interfaces. `dispose` frees every geometry and material it made and leaves the art bundle's textures alone, as `buildScene` does.
- [ ] **Step 4: Run** — expected: PASS. Add the file to `check`; `npm run check`.
- [ ] **Step 5: Commit** — `git commit -m "Build the cabin's interior shell: walls, floors, ceilings, stair and blank glass"`

---

### Task 8: Going in, walking about, coming out

**Files:**
- Create: `public/space/passage.js`
- Modify: `public/space/space-view.js`, `public/scene-description.js`, `public/app.js`, `scripts/check-space-browser.mjs`, `package.json` (`check`)
- Test: `test/passage.test.js`, `test/world-client.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces `createPassage({space, dressing, interior, motion: () => boolean}) → passage` in `public/space/passage.js`, pure (no DOM, no three.js), which owns the door's swing and the fade:
  - `passage.frame(state, input, seconds, {ready}) → {door, veil, move}` — called once per frame with the visitor's state (carrying `place`), the keys' input, a monotonic time in seconds and whether the interior scene is built.
  - `door`: 0–1, easing toward 1 over `swingSeconds` while `doorWanted` (yard) or while the visitor is indoors within 2.5 m of `interior.entry.position` on floor 0, and back toward 0 otherwise.
  - `veil`: 0 clear to 1 black. A crossing starts when `entering(...)` with `door ≥ .9` and `ready`, or `leaving(...)`; veil rises to 1 over half `fadeSeconds`, then falls to 0 over the other half. With `motion()` false the veil stays 0.
  - `move`: `null`, except on the single frame the veil reaches 1 (or immediately, without motion), when it is `insidePose(interior)`, `outsidePose(space, dressing)`, or the pose given to `passage.send(pose)`.
  - `passage.send(pose)` — start a crossing to any pose (used by "return to the arrival view" from indoors).
  - `passage.busy` — true while a crossing is under way; the view ignores walking input meanwhile.
- `SpaceView` changes:
  - constructor option `interior` (default `LAKESIDE_INTERIOR` when `new URLSearchParams(location.search).get('interior') === '1'`, else `null`); passes it to `PlaceMemory`.
  - `state` carries `place`; `get room()` returns the `name` of `roomAt(...)` indoors, or `null` in the yard or without the interior.
  - The interior scene is built with `buildInterior` the first time `doorWanted` is true or an indoor place is loaded; a build error is logged once, leaves `ready` false for good, and the door then never opens.
  - `step()` uses `stepIndoors` and `indoorEye` indoors; `render()` draws the interior scene (through the same painterly pass and camera) when `state.place === 'cabin'`, skips `applyLight`'s fog for it, and still updates the sky, life and yard every frame so `conditions` and the world carry on.
  - `yard.setDoor(door)` every frame; the veil is applied as `canvas.style.opacity = 1 - veil`.
  - `returnToArrival()` indoors calls `passage.send({place: 'yard', ...space.arrival})` instead of gliding.
- `sceneText(..., {room = null})` in `public/scene-description.js`: when `room` is set, the returned `description` begins `Inside the cabin, in the ${room}. ` followed by the existing description; `announcement` is unchanged. `public/app.js` adds `room: painter.room ?? null` to the options it hands the `SceneDescriber`.

- [ ] **Step 1: Write the failing tests.** `test/passage.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, doorPosition} from '../shared/lakeside-dressing.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {THRESHOLD as T, doorOutward, insidePose, outsidePose} from '../shared/threshold.js';
import {createPassage} from '../public/space/passage.js';

const door = doorPosition(S, D), out = doorOutward(S), facing = Math.atan2(-out[0], -out[1]);
const yard = m => ({place: 'yard', position: [door[0] + out[0] * m, door[1] + out[1] * m], yaw: facing, pitch: 0});
// Once moved, the visitor is where the passage put them, as the view would have it.
const run = (p, state, input, from, to, opts = {ready: true}) => { let last, moves = []; for (let t = from; t <= to + 1e-9; t += 1 / 30) { last = p.frame(state, input, t, opts); if (last.move) { moves.push(last.move); state = last.move; } } return {last, moves}; };
const make = (motion = true) => createPassage({space: S, dressing: D, interior: I, motion: () => motion});

test('the door eases open for a visitor at it and shut again when they leave', () => {
  const p = make(); assert.equal(p.frame(yard(5), {forward: 0}, 0, {ready: true}).door, 0);
  const mid = run(p, yard(1.2), {forward: 0}, 0, T.swingSeconds / 2).last.door; assert.ok(mid > .1 && mid < .9);
  assert.equal(run(p, yard(1.2), {forward: 0}, T.swingSeconds / 2, 2).last.door, 1);
  assert.equal(run(p, yard(5), {forward: 0}, 2, 4).last.door, 0);
});
test('walking in fades out, moves the visitor once at black, and fades in', () => {
  const p = make(); run(p, yard(.6), {forward: 0}, 0, 2);
  const {last, moves} = run(p, yard(.6), {forward: 1}, 2, 2 + T.fadeSeconds + .1);
  assert.deepEqual(moves, [insidePose(I)]); assert.equal(last.veil, 0); assert.ok(!p.busy);
});
test('standing at the open door, or reaching it before it has opened, does not carry the visitor in', () => {
  const p = make(); assert.deepEqual(run(p, yard(.6), {forward: 0}, 0, 3).moves, []);
  const q = make(); assert.equal(q.frame(yard(.6), {forward: 1}, 0, {ready: true}).move, null);
});
test('an interior that is not ready keeps the visitor in the yard', () => {
  const p = make(); assert.deepEqual(run(p, yard(.6), {forward: 1}, 0, 3, {ready: false}).moves, []);
});
test('walking out through the hall doorway sets the visitor outside, facing out', () => {
  const p = make(), inDoor = {place: 'cabin', floor: 0, position: [9, .4], yaw: Math.PI, pitch: 0};
  assert.deepEqual(run(p, inDoor, {forward: 1}, 0, 1).moves, [outsidePose(S, D)]);
});
test('without motion the crossing is a cut: no veil, moved at once', () => {
  const p = make(false); run(p, yard(.6), {forward: 0}, 0, 2);
  const f = p.frame(yard(.6), {forward: 1}, 2.1, {ready: true}); assert.equal(f.veil, 0); assert.deepEqual(f.move, insidePose(I));
});
test('send carries the visitor to any pose through the same fade', () => {
  const p = make(), home = {place: 'yard', ...S.arrival};
  p.send(home); assert.ok(p.busy);
  assert.deepEqual(run(p, {place: 'cabin', floor: 1, position: [3, 9], yaw: 0, pitch: 0}, {forward: 0}, 0, 1).moves, [home]);
});
```

Append to `test/world-client.test.js`, inside or beside the test that already calls `sceneText(data, epoch)`, using its `data` and `epoch`:

```js
assert.ok(sceneText(data, epoch, {room: 'study'}).description.startsWith('Inside the cabin, in the study. '));
assert.ok(!sceneText(data, epoch).description.startsWith('Inside'));
assert.equal(sceneText(data, epoch, {room: 'study'}).announcement, sceneText(data, epoch).announcement);
```

- [ ] **Step 2: Run** `node --test test/passage.test.js test/world-client.test.js` — expected: FAIL.
- [ ] **Step 3: Implement** `public/space/passage.js`, then the `SpaceView`, `scene-description.js` and `app.js` changes listed under Interfaces.
- [ ] **Step 4: Run** `npm test && npm run check` — expected: all PASS.
- [ ] **Step 5: Add browser checks** to `scripts/check-space-browser.mjs`, in its existing style (numbered `check(...)` calls, `window.__space` under `?check`), using a visitor opened at `?check&interior=1`:
  - without `interior=1`: standing at the door facing it for 2 s leaves the yard's `door` mesh shut;
  - with it: the door opens; holding W carries the visitor in (`__space.state.place === 'cabin'`, `__space.room === 'entry hall'`);
  - indoors, holding W from the stair foot reaches floor 1 with the camera 3 m higher;
  - a reload returns the visitor to the same room and floor;
  - the Return button from indoors ends at the arrival pose in the yard;
  - walking out through the doorway ends in the yard facing away from the door;
  - no page or console errors throughout.
  
  Save captures of the hall, living room, kitchen, landing and sky room to `docs/interior-validation/` (set by an `INTERIOR_VALIDATION_DIR` variable defaulting to that path) and write the results beside them as `browser-results.json`.
- [ ] **Step 6: Run the browser checks** — start the server as `docs/space-validation/README.md` describes, then `node scripts/check-space-browser.mjs`. Expected: every check PASS, old and new. Look at the five captures: rooms read as rooms, no see-through walls, no black frames.
- [ ] **Step 7: Commit** — `git commit -m "Walk in through the cabin door, through its rooms and out again, behind ?interior=1"`
