import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, openingCentre, pathLightPlan, windowSpan} from '../shared/lakeside-dressing.js';
import {SPACE_ART, artFiles} from '../shared/lakeside-space-art.js';
import {cardBatch, mergeGeometries, sheet, toThree, tube} from '../public/space/geometry.js';
import {buildScene} from '../public/space/scene/index.js';
import {GARDEN_DAY, buildGarden} from '../public/space/scene/garden.js';
import {gardenState} from '../shared/garden-life.js';

// Textures without images: enough to build and inspect geometry in Node.
export function stubArt() {
  const t = () => new THREE.Texture();
  return {surfaces: Object.fromEntries(Object.keys(SPACE_ART.surfaces).map(k => [k, t()])), panels: {door: t(), window: t(), windowLit: t()}, cards: t(), dispose() {}};
}
test('toThree maps east, north, up to three', () => { assert.deepEqual(toThree([1, 2, 3]), [1, 3, -2]); });
test('the scene builds its named parts with finite geometry and disposes them', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  for (const name of ['terrain', 'lake', 'wall', 'cabin', 'oak', 'woods', 'cover', 'garden', 'wheelbarrow', 'lights', 'hills']) assert.ok(scene.parts[name], name);
  let meshes = 0, disposed = 0;
  scene.group.traverse(o => { if (!o.geometry) return; meshes++;
    const p = o.geometry.getAttribute('position'); for (let i = 0; i < p.count * 3; i++) assert.ok(Number.isFinite(p.array[i]), o.name);
    o.geometry.addEventListener('dispose', () => disposed++); });
  assert.ok(meshes >= 12);
  scene.setSky({zenith: [.6, .7, .76], horizon: [.83, .83, .75]});
  scene.dispose(); assert.equal(disposed, meshes);
});
test('the art slots the scene needs all exist', () => { assert.equal(artFiles().length, 13); });
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

