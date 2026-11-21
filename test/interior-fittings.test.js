import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {ceilingHeight} from '../shared/interior.js';
import {buildInterior} from '../public/space/interior/index.js';
import {LAKESIDE_SPACE} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING} from '../shared/lakeside-dressing.js';
import {viewOpenings} from '../shared/window-views.js';
import {stubArt} from './space-scene.test.js';

const openings = viewOpenings(I, LAKESIDE_SPACE, LAKESIDE_DRESSING);
const build = () => buildInterior(THREE, {interior: I, art: stubArt(), openings});
const lamps = scene => scene.getObjectByName('fittings');
const roomOf = id => I.rooms.find(r => r.id === id), indexOf = id => I.rooms.findIndex(r => r.id === id);
const slot = id => I.fittings.findIndex(f => f.room === id);
const near = (x, y, msg) => assert.ok(Math.abs(x - y) < 1e-6, `${msg}: ${x} against ${y}`);
// The vertices of a group's meshes in the interior frame [a, d, z]: three x = a, y = z, z = −d.
const vertices = group => {
  const out = []; group.updateWorldMatrix(true, true);
  group.traverse(o => { if (!o.isMesh) return; const p = o.geometry.getAttribute('position'), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); out.push([v.x, -v.z, v.y]); } });
  return out;
};
const glassAt = (scene, k) => { const g = lamps(scene).getObjectByName('glasses'), m = new THREE.Matrix4().fromArray(g.instanceMatrix.array, k * 16); const v = new THREE.Vector3().setFromMatrixPosition(m); return [v.x, -v.z, v.y]; };
const glassColour = (scene, k) => Array.from(lamps(scene).getObjectByName('glasses').instanceColor.array.slice(k * 3, k * 3 + 3));
// the halos' level for a fitting's room (the uniform array runs in interior.rooms order)
const haloLevel = (scene, k) => lamps(scene).getObjectByName('halos').material.uniforms.levels.value[indexOf(I.fittings[k].room)];
const levels = on => I.rooms.map((r, i) => on.includes(r.id) ? 1.1 : 0);

test('every room has its lamp where the blueprint puts it', () => {
  const {scene, dispose} = build();
  assert.equal(I.fittings.length, 18);
  I.fittings.forEach((f, k) => {
    assert.ok(lamps(scene).getObjectByName(`lamp-${f.room}`), f.room);
    f.at.forEach((v, i) => near(glassAt(scene, k)[i], v, `${f.room} glass`));
  });
  dispose();
});

test('a hanging lamp hangs from the ceiling above it and a wall lamp is bracketed to its wall', () => {
  const {scene, dispose} = build();
  for (const f of I.fittings) {
    const r = roomOf(f.room), v = vertices(lamps(scene).getObjectByName(`lamp-${f.room}`)), [a, d, z] = f.at;
    if (f.kind === 'hanging') {
      near(Math.max(...v.map(p => p[2])), r.floor * I.floorRise + ceilingHeight(I, r.floor, d), `${f.room} rod top`);
      assert.ok(v.every(p => Math.hypot(p[0] - a, p[1] - d) < .2), `${f.room} hangs over its glass`);
    } else {
      const lines = [[0, r.a[0]], [0, r.a[1]], [1, r.d[0]], [1, r.d[1]]], gap = ([axis, at]) => Math.abs(f.at[axis] - at);
      const wall = lines.reduce((best, l) => gap(l) < gap(best) ? l : best);
      assert.ok(v.some(p => Math.abs(p[wall[0]] - wall[1]) < 1e-6), `${f.room} bracket reaches its wall line`);
    }
  }
  dispose();
});

// Every vertex of one fitting in the interior frame: its ironwork, its glass and its halo ball.
const wholeFitting = (scene, k) => {
  const f = I.fittings[k], out = vertices(lamps(scene).getObjectByName(`lamp-${f.room}`)), glasses = lamps(scene).getObjectByName('glasses');
  const g = glasses.geometry.getAttribute('position'), m = new THREE.Matrix4().fromArray(glasses.instanceMatrix.array, k * 16), v = new THREE.Vector3();
  for (let i = 0; i < g.count; i++) { v.fromBufferAttribute(g, i).applyMatrix4(m); out.push([v.x, -v.z, v.y]); }
  const halo = lamps(scene).getObjectByName('halos').geometry, p = halo.getAttribute('position'), room = halo.getAttribute('lampRoom');
  for (let i = 0; i < p.count; i++) if (Math.round(room.getX(i)) === indexOf(f.room)) out.push([p.getX(i), -p.getZ(i), p.getY(i)]);
  return out;
};

