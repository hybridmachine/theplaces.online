import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D} from '../shared/lakeside-dressing.js';
import {viewOpenings} from '../shared/window-views.js';
import {ceilingHeight, floorArea} from '../shared/interior.js';
import {createLightField, LIGHT, DIALS, houseLights, roomLamps, fireLevel, flicker, interiorDials, lightAt} from '../shared/interior-light.js';
import {createCottageState, sampleCottage} from '../shared/cottage.js';
import * as cottageModule from '../shared/cottage.js';
import {overcast} from '../shared/sky.js';
import {overcast as reexported} from '../public/space/sky-dome.js';

const O = viewOpenings(I, S, D), F = createLightField(I, O), UP = [0, 0, 1];
const day = (p, n = UP, f = 0, field = F) => field.weigh(f, p, n).day;
const centre = id => { const r = I.rooms.find(q => q.id === id); return [(r.a[0] + r.a[1]) / 2, (r.d[0] + r.d[1]) / 2, r.floor * I.floorRise]; };

test('the light constants are frozen', () => {
  assert.ok(Object.isFrozen(LIGHT));
  assert.ok(LIGHT.day.floor > 0 && LIGHT.lamp.floor > 0);
});

test('a wall beside a window is brighter by day than the far wall of the same room', () => {
  assert.ok(day([4.2, .6, 0]) > day([4.2, 6.5, 0]));
});

test('a point takes no daylight from a window behind a wall', () => {
  // The master bedroom shares its wall at a = 11 with the dining room and its window: without that window nothing in the master
  // bedroom changes (its light comes the long way round, through the passage and the hall, from the study's window).
  const noDining = createLightField(I, O.filter(o => o.id !== 'dining')), half = I.wall / 2 + .02;
  for (const [p, n] of [[centre('master'), UP], [[11 + half, 8, 1.2], [1, 0, 0]], [[11 + half, 11, 1.2], [1, 0, 0]], [[12, 11.5, 0], UP]])
    assert.equal(day(p, n), day(p, n, 0, noDining), `${p}`);
  assert.ok(day(centre('master')) < day(centre('dining')));
});

test('a windowless room is dimmer than its neighbour but not dark', () => {
  assert.ok(day(centre('master')) >= LIGHT.day.floor);
  assert.ok(day(centre('master')) < day(centre('dining')));
});

test('a point that sees no pane borrows a share of its neighbour\'s daylight through the nearest opening', () => {
  // A pane high in the kitchen's wall, out of the laundry's sight (the laundry opens to the kitchen only by a gap further along the wall).
  const high = {id: 'test', kind: 'wall', floor: 0, room: 'kitchen', centre: [3, 7.2, 2.6], across: [1, 0, 0], up: [0, 0, 1], outward: [0, 1, 0], half: [.3, .3]};
  const lit = createLightField(I, [...O, high]), p = [.3, 9.4, 0];
  const w = day(p, UP, 0, lit);
  assert.ok(w > day(p), `${w} against ${day(p)} without the high pane`);
  // less than the borrowed share of the kitchen's own daylight just inside the opening (the laundry-kitchen opening at a = 2.5, d 7.8–8.8)
  const there = Math.max(...[UP, [1, 0, 0]].map(n => lit.weigh(0, [2.52, 8.3, 1.5], n).day));
  assert.ok(w > LIGHT.day.floor && w < LIGHT.day.borrow * there, `${w} against ${there}`);
});

test('a windowless room borrows visibly through an opening onto a room with a window, most by the opening; one further off takes less', () => {
  // The box room opens onto the third bedroom (a roof window); the linen cupboard only onto the upstairs bathroom (none), which
  // borrows in its turn: the cupboard takes less than the bathroom.
  const box = day(centre('box-room'), UP, 1), linen = day(centre('linen'), UP, 1);
  assert.ok(linen < day(centre('bath-upper'), UP, 1), `${linen}`);
  assert.ok(box > 1.5 * LIGHT.day.floor, `${box}`);
  assert.ok(day([16.5, 7.3, 3], UP, 1) > day([16.5, 9.3, 3], UP, 1), 'brighter by the opening');
  // and the far wall, facing the opening, still takes it
  assert.ok(day([16.5, 9.5 - I.wall / 2 - .02, 4.5], [0, -1, 0], 1) > 1.5 * LIGHT.day.floor, 'and the far wall facing the opening takes it');
});

