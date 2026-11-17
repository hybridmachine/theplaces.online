import {inCollider, shoreDistance, terrainHeight, walkable} from './space.js';
import {SPACE_ART} from './lakeside-space-art.js';

// Where the yard's painted dressing goes: the worn path, the cabin's openings, the oak's limbs and clumps,
// the woods beyond the wall and the scatter of ground cover. Pure and seeded: same input, same output.
// Axes as in lakeside-space.js: x east, y north, z up, metres. `along` is metres along the cabin's long axis.
const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;

export const LAKESIDE_DRESSING = deep({
  version: 1, seed: 617,
  path: [[-9, -5], [-4, -1.6], [0, 0], [3.5, .3], [7.5, 1.6], [11.5, 3.4], [15, 5], [18.1, 5.95]], pathHalfWidth: .55, shoreBand: 1.6,
  cabin: {eave: .4, gable: .3, sag: .09,
    door: {face: 'front', along: 0, width: 1, height: 2},
    windows: [{id: 'front-left', face: 'front', along: -2.4, sill: 1, width: .8, height: .9},
              {id: 'front-right', face: 'front', along: 2.4, sill: 1, width: .8, height: .9},
              {id: 'back', face: 'back', along: .5, sill: 1.2, width: .6, height: .6}],
    // toward the far gable (north, up the yard), as in the painting
    chimney: {along: -3.8, size: .8, rise: 1.05}},
  oak: {clumps: 29, canopyHeight: 9.6},
  // Tall trees beyond the east wall, behind the cabin and its far gable, where the painting has its dense band of trees rising
  // over the roof: in two or three loose, unevenly spaced rows, the back ones standing into the woods so the grove joins them.
  // [x, y, height in metres].
  grove: [[42.5, 27.5, 15], [44, 20, 15.5], [46.5, 13.5, 12.5], [47, 31, 16.5], [45.5, 24.5, 14], [49, 23, 16.5], [50, 17, 14.5], [51.5, 12, 11]],
  cover: {grass: 7000, nearGrass: 1100, reeds: 260, flowers: 150, lowRadius: 6},
  // The kitchen garden's planting, in the space's beds: the boards' thickness, and how many of each crop.
  garden: {board: .045, corn: {count: 9}, beans: {poles: 4}, tomatoes: {count: 4}},
  // The low lights along the path's last stretch to the door: how many, how far back along the path from its end the first
  // stands and the rest follow, how far outside the path's edge, the lamp's height, and the radius of the light each lays.
  pathLights: {count: 5, from: 1.6, spacing: 1.6, offset: .4, height: .45, pool: 1.3},
});

const TAU = 2 * Math.PI, DEG = Math.PI / 180;
const clamp01 = t => Math.max(0, Math.min(1, t));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const lineDist = (line, p, closed = false) => {
  let d = Infinity; const n = closed ? line.length : line.length - 1;
  for (let i = 0; i < n; i++) d = Math.min(d, segDist(p, line[i], line[(i + 1) % line.length]));
  return d;
};
const inBox = (poly, [x, y]) => {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys);
};

