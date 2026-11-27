import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {KINDS, footprint, corners, bareInterior, withoutPieces, withoutRooms, obstaclesOf} from '../shared/furniture.js';
import {MANTEL} from '../public/space/interior/fireplace.js';
import {canStep, ceilingHeight, floorArea, onStair} from '../shared/interior.js';
import {buildInterior} from '../public/space/interior/index.js';
import {TUCK, createKit} from '../public/space/interior/furniture-kit.js';
import {buildFurniture, RECIPES, GROUND, SHADE_PALE, SHADE_WARM, SURFACES, COLOURS} from '../public/space/interior/furniture.js';
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
const groupFor = (scene, id) => scene.children.find(o => o.userData?.pieces?.has(id));
const groundGroupFor = (scene, id) => scene.children.find(o => o.userData?.grounding?.has(id));
// The vertices of one piece in one of the furniture's meshes, each as {a, d, z, n: [na, nd, nz], colour, light, spill} in the interior frame.
const vertices = (scene, id, meshName) => {
  const grp = groupFor(scene, id), mesh = grp?.getObjectByName(meshName), range = grp?.userData.pieces.get(id)?.find(r => r.mesh === meshName);
  if (!range || !mesh) return [];
  const g = mesh.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color'), l = g.getAttribute('light'), s = g.getAttribute('spill'), out = [];
  for (let i = range.first; i < range.first + range.count; i++) out.push({a: p.getX(i), d: -p.getZ(i), z: p.getY(i), n: [n.getX(i), -n.getZ(i), n.getY(i)],
    colour: [c.getX(i), c.getY(i), c.getZ(i)], light: l ? [l.getX(i), l.getY(i), l.getZ(i), l.getW(i)] : null, spill: s ? [s.getX(i), s.getY(i)] : null});
  return out;
};
const mean = xs => xs.reduce((t, x) => t + x, 0) / xs.length;
const room = id => I.rooms.find(r => r.id === id);
const laterRooms = new Set([...(I.furnishLater || []), ...(I.furnishUpper || [])]);
const allQueued = () => [...(I.furnishLater || []), ...(I.furnishUpper || [])];
// The solid pieces of the first build, each inside its own footprint; not the newel, which carries the stair's rail up the flight.
const DRAWN_SOLID = I.furniture.filter(e => !laterRooms.has(e.room) && KINDS[e.kind].standing === 'solid' && RECIPES[e.kind] && e.kind !== 'newel');
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
  assert.ok(inside.furniture.sets[0].meshes >= 1 && inside.furniture.sets[0].meshes <= 5);
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
const SOLID = I.furniture.filter(e => !laterRooms.has(e.room) && KINDS[e.kind].standing === 'solid');
// A piece's patch: its vertices as {a, d, z, alpha}.
const patch = (scene, id) => {
  const grp = groundGroupFor(scene, id);
  const range = grp.userData.grounding.get(id), g = grp.getObjectByName('grounding').geometry, p = g.getAttribute('position'), c = g.getAttribute('color'), out = [];
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

const studyIdx = I.rooms.findIndex(r => r.id === 'study');
const dialsFor = (levels = {}) => ({
  day: [.6, .55, .45], fill: [.042, .054, .091], fire: 0,
  lamps: I.rooms.map(r => levels[r.id] ?? 0),
});
const studyLampBlueprint = () => {
  const c = structuredClone(withoutRooms(I, allQueued()));
  c.furnishLater = ['study'];
  c.furniture.push(
    {id: 'test-study-table', kind: 'side-table', room: 'study', at: [16.1, .5], turn: 0},
    {id: 'test-study-lamp', kind: 'table-lamp', room: 'study', on: 'test-study-table'},
  );
  c.obstacles = obstaclesOf(c);
  return c;
};
const groupShadeColour = (inside, groupName, dials) => {
  inside.setLight(dials);
  const c = inside.scene.getObjectByName(groupName).getObjectByName('shades').material.color;
  return [c.r, c.g, c.b];
};

test('a study lamp\'s shade follows the study\'s lamp, not the living room\'s', () => {
  const inside = build(studyLampBlueprint());
  inside.buildRest();
  const studyLit = groupShadeColour(inside, 'furniture-study', dialsFor({study: 1, living: 0}));
  assert.deepEqual(studyLit.map(v => +v.toFixed(6)), SHADE_WARM.map(v => +v.toFixed(6)), 'study shade is warm when study lamp is lit');
  const studyOut = groupShadeColour(inside, 'furniture-study', dialsFor({study: 0, living: 1}));
  assert.ok(studyOut[0] / studyOut[2] < 1.4, `study shade stays pale when only living lamp is lit: ${studyOut}`);
  assert.notDeepEqual(studyOut.map(v => +v.toFixed(4)), SHADE_WARM.map(v => +v.toFixed(4)));
  const studyOutNone = groupShadeColour(inside, 'furniture-study', dialsFor({study: 0, living: 0}));
  assert.deepEqual(studyOut, studyOutNone, 'living room lamp changes nothing on the study shade');
  // the living room's shades still follow the living room's lamp
  const livingLit = groupShadeColour(inside, 'furniture', dialsFor({study: 0, living: 1}));
  assert.deepEqual(livingLit.map(v => +v.toFixed(6)), SHADE_WARM.map(v => +v.toFixed(6)));
  const livingOut = groupShadeColour(inside, 'furniture', dialsFor({study: 1, living: 0}));
  assert.ok(livingOut[0] / livingOut[2] < 1.4);
  inside.dispose();
});

test('a missing or non-finite lamp level leaves the shade pale and finite, and after fallBack a later set still colours its shades', () => {
  const inside = build(studyLampBlueprint());
  inside.fallBack();
  inside.buildRest();
  const pale = groupShadeColour(inside, 'furniture-study', dialsFor({study: 0}));
  const missingLamps = groupShadeColour(inside, 'furniture-study', {day: [.6, .55, .45], fill: [.042, .054, .091], fire: 0});
  assert.deepEqual(missingLamps, pale, 'missing lamps keeps the pale colour');
  const nanLamps = groupShadeColour(inside, 'furniture-study', {day: [.6, .55, .45], fill: [.042, .054, .091], fire: 0, lamps: I.rooms.map(() => NaN)});
  assert.deepEqual(nanLamps, pale, 'NaN lamps keeps the pale colour');
  const empty = groupShadeColour(inside, 'furniture-study', {});
  assert.ok(empty.every(Number.isFinite), 'empty dials give finite channels');
  const warmAfterFallback = groupShadeColour(inside, 'furniture-study', dialsFor({study: 1}));
  assert.deepEqual(warmAfterFallback.map(v => +v.toFixed(6)), SHADE_WARM.map(v => +v.toFixed(6)), 'after fallBack a later set still warms its shade');
  assert.ok(studyIdx >= 0);
  inside.dispose();
});

test('shades in two rooms are refused', () => {
  const c = structuredClone(withoutRooms(I, allQueued()));
  c.furniture.push(
    {id: 'two-study-table', kind: 'side-table', room: 'study', at: [16.1, .5], turn: 0},
    {id: 'two-study-lamp', kind: 'table-lamp', room: 'study', on: 'two-study-table'},
    {id: 'two-master-table', kind: 'side-table', room: 'master', at: [13.4, 11.65], turn: 0},
    {id: 'two-master-lamp', kind: 'table-lamp', room: 'master', on: 'two-master-table'},
  );
  c.obstacles = obstaclesOf(c);
  const inside = build();
  const mat = inside.scene.getObjectByName('floors').material;
  const leafed = furniture(inside.scene).getObjectByName('furniture-cloth').material;
  const dummyFace = (f, a, b, o, col) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    return g;
  };
  assert.throws(() => buildFurniture(THREE, {
    interior: c, art: stubArt(), light: null, flat: null, face: dummyFace, lit: g => g,
    tint: base => () => base, materials: {surface: mat, leafed}, treads: 15,
    only: new Set(['study', 'master']), name: 'two',
    weightsAt: () => ({day: .5, lamp: 0, fire: 0, room: -1, spill: 0, spillRoom: -1}),
  }), /shades in two rooms/);
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

// ── furniture built by room, from a queue ──
const queuedBlueprint = () => {
  const c = structuredClone(withoutRooms(I, allQueued()));
  c.furnishLater = ['kitchen', 'dining'];
  c.furniture.push(
    {id: 'q-kitchen-chair', kind: 'chair', room: 'kitchen', at: [4.75, 8.5], turn: 0},
    {id: 'q-dining-chair', kind: 'chair', room: 'dining', at: [9, 8.3], turn: 0},
  );
  c.obstacles = obstaclesOf(c);
  return c;
};
const stubChair = (kit, e, pal) => ({wood: kit.box(kit.placed(e), [-.2, .2], [-.2, .2], [0, .8], pal.oak(0))});
const buildQueued = (recipes = {...RECIPES, chair: stubChair}, interior = queuedBlueprint()) =>
  buildInterior(THREE, {interior, art: stubArt(), openings, recipes});

test('the first build draws only the rooms not queued; the queue is the blueprint\'s, in order', () => {
  const inside = buildQueued();
  assert.ok(inside.pieceBox('sofa'));
  assert.equal(inside.pieceBox('q-kitchen-chair'), null);
  assert.equal(inside.pieceBox('q-dining-chair'), null);
  assert.deepEqual(inside.pending, ['kitchen', 'dining']);
  assert.deepEqual([...inside.furnishedRooms].sort(), ['hall', 'living']);
  inside.dispose();
});

test('buildNext builds one room and returns its id; buildRest empties the queue', () => {
  const inside = buildQueued();
  assert.equal(inside.buildNext(), 'kitchen');
  assert.ok(inside.pieceBox('q-kitchen-chair'));
  assert.equal(inside.pieceBox('q-dining-chair'), null);
  assert.deepEqual(inside.pending, ['dining']);
  assert.deepEqual([...inside.furnishedRooms].sort(), ['hall', 'kitchen', 'living']);
  inside.buildRest();
  assert.ok(inside.pieceBox('q-dining-chair'));
  assert.deepEqual(inside.pending, []);
  assert.equal(inside.buildNext(), null);
  assert.deepEqual([...inside.furnishedRooms].sort(), ['dining', 'hall', 'kitchen', 'living']);
  inside.dispose();
});

test('a queued set has at most four meshes without lamps (five with lamps) and reports its own counts and time', () => {
  const inside = buildQueued();
  inside.buildRest();
  assert.equal(inside.furniture.sets.length, 3);
  assert.deepEqual(inside.furniture.sets[1].rooms, ['kitchen']);
  assert.deepEqual(inside.furniture.sets[2].rooms, ['dining']);
  for (const s of inside.furniture.sets.slice(1)) {
    const grp = inside.scene.getObjectByName(`furniture-${s.rooms[0]}`);
    const limit = grp?.getObjectByName('shades') ? 5 : 4;
    assert.ok(s.meshes >= 1 && s.meshes <= limit, `${s.rooms}: ${s.meshes} meshes (limit ${limit})`);
    assert.ok(s.vertices > 0 && Number.isFinite(s.ms) && s.ms >= 0, `${s.rooms}: ${s.vertices}v ${s.ms}ms`);
  }
  assert.equal(inside.furniture.vertices, inside.furniture.sets.reduce((t, s) => t + s.vertices, 0));
  assert.equal(inside.furniture.meshes, inside.furniture.sets.reduce((t, s) => t + s.meshes, 0));
  inside.dispose();
});

test('a queued room whose recipe throws leaves the rest built, warns once and names its pieces in skipped', () => {
  const [inside, warnings] = warned(() => {
    const res = buildQueued({...RECIPES, chair: (kit, e, pal) => {
      if (e.room === 'kitchen') throw new Error('broken kitchen chair');
      return stubChair(kit, e, pal);
    }});
    res.buildRest();
    return res;
  });
  assert.equal(warnings.length, 1);
  assert.ok(inside.skipped.includes('q-kitchen-chair'));
  assert.equal(inside.pieceBox('q-kitchen-chair'), null);
  assert.equal(inside.furnishedRooms.includes('kitchen'), false);
  assert.ok(inside.pieceBox('q-dining-chair'));
  assert.equal(inside.furnishedRooms.includes('dining'), true);
  inside.dispose();
  // And when a queued room's build itself throws (outside per-piece catching), one warning names the room,
  // every piece in that room is added to skipped, and the remaining room still builds.
  let throwKitchen = false;
  const badRecipes = new Proxy({...RECIPES, chair: stubChair}, {
    getOwnPropertyDescriptor(target, prop) {
      if (throwKitchen && prop === 'chair') throw new Error('kitchen exploded');
      return Object.getOwnPropertyDescriptor(target, prop);
    },
  });
  const [inside2, warnings2] = warned(() => {
    const res = buildQueued(badRecipes);
    throwKitchen = true;
    res.buildNext();
    throwKitchen = false;
    res.buildNext();
    return res;
  });
  assert.equal(warnings2.length, 1);
  assert.match(String(warnings2[0][0]), /kitchen/);
  assert.ok(inside2.skipped.includes('q-kitchen-chair'));
  assert.equal(inside2.furnishedRooms.includes('kitchen'), false);
  assert.ok(inside2.pieceBox('q-dining-chair'));
  assert.equal(inside2.furnishedRooms.includes('dining'), true);
  inside2.dispose();
});

test('given up for the flat light before a room is built, that room takes the flat materials when built', () => {
  const inside = buildQueued();
  inside.fallBack();
  inside.buildRest();
  const kitchenGroup = inside.scene.getObjectByName('furniture-kitchen');
  assert.ok(kitchenGroup, 'kitchen group added to scene');
  const wood = kitchenGroup.getObjectByName('furniture-wood');
  assert.ok(wood && wood.material.isMeshLambertMaterial);
  assert.equal(wood.material, inside.scene.getObjectByName('floors').material);
  inside.dispose();
});

test('disposed with rooms queued, buildNext builds nothing and does not throw', () => {
  const inside = buildQueued();
  assert.deepEqual(inside.pending, ['kitchen', 'dining']);
  inside.dispose();
  assert.deepEqual(inside.pending, []);
  assert.equal(inside.buildNext(), null);
  assert.equal(inside.pieceBox('q-kitchen-chair'), null);
});

test('the same queued room twice: two builds give identical positions', () => {
  const one = buildQueued(), two = buildQueued();
  one.buildRest(); two.buildRest();
  for (const roomName of ['furniture-kitchen', 'furniture-dining']) {
    const a = one.scene.getObjectByName(roomName), b = two.scene.getObjectByName(roomName);
    assert.ok(a && b, roomName);
    for (const m of a.children) {
      const n = b.getObjectByName(m.name);
      assert.ok(n, `${roomName} ${m.name}`);
      assert.deepEqual(m.geometry.getAttribute('position').array, n.geometry.getAttribute('position').array, `${roomName} ${m.name} pos`);
      assert.deepEqual(m.geometry.getAttribute('color').array, n.geometry.getAttribute('color').array, `${roomName} ${m.name} col`);
    }
  }
  one.dispose(); two.dispose();
});

test('a blueprint built bare has nothing pending', () => {
  const inside = build(bareInterior(I));
  assert.deepEqual(inside.pending, []);
  assert.equal(inside.buildNext(), null);
  inside.dispose();
});

// ── out of sight, not drawn (Task 6) ──
const queuedAllBlueprint = () => {
  const c = structuredClone(withoutRooms(I, allQueued()));
  c.furnishLater = ['kitchen', 'dining', 'study', 'passage', 'master'];
  c.furniture.push(
    {id: 'q-kitchen-chair', kind: 'chair', room: 'kitchen', at: [4.75, 8.5], turn: 0},
    {id: 'q-dining-chair', kind: 'chair', room: 'dining', at: [9, 8.3], turn: 0},
    {id: 'q-study-chair', kind: 'chair', room: 'study', at: [14.5, 2.0], turn: 0},
    {id: 'q-passage-chair', kind: 'chair', room: 'passage', at: [12.5, 5.4], turn: 0},
    {id: 'q-master-chair', kind: 'chair', room: 'master', at: [14.5, 9.5], turn: 0},
  );
  c.obstacles = obstaclesOf(c);
  return c;
};
const buildQueuedAll = (opts = {}) => buildInterior(THREE, {interior: queuedAllBlueprint(), art: stubArt(), openings, recipes: {...RECIPES, chair: stubChair}, ...opts});

test('showFrom hides queued rooms out of sight without changing counts, furnishedRooms or skipped', () => {
  const inside = buildQueuedAll();
  inside.buildRest();
  const countsBefore = structuredClone(inside.furniture), roomsBefore = [...inside.furnishedRooms], skippedBefore = [...inside.skipped];
  inside.showFrom('kitchen');
  assert.equal(inside.shownRooms.includes('master'), false, 'master hidden from kitchen');
  for (const r of ['living', 'hall', 'kitchen', 'dining', 'study']) assert.ok(inside.shownRooms.includes(r), `${r} shown from kitchen`);
  assert.equal(furniture(inside.scene).visible, true, 'first set stays visible');
  assert.equal(inside.scene.getObjectByName('furniture-master').visible, false);
  assert.deepEqual(inside.furniture, countsBefore);
  assert.deepEqual(inside.furnishedRooms, roomsBefore);
  assert.deepEqual(inside.skipped, skippedBefore);
  inside.showFrom('passage');
  assert.ok(inside.shownRooms.includes('master'), 'master shown from passage');
  assert.equal(inside.scene.getObjectByName('furniture-master').visible, true);
  inside.showFrom(null);
  assert.deepEqual(inside.shownRooms, inside.furnishedRooms, 'null shows every built room');
  assert.equal(furniture(inside.scene).visible, true);
  inside.dispose();
});

test('a room built after showFrom takes the current answer', () => {
  const inside = buildQueuedAll();
  inside.showFrom('kitchen');
  inside.buildRest();
  assert.equal(inside.shownRooms.includes('master'), false, 'master takes kitchen answer at once');
  assert.equal(inside.scene.getObjectByName('furniture-master').visible, false);
  assert.ok(inside.shownRooms.includes('kitchen') && inside.shownRooms.includes('study'));
  inside.dispose();
});

test('no table or malformed table: nothing hidden and one warning is logged', () => {
  const [inside, warnings] = warned(() => buildQueuedAll({sight: () => { throw new Error('sight broken'); }}));
  inside.buildRest();
  assert.equal(warnings.length, 1);
  inside.showFrom('kitchen');
  assert.deepEqual(inside.shownRooms, inside.furnishedRooms);
  // Without the table the doorway boxes hide nothing either, as the warning says.
  inside.showFrom('kitchen', planesFrom({at: [...I.spots.dresser, 1.6], facing: [7, 11.5]}));
  assert.deepEqual(inside.shownRooms, inside.furnishedRooms);
  inside.dispose();

  const [inside2, warnings2] = warned(() => buildQueuedAll({sight: () => ({kitchen: 'not-an-array'})}));
  inside2.buildRest();
  assert.equal(warnings2.length, 1);
  inside2.showFrom('kitchen');
  assert.deepEqual(inside2.shownRooms, inside2.furnishedRooms);
  inside2.dispose();
});

function planesFrom({at, facing, fovH = 100 * Math.PI / 180, aspect = 1440 / 810, pitch = 0}) {
  const [ea, ed, ez] = at;
  const ha = facing[0] - ea, hd = facing[1] - ed, len = Math.hypot(ha, hd);
  const fha = ha / len, fhd = hd / len;
  const right = [fhd, -fha, 0];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fwd = [fha * cp, fhd * cp, sp];
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  const hx = fovH / 2, hy = Math.atan(Math.tan(hx) / aspect);
  const plane = n => {
    const l = Math.hypot(...n);
    const u = n.map(v => v / l);
    return [u[0], u[1], u[2], -(u[0] * ea + u[1] * ed + u[2] * ez)];
  };
  const combine = (a, ca, b, cb) => [a[0] * ca + b[0] * cb, a[1] * ca + b[1] * cb, a[2] * ca + b[2] * cb];
  return [
    plane(combine(fwd, Math.sin(hx), right, Math.cos(hx))),
    plane(combine(fwd, Math.sin(hx), right, -Math.cos(hx))),
    plane(combine(fwd, Math.sin(hy), up, Math.cos(hy))),
    plane(combine(fwd, Math.sin(hy), up, -Math.cos(hy))),
  ];
}

test('a seen room whose door is out of view is hidden, and shown again when its door enters view', () => {
  const inside = buildQueuedAll();
  inside.buildRest();
  const countsBefore = structuredClone(inside.furniture), roomsBefore = [...inside.furnishedRooms], skippedBefore = [...inside.skipped];
  const eye = [...I.spots.dresser, 1.6];
  inside.showFrom('kitchen', planesFrom({at: eye, facing: [7, 11.5]}));
  assert.ok(inside.shownRooms.includes('kitchen') && inside.shownRooms.includes('dining'));
  assert.equal(inside.shownRooms.includes('study'), false, 'study hidden when facing north-east into dining');
  assert.deepEqual(inside.furniture, countsBefore);
  assert.deepEqual(inside.furnishedRooms, roomsBefore);
  assert.deepEqual(inside.skipped, skippedBefore);
  inside.showFrom('kitchen', planesFrom({at: eye, facing: [11, .8]}));
  assert.ok(inside.shownRooms.includes('study'), 'study shown when facing the hall-study door');
  // no planes: table alone
  inside.showFrom('kitchen');
  assert.ok(inside.shownRooms.includes('study') && !inside.shownRooms.includes('master'));
  // null room shows everything whatever the planes
  inside.showFrom(null, planesFrom({at: eye, facing: [7, 11.5]}));
  assert.deepEqual(inside.shownRooms, inside.furnishedRooms);
  inside.dispose();
});

test("the visitor's own room is always shown, even facing away from its door", () => {
  const inside = buildQueuedAll();
  inside.buildRest();
  inside.showFrom('master', planesFrom({at: [14.5, 10.0, 1.6], facing: [18, 11.5]}));
  assert.ok(inside.shownRooms.includes('master'));
  inside.dispose();
});

test('a room built after showFrom with planes takes the current answer at once', () => {
  const inside = buildQueuedAll();
  inside.showFrom('kitchen', planesFrom({at: [...I.spots.dresser, 1.6], facing: [7, 11.5]}));
  inside.buildRest();
  assert.equal(inside.shownRooms.includes('study'), false);
  assert.ok(inside.shownRooms.includes('kitchen') && inside.shownRooms.includes('dining'));
  inside.dispose();
});

test('no door boxes, nothing more hidden beyond the sight table', () => {
  const [inside, warnings] = warned(() => buildQueuedAll({doors: () => { throw new Error('doors broken'); }}));
  inside.buildRest();
  assert.equal(warnings.length, 1);
  const planes = planesFrom({at: [...I.spots.dresser, 1.6], facing: [7, 11.5]});
  inside.showFrom('kitchen');
  const tableOnly = [...inside.shownRooms];
  inside.showFrom('kitchen', planes);
  assert.deepEqual(inside.shownRooms, tableOnly);
  inside.dispose();
});

// ── kitchen furniture (Task 3) ──
test('the real blueprint skips nothing once every room is built', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  inside.dispose();
});

test('every solid kitchen piece is drawn inside its footprint and stands on the floor; the flue alone rises above the range\'s height, to the ceiling', () => {
  const inside = build();
  inside.buildRest();
  const kitchenSolids = I.furniture.filter(e => e.room === 'kitchen' && KINDS[e.kind].standing === 'solid');
  assert.ok(kitchenSolids.length >= 7, `expected kitchen solids, got ${kitchenSolids.length}`);
  for (const e of kitchenSolids) {
    const box = inside.pieceBox(e.id), f = footprint(e), floor = room(e.room).floor * I.floorRise;
    assert.ok(box, `${e.id} is drawn`);
    for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .02 && box[k][1] <= f[k][1] + .02, `${e.id} ${k} ${box[k]} within ${f[k]}`);
    assert.ok(Math.abs(box.z[0] - floor) <= .02, `${e.id} stands on its floor: ${box.z[0]}`);
    if (e.kind === 'range') {
      assert.ok(Math.abs(box.z[1] - I.groundCeiling) <= .02, `range flue reaches ceiling: ${box.z[1]}`);
      // only the flue (narrow cylinder at the back of the range) rises above range's height
      const high = MESHES.flatMap(m => vertices(inside.scene, e.id, m)).filter(v => v.z > KINDS.range.height + .02);
      assert.ok(high.length > 10, 'flue has vertices above range height');
      const aSpan = Math.max(...high.map(v => v.a)) - Math.min(...high.map(v => v.a));
      assert.ok(aSpan <= .2, `flue is narrow: ${aSpan}`);
    } else {
      assert.ok(box.z[1] <= floor + KINDS[e.kind].height + .02, `${e.id} no taller than its kind: ${box.z[1]}`);
    }
  }
  inside.dispose();
});

