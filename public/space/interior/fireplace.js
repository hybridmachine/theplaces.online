import {ceilingHeight} from '../../../shared/interior.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {mergeGeometries, toThree} from '../geometry.js';
import {haloMaterial} from '../scene/lights.js';

// The living room's stone fireplace on its gable wall (the blueprint's interior.fireplace), its fire, and the plain chimney breast
// that goes on up through bedroom 2. Interior frame [a, d, z]. Solid, painted shapes: a stone breast from floor to ceiling with the
// mouth cut MOUTH_DEEP into it and a darker back, the stone hearth slab reaching into the room, a timber mantel shelf, a plastered
// upper breast. The breast, slab, mantel and upper breast are built through buildInterior's `face` (so each vertex carries the light
// it takes, from the light field) and draw with the lit materials, or, when those could not be made, the same Lambert ones as the
// rest of the shell. The fire is emitted, never lit and never a light source: a low uneven mound of embers, dark ash with glowing
// patches, whose glow follows the ember dial; a few overlapping tapered tongues of flame, each pale yellow at its foot and middle
// shading to orange and to nothing at its tip and edges (per-vertex colour and alpha, added over the room), that show only while the
// fire burns and sway apart from one another; and a soft added halo at the mouth.

const STONE_TILE = SPACE_ART.surfaces.stone.metres;
const LIT_STONE = [1.2, 1.1, .95], STONE = [1.5, 1.4, 1.2];   // linear tints: lit, the unlit one times the flat light on a wall (about .8)
const MOUTH_DEEP = .35, SLAB_HIGH = .05, MANTEL = {width: 2.2, depth: .2, thick: .08, into: .08};
// Flames: where each tongue stands across the mouth (metres from its middle) and back from its front (a), its width and height, and its
// sway phase; they overlap, the tall ones in the middle.
const CARDS = [{x: -.27, w: .26, h: .34, a: .27, phase: 0}, {x: -.12, w: .3, h: .55, a: .23, phase: 2.1}, {x: .02, w: .32, h: .62, a: .26, phase: 4.2},
  {x: .15, w: .28, h: .48, a: .22, phase: 1.3}, {x: .28, w: .24, h: .3, a: .28, phase: 5.6}];
const GLOW_AT = .5, GLOW_RADII = [.25, .35, .5], GLOW = {burning: .5, embers: .12}, FLAME_FLOOR = .02;
const ASH = [.03, .022, .02], EMBER = [1, .32, .06], CORE = [1, .9, .55], FLAME = [1, .42, .06];
// The ember mound: its size (a, d) and height, and how many cells it is cut into.
const BED = {deep: .3, wide: .8, high: .07, cells: [6, 14]};
const clamp01 = x => Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;

