import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {KINDS, footprint} from '../shared/furniture.js';
import {buildInterior} from '../public/space/interior/index.js';
import {TUCK} from '../public/space/interior/furniture-kit.js';
import {RECIPES} from '../public/space/interior/furniture.js';
import {LAKESIDE_SPACE} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING} from '../shared/lakeside-dressing.js';
import {viewOpenings} from '../shared/window-views.js';
import {stubArt} from './space-scene.test.js';

const openings = viewOpenings(I, LAKESIDE_SPACE, LAKESIDE_DRESSING);
const build = (interior = I) => buildInterior(THREE, {interior, art: stubArt(), openings});
// Runs `fn` with console.warn captured, returning [its result, the warnings].
const warned = fn => { const warn = console.warn, got = []; console.warn = (...args) => got.push(args); try { return [fn(), got]; } finally { console.warn = warn; } };
const MESHES = ['furniture-wood', 'furniture-cloth', 'furniture-stone', 'shades', 'grounding'];
const furniture = scene => scene.getObjectByName('furniture');
// The vertices of one piece in one of the furniture's meshes, each as {a, d, z, n: [na, nd, nz], colour, light, spill} in the interior frame.
const vertices = (scene, id, meshName) => {
  const mesh = furniture(scene).getObjectByName(meshName), range = furniture(scene).userData.pieces.get(id)?.find(r => r.mesh === meshName);
  if (!range) return [];
  const g = mesh.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color'), l = g.getAttribute('light'), s = g.getAttribute('spill'), out = [];
  for (let i = range.first; i < range.first + range.count; i++) out.push({a: p.getX(i), d: -p.getZ(i), z: p.getY(i), n: [n.getX(i), -n.getZ(i), n.getY(i)],
    colour: [c.getX(i), c.getY(i), c.getZ(i)], light: [l.getX(i), l.getY(i), l.getZ(i), l.getW(i)], spill: [s.getX(i), s.getY(i)]});
  return out;
};
const mean = xs => xs.reduce((t, x) => t + x, 0) / xs.length;
const room = id => I.rooms.find(r => r.id === id);
// The solid kinds this task draws (the rest come with the sculpted pieces).
const DRAWN_SOLID = I.furniture.filter(e => KINDS[e.kind].standing === 'solid' && RECIPES[e.kind]);

test('the furniture is built with the rooms, in at most five meshes', () => {
  const inside = build(), group = furniture(inside.scene);
  assert.equal(inside.furnished, true);
  assert.ok(group, 'a group named furniture');
  assert.ok(group.children.length >= 1 && group.children.length <= 5, `${group.children.length} meshes`);
  for (const m of group.children) assert.ok(MESHES.includes(m.name), m.name);
  assert.ok(inside.furniture.vertices > 0); assert.equal(inside.furniture.meshes, group.children.length);
  assert.equal(group.getObjectByName('furniture-wood').material, inside.scene.getObjectByName('floors').material, 'wood takes the shell\'s surface material');
  assert.equal(group.getObjectByName('furniture-cloth').material.side, THREE.DoubleSide, 'cloth is double-sided');
  inside.dispose();
});

test('every solid piece is drawn inside its own footprint, and stands on its floor', () => {
  const inside = build();
  assert.ok(DRAWN_SOLID.length >= 6, DRAWN_SOLID.map(e => e.id).join());
  for (const e of DRAWN_SOLID) {
    const box = inside.pieceBox(e.id), f = footprint(e), floor = room(e.room).floor * I.floorRise;
    assert.ok(box, `${e.id} is drawn`);
    for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .02 && box[k][1] <= f[k][1] + .02, `${e.id} ${k} ${box[k]} within ${f[k]}`);
    assert.ok(Math.abs(box.z[0] - floor) <= .02, `${e.id} stands on its floor: ${box.z[0]}`);
    assert.ok(box.z[1] <= floor + KINDS[e.kind].height + .02, `${e.id} no taller than its kind: ${box.z[1]}`);
  }
  inside.dispose();
});

test('furniture vertices carry light and spill, and its faces toward the fire take more fire than those turned away', () => {
  const inside = build(), wood = furniture(inside.scene).getObjectByName('furniture-wood').geometry;
  assert.ok(wood.getAttribute('light') && wood.getAttribute('spill'));
  assert.equal(wood.getAttribute('light').count, wood.getAttribute('position').count);
  // (the living room's pieces, by their normals along a: the fire is on the gable wall at a = 0)
  const living = I.furniture.filter(e => e.room === 'living').flatMap(e => vertices(inside.scene, e.id, 'furniture-wood'));
  const toward = living.filter(v => v.n[0] < -.9).map(v => v.light[2]), away = living.filter(v => v.n[0] > .9).map(v => v.light[2]);
  assert.ok(toward.length > 20 && away.length > 20);
  assert.ok(mean(toward) > mean(away), `fire toward ${mean(toward)} against away ${mean(away)}`);
  inside.dispose();
});

test('the insides of the bookshelf are darker than its sides', () => {
  const inside = build(), vs = vertices(inside.scene, 'bookshelf', 'furniture-wood'), box = inside.pieceBox('bookshelf');
  const brightness = v => mean(v.colour), sideways = vs.filter(v => Math.abs(v.n[0]) > .9);
  // its outer sides stand at the box's ends (less the broken corners); the inner sides and the shelves' ends inside them
  const outer = sideways.filter(v => v.a < box.a[0] + .015 || v.a > box.a[1] - .015), inner = sideways.filter(v => v.a > box.a[0] + .02 && v.a < box.a[1] - .02);
  assert.ok(outer.length >= 8 && inner.length >= 8, `${outer.length} ${inner.length}`);
  assert.ok(mean(inner.map(brightness)) <= TUCK * 1.1 * mean(outer.map(brightness)), `${mean(inner.map(brightness))} against ${mean(outer.map(brightness))}`);
  inside.dispose();
});