test('the kitchen is one queued set of at most four meshes', () => {
  const inside = build();
  inside.buildRest();
  const set = inside.furniture.sets.find(s => s.rooms.includes('kitchen'));
  assert.ok(set, 'kitchen set exists');
  assert.deepEqual(set.rooms, ['kitchen']);
  assert.ok(set.meshes >= 1 && set.meshes <= 4, `${set.meshes} meshes`);
  assert.ok(set.vertices > 0 && Number.isFinite(set.ms));
  inside.dispose();
});

test('the pans hang below the rail and in front of the wall\'s face, none in the worktop or the range', () => {
  const inside = build();
  inside.buildRest();
  const rail = I.furniture.find(e => e.id === 'pan-rail');
  const pans = I.furniture.filter(e => e.on === 'pan-rail' && e.kind === 'pan');
  assert.equal(pans.length, 5);
  const wallFace = rail.line - I.wall / 2;
  for (const p of pans) {
    const box = inside.pieceBox(p.id);
    assert.ok(box, `${p.id} drawn`);
    assert.ok(box.z[1] <= rail.z + .02, `${p.id} top ${box.z[1]} below rail ${rail.z}`);
    assert.ok(box.z[0] > KINDS.range.height + .05, `${p.id} bottom ${box.z[0]} clear of worktop/range`);
    assert.ok(box.d[1] <= wallFace + .005, `${p.id} in front of wall face: ${box.d[1]} vs ${wallFace}`);
  }
  inside.dispose();
});

