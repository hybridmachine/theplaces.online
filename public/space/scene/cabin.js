import {terrainHeight} from '../../../shared/space.js';
import {PROUD, cabinFrame} from '../../../shared/lakeside-dressing.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {basis, cardBatch, cardMaterial, mergeGeometries, sheet, V} from '../geometry.js';
import {clamp01, hash, lin, noise, stream} from './noise.js';

// The cabin in paint: stone walls a little out of true under an overhanging, sagging slate roof, a chimney, the door and
// windows as panels just proud of the wall, dark eave boards and soffits under the overhang, dabs breaking the roof's edges
// and the corners, and shrubs at its foot.
// Every wall, chimney, board and soffit face is wound outward and drawn single-sided; only the roof is two-sided (its overhang is seen from
// below). World axes x east, y north, z up, metres; three is passed in. Local axes: `a` along the long axis, `b` across it.

// The eaves carry the hills' loose brushwork (no joints in it) under their own dark colour.
const BRUSH_TILE = 1.6, UNDER_ROOF = .03, FASCIA = .12, STONE_TILE = SPACE_ART.surfaces.stone.metres;
const STONE = lin([182, 156, 108]), SLATE = lin([128, 126, 124]);
const shade = (colour, k) => colour.map(c => c * k);

export function buildCabin(THREE, {space, dressing, art}) {
  const {gable: OG, chimney} = dressing.cabin;
  const {u, v, L, W, front, at, ground, eave, ridge, slope, base, roofZ, reachOut, wallPoint, doorGround} = cabinFrame(space, dressing);
  // Across a gable end at `a`, from the one eave's edge (s = 0) to the other's (s = 1), so the verge meets both eaves exactly.
  const gableSpan = (a, s) => -reachOut(a, -1) + (reachOut(a, -1) + reachOut(a, 1)) * s;
  const fascia = (a, side) => FASCIA * (.75 + .6 * noise(a * 1.4, side * 5, 49));
  // Stone darkens toward the ground and in slow patches.
  const stoneTint = p => {
    const k = (.86 + .22 * noise(p[0] * .9, p[1] * .9 + p[2] * .7, 45)) * (.72 + .28 * clamp01((p[2] - terrainHeight(space, p[0], p[1])) / .7));
    return [k, k * .98, k * .94];
  };

  // ── walls: two long faces to the eaves and two gables to just under the roof ──
  const walls = [];
  for (const side of [-1, 1]) {
    walls.push(sheet(THREE, (s, t) => { const a = -L + 2 * L * s, b = side * W; return wallPoint(side, true, a, b, base + (roofZ(a, b) - UNDER_ROOF - base) * t); },
      {ns: 24, nt: 12, tile: STONE_TILE, outward: V.scale(v, side), colour: stoneTint}));
    walls.push(sheet(THREE, (s, t) => { const a = side * L, b = -W + 2 * W * s; return wallPoint(side, false, a, b, base + (roofZ(a, b) - UNDER_ROOF - base) * t); },
      {ns: 16, nt: 12, tile: STONE_TILE, outward: V.scale(u, side), colour: stoneTint}));
  }

  // ── roof: two slopes overhanging the eaves and gables, an eave board along each side and a verge board at each end ──
  const roof = [], boards = [], A0 = -L - OG, A1 = L + OG;
  // The eave and verge boards are dark and loosely brushed, so nothing on them reads as a row of planks.
  const board = p => { const k = .17 + .08 * noise(p[0] * 2.3, p[1] * 2.3 + p[2], 46); return [k, k * .9, k * .78]; };
  for (const side of [-1, 1]) {
    const up = V.norm(V.add([0, 0, 1], v, side * slope));
    roof.push(sheet(THREE, (s, t) => { const a = A0 + (A1 - A0) * s, b = side * reachOut(a, side) * (1 - t); return at(a, b, roofZ(a, b)); },
      {ns: 40, nt: 8, tile: SPACE_ART.surfaces.slate.metres, outward: up}));
    boards.push(sheet(THREE, (s, t) => { const a = A0 + (A1 - A0) * s, b = side * reachOut(a, side); return at(a, b, roofZ(a, b) - fascia(a, side) * t); },
      {ns: 40, nt: 1, tile: BRUSH_TILE, outward: V.scale(v, side), colour: board}));
    boards.push(sheet(THREE, (s, t) => { const a = side * A1, b = gableSpan(a, s); return at(a, b, roofZ(a, b) - FASCIA * t); },
      {ns: 16, nt: 1, tile: BRUSH_TILE, outward: V.scale(u, side), colour: board}));
  }

  // ── soffits: the overhangs' undersides, in deep shade, so no slate joint shows from below; each runs from just inside
  // the wall out to the board's lower edge, under the roof sheet, and faces down ──
  const soffits = [], tint = base => p => { const k = base + .07 * noise(p[0] * 1.3, p[1] * 1.3 + p[2], 50); return [k, k * .88, k * .74]; };
  // the gables' soffits, seen large from right beneath the verge, a little lighter than the eaves'
  const dark = tint(.21), verge = tint(.3);
  for (const side of [-1, 1]) {
    soffits.push(sheet(THREE, (s, t) => { const a = A0 + (A1 - A0) * s, b = side * (W - .1 + (reachOut(a, side) - W + .1) * t);
      return at(a, b, roofZ(a, b) - .05 - (fascia(a, side) * .8 - .05) * t); }, {ns: 40, nt: 2, tile: BRUSH_TILE, outward: [0, 0, -1], colour: dark}));
    soffits.push(sheet(THREE, (s, t) => { const a = side * (L - .1 + (OG + .1) * t), b = gableSpan(side * A1, s);
      return at(a, b, roofZ(a, b) - .05 - (FASCIA * .8 - .05) * t); }, {ns: 16, nt: 2, tile: BRUSH_TILE, outward: [0, 0, -1], colour: verge}));
  }

  // ── chimney: a stack a little tapered, from inside the house up through the roof, with a slab cap ──
  const stack = [], half = chimney.size / 2, top = ridge + chimney.rise, capHalf = half + .06;
  const box = (h0, h1, z0, z1, taper, nt, ends) => {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [p, q] = [corners[k], corners[(k + 1) % 4]], out = V.add(V.scale(u, p[0] + q[0]), v, p[1] + q[1]);
      stack.push(sheet(THREE, (s, t) => {
        const h = (h0 + (h1 - h0) * t) * (1 - taper * t);
        return at(chimney.along + h * (p[0] + (q[0] - p[0]) * s), h * (p[1] + (q[1] - p[1]) * s), z0 + (z1 - z0) * t);
      }, {ns: 2, nt, tile: STONE_TILE, outward: V.norm(out), colour: pt => shade(stoneTint(pt), .75 + .25 * clamp01((top - pt[2]) / 1.2))}));
    }
    if (ends) for (const [z, dir] of [[z0, -1], [z1, 1]]) {
      const h = dir > 0 ? h1 * (1 - taper) : h0;
      stack.push(sheet(THREE, (s, t) => at(chimney.along + h * (2 * s - 1), h * (2 * t - 1), z), {tile: STONE_TILE, outward: [0, 0, dir], colour: () => [.6, .58, .55]}));
    }
  };
  box(half, half, eave, top, .04, 6, false);
  box(capHalf, capHalf, top - .02, top + .08, 0, 1, true);

  // ── the door and windows: panels following the wall's surface, just proud of it, textured edge to edge ──
  const {door, windows} = dressing.cabin;
  const openings = new THREE.Group(); openings.name = 'openings';
  const panelMaterials = {door: new THREE.MeshLambertMaterial({map: art.panels.door}), window: new THREE.MeshLambertMaterial({map: art.panels.window})};
  const panel = (name, kind, face, along, z0, width, height) => {
    const side = (face === 'back' ? -1 : 1) * front, ns = 4, nt = 4;
    const g = sheet(THREE, (s, t) => wallPoint(side, true, along + (s - .5) * width * side, side * W, z0 + height * t, PROUD), {ns, nt, outward: V.scale(v, side)});
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, i % (ns + 1) / ns, Math.floor(i / (ns + 1)) / nt);
    const mesh = new THREE.Mesh(g, panelMaterials[kind]); mesh.name = name;
    openings.add(mesh);
  };
  // The threshold height (doorGround) comes from cabinFrame, as do the panel positions the life layout anchors to.
  panel('door', 'door', door.face, door.along, doorGround - .03, door.width, door.height + .03);
  for (const w of windows) panel(`window-${w.id}`, 'window', w.face, w.along, doorGround + w.sill, w.width, w.height);

  // ── dabs breaking the ridge, eaves, verges and corners, in the colour of the surface they break ──
  const cells = SPACE_ART.cards.cells, dabs = cardBatch(SPACE_ART), r = stream(dressing.seed + 6, 11);
  const dabCell = () => cells.dab[r() < .5 ? 0 : 1];
  for (let a = A0 + .25; a <= A1 - .25; a += .16 + r() * .08) {
    const lean = r() < .5 ? -1 : 1, tilt = lean * (.6 + r() * .5), upAxis = V.norm(V.add(V.scale([0, 0, 1], Math.cos(tilt)), v, Math.sin(tilt))), h = .04 + r() * .04;
    const lit = V.norm(V.add([0, 0, 1], v, lean * slope));
    dabs.add(at(a, 0, roofZ(a, 0) + h * .4), V.scale(u, .18 + r() * .12), V.scale(upAxis, h), dabCell(), shade(SLATE, .62 + r() * .12), shade(SLATE, .72 + r() * .14), lit, r() < .5);
  }
  for (const side of [-1, 1]) {
    const down = V.norm([side * v[0], side * v[1], -slope]), roofUp = V.norm(V.add([0, 0, 1], v, side * slope));
    for (let a = A0 + .3; a <= A1 - .3; a += .14 + r() * .16) {
      if (r() > .6) continue;
      const b = side * reachOut(a, side), e = at(a, b, roofZ(a, b) - fascia(a, side) * (.2 + r() * .9)), len = .08 + r() * .2;
      dabs.add(V.add(e, V.scale(v, side * .01)), V.scale(u, len), V.add(V.scale(down, .02), [0, 0, .025 + r() * .05]), dabCell(),
        shade(SLATE, .3 + r() * .12), shade(SLATE, .4 + r() * .15), V.scale(v, side), r() < .5);
    }
    for (const e of [-1, 1]) for (let t = .02; t <= .93; t += .07 + r() * .04) {
      const a = e * (A1 + .01), b = side * reachOut(e * A1, side) * (1 - t);
      dabs.add(at(a, b, roofZ(a, b) + .01), V.scale(down, .18 + r() * .1), [0, 0, .07 + r() * .06], dabCell(), shade(SLATE, .7 + r() * .25), shade(SLATE, .9 + r() * .3), roofUp, r() < .5);
    }
  }
  // Quoins up each corner, lying on one wall and then the other, each reaching a few centimetres past the corner.
  for (const [ea, eb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    let n = 0;
    for (let z = ground(ea * L, eb * W) + .12; z < roofZ(ea * L, eb * W) - .1; z += .18 + r() * .1, n++) {
      const alongLong = n % 2 === 0, axis = alongLong ? u : v, normal = alongLong ? V.scale(v, eb) : V.scale(u, ea);
      const corner = wallPoint(ea, false, ea * L, eb * W, z), k = .8 + r() * .3, half = .14 + r() * .06;
      dabs.add(V.add(V.add(corner, normal, .015), axis, -(alongLong ? ea : eb) * (half - .05)), V.scale(axis, half), [0, 0, .07 + r() * .03], cells.dab[1],
        shade(STONE, k * .8), shade(STONE, k * 1.02), normal, r() < .5);
    }
  }

  // ── shrubs at the cabin's foot, at the front corners, beside the door and behind, as clusters of bushy woods cards ──
  const shrubs = cardBatch(SPACE_ART), q = stream(dressing.seed + 7, 11);
  const shrub = (a, b, size) => {
    const foot = at(a, b, ground(a, b) - .05);
    for (let k = 0; k < 8; k++) {
      const normal = V.norm([q() - .5, q() - .5, (q() - .5) * .4]), [right, up0] = basis(normal), turn = (q() - .5) * .5;
      const up = V.add(V.scale(up0, Math.cos(turn)), right, Math.sin(turn)), across = V.add(V.scale(right, Math.cos(turn)), up0, -Math.sin(turn));
      const s = size * (.5 + q() * .35), centre = V.add(foot, [(q() - .5) * size, (q() - .5) * size, s * .85 + q() * size * .2]), kk = .75 + q() * .35;
      shrubs.add(centre, V.scale(across, s), V.scale(up, s), cells.woods[q() < .5 ? 0 : 1], shade([1, 1, 1], kk * .75), shade([1, 1, 1], kk), [0, 0, 1], q() < .5,
        {kind: 'shrub', random: hash(shrubs.count, 4, 11)});
    }
  };
  shrub(-L - .2, front * (W + .45), 1.1); shrub(L + .1, front * (W + .45), 1.0);
  shrub(-1.25, front * (W + .4), .6); shrub(1.45, front * (W + .4), .65);
  shrub(-L - .3, -front * (W - .6), 1.0);

  // ── assembly ──
  const stone = new THREE.MeshLambertMaterial({map: art.surfaces.stone, vertexColors: true}), cards = cardMaterial(THREE, art.cards, SPACE_ART);
  const mesh = (name, geometry, material) => { const m = new THREE.Mesh(geometry, material); m.name = name; return m; };
  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };
  const object = new THREE.Group(); object.name = 'cabin';
  object.add(mesh('walls', merged(walls), stone),
    mesh('roof', merged(roof), new THREE.MeshLambertMaterial({map: art.surfaces.slate, vertexColors: true, side: THREE.DoubleSide})),
    mesh('eaves', merged([...boards, ...soffits]), new THREE.MeshLambertMaterial({map: art.surfaces.hills, vertexColors: true})),
    mesh('chimney', merged(stack), stone), openings,
    mesh('shrubs', shrubs.geometry(THREE), cards), mesh('dabs', dabs.geometry(THREE), cards));
  return {object, dispose() {
    const materials = new Set();
    object.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
    for (const m of materials) m.dispose();
  }};
}
