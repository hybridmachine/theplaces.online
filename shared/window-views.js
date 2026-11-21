// Where each of the cabin's openings looks out from, and how a point in the interior frame is carried into the yard. Pure: no three.js.
// The carry is a turn about the vertical plus a shift, never a tilt or a scale: the pane's centre goes to its anchor in the yard.
import {ceilingHeight, roomAt, wallSegments} from './interior.js';
import {cabinFrame, openingCentre} from './lakeside-dressing.js';
import {terrainHeight} from './space.js';

const norm = ([x, y, z]) => { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; };
const WALL_ANCHOR = {living: 'window-front-left', study: 'window-front-right', dining: 'window-back', door: 'door'};
const ROOF_ANCHOR = .05;   // metres the roof panes' anchors stand above the slates
// The doorway's floor is carried this far above the highest ground just outside it (within DOOR_REACH of the wall, across the
// door's width), so no ground nearer than the doorway's plane is cut away there to show the sky beneath it.
const DOOR_CLEAR = .02, DOOR_REACH = .6;

// Rotate [a, d, z] about the vertical by `turn`, counter-clockwise seen from above (z is kept).
const turned = (o, [a, d, z]) => [a * Math.cos(o.turn) - d * Math.sin(o.turn), a * Math.sin(o.turn) + d * Math.cos(o.turn), z];

// The openings in the order living, study, dining, bedroom-2, bedroom-3, sky-room, door; frozen.
export function viewOpenings(I, space, dressing) {
  const f = cabinFrame(space, dressing);
  // One rule for every opening: interior `a` runs along the cabin's front face and `d` runs in from it, so the turn takes
  // interior (a, d) to (front·u, −front·v), which keeps the handedness and puts the front wall's outward on front·v.
  const turn = Math.atan2(f.front * f.u[1], f.front * f.u[0]);
  const make = (id, kind, floor, room, centre, across, up, outward, half, anchor) =>
    Object.freeze({id, kind, floor, room, centre, across, up, outward, half, anchor, turn});
  const list = I.windows.map(w => {
    if (w.kind === 'wall') {
      const d = w.wall === 'front' ? -I.wall / 2 : 12 + I.wall / 2;
      return make(w.id, 'wall', 0, w.room, [w.a, d, w.sill + w.height / 2], [1, 0, 0], [0, 0, 1], [0, w.wall === 'front' ? -1 : 1, 0],
        [w.width / 2, w.height / 2], openingCentre(space, dressing, WALL_ANCHOR[w.id]));
    }
    const dMid = (w.d[0] + w.d[1]) / 2, g = (ceilingHeight(I, 1, dMid + .01) - ceilingHeight(I, 1, dMid - .01)) / .02;   // slope dz/dd
    const front = w.id !== 'sky-room', along = w.id === 'bedroom-3' ? f.L / 2 : -f.L / 2, b = (front ? 1 : -1) * f.front * f.W / 2;
    return make(w.id, 'roof', 1, w.room, [w.a, dMid, I.floorRise + ceilingHeight(I, 1, dMid) + I.roofReveal], [1, 0, 0],
      norm([0, Math.sign(g), Math.abs(g)]), norm([0, -g, 1]), [w.width / 2, (w.d[1] - w.d[0]) / 2 * Math.hypot(1, g)],
      f.at(along, b, f.roofZ(along, b) + ROOF_ANCHOR));
  });
  // The door: along and across the wall at its panel's middle, but at the height that sets the doorway's floor just above the
  // ground outside it (that ground rises a little above the cabin's threshold).
  const panel = openingCentre(space, dressing, 'door'), out = turned({turn}, [0, -1, 0]), side = turned({turn}, [1, 0, 0]);
  let ground = -Infinity;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 3; j++) {
    const s = (i / 4 - .5) * I.door.width, t = j / 3 * DOOR_REACH;
    ground = Math.max(ground, terrainHeight(space, panel[0] + s * side[0] + t * out[0], panel[1] + s * side[1] + t * out[1]));
  }
  const door = make('door', 'door', 0, 'hall', [I.door.a, -I.wall / 2, I.doorHead / 2], [1, 0, 0], [0, 0, 1], [0, -1, 0],
    [I.door.width / 2, I.doorHead / 2], [panel[0], panel[1], ground + DOOR_CLEAR + I.doorHead / 2]);
  const order = ['living', 'study', 'dining', 'bedroom-2', 'bedroom-3', 'sky-room'];
  return Object.freeze([...order.map(id => list.find(o => o.id === id)), door]);
}

