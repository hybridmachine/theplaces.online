import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {SIGHT, seenFrom} from '../shared/sight.js';

const S = seenFrom(I), sees = (a, b) => S[a].includes(b);

test('SIGHT exports the sampling constants', () => {
  assert.deepEqual(SIGHT, {grid: .5, widen: .1});
  assert.ok(Object.isFrozen(SIGHT));
});

test('every room sees itself, and the table covers every room', () => {
  for (const r of I.rooms) assert.ok(sees(r.id, r.id));
  assert.deepEqual(Object.keys(S).sort(), I.rooms.map(r => r.id).sort());
});

test('the two rooms of every opening see each other', () => {
  for (const o of I.openings) {
    assert.ok(sees(o.rooms[0], o.rooms[1]));
    assert.ok(sees(o.rooms[1], o.rooms[0]));
  }
});

test('seeing is mutual', () => {
  for (const a of I.rooms) for (const b of I.rooms) assert.equal(sees(a.id, b.id), sees(b.id, a.id));
});

test('walls hide: the kitchen and the study do not see the master bedroom', () => {
  assert.ok(!sees('kitchen', 'master'));
  assert.ok(!sees('study', 'master'));
  assert.ok(!sees('dining', 'master'));
});

test('doors show: hall sees study and passage; passage sees master; kitchen sees the study through two openings', () => {
  assert.ok(sees('hall', 'study'));
  assert.ok(sees('hall', 'passage'));
  assert.ok(sees('passage', 'master'));
  assert.ok(sees('kitchen', 'study'));
});

test('the stair joins the floors: hall and landing see each other, and what each sees on its own floor', () => {
  assert.ok(sees('hall', 'landing'));
  for (const b of S.landing) if (I.rooms.find(r => r.id === b).floor === 1) assert.ok(sees('hall', b));
});

test('the same table on two builds, frozen, and each list in I.rooms order', () => {
  assert.deepEqual(seenFrom(I), S);
  assert.ok(Object.isFrozen(S) && Object.isFrozen(S.hall));
  const order = new Map(I.rooms.map((r, i) => [r.id, i]));
  for (const list of Object.values(S)) {
    for (let i = 1; i < list.length; i++) assert.ok(order.get(list[i - 1]) < order.get(list[i]));
  }
});

test('a blueprint with an opening closed loses the sight through it', () => {
  const shut = {...I, openings: I.openings.filter(o => o.id !== 'passage-master')};
  assert.ok(!seenFrom(shut).passage.includes('master'));
});
