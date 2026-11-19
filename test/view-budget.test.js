import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewBudget} from '../public/space/view-budget.js';
import {LIVE_CAP} from '../shared/window-views.js';

// Feeds `seconds` of frames `ms` apart from `from`; returns the next time.
const feed = (b, ms, seconds, opts, from = 0) => { let t = from; for (; t < from + seconds * 1000; t += ms) b.frame(t, opts); return t; };
const IN3 = {indoors: true, live: 3};
test('a fast device keeps three openings on full and two on light and plain', () => {
  const b = createViewBudget(); feed(b, 1000 / 30, 20, IN3);
  assert.equal(b.limit('full'), 3); assert.equal(b.limit('light'), 2); assert.equal(b.limit('plain'), 2);
  for (const tier of Object.keys(LIVE_CAP)) assert.equal(b.limit(tier), LIVE_CAP[tier]);
  assert.throws(() => b.limit('medium'));
});
test('a slow stretch indoors with three live sheds one, then another, and stops at one', () => {
  const b = createViewBudget(); let t = feed(b, 60, 3, IN3);
  assert.equal(b.limit('full'), 3, 'still settling');
  t = feed(b, 60, 3, IN3, t); assert.equal(b.limit('full'), 2); assert.equal(b.limit('light'), 2);
  t = feed(b, 60, 6, IN3, t); assert.equal(b.limit('full'), 1); assert.equal(b.limit('light'), 1); assert.equal(b.limit('plain'), 1);
  feed(b, 60, 30, IN3, t); assert.equal(b.limit('full'), 1, 'never below one');
});
test('nothing is shed outdoors, or indoors with one opening live', () => {
  const out = createViewBudget(); feed(out, 60, 30, {indoors: false, live: 3});
  assert.equal(out.limit('full'), 3);
  const one = createViewBudget(); feed(one, 60, 30, {indoors: true, live: 1});
  assert.equal(one.limit('full'), 3);
});
test('coming back indoors restores the full allowance', () => {
  const b = createViewBudget(); let t = feed(b, 60, 12, IN3); assert.equal(b.limit('full'), 1);
  t = feed(b, 60, 1, {indoors: false, live: 3}, t); assert.equal(b.limit('full'), 1, 'only entering restores it');
  b.frame(t, IN3); assert.equal(b.limit('full'), 3);
});
test('a hidden tab or one long stall is not a measurement', () => {
  const b = createViewBudget(); let t = feed(b, 1000 / 30, 2, IN3);
  t += 60_000; t = feed(b, 1000 / 30, 2, IN3, t); t += 5_000; feed(b, 1000 / 30, 6, IN3, t);
  assert.equal(b.limit('full'), 3);
  // An interval of exactly stallMs counts; longer empties the window.
  const o = {settleMs: 0, windowMs: 1000, stallMs: 100};
  const a = createViewBudget(o); let u = 0; a.frame(u, IN3); for (let i = 0; i < 10; i++) a.frame(u += 100, IN3);
  assert.equal(a.limit('full'), 2);
  const c = createViewBudget(o); u = 0; c.frame(u, IN3); for (const dt of [100, 100, 100, 100, 100, 101, 100, 100, 100, 100]) c.frame(u += dt, IN3);
  assert.equal(c.limit('full'), 3, 'the 101 ms stall emptied the window');
});
