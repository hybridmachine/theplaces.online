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
test('turning motion off part-way through a crossing moves the visitor only once', () => {
  let motion = true; const p = createPassage({space: S, dressing: D, interior: I, motion: () => motion});
  run(p, yard(.6), {forward: 0}, 0, 2);
  const first = run(p, yard(.6), {forward: 1}, 2, 2 + T.fadeSeconds / 2 + .05);
  assert.equal(first.moves.length, 1, 'moved at black'); assert.ok(p.busy, 'still fading in');
  motion = false;
  const rest = run(p, insidePose(I), {forward: 0}, 2 + T.fadeSeconds / 2 + .05 + 1 / 30, 4);
  assert.deepEqual(rest.moves, []); assert.ok(!p.busy); assert.equal(rest.last.veil, 0);
});