test('the plates stand within the dresser\'s box, above its cupboard', () => {
  const inside = build();
  inside.buildRest();
  const dresserBox = inside.pieceBox('dresser');
  const plates = I.furniture.filter(e => e.on === 'dresser' && e.kind === 'plates');
  assert.equal(plates.length, 3);
  for (const p of plates) {
    const box = inside.pieceBox(p.id);
    assert.ok(box, `${p.id} drawn`);
    assert.ok(box.a[0] >= dresserBox.a[0] - .01 && box.a[1] <= dresserBox.a[1] + .01, `${p.id} a in dresser`);
    assert.ok(box.d[0] >= dresserBox.d[0] - .01 && box.d[1] <= dresserBox.d[1] + .01, `${p.id} d in dresser`);
    assert.ok(box.z[0] >= .85 && box.z[1] <= dresserBox.z[1] + .01, `${p.id} z ${box.z} above cupboard`);
  }
  inside.dispose();
});

test('the insides of the dresser\'s shelves are darker than its sides', () => {
  const inside = build();
  inside.buildRest();
  const vs = vertices(inside.scene, 'dresser', 'furniture-wood'), box = inside.pieceBox('dresser');
  const brightness = v => mean(v.colour), sideways = vs.filter(v => v.z > .86 && Math.abs(v.n[1]) > .9);
  const outer = sideways.filter(v => v.d < box.d[0] + .015 || v.d > box.d[1] - .015);
  const inner = sideways.filter(v => v.d > box.d[0] + .02 && v.d < box.d[1] - .02);
  assert.ok(outer.length >= 8 && inner.length >= 8, `${outer.length} ${inner.length}`);
  assert.ok(mean(inner.map(brightness)) <= TUCK * 1.1 * mean(outer.map(brightness)), `${mean(inner.map(brightness))} against ${mean(outer.map(brightness))}`);
  inside.dispose();
});