// The rooms two or more rooms from any pane, each with a floor point just inside the doorway its light comes through and one at the
// far wall from it, and the room it borrows through.
const FAR_OFF = {passage: [0, [11.3, 6.2], [13.7, 4.4], 'hall'], 'bath-ground': [0, [14.3, 5.5], [17.7, 5.5], 'passage'], laundry: [0, [2.2, 8.3], [.3, 8.3], 'kitchen'],
  pantry: [0, [2.2, 10.7], [.3, 10.7], 'kitchen'], master: [0, [12.5, 7.3], [12.5, 11.7], 'passage'], 'bath-upper': [1, [11.3, 9.5], [14.7, 9.5], 'nook'], linen: [1, [15.3, 10.7], [17.7, 10.7], 'bath-upper']};
const floorMean = id => { const r = I.rooms.find(q => q.id === id); let t = 0, n = 0;
  for (let a = r.a[0] + .2; a < r.a[1] - .1; a += .25) for (let d = r.d[0] + .2; d < r.d[1] - .1; d += .25) { t += day([a, d, r.floor * I.floorRise], UP, r.floor); n++; } return t / n; };

test('the rooms two or more rooms from any pane are brighter toward the doorway their light comes through than at the far wall', () => {
  const noPane = id => !O.some(o => o.room === id && o.kind !== 'door');
  const farOff = I.rooms.filter(r => noPane(r.id) && I.openings.filter(op => op.rooms.includes(r.id)).every(op => noPane(op.rooms.find(x => x !== r.id)))).map(r => r.id);
  assert.deepEqual(farOff.sort(), Object.keys(FAR_OFF).sort());
  for (const [id, [f, door, far]] of Object.entries(FAR_OFF)) {
    const z = f * I.floorRise, near = day([...door, z], UP, f), back = day([...far, z], UP, f);
    assert.ok(near > back && near > LIGHT.day.floor * 1.3, `${id}: by the doorway ${near}, at the far wall ${back}`);
  }
});

test('no room two or more rooms from any pane is brighter than the room it borrows through', () => {
  for (const [id, [, , , through]] of Object.entries(FAR_OFF)) assert.ok(floorMean(id) <= floorMean(through), `${id} ${floorMean(id)} against ${through} ${floorMean(through)}`);
});

test("the master bedroom's door reveal is no brighter by day than the wall facing the doorway", () => {
  // the passage-master opening on d = 7, a 12-13: its jambs and head on the master's side, and the far wall at d = 12
  const half = I.wall / 2, onSide = 7 + half - .01, facing = day([12.5, 12 - half - .02, 1.2], [0, -1, 0]);
  for (const [p, n] of [[[12, onSide, 1.2], [1, 0, 0]], [[13, onSide, 1.2], [-1, 0, 0]], [[12, onSide, .3], [1, 0, 0]], [[12.5, onSide, I.doorHead], [0, 0, -1]]])
    assert.ok(day(p, n) <= facing, `reveal at ${p} ${day(p, n)} against the facing wall ${facing}`);
});

test('light borrowed through a doorway falls on what faces the doorway, not on the wall beside it', () => {
  const half = I.wall / 2 + .02, z = I.floorRise + 1.5;
  // The landing: bedroom 2's doorway (a = 7, d 3–4); the landing face of bedroom 2's wall beside it, and the far wall facing it.
  const beside = F.weigh(1, [7 + half, 4.4, z], [1, 0, 0]).day, facing = F.weigh(1, [11 - half, 3.5, z], [-1, 0, 0]).day;
  assert.ok(facing >= beside, `landing: facing ${facing}, beside ${beside}`);
  // The nook: the sky room's doorway (a = 7, d 9–10); the far wall (beside the bathroom's own opening) facing it.
  const nookBeside = F.weigh(1, [7 + half, 10.4, z], [1, 0, 0]).day, nookFacing = F.weigh(1, [11 - half, 10.6, z], [-1, 0, 0]).day;
  assert.ok(nookFacing >= nookBeside, `nook: facing ${nookFacing}, beside ${nookBeside}`);
});

test('at night the gable wall beside the fireplace takes the lamp and the fire as the walls beside it do', () => {
  const dials = interiorDials({interior: I, calendar: cal(0, -1, .5), weather: {cloud: 0}, sky: {zenith: [.1, .14, .2], horizon: [.1, .14, .2]}, cottage: null,
    pose: {main: 1, second: 0}, now: 0, seconds: 0, motion: false, study: 'night'}), half = I.wall / 2 + .03;
  // either side of the chimney breast, against the front and back walls at about the same distance from the lamp and the fire
  for (const [gable, side] of [[[half, 1.5, 1.5], [.6, half, 1.5]], [[half, 5.5, 1.5], [.6, 7 - half, 1.5]]]) {
    const g = lightAt(F, dials, 0, gable, [1, 0, 0]), w = lightAt(F, dials, 0, side, [0, side[1] < 3.5 ? 1 : -1, 0]);
    assert.ok(g[0] >= .95 * w[0] && g[0] / g[2] >= .95 * w[0] / w[2], `gable ${g} against side ${w}`);
    assert.ok(F.weigh(0, gable, [1, 0, 0]).lamp > LIGHT.lamp.floor, 'the lamp reaches the gable');
  }
});

