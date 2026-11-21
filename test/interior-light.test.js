import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D} from '../shared/lakeside-dressing.js';
import {viewOpenings} from '../shared/window-views.js';
import {ceilingHeight} from '../shared/interior.js';
import {createLightField, LIGHT} from '../shared/interior-light.js';

const O = viewOpenings(I, S, D), F = createLightField(I, O), UP = [0, 0, 1];
const day = (p, n = UP, f = 0, field = F) => field.weigh(f, p, n).day;
const centre = id => { const r = I.rooms.find(q => q.id === id); return [(r.a[0] + r.a[1]) / 2, (r.d[0] + r.d[1]) / 2, r.floor * I.floorRise]; };

test('the light constants are frozen', () => {
  assert.ok(Object.isFrozen(LIGHT));
  assert.ok(LIGHT.day.floor > 0 && LIGHT.lamp.floor > 0);
});

test('a wall beside a window is brighter by day than the far wall of the same room', () => {
  assert.ok(day([4.2, .6, 0]) > day([4.2, 6.5, 0]));
});

test('a point takes no daylight from a window behind a wall', () => {
  const m = day(centre('master')), borrowed = LIGHT.day.floor;
  assert.ok(Math.abs(m - borrowed) < 1e-9, `${m}`);
  assert.ok(m < day(centre('dining')));
});

test('a windowless room is dimmer than its neighbour but not dark', () => {
  assert.ok(day(centre('master')) >= LIGHT.day.floor);
  assert.ok(day(centre('master')) < day(centre('dining')));
});

test('a point that sees no pane borrows a share of its neighbour\'s daylight through the nearest opening', () => {
  // A pane high in the kitchen's wall, out of the laundry's sight (the laundry opens to the kitchen only by a gap further along the wall).
  const high = {id: 'test', kind: 'wall', floor: 0, room: 'kitchen', centre: [3, 7.2, 2.6], across: [1, 0, 0], up: [0, 0, 1], outward: [0, 1, 0], half: [.3, .3]};
  const lit = createLightField(I, [...O, high]), p = [.3, 9.4, 0];
  assert.equal(day(p), LIGHT.day.floor);
  const w = day(p, UP, 0, lit);
  assert.ok(w > LIGHT.day.floor && w < LIGHT.day.borrow, `${w}`);
});

test('the front door lends daylight to the hall only, at half strength', () => {
  // The dining and study windows are in the hall's sight too, so leave them out: only the door (or the same pane as a wall pane) is left to see.
  const rest = O.filter(o => o.id !== 'dining' && o.id !== 'study'), p = [9, .8, 0];
  const withDoor = createLightField(I, rest), withoutDoor = createLightField(I, rest.filter(o => o.kind !== 'door'));
  const asWall = createLightField(I, rest.map(o => o.kind === 'door' ? {...o, kind: 'wall'} : o));
  assert.ok(day(p, UP, 0, withDoor) > day(p, UP, 0, withoutDoor));
  assert.ok(Math.abs(day(p, UP, 0, withDoor) - LIGHT.day.door * day(p, UP, 0, asWall)) < 1e-9);
  for (const q of [[5, 1, 0], [13, 2, 0], [9, 5, 0]]) assert.equal(day(q, UP, 0, withDoor), day(q, UP, 0, withoutDoor));
});

test('a lamp lights its own room and not the far side of its walls', () => {
  const k = F.weigh(0, [7 - I.wall / 2, 9.5, 1.5], [-1, 0, 0]);
  assert.ok(k.lamp > .3);
  assert.equal(k.room, F.roomIndex('kitchen'));
  const noKitchen = createLightField({...I, fittings: I.fittings.filter(f => f.room !== 'kitchen')}, O);
  const din = F.weigh(0, [7 + I.wall / 2, 9.5, 1.5], [1, 0, 0]);
  assert.equal(din.room, F.roomIndex('dining'));
  assert.equal(din.lamp, noKitchen.weigh(0, [7 + I.wall / 2, 9.5, 1.5], [1, 0, 0]).lamp);
});

test('inside a doorway each face takes the lamp of the room it faces', () => {
  const a = F.weigh(0, [7, 9.5, 1.2], [-1, 0, 0]);   // kitchen-dining opening a = 7, d 7.5-11.5: jamb faces are in the doorway's thickness
  const b = F.weigh(0, [7, 9.5, 1.2], [1, 0, 0]);
  assert.equal(a.room, F.roomIndex('kitchen'));
  assert.equal(b.room, F.roomIndex('dining'));
  const fit = id => I.fittings.find(f => f.room === id).at;
  const expect = (id, n) => { const t = fit(id).map((x, i) => x - [7, 9.5, 1.2][i]), L = Math.hypot(...t), nd = (n[0] * t[0]) / L;
    return Math.max(LIGHT.lamp.floor, (Math.max(0, nd) * .6 + .4) / (1 + (L / LIGHT.lamp.reach * 3) ** 2)); };
  assert.ok(Math.abs(a.lamp - expect('kitchen', [-1, 0, 0])) < 1e-9);
  assert.ok(Math.abs(b.lamp - expect('dining', [1, 0, 0])) < 1e-9);
});

test('firelight reaches the hall through the wide opening and nothing behind the wall beside it', () => {
  assert.ok(F.weigh(0, [8, 3.5, 0], UP).fire > 0);
  assert.equal(F.weigh(0, [8, 6.5, 0], UP).fire, 0);
  assert.equal(F.weigh(0, [3, 8, 0], UP).fire, 0);
  for (const r of I.rooms.filter(q => q.floor === 1)) assert.equal(F.weigh(1, centre(r.id), UP).fire, 0);
});

test('every weight is between 0 and 1 and the room index names the room the surface faces', () => {
  let n = 0;
  for (const [i, r] of I.rooms.entries()) {
    const z0 = r.floor * I.floorRise, mid = [(r.a[0] + r.a[1]) / 2, (r.d[0] + r.d[1]) / 2];
    const pts = [[[mid[0], mid[1], z0], UP], [[mid[0], mid[1], z0 + ceilingHeight(I, r.floor, mid[1])], [0, 0, -1]],
      [[r.a[0], mid[1], z0 + 1.2], [1, 0, 0]], [[r.a[1], mid[1], z0 + 1.2], [-1, 0, 0]], [[mid[0], r.d[0], z0 + 1.2], [0, 1, 0]], [[mid[0], r.d[1], z0 + 1.2], [0, -1, 0]]];
    for (const [p, nrm] of pts) {
      const w = F.weigh(r.floor, p, nrm);
      for (const k of ['day', 'lamp', 'fire']) assert.ok(w[k] >= 0 && w[k] <= 1, `${r.id} ${k} ${w[k]}`);
      assert.equal(w.room, i, `${r.id} ${p}`);
      n++;
    }
  }
  assert.ok(n > 100);
  assert.equal(F.weigh(0, [-3, -3, 0], UP).room, -1);
  assert.equal(F.weigh(0, [-3, -3, 0], UP).lamp, 0);
});

test('weights are the same on every call', () => {
  const p = [5.3, 2.2, 0], a = F.weigh(0, p, UP), b = F.weigh(0, p, UP), c = createLightField(I, O).weigh(0, p, UP);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
});

test('a sweep of 20,000 points is fast', () => {
  const t = process.hrtime.bigint();
  for (let i = 0; i < 20000; i++) F.weigh(i % 2, [(i * 7.31) % 18, (i * 3.77) % 12, (i % 2) * 3], UP);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`# 20000 weigh() calls: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 1000);
});
