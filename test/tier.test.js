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
// Feeds frames at the given intervals (ms), starting at `from`; returns the last time.
const intervals = (meter, list, from = 0) => { let t = from; meter.frame(t); for (const dt of list) meter.frame(t += dt); return t; };
const repeat = (pattern, ms) => { const out = []; for (let sum = 0; sum < ms;) for (const dt of pattern) { out.push(dt); sum += dt; } return out; };
test('a device slower than a frame every quarter second is still measured and ends on plain', () => {
  const m = createTierMeter(); const t = run(m, 3, 30);
  assert.equal(m.tier, 'plain'); assert.equal(m.locked, true);
  run(m, 30, 10, t); assert.equal(m.tier, 'plain');
});
test('a jittery slow device is measured: intervals straddling a quarter second end on plain', () => {
  const m = createTierMeter(); intervals(m, repeat([220, 300], 60_000));
  assert.equal(m.tier, 'plain'); assert.equal(m.locked, true);
});
test('a slow device that hitches now and then is measured and ends on plain', () => {
  const m = createTierMeter(); intervals(m, repeat([...Array(9).fill(200), 300], 60_000));
  assert.equal(m.tier, 'plain'); assert.equal(m.locked, true);
});
test('one hitch in each window does not step a healthy device down', () => {
  // A 1.5 s hitch every 3 s of 30 fps frames, so each measurement window holds one.
  const m = createTierMeter(); intervals(m, repeat([...Array(45).fill(1000 / 30), 1500, ...Array(45).fill(1000 / 30)], 30_000));
  assert.equal(m.tier, 'full'); assert.equal(m.locked, true);
});
test('a hidden tab and then a 2.5 s stall are not measurements', () => {
  const m = createTierMeter(); let t = run(m, 30, 2);
  t += 60_000; t = run(m, 30, 2, t); t += 2_500; run(m, 30, 6, t);
  assert.equal(m.tier, 'full'); assert.equal(m.locked, true);
});
test('an interval of exactly stallMs is a frame; a millisecond longer restarts the window', () => {
  const options = {settleMs: 0, windowMs: 1000, stallMs: 100};
  const a = createTierMeter(options); intervals(a, Array(10).fill(100));
  assert.equal(a.tier, 'light', 'ten 100 ms frames fill the window and are slow');
  const b = createTierMeter(options); let t = intervals(b, [100, 100, 100, 100, 100, 101, 100, 100, 100, 100]);
  assert.equal(b.tier, 'full', 'the 101 ms stall emptied the window'); assert.equal(b.locked, false);
  intervals(b, Array(6).fill(100), t); assert.equal(b.tier, 'light');
});
test('more than eight stalls in a row are a very slow device; a short frame clears the run', () => {
  const options = {settleMs: 0};
  const run9 = createTierMeter(options); intervals(run9, Array(9).fill(2100));
  assert.equal(run9.tier, 'light');
  const broken = createTierMeter(options); intervals(broken, [2100, 2100, 2100, 2100, 2100, 30, 2100, 2100, 2100, 2100]);
  assert.equal(broken.tier, 'full'); assert.equal(broken.locked, false);
});
test('a meter can start locked at a chosen tier', () => {
  const m = createTierMeter({start: 'light', locked: true});
  assert.equal(m.tier, 'light'); assert.equal(m.locked, true);
  run(m, 5, 30); assert.equal(m.tier, 'light');
  assert.throws(() => createTierMeter({start: 'medium'}));
});
