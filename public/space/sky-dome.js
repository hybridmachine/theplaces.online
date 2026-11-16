import {toThree} from './geometry.js';
import {skyLighting} from '../../shared/sky.js';

// The shared sky drawn round the camera: clear-sky gradient, stars, sun and moon, then two cloud layers.
// Every part ignores depth and draws before the yard (low renderOrder, opaque queue), so geometry covers it.
// Shader colours are the painting's display (sRGB) values, written without conversion, as in the 2D renderer.

const DEG = Math.PI / 180, R = 1000, GLOW = 6, CLOUD_TOP = 60 * DEG, CLOUD_BOTTOM = 4 * DEG;
// The 2D painting's focal length in image pixels (1672 wide, 100° across); star radii are in those pixels.
const PAINTING_FOCAL = 1672 / (2 * Math.tan(50 * DEG));
const DAY_TOP = [157, 179, 193], DAY_HORIZON = [211, 211, 191], NIGHT = [.22, .31, .43];
const STAR = [231, 236, 218].map(v => v / 255), MOON = [230, 233, 215].map(v => v / 255);
const clamp = x => Math.max(0, Math.min(1, x));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const warm = (rgb, dusk, k) => [rgb[0] * (1 + dusk * .08 * k), rgb[1] * (1 - dusk * .025 * k), rgb[2] * (1 - dusk * .11 * k)];

// Clear-sky zenith and horizon colours (0–1 display values): day and the night scaling mixed by light, warmed at dusk, most at the horizon.
export function skyColours(calendar, dusk) {
  const tone = rgb => mix(rgb.map((v, i) => v / 255 * NIGHT[i]), rgb.map(v => v / 255), clamp(calendar.light));
  return {zenith: warm(tone(DAY_TOP), dusk, .5), horizon: warm(tone(DAY_HORIZON), dusk, 1.5)};
}

