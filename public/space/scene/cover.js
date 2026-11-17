import {terrainHeight} from '../../../shared/space.js';
import {scatter} from '../../../shared/lakeside-dressing.js';
import {cellRect, SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {cardMaterial, toThree} from '../geometry.js';
import {groundTint} from './ground.js';
import {clamp01, hash, mix} from './noise.js';

// Ground cover: grass, reeds and flowers where the dressing scatters them. Each kind is one InstancedMesh of two crossed,
// fixed cards (body from every side, base at the ground), alpha-tested; every instance picks its own atlas cell through a
// per-instance UV offset. World axes x east, y north, z up, metres; three is passed in.


// Per kind: the atlas cells, the card's height in metres at scale 1 (the painted shape fills most of its square cell), how much
// of that is width and how much wider the lowest tufts spread, how far it sinks below the ground, how much of its foot
// dissolves (a tuft's blades are dense at the foot, and where a flat card meets the slope that reads as a hard-edged plinth),
// and its linear colour at the top, the grass taking the ground's own tint (ground.js) so it never drifts from the meadow.
const KINDS = {
  grass: {cells: SPACE_ART.cards.cells.grass, size: .85, wide: 1.3, spread: .9, sink: .06, fade: 1, seed: 81,
    colour: (x, y, r) => mix([.68, .66, .46], [.82, .75, .48], r[0]).map((c, i) => c * groundTint(x, y)[i] * (.86 + .22 * r[1]))},
  reeds: {cells: SPACE_ART.cards.cells.reeds, size: 1.8, wide: .9, spread: 0, sink: .06, fade: .6, seed: 82,
    colour: (x, y, r) => mix([.74, .8, .6], [.9, .86, .62], r[0]).map(c => c * (.88 + .2 * r[1]))},
  // The art table's cell list is 'flower'; the scatter kind is 'flowers'.
  flowers: {cells: SPACE_ART.cards.cells.flower, size: .8, wide: 1, spread: 0, sink: .03, fade: 0, seed: 83,
    colour: (x, y, r) => mix([.9, .86, .74], [.95, .9, .68], r[0]).map(c => c * (.85 + .15 * r[1]))},
};
const BASE_SHADE = .72, CELL = SPACE_ART.cards.cell / SPACE_ART.cards.size;

// Two unit cards crossed at right angles about the vertical, base at the origin; UVs span one cell from (0, 0).
function crossedCards(THREE) {
  const position = [], uv = [], normal = [], color = [], index = [];
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const base = position.length / 3;
    for (const [a, b] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      position.push(...toThree([dx * a * .5, dy * a * .5, b])); uv.push(CELL * (a + 1) / 2, CELL * b);
      // lit as the ground beneath is, so a tuft does not turn dark or bright against the meadow as it swings round
      normal.push(...toThree([0, 0, 1])); color.push(...Array(3).fill(b ? 1 : BASE_SHADE));
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setIndex(index);
  return g;
}

// The card material, reading per instance `cell` = (u, v of the cell's corner, how much of the foot dissolves). The foot thins
// out from the darker paint first, so the lit blades reach down into the ground and the dense base never shows as an edge.
// The thresholds (.04–.3 of the height, weighted by .5 + 1.2 × luminance) are tuned to the grass cells' current paint: if the
// atlas is re-exported with darker or lighter blade bases, look down at the ground again and retune them.
function coverMaterial(THREE, atlas) {
  const m = cardMaterial(THREE, atlas, SPACE_ART), card = m.onBeforeCompile;
  m.onBeforeCompile = (s, renderer) => {
    card(s, renderer);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 cell;\nvarying vec2 vFoot;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv += cell.xy; vFoot = vec2( uv.y / ${CELL.toFixed(6)}, cell.z );`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vFoot;')
      .replace('#include <alphatest_fragment>', `{ float lum = dot( diffuseColor.rgb / max( vColor, vec3( 1e-3 ) ), vec3( .3, .59, .11 ) );
  diffuseColor.a *= mix( 1., smoothstep( .04, .3, vFoot.x * ( .5 + 1.2 * lum ) ), vFoot.y ); }
#include <alphatest_fragment>`);
  };
  m.customProgramCacheKey = () => `painted-cover-${SPACE_ART.cards.size}`;
  return m;
}

export function buildCover(THREE, {space, dressing, art}) {
  const object = new THREE.Group(); object.name = 'cover';
  const material = coverMaterial(THREE, art.cards), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3(), scale = new THREE.Vector3(), colour = new THREE.Color();
  for (const [kind, spec] of Object.entries(KINDS)) {
    const items = scatter(space, dressing, kind), geometry = crossedCards(THREE), cells = new Float32Array(items.length * 3);
    const mesh = new THREE.InstancedMesh(geometry, material, items.length); mesh.name = kind;
    items.forEach(({x, y, scale: s, turn, cell}, i) => {
      const r = [hash(i, 0, spec.seed), hash(i, 0, spec.seed + 100), hash(i, 0, spec.seed + 200), hash(i, 0, spec.seed + 300)], h = spec.size * s;
      // a little uneven in height and width, and mirrored half the time, so neighbouring tufts of one cell differ; low tufts
      // spread wider than they stand, so a sward of them closes over the ground like brushed grass rather than standing as spikes
      const spread = 1 + spec.spread * clamp01((.65 - s) / .3);
      const tall = h * (.9 + .2 * r[2]), wide = h * spec.wide * spread * (1.1 - .2 * r[2]) * (r[3] < .5 ? -1 : 1);
      at.set(...toThree([x, y, terrainHeight(space, x, y) - spec.sink * tall])); q.setFromAxisAngle(up, -turn); scale.set(wide, tall, Math.abs(wide));
      mesh.setMatrixAt(i, matrix.compose(at, q, scale));
      mesh.setColorAt(i, colour.setRGB(...spec.colour(x, y, r)));
      cells.set([...cellRect(spec.cells[cell], SPACE_ART).slice(0, 2), spec.fade], i * 3);
    });
    geometry.setAttribute('cell', new THREE.InstancedBufferAttribute(cells, 3));
    // the instances spread over the whole yard, so the bounds must cover them all, not the one card at the origin
    mesh.computeBoundingSphere(); mesh.computeBoundingBox();
    object.add(mesh);
  }
  return {object, dispose() {
    object.traverse(o => { o.geometry?.dispose(); o.dispose?.(); });
    material.dispose();
  }};
}
