import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {KINDS, footprint, corners, bareInterior, withoutPieces} from '../shared/furniture.js';
import {MANTEL} from '../public/space/interior/fireplace.js';
import {canStep, floorArea, onStair} from '../shared/interior.js';
import {buildInterior} from '../public/space/interior/index.js';
import {TUCK, createKit} from '../public/space/interior/furniture-kit.js';
import {RECIPES, GROUND, SHADE_PALE, SHADE_WARM} from '../public/space/interior/furniture.js';
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
    colour: [c.getX(i), c.getY(i), c.getZ(i)], light: l ? [l.getX(i), l.getY(i), l.getZ(i), l.getW(i)] : null, spill: s ? [s.getX(i), s.getY(i)] : null});
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

test('a solid piece whose recipe throws takes everything set on it with it: none drawn, no patch, all named once', () => {
  const recipes = {...RECIPES, sofa: () => { throw new Error('a broken sofa'); }};
  const [inside, warnings] = warned(() => buildInterior(THREE, {interior: I, art: stubArt(), openings, recipes}));
  const gone = ['sofa', 'cushion-sofa-1', 'cushion-sofa-2', 'cushion-sofa-3', 'throw'];
  assert.equal(inside.furnished, true);
  for (const id of gone) assert.equal(inside.pieceBox(id), null, `${id} is not drawn`);
  assert.ok(inside.pieceBox('console') && inside.pieceBox('cushion-armchair-front'), 'the rest are drawn');
  assert.equal(furniture(inside.scene).userData.grounding.has('sofa'), false, 'no patch under the sofa');
  assert.ok(furniture(inside.scene).userData.grounding.has('console'));
  assert.deepEqual([...inside.skipped].sort(), [...gone].sort());
  assert.equal(warnings.length, 1);
  const text = String(warnings[0][0]);
  for (const id of gone) assert.equal(text.split(new RegExp(`(?<![\\w-])${id} \\(`)).length - 1, 1, `${id} named once: ${text}`);
  assert.match(text, /sofa \(a broken sofa\)/);
  // the walker's plan without them: the sofa's floor is open, the console and the armchairs still stop it
  const plan = withoutPieces(I, inside.skipped);
  assert.equal(floorArea(plan, 0, [4.95, 3.5]), true);
  for (const id of ['console', 'armchair-front', 'armchair-back']) assert.equal(floorArea(plan, 0, I.furniture.find(e => e.id === id).at), false, id);
  inside.dispose();
  const [whole] = warned(() => build()); assert.deepEqual(whole.skipped, [], 'nothing skipped on the real blueprint'); whole.dispose();
});