test('nothing in the kitchen hangs lower than 2 m over a standable point', () => {
  const inside = build();
  inside.buildRest();
  const hanging = I.furniture.filter(e => e.room === 'kitchen' && (e.kind === 'pan-rail' || e.kind === 'pan' || e.kind === 'range'));
  for (const e of hanging) {
    for (const v of MESHES.flatMap(m => vertices(inside.scene, e.id, m))) {
      if (v.z < 2) assert.equal(floorArea(I, 0, [v.a, v.d]), false, `${e.id} vertex (${v.a.toFixed(2)}, ${v.d.toFixed(2)}, ${v.z.toFixed(2)}) over standable floor`);
    }
  }
  inside.dispose();
});

test('every surface named in SURFACES maps to a mesh that exists and a colour in the palette', () => {
  for (const name of ['wood', 'cloth', 'stone', 'iron', 'copper', 'china', 'enamel']) {
    const s = SURFACES[name];
    assert.ok(s, name);
    assert.ok(['wood', 'cloth', 'stone'].includes(s.mesh), `${name} mesh ${s.mesh}`);
    assert.ok(Object.hasOwn(COLOURS, s.colour), `${name} colour ${s.colour}`);
  }
});

test('every kitchen solid has a grounding patch', () => {
  const inside = build();
  inside.buildRest();
  const kitchenSolids = I.furniture.filter(e => e.room === 'kitchen' && KINDS[e.kind].standing === 'solid');
  assert.ok(kitchenSolids.length >= 7);
  for (const e of kitchenSolids) {
    const p = patch(inside.scene, e.id);
    assert.ok(p.length > 0, `${e.id} has a grounding patch`);
    assert.ok(p.some(v => Math.abs(v.alpha - GROUND.dark) < 1e-6) && p.some(v => v.alpha === 0), e.id);
  }
  inside.dispose();
});

// ── dining room furniture (Task 4) ──
test('every solid dining piece is drawn inside its footprint and stands on the floor', () => {
  const inside = build();
  inside.buildRest();
  const diningSolids = I.furniture.filter(e => e.room === 'dining' && KINDS[e.kind].standing === 'solid');
  assert.equal(diningSolids.length, 8, 'dining table, six chairs, sideboard');
  for (const e of diningSolids) {
    const box = inside.pieceBox(e.id), f = footprint(e), floor = room(e.room).floor * I.floorRise;
    assert.ok(box, `${e.id} is drawn`);
    for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .02 && box[k][1] <= f[k][1] + .02, `${e.id} ${k} ${box[k]} within ${f[k]}`);
    assert.ok(Math.abs(box.z[0] - floor) <= .02, `${e.id} stands on its floor: ${box.z[0]}`);
    assert.ok(box.z[1] <= floor + KINDS[e.kind].height + .02, `${e.id} no taller than its kind: ${box.z[1]}`);
    const p = patch(inside.scene, e.id);
    assert.ok(p.length > 0, `${e.id} has a grounding patch`);
  }
  inside.dispose();
});

test('the dining room is one queued set of at most four meshes', () => {
  const inside = build();
  inside.buildRest();
  const set = inside.furniture.sets.find(s => s.rooms.includes('dining'));
  assert.ok(set, 'dining set exists');
  assert.deepEqual(set.rooms, ['dining']);
  assert.ok(set.meshes >= 1 && set.meshes <= 4, `${set.meshes} meshes`);
  assert.ok(set.vertices > 0 && Number.isFinite(set.ms));
  inside.dispose();
});

test('the six dining chairs face the table: each chair\'s back is on its side away from the table\'s middle', () => {
  const inside = build();
  inside.buildRest();
  const table = I.furniture.find(e => e.id === 'dining-table');
  const chairs = I.furniture.filter(e => e.room === 'dining' && e.kind === 'chair');
  assert.equal(chairs.length, 6);
  for (const ch of chairs) {
    // Vertices above seat height belong to the chair's back.
    const back = MESHES.flatMap(m => vertices(inside.scene, ch.id, m)).filter(v => v.z > KINDS.chair.seat + .1);
    assert.ok(back.length > 10, `${ch.id} has back vertices`);
    const ba = mean(back.map(v => v.a)), bd = mean(back.map(v => v.d));
    const distBack = Math.hypot(ba - table.at[0], bd - table.at[1]);
    const distCentre = Math.hypot(ch.at[0] - table.at[0], ch.at[1] - table.at[1]);
    assert.ok(distBack > distCentre + .1, `${ch.id} back (${ba.toFixed(2)}, ${bd.toFixed(2)}) farther from table than centre`);
  }
  inside.dispose();
});

test('the chairs are not all alike: two are turned off square', () => {
  const chairs = I.furniture.filter(e => e.room === 'dining' && e.kind === 'chair');
  const offSquare = chairs.filter(ch => {
    const r = Math.abs((ch.turn || 0) % (Math.PI / 2));
    return Math.min(r, Math.PI / 2 - r) > .01;
  });
  assert.ok(offSquare.length >= 2, `only ${offSquare.length} chairs off square`);
});

test('the table\'s things stand on its top, and the lamp above it hangs clear of them', () => {
  const inside = build();
  inside.buildRest();
  const top = KINDS['dining-table'].height;
  const lampZ = I.fittings.find(f => f.room === 'dining').at[2];
  const onTable = I.furniture.filter(e => e.on === 'dining-table');
  assert.equal(onTable.length, 3, 'two candlesticks and a bowl');
  for (const e of onTable) {
    const box = inside.pieceBox(e.id);
    assert.ok(box, `${e.id} drawn`);
    assert.ok(Math.abs(box.z[0] - top) <= .01, `${e.id} stands on table top: ${box.z[0]} vs ${top}`);
    assert.ok(box.z[1] < lampZ - .3, `${e.id} top ${box.z[1]} clear below lamp ${lampZ}`);
  }
  inside.dispose();
});

