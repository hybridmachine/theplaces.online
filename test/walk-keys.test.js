import test from 'node:test';
import assert from 'node:assert/strict';
import {WalkKeys, walkHint, walkKeyLabels} from '../public/space/walk-keys.js';

const key = (type, code, more = {}) => {
  const event = new Event(type, {cancelable: true});
  for (const [name, value] of Object.entries({code, ...more})) Object.defineProperty(event, name, {value});
  return event;
};
const zero = {forward: 0, strafe: 0, turn: 0, tilt: 0, fast: false};

test('W A S D walk, Q E turn and Shift hurries', () => {
  const t = new EventTarget(), k = new WalkKeys(t);
  for (const c of ['KeyW', 'KeyD', 'KeyE', 'ShiftLeft']) t.dispatchEvent(key('keydown', c));
  assert.deepEqual(k.input(), {forward: 1, strafe: 1, turn: 1, tilt: 0, fast: true}); assert.equal(k.moving(), true);
  t.dispatchEvent(key('keydown', 'KeyS')); assert.equal(k.input().forward, 0);
  for (const c of ['KeyW', 'KeyS', 'KeyD', 'KeyE', 'ShiftLeft']) t.dispatchEvent(key('keyup', c));
  assert.deepEqual(k.input(), zero);
  t.dispatchEvent(key('keydown', 'KeyA')); t.dispatchEvent(key('keydown', 'KeyQ'));
  assert.deepEqual(k.input(), {forward: 0, strafe: -1, turn: -1, tilt: 0, fast: false});
});
test('the arrow keys turn the camera and never walk', () => {
  const t = new EventTarget(), k = new WalkKeys(t);
  t.dispatchEvent(key('keydown', 'ArrowRight')); t.dispatchEvent(key('keydown', 'ArrowUp'));
  assert.deepEqual(k.input(), {forward: 0, strafe: 0, turn: 1, tilt: 1, fast: false}); assert.equal(k.moving(), true);
  t.dispatchEvent(key('keyup', 'ArrowRight')); t.dispatchEvent(key('keyup', 'ArrowUp'));
  t.dispatchEvent(key('keydown', 'ArrowLeft')); t.dispatchEvent(key('keydown', 'ArrowDown'));
  assert.deepEqual(k.input(), {forward: 0, strafe: 0, turn: -1, tilt: -1, fast: false});
  // Arrows and W A S D work together; opposite keys cancel, and Q/E add to the arrows without exceeding one key's rate.
  t.dispatchEvent(key('keydown', 'KeyW')); t.dispatchEvent(key('keydown', 'ArrowUp')); t.dispatchEvent(key('keydown', 'KeyQ'));
  assert.deepEqual(k.input(), {forward: 1, strafe: 0, turn: -1, tilt: 0, fast: false});
  t.dispatchEvent(key('keyup', 'KeyW')); t.dispatchEvent(key('keyup', 'ArrowLeft')); t.dispatchEvent(key('keyup', 'KeyQ'));
  assert.equal(k.moving(), false, 'cancelled up/down arrows are not movement');
});
test('losing focus releases every key', () => {
  const t = new EventTarget(), k = new WalkKeys(t);
  t.dispatchEvent(key('keydown', 'KeyW')); t.dispatchEvent(new Event('blur'));
  assert.deepEqual(k.input(), zero); assert.equal(k.moving(), false);
});
test('an open dialog stops walking, including keys already held', () => {
  let open = false; const t = new EventTarget(), k = new WalkKeys(t, {blocked: () => open});
  t.dispatchEvent(key('keydown', 'KeyW')); open = true; assert.deepEqual(k.input(), zero);
  assert.equal(k.moving(), false);
  t.dispatchEvent(key('keydown', 'KeyD')); open = false; assert.equal(k.input().strafe, 0);
});
test('shortcuts and typing are left alone', () => {
  const t = new EventTarget(), k = new WalkKeys(t);
  t.dispatchEvent(key('keydown', 'KeyW', {ctrlKey: true}));
  t.dispatchEvent(key('keydown', 'KeyD', {target: {tagName: 'INPUT'}}));
  assert.deepEqual(k.input(), zero);
  const arrow = key('keydown', 'ArrowUp'), letter = key('keydown', 'KeyW');
  t.dispatchEvent(arrow); t.dispatchEvent(letter);
  assert.equal(arrow.defaultPrevented, true); assert.equal(letter.defaultPrevented, false);
});
test('dispose stops listening', () => {
  const t = new EventTarget(), k = new WalkKeys(t); k.dispose();
  t.dispatchEvent(key('keydown', 'KeyW')); assert.deepEqual(k.input(), zero);
});
test('keyup releases a key even while blocked or with a modifier held', () => {
  let open = false; const t = new EventTarget(), k = new WalkKeys(t, {blocked: () => open});
  t.dispatchEvent(key('keydown', 'KeyW')); open = true; t.dispatchEvent(key('keyup', 'KeyW')); open = false;
  assert.deepEqual(k.input(), zero);
  t.dispatchEvent(key('keydown', 'KeyA')); t.dispatchEvent(key('keyup', 'KeyA', {metaKey: true}));
  assert.deepEqual(k.input(), zero);
});
test('contenteditable and select targets are typing targets; tag-less targets are not', () => {
  const t = new EventTarget(), k = new WalkKeys(t);
  t.dispatchEvent(key('keydown', 'KeyW', {target: {tagName: 'div', isContentEditable: true}}));
  t.dispatchEvent(key('keydown', 'KeyA', {target: {tagName: 'select'}}));
  assert.deepEqual(k.input(), zero);
  t.dispatchEvent(key('keydown', 'KeyD', {target: {}}));
  assert.equal(k.input().strafe, 1);
});
test('the walking hint names the keys as printed on the visitor\'s keyboard', async () => {
  const azerty = new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyS', 's'], ['KeyD', 'd']]);
  const dvorak = new Map([['KeyW', ','], ['KeyA', 'a'], ['KeyS', 'o'], ['KeyD', 'e']]);
  assert.equal(walkKeyLabels(azerty), 'Z Q S D');
  assert.equal(walkKeyLabels(dvorak), ', A O E');
  assert.equal(walkKeyLabels(new Map([['KeyW', 'w'], ['KeyA', 'a'], ['KeyS', 's'], ['KeyD', 'd']])), 'W A S D');
  // Unknown layouts fall back to the physical-position names.
  for (const unknown of [undefined, null, new Map(), new Map([['KeyW', 'z']]), new Map([...azerty, ['KeyD', 'Dead']]), {get() { throw new Error('denied'); }}])
    assert.equal(walkKeyLabels(unknown), 'W A S D');
  assert.equal(await walkHint({getLayoutMap: async () => azerty}), 'Walk with Z Q S D. Look with the arrow keys or drag.');
  assert.equal(await walkHint({getLayoutMap: async () => { throw new Error('blocked'); }}), 'Walk with W A S D. Look with the arrow keys or drag.');
  assert.equal(await walkHint(undefined), 'Walk with W A S D. Look with the arrow keys or drag.');
  // A layout lookup that never settles must not hold the hint back.
  assert.equal(await walkHint({getLayoutMap: () => new Promise(() => {})}, 20), 'Walk with W A S D. Look with the arrow keys or drag.');
});
