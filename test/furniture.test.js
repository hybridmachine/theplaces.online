import test from 'node:test';
import assert from 'node:assert/strict';
import {KINDS, footprint, corners, solidObstacles, obstaclesOf, bareInterior, withoutPieces, piecesIn, withoutRooms} from '../shared/furniture.js';

const r2 = n => Math.round(n * 100) / 100;
const round = f => f && {a: f.a.map(r2), d: f.d.map(r2)};
const near = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `${x} vs ${y}`);
const interior = {
  rooms: [{id: 'living', floor: 0, a: [0, 9], d: [0, 6]}, {id: 'master', floor: 1, a: [0, 9], d: [0, 6]}],
  breasts: [{floor: 0, a: [0, .5], d: [2.5, 4.5]}],
  furniture: [],
};

test('a square-on piece keeps its size; a quarter turn swaps it', () => {
  const sofa = {id: 's', kind: 'sofa', room: 'living', at: [5, 3.5], turn: 0};
  assert.deepEqual(round(footprint(sofa)), {a: [3.9, 6.1], d: [3.05, 3.95]});
  assert.deepEqual(round(footprint({...sofa, turn: Math.PI / 2})), {a: [4.55, 5.45], d: [2.4, 4.6]});
});
test('a turned piece gives the square-on rectangle that bounds it', () => {
  const f = footprint({id: 'c', kind: 'armchair', room: 'living', at: [2, 2], turn: Math.PI / 4}), w = .85 * Math.SQRT2;
  near(f.a[1] - f.a[0], w); near(f.d[1] - f.d[0], w); near((f.a[0] + f.a[1]) / 2, 2);
});
test('corners are the turned rectangle, anticlockwise seen from above', () => {
  const c = corners({id: 's', kind: 'sofa', room: 'living', at: [5, 3.5], turn: Math.PI / 2});
  assert.equal(c.length, 4);
  const xs = c.map(p => p[0]), ds = c.map(p => p[1]);
  near(Math.min(...xs), 4.55); near(Math.max(...xs), 5.45); near(Math.min(...ds), 2.4); near(Math.max(...ds), 4.6);
  assert.equal(corners({id: 'p', kind: 'picture'}), null);
});
test('only solid kinds become obstacles, on their room\'s floor', () => {
  const at = [3, 3], furn = [
    {id: 'rug1', kind: 'rug', room: 'living', at, size: [2, 3]},
    {id: 'pic', kind: 'picture', room: 'living', wall: 'a', line: 0, along: [1, 2], z: 1.5},
    {id: 'tl', kind: 'table-lamp', room: 'living', on: 'sofa1'},
    {id: 'odd', kind: 'no-such-kind', room: 'living', at},
    {id: 'lost', kind: 'sofa', room: 'nowhere', at},
    {id: 'sofa1', kind: 'sofa', room: 'living', at},
    {id: 'bed', kind: 'sofa', room: 'master', at},
  ];
  const out = solidObstacles({...interior, furniture: furn});
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'sofa1'); assert.equal(out[0].floor, 0);
  assert.deepEqual(round(out[0]).a, [1.9, 4.1]);
  assert.equal(out[1].id, 'bed'); assert.equal(out[1].floor, 1);
  assert.deepEqual(Object.keys(out[0]).sort(), ['a', 'd', 'floor', 'id']);
});
test('obstaclesOf is the breasts followed by the furniture', () => {
  const i = {...interior, furniture: [{id: 's', kind: 'sofa', room: 'living', at: [4, 4]}]};
  const o = obstaclesOf(i);
  assert.equal(o.length, 2); assert.deepEqual(o[0], i.breasts[0]); assert.equal(o[1].id, 's');
});
test('an entry\'s own size overrides the kind\'s', () => {
  const e = {id: 'x', kind: 'sofa', room: 'living', at: [5, 5], size: [1, 2]};
  assert.deepEqual(round(footprint(e)), {a: [4.5, 5.5], d: [4, 6]});
  assert.deepEqual(round(footprint({id: 'r', kind: 'rug', room: 'living', at: [5, 5], size: [4, 2]})), {a: [3, 7], d: [4, 6]});
});
test('bareInterior keeps the breasts and drops the furniture', () => {
  const i = {...interior, furniture: [{id: 's', kind: 'sofa', room: 'living', at: [4, 4]}]};
  const b = bareInterior(i);
  assert.deepEqual(b.obstacles, i.breasts);
  assert.equal(b.furniture.length, 0);
  assert.deepEqual(b.rooms, i.rooms);
  assert.ok(Object.isFrozen(b));
  assert.equal(i.furniture.length, 1);
});
test('bareInterior keeps a pre-furniture blueprint\'s own obstacles: its breasts stored there, with no breasts field', () => {
  const {breasts, furniture, ...old} = interior, legacy = {...old, obstacles: breasts};
  const b = bareInterior(legacy);
  assert.deepEqual(b.obstacles, breasts);
  assert.ok(Object.isFrozen(b));
});
test('withoutPieces drops the pieces named and everything set on them, and re-derives the obstacles', () => {
  const i = {...interior, furniture: [{id: 's', kind: 'sofa', room: 'living', at: [4, 4]}, {id: 't', kind: 'side-table', room: 'living', at: [7, 1]},
    {id: 'c', kind: 'cushion', room: 'living', on: 's'}, {id: 'l', kind: 'table-lamp', room: 'living', on: 't'}, {id: 'x', kind: 'cup', room: 'living', on: 'c'}]};
  i.obstacles = obstaclesOf(i);
  const w = withoutPieces(i, ['s']);
  assert.deepEqual(w.furniture.map(e => e.id), ['t', 'l']);
  assert.deepEqual(w.obstacles.map(o => o.id), [undefined, 't']);
  assert.deepEqual(w.obstacles, obstaclesOf(w));
  assert.ok(Object.isFrozen(w)); assert.equal(i.furniture.length, 5, 'the blueprint itself is untouched');
  assert.deepEqual(withoutPieces(i, []).obstacles, i.obstacles);
});
test('footprint of an unknown kind is null and nothing throws', () => {
  assert.equal(footprint({id: 'q', kind: 'nope', room: 'living', at: [1, 1]}), null);
  assert.equal(footprint({id: 'q', kind: 'hooks', room: 'living'}), null);
  assert.equal(footprint({id: 'q', kind: 'book', room: 'living', on: 'mantel'}), null);
  assert.deepEqual(solidObstacles({rooms: [], breasts: []}), []);
  assert.ok(KINDS.sofa.standing === 'solid');
});

