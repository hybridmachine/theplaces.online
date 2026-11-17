import test from 'node:test';
import assert from 'node:assert/strict';
import {createLife, lifeFrame, PRESENTERS} from '../public/space/life/index.js';

const quiet = fn => { const warn = console.warn, calls = []; console.warn = (...a) => calls.push(a); try { return fn(calls); } finally { console.warn = warn; } };
const stub = (log, name, {update = () => true, build} = {}) => () => {
  if (build) throw build;
  const state = {runs: 0, disposed: 0};
  log[name] = state;
  return {update(frame) { state.runs++; return update(state.runs, frame); }, dispose() { state.disposed++; }};
};

test('a presenter that throws on update is failed, disposed once and never run again', () => quiet(warnings => {
  const log = {}, life = createLife({}, {}, {
    a: stub(log, 'a', {update: runs => { if (runs === 2) throw new Error('boom'); return true; }}),
    b: stub(log, 'b'),
  });
  for (let i = 0; i < 3; i++) life.update({});
  assert.equal(log.a.runs, 2); assert.equal(log.b.runs, 3);
  assert.deepEqual(life.status, {a: 'failed', b: 'active'});
  assert.equal(log.a.disposed, 1);
  assert.equal(warnings.length, 1);
}));

test('a presenter that throws while being built is failed and the others are still built', () => quiet(() => {
  const log = {}, life = createLife({}, {}, {a: stub(log, 'a', {build: new Error('no')}), b: stub(log, 'b')});
  assert.equal(life.status.a, 'failed');
  life.update({});
  assert.equal(log.b.runs, 1); assert.equal(life.status.b, 'active');
}));

test('an update returning false is idle', () => {
  const log = {}, life = createLife({}, {}, {a: stub(log, 'a', {update: () => false})});
  life.update({});
  assert.equal(life.status.a, 'idle');
});

test('dispose releases every live presenter once and a second call does nothing', () => {
  const log = {}, life = createLife({}, {}, {a: stub(log, 'a'), b: stub(log, 'b')});
  life.dispose(); life.dispose();
  assert.equal(log.a.disposed, 1); assert.equal(log.b.disposed, 1);
});

test('every registered presenter is a maker, and with no presenters the status is empty', () => {
  assert.ok(Object.values(PRESENTERS).every(make => typeof make === 'function'));
  assert.deepEqual(createLife({}, {}, {}).status, {});
});

test('lifeFrame tolerates a world without cottage, bird, environment, coincidences or nest', () => {
  const frame = lifeFrame({
    snapshot: {world: {epoch: 5}}, now: 9, study: null, motion: true, motionSeconds: 1, realSeconds: 2, camera: {},
    conditions: {calendar: {total: 1}, weather: {rain: 0}},
  });
  assert.equal(frame.epoch, 5); assert.equal(frame.fixture, null); assert.deepEqual(frame.calendar, {total: 1});
});

import {SWAY_UNIFORMS} from '../public/space/geometry.js';
import {windClock} from '../shared/foliage.js';
import {lifeLayout} from '../shared/lakeside-life.js';
test('the wind sets the card uniforms from the wind clock each frame and leaves them at rest', () => {
  assert.equal(typeof PRESENTERS.wind, 'function');
  const wind = PRESENTERS.wind({}, {layout: lifeLayout()}), t = 1e7 + .25, clock = windClock(t);
  assert.equal(wind.update({motionSeconds: t}), true);
  const {windClock: c, windStrength, windAlong} = SWAY_UNIFORMS;
  assert.deepEqual([c.value.x, c.value.y, c.value.z, c.value.w], [clock.time, clock.crest, clock.broad, clock.settle]);
  assert.equal(windStrength.value, clock.strength); assert.deepEqual([windAlong.value.x, windAlong.value.y], [0, -1]);
  wind.dispose(); assert.equal(windStrength.value, 0);
});

import {cottagePose} from '../public/space/life/cottage.js';
import {cottageFixture, createCottageState, sampleCottage} from '../shared/cottage.js';
test('the cottage pose comes from a study, else from the shared cottage, snapping the casement under reduced motion', () => {
  const epoch = 1_800_000_000_000, at = epoch + 600_000, cottage = createCottageState(epoch, epoch);
  for (const study of ['night', 'dusk', 'day'])
    assert.deepEqual(cottagePose({snapshot: {world: {cottage}}, now: at, study, motion: true, fixture: null}), cottageFixture(study));
  const opening = {...cottage, casement: 0, pending: {id: 'cottage-v1-x-1', actor: 'lakeside-resident-01', kind: 'casement', room: 'main', from: 0, target: 1,
    start: at - 10_000, motionStart: at - 2000, end: at + 2000}};
  const mid = {snapshot: {world: {cottage: opening}}, now: at, study: null, fixture: null};
  assert.equal(cottagePose({...mid, motion: false}).open, 0);
  assert.ok(cottagePose({...mid, motion: true}).open > 0);
  assert.deepEqual(cottagePose({...mid, motion: true}), sampleCottage(opening, at));
  assert.equal(cottagePose({snapshot: {world: {cottage: {id: 'nonsense'}}}, now: at, study: null, motion: true, fixture: null}), null);
  assert.equal(cottagePose({snapshot: {world: {}}, now: at, study: null, motion: true, fixture: null}), null);
  assert.deepEqual(cottagePose({snapshot: {world: {}}, now: at, study: 'night', motion: true, fixture: {cottagePose: {main: .3, second: 0, open: 1}}}), {main: .3, second: 0, open: 1});
});

import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
test('the cottage lays warm light outside each lit window after dark and goes dark when the world has no cottage', () => {
  const scene = new THREE.Scene(), poses = [], layout = lifeLayout();
  const cottage = PRESENTERS.cottage(THREE, {scene, yard: {setCottage: pose => poses.push(pose)}, layout});
  const lights = scene.children.filter(o => o.isPointLight);
  assert.equal(lights.length, 2);
  for (const light of lights) { assert.equal(light.color.getHexString(), 'ffb561'); assert.equal(light.distance, 5); assert.equal(light.decay, 2); }
  const [x, y, z] = layout.cottage.lights.main, main = scene.getObjectByName('cottage-main'), second = scene.getObjectByName('cottage-second');
  assert.deepEqual(main.position.toArray(), [x, z, -y]);
  assert.equal(cottage.update({snapshot: {world: {}}, study: 'night', calendar: {light: .25}, fixture: null}), true);
  assert.deepEqual(poses.at(-1), cottageFixture('night'));
  assert.ok(Math.abs(main.intensity - 1 * .75 * 2.2) < 1e-12); assert.ok(Math.abs(second.intensity - .65 * .75 * 2.2) < 1e-12);
  assert.equal(cottage.update({snapshot: {world: {}}, now: 0, study: null, motion: true, calendar: {light: 0}, fixture: null}), false);
  assert.deepEqual(poses.at(-1), {main: 0, second: 0, open: 0}); assert.equal(main.intensity, 0); assert.equal(second.intensity, 0);
  cottage.dispose(); assert.equal(scene.children.length, 0);
});