test('the mantel\'s pieces stand on its shelf in front of the breast, none of them in the stone or past the shelf\'s edge', () => {
  const inside = build(), fp = I.fireplace, face = fp.a + fp.breast.depth, front = face - MANTEL.into + MANTEL.depth, top = fp.mantel;
  for (const id of ['clock', 'jug', 'candlestick-1', 'candlestick-2']) {
    const box = inside.pieceBox(id);
    assert.ok(box.a[0] >= face - .001, `${id} reaches back to ${box.a[0]}, the breast's face is at ${face}`);
    assert.ok(box.a[1] <= front + .001, `${id} reaches out to ${box.a[1]}, the shelf's front is at ${front}`);
    assert.ok(Math.abs(box.z[0] - top) <= .001, `${id} stands on the shelf's top: ${box.z[0]}`);
    assert.ok(box.d[0] >= fp.d - MANTEL.width / 2 && box.d[1] <= fp.d + MANTEL.width / 2, `${id} along the shelf`);
  }
  inside.dispose();
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

test('the sofa\'s cushions and arm rolls take light near the exact field at every vertex', () => {
  // The coarse weighing (a 0.3 m lattice, normals rounded to half a unit) on the sofa's rounded and soft parts, where a stepped light would show:
  // every vertex of its seat and back cushions, its arm rolls and its three loose cushions within 0.1 of the field weighed at the vertex itself,
  // day and fire. Measured worst at the time of writing: day .078, fire .028 (the whole furniture's worst, on rail caps and the runner, is .29).
  // 0.1 is tighter than the 0.12 held on every seventh vertex of four pieces above, with a fifth of headroom over what was measured.
  const inside = build(), TOLERANCE = .1, e = I.furniture.find(x => x.id === 'sofa'), [hx] = half('sofa'), c = Math.cos(e.turn), s = Math.sin(e.turn);
  const x = v => (v.a - e.at[0]) * c + (v.d - e.at[1]) * s, seat = KINDS.sofa.seat;
  const sofa = vertices(inside.scene, 'sofa', 'furniture-cloth');
  const parts = {
    'arm rolls': sofa.filter(v => Math.abs(x(v)) > hx - .2 && v.z > .5 && Math.max(...v.n.map(Math.abs)) < .97),
    cushions: sofa.filter(v => Math.abs(x(v)) < hx - .2 && v.z > seat - .1 && v.z < KINDS.sofa.height - .1),
    'loose cushions': I.furniture.filter(x => x.on === 'sofa' && x.kind === 'cushion').flatMap(x => vertices(inside.scene, x.id, 'furniture-cloth'))};
  for (const [name, vs] of Object.entries(parts)) {
    assert.ok(vs.length > 20, `${name}: ${vs.length}`);
    for (const v of vs) {
      const exact = inside.field.weigh(room('living').floor, [v.a, v.d, v.z], v.n);
      assert.ok(Math.abs(v.light[0] - exact.day) <= TOLERANCE, `${name} day ${v.light[0]} against ${exact.day}`);
      assert.ok(Math.abs(v.light[2] - exact.fire) <= TOLERANCE, `${name} fire ${v.light[2]} against ${exact.fire}`);
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
    // the back's roll: its top is the piece's height, and its top quarter (within 0.05 m of that, the roll's radius being 0.075 m or more) lies
    // above the back cushions' tops and the arms. (It once took every vertex 0.3 m over the armchair's seat, the back cushions with it.)
    // Every ring of the roll is rounded there: at least two oblique vertices a ring, over at least three rings.
    const e = I.furniture.find(x => x.id === id), h = KINDS[e.kind].height, back = vs.filter(v => v.y > 0 && v.z > h - .05);
    const rings = new Map();
    for (const v of back) { const k = Math.round(v.x * 100); rings.set(k, (rings.get(k) ?? 0) + (oblique(v) ? 1 : 0)); }
    const rounded = [...rings.values()].filter(n => n >= 2).length;
    assert.ok(rounded >= 3 && rounded === rings.size, `${id}'s back is rounded: ${rounded} of ${rings.size} rings (${[...rings.values()]})`);
  }
  inside.dispose();
});

test('the armchairs are not mirror images of one another', () => {
  const inside = build(), key = vs => vs.map(v => [v.x, v.y, v.z].map(x => Math.round(x * 200)).join()).sort();
  const one = local(inside.scene, 'armchair-front'), two = local(inside.scene, 'armchair-back');
  assert.notDeepEqual(key(one), key(two), 'not the same chair');
  assert.notDeepEqual(key(one.map(v => ({...v, x: -v.x}))), key(two), 'nor its mirror image');
  // their arms' rolls differ in size, and their seats' dents
  // (over the front half of the arm itself, clear of the seat's cushions and the back: since the cushions were cut 3 × 3 rather than 4 × 4 in
  // part 4a's task 7, a window reaching the arm's inner edge took in cushion vertices beside it)
  const [hx] = half('armchair-front'), arm = vs => { const top = vs.filter(v => v.x > hx - .12 && v.y < 0 && v.z > .45); return Math.max(...top.map(v => v.z)) - Math.min(...top.filter(v => v.n[2] < -.2).map(v => v.z)); };
  assert.ok(Math.abs(arm(one) - arm(two)) > .005, `arm rolls ${arm(one)} and ${arm(two)}`);
  // (the seat's top over its middle; widened from |x| < .25, y < 0 in task 7, as fewer of the coarser cushion's vertices fell in that patch)
  const seat = vs => vs.filter(v => Math.abs(v.x) < .3 && v.y < .1 && v.z > .4 && v.z < .6 && v.n[2] > .8).map(v => v.z);
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
  assert.equal(inside.furniture.meshes, 5, 'wood, cloth, stone, shades and grounding');
  inside.dispose();
});

// ── grounding and the lamps' shades ──
const living = I.rooms.findIndex(r => r.id === 'living');
// The frame's dials as buildInterior's setLight reads them: a mid-day-ish light, the night fill, the living room's lamp at `level` and `others` for every other room.
const dialsAt = (level, others = 0) => ({day: [.6, .55, .45], fill: [.042, .054, .091], fire: 0, lamps: I.rooms.map((_, i) => i === living ? level : others)});
const shadeColour = (inside, dials) => {
  inside.setLight(dials);
  const c = furniture(inside.scene).getObjectByName('shades').material.color;
  return [c.r, c.g, c.b];
};
const SOLID = I.furniture.filter(e => KINDS[e.kind].standing === 'solid');
// A piece's patch: its vertices as {a, d, z, alpha}.
const patch = (scene, id) => {
  const range = furniture(scene).userData.grounding.get(id), g = furniture(scene).getObjectByName('grounding').geometry, p = g.getAttribute('position'), c = g.getAttribute('color'), out = [];
  for (let i = range.first; i < range.first + range.count; i++) out.push({a: p.getX(i), d: -p.getZ(i), z: p.getY(i), alpha: c.getW(i)});
  return out;
};

test('a roll\'s far end cap takes the end colour as the near one does', () => {
  const kit = createKit(THREE, {face: () => { throw new Error('no face'); }, lit: g => g});
  const sides = 6, [g] = kit.roll(kit.placed({at: [0, 0], turn: 0, lift: 0, room: 'living'}), [0, 0, 0], [0, 0, 1.3], .05, () => [0, 0, 1], {sides, ends: () => [1, 0, 0]});
  const c = g.getAttribute('color'); let ends = 0;
  for (let i = 0; i < c.count; i++) if (c.getX(i) === 1) { ends++; assert.deepEqual([c.getX(i), c.getY(i), c.getZ(i)], [1, 0, 0], `vertex ${i} is wholly the end colour`); }
  assert.equal(ends, 4 * (sides + 1), 'two rings a cap, both caps');
  // every vertex off the ends is body colour
  for (let i = 0; i < c.count; i++) if (c.getX(i) !== 1) assert.deepEqual([c.getX(i), c.getY(i), c.getZ(i)], [0, 0, 1]);
});

test('every solid piece has a patch on the floor beneath it, darkest under it and nothing at its rim', () => {
  const inside = build();
  assert.equal(GROUND.reach, .22); assert.equal(GROUND.dark, .42);
  for (const e of SOLID) {
    const p = patch(inside.scene, e.id), dark = p.filter(v => v.alpha > 0), rim = p.filter(v => v.alpha === 0);
    assert.ok(p.length > 0, `${e.id} has a patch`);
    assert.ok(dark.length > 0 && rim.length > 0, e.id);
    for (const v of dark) assert.ok(Math.abs(v.alpha - GROUND.dark) < 1e-6, `${e.id} dark ${v.alpha}`);
    // the dark vertices lie within the piece's reach of its footprint, the rim vertices are the outermost
    const f = footprint(e), cx = mean(f.a), cy = mean(f.d);
    const far = v => Math.hypot(v.a - cx, v.d - cy);
    assert.ok(Math.max(...dark.map(far)) < Math.min(...rim.map(far)) + 1e-6, `${e.id}: the dark lies inside the rim`);
  }
  const mat = furniture(inside.scene).getObjectByName('grounding').material;
  assert.ok(mat.isMeshBasicMaterial && mat.vertexColors && mat.transparent && !mat.depthWrite && mat.polygonOffset && mat.polygonOffsetFactor === -1);
  // drawn with the rooms, blended over the floor without writing depth, so nothing behind it is hidden and it never reaches the overlay
  const ground = furniture(inside.scene).getObjectByName('grounding');
  let inScene = false; inside.scene.traverse(o => { if (o === ground) inScene = true; });
  let inOverlay = false; inside.overlay.traverse(o => { if (o === ground) inOverlay = true; });
  assert.ok(inScene && !inOverlay, 'in the rooms\' scene, not the overlay');
  inside.dispose();
});

test('the grounding lies just above the floor and inside the piece\'s room', () => {
  const inside = build(), rugs = I.furniture.filter(e => KINDS[e.kind].standing === 'walk-over');
  for (const e of SOLID) {
    const r = room(e.room), floor = r.floor * I.floorRise, wall = I.wall / 2;
    // a piece standing on a rug has its patch just over the rug's top instead
    const base = rugs.filter(g => g.room === e.room).map(g => inside.pieceBox(g.id)).filter(b => b && b.a[0] <= e.at[0] && e.at[0] <= b.a[1] && b.d[0] <= e.at[1] && e.at[1] <= b.d[1]).reduce((t, b) => Math.max(t, b.z[1]), floor);
    for (const v of patch(inside.scene, e.id)) {
      assert.ok(v.z - base >= .002 - 1e-6 && v.z - base <= .006 + 1e-6, `${e.id} z ${v.z - base} over ${base}`);
      assert.ok(v.a >= r.a[0] + wall - 1e-6 && v.a <= r.a[1] - wall + 1e-6 && v.d >= r.d[0] + wall - 1e-6 && v.d <= r.d[1] - wall + 1e-6, `${e.id} (${v.a}, ${v.d}) is inside ${r.id}`);
    }
  }
  // pieces that stand on no rug lie over the floor itself
  for (const id of ['sofa', 'armchair-front', 'bookshelf']) for (const v of patch(inside.scene, id)) assert.ok(v.z <= room('living').floor * I.floorRise + .006 + 1e-6, id);
  inside.dispose();
});

test('the patch turns with a turned piece', () => {
  const inside = build(), e = I.furniture.find(x => x.id === 'armchair-front'), [w, h] = KINDS.armchair.size, k = GROUND.reach;
  const p = patch(inside.scene, e.id), dark = p.filter(v => v.alpha > 0), c = Math.cos(e.turn), s = Math.sin(e.turn);
  assert.equal(dark.length, 4);
  // the inner cell is the footprint drawn in by .05 (corners() turned and shrunk), not the square-on bound
  const want = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const x = u * (w / 2 - .05), y = v * (h / 2 - .05); return [e.at[0] + x * c - y * s, e.at[1] + x * s + y * c]; });
  for (const [a, d] of want) assert.ok(dark.some(v => Math.hypot(v.a - a, v.d - d) < 1e-4), `inner corner ${a}, ${d}`);
  const pts = corners(e), bound = footprint(e);
  assert.ok(pts.some(([a]) => a < bound.a[1] - .05 && a > bound.a[0] + .05), 'the chair is turned, so its corners are not the bound\'s');
  assert.ok(Math.max(...p.map(v => Math.hypot(v.a - e.at[0], v.d - e.at[1]))) <= Math.hypot(w / 2 + k, h / 2 + k) + 1e-4);
  inside.dispose();
});

test('the newel and the standing lamp take a small round patch', () => {
  const inside = build();
  for (const id of ['newel', 'standing-lamp']) {
    const e = I.furniture.find(x => x.id === id), p = patch(inside.scene, id), far = Math.max(...p.map(v => Math.hypot(v.a - e.at[0], v.d - e.at[1])));
    assert.ok(far > .15 && far <= GROUND.disc + 1e-4, `${id} reaches ${far}`);
    assert.ok(p.some(v => Math.abs(v.alpha - GROUND.dark) < 1e-6) && p.some(v => v.alpha === 0));
  }
  inside.dispose();
});

test('the grounding patches face up', () => {
  const inside = build(), g = furniture(inside.scene).getObjectByName('grounding').geometry, p = g.getAttribute('position'), idx = g.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    const [A, B, C] = [0, 1, 2].map(k => [p.getX(idx[t + k]), p.getY(idx[t + k]), p.getZ(idx[t + k])]);
    const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
    assert.ok(ny >= -1e-12, `triangle ${t / 3} faces up`);
  }
  inside.dispose();
});

