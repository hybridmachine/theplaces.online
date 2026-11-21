import {ceilingHeight, wallSegments} from '../../../shared/interior.js';
import {mergeGeometries, sheet} from '../geometry.js';
import {noise} from '../scene/noise.js';
import {CASEMENT} from '../../../shared/lakeside-dressing.js';

// The cabin's interior as a plain shell, its own scene: plastered walls with their openings, board floors, plaster ceilings
// (flat downstairs, following the roof's two slopes upstairs), the stair in its shut-off box, and flat glass in every window
// and the front doorway that takes the sky's horizon colour (a pane of its own for each, so that one can be made live by
// marking the stencil). Painted frames, sills and glazing bars stand in the windows, the living room's casement leaf swings
// outward and the hall's door leaf swings in. Interior [a, d, z] (z up from the ground floor) goes to three
// through toThree, so three x = a, y = up, z = −d. Every face is wound into the rooms and drawn single-sided; an internal
// wall is its two faces, 0.15 m apart, with reveals inside each opening.

// The brushwork tiles every metre and a half, as on the cabin's eaves; sheets are cut finer than this so the vertex tint
// varies smoothly across them. Tints are linear and may pass 1: the brushwork texture is dark (about linear .33) and three's
// Lambert divides the hemisphere light by π. Plaster also glows a pale base of its own, so its strokes are a gentle
// variation on a pale ground rather than camouflage; boards have none and stay darker than the walls.
const BRUSH_TILE = 1.6, STEP = .4, PLASTER = [1.35, 1.2, 1.05], PLASTER_BASE = [.3, .27, .21], BOARDS = [1.4, .97, .65];
// Reveal depth of a roof window, the rail's height and thickness, and the stair's treads.
const RAIL = .9, RAIL_THICK = .04, TREADS = 15;
// The painted joinery: frame width, bar width, how far a sill board stands into the room, how far frames and bars stand off the
// pane (so they never fight it), how far the casement lies outside it, and the door's swing (as the exterior door's).
const FRAME = .07, BAR = .03, SILL = .06, SILL_THICK = .03, OFF = .004, LEAF_OUT = .02, DOOR_SWING = 1.45;
const SKY = 0xf4ead8, GROUND = 0xd9cdb8, LIGHT = 3.1, FIRST_SKY = [.83, .83, .75];
const tint = (base, seed, depth = .08) => p => {
  const k = 1 - depth + 2 * depth * noise((p[0] + p[2] * .6) * .7, (p[1] - p[2] * .4) * .7, seed);
  return base.map(c => c * k);
};
const plaster = tint(PLASTER, 61), boards = tint(BOARDS, 62, .12), dark = tint(BOARDS.map(c => c * .7), 63, .1);
const steps = length => Math.max(1, Math.ceil(length / STEP - 1e-9));

