// The light each point of the cabin's interior takes, worked out once from the blueprint: how much daylight, lamp light and firelight
// reaches a surface point. Painted into the surfaces' colours, so no light source exists in the scene. Pure: no three.js.
import {roomAt} from './interior.js';
import {crossing, hidingRuns} from './window-views.js';
import {sampleCottage, cottageFixture, validCottageState} from './cottage.js';
import {pathLightLevel} from './path-lights.js';
import {overcast} from './sky.js';

const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;
// Tuned by eye against browser captures. Reaches are metres at which a source's share has fallen to a tenth. By day `face` is the share
// of a pane's light a surface takes whichever way it faces (the rest as it faces the pane: the room's walls hand the light about);
// `borrow` the share of a neighbour's daylight a point that sees no pane takes at the opening it comes through, falling off over
// `through` metres from it and, as through a pane, weighed by how squarely the point faces the opening (`aside` whichever way), the
// light taken as coming down through the opening from `behind` metres past its head; `hop` the share of the best a neighbour takes
// at its own openings that it passes on through one more; `cap` the most daylight any point takes, so that the light by the glass,
// strong enough to fill the room, clips only on the brightest brushwork. A lamp
// reaches the far walls of its own room (a wall 4 m off takes more than the floor), and `spill` of that through an opening into a
// joined room, never through a wall; the fire's `face` is the share of its light a
// surface takes whichever way it faces, so the wall beside the chimney breast, which sees the fire only edgewise, is warmed too; `door` the front door's strength against a window's; `floor` the least.
export const LIGHT = deep({day: {reach: 10, face: .4, borrow: .9, through: 14, aside: .2, door: .5, floor: .1, cap: .55, hop: .75, behind: 2}, lamp: {reach: 8, floor: .15, spill: .85}, fire: {reach: 6, face: .5}});

const UP = [0, 0, 1], OFF = .02, SHORT = .05;   // metres a sight line starts off the surface and stops short of its target
const falloff = (dist, reach) => 1 / (1 + (dist / reach * 3) ** 2);
const toward = (p, q) => { const v = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], d = Math.hypot(...v); return {d, u: d > 1e-9 ? v.map(x => x / d) : [0, 0, 0]}; };
const along = (n, u) => Math.max(0, n[0] * u[0] + n[1] * u[1] + n[2] * u[2]);

