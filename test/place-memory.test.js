import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
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
  assert.deepEqual(new PlaceMemory({storage, space: S}).load(), spot);
});
test('flush writes immediately; forget removes it', () => {
  const storage = store(), memory = new PlaceMemory({storage, space: S});
  memory.flush(spot); assert.deepEqual(memory.load(), spot);
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
  assert.deepEqual(new PlaceMemory({storage, space: S}).load(), moved);
});