test('the sideboard and its things stay left of the window\'s span', () => {
  const inside = build();
  inside.buildRest();
  const win = I.windows.find(w => w.id === 'dining'), winLeft = win.a - win.width / 2;
  for (const e of [I.furniture.find(x => x.id === 'sideboard'), ...I.furniture.filter(x => x.on === 'sideboard')]) {
    const box = inside.pieceBox(e.id);
    assert.ok(box, `${e.id} drawn`);
    assert.ok(box.a[1] < winLeft, `${e.id} reaches ${box.a[1]}, window starts at ${winLeft}`);
  }
  inside.dispose();
});

test('the jug on the sideboard is its full width; the one on the mantel is still narrowed', () => {
  const inside = build();
  inside.buildRest();
  const mantelJug = inside.pieceBox('jug'), sideJug = inside.pieceBox('jug-sideboard');
  assert.ok(mantelJug && sideJug);
  const mantelDepth = mantelJug.a[1] - mantelJug.a[0];
  const sideWidth = sideJug.a[1] - sideJug.a[0], sideDepth = sideJug.d[1] - sideJug.d[0];
  assert.ok(mantelDepth < .125, `mantel jug narrowed: ${mantelDepth}`);
  assert.ok(Math.min(sideWidth, sideDepth) >= .135, `sideboard jug full width: ${sideWidth} x ${sideDepth}`);
  inside.dispose();
});

// ── study furniture (Task 4) ──
test('the study builds as one queued set of at most five meshes with shades, skips nothing, and the desk tops out at its kind\'s height', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  const set = inside.furniture.sets.find(s => s.rooms.includes('study'));
  assert.ok(set, 'study set exists');
  assert.deepEqual(set.rooms, ['study']);
  assert.ok(set.meshes >= 1 && set.meshes <= 5, `${set.meshes} meshes`);
  assert.ok(inside.scene.getObjectByName('furniture-study')?.getObjectByName('shades'), 'study has a shades mesh');
  const deskBox = inside.pieceBox('desk');
  assert.ok(deskBox, 'desk is drawn');
  assert.ok(Math.abs(deskBox.z[1] - KINDS.desk.height) <= .01, `desk top ${deskBox.z[1]} vs ${KINDS.desk.height}`);
  // Every solid study piece stands inside its footprint and has a grounding patch.
  const studySolids = I.furniture.filter(e => e.room === 'study' && KINDS[e.kind].standing === 'solid');
  assert.ok(studySolids.length >= 6);
  for (const e of studySolids) {
    const box = inside.pieceBox(e.id), f = footprint(e);
    assert.ok(box, `${e.id} drawn`);
    for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .02 && box[k][1] <= f[k][1] + .02, `${e.id} ${k} ${box[k]} within ${f[k]}`);
    assert.ok(Math.abs(box.z[0]) <= .02, `${e.id} stands on floor`);
    assert.ok(box.z[1] <= KINDS[e.kind].height + .02, `${e.id} height ${box.z[1]}`);
    assert.ok(patch(inside.scene, e.id).length > 0, `${e.id} has a grounding patch`);
  }
  // Desk lamp shade follows the study's lamp, not the living room's.
  const lit = groupShadeColour(inside, 'furniture-study', dialsFor({study: 1, living: 0}));
  assert.deepEqual(lit.map(v => +v.toFixed(6)), SHADE_WARM.map(v => +v.toFixed(6)));
  const out = groupShadeColour(inside, 'furniture-study', dialsFor({study: 0, living: 1}));
  assert.ok(out[0] / out[2] < 1.4);
  inside.dispose();
});

// ── passage and master bedroom furniture (Task 5) ──
test('the passage and master bedroom build without skipping, stay within their mesh limits, place pillows on the mattress, and follow the master lamp', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  const pSet = inside.furniture.sets.find(s => s.rooms.includes('passage'));
  const mSet = inside.furniture.sets.find(s => s.rooms.includes('master'));
  assert.ok(pSet && mSet, 'passage and master sets exist');
  assert.ok(pSet.meshes >= 1 && pSet.meshes <= 4, `passage meshes: ${pSet.meshes}`);
  assert.equal(inside.scene.getObjectByName('furniture-passage')?.getObjectByName('shades'), undefined, 'passage has no shades');
  assert.ok(mSet.meshes >= 1 && mSet.meshes <= 5, `master meshes: ${mSet.meshes}`);
  assert.ok(inside.scene.getObjectByName('furniture-master')?.getObjectByName('shades'), 'master has a shades mesh');
  const pillow1 = inside.pieceBox('pillow-1');
  assert.ok(pillow1, 'pillow-1 drawn');
  assert.ok(pillow1.z[0] >= KINDS['double-bed'].seat - .005 && pillow1.z[0] <= KINDS['double-bed'].seat + .02,
    `pillow-1 bottom ${pillow1.z[0]} vs mattress ${KINDS['double-bed'].seat}`);
  // Every solid piece in passage and master stands inside its footprint and has a grounding patch.
  const solids = I.furniture.filter(e => (e.room === 'passage' || e.room === 'master') && KINDS[e.kind].standing === 'solid');
  assert.ok(solids.length >= 8);
  for (const e of solids) {
    const box = inside.pieceBox(e.id), f = footprint(e);
    assert.ok(box, `${e.id} drawn`);
    for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .02 && box[k][1] <= f[k][1] + .02, `${e.id} ${k} ${box[k]} within ${f[k]}`);
    assert.ok(Math.abs(box.z[0]) <= .02, `${e.id} stands on floor`);
    assert.ok(box.z[1] <= KINDS[e.kind].height + .02, `${e.id} height ${box.z[1]}`);
    assert.ok(patch(inside.scene, e.id).length > 0, `${e.id} has a grounding patch`);
  }
  // Master bedroom shades follow lamps[master], not lamps[living].
  const lit = groupShadeColour(inside, 'furniture-master', dialsFor({master: 1, living: 0}));
  assert.deepEqual(lit.map(v => +v.toFixed(6)), SHADE_WARM.map(v => +v.toFixed(6)));
  const out = groupShadeColour(inside, 'furniture-master', dialsFor({master: 0, living: 1}));
  assert.ok(out[0] / out[2] < 1.4);
  inside.dispose();
});

// ── ground-floor bathroom furniture (Task 4) ──
test('the ground-floor bathroom builds as one queued set of at most four meshes with no shades, carries light weights and grounding, and places towels on rail and tub', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  const set = inside.furniture.sets.find(s => s.rooms.includes('bath-ground'));
  assert.ok(set, 'bath-ground set exists');
  assert.deepEqual(set.rooms, ['bath-ground']);
  assert.ok(set.meshes >= 1 && set.meshes <= 4, `bath-ground meshes: ${set.meshes}`);
  const grp = inside.scene.getObjectByName('furniture-bath-ground');
  assert.ok(grp, 'furniture-bath-ground group exists');
  assert.equal(grp.getObjectByName('shades'), undefined, 'bath-ground has no shades');
  const allowed = new Set(['furniture-wood', 'furniture-cloth', 'furniture-stone', 'grounding']);
  for (const child of grp.children) {
    assert.ok(allowed.has(child.name), `allowed mesh name ${child.name}`);
    if (child.name !== 'grounding') {
      const l = child.geometry.getAttribute('light');
      assert.ok(l, `${child.name} has light attribute`);
      for (let i = 0; i < l.count; i++) assert.ok(l.getX(i) + l.getY(i) + l.getZ(i) > 0, `${child.name} vertex ${i}`);
    }
  }
  const bathRoom = I.rooms.find(r => r.id === 'bath-ground');
  const solids = I.furniture.filter(e => e.room === 'bath-ground' && KINDS[e.kind].standing === 'solid');
  assert.equal(solids.length, 4);
  for (const e of solids) {
    const box = inside.pieceBox(e.id), f = footprint(e);
    assert.ok(box, `${e.id} drawn`);
    for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .02 && box[k][1] <= f[k][1] + .02, `${e.id} ${k} ${box[k]} within ${f[k]}`);
    assert.ok(Math.abs(box.z[0]) <= .02, `${e.id} stands on floor`);
    assert.ok(box.z[1] <= KINDS[e.kind].height + .02, `${e.id} height ${box.z[1]}`);
    assert.ok(patch(inside.scene, e.id).length > 0, `${e.id} has a grounding patch`);
  }
  // Every bath-ground piece stays within the room's a and d bounds.
  for (const e of I.furniture.filter(x => x.room === 'bath-ground')) {
    const box = inside.pieceBox(e.id);
    assert.ok(box, `${e.id} drawn`);
    assert.ok(box.a[0] >= bathRoom.a[0] && box.a[1] <= bathRoom.a[1], `${e.id} a ${box.a}`);
    assert.ok(box.d[0] >= bathRoom.d[0] && box.d[1] <= bathRoom.d[1], `${e.id} d ${box.d}`);
  }
  const railTowel = inside.pieceBox('towel-rail-1');
  assert.ok(railTowel.z[0] < 1.0 && railTowel.z[1] <= 1.24, `towel on rail hangs below 1.2: ${railTowel.z}`);
  const tubTowel = inside.pieceBox('towel-tub');
  assert.ok(tubTowel.z[1] >= KINDS.bathtub.height - .01 && tubTowel.z[1] <= KINDS.bathtub.height + .04, `towel on tub rests at rim: ${tubTowel.z}`);
  inside.dispose();

  // A bathtub recipe that throws skips bathtub and towel-tub together and builds the rest.
  const [broken, brokenWarnings] = warned(() => {
    const res = buildInterior(THREE, {interior: I, art: stubArt(), openings, recipes: {...RECIPES, bathtub: () => { throw new Error('tub cracked'); }}});
    res.buildRest();
    return res;
  });
  assert.equal(brokenWarnings.length, 2);
  assert.ok(broken.skipped.includes('bathtub') && broken.skipped.includes('towel-tub'));
  assert.ok(broken.skipped.includes('bath-upper-tub') && broken.skipped.includes('bath-upper-tub-towel'));
  assert.equal(broken.pieceBox('bathtub'), null);
  assert.equal(broken.pieceBox('towel-tub'), null);
  assert.ok(broken.pieceBox('basin') && broken.pieceBox('toilet') && broken.pieceBox('shower'));
  broken.dispose();
});

