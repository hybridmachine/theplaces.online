import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {ceilingHeight, floorArea, indoorHeight, onStair, roomAt, wallSegments} from '../shared/interior.js';
import {verticalFov} from '../public/space/space-view.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, cabinFrame, openingCentre} from '../shared/lakeside-dressing.js';
import {viewOpenings, carry, carryDirection, cutPlane, LIVE_CAP, screenRect, screenShare, liveOpenings, inSight} from '../shared/window-views.js';
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

test('upstairs windows are not live from a ground floor room, but can be from the hall and landing, through the stairwell', () => {
  const p = [4.2, 3], fov = verticalFov(16 / 9) * Math.PI / 180;
  const here = live(at(0, p), V(eyeOf(0, p), Math.PI));
  assert.ok(here.length > 0 && here.every(id => by(id).floor === 0), `${here}`);
  // From the hall by the living room wall, looking up past the stair: the third bedroom's roof pane, up the well.
  const h = [7.6, 1.4], up = live(at(0, h), V(eyeOf(0, h), Math.PI / 12, .6, fov, 16 / 9));
  assert.ok(up.includes('bedroom-3'), `${up}`);
  // From the landing, looking down the well: the study window.
  const l = [7.2, 3.4], down = live(at(1, l), V(eyeOf(1, l), Math.PI / 3, -.9, fov, 16 / 9));
  assert.ok(down.includes('study'), `${down}`);
  const b = [3, 3], inRoom = live(at(1, b), V(eyeOf(1, b), Math.PI, -.5, 2, 3));      // a bedroom sees no ground floor
  assert.ok(inRoom.every(id => by(id).floor === 1), `${inRoom}`);
});

