import test from 'node:test';
import assert from 'node:assert/strict';
import {TIERS, createTierMeter} from '../public/space/tier.js';

const run = (meter, fps, seconds, from = 0) => { let t = from; for (; t < from + seconds * 1000; t += 1000 / fps) meter.frame(t); return t; };
test('a fast device stays on the full tier and locks', () => {
  const m = createTierMeter(); run(m, 30, 10);
  assert.equal(m.tier, 'full'); assert.equal(m.locked, true);
});
test('a slow device steps down one tier at a time and stops where it holds', () => {
  const m = createTierMeter(); let t = run(m, 15, 6);
  assert.equal(m.tier, 'light'); assert.equal(m.locked, false);
  t = run(m, 28, 6, t); assert.equal(m.tier, 'light'); assert.equal(m.locked, true);
  run(m, 5, 30, t); assert.equal(m.tier, 'light', 'never changes once locked');
});
test('a very slow device ends on plain and never climbs back', () => {
  const m = createTierMeter(); let t = run(m, 10, 20);
  assert.equal(m.tier, 'plain'); assert.equal(m.locked, true);
  run(m, 60, 20, t); assert.equal(m.tier, 'plain');
});
test('a hidden tab or one long stall is not a measurement', () => {
  const m = createTierMeter(); let t = run(m, 30, 2);
  t += 60_000; t = run(m, 30, 2, t); t += 5_000; run(m, 30, 6, t);
  assert.equal(m.tier, 'full');
});
test('exactly on target holds; the tiers are ordered', () => {
  const m = createTierMeter({target: 24}); run(m, 24, 10); assert.equal(m.tier, 'full');
  assert.deepEqual([...TIERS], ['full', 'light', 'plain']);
});
test('a device slower than the gap allows is still measured and ends on plain', () => {
  const m = createTierMeter(); const t = run(m, 3, 30);
  assert.equal(m.tier, 'plain'); assert.equal(m.locked, true);
  run(m, 30, 10, t); assert.equal(m.tier, 'plain');
});
test('a meter can start locked at a chosen tier', () => {
  const m = createTierMeter({start: 'light', locked: true});
  assert.equal(m.tier, 'light'); assert.equal(m.locked, true);
  run(m, 5, 30); assert.equal(m.tier, 'light');
  assert.throws(() => createTierMeter({start: 'medium'}));
});
