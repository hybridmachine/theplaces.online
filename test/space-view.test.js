import test from 'node:test';
import assert from 'node:assert/strict';
import {SpaceView, lightLevels, verticalFov} from '../public/space/space-view.js';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {skyColours, weatherSky} from '../public/space/sky-dome.js';
import {PainterlyPass, canPaint} from '../public/space/painterly-pass.js';
import {DIALS, interiorDials} from '../shared/interior-light.js';
import {cottageFixture, createCottageState} from '../shared/cottage.js';
import {pathLightLevel} from '../shared/path-lights.js';
import {viewConditions} from '../shared/world.js';
import {WorldStore} from '../src/store.js';
import {sceneText} from '../public/scene-description.js';
import {stepIndoors} from '../shared/walker.js';
import {bareInterior} from '../shared/furniture.js';
import {floorArea} from '../shared/interior.js';

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
  const pass = new PainterlyPass(THREE, renderer, {stencil: true}), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), u = pass.canvas.uniforms;
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

test('with something drawn over the views, only that last draw into the scene target resolves its depth', async () => {
  const THREE = await import('../public/assets/vendor/three-0.170.0.module.js');
  const pass = {}, seen = [], renderer = {setRenderTarget() {}, render(scene) { seen.push([scene.name, pass.p.sceneTarget.resolveDepthBuffer]); }};
  pass.p = new PainterlyPass(THREE, renderer, {stencil: true});
  const scene = new THREE.Scene(), yard = new THREE.Scene(), top = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); scene.name = 'rooms'; yard.name = 'yard'; top.name = 'over';
  const views = {prepared: [], draw(r) { r.render(yard); return true; }, over(r) { r.render(top); }};
  pass.p.render(scene, camera, {water: false, views});
  assert.deepEqual(seen.slice(0, 3), [['rooms', false], ['yard', false], ['over', true]]);
  assert.equal(pass.p.sceneTarget.resolveDepthBuffer, true);
  // without an `over`, every draw resolves its depth as before
  seen.length = 0; pass.p.render(scene, camera, {water: false, views: {prepared: [], draw(r) { r.render(yard); }}});
  assert.deepEqual(seen.slice(0, 2), [['rooms', true], ['yard', true]]);
  // a views draw that throws leaves the target resolving its depth
  assert.throws(() => pass.p.render(scene, camera, {views: {prepared: [], draw() { throw new Error('x'); }, over() {}}}));
  assert.equal(pass.p.sceneTarget.resolveDepthBuffer, true);
  pass.p.dispose();
});

test('the painterly pass builds its depth-stencil scene target only when asked; by default its target is the plain one', async () => {
  const THREE = await import('../public/assets/vendor/three-0.170.0.module.js'), renderer = {setRenderTarget() {}, render() {}};
  const plain = new PainterlyPass(THREE, renderer), want = new THREE.DepthTexture(1, 1);
  assert.equal(plain.sceneTarget.stencilBuffer, false); assert.equal(plain.sceneTarget.depthBuffer, true); assert.equal(plain.sceneTarget.samples, 4);
  assert.deepEqual([plain.depth.format, plain.depth.type], [want.format, want.type]);
  assert.equal(plain.sceneTarget.depthTexture, plain.depth);
  const marked = new PainterlyPass(THREE, renderer, {stencil: true});
  assert.equal(marked.sceneTarget.stencilBuffer, true); assert.equal(marked.sceneTarget.resolveStencilBuffer, false);
  assert.deepEqual([marked.depth.format, marked.depth.type], [THREE.DepthStencilFormat, THREE.UnsignedInt248Type]);
  plain.dispose(); marked.dispose();
});

