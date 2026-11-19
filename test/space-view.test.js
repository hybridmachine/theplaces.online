import test from 'node:test';
import assert from 'node:assert/strict';
import {SpaceView, lightLevels, verticalFov} from '../public/space/space-view.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {skyColours, weatherSky} from '../public/space/sky-dome.js';
import {PainterlyPass, canPaint} from '../public/space/painterly-pass.js';

const close = (actual, expected, tolerance = 1e-6) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `${actual} ≉ ${expected}`));
const CLEAR = {cloud: .18, rain: 0}, RAIN = {cloud: .9, rain: .8};

test('the vertical field of view keeps 100° across and never opens past 75°', () => {
  assert.ok(Math.abs(verticalFov(16 / 9) - 67.67) <= .1, String(verticalFov(16 / 9)));
  assert.equal(verticalFov(390 / 844), 75);
  assert.equal(verticalFov(1), 75);
});

test('the clear sky is the day colours by day and the night scaling of them by night', () => {
  const day = [157, 179, 193].map(v => v / 255), horizon = [211, 211, 191].map(v => v / 255), night = [.22, .31, .43];
  const noon = skyColours({light: 1}, 0), midnight = skyColours({light: 0}, 0);
  close(noon.zenith, day); close(noon.horizon, horizon);
  close(midnight.zenith, day.map((v, i) => v * night[i])); close(midnight.horizon, horizon.map((v, i) => v * night[i]));
});

test('cloud dims the sky light as it dims the sun, and leaves the clear day as it was', () => {
  for (const light of [0, .3, .5, .7, 1]) {
    const clear = lightLevels({light}, CLEAR), rain = lightLevels({light}, RAIN);
    assert.ok(rain.hemisphere < clear.hemisphere, `hemisphere at light ${light}`);
    assert.ok(rain.direct < clear.direct || clear.direct === 0, `direct at light ${light}`);
    assert.equal(rain.blend, clear.blend);
  }
  // Clear skies keep today's light: day 1.7 and 2.3 less the thin cloud, night 1.1.
  assert.equal(lightLevels({light: 1}, CLEAR).hemisphere, 1.7);
  assert.equal(lightLevels({light: 0}, CLEAR).hemisphere, 1.1);
  assert.ok(Math.abs(lightLevels({light: 1}, CLEAR).direct - 2.3 * (1 - .18 * .65)) < 1e-9);
  // Cloud dims night and day by the same share, so night keeps its place against day.
  const ratio = light => lightLevels({light}, RAIN).hemisphere / lightLevels({light}, CLEAR).hemisphere;
  assert.ok(Math.abs(ratio(0) - ratio(1)) < 1e-9);
});

test('rain greys the sky colours the far ground fades toward, and clear skies keep them', () => {
  const clear = skyColours({light: 1}, 0);
  close(weatherSky(clear, CLEAR).horizon, clear.horizon); close(weatherSky(clear, CLEAR).zenith, clear.zenith);
  const wet = weatherSky(clear, RAIN);
  for (const key of ['zenith', 'horizon']) wet[key].forEach((v, i) => assert.ok(v < clear[key][i], `${key}[${i}]`));
});

test('thin cloud up to 0.2 lights the yard as clear skies do, and half cloud lies between clear and rain', () => {
  for (const light of [0, .3, .7, 1]) {
    const clear = lightLevels({light}, CLEAR), edge = lightLevels({light}, {cloud: .2, rain: 0}), half = lightLevels({light}, {cloud: .5, rain: 0}), rain = lightLevels({light}, RAIN);
    assert.equal(edge.hemisphere, clear.hemisphere);
    assert.ok(Math.abs(edge.direct - clear.direct) <= 2.3 * .02 * .65 + 1e-12, 'the sun keeps its own thin-cloud shade');
    assert.ok(half.hemisphere < clear.hemisphere && half.hemisphere > rain.hemisphere, `hemisphere at light ${light}`);
    assert.ok(half.direct < clear.direct && half.direct > rain.direct, `direct at light ${light}`);
  }
});

