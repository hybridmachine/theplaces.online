import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D} from '../shared/lakeside-dressing.js';
import {SPACE_ART, artFiles} from '../shared/lakeside-space-art.js';
import {cardBatch, mergeGeometries, sheet, toThree, tube} from '../public/space/geometry.js';
import {buildScene} from '../public/space/scene/index.js';

// Textures without images: enough to build and inspect geometry in Node.
export function stubArt() {
  const t = () => new THREE.Texture();
  return {surfaces: Object.fromEntries(Object.keys(SPACE_ART.surfaces).map(k => [k, t()])), panels: {door: t(), window: t()}, cards: t(), dispose() {}};
}
test('toThree maps east, north, up to three', () => { assert.deepEqual(toThree([1, 2, 3]), [1, 3, -2]); });
test('the scene builds its named parts with finite geometry and disposes them', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  for (const name of ['terrain', 'lake', 'wall', 'cabin', 'oak', 'woods', 'cover', 'hills']) assert.ok(scene.parts[name], name);
  let meshes = 0, disposed = 0;
  scene.group.traverse(o => { if (!o.geometry) return; meshes++;
    const p = o.geometry.getAttribute('position'); for (let i = 0; i < p.count * 3; i++) assert.ok(Number.isFinite(p.array[i]), o.name);
    o.geometry.addEventListener('dispose', () => disposed++); });
  assert.ok(meshes >= 8);
  scene.setSky({zenith: [.6, .7, .76], horizon: [.83, .83, .75]});
  scene.dispose(); assert.equal(disposed, meshes);
});
test('the art slots the scene needs all exist', () => { assert.equal(artFiles().length, 12); });
test('sheets face the side asked for, tubes face outward, and merging keeps every triangle', () => {
  // Mean face normal of an indexed geometry, back in world axes (x east, y north, z up).
  const facing = g => {
    const p = g.getAttribute('position'), idx = g.index.array, v = i => new THREE.Vector3().fromBufferAttribute(p, i), sum = new THREE.Vector3();
    for (let k = 0; k < idx.length; k += 3) { const a = v(idx[k]); sum.add(v(idx[k + 1]).sub(a).cross(v(idx[k + 2]).sub(a))); }
    return [sum.x, -sum.z, sum.y];
  };
  const wall = (outward) => sheet(THREE, (s, t) => [s * 4, 0, t * 2], {ns: 4, nt: 2, tile: 2, outward});
  assert.ok(facing(wall([0, -1, 0]))[1] < 0); assert.ok(facing(wall([0, 1, 0]))[1] > 0);
  const uv = wall([0, 1, 0]).getAttribute('uv');
  assert.deepEqual([uv.getX(uv.count - 1), uv.getY(uv.count - 1)], [2, 1]); // 4 m across, 2 m up, over a 2 m tile
  const t = tube(THREE, [[0, 0, 0, .5], [0, 0, 2, .3], [1, 0, 3, .1]], {sides: 6});
  const p = t.getAttribute('position'), n = t.getAttribute('normal'), idx = t.index.array;
  for (let k = 0; k < idx.length; k += 3) {
    const v = i => new THREE.Vector3().fromBufferAttribute(p, i), a = v(idx[k]);
    const face = v(idx[k + 1]).sub(a).cross(v(idx[k + 2]).sub(a)), normal = new THREE.Vector3().fromBufferAttribute(n, idx[k]);
    assert.ok(face.dot(normal) > 0, `tube triangle ${k / 3} faces inward`);
  }
  const cards = cardBatch(); cards.add([0, 0, 1], [.5, 0, 0], [0, 0, .5], SPACE_ART.cards.cells.dab[0], [1, 1, 1]);
  const merged = mergeGeometries(THREE, [wall([0, 1, 0]), t, cards.geometry(THREE)]);
  assert.equal(merged.index.count, 4 * 2 * 6 + t.index.count + 6);
  assert.ok(['position', 'normal', 'uv', 'color'].every(a => merged.getAttribute(a)));
});

import {eyePosition} from '../shared/walker.js';
import {terrainHeight} from '../shared/space.js';
const fromThree = v => [v.x, -v.z, v.y];