test('the kitchen and dining kinds have the right standings, heights and footprints', () => {
  for (const [k, size, h] of [
    ['sink-unit', [1.3, .6], .9], ['range', [1.0, .6], .9], ['worktop', [1.6, .6], .9], ['dresser', [1.2, .45], 2.0],
    ['kitchen-table', [1.5, .8], .75], ['dining-table', [1.8, .9], .75], ['chair', [.45, .45], .9], ['sideboard', [1.6, .45], .85],
  ]) {
    assert.equal(KINDS[k].standing, 'solid', k);
    assert.deepEqual(KINDS[k].size, size, k);
    assert.equal(KINDS[k].height, h, k);
  }
  assert.equal(KINDS.chair.seat, .45);
  assert.equal(KINDS['pan-rail'].standing, 'wall-hung'); assert.equal(KINDS['pan-rail'].height, .05);
  for (const [k, h] of [['pan', .3], ['kettle', .22], ['cloth', .05], ['jar', .18], ['breadboard', .03], ['loaf', .1], ['bowl', .1], ['plates', .12], ['cup', .09]]) {
    assert.equal(KINDS[k].standing, 'set-on', k);
    assert.equal(KINDS[k].height, h, k);
  }
  const ch = footprint({id: 'c', kind: 'chair', room: 'living', at: [4, 4], turn: Math.PI / 2});
  near(ch.a[1] - ch.a[0], .45); near(ch.d[1] - ch.d[0], .45);
  const dt = footprint({id: 'd', kind: 'dining-table', room: 'living', at: [4, 4], turn: Math.PI / 2});
  near(dt.a[1] - dt.a[0], .9); near(dt.d[1] - dt.d[0], 1.8);
});
test('piecesIn lists ids of pieces in the named rooms', () => {
  const i = {furniture: [
    {id: 'a', kind: 'sofa', room: 'living', at: [3, 3]},
    {id: 'b', kind: 'chair', room: 'kitchen', at: [4, 8]},
    {id: 'c', kind: 'chair', room: 'dining', at: [9, 8]},
  ]};
  assert.deepEqual(piecesIn(i, ['kitchen', 'dining']), ['b', 'c']);
  assert.deepEqual(piecesIn(i, ['hall']), []);
});
test('withoutRooms drops those rooms\' pieces and what is set on them, re-derives obstacles and empties furnishLater', () => {
  const i = {
    rooms: [{id: 'living', floor: 0, a: [0, 7], d: [0, 7]}, {id: 'kitchen', floor: 0, a: [2.5, 7], d: [7, 12]}, {id: 'dining', floor: 0, a: [7, 11], d: [7, 12]}],
    breasts: [{floor: 0, a: [0, .5], d: [2.5, 4.5]}],
    furnishLater: ['kitchen', 'dining'],
    furniture: [
      {id: 's', kind: 'sofa', room: 'living', at: [4, 4]},
      {id: 'kt', kind: 'kitchen-table', room: 'kitchen', at: [4.75, 9.5]},
      {id: 'b', kind: 'bowl', room: 'kitchen', on: 'kt'},
      {id: 'dt', kind: 'dining-table', room: 'dining', at: [9, 9.5]},
    ],
  };
  i.obstacles = obstaclesOf(i);
  const w = withoutRooms(i, ['kitchen', 'dining']);
  assert.deepEqual(w.furniture.map(e => e.id), ['s']);
  assert.deepEqual(w.obstacles, obstaclesOf(w));
  assert.deepEqual(w.furnishLater, []);
  assert.ok(Object.isFrozen(w)); assert.ok(Object.isFrozen(w.furnishLater));
});

