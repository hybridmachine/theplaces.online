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
  cottage.update({snapshot: {world: {}}, study: 'night', calendar: {light: .25}, fixture: null});
  cottage.dispose(); assert.deepEqual(poses.at(-1), {main: 0, second: 0, open: 0});
  assert.equal(scene.children.length, 2, 'given up, the lights stay so no shader is rebuilt'); assert.equal(main.intensity, 0); assert.equal(second.intensity, 0);
  cottage.dispose({final: true}); assert.equal(scene.children.length, 0);
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
    assert.ok(Math.abs(mesh.position.x - cx) <= .6 + 1e-9, 'wanders at most .6 m across the wind');
    const {opacity, tint} = mesh.material.uniforms; assert.ok(opacity.value <= .45 && opacity.value >= 0);
    assert.ok(Math.abs(tint.value.r - 209 / 255) < 1e-6);
    assert.equal(mesh.material.depthWrite, false); assert.equal(mesh.material.transparent, true);
    assert.equal(mesh.material.fog, true); assert.ok('fogColor' in mesh.material.uniforms && /#include <fog_fragment>/.test(mesh.material.fragmentShader));
  }
  puffs.forEach((puff, i) => {
    const {seed} = smokePlace(puff, layout), u = group.children[i].material.uniforms;
    assert.equal(u.seed.value, seed); assert.equal(u.age.value, puff.age);
  });
  assert.equal(new Set(puffs.map(p => smokePlace(p, layout).seed)).size, puffs.length, 'each puff its own ragged edge');
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
test('a rain drop is a column fixed in the world that falls at speed, leans south with the wind and wraps around the walker', () => {
  const eye = [3.2, -4.1, 1.6], at = (i, s, e = eye, w = 0) => rainDrop(i, s, e, w), R = RAIN.radius;
  for (let i = 0; i < RAIN.count; i++) {
    const d = at(i, 12.3, eye, .5); assert.ok(d.every(Number.isFinite));
    const c = at(i, 12.3);
    assert.ok(c[0] >= eye[0] - R && c[0] < eye[0] + R && c[1] >= eye[1] - R && c[1] < eye[1] + R);
  }
  assert.deepEqual(at(7, 3.3), at(7, 3.3));
  const a = at(7, 3.3), b = at(7, 3.4); assert.ok(Math.abs((a[2] - b[2]) - RAIN.speed * .1) < 1e-9 || Math.abs((a[2] - b[2]) + RAIN.height - RAIN.speed * .1) < 1e-9);
  const c = at(7, 3.3, eye, 0), d = at(7, 3.4, eye, 0); assert.ok(Math.abs(c[0] - d[0]) < 1e-12 && Math.abs(c[1] - d[1]) < 1e-12);
  const [e, f] = [at(7, 3.3, eye, .5), at(7, 3.4, eye, .5)]; assert.ok(e[1] - f[1] !== 0 && Math.abs(e[0] - f[0]) < 1e-12);
  const fallen = eye[2] + RAIN.height * .4 - at(7, 3.3)[2], leant = at(7, 3.3, eye, .5), upright = at(7, 3.3);
  assert.ok(Math.abs((upright[1] - leant[1]) - RAIN.slant * .5 * fallen) < 1e-9);
  let wrapped = 0;
  for (const i of [0, 1, 2, 3, 50, 400, 899]) for (const [dx, dy] of [[.5, 0], [0, .5], [.5, .5], [-.5, -.5], [3, 2]]) {
    const before = at(i, 3.3), after = at(i, 3.3, [eye[0] + dx, eye[1] + dy, eye[2]]);
    for (const k of [0, 1]) {
      const shift = Math.round((after[k] - before[k]) / (2 * R));
      assert.ok(Math.abs(after[k] - before[k] - shift * 2 * R) < 1e-9 && Math.abs(shift) <= 1); wrapped += Math.abs(shift);
    }
  }
  assert.ok(wrapped < 12);
});

