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