// A direction in the interior frame, as a direction in the yard.
export const carryDirection = (o, v) => turned(o, v);
// A point in the interior frame, in the yard: its offset from the pane's centre, turned, from the anchor.
export const carry = (o, p) => { const r = turned(o, [p[0] - o.centre[0], p[1] - o.centre[1], p[2] - o.centre[2]]); return [o.anchor[0] + r[0], o.anchor[1] + r[1], o.anchor[2] + r[2]]; };
// The plane of the pane in the yard; things with (p − point) · normal < 0 are not drawn.
export const cutPlane = o => ({point: [...o.anchor], normal: carryDirection(o, o.outward)});

// How many openings may be live in one frame, by tier; the rest keep the shell's flat glass.
export const LIVE_CAP = Object.freeze({full: 3, light: 2, plain: 2});
const MIN_SHARE = .0005, NEAR = .05;   // NEAR: metres in front of the eye at which a pane is cut before it is projected

// The pane's bounding rectangle on screen, [x0, y0, x1, y1] in normalised device coordinates (−1 to 1, y up), as the camera of
// SpaceView sees it: yaw clockwise from +d seen from above, pitch up, `fov` vertical. The pane is first cut to the plane 0.05 m in
// front of the eye, so a pane the eye is partly past keeps only its visible part; the rectangle is clipped to the screen. Null
// when nothing of the pane is on screen.
export function screenRect(o, {eye, yaw, pitch, fov, aspect}) {
  const [sy, cy, sp, cp] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)];
  const fwd = [sy * cp, cy * cp, sp], right = [cy, -sy, 0], up = [-sy * sp, -cy * sp, cp], k = Math.tan(fov / 2);
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  // The pane's rectangle as a polygon of [x, y, depth] (right, up, forward of the eye), cut to the plane NEAR in front of the eye.
  const poly = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([s, t]) => {
    const r = o.centre.map((c, i) => c + s * o.half[0] * o.across[i] + t * o.half[1] * o.up[i] - eye[i]);
    return [dot(r, right), dot(r, up), dot(r, fwd)];
  }), kept = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % 4], pin = p[2] >= NEAR, qin = q[2] >= NEAR;
    if (pin) kept.push(p);
    if (pin !== qin) { const u = (NEAR - p[2]) / (q[2] - p[2]); kept.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, NEAR]); }
  });
  if (!kept.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y, depth] of kept) {
    const px = x / (depth * k * aspect), py = y / (depth * k);
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  const r = [Math.max(x0, -1), Math.max(y0, -1), Math.min(x1, 1), Math.min(y1, 1)];
  return r[2] > r[0] && r[3] > r[1] ? r : null;
}

// The share (0–1) of the screen the pane covers (its screenRect's area), 0 from the pane's outward side or off screen.
export function screenShare(o, view) {
  const {eye} = view;
  if ((eye[0] - o.centre[0]) * o.outward[0] + (eye[1] - o.centre[1]) * o.outward[1] + (eye[2] - o.centre[2]) * o.outward[2] >= 0) return 0;
  const r = screenRect(o, view);
  return r ? (r[2] - r[0]) * (r[3] - r[1]) / 4 : 0;
}

// The wall runs of a storey that can hide a pane: its solid runs, less the outer boundary (the pane sits in one of those), plus the
// stair's shut-off box on the ground floor (its chimney-side and top edges), which wallSegments does not list. The door leaf is no wall.
export function hidingRuns(I, floor) {
  const [w, h] = I.size, is = (x, y) => Math.abs(x - y) < 1e-6, outer = ({from: [a, d], to: [b, e]}) => (is(a, b) && (is(a, 0) || is(a, w))) || (is(d, e) && (is(d, 0) || is(d, h)));
  const runs = wallSegments(I, floor).filter(r => r.solid && !outer(r));
  // The flight's open side is plastered only up to its treads (`flight`: hides a line only where the line is below them, see
  // inSight); its top end is closed to the ceiling.
  if (floor === 0) runs.push({from: [I.stair.a[0], I.stair.d[0]], to: [I.stair.a[0], I.stair.d[1]], flight: true}, {from: [I.stair.a[0], I.stair.d[1]], to: [I.stair.a[1], I.stair.d[1]]});
  return runs;
}

