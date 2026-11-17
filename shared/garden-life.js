import {clamp, smooth} from './world.js';
import {gardenPlan} from './lakeside-dressing.js';

// Each crop's year, in days of the year (0–364): `dig` the plot is turned, `supportUp`/`supportDown` its stakes or poles stand
// (null for corn), `sow` it goes in (a tomato is set out at `shoot`), `shoot`..`full` it grows, then the [from, to] windows of
// its flowers, fruit appearing, ripening, yellowing and drying, and `clear` it is pulled. Tomatoes' frost is spread over ten days.
const freeze = crop => Object.freeze(Object.fromEntries(Object.entries(crop).map(([k, v]) => [k, Array.isArray(v) ? Object.freeze(v) : v])));
export const CROPS = Object.freeze({
  corn: freeze({dig: 110, supportUp: null, sow: 125, shoot: 135, full: 200, flower: [200, 230], fruit: [215, 240], ripe: [240, 255], yellow: [265, 280], dry: [278, 290], clear: 315, supportDown: null}),
  bean: freeze({dig: 110, supportUp: 120, sow: 130, shoot: 138, full: 190, flower: [185, 250], fruit: [200, 235], ripe: [235, 260], yellow: [265, 285], dry: [280, 295], clear: 318, supportDown: 318}),
  tomato: freeze({dig: 110, supportUp: 135, sow: 135, shoot: 135, full: 200, flower: [170, 240], fruit: [185, 215], ripe: [205, 250], yellow: [265, 285], dry: [283, 293], clear: 300, supportDown: 300}),
});

// The resting plot's mulch: laid on `lay`, thinning to .6 by `lift`, when it is cleared away.
export const MULCH = Object.freeze({lay: 115, lift: 318});
// The most a plant's growth windows may be shifted, in days, so that no two plants of a kind look alike.
export const OFFSET_DAYS = 5;
// The most any stage may change from one day to the next, except on a gardener's day (see EVENT_DAYS).
export const DAILY_STEP = .2;

const CORN_PICKED = 290, TOMATO_START = .15, PICKED = 10;

// What a crop looks like on a day: whether it is in the ground (`present`) and its stake stands (`support`), and, each 0–1,
// how tall and leafy it is, how much it flowers, how much fruit it carries, and how ripe, yellowed and dry it is; `set` is how
// much fruit has set so far, which picking never lowers, so a fruit is drawn at the size `set` gives it until it is picked.
// `offset` (days) shifts its growth windows, never its sowing, clearing, stakes or the corn's harvest day (a gardener's day, the
// same for every plant), so it is never seen outside them.
export function cropStage(kind, dayOfYear, offset = 0) {
  const c = CROPS[kind], d = dayOfYear, e = d - offset, start = kind === 'tomato' ? c.shoot : c.sow;
  const support = c.supportUp !== null && d >= c.supportUp && d < c.supportDown;
  if (!(d >= start && d < c.clear)) return {present: false, support, height: 0, leaf: 0, flower: 0, fruit: 0, set: 0, ripe: 0, yellow: 0, dry: 0};
  const grown = smooth(c.shoot, c.full, e), size = kind === 'tomato' ? TOMATO_START + (1 - TOMATO_START) * grown : grown;
  const [f0, f1] = c.flower, [u0, u1] = c.fruit, rise = smooth(u0, u1, e);
  // beans and tomatoes are picked from PICKED days after their ripening starts (or once fully set), until none are left as they yellow
  const pick = Math.max(u1, c.ripe[0] + PICKED), fruit = kind === 'corn' ? (d <= CORN_PICKED ? rise : 0) : e <= pick ? rise : clamp(1 - (e - pick) / (c.yellow[1] - pick));
  return {present: true, support, height: size, leaf: size, flower: smooth(f0, f0 + 10, e) * (1 - smooth(f1 - 10, f1, e)), fruit, set: rise,
    ripe: smooth(...c.ripe, e), yellow: smooth(...c.yellow, e), dry: smooth(...c.dry, e)};
}

// One fruit of a plant, set at share `at` (0–.85, fixed by the seed) of the plant's fruit. `fruitTurn` is how far it has turned
// from green (0) to ripe (1 and over, not clamped), each a little early or late by `jitter` (0–1), the early-set first.
// `fruitOn` is whether it hangs: from when the set share passes `at` until it is picked. Picking takes the earliest-set first,
// as the fruit share falls below the set share, but never a fruit that has not been ripe for a day (`turn` past RIPE_SEEN, which
// is more than one day's ripening past 1). A pod has no turn of its own and goes as the picking reaches it.
const RIPE_SEEN = 1.2;
export const fruitTurn = (stage, at, jitter) => (stage.ripe - (.7 * at + .1 * jitter)) / .2;
export const fruitOn = (stage, at, turn = Infinity) => stage.set > at && !(stage.fruit < stage.set && at <= 1 - stage.fruit && turn >= RIPE_SEEN);

// The soil of a plot on a day, each 0–1: how freshly dug (dark) it is, and how thickly mulched. `crop` is a crop kind or 'rest'.
export function plotSoil(crop, dayOfYear) {
  const d = dayOfYear;
  if (crop === 'rest') return {dug: 0, mulch: d >= MULCH.lay && d < MULCH.lift ? 1 - .4 * (d - MULCH.lay) / (MULCH.lift - MULCH.lay) : 0};
  const dig = CROPS[crop].dig;
  return {dug: d >= dig && d < 320 ? 1 - clamp((d - dig) / (230 - dig)) : 0, mulch: 0};
}

// The days on which a crop's plot (or the resting plot, 'rest') may change suddenly: digging, setting out, picking, clearing.
const EVENTS = {corn: [110, 125, 291, 315], bean: [110, 120, 130, 318], tomato: [110, 135, 300], rest: [115, 318]};
export const EVENT_DAYS = kind => [...EVENTS[kind]];

// The whole garden on a world day (whole days since the world began), or null when `day` is not a whole number: the plan for
// that day's year, its plots with their soil, and the plants in the ground or on their stakes, each with its stage.
export function gardenState(space, dressing, day) {
  if (!Number.isInteger(day)) return null;
  const year = Math.floor(day / 365), dayOfYear = ((day % 365) + 365) % 365, plan = gardenPlan(space, dressing, year);
  return {day, year, dayOfYear, beds: plan.beds,
    plots: plan.plots.map(p => ({...p, soil: plotSoil(p.crop, dayOfYear)})),
    plants: plan.plants.map(p => ({...p, stage: cropStage(p.kind, dayOfYear, p.offset)})).filter(p => p.stage.present || p.stage.support)};
}
