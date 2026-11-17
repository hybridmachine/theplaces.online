import {LAKESIDE_SPACE} from './lakeside-space.js';
import {LAKESIDE_DRESSING, cabinFrame, chimneyTop, oakPlan, openingCentre, ridgePoint} from './lakeside-dressing.js';
import {shoreDistance, terrainHeight, DEG} from './space.js';
import {LAKESIDE_BIRD} from './lakeside-bird.js';
import {LAKESIDE_COINCIDENCES} from './lakeside-coincidences.js';
import {LAKESIDE_WEATHER} from './lakeside-weather.js';

// Where each of the painting's living things goes in the yard: the one place every id the 2D systems already name
// (windows, bird locations and routes, drips, ripples) is anchored in 3D. Pure and deterministic. Everything that sits on
// something is computed from the oak's plan, the cabin's frame and the path, never typed as a coordinate.
// Axes as in lakeside-space.js: x east, y north, z up, metres; yaw and bearings are azimuths clockwise from north, in radians.
const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;
const TAU = 2 * Math.PI;

// The wind blows toward the south; a gust front travels at `gustSpeed` m/s.
export const WIND = deep({bearing: Math.PI, direction: [0, -1], gustSpeed: 6});
// Hearth smoke in the yard: metres risen over a puff's life, metres moved along the wind per unit of the 2D puff's x, the
// puff's radius from birth to death, and its sideways wander across the wind.
export const SMOKE = deep({rise: 6, drift: .12, radius: [.35, 1.4], sway: .15});
// Where a puff from smokePuffs is in the yard: {position: [x, y, z], radius, alpha}.
export function smokePlace(puff, layout) {
  const [cx, cy, cz] = layout.cottage.chimney, [wx, wy] = layout.wind.direction, [ax, ay] = [-wy, wx];
  const along = puff.x * SMOKE.drift, across = SMOKE.sway * Math.sin(puff.age * 5), [r0, r1] = SMOKE.radius;
  return {position: [cx + wx * along + ax * across, cy + wy * along + ay * across, cz + SMOKE.rise * puff.age], radius: r0 + (r1 - r0) * puff.age, alpha: puff.alpha};
}
// How much each kind of planting leans with the wind: its type of motion, how exposed it is, and its reach in metres at full weight.
export const SWAY = deep({
  grass: {type: 'grass', exposure: .85, reach: .08}, reeds: {type: 'grass', exposure: 1, reach: .16}, flowers: {type: 'grass', exposure: .7, reach: .06},
  oak: {type: 'leaf', exposure: .9, reach: .05}, shrub: {type: 'leaf', exposure: .5, reach: .03}, woods: {type: 'leaf', exposure: .6, reach: .04},
});

const dist2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const lerp = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
const turnDiff = (a, b) => Math.abs(((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI);
const bearing = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);
const finite = p => Array.isArray(p) && p.every(Number.isFinite);

// Metres from `p` to the wood's surface along a trunk or limb polyline of [x, y, z, radius]: how far the point is from the
// nearest thing a creature could stand on (zero on the bark, negative inside it).
export function woodDistance(plan, p) {
  let best = Infinity;
  for (const line of [plan.trunk, ...plan.limbs.map(l => l.points)]) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / l)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1], p[2] - a[2] - t * d[2]) - (a[3] + (b[3] - a[3]) * t));
  }
  return best;
}
// The limb's point at arc fraction `f` along it, resting on its top: [x, y, z, radius there] (z is the top of the limb).
function limbPoint(limb, f) {
  const pts = limb.points, lens = pts.slice(1).map((q, i) => dist3(pts[i], q)), at = f * lens.reduce((s, v) => s + v, 0);
  let run = 0;
  for (let i = 0; i < lens.length; i++, run += lens[i - 1]) if (at <= run + lens[i] || i === lens.length - 1) {
    const t = Math.max(0, Math.min(1, (at - run) / lens[i])), p = lerp(pts[i], pts[i + 1], t);
    return [p[0], p[1], p[2] + p[3], p[3]];
  }
}
// The limb's point (on its top) whose horizontal distance from the oak's axis is `reach`.
function limbAtReach(limb, axis, reach) {
  let best = limbPoint(limb, 0);
  for (let k = 1; k <= 200; k++) { const p = limbPoint(limb, k / 200); if (Math.abs(dist2(p, axis) - reach) < Math.abs(dist2(best, axis) - reach)) best = p; }
  return best;
}
// The limb whose heading from the trunk is closest to `to` (a bearing).
const limbToward = (plan, to, skip = []) => plan.limbs.filter(l => !skip.includes(l.id)).map(l => ({l, d: turnDiff(bearing(l.points[0], l.points.at(-1)), to)})).sort((a, b) => a.d - b.d)[0].l;