// One small seeded generator (mulberry32); each named stream is independent, so adding flowers never moves the grass.
const stream = (seed, name) => {
  let s = seed >>> 0;
  for (const ch of name) s = Math.imul(s ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
// Smooth value noise in [0, 1], for patches.
const hash = (i, j, seed) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const noise = (x, y, seed) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

// +1 or −1: which long face of the cabin looks toward the arrival position (the 'front').
export function cabinFront(space) {
  const {center: [cx, cy], yaw} = space.cabin, [ax, ay] = space.arrival.position;
  return (ax - cx) * Math.cos(yaw) - (ay - cy) * Math.sin(yaw) >= 0 ? 1 : -1;
}
// The point on a long face of the cabin, at ground level, `along` metres from the middle.
const facePoint = (space, face, along) => {
  const {center: [cx, cy], size: [, short], yaw} = space.cabin, side = (face === 'back' ? -1 : 1) * cabinFront(space) * short / 2;
  return [cx + along * Math.sin(yaw) + side * Math.cos(yaw), cy + along * Math.cos(yaw) - side * Math.sin(yaw)];
};
// World position [x, y] of the middle of the door's threshold.
export function doorPosition(space, dressing) {
  const {face, along} = dressing.cabin.door;
  return facePoint(space, face, along);
}

// The cabin's own geometry, shared by the scene that draws it and by whatever is anchored to it, so a drawn panel, ridge or chimney and
// the place something is pinned to it cannot differ. Local axes: `a` along the long axis, `b` across it; `side` is ±1 (see cabin.js).
export const PROUD = .025;
export function cabinFrame(space, dressing) {
  const {center: c, size: [long, short], yaw, wallHeight, ridgeHeight} = space.cabin, {eave: OE, gable: OG, sag} = dressing.cabin;
  const u = [Math.sin(yaw), Math.cos(yaw), 0], v = [Math.cos(yaw), -Math.sin(yaw), 0], L = long / 2, W = short / 2, front = cabinFront(space);
  const at = (a, b, z) => [c[0] + a * u[0] + b * v[0], c[1] + a * u[1] + b * v[1], z];
  const ground = (a, b) => terrainHeight(space, ...at(a, b, 0).slice(0, 2));
  const floor = terrainHeight(space, ...c), eave = floor + wallHeight, ridge = floor + ridgeHeight, slope = (ridge - eave) / W;
  // The walls reach a little below the lowest ground along the footprint, so the slope shows no gap under them.
  let base = floor;
  for (let k = 0; k <= 8; k++) for (const [a, b] of [[-L + k * L / 4, -W], [-L + k * L / 4, W], [-L, -W + k * W / 4], [L, -W + k * W / 4]]) base = Math.min(base, ground(a, b));
  base -= .2;
  // The roof's underside height over (a, b): a plane each side of the ridge, sagging toward the middle of its length (most
  // along the ridge), with a few centimetres of unevenness in the slates.
  // Toward the eaves the slates dip and lift a few centimetres more, so the eave line is not ruled straight.
  const roofZ = (a, b) => {
    const s = clamp01((a + L + OG) / (2 * L + 2 * OG)), t = 1 - Math.abs(b) / (W + OE);
    return ridge - Math.abs(b) * slope - sag * Math.sin(Math.PI * s) * (.35 + .65 * t) + .02 * (noise(a * 2.1, b * 2.3, 41) - .5)
      + .09 * (noise(a * .9, Math.sign(b) * 3, 47) - .5) * (1 - t) ** 2;
  };
  // How far each eave reaches out from the wall, and how deep its board hangs, wandering along it.
  const reachOut = (a, side) => W + OE + .14 * (noise(a * .8, side * 5, 48) - .5);
  // A point on the wall surface, `off` metres outward. Lean is the same function at every wall, so corners meet; the bulge
  // fades to nothing at the corners. `side` is ±1, `isLong` picks the long walls (b = side·W) or the gables (a = side·L).
  const wallPoint = (side, isLong, a, b, z, off = 0) => {
    const k = (z - base) / (eave - base), la = .035 * Math.sin(a * 1.3 + 1) * k, lb = .03 * Math.sin(b * 2.1) * k;
    const fade = isLong ? Math.sin(Math.PI * (a + L) / (2 * L)) : Math.sin(Math.PI * (b + W) / (2 * W));
    const bulge = fade * (.022 * (noise(a * 1.7 + b * 1.3, z * 1.9, 43) - .5) + .012 * (noise(a * 5 + b * 5, z * 5, 44) - .5)) + off;
    return at(a + la + (isLong ? 0 : side * bulge), b + lb + (isLong ? side * bulge : 0), z);
  };
  // The threshold sits a little into the lower of the ground at its two edges, so no stone shows under the door; window sills are
  // measured from it, so the windows stay level however the ground slopes.
  const {door} = dressing.cabin, doorSide = (door.face === 'back' ? -1 : 1) * front;
  const doorGround = Math.min(ground(door.along - door.width / 2, doorSide * W), ground(door.along + door.width / 2, doorSide * W));
  return {u, v, L, W, front, at, ground, floor, eave, ridge, slope, base, roofZ, reachOut, wallPoint, doorGround};
}
// [x, y, z] of the middle of the door ('door') or of a window ('window-<id>') on the wall's outer face, as its panel is drawn.
export function openingCentre(space, dressing, id) {
  const f = cabinFrame(space, dressing), {door, windows} = dressing.cabin, w = windows.find(x => `window-${x.id}` === id);
  const o = id === 'door' ? door : w;
  if (!o) throw new Error(`no opening ${id}`);
  const z0 = id === 'door' ? f.doorGround - .03 : f.doorGround + w.sill, height = id === 'door' ? door.height + .03 : w.height;
  const side = (o.face === 'back' ? -1 : 1) * f.front;
  return f.wallPoint(side, true, o.along, side * f.W, z0 + height / 2, PROUD);
}
// A point on the ridge line, `along` metres from the cabin's centre, as sagged.
export function ridgePoint(space, dressing, along) {
  const f = cabinFrame(space, dressing);
  return f.at(along, 0, f.roofZ(along, 0));
}
// The top of the chimney stack.
export function chimneyTop(space, dressing) {
  const f = cabinFrame(space, dressing), {chimney} = dressing.cabin;
  return f.at(chimney.along, 0, f.ridge + chimney.rise);
}

// The kitchen garden as named parts. Each bed: its middle, yaw and half-sizes [long, wide], `base` a little under the lowest
// ground along its footprint and `top` its soil's height, the bed's `height` above the highest. Each plant: its kind, its bed,
// its `foot` on the soil, its height, the way it leans ([dx, dy] in metres at its top) and a seed for whoever draws it. Corn
// stands in two staggered rows up the corn bed's north two-thirds; the bean poles ring its south end and lean to one apex;
// the tomatoes stand in a row along the tomato bed.
export function gardenPlan(space, dressing) {
  const r = stream(dressing.seed, 'garden'), {corn, beans, tomatoes} = dressing.garden, plants = [];
  const beds = space.beds.map(({id, center, size: [long, wide], yaw, height}) => {
    const u = [Math.sin(yaw), Math.cos(yaw)], v = [Math.cos(yaw), -Math.sin(yaw)], l = long / 2, w = wide / 2;
    const at = (a, b) => [center[0] + a * u[0] + b * v[0], center[1] + a * u[1] + b * v[1]];
    let low = Infinity, high = -Infinity;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) { const z = terrainHeight(space, ...at(-l + i * l / 4, -w + j * w / 2)); low = Math.min(low, z); high = Math.max(high, z); }
    return {id, center: [...center], yaw, half: [l, w], base: low - .15, top: high + height, at};
  });
  const bed = id => beds.find(b => b.id === id);
  const plant = (kind, b, a, c, height, lean) => plants.push({id: `${kind}-${plants.filter(p => p.kind === kind).length}`, kind, bed: b.id,
    foot: [...b.at(a, c), b.top], height, lean, seed: r()});
  const cornBed = bed('corn'), tomatoBed = bed('tomato');
  if (cornBed) {
    // `a` runs along the bed; the cabin's yaw points its long axis south-east, so the north end is at −l
    const [l, w] = cornBed.half, a0 = -l + .3, a1 = l - 1.05, rows = Math.ceil(corn.count / 2);
    for (let k = 0; k < corn.count; k++) {
      const row = k % 2, i = Math.floor(k / 2), a = a0 + (a1 - a0) * (i + .25 + .5 * row) / rows + (r() - .5) * .08;
      plant('corn', cornBed, a, (row ? 1 : -1) * w * .42 + (r() - .5) * .08, 1.75 + r() * .3, [(r() - .5) * .16, (r() - .5) * .16]);
    }
    const mid = l - .55, ring = Math.min(.35, w - .2), apex = cornBed.at(mid, 0);
    for (let k = 0; k < beans.poles; k++) {
      const t = (k + .5) / beans.poles * TAU, a = mid + Math.cos(t) * ring, c = Math.sin(t) * ring, [x, y] = cornBed.at(a, c);
      plant('bean', cornBed, a, c, 1.9, [apex[0] - x, apex[1] - y]);
    }
  }
  if (tomatoBed) {
    const [l] = tomatoBed.half;
    for (let k = 0; k < tomatoes.count; k++)
      plant('tomato', tomatoBed, (-l + .35) + (2 * l - .7) * (tomatoes.count > 1 ? k / (tomatoes.count - 1) : .5), (r() - .5) * .12, .7 + r() * .15, [(r() - .5) * .08, (r() - .5) * .08]);
  }
  return {beds: beds.map(({at, ...b}) => b), plants};
}

// The path lights as placed: nearest the door first, on alternate sides of the path (`side` 1 is the left hand walking to the
// door, the garden's side), the first on the side away from the beds. `foot` is on the ground, `lamp` the middle of its light.
export function pathLightPlan(space, dressing) {
  const {count, from, spacing, offset, height} = dressing.pathLights, path = dressing.path, out = [];
  for (let k = 0; k < count; k++) {
    let back = from + k * spacing, i = path.length - 1;
    for (; i > 1; i--) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); if (back <= l) break; back -= l; }
    const [ax, ay] = path[i - 1], [bx, by] = path[i], l = Math.hypot(bx - ax, by - ay), d = [(bx - ax) / l, (by - ay) / l];
    const side = k % 2 ? 1 : -1, reach = side * (dressing.pathHalfWidth + offset);
    const x = bx - d[0] * back - d[1] * reach, y = by - d[1] * back + d[0] * reach, z = terrainHeight(space, x, y);
    out.push({id: `path-light-${k}`, side, foot: [x, y, z], lamp: [x, y, z + height]});
  }
  return out;
}