test('the painterly pass needs a context that can render to half-float colour', () => {
  const gl = names => ({getExtension: name => names.includes(name) ? {} : null});
  assert.equal(canPaint(gl(['EXT_color_buffer_float'])), true);
  assert.equal(canPaint(gl(['EXT_color_buffer_half_float'])), true);
  assert.equal(canPaint(gl(['EXT_color_buffer_float', 'EXT_color_buffer_half_float'])), true);
  assert.equal(canPaint(gl(['OES_texture_float_linear', 'WEBGL_lose_context'])), false);
  assert.equal(canPaint(gl([])), false);
  // A context that is already lost answers null for every extension, and one that throws must not break start-up.
  assert.equal(canPaint({getExtension() { throw new Error('lost'); }}), false);
  assert.equal(canPaint(null), false);
});

test('the painterly pass masks the lake in the yard and nothing indoors, where the downstairs floor lies at the water\'s height', async () => {
  const THREE = await import('../public/assets/vendor/three-0.170.0.module.js');
  const drawn = [], renderer = {setRenderTarget() {}, render(scene) { drawn.push(scene); }};
  const pass = new PainterlyPass(THREE, renderer), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const mask = () => pass.canvas.uniforms.waterMask.value;
  assert.match(pass.canvas.fragmentShader, /float water=max\(waterMask,through\)\*land\*/);
  pass.render(scene, camera); assert.equal(mask(), 1);
  pass.render(scene, camera, {water: false}); assert.equal(mask(), 0);
  pass.render(scene, camera, {water: true}); assert.equal(mask(), 1);
  pass.render(scene, camera, {water: false}); pass.render(scene, camera); assert.equal(mask(), 1, 'the yard is masked again by default');
  assert.equal(drawn.filter(x => x === scene).length, 5);
  pass.dispose();
});

test('the painterly pass draws the views after the scene and before the filter, and tells the filter where they lie', async () => {
  const THREE = await import('../public/assets/vendor/three-0.170.0.module.js');
  const order = [], renderer = {setRenderTarget(t) { order.push(['target', t]); }, render(scene) { order.push(['render', scene]); }};
  const pass = new PainterlyPass(THREE, renderer), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), u = pass.canvas.uniforms;
  assert.equal(pass.sceneTarget.stencilBuffer, true); assert.equal(pass.sceneTarget.resolveStencilBuffer, false);
  assert.deepEqual([pass.depth.format, pass.depth.type], [THREE.DepthStencilFormat, THREE.UnsignedInt248Type]);
  const eyes = [new THREE.Matrix4().makeTranslation(1, 2, 3), new THREE.Matrix4().makeTranslation(4, 5, 6)];
  const views = {prepared: [{rect: [.1, .2, .3, .4], eye: eyes[0]}, {rect: [0, 0, 1, 1], eye: eyes[1]}], draw(r) { assert.equal(r, renderer); order.push(['views']); }};
  pass.render(scene, camera, {water: false, views});
  assert.deepEqual(order.slice(0, 3), [['target', pass.sceneTarget], ['render', scene], ['views']]);
  assert.equal(order.filter(e => e[0] === 'views').length, 1);
  assert.equal(u.viewCount.value, 2); assert.deepEqual(u.viewRect.value[0].toArray(), [.1, .2, .3, .4]);
  assert.ok(u.viewEye.value[1].equals(eyes[1]));
  assert.match(pass.canvas.fragmentShader, /uniform int viewCount;uniform vec4 viewRect\[3\];uniform mat4 viewEye\[3\];/);
  // Where rectangles overlap, the tighter one is found first: the uniforms are filled smallest first.
  const wide = {rect: [0, 0, 1, 1], eye: eyes[0]}, mid = {rect: [.2, .2, .7, .8], eye: eyes[1]}, tight = {rect: [.4, .4, .5, .5], eye: new THREE.Matrix4()};
  pass.render(scene, camera, {views: {prepared: [wide, mid, tight], draw() {}}});
  assert.deepEqual(u.viewRect.value.map(r => r.toArray()), [tight.rect, mid.rect, wide.rect]);
  assert.ok(u.viewEye.value[2].equals(eyes[0]) && u.viewEye.value[1].equals(eyes[1]));
  // A draw that reports failure drew nothing: the filter is told of no views.
  pass.render(scene, camera, {views: {prepared: [wide], draw: () => false}});
  assert.equal(u.viewCount.value, 0);
  // Without views the filter is told of none, and the pass is as before.
  order.length = 0; pass.render(scene, camera);
  assert.equal(u.viewCount.value, 0); assert.ok(!order.some(e => e[0] === 'views'));
  pass.dispose();
});

