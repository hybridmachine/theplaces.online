import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {createWindowViews} from '../public/space/window-views.js';
import {toThree} from '../public/space/geometry.js';
import {verticalFov} from '../public/space/space-view.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D} from '../shared/lakeside-dressing.js';
import {viewOpenings, carry, carryDirection, cutPlane} from '../shared/window-views.js';

const openings = viewOpenings(I, S, D), byId = id => openings.find(o => o.id === id);
const v3 = p => new THREE.Vector3(...toThree(p));
// The visitor's camera as SpaceView stands it: eye [a, d, z], yaw clockwise from +d seen from above, pitch up.
const visitor = (eye, yaw, pitch = 0) => {
  const c = new THREE.PerspectiveCamera(verticalFov(16 / 9), 16 / 9, .1, 4000); c.rotation.order = 'YXZ';
  c.position.copy(v3(eye)); c.rotation.y = -yaw; c.rotation.x = pitch; c.updateProjectionMatrix(); c.updateMatrixWorld();
  return c;
};
// A renderer that records what is asked of it, with three's stencil buffer state as a recorder too.
const recorder = ({fail = false} = {}) => {
  const log = [], stencil = {locked: false, test: false, func: null, op: null};
  const renderer = {log, stencil, autoClear: true, clippingPlanes: [],
    state: {buffers: {stencil: {
      setTest(on) { log.push(['setTest', on]); if (!stencil.locked) stencil.test = on; },
      setMask(m) { log.push(['setMask', m]); },
      setFunc(f, ref, mask) { log.push(['setFunc', f, ref, mask]); stencil.func = [f, ref, mask]; },
      setOp(a, b, c) { log.push(['setOp', a, b, c]); stencil.op = [a, b, c]; },
      setLocked(lock) { log.push(['setLocked', lock]); stencil.locked = lock; }}}},
    render(scene, camera) {
      log.push(['render', scene, camera, {stencil: structuredClone(stencil), clipping: [...renderer.clippingPlanes], autoClear: renderer.autoClear, cabin: yard.shown}]);
      if (fail) throw new Error('lost');
    }};
  const yard = {shown: true, calls: [], setCabinShown(shown) { this.shown = shown; this.calls.push(shown); }};
  const sky = {at: [], centreOn(p) { this.at.push(p.clone()); }}, life = {aimed: [], aim(c) { this.aimed.push(c); }};
  return {renderer, yard, sky, life, yardScene: new THREE.Scene()};
};
const make = rig => createWindowViews(THREE, {openings, yardScene: rig.yardScene, yard: rig.yard, life: rig.life, sky: rig.sky});
const numbered = ids => id => ids.indexOf(id) + 1;
const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);

test('a view\'s camera stands at the carried eye, turned by the opening\'s turn, with the visitor\'s pitch and projection', () => {
  const rig = recorder(), views = make(rig), eye = [4.6, 3, 1.6], main = visitor(eye, Math.PI + .3, .12);
  const [view] = views.prepare(main, ['living'], numbered(['living'])), o = byId('living'), c = view.camera;
  assert.equal(view.id, 'living'); assert.equal(view.ref, 1);
  assert.ok(c.isPerspectiveCamera); assert.notEqual(c, main);
  assert.ok(c.position.distanceTo(v3(carry(o, eye))) < 1e-9);
  assert.equal(c.rotation.order, 'YXZ'); close(c.rotation.y, main.rotation.y + o.turn); close(c.rotation.x, main.rotation.x); close(c.rotation.z, 0);
  for (const k of ['fov', 'aspect', 'near', 'far']) assert.equal(c[k], main[k], k);
  c.projectionMatrix.elements.forEach((v, i) => close(v, main.projectionMatrix.elements[i]));
  // Its gaze is the visitor's gaze carried into the yard, and the horizon stays level.
  const gaze = new THREE.Vector3(0, 0, -1).applyQuaternion(main.quaternion), along = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
  assert.ok(along.distanceTo(v3(carryDirection(o, [gaze.x, -gaze.z, gaze.y]))) < 1e-9);
  close(new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion).y, 0);
  assert.equal(view.eye, c.matrixWorld);
  assert.ok(view.eye.equals(new THREE.Matrix4().compose(c.position, c.quaternion, new THREE.Vector3(1, 1, 1))));
});

test('a view\'s plane keeps what is beyond the pane and cuts what is nearer', () => {
  const rig = recorder(), views = make(rig), ids = ['living', 'dining', 'sky-room', 'door'];
  const list = views.prepare(visitor([9, 6, 1.6], 0), ids, numbered(ids));
  assert.deepEqual(list.map(v => v.id), ids);
  for (const view of list) {
    const o = byId(view.id), a = v3(o.anchor), n = v3(cutPlane(o).normal);
    assert.ok(view.plane.isPlane);
    assert.ok(view.plane.distanceToPoint(a.clone().add(n)) > 0, view.id);
    assert.ok(view.plane.distanceToPoint(a.clone().sub(n)) < 0, view.id);
    close(view.plane.distanceToPoint(a), 0, 1e-9);
  }
});

