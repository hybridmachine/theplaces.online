// Where each of the cabin's openings looks out from, and how a point in the interior frame is carried into the yard. Pure: no three.js.
// The carry is a turn about the vertical plus a shift, never a tilt or a scale: the pane's centre goes to its anchor in the yard.
import {ceilingHeight} from './interior.js';
import {cabinFrame, openingCentre} from './lakeside-dressing.js';

const norm = ([x, y, z]) => { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; };
const WALL_ANCHOR = {living: 'window-front-left', study: 'window-front-right', dining: 'window-back', door: 'door'};
const ROOF_ANCHOR = .05;   // metres the roof panes' anchors stand above the slates

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
    const front = w.id !== 'sky-room', along = w.id === 'bedroom-3' ? f.L : -f.L, b = (front ? 1 : -1) * f.front * f.W;
    return make(w.id, 'roof', 1, w.room, [w.a, dMid, I.floorRise + ceilingHeight(I, 1, dMid) + I.roofReveal], [1, 0, 0],
      norm([0, Math.sign(g), Math.abs(g)]), norm([0, -g, 1]), [w.width / 2, (w.d[1] - w.d[0]) / 2 * Math.hypot(1, g)],
      f.at(along, b, f.roofZ(along, b) + ROOF_ANCHOR));
  });
  const door = make('door', 'door', 0, 'hall', [I.door.a, -I.wall / 2, I.doorHead / 2], [1, 0, 0], [0, 0, 1], [0, -1, 0],
    [I.door.width / 2, I.doorHead / 2], openingCentre(space, dressing, 'door'));
  const order = ['living', 'study', 'dining', 'bedroom-2', 'bedroom-3', 'sky-room'];
  return Object.freeze([...order.map(id => list.find(o => o.id === id)), door]);
}

// A direction in the interior frame, as a direction in the yard.
export const carryDirection = (o, v) => turned(o, v);
// A point in the interior frame, in the yard: its offset from the pane's centre, turned, from the anchor.
export const carry = (o, p) => { const r = turned(o, [p[0] - o.centre[0], p[1] - o.centre[1], p[2] - o.centre[2]]); return [o.anchor[0] + r[0], o.anchor[1] + r[1], o.anchor[2] + r[2]]; };
// The plane of the pane in the yard; things with (p − point) · normal < 0 are not drawn.
export const cutPlane = o => ({point: [...o.anchor], normal: carryDirection(o, o.outward)});