test('the study, passage and master kinds have the right standings, heights and footprints', () => {
  for (const [k, size, h] of [
    ['desk', [1.5, .7], .75], ['wardrobe', [1.0, .6], 2.0], ['double-bed', [1.6, 2.05], 1.1], ['chest', [1.2, .45], .5],
  ]) {
    assert.equal(KINDS[k].standing, 'solid', k);
    assert.deepEqual(KINDS[k].size, size, k);
    assert.equal(KINDS[k].height, h, k);
  }
  for (const [k, h] of [['pillow', .14], ['blanket', .1]]) {
    assert.equal(KINDS[k].standing, 'set-on', k);
    assert.equal(KINDS[k].height, h, k);
  }
  const b = footprint({id: 'b', kind: 'double-bed', room: 'master', at: [14.5, 10.9], turn: 0});
  near(b.a[1] - b.a[0], 1.6); near(b.d[1] - b.d[0], 2.05);
});
test('a piece set on the bed sits at its mattress, not its headboard', () => {
  assert.equal(KINDS['double-bed'].seat, .55);
});
test('withoutRooms with keepQueue keeps the other rooms queued', () => {
  const i = {
    rooms: [{id: 'living', floor: 0, a: [0, 7], d: [0, 7]}, {id: 'kitchen', floor: 0, a: [2.5, 7], d: [7, 12]}, {id: 'dining', floor: 0, a: [7, 11], d: [7, 12]}, {id: 'study', floor: 0, a: [11, 18], d: [0, 4]}],
    breasts: [{floor: 0, a: [0, .5], d: [2.5, 4.5]}],
    furnishLater: ['kitchen', 'dining', 'study'],
    furniture: [
      {id: 's', kind: 'sofa', room: 'living', at: [4, 4]},
      {id: 'kt', kind: 'kitchen-table', room: 'kitchen', at: [4.75, 9.5]},
      {id: 'dk', kind: 'desk', room: 'study', at: [13.8, .45]},
    ],
  };
  i.obstacles = obstaclesOf(i);
  const kept = withoutRooms(i, ['study'], {keepQueue: true});
  assert.deepEqual(kept.furniture.map(e => e.id), ['s', 'kt']);
  assert.deepEqual(kept.furnishLater, ['kitchen', 'dining']);
  assert.ok(Object.isFrozen(kept) && Object.isFrozen(kept.furnishLater));
  const emptied = withoutRooms(i, ['study']);
  assert.deepEqual(emptied.furnishLater, []);
});

test('the bathroom, laundry and pantry kinds have the right standings, heights and footprints', () => {
  for (const [k, size, h] of [
    ['basin', [.6, .45], .85], ['toilet', [.45, .7], .8], ['shower', [.9, .9], 2.0], ['bathtub', [1.7, .75], .6],
    ['wash-tub', [.9, .6], .85], ['drying-rack', [1.0, .45], 1.2], ['basket', [.45, .45], .4],
    ['pantry-shelf', [2.0, .35], 2.0], ['sack', [.5, .45], .6], ['crate', [.5, .45], .6],
  ]) {
    assert.equal(KINDS[k].standing, 'solid', k);
    assert.deepEqual(KINDS[k].size, size, k);
    assert.equal(KINDS[k].height, h, k);
    const f0 = footprint({id: k, kind: k, room: 'living', at: [4, 4], turn: 0});
    const f90 = footprint({id: k, kind: k, room: 'living', at: [4, 4], turn: Math.PI / 2});
    near(f0.a[1] - f0.a[0], size[0]); near(f0.d[1] - f0.d[0], size[1]);
    near(f90.a[1] - f90.a[0], size[1]); near(f90.d[1] - f90.d[0], size[0]);
  }
  assert.equal(KINDS['bath-mat'].standing, 'walk-over'); assert.equal(KINDS['bath-mat'].height, .015);
  const bm0 = footprint({id: 'bm', kind: 'bath-mat', room: 'living', at: [4, 4], turn: 0, size: [.9, .55]});
  const bm90 = footprint({id: 'bm', kind: 'bath-mat', room: 'living', at: [4, 4], turn: Math.PI / 2, size: [.9, .55]});
  near(bm0.a[1] - bm0.a[0], .9); near(bm0.d[1] - bm0.d[0], .55);
  near(bm90.a[1] - bm90.a[0], .55); near(bm90.d[1] - bm90.d[0], .9);
  assert.equal(KINDS['towel-rail'].standing, 'wall-hung'); assert.equal(KINDS['towel-rail'].height, .05);
  assert.equal(footprint({id: 'tr', kind: 'towel-rail', room: 'living'}), null);
  assert.equal(KINDS.towel.standing, 'set-on'); assert.equal(KINDS.towel.height, .6);
  assert.equal(footprint({id: 'tw', kind: 'towel', room: 'living', on: 'tr'}), null);
});

