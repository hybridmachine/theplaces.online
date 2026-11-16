import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SPACE_ART, artFiles, cellRect} from '../shared/lakeside-space-art.js';

const BUNDLE_COMPLETE = true;

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
const dir = new URL('../public/assets/lakeside-space-v1/', import.meta.url);
test('the committed art bundle matches its manifest and budget', () => {
  const manifest = JSON.parse(readFileSync(new URL('export.json', dir), 'utf8'));
  assert.equal(manifest.version, SPACE_ART.version); assert.equal(manifest.quality, SPACE_ART.quality);
  const listed = new Map(manifest.files.map(f => [f.slot, f]));
  assert.ok(Object.keys(SPACE_ART.surfaces).every(s => listed.has(s)));
  let total = 0;
  for (const want of artFiles().filter(f => listed.has(f.slot) || BUNDLE_COMPLETE)) {
    const got = listed.get(want.slot); assert.ok(got, `missing ${want.slot}`);
    assert.deepEqual([got.file, got.width, got.height, got.alpha], [want.file, want.width, want.height, want.alpha]);
    assert.ok(['painted', 'plate'].includes(got.source)); assert.ok(Number.isInteger(got.seed));
    const bytes = readFileSync(new URL(got.file, dir));
    assert.equal(bytes.length, got.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), got.sha256);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF'); assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP');
    total += bytes.length;
  }
  assert.ok(total <= SPACE_ART.budgetBytes, `${total} bytes`);
  const extra = readdirSync(dir).filter(n => n !== 'export.json' && !manifest.files.some(f => f.file === n));
  assert.deepEqual(extra, []);
});