// The point `d` metres along the path polyline from its vertex nearest `from`, going on toward its end: [x, y, heading].
function pathAhead(path, from, d) {
  let i = path.reduce((best, p, k) => dist2(p, from) < dist2(path[best], from) ? k : best, 0);
  while (i < path.length - 1) {
    const len = dist2(path[i], path[i + 1]);
    if (d <= len) { const t = d / len; return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t, Math.atan2(path[i + 1][1] - path[i][1], path[i + 1][0] - path[i][0])]; }
    d -= len; i++;
  }
  return [...path.at(-1), 0];
}

// A bird's route from `from` to `to`: a cubic Bezier whose controls rise a little and keep clear of the trunk, which they
// are pushed round when the straight line would go through it.
function route(from, to, axis, clear) {
  const rise = .12 * dist3(from, to), control = t => {
    const p = lerp(from, to, t); p[2] += rise * (1 - Math.abs(2 * t - 1) * .4);
    const d = dist2(p, axis);
    if (d < clear) { const k = d || 1; p[0] = axis[0] + (p[0] - axis[0] || 1) / k * clear; p[1] = axis[1] + (p[1] - axis[1]) / k * clear; }
    return p;
  };
  return [from, control(1 / 3), control(2 / 3), to];
}

function build(space, dressing) {
  const plan = oakPlan(space, dressing), frame = cabinFrame(space, dressing), [ox, oy] = space.oak.position, axis = [ox, oy], arrival = space.arrival.position;
  const ground = terrainHeight(space, ox, oy), toArrival = bearing(axis, arrival);

  // ── the cottage ──
  const lightOf = id => { const c = openingCentre(space, dressing, id), n = frame.v, side = frame.front; return [c[0] + n[0] * side * .35, c[1] + n[1] * side * .35, c[2]]; };
  const cottage = {rooms: {main: 'front-left', second: 'front-right'}, casement: {window: 'front-left', leaf: 'left', maxAngle: 1.2}, chimney: chimneyTop(space, dressing),
    lights: {main: lightOf('window-front-left'), second: lightOf('window-front-right')}};

  // ── the weather: a puddle on the path east of the arrival, drips under the lowest arrival-side clumps, and what keeps rain off ──
  const [px, py, heading] = pathAhead(dressing.path, arrival, 3.2);
  const under = c => c.center[2] - c.radius;
  const lowest = plan.clumps.filter(c => (c.center[0] - ox) * Math.sin(toArrival) + (c.center[1] - oy) * Math.cos(toArrival) > 0).sort((a, b) => under(a) - under(b)).slice(0, 2);
  const drips = lowest.map((c, i) => ({id: `drip-${i}`, clump: c.id, top: [c.center[0], c.center[1], under(c)], fall: under(c) - terrainHeight(space, c.center[0], c.center[1]), seed: LAKESIDE_WEATHER.drips[i].seed}));
  const roofHeight = ridgePoint(space, dressing, 0)[2];
  const weather = {puddle: {center: [px, py], radius: [.55, .3], turn: heading}, drips,
    shelter: {roof: {center: [...space.cabin.center], half: [frame.L + dressing.cabin.gable, frame.W + dressing.cabin.eave], yaw: space.cabin.yaw, height: roofHeight},
      oak: {center: [ox, oy], radius: Math.max(...lowest.map(c => dist2(c.center, axis))) + .4, base: Math.min(...plan.clumps.map(under)), share: .35}}};

  // ── the water: three spots on the open lake, left to right across the arrival view ──
  const ripples = {'shore-reflection': {center: [28, -17.5], radius: 4.5}, 'open-water': {center: [19, -14.5], radius: 4}, 'near-water': {center: [13, -12.6], radius: 3.5}};

  // ── the bird: the nest in the fork of the limb facing the arrival, a perch along another, the shelter against the trunk's far
  // side, the roof perch on the ridge toward the south gable, and a forage out to the bank and back ──
  const nearLimb = limbToward(plan, toArrival), perchLimb = limbToward(plan, toArrival, [nearLimb.id]), farLimb = limbToward(plan, toArrival + Math.PI);
  const feet = p => p.slice(0, 3), place = (point, facing) => ({point, facing});
  const locations = {
    nest: place(feet(limbAtReach(nearLimb, axis, 1)), 0),
    'oak-perch': place(feet(limbPoint(perchLimb, .6)), Math.PI),
    'oak-shelter': place(feet(limbAtReach(farLimb, axis, .75)), 0),
    'roof-perch': place(ridgePoint(space, dressing, frame.L - 1.3), space.cabin.yaw + Math.PI),
  };
  // the 2D routes are listed forward then reversed; a reverse is the forward curve's points backwards, as in 2D
  const routes = {};
  for (const [id, r] of Object.entries(LAKESIDE_BIRD.routes)) {
    const back = routes[`${r.to}:${r.from}`];
    routes[id] = {from: r.from, to: r.to, points: back ? [...back.points].reverse() : route(locations[r.from].point, locations[r.to].point, axis, 1.8), durationMs: r.durationMs};
  }
  // the bank spot: just inland of the shore where it runs below the arrival view
  const [s0, s1] = [space.shoreline[2], space.shoreline[3]], len = dist2(s0, s1), sp = lerp(s0, s1, .08), bx = sp[0] - (s1[1] - s0[1]) / len * 1.6, by = sp[1] + (s1[0] - s0[0]) / len * 1.6;
  const bank = [bx, by, terrainHeight(space, bx, by)], nest = locations.nest.point, side = bearing(nest, bank) + Math.PI / 2;
  const leg = (t, h, bow) => { const p = lerp(nest, bank, t); return [p[0] + Math.sin(side) * bow, p[1] + Math.cos(side) * bow, nest[2] + (bank[2] - nest[2]) * t + h]; };
  const forage = {points: [nest, leg(.35, 1.2, 0), leg(.85, .9, 0), bank, [...bank], leg(.7, 1.3, 1.2), leg(.3, 2, 1.2), [...nest]]};

  return deep({wind: WIND, sway: SWAY, cottage, weather, ripples,
    bird: {length: .18, locations, routes, forage},
    farBirds: {azimuth: [92 * DEG, 150 * DEG], elevation: [.14, .2], period: 135, crossing: 23}});
}

