import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {shoreDistance, terrainHeight, walkable} from '../shared/space.js';
import {LAKESIDE_DRESSING as D, cabinFront, doorPosition, groundBlend, oakPlan, scatter, woodsPlan} from '../shared/lakeside-dressing.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
test('placement is deterministic', () => {
  for (const make of [() => oakPlan(S, D), () => woodsPlan(S, D), () => scatter(S, D, 'grass'), () => scatter(S, D, 'reeds'), () => scatter(S, D, 'flowers')])
    assert.deepEqual(make(), make());
});
test('the front of the cabin faces the arrival spot and the path ends at its door', () => {
  const door = doorPosition(S, D), c = S.cabin.center;
  assert.ok(dist(door, S.arrival.position) < dist(c, S.arrival.position));
  assert.ok(dist(D.path.at(-1), door) < 1.5, `${door}`);
  assert.ok(walkable(S, D.path[2]));
  assert.ok([1, -1].includes(cabinFront(S)));
});
test('the ground is earth on the path, stones at the water and meadow elsewhere', () => {
  const sum = b => b.meadow + b.earth + b.shore;
  const onPath = groundBlend(S, D, 7.5, 1.6), meadow = groundBlend(S, D, -8, 14), shore = groundBlend(S, D, 8, -6.6);
  assert.ok(onPath.earth > .8); assert.ok(meadow.meadow > .9); assert.ok(shore.shore > .6);
  for (const b of [onPath, meadow, shore]) assert.ok(Math.abs(sum(b) - 1) < 1e-9);
});
test('the oak is one tree: every clump sits on a limb and none floats free', () => {
  const oak = oakPlan(S, D), [ox, oy] = S.oak.position;
  assert.equal(oak.clumps.length, D.oak.clumps);
  assert.equal(new Set(oak.clumps.map(c => c.id)).size, oak.clumps.length);
  assert.ok(dist(oak.trunk[0], [ox, oy]) < .3);
  for (const clump of oak.clumps) {
    const limb = oak.limbs.find(l => l.id === clump.limb); assert.ok(limb, clump.id);
    const tip = limb.points.at(-1);
    assert.ok(Math.hypot(tip[0] - clump.center[0], tip[1] - clump.center[1], tip[2] - clump.center[2]) <= clump.radius, clump.id);
    assert.ok(clump.center[2] - clump.radius > terrainHeight(S, ox, oy) + 3, 'canopy clears head height');
  }
  for (const limb of oak.limbs) assert.ok(dist(limb.points[0], [ox, oy]) < 1.2, `${limb.id} starts at the trunk`);
});
test('woods stand beyond the wall, never in the yard or the lake', () => {
  const woods = woodsPlan(S, D); assert.ok(woods.length >= 20);
  for (const w of woods) { assert.equal(walkable(S, [w.center[0], w.center[1]]), false); assert.ok(shoreDistance(S, w.center[0], w.center[1]) > 0); }
});
test('ground cover keeps off the cabin, the trunk, the path and the water', () => {
  const grass = scatter(S, D, 'grass'), reeds = scatter(S, D, 'reeds'), flowers = scatter(S, D, 'flowers');
  assert.equal(grass.length, D.cover.grass); assert.equal(reeds.length, D.cover.reeds); assert.equal(flowers.length, D.cover.flowers);
  for (const g of [...grass, ...flowers]) {
    assert.ok(shoreDistance(S, g.x, g.y) > 0, 'on land');
    assert.ok(groundBlend(S, D, g.x, g.y).earth < .5, 'not on the path');
    // Inside the yard, away from the water's edge, cover stands only where a visitor could: never in the cabin or the trunk.
    if (inYard(g) && shoreDistance(S, g.x, g.y) > .5) assert.ok(walkable(S, [g.x, g.y]), `${g.x},${g.y}`);
  }
  for (const r of reeds) assert.ok(Math.abs(shoreDistance(S, r.x, r.y)) < 2.5, 'reeds hug the shore');
  // Near the arrival spot the grass stays low, so the path and the cabin's foot can be seen.
  const near = grass.filter(g => dist([g.x, g.y], S.arrival.position) < D.cover.lowRadius);
  assert.ok(near.length > 20); assert.ok(near.every(g => g.scale <= .6));
  // More grass where a visitor walks than beyond the wall.
  const inside = grass.filter(inYard).length; assert.ok(inside > grass.length * .6, `${inside}`);
});
function inYard(g) { const [a, , c] = S.wall; return g.x > a[0] && g.x < c[0] && g.y > a[1] && g.y < c[1]; }
