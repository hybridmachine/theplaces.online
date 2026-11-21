import test from 'node:test';
import {bareInterior, obstaclesOf, solidObstacles} from '../shared/furniture.js';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {ceilingHeight, roomAt, validInterior} from '../shared/interior.js';

test('each floor is tiled exactly by its rooms: 18 × 12 with no overlap', () => {
  for (const floor of [0, 1]) {
    const rooms = I.rooms.filter(r => r.floor === floor);
    assert.equal(rooms.reduce((s, r) => s + (r.a[1] - r.a[0]) * (r.d[1] - r.d[0]), 0), 216);
    for (let a = .25; a < 18; a += .5) for (let d = .25; d < 12; d += .5)
      assert.equal(rooms.filter(r => a > r.a[0] && a < r.a[1] && d > r.d[0] && d < r.d[1]).length, 1, `${floor} ${a} ${d}`);
  }
});
test('the owner\'s rooms are all there', () => {
  for (const id of ['living', 'study', 'kitchen', 'pantry', 'master', 'bedroom-2', 'bedroom-3', 'bath-ground', 'bath-upper']) assert.ok(I.rooms.find(r => r.id === id), id);
  assert.equal(I.rooms.find(r => r.id === 'master').floor, 0);
});
test('every opening lies on the wall its two rooms share, is at least 0.9 m clear, and keeps off the stair', () => {
  for (const o of I.openings) {
    const [p, q] = o.rooms.map(id => I.rooms.find(r => r.id === id)), along = o.line === 'a' ? 'd' : 'a';
    assert.ok(p && q && p.floor === o.floor && q.floor === o.floor, o.id);
    assert.ok([p, q].every(r => r[o.line].includes(o.at)), `${o.id} on the shared line`);
    assert.ok([p, q].every(r => o.span[0] >= r[along][0] + I.wall / 2 && o.span[1] <= r[along][1] - I.wall / 2), `${o.id} within both rooms`);
    assert.ok(o.span[1] - o.span[0] >= .9, `${o.id} clear width`);
    if (o.line === 'a' && o.at === 11 && o.span[0] < 7) assert.ok(o.span[1] <= I.stair.d[0] || o.span[0] >= I.stair.d[1], `${o.id} beside the stair`);
  }
});
test('every room is reachable from the hall through openings and the stair', () => {
  const seen = new Set(['hall', 'landing']);   // the stair joins them
  for (let grew = true; grew;) { grew = false; for (const o of I.openings) { const [x, y] = o.rooms; if (seen.has(x) !== seen.has(y)) { seen.add(x); seen.add(y); grew = true; } } }
  assert.deepEqual(I.rooms.map(r => r.id).filter(id => !seen.has(id)), []);
});
test('the stair is 1.4 m wide, rises 3 m over 3.9 m, inside the hall and landing', () => {
  assert.deepEqual([I.stair.a, I.stair.d, I.floorRise], [[9.6, 11], [1.5, 5.4], 3]);
  assert.ok(I.door.a + I.door.width / 2 <= I.stair.a[0]);
});
test('ceilings: 2.7 m downstairs; 1.9 m at the eaves to 3.6 m at the ridge upstairs', () => {
  assert.equal(ceilingHeight(I, 0, 3), 2.7);
  for (const [d, h] of [[0, 1.9], [12, 1.9], [6, 3.6], [3, 2.75]]) assert.ok(Math.abs(ceilingHeight(I, 1, d) - h) < 1e-9, `${d}`);
});
test('windows sit in their rooms; roomAt finds rooms and nothing outside', () => {
  for (const w of I.windows) { const r = I.rooms.find(x => x.id === w.room); assert.ok(w.a - w.width / 2 >= r.a[0] + I.wall && w.a + w.width / 2 <= r.a[1] - I.wall, w.id); }
  assert.equal(roomAt(I, 0, [9, 1]).id, 'hall'); assert.equal(roomAt(I, 1, [9, 1]).id, 'landing'); assert.equal(roomAt(I, 0, [-1, 1]), null);
});
test('validInterior accepts the blueprint and rejects broken ones', () => {
  assert.ok(validInterior(I));
  const broken = f => { const c = structuredClone(I); f(c); return validInterior(c); };
  assert.ok(!broken(c => { c.version = 2; }));
  assert.ok(!broken(c => { c.rooms[0].a[1] = 8; }));                    // overlap
  assert.ok(!broken(c => { c.openings[0].span = [2, 2.5]; }));          // too narrow
  assert.ok(!broken(c => { c.openings = c.openings.filter(o => !o.rooms.includes('pantry')); }));   // unreachable
  assert.ok(!broken(c => { c.stair.d[1] = NaN; }));
});

