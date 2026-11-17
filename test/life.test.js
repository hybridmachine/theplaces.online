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