test('the front door lends daylight to the hall only, at half strength', () => {
  // The dining and study windows are in the hall's sight too, so leave them out: only the door (or the same pane as a wall pane) is left to see.
  // (2 m in from the door, where even the door taken as a full window stays under LIGHT.day.cap)
  const rest = O.filter(o => o.id !== 'dining' && o.id !== 'study'), p = [9, 2, 0];
  const withDoor = createLightField(I, rest), withoutDoor = createLightField(I, rest.filter(o => o.kind !== 'door'));
  const asWall = createLightField(I, rest.map(o => o.kind === 'door' ? {...o, kind: 'wall'} : o));
  assert.ok(day(p, UP, 0, withDoor) > day(p, UP, 0, withoutDoor));
  assert.ok(Math.abs(day(p, UP, 0, withDoor) - LIGHT.day.door * day(p, UP, 0, asWall)) < 1e-9);
  // Beyond the hall it lends nothing, even where it is in plain sight (the dining room, straight back through the hall-dining opening),
  // and a room that borrows the hall's daylight through an opening borrows none of the door's (the study, its own window left out).
  for (const q of [[5, 1, 0], [13, 2, 0], [9, 9, 0]]) assert.equal(day(q, UP, 0, withDoor), day(q, UP, 0, withoutDoor));
});

test('a lamp lights its own room and not the far side of its walls', () => {
  const k = F.weigh(0, [7 - I.wall / 2, 9.5, 1.5], [-1, 0, 0]);
  assert.ok(k.lamp > .3);
  assert.equal(k.room, F.roomIndex('kitchen'));
  const noKitchen = createLightField({...I, fittings: I.fittings.filter(f => f.room !== 'kitchen')}, O);
  const din = F.weigh(0, [7 + I.wall / 2, 9.5, 1.5], [1, 0, 0]);
  assert.equal(din.room, F.roomIndex('dining'));
  assert.equal(din.lamp, noKitchen.weigh(0, [7 + I.wall / 2, 9.5, 1.5], [1, 0, 0]).lamp);
});

test('inside a doorway each face takes the lamp of the room it faces', () => {
  const a = F.weigh(0, [7, 9.5, 1.2], [-1, 0, 0]);   // kitchen-dining opening a = 7, d 7.5-11.5: jamb faces are in the doorway's thickness
  const b = F.weigh(0, [7, 9.5, 1.2], [1, 0, 0]);
  assert.equal(a.room, F.roomIndex('kitchen'));
  assert.equal(b.room, F.roomIndex('dining'));
  const fit = id => I.fittings.find(f => f.room === id).at;
  const expect = (id, n) => { const t = fit(id).map((x, i) => x - [7, 9.5, 1.2][i]), L = Math.hypot(...t), nd = (n[0] * t[0]) / L;
    return Math.max(LIGHT.lamp.floor, (Math.max(0, nd) * .6 + .4) / (1 + (L / LIGHT.lamp.reach * 3) ** 2)); };
  assert.ok(Math.abs(a.lamp - expect('kitchen', [-1, 0, 0])) < 1e-9);
  assert.ok(Math.abs(b.lamp - expect('dining', [1, 0, 0])) < 1e-9);
});

test('firelight reaches the hall through the wide opening and nothing behind the wall beside it', () => {
  assert.ok(F.weigh(0, [8, 3.5, 0], UP).fire > 0);
  assert.equal(F.weigh(0, [8, 6.5, 0], UP).fire, 0);
  assert.equal(F.weigh(0, [3, 8, 0], UP).fire, 0);
  for (const r of I.rooms.filter(q => q.floor === 1)) assert.equal(F.weigh(1, centre(r.id), UP).fire, 0);
});

