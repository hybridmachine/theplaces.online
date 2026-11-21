// The light each point of the cabin's interior takes, worked out once from the blueprint: how much daylight, lamp light and firelight
// reaches a surface point. Painted into the surfaces' colours, so no light source exists in the scene. Pure: no three.js.
import {roomAt} from './interior.js';
import {crossing, hidingRuns} from './window-views.js';
import {sampleCottage, cottageFixture, validCottageState} from './cottage.js';
import {pathLightLevel} from './path-lights.js';
import {overcast} from './sky.js';

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

// The dials: what a frame's light is made of, from the shared world's state and clock alone. Colours are linear; times are world milliseconds.
// `floor` is the least brightness any standable spot takes: at midnight with every lamp out, the night fill's blue channel alone provides it.
export const DIALS = deep({fill: [.10, .13, .22], warm: [1, .71, .38], fireWarm: [1, .55, .22], day: 1.15, lamp: 1.1, fire: .9, night: .35, hallLow: .35,
  fade: 2000, delay: [5000, 90000], threshold: [.3, .9], fireRise: 20000, emberFall: 1800000, flicker: .06, floor: .07});

const clamp = x => Math.max(0, Math.min(1, x));
const ramp = (x, a, b) => clamp((x - a) / (b - a));
const smooth = (x, a, b) => { const t = ramp(x, a, b); return t * t * (3 - 2 * t); };
// A number in [0, 1) fixed by the seed, a room and a lane (integer hash, no state).
const seeded = (seed, index, lane) => { let h = Math.imul(seed | 0, 374761393) + Math.imul(index + 1, 668265263) + Math.imul(lane + 1, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const within = ([lo, hi], t) => lo + (hi - lo) * t;
const NIGHT_LAMP = ['hall', 'landing'];

// Each of the world's two lights as {on, at}: whether it is lit and when it last changed. A light that is off and was never changed since the
// world began (its change time is the cottage's introduction) was never lit, so its time is -Infinity. An unreadable state is both off long ago.
export function houseLights(cottage) {
  const off = {on: false, at: -Infinity};
  if (!validCottageState(cottage)) return {main: off, second: off};
  const read = k => { const on = cottage.rooms[k], at = cottage.lastLightAt[k]; return {on, at: !on && at === cottage.introducedAt ? -Infinity : at}; };
  return {main: read('main'), second: read('second')};
}

// One level 0–1 per room, in `interior.rooms` order. `dark` is the path lights' level, `pose` the world's lights sampled, `lights` from houseLights.
export function roomLamps(interior, {dark, pose, lights, now, settled = false}) {
  const seed = interior.lightSeed, low = DIALS.hallLow;
  // A room follows each light on its own, after its delay: up over the fade once the light is on, down once it is off. It takes the greater.
  // No follow is cut short, since the cottage never changes one light again inside the delay and fade (see the test on LIGHT_REST_MS).
  const follow = (l, delay) => { const k = settled ? 1 : smooth(now - l.at - delay, 0, DIALS.fade); return l.on ? k : 1 - k; };
  return interior.rooms.map((room, i) => {
    if (room.id === 'living') return pose ? pose.main : 0;
    if (room.id === 'study') return pose ? pose.second : 0;
    const delay = NIGHT_LAMP.includes(room.id) ? 0 : within(DIALS.delay, seeded(seed, i, 0));
    const wake = Math.max(follow(lights.main, delay), follow(lights.second, delay));
    if (NIGHT_LAMP.includes(room.id)) return clamp(dark) * (low + (1 - low) * wake);
    const at = within(DIALS.threshold, seeded(seed, i, 1));
    return smooth(dark, at, at + .1) * wake;
  });
}

// The fire rises linearly while it burns; its embers glow while it does and die away after it goes out. Unreadable is cold.
export function fireLevel(hearth, now, {settled = false} = {}) {
  if (!hearth || typeof hearth.on !== 'boolean' || !Number.isFinite(now)) return {fire: 0, embers: 0};
  if (hearth.on) return {fire: settled ? 1 : ramp(now - hearth.since, 0, DIALS.fireRise), embers: 1};
  const end = hearth.lastBurn?.end;
  return {fire: 0, embers: Number.isFinite(end) ? 1 - ramp(now - end, 0, DIALS.emberFall) : 0};
}

// Near 1: three slow sines of the world's seconds, so every visitor sees the same flame. Steady under reduced motion.
export const flicker = (seconds, motion) => motion ? 1 + DIALS.flicker * (Math.sin(seconds * 7.3) + Math.sin(seconds * 11.9 + 1.7) + Math.sin(seconds * 3.1 + 4.2)) / 3 : 1;

const finite = (v, or = 0) => Number.isFinite(v) ? v : or;
const toLinear = rgb => rgb.map(v => Math.max(0, finite(v)) ** 2.2);
const colour = (c, i) => finite(c?.[i]);

// The frame's dials. A `study` fixes the lights to its fixture, every fade finished, and the fire lit in the night and dusk studies; the
// calendar and weather given are then the study's own. Anything missing or unreadable falls back to no daylight, no cloud, a dark sky and
// no fire, so a frame never throws and never carries a number that is not finite.
export function interiorDials({interior, calendar, weather, sky, cottage, pose, now, seconds, motion, study}) {
  const light = clamp(finite(calendar?.light)), dark = pathLightLevel(calendar), time = finite(now, 0);
  const mean = toLinear([0, 1, 2].map(i => (colour(sky?.zenith, i) + colour(sky?.horizon, i)) / 2)), top = Math.max(...mean) || 1;
  const strength = DIALS.day * light * (1 - .35 * overcast({cloud: finite(weather?.cloud)}));
  const fill = DIALS.fill.map(v => v * DIALS.night * Math.max(1 - .7 * light, .3));
  let lit = pose, lights = houseLights(cottage), settled = false, flame = fireLevel(cottage?.hearth, now);
  if (study) {
    lit = cottageFixture(study); settled = true; lights = {main: {on: lit.main > 0, at: -Infinity}, second: {on: lit.second > 0, at: -Infinity}};
    flame = study === 'night' || study === 'dusk' ? {fire: 1, embers: 1} : {fire: 0, embers: 0};
  }
  const levels = roomLamps(interior, {dark, pose: lit, lights, now: time, settled});
  const hall = levels[interior.rooms.findIndex(r => r.id === 'hall')];
  return {day: mean.map(v => v / top * strength), fill, lamps: levels.map(v => v * DIALS.lamp),
    fire: flame.fire * DIALS.fire * flicker(finite(seconds), motion), embers: flame.embers, doorway: hall};
}

// The light a point shows: the sum the shader computes from the same dials and weights.
export function lightAt(field, dials, floor, point, normal) {
  const w = field.weigh(floor, point, normal), lamp = w.room >= 0 ? dials.lamps[w.room] * w.lamp : 0;
  return [0, 1, 2].map(i => dials.day[i] * w.day + dials.fill[i] + DIALS.warm[i] * lamp + DIALS.fireWarm[i] * dials.fire * w.fire);
}
