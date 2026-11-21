// The rules that say a cabin interior is valid, and the plain questions asked of it. Pure: no three.js.
import {KINDS, footprint, obstaclesOf} from './furniture.js';

const numbers = v => typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) ? v.every(numbers) : v && typeof v === 'object' ? Object.values(v).every(numbers) : true;
const inside = (r, [a, d]) => a > r.a[0] && a < r.a[1] && d > r.d[0] && d < r.d[1];

// The room whose rectangle holds the point on that floor, walls ignored; null outside every room.
export const roomAt = (I, floor, p) => I.rooms.find(r => r.floor === floor && inside(r, p)) || null;

// Metres from that floor up to its ceiling at depth d: flat below, rising linearly from the eaves to the ridge above.
export const ceilingHeight = (I, floor, d) => floor === 0 ? I.groundCeiling
  : I.eaveCeiling + (I.ridgeCeiling - I.eaveCeiling) * Math.max(0, 1 - Math.abs(d - I.ridgeAt) / I.ridgeAt);

export function validInterior(I) {
  if (!I || I.version !== 1 || !numbers(I) || !Array.isArray(I.rooms) || !Array.isArray(I.openings)) return false;
  const [w, h] = I.size, byId = new Map(I.rooms.map(r => [r.id, r]));
  if (byId.size !== I.rooms.length) return false;
  for (const floor of [0, 1]) {   // each floor tiled exactly: full area, and every sample point in exactly one room
    const rooms = I.rooms.filter(r => r.floor === floor);
    if (rooms.reduce((s, r) => s + (r.a[1] - r.a[0]) * (r.d[1] - r.d[0]), 0) !== w * h) return false;
    for (let a = .25; a < w; a += .5) for (let d = .25; d < h; d += .5) if (rooms.filter(r => inside(r, [a, d])).length !== 1) return false;
  }
  for (const o of I.openings) {
    const [p, q] = o.rooms.map(id => byId.get(id)), along = o.line === 'a' ? 'd' : 'a';
    if (!p || !q || p.floor !== o.floor || q.floor !== o.floor) return false;
    if (![p, q].every(r => r[o.line].includes(o.at) && o.span[0] >= r[along][0] + I.wall / 2 && o.span[1] <= r[along][1] - I.wall / 2)) return false;
    if (o.span[1] - o.span[0] < .9) return false;
    if (o.line === 'a' && o.at === 11 && o.span[0] < 7 && !(o.span[1] <= I.stair.d[0] || o.span[0] >= I.stair.d[1])) return false;
  }
  const seen = new Set(['hall', 'landing']);   // the stair joins them
  for (let grew = true; grew;) { grew = false; for (const o of I.openings) { const [x, y] = o.rooms; if (seen.has(x) !== seen.has(y)) { seen.add(x); seen.add(y); grew = true; } } }
  if (I.rooms.some(r => !seen.has(r.id))) return false;
  if (Math.abs(I.stair.a[1] - I.stair.a[0] - 1.4) > 1e-9 || I.stair.d[0] >= I.stair.d[1] || I.door.a + I.door.width / 2 > I.stair.a[0]) return false;
  for (const win of I.windows) {
    const r = byId.get(win.room);
    if (!r || win.a - win.width / 2 < r.a[0] + I.wall || win.a + win.width / 2 > r.a[1] - I.wall) return false;
  }
  const hall = byId.get('hall'), [a, d] = I.entry.position, leaf = I.doorLeaf;
  if (!hall || !inside(hall, [a, d]) || a < hall.a[0] + I.wall / 2 + I.eyeClear || d < hall.d[0] + I.wall / 2 + I.eyeClear) return false;
  if (!leaf || !Array.isArray(leaf.d) || !(leaf.d[0] < leaf.d[1]) || !(leaf.thick > 0) || Math.abs(leaf.a - (I.door.a - I.door.width / 2)) > 1e-9) return false;
  return leafLeavesWayOpen(I) && obstaclesFit(I) && fittingsFit(I, byId) && (!I.furniture || furnitureFit(I, byId));
}

