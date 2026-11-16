import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {edgeDistance, shoreDistance, terrainHeight, validSpace, walkable} from '../shared/space.js';
import {SKY_CAMERA} from '../shared/celestial-projection.js';

test('the authored place is valid and the visitor arrives facing the painting', () => {
  assert.ok(validSpace(S));
  assert.deepEqual(S.arrival, {position: [0, 0], yaw: SKY_CAMERA.bearing, pitch: 0});
  assert.ok(walkable(S, S.arrival.position));
  assert.ok(edgeDistance(S, S.arrival.position) > S.softMargin);
});
test('ground meets the lake at zero and rises inland without steps', () => {
  assert.ok(Math.abs(terrainHeight(S, 8, -7)) < 1e-9);          // a shoreline vertex
  assert.ok(terrainHeight(S, 30, -12) < 0);                      // lake bed
  const h = terrainHeight(S, 0, 0); assert.ok(h > 1 && h < 4, `${h}`);
  for (let x = -14; x < 40; x += .25) {
    const step = Math.abs(terrainHeight(S, x + .25, 5) - terrainHeight(S, x, 5));
    assert.ok(step <= .25 * .2 + 1e-9, `step at ${x}`);
  }
  assert.ok(shoreDistance(S, 0, 0) > 0 && shoreDistance(S, 30, -12) < 0);
});
test('water, cabin, trunk and the far side of the wall are not walkable', () => {
  for (const p of [[30, -12], S.cabin.center, S.oak.position, [-15, 0], [41, 20], [0, 25]])
    assert.equal(walkable(S, p), false, `${p}`);
  for (const p of [[0, 0], [10, 2], [-10, 10], [30, 18]]) assert.equal(walkable(S, p), true, `${p}`);
});
test('non-finite input is never walkable', () => {
  for (const p of [[NaN, 0], [0, Infinity], [], null]) assert.equal(walkable(S, p), false);
});