// How far along a sight line (p to q, plan; 0 at p, 1 at q) it crosses a run, strictly inside both, or null; parallel lines never cross.
export function crossing(p, q, {from, to}) {
  const [rx, ry, sx, sy] = [q[0] - p[0], q[1] - p[1], to[0] - from[0], to[1] - from[1]], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const [ex, ey] = [from[0] - p[0], from[1] - p[1]], t = (ex * sy - ey * sx) / den, u = (ex * ry - ey * rx) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? t : null;
}

// Whether the 3D sight line from the eye to p passes between the floors only through the stairwell: where it crosses the ground
// floor's ceiling and the upper floor's level, both points lie inside the well's rectangle. A height the line does not reach (an eye
// on the flight, between the two) asks nothing of it.
function throughWell(I, eye, p) {
  return [I.groundCeiling, I.floorRise].every(h => {
    if ((eye[2] - h) * (p[2] - h) > 0) return true;
    const u = (h - eye[2]) / (p[2] - eye[2]), a = eye[0] + (p[0] - eye[0]) * u, d = eye[1] + (p[1] - eye[1]) * u;
    return a > I.stair.a[0] && a < I.stair.a[1] && d > I.stair.d[0] && d < I.stair.d[1];
  });
}

// Whether the eye ([a, d, z]) can see the pane. On the pane's own floor, past the interior walls: at least one plan sight line from
// the eye to one of the pane's targets (points spread across it) crosses no solid wall run of that floor, each line stopping 0.05 m
// short of the pane. The stair's open side hides a line only where the line, at its height there, is below the flight (taken as
// its smooth slope, the treads' lower edge: a line grazing the treads counts as seen, since a pane wrongly left flat is the worse error). A pane on the other floor is seen only up or down the stairwell: at least one 3D line from the eye to a target
// passes the floor between them inside the well (throughWell).
export function inSight(o, interior, state, eye) {
  // A 13 x 3 grid, thirteen evenly across +-0.98 of the width and three up it (foot, middle, head: the same in plan, apart for a
  // line up or down the well); a roof pane is a 5 x 3 grid, five across and three up its slope.
  const across = (n, k = .98) => Array.from({length: n}, (_, i) => (i / (n - 1) * 2 - 1) * k);
  const spread = across(o.kind === 'roof' ? 5 : 13).flatMap(s => [-.98, 0, .98].map(t => [s, t]));
  const targets = spread.map(([s, t]) => o.centre.map((c, i) => c + s * o.half[0] * o.across[i] + t * o.half[1] * o.up[i]));
  if (o.floor !== state.floor) return targets.some(p => throughWell(interior, eye, p));
  const runs = hidingRuns(interior, o.floor), plan = o.kind === 'roof' ? targets : targets.filter((_, i) => i % 3 === 1);   // a wall pane's middles
  const {d: [d0, d1]} = interior.stair, flightAt = d => interior.floorRise * (d - d0) / (d1 - d0);
  return plan.some(([x, y, z]) => {
    const len = Math.hypot(x - eye[0], y - eye[1]), k = len > .05 ? 1 - .05 / len : 0, end = [eye[0] + (x - eye[0]) * k, eye[1] + (y - eye[1]) * k];
    return !runs.some(r => {
      const t = crossing([eye[0], eye[1]], end, r);
      if (t === null) return false;
      return !r.flight || eye[2] + (z - eye[2]) * t * k <= flightAt(eye[1] + (end[1] - eye[1]) * t);
    });
  });
}

// Ids of the openings worth drawing live this frame, largest on screen first, at most `limit`. The stairwell joins the floors, so
// from the hall or landing the other floor's openings count too, where seen through the well (inSight); the door only while it
// stands open.
export function liveOpenings(openings, interior, state, view, {limit = 0, doorOpen = 0}) {
  const room = roomAt(interior, state.floor, state.position), joined = room && (room.id === 'hall' || room.id === 'landing');
  return openings
    .filter(o => (o.id !== 'door' || doorOpen > 0) && (o.floor === state.floor || joined) && inSight(o, interior, state, view.eye))
    .map(o => [o.id, screenShare(o, view)])
    .filter(([, s]) => s > MIN_SHARE)
    .sort((p, q) => q[1] - p[1])
    .slice(0, Math.max(0, limit))
    .map(([id]) => id);
}