const memo = new WeakMap();
// The layout for a yard and its dressing, frozen and shared: asking again with the same two objects returns the same object.
export function lifeLayout(space = LAKESIDE_SPACE, dressing = LAKESIDE_DRESSING) {
  let byDressing = memo.get(space); if (!byDressing) memo.set(space, byDressing = new WeakMap());
  let layout = byDressing.get(dressing); if (!layout) byDressing.set(dressing, layout = build(space, dressing));
  return layout;
}

// The share of rain (0–1) that reaches [x, y, z]: none under the cabin's roof, a little under the oak's crown, all in the open.
export function sheltered(layout, [x, y, z]) {
  const {roof, oak} = layout.weather.shelter, dx = x - roof.center[0], dy = y - roof.center[1], s = Math.sin(roof.yaw), k = Math.cos(roof.yaw);
  if (z < roof.height && Math.abs(dx * s + dy * k) <= roof.half[0] && Math.abs(dx * k - dy * s) <= roof.half[1]) return 0;
  return z < oak.base && Math.hypot(x - oak.center[0], y - oak.center[1]) <= oak.radius ? oak.share : 1;
}

// Whether a layout (possibly a stale or tampered copy) is the sort the presenters rely on: every id of the 2D systems is
// there with its timing, every anchor is finite and sits on what it should, and nothing that must stay dry or clear is not.
export function validLifeLayout(layout, space, dressing) {
  try {
    const plan = oakPlan(space, dressing), frame = cabinFrame(space, dressing), same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
    const {bird, ripples, cottage, weather} = layout;
    if (!same(Object.keys(bird.locations), Object.keys(LAKESIDE_BIRD.locations)) || !same(Object.keys(ripples), Object.keys(LAKESIDE_COINCIDENCES.locations))) return false;
    if (!same(Object.keys(bird.routes).sort(), Object.keys(LAKESIDE_BIRD.routes).sort())) return false;
    for (const [id, r] of Object.entries(LAKESIDE_BIRD.routes)) {
      const mine = bird.routes[id], [a, b] = [bird.locations[r.from].point, bird.locations[r.to].point];
      if (mine.durationMs !== r.durationMs || mine.from !== r.from || mine.to !== r.to || mine.points.length !== 4 || !mine.points.every(finite) || dist3(mine.points[0], a) > 1e-9 || dist3(mine.points[3], b) > 1e-9) return false;
    }
    for (const id of ['nest', 'oak-perch', 'oak-shelter']) if (!finite(bird.locations[id].point) || woodDistance(plan, bird.locations[id].point) > .35) return false;
    const ridgeAlong = (bird.locations['roof-perch'].point[0] - space.cabin.center[0]) * frame.u[0] + (bird.locations['roof-perch'].point[1] - space.cabin.center[1]) * frame.u[1];
    if (dist3(bird.locations['roof-perch'].point, ridgePoint(space, dressing, ridgeAlong)) > .02) return false;
    if (bird.forage.points.length !== 8 || !bird.forage.points.every(finite) || dist3(bird.forage.points[0], bird.locations.nest.point) > 1e-9 || dist3(bird.forage.points[7], bird.locations.nest.point) > 1e-9 || dist3(bird.forage.points[3], bird.forage.points[4]) > 1e-9) return false;
    for (const [id, r] of Object.entries(ripples)) if (!finite(r.center) || shoreDistance(space, ...r.center) >= -(r.radius + 1)) return false;
    if (dist3(cottage.lights.main, openingCentre(space, dressing, 'window-front-left')) > .4 || dist3(cottage.chimney, chimneyTop(space, dressing)) > 1e-9) return false;
    const [ax, ay] = space.arrival.position;
    return weather.drips.every(d => finite(d.top) && d.top[2] - d.fall >= terrainHeight(space, d.top[0], d.top[1]) - .05 && dist2(d.top, weather.shelter.oak.center) <= weather.shelter.oak.radius) &&
      sheltered(layout, [ax, ay, terrainHeight(space, ax, ay) + space.eyeHeight]) === 1;
  } catch { return false; }
}
