import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, chimneyTop, doorPosition, oakPlan, openingCentre, ridgePoint} from '../shared/lakeside-dressing.js';
import {LAKESIDE_BIRD} from '../shared/lakeside-bird.js';
import {LAKESIDE_COINCIDENCES} from '../shared/lakeside-coincidences.js';
import {LAKESIDE_WEATHER} from '../shared/lakeside-weather.js';
import {SMOKE, SWAY, WIND, smokePlace, lifeLayout, sheltered, validLifeLayout, woodDistance} from '../shared/lakeside-life.js';
import {shoreDistance, terrainHeight} from '../shared/space.js';
import {DEG} from '../shared/celestial.js';

const L = lifeLayout(), plan = oakPlan(S, D), [ox, oy] = S.oak.position, [ax, ay] = S.arrival.position;
const h2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]), h3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const copy = () => structuredClone(L);
const bezier = (p, t) => [0, 1, 2].map(d => (1 - t) ** 3 * p[0][d] + 3 * (1 - t) ** 2 * t * p[1][d] + 3 * (1 - t) * t * t * p[2][d] + t ** 3 * p[3][d]);
// the Catmull-Rom of world.js birdPose, at `pick` (0..3 going out, 4..7 coming back; it holds at 3 between)
const catmull = (pts, pick) => {
  const i = Math.min(6, Math.floor(pick)), u = pick - i, [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(7, i + 2)]];
  return [0, 1, 2].map(d => .5 * (2 * p1[d] + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u * u + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u * u * u));
};
const inBox = (c, [x, y]) => { const dx = x - c.center[0], dy = y - c.center[1], s = Math.sin(c.yaw), k = Math.cos(c.yaw); return Math.abs(dx * s + dy * k) <= c.half[0] && Math.abs(dx * k - dy * s) <= c.half[1]; };
const box = S.colliders.find(c => c.type === 'box'), circle = S.colliders.find(c => c.type === 'circle'), roofTop = L.weather.shelter.roof.height;
const segmentMin = (a, b, c) => { let best = Infinity; for (let k = 0; k <= 200; k++) best = Math.min(best, h2([a[0] + (b[0] - a[0]) * k / 200, a[1] + (b[1] - a[1]) * k / 200], c)); return best; };