// Blend weights for the ground at a point; they sum to 1. The path wins over the shore, the shore over the meadow.
export function groundBlend(space, dressing, x, y) {
  const hw = dressing.pathHalfWidth, earth = 1 - smooth(hw * .6, hw + .45, lineDist(dressing.path, [x, y]));
  const wet = 1 - smooth(0, dressing.shoreBand, shoreDistance(space, x, y));
  return {meadow: (1 - earth) * (1 - wet), earth, shore: (1 - earth) * wet};
}

// The oak's limbs as authored: azimuth (degrees clockwise from north), where it leaves the trunk and where its tip is
// (metres above the ground at the trunk), how far out it reaches, and how many clumps it carries. A ring of low, spreading
// limbs, two or three metres apart at the tips so their clumps run together into one broad canopy, the longest reaching
// toward the cabin (east) and the lake (south); a few higher, shorter ones and the crown fill it above. The two short ones to the
// north-east hang its leaves over the upper left of the arrival view, where the painting's foliage is fullest.
const OAK_LIMBS = [
  {az: 84, base: 3.0, reach: 7.0, tip: 5.6, clumps: 3}, {az: 128, base: 3.9, reach: 5.8, tip: 5.8, clumps: 2},
  {az: 172, base: 2.9, reach: 5.4, tip: 5.8, clumps: 2}, {az: 215, base: 4.3, reach: 4.4, tip: 6.4, clumps: 2},
  {az: 262, base: 3.4, reach: 4.6, tip: 6.0, clumps: 2}, {az: 312, base: 2.8, reach: 4.8, tip: 5.8, clumps: 2},
  {az: 355, base: 4.1, reach: 4.4, tip: 6.0, clumps: 2}, {az: 40, base: 3.3, reach: 5.0, tip: 5.9, clumps: 2},
  {az: 104, base: 4.4, reach: 3.6, tip: 8.4, clumps: 2}, {az: 236, base: 4.8, reach: 3.0, tip: 8.8, clumps: 2},
  {az: 62, base: 3.6, reach: 3.6, tip: 6.6, clumps: 3}, {az: 98, base: 3.5, reach: 2.8, tip: 5.9, clumps: 2},
  {az: 10, base: 5.4, reach: 1.6, tip: 10.4, clumps: 3},
];

