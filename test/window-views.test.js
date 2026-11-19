import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {ceilingHeight} from '../shared/interior.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, cabinFrame, openingCentre} from '../shared/lakeside-dressing.js';
import {viewOpenings, carry, carryDirection, cutPlane, LIVE_CAP, screenRect, screenShare, liveOpenings} from '../shared/window-views.js';
import {terrainHeight} from '../shared/space.js';

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
  // The door keeps its panel's place along and across the wall; its height is set by the ground outside (below).
  near(by('door').anchor.slice(0, 2), openingCentre(S, D, 'door').slice(0, 2));
});

test('the open doorway\'s floor lies just above the ground outside it, so no ground is cut away there', () => {
  const door = by('door');
  let highest = -Infinity, lowest = Infinity;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 6; j++) {
    const s = (i / 8 - .5) * I.door.width, t = j / 6 * .6, p = carry(door, [door.centre[0] + s, -I.wall / 2 - t, 0]);
    const above = p[2] - terrainHeight(S, p[0], p[1]);
    assert.ok(above > 0, `floor below the ground at ${s}, ${t}: ${above}`);
    highest = Math.max(highest, above); lowest = Math.min(lowest, above);
  }
  assert.ok(highest <= .35, `at most about 0.35 m above it: ${highest}`);
  assert.ok(lowest < .05, `and close to it somewhere: ${lowest}`);
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
  assert.ok(screenShare(living, V(eyeOf(0, p), Math.PI)) < .5);   // a window across a room is a part of the view, not all of it
});

test('a pane beside the visitor that does not reach the screen has no share', () => {
  const living = by('living'), p = [living.centre[0], 3], v = V(eyeOf(0, p), 3 * Math.PI / 2);   // facing the fireplace wall, level with the window
  assert.equal(screenShare(living, v), 0);
  assert.ok(!live(at(0, p), v).includes('living'));
});

test('a pane\'s screen rectangle keeps only what is in front of the eye, and is null off screen', () => {
  const living = by('living');
  // Facing it from across the room: the rectangle holds all four corners, well inside the screen, and its area is the share.
  const across = V(eyeOf(0, [4.2, 3]), Math.PI), r = screenRect(living, across);
  assert.ok(r && r[0] > -1 && r[2] < 1 && r[1] > -1 && r[3] < 1, String(r));
  assert.ok(Math.abs((r[2] - r[0]) * (r[3] - r[1]) / 4 - screenShare(living, across)) < 1e-12);
  // Standing at the glass, looking along the wall toward high a: the chimney-end corners are behind the eye, the rest in view.
  const along = V([4, .5, 1.55], Math.PI / 2), part = screenRect(living, along);
  assert.ok(part, 'some of it is on screen');
  assert.ok((part[2] - part[0]) * (part[3] - part[1]) < 4 - 1e-6, `smaller than the screen: ${part}`);
  // It holds the visible corners (high a), as projected through the same camera.
  const [sy, cy] = [Math.sin(Math.PI / 2), Math.cos(Math.PI / 2)], k = Math.tan(along.fov / 2);
  for (const t of [-1, 1]) {
    const c = [living.centre[0] + living.half[0], living.centre[1], living.centre[2] + t * living.half[1]].map((v, i) => v - along.eye[i]);
    const x = c[0] * cy - c[1] * sy, depth = c[0] * sy + c[1] * cy, y = c[2], px = x / (depth * k * along.aspect), py = y / (depth * k);
    if (Math.abs(px) <= 1 && Math.abs(py) <= 1) assert.ok(px >= part[0] - 1e-9 && px <= part[2] + 1e-9 && py >= part[1] - 1e-9 && py <= part[3] + 1e-9, `${px}, ${py} in ${part}`);
  }
  // Wholly beside or behind the eye: nothing.
  assert.equal(screenRect(living, V(eyeOf(0, [4.2, 3]), 0)), null);
  assert.equal(screenRect(living, V(eyeOf(0, [living.centre[0], 3]), 3 * Math.PI / 2)), null);
});

test('standing right against a pane and looking through it, it nearly fills the screen', () => {
  const living = by('living'), eye = [living.centre[0], living.centre[1] + .2, living.centre[2]];
  assert.ok(screenShare(living, V(eye, Math.PI)) > .9);
});

test('the door counts only while it stands open', () => {
  const p = [9, 3];
  assert.ok(!live(at(0, p), V(eyeOf(0, p), Math.PI), {doorOpen: 0}).includes('door'));
  assert.ok(live(at(0, p), V(eyeOf(0, p), Math.PI), {doorOpen: .2}).includes('door'));
});

test('upstairs windows are not live from a ground floor room, but are from the hall and landing', () => {
  const p = [4.2, 3];
  const here = live(at(0, p), V(eyeOf(0, p), Math.PI));
  assert.ok(here.length > 0 && here.every(id => by(id).floor === 0), `${here}`);
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
