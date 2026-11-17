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
import {lifeLayout, smokePlace} from '../shared/lakeside-life.js';
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
import {cottageFixture, createCottageState, sampleCottage, smokePuffs} from '../shared/cottage.js';
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

test('the hearth smoke rises from the chimney while the hearth burns, and shows nothing for a study, reduced motion or no cottage', () => {
  const scene = new THREE.Scene(), layout = lifeLayout(), epoch = 1_800_000_000_000, now = epoch + 60_000;
  const cottage = {...createCottageState(epoch, epoch), hearth: {on: true, since: epoch, lastBurn: null}};
  const smoke = PRESENTERS.smoke(THREE, {scene, layout}), group = scene.getObjectByName('hearth-smoke');
  const frame = {snapshot: {world: {epoch, cottage}}, epoch, now, study: null, motion: true, calendar: {light: 1}, camera: new THREE.PerspectiveCamera(), fixture: null};
  const shown = () => group.children.filter(m => m.visible);
  assert.equal(group.children.length, 16);
  assert.equal(smoke.update(frame), true);
  const puffs = smokePuffs(cottage, epoch, now); assert.equal(shown().length, puffs.length); assert.ok(puffs.length > 0);
  const [cx, cy, cz] = layout.cottage.chimney;
  for (const mesh of shown()) {
    assert.ok(mesh.position.y >= cz - 1e-9 && mesh.position.y <= cz + 6 + 1e-9, 'rises at most 6 m');
    assert.ok(Math.abs(mesh.position.x - cx) <= .15 + 1e-9, 'wanders at most .15 m across the wind');
    const {opacity, tint} = mesh.material.uniforms; assert.ok(opacity.value <= .45 && opacity.value >= 0);
    assert.ok(Math.abs(tint.value.r - 209 / 255) < 1e-6);
    assert.equal(mesh.material.depthWrite, false); assert.equal(mesh.material.transparent, true);
  }
  assert.ok(Math.abs(shown()[0].material.uniforms.opacity.value - Math.min(smokePlace(puffs[0], layout).alpha * 9, .45)) < 1e-9);
  smoke.update({...frame, calendar: {light: 0}});
  assert.ok(Math.abs(shown()[0].material.uniforms.tint.value.r - .3 * 209 / 255) < 1e-6);
  assert.equal(smoke.update({...frame, study: 'night'}), false); assert.equal(shown().length, 0);
  smoke.update(frame); assert.equal(smoke.update({...frame, motion: false}), false); assert.equal(shown().length, 0);
  smoke.update(frame); assert.equal(smoke.update({...frame, snapshot: {world: {epoch, cottage: {id: 'nonsense'}}}}), false); assert.equal(shown().length, 0);
  assert.equal(smoke.update({...frame, snapshot: {world: {epoch}}}), false);
  smoke.dispose(); assert.equal(scene.children.length, 0);
});

import {RAIN, rainDrop} from '../public/space/life/rain.js';
test('a rain drop is a stable column that falls at speed, leans south with the wind and stays near the walker without following them', () => {
  const eye = [3.2, -4.1, 1.6], at = (i, s, e = eye, w = 0) => rainDrop(i, s, e, w);
  for (let i = 0; i < RAIN.count; i++) {
    const d = at(i, 12.3, eye, .5); assert.ok(d.every(Number.isFinite));
    assert.ok(Math.hypot(d[0] - eye[0], d[1] - eye[1]) <= RAIN.radius);
    assert.ok(Math.hypot(...at(i, 5, eye, 1).slice(0, 2).map((v, k) => v - eye[k])) <= RAIN.radius);
  }
  assert.deepEqual(at(7, 3.3), at(7, 3.3));
  const a = at(7, 3.3), b = at(7, 3.4); assert.ok(Math.abs((a[2] - b[2]) - RAIN.speed * .1) < 1e-9 || Math.abs((a[2] - b[2]) + RAIN.height - RAIN.speed * .1) < 1e-9);
  const c = at(7, 3.3, eye, 0), d = at(7, 3.4, eye, 0); assert.ok(Math.abs(c[0] - d[0]) < 1e-12 && Math.abs(c[1] - d[1]) < 1e-12);
  const [e, f] = [at(7, 3.3, eye, .5), at(7, 3.4, eye, .5)]; assert.ok(e[1] - f[1] !== 0 && Math.abs(e[0] - f[0]) < 1e-12);
  const fallen = eye[2] + RAIN.height * .4 - at(7, 3.3)[2], leant = at(7, 3.3, eye, .5), upright = at(7, 3.3);
  assert.ok(Math.abs((upright[1] - leant[1]) - RAIN.slant * .5 * fallen) < 1e-9);
  const moved = at(7, 3.3, [eye[0] + .5, eye[1] + .5, eye[2]]); assert.deepEqual(moved.slice(0, 2), upright.slice(0, 2));
});

test('rain falls in the open, is kept off by the roof and thinned by the oak, and shows nothing when it is not raining', () => {
  const scene = new THREE.Scene(), layout = lifeLayout(), rain = PRESENTERS.rain(THREE, {scene, layout}), lines = scene.getObjectByName('rain');
  const camera = (x, y, z) => ({position: {x, y: z, z: -y}});
  const frame = (at, extra = {}) => ({weather: {rain: .8, wind: .5}, motionSeconds: 5, camera: camera(...at), ...extra});
  const shown = () => lines.geometry.drawRange.count / 2;
  const open = [14, 6, 1.6], {roof, oak} = layout.weather.shelter;
  assert.equal(rain.update(frame(open)), true); assert.equal(lines.visible, true);
  assert.ok(shown() > 500 && shown() <= Math.round(RAIN.count * .8));
  assert.ok(Math.abs(lines.material.opacity - (.10 + .8 * .13)) < 1e-12); assert.equal(lines.material.depthWrite, false);
  assert.ok(lines.geometry.attributes.position.array.every(Number.isFinite));
  const inOpen = shown();
  rain.update(frame([roof.center[0], roof.center[1], 1.6])); assert.ok(shown() < inOpen * .5, 'under the roof');
  rain.update(frame([oak.center[0], oak.center[1], 1.6])); assert.ok(shown() < inOpen && shown() > 0, 'under the oak');
  assert.equal(rain.update(frame(open, {weather: {rain: .05, wind: .5}})), false); assert.equal(lines.visible, false); assert.equal(shown(), 0);
  rain.update(frame(open)); rain.update(frame(open)); assert.equal(shown(), inOpen);
  rain.dispose(); assert.equal(scene.children.length, 0);
});