// First surface hit by a ray from `eye` toward `target`, among the meshes of `objects` (one object or an array), left in place in the scene,
// no further than `far` metres.
function firstHit(objects, eye, target, far = Infinity) {
  const list = [].concat(objects); for (const o of list) o.updateWorldMatrix(true, true);
  const origin = new THREE.Vector3(...toThree(eye)), dir = new THREE.Vector3(...toThree(target)).sub(origin).normalize();
  const ray = new THREE.Raycaster(origin, dir, 0, far); ray.params.Points = {threshold: 0};
  const hits = [];
  for (const object of list) object.traverse(o => { if (o.isMesh) { const side = o.material.side; o.material.side = THREE.DoubleSide; hits.push(...ray.intersectObject(o, false).map(h => ({...h, side}))); o.material.side = side; } });
  hits.sort((a, b) => a.distance - b.distance);
  return {hit: hits[0], dir};
}
// From all round at 9 m, every ray toward the cabin's middle meets a surface drawn the right way out, and the walls are single-sided.
function assertSolidAllRound(cabin, names) {
  const [cx, cy] = S.cabin.center, solid = names.map(name => cabin.getObjectByName(name));
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
}
test('the cabin is solid from every side a visitor can stand', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  assertSolidAllRound(scene.parts.cabin, ['walls', 'roof', 'chimney']);
  scene.dispose();
});
test('the cabin is still solid from every side with its casement open', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  scene.setCottage({main: 1, second: 1, open: 1});
  assertSolidAllRound(scene.parts.cabin, ['walls', 'roof', 'chimney', 'casement']);
  scene.dispose();
});
test('the front windows light by their own rooms and the main room\'s casement swings outward', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), cabin = scene.parts.cabin;
  const left = cabin.getObjectByName('window-front-left'), right = cabin.getObjectByName('window-front-right'), back = cabin.getObjectByName('window-back');
  const casement = cabin.getObjectByName('casement');
  assert.ok(casement?.isMesh); assert.equal(casement.material.side, THREE.DoubleSide);
  assert.notEqual(left.material.side, THREE.DoubleSide); assert.notEqual(right.material.side, THREE.DoubleSide);
  scene.setCottage({main: 0, second: 0, open: 0});
  const shut = casement.rotation.clone();
  scene.setCottage({main: 1, second: .5, open: 1});
  assert.notEqual(left.material, right.material); assert.notEqual(left.material, back.material); assert.notEqual(right.material, back.material);
  assert.equal(left.material.emissiveIntensity, 1); assert.equal(right.material.emissiveIntensity, .5);
  assert.equal(casement.material.emissiveIntensity, 1);
  assert.equal(back.material.emissiveMap, null);
  assert.ok(!casement.rotation.equals(shut));
  // Outward: the leaf's free edge moves away from the wall, toward the front.
  casement.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(casement), [cx, cy] = S.cabin.center, front = S.arrival.position;
  const centre = fromThree(box.getCenter(new THREE.Vector3())), toFront = [front[0] - cx, front[1] - cy];
  const wall = fromThree(new THREE.Box3().setFromObject(left).getCenter(new THREE.Vector3()));
  assert.ok((centre[0] - wall[0]) * toFront[0] + (centre[1] - wall[1]) * toFront[1] > .05, 'the open leaf stands out from the wall');
  scene.setCottage({main: 0, second: 0, open: 0});
  assert.ok(casement.rotation.equals(shut)); assert.equal(left.material.emissiveIntensity, 0);
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
test('the wheelbarrow stands in its footprint on the drawn ground, off the wall and clear of the casement as it swings', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), barrow = scene.parts.wheelbarrow;
  scene.group.updateMatrixWorld(true);
  assert.deepEqual(barrow.children.map(m => m.name).sort(), ['shafts', 'stands', 'tray', 'wheel']);
  const {center, yaw} = S.wheelbarrow, half = S.colliders.find(c => c.center[0] === center[0] && c.center[1] === center[1]).half;
  const u = [Math.sin(yaw), Math.cos(yaw)], v = [Math.cos(yaw), -Math.sin(yaw)], cu = [Math.sin(S.cabin.yaw), Math.cos(S.cabin.yaw)], cv = [Math.cos(S.cabin.yaw), -Math.sin(S.cabin.yaw)];
  const w = new THREE.Vector3(), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  for (const part of barrow.children) {
    const p = part.geometry.getAttribute('position'); let low = null;
    for (let i = 0; i < p.count; i++) {
      w.fromBufferAttribute(p, i).applyMatrix4(part.matrixWorld); const [x, y] = fromThree(w), dx = x - center[0], dy = y - center[1];
      assert.ok(Math.abs(dx * u[0] + dy * u[1]) <= half[0] - .05 && Math.abs(dx * v[0] + dy * v[1]) <= half[1] - .05, `${part.name} outside the footprint`);
      const off = Math.abs((x - S.cabin.center[0]) * cv[0] + (y - S.cabin.center[1]) * cv[1]) - S.cabin.size[1] / 2;
      assert.ok(off > .08, `${part.name} ${off.toFixed(3)} m from the wall`);
      if (!low || w.y < low.y) low = w.clone();
    }
    // the wheel and the skids rest on the terrain as it is drawn; nothing else comes near it
    ray.set(new THREE.Vector3(low.x, 100, low.z), down); ray.far = Infinity;
    const gap = low.y - ray.intersectObject(scene.parts.terrain)[0].point.y;
    if (part.name === 'wheel' || part.name === 'stands') assert.ok(Math.abs(gap) < .01, `${part.name} ${gap.toFixed(3)} m off the ground`);
    else assert.ok(gap > .1, part.name);
  }
  // the casement leaf, swept from shut to wide open, with 5 cm to spare past its free edge, meets nothing of the barrow
  const leaf = scene.parts.cabin.getObjectByName('casement'), lp = leaf.geometry.getAttribute('position');
  for (let k = 0; k <= 10; k++) {
    scene.setCottage({open: k / 10}); leaf.updateWorldMatrix(true, true);
    const pts = Array.from({length: lp.count}, (_, i) => new THREE.Vector3().fromBufferAttribute(lp, i).applyMatrix4(leaf.matrixWorld));
    const out = q => (q.x - S.cabin.center[0]) * cv[0] + (-q.z - S.cabin.center[1]) * cv[1], run = q => (q.x - S.cabin.center[0]) * cu[0] + (-q.z - S.cabin.center[1]) * cu[1];
    const hinge = pts.reduce((a, q) => run(q) < run(a) ? q : a), free = pts.reduce((a, q) => out(q) + run(q) > out(a) + run(a) ? q : a);
    const lo = Math.min(...pts.map(q => q.y)), hi = Math.max(...pts.map(q => q.y));
    for (let j = 0; j <= 30; j++) {
      const y = lo + (hi - lo) * j / 30, from = new THREE.Vector3(hinge.x, y, hinge.z), dir = new THREE.Vector3(free.x - hinge.x, 0, free.z - hinge.z);
      ray.far = dir.length() + .05; ray.set(from, dir.normalize());
      assert.equal(ray.intersectObject(barrow, true).length, 0, `the leaf meets the barrow at ${k / 10} open`);
    }
  }
  scene.dispose();
  // a space with no wheelbarrow still builds: the part is there, empty
  const bare = buildScene(THREE, {space: {...S, wheelbarrow: undefined, colliders: S.colliders.slice(0, -1)}, dressing: D, art: stubArt()});
  assert.equal(bare.parts.wheelbarrow.children.length, 0); bare.dispose();
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
import {shoreDistance} from '../shared/space.js';
test('the grove stands on land: no undergrowth card reaches into the water', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), under = scene.parts.woods.getObjectByName('grove-undergrowth');
  under.updateMatrixWorld(true); const p = under.geometry.getAttribute('position'), w = new THREE.Vector3();
  assert.ok(p.count >= D.grove.length * 4 * 4, 'every tree has undergrowth');
  for (let i = 0; i < p.count; i++) { w.fromBufferAttribute(p, i).applyMatrix4(under.matrixWorld); const [x, y] = fromThree(w); assert.ok(shoreDistance(S, x, y) > 0, `${x},${y}`); }
  scene.dispose();
});
test('every swaying card carries its sway, and the cabin dabs stay put', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  const weights = (mesh, name) => {
    const a = mesh.geometry.getAttribute('sway'); assert.ok(a, `${name} has no sway`); assert.equal(a.itemSize, 4, name);
    assert.ok([...a.array].every(Number.isFinite), name);
    const w = []; for (let i = 0; i < a.count; i++) w.push(a.getX(i));
    assert.ok(w.every(v => v >= 0 && v <= 1), name);
    return w;
  };
  const swaying = [scene.parts.oak.getObjectByName('leaves'), scene.parts.woods.getObjectByName('masses'), scene.parts.woods.getObjectByName('grove-leaves'),
    ...scene.parts.cover.children];
  for (const mesh of swaying) assert.ok(weights(mesh, mesh.name).some(v => v > .5), mesh.name);
  for (const mesh of scene.parts.cover.children) {
    const k = mesh.geometry.getAttribute('swayKind'); assert.ok(k?.isInstancedBufferAttribute, mesh.name); assert.equal(k.itemSize, 3);
    assert.equal(k.count, mesh.count); assert.ok([...k.array].every(Number.isFinite), mesh.name);
  }
  const cabin = scene.parts.cabin;
  assert.ok(weights(cabin.getObjectByName('dabs'), 'dabs').every(v => v === 0));
  assert.ok(weights(cabin.getObjectByName('shrubs'), 'shrubs').some(v => v > 0));
  scene.dispose();
});