// Each obstacle stands inside one room of its floor and leaves that room's openings reachable (floor 0 flooded from the entry spot, floor 1
// from the stair's top; the flood also proves both starts standable).
function obstaclesFit(I) {
  if (!Array.isArray(I.obstacles)) return false;
  const reach = [flood(I, 0, I.entry.position), flood(I, 1, [(I.stair.a[0] + I.stair.a[1]) / 2, I.stair.d[1] + .1])];
  return I.obstacles.every(o => {
    if (!(o.floor === 0 || o.floor === 1) || !(o.a[0] < o.a[1]) || !(o.d[0] < o.d[1]) || !reach[o.floor]) return false;
    const r = I.rooms.find(r => r.floor === o.floor && o.a[0] >= r.a[0] && o.a[1] <= r.a[1] && o.d[0] >= r.d[0] && o.d[1] <= r.d[1]);
    return !!r && I.openings.filter(p => p.floor === o.floor && p.rooms.includes(r.id)).every(p => reach[o.floor](doorway(I, p)));
  });
}

// One lamp per room, inside it; a wall one clear of the obstacles; a hanging one hangs 2 m up and 0.3 m below the ceiling and not under a roof
// window, a wall one is within 0.3 m of a wall line of its room and between 1.4 and 1.9 m above its floor.
function fittingsFit(I, byId) {
  if (!Array.isArray(I.fittings) || I.fittings.length !== I.rooms.length || new Set(I.fittings.map(f => f.room)).size !== I.rooms.length) return false;
  return I.fittings.every(f => {
    const r = byId.get(f.room);
    if (!r || !Array.isArray(f.at) || f.at.length !== 3 || !inside(r, f.at)) return false;
    const [a, d, z] = f.at, up = z - r.floor * I.floorRise;
    // (a hanging lamp hangs above head height, so it may hang over an obstacle such as a table; a wall one may not stand in one)
    if (f.kind !== 'hanging' && I.obstacles.some(o => o.floor === r.floor && a >= o.a[0] && a <= o.a[1] && d >= o.d[0] && d <= o.d[1])) return false;
    if (f.kind === 'hanging') return up >= 2 - EPS && ceilingHeight(I, r.floor, d) - up >= .3 - EPS
      && !I.windows.some(w => w.kind === 'roof' && byId.get(w.room).floor === r.floor && Math.abs(a - w.a) <= w.width / 2 && d >= w.d[0] && d <= w.d[1]);
    return f.kind === 'wall' && up >= 1.4 - EPS && up <= 1.9 + EPS
      && (Math.min(a - r.a[0], r.a[1] - a, d - r.d[0], r.d[1] - d) <= .3 + EPS);
  });
}

// The furniture of the blueprint, rule by rule (each numbered as in the plan): every piece known and in a room that exists (1); a footprint
// inside its room (2); a solid one clear of the others, the breasts, the leaf's sweep, the doorways' passages and the stair, the newel apart (3),
// of the wall lamps and of the fire's mouth (4); a hung piece on a wall of its room clear of openings, windows and wall lamps (5); a set-on
// piece on something that holds it (6); the ground floor's openings, the named spots and the stair foot within reach of the arrival spot (7), and the hall's
// openings, the stair foot and the kitchen opening within reach of a walker 0.9 m wide walking through the hall and living room (8).
const WIDE_CLEAR = .45;
const overlaps = (x, y) => x.a[0] < y.a[1] - EPS && y.a[0] < x.a[1] - EPS && x.d[0] < y.d[1] - EPS && y.d[0] < x.d[1] - EPS;
const within = (f, r) => f.a[0] >= r.a[0] - EPS && f.a[1] <= r.a[1] + EPS && f.d[0] >= r.d[0] - EPS && f.d[1] <= r.d[1] + EPS;
const holds = (f, [a, d]) => a >= f.a[0] - EPS && a <= f.a[1] + EPS && d >= f.d[0] - EPS && d <= f.d[1] + EPS;
// Whether the rectangle meets the quarter disc the open leaf swings through: radius door.width about the hinge, on the doorway's side of it.
function inSweep(I, f) {
  const hinge = I.doorLeaf.a, r = I.door.width, side = Math.sign(I.door.a - hinge);
  const a = side > 0 ? [Math.max(f.a[0], hinge), f.a[1]] : [f.a[0], Math.min(f.a[1], hinge)], d = [Math.max(f.d[0], 0), f.d[1]];
  if (a[0] >= a[1] || d[0] >= d[1]) return false;
  return Math.hypot(Math.min(Math.max(hinge, a[0]), a[1]) - hinge, d[0]) < r - EPS;
}
// The newel's one allowance: its centre within 0.2 m of the stair's foot corner and outside the stair's box.
const newelAtFoot = (I, e) => Math.hypot(e.at[0] - I.stair.a[0], e.at[1] - I.stair.d[0]) <= .2 + EPS
  && !(e.at[0] > I.stair.a[0] && e.at[0] < I.stair.a[1] && e.at[1] > I.stair.d[0] && e.at[1] < I.stair.d[1]);

