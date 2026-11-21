import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {ceilingHeight} from '../shared/interior.js';
import {buildInterior} from '../public/space/interior/index.js';
import {LAKESIDE_SPACE} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING} from '../shared/lakeside-dressing.js';
import {viewOpenings} from '../shared/window-views.js';
import {stubArt} from './space-scene.test.js';

const openings = viewOpenings(I, LAKESIDE_SPACE, LAKESIDE_DRESSING);
// (the flames and the glow are drawn over the live views, so they stand in the interior's overlay, not its scene)
const overlays = new WeakMap(), build = () => { const out = buildInterior(THREE, {interior: I, art: stubArt(), openings}); overlays.set(out.scene, out.overlay); return out; };
const part = (scene, name) => scene.getObjectByName('fireplace').getObjectByName(name) ?? overlays.get(scene).getObjectByName('fire-light').getObjectByName(name);
// A mesh's box in the interior frame [a, d, z]: three x = a, y = z, z = −d.
const frame = m => { m.updateWorldMatrix(true, false); const b = new THREE.Box3().setFromObject(m); return {a: [b.min.x, b.max.x], d: [-b.max.z, -b.min.z], z: [b.min.y, b.max.y]}; };
const near = (x, y, msg) => assert.ok(Math.abs(x - y) < 1e-6, `${msg}: ${x} against ${y}`);
const ZERO_FIRE = {fire: 0, embers: 0, seconds: 0, motion: true};

test('the fireplace stands on the living room\'s gable wall where the blueprint puts it', () => {
  const {scene, dispose} = build(), {fireplace: fp} = I;
  for (const n of ['breast', 'slab', 'mantel', 'breast-upper', 'embers', 'flames', 'fire-glow']) assert.ok(part(scene, n), n);
  const b = frame(part(scene, 'breast'));
  near(b.a[0], 0, 'breast a0'); near(b.a[1], fp.breast.depth, 'breast a1'); near(b.d[0], fp.d - fp.breast.width / 2, 'breast d0');
  near(b.d[1], fp.d + fp.breast.width / 2, 'breast d1'); near(b.z[0], 0, 'breast z0'); near(b.z[1], I.groundCeiling, 'breast z1');
  const s = frame(part(scene, 'slab'));
  near(s.a[1], fp.breast.depth + fp.slab, 'slab reach'); near(s.d[0], b.d[0], 'slab d0'); near(s.d[1], b.d[1], 'slab d1'); near(s.z[1], .05, 'slab height');
  const m = frame(part(scene, 'mantel'));
  near(m.z[1], fp.mantel, 'mantel top'); near(m.d[1] - m.d[0], 2.2, 'mantel width'); near(m.z[1] - m.z[0], .08, 'mantel thickness'); near(m.a[1] - m.a[0], .2, 'mantel depth');
  const u = frame(part(scene, 'breast-upper')), up = fp.upper;
  near(u.a[1], up.depth, 'upper a1'); near(u.d[0], fp.d - up.width / 2, 'upper d0'); near(u.d[1], fp.d + up.width / 2, 'upper d1'); near(u.z[0], I.floorRise, 'upper floor');
  near(u.z[1], I.floorRise + ceilingHeight(I, 1, u.d[1]), 'upper ceiling at its high-d side');
  // the mouth is cut 0.35 m deep: nothing of the breast's front stands in the opening, and its back is at a = 0.15
  const g = part(scene, 'breast').geometry, p = g.getAttribute('position');
  let back = 0;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) - (fp.breast.depth - .35)) < 1e-6) back++;
  assert.ok(back >= 4, 'the mouth\'s back wall');
  for (const mesh of ['breast', 'slab', 'mantel', 'breast-upper']) assert.ok(part(scene, mesh).geometry.getAttribute('light'), `${mesh} carries light`);
  dispose();
});

test('the breasts fill the blueprint\'s obstacles and nothing of the fireplace stands beyond them where a visitor walks', () => {
  const {scene, dispose} = build(), GROW = .12, SLAB = .05;
  const parts = [scene.getObjectByName('fireplace'), overlays.get(scene).getObjectByName('fire-light')];
  for (const g of parts) g.updateWorldMatrix(true, true);
  for (const g of parts) g.traverse(o => {
    if (!o.isMesh) return;
    const p = o.geometry.getAttribute('position'), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      const a = v.x, d = -v.z, z = v.y;
      if (z <= .1 || z >= 2.0 + 1e-9 || z <= SLAB + 1e-9) continue;
      assert.ok(I.obstacles.some(ob => ob.floor === 0 && a >= ob.a[0] - GROW - 1e-6 && a <= ob.a[1] + GROW + 1e-6 && d >= ob.d[0] - GROW - 1e-6 && d <= ob.d[1] + GROW + 1e-6),
        `${o.name} vertex ${[a, d, z].map(x => x.toFixed(3))} stands where a visitor walks`);
    }
  });
  dispose();
});