test('the canvas asks for a stencil only with the interior switched on', async () => {
  const asked = [], canvas = {getContext(kind, attributes) { asked.push([kind, attributes]); return null; }};
  for (const interior of [null, I]) {
    const view = {disposed: false, memory: {load: () => null}, space: S, canvas, interior};
    assert.equal(await SpaceView.prototype.init.call(view), false);
  }
  assert.deepEqual(asked, [['webgl2', {alpha: false, antialias: true, stencil: false, powerPreference: 'low-power'}],
    ['webgl2', {alpha: false, antialias: true, stencil: true, powerPreference: 'low-power'}]]);
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

// ── Walking by the furnished blueprint, or the bare one when the furniture did not build ──
// Walks west along the sofa's line from the room's middle for long enough to reach whatever stops the visitor; returns where it stopped.
const walkWest = view => {
  let s = {place: 'cabin', floor: 0, position: [7, I.furniture.find(f => f.id === 'sofa').at[1]], yaw: 3 * Math.PI / 2, pitch: 0};
  for (let i = 0; i < 400; i++) s = stepIndoors(view.walkPlan, s, {forward: 1}, 1 / 30);
  return s.position[0];
};
test('a furnished view walks by the furnished blueprint, and one whose furniture did not build by the chimney breasts alone', async () => {
  const furnished = await rig(), bare = await rig();
  assert.equal(furnished.view.furnished, true); assert.equal(furnished.view.walkPlan, I);
  const sofa = I.furniture.find(f => f.id === 'sofa'), breast = I.breasts[0];
  assert.ok(walkWest(furnished.view) > sofa.at[0], 'stops at the sofa');
  bare.view.inside.furnished = false;
  assert.equal(bare.view.furnished, false);
  assert.equal(bare.view.walkPlan.furniture.length, 0); assert.equal(bare.view.walkPlan, bare.view.walkPlan, 'made once');
  assert.deepEqual(bare.view.walkPlan.obstacles, I.breasts); assert.equal(bare.view.interior, I, 'the place memory keeps the furnished blueprint');
  const x = walkWest(bare.view);
  assert.ok(x < sofa.at[0] && x >= breast.a[1] - 1e-6, `stops at the chimney breast, at ${x}`);
});

test('a view whose sofa could not be drawn walks through where the sofa stood, and is still stopped by the pieces drawn', async t => {
  const warnings = quietWarnings(t), {view} = await rig(), {buildInterior} = await import('../public/space/interior/index.js');
  const {RECIPES} = await import('../public/space/interior/furniture.js'), THREE = await import('../public/assets/vendor/three-0.170.0.module.js');
  view.inside.dispose();
  view.inside = buildInterior(THREE, {interior: I, art: view.art, openings: view.openings, recipes: {...RECIPES, sofa: () => { throw new Error('a broken sofa'); }}});
  assert.equal(warnings.length, 1); assert.equal(view.furnished, true);
  assert.equal(floorArea(view.walkPlan, 0, [4.95, 3.5]), true, 'the sofa\'s floor is walkable');
  assert.equal(view.walkPlan, view.walkPlan, 'made once');
  for (const id of ['console', 'armchair-front', 'armchair-back']) assert.equal(floorArea(view.walkPlan, 0, I.furniture.find(e => e.id === id).at), false, `${id} still stops the walker`);
  assert.equal(view.interior, I, 'the place memory keeps the furnished blueprint');
});

test('a blueprint from before the furniture (its breasts in its obstacles alone) keeps its chimneys solid in the walk plan', async t => {
  const {furniture, breasts, spots, stairRail, obstacles, ...old} = structuredClone(I), legacy = {...old, obstacles: breasts};
  assert.equal(floorArea(legacy, 0, [.4, 3.5]), false);
  assert.equal(floorArea(bareInterior(legacy), 0, [.4, 3.5]), false, 'bareInterior keeps them');
  quietWarnings(t);
  const {view} = await rig({interior: legacy});
  assert.equal(view.walkPlan, legacy, 'a blueprint that never had furniture is walked as it is');
  assert.equal(floorArea(view.walkPlan, 0, [.4, 3.5]), false, 'inside the living-room chimney');
});

test('a view built from the bare blueprint is not furnished, so its description carries no clause', async () => {
  const {view} = await rig({interior: bareInterior(I)});
  assert.equal(view.furnished, false);
  assert.doesNotMatch(sceneText({world: {epoch: 0, nest: {stage: 'built'}}}, 0, {room: view.room, furnished: view.furnished}).description, /sofa/);
});

// ── The cabin's windows, drawn through SpaceView.render with a recording renderer ──
// A SpaceView without a page: its own render, buildInside and window wiring, with the yard's sky, life and light stubbed, a
// real interior and a real painterly pass (or none, on plain) drawing into a renderer that records what it is asked.
const rig = async ({tier = 'full', stencil = true, extensions = [], interior = I, state = {place: 'cabin', floor: 0, position: [4.2, 3], yaw: Math.PI, pitch: 0}, yard = {}} = {}) => {
  const THREE = await import('../public/assets/vendor/three-0.170.0.module.js');
  const {LAKESIDE_DRESSING: D} = await import('../shared/lakeside-dressing.js'), {SCENES} = await import('../shared/world.js');
  const {createViewBudget} = await import('../public/space/view-budget.js');
  const stubArt = () => ({surfaces: {hills: new THREE.Texture()}});   // the rooms paint with the hills' brushwork alone
  const log = [], failing = {yard: false}, stencilState = {locked: false, test: false, func: null};
  const renderer = {log, clippingPlanes: [], autoClear: true, extensions: {has: name => extensions.includes(name)},
    getContext: () => ({isContextLost: () => false, getContextAttributes: () => ({stencil})}),
    setRenderTarget(target) { log.push(['target', target]); },
    render(scene, camera) { log.push(['render', scene, camera, {...stencilState, autoClear: renderer.autoClear}]); if (failing.yard && scene === view.scene) throw new Error('lost'); },
    state: {buffers: {stencil: {setTest(on) { if (!stencilState.locked) stencilState.test = on; log.push(['setTest', on]); }, setMask() {},
      setFunc(f, ref) { stencilState.func = ref; log.push(['setFunc', f, ref]); }, setOp() {}, setLocked(lock) { stencilState.locked = lock; }}}}};
  const view = Object.create(SpaceView.prototype), camera = new THREE.PerspectiveCamera(verticalFov(16 / 9), 16 / 9, .1, 4000);
  camera.rotation.order = 'YXZ';
  const meter = {tier, locked: true, frames: [], frame(t, o) { this.frames.push(o); return tier; }};
  Object.assign(view, {space: S, dressing: D, interior, skyConfig: SCENES[0].sky, art: stubArt(), renderer, camera, check: false, fixture: null,
    motion: true, frozenMotion: null, lastMotion: null, frozenCelestial: null, lastCelestial: null, celestialStudy: null, shown: true, passage: null,
    disposed: false, failed: false, state: structuredClone(state), door: 0, inside: null, insideFailed: false, views: null, viewsFailed: false, live: [],
    dials: null, dialsFailed: false, lightChecked: false,
    scene: new THREE.Scene(), meter, budget: createViewBudget(), passMode: tier === 'plain' ? 'off' : tier,
    pass: null,
    yard: {cottage: {main: 0, second: 0, open: .6}, shown: true, doorway: [], setSky() {}, setGarden() {}, setCabinShown(s) { this.shown = s; }, setDoorway(level) { this.doorway.push(level); }, ...yard},
    sky: {update: () => ({zenith: [.6, .7, .76], horizon: [.83, .83, .75]}), centreOn() {}},
    life: {frames: [], update(f) { this.frames.push(f); }, aim() {}}});
  view.step = () => {}; view.applyLight = () => {};
  if (tier !== 'plain') view.pass = view.makePass(renderer);   // as build makes it
  view.buildInside();
  // n frames 16 ms apart from `now`, of `snapshot` (by default a world with no cottage), under `study`.
  const frame = (n = 1, {snapshot = {world: {epoch: 0}}, now = 1_000_000, study = null} = {}) => { for (let i = 0; i < n; i++) view.render(snapshot, now + i * 16, study); };
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

test('the rooms\' added light (halos, flames, the fire\'s glow) is drawn over the views, before the filter, with no stencil and no clear', async () => {
  const overlaid = ['halos', 'flames', 'fire-glow'];
  // at night (every lamp lit), from the back of the third bedroom looking up at its roof window, the lit lamp's halo in front of the live pane
  const past = {place: 'cabin', floor: 1, position: [14.5, 6.6], yaw: Math.PI, pitch: .3};
  for (const tier of ['full', 'plain']) {
    const {view, frame, log, yardDraws} = await rig({tier, state: past}), {overlay, scene} = view.inside, state = false;
    frame(1, {study: 'night'});
    for (const name of overlaid) { assert.ok(overlay.getObjectByName(name), `${name} in the overlay`); assert.equal(scene.getObjectByName(name), undefined, `${name} not in the rooms`); }
    const rooms = log.findIndex(e => e[0] === 'render' && e[1] === scene), over = log.findIndex(e => e[0] === 'render' && e[1] === overlay);
    const lastYard = yardDraws().length ? log.indexOf(yardDraws().at(-1)) : -1, filter = view.pass ? log.findIndex((e, i) => i > rooms && e[0] === 'target' && e[1] !== view.pass.sceneTarget) : log.length;
    const where = `${tier}, ${state ? 'facing away' : 'facing the window'}`;
    assert.equal(yardDraws().length, state ? 0 : 1, where);
    assert.ok(rooms >= 0 && over > rooms && over > lastYard && over < filter, `${where}: rooms ${rooms}, last yard ${lastYard}, overlay ${over}, filter ${filter}`);
    if (view.pass) assert.ok(!log.slice(rooms, over).some(e => e[0] === 'target' && e[1] !== view.pass.sceneTarget), `${where}: into the scene target`);
    assert.deepEqual([log[over][3].test, log[over][3].autoClear], [false, false], `${where}: no stencil test, no clear`);
    assert.equal(log[over][2], view.camera, `${where}: from the visitor's eye`);
    assert.equal(view.renderer.autoClear, true, `${where}: autoClear given back`);
    // the filter is still told of the views alone
    if (view.pass) assert.equal(view.pass.canvas.uniforms.viewCount.value, state ? 0 : 1);
  }
  // Where none of it lies over a live pane it is drawn with the rooms and the overlay is not drawn: facing the window with the lamp and
  // the fire behind, facing the lamp with no pane in sight, and by day with the lamp and the fire out.
  const away = {place: 'cabin', floor: 0, position: [3.8, 1.2], yaw: 0, pitch: .1};
  for (const [pose, study] of [[undefined, 'night'], [away, 'night'], [past, 'day']]) {
    const {view, frame, log} = await rig(pose ? {state: pose} : {}); frame(1, {study});
    assert.ok(!log.some(e => e[0] === 'render' && e[1] === view.inside.overlay), `${study} ${pose?.position}`);
    for (const name of overlaid) assert.ok(view.inside.scene.getObjectByName(name), `${name} with the rooms`);
  }
  // and back to the overlay when it lies over a pane again
  const {view, frame, log} = await rig({state: away}); frame(1, {study: 'night'}); view.state = structuredClone(past); frame(1, {study: 'night'});
  assert.ok(log.some(e => e[0] === 'render' && e[1] === view.inside.overlay)); assert.equal(view.inside.scene.getObjectByName('halos'), undefined);
});

test('render draws indoors through drawIndoors, the one indoor draw the browser checks call too, and its ids are the live ones', async () => {
  const {view, frame, yardDraws} = await rig(), calls = [], draw = view.drawIndoors;
  view.drawIndoors = function (...args) { const ids = draw.apply(this, args); calls.push(ids); return ids; };
  frame(2);
  assert.deepEqual(calls, [['living'], ['living']]); assert.deepEqual(view.liveViews, ['living']); assert.equal(yardDraws().length, 2);
  // With `flat` no pane is live and the yard is not drawn through any.
  assert.deepEqual(draw.call(view, {flat: true}), []); assert.equal(view.inside.stencilOf('living'), 0); assert.equal(yardDraws().length, 2);
});

test('with the door shut the doorway is not drawn through; opening it makes it live', async () => {
  const {view, frame} = await rig({state: {place: 'cabin', floor: 0, position: [9, 2.5], yaw: Math.PI, pitch: 0}});
  frame(); assert.ok(!view.liveViews.includes('door'));
  view.door = 1; frame();
  assert.ok(view.liveViews.includes('door'));
  assert.ok(Math.abs(view.inside.scene.getObjectByName('door-leaf').rotation.y) > 1, 'the leaf stands open');
});

test('no more openings are live than the tier\'s cap and the budget allow', async () => {
  // Just inside the open door, past its leaf, turned towards the stair and looking down: the doorway at the screen's edge, the study
  // window through the hall-study opening and the dining window through the hall-dining one, all on this floor and past its walls.
  // (The only pose with three on this floor on a 0.2 m grid of the hall clear of the open leaf. A roof pane up the well, as the
  // third bedroom's from [9, 6], passes the stairwell rule but stands behind the landing's walls, which that rule does not judge.)
  const hall = {place: 'cabin', floor: 0, position: [8.8, .6], yaw: .916, pitch: -.6};
  const full = await rig({state: hall}); full.view.door = 1; full.frame();
  assert.deepEqual([...full.view.liveViews].sort(), ['dining', 'door', 'study']); assert.equal(full.yardDraws().length, 3);
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

test('the pass gets the depth-stencil scene target with the interior on, and the plain one without it', async () => {
  const on = await rig(), off = await rig({interior: null, state: {place: 'yard', position: [...S.arrival.position], yaw: S.arrival.yaw, pitch: S.arrival.pitch}});
  assert.equal(on.view.pass.sceneTarget.stencilBuffer, true);
  assert.equal(off.view.pass.sceneTarget.stencilBuffer, false); assert.equal(off.view.pass.depth.format, new on.THREE.DepthTexture(1, 1).format);
  off.frame(2); assert.deepEqual(off.view.liveViews, []);
});

test('a browser with multisampled render-to-texture keeps the panes flat through the pass, warned of once, and opens them on plain', async t => {
  const warnings = quietWarnings(t), {view, frame, yardDraws} = await rig({extensions: ['WEBGL_multisampled_render_to_texture']});
  assert.equal(view.pass.sceneTarget.stencilBuffer, false);
  assert.doesNotThrow(() => frame(4));
  assert.equal(warnings.length, 1); assert.match(String(warnings[0][0]), /windows stay blank/);
  assert.deepEqual(view.liveViews, []); assert.equal(yardDraws().length, 0);
  assert.ok(I.windows.every(w => view.inside.stencilOf(w.id) === 0));
  // The extension only matters to the pass's multisampled scene target. Stepped to plain, the rooms and the yard go straight to
  // the canvas, whose stencil is all the views need: the same view opens its panes, with no further warning.
  view.setPass('off'); frame(2);
  assert.deepEqual(view.liveViews, ['living']); assert.ok(yardDraws().length > 0); assert.equal(warnings.length, 1);
  // Back through the pass they are flat again.
  view.setPass('full'); const drawn = yardDraws().length; frame(2);
  assert.deepEqual(view.liveViews, []); assert.equal(yardDraws().length, drawn); assert.equal(warnings.length, 1);
  // Started on plain (no pass at all), the panes are live from the first frame and nothing is warned of.
  const plain = await rig({tier: 'plain', extensions: ['WEBGL_multisampled_render_to_texture']});
  assert.doesNotThrow(() => plain.frame(2)); assert.equal(warnings.length, 1); assert.deepEqual(plain.view.liveViews, ['living']);
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

test('rain is centred on the cabin at its eaves while the visitor is indoors, so it reaches above the roof windows', async () => {
  const {view, frame, THREE, D} = await rig(), {cabinFrame} = await import('../shared/lakeside-dressing.js'), {toThree} = await import('../public/space/geometry.js');
  frame();
  const at = view.life.frames.at(-1).rainAt, want = new THREE.Vector3(...toThree([...S.cabin.center, cabinFrame(S, D).eave]));
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

// ── The rooms' light, driven by the world each frame ──
const level = (lamps, id) => lamps[I.rooms.findIndex(r => r.id === id)];
// Spies on the rooms' setLight and setFire, passing each on.
const watchRooms = view => {
  const seen = {light: [], fire: []}, {setLight, setFire} = view.inside;
  view.inside.setLight = d => { seen.light.push(d); setLight(d); }; view.inside.setFire = f => { seen.fire.push(f); setFire(f); };
  return seen;
};
const EPOCH = 1_800_000_000_000;
// A world moment in the dead of night (no daylight, the path lights full), and a real world then whose cottage has `rooms` lit since
// long before and its hearth as given.
const midnight = (() => { for (let t = EPOCH; ; t += 600_000) { const {calendar} = viewConditions(EPOCH, t, null); if (calendar.light === 0 && pathLightLevel(calendar) === 1) return t; } })();
const worldAt = (t, rooms, hearth = {on: false, since: EPOCH, lastBurn: null}) => {
  const store = new WorldStore(':memory:', EPOCH);
  try { const snapshot = store.snapshot(t); snapshot.world.cottage = {...createCottageState(EPOCH, EPOCH), rooms, hearth}; return snapshot; } finally { store.close(); }
};

test('indoors each frame the rooms are given the dials and the fire its level', async () => {
  const {view, frame} = await rig(), seen = watchRooms(view), now = 1_000_000;
  frame(3, {now, study: 'night'});
  assert.equal(seen.light.length, 3); assert.equal(seen.fire.length, 3);
  // the dials are interiorDials' own for this frame's world, sky, pose and clock
  const at = now + 32, {calendar, weather} = viewConditions(0, at, 'night');
  const want = interiorDials({interior: I, calendar, weather, sky: {zenith: [.6, .7, .76], horizon: [.83, .83, .75]}, cottage: undefined, pose: cottageFixture('night'),
    now: at, seconds: at / 1000, motion: true, study: 'night'});
  assert.deepEqual(seen.light.at(-1), want); assert.equal(view.dials, seen.light.at(-1));
  assert.deepEqual(seen.fire.at(-1), {fire: want.fire / DIALS.fire, embers: want.embers, seconds: at / 1000, motion: true});
  assert.ok(level(want.lamps, 'living') > 0 && want.fire > 0, 'the night study lights the lamp and the fire');
  // the lit surfaces and the glasses take them
  const lit = view.inside.scene.getObjectByName('walls').material, shader = {uniforms: {}, vertexShader: '', fragmentShader: ''};
  lit.onBeforeCompile(shader); assert.ok(Math.abs(shader.uniforms.fire.value - want.fire) < 1e-12);
});

test('at night with the main room lit, the living room\'s lamp dial is up and the description says so', async () => {
  const snapshot = worldAt(midnight, {main: true, second: false}), {view, frame} = await rig();
  frame(1, {snapshot, now: midnight});
  assert.equal(level(view.dials.lamps, 'living'), DIALS.lamp);
  assert.equal(level(view.dials.lamps, 'study'), 0);
  assert.deepEqual(view.lit, {room: 'living room', lamp: true, fire: 'cold'});
  assert.match(sceneText(snapshot, midnight, {room: view.room, lit: view.lit}).description, /^Inside the cabin, in the living room\. The lamp is lit, and the hearth is cold\. /);
  // with the main room dark, the living room's lamp is out; with the fire lit an hour ago it burns
  const dark = worldAt(midnight, {main: false, second: false}, {on: true, since: midnight - 3_600_000, lastBurn: null}), other = await rig();
  other.frame(1, {snapshot: dark, now: midnight});
  assert.equal(level(other.view.dials.lamps, 'living'), 0);
  assert.deepEqual(other.view.lit, {room: 'living room', lamp: false, fire: 'burning'});
  assert.match(sceneText(dark, midnight, {room: other.view.room, lit: other.view.lit}).description, /The lamp is out, and the fire is burning\. /);
  // in another room nothing is said of the fire; in the yard nothing is lit
  other.view.state = {place: 'cabin', floor: 0, position: [14, 2], yaw: 0, pitch: 0}; other.frame(1, {snapshot: dark, now: midnight});
  assert.deepEqual(other.view.lit, {room: 'study', lamp: false, fire: null});
  other.view.state = {place: 'yard', position: [...S.arrival.position], yaw: 0, pitch: 0}; assert.equal(other.view.lit, null);
});

test('the doorway warms with the hall\'s lamp, and is never touched without the interior', async () => {
  const {view, frame} = await rig();
  frame(2, {study: 'night'});
  assert.equal(view.yard.doorway.length, 2); assert.equal(view.yard.doorway.at(-1), view.dials.doorway);
  assert.equal(view.yard.doorway.at(-1), level(view.dials.lamps, 'hall') / DIALS.lamp); assert.equal(view.yard.doorway.at(-1), 1);
  frame(1, {study: 'day'});
  assert.equal(view.yard.doorway.at(-1), 0, 'by day the hall\'s night lamp is out and the doorway dark');
  const off = await rig({interior: null, state: {place: 'yard', position: [...S.arrival.position], yaw: S.arrival.yaw, pitch: S.arrival.pitch}});
  off.frame(3, {study: 'night'});
  assert.deepEqual(off.view.yard.doorway, []); assert.equal(off.view.dials, null); assert.equal(off.view.lit, null);
});

test('a check fixture can set the hearth and the lamps', async () => {
  const {view, frame} = await rig(), hall = I.rooms.findIndex(r => r.id === 'hall');
  const fixture = {hearth: {fire: 0, embers: .6}, lamps: I.rooms.map((_, i) => i === hall ? 1 : 0)};
  view.fixture = fixture; frame(1, {study: 'night'});
  assert.ok(level(view.dials.lamps, 'living') > 0 && view.dials.fire > 0, 'without ?check a fixture is ignored');
  view.check = true; frame(1, {study: 'night'});
  assert.equal(view.dials.fire, 0); assert.equal(view.dials.embers, .6);
  assert.equal(level(view.dials.lamps, 'living'), 0); assert.equal(level(view.dials.lamps, 'hall'), DIALS.lamp);
  assert.equal(view.yard.doorway.at(-1), 1);
  assert.deepEqual(view.lit, {room: 'living room', lamp: false, fire: 'embers'});
  // each on its own: the hearth alone leaves the lamps to the world
  view.fixture = {hearth: {fire: 1, embers: 1}}; frame(1, {study: 'night'});
  assert.equal(view.dials.fire, DIALS.fire); assert.equal(level(view.dials.lamps, 'living'), DIALS.lamp);
  view.fixture = {hearth: {fire: 0, embers: 0}}; frame(1, {study: 'night'});
  assert.deepEqual(view.lit, {room: 'living room', lamp: true, fire: 'cold'});
});

test('a check fixture that sets the lamps sets the yard\'s cottage windows to the living room\'s and the study\'s levels', async () => {
  const {view, frame} = await rig(), at = id => I.rooms.findIndex(r => r.id === id), lamps = I.rooms.map((r, i) => i === at('living') ? .4 : 0);
  view.check = true; view.fixture = {lamps}; frame(1, {study: 'night'});
  const given = view.life.frames.at(-1).fixture;
  assert.deepEqual(given.cottagePose, {main: .4, second: 0, open: 0}, 'the night study\'s second room is lit, but the fixture has it out');
  assert.equal(given.lamps, lamps);
  // a fixture's own cottage pose is kept; without lamps none is made; without ?check none is given
  view.fixture = {lamps, cottagePose: {main: 1, second: 1, open: 1}}; frame(1, {study: 'night'}); assert.deepEqual(view.life.frames.at(-1).fixture.cottagePose, {main: 1, second: 1, open: 1});
  view.fixture = {hearth: {fire: 1, embers: 1}}; frame(1, {study: 'night'}); assert.equal(view.life.frames.at(-1).fixture.cottagePose, undefined);
  view.check = false; view.fixture = {lamps}; frame(1, {study: 'night'}); assert.equal(view.life.frames.at(-1).fixture, null);
});

test('under reduced motion the fire\'s dial does not change from frame to frame', async () => {
  const moving = await rig(), seenMoving = watchRooms(moving.view);
  moving.frame(6, {study: 'night'});
  assert.ok(new Set(seenMoving.fire.map(f => f.fire)).size > 1, 'with motion the fire flickers');
  const still = await rig(), seen = watchRooms(still.view); still.view.motion = false;
  still.frame(6, {study: 'night'});
  assert.equal(new Set(seen.fire.map(f => f.fire)).size, 1); assert.equal(new Set(seen.light.map(d => d.fire)).size, 1);
  assert.ok(seen.fire.every(f => f.motion === false && f.seconds === seen.fire[0].seconds));
});

test('a dial computation that throws warns once and leaves the rooms as they were', async t => {
  const warnings = quietWarnings(t), {view, frame} = await rig(), seen = watchRooms(view);
  frame(2, {study: 'night'});
  const last = view.dials, doorways = view.yard.doorway.length, lit = view.inside.scene.getObjectByName('walls').material, shader = {uniforms: {}, vertexShader: '', fragmentShader: ''};
  lit.onBeforeCompile(shader); const before = [...shader.uniforms.lamps.value];
  const broken = {world: {epoch: 0, get cottage() { throw new Error('unreadable'); }}};
  assert.doesNotThrow(() => frame(3, {snapshot: broken}));
  assert.equal(warnings.length, 1); assert.match(String(warnings[0][0]), /light could not be worked out/);
  assert.equal(seen.light.length, 2); assert.equal(seen.fire.length, 2); assert.equal(view.yard.doorway.length, doorways);
  assert.deepEqual([...shader.uniforms.lamps.value], before); assert.equal(view.dials, last);
  // given up for good: a readable world later changes nothing and warns no more
  assert.doesNotThrow(() => frame(2, {study: 'day'}));
  assert.equal(seen.light.length, 2); assert.equal(warnings.length, 1);
});

test('outdoors with the interior on, the rooms are not touched but the doorway is', async () => {
  const {view, frame} = await rig({state: {place: 'yard', position: [...S.arrival.position], yaw: S.arrival.yaw, pitch: S.arrival.pitch}});
  assert.ok(view.inside, 'the rooms are built');
  const seen = watchRooms(view);
  frame(3, {study: 'night'});
  assert.equal(seen.light.length, 0); assert.equal(seen.fire.length, 0);
  assert.deepEqual(view.yard.doorway, [1, 1, 1]);
  assert.equal(view.lit, null);
});

test('a lit program that fails to compile at the first indoor draw falls back to the flat light, with one warning', async t => {
  const warnings = quietWarnings(t), {view, frame, renderer} = await rig(), seen = watchRooms(view);
  // before any program is known nothing is decided
  frame(1, {study: 'night'}); assert.equal(view.inside.lit, true); assert.equal(view.lightChecked, false);
  renderer.info = {programs: [{cacheKey: 'basic,yard', diagnostics: {runnable: true}}, {cacheKey: `basic,x,interior-light-${I.rooms.length}`, diagnostics: {runnable: false, programLog: 'bad'}}]};
  frame(1, {study: 'night'});
  assert.equal(warnings.length, 1); assert.equal(warnings[0][0], "The cabin's light could not be set up; its rooms stay evenly lit.");
  assert.equal(view.inside.lit, false);
  let hemispheres = 0; view.inside.scene.traverse(o => { if (o.isHemisphereLight) hemispheres++; });
  assert.equal(hemispheres, 1);
  for (const name of ['floors', 'ceilings', 'walls', 'stair', 'frames', 'casement', 'door-leaf', 'breast', 'slab', 'mantel', 'breast-upper', 'ironwork'])
    assert.ok(view.inside.scene.getObjectByName(name).material.isMeshLambertMaterial, name);
  assert.ok(view.inside.scene.getObjectByName('casement').material.stencilWrite);
  // the glasses and the fire carry on, and nothing more is warned of
  assert.doesNotThrow(() => frame(3, {study: 'night'}));
  assert.equal(warnings.length, 1); assert.equal(seen.light.length, 5); assert.equal(seen.fire.length, 5);
  assert.ok((view.inside.overlay.getObjectByName('flames') ?? view.inside.scene.getObjectByName('flames')).visible);
  // a program that compiled keeps the rooms lit
  const good = await rig(); good.renderer.info = {programs: [{cacheKey: `basic,x,interior-light-${I.rooms.length}`}]}; good.frame(2);
  assert.equal(good.view.inside.lit, true); assert.equal(good.view.lightChecked, true); assert.equal(warnings.length, 1);
});

test('a lamp counts as lit above 0.15 of full, so the hall\'s night lamp burning low is lit', async () => {
  const {view, frame} = await rig({state: {place: 'cabin', floor: 0, position: [9, 3], yaw: 0, pitch: 0}}), at = level => I.rooms.map(r => r.id === 'hall' ? level : 0);
  view.check = true;
  view.fixture = {lamps: at(DIALS.hallLow)}; frame(1, {study: 'night'}); assert.equal(view.lit.lamp, true);
  view.fixture = {lamps: at(.1)}; frame(1, {study: 'night'}); assert.equal(view.lit.lamp, false);
});

test('the fire\'s flicker does not flip the description between burning and embers', async () => {
  // a fire just lit, its level a hair above the burning mark and rising: with the flicker its light crosses the mark from frame to frame
  const snapshot = worldAt(midnight, {main: false, second: false}, {on: true, since: midnight - DIALS.fireRise * .051, lastBurn: null});
  const {view, frame} = await rig(), seen = new Set();
  // the same world moment each frame, the flicker's clock moved on by shifting the epoch it counts from
  for (let k = 0; k < 60; k++) { frame(1, {snapshot: {...snapshot, world: {...snapshot.world, epoch: EPOCH - k * 137}}, now: midnight}); seen.add(view.lit.fire); }
  assert.deepEqual([...seen], ['burning']);
});