test('the rain presenter draws each streak exactly where rainDrop puts it', () => {
  const scene = new THREE.Scene(), layout = lifeLayout(), rain = PRESENTERS.rain(THREE, {scene, layout}), lines = scene.getObjectByName('rain');
  const p = lines.geometry.attributes.position.array, length = RAIN.length;
  for (const [eye, seconds, wind] of [[[-25, -25, 1.6], 5, .5], [[-31.4, -22.2, 1.7], 1234.567, 1], [[-25, -28, 1.5], .2, 0]]) {
    rain.update({weather: {rain: 1, wind}, motionSeconds: seconds, camera: {position: {x: eye[0], y: eye[2], z: -eye[1]}}});
    assert.equal(lines.geometry.drawRange.count, RAIN.count * 2, 'the open: every streak drawn, in order');
    const lean = RAIN.slant * wind * length;
    for (const i of [0, 1, 2, 17, 600, 1999, RAIN.count - 1]) {
      const [x, y, z] = rainDrop(i, seconds, eye, wind), k = i * 6;
      for (const [got, want] of [[p[k], x], [p[k + 1], z], [p[k + 2], -y], [p[k + 3], x], [p[k + 4], z - length], [p[k + 5], -y + lean]])
        assert.ok(Math.abs(got - want) < 1e-4, `streak ${i}: ${got} against ${want}`);
    }
  }
  rain.dispose();
});

test('rain falls in the open, is kept off by the roof and thinned by the oak, and shows nothing when it is not raining', () => {
  const scene = new THREE.Scene(), layout = lifeLayout(), rain = PRESENTERS.rain(THREE, {scene, layout}), lines = scene.getObjectByName('rain');
  const camera = (x, y, z) => ({position: {x, y: z, z: -y}});
  const frame = (at, extra = {}) => ({weather: {rain: .8, wind: .5}, motionSeconds: 5, camera: camera(...at), ...extra});
  const shown = () => lines.geometry.drawRange.count / 2;
  const open = [-25, -25, 1.6], {roof, oak} = layout.weather.shelter;
  assert.equal(rain.update(frame(open)), true); assert.equal(lines.visible, true);
  assert.equal(shown(), Math.round(RAIN.count * .8));
  assert.ok(Math.abs(lines.material.opacity - (.10 + .8 * .13)) < 1e-12); assert.equal(lines.material.depthWrite, false);
  assert.ok(lines.geometry.attributes.position.array.every(Number.isFinite));
  const inOpen = shown();
  rain.update(frame([roof.center[0], roof.center[1], 1.6])); assert.ok(shown() < inOpen * .9, 'under the roof');
  rain.update(frame([oak.center[0], oak.center[1], 1.6])); assert.ok(shown() < inOpen * .9 && shown() > 0, 'under the oak');
  assert.equal(rain.update(frame(open, {weather: {rain: .05, wind: .5}})), false); assert.equal(lines.visible, false); assert.equal(shown(), 0);
  rain.update(frame(open)); rain.update(frame(open)); assert.equal(shown(), inOpen);
  rain.dispose(); assert.equal(scene.children.length, 0);
});

import {createTraces, surfaceNow} from '../public/space/life/traces.js';
import {dripPose, surfaceFixture} from '../shared/surface-weather.js';
import {terrainHeight} from '../shared/space.js';
import {LAKESIDE_SPACE as SPACE} from '../shared/lakeside-space.js';
import {createSurfaceState} from '../shared/surface-weather.js';

test('the surface is a study\'s fixture, the shared state when fresh, and nothing when 61 seconds stale', () => {
  const now = 1_700_000_000_000, state = createSurfaceState(now), snapshot = {world: {environment: state}};
  assert.deepEqual(surfaceNow({study: 'rain', snapshot, epoch: 0, now}), surfaceFixture('rain'));
  assert.deepEqual(surfaceNow({fixture: {surface: surfaceFixture('drying')}, study: 'rain', snapshot, epoch: 0, now}), surfaceFixture('drying'));
  assert.ok(surfaceNow({snapshot, epoch: 0, now: now + 1000}));
  assert.equal(surfaceNow({snapshot, epoch: 0, now: now + 61_000}), null);
});

