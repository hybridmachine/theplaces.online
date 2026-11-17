# The Garden's Year Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The kitchen garden in the walkable yard grows, fruits and dies through the world's year, and each year the crops stand in a different plot.

**Architecture:** A pure module turns a world day into each crop's stage values; the layout divides the two beds into four plots and rotates corn, beans, tomatoes and a resting plot through them by year; the garden scene part redraws its soil and crops from that state whenever the world day changes, and `SpaceView.render` hands it the day each frame.

**Tech Stack:** Plain ES modules, three.js 0.170 (handed in), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-17-garden-lifecycle-design.md`

## Global Constraints

- Yard only (`?space=1`); nothing in the default 2D painting, its downloads, the written scene description, field notes or sound changes.
- No server or stored state: the garden is a function of `calendar.day` alone.
- `space.beds`, `space.colliders` and the ground cover's counts do not change. The bed ids stay `corn` and `tomato`.
- No new art files; the card material is shared and not rebuilt.
- The front-left window, with its casement leaf fully open, is never crossed by any part of the garden as seen from the arrival eye.
- World axes x east, y north, z up, metres; three.js is passed in so everything runs in Node.
- Every new file is added to the `check` script in `package.json`.
- A garden year is `Math.floor(day / 365)`; day of year is `((day % 365) + 365) % 365`.

## Review Focus

- A day that is not a finite integer (NaN, undefined, 12.5, a string) handed to the garden: it keeps what it is showing and does not throw (Task 4 test).
- The turn of the year, days 364 → 365: no plants and no mulch on either side, and the plots' crops differ after it (Task 2 test).
- A far-future day (`365 * 500 + 200`): finite stages and the same rotation as year `500 % 4` (Task 3 test).
- A plant's own offset must never carry it past its crop's clearing day or before its sowing day (Task 1 test).
- Many day changes in a row must not leak: every replaced geometry is disposed, and `scene.dispose()` afterwards leaves none (Task 4 test).

---

## File Structure

- Create `shared/garden-life.js`: the crops' calendar, `cropStage`, `plotSoil`, `gardenState`.
- Modify `shared/lakeside-dressing.js`: `windowSpan`, `gardenPlots`, `gardenPlan(space, dressing, year)`.
- Modify `public/space/geometry.js`: an optional sway scale per card.
- Modify `public/space/scene/garden.js`: boards once, soil and crops per day, `setDay`.
- Modify `public/space/scene/index.js`, `public/space/space-view.js`: `setGarden(day)` and its call.
- Modify `scripts/capture-space-review.mjs`: the garden's year contact sheet.
- Create `test/garden-life.test.js`; modify `test/dressing.test.js`, `test/space-scene.test.js`.

---

### Task 1: The crops' calendar

**Files:**
- Create: `shared/garden-life.js`
- Modify: `package.json` (add `node --check shared/garden-life.js` to `check`)
- Test: `test/garden-life.test.js`

**Interfaces:**
- Produces:
  - `CROPS`: frozen `{corn, bean, tomato}`, each `{dig, supportUp, sow, shoot, full, flower: [from, to], fruit: [from, to], ripe: [from, to], yellow: [from, to], dry: [from, to], clear, supportDown}` in days of year (`supportUp`/`supportDown` are `null` for corn).
  - `MULCH = {lay: 115, lift: 318}`, `OFFSET_DAYS = 5`, `DAILY_STEP = .2`.
  - `cropStage(kind, dayOfYear, offset = 0)` → `{present, support, height, leaf, flower, fruit, ripe, yellow, dry}`; `present` and `support` are booleans, the rest numbers in [0, 1].
  - `plotSoil(crop, dayOfYear)` → `{dug, mulch}`, each in [0, 1]; `crop` is a crop kind or `'rest'`.
  - `EVENT_DAYS(kind)` → sorted array of the days on which that crop (or `'rest'`) may jump.

**Values (from the spec's table):**

| | corn | bean | tomato |
|---|---|---|---|
| dig | 110 | 110 | 110 |
| supportUp | – | 120 | 135 |
| sow | 125 | 130 | 135 |
| shoot | 135 | 138 | 135 |
| full | 200 | 190 | 200 |
| flower | 200–230 | 185–230 | 170–240 |
| fruit (appears) | 215–240 | 200–235 | 195–230 |
| ripe | 240–255 | 235–260 | 220–265 |
| yellow | 265–280 | 265–285 | 265–285 |
| dry | 278–290 | 280–295 | 283–293 |
| clear | 315 | 318 | 300 |
| supportDown | – | 318 | 300 |

- `height` and `leaf` follow a smoothstep from `shoot` to `full`. Tomatoes are set out as small plants: at `shoot` their `height` and `leaf` start at .15, not 0.
- `flower` rises over the first 10 days of its window and falls over the last 10.
- `fruit` rises across its window. For tomatoes and beans it holds at 1 until `ripe[0] + 10` and then falls linearly to 0 at `yellow[1]` (picking); for corn it holds through day 290 and is 0 from day 291 (ears taken, a gardener's day).
- `ripe`, `yellow`, `dry` are smoothsteps across their windows and never decrease within a year.
- `offset` shifts every window above by that many days but never `sow`, `clear`, `supportUp` or `supportDown`; `present` is `sow ≤ d < clear` (for tomatoes `shoot ≤ d < clear`), so no offset can show a plant outside them.
- `plotSoil`: `dug` is 1 at `dig`, falling linearly to 0 by day 230 and 0 outside `[dig, 320)`; for `'rest'`, `dug` is always 0 and `mulch` is 1 from `MULCH.lay`, falling linearly to .6 at `MULCH.lift`, and 0 outside; `mulch` is 0 for crops.
- `EVENT_DAYS`: corn `[110, 125, 291, 315]`, bean `[110, 120, 130, 318]`, tomato `[110, 135, 300]`, rest `[115, 318]`.
- The tomato's frost is spread over ten days (283–293), not the spec's single day 285, so that it stays within `DAILY_STEP`.

- [ ] **Step 1: Write the failing tests** in `test/garden-life.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {CROPS, DAILY_STEP, EVENT_DAYS, OFFSET_DAYS, cropStage, plotSoil} from '../shared/garden-life.js';

