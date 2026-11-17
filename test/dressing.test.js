import test from 'node:test';
import assert from 'node:assert/strict';
import {BED_CLEAR, LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {shoreDistance, terrainHeight, walkable} from '../shared/space.js';
import {LAKESIDE_DRESSING as D, cabinFront, chimneyTop, doorPosition, gardenPlan, groundBlend, oakPlan, openingCentre, ridgePoint, scatter, woodsPlan} from '../shared/lakeside-dressing.js';

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
test('the grove stands beyond the wall, on land', () => {
  assert.ok(D.grove.length >= 3);
  for (const [x, y, height] of D.grove) { assert.equal(walkable(S, [x, y]), false); assert.ok(shoreDistance(S, x, y) > 1, `${x},${y}`); assert.ok(height > 5); }
});
test('ground cover keeps off the cabin, the trunk, the path and the water', () => {
  const grass = scatter(S, D, 'grass'), reeds = scatter(S, D, 'reeds'), flowers = scatter(S, D, 'flowers');
  // all of it is laid, less the few tufts and flowers that would have stood where the garden's beds now are
  assert.ok(grass.length <= D.cover.grass && grass.length > D.cover.grass - 60, `${grass.length}`); assert.equal(reeds.length, D.cover.reeds);
  assert.ok(flowers.length <= D.cover.flowers && flowers.length > D.cover.flowers - 5, `${flowers.length}`);
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

test('openings, ridge and chimney have anchors that sit where the cabin draws them', () => {
  const floor = terrainHeight(S, ...S.cabin.center), door = openingCentre(S, D, 'door'), left = openingCentre(S, D, 'window-front-left');
  const off = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  assert.ok(off(door, doorPosition(S, D)) < .1, 'the door is at the door position');
  assert.ok(Math.abs(door[2] - (terrainHeight(S, ...doorPosition(S, D)) + D.cabin.door.height / 2)) < .25, 'the door is mid-height');
  assert.ok(Math.abs(left[2] - door[2] - (1.45 - (D.cabin.door.height + .03) / 2 + .03)) < .01, 'front windows centre 1.45 m above the threshold');
  assert.ok(Math.abs(left[2] - openingCentre(S, D, 'window-front-right')[2]) < 1e-9, 'front windows are level');
  assert.ok(off(left, openingCentre(S, D, 'window-front-right')) > 4, 'the windows flank the door');
  assert.throws(() => openingCentre(S, D, 'window-nowhere'));
  const mid = ridgePoint(S, D, 0);
  assert.ok(Math.abs(mid[2] - (floor + S.cabin.ridgeHeight - D.cabin.sag)) < .02, `${mid[2]}`);
  assert.ok(off(mid, S.cabin.center) < 1e-9);
  assert.ok(ridgePoint(S, D, 4.5)[2] > mid[2], 'the ridge sags toward its middle');
  const top = chimneyTop(S, D), at = ridgePoint(S, D, D.cabin.chimney.along);
  assert.ok(Math.abs(top[2] - (floor + S.cabin.ridgeHeight + D.cabin.chimney.rise)) < 1e-9);
  assert.ok(off(top, at) < 1e-9 && top[2] - at[2] > D.cabin.chimney.rise - .01 && top[2] - at[2] < D.cabin.chimney.rise + .05);
});

test('the garden: two beds on the grass by the cottage, each a collider, clear of the path, cabin and oak', () => {
  assert.deepEqual(S.beds.map(b => b.id), ['corn', 'tomato']);
  assert.equal(S.colliders[0].type, 'box'); assert.deepEqual(S.colliders[0].center, S.cabin.center);
  for (const bed of S.beds) {
    const c = S.colliders.find(k => k.type === 'box' && k.center[0] === bed.center[0] && k.center[1] === bed.center[1]);
    assert.ok(c, bed.id); assert.deepEqual([...c.half], [bed.size[0] / 2 + BED_CLEAR, bed.size[1] / 2 + BED_CLEAR]); assert.equal(c.yaw, bed.yaw);
    assert.equal(walkable(S, bed.center), false);
    const u = [Math.sin(bed.yaw), Math.cos(bed.yaw)], v = [Math.cos(bed.yaw), -Math.sin(bed.yaw)];
    // a ring 0.4 m outside the boards is all walkable meadow: off the path, out of the cabin, the oak and the other bed
    for (let k = 0; k < 40; k++) {
      const t = k / 40 * 2 * Math.PI, m = Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t)));
      const a = Math.cos(t) / m * (bed.size[0] / 2 + .4), b = Math.sin(t) / m * (bed.size[1] / 2 + .4);
      const p = [bed.center[0] + a * u[0] + b * v[0], bed.center[1] + a * u[1] + b * v[1]];
      assert.ok(walkable(S, p), `${bed.id} ${p}`); assert.ok(groundBlend(S, D, ...p).earth < .2, `${bed.id} on the path`);
    }
  }
  assert.ok(dist(S.beds[0].center, S.beds[1].center) > 2);
});
test('the planting: corn, a bean teepee and tomatoes, each standing in its bed', () => {
  const plan = gardenPlan(S, D); assert.deepEqual(plan, gardenPlan(S, D));
  const of = kind => plan.plants.filter(p => p.kind === kind);
  assert.equal(of('corn').length, D.garden.corn.count); assert.equal(of('bean').length, D.garden.beans.poles); assert.equal(of('tomato').length, D.garden.tomatoes.count);
  for (const p of plan.plants) {
    const bed = plan.beds.find(b => b.id === p.bed), dx = p.foot[0] - bed.center[0], dy = p.foot[1] - bed.center[1];
    const a = dx * Math.sin(bed.yaw) + dy * Math.cos(bed.yaw), b = dx * Math.cos(bed.yaw) - dy * Math.sin(bed.yaw);
    assert.ok(Math.abs(a) <= bed.half[0] - .15 && Math.abs(b) <= bed.half[1] - .15, p.id);
    assert.equal(p.foot[2], bed.top);
  }
  for (const bed of plan.beds) { assert.ok(bed.top - terrainHeight(S, ...bed.center) > .2); assert.ok(bed.base < terrainHeight(S, ...bed.center) - .1); }
  assert.ok(of('corn').every(p => p.height >= 1.7 && p.height <= 2.1)); assert.ok(of('tomato').every(p => p.height <= .85));
  assert.ok(of('bean').every(p => p.bed === 'corn')); assert.ok(of('tomato').every(p => p.bed === 'tomato'));
});

test('the beds move no ground cover: the yard without them has the same tufts, and only those in a bed are gone', () => {
  const bare = {...S, beds: [], colliders: S.colliders.slice(0, 2)};
  for (const kind of ['grass', 'reeds', 'flowers']) {
    const before = scatter(bare, D, kind), after = scatter(S, D, kind);
    assert.equal(before.length, D.cover[kind]);
    assert.deepEqual(after, before.filter(o => walkable(S, [o.x, o.y]) || !walkable(bare, [o.x, o.y])), kind);
    assert.ok(after.every((o, i) => o.index >= i));
  }
  assert.ok(scatter(S, D, 'grass').length < D.cover.grass, 'some grass would have stood in the beds');
});
