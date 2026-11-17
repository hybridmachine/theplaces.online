import test from 'node:test';
import assert from 'node:assert/strict';
import {calendar, viewConditions, WORLD_DAY, RATE} from '../shared/world.js';
import {pathLightLevel} from '../shared/path-lights.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, doorPosition, groundBlend, pathLightPlan} from '../shared/lakeside-dressing.js';
import {terrainHeight, walkable} from '../shared/space.js';

const epoch = 1_800_000_000_000, HOUR = 3_600_000 / RATE;

test('the path lights burn from dusk to early dawn and are dark by day, every day of the year', () => {
  for (let h = 0; h < 365 * 24; h++) {
    const c = calendar(epoch, epoch + h * HOUR), level = pathLightLevel(c), fromNoon = Math.abs(c.hour - 12);
    assert.ok(level >= 0 && level <= 1);
    if (fromNoon <= 2) assert.equal(level, 0, `lit at ${c.hour.toFixed(2)} on day ${c.dayOfYear}`);
    if (fromNoon >= 11) assert.equal(level, 1, `dark at ${c.hour.toFixed(2)} on day ${c.dayOfYear}`);
    // never lit once the sun is well up, never dark in deep night
    if (c.elevation > .07) assert.equal(level, 0); if (c.elevation < -.2) assert.equal(level, 1);
  }
});
test('the lights are on in the dusk and night studies and off in the dawn and day ones', () => {
  const level = study => pathLightLevel(viewConditions(epoch, epoch, study).calendar);
  assert.ok(level('dusk') >= .9); assert.equal(level('night'), 1); assert.equal(level('dawn'), 0); assert.equal(level('day'), 0);
});
test('they come on as the sun sets and go out while it is still well below the horizon', () => {
  assert.equal(pathLightLevel({hour: 19, elevation: -.02}), 1); assert.equal(pathLightLevel({hour: 19, elevation: .06}), 0);
  assert.equal(pathLightLevel({hour: 5, elevation: -.2}), 1); assert.equal(pathLightLevel({hour: 5, elevation: -.08}), 0);
  const mid = pathLightLevel({hour: 5, elevation: -.14}); assert.ok(mid > 0 && mid < 1);
  for (const bad of [undefined, null, {}, {hour: 3}, {elevation: NaN, hour: 3}]) assert.equal(pathLightLevel(bad), 0);
});
test('the level never jumps: a world minute moves it only a little, across noon and midnight too', () => {
  for (const day of [0, 80, 172, 265, 355]) {
    let last = null;
    for (let m = 0; m <= 24 * 60; m++) {
      const level = pathLightLevel(calendar(epoch, epoch + day * WORLD_DAY / RATE + m * HOUR / 60));
      if (last !== null) assert.ok(Math.abs(level - last) < .05, `day ${day} minute ${m}`);
      last = level;
    }
  }
});

// Metres outside a collider's edge (negative inside).
const outside = (c, [x, y]) => {
  const dx = x - c.center[0], dy = y - c.center[1];
  if (c.type === 'circle') return Math.hypot(dx, dy) - c.radius;
  const s = Math.sin(c.yaw), k = Math.cos(c.yaw), a = Math.abs(dx * s + dy * k) - c.half[0], b = Math.abs(dx * k - dy * s) - c.half[1];
  return a > 0 && b > 0 ? Math.hypot(a, b) : Math.max(a, b);
};
const pathDistance = p => {
  let d = Infinity;
  for (let i = 0; i < D.path.length - 1; i++) {
    const a = D.path[i], b = D.path[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return d;
};
test('the path lights stand beside the last stretch of the path to the door, on alternate sides, clear of everything', () => {
  const plan = pathLightPlan(S, D); assert.deepEqual(plan, pathLightPlan(S, D));
  assert.equal(plan.length, D.pathLights.count); assert.equal(plan.length, 5);
  const door = doorPosition(S, D);
  plan.forEach((light, k) => {
    const [x, y, z] = light.foot;
    assert.equal(light.id, `path-light-${k}`); assert.equal(light.side, k % 2 ? 1 : -1);
    assert.ok(walkable(S, [x, y]), light.id); assert.ok(groundBlend(S, D, x, y).earth < .35, `${light.id} stands in the path`);
    assert.ok(Math.abs(pathDistance([x, y]) - (D.pathHalfWidth + D.pathLights.offset)) < .05, light.id);
    for (const c of S.colliders) assert.ok(outside(c, [x, y]) > .5, `${light.id} is too near a collider`);
    assert.ok(Math.hypot(x - door[0], y - door[1]) < 9, `${light.id} is far from the house`);
    assert.equal(z, terrainHeight(S, x, y)); assert.deepEqual(light.lamp, [x, y, z + D.pathLights.height]);
    if (k) assert.ok(Math.hypot(x - plan[k - 1].foot[0], y - plan[k - 1].foot[1]) >= 1.2, light.id);
  });
  // the first is the nearest the door, the rest step away from it
  const far = plan.map(l => Math.hypot(l.foot[0] - door[0], l.foot[1] - door[1]));
  assert.deepEqual(far, [...far].sort((a, b) => a - b));
});