test('traces darken the path and shore, fill the puddle in the sky\'s colour, and drip from the oak to the ground', () => {
  const scene = new THREE.Scene(), layout = lifeLayout(), wets = [], yard = {setWet: w => wets.push(w), sky: {zenith: [.2, .4, .8], horizon: [.8, .6, .4]}};
  const traces = PRESENTERS.traces(THREE, {scene, yard, space: SPACE, layout}), puddle = scene.getObjectByName('puddle');
  const stale = {snapshot: {world: {environment: createSurfaceState(0)}}, epoch: 0, now: 61_000, motion: true, motionSeconds: 0};
  assert.equal(traces.update(stale), false); assert.deepEqual(wets.at(-1), {path: 0, stone: 0}); assert.equal(puddle.visible, false);
  assert.ok(scene.getObjectByName('drip-0') && !scene.getObjectByName('drip-0').visible);
  const rain = surfaceFixture('rain'), frame = {study: 'rain', weather: {rain: 0}, motion: true, motionSeconds: 0};
  assert.equal(traces.update(frame), true);
  assert.deepEqual(wets.at(-1), {path: rain.pathWetness, stone: rain.stoneWetness});
  assert.equal(puddle.visible, true); assert.ok(puddle.material.opacity > .8 && puddle.material.opacity <= .85 + 1e-9);
  assert.ok(puddle.material.color.r > 0 && puddle.material.color.b > 0);
  const {center} = layout.weather.puddle, p = puddle.geometry.attributes.position, n = puddle.geometry.attributes.normal;
  assert.equal(p.count, 29);
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(p.getY(i) - terrainHeight(SPACE, p.getX(i), -p.getZ(i)) - .015) < 1e-5); assert.ok(n.getY(i) > 0, 'faces up');
    assert.ok(Math.hypot(p.getX(i) - center[0], -p.getZ(i) - center[1]) < 1);
  }
  assert.ok(Math.abs(p.getX(0) - center[0]) < 1e-5); assert.equal(puddle.geometry.attributes.color.getW(0), 1); assert.equal(puddle.geometry.attributes.color.getW(p.count - 1), 0);
  traces.update({...frame, study: 'day'}); assert.equal(puddle.visible, false);
  // A drip: find a second at which one falls under canopy storage and low rain, then see it fall the whole way.
  const wet = {surface: {...surfaceFixture('wet'), canopyStorage: 1, puddleStorage: 0}}, drip = layout.weather.drips[0], line = scene.getObjectByName(drip.id);
  let s = 0; while (!dripPose(s, {x: 0, y: 0, fall: 1, seed: drip.seed}, 1, 0)) s += 5;
  s += .5;
  const pose = dripPose(s, {x: 0, y: 0, fall: 1, seed: drip.seed}, 1, 0), at = {fixture: wet, weather: {rain: 0}, motion: true, motionSeconds: s};
  assert.equal(traces.update(at), true); assert.equal(line.visible, true);
  assert.ok(Math.abs(line.geometry.attributes.position.getY(0) - (drip.top[2] - drip.fall * pose.y)) < 1e-5);
  assert.ok(Math.abs(line.material.opacity - pose.alpha) < 1e-12);
  assert.ok(drip.top[2] - drip.fall * 1 >= terrainHeight(SPACE, drip.top[0], drip.top[1]) - 1e-9);
  traces.update({...at, motion: false}); assert.equal(line.visible, false);
  traces.update(frame); assert.notDeepEqual(wets.at(-1), {path: 0, stone: 0});
  traces.dispose(); assert.equal(scene.children.length, 0); assert.deepEqual(wets.at(-1), {path: 0, stone: 0}, 'disposed, it leaves the yard dry');
});

import {createRipples, rippleNow} from '../public/space/life/ripples.js';
import {coincidenceFixture} from '../shared/coincidences.js';