function furnitureFit(I, byId) {
  if (!Array.isArray(I.furniture) || !Array.isArray(I.breasts) || !I.spots || !Array.isArray(I.spots.speed)) return false;
  // (the walker's obstacles are the breasts and the solid pieces, as obstaclesOf derives them: the same rectangles in the same order)
  const same = (x, y) => x.floor === y.floor && x.a[0] === y.a[0] && x.a[1] === y.a[1] && x.d[0] === y.d[0] && x.d[1] === y.d[1], want = obstaclesOf(I);
  if (!Array.isArray(I.obstacles) || I.obstacles.length !== want.length || !want.every((o, k) => same(o, I.obstacles[k]))) return false;
  const pieces = new Map();
  for (const e of I.furniture) {   // 1
    if (!e || typeof e.id !== 'string' || pieces.has(e.id) || !Object.hasOwn(KINDS, e.kind) || !byId.has(e.room)) return false;
    pieces.set(e.id, e);
  }
  const solids = [], standingOf = e => KINDS[e.kind].standing;
  for (const e of I.furniture) {
    const room = byId.get(e.room), standing = standingOf(e);
    if (standing === 'solid' || standing === 'walk-over') {
      const f = footprint(e);
      if (!f || !within(f, room)) return false;   // 2
      if (standing === 'solid') solids.push({e, f, floor: room.floor});
    } else if (standing === 'wall-hung') {
      if (!wallHungFits(I, e, room)) return false;   // 5
    } else if (e.on !== 'mantel' && !(pieces.has(e.on) && ['solid', 'wall-hung'].includes(standingOf(pieces.get(e.on))))) return false;   // 6
  }
  const stair = {a: I.stair.a, d: I.stair.d}, fp = I.fireplace;
  const mouth = fp && {a: [fp.a + fp.breast.depth, fp.a + fp.breast.depth + .6], d: [fp.d - fp.mouth.width / 2, fp.d + fp.mouth.width / 2]};
  for (const [k, {e, f, floor}] of solids.entries()) {   // 3, 4
    if (solids.some((o, j) => j > k && o.floor === floor && overlaps(o.f, f))) return false;
    if (I.breasts.some(b => b.floor === floor && overlaps(b, f))) return false;
    if (I.openings.some(o => o.floor === floor && overlaps(f, o.line === 'a' ? {a: [o.at - .5, o.at + .5], d: o.span} : {a: o.span, d: [o.at - .5, o.at + .5]}))) return false;
    if (e.kind === 'newel' ? !newelAtFoot(I, e) : overlaps(f, stair)) return false;
    if (floor === 0 && inSweep(I, f)) return false;
    if (I.fittings.some(l => l.kind === 'wall' && byId.get(l.room) && byId.get(l.room).floor === floor && holds(f, l.at))) return false;
    if (floor === 0 && mouth && overlaps(f, mouth)) return false;
  }
  const {hearth, casement, bookshelf, speed} = I.spots, from = I.entry.position, foot = stairFoot(I);   // 7
  const near = flood(I, 0, from);
  if (!near || !I.openings.filter(o => o.floor === 0).every(o => near(doorway(I, o)))) return false;
  if (![hearth, casement, bookshelf, ...speed, foot].every(p => reachable(I, 0, from, p))) return false;
  const hallAndLiving = furnishedWay(I);
  return wideTargets(I).every(p => reachable(hallAndLiving, 0, from, p, WIDE_CLEAR));   // 8
}

