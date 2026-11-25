import test from 'node:test';
import {KINDS, bareInterior, footprint, obstaclesOf, solidObstacles, withoutRooms} from '../shared/furniture.js';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I, SLICE_4E} from '../shared/lakeside-interior.js';
import {ceilingHeight, roomAt, stairTop, upperThroughWays, validInterior} from '../shared/interior.js';

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
  // a table under a room's hanging lamp leaves the blueprint valid (dining and master already have furniture there; test an unfurnished room too)
  assert.equal(solid('bedroom-2', [3.5, 5]), true);
});

// The living room's and hall's furniture, and the rules that keep it walkable.
import {FURNISHED, doorwayPoint, furnishedWay, reachable, throughWays, wideTargets} from '../shared/interior.js';

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
test('rule 5: a wall-hung piece across the front door is invalid, and one on the front wall clear of the door and the windows is valid', () => {
  assert.equal(withFurniture(f => { Object.assign(piece({furniture: f}, 'mirror'), {wall: 'd', line: 0, along: [8.7, 9.3]}); }), false, 'mirror across the front doorway');
  assert.equal(withFurniture(f => { Object.assign(piece({furniture: f}, 'mirror'), {wall: 'd', line: 0, along: [7.3, 7.9]}); }), true, 'mirror on the front wall beside the door');
});
test('rule 6: a piece set on another shares its room; a mantel piece is in the fireplace\'s room', () => {
  assert.equal(withFurniture(f => { piece({furniture: f}, 'cup').room = 'hall'; }), false, 'a cup in the hall on the living room\'s low table');
  assert.equal(withFurniture(f => { piece({furniture: f}, 'clock').room = 'hall'; }), false, 'a mantel clock in the hall');
  assert.equal(validInterior(I), true);
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

// Kitchen and dining room rules, spots and ways through (synthetic cases start with kitchen and dining bare so they test each rule in isolation).
const withPieces = (extra, spots) => {
  const c = structuredClone(withoutRooms(I, ['kitchen', 'dining']));
  c.furniture.push(...extra);
  if (spots) c.spots = {...c.spots, ...spots};
  c.obstacles = obstaclesOf(c);
  return c;
};
test('the real blueprint is valid, with the new spots and the six speed spots', () => {
  assert.equal(validInterior(I), true);
  assert.equal(I.spots.speed.length, 6);
  for (const k of ['range', 'dresser', 'diningWindow', 'desk', 'shelves', 'wardrobes', 'bedFoot', 'bedside', 'bath', 'laundry', 'pantry']) {
    assert.ok(Array.isArray(I.spots[k]) && floorArea(I, 0, I.spots[k]), k);
  }
  for (const p of I.spots.speed) assert.ok(floorArea(I, 0, p), `speed ${p}`);
  assert.equal(roomAt(I, 0, I.spots.speed[5])?.id, 'bath-ground');
  assert.equal(FURNISHED.length, 10);
  const groundIds = I.rooms.filter(r => r.floor === 0).map(r => r.id).sort();
  assert.deepEqual([...FURNISHED].sort(), groundIds);
});
test('a table across the kitchen blocks the way through it', () => {
  assert.equal(validInterior(withPieces([{id: 'kt-wide', kind: 'kitchen-table', room: 'kitchen', at: [4.75, 9.5], size: [3.9, .8]}])), false);
  // (clear of all doorway boxes and passable at 0.25 m, yet too tight for the 0.9 m way through to the laundry and pantry)
  const narrow = withPieces([{id: 'kt-narrow', kind: 'kitchen-table', room: 'kitchen', at: [3.6, 9.5], size: [.7, 3.6]}], {dresser: [4.5, 9.5]});
  const pantry = doorwayPoint(I.openings.find(o => o.id === 'kitchen-pantry'));
  const lk = doorwayPoint(I.openings.find(o => o.id === 'living-kitchen'));
  assert.ok(reachable(furnishedWay(narrow, ['kitchen']), 0, lk, pantry), 'the 0.25 m walker still passes');
  assert.equal(reachable(furnishedWay(narrow, ['kitchen']), 0, lk, pantry, .45), false);
  assert.equal(validInterior(narrow), false);
});
test('a table across the dining room blocks the way through it', () => {
  assert.equal(validInterior(withPieces([{id: 'dt-wide', kind: 'dining-table', room: 'dining', at: [9, 8.2], size: [3.4, .9], turn: 0}])), false);
  // (clear of the doorway boxes, yet too tight for the 0.9 m way between the kitchen and hall openings)
  const tight = withPieces([{id: 'dt-tight', kind: 'dining-table', room: 'dining', at: [9.15, 8.2], size: [3.1, .9], turn: 0}]);
  const kd = doorwayPoint(I.openings.find(o => o.id === 'kitchen-dining'));
  const hd = doorwayPoint(I.openings.find(o => o.id === 'hall-dining'));
  assert.equal(reachable(furnishedWay(tight, ['dining']), 0, kd, hd, .45), false);
  assert.equal(validInterior(tight), false);
});
test('a piece on a new named spot makes the blueprint invalid', () => {
  for (const [k, room] of [['range', 'kitchen'], ['dresser', 'kitchen'], ['diningWindow', 'dining']]) {
    assert.equal(validInterior(withPieces([{id: `on-${k}`, kind: 'chair', room, at: [...I.spots[k]]}])), false, k);
  }
  // (a low piece under the window sill still fails because it covers spots.diningWindow)
  assert.equal(validInterior(withPieces([{id: 'low-on-dw', kind: 'side-table', room: 'dining', at: [...I.spots.diningWindow]}])), false);
});
test('a piece on the third speed spot makes the blueprint invalid', () => {
  assert.equal(validInterior(withPieces([{id: 'on-speed2', kind: 'chair', room: 'kitchen', at: [...I.spots.speed[2]]}])), false);
});
test('a sideboard under the dining window makes the blueprint invalid; a low piece there does not', () => {
  // Move diningWindow slightly forward so Rule 7 does not hide Rule 9.
  const clearSpot = {diningWindow: [10, 11.0]};
  assert.equal(validInterior(withPieces([{id: 'sb-win', kind: 'sideboard', room: 'dining', at: [10, 11.7]}], clearSpot)), false);
  assert.equal(validInterior(withPieces([{id: 'ws-win', kind: 'window-seat', room: 'dining', at: [10, 11.7]}], clearSpot)), true);
});
test('throughWays names the dining, kitchen, passage, study, master, bath-ground, laundry and pantry rooms, by doorway points and spots of the blueprint', () => {
  const ways = throughWays(I), op = id => doorwayPoint(I.openings.find(o => o.id === id));
  assert.deepEqual(ways.map(w => w.room), ['dining', 'kitchen', 'passage', 'study', 'master', 'bath-ground', 'laundry', 'pantry']);
  assert.deepEqual(ways[0], {room: 'dining', from: op('kitchen-dining'), to: [op('hall-dining')]});
  assert.deepEqual(ways[1], {room: 'kitchen', from: op('living-kitchen'), to: [op('kitchen-dining'), op('kitchen-laundry'), op('kitchen-pantry')]});
  assert.deepEqual(ways[2], {room: 'passage', from: op('hall-passage'), to: [op('passage-master'), op('passage-bath-ground')]});
  assert.deepEqual(ways[3], {room: 'study', from: op('hall-study'), to: [I.spots.shelves]});
  assert.deepEqual(ways[4], {room: 'master', from: op('passage-master'), to: [I.spots.bedFoot]});
  assert.deepEqual(ways[5], {room: 'bath-ground', from: op('passage-bath-ground'), to: [I.spots.bath]});
  assert.deepEqual(ways[6], {room: 'laundry', from: op('kitchen-laundry'), to: [I.spots.laundry]});
  assert.deepEqual(ways[7], {room: 'pantry', from: op('kitchen-pantry'), to: [I.spots.pantry]});
});
test('a kitchen table as planned leaves a 0.9 m way to the pantry and laundry doors', () => {
  const c = withPieces([
    {id: 'kt-plan', kind: 'kitchen-table', room: 'kitchen', at: [4.75, 9.5], turn: 0},
    {id: 'dr-plan', kind: 'dresser', room: 'kitchen', at: [2.8, 9.5], turn: Math.PI / 2},
  ]);
  assert.equal(validInterior(c), true);
});
test('the real blueprint with the kitchen furnished is valid', () => {
  assert.equal(validInterior(I), true);
  assert.ok(I.furniture.some(e => e.room === 'kitchen' && e.kind === 'range'));
  assert.ok(I.furniture.some(e => e.room === 'kitchen' && e.kind === 'kitchen-table'));
  assert.ok(I.furniture.some(e => e.room === 'kitchen' && e.kind === 'dresser'));
});
test('the real blueprint with both rooms furnished is valid', () => {
  assert.equal(validInterior(I), true);
  assert.ok(I.furniture.some(e => e.room === 'dining' && e.kind === 'dining-table'));
  assert.ok(I.furniture.some(e => e.room === 'dining' && e.kind === 'sideboard'));
  assert.equal(I.furniture.filter(e => e.room === 'dining' && e.kind === 'chair').length, 6);
});
test('the dining window spot is reachable down the side wall', () => {
  assert.equal(reachable(I, 0, I.entry.position, I.spots.diningWindow), true);
});
test('the way down the side wall to the window is 0.9 m wide', () => {
  assert.equal(reachable(furnishedWay(I, ['dining']), 0, doorwayPoint(I.openings.find(o => o.id === 'hall-dining')), [10.44, 11.2], .45), true);
});

// Study, passage and master bedroom rules and spots (synthetic cases start with those three rooms bare).
const withEastPieces = (extra, spots) => {
  const c = structuredClone(withoutRooms(I, ['study', 'passage', 'master']));
  c.furniture.push(...extra);
  if (spots) c.spots = {...c.spots, ...spots};
  c.obstacles = obstaclesOf(c);
  return c;
};
test('rule 8: a blocked passage fails', () => {
  const c = withEastPieces([{id: 'p-block', kind: 'chest', room: 'passage', at: [12.5, 5.9], turn: 0}]);
  const hp = doorwayPoint(I.openings.find(o => o.id === 'hall-passage'));
  const pm = doorwayPoint(I.openings.find(o => o.id === 'passage-master'));
  assert.equal(reachable(furnishedWay(c, ['passage']), 0, hp, pm), true, 'the 0.25 m walker still passes');
  assert.equal(reachable(furnishedWay(c, ['passage']), 0, hp, pm, .45), false, 'the 0.9 m walker is stopped');
  assert.equal(validInterior(c), false);
});
test('rule 8: a blocked way into the study fails', () => {
  const c = withEastPieces([{id: 's-block', kind: 'bookshelf', room: 'study', at: [12.6, 2.2], turn: Math.PI / 2}]);
  const hs = doorwayPoint(I.openings.find(o => o.id === 'hall-study'));
  assert.equal(reachable(furnishedWay(c, ['study']), 0, hs, c.spots.shelves), true, 'the 0.25 m walker still passes');
  assert.equal(reachable(furnishedWay(c, ['study']), 0, hs, c.spots.shelves, .45), false, 'the 0.9 m walker is stopped');
  assert.equal(validInterior(c), false);
  // With the study's spot moved to the door side so throughWays passes, the same blocker is otherwise valid (proving rule 8 alone failed it).
  const unblocked = withEastPieces([{id: 's-block', kind: 'bookshelf', room: 'study', at: [12.6, 2.2], turn: Math.PI / 2}], {shelves: [11.8, 2.0]});
  assert.equal(validInterior(unblocked), true);
});
test('rule 8: a blocked way into the master bedroom fails', () => {
  const blockers = [
    {id: 'm-block-1', kind: 'wardrobe', room: 'master', at: [12.2, 8.5], turn: 0},
    {id: 'm-block-2', kind: 'wardrobe', room: 'master', at: [13.2, 8.5], turn: 0},
    {id: 'm-block-3', kind: 'wardrobe', room: 'master', at: [13.8, 7.6], turn: Math.PI / 2},
  ];
  const c = withEastPieces(blockers);
  const pm = doorwayPoint(I.openings.find(o => o.id === 'passage-master'));
  assert.equal(reachable(furnishedWay(c, ['master']), 0, pm, c.spots.bedFoot), true, 'the 0.25 m walker still passes');
  assert.equal(reachable(furnishedWay(c, ['master']), 0, pm, c.spots.bedFoot, .45), false, 'the 0.9 m walker is stopped');
  assert.equal(validInterior(c), false);
  const unblocked = withEastPieces(blockers, {bedFoot: [12.5, 7.7]});
  assert.equal(validInterior(unblocked), true);
});
test('a piece on any new named spot or speed spot makes the blueprint invalid', () => {
  for (const [k, room] of [['desk', 'study'], ['shelves', 'study'], ['wardrobes', 'passage'], ['bedFoot', 'master'], ['bedside', 'master']]) {
    assert.equal(validInterior(withEastPieces([{id: `on-${k}`, kind: 'chest', room, at: [...I.spots[k]]}])), false, k);
  }
  assert.equal(validInterior(withEastPieces([{id: 'on-speed3', kind: 'chest', room: 'study', at: [...I.spots.speed[3]]}])), false);
  assert.equal(validInterior(withEastPieces([{id: 'on-speed4', kind: 'chest', room: 'master', at: [...I.spots.speed[4]]}])), false);
});
test('the real blueprint with the study furnished is valid and queues the study third', () => {
  assert.equal(validInterior(I), true);
  assert.equal(I.furnishLater[2], 'study');
  const ids = new Set(I.furniture.filter(e => e.room === 'study').map(e => e.id));
  for (const id of ['study-rug', 'desk', 'chair-desk', 'bookshelf-study-1', 'bookshelf-study-2', 'armchair-study',
    'side-table-study', 'picture-study', 'desk-lamp', 'book-desk-1', 'book-desk-2', 'cup-desk', 'book-study-table']) {
    assert.ok(ids.has(id), `study has ${id}`);
  }
});
test('nothing taller than the sill stands before the study window', () => {
  const win = I.windows.find(w => w.id === 'study');
  const box = {a: [win.a - win.width / 2, win.a + win.width / 2], d: [0, .6]};
  const meets = (x, y) => x.a[0] < y.a[1] && y.a[0] < x.a[1] && x.d[0] < y.d[1] && y.d[0] < x.d[1];
  for (const e of I.furniture) {
    if (e.room !== 'study' || KINDS[e.kind].standing !== 'solid') continue;
    const f = footprint(e);
    if (meets(f, box)) assert.ok(KINDS[e.kind].height <= win.sill + 1e-9, `${e.id} height ${KINDS[e.kind].height} exceeds sill ${win.sill}`);
  }
});
test('the real blueprint with the passage and master bedroom furnished is valid and queues rooms in order', () => {
  assert.equal(validInterior(I), true);
  assert.deepEqual(I.furnishLater.slice(0, 5), ['kitchen', 'dining', 'study', 'passage', 'master']);
  const ids = new Set(I.furniture.map(e => e.id));
  for (const id of [
    'wardrobe-passage-1', 'wardrobe-passage-2', 'passage-runner',
    'master-rug', 'bed', 'bedside-1', 'bedside-2', 'blanket-chest',
    'wardrobe-master-1', 'wardrobe-master-2', 'picture-master-1', 'picture-master-2',
    'bedside-lamp-1', 'bedside-lamp-2', 'pillow-1', 'pillow-2', 'bed-blanket', 'book-bedside',
  ]) assert.ok(ids.has(id), `blueprint has ${id}`);
});
test('the passage\'s wall lamp stands between its wardrobes', () => {
  const lamp = I.fittings.find(f => f.room === 'passage');
  const w1 = footprint(I.furniture.find(e => e.id === 'wardrobe-passage-1'));
  const w2 = footprint(I.furniture.find(e => e.id === 'wardrobe-passage-2'));
  assert.ok(w1 && w2 && lamp);
  const left = w1.a[1] < w2.a[0] ? w1 : w2, right = left === w1 ? w2 : w1;
  assert.ok(lamp.at[0] > left.a[1] + .1 && lamp.at[0] < right.a[0] - .1, `lamp a=${lamp.at[0]} between ${left.a[1]} and ${right.a[0]}`);
  for (const w of [w1, w2]) {
    const inside = lamp.at[0] >= w.a[0] && lamp.at[0] <= w.a[1] && lamp.at[1] >= w.d[0] && lamp.at[1] <= w.d[1];
    assert.equal(inside, false, 'wardrobe does not hold the lamp point');
  }
});

// Ground-floor bathroom, laundry and pantry rules and spots (synthetic cases start with those three rooms bare).
const withWetPieces = (extra, spots) => {
  const c = structuredClone(withoutRooms(I, ['bath-ground', 'laundry', 'pantry']));
  c.furniture.push(...extra);
  if (spots) c.spots = {...c.spots, ...spots};
  c.obstacles = obstaclesOf(c);
  return c;
};
test('rule 8: a 2.0 × 0.5 block across the way into bath-ground, laundry or pantry fails; against a far wall it passes', () => {
  // bath-ground: block across the way in fails, against the d = 7 wall passes
  assert.equal(validInterior(withWetPieces([{id: 'b-block', kind: 'pantry-shelf', room: 'bath-ground', at: [15.35, 5.3], turn: Math.PI / 2, size: [2.0, .5]}], {bath: [16.8, 5.5]})), false);
  assert.equal(validInterior(withWetPieces([{id: 'b-far', kind: 'pantry-shelf', room: 'bath-ground', at: [16.5, 6.675], turn: 0, size: [2.0, .5]}])), true);
  // laundry: block across the way in fails, against the d = 7 wall passes
  assert.equal(validInterior(withWetPieces([{id: 'l-block', kind: 'pantry-shelf', room: 'laundry', at: [1.5, 8.25], turn: Math.PI / 2, size: [2.0, .5]}])), false);
  assert.equal(validInterior(withWetPieces([{id: 'l-far', kind: 'pantry-shelf', room: 'laundry', at: [1.25, 7.325], turn: 0, size: [2.0, .5]}])), true);
  // pantry: block across the way in fails, against the d = 9.5 wall passes
  assert.equal(validInterior(withWetPieces([{id: 'p-block', kind: 'pantry-shelf', room: 'pantry', at: [1.5, 10.75], turn: Math.PI / 2, size: [2.0, .5]}])), false);
  assert.equal(validInterior(withWetPieces([{id: 'p-far', kind: 'pantry-shelf', room: 'pantry', at: [1.25, 9.825], turn: 0, size: [2.0, .5]}])), true);
});
test('a solid piece over bath, laundry, pantry or speed[5] makes the blueprint invalid', () => {
  for (const [k, room] of [['bath', 'bath-ground'], ['laundry', 'laundry'], ['pantry', 'pantry']]) {
    assert.equal(validInterior(withWetPieces([{id: `on-${k}`, kind: 'basket', room, at: [...I.spots[k]]}])), false, k);
  }
  assert.equal(validInterior(withWetPieces([{id: 'on-speed5', kind: 'basket', room: 'bath-ground', at: [...I.spots.speed[5]]}])), false);
});
test('rule 6 accepts towel set on towel-rail, bathtub and basket', () => {
  assert.equal(validInterior(withWetPieces([
    {id: 'tr-test', kind: 'towel-rail', room: 'bath-ground', wall: 'a', line: 18, along: [5.3, 6.1], z: 1.2},
    {id: 'bt-test', kind: 'bathtub', room: 'bath-ground', at: [16.3, 6.55], turn: 0},
    {id: 'bk-test', kind: 'basket', room: 'laundry', at: [.3, 9.2], turn: 0},
    {id: 'tw-1', kind: 'towel', room: 'bath-ground', on: 'tr-test'},
    {id: 'tw-2', kind: 'towel', room: 'bath-ground', on: 'bt-test'},
    {id: 'tw-3', kind: 'towel', room: 'laundry', on: 'bk-test'},
  ])), true);
});
test('the real blueprint with the ground-floor bathroom furnished is valid, queues bath-ground after master, and keeps the lamp point clear', () => {
  assert.equal(validInterior(I), true);
  assert.deepEqual(I.furnishLater.slice(0, 6), ['kitchen', 'dining', 'study', 'passage', 'master', 'bath-ground']);
  const ids = new Set(I.furniture.filter(e => e.room === 'bath-ground').map(e => e.id));
  for (const id of ['basin', 'toilet', 'shower', 'bathtub', 'bath-mat', 'mirror-bath', 'towel-rail', 'towel-rail-1', 'towel-tub', 'jug-basin']) {
    assert.ok(ids.has(id), `bath-ground has ${id}`);
  }
  const lamp = I.fittings.find(f => f.room === 'bath-ground');
  for (const e of I.furniture) {
    if (e.room !== 'bath-ground' || KINDS[e.kind].standing !== 'solid') continue;
    const f = footprint(e);
    const inside = lamp.at[0] >= f.a[0] && lamp.at[0] <= f.a[1] && lamp.at[1] >= f.d[0] && lamp.at[1] <= f.d[1];
    assert.equal(inside, false, `${e.id} does not hold the bathroom lamp point`);
  }
});
test('the real blueprint with the laundry and pantry furnished is valid, queues all eight later rooms in order, and keeps both lamp points clear', () => {
  assert.equal(validInterior(I), true);
  assert.deepEqual(I.furnishLater, ['kitchen', 'dining', 'study', 'passage', 'master', 'bath-ground', 'laundry', 'pantry']);
  const ids = new Set(I.furniture.map(e => e.id));
  for (const id of [
    'wash-tub', 'drying-rack', 'basket-1', 'basket-2', 'cloth-rack-1', 'cloth-rack-2', 'cloth-rack-3', 'linen-basket',
    'pantry-shelf-1', 'pantry-shelf-2', 'sacks', 'crates',
  ]) assert.ok(ids.has(id), `blueprint has ${id}`);
  for (const room of ['laundry', 'pantry']) {
    const lamp = I.fittings.find(f => f.room === room);
    for (const e of I.furniture) {
      if (e.room !== room || KINDS[e.kind].standing !== 'solid') continue;
      const f = footprint(e);
      const inside = lamp.at[0] >= f.a[0] && lamp.at[0] <= f.a[1] && lamp.at[1] >= f.d[0] && lamp.at[1] <= f.d[1];
      assert.equal(inside, false, `${e.id} does not hold the ${room} lamp point`);
    }
  }
});

// ── Part 4e: ceiling-slope rule (Rule 10), floor-1 walks, upperSpots and SLICE_4E ──
const withUpperPieces = (extra, upperSpots) => {
  const c = structuredClone(withoutRooms(I, SLICE_4E));
  c.furniture.push(...extra);
  if (upperSpots) c.upperSpots = {...c.upperSpots, ...upperSpots};
  c.obstacles = obstaclesOf(c);
  return c;
};
test('stairTop is standable at 0.25 m and 0.45 m, and upperSpots / SLICE_4E / furnishUpper are valid', () => {
  assert.equal(validInterior(I), true);
  assert.ok(floorArea(I, 1, stairTop(I), I.eyeClear));
  assert.ok(floorArea(I, 1, stairTop(I), .45));
  assert.equal(SLICE_4E, I.furnishUpper);
  assert.deepEqual(new Set(SLICE_4E), new Set(['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room']));
  assert.equal(I.upperSpots.speed.length, 2);
  assert.equal(roomAt(I, 1, I.upperSpots.speed[0])?.id, 'landing');
  assert.equal(roomAt(I, 1, I.upperSpots.speed[1])?.id, 'sky-room');
  for (const [k, p] of Object.entries(I.upperSpots)) {
    if (k === 'speed') continue;
    assert.ok(Array.isArray(p) && floorArea(I, 1, p), `upperSpots.${k}`);
  }
  assert.equal(upperThroughWays(I).length, 5);
});
test('rule 10: ceiling clearance rejects tall solids, badly placed or ridge-straddling sloped shelves, flat-floor sloped pieces, tall set-on pieces, and high wall-hung pieces', () => {
  // Regular bookshelf (h 2.1 m) against d = 0 eave (ceiling 1.92..2.02 m) fails; eave-bookshelf (1.88 m) passes.
  assert.equal(validInterior(withUpperPieces([{id: 'too-tall', kind: 'bookshelf', room: 'bedroom-2', at: [3.5, .25], turn: Math.PI}])), false);
  assert.equal(validInterior(withUpperPieces([{id: 'eave-ok', kind: 'eave-bookshelf', room: 'nook', at: [9.0, 11.75], turn: 0}])), true);
  // Set-on piece poking through the eave ceiling: table-lamp (0.45) on eave-bookshelf (1.88) reaches 2.33 > 1.92 m and fails.
  assert.equal(validInterior(withUpperPieces([
    {id: 'eave-ok', kind: 'eave-bookshelf', room: 'nook', at: [9.0, 11.75], turn: 0},
    {id: 'lamp-too-high', kind: 'table-lamp', room: 'nook', on: 'eave-ok'},
  ])), false);
  // Sloped bookshelf along a = 7 over d 10.1..11.55 (maxC 2.438 >= 2.40, minC 2.028 >= 1.5) passes; placed along d = 11.75 (maxC 2.00 < 2.40) fails.
  assert.equal(validInterior(withUpperPieces([{id: 'sloped-ok', kind: 'sloped-bookshelf', room: 'nook', at: [7.25, 10.825], turn: Math.PI / 2}])), true);
  assert.equal(validInterior(withUpperPieces([{id: 'sloped-low', kind: 'sloped-bookshelf', room: 'nook', at: [9.0, 11.75], turn: 0}])), false);
  // Sloped bookshelf straddling I.ridgeAt (d = 6.0) fails even where ceiling > 2.40 m across its span.
  assert.equal(validInterior(withUpperPieces([{id: 'sloped-ridge', kind: 'sloped-bookshelf', room: 'bedroom-2', at: [.25, 6.0], turn: Math.PI / 2}])), false);
  // Sloped bookshelf on flat floor 0 fails, while a plain eave-bookshelf at the exact same spot passes.
  const groundOk = structuredClone(withoutRooms(I, ['study']));
  groundOk.furniture.push({id: 'study-flat-ok', kind: 'eave-bookshelf', room: 'study', at: [17.7, 2.0], turn: Math.PI / 2, size: [1.45, .35]});
  groundOk.obstacles = obstaclesOf(groundOk);
  assert.equal(validInterior(groundOk), true);
  const groundSloped = structuredClone(withoutRooms(I, ['study']));
  groundSloped.furniture.push({id: 'study-sloped-bad', kind: 'sloped-bookshelf', room: 'study', at: [17.7, 2.0], turn: Math.PI / 2});
  groundSloped.obstacles = obstaclesOf(groundSloped);
  assert.equal(validInterior(groundSloped), false);
  // Wall-hung picture (h 0.6) on d = 0 (ceiling 1.9 m): z = 1.7 (top 2.0) fails, z = 1.5 (top 1.8) passes.
  assert.equal(validInterior(withUpperPieces([{id: 'pic-high', kind: 'picture', room: 'bedroom-2', wall: 'd', line: 0, along: [1.5, 2.3], z: 1.7}])), false);
  assert.equal(validInterior(withUpperPieces([{id: 'pic-ok', kind: 'picture', room: 'bedroom-2', wall: 'd', line: 0, along: [1.5, 2.3], z: 1.5}])), true);
});
test('rule 7 & 8 on floor 1: covering an upper spot or blocking any upper room way fails', () => {
  for (const [k, room] of [['landingSeat', 'landing'], ['bed2', 'bedroom-2'], ['bed3', 'bedroom-3'], ['skyWindow', 'sky-room'], ['nookChair', 'nook']]) {
    assert.equal(validInterior(withUpperPieces([{id: `on-${k}`, kind: 'floor-cushion', room, at: [...I.upperSpots[k]]}])), false, k);
  }
  assert.equal(validInterior(withUpperPieces([{id: 'on-us0', kind: 'floor-cushion', room: 'landing', at: [...I.upperSpots.speed[0]]}])), false);
  assert.equal(validInterior(withUpperPieces([{id: 'on-us1', kind: 'floor-cushion', room: 'sky-room', at: [...I.upperSpots.speed[1]]}])), false);
  // Blocking nook between landing opening (d=7) and sky-room/bath doors (d=9.5) fails Rule 8.
  assert.equal(validInterior(withUpperPieces([{id: 'nook-bar', kind: 'chest-of-drawers', room: 'nook', at: [9.0, 8.2], turn: 0, size: [3.6, .5]}])), false);
  // Blocking bedroom-3 between landing door (a=11, d=6.2) and box-room door (d=7, a=16.5) fails Rule 8.
  assert.equal(validInterior(withUpperPieces([{id: 'bed3-bar', kind: 'chest-of-drawers', room: 'bedroom-3', at: [14.0, 3.5], turn: Math.PI / 2, size: [6.4, .5]}])), false);
});
test('the landing and sky room pieces are valid, keep the landing lamp clear, and leave existing upstairs check poses standable', () => {
  assert.equal(validInterior(I), true);
  const ids = new Set(I.furniture.map(e => e.id));
  for (const id of ['landing-seat', 'landing-runner', 'picture-landing', 'cushion-landing-1', 'cushion-landing-2',
    'sky-rug', 'daybed', 'floor-cushion-1', 'floor-cushion-2', 'telescope', 'cushion-daybed-1', 'cushion-daybed-2', 'throw-daybed']) {
    assert.ok(ids.has(id), `blueprint has ${id}`);
  }
  const lamp = I.fittings.find(f => f.room === 'landing');
  const seat = footprint(I.furniture.find(e => e.id === 'landing-seat'));
  assert.equal(lamp.at[0] >= seat.a[0] && lamp.at[0] <= seat.a[1] && lamp.at[1] >= seat.d[0] && lamp.at[1] <= seat.d[1], false);
  for (const p of [[8, 1], [6.4, 7.6], [3, 9], [3.5, 7.6]]) assert.ok(floorArea(I, 1, p), `existing check pose ${p}`);
});
test('bedrooms 2 and 3 pieces are valid and leave existing bedroom check poses standable', () => {
  assert.equal(validInterior(I), true);
  const ids = new Set(I.furniture.map(e => e.id));
  for (const id of ['bed2-rug', 'bed-2', 'bed2-side-table', 'bed2-chest', 'bed2-chair', 'mirror-bed2', 'picture-bed2',
    'bed2-lamp', 'pillow-bed2', 'blanket-bed2', 'book-bed2', 'jug-bed2',
    'bed3-rug', 'bed-3', 'bed3-side-table', 'bed3-desk', 'bed3-chair', 'picture-bed3',
    'bed3-lamp', 'pillow-bed3', 'blanket-bed3', 'cup-bed3', 'book-bed3-1', 'book-bed3-2']) {
    assert.ok(ids.has(id), `blueprint has ${id}`);
  }
  for (const p of [[3.5, 5], [14.5, 5], [14.5, 6.6]]) assert.ok(floorArea(I, 1, p), `existing bedroom pose ${p}`);
});
test('the library nook pieces are valid and furnishUpper queues all five part 4e rooms in order', () => {
  assert.equal(validInterior(I), true);
  assert.deepEqual(I.furnishUpper, ['landing', 'nook', 'bedroom-2', 'bedroom-3', 'sky-room']);
  assert.deepEqual(new Set(I.furnishUpper), new Set(SLICE_4E));
  const ids = new Set(I.furniture.map(e => e.id));
  for (const id of ['nook-rug', 'nook-eave-shelves', 'nook-shelves-west', 'nook-shelves-east', 'nook-chair', 'nook-lamp']) {
    assert.ok(ids.has(id), `blueprint has ${id}`);
  }
});