test('the layout is whole and a damaged copy is not', () => {
  assert.ok(validLifeLayout(L, S, D));
  const slow = copy(); slow.bird.routes['nest:oak-perch'].durationMs += 1;
  const dry = copy(); delete dry.ripples['open-water'];
  const off = copy(); off.bird.locations['oak-perch'].point[2] += 1;
  const lost = copy(); lost.bird.locations['oak-perch'].point[0] += 1;
  for (const bad of [slow, dry, off, lost]) assert.equal(validLifeLayout(bad, S, D), false);
  assert.equal(validLifeLayout({}, S, D), false);
});
test('every 2D id has a 3D place, with the 2D timings', () => {
  assert.deepEqual(Object.keys(L.bird.routes).sort(), Object.keys(LAKESIDE_BIRD.routes).sort());
  for (const [id, r] of Object.entries(LAKESIDE_BIRD.routes)) {
    const mine = L.bird.routes[id]; assert.equal(mine.durationMs, r.durationMs, id); assert.equal(mine.from, r.from); assert.equal(mine.to, r.to);
    assert.deepEqual(mine.points[0], L.bird.locations[r.from].point); assert.deepEqual(mine.points[3], L.bird.locations[r.to].point);
    const back = L.bird.routes[`${r.to}:${r.from}`]; assert.deepEqual(mine.points, [...back.points].reverse(), `${id} reverses`);
  }
  assert.deepEqual(Object.keys(L.bird.locations), Object.keys(LAKESIDE_BIRD.locations));
  assert.deepEqual(Object.keys(L.ripples), Object.keys(LAKESIDE_COINCIDENCES.locations));
  assert.deepEqual(L.weather.drips.map(d => d.seed), LAKESIDE_WEATHER.drips.map(d => d.seed));
  assert.deepEqual(L.wind, WIND); assert.deepEqual(L.sway, SWAY); assert.deepEqual(WIND.direction, [0, -1]);
});
test('the bird sits on the oak and the ridge, not in the air', () => {
  for (const id of ['nest', 'oak-perch', 'oak-shelter']) {
    const p = L.bird.locations[id].point, d = Math.min(...[plan.trunk, ...plan.limbs.map(l => l.points)].flatMap(line => line.slice(1).map((q, i) => {
      const a = line[i], v = [q[0] - a[0], q[1] - a[1], q[2] - a[2]], l = v[0] ** 2 + v[1] ** 2 + v[2] ** 2, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1] + (p[2] - a[2]) * v[2]) / l));
      return Math.hypot(p[0] - a[0] - t * v[0], p[1] - a[1] - t * v[1], p[2] - a[2] - t * v[2]); })));
    assert.ok(d <= .35, `${id} is ${d} m off the wood's centreline`);
    assert.ok(woodDistance(plan, p) <= .35 && woodDistance(plan, p) > -.35, id);
  }
  const roof = L.bird.locations['roof-perch'].point, along = (roof[0] - S.cabin.center[0]) * Math.sin(S.cabin.yaw) + (roof[1] - S.cabin.center[1]) * Math.cos(S.cabin.yaw);
  assert.ok(along > 0 && along < S.cabin.size[0] / 2, 'toward the south gable'); assert.ok(h3(roof, ridgePoint(S, D, along)) < .02);
  const shelter = L.bird.locations['oak-shelter'].point, g = terrainHeight(S, ox, oy);
  assert.ok(shelter[2] - g >= 3 && shelter[2] - g <= 4.5, 'the shelter is 3 to 4.5 m up the trunk');
});
test('the shelter is hidden from the arrival view, the nest and the perch are not', () => {
  const hidden = id => segmentMin([ax, ay], L.bird.locations[id].point, [ox, oy]) <= S.oak.radius * .8;
  assert.ok(hidden('oak-shelter')); assert.ok(!hidden('nest')); assert.ok(!hidden('oak-perch'));
});
test('flights keep clear of the ground, the trunk and the roof', () => {
  const g = (p, ex) => terrainHeight(S, p[0], p[1]) + .25, bank = L.bird.forage.points[3];
  const check = (id, p, ends) => {
    if (!ends.some(e => h3(p, e) < .3)) assert.ok(p[2] > g(p), `${id} touches the ground at ${p}`);
    if (p[2] - terrainHeight(S, p[0], p[1]) < 3) assert.ok(h2(p, circle.center) > circle.radius, `${id} goes through the trunk at ${p}`);
    if (inBox(box, p)) assert.ok(p[2] > roofTop, `${id} goes through the roof at ${p}`);
  };
  for (const [id, r] of Object.entries(L.bird.routes)) for (let k = 0; k <= 40; k++) check(id, bezier(r.points, k / 40), [r.points[0], r.points[3]]);
  for (let k = 0; k <= 80; k++) check('forage', catmull(L.bird.forage.points, k <= 40 ? k / 40 * 3 : 4 + (k - 41) / 39 * 3), [L.bird.locations.nest.point, bank]);
});
test('the forage runs nest, bank, nest', () => {
  const f = L.bird.forage.points; assert.equal(f.length, 8);
  assert.deepEqual(f[0], L.bird.locations.nest.point); assert.deepEqual(f[7], L.bird.locations.nest.point); assert.deepEqual(f[3], f[4]);
  assert.ok(Math.abs(f[3][2] - terrainHeight(S, f[3][0], f[3][1])) < 1e-9, 'the spot is on the ground'); assert.ok(shoreDistance(S, f[3][0], f[3][1]) > 0, 'on the bank');
});
test('the ripples are on open water in the arrival view, left to right', () => {
  const bearings = Object.values(L.ripples).map(r => Math.atan2(r.center[0] - ax, r.center[1] - ay));
  for (const [id, r] of Object.entries(L.ripples)) {
    assert.ok(shoreDistance(S, ...r.center) < -(r.radius + 1), id);
    assert.ok(Math.abs(Math.atan2(r.center[0] - ax, r.center[1] - ay) - S.arrival.yaw) <= 45 * DEG, id);
  }
  assert.ok(bearings[0] < bearings[1] && bearings[1] < bearings[2]);
});
test('the puddle is on the path and the drips are under the oak', () => {
  const path = D.path, d = Math.min(...path.slice(1).map((q, i) => { const a = path[i], dx = q[0] - a[0], dy = q[1] - a[1], t = Math.max(0, Math.min(1, ((L.weather.puddle.center[0] - a[0]) * dx + (L.weather.puddle.center[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return h2(L.weather.puddle.center, [a[0] + t * dx, a[1] + t * dy]); }));
  assert.ok(d <= D.pathHalfWidth); const east = L.weather.puddle.center[0] - ax; assert.ok(east >= 2.5 && east <= 4);
  assert.equal(L.weather.drips.length, 2);
  for (const drip of L.weather.drips) {
    assert.ok(drip.fall > 0 && Math.abs(drip.top[2] - drip.fall - terrainHeight(S, drip.top[0], drip.top[1])) < 1e-9, 'a drip falls all the way to the ground'); assert.ok(h2(drip.top, [ox, oy]) <= L.weather.shelter.oak.radius);
    const clump = plan.clumps.find(c => c.id === drip.clump); assert.ok(Math.abs(drip.top[2] - (clump.center[2] - clump.radius)) < 1e-9);
  }
  assert.equal(L.weather.shelter.oak.base, Math.min(...plan.clumps.map(c => c.center[2] - c.radius)));
});
test('the roof and the oak keep the rain off, the open does not', () => {
  const door = doorPosition(S, D), out = [door[0] + .2 * Math.cos(S.cabin.yaw) * (1), door[1] - .2 * Math.sin(S.cabin.yaw), 1.6];
  assert.equal(sheltered(L, out), 0);
  const dx = ax - ox, dy = ay - oy, n = Math.hypot(dx, dy);
  assert.equal(sheltered(L, [ox + dx / n, oy + dy / n, 1.6]), L.weather.shelter.oak.share);
  assert.equal(sheltered(L, [ax, ay, terrainHeight(S, ax, ay) + S.eyeHeight]), 1);
  assert.equal(sheltered(L, [ax, ay, 1.6]), 1);
  assert.equal(sheltered(L, [S.cabin.center[0], S.cabin.center[1], roofTop + 10]), 1);
  assert.equal(sheltered(L, [ox, oy, L.weather.shelter.oak.base + 3]), 1, 'above the lowest clump the oak keeps nothing off');
});
test('the cottage lights sit just outside their windows', () => {
  const {lights, chimney} = L.cottage, [long, short] = S.cabin.size, v = [Math.cos(S.cabin.yaw), -Math.sin(S.cabin.yaw)];
  for (const [room, win] of [['main', 'window-front-left'], ['second', 'window-front-right']]) {
    const c = openingCentre(S, D, win); assert.ok(h3(lights[room], c) <= .4 && h3(lights[room], c) >= .3);
    assert.ok(Math.abs((lights[room][0] - S.cabin.center[0]) * v[0] + (lights[room][1] - S.cabin.center[1]) * v[1]) > short / 2, `${room} light is outside the wall`);
  }
  assert.deepEqual(chimney, chimneyTop(S, D)); assert.ok(long > 0);
  assert.deepEqual(L.cottage.casement, {window: 'front-left', leaf: 'left', maxAngle: 1.2});
});
test('the far birds and the layout itself are fixed', () => {
  assert.deepEqual(L.farBirds, {azimuth: [92 * DEG, 150 * DEG], elevation: [.14, .2], period: 135, crossing: 23});
  assert.equal(lifeLayout(), lifeLayout()); assert.equal(lifeLayout(S, D), L); assert.ok(Object.isFrozen(L) && Object.isFrozen(L.bird.routes['nest:oak-perch'].points[0]));
});
test('a puff of smoke leaves the chimney top, rises, drifts south and swells', () => {
  assert.deepEqual(SMOKE, {rise: 6, drift: .12, radius: [.35, 1.4], sway: .15});
  const [cx, cy, cz] = L.cottage.chimney, start = smokePlace({x: 0, age: 0, alpha: .05}, L);
  assert.deepEqual(start.position, [cx, cy, cz]); assert.equal(start.radius, .35); assert.equal(start.alpha, .05);
  const mid = smokePlace({x: 10, age: .5, alpha: .07}, L), sway = SMOKE.sway * Math.sin(2.5);
  assert.ok(Math.abs(mid.position[2] - (cz + 3)) < 1e-12);
  assert.ok(Math.abs(mid.position[1] - (cy - 1.2)) < 1e-12);       // wind is [0, -1]: 1.2 m south
  assert.ok(Math.abs(mid.position[0] - (cx + sway)) < 1e-12 || Math.abs(mid.position[0] - (cx - sway)) < 1e-12);
  assert.ok(Math.abs(mid.radius - (.35 + .5 * 1.05)) < 1e-12); assert.equal(mid.alpha, .07);
});
