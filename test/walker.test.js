import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {terrainHeight, walkable} from '../shared/space.js';
import {eyePosition, glide, stepWalker, WALK} from '../shared/walker.js';

const still = {forward: 0, strafe: 0, turn: 0, fast: false, look: [0, 0]};
const walk = (state, input, seconds, dt = 1 / 30) => {
  for (let i = 0, frames = Math.round(seconds / dt); i < frames; i++) state = stepWalker(S, state, {...still, ...input}, dt);
  return state;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('W walks forward along the heading at 1.4 m/s; Shift at 2.4', () => {
  const a = walk(S.arrival, {forward: 1}, 1);
  assert.ok(Math.abs(a.position[0] - 1.4) < 1e-6 && Math.abs(a.position[1]) < 1e-6, `${a.position}`);
  assert.ok(Math.abs(dist(walk(S.arrival, {forward: 1, fast: true}, 1).position, [0, 0]) - 2.4) < 1e-6);
});
test('diagonal walking is no faster than straight', () => {
  assert.ok(dist(walk(S.arrival, {forward: 1, strafe: 1}, 1).position, [0, 0]) <= 1.4 + 1e-6);
});
test('D strafes to the right of the heading', () => {
  assert.ok(walk(S.arrival, {strafe: 1}, 1).position[1] < -1);   // facing east, right is south
});
test('the visitor never ends up anywhere unwalkable, whatever they hold down', () => {
  for (const yaw of [0, .7, 1.57, 2.4, 3.14, 4.0, 4.71, 5.6]) {
    let state = {...S.arrival, yaw};
    for (let i = 0; i < 3000; i++) {
      state = stepWalker(S, state, {...still, forward: 1, fast: true}, 1 / 30);
      assert.ok(walkable(S, state.position), `yaw ${yaw} step ${i} at ${state.position}`);
      assert.ok(state.position.every(Number.isFinite));
    }
  }
});
test('walking into the cabin slides along it rather than stopping dead', () => {
  const start = {position: [10, 4], yaw: Math.PI / 2, pitch: 0};   // due east, meeting the long wall at an angle
  const touching = walk(start, {forward: 1}, 8), later = walk(touching, {forward: 1}, 8);
  assert.ok(dist(touching.position, later.position) > 2, `${touching.position} -> ${later.position}`);
});
test('a long frame gap moves no further than one clamped step', () => {
  const end = stepWalker(S, S.arrival, {...still, forward: 1, fast: true}, 600);
  assert.ok(dist(end.position, [0, 0]) <= WALK.fast * WALK.maxStep + 1e-9);
});
test('looking is clamped in pitch and wrapped in yaw', () => {
  const s = stepWalker(S, S.arrival, {...still, look: [-10, 9]}, 1 / 30);
  assert.equal(s.pitch, WALK.pitchLimit);
  assert.ok(s.yaw >= 0 && s.yaw < Math.PI * 2);
});
test('arrow-key tilt looks up and down at a steady rate and stops at the limit', () => {
  const up = walk(S.arrival, {tilt: 1}, .5), down = walk(S.arrival, {tilt: -1}, .5);
  assert.ok(Math.abs(up.pitch - WALK.tilt * .5) < 1e-6, `${up.pitch}`);
  assert.ok(Math.abs(down.pitch + WALK.tilt * .5) < 1e-6, `${down.pitch}`);
  assert.deepEqual(up.position, S.arrival.position); assert.equal(up.yaw, S.arrival.yaw);
  assert.equal(walk(S.arrival, {tilt: 1}, 10).pitch, WALK.pitchLimit);
  assert.equal(walk(S.arrival, {tilt: -1}, 10).pitch, -WALK.pitchLimit);
});
test('turning and walking combine: the walk follows the new heading', () => {
  const s = walk(S.arrival, {forward: 1, turn: 1}, 1);
  assert.ok(Math.abs(s.yaw - (S.arrival.yaw + WALK.turn)) < 1e-6);
  assert.ok(s.position[1] < -.3, `${s.position}`);   // curving right of east is south
});
test('the eye rides 1.6 m above the ground', () => {
  assert.equal(eyePosition(S, S.arrival)[2], terrainHeight(S, 0, 0) + 1.6);
});
test('glide starts and ends exactly and turns the short way', () => {
  const from = {position: [5, 5], yaw: .1, pitch: .3}, to = {position: [0, 0], yaw: 6.2, pitch: 0};
  assert.deepEqual(glide(from, to, 0), from); assert.deepEqual(glide(from, to, 1), to);
  const mid = glide(from, to, .5).yaw; assert.ok(mid < .1 || mid > 6.2, `${mid}`);
});