test('the flames show only while the fire burns, and stand still under reduced motion', () => {
  const {scene, setFire, dispose} = build(), flames = part(scene, 'flames');
  assert.equal(flames.visible, false, 'cold at build');
  setFire(ZERO_FIRE); assert.equal(flames.visible, false);
  setFire({fire: .02, embers: 0, seconds: 0, motion: true}); assert.equal(flames.visible, false);
  const tips = () => { scene.updateMatrixWorld(true); return flames.children.map(c => new THREE.Box3().setFromObject(c)).map(b => [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]); };
  setFire({fire: 1, embers: 1, seconds: 3, motion: true}); assert.equal(flames.visible, true);
  assert.ok(flames.children.length >= 3 && flames.children.length <= 5);
  const first = tips(); setFire({fire: 1, embers: 1, seconds: 4.3, motion: true});
  assert.notDeepEqual(tips(), first, 'sways with the clock');
  setFire({fire: 1, embers: 1, seconds: 3, motion: false}); const still = tips();
  setFire({fire: 1, embers: 1, seconds: 9.1, motion: false}); assert.deepEqual(tips(), still, 'still without motion');
  // height and opacity follow the fire
  setFire({fire: .3, embers: 1, seconds: 0, motion: false}); const low = tips(); const opacity = flames.children[0].material.opacity;
  setFire({fire: 1, embers: 1, seconds: 0, motion: false});
  assert.ok(tips()[0][3] > low[0][3] && flames.children[0].material.opacity > opacity);
  // nothing is non-finite for missing inputs
  setFire({}); setFire({fire: NaN, embers: undefined, seconds: Infinity, motion: true});
  scene.updateMatrixWorld(true); tips().flat().forEach(x => assert.ok(Number.isFinite(x)));
  dispose();
});

test('the embers glow after the fire and are dark when cold', () => {
  const {scene, setFire, dispose} = build(), embers = part(scene, 'embers'), glow = part(scene, 'fire-glow');
  const colour = () => embers.material.color.toArray();
  setFire(ZERO_FIRE); const cold = colour();
  assert.ok(Math.max(...cold) < .1, `dark when cold: ${cold}`); assert.equal(glow.material.uniforms.opacity.value, 0);
  setFire({fire: 0, embers: 1, seconds: 0, motion: true}); const warm = colour();
  assert.ok(warm[0] > .5 && warm[0] > warm[1] && warm[1] > warm[2], `orange: ${warm}`);
  assert.equal(part(scene, 'flames').visible, false);
  const faint = glow.material.uniforms.opacity.value; assert.ok(faint > 0, 'a faint glow after the fire');
  setFire({fire: 1, embers: 1, seconds: 0, motion: true}); assert.ok(glow.material.uniforms.opacity.value > faint, 'the glow follows the fire');
  dispose();
});

test('nothing in the fireplace is a light source, and its stone takes the room\'s light', () => {
  const {scene, dispose} = build(), group = scene.getObjectByName('fireplace');
  group.traverse(o => assert.ok(!o.isLight, o.name));
  for (const n of ['breast', 'slab', 'mantel', 'breast-upper']) {
    const m = part(scene, n); assert.ok(m.material.vertexColors); assert.ok(m.material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile, `${n} is lit`);
  }
  const slab = part(scene, 'slab'), p = slab.geometry.getAttribute('position'), l = slab.geometry.getAttribute('light');
  let top = 0;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - .05) < 1e-6 && p.getX(i) > .5 + 1e-6) { top++; assert.ok(l.getZ(i) > 0, `fire weight at ${i}`); }
  assert.ok(top > 0);
  for (const n of ['embers', 'flames']) assert.ok(part(scene, n).material?.isMeshBasicMaterial || part(scene, n).children[0].material.isMeshBasicMaterial, n);
  assert.equal(part(scene, 'fire-glow').material.blending, THREE.AdditiveBlending);
  dispose();
});

test('the fireplace builds as well when the lit materials could not be made, with the shell\'s Lambert ones', () => {
  const warn = console.warn; console.warn = () => {};
  // (the lit surfaces' materials: vertex-coloured basic materials over a painted map; the fire's own vertex-coloured flames and embers have none)
  class Failing extends THREE.MeshBasicMaterial { constructor(o) { if (o?.vertexColors && o?.map) throw new Error('no lit material'); super(o); } }
  let built; try { built = buildInterior({...THREE, MeshBasicMaterial: Failing}, {interior: I, art: stubArt(), openings}); } finally { console.warn = warn; } overlays.set(built.scene, built.overlay);
  const {scene, setFire, lit, dispose} = built;
  assert.equal(lit, false);
  for (const n of ['breast', 'slab', 'mantel', 'breast-upper']) assert.ok(part(scene, n).material.isMeshLambertMaterial, n);
  setFire({fire: 1, embers: 1, seconds: 2, motion: true}); assert.equal(part(scene, 'flames').visible, true);
  dispose();
});
