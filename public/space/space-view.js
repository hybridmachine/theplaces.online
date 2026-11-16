import * as THREE from '../assets/vendor/three-0.170.0.module.js';
import {buildBlockout, toThree} from './blockout.js';
import {LAKESIDE_SPACE} from '../../shared/lakeside-space.js';
import {eyePosition} from '../../shared/walker.js';
import {SCENES, viewConditions} from '../../shared/world.js';
import {SKY_CAMERA} from '../../shared/celestial-projection.js';
import {sampleCloudLayers, skyBodies} from '../../shared/sky.js';
import {SkyDome} from './sky-dome.js';

export {toThree};

const MAX_VERTICAL_FOV = 75, FOG_DENSITY = .0009;
// Blockout light, day and night, mixed by calendar.light. Night stays dim and blue rather than black.
const LIGHT = {day: {sky: '#dfe7ea', ground: '#7d7660', hemisphere: 1.7, sun: '#fff3dc', direct: 2.3},
  night: {sky: '#5d74a6', ground: '#262c3a', hemisphere: 1.1, moon: '#a9b8d6', direct: .7}};
const verticalFov = aspect => Math.min(MAX_VERTICAL_FOV, 2 * Math.atan(Math.tan(SKY_CAMERA.horizontalFov / 2) / aspect) * 180 / Math.PI);

export class SpaceView {
  constructor(canvas, {space = LAKESIDE_SPACE, sky = SCENES[0].sky, onFailure} = {}) {
    this.canvas = canvas; this.space = space; this.skyConfig = sky; this.onFailure = onFailure;
    this.state = {position: [...space.arrival.position], yaw: space.arrival.yaw, pitch: space.arrival.pitch};
    this.birdRenderer = {valid: false}; this.birdActive = false; this.cottageActive = false; this.coincidenceActive = false;
    this.renderer = null; this.disposed = false; this.failed = false;
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
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
      this.renderer.setSize(innerWidth, innerHeight, false);
      this.camera.aspect = innerWidth / innerHeight; this.camera.fov = verticalFov(this.camera.aspect);
      this.camera.updateProjectionMatrix();
    };
    this.contextLost = event => {
      event.preventDefault();
      if (this.failed || this.disposed) return;
      this.failed = true; this.onFailure?.();
    };
    if (new URLSearchParams(location.search).has('check')) window.__space = this;
  }
  async init() {
    if (this.disposed) return false;
    const gl = this.canvas.getContext('webgl2', {antialias: true, powerPreference: 'low-power'});
    if (!gl) return false;
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.renderer = new THREE.WebGLRenderer({canvas: this.canvas, context: gl, antialias: true, powerPreference: 'low-power'});
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2('#d3d3bf', FOG_DENSITY);
    this.camera = new THREE.PerspectiveCamera(MAX_VERTICAL_FOV, 1, .1, 4000); this.camera.rotation.order = 'YXZ';
    this.blockout = buildBlockout(THREE, this.space); this.scene.add(this.blockout.group);
    this.sky = new SkyDome(THREE, this.skyConfig); this.scene.add(this.sky.object3d);
    this.hemisphere = new THREE.HemisphereLight(); this.direct = new THREE.DirectionalLight(); this.scene.add(this.hemisphere, this.direct);
    this.colours = {day: {}, night: {}};
    for (const [time, values] of Object.entries(LIGHT)) for (const [key, value] of Object.entries(values))
      if (typeof value === 'string') this.colours[time][key] = new THREE.Color(value);
    addEventListener('resize', this.resize); this.resize();
    await this.sky.load(); // never rejects; a missing atlas leaves a clear sky
    return !this.disposed;
  }
  panBy() {} // Dragging pans only the 2D painting; walking arrives in a later task.
  render(snapshot, now, study = null) {
    if (!this.renderer || this.disposed || this.failed || !snapshot) return;
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
    const {horizon} = this.sky.update({calendar: c, weather: w, bodies, clouds, cameraPosition: this.camera.position});
    this.applyLight(c, w, bodies, horizon);
    this.renderer.render(this.scene, this.camera);
    return conditions;
  }
  // Hemisphere light from the sky, one directional light from the sun by day and the moon by night, fog in the horizon colour.
  applyLight(calendar, weather, bodies, horizon) {
    const t = Math.max(0, Math.min(1, calendar.light)), {day, night} = this.colours, shade = 1 - weather.cloud * .65;
    this.hemisphere.color.lerpColors(night.sky, day.sky, t); this.hemisphere.groundColor.lerpColors(night.ground, day.ground, t);
    this.hemisphere.intensity = LIGHT.night.hemisphere + (LIGHT.day.hemisphere - LIGHT.night.hemisphere) * t;
    const sun = t >= .5, body = sun ? bodies.sun : bodies.moon;
    // Fade through the hand-over so the shadow side never jumps.
    const handover = Math.min(1, Math.abs(t - .5) / .15);
    this.direct.color.copy(sun ? day.sun : night.moon);
    this.direct.intensity = (sun ? LIGHT.day.direct : LIGHT.night.direct * bodies.moon.illumination) * body.opacity * shade * handover;
    this.direct.position.set(...toThree(body.direction)).multiplyScalar(100);
    this.scene.fog.color.setRGB(...horizon, THREE.SRGBColorSpace);
    this.scene.fog.density = FOG_DENSITY * (1 + weather.rain);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    removeEventListener('resize', this.resize); this.media.removeEventListener('change', this.motionChanged);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.blockout?.dispose(); this.sky?.dispose(); this.hemisphere?.dispose(); this.direct?.dispose();
    this.renderer?.dispose(); this.renderer = null;
  }
}