test('a ripple can be set and cleared on the lake without touching another scene', () => {
  const a = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), b = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  const u = scene => scene.parts.lake.material.uniforms;
  a.setRipple({center: [30, -12], radius: 2, age: .4, variation: 1});
  assert.deepEqual(u(a).ripple.value.toArray(), [30, -12, 2, .4]); assert.equal(u(a).rippleSeed.value, 1); assert.equal(u(b).ripple.value.w, 0);
  a.setRipple(null); assert.ok(u(a).ripple.value.w <= 0);
  a.dispose(); b.dispose();
});

test('wetting the ground does not throw, and does not touch another scene', () => {
  const a = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), b = buildScene(THREE, {space: S, dressing: D, art: stubArt()});
  a.setWet({path: .5, stone: .25});
  const wet = scene => scene.parts.terrain.material.userData.wet.value;
  assert.deepEqual(wet(a).toArray(), [.5, .25]); assert.deepEqual(wet(b).toArray(), [0, 0]);
  a.setSky({zenith: [.1, .2, .3], horizon: [.4, .5, .6]}); assert.deepEqual(a.sky.zenith, [.1, .2, .3]);
  a.dispose(); b.dispose();
});

import {lifeLayout} from '../shared/lakeside-life.js';
// The bird's oak places are computed from the oak's wood model (shared/lakeside-dressing.js oakWood), which the scene also draws
// from; this checks them against the built mesh, so tuning either without the other shows here. The tube's flat sides (nine of
// them) leave its faces up to a few mm inside the round section the layout rests on, hence 0-5 cm rather than 0-3.
test('the bird\'s oak places rest on the built oak\'s bark', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), wood = ['trunk', 'limbs'].map(n => scene.parts.oak.getObjectByName(n));
  for (const id of ['nest', 'oak-perch', 'oak-shelter']) {
    const point = lifeLayout().bird.locations[id].point, {hit} = firstHit(wood, [point[0], point[1], point[2] + .5], [point[0], point[1], point[2] - 1]);
    assert.ok(hit, `${id}: nothing drawn beneath it`);
    const below = point[2] + .5 - hit.distance - point[2];
    assert.ok(-below >= 0 && -below <= .05, `${id} is ${(-below * 100).toFixed(1)} cm above the drawn bark`);
  }
});

