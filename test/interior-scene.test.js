import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {buildInterior} from '../public/space/interior/index.js';
import {LAKESIDE_SPACE} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING} from '../shared/lakeside-dressing.js';
import {viewOpenings} from '../shared/window-views.js';
import {stubArt} from './space-scene.test.js';

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
  assert.ok(scene.children.some(o => o.isHemisphereLight)); assert.equal(scene.fog, null);
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