const SKY_VERTEX = `varying vec3 vDir;
void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// The painting reaches its top colour about 30° above the horizon.
const DOME_FRAGMENT = `uniform vec3 zenith,horizon,sunDir;uniform float sunWarmth;varying vec3 vDir;
void main(){
  vec3 dir=normalize(vDir);
  vec3 sky=mix(horizon,zenith,smoothstep(0.,.5,dir.y));
  sky+=vec3(.08,.032,.006)*exp((dot(dir,sunDir)-1.)*9.)*sunWarmth;
  gl_FragColor=vec4(sky,1.);
}`;
// Stars are hidden inside a visible sun or moon disc, so the moon's dark side still covers them.
const STAR_VERTEX = `attribute float opacity,angle;uniform float viewHeight;uniform vec4 moonDisc,sunDisc;varying float vAlpha;
void main(){
  vec3 d=normalize(position);
  float hidden=max(step(moonDisc.w,dot(d,moonDisc.xyz)),step(sunDisc.w,dot(d,sunDisc.xyz)));
  float size=2.*angle*projectionMatrix[1][1]*viewHeight; // diameter in pixels
  gl_PointSize=max(size,1.5);
  vAlpha=opacity*(1.-hidden)*min(1.,size*size/2.25);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;
const STAR_FRAGMENT = `uniform vec3 color;varying float vAlpha;
void main(){float a=vAlpha*(1.-smoothstep(.6,1.,length(gl_PointCoord-.5)*2.));gl_FragColor=vec4(color*a,a);}`;
const DISC_VERTEX = `varying vec2 vUv;void main(){vUv=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// A disc of radius 1 inside a glow out to six radii, like the 2D canvas. The moon's lit side faces the sun (light in quad space).
const DISC_FRAGMENT = `uniform vec3 color,light;uniform float opacity,glow,moon;varying vec2 vUv;
void main(){
  vec2 p=vUv*${GLOW.toFixed(1)};float r=length(p),aa=fwidth(r);
  float halo=opacity*glow*(1.-clamp((r-.6)/${(GLOW - .6).toFixed(1)},0.,1.));
  float disc=1.-smoothstep(1.-aa,1.+aa,r);
  if(moon>.5){vec3 n=vec3(p,sqrt(max(0.,1.-r*r)));disc*=smoothstep(-.04,.04,dot(n,light));}
  float a=opacity*disc;
  gl_FragColor=vec4(color*a+(1.-a)*color*halo,a+(1.-a)*halo);
}`;
// The 2D cloud rule (sky-renderer.js FRAGMENT) with the strip wrapped round the azimuth between 4° and 60°.
const CLOUD_FRAGMENT = `uniform sampler2D atlas;uniform vec4 layer0,layer1,rect0,rect1,density0,density1;uniform vec2 deform0,deform1;uniform vec3 tint0,tint1;
varying vec3 vDir;
vec4 over(vec4 front,vec4 back){return front+(1.-front.a)*back;}
vec4 cloudLayer(vec2 sky,vec4 layer,vec4 rect,vec4 density,vec2 deform,vec3 tint){
  vec2 local=vec2(sky.x*layer.z-layer.x/layer.y,(${CLOUD_TOP.toFixed(6)}-sky.y)/${(CLOUD_TOP - CLOUD_BOTTOM).toFixed(6)});
  local.y+=sin(local.x*6.283185307+deform.x)*deform.y;
  local.x+=sin(local.y*5.+deform.x)*deform.y*.3;
  float band=smoothstep(0.,.035,local.y)*(1.-smoothstep(.965,1.,local.y));
  vec4 paint=texture2D(atlas,rect.xy+vec2(fract(local.x),clamp(local.y,0.,1.))*rect.zw);
  float alpha=max(smoothstep(density.x-density.y,density.x+density.y,paint.a)*density.z*band,density.w);
  vec3 shading=paint.a>.001?paint.rgb/paint.a:vec3(.82);
  return vec4(shading*tint*alpha,alpha);
}
void main(){
  vec3 dir=normalize(vDir);
  vec2 sky=vec2(atan(dir.x,-dir.z)/6.283185307,asin(clamp(dir.y,-1.,1.)));
  gl_FragColor=over(cloudLayer(sky,layer1,rect1,density1,deform1,tint1),cloudLayer(sky,layer0,rect0,density0,deform0,tint0));
}`;

function loadImage(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.onload = image.onerror = null; image.src = ''; reject(new Error(`Timed out loading ${url}`)); }, timeout);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error(`Could not load ${url}`)); };
    image.src = url;
  });
}

export class SkyDome {
  constructor(THREE, skyConfig) {
    this.THREE = THREE; this.config = skyConfig; this.disposed = false; this.texture = null;
    const premultiplied = {transparent: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      depthTest: false, depthWrite: false};
    const part = (object, order, name) => { object.renderOrder = order; object.frustumCulled = false; object.name = name; this.object3d.add(object); return object; };
    this.object3d = new THREE.Group(); this.object3d.name = 'sky';

    this.domeGeometry = new THREE.SphereGeometry(R, 64, 32);
    this.domeMaterial = new THREE.ShaderMaterial({vertexShader: SKY_VERTEX, fragmentShader: DOME_FRAGMENT, side: THREE.BackSide, depthTest: false, depthWrite: false,
      uniforms: {zenith: {value: new THREE.Vector3()}, horizon: {value: new THREE.Vector3()}, sunDir: {value: new THREE.Vector3(0, 1, 0)}, sunWarmth: {value: 0}}});
    part(new THREE.Mesh(this.domeGeometry, this.domeMaterial), -4, 'clear sky');

    this.starGeometry = new THREE.BufferGeometry();
    this.starMaterial = new THREE.ShaderMaterial({vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT, ...premultiplied,
      uniforms: {color: {value: new THREE.Vector3(...STAR)}, viewHeight: {value: 1}, moonDisc: {value: new THREE.Vector4(0, 1, 0, 2)}, sunDisc: {value: new THREE.Vector4(0, 1, 0, 2)}}});
    this.stars = part(new THREE.Points(this.starGeometry, this.starMaterial), -3, 'stars');
    const size = new THREE.Vector2();
    this.stars.onBeforeRender = renderer => { this.starMaterial.uniforms.viewHeight.value = renderer.getDrawingBufferSize(size).y / 2; };

    this.discGeometry = new THREE.PlaneGeometry(2, 2);
    const disc = (name, color, glow, moon) => {
      const material = new THREE.ShaderMaterial({vertexShader: DISC_VERTEX, fragmentShader: DISC_FRAGMENT, ...premultiplied,
        uniforms: {color: {value: new THREE.Vector3(...color)}, light: {value: new THREE.Vector3(0, 0, 1)}, opacity: {value: 0}, glow: {value: glow}, moon: {value: moon}}});
      return part(new THREE.Mesh(this.discGeometry, material), -2, name);
    };
    this.sun = disc('sun', [1, 1, 1], .2, 0); this.moon = disc('moon', MOON, .1, 1);

    this.cloudGeometry = new THREE.SphereGeometry(R * .95, 64, 32);
    const uniforms = {atlas: {value: null}};
    for (const i of [0, 1]) for (const [key, value] of [['layer', new THREE.Vector4()], ['rect', new THREE.Vector4()], ['density', new THREE.Vector4()], ['deform', new THREE.Vector2()], ['tint', new THREE.Vector3()]])
      uniforms[key + i] = {value};
    this.cloudMaterial = new THREE.ShaderMaterial({vertexShader: SKY_VERTEX, fragmentShader: CLOUD_FRAGMENT, side: THREE.BackSide, ...premultiplied, uniforms});
    this.clouds = part(new THREE.Mesh(this.cloudGeometry, this.cloudMaterial), -1, 'clouds');
    this.clouds.visible = false; // until the atlas arrives
  }
  // Resolves either way: without the atlas the sky simply has no clouds.
  async load() {
    const {THREE, config} = this;
    try {
      const image = await loadImage(config.assets.clouds);
      if (image.naturalWidth !== config.atlasSize[0] || image.naturalHeight !== config.atlasSize[1]) throw new Error('Invalid cloud atlas dimensions');
      if (this.disposed) return false;
      const texture = new THREE.Texture(image);
      Object.assign(texture, {flipY: false, premultiplyAlpha: true, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, colorSpace: THREE.NoColorSpace, needsUpdate: true});
      this.texture = texture; this.cloudMaterial.uniforms.atlas.value = texture; this.clouds.visible = true;
      return true;
    } catch (error) {
      console.warn('The 3D sky has no clouds:', error.message);
      return false;
    }
  }
  update({calendar, weather, bodies, clouds, cameraPosition}) {
    const {dusk} = skyLighting(calendar, weather), u = this.domeMaterial.uniforms, {zenith, horizon} = skyColours(calendar, dusk);
    this.object3d.position.copy(cameraPosition);
    u.zenith.value.set(...zenith); u.horizon.value.set(...horizon);
    u.sunDir.value.set(...toThree(bodies.sun.direction));
    // The same low-sun warmth the 2D sky adds round the sun.
    u.sunWarmth.value = (1 - weather.cloud * .85) * Math.max(0, 1 - Math.abs(Math.asin(Math.max(-1, Math.min(1, bodies.sun.direction[2]))) - .05) / .22);

    const count = bodies.stars.length;
    if (this.starGeometry.getAttribute('position')?.count !== count) {
      this.starGeometry.setAttribute('position', new this.THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
      this.starGeometry.setAttribute('opacity', new this.THREE.Float32BufferAttribute(new Float32Array(count), 1));
      this.starGeometry.setAttribute('angle', new this.THREE.Float32BufferAttribute(new Float32Array(count), 1));
    }
    const position = this.starGeometry.getAttribute('position'), opacity = this.starGeometry.getAttribute('opacity'), angle = this.starGeometry.getAttribute('angle');
    bodies.stars.forEach((star, i) => {
      const [x, y, z] = toThree(star.direction);
      position.setXYZ(i, x * R * .9, y * R * .9, z * R * .9); opacity.setX(i, star.opacity); angle.setX(i, star.radius / PAINTING_FOCAL);
    });
    position.needsUpdate = opacity.needsUpdate = angle.needsUpdate = true;
    this.stars.visible = bodies.stars.some(star => star.opacity > 1 / 510);

    const place = (mesh, body, discUniform) => {
      const direction = toThree(body.direction), radius = Math.tan(body.angularDiameter / 2), visible = body.opacity > 0;
      mesh.visible = visible;
      mesh.position.set(direction[0] * R * .85, direction[1] * R * .85, direction[2] * R * .85);
      mesh.scale.setScalar(R * .85 * radius * GLOW); mesh.lookAt(this.object3d.position);
      mesh.material.uniforms.opacity.value = body.opacity;
      discUniform.set(...direction, visible ? Math.cos(Math.atan(radius) * 1.05) : 2);
    };
    place(this.sun, bodies.sun, this.starMaterial.uniforms.sunDisc.value);
    place(this.moon, bodies.moon, this.starMaterial.uniforms.moonDisc.value);
    const warmth = bodies.sun.warmth;
    this.sun.material.uniforms.color.value.set(1, (248 - 65 * warmth) / 255, (217 - 89 * warmth) / 255);
    const moonU = this.moon.material.uniforms;
    moonU.glow.value = .1 * bodies.moon.illumination;
    // The sun's true direction in the moon quad's frame (x right, y up, z toward the viewer).
    this.moon.updateMatrixWorld();
    moonU.light.value.set(...toThree(bodies.sunDirection)).applyQuaternion(this.moon.quaternion.clone().invert());

    if (this.clouds.visible) {
      const c = this.cloudMaterial.uniforms, [aw, ah] = this.config.atlasSize;
      const shade = [1 + dusk * .08, 1 - dusk * .025, 1 - dusk * .11];
      clouds.forEach((state, i) => {
        const layer = this.config.layers[i], [x, y, w, h] = layer.rect, d = state.density;
        // Whole repeats round the horizon, near the 2D scale (one atlas width spans `period` 100° views).
        c[`layer${i}`].value.set(state.phase, layer.period, Math.max(1, Math.round(360 / (layer.period * 100))), 0);
        c[`rect${i}`].value.set((x + .5) / aw, (y + .5) / ah, (w - 1) / aw, (h - 1) / ah);
        c[`density${i}`].value.set(d.threshold, d.softness, d.opacity, d.floor);
        c[`deform${i}`].value.set(state.deformation, layer.deformationAmount);
        c[`tint${i}`].value.set(...layer.dayTint.map((day, k) => (layer.nightTint[k] + (day - layer.nightTint[k]) * calendar.light) * (1 - weather.rain * .16) * shade[k]));
      });
    }
    return {zenith, horizon};
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const object of [this.domeGeometry, this.domeMaterial, this.starGeometry, this.starMaterial, this.discGeometry,
      this.sun.material, this.moon.material, this.cloudGeometry, this.cloudMaterial, this.texture]) object?.dispose();
    this.texture = null; this.object3d.removeFromParent();
  }
}
