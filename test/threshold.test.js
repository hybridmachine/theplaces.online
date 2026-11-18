import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, doorPosition} from '../shared/lakeside-dressing.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {walkable} from '../shared/space.js';
import {floorArea} from '../shared/interior.js';
import {THRESHOLD as T, doorOutward, doorWanted, entering, insidePose, leaving, outsidePose} from '../shared/threshold.js';

const door = doorPosition(S, D), out = doorOutward(S), toDoor = Math.atan2(-out[0], -out[1]);
const at = (m, yaw = toDoor, side = 0) => ({position: [door[0] + out[0] * m - out[1] * side, door[1] + out[1] * m + out[0] * side], yaw, pitch: 0});
const W = {forward: 1}, none = {forward: 0};

test('the door opens for a visitor near and facing it, and not otherwise', () => {
  assert.ok(doorWanted(S, D, at(1.2))); assert.ok(!doorWanted(S, D, at(2)));
  assert.ok(!doorWanted(S, D, at(1.2, toDoor + Math.PI))); assert.ok(!doorWanted(S, D, at(1.2, toDoor + 1.2)));
  assert.ok(!doorWanted(S, D, S.arrival));
});
test('entering needs the visitor close, facing the door and walking forward', () => {
  assert.ok(walkable(S, at(.6).position), 'the spot is reachable outside the cabin collider');
  assert.ok(entering(S, D, at(.6), W));
  assert.ok(!entering(S, D, at(.6), none)); assert.ok(!entering(S, D, at(.6), {forward: -1}));
  assert.ok(!entering(S, D, at(1.0), W)); assert.ok(!entering(S, D, at(.6, toDoor + Math.PI / 2), {forward: 1}));
});
test('leaving needs the visitor in the doorway, facing out and walking forward', () => {
  const inDoor = {place: 'cabin', floor: 0, position: [9, .4], yaw: Math.PI, pitch: 0};
  assert.ok(leaving(I, inDoor, W));
  assert.ok(!leaving(I, inDoor, none)); assert.ok(!leaving(I, {...inDoor, yaw: 0}, {forward: -1}));
  assert.ok(!leaving(I, {...inDoor, position: [7.8, .4]}, W)); assert.ok(!leaving(I, {...inDoor, position: [9, .8]}, W));
  assert.ok(!leaving(I, {...inDoor, floor: 1}, W));
});
test('the poses either side are standable and do not trigger a return trip', () => {
  const inside = insidePose(I), outside = outsidePose(S, D);
  assert.ok(floorArea(I, 0, inside.position)); assert.ok(!leaving(I, inside, W));
  assert.ok(walkable(S, outside.position)); assert.ok(!entering(S, D, outside, W)); assert.ok(!doorWanted(S, D, outside));
  assert.ok(Math.abs(Math.hypot(outside.position[0] - door[0], outside.position[1] - door[1]) - T.outside) < 1e-9);
});