// ── laundry and pantry furniture (Task 5) ──
test('the laundry and pantry build as queued sets (nine sets in all), stay within their room bounds and limits, hang cloths at different heights, and draw deterministic jars on four or more shelves', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  assert.equal(inside.furniture.sets.length, 17, 'seventeen furniture sets across all eighteen furnished rooms');
  const allowed = new Set(['furniture-wood', 'furniture-cloth', 'furniture-stone', 'grounding']);
  for (const roomId of ['laundry', 'pantry']) {
    const set = inside.furniture.sets.find(s => s.rooms.includes(roomId));
    assert.ok(set, `${roomId} set exists`);
    assert.deepEqual(set.rooms, [roomId]);
    assert.ok(set.meshes >= 1 && set.meshes <= 4, `${roomId} meshes: ${set.meshes}`);
    const grp = inside.scene.getObjectByName(`furniture-${roomId}`);
    assert.ok(grp, `furniture-${roomId} group exists`);
    assert.equal(grp.getObjectByName('shades'), undefined, `${roomId} has no shades`);
    const room = I.rooms.find(r => r.id === roomId);
    for (const child of grp.children) {
      assert.ok(allowed.has(child.name), `${roomId} allowed mesh ${child.name}`);
      const p = child.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const a = p.getX(i), d = -p.getZ(i);
        assert.ok(a >= room.a[0] - 1e-6 && a <= room.a[1] + 1e-6, `${roomId} ${child.name} a=${a} in ${room.a}`);
        assert.ok(d >= room.d[0] - 1e-6 && d <= room.d[1] + 1e-6, `${roomId} ${child.name} d=${d} in ${room.d}`);
      }
      if (child.name !== 'grounding') {
        const l = child.geometry.getAttribute('light');
        assert.ok(l, `${roomId} ${child.name} has light attribute`);
        for (let i = 0; i < l.count; i++) assert.ok(l.getX(i) + l.getY(i) + l.getZ(i) > 0, `${roomId} ${child.name} v${i}`);
      }
    }
    const solids = I.furniture.filter(e => e.room === roomId && KINDS[e.kind].standing === 'solid');
    assert.equal(solids.length, 4);
    for (const e of solids) {
      const box = inside.pieceBox(e.id), f = footprint(e);
      assert.ok(box, `${e.id} drawn`);
      for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .02 && box[k][1] <= f[k][1] + .02, `${e.id} ${k} ${box[k]} within ${f[k]}`);
      assert.ok(Math.abs(box.z[0]) <= .02, `${e.id} stands on floor`);
      assert.ok(box.z[1] <= KINDS[e.kind].height + .02, `${e.id} height ${box.z[1]}`);
      assert.ok(patch(inside.scene, e.id).length > 0, `${e.id} has a grounding patch`);
    }
  }
  // Cloths on the drying rack hang at different heights along its rails.
  const clothTops = ['cloth-rack-1', 'cloth-rack-2', 'cloth-rack-3'].map(id => +inside.pieceBox(id).z[1].toFixed(2));
  assert.equal(new Set(clothTops).size, 3, `cloths at distinct heights: ${clothTops}`);
  // Pantry shelf draws jars on at least four distinct shelves.
  const shelfJars = vertices(inside.scene, 'pantry-shelf-1', 'furniture-stone');
  assert.ok(shelfJars.length > 100, 'pantry-shelf-1 has jars');
  const bands = new Set(shelfJars.map(v => Math.floor(v.z / .35)));
  assert.ok(bands.size >= 4, `jars across at least 4 shelves: ${[...bands]}`);
  const firstCount = inside.furniture.sets.find(s => s.rooms.includes('pantry')).vertices;
  inside.dispose();

  // Deterministic vertex count over two builds.
  const second = build(); second.buildRest();
  assert.equal(second.furniture.sets.find(s => s.rooms.includes('pantry')).vertices, firstCount);
  second.dispose();
});

// ── two-stage build queue and cross-floor showFrom (Part 4e, Task 2) ──
test('two-stage queue: buildRest(0) leaves furnishUpper pending, buildNext drains floor 0 then floor 1, buildRest(1) flushes floor 1, and cross-floor showFrom uses the stairwell gate', () => {
  const c = structuredClone(withoutRooms(I, allQueued()));
  c.furnishLater = ['kitchen'];
  c.furnishUpper = ['landing', 'nook'];
  c.furniture.push(
    {id: 't-kt', kind: 'kitchen-table', room: 'kitchen', at: [4.75, 9.5], turn: 0},
    {id: 't-ls', kind: 'window-seat', room: 'landing', at: [9.8, .315], turn: Math.PI},
    {id: 't-nc', kind: 'armchair', room: 'nook', at: [8.45, 10.7], turn: .45},
  );
  c.obstacles = obstaclesOf(c);

  const inside = build(c);
  assert.deepEqual(inside.pending, ['kitchen', 'landing', 'nook']);
  assert.deepEqual(inside.pendingFor(0), ['kitchen']);
  assert.deepEqual(inside.pendingFor(1), ['landing', 'nook']);

  inside.buildRest(0);
  assert.deepEqual(inside.pendingFor(0), []);
  assert.deepEqual(inside.pendingFor(1), ['landing', 'nook']);
  assert.deepEqual(inside.pending, ['landing', 'nook']);
  assert.ok(inside.furnishedRooms.includes('kitchen') && !inside.furnishedRooms.includes('landing'));

  assert.equal(inside.buildNext(), 'landing');
  assert.deepEqual(inside.pendingFor(1), ['nook']);
  inside.buildRest(1);
  assert.deepEqual(inside.pending, []);
  assert.ok(inside.furnishedRooms.includes('landing') && inside.furnishedRooms.includes('nook'));

  // Cross-floor showFrom: facing the dining window from kitchen hides both upper rooms.
  inside.showFrom('kitchen', planesFrom({at: [...I.spots.speed[2], 1.6], facing: [10, 12]}));
  assert.equal(inside.shownRooms.includes('landing'), false);
  assert.equal(inside.shownRooms.includes('nook'), false);
  // Looking up the stairwell from hall shows landing.
  inside.showFrom('hall', planesFrom({at: [9, .8, 1.6], facing: [10.3, 4.0], pitch: .35}));
  assert.equal(inside.shownRooms.includes('landing'), true);
  // Facing away toward the front door from hall hides landing.
  inside.showFrom('hall', planesFrom({at: [9, .8, 1.6], facing: [9, 0], pitch: 0}));
  assert.equal(inside.shownRooms.includes('landing'), false);
  inside.dispose();

  // buildRest(1) can flush floor 1 without flushing floor 0 first (e.g. starting indoors on floor 1).
  const upperStart = build(c);
  upperStart.buildRest(1);
  assert.deepEqual(upperStart.pendingFor(1), []);
  assert.deepEqual(upperStart.pendingFor(0), ['kitchen']);
  assert.ok(upperStart.furnishedRooms.includes('landing') && upperStart.furnishedRooms.includes('nook'));
  assert.equal(upperStart.furnishedRooms.includes('kitchen'), false);
  upperStart.buildRest();
  assert.deepEqual(upperStart.pending, []);
  upperStart.dispose();
});