// Rule 8's walk is through the furnished rooms: the ground floor cut down to the hall and the living room, with the openings out of them
// (so each doorway point is still standable but the way does not go round through the kitchen or the dining room).
const FURNISHED = ['hall', 'living'];
export const furnishedWay = I => ({...I, rooms: I.rooms.filter(r => r.floor !== 0 || FURNISHED.includes(r.id)),
  openings: I.openings.filter(o => o.floor !== 0 || o.rooms.some(id => FURNISHED.includes(id)))});
// What a walker 0.9 m wide must reach from the arrival spot: each hall opening's doorway point, the living-kitchen one and the stair foot.
export const wideTargets = I => [...I.openings.filter(o => o.floor === 0 && (o.rooms.includes('hall') || o.rooms.includes('living') && o.rooms.includes('kitchen')))
  .map(doorwayPoint), stairFoot(I)];

// A hung piece lies on one of its room's wall lines, within the room along it, and clear of that line's openings and windows and of wall lamps.
function wallHungFits(I, e, room) {
  const across = e.wall, along = across === 'a' ? 'd' : 'a';
  if (!(across === 'a' || across === 'd') || !room[across].includes(e.line) || !Array.isArray(e.along) || !(e.along[0] < e.along[1]) || typeof e.z !== 'number') return false;
  if (e.along[0] < room[along][0] - EPS || e.along[1] > room[along][1] + EPS) return false;
  const apart = (lo, hi) => e.along[1] <= lo + EPS || e.along[0] >= hi - EPS;
  if (I.openings.some(o => o.floor === room.floor && o.line === across && o.at === e.line && !apart(...o.span))) return false;
  const wallLine = w => w.wall === 'front' ? 0 : w.wall === 'back' ? I.size[1] : null;
  if (across === 'd' && I.windows.some(w => w.kind === 'wall' && I.rooms.some(r => r.id === w.room && r.floor === room.floor) && wallLine(w) === e.line
    && !apart(w.a - w.width / 2, w.a + w.width / 2))) return false;
  return !I.fittings.some(l => {
    const r = I.rooms.find(x => x.id === l.room);
    if (l.kind !== 'wall' || !r || r.floor !== room.floor) return false;
    const p = {a: l.at[0], d: l.at[1]}, off = p[along] < e.along[0] ? e.along[0] - p[along] : p[along] > e.along[1] ? p[along] - e.along[1] : 0;
    return Math.hypot(p[across] - e.line, off) <= .3 + EPS;
  });
}

