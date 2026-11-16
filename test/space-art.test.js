import test from 'node:test';
import assert from 'node:assert/strict';
import {SPACE_ART, artFiles, cellRect} from '../shared/lakeside-space-art.js';

test('every art slot names one distinct WebP file', () => {
  const files = artFiles();
  assert.equal(files.length, 12);
  assert.equal(new Set(files.map(f => f.file)).size, 12);
  assert.equal(new Set(files.map(f => f.slot)).size, 12);
  for (const f of files) { assert.match(f.file, /^[a-z]+\.webp$/); assert.ok(f.width > 0 && f.height > 0); }
  assert.deepEqual(files.filter(f => f.alpha).map(f => f.slot), ['cards']);
  assert.ok(Object.isFrozen(SPACE_ART) && Object.isFrozen(SPACE_ART.surfaces.meadow));
});
test('card cells tile the atlas without overlap', () => {
  const used = Object.values(SPACE_ART.cards.cells).flat();
  assert.equal(new Set(used).size, used.length);
  assert.ok(used.every(i => Number.isInteger(i) && i >= 0 && i < 16));
  assert.deepEqual(cellRect(0), [0, .75, .25, .25]);
  assert.deepEqual(cellRect(15), [.75, 0, .25, .25]);
});