test('no part of a fitting, its halo included, hangs lower than 1.95 m or stands out more than 0.25 m from its wall', () => {
  const {scene, dispose} = build();
  I.fittings.forEach((f, k) => {
    const r = roomOf(f.room), v = wholeFitting(scene, k), rel = r.floor * I.floorRise;
    if (f.kind === 'hanging') assert.ok(Math.min(...v.map(p => p[2])) - rel >= 1.95, `${f.room} lowest ${Math.min(...v.map(p => p[2])) - rel}`);
    else {
      const lines = [[0, r.a[0]], [0, r.a[1]], [1, r.d[0]], [1, r.d[1]]], gap = ([axis, at]) => Math.abs(f.at[axis] - at);
      const [axis, at] = lines.reduce((best, l) => gap(l) < gap(best) ? l : best);
      const out = Math.max(...v.map(p => Math.abs(p[axis] - at))) - I.wall / 2;
      assert.ok(out <= .25, `${f.room} stands ${out} out`);
    }
  });
  dispose();
});

test('the halo patch scales each ball by its room\'s level, and refuses to pass when the shader is not the one it knows', () => {
  const {scene, dispose} = build(), m = lamps(scene).getObjectByName('halos').material;
  const stub = {vertexShader: m.vertexShader, fragmentShader: m.fragmentShader, uniforms: m.uniforms};
  m.onBeforeCompile(stub);
  assert.notEqual(stub.vertexShader, m.vertexShader); assert.notEqual(stub.fragmentShader, m.fragmentShader);
  assert.match(stub.vertexShader, /attribute float lampRoom/); assert.match(stub.vertexShader, /vLevel = levels\[/);
  assert.match(stub.fragmentShader, /varying float vLevel/); assert.match(stub.fragmentShader, /opacity \* vLevel/);
  assert.throws(() => m.onBeforeCompile({vertexShader: 'void main() {}', fragmentShader: m.fragmentShader, uniforms: {}}));
  assert.throws(() => m.onBeforeCompile({vertexShader: m.vertexShader, fragmentShader: 'void main() {}', uniforms: {}}));
  dispose();
});

test('a glass is pale when out and warm when lit, by its own room\'s level only', () => {
  const {scene, setLamps, dispose} = build(), halos = lamps(scene).getObjectByName('halos');
  const pale = glassColour(scene, 0), out = I.fittings.map((_, k) => glassColour(scene, k));
  assert.ok(out.every(c => c.every((v, i) => v === pale[i])), 'every glass starts pale');
  assert.equal(halos.visible, false);
  const k = slot('kitchen');
  setLamps(levels(['kitchen']));
  const warm = glassColour(scene, k);
  assert.ok(warm[0] > pale[0] && warm[2] < pale[2] + 1 && warm[0] / warm[2] > pale[0] / pale[2], 'warmer and brighter');
  I.fittings.forEach((f, i) => {
    if (i === k) { assert.deepEqual(glassColour(scene, i).map(v => v > 0), [true, true, true]); assert.ok(haloLevel(scene, i) > 0, 'its halo'); }
    else { assert.deepEqual(glassColour(scene, i), out[i], `${f.room} glass`); assert.equal(haloLevel(scene, i), 0, `${f.room} halo`); }
  });
  assert.equal(halos.visible, true);
  // a level past 1 is the same as 1; a missing or odd one is out
  setLamps(levels(['kitchen']).map(v => v && 5)); assert.deepEqual(glassColour(scene, k), warm);
  setLamps([NaN]); setLamps(undefined);
  I.fittings.forEach((f, i) => assert.deepEqual(glassColour(scene, i), pale, f.room));
  assert.equal(halos.visible, false);
  dispose();
});

test('a frame\'s dials reach the lamps through setLight', () => {
  const {scene, setLight, dispose} = build();
  setLight({day: [0, 0, 0], fill: [0, 0, 0], lamps: levels(['study']), fire: 0});
  assert.ok(haloLevel(scene, slot('study')) > 0);
  assert.equal(haloLevel(scene, slot('living')), 0);
  dispose();
});

test('the lamps are built without the lit materials too', t => {
  class Failing extends THREE.MeshBasicMaterial { constructor(o) { if (o?.vertexColors) throw new Error('no lit material'); super(o); } }
  t.mock.method(console, 'warn', () => {});
  const out = buildInterior({...THREE, MeshBasicMaterial: Failing}, {interior: I, art: stubArt(), openings});
  assert.equal(out.lit, false);
  for (const f of I.fittings) assert.ok(lamps(out.scene).getObjectByName(`lamp-${f.room}`), f.room);
  out.setLight({day: [0, 0, 0], fill: [0, 0, 0], lamps: levels(['living']), fire: 0});
  assert.ok(haloLevel(out.scene, slot('living')) > 0);
  out.dispose();
});

test('the fittings hold no light source', () => {
  const {scene, dispose} = build(); let lights = 0;
  scene.traverse(o => { if (o.isLight) lights++; });
  assert.equal(lights, 0);
  dispose();
});
