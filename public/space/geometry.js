import {cellRect, SPACE_ART} from '../../shared/lakeside-space-art.js';
import {SWAY, WIND} from '../../shared/lakeside-life.js';

// Geometry helpers shared by the scene builders. World axes are x east, y north, z up, metres; three is passed in.

// three's axes are X east, Y up, Z south. A proper rotation, so winding survives it.
export const toThree = ([x, y, z]) => [x, z, -y];
// The lake's surface: metres of world z, which is three's y. The scene lays the water there and the painterly pass leaves it unmarked.
export const LAKE_LEVEL = -.004;

const TAU = 2 * Math.PI;
export const V = {
  add: (a, b, k = 1) => a.map((v, i) => v + k * b[i]), sub: (a, b) => a.map((v, i) => v - b[i]), scale: (a, k) => a.map(v => v * k),
  dot: (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len: a => Math.hypot(...a),
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); },
};
// Two unit vectors perpendicular to unit `n` and to each other.
export function basis(n) {
  const r = V.norm(V.cross(Math.abs(n[2]) > .9 ? [1, 0, 0] : [0, 0, 1], n));
  return [r, V.cross(n, r)];
}

function geometryFrom(THREE, attributes, index) {
  const g = new THREE.BufferGeometry();
  for (const [name, [array, size]] of Object.entries(attributes)) g.setAttribute(name, new THREE.Float32BufferAttribute(array, size));
  if (index) g.setIndex(index);
  return g;
}

// A grid surface over (s, t) ∈ [0, 1]², `f(s, t)` → world point. UVs are metres along the surface (s across, t up) over `tile`,
// so a texture keeps its world scale however the sheet bends. Triangles face the side `outward` names: a world vector, or a
// function of the world point. Vertex colours are white unless `colour(point)` gives a linear [r, g, b].
export function sheet(THREE, f, {ns = 1, nt = 1, tile = 1, outward = [0, 0, 1], colour} = {}) {
  const pts = [];
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) pts.push(f(i / ns, j / nt));
  const at = (i, j) => pts[j * (ns + 1) + i], uv = [], position = [], color = [];
  // u accumulates along each row, v along each column, both in metres.
  const along = Array(nt + 1).fill(0), up = Array(ns + 1).fill(0);
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
    if (i) along[j] += V.len(V.sub(at(i, j), at(i - 1, j)));
    if (j) up[i] += V.len(V.sub(at(i, j), at(i, j - 1)));
    const p = at(i, j);
    position.push(...toThree(p)); uv.push(along[j] / tile, up[i] / tile); color.push(...(colour ? colour(p) : [1, 1, 1]));
  }
  // Which way the sheet faces, judged at its middle cell.
  const ci = Math.floor(ns / 2), cj = Math.floor(nt / 2), a = at(ci, cj), n = V.cross(V.sub(at(ci + 1, cj), a), V.sub(at(ci, cj + 1), a));
  const mid = f((ci + .5) / ns, (cj + .5) / nt), flip = V.dot(n, typeof outward === 'function' ? outward(mid) : outward) < 0;
  const index = [];
  for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) {
    const p = j * (ns + 1) + i, q = p + 1, r = p + ns + 2, s = p + ns + 1;
    index.push(...(flip ? [p, r, q, p, s, r] : [p, q, r, p, r, s]));
  }
  const g = geometryFrom(THREE, {position: [position, 3], uv: [uv, 2], color: [color, 3]}, index);
  g.computeVertexNormals();
  return g;
}