export function buildInterior(THREE, {interior: I, art, openings}) {
  const W = I.wall, half = W / 2, rise = I.floorRise, [SA, SD] = I.size;
  const base = floor => floor * rise;
  // The ceiling's height above the ground floor at depth d on that storey.
  const ceiling = (floor, d) => floor === 0 ? I.groundCeiling : rise + ceilingHeight(I, 1, d);
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  // A sheet over (s, t), sized by the lengths it spans along each.
  const face = (f, across, up, outward, colour) => sheet(THREE, f, {ns: steps(across), nt: steps(up), tile: BRUSH_TILE, outward, colour});

  // ── walls ──
  // A point on a wall line: `axis` 'a' is a line of constant a running along d, 'd' one of constant d running along a.
  const onLine = (axis, off, x, z) => axis === 'a' ? [off, x, z] : [x, off, z];
  const normal = axis => axis === 'a' ? [1, 0, 0] : [0, 1, 0], alongAxis = axis => axis === 'a' ? [0, 1, 0] : [1, 0, 0];
  const top = (floor, axis, off) => x => ceiling(floor, axis === 'a' ? x : off);
  const walls = [];
  // One face of a wall line at `off` across it, over [lo, hi] along it, from the storey's floor to its ceiling, less the
  // holes {x0, x1, z0, z1} in it. Cut at each hole's edges and at the ridge, so a sloped top bends exactly there.
  const wallFace = (floor, axis, off, lo, hi, outward, holes = []) => {
    const roof = top(floor, axis, off), piece = (x0, x1, z0, zTop, height) =>
      walls.push(face((s, t) => { const x = x0 + (x1 - x0) * s; return onLine(axis, off, x, z0 + (zTop(x) - z0) * t); }, x1 - x0, height, outward, plaster));
    const cuts = [lo, hi, ...holes.flatMap(h => [h.x0, h.x1]), ...(floor === 1 && axis === 'a' ? [I.ridgeAt] : [])].filter(x => x >= lo && x <= hi);
    const xs = [...new Set(cuts)].sort((x, y) => x - y);
    for (let i = 1; i < xs.length; i++) {
      const [x0, x1] = [xs[i - 1], xs[i]], mid = (x0 + x1) / 2;
      if (x1 - x0 < 1e-6) continue;
      let bottom = base(floor);   // up the column, the wall below each hole, then above the last one to the ceiling
      for (const h of holes.filter(h => h.x0 <= mid && mid <= h.x1).sort((p, q) => p.z0 - q.z0)) {
        if (h.z0 > bottom + 1e-6) piece(x0, x1, bottom, () => h.z0, h.z0 - bottom);
        bottom = h.z1;
      }
      if (roof(mid) - bottom > 1e-6) piece(x0, x1, bottom, roof, Math.max(roof(x0), roof(x1)) - bottom);
    }
  };
  // The sides, head and (if `sill`) sill of a hole through a wall, between the wall's faces at off0 and off1.
  const holeFrame = (floor, axis, off0, off1, h, sill) => {
    const along = alongAxis(axis), deep = Math.abs(off1 - off0);
    for (const [x, sign] of [[h.x0, 1], [h.x1, -1]])
      walls.push(face((s, t) => onLine(axis, off0 + (off1 - off0) * s, x, h.z0 + (h.z1 - h.z0) * t), deep, h.z1 - h.z0, along.map(v => v * sign), plaster));
    const flat = (z, up) => walls.push(face((s, t) => onLine(axis, off0 + (off1 - off0) * t, h.x0 + (h.x1 - h.x0) * s, z), h.x1 - h.x0, deep, [0, 0, up], plaster));
    if (h.z1 < ceiling(floor, axis === 'a' ? h.x0 : off0) - 1e-6) flat(h.z1, -1);
    if (sill) flat(h.z0, 1);
  };
  // The front door and the wall windows, as holes in their outer walls; each has its pane (below) at the wall's outside.
  const outerHoles = [{line: 0, x0: I.door.a - I.door.width / 2, x1: I.door.a + I.door.width / 2, z0: 0, z1: I.doorHead, door: true},
    ...I.windows.filter(w => w.kind === 'wall').map(w => ({line: w.wall === 'front' ? 0 : SD, x0: w.a - w.width / 2, x1: w.a + w.width / 2, z0: w.sill, z1: w.sill + w.height}))];
  for (const floor of [0, 1]) {
    const segs = wallSegments(I, floor).map(seg => {
      const axis = seg.from[0] === seg.to[0] ? 'a' : 'd', k = axis === 'a' ? 1 : 0;
      return {...seg, axis, at: seg.from[1 - k], lo: Math.min(seg.from[k], seg.to[k]), hi: Math.max(seg.from[k], seg.to[k])};
    });
    const openingEdge = (axis, at, x) => segs.some(s => !s.solid && s.axis === axis && s.at === at && (near(s.lo, x) || near(s.hi, x)));
    for (const seg of segs) {
      const {axis, at, lo, hi} = seg, n = normal(axis);
      const outer = at === 0 || at === (axis === 'a' ? SA : SD), inward = at === 0 ? 1 : -1;
      if (!seg.solid) {   // an opening: the lintel on both faces from doorHead up, the reveals and the head between them
        const hole = {x0: lo, x1: hi, z0: base(floor), z1: base(floor) + I.doorHead};
        for (const sign of [1, -1]) wallFace(floor, axis, at + sign * half, lo, hi, n.map(v => v * sign), [hole]);
        holeFrame(floor, axis, at - half, at + half, hole, false);
        continue;
      }
      // A solid run reaches half a wall past each end into the wall it meets, so no corner shows a gap; not past an opening's edge.
      const x0 = openingEdge(axis, at, lo) ? lo : lo - half, x1 = openingEdge(axis, at, hi) ? hi : hi + half;
      if (!outer) { for (const sign of [1, -1]) wallFace(floor, axis, at + sign * half, x0, x1, n.map(v => v * sign)); continue; }
      const holes = floor === 0 && axis === 'd' ? outerHoles.filter(h => h.line === at && h.x0 >= lo && h.x1 <= hi) : [];
      const inner = at + inward * half, outside = at - inward * half;
      wallFace(floor, axis, inner, x0, x1, n.map(v => v * inward), holes);
      for (const h of holes) {
        holeFrame(floor, axis, inner, outside, h, !h.door);
      }
    }
  }

  // ── floors and ceilings: a plan rectangle less the holes {a0, a1, d0, d1} in it, cut into columns at the holes' edges ──
  const holed = ([a0, a1], [d0, d1], holes, piece) => {
    const as = [...new Set([a0, a1, ...holes.flatMap(h => [h.a0, h.a1]).filter(a => a > a0 && a < a1)])].sort((x, y) => x - y);
    for (let i = 1; i < as.length; i++) {
      const [p, q] = [as[i - 1], as[i]], mid = (p + q) / 2;
      let from = d0;
      for (const h of holes.filter(h => h.a0 <= mid && mid <= h.a1 && h.d1 > d0 && h.d0 < d1).sort((x, y) => x.d0 - y.d0)) {
        if (h.d0 > from) piece(p, q, from, h.d0);
        from = Math.max(from, h.d1);
      }
      if (d1 > from) piece(p, q, from, d1);
    }
  };
  const flatPiece = (list, z, up, colour) => (a0, a1, d0, d1) => list.push(face((s, t) => [a0 + (a1 - a0) * s, d0 + (d1 - d0) * t, z], a1 - a0, d1 - d0, [0, 0, up], colour));
  const well = {a0: I.stair.a[0], a1: I.stair.a[1], d0: I.stair.d[0], d1: I.stair.d[1]};
  const floors = [], ceilings = [];
  holed([0, SA], [0, SD], [], flatPiece(floors, 0, 1, boards));
  holed([0, SA], [0, SD], [well], flatPiece(floors, rise, 1, boards));
  // the front doorway's threshold, out to the wall's outside
  floors.push(face((s, t) => [I.door.a + (s - .5) * I.door.width, -half * t, 0], I.door.width, half, [0, 0, 1], boards));
  // the stairwell's edges between the ground ceiling and the floor above, where no wall closes them: its front, its open
  // side, and the strip of wall along a = 11
  const band = (pt, length, outward) => walls.push(face((s, t) => pt(s, I.groundCeiling + (rise - I.groundCeiling) * t), length, rise - I.groundCeiling, outward, plaster));
  band((s, z) => [well.a0 + (well.a1 - well.a0) * s, well.d0, z], well.a1 - well.a0, [0, 1, 0]);
  band((s, z) => [well.a0, well.d0 + (well.d1 - well.d0) * s, z], well.d1 - well.d0, [1, 0, 0]);
  band((s, z) => [well.a1 - half, well.d0 + (well.d1 - well.d0) * s, z], well.d1 - well.d0, [-1, 0, 0]);
  holed([0, SA], [0, SD], [well], flatPiece(ceilings, I.groundCeiling, -1, plaster));
  // Upstairs, each slope less its roof windows; each window a short reveal up to its glass.
  const roofHoles = I.windows.filter(w => w.kind === 'roof').map(w => ({a0: w.a - w.width / 2, a1: w.a + w.width / 2, d0: w.d[0], d1: w.d[1]}));
  for (const [d0, d1] of [[0, I.ridgeAt], [I.ridgeAt, SD]])
    holed([0, SA], [d0, d1], roofHoles, (a0, a1, e0, e1) => ceilings.push(face((s, t) => { const d = e0 + (e1 - e0) * t; return [a0 + (a1 - a0) * s, d, ceiling(1, d)]; },
      a1 - a0, Math.hypot(e1 - e0, ceiling(1, e1) - ceiling(1, e0)), [0, 0, -1], plaster)));
  for (const h of roofHoles) {
    const up = (a, d, t) => [a, d, ceiling(1, d) + I.roofReveal * t], da = h.a1 - h.a0, dd = h.d1 - h.d0;
    ceilings.push(face((s, t) => up(h.a0, h.d0 + dd * s, t), dd, I.roofReveal, [1, 0, 0], plaster), face((s, t) => up(h.a1, h.d0 + dd * s, t), dd, I.roofReveal, [-1, 0, 0], plaster),
      face((s, t) => up(h.a0 + da * s, h.d0, t), da, I.roofReveal, [0, 1, 0], plaster), face((s, t) => up(h.a0 + da * s, h.d1, t), da, I.roofReveal, [0, -1, 0], plaster));
  }

  // ── the stair: treads and risers from the foot to the landing, closed below on its open side and at its top end, and a
  // rail along the landing's two open edges of the stairwell ──
  const stair = [], [sa0, sa1] = I.stair.a, [sd0, sd1] = I.stair.d, run = (sd1 - sd0) / TREADS, lift = rise / TREADS, width = sa1 - sa0;
  for (let k = 0; k < TREADS; k++) {
    const d0 = sd0 + k * run, d1 = d0 + run, z0 = k * lift, z1 = z0 + lift;
    stair.push(face((s, t) => [sa0 + width * s, d0, z0 + lift * t], width, lift, [0, -1, 0], boards),
      face((s, t) => [sa0 + width * s, d0 + run * t, z1], width, run, [0, 0, 1], boards));
    walls.push(face((s, t) => [sa0, d0 + run * s, z1 * t], run, z1, [-1, 0, 0], plaster));   // its plastered side, with the walls
  }
  walls.push(face((s, t) => [sa0 + width * s, sd1, I.groundCeiling * t], width, I.groundCeiling, [0, 1, 0], plaster));
  const rail = (pt, length, outward) => stair.push(face((s, t) => pt(s, rise + RAIL * t), length, RAIL, outward, dark));
  const runD = sd1 - sd0, side = sa0 + RAIL_THICK, front = sd0 + RAIL_THICK;
  rail((s, z) => [sa0, sd0 + runD * s, z], runD, [-1, 0, 0]);                        // along a = 9.6, landing side
  rail((s, z) => [side, front + (sd1 - front) * s, z], sd1 - front, [1, 0, 0]);       // and its stairwell side
  rail((s, z) => [sa0 + width * s, sd0, z], width, [0, -1, 0]);                       // along d = 1.5, landing side
  rail((s, z) => [side + (sa1 - side) * s, front, z], sa1 - side, [0, 1, 0]);         // and its stairwell side
  // its top, and its underside over the stairwell, seen from the flight
  for (const [z, up] of [[rise + RAIL, 1], [rise, -1]]) stair.push(face((s, t) => [sa0 + RAIL_THICK * s, sd0 + runD * t, z], RAIL_THICK, runD, [0, 0, up], dark),
    face((s, t) => [side + (sa1 - side) * s, sd0 + RAIL_THICK * t, z], sa1 - side, RAIL_THICK, [0, 0, up], dark));
  stair.push(
    face((s, t) => [sa0 + RAIL_THICK * s, sd1, rise + RAIL * t], RAIL_THICK, RAIL, [0, 1, 0], dark));   // its end at the top of the flight

  // ── the openings: a pane in each, the painted frames, sills and bars, the casement leaf and the hall's door leaf ──
  // A point of an opening's pane: x along `across`, y along `up` from the centre, `off` metres into the room.
  const at = (o, x, y, off) => o.centre.map((c, i) => c + x * o.across[i] + y * o.up[i] - o.outward[i] * off);
  const inward = o => o.outward.map(v => -v);
  const paneOf = o => sheet(THREE, (s, t) => at(o, (2 * s - 1) * o.half[0], (2 * t - 1) * o.half[1], 0), {outward: inward(o)});
  // A painted rectangle [x0, x1] × [y0, y1] standing `off` into the room, facing it; nothing for an empty one.
  const board = (list, o, [x0, x1], [y0, y1], off) => {
    if (x1 - x0 > 1e-6 && y1 - y0 > 1e-6) list.push(face((s, t) => at(o, x0 + (x1 - x0) * s, y0 + (y1 - y0) * t, off), x1 - x0, y1 - y0, inward(o), dark));
  };
  // A frame of FRAME round the inside of [x0, x1] × [y0, y1].
  const frame = (list, o, [x0, x1], [y0, y1], off) => {
    board(list, o, [x0, x1], [y0, y0 + FRAME], off); board(list, o, [x0, x1], [y1 - FRAME, y1], off);
    board(list, o, [x0, x0 + FRAME], [y0 + FRAME, y1 - FRAME], off); board(list, o, [x1 - FRAME, x1], [y0 + FRAME, y1 - FRAME], off);
  };
  // Bars at thirds across and up the glass inside that frame, as the exterior panel is painted; `across` names which thirds
  // get a vertical bar, and the horizontal ones start at x `from`.
  const bars = (list, o, [x0, x1], [y0, y1], off, {across = [1, 2], from = x0 + FRAME} = {}) => {
    const iy0 = y0 + FRAME, iy1 = y1 - FRAME;
    for (const k of across) { const x = x0 + (x1 - x0) * k / 3; board(list, o, [x - BAR / 2, x + BAR / 2], [iy0, iy1], off); }
    for (const k of [1, 2]) { const y = y0 + (y1 - y0) * k / 3; board(list, o, [from, x1 - FRAME], [y - BAR / 2, y + BAR / 2], off); }
  };
  const joinery = [], leaf = [], paneMeshes = [];
  for (const o of openings) {
    paneMeshes.push([o, paneOf(o)]);
    if (o.kind === 'door') continue;
    const [hx, hy] = o.half, X = [-hx, hx], Y = [-hy, hy];
    frame(joinery, o, X, Y, OFF);
    if (o.kind === 'roof') continue;
    // The casement window's low-a third is the leaf's: the fixed bars are over the other two thirds only.
    if (o.id === 'living') bars(joinery, o, X, Y, OFF, {across: [2], from: -hx / 3}); else bars(joinery, o, X, Y, OFF);
    // The sill board, from the pane out past the wall's inner face, a little wider than the hole.
    const z = -hy + SILL_THICK, deep = W + SILL, wide = hx + FRAME, edge = (x, sign) => joinery.push(face((s, t) => at(o, x, -hy + SILL_THICK * t, OFF + (deep - OFF) * s), deep - OFF, SILL_THICK, [sign * o.across[0], sign * o.across[1], sign * o.across[2]], dark));
    joinery.push(face((s, t) => at(o, -wide + 2 * wide * s, z, OFF + (deep - OFF) * t), 2 * wide, deep - OFF, [0, 0, 1], dark),
      face((s, t) => at(o, -wide + 2 * wide * s, -hy + SILL_THICK * t, deep), 2 * wide, SILL_THICK, inward(o), dark));
    edge(-wide, -1); edge(wide, 1);
  }
  // The casement leaf: the living window's low-a third, lying just outside its pane, as a frame about one column of three panes
  // (two horizontal bars), built about its hinge edge so that turning the mesh about the vertical there swings it.
  const living = openings.find(o => o.id === 'living'), [lx, ly] = living.half, third = [-lx, -lx / 3];
  frame(leaf, living, third, [-ly, ly], -LEAF_OUT);
  bars(leaf, living, third, [-ly, ly], -LEAF_OUT, {across: [], from: -lx + FRAME});
  // The hall's door leaf, 1 × 2.1 m and thick, shut in the doorway about its hinge edge at doorLeaf.a.
  const hinge = [I.doorLeaf.a, 0, 0], thick = I.doorLeaf.thick, leafWidth = I.door.width, leafHigh = I.doorHead, slab = [];
  const box = (x0, x1, d0, d1, z0, z1) => {
    const flat = (pt, lenS, lenT, outward) => slab.push(face(pt, lenS, lenT, outward, dark));
    flat((s, t) => [x0 + (x1 - x0) * s, d0, z0 + (z1 - z0) * t], x1 - x0, z1 - z0, [0, -1, 0]); flat((s, t) => [x0 + (x1 - x0) * s, d1, z0 + (z1 - z0) * t], x1 - x0, z1 - z0, [0, 1, 0]);
    flat((s, t) => [x0, d0 + (d1 - d0) * s, z0 + (z1 - z0) * t], d1 - d0, z1 - z0, [-1, 0, 0]); flat((s, t) => [x1, d0 + (d1 - d0) * s, z0 + (z1 - z0) * t], d1 - d0, z1 - z0, [1, 0, 0]);
    flat((s, t) => [x0 + (x1 - x0) * s, d0 + (d1 - d0) * t, z0], x1 - x0, d1 - d0, [0, 0, -1]); flat((s, t) => [x0 + (x1 - x0) * s, d0 + (d1 - d0) * t, z1], x1 - x0, d1 - d0, [0, 0, 1]);
  };
  box(hinge[0], hinge[0] + leafWidth, -thick / 2, thick / 2, 0, leafHigh);

  // ── assembly ──
  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };
  // Boards (floors, treads, rail) and plaster (walls, ceilings, the stair's plastered sides and the stairwell's bands).
  const surface = new THREE.MeshLambertMaterial({map: art.surfaces.hills, vertexColors: true});
  const plastered = new THREE.MeshLambertMaterial({map: art.surfaces.hills, vertexColors: true, emissive: new THREE.Color().setRGB(...PLASTER_BASE, THREE.LinearSRGBColorSpace)});
  const glass = new THREE.MeshBasicMaterial({color: new THREE.Color().setRGB(...FIRST_SKY, THREE.SRGBColorSpace)});
  const leafed = new THREE.MeshLambertMaterial({map: art.surfaces.hills, vertexColors: true, side: THREE.DoubleSide});
  const scene = new THREE.Scene(); scene.name = 'interior';
  const mesh = (name, list, material) => { const m = new THREE.Mesh(merged(list), material); m.name = name; scene.add(m); return m; };
  mesh('floors', floors, surface); mesh('ceilings', ceilings, plastered); mesh('walls', walls, plastered); mesh('stair', stair, surface); mesh('frames', joinery, surface);
  // A leaf is built in place and moved to its hinge, so its mesh turns about the hinge when rotated about the vertical.
  const hung = (name, list, [a, d, z]) => {
    const m = mesh(name, list, leafed), p = [a, z, -d];
    m.geometry.translate(-p[0], -p[1], -p[2]); m.position.set(...p); return m;
  };
  const casementLeaf = hung('casement', leaf, [living.centre[0] - lx, living.centre[1] + living.outward[1] * LEAF_OUT, living.centre[2]]);
  // The leaf stands beyond the glass, so it is drawn after the panes and takes its pixels back from the living pane's stencil
  // number: the yard's view (whose sky ignores depth) is never drawn over it. Behind the flat glass it stays hidden, as before.
  casementLeaf.material = new THREE.MeshLambertMaterial({map: art.surfaces.hills, vertexColors: true, side: THREE.DoubleSide,
    stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilRef: 0});
  casementLeaf.renderOrder = 2;
  const doorLeaf = hung('door-leaf', slab, hinge);
  // The way a leaf turns about the vertical (+1 or −1) to take its free edge, one metre out along three's x, toward `toward`.
  const turning = toward => Math.sign(new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(1, 0, 0)).dot(toward)) || 1;
  const casementTurn = turning(new THREE.Vector3(living.outward[0], living.outward[2], -living.outward[1])), doorTurn = turning(new THREE.Vector3(0, 0, -1));
  // The panes sit above everything else in the room; each switches between the flat glass and a marker of its own stencil number.
  const panes = new Map(), markers = new Map(), stencils = new Map();
  for (const [o, g] of paneMeshes) {
    const m = new THREE.Mesh(g, glass); m.name = `pane-${o.id}`; m.renderOrder = 1; scene.add(m); panes.set(o.id, m);
  }
  const marker = n => {
    if (!markers.has(n)) markers.set(n, new THREE.MeshBasicMaterial({colorWrite: false, depthWrite: false, depthTest: true, stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilRef: n}));
    return markers.get(n);
  };
  scene.add(new THREE.HemisphereLight(SKY, GROUND, LIGHT));
  const clamp01 = x => Math.min(1, Math.max(0, x));
  return {scene,
    // Display-space sky colours, 0–1, as the yard's setSky receives them; the flat glass shows the horizon.
    setSky({horizon}) { glass.color.setRGB(...horizon, THREE.SRGBColorSpace); },
    // The ids whose panes mark the stencil this frame, each numbered by its place in the list (1, 2, …; an id the room does
    // not know is passed over); every other pane is flat glass.
    setLive(ids) {
      stencils.clear();
      ids.forEach((id, k) => { if (panes.has(id) && !stencils.has(id)) stencils.set(id, k + 1); });
      for (const [id, m] of panes) m.material = stencils.has(id) ? marker(stencils.get(id)) : glass;
    },
    stencilOf: id => stencils.get(id) ?? 0,
    // How far the living room window's leaf stands open and the hall's door leaf, 0–1.
    setCasement(open) { casementLeaf.rotation.y = casementTurn * clamp01(open) * CASEMENT.maxAngle; },
    setDoor(open) { doorLeaf.rotation.y = doorTurn * clamp01(open) * DOOR_SWING; },
    dispose() {
      const materials = new Set(markers.values());
      scene.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
      for (const m of materials) m.dispose();
    }};
}
