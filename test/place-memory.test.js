import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {PlaceMemory, PLACE_KEY, STILL_MS} from '../public/space/place-memory.js';

const store = (initial = {}) => { const m = new Map(Object.entries(initial)); let writes = 0;
  return {getItem: k => m.get(k) ?? null, setItem: (k, v) => { writes++; m.set(k, v); }, removeItem: k => m.delete(k), get writes() { return writes; }}; };
const spot = {position: [10, 2], yaw: 1, pitch: -.2};
const saved = record => store({[PLACE_KEY]: JSON.stringify(record)});
const good = {version: 1, ...spot, savedAt: 5};

test('a first visit has no remembered place', () => {
  assert.equal(new PlaceMemory({storage: store(), space: S}).load(), null);
});
test('a place is written only after three still seconds, and only once', () => {
  let now = 0; const storage = store(), memory = new PlaceMemory({storage, space: S, clock: () => now});
  memory.note(spot, true); now = 1000; memory.note(spot, false); now = 1000 + STILL_MS - 1; memory.note(spot, false);
  assert.equal(storage.writes, 0);
  now = 1000 + STILL_MS; memory.note(spot, false); now += 60_000; memory.note(spot, false);
  assert.equal(storage.writes, 1);
  assert.deepEqual(new PlaceMemory({storage, space: S}).load(), {place: 'yard', ...spot});
});
test('flush writes immediately; forget removes it', () => {
  const storage = store(), memory = new PlaceMemory({storage, space: S});
  memory.flush(spot); assert.deepEqual(memory.load(), {place: 'yard', ...spot});
  memory.forget(); assert.equal(memory.load(), null); assert.equal(storage.getItem(PLACE_KEY), null);
});
test('anything invalid is ignored, so the visitor arrives at the painting view', () => {
  for (const bad of [{...good, version: 2}, {...good, position: [30, -12]}, {...good, position: S.cabin.center}, {...good, position: S.beds[0].center},
    {...good, position: [NaN, 0]}, {...good, yaw: 'east'}, {...good, pitch: 3}, {...good, position: [1]}, null, 7])
    assert.equal(new PlaceMemory({storage: saved(bad), space: S}).load(), null, JSON.stringify(bad));
  assert.equal(new PlaceMemory({storage: store({[PLACE_KEY]: '{not json'}), space: S}).load(), null);
  assert.equal(new PlaceMemory({storage: store({[PLACE_KEY]: 'x'.repeat(600)}), space: S}).load(), null);
});
test('storage that throws is survived and not retried', () => {
  let calls = 0; const storage = {getItem() { calls++; throw new Error('denied'); }, setItem() { calls++; throw new Error('quota'); }, removeItem() { calls++; throw new Error('denied'); }};
  const memory = new PlaceMemory({storage, space: S});
  assert.equal(memory.load(), null); memory.flush(spot); memory.note(spot, false); memory.forget();
  assert.equal(calls, 1);
  assert.doesNotThrow(() => new PlaceMemory({storage: undefined, space: S}).flush(spot));
});
test('forget stays forgotten while the visitor stands still, until they move', () => {
  let now = 0; const storage = store(), memory = new PlaceMemory({storage, space: S, clock: () => now});
  memory.note(spot, false); now = STILL_MS; memory.note(spot, false);
  assert.equal(storage.writes, 1);
  memory.forget();
  for (let i = 0; i < 5; i++) { now += 60_000; memory.note(spot, false); }
  memory.flush(spot);
  assert.equal(storage.getItem(PLACE_KEY), null); assert.equal(storage.writes, 1);
  const moved = {position: [12, 3], yaw: 2, pitch: 0};
  memory.note(moved, true); now += 1000; memory.note(moved, false); now += STILL_MS; memory.note(moved, false);
  assert.equal(storage.writes, 2);
  assert.deepEqual(new PlaceMemory({storage, space: S}).load(), {place: 'yard', ...moved});
});

test('an indoor place is stored as version 2 and restored with its floor', () => {
  const storage = store(), m = new PlaceMemory({storage, space: S, interior: I});
  m.flush({place: 'cabin', floor: 1, position: [3, 9], yaw: 1, pitch: .1});
  const r = JSON.parse(storage.getItem(PLACE_KEY));
  assert.equal(r.version, 2); assert.equal(r.place, 'cabin'); assert.equal(r.floor, 1);
  assert.deepEqual(new PlaceMemory({storage, space: S, interior: I}).load(), {place: 'cabin', floor: 1, position: [3, 9], yaw: 1, pitch: .1});
});
test('without the interior an indoor record is ignored; a yard record still loads as version 1', () => {
  const storage = store(); new PlaceMemory({storage, space: S, interior: I}).flush({place: 'cabin', floor: 0, position: [9, 3], yaw: 0, pitch: 0});
  assert.equal(new PlaceMemory({storage, space: S}).load(), null);
  const yard = store(); new PlaceMemory({storage: yard, space: S, interior: I}).flush({place: 'yard', position: [1, 1], yaw: 2, pitch: 0});
  assert.equal(JSON.parse(yard.getItem(PLACE_KEY)).version, 1);
  assert.deepEqual(new PlaceMemory({storage: yard, space: S}).load(), {place: 'yard', position: [1, 1], yaw: 2, pitch: 0});
});
test('a broken indoor record is ignored', () => {
  for (const bad of [{floor: 2}, {floor: '0'}, {place: 'attic'}, {position: [.1, .1]}, {position: [10.3, 3], floor: 1, yaw: NaN}, {pitch: 9}]) {
    const storage = store();
    storage.setItem(PLACE_KEY, JSON.stringify({version: 2, place: 'cabin', floor: 0, position: [9, 3], yaw: 0, pitch: 0, ...bad}));
    assert.equal(new PlaceMemory({storage, space: S, interior: I}).load(), null, JSON.stringify(bad));
  }
});
test('moving between floors at the same spot counts as a change', () => {
  const storage = store(), m = new PlaceMemory({storage, space: S, interior: I});
  m.flush({place: 'cabin', floor: 0, position: [3, 3], yaw: 0, pitch: 0}); m.flush({place: 'cabin', floor: 1, position: [3, 3], yaw: 0, pitch: 0});
  assert.equal(JSON.parse(storage.getItem(PLACE_KEY)).floor, 1);
});

test('a remembered place inside the door leaf falls back to the arrival pose', () => {
  const at = position => { const storage = store(); storage.setItem(PLACE_KEY, JSON.stringify({version: 2, place: 'cabin', floor: 0, position, yaw: 0, pitch: 0})); return new PlaceMemory({storage, space: S, interior: I}).load(); };
  assert.equal(at([8.5, .5]), null);
  assert.deepEqual(at([9, .8]).position, [9, .8]);
});

test('a remembered place inside a chimney breast falls back to the arrival pose', () => {
  const at = (floor, position) => { const storage = store(); storage.setItem(PLACE_KEY, JSON.stringify({version: 2, place: 'cabin', floor, position, yaw: 0, pitch: 0})); return new PlaceMemory({storage, space: S, interior: I}).load(); };
  assert.equal(at(0, [.25, 3.5]), null);
  assert.equal(at(1, [.2, 3.5]), null);
  assert.deepEqual(at(0, [3, 3.5]).position, [3, 3.5]);
});