import {canStep, floorAfter, floorArea, indoorHeight, onStair, wallSegments} from '../shared/interior.js';

test('the eye keeps 0.325 m from room lines and can pass every opening', () => {
  assert.ok(floorArea(I, 0, [3.5, 3.5])); assert.ok(!floorArea(I, 0, [.3, 3.5])); assert.ok(!floorArea(I, 0, [6.8, 1]));
  for (const o of I.openings) {
    const mid = (o.span[0] + o.span[1]) / 2;
    for (const off of [-.3, 0, .3]) assert.ok(floorArea(I, o.floor, o.line === 'a' ? [o.at + off, mid] : [mid, o.at + off]), `${o.id} ${off}`);
    const edge = o.span[0] + .1;
    assert.ok(!floorArea(I, o.floor, o.line === 'a' ? [o.at, edge] : [edge, o.at]), `${o.id} jamb`);
  }
});
test('under the stair and the stairwell are shut; the entry pose is standable', () => {
  assert.ok(!floorArea(I, 0, [10.3, 3])); assert.ok(!floorArea(I, 1, [10.3, 3])); assert.ok(!floorArea(I, 1, [9.5, 3]));
  assert.ok(floorArea(I, 0, [10.3, 1])); assert.ok(floorArea(I, 1, [10.3, 6.2])); assert.ok(floorArea(I, 0, I.entry.position));
});
test('the stair is entered only at its foot from below and its top from above', () => {
  const stair = [10.3, 3];
  assert.ok(onStair(I, stair)); assert.ok(!onStair(I, [9.7, 3]));
  assert.ok(canStep(I, {floor: 0, position: [10.3, 1.45]}, [10.3, 1.55]));
  assert.ok(!canStep(I, {floor: 0, position: [10.3, 5.5]}, [10.3, 5.35]));     // from the hall behind the flight
  assert.ok(canStep(I, {floor: 1, position: [10.3, 5.45]}, [10.3, 5.35]));
  assert.ok(!canStep(I, {floor: 1, position: [10.3, 1.4]}, [10.3, 1.55]));
  assert.ok(!canStep(I, {floor: 0, position: [9.5, 3]}, stair));               // through the side
});
test('leaving the stair sets the floor by the end left; on it the floor is kept', () => {
  assert.equal(floorAfter(I, {floor: 0, position: [10.3, 5.35]}, [10.3, 5.45]), 1);
  assert.equal(floorAfter(I, {floor: 1, position: [10.3, 1.55]}, [10.3, 1.45]), 0);
  assert.equal(floorAfter(I, {floor: 0, position: [10.3, 2]}, [10.3, 2.1]), 0);
  assert.ok(canStep(I, {floor: 0, position: [10.3, 5.35]}, [10.3, 5.45]));
});
test('height follows the flight smoothly from 0 to 3 m', () => {
  assert.equal(indoorHeight(I, 0, [3, 3]), 0); assert.equal(indoorHeight(I, 1, [3, 3]), 3);
  assert.ok(Math.abs(indoorHeight(I, 0, [10.3, 3.45]) - 1.5) < 1e-9);
  assert.equal(indoorHeight(I, 0, [10.3, 1.5]), 0); assert.ok(Math.abs(indoorHeight(I, 1, [10.3, 5.4]) - 3) < 1e-9);
});
test('wall segments cover every wall line once, with each opening as one run', () => {
  for (const floor of [0, 1]) {
    const segs = wallSegments(I, floor), len = s => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
    assert.ok(segs.every(s => len(s) > 0 && (s.from[0] === s.to[0] || s.from[1] === s.to[1])));
    assert.deepEqual(segs.filter(s => s.opening).map(s => s.opening).sort(), I.openings.filter(o => o.floor === floor).map(o => o.id).sort());
    const outer = segs.filter(s => [0, 18].includes(s.from[0]) && s.from[0] === s.to[0] || [0, 12].includes(s.from[1]) && s.from[1] === s.to[1]);
    assert.ok(Math.abs(outer.reduce((n, s) => n + len(s), 0) - 60) < 1e-9);
  }
});