// First surface hit by a ray from `eye` toward `target`, among the meshes of `objects` (one object or an array), left in place in the scene.
function firstHit(objects, eye, target) {
  const list = [].concat(objects); for (const o of list) o.updateWorldMatrix(true, true);
  const origin = new THREE.Vector3(...toThree(eye)), dir = new THREE.Vector3(...toThree(target)).sub(origin).normalize();
  const ray = new THREE.Raycaster(origin, dir); ray.params.Points = {threshold: 0};
  const hits = [];
  for (const object of list) object.traverse(o => { if (o.isMesh) { const side = o.material.side; o.material.side = THREE.DoubleSide; hits.push(...ray.intersectObject(o, false).map(h => ({...h, side}))); o.material.side = side; } });
  hits.sort((a, b) => a.distance - b.distance);
  return {hit: hits[0], dir};
}
test('the cabin is solid from every side a visitor can stand', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), cabin = scene.parts.cabin, [cx, cy] = S.cabin.center;
  const solid = ['walls', 'roof', 'chimney'].map(name => cabin.getObjectByName(name));
  for (let k = 0; k < 36; k++) {
    const a = k / 36 * Math.PI * 2, x = cx + Math.sin(a) * 9, y = cy + Math.cos(a) * 9;
    const eye = [x, y, terrainHeight(S, x, y) + S.eyeHeight];
    for (const z of [.6, 1.5, 2.4]) {
      const {hit, dir} = firstHit(solid, eye, [cx, cy, terrainHeight(S, cx, cy) + z]);
      assert.ok(hit, `nothing drawn at bearing ${k * 10}, height ${z}`);
      const facing = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(dir) < 0;
      assert.ok(facing || hit.side === THREE.DoubleSide, `inside-out surface at bearing ${k * 10}, height ${z} on ${hit.object.name}`);
      assert.notEqual(hit.side === THREE.DoubleSide && hit.object.name === 'walls', true, 'walls must be single-sided');
    }
  }
  scene.dispose();
});
test('the cabin walls stay inside the collider, clear of where a visitor can stand', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), walls = scene.parts.cabin.getObjectByName('walls');
  const box = S.colliders.find(c => c.type === 'box'), u = [Math.sin(box.yaw), Math.cos(box.yaw)], v = [Math.cos(box.yaw), -Math.sin(box.yaw)];
  walls.updateMatrixWorld(true);
  const p = walls.geometry.getAttribute('position'), w = new THREE.Vector3(); let checked = 0;
  for (let i = 0; i < p.count; i++) {
    w.fromBufferAttribute(p, i).applyMatrix4(walls.matrixWorld); const [x, y, z] = fromThree(w);
    if (z > terrainHeight(S, x, y) + S.eyeHeight + .5) continue;
    const dx = x - box.center[0], dy = y - box.center[1];
    assert.ok(Math.abs(dx * u[0] + dy * u[1]) <= box.half[0] - .15 && Math.abs(dx * v[0] + dy * v[1]) <= box.half[1] - .15, `${x},${y}`); checked++;
  }
  assert.ok(checked > 50); scene.dispose();
});
test('the cabin has a door and two windows in front and one small window behind', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  assert.equal(scene.parts.cabin.getObjectByName('openings').children.length, 4); scene.dispose();
});
import {oakPlan} from '../shared/lakeside-dressing.js';
test('the oak trunk is solid from all round and stays inside its collider', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), trunk = scene.parts.oak.getObjectByName('trunk'), [ox, oy] = S.oak.position;
  assert.notEqual(trunk.material.side, THREE.DoubleSide);
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, x = ox + Math.sin(a) * 4, y = oy + Math.cos(a) * 4, eye = [x, y, terrainHeight(S, x, y) + S.eyeHeight];
    const {hit, dir} = firstHit(trunk, eye, [ox, oy, terrainHeight(S, ox, oy) + 1.4]);
    assert.ok(hit, `no trunk at bearing ${k * 15}`);
    assert.ok(hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(dir) < 0, `inside-out at ${k * 15}`);
  }
  trunk.updateMatrixWorld(true); const p = trunk.geometry.getAttribute('position'), w = new THREE.Vector3(), r = S.colliders.find(c => c.type === 'circle').radius;
  for (let i = 0; i < p.count; i++) { w.fromBufferAttribute(p, i).applyMatrix4(trunk.matrixWorld); const [x, y, z] = fromThree(w);
    if (z < terrainHeight(S, ox, oy) + S.eyeHeight + .5) assert.ok(Math.hypot(x - ox, y - oy) <= r - .1, `${x},${y},${z}`); }
  scene.dispose();
});
test('every planned clump has leaves, and the leaves never face the camera', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), leaves = scene.parts.oak.getObjectByName('leaves');
  assert.deepEqual(leaves.userData.clumps.map(c => c.id).sort(), oakPlan(S, D).clumps.map(c => c.id).sort());
  assert.ok(leaves.userData.clumps.every(c => c.count >= 6));
  assert.equal(leaves.material.transparent, false); assert.ok(leaves.material.alphaTest > 0);
  // Fixed in the world: an ordinary mesh with no per-frame hook that could turn it toward the camera.
  assert.equal(leaves.isMesh, true); assert.equal(leaves.onBeforeRender, THREE.Object3D.prototype.onBeforeRender);
  scene.dispose();
});
import {scatter} from '../shared/lakeside-dressing.js';
test('ground cover draws exactly what the layout scatters, in three draw calls', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), cover = scene.parts.cover;
  for (const kind of ['grass', 'reeds', 'flowers']) {
    const mesh = cover.getObjectByName(kind); assert.ok(mesh.isInstancedMesh, kind);
    assert.equal(mesh.count, scatter(S, D, kind).length); assert.ok(mesh.material.alphaTest > 0);
  }
  assert.equal(cover.children.length, 3); scene.dispose();
});
import {existsSync} from 'node:fs';
test('the blockout is gone and the far hills close the view all round', () => {
  assert.equal(existsSync(new URL('../public/space/blockout.js', import.meta.url)), false);
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), hills = scene.parts.hills;
  for (const [x, y] of [[0, 0], [-10, 20], [30, 20], [-12, -8]]) {
    const eye = [x, y, terrainHeight(S, x, y) + S.eyeHeight];
    for (let k = 0; k < 72; k++) {
      const a = k / 72 * Math.PI * 2, far = [x + Math.sin(a) * 2000, y + Math.cos(a) * 2000, eye[2] + 2000 * Math.tan(.5 * Math.PI / 180)];
      assert.ok(firstHit(hills, eye, far).hit, `gap in the hills at bearing ${k * 5} from ${x},${y}`);
    }
  }
  scene.dispose();
});