test('the garden is drawn: boards, soil, stems and swaying leaves, on its beds', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), garden = scene.parts.garden;
  assert.equal(garden.name, 'garden');
  for (const name of ['beds', 'soil', 'stems', 'leaves']) assert.ok(garden.getObjectByName(name), name);
  assert.notEqual(garden.getObjectByName('beds').material.side, THREE.DoubleSide);
  const leaves = garden.getObjectByName('leaves').geometry, sway = leaves.getAttribute('sway');
  assert.ok(sway.count >= 4 * 150); let moving = 0; for (let i = 0; i < sway.count; i++) if (sway.getX(i) > 0) moving++;
  assert.equal(moving, sway.count);
  // everything stands over a bed's footprint (leaves may hang a little past the boards)
  const box = new THREE.Box3().setFromObject(garden), min = fromThree(box.min), max = fromThree(box.max);
  const xs = S.beds.map(b => b.center[0]), ys = S.beds.map(b => b.center[1]);
  assert.ok(Math.min(min[0], max[0]) > Math.min(...xs) - 2.2 && Math.max(min[0], max[0]) < Math.max(...xs) + 2.2);
  assert.ok(Math.min(min[1], max[1]) > Math.min(...ys) - 2.2 && Math.max(min[1], max[1]) < Math.max(...ys) + 2.2);
  // the boards face outward: from 3 m off each bed's long side, the first surface met faces the eye
  for (const bed of S.beds) for (const side of [-1, 1]) {
    const v = [Math.cos(bed.yaw) * side, -Math.sin(bed.yaw) * side], p = [bed.center[0] + v[0] * 3, bed.center[1] + v[1] * 3];
    const eye = [...p, terrainHeight(S, ...p) + S.eyeHeight], {hit, dir} = firstHit(garden.getObjectByName('beds'), eye, [bed.center[0] + v[0] * bed.size[1] / 2, bed.center[1] + v[1] * bed.size[1] / 2, terrainHeight(S, ...bed.center) + .1]);
    assert.ok(hit, bed.id); assert.ok(hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(dir) < 0, `${bed.id} board inside out`);
  }
  scene.dispose();
});