test('the open door leaf is an obstacle and the interior is still valid', () => {
  assert.equal(validInterior(I), true);
  for (const p of [[8.5, .5], [8.5 - .27, .5], [8.5 + .27, .5], [8.5, 1.2]]) assert.equal(floorArea(I, 0, p), false, `${p}`);
  assert.equal(floorArea(I, 0, [9, .8]), true);
  assert.equal(floorArea(I, 0, [8.5, 1.4]), true, 'beyond the leaf\'s free end');
  assert.equal(floorArea(I, 1, [8.5, .5]), floorArea({...I, doorLeaf: undefined}, 1, [8.5, .5]));
});
test('a leaf hinged on the stair side, or shutting the cabin in two, is invalid', () => {
  assert.equal(validInterior({...I, doorLeaf: {...I.doorLeaf, a: 9.5}}), false);
  assert.equal(validInterior({...I, doorLeaf: undefined}), false);
  assert.equal(validInterior({...I, doorLeaf: {...I.doorLeaf, d: [0, 13]}}), false, 'a leaf across the whole cabin walls off the living room');
  assert.equal(validInterior({...I, doorLeaf: {...I.doorLeaf, thick: 0}}), false);
});

// The fireplace, the lamps and the solid chimney breasts.
const variant = f => { const c = structuredClone(I); f(c); return validInterior(c); };
// A free-standing solid piece added in a room, the walker's obstacles derived from the furniture again (obstacles must match it).
const solid = (room, at) => variant(c => { c.furniture.push({id: 'extra', kind: 'side-table', room, at, turn: 0}); c.obstacles = obstaclesOf(c); });
const fit = (c, room) => c.fittings.find(f => f.room === room);
test('the blueprint has a fireplace, one fitting for every room, and is still valid', () => {
  assert.equal(validInterior(I), true);
  assert.equal(I.fittings.length, I.rooms.length);
  for (const r of I.rooms) assert.equal(I.fittings.filter(f => f.room === r.id).length, 1, r.id);
  assert.equal(I.lightSeed, 20261120);
  const {fireplace: f} = I;
  assert.deepEqual(I.breasts, [{floor: 0, a: [0, f.breast.depth], d: [f.d - f.breast.width / 2, f.d + f.breast.width / 2]}, {floor: 1, a: [0, f.upper.depth], d: [f.d - f.upper.width / 2, f.d + f.upper.width / 2]}]);
});
test('the chimney breasts are solid on both floors and the hearth slab is not', () => {
  assert.equal(floorArea(I, 0, [.3, 3.5]), false);
  assert.equal(floorArea(I, 0, [.5 + I.eyeClear - .01, 3.5]), false);
  assert.equal(floorArea(I, 0, [1.2, 3.5]), true, 'on the slab\'s reach');
  assert.equal(floorArea(I, 1, [.2, 3.5]), false);
  assert.equal(floorArea(I, 1, [1, 3.5]), true);
});
test('a hanging lamp that a head would meet, or one under a roof window, is invalid', () => {
  assert.equal(variant(c => { fit(c, 'living').at[2] = 1.9; }), false);
  assert.equal(variant(c => { fit(c, 'bedroom-2').at[1] = 2.7; }), false);
  assert.equal(variant(c => { fit(c, 'nook').at[2] = I.floorRise + ceilingHeight(I, 1, 9.5) - .2; }), false, 'too close to the ceiling');
});
test('a wall lamp away from its room\'s walls, a fitting in the wrong room, or a room without one is invalid', () => {
  assert.equal(variant(c => { fit(c, 'hall').at[1] = 2; }), false);
  assert.equal(variant(c => { fit(c, 'hall').at[2] = 2.5; }), false, 'too high');
  assert.equal(variant(c => { fit(c, 'hall').at[2] = 1.2; }), false, 'too low');
  assert.equal(variant(c => { fit(c, 'study').at[0] = 3; }), false);
  assert.equal(variant(c => { c.fittings.pop(); }), false);
  assert.equal(variant(c => { c.fittings.push({...c.fittings[0]}); }), false, 'two for one room');
  assert.equal(variant(c => { delete c.fittings; }), false);
});
test('an obstacle that shuts a room off, or sits across two rooms, is invalid', () => {
  // On the blueprint without its furniture (the breasts alone), so the obstacle's own rules decide: with furniture present a raw
  // obstacle is refused first for not matching the pieces, which would prove nothing about these.
  const lone = extra => variant(c => { delete c.furniture; c.obstacles = [...c.breasts, ...extra]; });
  assert.equal(lone([]), true, 'the breasts alone are valid');
  assert.equal(lone([{floor: 0, a: [6.5, 7.5], d: [2, 5]}]), false, 'across the hall-living opening');
  assert.equal(lone([{floor: 0, a: [6, 8], d: [5.5, 6.5]}]), false, 'in two rooms');
  assert.equal(lone([{floor: 1, a: [6.2, 7], d: [3, 4]}]), false, 'shuts the landing off bedroom-2');
  assert.equal(lone([{floor: 0, a: [9.5, 10.5], d: [10, 11]}]), true, 'a free-standing one is fine');
  assert.equal(solid('dining', [10, 10.5]), true, 'a free-standing one is fine');
});
test('no wall fitting sits inside an obstacle; a hanging one may hang over one', () => {
  // a wall lamp on the living room's gable wall: clear of the chimney breast it is fine, on it it is not
  assert.equal(variant(c => { Object.assign(fit(c, 'living'), {kind: 'wall', at: [.2, 1.5, 1.8]}); }), true);
  assert.equal(variant(c => { Object.assign(fit(c, 'living'), {kind: 'wall', at: [.2, 3.5, 1.8]}); }), false);
  assert.equal(variant(c => { Object.assign(fit(c, 'bedroom-2'), {kind: 'wall', at: [.2, 3.5, I.floorRise + 1.8]}); }), false, 'and upstairs');
  // a table under the dining room's lamp leaves the blueprint valid
  assert.equal(solid('dining', [9, 9.5]), true);
});