test('the shades are pale with the lamp out and warm with it lit, by the living room\'s dial alone', () => {
  const inside = build(), out = shadeColour(inside, dialsAt(0)), lit = shadeColour(inside, dialsAt(1));
  assert.ok(out[0] / out[2] < 1.4, `out r/b ${out[0] / out[2]}`);
  assert.ok(lit[0] / lit[2] > 2, `lit r/b ${lit[0] / lit[2]}`);
  assert.deepEqual(lit.map(v => +v.toFixed(6)), SHADE_WARM.map(v => +v.toFixed(6)), 'fully lit is the warm colour');
  assert.deepEqual(shadeColour(inside, dialsAt(0, 1)), out, 'another room\'s lamp changes nothing');
  assert.deepEqual(shadeColour(inside, dialsAt(1, 1)), lit);
  // pale is the pale tint times the room's light, so more day makes it brighter
  const brighter = shadeColour(inside, {...dialsAt(0), day: [1.2, 1.1, .9]});
  assert.ok(brighter[0] > out[0] && SHADE_PALE.every(v => v > 0));
  inside.dispose();
});

test('the shade never jumps: its colour at level .5 lies between its colours at 0 and 1', () => {
  const inside = build(), a = shadeColour(inside, dialsAt(0)), m = shadeColour(inside, dialsAt(.5)), b = shadeColour(inside, dialsAt(1));
  for (let c = 0; c < 3; c++) assert.ok(m[c] >= Math.min(a[c], b[c]) - 1e-9 && m[c] <= Math.max(a[c], b[c]) + 1e-9, `channel ${c}: ${a[c]} ${m[c]} ${b[c]}`);
  // and it steps smoothly: a small change of level is a small change of colour
  const near = shadeColour(inside, dialsAt(.51));
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(near[c] - m[c]) < .05 * Math.abs(b[c] - a[c]) + 1e-6);
  // an unreadable dial never throws nor gives a colour that is not finite
  for (const bad of [{...dialsAt(0), lamps: [NaN, undefined, Infinity]}, {...dialsAt(1), fire: NaN, day: [NaN, 1, 1]}]) assert.ok(shadeColour(inside, bad).every(Number.isFinite));
  inside.dispose();
});