test('withoutRooms filters furnishUpper alongside furnishLater', () => {
  const i = {
    rooms: [{id: 'living', floor: 0, a: [0, 7], d: [0, 7]}, {id: 'kitchen', floor: 0, a: [2.5, 7], d: [7, 12]},
      {id: 'landing', floor: 1, a: [7, 11], d: [0, 7]}, {id: 'nook', floor: 1, a: [7, 11], d: [7, 12]}],
    breasts: [],
    furniture: [
      {id: 's', kind: 'sofa', room: 'living', at: [4, 4]},
      {id: 'kt', kind: 'kitchen-table', room: 'kitchen', at: [4.75, 9.5]},
      {id: 'ls', kind: 'window-seat', room: 'landing', at: [9.8, .315]},
      {id: 'nc', kind: 'armchair', room: 'nook', at: [8.45, 10.7]},
    ],
    furnishLater: ['kitchen'],
    furnishUpper: ['landing', 'nook'],
  };
  i.obstacles = obstaclesOf(i);
  const kept = withoutRooms(i, ['nook'], {keepQueue: true});
  assert.deepEqual(kept.furniture.map(e => e.id), ['s', 'kt', 'ls']);
  assert.deepEqual(kept.furnishLater, ['kitchen']);
  assert.deepEqual(kept.furnishUpper, ['landing']);
  assert.ok(Object.isFrozen(kept.furnishUpper));
  const emptied = withoutRooms(i, ['nook']);
  assert.deepEqual(emptied.furnishLater, []);
  assert.deepEqual(emptied.furnishUpper, []);
});

test('the part 4e upstairs kinds have the right standings, sizes, heights, extras and footprints', () => {
  for (const [k, size, h, extra] of [
    ['single-bed', [1.05, 2.0], 1.0, {seat: .55}],
    ['chest-of-drawers', [1.0, .5], .9, {}],
    ['small-desk', [1.2, .6], .75, {}],
    ['daybed', [2.0, .9], .75, {seat: .45}],
    ['floor-cushion', [.55, .55], .16, {}],
    ['telescope', [.65, .65], 1.45, {}],
    ['eave-bookshelf', [3.0, .35], 1.88, {}],
    ['sloped-bookshelf', [1.45, .35], 2.40, {sloped: true, minHeight: 1.5}],
  ]) {
    assert.equal(KINDS[k].standing, 'solid', k);
    assert.deepEqual(KINDS[k].size, size, k);
    assert.equal(KINDS[k].height, h, k);
    for (const [ek, ev] of Object.entries(extra)) assert.equal(KINDS[k][ek], ev, `${k}.${ek}`);
    const f0 = footprint({id: k, kind: k, room: 'landing', at: [8.5, 3], turn: 0});
    const f90 = footprint({id: k, kind: k, room: 'landing', at: [8.5, 3], turn: Math.PI / 2});
    near(f0.a[1] - f0.a[0], size[0]); near(f0.d[1] - f0.d[0], size[1]);
    near(f90.a[1] - f90.a[0], size[1]); near(f90.d[1] - f90.d[0], size[0]);
  }
});

test('the part 4f upstairs kinds have the right standings, sizes, heights and footprints', () => {
  for (const [k, size, h] of [
    ['trunk', [.9, .5], .5],
    ['linen-press', [1.6, .45], 2.0],
    ['linen-shelf', [2.0, .35], 1.85],
  ]) {
    assert.equal(KINDS[k].standing, 'solid', k);
    assert.deepEqual(KINDS[k].size, size, k);
    assert.equal(KINDS[k].height, h, k);
    const f0 = footprint({id: k, kind: k, room: 'linen', at: [16.5, 10.7], turn: 0});
    const f90 = footprint({id: k, kind: k, room: 'linen', at: [16.5, 10.7], turn: Math.PI / 2});
    near(f0.a[1] - f0.a[0], size[0]); near(f0.d[1] - f0.d[0], size[1]);
    near(f90.a[1] - f90.a[0], size[1]); near(f90.d[1] - f90.d[0], size[0]);
  }
});
