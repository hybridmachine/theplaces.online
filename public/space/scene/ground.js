import {terrainHeight} from '../../../shared/space.js';
import {groundBlend} from '../../../shared/lakeside-dressing.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {cardBatch, cardMaterial, LAKE_LEVEL, toThree, V} from '../geometry.js';
import {hash, lin, noise, smoothstep} from './noise.js';

// The painted ground: terrain blending meadow, path earth and shore stones; the lake as horizontal strokes in the sky's colour;
// the yard wall in dry stone with coping and moss along its top. World axes x east, y north, z up, metres; three is passed in.

const GRID = {x0: -60, x1: 140, y0: -60, y1: 70}, REACH = 1500, SKIRT = 10;
const WALL = {height: 1.1, half: .25, minGround: .3}, LAKE_ARCS = 19;
const jitter = (k, seed) => hash(k, 7, seed);

// The slow tint laid over the meadow: warm and cool drifts tens of metres across, lighter and darker patches inside them.
const WARM = [1.1, 1.04, .8], COOL = [.84, .96, 1];
export function groundTint(x, y) {
  const n = .5 * noise(x / 46, y / 46, 11) + .32 * noise(x / 17, y / 17, 12) + .18 * noise(x / 6.5, y / 6.5, 13), t = smoothstep(.28, .72, n);
  const k = .84 + .3 * noise(x / 23 + 50, y / 23, 14);
  return COOL.map((c, i) => (c + (WARM[i] - c) * t) * k);
}

