export {DEG} from './celestial.js';

const fin = v => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

// Signed metres from the shoreline, positive inland (the left of the line as listed).
export function shoreDistance(space, x, y) {
  const s = space.shoreline, p = [x, y]; let best = Infinity, side = 1;
  for (let i = 0; i < s.length - 1; i++) {
    const d = segDist(p, s[i], s[i + 1]);
    if (d < best) { best = d; side = (s[i + 1][0] - s[i][0]) * (y - s[i][1]) - (s[i + 1][1] - s[i][1]) * (x - s[i][0]) >= 0 ? 1 : -1; }
  }
  return side * best;
}
export function terrainHeight(space, x, y) {
  const d = shoreDistance(space, x, y);
  return d < 0 ? .2 * d : Math.min(.2 * d, 2.4 + .02 * (d - 12));
}
const insidePoly = (poly, [x, y]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const wallDistance = (space, p) => {
  const w = space.wall; let d = Infinity;
  for (let i = 0; i < w.length; i++) d = Math.min(d, segDist(p, w[i], w[(i + 1) % w.length]));
  return insidePoly(w, p) ? d : -d;
};
const inCollider = (c, [x, y]) => {
  const dx = x - c.center[0], dy = y - c.center[1];
  if (c.type === 'circle') return Math.hypot(dx, dy) <= c.radius;
  const s = Math.sin(c.yaw), k = Math.cos(c.yaw);
  return Math.abs(dx * s + dy * k) <= c.half[0] && Math.abs(dx * k - dy * s) <= c.half[1];
};
export const walkable = (space, p) => fin(p) && insidePoly(space.wall, p) &&
  terrainHeight(space, p[0], p[1]) >= space.waterEdge && !space.colliders.some(c => inCollider(c, p));
// Metres to the nearer of the wall and the water's edge; negative when outside. Colliders are not part of it.
export const edgeDistance = (space, p) =>
  Math.min(wallDistance(space, p), shoreDistance(space, p[0], p[1]) - space.waterEdge / .2);

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const segsTouch = (a, b, c, d) => {
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p, q, r) => cross(p, q, r) === 0 && Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
};
export function validSpace(space) {
  if (!space || space.version !== 1) return false;
  const nums = v => Array.isArray(v) ? v.every(nums) : typeof v === 'object' && v ? Object.values(v).every(nums) : typeof v !== 'number' || Number.isFinite(v);
  if (!nums(space)) return false;
  const w = space.wall;
  if (!Array.isArray(w) || w.length < 3 || !w.every(fin) || !Array.isArray(space.shoreline) || space.shoreline.length < 2 || !space.shoreline.every(fin)) return false;
  for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) {
    if (j === i + 1 || (i === 0 && j === w.length - 1)) continue;
    if (segsTouch(w[i], w[(i + 1) % w.length], w[j], w[(j + 1) % w.length])) return false;
  }
  return walkable(space, space.arrival.position);
}
