import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {LAKESIDE_SPACE} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING} from '../shared/lakeside-dressing.js';
import {viewOpenings} from '../shared/window-views.js';
import {createLightField, lightAt} from '../shared/interior-light.js';
import {createInteriorLight} from '../public/space/interior/light.js';

const field = createLightField(I, viewOpenings(I, LAKESIDE_SPACE, LAKESIDE_DRESSING));
// A frame's dials with every term in play: a cool day, a little fill, each room's lamp at its own level and the fire burning.
const DIALS_NOW = {day: [.5, .6, .7], fill: [.01, .02, .03], lamps: I.rooms.map((_, i) => (i + 1) / 20), fire: .7, embers: 1, doorway: .2};
// The shader's stand-in for a compile: the basic material's own chunks, as three hands them to onBeforeCompile.
const compile = m => { const s = {uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader}; m.onBeforeCompile(s); return s; };
const rgb = u => Array.isArray(u.value) ? u.value : [u.value.x, u.value.y, u.value.z];

test('the lit material sums the dials by a vertex\'s weights, as lightAt does', () => {
  const light = createInteriorLight(THREE, {rooms: I.rooms.length}), u = light.uniforms;
  light.set(DIALS_NOW);
  const samples = [[0, [4.2, .6, 1], [0, 1, 0]], [0, [1.2, 3.5, .4], [1, 0, 0]], [0, [9, 3, 0], [0, 0, 1]], [0, [14, 9, 2.7], [0, 0, -1]],
    [0, [3, 10, 0], [0, 0, 1]], [1, [3, 3, 3], [0, 0, 1]], [1, [16, 11, 4], [-1, 0, 0]], [0, [-1, -1, 0], [0, 0, 1]]];
  for (const [floor, p, n] of samples) {
    const w = field.weigh(floor, p, n), lamp = w.room < 0 ? 0 : u.lamps.value[w.room];
    // the vertex shader's sum, term for term
    const shaded = [0, 1, 2].map(i => rgb(u.day)[i] * w.day + rgb(u.fill)[i] + rgb(u.warm)[i] * lamp * w.lamp + rgb(u.fireWarm)[i] * u.fire.value * w.fire);
    const want = lightAt(field, DIALS_NOW, floor, p, n);
    shaded.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-6, `${p} channel ${i}: ${v} against ${want[i]}`));
  }
  light.dispose();
});

test('every lit material shares one set of uniforms, and set(dials) fills them', () => {
  const light = createInteriorLight(THREE, {rooms: I.rooms.length});
  const a = light.material({}), b = light.material({side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0});
  assert.ok(a.isMeshBasicMaterial && a.vertexColors && b.side === THREE.DoubleSide && b.stencilWrite);
  const [sa, sb] = [compile(a), compile(b)];
  for (const k of ['day', 'fill', 'lamps', 'fire', 'warm', 'fireWarm']) {
    assert.equal(sa.uniforms[k], light.uniforms[k], k); assert.equal(sb.uniforms[k], light.uniforms[k], k);
  }
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  light.set(DIALS_NOW);
  assert.deepEqual(rgb(light.uniforms.day).map(v => +v.toFixed(9)), DIALS_NOW.day);
  assert.deepEqual(rgb(light.uniforms.fill).map(v => +v.toFixed(9)), DIALS_NOW.fill);
  assert.deepEqual([...light.uniforms.lamps.value].map(v => +v.toFixed(6)), DIALS_NOW.lamps);
  assert.ok(Math.abs(light.uniforms.fire.value - DIALS_NOW.fire) < 1e-12);
  light.dispose();
});

test('the shader patch declares the light attribute and a lamp array sized to the rooms', () => {
  const light = createInteriorLight(THREE, {rooms: I.rooms.length}), s = compile(light.material({}));
  assert.ok(s.vertexShader.includes('attribute vec4 light;'));
  assert.ok(s.vertexShader.includes(`lamps[${I.rooms.length}]`) && I.rooms.length === 18);
  assert.ok(s.vertexShader.includes('varying vec3 vLight;') && /vLight\s*=/.test(s.vertexShader));
  // vLight is set inside main, after the chunks it follows; the fragment multiplies the diffuse colour by it after vertex colour
  assert.ok(s.vertexShader.indexOf('vLight =') > s.vertexShader.indexOf('#include <color_vertex>'));
  assert.ok(s.vertexShader.indexOf('vLight =') > s.vertexShader.indexOf('void main'));
  assert.ok(s.fragmentShader.includes('varying vec3 vLight;') && s.fragmentShader.includes('diffuseColor.rgb *= vLight;'));
  assert.ok(s.fragmentShader.indexOf('diffuseColor.rgb *= vLight;') > s.fragmentShader.indexOf('#include <color_fragment>'));
  assert.ok(s.fragmentShader.indexOf('varying vec3 vLight;') < s.fragmentShader.indexOf('void main'));
  light.dispose();
});
