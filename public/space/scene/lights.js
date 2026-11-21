import {terrainHeight} from '../../../shared/space.js';
import {pathLightPlan} from '../../../shared/lakeside-dressing.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {mergeGeometries, toThree, tube} from '../geometry.js';

// The path lights (pathLightPlan): a dark stake, a small pale lamp under a hood and, after dusk, the lamp's glow, a soft halo
// about it and a pool of warm light laid on the ground at its foot. Nothing here is a light source: the lamp is emitted and
// the halo and the pool are added over what is drawn, so the yard's shaders and their cost are as they were. World axes
// x east, y north, z up, metres; three is passed in.

// Linear colours. The bark's paint is dark, so the ironwork takes it nearly as it is; the lamp's glass is pale by day.
const IRON = [.75, .78, .85], GLASS = [.8, .76, .66], WARM = 0xffb561;
const GLOW = 1.7, HALO = {radius: .14, opacity: .6}, POOL = {opacity: .5, lift: .03, rings: 6, sectors: 20};
const clamp01 = t => Math.max(0, Math.min(1, t));

// The halo's light: added over the yard, brightest where the ball is seen face on (its middle) and falling off continuously
// to nothing at its rim, from whichever side it is seen, so the glow has no edge. Clipped by renderer.clippingPlanes.
const HALO_VERTEX = `varying vec3 vNormal, vView;
#include <clipping_planes_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1. );
  vNormal = normalMatrix * normal; vView = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const HALO_FRAGMENT = `uniform vec3 glow; uniform float opacity; varying vec3 vNormal, vView;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  // the cosine between the surface and the eye: 1 at the ball's middle, 0 on its silhouette
  float facing = clamp( dot( normalize( vNormal ), normalize( vView ) ), 0., 1. );
  gl_FragColor = vec4( glow, opacity * facing * facing * facing );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// Also the interior's fire-glow (public/space/interior/fireplace.js).
export function haloMaterial(THREE) {
  return new THREE.ShaderMaterial({uniforms: {glow: {value: new THREE.Color(WARM)}, opacity: {value: 0}}, vertexShader: HALO_VERTEX, fragmentShader: HALO_FRAGMENT,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, clipping: true});
}

export function buildPathLights(THREE, {space, dressing, art}) {
  const plan = pathLightPlan(space, dressing), {height, pool} = dressing.pathLights, tile = SPACE_ART.surfaces.bark.metres;
  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };
  const tinted = (g, colour) => { const c = g.getAttribute('color'); for (let i = 0; i < c.count; i++) c.setXYZ(i, ...colour); return g; };
  const stakes = [], lamps = [], halos = [], position = [], color = [], index = [];
  for (const {foot: [x, y, z]} of plan) {
    const top = z + height;
    stakes.push(tinted(tube(THREE, [[x, y, z - .06, .013], [x, y, top - .05, .011]], {sides: 6, tile}), IRON));
    // the hood: a shallow cone over the lamp, closed by running to a point
    stakes.push(tinted(tube(THREE, [[x, y, top + .035, .075], [x, y, top + .075, .03], [x, y, top + .09, .001]], {sides: 10, tile}), IRON));
    lamps.push(tinted(tube(THREE, [[x, y, top - .05, .028], [x, y, top + .04, .034]], {sides: 8}), GLASS));
    // the halo: one ball about the lamp, its smooth normals telling the material how near its rim each point is seen
    const halo = new THREE.IcosahedronGeometry(HALO.radius, 3); halo.translate(...toThree([x, y, top])); halos.push(halo);
    // the pool: rings draped on the ground about the foot, brightest at the middle and black (nothing added) at the rim
    const base = position.length / 3;
    position.push(...toThree([x, y, z + POOL.lift])); color.push(1, 1, 1);
    for (let r = 1; r <= POOL.rings; r++) for (let s = 0; s < POOL.sectors; s++) {
      const t = r / POOL.rings, a = s / POOL.sectors * 2 * Math.PI, px = x + Math.sin(a) * pool * t, py = y + Math.cos(a) * pool * t, k = (1 - t) ** 2;
      position.push(...toThree([px, py, terrainHeight(space, px, py) + POOL.lift])); color.push(k, k, k);
    }
    for (let s = 0; s < POOL.sectors; s++) {
      const n = (s + 1) % POOL.sectors;
      index.push(base, base + 1 + n, base + 1 + s); // counter-clockwise seen from above
      for (let r = 1; r < POOL.rings; r++) {
        const a = base + 1 + (r - 1) * POOL.sectors + s, b = base + 1 + (r - 1) * POOL.sectors + n, c = a + POOL.sectors, d = b + POOL.sectors;
        index.push(a, b, d, a, d, c);
      }
    }
  }
  const pools = new THREE.BufferGeometry();
  pools.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); pools.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  pools.setIndex(index);

  const added = opacity => ({color: WARM, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false});
  const materials = {
    stakes: new THREE.MeshLambertMaterial({map: art.surfaces.bark, vertexColors: true}),
    lamps: new THREE.MeshLambertMaterial({vertexColors: true, emissive: WARM, emissiveIntensity: 0}),
    halos: haloMaterial(THREE),
    pools: new THREE.MeshBasicMaterial({...added(0), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}),
  };
  const mesh = (name, geometry) => { const m = new THREE.Mesh(geometry, materials[name]); m.name = name; return m; };
  const object = new THREE.Group(); object.name = 'lights';
  const parts = {stakes: mesh('stakes', merged(stakes)), lamps: mesh('lamps', merged(lamps)), halos: mesh('halos', merged(halos)), pools: mesh('pools', pools)};
  object.add(...Object.values(parts));
  // How brightly the lamps burn, 0–1 (shared/path-lights.js). Dark, the halo and the pool are not drawn at all.
  const setLevel = level => {
    const k = clamp01(Number.isFinite(level) ? level : 0);
    materials.lamps.emissiveIntensity = k * GLOW; materials.halos.uniforms.opacity.value = k * HALO.opacity; materials.pools.opacity = k * POOL.opacity;
    parts.halos.visible = parts.pools.visible = k > 0;
  };
  setLevel(0);
  return {object, setLevel};
}