test('the limit keeps the largest on screen', () => {
  const p = [8, 3], st = at(0, p), v = V(eyeOf(0, p), Math.PI, .3, 2.2, 2);   // from the hall, through the wide living opening and up the stairwell
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

// inSight: a coarse plan-view sight test from the eye to the pane over the storey's solid wall runs.
const sight = (id, floor, p) => inSight(by(id), I, at(floor, p), eyeOf(floor, p));

test('from the hall the living room window is in sight through the wide opening, but not from behind the wall beside it', () => {
  assert.equal(sight('living', 0, [8, 3]), true);
  assert.equal(sight('living', 0, [7.5, 6.8]), false);
});

test('a pane in the visitor\'s own room is always in sight', () => {
  const eyes = {living: [4.2, 2.2], study: [13.8, 2.2], dining: [10, 9.8], 'bedroom-2': [3.5, 2.7], 'bedroom-3': [14.5, 2.7], 'sky-room': [3.5, 9.5], door: [9, 2]};
  for (const o of O) assert.equal(inSight(o, I, at(o.floor, eyes[o.id]), eyeOf(o.floor, eyes[o.id])), true, o.id);
});

test('the study window is not in sight from the living room', () => assert.equal(sight('study', 0, [3, 3]), false));

test('the dining window is in sight from the kitchen through the open plan', () => assert.equal(sight('dining', 0, [3.2, 10]), true));

test('the front door is in sight from the dining room through the hall', () => assert.equal(sight('door', 0, [9, 9]), true));

test('an opening on the other floor is judged by the stairwell, not by this floor\'s walls', () => {
  assert.equal(sight('bedroom-2', 0, [9, 3]), false, 'the hall ceiling is between');
  assert.equal(sight('bedroom-3', 0, [7.6, 1.4]), true, 'up the well');
});

test('liveOpenings leaves out a pane behind a wall even when it would fill the screen', () => {
  // The hall facing the front wall near the stair foot: the living window is on screen but the a = 7 wall's solid run d 0-2 is between.
  const p = [8, 1], st = at(0, p), v = V(eyeOf(0, p), Math.PI, 0, 2.2, 2);
  assert.ok(screenShare(by('living'), v) > .0005, 'it would count on screen alone');
  assert.ok(!live(st, v, {doorOpen: 1}).includes('living'));
  const h = [8, 3];   // two metres on, the wide opening is clear
  assert.ok(live(at(0, h), V(eyeOf(0, h), Math.PI, 0, 2.2, 2), {doorOpen: 1}).includes('living'));
});

test('the outer wall a pane sits in never hides it', () => {
  for (const id of ['living', 'study', 'dining', 'door']) {
    const o = by(id), side = o.across.map(x => x * 1.2), off = id === 'dining' ? .9 : .5;
    const p = [0, 1].map(i => o.centre[i] - o.outward[i] * off + side[i] * (id === 'dining' ? -1 : 1));
    assert.ok(floorArea(I, 0, p), `${id} eye is standable`);
    assert.equal(inSight(o, I, at(0, p), eyeOf(0, p)), true, id);
  }
});

// A reference sight test: n targets across +-k of the pane's width, over the given wall runs (outer boundary excluded by the caller).
const solidRuns = (extra = []) => [...wallSegments(I, 0).filter(r => r.solid && ![r.from, r.to].every(q => q[0] === 0 || q[0] === 18) && !(r.from[1] === r.to[1] && (r.from[1] === 0 || r.from[1] === 12))), ...extra];
const stairRuns = [{from: [I.stair.a[0], I.stair.d[0]], to: [I.stair.a[0], I.stair.d[1]]}, {from: [I.stair.a[0], I.stair.d[1]], to: [I.stair.a[1], I.stair.d[1]]}];
const crossing = (p, q, {from, to}) => {
  const [rx, ry, sx, sy] = [q[0] - p[0], q[1] - p[1], to[0] - from[0], to[1] - from[1]], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((from[0] - p[0]) * sy - (from[1] - p[1]) * sx) / den, u = ((from[0] - p[0]) * ry - (from[1] - p[1]) * rx) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
};
const reference = (o, p, n, k, runs) => Array.from({length: n}, (_, i) => (i / (n - 1) * 2 - 1) * k).some(s => {
  const x = o.centre[0] + s * o.half[0], y = o.centre[1], len = Math.hypot(x - p[0], y - p[1]), f = 1 - .05 / len;
  return !runs.some(r => crossing(p, [p[0] + (x - p[0]) * f, p[1] + (y - p[1]) * f], r));
});

test('a pane partly in sight is never judged hidden: no false negatives against a 41-target reference (across +-0.98, the rule extent) over standable ground-floor eyes', () => {
  const runs = solidRuns(stairRuns);
  for (const id of ['living', 'study', 'dining', 'door']) for (let a = .3; a < 18; a += .2) for (let d = .3; d < 12; d += .2) {
    if (!floorArea(I, 0, [a, d]) || by(id).room && Math.hypot(a - by(id).centre[0], d - by(id).centre[1]) < .3) continue;
    if (reference(by(id), [a, d], 41, .98, runs)) assert.equal(sight(id, 0, [a, d]), true, `${id} from ${a.toFixed(1)}, ${d.toFixed(1)}`);
  }
});

test('an eye whose only clear line is to a pane\'s edge still sees the pane', () => {
  const o = by('living'), runs = solidRuns(stairRuns);
  const p = [2.8, 10.8];   // in the kitchen's far corner, only lines to the living window's high-a edge get past the d = 7 wall's solid run
  assert.ok(floorArea(I, 0, p));
  assert.equal(reference({...o, half: [0, 0]}, p, 2, 0, runs), false, 'the centre is hidden');
  assert.equal(reference(o, p, 41, .98, runs), true, 'an edge line is clear');
  assert.equal(inSight(o, I, at(0, p), eyeOf(0, p)), true);
});

test('the stair\'s shut-off box hides a ground-floor pane that no listed wall hides', () => {
  const o = by('door'), p = [10.5, 6.3];
  assert.ok(floorArea(I, 0, p));
  assert.equal(reference(o, p, 41, .98, solidRuns()), true, 'without the box some line is clear');
  assert.equal(reference(o, p, 41, .98, solidRuns(stairRuns)), false, 'with it none is');
  assert.equal(inSight(o, I, at(0, p), eyeOf(0, p)), false);
});

test('a roof pane on the visitor\'s own floor is hidden by an interior wall, and in sight from its own room', () => {
  const eye = (p) => inSight(by('sky-room'), I, at(1, p), eyeOf(1, p));
  assert.equal(eye([3.5, 3]), false, 'from bedroom 2 the a/d = 7 wall is between');
  assert.equal(eye([3.5, 9.5]), true, 'from the sky room itself');
  assert.equal(inSight(by('bedroom-3'), I, at(1, [13, 9]), eyeOf(1, [13, 9])), false, 'bedroom 3 pane from the upstairs bath');
});

// ---- the other floor, seen only through the stairwell ----
// A reference: a 49 x 17 grid of 3D lines from the eye over each pane (at +-0.98, so it holds every target the rule uses), each
// judged where it crosses the two heights between the floors (the ground floor's ceiling and the upper floor's level): both
// crossing points must lie inside the stair well's rectangle.
const grid = n => Array.from({length: n}, (_, i) => (i / (n - 1) * 2 - 1) * .98);
const inWell = (e, p) => [I.groundCeiling, I.floorRise].every(h => {
  if ((e[2] - h) * (p[2] - h) > 0) return true;
  const u = (h - e[2]) / (p[2] - e[2]), a = e[0] + (p[0] - e[0]) * u, d = e[1] + (p[1] - e[1]) * u;
  return a > I.stair.a[0] && a < I.stair.a[1] && d > I.stair.d[0] && d < I.stair.d[1];
});
const wellLine = (o, e) => grid(49).some(s => grid(17).some(t => inWell(e, o.centre.map((c, i) => c + s * o.half[0] * o.across[i] + t * o.half[1] * o.up[i]))));
const eyeOn = (floor, p) => [p[0], p[1], indoorHeight(I, floor, p) + 1.6];

test('at the hall\'s entry pose, facing in, no upstairs pane is live: the hall ceiling is between', () => {
  const p = I.entry.position, v = V(eyeOf(0, p), I.entry.yaw, I.entry.pitch, verticalFov(16 / 9) * Math.PI / 180, 16 / 9);
  for (const doorOpen of [0, 1]) {
    const ids = live(at(0, p), v, {doorOpen});
    assert.ok(ids.every(id => by(id).floor === 0), `${ids}`);
  }
  for (const o of O.filter(x => x.floor === 1)) assert.equal(inSight(o, I, at(0, p), eyeOf(0, p)), false, o.id);
});

test('from the stair foot looking up the flight, an upstairs pane is in sight only if a line to it passes up the well', () => {
  const p = [10.25, 1.3], e = eyeOf(0, p);
  for (const o of O.filter(x => x.floor === 1)) assert.equal(inSight(o, I, at(0, p), e), wellLine(o, e), o.id);
});

test('from the landing looking down the well, a ground-floor pane is in sight only if a line to it passes down the well', () => {
  const seen = [];
  for (const p of [[10.3, 6], [9.7, 5.8], [8, 3.5]]) {
    const e = eyeOf(1, p);
    for (const o of O.filter(x => x.floor === 0)) {
      assert.equal(inSight(o, I, at(1, p), e), wellLine(o, e), `${o.id} from ${p}`);
      if (wellLine(o, e)) seen.push(o.id);
    }
  }
  assert.ok(seen.includes('door') && seen.includes('study'), `the door and the study window show down the well from somewhere: ${seen}`);
});

test('over the hall, the flight and the landing, no other-floor pane is in sight unless a line to it passes through the well', () => {
  let across = 0, checked = 0;
  for (const floor of [0, 1]) for (let a = 7.1; a < 11; a += .1) for (let d = .1; d < 7; d += .1) {
    const p = [a, d];
    if (!floorArea(I, floor, p) && !onStair(I, p)) continue;
    if (roomAt(I, floor, p)?.id !== (floor ? 'landing' : 'hall')) continue;
    const e = eyeOn(floor, p);
    for (const o of O.filter(x => x.floor !== floor)) {
      checked++;
      if (inSight(o, I, at(floor, p), e)) { across++; assert.ok(wellLine(o, e), `${o.id} from floor ${floor} at ${a.toFixed(1)}, ${d.toFixed(1)}`); }
    }
  }
  assert.ok(across > 0 && across < checked / 2, `some lines do pass the well, most do not: ${across} of ${checked}`);
});

test("a sight line that clears the stair's low treads is not hidden by the flight's side", () => {
  // From the hall beside the living room's opening, the study window shows over the foot of the stair and through the study's door.
  const study = by('study'), state = {place: 'cabin', floor: 0, position: [7.2, 2.6], yaw: 0, pitch: 0};
  assert.equal(inSight(study, I, state, [7.2, 2.6, 1.6]), true, 'over the low treads');
  // It is the height that decides: were the flight steep enough to stand above that line where it crosses, the pane would be hidden.
  assert.equal(inSight(study, {...I, floorRise: 600}, state, [7.2, 2.6, 1.6]), false, 'under a steeper flight');
  // Higher up the flight the treads stand above a standing eye: the door, seen from beyond the stair's top end, stays hidden.
  assert.equal(inSight(by('door'), I, {...state, position: [10.5, 6.3]}, [10.5, 6.3, 1.6]), false, 'behind the stair box');
});