export function createLightField(interior, openings) {
  const I = interior, ids = new Map(I.rooms.map((r, i) => [r.id, i]));
  // What does not depend on the point, kept per floor: the runs that block light (the flight's open side does not), the panes with
  // their three targets (centre and quarter points across), the fittings by room, the fire's mouth, and each room's openings.
  const runs = [0, 1].map(f => hidingRuns(I, f).filter(r => !r.flight));
  // (Each target stands just inside the room, past the wall's thickness, so that no sight line slips to it through the outer wall
  // beside the end of an interior wall that meets it.)
  const inside = o => o.centre.map((c, i) => c - (I.wall + SHORT) * o.outward[i]);
  const panes = [0, 1].map(f => openings.filter(o => o.floor === f).map(o => ({o, targets: [-.5, 0, .5].map(s => inside(o).map((c, i) => c + s * o.half[0] * o.across[i]))})));
  const lamps = new Map(I.fittings.map(f => [f.room, f.at]));
  const {fireplace: fp} = I, mouth = [fp.breast.depth, fp.d, fp.mouth.height / 2];
  // Every opening of every room, as seen from that room: the neighbour beyond, its middle, a point just inside the neighbour and the
  // way across into it. (The front door lends its light to the hall alone, so a neighbour borrows only the hall's window light.)
  const gaps = I.rooms.map(r => I.openings.filter(op => op.floor === r.floor && op.rooms.includes(r.id)).map(op => {
    const m = (op.span[0] + op.span[1]) / 2, other = op.rooms.find(x => x !== r.id), oth = I.rooms[ids.get(other)];
    const into = op.line === 'a' ? [op.at + (oth.a[0] >= op.at ? OFF : -OFF), m] : [m, op.at + (oth.d[0] >= op.at ? OFF : -OFF)];
    const across = op.line === 'a' ? [Math.sign(into[0] - op.at), 0, 0] : [0, Math.sign(into[1] - op.at), 0];
    return {floor: r.floor, room: r.id, other, mid: op.line === 'a' ? [op.at, m] : [m, op.at], into, across, direct: null, share: null};
  }));

  // The rooms joined to each room by an opening (on its floor) that have a fitting, by index.
  const joined = I.rooms.map(r => [...new Set(I.openings.filter(op => op.floor === r.floor && op.rooms.includes(r.id)).map(op => op.rooms.find(x => x !== r.id)))]
    .filter(x => lamps.has(x)).map(x => ids.get(x)));
  // A lamp's light at a point: by how squarely the surface faces it and its distance.
  const lampWeight = (point, normal, q) => { const v = toward(point, q); return (along(normal, v.u) * .6 + .4) * falloff(v.d, LIGHT.lamp.reach); };
  // Whether the plan line from `p` to `q` on that floor crosses no solid interior wall run, stopping SHORT before q.
  const clear = (floor, p, q) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), k = len > SHORT ? 1 - SHORT / len : 0, end = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    return !runs[floor].some(r => crossing(p, end, r) !== null);
  };
  // Daylight from the panes alone (no borrowing, no floor).
  const direct = (floor, point, n, roomId) => {
    const from = [point[0] + n[0] * OFF, point[1] + n[1] * OFF];
    let sum = 0;
    for (const {o, targets} of panes[floor]) {
      if (o.kind === 'door' && roomId !== 'hall') continue;
      let best = null;
      for (const t of targets) if (clear(floor, from, t)) { const v = toward(point, t); if (!best || v.d < best.d) best = v; }
      if (!best) continue;
      sum += (along(n, best.u) * (1 - LIGHT.day.face) + LIGHT.day.face) * falloff(best.d, LIGHT.day.reach) * (o.kind === 'door' ? LIGHT.day.door : 1);
    }
    return Math.min(1, sum);
  };
  // The panes' daylight at an opening, 1.5 m up just inside the neighbour, as it reaches a surface there facing up or facing into the
  // neighbour (the way the light comes through), whichever takes more.
  const gapDirect = g => g.direct ??= Math.max(...[UP, g.across].map(n => direct(g.floor, [g.into[0], g.into[1], g.floor * I.floorRise + 1.5], n, null)));
  // Its share: that, or `hop` of the best share the neighbour takes at its other openings, whichever is more, so a room two or more
  // rooms from any pane still takes some, through the rooms between, a little less at each. The shares are settled together, once,
  // until none grows (each hop takes `hop` of the last, so this ends; a ring of rooms only hands the best on round it).
  const flat = gaps.flat();
  for (const g of flat) g.share = gapDirect(g);
  for (let grew = true, k = 0; grew && k < flat.length; k++) {
    grew = false;
    for (const g of flat) {
      const passed = LIGHT.day.hop * Math.max(0, ...gaps[ids.get(g.other)].filter(h => h.other !== g.room).map(h => h.share));
      if (passed > g.share + 1e-12) { g.share = passed; grew = true; }
    }
  }
  const gapShare = g => g.share;

  function weigh(floor, point, normal) {
    const at = roomAt(I, floor, [point[0] + normal[0] * SHORT, point[1] + normal[1] * SHORT]), index = at ? ids.get(at.id) : -1, id = at && at.id;
    // day: the panes in sight, or the share borrowed through the room's openings (each falling with distance from it) where the best
    // of those is more, as it is for a point that sees no pane or sees one only far off; and never less than the floor
    let dayW = direct(floor, point, normal, id);
    if (at) for (const g of gaps[index]) {
      const share = gapShare(g);
      if (!(share > 0)) continue;
      // falling with distance from the opening's middle; on what faces back the way the light comes, down through the opening from
      // `behind` metres beyond its head (so the floor and the far wall take it, and a jamb or head in the doorway, which looks across
      // it, takes little), and only `aside` of it on what does not
      const z = g.floor * I.floorRise, d = toward(point, [g.mid[0], g.mid[1], z + I.doorHead / 2]).d;
      const u = toward(point, [g.mid[0] + g.across[0] * LIGHT.day.behind, g.mid[1] + g.across[1] * LIGHT.day.behind, z + I.doorHead]).u;
      dayW = Math.max(dayW, LIGHT.day.borrow * share * (along(normal, u) * (1 - LIGHT.day.aside) + LIGHT.day.aside) * falloff(d, LIGHT.day.through));
    }
    dayW = Math.max(LIGHT.day.floor, dayW);
    // lamp: the room's own fitting, never less than the floor; and the spill of the stronger of the neighbours' fittings in plain
    // sight through an opening (the plan line to it crosses no solid wall), by the same rule times LIGHT.lamp.spill
    let lamp = 0, spill = 0, spillRoom = -1;
    if (at && lamps.has(id)) lamp = Math.max(LIGHT.lamp.floor, lampWeight(point, normal, lamps.get(id)));
    if (at) {
      const from = [point[0] + normal[0] * OFF, point[1] + normal[1] * OFF];
      for (const k of joined[index]) {
        const q = lamps.get(I.rooms[k].id);
        if (!clear(floor, from, q)) continue;
        const w = LIGHT.lamp.spill * lampWeight(point, normal, q);
        if (w > spill) { spill = w; spillRoom = k; }
      }
    }
    // fire: ground floor only, and only where the mouth is in sight
    let fire = 0;
    if (floor === 0 && clear(0, [point[0] + normal[0] * OFF, point[1] + normal[1] * OFF], mouth)) {
      const v = toward(point, mouth);
      fire = (along(normal, v.u) * (1 - LIGHT.fire.face) + LIGHT.fire.face) * falloff(v.d, LIGHT.fire.reach);
    }
    return {day: Math.min(LIGHT.day.cap, dayW), lamp: Math.min(1, lamp), fire: Math.min(1, fire), room: index, spill: Math.min(1, spill), spillRoom};
  }
  return {weigh, roomIndex: id => ids.has(id) ? ids.get(id) : -1};
}