test('cards scale their sway reach by sway.scale', () => {
  const cards = cardBatch(), reach = scale => { cards.add([0, 0, 1], [.5, 0, 0], [0, 0, .5], SPACE_ART.cards.cells.dab[0], [1, 1, 1], [1, 1, 1], [0, 0, 1], false, {kind: 'crop', random: .5, scale}); };
  reach(undefined); reach(.25);
  const sway = cards.geometry(THREE).getAttribute('sway');
  assert.ok(sway.getZ(0) > 0); assert.ok(Math.abs(sway.getZ(4) - sway.getZ(0) * .25) < 1e-6);
});
test('the garden follows the day: bare in winter, seedlings in spring, redrawn only when the day changes', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), garden = scene.parts.garden;
  const leaves = () => garden.getObjectByName('leaves').geometry, count = () => leaves().getAttribute('position').count;
  const full = count(), first = leaves(); let disposed = 0; first.addEventListener('dispose', () => disposed++);
  assert.equal(scene.setGarden(GARDEN_DAY), false); assert.equal(leaves(), first);
  assert.equal(scene.setGarden(20), true); assert.equal(count(), 0); assert.equal(disposed, 1);
  assert.equal(garden.getObjectByName('stems').geometry.getAttribute('position').count, 0);
  assert.equal(scene.setGarden(150), true); assert.ok(count() > 0 && count() < full / 2);
  for (const bad of [NaN, undefined, 12.5, '230']) { const g = leaves(); assert.equal(scene.setGarden(bad), false); assert.equal(leaves(), g); }
  assert.equal(garden.children.length, 4);
  scene.dispose();
});
test('every tenth day of four years draws finite geometry and leaves nothing behind', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), garden = scene.parts.garden; let made = 0, gone = 0;
  const watch = () => { for (const name of ['soil', 'stems', 'leaves']) { const g = garden.getObjectByName(name).geometry; if (!g.userData.watched) { g.userData.watched = true; made++; g.addEventListener('dispose', () => gone++); } } };
  watch();
  for (let day = 0; day < 4 * 365; day += 10) {
    scene.setGarden(day); watch();
    for (const name of ['soil', 'stems', 'leaves']) { const p = garden.getObjectByName(name).geometry.getAttribute('position'); for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), `${name} day ${day}`); }
  }
  assert.equal(gone, made - 3); scene.dispose(); assert.equal(gone, made);
});
test('the window is never crossed: from the arrival, no part of the garden lies before it in any year', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), garden = scene.parts.garden, eye = [...S.arrival.position, terrainHeight(S, ...S.arrival.position) + S.eyeHeight];
  const [azMin, azMax] = windowSpan(S, D), centre = openingCentre(S, D, 'window-front-left'), w = D.cabin.windows.find(x => `window-${x.id}` === 'window-front-left');
  const range = Math.hypot(centre[0] - eye[0], centre[1] - eye[1]);
  for (let year = 0; year < 4; year++) for (const d of [200, 230, 262, 290]) {
    scene.setGarden(year * 365 + d); garden.updateMatrixWorld(true);
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 8; j++) {
      const az = azMin + (azMax - azMin) * i / 12, z = centre[2] - w.height / 2 + w.height * j / 8, target = [eye[0] + Math.sin(az) * range, eye[1] + Math.cos(az) * range, z];
      const {hit} = firstHit(garden, eye, target, Math.hypot(range, z - eye[2]));
      assert.ok(!hit, `year ${year} day ${d}: the garden crosses the window at bearing ${az.toFixed(3)}, height ${z.toFixed(2)}`);
    }
  }
  scene.dispose();
});
test('leaves on the window side are cut short where a plant has little room', () => {
  // each plant alone, as it stands at high summer in each year, with its room cut to ROOM: no vertex of its leaves, nor of a
  // corn stalk or a tomato's stem and stake, lies past its line (the bean pole leans to the teepee's apex, wherever that is)
  const ROOM = .2, [azMin] = windowSpan(S, D), [ax, ay] = S.arrival.position, leftOf = ([x, y]) => Math.sin(azMin) * (y - ay) - Math.cos(azMin) * (x - ax);
  const past = (g, line) => { const p = g.getAttribute('position'); let n = 0; for (let i = 0; i < p.count; i++) if (leftOf(fromThree({x: p.getX(i), y: p.getY(i), z: p.getZ(i)})) < line - 1e-6) n++; return n; };
  let cut = 0;
  for (let year = 0; year < 4; year++) for (const plant of gardenState(S, D, 365 * year + GARDEN_DAY).plants) {
    const alone = room => (space, dressing, day) => { const s = gardenState(space, dressing, day); return {...s, plants: s.plants.filter(p => p.id === plant.id).map(p => ({...p, room: room ?? p.room}))}; };
    const line = leftOf(plant.foot) - ROOM, part = (garden, name) => garden.object.getObjectByName(name).geometry;
    const tight = buildGarden(THREE, {space: S, dressing: D, art: stubArt(), day: 365 * year + GARDEN_DAY, stateOf: alone(ROOM)});
    const free = buildGarden(THREE, {space: S, dressing: D, art: stubArt(), day: 365 * year + GARDEN_DAY, stateOf: alone()});
    assert.ok(part(tight, 'leaves').getAttribute('position').count > 0, `${plant.id} year ${year} has no leaves left`);
    assert.equal(past(part(tight, 'leaves'), line), 0, `${plant.id} year ${year}: leaves past its line`);
    if (plant.kind !== 'bean') assert.equal(past(part(tight, 'stems'), line), 0, `${plant.id} year ${year}: stems past its line`);
    if (past(part(free, 'leaves'), line) > 0) cut++;
  }
  // the cut is exercised: drawn with its own room, most plants would reach past ROOM
  assert.ok(cut > 20, `only ${cut} plants reach past ${ROOM} m`);
});