test('a rising fish rings the lake at its spot, and only in motion and outside a study', () => {
  const layout = lifeLayout(), motion = true, fixture = {coincidence: coincidenceFixture(4, 'open-water')};
  const r = rippleNow({fixture, motion, snapshot: {world: {}}, now: 0}, layout);
  assert.deepEqual(r.center, layout.ripples['open-water'].center); assert.equal(r.radius, layout.ripples['open-water'].radius);
  assert.ok(Math.abs(r.age - .4) < 1e-9); assert.ok(Number.isFinite(r.variation));
  for (const id of ['shore-reflection', 'near-water']) assert.deepEqual(rippleNow({fixture: {coincidence: coincidenceFixture(1, id)}, motion, now: 0}, layout).center, layout.ripples[id].center);
  assert.equal(rippleNow({fixture, motion, study: 'day', snapshot: {world: {}}, now: 0}, layout), null);
  assert.equal(rippleNow({fixture, motion: false, snapshot: {world: {}}, now: 0}, layout), null);
  assert.equal(rippleNow({fixture: {coincidence: {...coincidenceFixture(4), state: {}}}, motion, now: 0}, layout), null);
  assert.equal(rippleNow({fixture: {coincidence: {...coincidenceFixture(4), now: 0}}, motion, now: 0}, layout), null);
  assert.equal(rippleNow({fixture: {coincidence: {...coincidenceFixture(4), now: 1e9}}, motion, now: 0}, layout), null);
  assert.equal(rippleNow({motion, snapshot: {}, now: 0}, layout), null);
  const seen = [], ripples = createRipples(THREE, {yard: {setRipple: v => seen.push(v)}, layout});
  assert.equal(ripples.update({fixture, motion, now: 0}), true); assert.ok(seen.at(-1).age > 0);
  assert.equal(ripples.update({motion, snapshot: {world: {}}, now: 0}), false); assert.equal(seen.at(-1), null);
  assert.equal(PRESENTERS.ripples, createRipples);
});

import {birdNow, createBird, DRAWN} from '../public/space/life/bird.js';
import {birdFixture, birdProgress, createBirdState} from '../shared/bird.js';
import {LAKESIDE_BIRD} from '../shared/lakeside-bird.js';
import {birdPlace} from '../shared/lakeside-life.js';

const DAY = {elevation: .5, light: 1}, NIGHT = {elevation: -.3, light: 0};
const birdFrame = (extra = {}) => ({snapshot: {world: {}}, now: 0, study: null, motion: true, calendar: DAY, fixture: null, ...extra});
const midFlight = name => birdFixture(name, LAKESIDE_BIRD.routes[{'Oak flight': 'nest:oak-perch', 'Shelter flight': 'oak-perch:oak-shelter', 'Roof flight': 'oak-perch:roof-perch'}[name]].durationMs / 2);

test('the bird is where the shared bird is: none in a study unless a fixture says, none building by night, settled under reduced motion', () => {
  const layout = lifeLayout(), perch = birdFixture('Oak perch'), world = {bird: perch.state, action: null};
  assert.deepEqual(birdNow(birdFrame({snapshot: {world}}), layout), birdPlace(birdProgress(perch.state, null, 0), layout));
  assert.equal(birdNow(birdFrame({snapshot: {world}, study: 'day'}), layout), null);
  const flight = midFlight('Oak flight'), flying = birdNow(birdFrame({snapshot: {world}, study: 'day', fixture: {bird: flight}}), layout);
  assert.deepEqual(flying, birdPlace(birdProgress(flight.state, null, flight.now), layout)); assert.equal(flying.flying, true);
  const building = {bird: createBirdState(0, true), action: {start: 0, end: 60_000}};
  assert.equal(birdNow(birdFrame({snapshot: {world: building}, now: 10_000, calendar: NIGHT}), layout), null);
  const forage = birdNow(birdFrame({snapshot: {world: building}, now: 10_000}), layout);
  assert.ok(forage.flying && forage.position.every(Number.isFinite));
  assert.deepEqual(birdNow(birdFrame({snapshot: {world: building}, now: 10_000, motion: false}), layout).position, layout.bird.locations.nest.point);
  const settled = birdNow(birdFrame({fixture: {bird: flight}, motion: false}), layout);
  assert.deepEqual(settled.position, layout.bird.locations.nest.point); assert.equal(settled.flying, false);
  assert.equal(birdNow(birdFrame(), layout), null);
  assert.equal(birdNow(birdFrame({snapshot: {world: {bird: {id: 'nonsense'}}}}), layout), null);
});

