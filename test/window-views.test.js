import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {ceilingHeight} from '../shared/interior.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, cabinFrame, openingCentre} from '../shared/lakeside-dressing.js';
import {viewOpenings, carry, carryDirection, cutPlane} from '../shared/window-views.js';

const O = viewOpenings(I, S, D), by = id => O.find(o => o.id === id), f = cabinFrame(S, D);
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2], sub = (p, q) => p.map((x, i) => x - q[i]), len = p => Math.hypot(...p);
const near = (p, q, e = 1e-9) => assert.ok(len(sub(p, q)) < e, `${p} vs ${q}`);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('there are seven openings, each on its own room and floor', () => {
  assert.deepEqual(O.map(o => o.id), ['living', 'study', 'dining', 'bedroom-2', 'bedroom-3', 'sky-room', 'door']);
  assert.deepEqual(O.map(o => o.kind), ['wall', 'wall', 'wall', 'roof', 'roof', 'roof', 'door']);
  assert.deepEqual(O.map(o => o.floor), [0, 0, 0, 1, 1, 1, 0]);
  assert.equal(by('door').room, 'hall');
  assert.ok(Object.isFrozen(O));
});

test('an eye at a pane\'s centre is at its anchor', () => {
  for (const o of O) near(carry(o, o.centre), o.anchor);
  near(by('living').anchor, openingCentre(S, D, 'window-front-left'));
  near(by('door').anchor, openingCentre(S, D, 'door'));
});

test('a metre indoors is a metre outdoors, and up stays up', () => {
  for (const o of O) {
    for (let k = 0; k < 10; k++) {
      const p = [rnd() * 18, rnd() * 12, rnd() * 6], q = [rnd() * 18, rnd() * 12, rnd() * 6];
      assert.ok(Math.abs(len(sub(carry(o, p), carry(o, q))) - len(sub(p, q))) < 1e-9);
    }
    near(carryDirection(o, [0, 0, 1]), [0, 0, 1]);
  }
});

test('each pane looks out of the cabin face it is anchored to', () => {
  const sign = {living: 1, study: 1, door: 1, dining: -1, 'bedroom-2': 1, 'bedroom-3': 1, 'sky-room': -1};
  for (const o of O) {
    const h = carryDirection(o, o.outward), want = f.v.map(x => x * f.front * sign[o.id]);
    near([h[0], h[1], 0].map(x => x / Math.hypot(h[0], h[1])), want);
  }
});

test('the windows keep their order along the front wall', () => {
  const door = by('door'), living = by('living'), study = by('study');
  assert.ok(dot(sub(living.anchor, door.anchor), f.u) < 0);
  assert.ok(dot(sub(study.anchor, door.anchor), f.u) > 0);
  assert.ok(dot(sub(carry(door, living.centre), door.anchor), f.u) < 0);
  assert.ok(dot(sub(carry(door, study.centre), door.anchor), f.u) > 0);
});

test('the cut plane lies in the pane and faces out', () => {
  for (const o of O) {
    const {point, normal} = cutPlane(o);
    near(point, o.anchor); near(normal, carryDirection(o, o.outward));
    for (const [s, t] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const c = o.centre.map((x, i) => x + s * o.half[0] * o.across[i] + t * o.half[1] * o.up[i]);
      assert.ok(Math.abs(dot(sub(carry(o, c), point), normal)) < 1e-9);
    }
  }
});

test('roof panes follow the interior slope and sit above the ceiling', () => {
  for (const id of ['bedroom-2', 'bedroom-3', 'sky-room']) {
    const o = by(id), w = I.windows.find(x => x.id === id), dMid = (w.d[0] + w.d[1]) / 2;
    assert.ok(Math.abs(o.centre[2] - (I.floorRise + ceilingHeight(I, 1, dMid) + I.roofReveal)) < 1e-9);
    assert.ok(o.outward[2] > 0);
    assert.ok(id === 'sky-room' ? o.outward[1] > 0 : o.outward[1] < 0);
    assert.ok(o.up[2] > 0);
    assert.ok(Math.abs(dot(o.up, o.outward)) < 1e-12 && Math.abs(dot(o.up, o.across)) < 1e-12);
  }
});

test('roof panes are anchored mid-slope on the roof, over their own half of the cabin', () => {
  for (const [id, along, side] of [['bedroom-2', -f.L / 2, 1], ['bedroom-3', f.L / 2, 1], ['sky-room', -f.L / 2, -1]]) {
    const b = side * f.front * f.W / 2;
    near(by(id).anchor, f.at(along, b, f.roofZ(along, b) + .05));
  }
});