// ── landing and sky room furniture (Part 4e, Task 4) ──
test('landing and sky-room build as floor-1 queued sets of at most 4 meshes without shades, lifted to floor 1 with grounding and light weights', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  const allowed = new Set(['furniture-wood', 'furniture-cloth', 'furniture-stone', 'grounding']);
  for (const roomId of ['landing', 'sky-room']) {
    const set = inside.furniture.sets.find(s => s.rooms.includes(roomId));
    assert.ok(set, `${roomId} set exists`);
    assert.ok(set.meshes >= 1 && set.meshes <= 4, `${roomId} meshes: ${set.meshes}`);
    const grp = inside.scene.getObjectByName(`furniture-${roomId}`);
    assert.ok(grp, `furniture-${roomId} exists`);
    assert.equal(grp.getObjectByName('shades'), undefined, `${roomId} has no shades`);
    for (const child of grp.children) {
      assert.ok(allowed.has(child.name), `${roomId} allowed mesh ${child.name}`);
      const p = child.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) assert.ok(p.getY(i) >= I.floorRise - .01, `${roomId} ${child.name} z=${p.getY(i)}`);
      if (child.name !== 'grounding') {
        const l = child.geometry.getAttribute('light');
        assert.ok(l, `${roomId} ${child.name} has light attribute`);
        for (let i = 0; i < l.count; i++) assert.ok(l.getX(i) + l.getY(i) + l.getZ(i) > 0, `${roomId} ${child.name} v${i}`);
      }
    }
    const solids = I.furniture.filter(e => e.room === roomId && KINDS[e.kind].standing === 'solid');
    for (const e of solids) {
      const box = inside.pieceBox(e.id), f = footprint(e);
      assert.ok(box, `${e.id} drawn`);
      for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .03 && box[k][1] <= f[k][1] + .03, `${e.id} ${k} ${box[k]} within ${f[k]}`);
      assert.ok(Math.abs(box.z[0] - I.floorRise) <= .02, `${e.id} stands on floor 1: ${box.z[0]}`);
      assert.ok(box.z[1] <= I.floorRise + KINDS[e.kind].height + .02, `${e.id} height ${box.z[1] - I.floorRise}`);
      assert.ok(patch(inside.scene, e.id).length > 0, `${e.id} has grounding`);
    }
  }
  const c1 = inside.pieceBox('cushion-daybed-1'), th = inside.pieceBox('throw-daybed'), tele = inside.pieceBox('telescope');
  assert.ok(c1.z[0] >= I.floorRise + KINDS.daybed.seat - .03, `daybed cushion on seat: ${c1.z}`);
  assert.ok(th.z[1] >= I.floorRise + KINDS.daybed.seat, `daybed throw over seat: ${th.z}`);
  assert.ok(tele.z[1] > I.floorRise + 1.1 && tele.z[1] <= I.floorRise + KINDS.telescope.height + .02, `telescope height: ${tele.z}`);
  inside.dispose();

  // A daybed recipe that throws skips its cushions and throw while keeping telescope built.
  const [broken, brokenWarnings] = warned(() => {
    const res = buildInterior(THREE, {interior: I, art: stubArt(), openings, recipes: {...RECIPES, daybed: () => { throw new Error('slat broke'); }}});
    res.buildRest();
    return res;
  });
  assert.equal(brokenWarnings.length, 1);
  assert.ok(broken.skipped.includes('daybed') && broken.skipped.includes('cushion-daybed-1') && broken.skipped.includes('throw-daybed'));
  assert.ok(broken.pieceBox('telescope'));
  broken.dispose();
});

// ── bedrooms 2 and 3 furniture (Part 4e, Task 5) ──
test('bedrooms 2 and 3 build as floor-1 queued sets of at most 5 meshes with per-room shades, grounding and slope clearance', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  for (const roomId of ['bedroom-2', 'bedroom-3']) {
    const set = inside.furniture.sets.find(s => s.rooms.includes(roomId));
    assert.ok(set, `${roomId} set exists`);
    assert.ok(set.meshes >= 1 && set.meshes <= 5, `${roomId} meshes: ${set.meshes}`);
    const grp = inside.scene.getObjectByName(`furniture-${roomId}`);
    assert.ok(grp && grp.getObjectByName('shades'), `${roomId} has shades`);
    const room = I.rooms.find(r => r.id === roomId);
    for (const e of I.furniture.filter(x => x.room === roomId)) {
      const box = inside.pieceBox(e.id);
      assert.ok(box, `${e.id} drawn`);
      assert.ok(box.a[0] >= room.a[0] - .02 && box.a[1] <= room.a[1] + .02, `${e.id} a ${box.a}`);
      assert.ok(box.d[0] >= room.d[0] - .02 && box.d[1] <= room.d[1] + .02, `${e.id} d ${box.d}`);
      const minCeil = Math.min(ceilingHeight(I, 1, box.d[0]), ceilingHeight(I, 1, box.d[1]));
      assert.ok(box.z[1] <= I.floorRise + minCeil + .01, `${e.id} top ${box.z[1]} <= ceil ${I.floorRise + minCeil}`);
      if (KINDS[e.kind].standing === 'solid') assert.ok(patch(inside.scene, e.id).length > 0, `${e.id} has grounding`);
    }
    // Each bedroom's shade follows its own room's lamp dial, not living's.
    const lit = groupShadeColour(inside, `furniture-${roomId}`, dialsFor({[roomId]: 1, living: 0}));
    assert.deepEqual(lit.map(v => +v.toFixed(6)), SHADE_WARM.map(v => +v.toFixed(6)));
    const out = groupShadeColour(inside, `furniture-${roomId}`, dialsFor({[roomId]: 0, living: 1}));
    assert.ok(out[0] / out[2] < 1.4, `${roomId} shade stays pale when only living lamp is lit`);
  }
  inside.dispose();
});

// ── library nook furniture (Part 4e, Task 6) ──
test('library nook builds with sloped bookshelves hugging the ceiling pitch, standing-lamp shades following nook dial, 17 sets in total, and deterministic vertex count', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  assert.equal(inside.furniture.sets.length, 17, '17 sets across all 18 furnished rooms (9 ground + 8 upper)');
  const nookSet = inside.furniture.sets.find(s => s.rooms.includes('nook'));
  assert.ok(nookSet, 'nook set exists');
  assert.ok(nookSet.meshes >= 1 && nookSet.meshes <= 5, `nook meshes: ${nookSet.meshes}`);
  const grp = inside.scene.getObjectByName('furniture-nook');
  assert.ok(grp && grp.getObjectByName('shades'), 'nook has shades');

  // Slope-fit invariant: every vertex of the three bookcases stays below 3.0 + ceilingHeight(I, 1, d) - 0.01,
  // and each sloped bookcase rises at least 0.30 m from its south end to its north end.
  for (const id of ['nook-eave-shelves', 'nook-shelves-west', 'nook-shelves-east']) {
    const verts = [...vertices(inside.scene, id, 'furniture-wood'), ...vertices(inside.scene, id, 'furniture-cloth')];
    assert.ok(verts.length > 50, `${id} has wood and book vertices`);
    let northTop = -Infinity, southTop = -Infinity;
    for (const v of verts) {
      const ceil = I.floorRise + ceilingHeight(I, 1, v.d);
      assert.ok(v.z <= ceil - .01, `${id} vertex at d=${v.d.toFixed(3)} z=${v.z.toFixed(3)} exceeds ceiling ${ceil.toFixed(3)}`);
      if (v.d < 10.3) northTop = Math.max(northTop, v.z);
      if (v.d > 11.35) southTop = Math.max(southTop, v.z);
    }
    if (id !== 'nook-eave-shelves') {
      assert.ok(northTop - southTop >= .30, `${id} slopes up by ${(northTop - southTop).toFixed(3)} m (north ${northTop.toFixed(3)} vs south ${southTop.toFixed(3)})`);
    }
  }
  for (const e of I.furniture.filter(x => x.room === 'nook' && KINDS[x.kind].standing === 'solid')) {
    assert.ok(patch(inside.scene, e.id).length > 0, `${e.id} has grounding`);
  }
  const lit = groupShadeColour(inside, 'furniture-nook', dialsFor({nook: 1, living: 0}));
  assert.deepEqual(lit.map(v => +v.toFixed(6)), SHADE_WARM.map(v => +v.toFixed(6)));
  const out = groupShadeColour(inside, 'furniture-nook', dialsFor({nook: 0, living: 1}));
  assert.ok(out[0] / out[2] < 1.4);
  const firstCount = nookSet.vertices;
  inside.dispose();

  const second = build(); second.buildRest();
  assert.equal(second.furniture.sets.find(s => s.rooms.includes('nook')).vertices, firstCount);
  second.dispose();
});

