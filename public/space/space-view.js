import * as THREE from '../assets/vendor/three-0.170.0.module.js';
import {toThree} from './geometry.js';
import {loadSpaceArt} from './art-loader.js';
import {buildScene} from './scene/index.js';
import {buildInterior} from './interior/index.js';
import {createPassage} from './passage.js';
import {LAKESIDE_SPACE} from '../../shared/lakeside-space.js';
import {LAKESIDE_DRESSING, cabinFrame} from '../../shared/lakeside-dressing.js';
import {LAKESIDE_INTERIOR} from '../../shared/lakeside-interior.js';
import {roomAt} from '../../shared/interior.js';
import {liveOpenings, viewOpenings} from '../../shared/window-views.js';
import {createWindowViews} from './window-views.js';
import {createViewBudget} from './view-budget.js';
import {doorWanted} from '../../shared/threshold.js';
import {WALK, eyePosition, glide, glideClear, indoorEye, stepIndoors, stepWalker} from '../../shared/walker.js';
import {SCENES, viewConditions} from '../../shared/world.js';
import {SKY_CAMERA} from '../../shared/celestial-projection.js';
import {sampleCloudLayers, skyBodies} from '../../shared/sky.js';
import {SkyDome, overcast} from './sky-dome.js';
import {WalkKeys, walkHint} from './walk-keys.js';
import {PlaceMemory} from './place-memory.js';
import {PainterlyPass, canPaint} from './painterly-pass.js';
import {TIERS, createTierMeter} from './tier.js';
import {createLife, lifeFrame} from './life/index.js';
import {lifeLayout} from '../../shared/lakeside-life.js';

export {toThree};

// The painterly pass at full or reduced filter resolution, or off (the scene drawn straight to the canvas).
const PASS_SCALE = {full: 1, light: .6, off: null};
const TIER_PASS = {full: 'full', light: 'light', plain: 'off'};
const MAX_VERTICAL_FOV = 75, FOG_DENSITY = .0009, LOOK_PER_PIXEL = .004;
// The yard's light, day and night, mixed by calendar.light. Night stays dim and blue rather than black.
const LIGHT = {day: {sky: '#dfe7ea', ground: '#7d7660', hemisphere: 1.7, sun: '#fff3dc', direct: 2.3},
  night: {sky: '#5d74a6', ground: '#262c3a', hemisphere: 1.1, moon: '#a9b8d6', direct: .7}};
// Full overcast takes this share from the sky's light, by day and night alike; cloud takes its own share from the sun or moon.
const OVERCAST_SHADE = .35, CLOUD_SHADE = .65;
// A visitor's state: in the yard, or in the cabin on a floor. A pose with no place is in the yard.
const pose = s => s.place === 'cabin'
  ? {place: 'cabin', floor: s.floor, position: [s.position[0], s.position[1]], yaw: s.yaw, pitch: s.pitch}
  : {place: 'yard', position: [s.position[0], s.position[1]], yaw: s.yaw, pitch: s.pitch};
// The interior, until the owner approves it, only behind ?interior=1.
const interiorSwitch = () => new URLSearchParams(location.search).get('interior') === '1' ? LAKESIDE_INTERIOR : null;
export const verticalFov = aspect => Math.min(MAX_VERTICAL_FOV, 2 * Math.atan(Math.tan(SKY_CAMERA.horizontalFov / 2) / aspect) * 180 / Math.PI);

// The light's strengths for a calendar and weather: blend (night 0 to day 1), the hemisphere's intensity, whether the sun
// (or else the moon) lights the yard, and the directional light's intensity before that body's own opacity and phase.
export function lightLevels(calendar, weather) {
  const blend = Math.max(0, Math.min(1, calendar.light)), sun = blend >= .5, {day, night} = LIGHT;
  const hemisphere = (night.hemisphere + (day.hemisphere - night.hemisphere) * blend) * (1 - OVERCAST_SHADE * overcast(weather));
  // Fade through the hand-over so the shadow side never jumps.
  const handover = Math.min(1, Math.abs(blend - .5) / .15);
  return {blend, sun, hemisphere, direct: (sun ? day.direct : night.direct) * (1 - weather.cloud * CLOUD_SHADE) * handover};
}

