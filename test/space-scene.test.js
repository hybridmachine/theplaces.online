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