test('an interior that fails to build is warned of once, keeps the door shut and sets an indoor visitor down at arrival', t => {
  const warnings = []; t.mock.method(console, 'warn', (...args) => warnings.push(args));
  // No art: the build reads the brushwork texture from it and throws.
  const view = {interior: I, art: null, space: S, inside: null, insideFailed: false,
    state: {place: 'cabin', floor: 1, position: [3, 9], yaw: .4, pitch: .1}};
  SpaceView.prototype.buildInside.call(view);
  assert.equal(view.insideFailed, true); assert.equal(view.inside, null);
  assert.deepEqual(view.state, {place: 'yard', position: [...S.arrival.position], yaw: S.arrival.yaw, pitch: S.arrival.pitch});
  assert.equal(warnings.length, 1);
  assert.doesNotThrow(() => SpaceView.prototype.buildInside.call(view));
  assert.equal(warnings.length, 1, 'a second call stays quiet'); assert.equal(view.inside, null);
});

// ── The cabin's windows, drawn through SpaceView.render with a recording renderer ──
// A SpaceView without a page: its own render, buildInside and window wiring, with the yard's sky, life and light stubbed, a
// real interior and a real painterly pass (or none, on plain) drawing into a renderer that records what it is asked.
const rig = async ({tier = 'full', stencil = true, state = {place: 'cabin', floor: 0, position: [4.2, 3], yaw: Math.PI, pitch: 0}, yard = {}} = {}) => {
  const THREE = await import('../public/assets/vendor/three-0.170.0.module.js');
  const {LAKESIDE_DRESSING: D} = await import('../shared/lakeside-dressing.js'), {SCENES} = await import('../shared/world.js');
  const {createViewBudget} = await import('../public/space/view-budget.js');
  const stubArt = () => ({surfaces: {hills: new THREE.Texture()}});   // the rooms paint with the hills' brushwork alone
  const log = [], failing = {yard: false}, stencilState = {locked: false, test: false, func: null};
  const renderer = {log, clippingPlanes: [], autoClear: true,
    getContext: () => ({isContextLost: () => false, getContextAttributes: () => ({stencil})}),
    setRenderTarget(target) { log.push(['target', target]); },
    render(scene, camera) { log.push(['render', scene, camera, {...stencilState}]); if (failing.yard && scene === view.scene) throw new Error('lost'); },
    state: {buffers: {stencil: {setTest(on) { if (!stencilState.locked) stencilState.test = on; log.push(['setTest', on]); }, setMask() {},
      setFunc(f, ref) { stencilState.func = ref; log.push(['setFunc', f, ref]); }, setOp() {}, setLocked(lock) { stencilState.locked = lock; }}}}};
  const view = Object.create(SpaceView.prototype), camera = new THREE.PerspectiveCamera(verticalFov(16 / 9), 16 / 9, .1, 4000);
  camera.rotation.order = 'YXZ';
  const meter = {tier, locked: true, frames: [], frame(t, o) { this.frames.push(o); return tier; }};
  Object.assign(view, {space: S, dressing: D, interior: I, skyConfig: SCENES[0].sky, art: stubArt(), renderer, camera, check: false, fixture: null,
    motion: true, frozenMotion: null, lastMotion: null, frozenCelestial: null, lastCelestial: null, celestialStudy: null, shown: true, passage: null,
    disposed: false, failed: false, state: structuredClone(state), door: 0, inside: null, insideFailed: false, views: null, viewsFailed: false, live: [],
    scene: new THREE.Scene(), meter, budget: createViewBudget(), passMode: tier === 'plain' ? 'off' : tier,
    pass: tier === 'plain' ? null : new PainterlyPass(THREE, renderer),
    yard: {cottage: {main: 0, second: 0, open: .6}, shown: true, setSky() {}, setGarden() {}, setCabinShown(s) { this.shown = s; }, ...yard},
    sky: {update: () => ({zenith: [.6, .7, .76], horizon: [.83, .83, .75]}), centreOn() {}},
    life: {frames: [], update(f) { this.frames.push(f); }, aim() {}}});
  view.step = () => {}; view.applyLight = () => {};
  view.buildInside();
  const frame = (n = 1) => { for (let i = 0; i < n; i++) view.render({world: {epoch: 0}}, 1_000_000 + i * 16); };
  // The yard scene's draws, and the options the pass was last given.
  const yardDraws = () => log.filter(e => e[0] === 'render' && e[1] === view.scene);
  return {THREE, view, log, renderer, frame, yardDraws, meter, D, failing};
};
const quietWarnings = t => { const warnings = []; t.mock.method(console, 'warn', (...args) => warnings.push(args)); return warnings; };