// The living room's and hall's furniture, and the rules that keep it walkable.
import {doorwayPoint, furnishedWay, reachable, wideTargets} from '../shared/interior.js';

const piece = (c, id) => c.furniture.find(e => e.id === id);
// A copy of the blueprint with its furniture changed, the walker's obstacles derived again.
const withFurniture = change => { const c = structuredClone(I); change(c.furniture, c); c.obstacles = obstaclesOf(c); return validInterior(c); };

test('the furnished blueprint is valid', () => assert.equal(validInterior(I), true));
test('the bare blueprint is valid and a 0.9 m walker already gets everywhere rule 8 names', () => {
  const bare = bareInterior(I);
  assert.equal(validInterior(bare), true);
  assert.equal(wideTargets(bare).length, 6, 'four hall openings, the kitchen opening, the stair foot');
  for (const target of wideTargets(bare)) assert.ok(reachable(furnishedWay(bare), 0, I.entry.position, target, .45), `${target}`);
});
test('a 0.9 m walker gets everywhere rule 8 names in the furnished blueprint too', () => {
  for (const target of wideTargets(I)) assert.ok(reachable(furnishedWay(I), 0, I.entry.position, target, .45), `${target}`);
});
test('the walker\'s obstacles are the breasts and one rectangle per solid piece', () =>
  assert.deepEqual(I.obstacles, [...I.breasts, ...solidObstacles(I)]));