test('every weight is between 0 and 1 and the room index names the room the surface faces', () => {
  let n = 0;
  for (const [i, r] of I.rooms.entries()) {
    const z0 = r.floor * I.floorRise, mid = [(r.a[0] + r.a[1]) / 2, (r.d[0] + r.d[1]) / 2];
    const pts = [[[mid[0], mid[1], z0], UP], [[mid[0], mid[1], z0 + ceilingHeight(I, r.floor, mid[1])], [0, 0, -1]],
      [[r.a[0], mid[1], z0 + 1.2], [1, 0, 0]], [[r.a[1], mid[1], z0 + 1.2], [-1, 0, 0]], [[mid[0], r.d[0], z0 + 1.2], [0, 1, 0]], [[mid[0], r.d[1], z0 + 1.2], [0, -1, 0]]];
    for (const [p, nrm] of pts) {
      const w = F.weigh(r.floor, p, nrm);
      for (const k of ['day', 'lamp', 'fire']) assert.ok(w[k] >= 0 && w[k] <= 1, `${r.id} ${k} ${w[k]}`);
      assert.equal(w.room, i, `${r.id} ${p}`);
      n++;
    }
  }
  assert.ok(n > 100);
  assert.equal(F.weigh(0, [-3, -3, 0], UP).room, -1);
  assert.equal(F.weigh(0, [-3, -3, 0], UP).lamp, 0);
});

test('weights are the same on every call', () => {
  const p = [5.3, 2.2, 0], a = F.weigh(0, p, UP), b = F.weigh(0, p, UP), c = createLightField(I, O).weigh(0, p, UP);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
});

