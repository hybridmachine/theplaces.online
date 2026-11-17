import {LAKESIDE_SPACE} from './lakeside-space.js';
import {LAKESIDE_DRESSING, cabinFrame, chimneyTop, oakPlan, openingCentre, ridgePoint} from './lakeside-dressing.js';
import {shoreDistance, terrainHeight, walkable, DEG} from './space.js';
import {LAKESIDE_BIRD} from './lakeside-bird.js';
import {catmullRom} from './world.js';
import {LAKESIDE_COINCIDENCES} from './lakeside-coincidences.js';
import {LAKESIDE_WEATHER} from './lakeside-weather.js';
import {SKY_CAMERA} from './celestial-projection.js';

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
// The least horizontal distance from the segment a–b to the point c.
const segmentAxis = (a, b, c) => { const d = [b[0] - a[0], b[1] - a[1]], l = d[0] * d[0] + d[1] * d[1], t = l ? Math.max(0, Math.min(1, ((c[0] - a[0]) * d[0] + (c[1] - a[1]) * d[1]) / l)) : 0; return Math.hypot(a[0] + t * d[0] - c[0], a[1] + t * d[1] - c[1]); };

// The oak's wood as the yard draws it (scene/trees.js), which is what a bird must stand on and what hides it: the trunk and its
// second leader to the north-west, and every limb grown out of the trunk's axis a little below where it leaves, each smoothed
// through its points (Catmull–Rom, four pieces a span). The trunk's flutes swell it by up to TRUNK_FLUTE of its radius.
const TRUNK_FLUTE = .14, drawn = new WeakMap();
function catmull(points, steps = 4) {
  const out = [], n = points.length, P = k => points[Math.max(0, Math.min(n - 1, k))];
  for (let k = 0; k < n - 1; k++) for (let s = 0; s < steps; s++) {
    const t = s / steps, t2 = t * t, t3 = t2 * t, [a, b, c, d] = [P(k - 1), P(k), P(k + 1), P(k + 2)];
    out.push(b.map((_, i) => .5 * (2 * b[i] + (c[i] - a[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t2 + (3 * b[i] - a[i] - 3 * c[i] + d[i]) * t3)));
  }
  out.push(points[n - 1]);
  return out;
}
function byLength(points, f) {
  const lens = points.slice(1).map((q, k) => dist3(points[k], q)), total = lens.reduce((s, l) => s + l, 0);
  let d = Math.max(0, Math.min(1, f)) * total, k = 0;
  while (k < lens.length - 1 && d > lens[k]) d -= lens[k++];
  return lerp(points[k], points[k + 1], lens[k] ? d / lens[k] : 0);
}
export function drawnWood(plan) {
  let wood = drawn.get(plan);
  if (wood) return wood;
  const main = plan.trunk, [ox, oy] = main[0], g = main[0][2] + .4, swell = line => line.map(p => [p[0], p[1], p[2], p[3] * (1 + TRUNK_FLUTE)]);
  const fork = [byLength(main, .3).slice(0, 3).concat(.36), [ox - .7, oy + .55, g + 4.8, .32], [ox - 1.5, oy + 1.0, g + 6.8, .2], [ox - 2.1, oy + 1.2, g + 8.6, .05]];
  const limbs = new Map(plan.limbs.map(limb => {
    const [b] = limb.points, root = byLength(main, (b[2] - .25 - main[0][2]) / (main.at(-1)[2] - main[0][2]));
    return [limb.id, catmull([[root[0], root[1], b[2] - .25, b[3] * .9], ...limb.points])];
  }));
  wood = {lines: [swell(catmull(main)), swell(catmull(fork)), ...limbs.values()], limbs};
  drawn.set(plan, wood);
  return wood;
}
// Metres from `p` to the surface of the oak's wood as drawn: how far the point is from the nearest bark a creature could
// stand on (zero on the bark, negative inside it).
export function woodDistance(plan, p) {
  let best = Infinity;
  for (const line of drawnWood(plan).lines) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / l)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1], p[2] - a[2] - t * d[2]) - (a[3] + (b[3] - a[3]) * t));
  }
  return best;
}
// The point on top of a limb as drawn, `f` of the way along it from where it leaves the trunk: the highest point of the
// limb's round section there, lifted `lift` clear of the bark, so a creature's feet rest on the wood and not in it.
function limbTop(plan, limb, f, lift = .005) {
  const line = drawnWood(plan).limbs.get(limb.id).slice(4), c = byLength(line, f), lens = line.slice(1).map((q, k) => dist3(line[k], q));
  let d = f * lens.reduce((s, l) => s + l, 0), i = 0;
  while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
  const dir = [0, 1, 2].map(k => (line[i + 1][k] - line[i][k]) / lens[i]);
  // straight up, less its part along the limb, is the way to the section's top
  const up = [-dir[2] * dir[0], -dir[2] * dir[1], 1 - dir[2] * dir[2]], n = Math.hypot(...up);
  return [0, 1, 2].map(k => c[k] + up[k] / n * (c[3] + lift));
}
// The closest approach of segments p–q and a–b: [distance, t along a–b] (Ericson, Real-Time Collision Detection 5.1.9).
function segmentGap(p, q, a, b) {
  const d1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], d2 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], r = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], A = dot(d1, d1), E = dot(d2, d2), F = dot(d2, r), C = dot(d1, r), B = dot(d1, d2);
  const clamp = v => Math.max(0, Math.min(1, v)), den = A * E - B * B;
  if (E < 1e-12) { const s = A ? clamp(-C / A) : 0; return [Math.hypot(r[0] + d1[0] * s, r[1] + d1[1] * s, r[2] + d1[2] * s), 0]; }
  let s = den > 1e-12 ? clamp((B * F - C * E) / den) : 0, t = (B * s + F) / E;
  if (t < 0) { t = 0; s = A ? clamp(-C / A) : 0; } else if (t > 1) { t = 1; s = A ? clamp((B - C) / A) : 0; }
  return [Math.hypot(r[0] + d1[0] * s - d2[0] * t, r[1] + d1[1] * s - d2[1] * t, r[2] + d1[2] * s - d2[2] * t), t];
}
// Metres by which the straight sight from `eye` to `target` clears the oak's wood as drawn (negative: trunk or limbs stand in
// the way). Given `below`, it stops as soon as the clearance is known to be under it.
export function woodClearance(plan, eye, target, below = -Infinity) {
  let best = Infinity;
  for (const line of drawnWood(plan).lines) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], [gap, t] = segmentGap(eye, target, a, b);
    best = Math.min(best, gap - (a[3] + (b[3] - a[3]) * t));
    if (best < below) return best;
  }
  return best;
}
// How far the sight from `eye` to `target` keeps outside the bulk of the oak's leaf sprays, as a multiple of each spray's size
// (below 1: through the leaves). A spray is laid as the yard draws it (scene/trees.js): stretched outward from the trunk 1.35
// of its clump's radius, 1.1 across, half as deep and hanging a little low at its outer edge, its cards reaching LEAF_REACH
// beyond. Only a rough guide to what the leaves hide; the selection below prefers sights it calls clear.
const LEAF_REACH = .5;
export function leafClearance(plan, axis, eye, target) {
  let best = Infinity;
  for (const c of plan.clumps) {
    const o = [c.center[0] - axis[0], c.center[1] - axis[1]], n = Math.hypot(...o) || 1, u = [o[0] / n, o[1] / n], R = c.radius;
    const scale = [1.35 * R + LEAF_REACH, 1.1 * R + LEAF_REACH, .5 * R + LEAF_REACH], centre = [c.center[0] + u[0] * .3 * R, c.center[1] + u[1] * .3 * R, c.center[2] - .08 * R];
    // in the spray's own axes, scaled to a unit sphere: the sight's closest approach to its middle
    const local = p => { const r = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]]; return [(r[0] * u[0] + r[1] * u[1]) / scale[0], (-r[0] * u[1] + r[1] * u[0]) / scale[1], r[2] / scale[2]]; };
    const [gap] = segmentGap(local(eye), local(target), [0, 0, 0], [0, 0, 0]);
    best = Math.min(best, gap);
  }
  return best;
}
// What a visitor must see of a bird: its body from its belly (LOW above its feet); of the nest, the rim of its bowl (BOWL).
// A sight counts as clear when it misses the wood by CLEAR, since the drawn bark wanders a little from the curve it follows.
const LOW = .05, BOWL = .1, CLEAR = .02;
// The arrival view's shape, as a 1440×810 window shows it.
const ARRIVAL_ASPECT = 16 / 9;
const lift = (p, h) => [p[0], p[1], p[2] + h];

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

  // ── the bird: three places on top of the oak's limbs as drawn, each chosen from the plan by what a visitor can see of it past
  // the wood (and, roughly, the leaves); the roof perch on the ridge toward the south gable; and a forage out to the bank and
  // back. From the arrival the perch is up and to the left; the nest is higher on the same side, behind leaves from there but
  // seen from beneath the crown; the shelter is behind the trunk from the arrival and shows from the oak's far side. ──
  const eyeAt = ([x, y]) => [x, y, terrainHeight(space, x, y) + space.eyeHeight], from = eyeAt(arrival);
  const seen = (eye, target) => woodClearance(plan, eye, target, CLEAR) > CLEAR;
  const spots = plan.limbs.flatMap(limb => [.08, .16, .24, .32, .4, .48, .56, .64].map(f => ({limb, f, point: limbTop(plan, limb, f)})))
    .filter(s => woodDistance(plan, s.point) >= 0);
  const best = (list, score) => list.reduce((b, s) => { const v = score(s); return v > b.v ? {s, v} : b; }, {s: null, v: -Infinity}).s;
  const inView = p => turnDiff(bearing(arrival, p), space.arrival.yaw) <= 45 * DEG;
  // inside the arrival's own frame, looking level along its yaw (16:9, the sky camera's horizontal field and the vertical
  // field space-view.js derives from it), short of the edges by a tenth
  const halfX = Math.tan(SKY_CAMERA.horizontalFov / 2), halfY = halfX / ARRIVAL_ASPECT, yaw = space.arrival.yaw;
  const inFrame = p => { const d = [p[0] - from[0], p[1] - from[1], p[2] - from[2]], ahead = d[0] * Math.sin(yaw) + d[1] * Math.cos(yaw), side = d[0] * Math.cos(yaw) - d[1] * Math.sin(yaw);
    return ahead > 0 && Math.abs(side / ahead) <= .9 * halfX && Math.abs(d[2] / ahead) <= .9 * halfY; };
  // the perch: its body seen past the wood from the arrival and the clearest of the leaves; inside the arrival's frame if a spot
  // there also looks clear of the leaves, else anywhere across the view's width (seen is better than framed: the low limb
  // across the top-left of the arrival view is clear of wood, but its leaves hide a bird on it)
  const perchable = spots.filter(s => seen(from, lift(s.point, LOW))), leaves = s => leafClearance(plan, axis, from, lift(s.point, LOW));
  const framed = perchable.filter(s => inFrame(s.point) && leaves(s) > 1);
  const perch = best(framed.length ? framed : perchable.filter(s => inView(s.point)), leaves);
  // the nest: on another limb, its rim seen past the wood from the arrival, its rim seen from the most places a visitor
  // naturally stands near the oak (2.5 and 4 m out from the trunk every 30°, and the path's corners within 15 m), the leaves
  // judged roughly from those places
  const near = [2.5, 4].flatMap(r => Array.from({length: 12}, (_, k) => [ox + r * Math.sin(k * TAU / 12), oy + r * Math.cos(k * TAU / 12)]))
    .concat(dressing.path.filter(q => dist2(q, axis) <= 15)).filter(q => walkable(space, q)).map(eyeAt);
  const nest = best(spots.filter(s => s.limb !== perch.limb && inView(s.point) && seen(from, lift(s.point, BOWL))),
    s => near.filter(e => seen(e, lift(s.point, BOWL)) && leafClearance(plan, axis, e, lift(s.point, BOWL)) > 1).length);
  // the shelter: 3–4.5 m up with the trunk between it and the arrival, its body seen past the wood from the most places
  // behind the oak (the half away from the arrival, every 15°, 3, 5.5 and 8 m out)
  const away = toArrival + Math.PI, far = [];
  for (let k = -6; k <= 6; k++) far.push([3, 5.5, 8].map(r => [ox + r * Math.sin(away + k * 15 * DEG), oy + r * Math.cos(away + k * 15 * DEG)]).filter(q => walkable(space, q)).map(eyeAt));
  const behind = s => s.point[2] - ground >= 3 && s.point[2] - ground <= 4.5 && segmentAxis(arrival, s.point, axis) <= space.oak.radius * .8 && !seen(from, lift(s.point, BOWL));
  const shelter = best(spots.filter(behind), s => far.filter(es => es.some(e => seen(e, lift(s.point, LOW)))).length - dist2(s.point, axis) * .1);
  // a perched bird faces across its limb, toward `toward`
  const across = (s, toward) => { const h = bearing(s.limb.points[0], s.limb.points.at(-1)), t = bearing(s.point, toward); return turnDiff(h + Math.PI / 2, t) < turnDiff(h - Math.PI / 2, t) ? h + Math.PI / 2 : h - Math.PI / 2; };
  const place = (point, facing) => ({point, facing});
  const locations = {
    nest: place(nest.point, across(nest, arrival)),
    'oak-perch': place(perch.point, across(perch, arrival)),
    'oak-shelter': place(shelter.point, across(shelter, lerp(axis, shelter.point, 2))),
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
  const bank = [bx, by, terrainHeight(space, bx, by)], home = locations.nest.point, side = bearing(home, bank) + Math.PI / 2;
  const leg = (t, h, bow) => { const p = lerp(home, bank, t); return [p[0] + Math.sin(side) * bow, p[1] + Math.cos(side) * bow, home[2] + (bank[2] - home[2]) * t + h]; };
  const forage = {points: [home, leg(.35, 1.2, 0), leg(.85, 1.1, 0), bank, [...bank], leg(.7, 1.3, 1.2), leg(.3, 2, 1.2), [...home]]};

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

// Where the bird is in the yard, from birdProgress: {position: [x, y, z], heading (yaw), climb (pitch of its path, up positive), flying,
// carrying, wingPhase}, or null for no progress or a route the layout lacks. A settled bird sits at its location's point and faces as it does.
export function birdPlace(progress, layout) {
  if (!progress) return null;
  const {locations, routes, forage} = layout.bird, yaw = ([dx, dy]) => Math.atan2(dx, dy), pitch = ([dx, dy, dz]) => Math.atan2(dz, Math.hypot(dx, dy));
  // A tangent too short to say which way it runs (a path that stops) keeps the given facing.
  const along = (tangent, facing) => Math.hypot(tangent[0], tangent[1]) > 1e-9 ? {heading: yaw(tangent), climb: pitch(tangent)} : {heading: facing, climb: 0};
  if (progress.kind === 'settled') {
    const at = locations[progress.locationId];
    return at && {position: [...at.point], heading: at.facing, climb: 0, flying: false, carrying: false, wingPhase: 0};
  }
  if (progress.kind === 'route') {
    const route = routes[progress.routeId], from = locations[progress.from];
    if (!route || !from) return null;
    const {u, t} = progress, v = 1 - u, p = route.points;
    const position = [0, 1, 2].map(d => v * v * v * p[0][d] + 3 * v * v * u * p[1][d] + 3 * v * u * u * p[2][d] + u * u * u * p[3][d]);
    const tangent = [0, 1, 2].map(d => 3 * v * v * (p[1][d] - p[0][d]) + 6 * v * u * (p[2][d] - p[1][d]) + 3 * u * u * (p[3][d] - p[2][d]));
    return {position, ...along(tangent, from.facing), flying: t > 0 && t < 1, carrying: false, wingPhase: progress.wingPhase};
  }
  if (progress.kind === 'forage') {
    const pts = forage.points, pick = progress.pick, position = catmullRom(pts, pick), facing = locations.nest.facing;
    if (!progress.flying) return {position, heading: facing, climb: 0, flying: false, carrying: progress.carrying, wingPhase: progress.wingPhase};
    const i = Math.min(6, Math.floor(pick)), u = pick - i, [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(7, i + 2)]];
    const tangent = [0, 1, 2].map(d => .5 * ((-p0[d] + p2[d]) + 2 * (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u + 3 * (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u * u));
    return {position, ...along(tangent, facing), flying: true, carrying: progress.carrying, wingPhase: progress.wingPhase};
  }
  return null;
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
    for (const id of ['nest', 'oak-perch', 'oak-shelter']) if (!finite(bird.locations[id].point) || !(woodDistance(plan, bird.locations[id].point) >= 0 && woodDistance(plan, bird.locations[id].point) <= .03)) return false;
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
