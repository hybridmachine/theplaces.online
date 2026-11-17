import * as THREE from '../assets/vendor/three-0.170.0.module.js';
import {toThree} from './geometry.js';
import {loadSpaceArt} from './art-loader.js';
import {buildScene} from './scene/index.js';
import {LAKESIDE_SPACE} from '../../shared/lakeside-space.js';
import {LAKESIDE_DRESSING} from '../../shared/lakeside-dressing.js';
import {WALK, eyePosition, glide, stepWalker} from '../../shared/walker.js';
import {SCENES, viewConditions} from '../../shared/world.js';
import {SKY_CAMERA} from '../../shared/celestial-projection.js';
import {sampleCloudLayers, skyBodies} from '../../shared/sky.js';
import {SkyDome, overcast} from './sky-dome.js';
import {WalkKeys, walkHint} from './walk-keys.js';
import {PlaceMemory} from './place-memory.js';
import {PainterlyPass} from './painterly-pass.js';
import {TIERS, createTierMeter} from './tier.js';

export {toThree};

// The painterly pass at full or reduced filter resolution, or off (the scene drawn straight to the canvas).
const PASS_SCALE = {full: 1, light: .6, off: null};
const TIER_PASS = {full: 'full', light: 'light', plain: 'off'};
const MAX_VERTICAL_FOV = 75, FOG_DENSITY = .0009, LOOK_PER_PIXEL = .004;
// Blockout light, day and night, mixed by calendar.light. Night stays dim and blue rather than black. Full overcast takes
// this share from the sky's light, by day and night alike; cloud takes its own share from the sun or moon.
const LIGHT = {day: {sky: '#dfe7ea', ground: '#7d7660', hemisphere: 1.7, sun: '#fff3dc', direct: 2.3},
  night: {sky: '#5d74a6', ground: '#262c3a', hemisphere: 1.1, moon: '#a9b8d6', direct: .7}, overcastShade: .35, cloudShade: .65};
const pose = s => ({position: [s.position[0], s.position[1]], yaw: s.yaw, pitch: s.pitch});
export const verticalFov = aspect => Math.min(MAX_VERTICAL_FOV, 2 * Math.atan(Math.tan(SKY_CAMERA.horizontalFov / 2) / aspect) * 180 / Math.PI);

// The light's strengths for a calendar and weather: blend (night 0 to day 1), the hemisphere's intensity, whether the sun
// (or else the moon) lights the yard, and the directional light's intensity before that body's own opacity and phase.
export function lightLevels(calendar, weather) {
  const blend = Math.max(0, Math.min(1, calendar.light)), sun = blend >= .5, {day, night} = LIGHT;
  const hemisphere = (night.hemisphere + (day.hemisphere - night.hemisphere) * blend) * (1 - LIGHT.overcastShade * overcast(weather));
  // Fade through the hand-over so the shadow side never jumps.
  const handover = Math.min(1, Math.abs(blend - .5) / .15);
  return {blend, sun, hemisphere, direct: (sun ? day.direct : night.direct) * (1 - weather.cloud * LIGHT.cloudShade) * handover};
}