test('a sweep of 20,000 points is fast', () => {
  const t = process.hrtime.bigint();
  for (let i = 0; i < 20000; i++) F.weigh(i % 2, [(i * 7.31) % 18, (i * 3.77) % 12, (i % 2) * 3], UP);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`# 20000 weigh() calls: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 1000);
});

// ---- the dials ----
const T0 = 1e9, ids = I.rooms.map(r => r.id), idx = id => ids.indexOf(id);
const OTHERS = ids.filter(id => !['living', 'study', 'hall', 'landing'].includes(id));
const cot = (rooms, lastLightAt, hearth = {on: false, since: 0, lastBurn: null}) => ({...createCottageState(0, 0), rooms, lastLightAt, hearth});
const ON = at => ({main: {on: true, at}, second: {on: false, at: -Infinity}}), OFF = at => ({main: {on: false, at}, second: {on: false, at: -Infinity}});
const lamps = (o) => roomLamps(I, {dark: 1, pose: {main: 0, second: 0}, lights: ON(T0), now: T0, ...o});
const level = (arr, id) => arr[idx(id)];

test('the overcast helper moved to shared and is still exported by the sky dome', () => {
  assert.equal(reexported, overcast);
  assert.equal(overcast({cloud: .2}), 0);
  assert.equal(overcast({cloud: .9}), 1);
});

test('each light is read on its own: on or off, and when it last changed', () => {
  const c = cot({main: true, second: false}, {main: 5000, second: 1000});
  assert.deepEqual(houseLights(c), {main: {on: true, at: 5000}, second: {on: false, at: 1000}});
  assert.deepEqual(houseLights(cot({main: true, second: true}, {main: 5000, second: 9000})), {main: {on: true, at: 5000}, second: {on: true, at: 9000}});
  // a light off since the world began has never been lit
  assert.deepEqual(houseLights(cot({main: false, second: false}, {main: 0, second: 0})), {main: {on: false, at: -Infinity}, second: {on: false, at: -Infinity}});
  assert.deepEqual(houseLights(null), {main: {on: false, at: -Infinity}, second: {on: false, at: -Infinity}});
});

test('the fade of a room is shorter than the cottage lets one light change again', () => {
  assert.ok(cottageModule.LIGHT_REST_MS >= 180_000);
  assert.ok(DIALS.delay[1] + DIALS.fade < cottageModule.LIGHT_REST_MS);
});

test("the living room and the study follow the world's two lights, with their fades", () => {
  const c = cot({main: false, second: false}, {main: 0, second: 0});
  c.pending = {id: 'x', actor: c.residentId, kind: 'light', room: 'main', from: 0, target: true, start: 1000, motionStart: 2000, end: 4000};
  c.nextDecisionAt = 30000;
  const at = now => { const pose = sampleCottage(c, now); return lamps({pose, now}); };
  assert.equal(level(at(1500), 'living'), 0);
  const mid = level(at(3000), 'living');
  assert.ok(mid > 0 && mid < 1, `${mid}`);
  assert.equal(level(at(4000), 'living'), 1);
  assert.equal(level(lamps({pose: {main: 0, second: .65}}), 'study'), .65);
});

test('the hall and landing burn low from dusk to dawn and fully while the house is awake', () => {
  const asleep = OFF(T0 - 1e7), awake = ON(T0 - 1e7);
  for (const id of ['hall', 'landing']) {
    assert.equal(level(lamps({lights: asleep}), id), DIALS.hallLow);
    assert.equal(level(lamps({lights: awake}), id), 1);
    assert.equal(level(lamps({lights: awake, dark: 0}), id), 0);
    assert.equal(level(lamps({lights: asleep, dark: .5}), id), .5 * DIALS.hallLow);
  }
});

test('the other rooms need the dark and a waking house, each after its own delay', () => {
  const at = ms => OTHERS.map(id => level(lamps({now: T0 + ms}), id));
  assert.ok(at(4000).every(v => v === 0));
  assert.ok(at(95000).every(v => v === 1));
  const between = [at(10000), at(30000), at(60000)].flat();
  assert.ok(new Set(between).size > 3);
  assert.ok(OTHERS.some((id, i) => at(30000)[i] !== at(30000)[0]));
  // each room's delay lies within DIALS.delay: it is still 0 at the least, and 1 by the greatest plus the fade
  assert.ok(at(DIALS.delay[0] - 1).every(v => v === 0));
  assert.ok(at(DIALS.delay[1] + DIALS.fade).every(v => v === 1));
});

test('each room answers the dusk at its own point', () => {
  const settled = {settled: true};
  assert.ok(OTHERS.every(id => level(lamps({dark: .25, ...settled}), id) === 0));
  assert.ok(OTHERS.every(id => level(lamps({dark: 1, ...settled}), id) === 1));
  const ts = OTHERS.map(id => { let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; level(lamps({dark: m, ...settled}), id) > 0 ? hi = m : lo = m; } return hi; });
  assert.ok(ts.every(t => t >= DIALS.threshold[0] - 1e-6 && t <= DIALS.threshold[1] + 1e-6), `${ts}`);
  assert.ok(new Set(ts.map(t => t.toFixed(4))).size > 1);
});

test('when the house sleeps the rooms go out apart, and the hall falls back to low', () => {
  const since = T0, asleep = ms => lamps({lights: OFF(since), now: since + ms});
  assert.ok(OTHERS.every(id => level(asleep(0), id) === 1));
  assert.ok(OTHERS.every(id => level(asleep(DIALS.delay[1] + DIALS.fade), id) === 0));
  assert.ok(new Set(OTHERS.map(id => level(asleep(30000), id))).size > 1);
  assert.equal(level(asleep(0), 'hall'), 1);
  assert.equal(level(asleep(5000), 'hall'), DIALS.hallLow);
});

test('the delays and thresholds are the same on every call and for every visitor', () => {
  const a = lamps({now: T0 + 40000, dark: .8}), b = lamps({now: T0 + 40000, dark: .8});
  assert.deepEqual(a, b);
  assert.notDeepEqual(roomLamps({...I, lightSeed: 7}, {dark: .8, pose: {main: 0, second: 0}, lights: ON(T0), now: T0 + 40000}), a);
});

test('the fire rises over twenty seconds, falls over its own while it goes out, and its embers die away over half an hour', () => {
  const start = 1000, end = start + DIALS.fireRise * 3, on = {on: true, since: start, lastBurn: null}, out = {on: false, since: end, lastBurn: {start, end}};
  assert.deepEqual(fireLevel(on, start), {fire: 0, embers: 1});
  assert.deepEqual(fireLevel(on, start + DIALS.fireRise / 2), {fire: .5, embers: 1});
  assert.deepEqual(fireLevel(on, start + DIALS.fireRise * 3), {fire: 1, embers: 1});
  assert.deepEqual(fireLevel(on, 5, {settled: true}), {fire: 1, embers: 1});
  // the moment it goes out it is still at the level it had reached, and falls from there over DIALS.fireFall
  assert.deepEqual(fireLevel(out, end), {fire: 1, embers: 1});
  assert.equal(fireLevel(out, end + DIALS.fireFall / 2).fire, .5);
  assert.equal(fireLevel(out, end + DIALS.fireFall).fire, 0);
  assert.equal(fireLevel(out, end + DIALS.emberFall / 2).embers, .5);
  assert.equal(fireLevel(out, end + DIALS.emberFall * 2).embers, 0);
  // put out half-way up its rise, it falls from half and never jumps up
  const early = {on: false, since: start + DIALS.fireRise / 2, lastBurn: {start, end: start + DIALS.fireRise / 2}};
  assert.equal(fireLevel(early, early.since).fire, .5);
  assert.ok(fireLevel(early, early.since + DIALS.fireFall / 2).fire < .5);
});

test('the fire never changes by more than a tenth between frames 100 ms apart as the hearth goes out and comes on', () => {
  const lit = 1e6, out = lit + 120e3, again = out + 400e3, stop = again + 60e3;
  const hearthAt = t => t < lit ? {on: false, since: 0, lastBurn: null} : t < out ? {on: true, since: lit, lastBurn: null}
    : t < again ? {on: false, since: out, lastBurn: {start: lit, end: out}} : {on: true, since: again, lastBurn: {start: lit, end: out}};
  let prev = null;
  for (let t = lit - 5e3; t <= stop; t += 100) {
    const {fire} = fireLevel(hearthAt(t), t, {introducedAt: 0});
    if (prev !== null) assert.ok(Math.abs(fire - prev) <= .1, `t=${t}: ${prev} -> ${fire}`);
    prev = fire;
  }
});

test('the embers die over half an hour though the world forgets the burn after a minute', async () => {
  const {completeCottage, decideCottage, DECISION_MS, SMOKE_LIFETIME} = cottageModule;
  // the real sequence: the hearth lit, put out, then a decision more than a minute later that clears lastBurn
  const t0 = 0, c0 = createCottageState(t0, t0);
  const light = (state, at, target) => completeCottage({...state, pending: {id: `t-${at}`, actor: state.residentId, kind: 'hearth', room: 'main', from: +state.hearth.on, target, start: at - 9000, motionStart: at - 1000, end: at}}, t0, at).state;
  const lit = light(c0, 600e3, true), out = light(lit, 900e3, false);
  assert.ok(out.hearth.lastBurn, 'the burn is remembered at first');
  let grid = out.nextDecisionAt; while (grid - 900e3 <= SMOKE_LIFETIME) grid += DECISION_MS;
  const forgot = decideCottage({...out, nextDecisionAt: grid}, t0, grid);
  assert.equal(forgot.hearth.lastBurn, null, 'the world has cleared lastBurn');
  const state = t => t < grid ? out : forgot;
  let prev = null;
  for (let t = 900e3; t <= 900e3 + DIALS.emberFall + 60e3; t += 100) {
    const {embers} = fireLevel(state(t).hearth, t, {introducedAt: c0.introducedAt});
    if (prev !== null) assert.ok(Math.abs(embers - prev) <= .01, `t=${t}: ${prev} -> ${embers}`);
    if (t < 900e3 + DIALS.emberFall) assert.ok(embers > 0, `embers out early at ${t}`);
    prev = embers;
  }
  assert.equal(prev, 0);
  // and the dials read the cottage's introduction themselves
  const d = interiorDials({...base, calendar: cal(0, -1, 0), weather: {cloud: 0}, cottage: forgot, now: grid + 1000});
  assert.ok(d.embers > .9, `${d.embers}`);
});

test('a hearth that never burned is cold; an unreadable one is cold', () => {
  assert.deepEqual(fireLevel({on: false, since: 0, lastBurn: null}, 1e6, {introducedAt: 0}), {fire: 0, embers: 0});
  assert.deepEqual(fireLevel(null, 1e6), {fire: 0, embers: 0});
  assert.deepEqual(fireLevel({}, 1e6), {fire: 0, embers: 0});
});

test('the fire flickers by a few per cent, and not at all under reduced motion', () => {
  const v = Array.from({length: 1000}, (_, i) => flicker(i * .137, true));
  assert.ok(v.every(x => Math.abs(x - 1) <= DIALS.flicker + 1e-12));
  assert.ok(new Set(v).size > 100);
  assert.ok(Array.from({length: 100}, (_, i) => flicker(i * .5, false)).every(x => x === 1));
  const mean = Array.from({length: 6000}, (_, i) => flicker(i * .01, true)).reduce((a, b) => a + b) / 6000;
  assert.ok(Math.abs(mean - 1) < .01, `${mean}`);
});

const cal = (light, elevation, hour = 20) => ({light, elevation, hour});
const SKY = {zenith: [.62, .70, .76], horizon: [.83, .83, .75]}, NIGHT_SKY = {zenith: [.1, .14, .2], horizon: [.1, .14, .2]};
const base = {interior: I, sky: SKY, cottage: null, pose: {main: 0, second: 0}, now: T0, seconds: 10, motion: false};

test('daylight follows the sky: strong at noon, dim under overcast, gone at night', () => {
  const noon = interiorDials({...base, calendar: cal(1, 1, 12), weather: {cloud: 0}}), grey = interiorDials({...base, calendar: cal(1, 1, 12), weather: {cloud: 1}});
  const night = interiorDials({...base, sky: NIGHT_SKY, calendar: cal(0, -1, 0), weather: {cloud: 0}});
  assert.equal(Math.max(...noon.day), DIALS.day);
  assert.ok(Math.abs(Math.max(...grey.day) - DIALS.day * .65) < 1e-9);
  assert.deepEqual(night.day, [0, 0, 0]);
  assert.ok(noon.fill.every((v, i) => Math.abs(v - DIALS.fill[i] * DIALS.night * .3) < 1e-12));
  assert.ok(night.fill.every((v, i) => v === DIALS.fill[i] * DIALS.night));
});

test('daylight is the sky\'s colour mixed with a warm white, so plaster keeps its cream; a cold sky still cools it', () => {
  const lin = v => v ** 2.2, at = sky => interiorDials({...base, sky, calendar: cal(1, 1, 12), weather: {cloud: 0}}).day;
  const want = sky => { const m = [0, 1, 2].map(i => lin((sky.zenith[i] + sky.horizon[i]) / 2)), top = Math.max(...m);
    const mixed = m.map((v, i) => v / top * (1 - DIALS.dayMix) + DIALS.dayWhite[i] * DIALS.dayMix), peak = Math.max(...mixed);
    return mixed.map(v => v / peak * DIALS.day); };
  for (const sky of [SKY, {zenith: [.3, .45, .8], horizon: [.5, .6, .8]}]) at(sky).forEach((v, i) => assert.ok(Math.abs(v - want(sky)[i]) < 1e-9, `${at(sky)} against ${want(sky)}`));
  const cold = at({zenith: [.3, .45, .8], horizon: [.5, .6, .8]}), warmer = at(SKY);
  assert.ok(warmer[0] / warmer[2] > cold[0] / cold[2], 'a bluer sky gives a cooler light');
  assert.ok(warmer[0] / warmer[2] > 1, 'a clear noon is a little warm, not blue');
});

test('the dials carry the fire\'s level without its flicker, for telling burning from embers', () => {
  const on = {on: true, since: T0 - DIALS.fireRise / 4, lastBurn: null};
  const levels = Array.from({length: 20}, (_, k) => interiorDials({...base, calendar: cal(0, -1, 0), weather: {cloud: 0}, cottage: cot({main: false, second: false}, {main: 0, second: 0}, on), now: T0, seconds: k * .37, motion: true}));
  assert.ok(levels.every(d => d.flame === .25), `${levels.map(d => d.flame)}`);
  assert.ok(new Set(levels.map(d => d.fire)).size > 1, 'the fire\'s light itself flickers');
});

test('a study shows the settled picture, with the fire lit at night and dusk', () => {
  const d = name => interiorDials({...base, study: name, calendar: cal(0, -1, 0), weather: {cloud: 0}, now: 0});
  assert.equal(d('night').fire, DIALS.fire);
  assert.equal(d('night').embers, 1);
  assert.equal(d('dusk').fire, DIALS.fire);
  assert.equal(d('day').fire, 0);
  assert.equal(d('day').embers, 0);
  assert.equal(level(d('night').lamps, 'living'), DIALS.lamp);
  assert.ok(OTHERS.every(id => level(d('night').lamps, id) === DIALS.lamp));
  assert.ok(OTHERS.every(id => level(d('day').lamps, id) === 0));
  assert.equal(level(d('day').lamps, 'hall'), DIALS.hallLow * DIALS.lamp);
  assert.equal(d('night').doorway, 1);
});

test('a world with no readable cottage still lights the way: fill and the hall and landing lamps', () => {
  const d = interiorDials({...base, pose: null, calendar: cal(0, -1, 0), weather: {cloud: 0}});
  assert.equal(d.fire, 0);
  assert.equal(d.embers, 0);
  assert.equal(level(d.lamps, 'hall'), DIALS.hallLow * DIALS.lamp);
  assert.equal(level(d.lamps, 'landing'), DIALS.hallLow * DIALS.lamp);
  assert.equal(d.doorway, DIALS.hallLow);
  assert.ok([...OTHERS, 'living', 'study'].every(id => level(d.lamps, id) === 0));
});

test('no standable spot is dark at midnight under full overcast with every lamp out', () => {
  const dials = interiorDials({...base, calendar: cal(0, -1, 0), weather: {cloud: 1}, cottage: cot({main: false, second: false}, {main: 0, second: 0}), pose: {main: 0, second: 0}, now: 1e12});
  let n = 0, worst = Infinity;
  for (const f of [0, 1]) for (let a = 0; a <= 18; a += .4) for (let d = 0; d <= 12; d += .4) {
    if (!floorArea(I, f, [a, d])) continue;
    const z = f * I.floorRise;
    for (const [pt, nrm] of [[[a, d, z], [0, 0, 1]], [[a, d, z + 1.5], [0, 1, 0]], [[a, d, z + 1.5], [0, -1, 0]]]) {
      const m = Math.max(...lightAt(F, dials, f, pt, nrm)); n++;
      worst = Math.min(worst, m);
      assert.ok(m >= DIALS.floor, `floor ${f} at ${a}, ${d}: ${m}`);
    }
  }
  assert.ok(n > 500);
  console.log(`# darkest standable point: ${worst.toFixed(4)} over ${n} samples`);
});