test('a cushion is not a box: its top is not flat', () => {
  const inside = build();
  for (const id of ['cushion-window-seat-1', 'cushion-sofa-1']) {
    const vs = vertices(inside.scene, id, 'furniture-cloth');
    assert.ok(vs.length >= 6 * 25, `${id}: cut at least 4 × 4 on every side (${vs.length} vertices)`);
    // its top: the vertices whose normals point most nearly along the cushion's own up (lying, z; leaning, tilted back)
    const up = vs.reduce((b, v) => v.n[2] > b.n[2] ? v : b).n, top = vs.filter(v => v.n[0] * up[0] + v.n[1] * up[1] + v.n[2] * up[2] > .5);
    const along = top.map(v => v.a * up[0] + v.d * up[1] + v.z * up[2]);
    assert.ok(Math.max(...along) - Math.min(...along) > .02, `${id} top spread ${Math.max(...along) - Math.min(...along)}`);
  }
  inside.dispose();
});

test('the window seat stays under the sill, and the bookshelf clear of the kitchen opening', () => {
  const inside = build(), sill = I.windows.find(w => w.id === 'living').sill;
  for (const id of ['window-seat', 'cushion-window-seat-1', 'cushion-window-seat-2']) assert.ok(inside.pieceBox(id).z[1] < sill, `${id} below the sill`);
  const kitchen = I.openings.find(o => o.id === 'living-kitchen'), shelf = inside.pieceBox('bookshelf');
  assert.ok(shelf.a[1] < kitchen.span[0], `bookshelf ends at ${shelf.a[1]}, the opening starts at ${kitchen.span[0]}`);
  assert.ok(shelf.d[1] <= kitchen.at - I.wall / 2 + 1e-6, `bookshelf within the wall's face: ${shelf.d[1]}`);
  inside.dispose();
});

test('an entry with a kind that has no recipe is skipped without a throw', () => {
  const odd = {...I, furniture: [...I.furniture, {id: 'odd', kind: 'nonesuch', room: 'living', at: [3, 3], turn: 0},
    {id: 'orphan', kind: 'cushion', room: 'living', on: 'no-such-parent'}]};
  const [inside, warnings] = warned(() => build(odd));
  assert.equal(inside.furnished, true);
  assert.equal(warnings.length, 1, 'one warning for the whole build');
  assert.match(String(warnings[0][0]), /odd/); assert.match(String(warnings[0][0]), /orphan/);
  assert.equal(inside.pieceBox('odd'), null); assert.ok(inside.pieceBox('low-table'));
  inside.dispose();
  // and the real blueprint warns of nothing: the pieces still to come are passed over quietly
  const [plain, none] = warned(() => build()); assert.equal(none.length, 0); plain.dispose();
});

test('a recipe that throws is skipped, with one warning, and the rest are drawn', () => {
  const kept = RECIPES.rug;
  RECIPES.rug = () => { throw new Error('a broken rug'); };
  try {
    const [inside, warnings] = warned(() => build());
    assert.equal(inside.furnished, true); assert.equal(warnings.length, 1);
    assert.equal(inside.pieceBox('hearth-rug'), null); assert.ok(inside.pieceBox('bookshelf'));
    inside.dispose();
  } finally { RECIPES.rug = kept; }
});

test('a furniture build that throws leaves the rooms built and bare', () => {
  const [inside, warnings] = warned(() => build({...I, furniture: null}));
  assert.equal(inside.furnished, false); assert.equal(inside.furniture, null);
  assert.equal(warnings.length, 1); assert.equal(warnings[0][0], "The cabin's furniture could not be built; its rooms stay bare.");
  assert.ok(inside.scene.getObjectByName('walls')); assert.equal(furniture(inside.scene), undefined);
  assert.equal(inside.pieceBox('sofa'), null);
  inside.fallBack(); inside.dispose();
});

test('given up for the flat light, the furniture takes the flat materials', () => {
  const inside = build(), group = furniture(inside.scene);
  assert.notEqual(group.getObjectByName('furniture-wood').material.isMeshLambertMaterial, true);
  inside.fallBack();
  assert.ok(group.getObjectByName('furniture-wood').material.isMeshLambertMaterial);
  assert.ok(group.getObjectByName('furniture-cloth').material.isMeshLambertMaterial);
  assert.equal(group.getObjectByName('furniture-cloth').material.side, THREE.DoubleSide);
  inside.dispose();
});

test('the same furniture twice: two builds give identical positions', () => {
  const one = build(), two = build();
  for (const name of MESHES) {
    const a = furniture(one.scene).getObjectByName(name), b = furniture(two.scene).getObjectByName(name);
    assert.equal(!!a, !!b, name);
    if (a) { assert.deepEqual(a.geometry.getAttribute('position').array, b.geometry.getAttribute('position').array, name); assert.deepEqual(a.geometry.getAttribute('color').array, b.geometry.getAttribute('color').array, name); }
  }
  one.dispose(); two.dispose();
});
