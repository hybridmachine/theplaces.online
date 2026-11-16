import {Color, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer} from '../assets/vendor/three-0.170.0.module.js';
import {LAKESIDE_SPACE} from '../../shared/lakeside-space.js';
import {eyePosition} from '../../shared/walker.js';
import {viewConditions} from '../../shared/world.js';
import {SKY_CAMERA} from '../../shared/celestial-projection.js';

// World axes are x east, y north, z up; three's are X east, Y up, Z south.
export const toThree = ([x, y, z]) => [x, z, -y];

const MAX_VERTICAL_FOV = 75, GROUND = '#5d6a45', SKY = '#aab6b0';
const verticalFov = aspect => Math.min(MAX_VERTICAL_FOV, 2 * Math.atan(Math.tan(SKY_CAMERA.horizontalFov / 2) / aspect) * 180 / Math.PI);

export class SpaceView {
  constructor(canvas, {space = LAKESIDE_SPACE, onFailure} = {}) {
    this.canvas = canvas; this.space = space; this.onFailure = onFailure;
    this.state = {position: [...space.arrival.position], yaw: space.arrival.yaw, pitch: space.arrival.pitch};
    this.birdRenderer = {valid: false}; this.birdActive = false; this.cottageActive = false; this.coincidenceActive = false;
    this.renderer = null; this.disposed = false; this.failed = false;
    this.media = matchMedia('(prefers-reduced-motion: reduce)'); this.motion = !this.media.matches;
    this.motionChanged = event => { this.motion = !event.matches; };
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
    this.renderer = new WebGLRenderer({canvas: this.canvas, context: gl, antialias: true, powerPreference: 'low-power'});
    this.scene = new Scene(); this.scene.background = new Color(SKY);
    this.camera = new PerspectiveCamera(MAX_VERTICAL_FOV, 1, .1, 4000); this.camera.rotation.order = 'YXZ';
    // Blockout ground: one flat plane at the lake surface, reaching to the far plane.
    this.ground = new Mesh(new PlaneGeometry(8000, 8000), new MeshBasicMaterial({color: GROUND}));
    this.ground.rotation.x = -Math.PI / 2; this.scene.add(this.ground);
    addEventListener('resize', this.resize); this.resize();
    return true;
  }
  panBy() {} // Dragging pans only the 2D painting; walking arrives in a later task.
  render(snapshot, now, study = null) {
    if (!this.renderer || this.disposed || this.failed || !snapshot) return;
    const conditions = viewConditions(snapshot.world.epoch, now, study);
    this.camera.position.set(...toThree(eyePosition(this.space, this.state)));
    this.camera.rotation.y = -this.state.yaw; this.camera.rotation.x = this.state.pitch;
    this.renderer.render(this.scene, this.camera);
    return conditions;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    removeEventListener('resize', this.resize); this.media.removeEventListener('change', this.motionChanged);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.ground?.geometry.dispose(); this.ground?.material.dispose();
    this.renderer?.dispose(); this.renderer = null;
  }
}
