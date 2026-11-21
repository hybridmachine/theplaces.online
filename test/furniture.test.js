import test from 'node:test';
import assert from 'node:assert/strict';
import {KINDS, footprint, corners, solidObstacles, obstaclesOf, bareInterior} from '../shared/furniture.js';

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
test('footprint of an unknown kind is null and nothing throws', () => {
  assert.equal(footprint({id: 'q', kind: 'nope', room: 'living', at: [1, 1]}), null);
  assert.equal(footprint({id: 'q', kind: 'hooks', room: 'living'}), null);
  assert.equal(footprint({id: 'q', kind: 'book', room: 'living', on: 'mantel'}), null);
  assert.deepEqual(solidObstacles({rooms: [], breasts: []}), []);
  assert.ok(KINDS.sofa.standing === 'solid');
});