// ---- the lights over time ----
const EV = 1e6, LIGHTS_AT = t => {   // main on at 0, second on at +100 s, main out at +190 s, while the house has woken only 90 s from the second, second out at +500 s, main on again at +700 s
  const m = t < EV ? [false, 0] : t < EV + 180e3 ? [true, EV] : t < EV + 700e3 ? [false, EV + 180e3] : [true, EV + 700e3];
  const q = t < EV + 170e3 ? [false, 0] : t < EV + 500e3 ? [true, EV + 170e3] : [false, EV + 500e3];
  return cot({main: m[0], second: q[0]}, {main: m[1], second: q[1]});
};
const stateAt = (t, dark) => interiorDials({...base, cottage: LIGHTS_AT(t), pose: {main: 0, second: 0}, now: t, calendar: cal(0, .06 - .08 * dark, 20), weather: {cloud: 0}});
const roomsAt = (t, dark) => OTHERS.map(id => level(stateAt(t, dark).lamps, id) / DIALS.lamp).concat(['hall', 'landing'].map(id => level(stateAt(t, dark).lamps, id) / DIALS.lamp));

test('no lamp jumps between frames as the lights change, whatever the dusk does', () => {
  for (const dusk of [false, true]) {
    let prev = null, worst = 0;
    const end = EV + 1500e3, total = (end - (EV - 20e3)) / 100;
    for (let t = EV - 20e3, k = 0; t <= end; t += 100, k++) {
      const cur = roomsAt(t, dusk ? k / total : 1);
      if (prev) cur.forEach((v, i) => { worst = Math.max(worst, Math.abs(v - prev[i])); assert.ok(Math.abs(v - prev[i]) <= .1, `t=${t - EV} room ${i}: ${prev[i]} -> ${v}`); });
      prev = cur;
    }
  }
});