test('the bird is a small painted model that sits with its feet on its place, beats its wings in flight and carries its twig', () => {
  const scene = new THREE.Scene(), layout = lifeLayout(), bird = createBird(THREE, {scene, layout}), group = scene.getObjectByName('bird');
  const part = name => group.getObjectByName(name), finite = () => { scene.updateMatrixWorld(true); let ok = true; group.traverse(o => { ok &&= o.matrixWorld.elements.every(Number.isFinite); }); return ok; };
  assert.equal(group.visible, false);
  assert.equal(bird.update(birdFrame({fixture: {bird: midFlight('Roof flight')}})), true);
  assert.equal(group.visible, true); assert.ok(finite());
  assert.equal(part('legs').visible, false); assert.equal(part('twig').visible, false);
  const wing = part('wing-right'), spread = wing.quaternion.clone();
  bird.update(birdFrame({fixture: {bird: {...midFlight('Roof flight'), now: midFlight('Roof flight').now + 40}}}));
  assert.ok(wing.quaternion.angleTo(spread) > 1e-3, 'the wing beats');
  assert.equal(bird.update(birdFrame({fixture: {bird: birdFixture('Oak perch')}})), true); assert.ok(finite());
  assert.equal(part('legs').visible, true);
  const folded = wing.quaternion.clone();
  bird.update(birdFrame({fixture: {bird: birdFixture('Oak perch', 999)}})); assert.ok(wing.quaternion.angleTo(folded) < 1e-9, 'a perched bird keeps its wings folded');
  const at = layout.bird.locations['oak-perch'].point, local = g => { g.computeBoundingBox(); return g.boundingBox; };
  const length = local(part('body').geometry).clone().union(local(part('tail').geometry)).getSize(new THREE.Vector3()).x * part('body').parent.scale.x;
  assert.ok(Math.abs(new THREE.Box3().setFromObject(part('legs')).min.y - at[2]) < .001, 'feet on the perch');
  assert.ok(Math.abs(length - layout.bird.length * DRAWN) < .01 * DRAWN, 'its length, beak to tail');
  const facing = layout.bird.locations['oak-perch'].facing, nose = new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion);
  assert.ok(Math.abs(nose.x - Math.sin(facing)) < 1e-9 && Math.abs(-nose.z - Math.cos(facing)) < 1e-9, 'it faces as the place says');
  assert.equal(DRAWN, 2); assert.ok(Math.abs(length - .36) < .01, 'about 36 cm long');
  const building = {snapshot: {world: {bird: createBirdState(0, true), action: {start: 0, end: 60_000}}}, now: 48_000};
  assert.equal(bird.update(birdFrame(building)), true); assert.equal(part('twig').visible, true); assert.ok(finite());
  assert.equal(bird.update(birdFrame({...building, motion: false})), true); assert.equal(part('twig').visible, false);
  assert.ok(wing.quaternion.angleTo(folded) < 1e-9, 'reduced motion never beats');
  assert.equal(bird.update(birdFrame({study: 'day'})), false); assert.equal(group.visible, false);
  const made = new Set(), freed = new Set();
  group.traverse(o => { if (o.geometry) { made.add(o.geometry); const d = o.geometry.dispose.bind(o.geometry); o.geometry.dispose = () => { freed.add(o.geometry); d(); }; } });
  assert.ok(made.size >= 5);
  bird.dispose(); assert.equal(freed.size, made.size); assert.equal(scene.children.length, 0);
  assert.equal(PRESENTERS.bird, createBird);
});

