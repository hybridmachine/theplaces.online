import {terrainHeight} from '../../../shared/space.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {toThree} from '../geometry.js';
import {noise} from './ground.js';

// The far hills: four ridges in rings round the yard, each farther one higher, paler and bluer, painted with the hills brushwork.
// Each ridge rises from below the water's level (under the ground, on land) to a gently rolling crest; the crest's own small breaks, its soft
// sky edge and the mist low on every ridge are made in the shader, so the material stays alpha-tested and takes the yard's
// light and fog. World axes x east, y north, z up, metres; three is passed in.

const TAU = 2 * Math.PI, DEG = Math.PI / 180, FOOT = -2, SPACING = 4;
// radius: crest distance from the arrival spot, m. lift / east: crest angle above the arrival eye, degrees, all round and added
// toward the east (the painting's view). roll: degrees of rolling up and down. clear: least crest height above the ground under it.
// tint multiplies the brushwork (linear) and contrast keeps that much of its light and dark; haze is how far the whole ridge is
// taken into the horizon colour, mist how far it is where it rises from behind the nearer ridge; rag is the depth, in metres,
// of the broken band along the crest.
const RIDGES = [
  {radius: 520, lift: 1.1, east: 1.2, roll: 2.8, clear: 14, tint: [.42, .56, .34], contrast: .5, haze: .04, mist: .45, rag: 5, seed: 61},
  {radius: 650, lift: 1.6, east: 2.2, roll: 2.4, clear: 18, tint: [.56, .68, .54], contrast: .45, haze: .18, mist: .65, rag: 6, seed: 62},
  {radius: 790, lift: 2.1, east: 3.3, roll: 2.1, clear: 22, tint: [.72, .82, .84], contrast: .4, haze: .32, mist: .6, rag: 7, seed: 63},
  {radius: 940, lift: 2.7, east: 4.3, roll: 2.3, clear: 26, tint: [.84, .92, 1.04], contrast: .35, haze: .45, mist: .5, rag: 8, seed: 64},
];
// The slope from base to crest, as (share of the rise, share of the run). Steep low down and rounding over at the top.
const PROFILE = [[0, 0], [.4, .1], [.7, .33], [.9, .64], [1, 1]];
const NEAREST_BASE = 400;

// Rolling up and down round a ring at radius r, about [-1, 1]: broad swells, then shoulders and knolls at shorter scales.
function rolling(r, theta, seed) {
  const x = r * Math.sin(theta), y = r * Math.cos(theta);
  let sum = 0, weight = 0;
  for (const [metres, w, k] of [[520, 1, 0], [210, .5, 1], [85, .25, 2], [34, .14, 3], [13, .07, 4]]) {
    sum += w * (noise(x / metres, y / metres, seed * 8 + k) * 2 - 1); weight += w;
  }
  // Summits: a folded octave, so the tops gather into rounded peaks instead of lying flat.
  const fold = 1 - (noise(x / 300, y / 300, seed * 8 + 5) * 2 - 1) ** 2;
  return sum / weight * 1.3 + (fold * fold - .45) * 1.1;
}

// The ridges' crests and the land under them, round the arrival spot. Bearings clockwise from north.
function ridgeLine(space) {
  const [cx, cy] = space.arrival.position, eye = terrainHeight(space, cx, cy) + space.eyeHeight;
  const ground = (r, theta) => Math.max(0, terrainHeight(space, cx + r * Math.sin(theta), cy + r * Math.cos(theta)));
  const crest = (ridge, theta) => {
    const {radius, lift, east, roll, clear, seed} = ridge, eastward = Math.max(0, Math.cos(theta - 90 * DEG)) ** 2;
    const angle = (lift + east * eastward + roll * rolling(radius, theta, seed)) * DEG;
    return Math.max(eye + radius * Math.tan(angle), ground(radius, theta) + clear);
  };
  return {centre: [cx, cy], eye, ground, crest};
}