export class SpaceView {
  constructor(canvas, {space = LAKESIDE_SPACE, dressing = LAKESIDE_DRESSING, sky = SCENES[0].sky, onFailure} = {}) {
    this.canvas = canvas; this.space = space; this.dressing = dressing; this.skyConfig = sky; this.onFailure = onFailure;
    this.state = pose(space.arrival);
    // Walking: held keys, drag deltas gathered since the last frame, an optional glide home, and the remembered place.
    this.keys = new WalkKeys(window, {blocked: () => [...document.querySelectorAll('dialog')].some(d => d.open)});
    let storage = null; try { storage = localStorage; } catch {}
    this.memory = new PlaceMemory({storage, space});
    this.placed = false; this.look = [0, 0]; this.looked = false; this.glideFrom = null; this.glideStart = 0; this.lastStep = null;
    this.visibility = () => { if (document.hidden) this.keys.release(); };
    // Registered after WalkKeys, so a walking key tap shorter than a frame still cancels a glide.
    this.keyCancel = () => { if (this.keys.moving()) this.glideFrom = null; };
    document.addEventListener('visibilitychange', this.visibility); addEventListener('keydown', this.keyCancel);
    this.birdRenderer = {valid: false}; this.birdActive = false; this.cottageActive = false; this.coincidenceActive = false;
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
    const params = new URLSearchParams(location.search), check = params.has('check'), fixed = check ? params.get('tier') : null;
    this.meter = TIERS.includes(fixed) ? createTierMeter({start: fixed, locked: true}) : createTierMeter();
    this.passMode = TIER_PASS[this.meter.tier]; this.shown = false;
    if (check) window.__space = this;
  }
  get tier() { return this.meter.tier; }
  async init() {
    if (this.disposed) return false;
    this.state = pose(this.memory.load() ?? this.space.arrival); this.placed = true;
    // Opaque: with alpha the canvas would let the page show through wherever alpha-to-coverage leaves a card edge part covered.
    const gl = this.canvas.getContext('webgl2', {alpha: false, antialias: true, powerPreference: 'low-power'});
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
    this.sky = new SkyDome(THREE, this.skyConfig); this.scene.add(this.sky.object3d);
    this.hemisphere = new THREE.HemisphereLight(); this.direct = new THREE.DirectionalLight(); this.scene.add(this.hemisphere, this.direct);
    this.colours = {day: {}, night: {}};
    for (const time of ['day', 'night']) for (const [key, value] of Object.entries(LIGHT[time]))
      if (typeof value === 'string') this.colours[time][key] = new THREE.Color(value);
    // Started locked on plain (?tier=plain), the pass would never be drawn.
    if (!this.plainForGood()) { this.pass = new PainterlyPass(THREE, renderer); this.setPass(this.passMode); }
    this.renderer = renderer;
    addEventListener('resize', this.resize); this.resize();
    return true;
  }
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
    if (this.motion) { this.glideFrom = pose(this.state); this.glideStart = performance.now(); }
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
    if (walking) this.glideFrom = null;
    if (this.glideFrom) {
      const k = (t - this.glideStart) / (WALK.glideSeconds * 1000);
      this.state = glide(this.glideFrom, this.space.arrival, k);
      if (k >= 1) this.glideFrom = null;
    } else this.state = stepWalker(this.space, this.state, {...keys, look}, dt);
    this.memory.note(this.state, walking || looked || this.glideFrom !== null);
  }
  render(snapshot, now, study = null) {
    if (!this.renderer || this.disposed || this.failed || !snapshot) return;
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
    this.camera.position.set(...toThree(eyePosition(this.space, this.state)));
    this.camera.rotation.y = -this.state.yaw; this.camera.rotation.x = this.state.pitch;
    const bodies = skyBodies(c, {seed: this.skyConfig.seed, model: this.skyConfig.celestial, worldMs: celestialTime});
    const clouds = sampleCloudLayers({realSeconds, motionSeconds, weather: w, config: this.skyConfig});
    const {zenith, horizon} = this.sky.update({calendar: c, weather: w, bodies, clouds, cameraPosition: this.camera.position});
    this.yard.setSky({zenith, horizon});
    this.applyLight(c, w, bodies, horizon);
    if (this.passMode === 'off' || !this.pass) this.renderer.render(this.scene, this.camera);
    else this.pass.render(this.scene, this.camera);
    if (this.shown) {
      const tier = this.meter.tier, next = this.meter.frame(performance.now());
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
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.releaseScene(this.renderer);
  }
  // Everything init made for the GPU, given back; safe to call again.
  releaseScene(renderer) {
    removeEventListener('resize', this.resize);
    for (const part of ['yard', 'art', 'sky', 'hemisphere', 'direct', 'pass']) { this[part]?.dispose(); this[part] = null; }
    renderer?.dispose(); this.renderer = null;
  }
}
