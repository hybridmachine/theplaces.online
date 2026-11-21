import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {buildInterior} from '../public/space/interior/index.js';
import {LAKESIDE_SPACE} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING} from '../shared/lakeside-dressing.js';
import {viewOpenings} from '../shared/window-views.js';
import {stubArt} from './space-scene.test.js';
import {createLightField, interiorDials} from '../shared/interior-light.js';

const openings = viewOpenings(I, LAKESIDE_SPACE, LAKESIDE_DRESSING);
const build = () => buildInterior(THREE, {interior: I, art: stubArt(), openings});
const paneOf = (scene, id) => scene.getObjectByName(`pane-${id}`);
const world = m => { m.updateMatrixWorld(true); return new THREE.Box3().setFromObject(m); };

const box = m => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox; };
test('the shell builds its named parts with finite geometry inside the blueprint', () => {
  const {scene, dispose} = build();
  for (const name of ['floors', 'ceilings', 'walls', 'stair', 'frames', ...openings.map(o => `pane-${o.id}`)]) {
    const m = scene.getObjectByName(name); assert.ok(m, name);
    const p = m.geometry.getAttribute('position'); assert.ok(p.count > 0 && [...p.array].every(Number.isFinite), name);
    const b = box(m);   // three: x = a, y = up, z = −d
    assert.ok(b.min.x >= -.2 && b.max.x <= 18.2 && b.min.z >= -12.2 && b.max.z <= .2 && b.min.y >= -.01 && b.max.y <= 6.7, `${name} ${JSON.stringify(b)}`);
  }
  assert.equal(scene.fog, null);
  dispose();
});
test('the stair climbs 3 m in 15 treads', () => {
  const {scene, setSky, dispose} = build(), stair = box(scene.getObjectByName('stair'));
  assert.ok(stair.min.x >= 9.6 - .01 && stair.max.x <= 11.01 && Math.abs(stair.max.y - 3.9) < .05, 'treads to 3 m plus a 0.9 m rail');
  dispose();
});
test('each opening has its own pane, flat until made live', () => {
  const {scene, dispose} = build(), panes = openings.map(o => paneOf(scene, o.id));
  assert.equal(panes.length, 7); assert.ok(panes.every(Boolean));
  assert.equal(scene.getObjectByName('glass'), undefined);
  assert.equal(new Set(panes.map(p => p.material)).size, 1, 'one shared flat material');
  assert.ok(panes[0].material.isMeshBasicMaterial && !panes[0].material.stencilWrite);
  dispose();
});
test('live panes mark the stencil with their own number and write no colour or depth', () => {
  const {scene, setLive, stencilOf, dispose} = build(), flat = paneOf(scene, 'study').material;
  setLive(['door', 'living']);
  assert.deepEqual(['door', 'living', 'study', 'dining'].map(stencilOf), [1, 2, 0, 0]);
  for (const [id, n] of [['door', 1], ['living', 2]]) {
    const m = paneOf(scene, id).material;
    assert.deepEqual([m.colorWrite, m.depthWrite, m.depthTest, m.stencilWrite, m.stencilFunc, m.stencilZPass, m.stencilRef],
      [false, false, true, true, THREE.AlwaysStencilFunc, THREE.ReplaceStencilOp, n], id);
  }
  assert.equal(paneOf(scene, 'study').material, flat);
  setLive([]);
  assert.ok(openings.every(o => paneOf(scene, o.id).material === flat && stencilOf(o.id) === 0));
  // Each id is numbered by its place in the list; an id the room does not know gets no number, and the others keep their places' numbers.
  setLive(['nowhere', 'living', 'study']);
  assert.deepEqual(['nowhere', 'living', 'study'].map(stencilOf), [0, 2, 3]);
  assert.equal(paneOf(scene, 'living').material.stencilRef, 2);
  dispose();
});
test('the casement leaf is one column of three panes: two horizontal bars and no vertical one', () => {
  const {scene, dispose} = build(), leaf = scene.getObjectByName('casement'), living = openings[0], [lx, ly] = living.half;
  leaf.updateMatrixWorld(true);
  const p = leaf.geometry.getAttribute('position'), v = new THREE.Vector3(), x0 = living.centre[0] - lx, x1 = x0 + 2 * lx / 3, FRAME = .07, BAR = .03;
  const bar = y => [-1, 1].some(k => Math.abs(Math.abs(y - living.centre[2] - k * ly / 3) - BAR / 2) < 1e-4);
  let inner = 0, crossing = 0;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(leaf.matrixWorld);
    if (v.x <= x0 + FRAME + 1e-4 || v.x >= x1 - FRAME - 1e-4 || Math.abs(v.y - living.centre[2]) >= ly - FRAME - 1e-4) continue;
    inner++; if (bar(v.y)) crossing++;
  }
  assert.equal(crossing, inner, 'nothing but the two horizontal bars stands inside its frame');
  for (const k of [-1, 1]) assert.ok([...Array(p.count).keys()].some(i => { v.fromBufferAttribute(p, i).applyMatrix4(leaf.matrixWorld); return Math.abs(v.y - living.centre[2] - k * ly / 3 - BAR / 2) < 1e-4; }), `bar at ${k}/3`);
  dispose();
});
test('panes are drawn after everything else in the room but the casement leaf, which stands beyond them', () => {
  const {scene, dispose} = build(); let top = -Infinity, low = Infinity;
  scene.traverse(o => { if (!o.isMesh || o.name === 'casement') return; if (o.name.startsWith('pane-')) low = Math.min(low, o.renderOrder); else top = Math.max(top, o.renderOrder); });
  assert.ok(low > top, `${low} > ${top}`);
  // The leaf comes after the panes and gives its pixels back to stencil 0, so no view through the glass is drawn over it.
  const leaf = scene.getObjectByName('casement').material;
  assert.ok(scene.getObjectByName('casement').renderOrder > low);
  assert.deepEqual([leaf.stencilWrite, leaf.stencilFunc, leaf.stencilZPass, leaf.stencilRef, leaf.colorWrite, leaf.side], [true, THREE.AlwaysStencilFunc, THREE.ReplaceStencilOp, 0, true, THREE.DoubleSide]);
  dispose();
});
test('the flat panes still take the sky\'s horizon colour', () => {
  const {scene, setSky, dispose} = build();
  setSky({zenith: [.1, .2, .3], horizon: [.4, .5, .6]});
  for (const o of openings) {
    const c = paneOf(scene, o.id).material.color.getRGB({}, THREE.SRGBColorSpace);
    assert.ok(Math.abs(c.r - .4) < .01 && Math.abs(c.g - .5) < .01 && Math.abs(c.b - .6) < .01, o.id);
  }
  dispose();
});
test('a pane is the opening\'s rectangle', () => {
  const {scene, dispose} = build();
  for (const o of openings) {
    const b = world(paneOf(scene, o.id)), c = o.centre, [hx, hy] = o.half;
    const want = new THREE.Box3(); for (const [s, t] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const p = c.map((v, i) => v + s * hx * o.across[i] + t * hy * o.up[i]); want.expandByPoint(new THREE.Vector3(p[0], p[2], -p[1])); }
    assert.ok(b.min.distanceTo(want.min) < 1e-4 && b.max.distanceTo(want.max) < 1e-4, o.id);
  }
  dispose();
});
test('the casement swings outward about its chimney-side edge', () => {
  const {scene, setCasement, dispose} = build(), leaf = scene.getObjectByName('casement'), living = openings[0], lowA = living.centre[0] - living.half[0];
  assert.ok(leaf);
  const shut = world(leaf);
  assert.ok(Math.abs(shut.min.x - lowA) < 1e-3 && shut.max.x - lowA > .4 && shut.max.x - lowA < .5, 'the window\'s low-a third');
  assert.ok(Math.abs(shut.min.z - I.wall / 2) < .05 && Math.abs(shut.max.z - I.wall / 2) < .05, 'in the pane\'s plane');   // three z = −d
  setCasement(1);
  const open = world(leaf);
  assert.ok(open.max.z > I.wall / 2 + .3, 'the free edge is outside the wall');
  assert.ok(Math.abs(open.min.x - lowA) < 1e-3 || Math.abs(open.min.x - lowA) < .02, 'the hinge edge has not moved');
  setCasement(0); assert.ok(world(leaf).max.z < I.wall / 2 + .1);
  dispose();
});
test('the door leaf swings into the hall and, open, stands on the blueprint\'s leaf', () => {
  const {scene, setDoor, dispose} = build(), leaf = scene.getObjectByName('door-leaf'), L = I.doorLeaf;
  assert.ok(leaf && leaf.material.side === THREE.DoubleSide);
  const shut = world(leaf);
  assert.ok(Math.abs(shut.min.x - L.a) < .01 && Math.abs(shut.max.x - (L.a + 1)) < .01 && Math.abs(shut.min.z) < .06 && Math.abs(shut.max.z) < .06 && Math.abs(shut.max.y - 2.1) < 1e-3, 'shut');
  setDoor(1);
  const open = world(leaf);
  assert.ok(open.min.x > L.a - .1 && open.max.x < L.a + .15, 'at a = 8.5');   // 1.45 rad is not quite square: the free edge is cos 1.45 = .12 off, plus the leaf's thickness
  assert.ok(-open.max.z > L.d[0] - .1 && -open.min.z < L.d[1] + .1 && -open.min.z > .85, 'd 0–1, into the hall');
  assert.ok(open.min.y > -.01 && open.max.y < 2.11);
  setDoor(0); assert.ok(world(leaf).max.x > L.a + .9);
  dispose();
});
test('frames and bars lie inside the room side of each pane and stay within its hole', () => {
  const {scene, dispose} = build(), p = scene.getObjectByName('frames').geometry.getAttribute('position');
  assert.ok(p.count > 0 && [...p.array].every(Number.isFinite));
  for (const o of openings.filter(o => o.id !== 'door')) {
    let near = 0;
    for (let i = 0; i < p.count; i++) {
      const v = [p.getX(i), -p.getZ(i), p.getY(i)].map((x, k) => x - o.centre[k]);   // interior frame, from the centre
      const dot = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2], x = dot(v, o.across), y = dot(v, o.up), depth = dot(v, o.outward);
      if (Math.abs(x) > o.half[0] + .08 || Math.abs(y) > o.half[1] + .08 || Math.abs(depth) > .5) continue;
      near++;
      assert.ok(depth <= 1e-6, `${o.id} on the room side`);
      assert.ok(Math.abs(x) <= o.half[0] + .07 + 1e-6 && Math.abs(y) <= o.half[1] + .07 + 1e-6, `${o.id} within the hole`);
    }
    assert.ok(near >= 16, `${o.id} has a frame`);
  }
  dispose();
});
test('nothing solid stands in an opening, the doorway or the stair foot', () => {
  const {scene, dispose} = build(), walls = scene.getObjectByName('walls');
  const ray = new THREE.Raycaster(), hits = (from, to) => { const a = new THREE.Vector3(from[0], from[2], -from[1]), b = new THREE.Vector3(to[0], to[2], -to[1]);
    ray.set(a, b.clone().sub(a).normalize()); ray.far = a.distanceTo(b); return ray.intersectObject(walls).length; };
  walls.material.side = THREE.DoubleSide;
  for (const o of I.openings) {
    const mid = (o.span[0] + o.span[1]) / 2, z = o.floor * 3 + 1.6;
    assert.equal(hits(o.line === 'a' ? [o.at - .5, mid, z] : [mid, o.at - .5, z], o.line === 'a' ? [o.at + .5, mid, z] : [mid, o.at + .5, z]), 0, o.id);
  }
  assert.equal(hits([9, .5, 1.6], [9, -.5, 1.6]), 0, 'front doorway');
  assert.ok(hits([3.5, 3.5, 1.6], [-1, 3.5, 1.6]) > 0, 'the gable wall is solid');
  dispose();
});

