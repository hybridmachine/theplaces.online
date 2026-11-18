import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {buildInterior} from '../public/space/interior/index.js';
import {stubArt} from './space-scene.test.js';

const box = m => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox; };
test('the shell builds its named parts with finite geometry inside the blueprint', () => {
  const {scene, dispose} = buildInterior(THREE, {interior: I, art: stubArt()});
  for (const name of ['floors', 'ceilings', 'walls', 'stair', 'glass']) {
    const m = scene.getObjectByName(name); assert.ok(m, name);
    const p = m.geometry.getAttribute('position'); assert.ok(p.count > 0 && [...p.array].every(Number.isFinite), name);
    const b = box(m);   // three: x = a, y = up, z = −d
    assert.ok(b.min.x >= -.2 && b.max.x <= 18.2 && b.min.z >= -12.2 && b.max.z <= .2 && b.min.y >= -.01 && b.max.y <= 6.7, `${name} ${JSON.stringify(b)}`);
  }
  assert.ok(scene.children.some(o => o.isHemisphereLight)); assert.equal(scene.fog, null);
  dispose();
});
test('the stair climbs 3 m in 15 treads, and the glass takes the sky colour', () => {
  const {scene, setSky, dispose} = buildInterior(THREE, {interior: I, art: stubArt()}), stair = box(scene.getObjectByName('stair'));
  assert.ok(stair.min.x >= 9.6 - .01 && stair.max.x <= 11.01 && Math.abs(stair.max.y - 3.9) < .05, 'treads to 3 m plus a 0.9 m rail');
  setSky({zenith: [.1, .2, .3], horizon: [.4, .5, .6]});
  const c = scene.getObjectByName('glass').material.color.getRGB({}, THREE.SRGBColorSpace);
  assert.ok(Math.abs(c.r - .4) < .01 && Math.abs(c.g - .5) < .01 && Math.abs(c.b - .6) < .01, 'horizon colour');
  dispose();
});
test('nothing solid stands in an opening, the doorway or the stair foot', () => {
  const {scene, dispose} = buildInterior(THREE, {interior: I, art: stubArt()}), walls = scene.getObjectByName('walls');
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