// The dials: what a frame's light is made of, from the shared world's state and clock alone. Colours are linear; times are world milliseconds.
// `floor` is the least brightness any standable spot takes: at midnight with every lamp out, the night fill's blue channel alone provides it.
// Daylight's colour is the sky's, mixed `dayMix` of the way toward the warm white `dayWhite`, so plaster keeps its cream by day.
export const DIALS = deep({fill: [.12, .155, .26], warm: [1, .71, .38], fireWarm: [1, .55, .22], day: 2.3, dayMix: .6, dayWhite: [1, .91, .76], lamp: 1.1, fire: .9, night: .35, hallLow: .35,
  fade: 2000, delay: [5000, 90000], threshold: [.3, .9], fireRise: 20000, fireFall: 25000, emberFall: 1800000, flicker: .06, floor: .07});

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

// The fire rises linearly while it burns; once out it falls over DIALS.fireFall from the level it had reached, and its embers, which glow
// while it burns, die away over DIALS.emberFall. Both count from `hearth.since`, the moment it went out: the world clears `lastBurn` a
// minute after a burn ends, long before the embers are cold. A hearth out since the cottage's `introducedAt` never burned. Unreadable is cold.
export function fireLevel(hearth, now, {settled = false, introducedAt} = {}) {
  if (!hearth || typeof hearth.on !== 'boolean' || !Number.isFinite(now) || !Number.isFinite(hearth.since)) return {fire: 0, embers: 0};
  if (hearth.on) return {fire: settled ? 1 : ramp(now - hearth.since, 0, DIALS.fireRise), embers: 1};
  if (hearth.since === introducedAt) return {fire: 0, embers: 0};
  // (the fall is over well inside the minute lastBurn is kept, so a burn the world has forgotten is long past its fall)
  const b = hearth.lastBurn, reached = b && Number.isFinite(b.start) ? ramp(hearth.since - b.start, 0, DIALS.fireRise) : 0;
  return {fire: reached * (1 - ramp(now - hearth.since, 0, DIALS.fireFall)), embers: 1 - ramp(now - hearth.since, 0, DIALS.emberFall)};
}