// One ring of ridge as an indexed mesh, facing the middle. Vertices carry `ridge`: metres below the crest, and metres above
// what hides the ridge from the arrival spot (the nearer ridge's crest, or for the nearest the water or ground at its foot);
// and `layer`: haze, mist, rag, contrast.
function ridgeGeometry(THREE, line, k) {
  const ridge = RIDGES[k], {radius, tint, haze, mist, rag, contrast} = ridge, {centre: [cx, cy], eye, ground, crest} = line;
  const base = k ? RIDGES[k - 1].radius + 5 : NEAREST_BASE;
  const ns = Math.ceil(TAU * radius / SPACING), tiles = Math.round(TAU * radius / SPACE_ART.surfaces.hills.metres);
  const position = [], uv = [], color = [], ridgeAttr = [], layer = [], index = [], rows = PROFILE.length;
  for (let i = 0; i <= ns; i++) {
    const theta = i % ns / ns * TAU, top = crest(ridge, theta); // the last column is the first, exactly
    const cover = k ? eye + (crest(RIDGES[k - 1], theta) - eye) * radius / RIDGES[k - 1].radius : ground(base, theta);
    // The foot is below the water's level everywhere, so on land it is well under the ground: it cannot show.
    for (const [up, out] of PROFILE) {
      const r = base + (radius - base) * out, z = FOOT + (top - FOOT) * up;
      position.push(...toThree([cx + r * Math.sin(theta), cy + r * Math.cos(theta), z]));
      uv.push(i / ns * tiles, z / SPACE_ART.surfaces.hills.metres); color.push(...tint);
      ridgeAttr.push(top - z, z - cover); layer.push(haze, mist, rag, contrast);
    }
  }
  for (let i = 0; i < ns; i++) for (let j = 0; j < rows - 1; j++) {
    const a = i * rows + j, b = a + rows;
    index.push(a, b + 1, a + 1, a, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  for (const [name, array, size] of [['position', position, 3], ['uv', uv, 2], ['color', color, 3], ['ridge', ridgeAttr, 2], ['layer', layer, 4]])
    g.setAttribute(name, new THREE.Float32BufferAttribute(array, size));
  g.setIndex(index); g.computeVertexNormals();
  // The ring's first and last columns are the same place: give them one normal so the seam does not show.
  const n = g.getAttribute('normal');
  for (let j = 0; j < rows; j++) {
    const a = j, b = ns * rows + j, v = [0, 1, 2].map(c => n.array[a * 3 + c] + n.array[b * 3 + c]), l = Math.hypot(...v);
    for (let c = 0; c < 3; c++) n.array[a * 3 + c] = n.array[b * 3 + c] = v[c] / l;
  }
  return g;
}

function mergeRings(THREE, geometries) {
  const out = {}, index = [];
  let base = 0;
  for (const g of geometries) {
    for (const [name, attr] of Object.entries(g.attributes)) { const into = (out[name] ??= {size: attr.itemSize, values: []}).values; for (const v of attr.array) into.push(v); }
    for (const i of g.index.array) index.push(i + base);
    base += g.getAttribute('position').count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  for (const [name, {values, size}] of Object.entries(out)) merged.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  merged.setIndex(index);
  return merged;
}

// Lambert, so the ridges take the yard's light and fog. The crest is cut ragged by noise along it and by the brushwork's own
// light and dark (alpha-tested, never blended); every ridge is taken into the horizon colour by its haze and, where it rises
// from behind the nearer ridge or the water, by drifts of mist, so the far shore dissolves as in the painting.
function hillsMaterial(THREE, art, centre) {
  const m = new THREE.MeshLambertMaterial({map: art.surfaces.hills, vertexColors: true, alphaTest: .5, alphaToCoverage: true});
  m.onBeforeCompile = s => {
    s.uniforms.hillCentre = {value: new THREE.Vector2(centre[0], -centre[1])};
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 ridge;\nattribute vec4 layer;\nvarying vec2 vRidge;\nvarying vec4 vLayer;\nvarying vec3 vPlace;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRidge = ridge; vLayer = layer; vPlace = ( modelMatrix * vec4( position, 1. ) ).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vRidge;
varying vec4 vLayer;
varying vec3 vPlace;
uniform vec2 hillCentre;
float hillHash( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * .1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float hillNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3. - 2. * f );
  return mix( mix( hillHash( i ), hillHash( i + vec2( 1., 0. ) ), f.x ), mix( hillHash( i + vec2( 0., 1. ) ), hillHash( i + vec2( 1. ) ), f.x ), f.y );
}`)
      .replace('#include <map_fragment>', `
  vec4 brush = texture2D( map, vMapUv );
  vec3 brushMean = texture( map, vec2( .5 ), 16. ).rgb;
  const vec3 LUMA = vec3( .3, .59, .11 );
  float rag = vLayer.z, brushLight = dot( brush.rgb, LUMA ) / dot( brushMean, LUMA ) * .5;
  // Distance quietens the brushwork toward its own mean colour.
  diffuseColor.rgb *= mix( brushMean, brush.rgb, vLayer.w );
  // Metres below the crest where the paint begins: noise along the ridge at two scales, broken further by the brushwork.
  // It follows the bearing alone (a point on a ring about as far off as the ridge), so the cut is the same on every row.
  vec2 along = normalize( vPlace.xz - hillCentre ) * rag * 115.;
  float breaks = .6 * hillNoise( along / ( rag * 4. ) ) + .4 * hillNoise( along / ( rag * 1.5 ) + 17. );
  float cut = rag * ( breaks * breaks * 1.6 - .1 ) + ( brushLight - .5 ) * rag * .3;
  diffuseColor.a = clamp( .5 + ( vRidge.x - cut ) / ( rag * .3 ), 0., 1. );`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
#ifdef USE_FOG
  {
    // Mist lies where the ridge rises from behind the nearer one (or from the water), in drifts longer than they are deep.
    float depth = .022 * length( vPlace.xz );
    float wisps = hillNoise( vec2( ( along.x + along.y ) / 160., vPlace.y / 9. ) ) * .65 + hillNoise( vec2( ( along.x - along.y ) / 50., vPlace.y / 4. ) ) * .35;
    // in separate banks with clear gaps between, never one stripe along a crest
    float banks = smoothstep( .3, .8, hillNoise( along / 380. + 3. ) ) * smoothstep( .25, .6, hillNoise( along / 90. + 11. ) );
    float mist = vLayer.y * banks * ( 1. - smoothstep( 0., depth, vRidge.y - ( wisps - .45 ) * depth * 1.2 ) );
    float haze = 1. - ( 1. - vLayer.x ) * ( 1. - mist );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, haze );
  }
#endif`);
  };
  m.customProgramCacheKey = () => 'painted-hills';
  return m;
}

// {object, dispose()}: the group `hills`, one mesh of every ridge, centred on the arrival spot.
export function buildHills(THREE, {space, art}) {
  const line = ridgeLine(space), rings = RIDGES.map((_, k) => ridgeGeometry(THREE, line, k));
  const mesh = new THREE.Mesh(mergeRings(THREE, rings), hillsMaterial(THREE, art, line.centre)); mesh.name = 'ridges';
  const object = new THREE.Group(); object.name = 'hills'; object.add(mesh);
  return {object, dispose() { mesh.geometry.dispose(); mesh.material.dispose(); }};
}