import {createNest} from '../public/space/life/nest.js';
test('the nest is three twig strokes for each material brought, built in the fork and rebuilt only when that count changes', () => {
  const scene = new THREE.Scene(), layout = lifeLayout(), nest = createNest(THREE, {scene, layout}), mesh = scene.getObjectByName('nest');
  const frame = materials => ({snapshot: {world: {nest: {materials}}}});
  assert.equal(nest.update({snapshot: {world: {}}}), false); assert.equal(mesh.visible, false);
  assert.equal(nest.update(frame(0)), false); assert.equal(mesh.visible, false); assert.equal(mesh.userData.strokes, 0);
  assert.equal(nest.update(frame(5)), true); assert.equal(mesh.userData.strokes, 15);
  const five = mesh.geometry, perStroke = five.index.count / 15;
  nest.update(frame(5)); assert.equal(mesh.geometry, five, 'not rebuilt');
  assert.equal(nest.update(frame(12)), true); assert.equal(mesh.userData.strokes, 36); assert.equal(mesh.geometry.index.count, 36 * perStroke);
  const p = mesh.geometry.attributes.position, at = toThreeV(layout.bird.locations.nest.point);
  for (let i = 0; i < p.count; i++) assert.ok(Math.hypot(p.getX(i) - at[0], p.getY(i) - at[1], p.getZ(i) - at[2]) < .3);
  const c = mesh.geometry.attributes.color, twig = new THREE.Color('#b2a079');
  assert.ok(Math.abs(c.getX(0) - twig.r) < 1e-6);
  assert.equal(nest.update({snapshot: {world: {}}}), false); assert.equal(mesh.visible, false);
  nest.dispose(); assert.equal(scene.children.length, 0);
  assert.equal(PRESENTERS.nest, createNest);
});
const toThreeV = ([x, y, z]) => [x, z, -y];

import {createFarBirds, farBirdsNow} from '../public/space/life/far-birds.js';
test('three far birds cross the sky over the lake for 23 seconds in every 135, southward, by day only', () => {
  const layout = lifeLayout(), [a0, a1] = layout.farBirds.azimuth, [e0, e1] = layout.farBirds.elevation;
  const five = farBirdsNow(5, 1, layout); assert.equal(five.length, 3);
  for (const b of five) {
    assert.ok(b.azimuth >= a0 && b.azimuth <= a1 && b.elevation >= e0 && b.elevation <= e1);
    assert.ok(Math.abs(b.wing) <= 1);
  }
  for (const s of [0, 23]) for (const b of farBirdsNow(s, 1, layout)) assert.ok(b.azimuth >= a0 - 1e-9 && b.azimuth <= a1 + 1e-9);
  const later = farBirdsNow(12, 1, layout); later.forEach((b, i) => assert.ok(b.azimuth > five[i].azimuth, 'moves south'));
  assert.deepEqual(farBirdsNow(30, 1, layout), []); assert.deepEqual(farBirdsNow(5, .3, layout), []);
  assert.equal(farBirdsNow(135 + 5, 1, layout).length, 3);
  const scene = new THREE.Scene(), birds = createFarBirds(THREE, {scene, layout, yard: {}}), group = scene.getObjectByName('far-birds');
  const camera = new THREE.PerspectiveCamera(); camera.position.set(1, 1.6, -2);
  const frame = (extra = {}) => ({study: null, motion: true, motionSeconds: 5, calendar: DAY, camera, ...extra});
  assert.equal(birds.update(frame()), true); assert.equal(group.children.filter(m => m.visible).length, 3);
  for (const [i, m] of group.children.entries()) {
    assert.ok(Math.abs(m.position.distanceTo(camera.position) - 900) < 1e-6); assert.equal(m.material.fog, false);
    const {azimuth, elevation} = five[i], d = m.position.clone().sub(camera.position).normalize();
    assert.ok(Math.abs(d.y - Math.sin(elevation)) < 1e-9 && Math.abs(Math.atan2(d.x, -d.z) - azimuth) < 1e-9);
  }
  for (const extra of [{study: 'day'}, {motion: false}, {motionSeconds: 30}, {calendar: {light: .3}}]) {
    assert.equal(birds.update(frame(extra)), false); assert.equal(group.visible, false);
  }
  birds.dispose(); assert.equal(scene.children.length, 0);
  assert.deepEqual(Object.keys(PRESENTERS).slice(-4), ['ripples', 'bird', 'nest', 'farBirds']); assert.equal(PRESENTERS.farBirds, createFarBirds);
});

