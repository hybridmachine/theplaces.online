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