// Near 1: three slow sines of the world's seconds, so every visitor sees the same flame. Steady under reduced motion.
export const flicker = (seconds, motion) => motion ? 1 + DIALS.flicker * (Math.sin(seconds * 7.3) + Math.sin(seconds * 11.9 + 1.7) + Math.sin(seconds * 3.1 + 4.2)) / 3 : 1;

const finite = (v, or = 0) => Number.isFinite(v) ? v : or;
const toLinear = rgb => rgb.map(v => Math.max(0, finite(v)) ** 2.2);
const colour = (c, i) => finite(c?.[i]);

// The frame's dials; `fire` is the fire's light (its level with the flicker) and `flame` its level alone. A `study` fixes the lights to its fixture, every fade finished, and the fire lit in the night and dusk studies; the
// calendar and weather given are then the study's own. Anything missing or unreadable falls back to no daylight, no cloud, a dark sky and
// no fire, so a frame never throws and never carries a number that is not finite.
export function interiorDials({interior, calendar, weather, sky, cottage, pose, now, seconds, motion, study}) {
  const light = clamp(finite(calendar?.light)), dark = pathLightLevel(calendar), time = finite(now, 0);
  const mean = toLinear([0, 1, 2].map(i => (colour(sky?.zenith, i) + colour(sky?.horizon, i)) / 2)), top = Math.max(...mean) || 1;
  const mixed = mean.map((v, i) => v / top * (1 - DIALS.dayMix) + DIALS.dayWhite[i] * DIALS.dayMix), peak = Math.max(...mixed);
  const strength = DIALS.day * light * (1 - .35 * overcast({cloud: finite(weather?.cloud)}));
  const fill = DIALS.fill.map(v => v * DIALS.night * Math.max(1 - .7 * light, .3));
  let lit = pose, lights = houseLights(cottage), settled = false, flame = fireLevel(cottage?.hearth, now, {introducedAt: cottage?.introducedAt});
  if (study) {
    lit = cottageFixture(study); settled = true; lights = {main: {on: lit.main > 0, at: -Infinity}, second: {on: lit.second > 0, at: -Infinity}};
    flame = study === 'night' || study === 'dusk' ? {fire: 1, embers: 1} : {fire: 0, embers: 0};
  }
  const levels = roomLamps(interior, {dark, pose: lit, lights, now: time, settled});
  const hall = levels[interior.rooms.findIndex(r => r.id === 'hall')];
  return {day: mixed.map(v => v / peak * strength), fill, lamps: levels.map(v => v * DIALS.lamp),
    fire: flame.fire * DIALS.fire * flicker(finite(seconds), motion), flame: flame.fire, embers: flame.embers, doorway: hall};
}

// One channel `c` of the light a surface with weights `w` shows under `dials`: daylight, the night fill, its room's lamp and the spill of
// its neighbour's, and the fire. The one sum in JS (lightAt, and the lamps' glasses); light.js's shader line is pinned to it by a test.
export function lightSum(dials, w, c) {
  const lamp = (w.room >= 0 ? dials.lamps[w.room] * w.lamp : 0) + (w.spillRoom >= 0 ? dials.lamps[w.spillRoom] * w.spill : 0);
  return dials.day[c] * w.day + dials.fill[c] + DIALS.warm[c] * lamp + DIALS.fireWarm[c] * dials.fire * w.fire;
}

// The light a point shows: the sum the shader computes from the same dials and weights.
export function lightAt(field, dials, floor, point, normal) {
  const w = field.weigh(floor, point, normal);
  return [0, 1, 2].map(c => lightSum(dials, w, c));
}
