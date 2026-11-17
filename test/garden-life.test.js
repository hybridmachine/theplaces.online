import test from 'node:test';
import assert from 'node:assert/strict';
import {CROPS, DAILY_STEP, EVENT_DAYS, OFFSET_DAYS, cropStage, plotSoil} from '../shared/garden-life.js';

const KINDS = ['corn', 'bean', 'tomato'], NUMS = ['height', 'leaf', 'flower', 'fruit', 'ripe', 'yellow', 'dry'];

test('a crop is in the ground only between sowing and clearing, whatever its offset', () => {
  for (const kind of KINDS) for (const offset of [-OFFSET_DAYS, 0, OFFSET_DAYS]) for (let d = 0; d < 365; d++) {
    const s = cropStage(kind, d, offset), from = kind === 'tomato' ? CROPS[kind].shoot : CROPS[kind].sow;
    assert.equal(s.present, d >= from && d < CROPS[kind].clear, `${kind} ${d}`);
    if (!s.present) for (const k of NUMS) assert.equal(s[k], 0, `${kind} ${d} ${k}`);
    for (const k of NUMS) assert.ok(Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1, `${kind} ${d} ${k}`);
  }
});
test('supports stand only between their up and down days', () => {
  for (let d = 0; d < 365; d++) {
    assert.equal(cropStage('corn', d).support, false);
    assert.equal(cropStage('bean', d).support, d >= 120 && d < 318);
    assert.equal(cropStage('tomato', d).support, d >= 135 && d < 300);
  }
});
test('nothing jumps from one day to the next except on a gardener\'s day', () => {
  for (const kind of KINDS) for (let d = 1; d < 365; d++) {
    if (EVENT_DAYS(kind).includes(d)) continue;
    const a = cropStage(kind, d - 1), b = cropStage(kind, d);
    for (const k of NUMS) assert.ok(Math.abs(b[k] - a[k]) <= DAILY_STEP, `${kind} ${k} day ${d}`);
  }
});
test('a crop reaches full height, ripens without going back, and its fruit rises then goes', () => {
  for (const kind of KINDS) {
    assert.equal(cropStage(kind, CROPS[kind].full + 5).height, 1);
    let ripe = 0, peak = 0;
    for (let d = 0; d < 365; d++) { const s = cropStage(kind, d); if (s.present) { assert.ok(s.ripe >= ripe - 1e-9); ripe = s.ripe; } peak = Math.max(peak, s.fruit); }
    assert.ok(peak > .9); assert.equal(cropStage(kind, CROPS[kind].clear - 1).fruit, 0);
  }
  assert.equal(cropStage('tomato', 135).height, .15);
});
test('an offset moves growth by that many days', () => {
  assert.equal(cropStage('corn', 170, 5).height, cropStage('corn', 165, 0).height);
});
test('the soil: dug dark in spring, mulch on the resting plot from spring to autumn only', () => {
  assert.equal(plotSoil('corn', 109).dug, 0); assert.equal(plotSoil('corn', 110).dug, 1); assert.equal(plotSoil('corn', 230).dug, 0);
  assert.equal(plotSoil('rest', 114).mulch, 0); assert.equal(plotSoil('rest', 115).mulch, 1); assert.ok(Math.abs(plotSoil('rest', 317).mulch - .6) < .01);
  for (const d of [318, 364, 0, 50]) assert.equal(plotSoil('rest', d).mulch, 0);
  assert.equal(plotSoil('tomato', 200).mulch, 0);
});