// The oak as named parts: trunk and limbs are polylines of [x, y, z, radius]; every clump names the limb it sits on.
export function oakPlan(space, dressing) {
  const [ox, oy] = space.oak.position, g = terrainHeight(space, ox, oy), r = stream(dressing.seed, 'oak');
  const trunk = [[ox, oy, g - .4, .95], [ox + .05, oy - .05, g + 1.5, .72], [ox - .1, oy + .05, g + 3.2, .6], [ox - .05, oy + .2, g + 4.8, .52],
    [ox + .1, oy + .3, g + 7, .32], [ox + .2, oy + .3, g + dressing.oak.canopyHeight - .1, .04]];
  const scale = dressing.oak.clumps / OAK_LIMBS.reduce((s, l) => s + l.clumps, 0);
  const limbs = [], clumps = [];
  OAK_LIMBS.forEach((spec, i) => {
    const a = (spec.az + (r() - .5) * 14) * DEG, dx = Math.sin(a), dy = Math.cos(a);
    const reach = spec.reach * (.92 + r() * .16), base = g + spec.base + (r() - .5) * .4, tip = g + spec.tip + (r() - .5) * .5;
    const at = (f, rise, rad) => [ox + dx * (.3 + (reach - .3) * f), oy + dy * (.3 + (reach - .3) * f), base + (tip - base) * rise, rad];
    // the limb arches: it climbs early, then levels out toward the tip; thick where it leaves the trunk
    const w = .34 - .03 * (spec.base - 3.4);
    const id = `limb-${i}`;
    limbs.push({id, points: [at(0, 0, w), at(.4, .62, w * .6), at(.75, .9, w * .35), at(1, 1, .05)]});
    const n = i === OAK_LIMBS.length - 1 ? Math.max(0, dressing.oak.clumps - clumps.length) : Math.round(spec.clumps * scale);
    for (let k = 0; k < n; k++) {
      // clumps of uneven size spread around the tip (the crown's a little larger), but every one still wraps it
      const radius = 1.4 + r() * 1.1 + (spec.tip > 11 ? .3 : 0), off = k === 0 ? .15 * radius : (.35 + r() * .4) * radius, turn = r() * TAU;
      const lift = (k === 0 ? .2 : r() - .45) * .45 * radius;
      const [tx, ty, tz] = at(1, 1, 0);
      clumps.push({id: `clump-${clumps.length}`, limb: id, center: [tx + Math.sin(turn) * off, ty + Math.cos(turn) * off, tz + lift], radius});
    }
  });
  return {trunk, limbs, clumps};
}

