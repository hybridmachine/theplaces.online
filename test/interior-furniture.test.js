import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {KINDS, footprint} from '../shared/furniture.js';
import {canStep, floorArea, onStair} from '../shared/interior.js';
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
// The solid pieces, each inside its own footprint; not the newel, which carries the stair's rail up the flight (its post is checked below).
const DRAWN_SOLID = I.furniture.filter(e => KINDS[e.kind].standing === 'solid' && RECIPES[e.kind] && e.kind !== 'newel');
// A standing piece's vertices (from every mesh) in its own frame: x across, y deep (it faces −y), z up from its floor; normals likewise.
const local = (scene, id) => {
  const e = I.furniture.find(x => x.id === id), c = Math.cos(e.turn || 0), s = Math.sin(e.turn || 0), floor = room(e.room).floor * I.floorRise;
  const frame = ([u, v]) => [u * c + v * s, -u * s + v * c];
  return MESHES.flatMap(m => vertices(scene, id, m)).map(v => {
    const [x, y] = frame([v.a - e.at[0], v.d - e.at[1]]), [nx, ny] = frame(v.n);
    return {x, y, z: v.z - floor, n: [nx, ny, v.n[2]]};
  });
};
const half = id => { const e = I.furniture.find(x => x.id === id); return (e.size || KINDS[e.kind].size).map(v => v / 2); };
// The rail's and balusters' vertices: the newel piece's, less its post (within 0.1 m of the newel in plan).
const railOf = scene => vertices(scene, 'newel', 'furniture-wood').filter(v => Math.hypot(v.a - I.stairRail.newel[0], v.d - I.stairRail.newel[1]) > .1);
// The rail's height over the flight at depth d: `height` above the treads' line.
const railZ = d => I.stairRail.height + I.floorRise * (d - I.stair.d[0]) / (I.stair.d[1] - I.stair.d[0]);

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

test('furniture vertices carry light and spill, and the sofa\'s side toward the fire takes more fire than its back', () => {
  const inside = build(), wood = furniture(inside.scene).getObjectByName('furniture-wood').geometry;
  assert.ok(wood.getAttribute('light') && wood.getAttribute('spill'));
  assert.equal(wood.getAttribute('light').count, wood.getAttribute('position').count);
  // (the sofa's vertices, by their normals along a: the fire is on the gable wall at a = 0, and the sofa faces it)
  const sofa = MESHES.flatMap(m => vertices(inside.scene, 'sofa', m));
  const toward = sofa.filter(v => v.n[0] < -.9).map(v => v.light[2]), away = sofa.filter(v => v.n[0] > .9).map(v => v.light[2]);
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
  // and the real blueprint warns of nothing: every kind in it is drawn
  const [plain, none] = warned(() => build()); assert.equal(none.length, 0); plain.dispose();
  for (const e of I.furniture) assert.ok(Object.hasOwn(RECIPES, e.kind), `${e.kind} has a recipe`);
});