export function buildFireplace(THREE, {interior: I, art, light, face, tint, tints, materials}) {
  const {fireplace: fp} = I, [d0, d1] = [fp.d - fp.breast.width / 2, fp.d + fp.breast.width / 2], reach = fp.breast.depth;
  const mouth = {d0: fp.d - fp.mouth.width / 2, d1: fp.d + fp.mouth.width / 2, z0: SLAB_HIGH, z1: SLAB_HIGH + fp.mouth.height, back: reach - MOUTH_DEEP};
  const stoneTint = tint(light ? LIT_STONE : STONE, 71, .1), darkStone = tint((light ? LIT_STONE : STONE).map(c => c * .5), 72, .12);

  const map = art.surfaces.stone ? {map: art.surfaces.stone} : {};   // (an art bundle without the stone draws it plain)
  let stoneMaterial = light ? light.material(map) : new THREE.MeshLambertMaterial({...map, vertexColors: true});
  const stone = (list, f, across, up, outward, colour = stoneTint) => list.push(face(f, across, up, outward, colour, {tile: STONE_TILE}));
  // A rectangle in a plane of constant a, d or z, over [p0, p1] × [q0, q1], facing `outward`.
  const wallA = (list, a, [p0, p1], [q0, q1], dir, colour) => stone(list, (s, t) => [a, p0 + (p1 - p0) * s, q0 + (q1 - q0) * t], p1 - p0, q1 - q0, [dir, 0, 0], colour);
  const wallD = (list, d, [p0, p1], [q0, q1], dir, colour) => stone(list, (s, t) => [p0 + (p1 - p0) * s, d, q0 + (q1 - q0) * t], p1 - p0, q1 - q0, [0, dir, 0], colour);
  const flatZ = (list, z, [p0, p1], [q0, q1], dir, colour) => stone(list, (s, t) => [p0 + (p1 - p0) * s, q0 + (q1 - q0) * t, z], p1 - p0, q1 - q0, [0, 0, dir], colour);

  // The breast: its front less the mouth, its two sides, and the mouth's back, jambs, head and floor.
  const breast = [], top = I.groundCeiling;
  wallA(breast, reach, [d0, mouth.d0], [0, top], 1); wallA(breast, reach, [mouth.d1, d1], [0, top], 1); wallA(breast, reach, [mouth.d0, mouth.d1], [mouth.z1, top], 1);
  wallD(breast, d0, [0, reach], [0, top], -1); wallD(breast, d1, [0, reach], [0, top], 1);
  wallA(breast, mouth.back, [mouth.d0, mouth.d1], [mouth.z0, mouth.z1], 1, darkStone);
  wallD(breast, mouth.d0, [mouth.back, reach], [mouth.z0, mouth.z1], 1, darkStone); wallD(breast, mouth.d1, [mouth.back, reach], [mouth.z0, mouth.z1], -1, darkStone);
  flatZ(breast, mouth.z1, [mouth.back, reach], [mouth.d0, mouth.d1], -1, darkStone); flatZ(breast, mouth.z0, [mouth.back, reach], [mouth.d0, mouth.d1], 1, darkStone);
  // The slab runs from the breast's front out to fp.slab further, the breast's width.
  const slab = [], out = reach + fp.slab;
  flatZ(slab, SLAB_HIGH, [reach, out], [d0, d1], 1); wallA(slab, out, [d0, d1], [0, SLAB_HIGH], 1);
  wallD(slab, d0, [reach, out], [0, SLAB_HIGH], -1); wallD(slab, d1, [reach, out], [0, SLAB_HIGH], 1);
  // The mantel: a timber shelf across the breast's front, set a little into it so it overhangs the walking rule's margin by no more.
  const mantel = [], [m0, m1] = [fp.d - MANTEL.width / 2, fp.d + MANTEL.width / 2], [ma0, ma1] = [reach - MANTEL.into, reach - MANTEL.into + MANTEL.depth];
  const zTop = fp.mantel, zBottom = fp.mantel - MANTEL.thick, timber = tints.boards;
  flatZ(mantel, zTop, [ma0, ma1], [m0, m1], 1, timber); flatZ(mantel, zBottom, [ma0, ma1], [m0, m1], -1, timber);
  wallA(mantel, ma1, [m0, m1], [zBottom, zTop], 1, timber); wallD(mantel, m0, [ma0, ma1], [zBottom, zTop], -1, timber); wallD(mantel, m1, [ma0, ma1], [zBottom, zTop], 1, timber);
  // The upper breast, plain plaster from bedroom 2's floor to its sloping ceiling.
  const upper = [], {upper: up} = fp, [u0, u1] = [fp.d - up.width / 2, fp.d + up.width / 2], floor = I.floorRise, roof = d => floor + ceilingHeight(I, 1, d);
  upper.push(face((s, t) => { const d = u0 + (u1 - u0) * s; return [up.depth, d, floor + (roof(d) - floor) * t]; }, u1 - u0, Math.max(roof(u0), roof(u1)) - floor, [1, 0, 0], tints.plaster));
  for (const [d, dir] of [[u0, -1], [u1, 1]]) upper.push(face((s, t) => [up.depth * s, d, floor + (roof(d) - floor) * t], up.depth, roof(d) - floor, [0, dir, 0], tints.plaster));

  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };
  const group = new THREE.Group(); group.name = 'fireplace';
  const mesh = (name, geometry, material, parent = group) => { const m = new THREE.Mesh(geometry, material); m.name = name; parent.add(m); return m; };
  mesh('breast', merged(breast), stoneMaterial); mesh('slab', merged(slab), stoneMaterial);
  mesh('mantel', merged(mantel), materials.surface); mesh('breast-upper', merged(upper), materials.plastered);

  // ── the fire ──
  // The ember bed: a low mound across the mouth, uneven in height, its vertices dark ash or glowing patches (a fixed pattern); the
  // material's colour is the ember dial, so the patches glow and the ash stays dark.
  const bed = new THREE.PlaneGeometry(BED.deep, BED.wide, ...BED.cells); bed.rotateX(-Math.PI / 2);
  { const p = bed.getAttribute('position'), colours = [];
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / BED.deep * 2, v = p.getZ(i) / BED.wide * 2, rim = Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v);
      const lump = .65 + .35 * Math.sin(u * 5.1 + v * 3.3) * Math.cos(v * 7.7 - u * 2.2);
      p.setY(i, BED.high * rim * lump);
      const glow = Math.max(0, Math.sin(u * 7.3 + 1.1) * Math.sin(v * 9.1 + .4) + .35 * Math.cos(v * 4.3 - u * 6.1));
      const k = .15 + .85 * Math.min(1, glow) * Math.sqrt(rim); colours.push(k, k, k);
    }
    bed.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3)); bed.computeVertexNormals(); }
  const embers = mesh('embers', bed, new THREE.MeshBasicMaterial({color: new THREE.Color().setRGB(...ASH), vertexColors: true}));
  embers.position.set(...toThree([mouth.back + BED.deep / 2 + .02, fp.d, SLAB_HIGH]));
  // A tongue of flame: unit height, widest a quarter of the way up, tapering to a point; cut into rows and columns so its colour can
  // run from a pale core at the foot and middle to orange, and its alpha to nothing at the tip and the edges. It stands at its foot
  // (the origin) facing into the room (+a), drawn added over the room on both sides.
  const ROWS = 8, COLS = 4, card = new THREE.BufferGeometry(), positions = [], colours = [], index = [];
  for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) {
    const t = j / ROWS, s = i / COLS - .5, width = t < .25 ? .75 + t : 1 - (t - .25) / .75 * .98, edge = Math.abs(s) * 2;
    positions.push(s * width, t, 0);
    const core = Math.max(0, 1 - edge * 1.3) * Math.max(0, 1 - t * 1.4), alpha = (1 - edge ** 2) * (1 - t ** 1.6) * Math.min(1, t * 8 + .3);
    colours.push(...FLAME.map((c, k) => c + (CORE[k] - c) * core), Math.max(0, alpha));
  }
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { const a = j * (COLS + 1) + i, b = a + COLS + 1; index.push(a, a + 1, b + 1, a, b + 1, b); }
  card.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); card.setAttribute('color', new THREE.Float32BufferAttribute(colours, 4)); card.setIndex(index);
  const flameMaterial = new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending});
  // The flames and the glow are added light: they go in `overlay`, which the view draws after the yard seen through the live panes
  // (a pane drawn after them would cut them along its edge), still depth-tested against the rooms.
  const overlay = new THREE.Group(); overlay.name = 'fire-light';
  const flames = new THREE.Group(); flames.name = 'flames'; overlay.add(flames);
  const cards = CARDS.map(c => {
    const m = mesh(`flame-${flames.children.length}`, card, flameMaterial, flames);
    m.rotation.order = 'YXZ'; m.rotation.y = Math.PI / 2;   // so rotation.z leans a card sideways in its own plane
    m.position.set(...toThree([c.a, fp.d + c.x, SLAB_HIGH + .03])); m.scale.set(c.w, c.h, 1);
    return {m, ...c};
  });
  // The halo: a flattened ball at the mouth, mostly inside it, so only its soft rim spills a little into the room.
  const glow = mesh('fire-glow', new THREE.IcosahedronGeometry(1, 3), haloMaterial(THREE), overlay);
  glow.position.set(...toThree([GLOW_AT - .15, fp.d, mouth.z0 + .45])); glow.scale.set(GLOW_RADII[0], GLOW_RADII[1], GLOW_RADII[2]);

  // The fire's dials: `fire` and `embers` 0–1 (interiorDials) and the world's `seconds`; the flames sway only with `motion`.
  // Cheap and allocation-free: scalars into the existing objects.
  function setFire({fire, embers: ember, seconds, motion} = {}) {
    const f = clamp01(fire), e = clamp01(ember), t = Number.isFinite(seconds) ? seconds : 0, moving = !!motion;
    flames.visible = f > FLAME_FLOOR; flameMaterial.opacity = .25 + .5 * f;   // added over the room: overlapping tongues reach white at their cores
    const grown = .35 + .65 * f;
    for (const c of cards) {
      // each tongue on its own clock: its height, its lean and its width
      const wobble = moving ? 1 + .16 * Math.sin(t * (4.3 + c.phase * .4) + c.phase) + .07 * Math.sin(t * 9.1 + c.phase * 2.3) : 1;
      c.m.scale.y = c.h * grown * wobble; c.m.scale.x = c.w * (moving ? 1 + .1 * Math.sin(t * 3.7 + c.phase * 1.7) : 1);
      c.m.rotation.z = moving ? .16 * Math.sin(t * (1.7 + c.phase * .3) + c.phase) : 0;
    }
    embers.material.color.setRGB(ASH[0] + (EMBER[0] - ASH[0]) * e, ASH[1] + (EMBER[1] - ASH[1]) * e, ASH[2] + (EMBER[2] - ASH[2]) * e);
    glow.material.uniforms.opacity.value = f > FLAME_FLOOR ? f * GLOW.burning : e * GLOW.embers; glow.visible = glow.material.uniforms.opacity.value > 0;
  }
  setFire({fire: 0, embers: 0, seconds: 0, motion: false});
  // The lit surfaces given up (buildInterior's fallBack): the stone takes a Lambert material whose colour brings its lit tint back
  // to the unlit one, the mantel and the upper breast the shell's own `flat` surface and plaster. The fire is untouched.
  function fallBack(flat) {
    if (!light) return;
    stoneMaterial = new THREE.MeshLambertMaterial({...map, vertexColors: true, color: new THREE.Color().setRGB(...STONE.map((c, i) => c / LIT_STONE[i]), THREE.LinearSRGBColorSpace)});
    for (const name of ['breast', 'slab']) group.getObjectByName(name).material = stoneMaterial;
    group.getObjectByName('mantel').material = flat.surface; group.getObjectByName('breast-upper').material = flat.plastered;
  }
  return {object: group, overlay, setFire, fallBack, dispose() {
    group.traverse(o => o.geometry?.dispose()); overlay.traverse(o => o.geometry?.dispose()); flameMaterial.dispose(); embers.material.dispose(); glow.material.dispose(); stoneMaterial.dispose();
  }};
}