test('at the end of each phase the rooms are what the lights say', () => {
  const rooms = t => roomsAt(EV + t, 1), first = OTHERS.length;
  assert.ok(rooms(-1000).every(v => v <= DIALS.hallLow), 'a world whose lights were never lit starts dark');
  assert.ok(rooms(99e3).slice(0, first).every(v => v === 1));          // main on
  assert.ok(rooms(179e3).slice(0, first).every(v => v === 1));         // both on
  assert.ok(rooms(499e3).slice(0, first).every(v => v === 1));         // main out, second still lit
  assert.ok(rooms(699e3).slice(0, first).every(v => v === 0));        // both out
  assert.ok(rooms(699e3).slice(first).every(v => v === DIALS.hallLow));
  assert.ok(rooms(799e3).slice(0, first).every(v => v === 1));         // waking again
  assert.ok(rooms(799e3).slice(first).every(v => v === 1));
});

test('a visitor arriving hours after the house woke finds every room as the sweep left it', () => {
  const last = EV + 1500e3;
  assert.deepEqual(stateAt(last, 1).lamps, stateAt(last, 1).lamps);
  let swept; for (let t = EV - 20e3; t <= last; t += 100) swept = stateAt(t, 1).lamps;
  assert.deepEqual(stateAt(last, 1).lamps, swept);
  assert.ok(OTHERS.every(id => level(swept, id) === DIALS.lamp));
});

test('missing or unreadable inputs never throw and never give a number that is not finite', () => {
  const ok = d => [d.day, d.fill, d.lamps, [d.fire, d.embers, d.doorway]].flat().every(Number.isFinite);
  const good = {...base, calendar: cal(.5, 0, 18), weather: {cloud: .5}, cottage: LIGHTS_AT(EV + 1e5), pose: {main: 1, second: 0}};
  for (const bad of [{calendar: null}, {calendar: {}}, {calendar: {light: NaN, elevation: 0, hour: 18}}, {weather: undefined}, {weather: {}}, {weather: {cloud: NaN}},
    {sky: undefined}, {sky: {}}, {sky: {zenith: [NaN, 0, 0], horizon: [0, 0, 0]}}, {now: NaN}, {now: undefined}, {seconds: NaN}, {cottage: null}, {pose: null}]) {
    assert.ok(ok(interiorDials({...good, ...bad})), JSON.stringify(Object.keys(bad)));
    assert.ok(ok(interiorDials({...good, ...bad, motion: true})));
  }
  assert.deepEqual(fireLevel({on: true, since: 0, lastBurn: null}, NaN), {fire: 0, embers: 0});
});