// ── upstairs bathroom furniture (Part 4f, Task 3) ──
test('upstairs bathroom builds as a floor-1 queued set of at most 4 meshes without shades, lifted to floor 1 and clear of the back roof slope', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  const allowed = new Set(['furniture-wood', 'furniture-cloth', 'furniture-stone', 'grounding']);
  const set = inside.furniture.sets.find(s => s.rooms.includes('bath-upper'));
  assert.ok(set, 'bath-upper set exists');
  assert.ok(set.meshes >= 1 && set.meshes <= 4, `bath-upper meshes: ${set.meshes}`);
  const grp = inside.scene.getObjectByName('furniture-bath-upper');
  assert.ok(grp, 'furniture-bath-upper group exists');
  assert.equal(grp.getObjectByName('shades'), undefined, 'bath-upper has no shades');
  const roomIdx = I.rooms.findIndex(r => r.id === 'bath-upper');
  const room = I.rooms[roomIdx];
  for (const child of grp.children) {
    assert.ok(allowed.has(child.name), `bath-upper allowed mesh ${child.name}`);
    const p = child.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const a = p.getX(i), d = -p.getZ(i), z = p.getY(i);
      assert.ok(a >= room.a[0] - .02 && a <= room.a[1] + .02, `bath-upper ${child.name} a=${a}`);
      assert.ok(d >= room.d[0] - .02 && d <= room.d[1] + .02, `bath-upper ${child.name} d=${d}`);
      assert.ok(z >= I.floorRise - .01, `bath-upper ${child.name} z=${z}`);
      assert.ok(z <= I.floorRise + ceilingHeight(I, 1, d) - .01, `bath-upper ${child.name} z=${z} <= ceil at d=${d}`);
    }
    if (child.name !== 'grounding') {
      const l = child.geometry.getAttribute('light');
      assert.ok(l, `bath-upper ${child.name} has light attribute`);
      for (let i = 0; i < l.count; i++) {
        assert.ok(l.getX(i) + l.getY(i) + l.getZ(i) > 0, `bath-upper ${child.name} v${i}`);
        assert.equal(l.getW(i), roomIdx, `bath-upper ${child.name} v${i} room index`);
      }
    }
  }
  for (const e of I.furniture.filter(x => x.room === 'bath-upper' && KINDS[x.kind].standing === 'solid')) {
    const box = inside.pieceBox(e.id), f = footprint(e);
    assert.ok(box, `${e.id} drawn`);
    for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .02 && box[k][1] <= f[k][1] + .02, `${e.id} ${k} ${box[k]} within ${f[k]}`);
    assert.ok(Math.abs(box.z[0] - I.floorRise) <= .02, `${e.id} stands on floor 1`);
    assert.ok(box.z[1] <= I.floorRise + KINDS[e.kind].height + .02, `${e.id} height ${box.z[1] - I.floorRise}`);
    assert.ok(patch(inside.scene, e.id).length > 0, `${e.id} has grounding`);
  }
  inside.dispose();
});

// ── box room and linen cupboard furniture (Part 4f, Task 4) ──
test('box room and linen cupboard build within mesh limits (17 sets total), clear the back roof slope, draw folded linen across shelves, and isolate recipe failures', () => {
  const [inside, warnings] = warned(() => { const res = build(); res.buildRest(); return res; });
  assert.deepEqual(inside.skipped, []);
  assert.equal(warnings.length, 0);
  assert.equal(inside.furniture.sets.length, 17, '17 sets across all 18 furnished rooms');
  const allowed = new Set(['furniture-wood', 'furniture-cloth', 'furniture-stone', 'grounding']);
  for (const roomId of ['box-room', 'linen']) {
    const set = inside.furniture.sets.find(s => s.rooms.includes(roomId));
    assert.ok(set, `${roomId} set exists`);
    assert.ok(set.meshes >= 1 && set.meshes <= 3, `${roomId} meshes: ${set.meshes}`);
    const grp = inside.scene.getObjectByName(`furniture-${roomId}`);
    assert.ok(grp, `furniture-${roomId} group exists`);
    assert.equal(grp.getObjectByName('shades'), undefined, `${roomId} has no shades`);
    const roomIdx = I.rooms.findIndex(r => r.id === roomId);
    const room = I.rooms[roomIdx];
    for (const child of grp.children) {
      assert.ok(allowed.has(child.name), `${roomId} allowed mesh ${child.name}`);
      const p = child.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const a = p.getX(i), d = -p.getZ(i), z = p.getY(i);
        assert.ok(a >= room.a[0] - .02 && a <= room.a[1] + .02, `${roomId} ${child.name} a=${a}`);
        assert.ok(d >= room.d[0] - .02 && d <= room.d[1] + .02, `${roomId} ${child.name} d=${d}`);
        assert.ok(z >= I.floorRise - .01, `${roomId} ${child.name} z=${z}`);
        assert.ok(z <= I.floorRise + ceilingHeight(I, 1, d) - .01, `${roomId} ${child.name} z=${z} <= ceil ${I.floorRise + ceilingHeight(I, 1, d)} at d=${d}`);
      }
      if (child.name !== 'grounding') {
        const l = child.geometry.getAttribute('light');
        assert.ok(l, `${roomId} ${child.name} has light attribute`);
        for (let i = 0; i < l.count; i++) {
          assert.ok(l.getX(i) + l.getY(i) + l.getZ(i) > 0, `${roomId} ${child.name} v${i}`);
          assert.equal(l.getW(i), roomIdx, `${roomId} ${child.name} v${i} room index`);
        }
      }
    }
    for (const e of I.furniture.filter(x => x.room === roomId && KINDS[x.kind].standing === 'solid')) {
      const box = inside.pieceBox(e.id), f = footprint(e);
      assert.ok(box, `${e.id} drawn`);
      for (const k of ['a', 'd']) assert.ok(box[k][0] >= f[k][0] - .005 && box[k][1] <= f[k][1] + .005, `${e.id} ${k} ${box[k]} within ${f[k]}`);
      assert.ok(Math.abs(box.z[0] - I.floorRise) <= .02, `${e.id} stands on floor 1`);
      assert.ok(box.z[1] <= I.floorRise + KINDS[e.kind].height + .005, `${e.id} height ${box.z[1] - I.floorRise}`);
      assert.ok(patch(inside.scene, e.id).length > 0, `${e.id} has grounding`);
    }
  }
  // Both linen units carry folded cloth across at least four distinct shelf heights.
  for (const id of ['linen-press', 'linen-eave-shelf']) {
    const clothVerts = vertices(inside.scene, id, 'furniture-cloth');
    assert.ok(clothVerts.length > 100, `${id} has folded linen vertices`);
    const bands = new Set(clothVerts.map(v => Math.floor((v.z - I.floorRise) / .35)));
    assert.ok(bands.size >= 4, `${id} linen across at least 4 shelves: ${[...bands]}`);
  }
  const linenCount = inside.furniture.sets.find(s => s.rooms.includes('linen')).vertices;
  inside.dispose();

  // Deterministic vertex count over two builds.
  const second = build(); second.buildRest();
  assert.equal(second.furniture.sets.find(s => s.rooms.includes('linen')).vertices, linenCount);
  second.dispose();

  // Lower-eave slope clamping: even under a 1.35 m eave ceiling, linen-shelf clamps both carcass and folded linen below ceiling - 0.04.
  const lowEave = structuredClone(I);
  lowEave.eaveCeiling = 1.30;
  const lowBuilt = buildInterior(THREE, {interior: lowEave, art: stubArt(), openings});
  lowBuilt.buildRest();
  for (const meshName of ['furniture-wood', 'furniture-cloth']) {
    for (const v of vertices(lowBuilt.scene, 'linen-eave-shelf', meshName)) {
      const ceil = lowEave.floorRise + ceilingHeight(lowEave, 1, v.d);
      assert.ok(v.z <= ceil - .03, `low-eave linen-eave-shelf ${meshName} z=${v.z} <= ${ceil - .03}`);
    }
  }
  lowBuilt.dispose();

  // A trunk recipe that throws skips only the trunks while keeping crates and chair built.
  const [broken, brokenWarnings] = warned(() => {
    const res = buildInterior(THREE, {interior: I, art: stubArt(), openings, recipes: {...RECIPES, trunk: () => { throw new Error('hinge snapped'); }}});
    res.buildRest();
    return res;
  });
  assert.equal(brokenWarnings.length, 1);
  assert.deepEqual(new Set(broken.skipped), new Set(['trunk-1', 'trunk-2']));
  assert.equal(broken.pieceBox('trunk-1'), null);
  assert.equal(broken.pieceBox('trunk-2'), null);
  assert.ok(broken.pieceBox('box-crates') && broken.pieceBox('box-chair'));
  broken.dispose();
});