test('a real presenter that fails gives back the yard state it set: the cottage dark, the ground dry, no ripple, the cards at rest', () => quiet(warnings => {
  const scene = new THREE.Scene(), layout = lifeLayout(), seen = {cottage: [], wet: [], ripple: []};
  const yard = {setCottage: v => seen.cottage.push(v), setWet: v => seen.wet.push(v), setRipple: v => seen.ripple.push(v), sky: null};
  // one good frame, then the presenter's own update runs again and throws after it has set the yard
  const failing = make => (T, ctx) => { const p = make(T, ctx); let runs = 0; return {update(f) { const r = p.update(f); if (++runs === 2) throw new Error('boom'); return r; }, dispose: o => p.dispose(o)}; };
  const life = createLife(THREE, {scene, yard, layout, space: SPACE}, Object.fromEntries(['cottage', 'traces', 'ripples', 'wind'].map(n => [n, failing(PRESENTERS[n])])));
  const frame = {snapshot: {world: {}}, now: 0, epoch: 0, study: null, motion: true, motionSeconds: 1e7 + .25, calendar: {light: .25}, weather: {rain: 0},
    fixture: {cottagePose: {main: 1, second: .65, open: 0}, surface: surfaceFixture('rain'), coincidence: coincidenceFixture(4, 'open-water')}};
  life.update(frame);
  assert.deepEqual(life.status, {cottage: 'active', traces: 'active', ripples: 'active', wind: 'active'});
  assert.equal(seen.cottage.at(-1).main, 1); assert.ok(seen.wet.at(-1).path > 0); assert.ok(seen.ripple.at(-1)); assert.ok(SWAY_UNIFORMS.windStrength.value > 0);
  const lights = scene.children.filter(o => o.isPointLight); assert.ok(lights.some(l => l.intensity > 0));
  life.update(frame);
  assert.deepEqual(life.status, {cottage: 'failed', traces: 'failed', ripples: 'failed', wind: 'failed'}); assert.equal(warnings.length, 4);
  assert.deepEqual(seen.cottage.at(-1), {main: 0, second: 0, open: 0}); assert.deepEqual(seen.wet.at(-1), {path: 0, stone: 0});
  assert.equal(seen.ripple.at(-1), null); assert.equal(SWAY_UNIFORMS.windStrength.value, 0);
  assert.deepEqual(scene.children.filter(o => o.isPointLight), lights, 'the dark lights stay in the scene'); assert.ok(lights.every(l => l.intensity === 0));
  life.dispose();
}));

import {createPathLights} from '../public/space/life/path-lights.js';
test('the path lights follow the sun: lit at night, dark by day, dark without a calendar and when let go', () => {
  assert.equal(PRESENTERS.pathLights, createPathLights);
  const levels = [], lights = PRESENTERS.pathLights({}, {yard: {setPathLights: level => levels.push(level)}});
  assert.equal(lights.update({calendar: {elevation: -.5, hour: 1}}), true); assert.equal(levels.at(-1), 1);
  assert.equal(lights.update({calendar: {elevation: .6, hour: 13}}), false); assert.equal(levels.at(-1), 0);
  assert.equal(lights.update({calendar: {elevation: -.5, hour: 23}}), true);
  assert.equal(lights.update({}), false); assert.equal(levels.at(-1), 0);
  lights.update({calendar: {elevation: -.5, hour: 1}}); lights.dispose(); assert.equal(levels.at(-1), 0);
});