test('the shades are their own mesh, drawn double-sided, the lamps\' shades and nothing else', () => {
  const inside = build(), group = furniture(inside.scene), shades = group.getObjectByName('shades');
  assert.ok(shades && shades.material.isMeshBasicMaterial && shades.material.side === THREE.DoubleSide);
  for (const id of ['standing-lamp', 'table-lamp']) {
    assert.ok(vertices(inside.scene, id, 'shades').length > 0, `${id} has a shade`);
    assert.equal(vertices(inside.scene, id, 'furniture-cloth').length, 0, `${id} has none in the cloth`);
  }
  assert.equal(group.userData.pieces.get('sofa')?.some(r => r.mesh === 'shades'), false);
  inside.dispose();
});

test('given up for the flat light with the lamp lit: furniture drawn, shades still warm, grounding in place, nothing thrown', () => {
  const inside = build(), group = furniture(inside.scene), ground = group.getObjectByName('grounding'), material = ground.material, count = ground.geometry.getAttribute('position').count;
  inside.fallBack();
  const lit = shadeColour(inside, dialsAt(1));
  assert.ok(lit[0] / lit[2] > 2, 'still warm');
  assert.equal(group.getObjectByName('grounding').material, material); assert.equal(group.getObjectByName('grounding').geometry.getAttribute('position').count, count);
  assert.ok(group.getObjectByName('furniture-wood').material.isMeshLambertMaterial);
  assert.ok(group.getObjectByName('shades').material.isMeshBasicMaterial);
  assert.ok(shadeColour(inside, dialsAt(0))[0] / shadeColour(inside, dialsAt(0))[2] < 1.4);
  inside.dispose();
});