// A flood over a 0.1 m grid of that floor's standable points from `start`, keeping `clear` off walls and obstacles: null when the start itself
// is not standable, else a test of whether any reached point satisfies `fn`, with `.reaches(p)` for whether the grid point nearest p was reached.
// A deep-frozen blueprint's floods are remembered, since they cannot change.
// (This relies on the blueprint being deep-frozen: a top-level-only freeze with mutable rooms would give stale floods.)
const floods = new WeakMap();
const fixed = I => Object.isFrozen(I) && [I.obstacles, I.rooms, I.openings, I.stair, I.doorLeaf].every(v => v == null || Object.isFrozen(v));
function flood(I, floor, start, clear = I.eyeClear) {
  const key = `${floor}|${start}|${clear}`, memo = fixed(I) ? floods.get(I) || floods.set(I, new Map()).get(I) : null;
  if (memo && memo.has(key)) return memo.get(key);
  const N = 10, nA = I.size[0] * N, nD = I.size[1] * N, id = (i, j) => i * (nD + 1) + j;
  const at = (i, j) => [i / N, j / N], ok = (i, j) => i >= 0 && j >= 0 && i <= nA && j <= nD && floorArea(I, floor, at(i, j), clear);
  const i0 = Math.round(start[0] * N), j0 = Math.round(start[1] * N);
  let hit = null;
  if (ok(i0, j0)) {
    const reached = new Uint8Array((nA + 1) * (nD + 1)), todo = [[i0, j0]];
    reached[id(i0, j0)] = 1;
    while (todo.length) {
      const [i, j] = todo.pop();
      for (const [x, y] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (x >= 0 && y >= 0 && x <= nA && y <= nD && !reached[id(x, y)] && ok(x, y)) { reached[id(x, y)] = 1; todo.push([x, y]); }
    }
    hit = fn => { for (let k = 0; k < reached.length; k++) if (reached[k] && fn(at(Math.floor(k / (nD + 1)), k % (nD + 1)))) return true; return false; };
    hit.reaches = ([a, d]) => { const i = Math.round(a * N), j = Math.round(d * N); return i >= 0 && j >= 0 && i <= nA && j <= nD && reached[id(i, j)] === 1; };
  }
  if (memo) memo.set(key, hit);
  return hit;
}

// Whether `to` is standable and can be walked to from `from` on that floor, keeping `clear` off walls and obstacles (0.45 is a 0.9 m walker).
export function reachable(I, floor, from, to, clear = I.eyeClear) {
  if (!floorArea(I, floor, to, clear)) return false;
  const hit = flood(I, floor, from, clear);
  return !!hit && hit.reaches(to);
}
// The middle of an opening, on its wall line.
export const doorwayPoint = o => { const mid = (o.span[0] + o.span[1]) / 2; return o.line === 'a' ? [o.at, mid] : [mid, o.at]; };
// The point a step in front of the flight's foot, midway across its walkable strip.
export const stairFoot = I => [(I.stair.a[0] + I.stair.a[1] - I.wall / 2) / 2, I.stair.d[0] - .1];

const doorway = (I, o) => ([a, d]) => {
  const [across, along] = o.line === 'a' ? [a, d] : [d, a];
  return Math.abs(across - o.at) <= I.wall / 2 && along >= o.span[0] && along <= o.span[1];
};

// With the open leaf in place the entry spot is still standable and joins every ground-floor opening of the hall and the stair foot.
function leafLeavesWayOpen(I) {
  const hit = flood(I, 0, I.entry.position);
  if (!hit) return false;
  const [d0] = I.stair.d, foot = ([a, d]) => a >= I.stair.a[0] + I.eyeClear && a <= I.stair.a[1] - I.wall / 2 - I.eyeClear && d < d0 && d > d0 - .15;
  return I.openings.filter(o => o.floor === 0 && o.rooms.includes('hall')).every(o => hit(doorway(I, o))) && hit(foot);
}

const EPS = 1e-9;   // rounding slack for points sitting exactly on a boundary value (11 - 9.6 is not exactly 1.4)

// Inside the flight's walkable strip: the stair's width less half a wall and the eye's clearance on the wall side, its run in full.
export const onStair = (I, [a, d]) => a >= I.stair.a[0] + I.eyeClear - EPS && a <= I.stair.a[1] - I.wall / 2 - I.eyeClear + EPS
  && d >= I.stair.d[0] - EPS && d <= I.stair.d[1] + EPS;

// Standable floor of that storey: a room less the clearance (the eye's, unless given) from its lines, or an opening's passage; the stair's shut-off
// box, the open door leaf (ground floor) and the obstacles' rectangles with the clearance around them excluded.
export function floorArea(I, floor, [a, d], clear = I.eyeClear) {
  const c = I.wall / 2 + clear, [d0, d1] = I.stair.d, leaf = I.doorLeaf;
  if (floor === 0 && leaf && Math.hypot(a - leaf.a, d - Math.min(Math.max(d, leaf.d[0]), leaf.d[1])) <= leaf.thick / 2 + clear + EPS) return false;   // the open door leaf
  if (I.obstacles && I.obstacles.some(o => o.floor === floor && Math.hypot(a - Math.min(Math.max(a, o.a[0]), o.a[1]), d - Math.min(Math.max(d, o.d[0]), o.d[1])) <= clear + EPS)) return false;   // a chimney breast or a solid piece
  if (a >= I.stair.a[0] - clear - EPS && a <= I.stair.a[1] + EPS && (floor === 0 ? d >= d0 - EPS && d <= d1 + clear + EPS : d >= d0 - clear - EPS && d <= d1 + EPS)) return false;
  if (I.rooms.some(r => r.floor === floor && a >= r.a[0] + c - EPS && a <= r.a[1] - c + EPS && d >= r.d[0] + c - EPS && d <= r.d[1] - c + EPS)) return true;
  return I.openings.some(o => {
    const [across, along] = o.line === 'a' ? [a, d] : [d, a];
    return o.floor === floor && Math.abs(across - o.at) <= c + EPS && along >= o.span[0] + clear - EPS && along <= o.span[1] - clear + EPS;
  });
}

// The floor a step from a pose ends on: the stair is left at the end it reaches, and is not left through its side.
const targetFloor = (I, from, to) => !onStair(I, from.position) ? from.floor : to[1] < I.stair.d[0] ? 0 : to[1] > I.stair.d[1] ? 1 : null;

// The one rule for moving indoors; `from` is {floor, position}, `to` the wanted [a, d].
export function canStep(I, from, to) {
  if (onStair(I, to)) return onStair(I, from.position) || (from.floor === 0 && from.position[1] < I.stair.d[0]) || (from.floor === 1 && from.position[1] > I.stair.d[1]);
  const floor = targetFloor(I, from, to);
  return floor !== null && floorArea(I, floor, to);
}

// The floor (0 or 1) the visitor is on after a permitted step.
export const floorAfter = (I, from, to) => onStair(I, to) ? from.floor : targetFloor(I, from, to);

// Metres above the ground floor at that point: along the flight on the stair, else the floor's own level.
export const indoorHeight = (I, floor, p) => onStair(I, p) ? I.floorRise * (p[1] - I.stair.d[0]) / (I.stair.d[1] - I.stair.d[0]) : floor * I.floorRise;

// Every wall line of that storey (outer walls and each shared room line) cut into solid runs and opening runs.
export function wallSegments(I, floor) {
  const lines = new Map(), rooms = I.rooms.filter(r => r.floor === floor);
  for (const r of rooms) for (const [axis, along] of [['a', 'd'], ['d', 'a']]) for (const at of r[axis]) {
    const key = `${axis}${at}`;
    if (!lines.has(key)) lines.set(key, {axis, at, edges: [], cuts: new Set()});
    const line = lines.get(key);
    line.edges.push(r[along]); r[along].forEach(v => line.cuts.add(v));
  }
  const segs = [];
  for (const {axis, at, edges, cuts} of lines.values()) {
    const ops = I.openings.filter(o => o.floor === floor && o.line === axis && o.at === at);
    for (const o of ops) o.span.forEach(v => cuts.add(v));
    const pts = [...cuts].sort((x, y) => x - y);
    for (let i = 1; i < pts.length; i++) {
      const [lo, hi] = [pts[i - 1], pts[i]], mid = (lo + hi) / 2;
      if (!edges.some(([x, y]) => x <= mid && mid <= y)) continue;
      const op = ops.find(o => o.span[0] <= mid && mid <= o.span[1]) || null, last = segs[segs.length - 1];
      const [from, to] = axis === 'a' ? [[at, lo], [at, hi]] : [[lo, at], [hi, at]];
      if (!op && last && !last.opening && last.axis === axis && last.at === at && last.hi === lo) { last.hi = hi; last.to = to; }
      else segs.push({from, to, solid: !op, opening: op && op.id, axis, at, hi});
    }
  }
  return segs.map(({from, to, solid, opening}) => ({from, to, solid, opening}));
}