// A tapered tube along a polyline of [x, y, z, radius]. UVs: u around (metres of circumference), v along (metres), both over
// `tile`. Open at both ends; normals point outward.
export function tube(THREE, points, {sides = 8, tile = 1} = {}) {
  const position = [], normal = [], uv = [], color = [], index = [];
  let along = 0, prev = null;
  points.forEach((pt, k) => {
    const c = pt.slice(0, 3), a = points[Math.max(0, k - 1)].slice(0, 3), b = points[Math.min(points.length - 1, k + 1)].slice(0, 3);
    const d = V.norm(V.sub(b, a));
    if (k) along += V.len(V.sub(c, points[k - 1].slice(0, 3)));
    // Carry the ring's frame along the curve so the tube does not twist where it bends.
    let [r1, r2] = basis(d);
    const carried = prev && V.sub(prev, V.scale(d, V.dot(prev, d)));
    if (carried && V.len(carried) > 1e-6) { r1 = V.norm(carried); r2 = V.cross(d, r1); }
    prev = r1;
    for (let s = 0; s <= sides; s++) {
      const t = s / sides * TAU, dir = V.add(V.scale(r1, Math.cos(t)), r2, Math.sin(t));
      position.push(...toThree(V.add(c, dir, pt[3]))); normal.push(...toThree(dir)); color.push(1, 1, 1);
      uv.push(s / sides * pt[3] * TAU / tile, along / tile);
    }
  });
  for (let k = 0; k < points.length - 1; k++) for (let s = 0; s < sides; s++) {
    const a = k * (sides + 1) + s, b = a + sides + 1;
    index.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return geometryFrom(THREE, {position: [position, 3], normal: [normal, 3], uv: [uv, 2], color: [color, 3]}, index);
}

// One indexed geometry from several. Every input must carry position; any other attribute is kept when all inputs have
// it. The inputs are left as they are (dispose them if they were ever drawn).
export function mergeGeometries(THREE, geometries) {
  const names = Object.keys(geometries[0].attributes).filter(n => geometries.every(g => g.getAttribute(n)));
  const out = Object.fromEntries(names.map(n => [n, []])), index = [];
  let base = 0;
  for (const g of geometries) {
    for (const n of names) for (const v of g.getAttribute(n).array) out[n].push(v);
    const count = g.getAttribute('position').count;
    if (g.index) for (const i of g.index.array) index.push(i + base); else for (let i = 0; i < count; i++) index.push(i + base);
    base += count;
  }
  return geometryFrom(THREE, Object.fromEntries(names.map(n => [n, [out[n], geometries[0].getAttribute(n).itemSize]])), index);
}

// Flat quads cut from cells of the card atlas, gathered into one geometry. Each card is fixed in the world: `centre`, half-axes
// `right` and `up` (world vectors), an atlas cell index, linear colours at its bottom and top edge (they multiply the cell, so
// white dabs take any colour), and the normal it is lit with. A card that moves with the wind names its `sway`: {kind (a key
// of SWAY), random in [0, 1)}; its vertices then carry `sway` = (weight, random, reach, leaf flag), where a leaf card is held
// at .6 along its lower edge and 1 along its upper (a grass card at 0 and 1), and reach is the kind's reach times its
// exposure, the metres it leans at full weight in full wind, times the card's own `sway.scale` (default 1). A card with no `sway` has weight 0 and never moves.
export function cardBatch(art = SPACE_ART) {
  const position = [], normal = [], uv = [], color = [], swing = [], index = [];
  return {
    get count() { return position.length / 12; },
    add(centre, right, up, cell, bottom, top = bottom, lit = [0, 0, 1], flip = false, sway = null) {
      const [u0, v0, du, dv] = cellRect(cell, art), base = position.length / 3, kind = sway && SWAY[sway.kind];
      if (sway && !kind) throw new Error(`No sway for ${sway.kind}`);
      const leaf = kind?.type === 'leaf', foot = leaf ? .6 : 0;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        position.push(...toThree(V.add(V.add(centre, right, a), up, b))); normal.push(...toThree(lit));
        uv.push(u0 + du * ((flip ? -a : a) + 1) / 2, v0 + dv * (b + 1) / 2); color.push(...(b < 0 ? bottom : top));
        swing.push(...(kind ? [b < 0 ? foot : 1, sway.random, kind.reach * kind.exposure * (sway.scale ?? 1), leaf ? 1 : 0] : [0, 0, 0, 0]));
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    },
    geometry(THREE) { return geometryFrom(THREE, {position: [position, 3], normal: [normal, 3], uv: [uv, 2], color: [color, 3], sway: [swing, 4]}, index); },
  };
}

// The wind as every card material sees it: one shared set of uniforms, set once a frame (life/wind.js) from windClock
// (shared/foliage.js): windClock = (time wrapped to WIND_WRAP, crest, broad and settling phases at the yard's origin),
// windStrength the wind's 0–1 share, windAlong the way it blows in the yard's axes (x east, y north). Plain {x, y, ...}
// values, which three uploads as it would its own vectors, so this module needs no three of its own.
export const SWAY_UNIFORMS = {
  windClock: {value: {x: 0, y: 0, z: 0, w: 0}},
  windStrength: {value: 0},
  windAlong: {value: {x: WIND.direction[0], y: WIND.direction[1]}},
};
// foliageMotion (shared/foliage.js) in the vertex shader: each vertex leans along the wind (bend + flutter) and up (lift)
// by its weight, in world space, a gust reaching it dot(position, windAlong) / gustSpeed seconds after the origin. Per card
// the vertex attribute `sway` = (weight, random, reach, leaf flag); for instanced cover, random, reach and exposure come per
// instance from `swayKind` (SWAY_PER_INSTANCE) and the weight from the card.
const SWAY_VERTEX = `uniform vec4 windClock; uniform float windStrength; uniform vec2 windAlong;
attribute vec4 sway;
#ifdef SWAY_PER_INSTANCE
attribute vec3 swayKind;
#endif
vec3 swayed( vec3 world ) {
#ifdef SWAY_PER_INSTANCE
  float seed = swayKind.x, reach = swayKind.y * swayKind.z;
#else
  float seed = sway.y, reach = sway.z;
#endif
  float leaf = sway.w, delay = dot( vec2( world.x, - world.z ), windAlong ) / ${WIND.gustSpeed.toFixed(3)};
  float crest = smoothstep( 0., 1., ( sin( windClock.y - PI2 * delay / 17.3 ) + .25 ) / 1.25 );
  float gust = crest * ( .6 + .4 * ( .5 + .5 * sin( windClock.z - PI2 * delay / 31.7 ) ) );
  float period = leaf > .5 ? 3.8 + seed : 5.1 + seed * 1.7, quick = .65 + seed * .7;
  float swing = sin( mod( windClock.x, period ) / period * PI2 + seed * PI2 );
  float settling = sin( windClock.w - PI2 * delay / 8.1 + seed * .8 );
  float lean = reach * windStrength, bend = lean * ( .13 + .55 * gust + .16 * swing + .06 * settling );
  float flutter = lean * ( leaf > .5 ? .085 : .035 ) * sin( mod( windClock.x, quick ) / quick * PI2 + seed * PI2 ) * ( .25 + .75 * gust );
  float lift = leaf > .5 ? bend * .16 : abs( bend ) * .12;
  // the yard's (x, y) is three's (x, -z); up is three's y
  return sway.x * vec3( windAlong.x * ( bend + flutter ), lift, - windAlong.y * ( bend + flutter ) );
}`;
const SWAY_PROJECT = `vec4 swayWorld = vec4( transformed, 1. );
#ifdef USE_INSTANCING
swayWorld = instanceMatrix * swayWorld;
#endif
swayWorld = modelMatrix * swayWorld;
swayWorld.xyz += swayed( swayWorld.xyz );
vec4 mvPosition = viewMatrix * swayWorld;
gl_Position = projectionMatrix * mvPosition;`;

// The material for card quads: alpha-tested (never blended or sorted), two-sided, lit by the card's own normal on both faces,
// with alpha held up as the atlas mips down so distant cards do not thin away, and moved by the wind (SWAY_UNIFORMS).
export function cardMaterial(THREE, atlas, art = SPACE_ART) {
  const m = new THREE.MeshLambertMaterial({map: atlas, vertexColors: true, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide});
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, SWAY_UNIFORMS);
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${SWAY_VERTEX}`).replace('#include <project_vertex>', SWAY_PROJECT);
    s.fragmentShader = s.fragmentShader
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;')
      .replace('#include <alphatest_fragment>', `{ vec2 q = vMapUv * ${art.cards.size.toFixed(1)};
  float lod = .5 * log2( max( dot( dFdx( q ), dFdx( q ) ), dot( dFdy( q ), dFdy( q ) ) ) ); diffuseColor.a *= 1. + max( lod, 0. ) * .22; }
#include <alphatest_fragment>`);
  };
  m.customProgramCacheKey = () => `painted-card-sway-${art.cards.size}`;
  return m;
}
