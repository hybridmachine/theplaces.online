# Raised Bed Garden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two timber raised beds with corn, a bean teepee and staked tomatoes in the walkable yard, seen from the arrival spot left of the cottage.

**Architecture:** Bed footprints live in the space (`shared/lakeside-space.js`) beside the cabin and oak, each with a box collider. The planting is a pure seeded plan in `shared/lakeside-dressing.js`. A new scene builder draws it from tubes, sheets and tinted `dab` cards with the shared wind sway.

**Tech Stack:** ES modules, three.js 0.170.0 (vendored), `node --test`. No build step, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-raised-bed-garden-design.md`

## Global Constraints

- The default 2D page is unchanged and must not load anything under `public/space/`.
- No re-export of painted art; only existing atlas cells (`SPACE_ART.cards.cells.dab`) and surfaces (`earth`, `bark`, `hills`).
- Cards are alpha-tested, never blended. Nothing turns to face the visitor.
- Placement is pure and seeded from `dressing.seed`; adding the garden must not move existing scatter except where a bed now stands.
- `LAKESIDE_SPACE.colliders[0]` stays the cabin's box and the circle stays the oak's (tests find them by type, first match).
- The cottage's front-left window stays clear from the arrival spot; the path stays clear.
- Commit only when the owner asks.

## Review Focus

- A remembered standing place that now falls inside a bed: the visitor must start somewhere walkable (`place-memory.js` already falls back; test it).
- Walking between the beds and between a bed and the cottage: gaps of at least 0.8 m stay walkable.
- Reduced motion / frozen wind: crops hold still (they use the shared sway uniforms, so no code of their own).
- Sloping ground: no gap under a bed's boards and no earth floating above them.
- Disposal: the scene's dispose frees every garden geometry and material.

---

### Task 1: Beds in the space, planting in the dressing

**Files:**
- Modify: `shared/lakeside-space.js` (add `beds`, two colliders)
- Modify: `shared/lakeside-dressing.js` (add `garden` to `LAKESIDE_DRESSING`, export `gardenPlan`)
- Modify: `shared/lakeside-life.js` (add `crop` to `SWAY`)
- Test: `test/dressing.test.js`, `test/place-memory.test.js`

**Interfaces:**
- Produces: `space.beds = [{id, center: [x, y], size: [long, wide], yaw, height}]` — ids `'corn'` and `'tomato'`, `height: .3`, yaw `160 * DEG` (parallel to the cabin). Starting values: corn `center [12.6, 8.2]`, `size [2.8, 1.2]`; tomato `center [14.9, 8.3]`, `size [2.6, 1.2]`. Task 3 may nudge them. (As built: tomato `center [14.6, 9.2]`, moved north so it stands clear of the front-left window from the arrival spot.)
- Produces: one `{type: 'box', center, half: [long / 2 + BED_CLEAR, wide / 2 + BED_CLEAR], yaw}` per bed appended to `space.colliders` (`BED_CLEAR = .15`, added while building so a visitor's eye never reaches the boards, as the cabin's walls keep inside its collider).
- Produces: `dressing.garden = {board: .045, corn: {count: 9}, beans: {poles: 4}, tomatoes: {count: 4}}`.
- Produces: `gardenPlan(space, dressing) → {beds: [{id, center, yaw, half: [l, w], base, top}], plants: [{id, kind: 'corn' | 'bean' | 'tomato', bed, foot: [x, y, z], height, lean: [dx, dy], seed}], teepee: {apex: [x, y, z]} }`. `base` is 0.15 m under the lowest ground along the footprint, `top` is `height` above the highest. Corn stands in two staggered rows in the north two-thirds of the corn bed, 1.7–2.1 m; bean poles ring a 0.35 m circle at its south end, 1.9 m, leaning to a shared apex; tomatoes stand in one row along the tomato bed, 0.7–0.85 m. Every foot is at `top`, at least 0.15 m inside the boards.
- Produces: `SWAY.crop = {type: 'leaf', exposure: .7, reach: .05}`.

- [ ] **Step 1: Write the failing tests** in `test/dressing.test.js`:

```js
test('the garden: two beds on the grass by the cottage, each a collider, clear of the path, cabin and oak', () => {
  assert.deepEqual(S.beds.map(b => b.id), ['corn', 'tomato']);
  assert.equal(S.colliders[0].type, 'box'); assert.deepEqual(S.colliders[0].center, S.cabin.center);
  for (const bed of S.beds) {
    const c = S.colliders.find(k => k.type === 'box' && k.center[0] === bed.center[0] && k.center[1] === bed.center[1]);
    assert.ok(c, bed.id); assert.deepEqual([...c.half], [bed.size[0] / 2, bed.size[1] / 2]); assert.equal(c.yaw, bed.yaw);
    assert.equal(walkable(S, bed.center), false);
    const u = [Math.sin(bed.yaw), Math.cos(bed.yaw)], v = [Math.cos(bed.yaw), -Math.sin(bed.yaw)];
    // a ring 0.4 m outside the boards is all walkable meadow: off the path, out of the cabin, the oak and the other bed
    for (let k = 0; k < 40; k++) {
      const t = k / 40 * 2 * Math.PI, a = Math.cos(t) * (bed.size[0] / 2 + .4), b = Math.sin(t) * (bed.size[1] / 2 + .4);
      const p = [bed.center[0] + a * u[0] + b * v[0], bed.center[1] + a * u[1] + b * v[1]];
      assert.ok(walkable(S, p), `${bed.id} ${p}`); assert.ok(groundBlend(S, D, ...p).earth < .2, `${bed.id} on the path`);
    }
  }
  assert.ok(dist(S.beds[0].center, S.beds[1].center) > 2);
});
test('the planting: corn, a bean teepee and tomatoes, each standing in its bed', () => {
  const plan = gardenPlan(S, D); assert.deepEqual(plan, gardenPlan(S, D));
  const of = kind => plan.plants.filter(p => p.kind === kind);
  assert.equal(of('corn').length, D.garden.corn.count); assert.equal(of('bean').length, D.garden.beans.poles); assert.equal(of('tomato').length, D.garden.tomatoes.count);
  for (const p of plan.plants) {
    const bed = plan.beds.find(b => b.id === p.bed), dx = p.foot[0] - bed.center[0], dy = p.foot[1] - bed.center[1];
    const a = dx * Math.sin(bed.yaw) + dy * Math.cos(bed.yaw), b = dx * Math.cos(bed.yaw) - dy * Math.sin(bed.yaw);
    assert.ok(Math.abs(a) <= bed.half[0] - .15 && Math.abs(b) <= bed.half[1] - .15, p.id);
    assert.equal(p.foot[2], bed.top);
  }
  for (const bed of plan.beds) { assert.ok(bed.top - terrainHeight(S, ...bed.center) > .2); assert.ok(bed.base < terrainHeight(S, ...bed.center) - .1); }
  assert.ok(of('corn').every(p => p.height >= 1.7 && p.height <= 2.1)); assert.ok(of('tomato').every(p => p.height <= .85));
  assert.ok(of('bean').every(p => p.bed === 'corn')); assert.ok(of('tomato').every(p => p.bed === 'tomato'));
});
```

and in `test/place-memory.test.js`, following that file's existing fallback test: a remembered position at `S.beds[0].center` resolves to the arrival position.

- [ ] **Step 2: Run** `node --test test/dressing.test.js test/place-memory.test.js` — expected: the new tests fail (`S.beds` undefined, `gardenPlan` not exported).
- [ ] **Step 3: Implement** the interfaces above. `gardenPlan` draws its randomness from `stream(dressing.seed, 'garden')`.
- [ ] **Step 4: Run** `npm test` — expected: all pass (the existing cover test proves grass and flowers keep off the beds through `walkable`).

### Task 2: Draw the garden

**Files:**
- Create: `public/space/scene/garden.js`
- Modify: `public/space/scene/index.js` (add `garden` to `parts`)
- Modify: `package.json` (`check`: add `node --check public/space/scene/garden.js`)
- Test: `test/space-scene.test.js`

**Interfaces:**
- Consumes: `gardenPlan`, `SWAY.crop`, `sheet`, `tube`, `cardBatch`, `cardMaterial`, `mergeGeometries` (`public/space/geometry.js`), `stream`, `hash`, `noise`, `lin` (`scene/noise.js`).
- Produces: `buildGarden(THREE, {space, dressing, art}) → {object}`; `object.name === 'garden'` with meshes `beds` (boards, `art.surfaces.hills` brushwork tinted warm grey-brown like the eave boards but lighter, outward-wound, single-sided: four outer faces, four inner faces down to the soil, and the boards' top edge), `soil` (`art.surfaces.earth`, darkened, 0.05 m below the boards' top), `stems` (bark-textured tubes: corn stalks, bean poles, tomato stakes and stems; no sway) and `leaves` (one card batch, every card `sway: {kind: 'crop', random}`).
- Corn: a stalk tube tapering 0.02 → 0.008 m; 7–9 long leaves, each two dab cards end to end arching out and down, alternating sides up the stalk; a pale straw tassel of three small dabs at the top; one ear (a short yellow-green dab) at mid-height on most stalks.
- Beans: four poles to the apex, crossing 0.1 m below their tips; 14–18 small round leaf dabs spiralling up each pole, facing outward and every which way, a few pale flower dabs.
- Tomatoes: a 1.1 m stake and a short stem; 16–20 bushy mid-green dabs in a rough 0.35 m ball about 0.45 m above the soil; 5–8 red fruit dabs (about 0.05 m, square, `[.78, .12, .07]` linear-ish, some orange-green) hanging in its lower half.
- Leaf colours multiply the neutral dab: corn `[.45, .62, .25]`, bean `[.30, .50, .22]`, tomato `[.24, .42, .20]`, each jittered ±12 % and darker at the card's bottom edge (× .7).

- [ ] **Step 1: Write the failing test** in `test/space-scene.test.js`:

```js
test('the garden is drawn: boards, soil, stems and swaying leaves, on its beds', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), garden = scene.parts.garden;
  assert.equal(garden.name, 'garden');
  for (const name of ['beds', 'soil', 'stems', 'leaves']) assert.ok(garden.getObjectByName(name), name);
  const leaves = garden.getObjectByName('leaves').geometry, sway = leaves.getAttribute('sway');
  assert.ok(sway.count >= 4 * 150); let moving = 0; for (let i = 0; i < sway.count; i++) if (sway.getX(i) > 0) moving++;
  assert.equal(moving, sway.count);
  // everything stands over a bed's footprint (leaves may hang 0.5 m past the boards), above its base
  const box = new THREE.Box3().setFromObject(garden), min = fromThree(box.min), max = fromThree(box.max);
  const xs = S.beds.map(b => b.center[0]), ys = S.beds.map(b => b.center[1]);
  assert.ok(Math.min(min[0], max[0]) > Math.min(...xs) - 2.2 && Math.max(min[0], max[0]) < Math.max(...xs) + 2.2);
  assert.ok(Math.min(min[1], max[1]) > Math.min(...ys) - 2.2 && Math.max(min[1], max[1]) < Math.max(...ys) + 2.2);
  // the boards are single-sided and face outward: from 3 m off each bed's long side, the first surface faces the eye
  for (const bed of S.beds) for (const side of [-1, 1]) {
    const v = [Math.cos(bed.yaw) * side, -Math.sin(bed.yaw) * side], p = [bed.center[0] + v[0] * 3, bed.center[1] + v[1] * 3];
    const eye = [...p, terrainHeight(S, ...p) + S.eyeHeight], {hit, dir} = firstHit(garden.getObjectByName('beds'), eye, [...bed.center, terrainHeight(S, ...bed.center) + .15]);
    assert.ok(hit, bed.id); assert.ok(hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(dir) < 0, `${bed.id} board inside out`);
  }
  scene.dispose();
});
```

Also add `'garden'` to the name list in the existing "builds its named parts" test and raise its `meshes >= 8` to `>= 12`.

- [ ] **Step 2: Run** `node --test test/space-scene.test.js` — expected: fails, `scene.parts.garden` undefined.
- [ ] **Step 3: Implement** `buildGarden` and add it to `buildScene`'s `parts`.
- [ ] **Step 4: Run** `npm test && npm run check` — expected: all pass.

### Task 3: Look at it from the arrival spot

**Files:**
- Modify: `shared/lakeside-space.js` (bed centres only, if nudged); `scripts/capture-space-review.mjs` (add a `garden` pose 4 m south-west of the corn bed, looking at it)

- [ ] **Step 1:** Start the server (`.claude/launch.json`, `yard-demo`) and open `/?space=1`. Capture the arrival view.
- [ ] **Step 2:** Check: corn shows in the gap between the oak trunk and the cottage; the bean teepee and tomatoes read as what they are; the front-left window is not covered; the path is clear. Nudge bed centres and plant sizes/colours until so; re-run `npm test` after each nudge.
- [ ] **Step 3:** Walk to the beds: look from the `garden` pose and from behind; check board faces, soil, no gap under the boards on the slope, leaves moving in the wind, and that the beds stop the walker.
- [ ] **Step 4:** Check the console for errors and the day and night studies for crops that glow or go black.