test('outdoors nothing is live and the pass is given no views', async t => {
  const {view, log, frame, yardDraws} = await rig({state: {place: 'yard', position: [...S.arrival.position], yaw: S.arrival.yaw, pitch: S.arrival.pitch}});
  const given = []; const render = view.pass.render.bind(view.pass); view.pass.render = (scene, camera, options) => { given.push(options); render(scene, camera, options); };
  frame(3);
  assert.deepEqual(view.liveViews, []); assert.equal(view.views, null);
  assert.ok(given.every(o => o.water === true && o.views == null));
  assert.equal(yardDraws().length, 3, 'the yard, once a frame');
  assert.ok(!log.some(e => e[0] === 'setFunc'), 'no stencil use');
  assert.ok(view.life.frames.every(f => f.rainAt === null));
});

test('indoors facing the living room window, its pane is live and the yard is drawn once more', async () => {
  const {view, frame, yardDraws, log} = await rig();
  frame();
  assert.deepEqual(view.liveViews, ['living']); assert.equal(view.inside.stencilOf('living'), 1);
  const draws = yardDraws();
  assert.equal(draws.length, 1, 'the yard, through the one pane');
  assert.notEqual(draws[0][2], view.camera); assert.deepEqual([draws[0][3].locked, draws[0][3].test, draws[0][3].func], [true, true, 1]);
  // Drawn into the pass's scene target after the rooms, and before the filter's first pass.
  const roomsAt = log.findIndex(e => e[0] === 'render' && e[1] === view.inside.scene), filterAt = log.findIndex(e => e[0] === 'target' && e[1] !== view.pass.sceneTarget);
  assert.deepEqual(log[roomsAt - 1], ['target', view.pass.sceneTarget]);
  assert.ok(roomsAt < log.indexOf(draws[0]) && log.indexOf(draws[0]) < filterAt);
  assert.equal(view.pass.canvas.uniforms.viewCount.value, 1);
  // The casement follows the world's, and on plain the same pane is live, drawn straight after the rooms.
  assert.ok(Math.abs(view.inside.scene.getObjectByName('casement').rotation.y) > .1);
  const plain = await rig({tier: 'plain'}); plain.frame();
  assert.deepEqual(plain.view.liveViews, ['living']); assert.equal(plain.yardDraws().length, 1);
  const plainLog = plain.log, at = plainLog.findIndex(e => e[0] === 'render' && e[1] === plain.view.inside.scene);
  assert.equal(plainLog.indexOf(plain.yardDraws()[0]), plainLog.findIndex((e, i) => i > at && e[0] === 'render'));
});

test('with the door shut the doorway is not drawn through; opening it makes it live', async () => {
  const {view, frame} = await rig({state: {place: 'cabin', floor: 0, position: [9, 2.5], yaw: Math.PI, pitch: 0}});
  frame(); assert.ok(!view.liveViews.includes('door'));
  view.door = 1; frame();
  assert.ok(view.liveViews.includes('door'));
  assert.ok(Math.abs(view.inside.scene.getObjectByName('door-leaf').rotation.y) > 1, 'the leaf stands open');
});

test('no more openings are live than the tier\'s cap and the budget allow', async () => {
  const hall = {place: 'cabin', floor: 0, position: [9, 6], yaw: Math.PI, pitch: .4};   // looking a little up the stairwell: with the a = 7 wall in the way, level there are only two panes in sight
  const full = await rig({state: hall}); full.view.door = 1; full.frame();
  assert.equal(full.view.liveViews.length, 3); assert.equal(full.yardDraws().length, 3);
  assert.equal(full.view.pass.canvas.uniforms.viewCount.value, 3);
  const light = await rig({tier: 'light', state: hall}); light.view.door = 1; light.frame();
  assert.equal(light.view.liveViews.length, 2);
  const tight = await rig({state: hall}); tight.view.door = 1; tight.view.budget.limit = () => 1; tight.frame();
  assert.equal(tight.view.liveViews.length, 1); assert.equal(tight.yardDraws().length, 1);
});

