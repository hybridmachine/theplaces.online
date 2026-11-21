// The light each point of the cabin's interior takes, worked out once from the blueprint: how much daylight, lamp light and firelight
// reaches a surface point. Painted into the surfaces' colours, so no light source exists in the scene. Pure: no three.js.
import {roomAt} from './interior.js';
import {crossing, hidingRuns} from './window-views.js';

const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;
// Starting values, tuned by eye. Reaches are metres at which a source's share has fallen to a tenth; `borrow` is the share of a
// neighbour's daylight a windowless point takes through an opening, `door` the front door's strength against a window's, `floor` the least.
export const LIGHT = deep({day: {reach: 6, borrow: .35, door: .5, floor: .12}, lamp: {reach: 5, floor: .15}, fire: {reach: 6}});

const UP = [0, 0, 1], OFF = .02, SHORT = .05;   // metres a sight line starts off the surface and stops short of its target
const falloff = (dist, reach) => 1 / (1 + (dist / reach * 3) ** 2);
const toward = (p, q) => { const v = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], d = Math.hypot(...v); return {d, u: d > 1e-9 ? v.map(x => x / d) : [0, 0, 0]}; };
const along = (n, u) => Math.max(0, n[0] * u[0] + n[1] * u[1] + n[2] * u[2]);

export function createLightField(interior, openings) {
  const I = interior, ids = new Map(I.rooms.map((r, i) => [r.id, i]));
  // What does not depend on the point, kept per floor: the runs that block light (the flight's open side does not), the panes with
  // their three targets (centre and quarter points across), the fittings by room, the fire's mouth, and each room's openings.
  const runs = [0, 1].map(f => hidingRuns(I, f).filter(r => !r.flight));
  const panes = [0, 1].map(f => openings.filter(o => o.floor === f).map(o => ({o, targets: [-.5, 0, .5].map(s => o.centre.map((c, i) => c + s * o.half[0] * o.across[i]))})));
  const lamps = new Map(I.fittings.map(f => [f.room, f.at]));
  const {fireplace: fp} = I, mouth = [fp.breast.depth, fp.d, fp.mouth.height / 2];
  const hasPane = (floor, id) => panes[floor].some(({o}) => o.room === id);
  const gaps = I.rooms.map(r => I.openings.filter(op => op.floor === r.floor && op.rooms.includes(r.id)).map(op => {
    const m = (op.span[0] + op.span[1]) / 2, other = op.rooms.find(x => x !== r.id), oth = I.rooms[ids.get(other)];
    const into = op.line === 'a' ? [op.at + (oth.a[0] >= op.at ? OFF : -OFF), m] : [m, op.at + (oth.d[0] >= op.at ? OFF : -OFF)];
    return {floor: r.floor, other, mid: op.line === 'a' ? [op.at, m] : [m, op.at], into, share: null};
  }).filter(g => hasPane(g.floor, g.other)));

  // Whether the plan line from `p` to `q` on that floor crosses no solid interior wall run, stopping SHORT before q.
  const clear = (floor, p, q) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), k = len > SHORT ? 1 - SHORT / len : 0, end = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    return !runs[floor].some(r => crossing(p, end, r) !== null);
  };
  // Daylight from the panes alone (no borrowing, no floor) and whether any pane is in sight.
  const direct = (floor, point, n, roomId) => {
    const from = [point[0] + n[0] * OFF, point[1] + n[1] * OFF];
    let sum = 0, seen = false;
    for (const {o, targets} of panes[floor]) {
      if (o.kind === 'door' && roomId !== 'hall') continue;
      let best = null;
      for (const t of targets) if (clear(floor, from, t)) { const v = toward(point, t); if (!best || v.d < best.d) best = v; }
      if (!best) continue;
      seen = true;
      sum += (along(n, best.u) * .7 + .3) * falloff(best.d, LIGHT.day.reach) * (o.kind === 'door' ? LIGHT.day.door : 1);
    }
    return {seen, sum: Math.min(1, sum)};
  };
  const gapShare = (g) => g.share ??= Math.max(LIGHT.day.floor, direct(g.floor, [g.into[0], g.into[1], g.floor * I.floorRise + 1.5], UP, g.other).sum);

  function weigh(floor, point, normal) {
    const at = roomAt(I, floor, [point[0] + normal[0] * SHORT, point[1] + normal[1] * SHORT]), index = at ? ids.get(at.id) : -1, id = at && at.id;
    // day
    const d = direct(floor, point, normal, id);
    let dayW = d.sum;
    if (!d.seen && at) {
      let near = null, nearD = Infinity;
      for (const g of gaps[index]) { const dd = Math.hypot(g.mid[0] - point[0], g.mid[1] - point[1]); if (dd < nearD) { near = g; nearD = dd; } }
      dayW = near ? LIGHT.day.borrow * gapShare(near) : 0;
    }
    dayW = Math.max(LIGHT.day.floor, dayW);
    // lamp: the room's own fitting only
    let lamp = 0;
    if (at && lamps.has(id)) {
      const v = toward(point, lamps.get(id));
      lamp = Math.max(LIGHT.lamp.floor, (along(normal, v.u) * .6 + .4) * falloff(v.d, LIGHT.lamp.reach));
    }
    // fire: ground floor only, and only where the mouth is in sight
    let fire = 0;
    if (floor === 0 && clear(0, [point[0] + normal[0] * OFF, point[1] + normal[1] * OFF], mouth)) {
      const v = toward(point, mouth);
      fire = (along(normal, v.u) * .7 + .3) * falloff(v.d, LIGHT.fire.reach);
    }
    return {day: Math.min(1, dayW), lamp: Math.min(1, lamp), fire: Math.min(1, fire), room: index};
  }
  return {weigh, roomIndex: id => ids.has(id) ? ids.get(id) : -1};
}
