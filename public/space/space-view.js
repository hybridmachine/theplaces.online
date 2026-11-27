import * as THREE from '../assets/vendor/three-0.170.0.module.js';
import {toThree} from './geometry.js';
import {loadSpaceArt} from './art-loader.js';
import {buildScene} from './scene/index.js';
import {buildInterior} from './interior/index.js';
import {createPassage} from './passage.js';
import {LAKESIDE_SPACE} from '../../shared/lakeside-space.js';
import {LAKESIDE_DRESSING, cabinFrame} from '../../shared/lakeside-dressing.js';
import {LAKESIDE_INTERIOR, SLICE_4C, SLICE_4D, SLICE_4E, SLICE_4F} from '../../shared/lakeside-interior.js';
import {onStair, roomAt, stairFoot, stairTop} from '../../shared/interior.js';
import {bareInterior, withoutPieces, withoutRooms} from '../../shared/furniture.js';
import {DIALS, interiorDials} from '../../shared/interior-light.js';
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
import {cottagePose} from './life/cottage.js';
import {lifeLayout} from '../../shared/lakeside-life.js';

export {toThree};

// The painterly pass at full or reduced filter resolution, or off (the scene drawn straight to the canvas).
const PASS_SCALE = {full: 1, light: .6, off: null};
const TIER_PASS = {full: 'full', light: 'light', plain: 'off'};
const MAX_VERTICAL_FOV = 75, FOG_DENSITY = .0009, LOOK_PER_PIXEL = .004;
// Distance from the stair's foot or top within which the opposite floor's furniture queue flushes (clears the entry spot 1.40 m from stairFoot).
const STAIR_FLUSH_RADIUS = 1.0;
// The yard's light, day and night, mixed by calendar.light. Night stays dim and blue rather than black.
const LIGHT = {day: {sky: '#dfe7ea', ground: '#7d7660', hemisphere: 1.7, sun: '#fff3dc', direct: 2.3},
  night: {sky: '#5d74a6', ground: '#262c3a', hemisphere: 1.1, moon: '#a9b8d6', direct: .7}};
// Full overcast takes this share from the sky's light, by day and night alike; cloud takes its own share from the sun or moon.
const OVERCAST_SHADE = .35, CLOUD_SHADE = .65;
// A visitor's state: in the yard, or in the cabin on a floor. A pose with no place is in the yard.
const pose = s => s.place === 'cabin'
  ? {place: 'cabin', floor: s.floor, position: [s.position[0], s.position[1]], yaw: s.yaw, pitch: s.pitch}
  : {place: 'yard', position: [s.position[0], s.position[1]], yaw: s.yaw, pitch: s.pitch};
