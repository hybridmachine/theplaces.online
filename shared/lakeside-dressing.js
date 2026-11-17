import {shoreDistance, terrainHeight, walkable} from './space.js';
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
  // A few tall trees standing clear of the woods just beyond the east wall, behind the cabin and its far gable, where the
  // painting has its dense band of trees rising over the roof: [x, y, height in metres].
  grove: [[44, 30, 16], [41.5, 26.5, 15], [43, 21.5, 16.5], [45.5, 16.5, 14], [47.5, 12, 12], [49.5, 9.5, 9.5]],
  cover: {grass: 7000, nearGrass: 1100, reeds: 260, flowers: 150, lowRadius: 6},
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

// kind: 'grass' | 'reeds' | 'flowers' → [{x, y, scale, turn, cell}] (cell indexes into SPACE_ART.cards.cells[kind])
export function scatter(space, dressing, kind) {
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