// A point and radius `f` of the way along a polyline of [x, y, z, radius], by length.
export function alongLine(points, f) {
  const lens = points.slice(1).map((q, k) => Math.hypot(q[0] - points[k][0], q[1] - points[k][1], q[2] - points[k][2])), total = lens.reduce((s, l) => s + l, 0);
  let d = Math.max(0, Math.min(1, f)) * total, k = 0;
  while (k < lens.length - 1 && d > lens[k]) d -= lens[k++];
  const t = lens[k] ? d / lens[k] : 0;
  return points[k].map((v, i) => v + (points[k + 1][i] - v) * t);
}
// A polyline smoothed through its points (Catmull-Rom), `steps` pieces per span.
export function smoothLine(points, steps = 4) {
  const out = [], n = points.length, P = k => points[Math.max(0, Math.min(n - 1, k))];
  for (let k = 0; k < n - 1; k++) for (let s = 0; s < steps; s++) {
    const t = s / steps, t2 = t * t, t3 = t2 * t, [a, b, c, d] = [P(k - 1), P(k), P(k + 1), P(k + 2)];
    out.push(b.map((_, i) => .5 * (2 * b[i] + (c[i] - a[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t2 + (3 * b[i] - a[i] - 3 * c[i] + d[i]) * t3)));
  }
  out.push(points[n - 1]);
  return out;
}
// How far the trunk's flutes (scene/trees.js: .07 sine + .05 noise + .1 swelling toward the root, which is nowhere more than
// this together above head height) can swell its drawn radius beyond the centreline's own, as a fraction: an envelope the
// trunk's drawing stays within, for whoever must stand on or hide behind it. test/space-scene.test.js checks the bird's places
// against the built mesh.
export const TRUNK_FLUTE = .14;
const wood = new WeakMap();
// The oak's wood centrelines as scene/trees.js draws them, each smoothed through its points: the trunk, its second leader
// forking off to the north-west, and every limb grown out of the trunk's axis a little below where it leaves (so it comes
// out of the bark with no open end showing). Lines are [x, y, z, radius]; `limbs` maps a limb's id to its line, whose first
// four points (one span) are that root. The one description the yard's drawing and the bird's places both read.
export function oakWood(plan) {
  let drawn = wood.get(plan);
  if (drawn) return drawn;
  const main = plan.trunk, [ox, oy] = main[0], g = main[0][2] + .4;
  const fork = [alongLine(main, .3).slice(0, 3).concat(.36), [ox - .7, oy + .55, g + 4.8, .32], [ox - 1.5, oy + 1.0, g + 6.8, .2], [ox - 2.1, oy + 1.2, g + 8.6, .05]];
  const limbs = new Map(plan.limbs.map(limb => {
    const [b] = limb.points, root = alongLine(main, (b[2] - .25 - main[0][2]) / (main.at(-1)[2] - main[0][2]));
    return [limb.id, smoothLine([[root[0], root[1], b[2] - .25, b[3] * .9], ...limb.points])];
  }));
  drawn = {trunk: smoothLine(main), fork: smoothLine(fork), limbs};
  wood.set(plan, drawn);
  return drawn;
}

// Clumps of woodland 6–25 m beyond the yard wall, on its land sides, in three loose rows.
export function woodsPlan(space, dressing) {
  const w = space.wall, r = stream(dressing.seed, 'woods'), out = [];
  const area = w.reduce((s, p, k) => s + p[0] * w[(k + 1) % w.length][1] - w[(k + 1) % w.length][0] * p[1], 0);
  w.forEach((a, i) => {
    const b = w[(i + 1) % w.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const n = area > 0 ? [d[1], -d[0]] : [-d[1], d[0]];
    [8, 14, 20].forEach((row, j) => {
      for (let t = -4 + r() * 3; t <= len + 4; t += 4.5 + r() * 3) {
        if (j === 2 && r() < .3) continue; // the back row is the loosest
        const off = row + (r() - .5) * 4, x = a[0] + d[0] * t + n[0] * off, y = a[1] + d[1] * t + n[1] * off, radius = 3 + r() * 2.5;
        const beyond = lineDist(w, [x, y], true);
        if (inBox(w, [x, y]) || beyond < 6 || beyond > 25 || shoreDistance(space, x, y) < radius + 1.5) continue;
        if (out.some(o => Math.hypot(o.center[0] - x, o.center[1] - y) < .8 * Math.max(o.radius, radius))) continue;
        const tall = 5 + 8 * r() ** 2;
        out.push({id: `woods-${out.length}`, center: [x, y, terrainHeight(space, x, y) + tall * .55], radius});
      }
    });
  });
  return out;
}

const cellCount = kind => (SPACE_ART.cards.cells[kind] ?? SPACE_ART.cards.cells[kind.replace(/s$/, '')]).length;

// kind: 'grass' | 'reeds' | 'flowers' → [{x, y, scale, turn, cell, index}] (cell indexes into SPACE_ART.cards.cells[kind]).
// The cover is laid as if the garden's beds were not there, and whatever falls in a bed is then left out, so a bed never moves
// a tuft that stands anywhere else; `index` is each one's place in that full laying, for whoever seeds its look from it.
export function scatter(space, dressing, kind) {
  const beds = space.colliders.filter(c => (space.beds ?? []).some(b => b.center[0] === c.center[0] && b.center[1] === c.center[1]));
  const open = beds.length ? {...space, colliders: space.colliders.filter(c => !beds.includes(c))} : space;
  return scatterOpen(open, dressing, kind).map((o, index) => ({...o, index})).filter(o => !beds.some(c => inCollider(c, [o.x, o.y])));
}
function scatterOpen(space, dressing, kind) {
  const r = stream(dressing.seed, kind), want = dressing.cover[kind], cells = cellCount(kind), out = [];
  const w = space.wall, xs = w.map(p => p[0]), ys = w.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 12, Math.max(...xs) + 12, Math.min(...ys) - 12, Math.max(...ys) + 12];
  const [ox, oy] = space.oak.position, [ax, ay] = space.arrival.position, low = dressing.cover.lowRadius;
  const onLand = (x, y) => {
    if (shoreDistance(space, x, y) <= 0 || groundBlend(space, dressing, x, y).earth >= .35) return false;
    return inBox(w, [x, y]) ? walkable(space, [x, y]) : true;
  };
  // past the wall the cover thins out over ten metres
  const thin = (x, y) => inBox(w, [x, y]) ? 1 : .5 * clamp01(1 - lineDist(w, [x, y], true) / 10);
  if (kind === 'reeds') {
    // in patches along the shore, in the shallows and on the bank
    const s = space.shoreline;
    for (let guard = 0; out.length < want && guard < want * 200; guard++) {
      const i = Math.floor(r() * (s.length - 1)), f = r(), [a, b] = [s[i], s[i + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const off = -1.4 + r() * 2.6, x = a[0] + (b[0] - a[0]) * f - (b[1] - a[1]) / len * off, y = a[1] + (b[1] - a[1]) * f + (b[0] - a[0]) / len * off;
      if (x < x0 || x > x1 || Math.abs(shoreDistance(space, x, y)) >= 2.5 || r() > thin(x, y) * 2 || r() > smooth(.45, .7, noise(x * .18, y * .18, 3))) continue;
      out.push({x, y, scale: .75 + r() * .55, turn: r() * TAU, cell: Math.floor(r() * cells)});
    }
    return out;
  }
  // Grass is laid twice: the yard-wide scatter, then (from its own stream, so the first does not move) a thick sward of low
  // tufts around the arrival spot, so the foreground there reads as continuous brushed grass rather than tufts on bare ground.
  const nearWant = kind === 'grass' ? Math.min(want, dressing.cover.nearGrass ?? 0) : 0, nearR = stream(dressing.seed, 'grass-near'), reach = low + 3;
  for (let guard = 0; out.length < want - nearWant && guard < want * 400; guard++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    if (r() > thin(x, y) || !onLand(x, y)) continue;
    const nearOak = Math.hypot(x - ox, y - oy) < 4.5, verge = lineDist(dressing.path, [x, y]) < dressing.pathHalfWidth + 1.4;
    const wild = clamp01((nearOak ? .4 : 0) + (verge ? .35 : 0) + (lineDist(w, [x, y], true) < 3 ? .4 : 0) + (noise(x * .3, y * .3, 1) - .4) * 1.4);
    if (kind === 'flowers') {
      // sparse: wild places first, and the path's verges (cream umbels line it in the painting), the foreground included
      const keep = Math.max(wild * wild, verge ? .3 : 0);
      if (r() > keep || Math.hypot(x - ax, y - ay) < low * .4) continue; // none right at the visitor's feet
      out.push({x, y, scale: .8 + r() * .4, turn: r() * TAU, cell: Math.floor(r() * cells)});
      continue;
    }
    if (r() > .4 + .6 * wild) continue;
    // low by the arrival spot, so the path and the cabin's foot stay in view; taller and rougher where the yard runs wild
    const t = smooth(low, low + 4, Math.hypot(x - ax, y - ay));
    const scale = (.35 + .25 * r()) * (1 - t) + (.7 + .3 * wild + .3 * r()) * t;
    out.push({x, y, scale, turn: r() * TAU, cell: Math.floor(r() * cells)});
  }
  for (let guard = 0; out.length < want && guard < nearWant * 400; guard++) {
    const a = nearR() * TAU, d = reach * Math.sqrt(nearR()), x = ax + Math.sin(a) * d, y = ay + Math.cos(a) * d;
    if (!onLand(x, y)) continue;
    // as low as the scatter keeps the arrival spot, rising a little toward the edge of the sward
    const scale = .32 + .2 * nearR() + .08 * smooth(low * .5, reach, d);
    out.push({x, y, scale: Math.min(scale, .6), turn: nearR() * TAU, cell: Math.floor(nearR() * cells)});
  }
  return out;
}