const clamp01 = x => Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
// For the scene description: above LAMP_SEEN of full a room's lamp counts as lit (the hall's night lamp burning low is), and below
// these the fire counts as out (by its level, not its flickering light) and its embers as cold.
const LAMP_SEEN = .15, FIRE_SEEN = .05, EMBERS_SEEN = .1;
// The interior, until the owner approves it, only behind ?interior=1.
// With ?check, &bare=1 builds the view from the bare blueprint (no furniture), &furnish=first strips the queued rooms and
// &furnish=4b..4e strip later slices while keeping earlier queues, to compare captures; without ?check all are ignored.
// &bare=1 wins over &furnish=.
export function interiorSwitch(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search);
  if (params.get('interior') !== '1') return null;
  if (!params.has('check')) return LAKESIDE_INTERIOR;
  if (params.get('bare') === '1') return bareInterior(LAKESIDE_INTERIOR);
  if (params.get('furnish') === 'first') return withoutRooms(LAKESIDE_INTERIOR, [...LAKESIDE_INTERIOR.furnishLater, ...(LAKESIDE_INTERIOR.furnishUpper ?? [])]);
  if (params.get('furnish') === '4b') return withoutRooms(LAKESIDE_INTERIOR, [...SLICE_4C, ...SLICE_4D, ...SLICE_4E, ...SLICE_4F], {keepQueue: true});
  if (params.get('furnish') === '4c') return withoutRooms(LAKESIDE_INTERIOR, [...SLICE_4D, ...SLICE_4E, ...SLICE_4F], {keepQueue: true});
  if (params.get('furnish') === '4d') return withoutRooms(LAKESIDE_INTERIOR, [...SLICE_4E, ...SLICE_4F], {keepQueue: true});
  if (params.get('furnish') === '4e') return withoutRooms(LAKESIDE_INTERIOR, SLICE_4F, {keepQueue: true});
  return LAKESIDE_INTERIOR;
}
// With ?check, &hide=0 draws every built room's furniture even when out of sight, to verify hiding changes no pixel; ignored without ?check.
export function hidingSwitch(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search);
  return !(params.has('check') && params.get('hide') === '0');
}
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
  constructor(canvas, {space = LAKESIDE_SPACE, dressing = LAKESIDE_DRESSING, interior = interiorSwitch(), hideUnseen = hidingSwitch(), sky = SCENES[0].sky, onFailure} = {}) {
    this.canvas = canvas; this.space = space; this.dressing = dressing; this.interior = interior; this.hideUnseen = hideUnseen; this.skyConfig = sky; this.onFailure = onFailure;
    this.state = pose(space.arrival);
    // Walking: held keys, drag deltas gathered since the last frame, an optional glide home, and the remembered place.
    this.keys = new WalkKeys(window, {blocked: () => [...document.querySelectorAll('dialog')].some(d => d.open)});
    let storage = null; try { storage = localStorage; } catch {}
    this.memory = new PlaceMemory({storage, space, ...(interior ? {interior} : {})});
    // The cabin's rooms are built when first wanted (inside: their scene; insideFailed: a build that threw, for good); the
    // passage swings the door and carries the visitor through it.
    this.inside = null; this.insideFailed = false;
    // The rooms' light: the last frame's dials (shared/interior-light.js), whether working them out has failed for good, and whether
    // the lit surfaces' program has been seen to compile (lightChecked).
    this.dials = null; this.dialsFailed = false; this.lightChecked = false;
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
  // remembered indoors is then set down at the arrival pose. A visitor who starts indoors gets every queued room at once.
  buildInside() {
    if (this.inside || this.insideFailed || !this.interior) return;
    try {
      this.openings = viewOpenings(this.interior, this.space, this.dressing);
      this.inside = buildInterior(THREE, {interior: this.interior, art: this.art, openings: this.openings});
      // Flush the visitor's starting floor (and intentionally both queues if an older remembered pose lacks `floor`).
      if (this.state.place === 'cabin') this.inside.buildRest(this.state.floor);
      this.updateSight();
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
  // After the views the rooms' added light (the halos, flames and the fire's glow: inside.overlay) is drawn over them, from the
  // visitor's eye into the same target without clearing it and with the stencil test off, still depth-tested against the rooms;
  // it is drawn so wherever some of it lies over a live pane, and otherwise with the rooms. Through the pass all of it goes into the scene target before the filter: the pass's
  // `views` hook draws the views (and says whether it drew any) and its `over` the added light.
  // The camera's four side frustum planes for this draw, in the interior frame [a, d, z]; null when unavailable.
  viewPlanes() {
    const cam = this.camera;
    if (!cam) return null;
    if (this.canvas && (this.canvas.width <= 0 || this.canvas.height <= 0)) return null;
    if (this.renderer?.getContext?.()?.isContextLost?.()) return null;
    if (!Number.isFinite(cam.aspect) || cam.aspect <= 0 || !Number.isFinite(cam.fov) || cam.fov <= 0) return null;
    cam.updateMatrixWorld();
    const vp = (this._viewVp ??= new THREE.Matrix4()).multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (this.inside?.scene) {
      this.inside.scene.updateWorldMatrix(true, false);
      vp.multiply(this.inside.scene.matrixWorld);
    }
    const frustum = (this._viewFrustum ??= new THREE.Frustum()).setFromProjectionMatrix(vp);
    const out = this._viewPlanes ??= [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < 4; i++) {
      const p = frustum.planes[i], {x, y, z} = p.normal, c = p.constant;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(c)) return null;
      const row = out[i];
      row[0] = x; row[1] = -z; row[2] = y; row[3] = c;
    }
    return out;
  }
  // Hides queued rooms' furniture that cannot be seen from the visitor's room or whose doorways are out of view; shows everything in the yard, on the stair, or with &hide=0.
  updateSight() {
    if (!this.inside) return;
    const from = this.state.place === 'cabin' && this.hideUnseen !== false && !onStair(this.interior, this.state.position)
      ? roomAt(this.interior, this.state.floor, this.state.position)?.id ?? null : null;
    this.inside.showFrom(from, from ? this.viewPlanes() : null);
  }
  drawIndoors({flat = false} = {}) {
    this.updateSight();
    let ids = [];
    if (flat) this.inside.setLive([]); else ids = this.openWindows();
    // (made once; this frame's views, if any, are set on it, and its `over` only when something of the overlay lies over a live pane:
    // each draw into the pass's multisampled target is resolved in full, about a millisecond, so a frame that need not skips it)
    const view = this, hook = this.overDraw ??= {views: null, over: null, get prepared() { return this.views ? this.views.prepared : []; },
      draw(renderer) { return this.views ? this.views.draw(renderer) !== false : false; },
      overlay(renderer) {
        const autoClear = renderer.autoClear;
        renderer.state.buffers.stencil.setTest(false); renderer.autoClear = false;
        try { renderer.render(view.inside.overlay, view.camera); } finally { renderer.autoClear = autoClear; }
      }};
    // The overlay after the views only when some of it lies over a live pane; otherwise it is drawn with the rooms, as nothing will cover it.
    hook.views = ids.length ? this.viewDraw : null;
    const need = this.inside.overlayNeed(this.camera, hook.views ? hook.views.prepared : []);
    this.inside.overlayWithRooms(need < 2); hook.over = need === 2 ? hook.overlay : null;
    if (this.passMode === 'off' || !this.pass) { this.renderer.render(this.inside.scene, this.camera); hook.draw(this.renderer); hook.over?.(this.renderer); }
    else this.pass.render(this.inside.scene, this.camera, {water: false, views: hook});
    this.checkLight();
    return ids;
  }
  // After the first indoor draw of the lit surfaces: three logs a program that fails to compile or link and draws nothing with it,
  // so the rooms would vanish. Its diagnostics say so (runnable false); the rooms then fall back to the flat light, with one warning.
  // This decides on the lit programs known after the first indoor draw that made any: it relies on both of them (the plain one and
  // plaster's, with its base) being used in that frame, as they are wherever a visitor stands (every room has walls and a floor).
  checkLight() {
    if (this.lightChecked || !this.inside?.lit) return;
    const programs = (this.renderer.info?.programs ?? []).filter(p => String(p.cacheKey).includes('interior-light-'));
    if (!programs.length) return;
    this.lightChecked = true;
    if (programs.some(p => p.diagnostics?.runnable === false)) {
      this.inside.fallBack(); console.warn("The cabin's light could not be set up; its rooms stay evenly lit.");
    }
  }
  // Each frame with the interior on: the rooms' dials from the shared world and the clock (or a check's fixture: `hearth`
  // {fire, embers} and `lamps`, a level 0–1 per room), the doorway warmed by the hall's lamp, and indoors the rooms and the fire
  // given them. Working the dials out is not to throw: if it does, once, it is warned of and given up, the rooms keeping their last light.
  lightRooms({snapshot, now, study, calendar, weather, sky, motionSeconds, indoors, fixture}) {
    if (this.dialsFailed) return;
    let dials;
    try {
      const I = this.interior;
      const pose = cottagePose({fixture, study, snapshot, now, motion: this.motion});
      dials = interiorDials({interior: I, calendar, weather, sky, cottage: snapshot.world.cottage, pose, now, seconds: motionSeconds, motion: this.motion, study});
      if (fixture?.hearth) dials = {...dials, fire: clamp01(fixture.hearth.fire) * DIALS.fire, flame: clamp01(fixture.hearth.fire), embers: clamp01(fixture.hearth.embers)};
      if (Array.isArray(fixture?.lamps)) {
        const levels = I.rooms.map((_, i) => clamp01(fixture.lamps[i]));
        dials = {...dials, lamps: levels.map(v => v * DIALS.lamp), doorway: levels[I.rooms.findIndex(r => r.id === 'hall')]};
      }
    } catch (error) {
      this.dialsFailed = true; console.warn("The cabin's light could not be worked out; its rooms keep their last light.", error); return;
    }
    this.dials = dials;
    this.yard.setDoorway(dials.doorway);
    if (!indoors) return;
    this.inside.setLight(dials);
    this.inside.setFire({fire: dials.fire / DIALS.fire, embers: dials.embers, seconds: motionSeconds, motion: this.motion});
  }
  // A check's fixture as this frame uses it (null without ?check): one that sets the rooms' lamps and not the cottage's pose gives the
  // yard's cottage windows the living room's and the study's levels too (its casement as the world has it), so a capture with those
  // lamps out shows no window glow lying on the grass outside them.
  checkFixture({snapshot, now, study}) {
    const fixture = this.check ? this.fixture : null, I = this.interior;
    if (!I || !Array.isArray(fixture?.lamps) || fixture.cottagePose) return fixture;
    const level = id => clamp01(fixture.lamps[I.rooms.findIndex(r => r.id === id)]), open = cottagePose({fixture: null, study, snapshot, now, motion: this.motion})?.open ?? 0;
    return {...fixture, cottagePose: {main: level('living'), second: level('study'), open}};
  }
  // The ids of the openings drawn live in the last frame.
  get liveViews() { return [...this.live]; }
  // The blueprint the visitor walks by: the furnished one; without the pieces passed over (and what is set on them) when some could not be
  // drawn; or, once the furniture's build has failed, the bare one (the chimney breasts alone). A blueprint that never had furniture is
  // walked as it is. Place memory and the passage keep the furnished blueprint.
  get walkPlan() {
    const I = this.interior, inside = this.inside;
    if (!inside || !Array.isArray(I?.furniture) || !I.furniture.length) return I;
    if (!inside.furnished) return this.bareWalk ??= bareInterior(I);
    const skipped = inside.skipped;
    if (!skipped?.length) return I;
    // (the builder replaces its skipped list only when a queued room's build adds to it)
    if (this.partWalkOf !== skipped) { this.partWalk = withoutPieces(I, skipped); this.partWalkOf = skipped; }
    return this.partWalk;
  }
  // Whether the room the visitor is in has its furniture built and drawn.
  get furnished() {
    if (!this.inside?.furnished || !this.interior || this.state.place !== 'cabin') return false;
    const r = roomAt(this.interior, this.state.floor, this.state.position);
    return !!r && (this.inside.furnishedRooms?.includes(r.id) ?? false);
  }
  // The name of the room the visitor is in, or null in the yard (or without the interior).
  get room() { return this.interior && this.state.place === 'cabin' ? roomAt(this.interior, this.state.floor, this.state.position)?.name ?? null : null; }
  // What is lit in the room the visitor is in: {room (its name), lamp (its level above LAMP_SEEN of full), fire ('burning', 'embers' or 'cold' in
  // the living room, null elsewhere)}; null in the yard, without the interior, or before the rooms' light was first worked out.
  get lit() {
    const I = this.interior, r = I && this.state.place === 'cabin' && this.dials ? roomAt(I, this.state.floor, this.state.position) : null;
    if (!r) return null;
    const {lamps, flame, embers} = this.dials, lamp = lamps[I.rooms.indexOf(r)] / DIALS.lamp > LAMP_SEEN;
    return {room: r.name, lamp, fire: r.id !== 'living' ? null : flame > FIRE_SEEN ? 'burning' : embers > EMBERS_SEEN ? 'embers' : 'cold'};
  }
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
    else if (this.state.place === 'cabin') this.state = stepIndoors(this.walkPlan, this.state, {...keys, look}, dt);
    else if (this.glideFrom) {
      const k = (t - this.glideStart) / (WALK.glideSeconds * 1000);
      this.state = pose(glide(this.glideFrom, this.space.arrival, k));
      if (k >= 1) this.glideFrom = null;
    } else this.state = pose(stepWalker(this.space, this.state, {...keys, look}, dt));
    let moved = false;
    if (this.passage) {
      const hadInside = !!this.inside;
      if (this.state.place === 'yard' && doorWanted(this.space, this.dressing, this.state)) this.buildInside();
      const {door, veil, move} = this.passage.frame(this.state, crossing ? {forward: 0} : keys, t / 1000, {ready: !!this.inside});
      if (move) { this.state = pose(move); this.glideFrom = null; moved = true; }
      // (floor 0 flushes on entry; floor 1 drains quietly in background frames and flushes when approaching or climbing the stair)
      if (this.state.place === 'cabin' && this.inside) {
        const floor = this.state.floor;
        this.inside.buildRest(floor);
        if (!move) {
          const pos = this.state.position, I = this.interior;
          const stairEnd = floor === 0 ? stairFoot(I) : stairTop(I);
          if (onStair(I, pos) || Math.hypot(pos[0] - stairEnd[0], pos[1] - stairEnd[1]) <= STAIR_FLUSH_RADIUS) this.inside.buildRest(1 - floor);
          else this.inside.buildNext();
        }
      } else if (hadInside) this.inside?.buildNext();
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
    const fixture = this.checkFixture({snapshot, now, study});
    if (this.interior) this.lightRooms({snapshot, now, study, calendar: c, weather: w, sky: {zenith, horizon}, motionSeconds, indoors, fixture});
    this.yard.setGarden(Number.isInteger(fixture?.gardenDay) ? fixture.gardenDay : c.day);
    this.applyLight(c, w, bodies, horizon);
    // Indoors the rain falls round the cabin's outside, centred over it at its eaves so the streaks stand above the roof windows
    // too: it is seen through every window and never in a room.
    const rainAt = indoors ? this.rainAt ??= new THREE.Vector3(...toThree([...this.space.cabin.center, cabinFrame(this.space, this.dressing).eave])) : null;
    this.life.update(lifeFrame({snapshot, now, study, motion: this.motion, motionSeconds, realSeconds, camera: this.camera, conditions, fixture, rainAt}));
    // Indoors the rooms are drawn instead of the yard, which (sky, light and life) carries on all the same, and is drawn again
    // through each live pane into the same frame.
    if (this.inside) this.updateSight();
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