test('a context without stencil leaves every pane flat, with one warning and no error per frame', async t => {
  const warnings = quietWarnings(t), {view, frame, yardDraws} = await rig({stencil: false});
  assert.doesNotThrow(() => frame(4));
  assert.equal(warnings.length, 1); assert.match(String(warnings[0][0]), /windows could not be opened/);
  assert.equal(view.viewsFailed, true); assert.deepEqual(view.liveViews, []); assert.equal(yardDraws().length, 0);
  assert.ok(I.windows.every(w => view.inside.stencilOf(w.id) === 0));
  assert.equal(view.pass.canvas.uniforms.viewCount.value, 0);
});

test('a view set-up that throws leaves every pane flat, with one warning', async t => {
  const warnings = quietWarnings(t), {view, frame, yardDraws} = await rig({yard: {setCabinShown: undefined}});
  assert.doesNotThrow(() => frame(3));
  assert.equal(warnings.length, 1); assert.equal(view.viewsFailed, true);
  assert.deepEqual(view.liveViews, []); assert.equal(yardDraws().length, 0);
  assert.ok(I.windows.every(w => view.inside.stencilOf(w.id) === 0));
});

test('more than one live opening holds the tier meter; one does not', async () => {
  const one = await rig(); one.frame();
  assert.deepEqual(one.meter.frames.at(-1), {indoors: true, hold: false});
  const many = await rig({state: {place: 'cabin', floor: 0, position: [9, 6], yaw: Math.PI, pitch: 0}}); many.view.door = 1; many.frame();
  assert.deepEqual(many.meter.frames.at(-1), {indoors: true, hold: true});
  const out = await rig({state: {place: 'yard', position: [...S.arrival.position], yaw: S.arrival.yaw, pitch: S.arrival.pitch}}); out.frame();
  assert.deepEqual(out.meter.frames.at(-1), {indoors: false, hold: false});
});

test('rain is centred on the cabin while the visitor is indoors', async () => {
  const {view, frame, THREE} = await rig(), {eyePosition} = await import('../shared/walker.js'), {toThree} = await import('../public/space/geometry.js');
  frame();
  const at = view.life.frames.at(-1).rainAt, want = new THREE.Vector3(...toThree(eyePosition(S, {position: S.cabin.center})));
  assert.ok(at?.isVector3 && at.distanceTo(want) < 1e-9, String(at?.toArray()));
});

test('a view draw that throws gives the views up for good, with one warning and no error, and the panes go flat', async t => {
  const warnings = quietWarnings(t), {view, frame, failing, yardDraws} = await rig();
  frame(); assert.deepEqual(view.liveViews, ['living']); assert.equal(warnings.length, 0);
  failing.yard = true;
  assert.doesNotThrow(() => frame());
  assert.equal(warnings.length, 1); assert.match(String(warnings[0][0]), /windows could not be opened/); assert.equal(view.viewsFailed, true);
  assert.equal(view.pass.canvas.uniforms.viewCount.value, 0, 'the filter is told of no views that frame');
  const before = yardDraws().length;
  assert.doesNotThrow(() => frame(2));
  assert.equal(warnings.length, 1); assert.deepEqual(view.liveViews, []); assert.equal(yardDraws().length, before);
  assert.ok(I.windows.every(w => view.inside.stencilOf(w.id) === 0) && view.inside.stencilOf('door') === 0);
  // On plain, the same.
  const plain = await rig({tier: 'plain'}); plain.failing.yard = true;
  assert.doesNotThrow(() => plain.frame(2));
  assert.equal(warnings.length, 2); assert.deepEqual(plain.view.liveViews, []);
});

test('a view prepare that throws gives the views up, with one warning, and leaves the panes flat that frame', async t => {
  const warnings = quietWarnings(t), {view, frame, yardDraws} = await rig();
  view.windowViews(); view.views.prepare = () => { throw new Error('bad'); };
  assert.doesNotThrow(() => frame(3));
  assert.equal(warnings.length, 1); assert.equal(view.viewsFailed, true);
  assert.deepEqual(view.liveViews, []); assert.equal(yardDraws().length, 0);
  assert.ok(I.windows.every(w => view.inside.stencilOf(w.id) === 0));
});