export class SpaceView {
  constructor(canvas, {space = LAKESIDE_SPACE, dressing = LAKESIDE_DRESSING, interior = interiorSwitch(), sky = SCENES[0].sky, onFailure} = {}) {
    this.canvas = canvas; this.space = space; this.dressing = dressing; this.interior = interior; this.skyConfig = sky; this.onFailure = onFailure;
    this.state = pose(space.arrival);
    // Walking: held keys, drag deltas gathered since the last frame, an optional glide home, and the remembered place.
    this.keys = new WalkKeys(window, {blocked: () => [...document.querySelectorAll('dialog')].some(d => d.open)});
    let storage = null; try { storage = localStorage; } catch {}
    this.memory = new PlaceMemory({storage, space, ...(interior ? {interior} : {})});
    // The cabin's rooms are built when first wanted (inside: their scene; insideFailed: a build that threw, for good); the
    // passage swings the door and carries the visitor through it.
    this.inside = null; this.insideFailed = false;
    // The cabin's openings, the views of the yard through its live panes (made when first wanted; viewsFailed: never, for good),
    // the door's swing as the passage last gave it, the ids live in the last frame and how many the frames allow.
    this.openings = null; this.views = null; this.viewDraw = null; this.viewsFailed = false; this.door = 0; this.live = []; this.rainAt = null;
    this.budget = createViewBudget();
    this.passage = interior ? createPassage({space, dressing, interior, motion: () => this.motion}) : null;
    this.placed = false; this.look = [0, 0]; this.looked = false; this.glideFrom = null; this.glideStart = 0; this.lastStep = null;
    this.visibility = () => { if (document.hidden) this.keys.release(); };
    // Registered after WalkKeys, so a walking key tap shorter than a frame still cancels a glide.
    this.keyCancel = () => { if (this.keys.moving()) this.glideFrom = null; };
    document.addEventListener('visibilitychange', this.visibility); addEventListener('keydown', this.keyCancel);
    // What the yard's living things report, read by sound and the scene description; nothing is active until one is built and running.
    this.life = null; this.check = false; this.fixture = null;
    const view = this;
    this.birdRenderer = {get valid() { const bird = view.life?.status.bird; return bird !== undefined && bird !== 'failed'; }};
    this.renderer = null; this.pass = null; this.disposed = false; this.failed = false;
    this.media = matchMedia('(prefers-reduced-motion: reduce)'); this.motion = !this.media.matches;
    // As in Painting: reduced motion holds the celestial and cloud-motion clocks; light and weather stay live.
    this.frozenMotion = null; this.lastMotion = null; this.frozenCelestial = null; this.lastCelestial = null; this.celestialStudy = null;
    this.motionChanged = event => {
      this.motion = !event.matches;
      this.frozenMotion = this.motion ? null : this.lastMotion;
      this.frozenCelestial = this.motion ? null : this.lastCelestial;
    };
    this.media.addEventListener('change', this.motionChanged);
    this.resize = () => {
      if (!this.renderer) return;
      const ratio = Math.min(devicePixelRatio || 1, 1.6);
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(innerWidth, innerHeight, false);
      this.pass?.setSize(innerWidth, innerHeight, ratio);
      this.camera.aspect = innerWidth / innerHeight; this.camera.fov = verticalFov(this.camera.aspect);
      this.camera.updateProjectionMatrix();
    };
    this.contextLost = event => {
      event.preventDefault();
      if (this.failed || this.disposed) return;
      this.failed = true; this.onFailure?.();
    };
    // The tier steps the pass down on a device that cannot hold it. With check, ?tier= starts it locked, for captures.
    const params = new URLSearchParams(location.search), check = params.has('check'); this.check = check; const fixed = check ? params.get('tier') : null;
    this.meter = TIERS.includes(fixed) ? createTierMeter({start: fixed, locked: true}) : createTierMeter();
    this.passMode = TIER_PASS[this.meter.tier]; this.shown = false;
    if (check) window.__space = this;
  }
  get tier() { return this.meter.tier; }
  async init() {
    if (this.disposed) return false;
    this.state = pose(this.memory.load() ?? this.space.arrival); this.placed = true;
    // Opaque: with alpha the canvas would let the page show through wherever alpha-to-coverage leaves a card edge part covered.
    // A stencil only with the interior on, for the cabin's live panes when the rooms are drawn straight to the canvas.
    const gl = this.canvas.getContext('webgl2', {alpha: false, antialias: true, stencil: !!this.interior, powerPreference: 'low-power'});
    if (!gl) return false;
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({canvas: this.canvas, context: gl, antialias: true, powerPreference: 'low-power'});
      if (await this.build(renderer)) {
        // The clouds come in when their atlas does (load never rejects; a missing atlas leaves a clear sky).
        this.sky.load();
        // Walking, looking and the tier meter begin only now the view is shown.
        return this.shown = true;
      }
    } catch (error) { console.warn('The 3D view could not be built; showing the painting.', error); }
    // The painting is shown instead: give the context back, so a lost-context event cannot report the failure again.
    this.failed = true; this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.releaseScene(renderer); gl.getExtension('WEBGL_lose_context')?.loseContext();
    return false;
  }
  // The yard is drawn from its art bundle; without it the painting is shown instead. The renderer is published (and
  // frames drawn) only once the scene exists. False if the art is missing or the view was disposed meanwhile.
  async build(renderer) {
    let art;
    try { art = await loadSpaceArt(THREE, renderer); }
    catch (error) { console.warn("The yard's art could not be loaded; showing the painting.", error); return false; }
    this.art = art;
    if (this.disposed) return false;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2('#d3d3bf', FOG_DENSITY);
    this.camera = new THREE.PerspectiveCamera(MAX_VERTICAL_FOV, 1, .1, 4000); this.camera.rotation.order = 'YXZ';
    this.yard = buildScene(THREE, {space: this.space, dressing: this.dressing, art}); this.scene.add(this.yard.group);
    if (this.state.place === 'cabin') this.buildInside();
    this.life = createLife(THREE, {scene: this.scene, yard: this.yard, space: this.space, dressing: this.dressing, art, layout: lifeLayout(this.space, this.dressing)});
    this.sky = new SkyDome(THREE, this.skyConfig); this.scene.add(this.sky.object3d);
    this.hemisphere = new THREE.HemisphereLight(); this.direct = new THREE.DirectionalLight(); this.scene.add(this.hemisphere, this.direct);
    this.colours = {day: {}, night: {}};
    for (const [time, values] of Object.entries(LIGHT)) for (const [key, value] of Object.entries(values))
      if (typeof value === 'string') this.colours[time][key] = new THREE.Color(value);
    // A context that cannot render to half-float colour cannot run the pass: stay on plain for good, as a slow device would.
    if (!canPaint(renderer.getContext())) { this.meter = createTierMeter({start: 'plain', locked: true}); this.passMode = TIER_PASS.plain; }
    // Locked on plain (?tier=plain, or no half-float targets), the pass would never be drawn.
    if (!this.plainForGood()) { this.pass = this.makePass(renderer); this.setPass(this.passMode); }
    this.renderer = renderer;
    addEventListener('resize', this.resize); this.resize();
    return true;
  }
  // Whether three would draw into the pass's multisampled scene target through WEBGL_multisampled_render_to_texture, which
  // attaches its depth-stencil so that the panes' stencil may not last from the rooms' draw to the views' (untried on such a
  // device; nothing would throw). It concerns only that target: drawn straight to the canvas (plain) the views need only the
  // canvas's own stencil.
  targetUnsure(renderer) { return renderer.extensions.has('WEBGL_multisampled_render_to_texture'); }
  // The painterly pass, its scene target carrying a stencil only with the interior on and where the views can be drawn into it.
  makePass(renderer) { return new PainterlyPass(THREE, renderer, {stencil: !!this.interior && !this.targetUnsure(renderer)}); }
  // Whether this frame's views would have to be drawn into a target they cannot be trusted in: through the pass, on such a browser.
  // Asked every frame, so a view stepped down to plain opens its windows, and one set back to the pass shuts them.
  viewsBarred() { return this.passMode !== 'off' && !!this.pass && this.targetUnsure(this.renderer); }
  // The cabin's rooms, built once. A build that throws is logged once and leaves the door shut for good; a visitor
  // remembered indoors is then set down at the arrival pose.
  buildInside() {
    if (this.inside || this.insideFailed || !this.interior) return;
    try {
      this.openings = viewOpenings(this.interior, this.space, this.dressing);
      this.inside = buildInterior(THREE, {interior: this.interior, art: this.art, openings: this.openings});
    }
    catch (error) {
      this.insideFailed = true; console.warn("The cabin's interior could not be built; its door stays shut.", error);
      if (this.state.place === 'cabin') this.state = pose(this.space.arrival);
    }
  }
  // The views of the yard through the cabin's panes, made once when first wanted. A context without a stencil, or a set-up that
  // throws, leaves every pane flat for good, warned of once (dropViews).
  windowViews() {
    if (this.views || this.viewsFailed) return this.views;
    try {
      if (!this.renderer.getContext().getContextAttributes()?.stencil) throw new Error('The drawing buffer has no stencil.');
      const views = this.views = createWindowViews(THREE, {openings: this.openings, yardScene: this.scene, yard: this.yard, life: this.life, sky: this.sky});
      // What the frame draws through: a draw that throws gives the views up rather than the frame, and reports false so the pass
      // is told of no views this frame.
      this.viewDraw = {get prepared() { return views.prepared; },
        draw: renderer => { try { views.draw(renderer); return true; } catch (error) { if (this.views === views) this.dropViews(error); return false; } }};
    } catch (error) { this.dropViews(error); }
    return this.views;
  }
  dropViews(error) {
    this.viewsFailed = true; this.views?.dispose(); this.views = null; this.viewDraw = null;
    console.warn("The cabin's windows could not be opened; they stay blank.", error);
  }
  // Indoors, each frame: the casement and the door leaf set as the yard and the passage have them, the openings worth drawing
  // chosen (by the tier's cap and the view budget), their panes marked and their views prepared. Returns the live ids.
  openWindows() {
    const {inside, state, camera} = this, door = this.door;
    inside.setCasement(this.yard.cottage.open); inside.setDoor(door);
    if (this.viewsBarred()) {
      if (!this.barredWarned) { this.barredWarned = true; console.warn("The cabin's windows stay blank while the painterly pass is on: this browser draws its multisampled target through WEBGL_multisampled_render_to_texture."); }
      inside.setLive([]); return [];
    }
    const views = this.windowViews(), ids = views ? liveOpenings(this.openings, this.interior, state, {eye: indoorEye(this.interior, state, this.space.eyeHeight),
      yaw: state.yaw, pitch: state.pitch, fov: camera.fov * Math.PI / 180, aspect: camera.aspect}, {limit: this.budget.limit(this.tier), doorOpen: door}) : [];
    inside.setLive(ids);
    if (!views) return [];
    try { views.prepare(camera, ids, inside.stencilOf); return ids; }
    catch (error) { this.dropViews(error); inside.setLive([]); return []; }
  }
  // Indoors, one frame: the openings chosen and prepared (openWindows), then the rooms drawn and the yard through each live pane
  // into the same frame, through the pass or straight to the canvas. With `flat` (for the browser checks' comparisons) no pane is
  // live and the shell's flat glass is drawn. Returns the live ids.
  drawIndoors({flat = false} = {}) {
    let ids = [];
    if (flat) this.inside.setLive([]); else ids = this.openWindows();
    const views = ids.length ? this.viewDraw : null;
    if (this.passMode === 'off' || !this.pass) { this.renderer.render(this.inside.scene, this.camera); views?.draw(this.renderer); }
    else this.pass.render(this.inside.scene, this.camera, {water: false, views});
    return ids;
  }
  // The ids of the openings drawn live in the last frame.
  get liveViews() { return [...this.live]; }
  // The name of the room the visitor is in, or null in the yard (or without the interior).
  get room() { return this.interior && this.state.place === 'cabin' ? roomAt(this.interior, this.state.floor, this.state.position)?.name ?? null : null; }
  get birdActive() { return this.life?.status.bird === 'active'; }
  get cottageActive() { return this.life?.status.cottage === 'active'; }
  get coincidenceActive() { return this.life?.status.ripples === 'active'; }
  setPass(mode) {
    if (!Object.hasOwn(PASS_SCALE, mode)) throw new Error(`Unknown painterly pass mode ${mode}`);
    // Locked on plain the pass is gone for good (or never made); the view stays drawn straight to the canvas.
    if (this.plainForGood() && !this.pass) return;
    this.passMode = mode;
    if (PASS_SCALE[mode]) this.pass?.setScale(PASS_SCALE[mode]);
  }
  plainForGood() { return this.meter.locked && this.meter.tier === 'plain'; }
  // Locked on plain the pass is never drawn again, so its render targets are given back to the GPU.
  releasePass() {
    if (!this.plainForGood() || !this.pass) return;
    this.pass.dispose(); this.pass = null;
  }
  panBy() {} // Dragging pans only the 2D painting; here it looks (lookBy).
  // Grab-style: dragging right turns the view left, dragging down tilts it up.
  lookBy(dx, dy) {
    if (!this.shown) return; // a drag before the view is shown is dropped
    this.look[0] -= dx * LOOK_PER_PIXEL; this.look[1] += dy * LOOK_PER_PIXEL;
    this.looked = true; this.glideFrom = null;
  }
  returnToArrival() {
    this.look = [0, 0];
    if (this.passage?.busy) return;
    // Indoors there is no straight way home: fade, then stand at the arrival pose.
    if (this.state.place === 'cabin') { this.glideFrom = null; this.passage.send(pose(this.space.arrival)); return; }
    // A glide can be stopped partway, so it is taken only where the straight way home is all walkable; otherwise the visitor is set down there.
    if (this.motion && glideClear(this.space, this.state.position, this.space.arrival.position)) { this.glideFrom = pose(this.state); this.glideStart = performance.now(); }
    else { this.glideFrom = null; this.state = pose(this.space.arrival); }
  }
  // Before init has loaded the remembered place, the arrival pose must not overwrite it.
  // The first-visit hint, naming the walking keys as printed on this keyboard where the browser can tell.
  walkHint() { return walkHint(); }
  flushPlace() { if (this.placed) this.memory.flush(this.state); }
  forgetPlace() { this.memory.forget(); }
  // Advances the visitor by the real time since the previous frame; the world's clock (paused or studied) plays no part.
  step() {
    const t = performance.now(), dt = this.lastStep === null ? 0 : (t - this.lastStep) / 1000;
    this.lastStep = t;
    const keys = this.keys.input(), walking = this.keys.moving(), look = this.look, looked = this.looked;
    this.look = [0, 0]; this.looked = false;
    // While the passage carries the visitor across, walking and looking are ignored and the place is not recorded.
    const crossing = this.passage?.busy ?? false;
    if (walking) this.glideFrom = null;
    if (crossing) { /* held where they are */ }
    else if (this.state.place === 'cabin') this.state = stepIndoors(this.interior, this.state, {...keys, look}, dt);
    else if (this.glideFrom) {
      const k = (t - this.glideStart) / (WALK.glideSeconds * 1000);
      this.state = pose(glide(this.glideFrom, this.space.arrival, k));
      if (k >= 1) this.glideFrom = null;
    } else this.state = pose(stepWalker(this.space, this.state, {...keys, look}, dt));
    let moved = false;
    if (this.passage) {
      if (this.state.place === 'yard' && doorWanted(this.space, this.dressing, this.state)) this.buildInside();
      const {door, veil, move} = this.passage.frame(this.state, crossing ? {forward: 0} : keys, t / 1000, {ready: !!this.inside});
      if (move) { this.state = pose(move); this.glideFrom = null; moved = true; }
      this.door = this.inside ? door : 0; this.yard.setDoor(this.door);
      this.canvas.style.opacity = String(1 - veil);
    }
    if (!this.passage?.busy) this.memory.note(this.state, walking || looked || moved || this.glideFrom !== null);
  }
  render(snapshot, now, study = null) {
    if (!this.renderer || this.disposed || this.failed || !snapshot) return;
    // Lost but not yet told (the event is asynchronous): three would compile on a dead context.
    if (this.renderer.getContext().isContextLost()) return;
    if (this.shown) this.step();
    const epoch = snapshot.world.epoch, conditions = viewConditions(epoch, now, study), {calendar: c, weather: w} = conditions;
    // A deliberate study selection may choose a new still sky in reduced motion.
    if (study !== this.celestialStudy) { this.frozenCelestial = null; this.celestialStudy = study; }
    if (!this.motion && this.frozenCelestial === null) this.frozenCelestial = c.total;
    const celestialTime = this.motion ? c.total : this.frozenCelestial;
    this.lastCelestial = celestialTime;
    const realSeconds = (now - epoch) / 1000;
    if (!this.motion && this.frozenMotion === null) this.frozenMotion = realSeconds;
    const motionSeconds = this.motion ? realSeconds : this.frozenMotion;
    this.lastMotion = motionSeconds;
    const indoors = this.state.place === 'cabin' && !!this.inside;
    this.camera.position.set(...toThree(indoors ? indoorEye(this.interior, this.state, this.space.eyeHeight) : eyePosition(this.space, this.state)));
    this.camera.rotation.y = -this.state.yaw; this.camera.rotation.x = this.state.pitch;
    const bodies = skyBodies(c, {seed: this.skyConfig.seed, model: this.skyConfig.celestial, worldMs: celestialTime});
    const clouds = sampleCloudLayers({realSeconds, motionSeconds, weather: w, config: this.skyConfig});
    const {zenith, horizon} = this.sky.update({calendar: c, weather: w, bodies, clouds, cameraPosition: this.camera.position});
    this.yard.setSky({zenith, horizon}); this.inside?.setSky({zenith, horizon});
    this.yard.setGarden(this.check && Number.isInteger(this.fixture?.gardenDay) ? this.fixture.gardenDay : c.day);
    this.applyLight(c, w, bodies, horizon);
    // Indoors the rain falls round the cabin's outside, centred over it at its eaves so the streaks stand above the roof windows
    // too: it is seen through every window and never in a room.
    const rainAt = indoors ? this.rainAt ??= new THREE.Vector3(...toThree([...this.space.cabin.center, cabinFrame(this.space, this.dressing).eave])) : null;
    this.life.update(lifeFrame({snapshot, now, study, motion: this.motion, motionSeconds, realSeconds, camera: this.camera, conditions, fixture: this.check ? this.fixture : null, rainAt}));
    // Indoors the rooms are drawn instead of the yard, which (sky, light and life) carries on all the same, and is drawn again
    // through each live pane into the same frame.
    const ids = this.live = indoors ? this.drawIndoors() : [];
    if (!indoors) { if (this.passMode === 'off' || !this.pass) this.renderer.render(this.scene, this.camera); else this.pass.render(this.scene, this.camera, {water: true, views: null}); }
    // Frames across the door are not measured. The rooms are far cheaper to draw than the yard, so frames indoors may step the
    // tier down but never lock it: the yard is still measured the first time the visitor is out there.
    // With several openings live the meter is held, and the view budget sheds openings first.
    if (this.shown && !this.passage?.busy) {
      const t = performance.now(), tier = this.meter.tier;
      this.budget.frame(t, {indoors, live: ids.length});
      const next = this.meter.frame(t, {indoors, hold: indoors && ids.length > 1});
      if (next !== tier) { this.setPass(TIER_PASS[next]); this.releasePass(); }
    }
    return conditions;
  }
  // Hemisphere light from the sky, one directional light from the sun by day and the moon by night, fog in the horizon colour.
  applyLight(calendar, weather, bodies, horizon) {
    const {blend: t, sun, hemisphere, direct} = lightLevels(calendar, weather), {day, night} = this.colours, body = sun ? bodies.sun : bodies.moon;
    this.hemisphere.color.lerpColors(night.sky, day.sky, t); this.hemisphere.groundColor.lerpColors(night.ground, day.ground, t);
    this.hemisphere.intensity = hemisphere;
    this.direct.color.copy(sun ? day.sun : night.moon);
    this.direct.intensity = direct * (sun ? 1 : bodies.moon.illumination) * body.opacity;
    this.direct.position.set(...toThree(body.direction)).multiplyScalar(100);
    this.scene.fog.color.setRGB(...horizon, THREE.SRGBColorSpace);
    this.scene.fog.density = FOG_DENSITY * (1 + weather.rain);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.keys.dispose(); document.removeEventListener('visibilitychange', this.visibility); removeEventListener('keydown', this.keyCancel);
    this.media.removeEventListener('change', this.motionChanged);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost); this.canvas.style.opacity = '';
    this.releaseScene(this.renderer);
  }
  // Everything init made for the GPU, given back; safe to call again.
  releaseScene(renderer) {
    removeEventListener('resize', this.resize);
    for (const part of ['views', 'life', 'inside', 'yard', 'art', 'sky', 'hemisphere', 'direct', 'pass']) { this[part]?.dispose(); this[part] = null; }
    this.viewDraw = null;
    renderer?.dispose(); this.renderer = null;
  }
}
