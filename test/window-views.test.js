import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {ceilingHeight} from '../shared/interior.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, cabinFrame, openingCentre} from '../shared/lakeside-dressing.js';
import {viewOpenings, carry, carryDirection, cutPlane, LIVE_CAP, screenShare, liveOpenings} from '../shared/window-views.js';

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

// ---- which openings are live ----
const V = (eye, yaw, pitch = 0, fov = 1.2, aspect = 1.6) => ({eye, yaw, pitch, fov, aspect});
const at = (floor, position) => ({place: 'cabin', floor, position, yaw: 0, pitch: 0});
const live = (state, view, opts) => liveOpenings(O, I, state, view, {limit: 9, doorOpen: 0, ...opts});
const eyeOf = (floor, p) => [p[0], p[1], (floor ? I.floorRise : 0) + 1.6];

test('facing the living room window from the room, it is the only live opening', () => {
  const p = [4.2, 3];
  assert.deepEqual(live(at(0, p), V(eyeOf(0, p), Math.PI)), ['living']);
});

test('a pane behind the visitor, or seen from its outward side, has no share', () => {
  const p = [4.2, 3], living = by('living');
  assert.ok(screenShare(living, V(eyeOf(0, p), Math.PI)) > .01);
  assert.equal(screenShare(living, V(eyeOf(0, p), 0)), 0);            // looking away
  assert.equal(screenShare(living, V([living.centre[0], -2, 1.6], Math.PI)), 0);   // outside, seen from its outward side
  assert.equal(screenShare(living, V(eyeOf(0, p), Math.PI, 0, 1.2, 1.6)) <= 1, true);
});

test('a pane some of whose corners are behind the eye counts as filling the screen', () => {
  const living = by('living'), a = living.centre[0];
  assert.equal(screenShare(living, V([a, living.centre[1] + .05, 1.6], Math.PI)), 1);
});

test('the door counts only while it stands open', () => {
  const p = [9, 3];
  assert.ok(!live(at(0, p), V(eyeOf(0, p), Math.PI), {doorOpen: 0}).includes('door'));
  assert.ok(live(at(0, p), V(eyeOf(0, p), Math.PI), {doorOpen: .2}).includes('door'));
});

test('upstairs windows are not live from a ground floor room, but are from the hall and landing', () => {
  const p = [4.2, 3];
  assert.ok(live(at(0, p), V(eyeOf(0, p), Math.PI, 1.2)).every(id => by(id).floor === 0));
  const h = [9, 3.5], up = live(at(0, h), V(eyeOf(0, h), 0, 1.2, 2, 3)).filter(id => by(id).floor === 1);
  assert.ok(up.length > 0, 'a hall visitor looking up the stairwell sees upstairs openings');
  const l = [9, 3.5], down = live(at(1, l), V(eyeOf(1, l), Math.PI, -.5, 2, 3));   // from the landing, looking down towards the front
  assert.ok(down.some(id => by(id).floor === 0), `${down}`);
  const b = [3, 3], inRoom = live(at(1, b), V(eyeOf(1, b), Math.PI, -.5, 2, 3));      // the same look from a bedroom sees no ground floor
  assert.ok(inRoom.every(id => by(id).floor === 1), `${inRoom}`);
});

test('the limit keeps the largest on screen', () => {
  const p = [9, 1], st = at(0, p), v = V(eyeOf(0, p), Math.PI, 0, 2.2, 2);
  const all = live(st, v, {doorOpen: 1});
  assert.ok(all.length >= 3, `${all}`);
  const share = Object.fromEntries(all.map(id => [id, screenShare(by(id), v)]));
  for (let i = 1; i < all.length; i++) assert.ok(share[all[i - 1]] >= share[all[i]]);
  assert.deepEqual(live(st, v, {doorOpen: 1, limit: 2}), all.slice(0, 2));
});

test('the caps are three on full and two on light and plain', () => {
  assert.deepEqual({...LIVE_CAP}, {full: 3, light: 2, plain: 2});
  assert.ok(Object.isFrozen(LIVE_CAP));
});