test('each view is drawn only where its own stencil number is', () => {
  const rig = recorder(), views = make(rig), ids = ['study', 'living'], main = visitor([9, 3, 1.6], Math.PI);
  const list = views.prepare(main, ids, numbered(ids));
  views.draw(rig.renderer);
  const renders = rig.renderer.log.filter(e => e[0] === 'render');
  assert.equal(renders.length, 2);
  renders.forEach(([, scene, camera, at], k) => {
    assert.equal(scene, rig.yardScene); assert.equal(camera, list[k].camera);
    assert.deepEqual(at.stencil, {locked: true, test: true, func: [THREE.EqualStencilFunc, k + 1, 0xff], op: [THREE.KeepStencilOp, THREE.KeepStencilOp, THREE.KeepStencilOp]});
    assert.deepEqual(at.clipping, [list[k].plane]); assert.equal(at.autoClear, false);
  });
  // Each render's stencil function was set (unlocked, then locked) just before it.
  const log = rig.renderer.log, at = log.indexOf(renders[1]), before = log.slice(log.indexOf(renders[0]) + 1, at);
  assert.deepEqual(before.filter(e => e[0] === 'setFunc'), [['setFunc', THREE.EqualStencilFunc, 2, 0xff]]);
  assert.deepEqual(before.at(-1), ['setLocked', true]);
});

test('the cabin is hidden only while views are drawn, and everything is put back even if a draw throws', () => {
  for (const fail of [false, true]) {
    const rig = recorder({fail}), views = make(rig), main = visitor([4.2, 3, 1.6], Math.PI);
    views.prepare(main, ['living'], () => 1);
    if (fail) assert.throws(() => views.draw(rig.renderer), /lost/); else views.draw(rig.renderer);
    const render = rig.renderer.log.find(e => e[0] === 'render');
    assert.equal(render[3].cabin, false, 'hidden while drawn');
    assert.equal(rig.yard.shown, true); assert.deepEqual(rig.yard.calls, [false, true]);
    assert.equal(rig.renderer.stencil.locked, false); assert.equal(rig.renderer.stencil.test, false);
    assert.deepEqual(rig.renderer.clippingPlanes, []); assert.equal(rig.renderer.autoClear, true);
    assert.ok(rig.sky.at.at(-1).equals(main.position)); assert.equal(rig.life.aimed.at(-1), main);
  }
  // A renderer that never clears on its own keeps that.
  const rig = recorder(), views = make(rig); rig.renderer.autoClear = false;
  views.prepare(visitor([4.2, 3, 1.6], Math.PI), ['living'], () => 1); views.draw(rig.renderer);
  assert.equal(rig.renderer.autoClear, false);
});

test('the sky and the life follow each view\'s camera and end on the visitor\'s', () => {
  const rig = recorder(), views = make(rig), ids = ['living', 'study', 'door'], main = visitor([9, 2.5, 1.6], Math.PI);
  const list = views.prepare(main, ids, numbered(ids));
  views.draw(rig.renderer);
  assert.equal(rig.sky.at.length, 4); assert.deepEqual(rig.life.aimed, [...list.map(v => v.camera), main]);
  list.forEach((v, k) => assert.ok(rig.sky.at[k].equals(v.camera.position)));
  assert.ok(rig.sky.at[3].equals(main.position));
  // Nothing prepared, nothing drawn and nothing touched.
  const quiet = recorder(), none = make(quiet); none.prepare(main, [], () => 0); none.draw(quiet.renderer);
  assert.deepEqual(quiet.renderer.log, []); assert.deepEqual(quiet.yard.calls, []);
});

test('the screen rectangle of a pane partly behind the eye is the whole screen', () => {
  const rig = recorder(), views = make(rig), o = byId('living');
  // Facing the living room window from 3 m: a rectangle well inside the screen, round the pane's centre.
  const main = visitor([4.2, 3, 1.6], Math.PI), [ahead] = views.prepare(main, ['living'], () => 1), [u0, v0, u1, v1] = ahead.rect;
  assert.ok(0 < u0 && u0 < u1 && u1 < 1 && 0 < v0 && v0 < v1 && v1 < 1, String(ahead.rect));
  const c = v3(o.centre).project(main), u = (c.x + 1) / 2, v = (c.y + 1) / 2;
  assert.ok(u0 < u && u < u1 && v0 < v && v < v1);
  assert.deepEqual(views.prepared, [ahead]);
  // Standing at the glass looking along the wall, the pane's chimney-end corners are behind the eye.
  const [beside] = views.prepare(visitor([4.7, .3, 1.55], Math.PI / 2), ['living'], () => 1);
  assert.deepEqual(beside.rect, [0, 0, 1, 1]);
});
