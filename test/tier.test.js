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
// A seeded stream of numbers in [0, 1) (mulberry32), so the jittered cases are the same on every run.
const seeded = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// app.js draws at most 30 frames a second, on whole display refreshes; on a 48 Hz display that is two refreshes, two, then one.
const HZ48 = [41.67, 41.67, 20.83];
test('a 48 Hz display holds the full tier and locks, as its clock reports it and with ±1.5 ms of jitter', () => {
  const exact = createTierMeter(); intervals(exact, repeat(HZ48, 10_000));
  assert.equal(exact.tier, 'full'); assert.equal(exact.locked, true);
  for (const seed of [1, 2, 3, 4, 5]) {
    const random = seeded(seed), m = createTierMeter();
    intervals(m, repeat(HZ48, 10_000).map(dt => dt + (random() * 2 - 1) * 1.5));
    assert.equal(m.tier, 'full', `seed ${seed}`); assert.equal(m.locked, true, `seed ${seed}`);
  }
});
test('a device held at 50 Hz (a frame every 40 ms) stays on full', () => {
  const m = createTierMeter(); intervals(m, repeat([40], 10_000));
  assert.equal(m.tier, 'full'); assert.equal(m.locked, true);
});
test('a device at 20 fps (a frame every 50 ms) still steps down', () => {
  const m = createTierMeter(); intervals(m, repeat([50], 6_000));
  assert.equal(m.tier, 'light');
});
test('a meter can start locked at a chosen tier', () => {
  const m = createTierMeter({start: 'light', locked: true});
  assert.equal(m.tier, 'light'); assert.equal(m.locked, true);
  run(m, 5, 30); assert.equal(m.tier, 'light');
  assert.throws(() => createTierMeter({start: 'medium'}));
});
// Indoors the rooms are far cheaper to draw than the yard: their frames may step the tier down but never lock it.
const runIndoors = (meter, fps, seconds, from = 0) => { let t = from; for (; t < from + seconds * 1000; t += 1000 / fps) meter.frame(t, {indoors: true}); return t; };
test('slow frames indoors step the tier down, one at a time, as in the yard', () => {
  const m = createTierMeter(); let t = runIndoors(m, 15, 6);
  assert.equal(m.tier, 'light'); assert.equal(m.locked, false);
  runIndoors(m, 10, 20, t); assert.equal(m.tier, 'plain'); assert.equal(m.locked, true);
});
test('fast frames indoors do not lock the tier, so a slow yard afterwards still steps it down', () => {
  const m = createTierMeter(); let t = runIndoors(m, 30, 20);
  assert.equal(m.tier, 'full'); assert.equal(m.locked, false, 'the rooms say nothing of the yard');
  t = run(m, 15, 6, t); assert.equal(m.tier, 'light'); assert.equal(m.locked, false);
  run(m, 28, 6, t); assert.equal(m.tier, 'light'); assert.equal(m.locked, true);
});
test('fast frames indoors and then a fast yard lock the full tier, as the yard alone does', () => {
  const m = createTierMeter(); let t = runIndoors(m, 30, 20);
  t = run(m, 30, 10, t); assert.equal(m.tier, 'full'); assert.equal(m.locked, true);
  runIndoors(m, 5, 30, t); assert.equal(m.tier, 'full', 'never changes once locked');
});
test('stepping indoors or out starts a new window after settling, so neither place is measured by the other\'s frames', () => {
  // 2 s of a slow yard, then fast rooms: the slow frames already gathered are dropped with the window.
  const m = createTierMeter(); let t = run(m, 15, 2.9);
  t = runIndoors(m, 30, 2, t); assert.equal(m.tier, 'full'); assert.equal(m.locked, false);
  // Back out, the yard is measured afresh: its window fills only after settling again.
  t = run(m, 15, 1.4, t); assert.equal(m.tier, 'full');
  run(m, 15, 3.5, t); assert.equal(m.tier, 'light');
});
// A view with more than one live opening is far dearer than the rooms: its frames say nothing of the tier (hold).
const runHeld = (meter, fps, seconds, from = 0) => { let t = from; for (; t < from + seconds * 1000; t += 1000 / fps) meter.frame(t, {indoors: true, hold: true}); return t; };
test('held frames are not measured: a slow held stretch indoors leaves the tier alone', () => {
  const m = createTierMeter(); runHeld(m, 10, 30);
  assert.equal(m.tier, 'full'); assert.equal(m.locked, false);
});
test('once the hold ends, a slow window with one opening live steps the tier down as before', () => {
  const m = createTierMeter(); let t = runHeld(m, 10, 5);
  t = runIndoors(m, 15, 1.4, t); assert.equal(m.tier, 'full', 'settles afresh after the hold');
  runIndoors(m, 15, 4, t); assert.equal(m.tier, 'light');
});
test('a locked full tier is untouched by anything indoors', () => {
  const m = createTierMeter(); let t = run(m, 30, 10); assert.equal(m.locked, true);
  t = runIndoors(m, 5, 30, t); runHeld(m, 5, 30, t); assert.equal(m.tier, 'full');
});