// ── the painted-in light ──
const LIT = ['floors', 'ceilings', 'walls', 'stair', 'frames', 'casement', 'door-leaf'];
// A vertex in the interior frame, and its surface's normal there, from three's axes (x = a, y = up, z = −d).
const vertex = (g, i) => { const p = g.getAttribute('position'), n = g.getAttribute('normal'); return [[p.getX(i), -p.getZ(i), p.getY(i)], [n.getX(i), -n.getZ(i), n.getY(i)]]; };
const weightsOf = (g, i) => { const l = g.getAttribute('light'), q = g.getAttribute('spill'); return {day: l.getX(i), lamp: l.getY(i), fire: l.getZ(i), room: l.getW(i), spill: q.getX(i), spillRoom: q.getY(i)}; };
const night = () => interiorDials({interior: I, calendar: {light: 0, elevation: -1, hour: 0}, weather: {cloud: 0}, sky: {zenith: [.1, .1, .2], horizon: [.1, .1, .2]},
  cottage: null, pose: {main: .8, second: .4}, now: 0, seconds: 0, motion: false});

test('every surface vertex carries its light weights, and they are the field\'s', () => {
  const {scene, field, lit, dispose} = build();
  assert.equal(lit, true);
  for (const name of LIT) {
    const g = scene.getObjectByName(name).geometry, l = g.getAttribute('light');
    assert.ok(l && l.itemSize === 4 && l.count === g.getAttribute('position').count, name);
    const q = g.getAttribute('spill'); assert.ok(q && q.itemSize === 2 && q.count === l.count, `${name} spill`);
    for (let i = 0; i < l.count; i++) {
      const w = weightsOf(g, i);
      assert.ok([w.day, w.lamp, w.fire, w.room].every(Number.isFinite), `${name} ${i}`);
      assert.ok([w.day, w.lamp, w.fire].every(v => v >= 0 && v <= 1), `${name} ${i} ${JSON.stringify(w)}`);
      assert.ok(Number.isInteger(w.room) && w.room >= -1 && w.room < I.rooms.length, `${name} ${i}`);
    }
  }
  // Every floor, wall and ceiling vertex belongs to a room: none falls between them.
  for (const name of ['floors', 'walls', 'ceilings']) {
    const g = scene.getObjectByName(name).geometry;
    for (let i = 0; i < g.getAttribute('light').count; i++) assert.notEqual(weightsOf(g, i).room, -1, `${name} ${vertex(g, i)[0]}`);
  }
  // Ten floor vertices well inside their rooms take exactly the field's weights there.
  const g = scene.getObjectByName('floors').geometry, inner = [];
  for (let i = 0; i < g.getAttribute('position').count; i++) {
    const [p] = vertex(g, i), floor = p[2] > 1 ? 1 : 0;
    if (I.rooms.some(r => r.floor === floor && p[0] > r.a[0] + .3 && p[0] < r.a[1] - .3 && p[1] > r.d[0] + .3 && p[1] < r.d[1] - .3)) inner.push(i);
  }
  assert.ok(inner.length > 100);
  for (let k = 0; k < 10; k++) {
    const i = inner[Math.floor(k * inner.length / 10)], [p, n] = vertex(g, i), want = field.weigh(p[2] > 1 ? 1 : 0, p, n), got = weightsOf(g, i);
    for (const key of ['day', 'lamp', 'fire', 'room', 'spill', 'spillRoom']) assert.ok(Math.abs(got[key] - want[key]) < 1e-6, `${p} ${key}: ${got[key]} against ${want[key]}`);
  }
  // The field handed back is the blueprint's.
  const own = createLightField(I, openings);
  assert.deepEqual(field.weigh(0, [3, 3, 0], [0, 0, 1]), own.weigh(0, [3, 3, 0], [0, 0, 1]));
  dispose();
});
test('no reveal inside a doorway between rooms falls between them', () => {
  const {scene, dispose} = build(), g = scene.getObjectByName('walls').geometry;
  let seen = 0;
  for (let i = 0; i < g.getAttribute('position').count; i++) {
    const [p] = vertex(g, i);
    for (const o of I.openings) {
      const base = o.floor * I.floorRise, across = o.line === 'a' ? p[0] : p[1], along = o.line === 'a' ? p[1] : p[0];
      if (Math.abs(across - o.at) > I.wall / 2 + 1e-6 || along < o.span[0] - 1e-6 || along > o.span[1] + 1e-6 || p[2] < base - 1e-6 || p[2] > base + I.doorHead + 1e-6) continue;
      seen++;
      const w = weightsOf(g, i);
      assert.ok(w.room !== -1 && w.lamp > 0, `${o.id} at ${p}: ${JSON.stringify(w)}`);
    }
  }
  assert.ok(seen >= I.openings.length * 8, `${seen}`);
  dispose();
});
test('the interior holds no light source', () => {
  const {scene, dispose} = build();
  let lights = 0; scene.traverse(o => { if (o.isLight) lights++; });
  assert.equal(lights, 0);
  dispose();
});
test('setLight moves the shared uniforms and nothing else', () => {
  const {scene, setLight, dispose} = build(), before = new Map();
  scene.traverse(o => { if (o.isMesh) before.set(o.name, {material: o.material, rotation: o.rotation.y, colour: o.material.color?.getHex()}); });
  const lit = scene.getObjectByName('walls').material, s = {uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader};
  lit.onBeforeCompile(s);
  const dials = night();
  setLight(dials);
  assert.deepEqual([s.uniforms.day.value.x, s.uniforms.day.value.y, s.uniforms.day.value.z], dials.day);
  assert.deepEqual([s.uniforms.fill.value.x, s.uniforms.fill.value.y, s.uniforms.fill.value.z], dials.fill);
  [...s.uniforms.lamps.value].forEach((v, i) => assert.ok(Math.abs(v - dials.lamps[i]) < 1e-6, `lamp ${i}`));
  assert.equal(s.uniforms.fire.value, dials.fire);
  assert.ok(dials.lamps[I.rooms.findIndex(r => r.id === 'living')] > 0, 'the living room\'s lamp is lit in this frame');
  // every lit surface shares those uniforms
  for (const name of LIT) { const t = {uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader};
    scene.getObjectByName(name).material.onBeforeCompile(t); assert.equal(t.uniforms.lamps, s.uniforms.lamps, name); }
  scene.traverse(o => { if (o.isMesh) assert.deepEqual({material: o.material, rotation: o.rotation.y, colour: o.material.color?.getHex()}, before.get(o.name), o.name); });
  dispose();
});
test('if the lit materials cannot be made the rooms stay evenly lit, with one warning', t => {
  // three as it is, but a basic material asked for vertex colours (the lit surfaces' kind) cannot be made
  // (the lit surfaces' materials: vertex-coloured basic materials over a painted map; the fire's own vertex-coloured flames and embers have none)
  class Failing extends THREE.MeshBasicMaterial { constructor(o) { if (o?.vertexColors && o?.map) throw new Error('no lit material'); super(o); } }
  const warn = t.mock.method(console, 'warn', () => {});
  const out = buildInterior({...THREE, MeshBasicMaterial: Failing}, {interior: I, art: stubArt(), openings});
  assert.equal(out.lit, false);
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(warn.mock.calls[0].arguments[0], 'The cabin\'s light could not be set up; its rooms stay evenly lit.');
  let hemispheres = 0, lights = 0; out.scene.traverse(o => { if (o.isLight) lights++; if (o.isHemisphereLight) hemispheres++; });
  assert.equal(hemispheres, 1); assert.equal(lights, 1);
  for (const name of [...LIT, ...openings.map(o => `pane-${o.id}`)]) assert.ok(out.scene.getObjectByName(name), name);
  for (const name of LIT) assert.ok(out.scene.getObjectByName(name).material.isMeshLambertMaterial, name);
  const leaf = out.scene.getObjectByName('casement');
  assert.deepEqual([leaf.renderOrder, leaf.material.stencilWrite, leaf.material.stencilRef], [2, true, 0]);
  assert.equal(out.setLight(night()), undefined);
  out.dispose();
});