test('a recipe that throws is skipped, with one warning, and the rest are drawn', () => {
  const kept = RECIPES.rug;
  RECIPES.rug = () => { throw new Error('a broken rug'); };
  try {
    const [inside, warnings] = warned(() => build());
    assert.equal(inside.furnished, true); assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /hearth-rug \(a broken rug\)/, 'the warning names the piece and why');
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

test('the furniture\'s light is weighed coarsely but in the right room, near the exact weights', () => {
  const inside = build(), DAY = .12, FIRE = .12;
  for (const id of ['sofa', 'bookshelf', 'boot-bench', 'umbrella-stand']) {
    const e = I.furniture.find(x => x.id === id), index = I.rooms.indexOf(room(e.room)), vs = MESHES.flatMap(m => vertices(inside.scene, id, m));
    assert.ok(vs.length > 20, id);
    // every seventh vertex, against the field weighed at the vertex itself
    for (let i = 0; i < vs.length; i += 7) {
      const v = vs[i], exact = inside.field.weigh(room(e.room).floor, [v.a, v.d, v.z], v.n);
      assert.equal(v.light[3], index, `${id} weighed in its own room`);
      assert.ok(Math.abs(v.light[0] - exact.day) <= DAY, `${id} day ${v.light[0]} against ${exact.day}`);
      assert.ok(Math.abs(v.light[2] - exact.fire) <= FIRE, `${id} fire ${v.light[2]} against ${exact.fire}`);
    }
  }
  inside.dispose();
});

test('the sofa and armchairs have rounded arms: their vertices are not all on six planes', () => {
  const inside = build();
  for (const id of ['sofa', 'armchair-front', 'armchair-back']) {
    const [hx] = half(id), vs = local(inside.scene, id), oblique = v => Math.max(...v.n.map(Math.abs)) < .9;
    for (const side of [-1, 1]) {
      const arm = vs.filter(v => side * v.x > hx - .12 && v.z > .45);
      assert.ok(arm.filter(oblique).length >= 8, `${id}'s ${side < 0 ? 'left' : 'right'} arm is rounded: ${arm.filter(oblique).length} oblique of ${arm.length}`);
    }
    const back = vs.filter(v => Math.abs(v.x) < hx - .2 && v.y > 0 && v.z > KINDS.armchair.seat + .3);
    assert.ok(back.filter(oblique).length >= 8, `${id}'s back is rounded`);
  }
  inside.dispose();
});

test('the armchairs are not mirror images of one another', () => {
  const inside = build(), key = vs => vs.map(v => [v.x, v.y, v.z].map(x => Math.round(x * 200)).join()).sort();
  const one = local(inside.scene, 'armchair-front'), two = local(inside.scene, 'armchair-back');
  assert.notDeepEqual(key(one), key(two), 'not the same chair');
  assert.notDeepEqual(key(one.map(v => ({...v, x: -v.x}))), key(two), 'nor its mirror image');
  // their arms' rolls differ in size, and their seats' dents
  const arm = vs => { const top = vs.filter(v => v.x > .2 && v.z > .45); return Math.max(...top.map(v => v.z)) - Math.min(...top.filter(v => v.n[2] < -.2).map(v => v.z)); };
  assert.ok(Math.abs(arm(one) - arm(two)) > .005, `arm rolls ${arm(one)} and ${arm(two)}`);
  const seat = vs => vs.filter(v => Math.abs(v.x) < .25 && v.y < 0 && v.z > .4 && v.z < .6 && v.n[2] > .8).map(v => v.z);
  assert.ok(seat(one).length > 4 && seat(two).length > 4);
  assert.notDeepEqual(seat(one).map(z => Math.round(z * 500)).sort(), seat(two).map(z => Math.round(z * 500)).sort(), 'their seats dent differently');
  inside.dispose();
});

test('the stair has a newel at its foot, a rail that rises with the flight and ends at the ceiling, and a baluster a tread', () => {
  const inside = build(), R = I.stairRail, all = vertices(inside.scene, 'newel', 'furniture-wood');
  // the newel: its post's box centred on stairRail.newel, its top at newelHeight
  const post = all.filter(v => Math.hypot(v.a - R.newel[0], v.d - R.newel[1]) <= .1 && v.z > railZ(R.newel[1]) + .1);
  assert.ok(post.length > 20);
  const span = k => [Math.min(...post.map(v => v[k])), Math.max(...post.map(v => v[k]))];
  for (const [k, c] of [['a', R.newel[0]], ['d', R.newel[1]]]) assert.ok(Math.abs((span(k)[0] + span(k)[1]) / 2 - c) < .01, `newel centred at ${k} ${c}: ${span(k)}`);
  assert.ok(Math.abs(span('z')[1] - R.newelHeight) < .01, `newel top ${span('z')[1]}`);
  assert.ok(Math.min(...all.map(v => v.z)) < .01, 'the newel stands on the floor');
  // the rail: about d = 2.5 its middle is the rail's height over the flight (its rings stand where they fall, so it is read as each
  // vertex's height over the rising line there)
  const rail = railOf(inside.scene), at = rail.filter(v => Math.abs(v.d - 2.5) < .3 && Math.abs(v.z - railZ(v.d)) < .1).map(v => v.z - railZ(v.d));
  assert.ok(at.length >= 8, `${at.length} rail vertices about d 2.5`);
  const mid = (Math.min(...at) + Math.max(...at)) / 2;
  assert.ok(Math.abs(mid) <= .03 && Math.max(...at) > .01, `rail's middle ${mid} off the line`);
  assert.ok(Math.max(...all.map(v => v.z)) <= I.groundCeiling + 1e-6, `nothing above the ceiling: ${Math.max(...all.map(v => v.z))}`);
  assert.ok(Math.max(...all.map(v => v.d)) <= R.ends + .05, `nothing beyond the rail's end: ${Math.max(...all.map(v => v.d))}`);
  assert.ok(Math.max(...rail.map(v => v.d)) >= R.ends - .1, 'it runs up to the ceiling');
  // the balusters: well below the rail, apart from one another along d, one for each tread whose middle is below the rail's end
  const run = (I.stair.d[1] - I.stair.d[0]) / 15, below = rail.filter(v => v.z < railZ(v.d) - .15).map(v => v.d).sort((p, q) => p - q);
  let groups = below.length ? 1 : 0;
  for (let i = 1; i < below.length; i++) if (below[i] - below[i - 1] > run / 2) groups++;
  const treads = Array.from({length: 15}, (_, k) => I.stair.d[0] + (k + .5) * run).filter(d => d < R.ends).length;
  assert.equal(groups, treads, `${groups} balusters for ${treads} treads`);
  inside.dispose();
});

test('nothing of the rail stands where the stair is walked', () => {
  const inside = build(), rail = railOf(inside.scene);
  assert.ok(rail.length > 50);
  for (const v of rail) assert.ok(v.a <= I.stair.a[0] + .06, `rail vertex at a ${v.a}`);
  inside.dispose();
});

test('the walker cannot come within the eye\'s clearance of the rail or its balusters, in the hall or on the flight', () => {
  // (canStep only ever permits a point floorArea stands or onStair walks, so those are every point the walker can reach)
  const inside = build(), rail = railOf(inside.scene);
  assert.ok(rail.length > 50, 'the rail is drawn');
  const a = (Math.min(...rail.map(v => v.a)) + Math.max(...rail.map(v => v.a))) / 2;
  const d0 = I.stairRail.newel[1], d1 = Math.max(...rail.map(v => v.d)), off = ([p, q]) => Math.hypot(p - a, q - Math.min(Math.max(q, d0), d1));
  let near = 0, seen = 0;
  for (let p = 8.9; p <= 10.4; p += .01) for (let q = 1; q <= 4.4; q += .01) {
    if (!floorArea(I, 0, [p, q]) && !onStair(I, [p, q])) continue;
    seen++; if (off([p, q]) < I.eyeClear - 1e-6) near++;
  }
  assert.ok(seen > 1000, `${seen} points sampled`);
  assert.equal(near, 0, `points within ${I.eyeClear} of the rail's line at a ${a}`);
  assert.ok(canStep(I, {floor: 0, position: [10.3, 1.2]}, [10.3, 1.55]), 'the flight is still walked from its foot');
  inside.dispose();
});

test('the landing\'s board rail is untouched', () => {
  const inside = build(), bare = build({...I, furniture: []});
  assert.equal(inside.scene.getObjectByName('stair').geometry.getAttribute('position').count, bare.scene.getObjectByName('stair').geometry.getAttribute('position').count);
  inside.dispose(); bare.dispose();
});

test('with no stone in the art, the jug and candlesticks are still drawn', () => {
  const art = stubArt(); delete art.surfaces.stone;
  const inside = buildInterior(THREE, {interior: I, art, openings}), stone = furniture(inside.scene).getObjectByName('furniture-stone');
  assert.ok(stone, 'a stone mesh');
  for (const id of ['jug', 'candlestick-1', 'candlestick-2']) assert.ok(vertices(inside.scene, id, 'furniture-stone').length > 20, id);
  assert.equal(stone.material.map ?? null, null);
  inside.fallBack(); assert.ok(stone.material.isMeshLambertMaterial);
  inside.dispose();
  const plain = build(), withStone = furniture(plain.scene).getObjectByName('furniture-stone');
  assert.ok(withStone.material.map, 'with the stone, its brushwork');
  plain.dispose();
});

test('sculpted pieces carry light: no vertex of furniture-wood, -cloth or -stone has an all-zero light weight', () => {
  const inside = build();
  for (const name of ['furniture-wood', 'furniture-cloth', 'furniture-stone']) {
    const l = furniture(inside.scene).getObjectByName(name).geometry.getAttribute('light');
    assert.ok(l, name);
    for (let i = 0; i < l.count; i++) assert.ok(l.getX(i) + l.getY(i) + l.getZ(i) > 0, `${name} vertex ${i}`);
  }
  inside.dispose();
});

test('counts are reported', () => {
  const inside = build();
  assert.ok(inside.furniture.vertices > 0); assert.ok(inside.furniture.meshes <= 5);
  assert.equal(inside.furniture.meshes, 3, 'wood, cloth and stone');
  inside.dispose();
});