const KINDS = ['corn', 'bean', 'tomato'], NUMS = ['height', 'leaf', 'flower', 'fruit', 'ripe', 'yellow', 'dry'];

test('a crop is in the ground only between sowing and clearing, whatever its offset', () => {
  for (const kind of KINDS) for (const offset of [-OFFSET_DAYS, 0, OFFSET_DAYS]) for (let d = 0; d < 365; d++) {
    const s = cropStage(kind, d, offset), from = kind === 'tomato' ? CROPS[kind].shoot : CROPS[kind].sow;
    assert.equal(s.present, d >= from && d < CROPS[kind].clear, `${kind} ${d}`);
    if (!s.present) for (const k of NUMS) assert.equal(s[k], 0, `${kind} ${d} ${k}`);
    for (const k of NUMS) assert.ok(Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1, `${kind} ${d} ${k}`);
  }
});
test('supports stand only between their up and down days', () => {
  for (let d = 0; d < 365; d++) {
    assert.equal(cropStage('corn', d).support, false);
    assert.equal(cropStage('bean', d).support, d >= 120 && d < 318);
    assert.equal(cropStage('tomato', d).support, d >= 135 && d < 300);
  }
});
test('nothing jumps from one day to the next except on a gardener\'s day', () => {
  for (const kind of KINDS) for (let d = 1; d < 365; d++) {
    if (EVENT_DAYS(kind).includes(d)) continue;
    const a = cropStage(kind, d - 1), b = cropStage(kind, d);
    for (const k of NUMS) assert.ok(Math.abs(b[k] - a[k]) <= DAILY_STEP, `${kind} ${k} day ${d}`);
  }
});
test('a crop reaches full height, ripens without going back, and its fruit rises then goes', () => {
  for (const kind of KINDS) {
    assert.equal(cropStage(kind, CROPS[kind].full + 5).height, 1);
    let ripe = 0, peak = 0;
    for (let d = 0; d < 365; d++) { const s = cropStage(kind, d); if (s.present) { assert.ok(s.ripe >= ripe - 1e-9); ripe = s.ripe; } peak = Math.max(peak, s.fruit); }
    assert.ok(peak > .9); assert.equal(cropStage(kind, CROPS[kind].clear - 1).fruit, 0);
  }
  assert.equal(cropStage('tomato', 135).height, .15);
});
test('an offset moves growth by that many days', () => {
  assert.equal(cropStage('corn', 170, 5).height, cropStage('corn', 165, 0).height);
});
test('the soil: dug dark in spring, mulch on the resting plot from spring to autumn only', () => {
  assert.equal(plotSoil('corn', 109).dug, 0); assert.equal(plotSoil('corn', 110).dug, 1); assert.equal(plotSoil('corn', 230).dug, 0);
  assert.equal(plotSoil('rest', 114).mulch, 0); assert.equal(plotSoil('rest', 115).mulch, 1); assert.ok(Math.abs(plotSoil('rest', 317).mulch - .6) < .01);
  for (const d of [318, 364, 0, 50]) assert.equal(plotSoil('rest', d).mulch, 0);
  assert.equal(plotSoil('tomato', 200).mulch, 0);
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test test/garden-life.test.js`; expected: FAIL, cannot find module `shared/garden-life.js`.
- [ ] **Step 3: Implement `CROPS`, `MULCH`, `OFFSET_DAYS`, `DAILY_STEP`, `EVENT_DAYS`, `cropStage`, `plotSoil`** in `shared/garden-life.js` with the values above. Import `smooth` and `clamp` from `./world.js`. Add the file to `check` in `package.json`.
- [ ] **Step 4: Run to verify it passes** — `node --test test/garden-life.test.js` and `npm run check`; expected: PASS, no output from check.
- [ ] **Step 5: Commit** — `git add shared/garden-life.js test/garden-life.test.js package.json && git commit -m "Give each crop a year: sown, grown, in fruit, yellowed and cleared, by the day of the year"`

---

### Task 2: Four plots, a rotation, and the window kept clear

**Files:**
- Modify: `shared/lakeside-dressing.js` (`gardenPlan` at about lines 142–179; add `windowSpan`, `gardenPlots`)
- Test: `test/dressing.test.js` (rewrite the test `the planting: corn, a bean teepee and tomatoes, each standing in its bed`, about lines 102–112)

**Interfaces:**
- Consumes: `OFFSET_DAYS` from `shared/garden-life.js`.
- Produces:
  - `ROTATION = ['corn', 'bean', 'tomato', 'rest']`.
  - `windowSpan(space, dressing)` → `[azMin, azMax]`, radians clockwise from north, the bearings from the arrival position between which the front-left window (`window-front-left`) lies, including its casement leaf swung to its largest angle if that window carries the casement (`LAKESIDE_COTTAGE.casement` in `shared/lakeside-cottage.js`; `cabin.js` lines 93–133 show how the leaf is hinged).
  - `gardenPlots(space)` → four plots in the order `corn-north`, `corn-south`, `tomato-north`, `tomato-south`: `{id, bed, center: [x, y], half: [l, w], yaw, room}`. Each is one half of its bed's length (north half at negative `a`, as `gardenPlan`'s comment explains). `room` is the horizontal distance in metres from the plot's nearest plantable corner (.15 m inside the boards) to the line from the arrival position at bearing `azMin`.
  - `gardenPlan(space, dressing, year = 0)` → `{beds, plots, plants}`. `beds` as now. Each plot gains `crop`: `ROTATION[(((i - year) % 4) + 4) % 4]` for plot index `i`, so every crop moves one plot along each year. Each plant: `{id, kind, bed, plot, foot, height, lean, seed, offset, room}`; `offset` is in `[-OFFSET_DAYS, OFFSET_DAYS]`; `room` is that plant's own distance from its foot to the `azMin` line, less .05.
- Planting in a plot (local `a` along the bed, `c` across): corn three rows of three, .32 m apart in `a` and `.38·w`-spaced in `c`; bean poles in a ring of radius `min(.35, w − .2)` about the block's centre leaning to one apex; tomatoes two by two, .5 m apart in `a`, `±.28` in `c`. Jitter as now. Heights as now.
- **The window rule:** let `REACH = {corn: .8, bean: .45, tomato: .45}` (how far each crop's leaves reach from its foot) and `MIN_ROOM = .3`. In a plot, the block's centre is moved along `−a` (north, away from the window) by the least amount that gives every plant `room ≥ MIN_ROOM`, staying .15 m inside the plot. A plant whose `room` is under its `REACH` is drawn with its window-side leaves cut to `room` (Task 4). If no shift within the plot reaches `MIN_ROOM`, throw `Error('garden: no room beside the window in <plot id>')`.
- The seeded stream is `stream(dressing.seed, 'garden-' + year)`, so each year's plants differ.

- [ ] **Step 1: Write the failing tests** in `test/dressing.test.js`, replacing the old planting test

```js
test('the plots: each bed in two halves, four in all, the same every year', () => {
  const plots = gardenPlots(S);
  assert.deepEqual(plots.map(p => p.id), ['corn-north', 'corn-south', 'tomato-north', 'tomato-south']);
  for (const p of plots) { const bed = S.beds.find(b => b.id === p.bed); assert.ok(Math.abs(p.half[0] - bed.size[0] / 4) < 1e-9); assert.equal(p.half[1], bed.size[1] / 2); }
  assert.ok(plots[0].room > plots[1].room && plots[2].room > plots[3].room);
});
test('the rotation: every crop in a new plot each year, back where it began after four', () => {
  const crops = y => gardenPlan(S, D, y).plots.map(p => p.crop);
  assert.deepEqual(crops(0), ['corn', 'bean', 'tomato', 'rest']);
  for (let y = 0; y < 8; y++) {
    assert.deepEqual([...crops(y)].sort(), ['bean', 'corn', 'rest', 'tomato']);
    for (let i = 0; i < 4; i++) assert.notEqual(crops(y)[i], crops(y + 1)[i]);
    assert.deepEqual(crops(y), crops(y + 4));
  }
  for (const kind of ROTATION) assert.equal(new Set([0, 1, 2, 3].map(y => crops(y).indexOf(kind))).size, 4);
  assert.deepEqual(crops(-1), crops(3));
});
test('the planting: every plant inside its plot, on its soil, clear of the line to the window', () => {
  const [azMin] = windowSpan(S, D), [ax, ay] = S.arrival.position;
  for (let y = 0; y < 4; y++) {
    const plan = gardenPlan(S, D, y); assert.deepEqual(plan, gardenPlan(S, D, y));
    const of = kind => plan.plants.filter(p => p.kind === kind);
    assert.equal(of('corn').length, D.garden.corn.count); assert.equal(of('bean').length, D.garden.beans.poles); assert.equal(of('tomato').length, D.garden.tomatoes.count);
    for (const p of plan.plants) {
      const plot = plan.plots.find(q => q.id === p.plot), bed = plan.beds.find(b => b.id === p.bed);
      assert.equal(plot.crop, p.kind); assert.equal(plot.bed, p.bed); assert.equal(p.foot[2], bed.top);
      const dx = p.foot[0] - plot.center[0], dy = p.foot[1] - plot.center[1];
      const a = dx * Math.sin(plot.yaw) + dy * Math.cos(plot.yaw), c = dx * Math.cos(plot.yaw) - dy * Math.sin(plot.yaw);
      assert.ok(Math.abs(a) <= plot.half[0] - .1 && Math.abs(c) <= plot.half[1] - .15, `${p.id} year ${y}`);
      assert.ok(Math.abs(p.offset) <= OFFSET_DAYS); assert.ok(p.room >= .3, `${p.id} year ${y} room ${p.room}`);
      // the foot's bearing from the arrival lies left of the window's left edge
      assert.ok(Math.atan2(p.foot[0] - ax, p.foot[1] - ay) < azMin, p.id);
    }
  }
  assert.notDeepEqual(gardenPlan(S, D, 0).plants.map(p => p.seed), gardenPlan(S, D, 4).plants.map(p => p.seed));
});
```

Add `gardenPlots, windowSpan, ROTATION` to the file's import from `lakeside-dressing.js` and `OFFSET_DAYS` from `garden-life.js`.

- [ ] **Step 2: Run to verify it fails** — `node --test test/dressing.test.js`; expected: FAIL, `gardenPlots` is not exported.
- [ ] **Step 3: Implement `windowSpan`, `gardenPlots`, `ROTATION` and the new `gardenPlan`** as specified. Print the four plots' `room` and each year's shift once while working, and put the measured figures in the comment above `gardenPlots`; the spec's reviewer measured about .4–.5 m for the south plots and 1.8 m for the north, and the builder confirms or corrects that.
- [ ] **Step 4: Run to verify it passes** — `node --test test/dressing.test.js`; expected: PASS. `node --test test/*.test.js` will still fail in `space-scene.test.js` only if `garden.js` breaks on the new plan; if so, pass `0` for the year there and leave the rest to Task 4.
- [ ] **Step 5: Commit** — `git add shared/lakeside-dressing.js test/dressing.test.js && git commit -m "Divide the beds into four plots and move each crop one plot along every year, planted clear of the line to the window"`

---

### Task 3: The garden on a given day

**Files:**
- Modify: `shared/garden-life.js`
- Test: `test/garden-life.test.js`

**Interfaces:**
- Consumes: `gardenPlan(space, dressing, year)` (Task 2); `cropStage`, `plotSoil` (Task 1).
- Produces: `gardenState(space, dressing, day)` → `{day, year, dayOfYear, beds, plots, plants}` or `null` when `day` is not a finite integer. `plots` are the plan's with `soil: plotSoil(crop, dayOfYear)` added. `plants` are the plan's with `stage: cropStage(kind, dayOfYear, offset)` added, and only those whose `stage.present || stage.support` is true (a bean pole stands before its bean is sown).

- [ ] **Step 1: Write the failing tests**

```js
import {gardenState} from '../shared/garden-life.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D} from '../shared/lakeside-dressing.js';

test('the garden on a day: bare in winter, planted in summer, the same on every call', () => {
  assert.deepEqual(gardenState(S, D, 230), gardenState(S, D, 230));
  assert.equal(gardenState(S, D, 20).plants.length, 0);
  const summer = gardenState(S, D, 230);
  assert.equal(summer.plants.length, D.garden.corn.count + D.garden.beans.poles + D.garden.tomatoes.count);
  assert.equal(summer.year, 0); assert.equal(summer.dayOfYear, 230);
  assert.deepEqual(gardenState(S, D, 122).plants.map(p => p.kind), Array(D.garden.beans.poles).fill('bean'));
});
test('the turn of the year: nothing standing on either side, and the crops have moved on', () => {
  const before = gardenState(S, D, 364), after = gardenState(S, D, 365);
  assert.equal(before.plants.length, 0); assert.equal(after.plants.length, 0);
  for (const s of [before, after]) for (const p of s.plots) assert.deepEqual(p.soil, {dug: 0, mulch: 0});
  assert.equal(after.year, 1); for (let i = 0; i < 4; i++) assert.notEqual(before.plots[i].crop, after.plots[i].crop);
});
test('a far year is as sound as the first', () => {
  const far = gardenState(S, D, 365 * 500 + 200);
  assert.deepEqual(far.plots.map(p => p.crop), gardenState(S, D, 200).plots.map(p => p.crop));
  for (const p of far.plants) for (const v of Object.values(p.stage)) assert.ok(typeof v === 'boolean' || Number.isFinite(v));
});
test('a day that is not a whole number gives no garden', () => {
  for (const day of [NaN, undefined, null, 12.5, '230', Infinity]) assert.equal(gardenState(S, D, day), null);
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test test/garden-life.test.js`; expected: FAIL, `gardenState` is not exported.
- [ ] **Step 3: Implement `gardenState`** in `shared/garden-life.js`.
- [ ] **Step 4: Run to verify it passes** — `node --test test/garden-life.test.js`; expected: PASS.
- [ ] **Step 5: Commit** — `git add shared/garden-life.js test/garden-life.test.js && git commit -m "Describe the whole garden on any world day: its plots, its soil and every plant's stage"`

---

### Task 4: Draw the garden of a day

**Files:**
- Modify: `public/space/geometry.js:107-124` (`cardBatch.add`)
- Modify: `public/space/scene/garden.js` (whole file)
- Modify: `public/space/scene/index.js`
- Test: `test/space-scene.test.js` (the test `the garden is drawn…`, about lines 241–262, and new tests after it)

**Interfaces:**
- Consumes: `gardenState(space, dressing, day)` (Task 3); `windowSpan` (Task 2).
- Produces:
  - `cardBatch().add(…, sway)` honours `sway.scale` (default 1), multiplying the card's reach.
  - `GARDEN_DAY = 230` exported from `garden.js`: the day drawn when none has been given.
  - `buildGarden(THREE, {space, dressing, art, day = GARDEN_DAY})` → `{object, setDay(day)}`. `setDay` returns `true` if it redrew. It does nothing and returns `false` when `day` is the day already drawn or `gardenState` gives `null`.
  - `buildScene(...)` result gains `setGarden(day)`.
- The `garden` group keeps four children named `beds`, `soil`, `stems`, `leaves`. `beds` is built once. `soil`, `stems`, `leaves` keep their mesh objects and materials; `setDay` gives each a new geometry and disposes the old one. When there are no stems or leaves the geometry is an empty `BufferGeometry` with the same attributes, not a missing mesh.
- How a stage is drawn (colours and exact amounts are the builder's):
  - `height` scales the plant's height; stalk and stem radii scale with it. `leaf` is the share of the full leaf count drawn, taken in a fixed seeded order so a leaf once out stays out.
  - Corn: tassels by `flower`, ears by `fruit`; ear colour from green to pale husk by `ripe`.
  - Beans: the pole whenever `support`; vine and leaves by `height` and `leaf`; blossoms by `flower`; pods (a narrow hanging blade) by `fruit`.
  - Tomatoes: the stake whenever `support`; each fruit has a seeded threshold and is drawn while `fruit` exceeds it; its colour runs green → orange → red by `ripe` against a second seeded threshold, so they ripen a few at a time.
  - `yellow` blends every leaf from its green toward straw, from the lowest leaves up; `dry` blends on toward grey-brown, droops leaves, and drops leaf count toward a third. Blackened tomatoes are `dry` at its darkest.
  - Sway scale: `.25 + .75 * height` while green, falling to `.4` as `dry` reaches 1.
  - Soil colour per plot from `soil.dug` (darker) and `soil.mulch` (straw, paler as the value falls), blended across the seam between two plots of a bed over about 5 cm.
  - A leaf or blade whose direction points toward the window's sightline (the line from the arrival position at `windowSpan(...)[0]`) is shortened so its tip stays within the plant's `room`.

- [ ] **Step 1: Write the failing tests** in `test/space-scene.test.js`

Change the existing garden test only where the plan forces it: it builds at the default day, and its leaf count check becomes `sway.count >= 4 * 150` at `GARDEN_DAY` as before. Then add:

```js
test('the garden follows the day: bare in winter, seedlings in spring, redrawn only when the day changes', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), garden = scene.parts.garden;
  const leaves = () => garden.getObjectByName('leaves').geometry, count = () => leaves().getAttribute('position').count;
  const full = count(), first = leaves(); let disposed = 0; first.addEventListener('dispose', () => disposed++);
  assert.equal(scene.setGarden(GARDEN_DAY), false); assert.equal(leaves(), first);
  assert.equal(scene.setGarden(20), true); assert.equal(count(), 0); assert.equal(disposed, 1);
  assert.equal(garden.getObjectByName('stems').geometry.getAttribute('position').count, 0);
  assert.equal(scene.setGarden(150), true); assert.ok(count() > 0 && count() < full / 2);
  for (const bad of [NaN, undefined, 12.5, '230']) { const g = leaves(); assert.equal(scene.setGarden(bad), false); assert.equal(leaves(), g); }
  assert.equal(garden.children.length, 4);
  scene.dispose();
});
test('every tenth day of four years draws finite geometry and leaves nothing behind', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), garden = scene.parts.garden; let made = 0, gone = 0;
  const watch = () => { for (const name of ['soil', 'stems', 'leaves']) { const g = garden.getObjectByName(name).geometry; if (!g.userData.watched) { g.userData.watched = true; made++; g.addEventListener('dispose', () => gone++); } } };
  watch();
  for (let day = 0; day < 4 * 365; day += 10) {
    scene.setGarden(day); watch();
    for (const name of ['soil', 'stems', 'leaves']) { const p = garden.getObjectByName(name).geometry.getAttribute('position'); for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${name} day ${day}`); }
  }
  assert.equal(gone, made - 3); scene.dispose(); assert.equal(gone, made);
});
test('the window is never crossed: from the arrival, no part of the garden lies before it in any year', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), garden = scene.parts.garden, eye = [...S.arrival.position, terrainHeight(S, ...S.arrival.position) + S.eyeHeight];
  const [azMin, azMax] = windowSpan(S, D), centre = openingCentre(S, D, 'window-front-left'), w = D.cabin.windows.find(x => `window-${x.id}` === 'window-front-left');
  const range = Math.hypot(centre[0] - eye[0], centre[1] - eye[1]);
  for (let year = 0; year < 4; year++) for (const d of [200, 230, 262, 290]) {
    scene.setGarden(year * 365 + d); garden.updateMatrixWorld(true);
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 8; j++) {
      const az = azMin + (azMax - azMin) * i / 12, z = centre[2] - w.height / 2 + w.height * j / 8;
      const {hit} = firstHit(garden, eye, [eye[0] + Math.sin(az) * range, eye[1] + Math.cos(az) * range, z]);
      assert.ok(!hit, `year ${year} day ${d}: the garden crosses the window at bearing ${az.toFixed(3)}, height ${z.toFixed(2)}`);
    }
  }
  scene.dispose();
});
```

`firstHit` is the helper already in this file; if it takes a single mesh, give it the group and raycast recursively, limited to the distance to the target. Import `GARDEN_DAY` from `garden.js` and `windowSpan` from `lakeside-dressing.js`.

- [ ] **Step 2: Run to verify it fails** — `node --test test/space-scene.test.js`; expected: FAIL, `scene.setGarden is not a function`.
- [ ] **Step 3: Add `sway.scale` to `cardBatch.add`** in `public/space/geometry.js` (the reach pushed becomes `kind.reach * kind.exposure * (sway.scale ?? 1)`).
- [ ] **Step 4: Rework `public/space/scene/garden.js`**: split `buildGarden` into the boards (once) and a `draw(state)` that returns `{soil, stems, leaves}` geometries from a `gardenState`; implement `setDay`; export `GARDEN_DAY`. Add `setGarden(day) { return garden.setDay(day); }` to `buildScene` in `public/space/scene/index.js`, keeping `parts.garden` as the group.
- [ ] **Step 5: Run to verify it passes** — `node --test test/*.test.js && npm run check`; expected: all PASS.
- [ ] **Step 6: Commit** — `git add public/space/geometry.js public/space/scene/garden.js public/space/scene/index.js test/space-scene.test.js && git commit -m "Draw the garden as it stands on a given world day, and redraw it when the day changes"`

---

### Task 5: Hand the garden the world's day, and look at the year

**Files:**
- Modify: `public/space/space-view.js:186-215` (`render`)
- Modify: `scripts/capture-space-review.mjs`
- Modify: `docs/superpowers/specs/2026-11-17-garden-lifecycle-design.md` (a short "As built" section)

**Interfaces:**
- Consumes: `scene.setGarden(day)` (Task 4).
- Produces: under `?check`, `window.__space.fixture.gardenDay` (a whole number) replaces the calendar's day for the garden only. It is ignored without `?check`.

- [ ] **Step 1: Call the garden each frame.** In `render`, after `this.yard.setSky(...)`: `this.yard.setGarden(this.check && Number.isInteger(this.fixture?.gardenDay) ? this.fixture.gardenDay : c.day);`. The studies keep `c.day`, and reduced motion is not consulted.
- [ ] **Step 2: Add the year's shots to `scripts/capture-space-review.mjs`**, following how its existing fixtures are declared (around lines 41–90): from the arrival pose and from the existing `garden` pose, study `day`, with `fixture: {gardenDay}` for days `20, 112, 128, 140, 160, 185, 205, 230, 255, 275, 295, 316` of year 0, and day `230` of years 1, 2 and 3 (`365 * y + 230`). Name them `garden-day-<n>` and `garden-year-<y>`.
- [ ] **Step 3: Run the tests and the capture** — `node --test test/*.test.js && npm run check`, then the capture script as its header comment describes. Expected: tests PASS; the shots are written.
- [ ] **Step 4: Look at every shot.** Check: bare soil in winter; dug soil darker; seedlings small; corn tallest at 205–255; red tomatoes at 230–255; yellow then dry by 275–295; at 316 only the bean poles with their dead vines, the corn and tomatoes cleared; the mulch in a different plot each year; the front-left window wholly visible from the arrival in all four years. Retune dates, colours and the south plots' shift until it reads as a garden; rerun Step 3 after each change.
- [ ] **Step 5: Measure the redraw.** In the browser at `?space=1&check`, run in the console: `const t = performance.now(); __space.yard.setGarden(365 + 230); performance.now() - t`. It must be under 8 ms on this machine (half a 60 Hz frame). If it is not, build the three geometries across successive frames and swap them together.
- [ ] **Step 6: Record what was built.** Add an "As built" section to the spec: the measured `room` of each plot, the shift used in the south plots, the redraw time, and any date moved from the table.
- [ ] **Step 7: Commit** — `git add public/space/space-view.js scripts/capture-space-review.mjs docs/superpowers/specs/2026-11-17-garden-lifecycle-design.md && git commit -m "Let the garden follow the world's calendar, with a contact sheet of its year"`
