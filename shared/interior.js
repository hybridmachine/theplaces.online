// The rules that say a cabin interior is valid, and the plain questions asked of it. Pure: no three.js.
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
  const hall = byId.get('hall'), [a, d] = I.entry.position;
  return !!hall && inside(hall, [a, d]) && a >= hall.a[0] + I.wall / 2 + I.eyeClear && d >= hall.d[0] + I.wall / 2 + I.eyeClear;
}

const EPS = 1e-9;   // rounding slack for points sitting exactly on a boundary value (11 - 9.6 is not exactly 1.4)

// Inside the flight's walkable strip: the stair's width less half a wall and the eye's clearance on the wall side, its run in full.
export const onStair = (I, [a, d]) => a >= I.stair.a[0] + I.eyeClear - EPS && a <= I.stair.a[1] - I.wall / 2 - I.eyeClear + EPS
  && d >= I.stair.d[0] - EPS && d <= I.stair.d[1] + EPS;

// Standable floor of that storey: a room less the eye's clearance from its lines, or an opening's passage; the stair's shut-off box excluded.
export function floorArea(I, floor, [a, d]) {
  const c = I.wall / 2 + I.eyeClear, [d0, d1] = I.stair.d;
  if (a >= I.stair.a[0] - I.eyeClear - EPS && a <= I.stair.a[1] + EPS && (floor === 0 ? d >= d0 - EPS && d <= d1 + I.eyeClear + EPS : d >= d0 - I.eyeClear - EPS && d <= d1 + EPS)) return false;
  if (I.rooms.some(r => r.floor === floor && a >= r.a[0] + c - EPS && a <= r.a[1] - c + EPS && d >= r.d[0] + c - EPS && d <= r.d[1] - c + EPS)) return true;
  return I.openings.some(o => {
    const [across, along] = o.line === 'a' ? [a, d] : [d, a];
    return o.floor === floor && Math.abs(across - o.at) <= c + EPS && along >= o.span[0] + I.eyeClear - EPS && along <= o.span[1] - I.eyeClear + EPS;
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