// A 1 m grid over the yard inside a 10 m skirt out to the hill ring, one watertight mesh with shared border vertices.
// Per vertex: `uv` is the world position in metres, `paint` is (earth, shore share of what is not earth, which meadow layer),
// the first two from groundBlend. They are not drawn as they stand: the material sharpens them with a smoothstep and pushes
// their edges in and out by the brushwork, so the drawn blend follows groundBlend's shape without equalling it.
function terrainGeometry(THREE, space, dressing) {
  const {x0, x1, y0, y1} = GRID, nx = x1 - x0 + 1, ny = y1 - y0 + 1, E = REACH, S = SKIRT;
  const position = [], uv = [], paint = [], color = [], index = [], coarse = new Map();
  const vertex = (x, y, fine) => {
    position.push(...toThree([x, y, terrainHeight(space, x, y)])); uv.push(x, y); color.push(...groundTint(x, y));
    // Outside the grid the skirt is all meadow.
    const b = fine ? groundBlend(space, dressing, x, y) : {earth: 0, shore: 0};
    paint.push(b.earth, b.earth < 1 ? b.shore / (1 - b.earth) : 0, noise(x / 9, y / 9, 15));
    return position.length / 3 - 1;
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vertex(x0 + i, y0 + j, true);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx; // counter-clockwise seen from above
    index.push(a, b, c, a, c, d);
  }
  const inFine = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const at = (x, y) => inFine(x, y) ? (y - y0) * nx + x - x0 : coarse.get(x * 1e4 + y) ?? coarse.set(x * 1e4 + y, vertex(x, y, false)).get(x * 1e4 + y);
  // Fine-grid points strictly between two skirt corners lying on the yard's border (empty if the edge is not on it).
  const between = ([ax, ay], [bx, by]) => {
    const onBorder = ax === bx ? (ax === x0 || ax === x1) && Math.min(ay, by) >= y0 && Math.max(ay, by) <= y1
      : (ay === y0 || ay === y1) && Math.min(ax, bx) >= x0 && Math.max(ax, bx) <= x1;
    return onBorder ? Array.from({length: S - 1}, (_, k) => [ax + Math.sign(bx - ax) * (k + 1), ay + Math.sign(by - ay) * (k + 1)]) : [];
  };
  for (let y = -E; y < E; y += S) for (let x = -E; x < E; x += S) {
    if (x >= x0 && x + S <= x1 && y >= y0 && y + S <= y1) continue; // the fine grid covers it
    const corners = [[x, y], [x + S, y], [x + S, y + S], [x, y + S]], loop = [], plain = [];
    corners.forEach((c, k) => {
      const next = corners[(k + 1) % 4], mid = between(c, next);
      loop.push(c, ...mid); plain.push(!mid.length);
    });
    // Fan from a corner whose two edges carry no border points, so no fan triangle is degenerate.
    const apex = corners.findIndex((_, k) => plain[k] && plain[(k + 3) % 4]), start = loop.indexOf(corners[apex]);
    const ring = [...loop.slice(start), ...loop.slice(0, start)].map(([px, py]) => at(px, py));
    for (let k = 1; k < ring.length - 1; k++) index.push(ring[0], ring[k], ring[k + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('paint', new THREE.Float32BufferAttribute(paint, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setIndex(index); g.computeVertexNormals();
  return g;
}

// Lambert, so it takes the yard's lights and fog like every other surface; only the colour it starts from is changed.
// The meadow is sampled twice (the second turned and larger) and the two mixed in patches, so its repeat does not show.
// Path and shore edges are pushed in and out by the brushwork's own light and dark, so they break like paint.
function terrainMaterial(THREE, art) {
  const {meadow, earth, shore} = SPACE_ART.surfaces, metres = new THREE.Vector3(meadow.metres, earth.metres, shore.metres);
  const m = new THREE.MeshLambertMaterial({map: art.surfaces.meadow, vertexColors: true});
  // Wetness of the path and of the shore stones, 0..1 each; one object, so setting it works before and after the first compile.
  m.userData.wet = {value: new THREE.Vector2()};
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, {wet: m.userData.wet, earthMap: {value: art.surfaces.earth}, shoreMap: {value: art.surfaces.shore}, groundMetres: {value: metres}});
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 paint;\nvarying vec3 vPaint;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPaint = paint;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D earthMap, shoreMap;\nuniform vec3 groundMetres;\nuniform vec2 wet;\nvarying vec3 vPaint;')
      .replace('#include <map_fragment>', `
  vec2 world = vMapUv;
  vec4 meadowA = texture2D( map, world / groundMetres.x );
  vec4 meadowB = texture2D( map, mat2( .8, -.6, .6, .8 ) * world / ( groundMetres.x * 1.43 ) + vec2( .37, .71 ) );
  vec4 meadowColour = mix( meadowA, meadowB, smoothstep( .3, .7, vPaint.z ) );
  vec4 earthColour = texture2D( earthMap, world / groundMetres.y ), shoreColour = texture2D( shoreMap, world / groundMetres.z );
  const vec3 LUMA = vec3( .3, .59, .11 );
  float lm = dot( meadowColour.rgb, LUMA ), le = dot( earthColour.rgb, LUMA ), ls = dot( shoreColour.rgb, LUMA );
  // Only where two layers meet: a layer at full or no weight stays so.
  float shoreWeight = smoothstep( .3, .7, vPaint.y + ( ls - lm ) * 3. * vPaint.y * ( 1. - vPaint.y ) * 4. );
  float earthWeight = smoothstep( .3, .7, vPaint.x + ( le - lm ) * 3. * vPaint.x * ( 1. - vPaint.x ) * 4. );
  // Rain darkens the path's earth and the shore's stones, and bluish: wet earth and stone.
  earthColour.rgb *= mix( vec3( 1. ), vec3( .62, .64, .7 ), wet.x * earthWeight );
  shoreColour.rgb *= mix( vec3( 1. ), vec3( .66, .68, .74 ), wet.y * shoreWeight );
  diffuseColor *= mix( mix( meadowColour, shoreColour, shoreWeight ), earthColour, earthWeight );`);
  };
  m.customProgramCacheKey = () => 'painted-ground-wet';
  return m;
}

// The lake: the stroke texture laid on arcs round the viewer (so its strokes always lie across the view) over a slower
// world-fixed layer, carried by the sky's colours: the body of the water in the horizon's light, the sky in it at grazing angles.
// Clipped like the built-in materials by renderer.clippingPlanes (three's clipping chunks); with none set they compile away.
const LAKE_VERTEX = `varying vec3 vWorld;
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4( position, 1. ); vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world; gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
  #include <fog_vertex>
}`;
const LAKE_FRAGMENT = `uniform sampler2D strokes; uniform vec3 zenith, horizon, dayHorizon; uniform float metres, rippleSeed; uniform vec4 ripple; varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>
// The rings a rising fish leaves, ported from lakeRipple in public/ripple-shader.js with the same numbers. p is the offset from
// the ring's centre in its radii (the yard's x, y of this fragment is (vWorld.x, -vWorld.z)); the result is (offset xy, brightening z).
// ripple = (centre x, centre y, radius, age); an age of 0 or less is no ripple.
vec3 lakeRipple( vec2 p ) {
  float radius = length( p ), age = ripple.w;
  if ( age <= 0. || age >= 1. || radius >= 1. ) return vec3( 0. );
  float angle = atan( p.y, p.x ), seed = rippleSeed;
  float envelope = smoothstep( 0., .08, age ) * ( 1. - smoothstep( .52, 1., age ) );
  float edge = 0., slope = 0.;
  for ( int i = 0; i < 3; i++ ) {
    float t = age - float( i ) * .105;
    float ring = .10 + sqrt( max( 0., t ) ) * .82;
    float wobble = .018 * sin( angle * 3. + seed + float( i ) ) + .012 * sin( angle * 7. - seed );
    float d = ( radius - ring + wobble ) / .055;
    float arc = smoothstep( -.65, .45, sin( angle * 2. + seed + float( i ) * 1.7 ) ) * .65 + .15;
    float wave = exp( -d * d * 2. ) * smoothstep( 0., .07, t ) * arc;
    edge += wave * ( 1. - float( i ) * .2 );
    slope += wave * d;
  }
  float bounded = envelope * ( 1. - smoothstep( .87, 1., radius ) );
  vec2 direction = p / max( .08, radius );
  return vec3( direction * slope * .85, edge * .027 - slope * .012 ) * bounded;
}
void main() {
  #include <clipping_planes_fragment>
  vec3 rings = lakeRipple( ( vec2( vWorld.x, -vWorld.z ) - ripple.xy ) / max( ripple.z, .001 ) );
  vec3 toEye = cameraPosition - vWorld; float dist = length( toEye ); vec3 view = toEye / dist;
  float fresnel = .1 + .45 * pow( 1. - clamp( view.y, 0., 1. ), 5. );
  vec2 p = vec2( vWorld.x - cameraPosition.x, cameraPosition.z - vWorld.z ); float r = max( length( p ), .5 ), r2 = r * r;
  const float ARC = ${LAKE_ARCS}. / 6.2831853;
  vec2 arcs = vec2( atan( p.y, p.x ) * ARC, log( r ) * 7. ) + rings.xy * 1.2;
  // Gradients taken from p, which is smooth, so the angle's wrap does not show as a seam of blurred strokes.
  vec2 px = dFdx( p ), py = dFdy( p );
  vec2 gx = vec2( ( p.x * px.y - p.y * px.x ) / r2 * ARC, dot( p, px ) / r2 * 7. ), gy = vec2( ( p.x * py.y - p.y * py.x ) / r2 * ARC, dot( p, py ) / r2 * 7. );
  vec3 mean = texture( strokes, vec2( .5 ), 16. ).rgb;
  vec3 near = textureGrad( strokes, arcs, gx, gy ).rgb / mean;
  // Broad, soft patches fixed to the water, so it does not slide as a whole with the viewer.
  vec3 slow = texture( strokes, vec2( vWorld.x, -vWorld.z ) / ( metres * 2. ) + rings.xy * 1.2, 4. ).rgb / mean;
  vec3 sky = mix( horizon, zenith, .4 + .6 * smoothstep( 0., .4, view.y ) );
  vec3 body = mean * horizon / dayHorizon;
  vec3 colour = mix( body, sky * 1.02, fresnel ) * mix( vec3( 1. ), near, .55 ) * mix( vec3( 1. ), slow, .3 );
  colour += colour * rings.z * 30.;
  gl_FragColor = vec4( colour, 1. );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const DAY_HORIZON = [211, 211, 191].map(v => v / 255);

function lake(THREE, art) {
  const z = LAKE_LEVEL, corners = [[-REACH, -REACH], [REACH, -REACH], [REACH, REACH], [-REACH, REACH]].flatMap(([x, y]) => toThree([x, y, z]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const linear = c => new THREE.Vector3(...new THREE.Color().setRGB(...c, THREE.SRGBColorSpace).toArray());
  const material = new THREE.ShaderMaterial({vertexShader: LAKE_VERTEX, fragmentShader: LAKE_FRAGMENT, fog: true, clipping: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {zenith: {value: linear(DAY_HORIZON)}, horizon: {value: linear(DAY_HORIZON)},
      dayHorizon: {value: linear(DAY_HORIZON)}, metres: {value: SPACE_ART.surfaces.water.metres}, strokes: {value: null},
      ripple: {value: new THREE.Vector4(0, 0, 1, 0)}, rippleSeed: {value: 0}}])});
  material.uniforms.strokes.value = art.surfaces.water; // merge clones uniform values; the texture must stay the shared one
  const mesh = new THREE.Mesh(g, material); mesh.name = 'lake';
  const colour = new THREE.Color();
  mesh.userData.setSky = ({zenith, horizon}) => {
    material.uniforms.zenith.value.set(...colour.setRGB(...zenith, THREE.SRGBColorSpace).toArray());
    material.uniforms.horizon.value.set(...colour.setRGB(...horizon, THREE.SRGBColorSpace).toArray());
  };
  // The ring now showing: {center: [x, y], radius, age, variation} in the yard's axes, or null for none.
  mesh.userData.setRipple = r => {
    if (r) { material.uniforms.ripple.value.set(r.center[0], r.center[1], r.radius, r.age); material.uniforms.rippleSeed.value = r.variation; }
    else material.uniforms.ripple.value.w = 0;
  };
  return mesh;
}

// The yard wall in pieces about 1 m long that follow the ground, skipped where it falls below the water's edge; each piece is
// shaded a little differently, and its top steps a few centimetres. Coping stones and moss dabs from the card atlas along the top.
function wall(THREE, space, art) {
  const position = [], uv = [], color = [], index = [], cards = cardBatch(SPACE_ART), w = space.wall, tile = SPACE_ART.surfaces.drystone.metres;
  // One flat quad; its winding follows `outward`.
  const quad = (pts, uvs, outward, tint) => {
    const n = V.cross(V.sub(pts[1], pts[0]), V.sub(pts[2], pts[0])), order = V.dot(n, outward) < 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
    const base = position.length / 3;
    for (const k of order) { position.push(...toThree(pts[k])); uv.push(...uvs[k]); color.push(...tint); }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const stone = lin([132, 122, 100]), moss = lin([98, 112, 60]);
  let run = 0, piece = 0;
  w.forEach((a, i) => {
    const b = w[(i + 1) % w.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1] * WALL.half, d[0] * WALL.half];
    const steps = Math.ceil(len), at = t => [a[0] + d[0] * t, a[1] + d[1] * t];
    for (let k = 0; k < steps; k++, piece++) {
      // Each run reaches half a thickness past the corners so the corners close.
      const t0 = k === 0 ? -WALL.half : k * len / steps, t1 = k === steps - 1 ? len + WALL.half : (k + 1) * len / steps;
      const p0 = at(t0), p1 = at(t1), h0 = terrainHeight(space, ...p0), h1 = terrainHeight(space, ...p1);
      if (Math.min(h0, h1) < WALL.minGround) continue;
      const low = Math.min(h0, h1) - .3, lift = (jitter(piece, 21) - .5) * .06, top0 = h0 + WALL.height + lift, top1 = h1 + WALL.height + lift;
      const shade = .82 + .3 * jitter(piece, 22), tint = [shade, shade * (.97 + .05 * jitter(piece, 23)), shade * (.94 + .08 * jitter(piece, 24))];
      const u0 = (run + t0) / tile, u1 = (run + t1) / tile, out = [n[0], n[1], 0], across = WALL.half * 2 / tile;
      for (const side of [-1, 1]) {
        const q0 = V.add(p0, n, side), q1 = V.add(p1, n, side);
        quad([[...q0, low], [...q1, low], [...q1, top1], [...q0, top0]], [[u0, low / tile], [u1, low / tile], [u1, top1 / tile], [u0, top0 / tile]], V.scale(out, side), tint);
      }
      for (const [p, t, top, dir] of [[p0, t0, top0, -1], [p1, t1, top1, 1]]) {
        const q0 = V.add(p, n, -1), q1 = V.add(p, n, 1);
        quad([[...q0, low], [...q1, low], [...q1, top], [...q0, top]], [[0, low / tile], [across, low / tile], [across, top / tile], [0, top / tile]], [d[0] * dir, d[1] * dir, 0], tint);
      }
      const c = [V.add(p0, n, -1), V.add(p1, n, -1), V.add(p1, n), V.add(p0, n)], tops = [top0, top1, top1, top0];
      quad(c.map((q, m) => [...q, tops[m]]), [[u0, 0], [u1, 0], [u1, across], [u0, across]], [0, 0, 1], tint);
    }
    // Coping: stones on edge standing along the top, and flatter stones and moss lying over it, so the top edge is broken.
    for (let t = 0, k = 0; t <= len; t += .2 + jitter(k, 25 + i) * .16, k++) {
      const [x, y] = at(t), g = terrainHeight(space, x, y); if (g < WALL.minGround) continue;
      const top = g + WALL.height, r = s => jitter(k * 13 + s, 30 + i), side = V.norm([n[0], n[1], 0]), dab = SPACE_ART.cards.cells.dab;
      const cell = dab[r(0) < .5 ? 0 : 1], k0 = .7 + r(1) * .45, mossy = r(2) < .2, col = mossy ? moss : stone;
      const h = .1 + r(3) * .1, lean = (r(4) - .5) * .5, off = (r(5) - .5) * .26;
      cards.add([x + side[0] * off, y + side[1] * off, top + h * .45], V.scale([d[0], d[1], 0], .16 + r(6) * .1), V.add([0, 0, h], [d[0], d[1], 0], lean * h),
        cell, col.map(v => v * k0 * .6), col.map(v => v * k0), [0, 0, 1], r(7) < .5);
      if (r(8) < .55) {
        const tilt = (r(9) - .5) * 1.1, normal = V.norm([side[0] * Math.sin(tilt), side[1] * Math.sin(tilt), Math.cos(tilt)]), across = V.norm(V.cross(normal, [d[0], d[1], 0]));
        const kk = .7 + r(10) * .4, c2 = r(11) < .3 ? moss : stone;
        cards.add([x + (r(12) - .5) * .16, y + (r(13) - .5) * .16, top + .04 + r(14) * .05], V.scale([d[0], d[1], 0], .17 + r(15) * .12), V.scale(across, .12 + r(16) * .07),
          dab[r(17) < .5 ? 0 : 1], c2.map(v => v * kk * .75), c2.map(v => v * kk), [0, 0, 1]);
      }
    }
    run += len;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3)); g.setIndex(index); g.computeVertexNormals();
  const group = new THREE.Group(); group.name = 'wall';
  const stones = new THREE.Mesh(g, new THREE.MeshLambertMaterial({map: art.surfaces.drystone, vertexColors: true})); stones.name = 'stones';
  const coping = new THREE.Mesh(cards.geometry(THREE), cardMaterial(THREE, art.cards, SPACE_ART)); coping.name = 'coping';
  group.add(stones, coping);
  return group;
}

// {terrain, lake, wall, setSky, setWet, setRipple}. `art` is the loaded bundle (see art-loader.js).
export function buildGround(THREE, {space, dressing, art}) {
  const terrain = new THREE.Mesh(terrainGeometry(THREE, space, dressing), terrainMaterial(THREE, art)); terrain.name = 'terrain';
  const water = lake(THREE, art);
  const wet = terrain.material.userData.wet.value;
  return {terrain, lake: water, wall: wall(THREE, space, art), setSky: water.userData.setSky, setRipple: water.userData.setRipple,
    setWet({path = 0, stone = 0}) { wet.set(path, stone); }};
}