test('the speed spots and the named spots are standable', () => {
  for (const p of [...I.spots.speed, I.spots.hearth, I.spots.casement, I.spots.bookshelf]) assert.ok(floorArea(I, 0, p), `${p}`);
});
test('no standable pocket: every standable grid point of the living room and hall is reachable from the arrival spot', () => {
  for (let i = 0; i <= 110; i++) for (let j = 0; j <= 70; j++) {
    const p = [i / 10, j / 10];
    if (floorArea(I, 0, p)) assert.ok(reachable(I, 0, I.entry.position, p), `${p}`);
  }
});
test('the narrower clearance shrinks the standable floor', () => {
  assert.equal(floorArea(I, 0, [6.6, 5.5]), true);
  assert.equal(floorArea(I, 0, [6.6, 5.5], .45), false, 'within 0.525 m of the hall wall');
  assert.equal(reachable(I, 0, I.entry.position, [-1, 3]), false, 'outside the cabin');
});
test('rule 1: a duplicate id, an unknown kind or an unknown room is invalid', () => {
  assert.equal(withFurniture(f => { piece({furniture: f}, 'cup').id = 'book'; }), false, 'duplicate id');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'cup').kind = 'piano'; }), false, 'unknown kind');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'cup').room = 'attic'; }), false, 'unknown room');
});
test('rule 2: a piece straddling a wall is invalid', () => {
  assert.equal(withFurniture(f => { piece({furniture: f}, 'sofa').at[0] = 7; }), false, 'sofa across a = 7');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'doormat').at[1] = 0; }), false, 'doormat through the front wall');
});
test('rule 3: solid pieces overlapping each other, a doorway, the leaf\'s sweep or the stair are invalid', () => {
  assert.equal(withFurniture(f => { piece({furniture: f}, 'sofa').at = [...piece({furniture: f}, 'low-table').at]; }), false, 'sofa over the low table');
  assert.equal(withFurniture(f => { f.push({id: 'x', kind: 'console', room: 'living', at: [6.6, 3.5], turn: Math.PI / 2}); }), false, 'console across the hall-living doorway');
  assert.equal(withFurniture(f => { f.push({id: 'x', kind: 'boot-bench', room: 'hall', at: [9.1, .5], turn: 0}); }), false, 'bench in the leaf\'s sweep');
  // (clear of the leaf itself and of every route: only the sweep forbids it)
  assert.equal(withFurniture(f => { f.push({id: 'x', kind: 'umbrella-stand', room: 'hall', at: [9.3, .16], turn: 0}); }), false, 'umbrella stand in the leaf\'s sweep');
  assert.equal(withFurniture(f => { f.push({id: 'x', kind: 'side-table', room: 'hall', at: [10.3, 1.6], turn: 0}); }), false, 'table on the stair foot');
  assert.equal(withFurniture(f => { f.push({id: 'x', kind: 'side-table', room: 'hall', at: [10.3, 3], turn: 0}); }), false, 'table on the flight');
  assert.equal(withFurniture(f => { f.push({id: 'x', kind: 'side-table', room: 'living', at: [.3, 3.5], turn: 0}); }), false, 'table in the chimney breast');
});
test('rule 3: the newel stands just outside the stair\'s foot corner and nowhere else', () => {
  const corner = [I.stair.a[0], I.stair.d[0]];
  assert.ok(Math.hypot(piece(I, 'newel').at[0] - corner[0], piece(I, 'newel').at[1] - corner[1]) <= .2);
  assert.equal(withFurniture(f => { piece({furniture: f}, 'newel').at = [corner[0], corner[1] + .5]; }), false, 'a newel 0.5 m up the flight\'s side');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'newel').at = [corner[0] - .5, corner[1]]; }), false, 'a newel 0.5 m out into the hall');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'newel').at = [corner[0] + .3, corner[1] + .3]; }), false, 'a newel on the flight');
  assert.equal(withFurniture(f => { f.push({id: 'x', kind: 'newel', room: 'hall', at: [9.3, 3], turn: 0}); }), false, 'a second newel away from the corner');
});
test('rule 4: a piece in front of the fire\'s mouth or over a wall lamp is invalid', () => {
  assert.equal(withFurniture(f => { piece({furniture: f}, 'log-basket').at = [.85, I.fireplace.d]; }), false, 'basket in front of the mouth');
  assert.equal(withFurniture(f => { f.push({id: 'x', kind: 'boot-bench', room: 'hall', at: [10.2, .7], turn: Math.PI / 2}); }), false, 'bench under the hall lamp');
});
test('rule 5: a wall-hung piece across an opening, a window, near a wall lamp or off its room\'s walls is invalid', () => {
  assert.equal(withFurniture(f => { piece({furniture: f}, 'picture-2').along = [4.6, 5.4]; }), false, 'picture across the hall-living opening');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'picture-1').along = [3.2, 3.8]; }), false, 'picture over the living window');
  assert.equal(withFurniture(f => { f.push({id: 'x', kind: 'picture', room: 'hall', wall: 'd', line: 0, along: [9.6, 10.0], z: 1.5}); }), false, 'picture beside the hall lamp');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'picture-3').line = 3; }), false, 'picture on no wall');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'hooks').line = 11; }), false, 'hooks on a wall of another room');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'mirror').along = [6.6, 7.4]; }), false, 'mirror past the room\'s end');
});
test('rule 6: a piece set on nothing is invalid', () => {
  assert.equal(withFurniture(f => { piece({furniture: f}, 'table-lamp').on = 'nothing'; }), false, 'lamp on nothing');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'cup').on = 'book'; }), false, 'cup on a set-on piece');
});
test('rule 7: a ring of benches closing the hearth spot off is invalid', () => {
  const bench = (at, turn = 0) => ({id: `ring-${at}`, kind: 'boot-bench', room: 'living', at, turn});
  assert.equal(withFurniture(f => { f.push(bench([1.25, 2.68]), bench([2.5, 2.68]), bench([1.25, 4.32]), bench([2.5, 4.32])); }), false);
});
test('rule 8: a console narrowing the hall-dining way to 0.6 m is invalid, though a 0.5 m walker still passes', () => {
  // (the console's east end 0.6 m short of the stair, just north of the flight's top; its west end 0.2 m off the hall's wall)
  const c = structuredClone(I);
  c.furniture.push({id: 'x', kind: 'console', room: 'hall', at: [I.stair.a[0] - .6 - .9, 5.675], turn: 0}); c.obstacles = obstaclesOf(c);
  const dining = doorwayPoint(I.openings.find(o => o.id === 'hall-dining'));
  assert.ok(reachable(furnishedWay(c), 0, I.entry.position, dining), 'the usual walker passes');
  assert.equal(reachable(furnishedWay(c), 0, I.entry.position, dining, .45), false);
  assert.ok(reachable(c, 0, I.entry.position, dining, .45), 'though round through the kitchen and the dining room it could');
  assert.equal(validInterior(c), false);
});
test('a blueprint without furniture or breasts is judged as before', () => {
  const {furniture, breasts, spots, stairRail, ...old} = structuredClone(I);
  assert.equal(validInterior({...old, obstacles: breasts}), true);
  assert.equal(validInterior({...structuredClone(I), spots: undefined}), false, 'furniture without its spots');
});
test('a blueprint whose obstacles omit a solid piece, or reorder them, is invalid', () => {
  const omit = structuredClone(I); omit.obstacles = omit.obstacles.filter((o, k) => k !== omit.obstacles.length - 1);
  assert.equal(validInterior(omit), false, 'a solid piece\'s rectangle is missing');
  const swapped = structuredClone(I); swapped.obstacles.reverse();
  assert.equal(validInterior(swapped), false, 'the same rectangles in another order');
  assert.equal(validInterior(bareInterior(I)), true);
});