test('a bean\'s leaves, blossoms and pods never stand above the tip of its climbing vine', () => {
  const plant = gardenState(S, D, 150).plants.find(p => p.kind === 'bean'), alone = (space, dressing, day) => { const s = gardenState(space, dressing, day); return {...s, plants: s.plants.filter(p => p.id === plant.id)}; };
  let drawn = 0;
  for (let d = 138; d <= 200; d++) {
    const garden = buildGarden(THREE, {space: S, dressing: D, art: stubArt(), day: d, stateOf: alone}), p = garden.object.getObjectByName('leaves').geometry.getAttribute('position');
    const h = alone(S, D, d).plants[0].stage.height, tip = plant.foot[2] + plant.height * Math.min(.98, 1.05 * h);
    // each card is four vertices; three's y is up
    for (let i = 0; i < p.count; i += 4) { const z = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2) + p.getY(i + 3)) / 4; drawn++; assert.ok(z <= tip + .03, `day ${d}: a card ${(z - plant.foot[2]).toFixed(3)} m up, the vine's tip at ${(tip - plant.foot[2]).toFixed(3)} m`); }
    garden.object.traverse(o => o.geometry?.dispose());
  }
  assert.ok(drawn > 500);
});

test('the path lights are drawn: stakes, lamps, halos and pools of light that follow the level', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), lights = scene.parts.lights, plan = pathLightPlan(S, D);
  assert.equal(lights.name, 'lights');
  const part = name => lights.getObjectByName(name);
  for (const name of ['stakes', 'lamps', 'halos', 'pools']) assert.ok(part(name), name);
  // each stake stands on its planned foot and no higher than its hood
  const box = new THREE.Box3().setFromObject(part('stakes')), {height, pool} = D.pathLights;
  for (const {foot} of plan) assert.ok(box.containsPoint(new THREE.Vector3(...toThree(foot))), 'a foot outside the stakes');
  assert.ok(box.max.y <= Math.max(...plan.map(l => l.foot[2])) + height + .1);
  // each pool lies on the ground about its light, within its radius
  const p = part('pools').geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), -p.getZ(i), p.getY(i)];
    assert.ok(Math.abs(z - terrainHeight(S, x, y) - .03) < 1e-4);
    assert.ok(plan.some(l => Math.hypot(x - l.foot[0], y - l.foot[1]) <= pool + 1e-3)); // Float32 positions
  }
  // dark as built: nothing emitted, nothing added
  const dark = () => { assert.equal(part('lamps').material.emissiveIntensity, 0); assert.equal(part('halos').material.uniforms.opacity.value, 0); assert.equal(part('pools').visible, false); assert.equal(part('halos').visible, false); };
  dark();
  scene.setPathLights(1);
  const full = part('lamps').material.emissiveIntensity;
  assert.ok(full > 0); assert.ok(part('pools').visible && part('pools').material.opacity > 0); assert.ok(part('halos').visible && part('halos').material.uniforms.opacity.value > 0);
  // the halo fades to nothing at its rim: one ball a lamp, smooth normals for the falloff, no stacked shells
  const halo = part('halos').geometry, ball = new THREE.IcosahedronGeometry(1, 3).getAttribute('position').count;
  assert.equal(halo.getAttribute('position').count, plan.length * ball); assert.ok(halo.getAttribute('normal'));
  assert.match(part('halos').material.fragmentShader, /opacity \* facing/);
  for (const name of ['pools', 'halos']) { assert.equal(part(name).material.blending, THREE.AdditiveBlending); assert.equal(part(name).material.depthWrite, false); }
  scene.setPathLights(.5); assert.ok(Math.abs(part('lamps').material.emissiveIntensity - full / 2) < 1e-9);
  scene.setPathLights(7); assert.equal(part('lamps').material.emissiveIntensity, full);
  scene.setPathLights(-1); dark(); scene.setPathLights(NaN); dark();
  // no light sources: the yard's shaders are not rebuilt for them
  let sources = 0; scene.group.traverse(o => { if (o.isLight) sources++; }); assert.equal(sources, 0);
  scene.dispose();
});
test('the front door is shut by default, swings inward when opened, and shows a dark doorway behind', () => {
  const scene = buildScene(THREE, {space: S, dressing: D, art: stubArt()}), openings = scene.parts.cabin.getObjectByName('openings');
  const door = openings.getObjectByName('door'), doorway = openings.getObjectByName('doorway');
  assert.ok(door && doorway && doorway.material.isMeshBasicMaterial);
  const centre = () => { door.updateWorldMatrix(true, false); door.geometry.computeBoundingBox(); return door.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(door.matrixWorld); };
  const shut = centre(), want = new THREE.Vector3(...toThree(openingCentre(S, D, 'door')));
  assert.ok(shut.distanceTo(want) < .05, `shut door at its panel: ${shut.distanceTo(want)}`);
  assert.equal(doorway.material.visible, false, 'no dark doorway shows beside the shut door'); assert.ok(door.visible);
  scene.setDoor(1); const open = centre(), cabin = new THREE.Vector3(...toThree([S.cabin.center[0], S.cabin.center[1], want.y]));
  assert.ok(open.distanceTo(shut) > .3); assert.ok(open.distanceTo(cabin) < shut.distanceTo(cabin), 'swings inward');
  assert.equal(doorway.material.visible, true, 'the dark doorway shows behind the open door'); assert.ok(door.visible);
  scene.setDoor(0); assert.ok(centre().distanceTo(shut) < 1e-6); assert.equal(doorway.material.visible, false);
  scene.dispose();
});