test('no light source and nothing new in the overlay', () => {
  const inside = build(), bare = build({...I, furniture: [], obstacles: I.breasts});
  let lights = 0; inside.scene.traverse(o => { if (o.isLight && !o.isHemisphereLight) lights++; });
  assert.equal(lights, 0);
  assert.equal(inside.overlay.children.length, bare.overlay.children.length);
  let found = 0; inside.overlay.traverse(o => { if (o.name === 'shades' || o.name === 'grounding') found++; });
  assert.equal(found, 0);
  inside.dispose(); bare.dispose();
});

test('a blueprint with no furniture reports it is not furnished and draws no furniture', () => {
  const inside = build(bareInterior(I));
  assert.equal(inside.furnished, false);
  let vertices = 0;
  inside.scene.traverse(o => { if (o.name?.startsWith('furniture') && o.geometry) vertices += o.geometry.getAttribute('position')?.count ?? 0; });
  assert.equal(vertices, 0);
});

test('a rug in another room over the same plan position does not lift a piece\'s patch', () => {
  const rug = I.furniture.find(e => e.id === 'hearth-rug');
  const onRug = SOLID.filter(e => e.room === rug.room && Math.abs(e.at[0] - rug.at[0]) <= 1 && Math.abs(e.at[1] - rug.at[1]) <= .8);
  assert.ok(onRug.length, 'some piece stands on the hearth rug');
  const floor = room(rug.room).floor * I.floorRise, lowest = (scene, id) => Math.min(...patch(scene, id).map(v => v.z));
  const lifted = build();
  const other = structuredClone(I); other.furniture.find(e => e.id === 'hearth-rug').room = 'hall';
  const moved = build(other);
  let lifts = 0;
  for (const e of onRug) {
    if (lowest(lifted.scene, e.id) > floor + .006 + 1e-6) lifts++;
    assert.ok(lowest(moved.scene, e.id) <= floor + .006 + 1e-6, `${e.id}'s patch lies over the floor when the rug is in another room`);
  }
  assert.ok(lifts > 0, 'on its own room\'s rug a patch is lifted');
  lifted.dispose(); moved.dispose();
});
