import {ceilingHeight, roomAt, wallSegments} from '../../../shared/interior.js';
import {seenFrom} from '../../../shared/sight.js';
import {piecesIn} from '../../../shared/furniture.js';
import {createLightField, interiorDials} from '../../../shared/interior-light.js';
import {mergeGeometries, sheet, V} from '../geometry.js';
import {noise} from '../scene/noise.js';
import {CASEMENT} from '../../../shared/lakeside-dressing.js';
import {createInteriorLight} from './light.js';
import {buildFireplace} from './fireplace.js';
import {buildFittings} from './fittings.js';
import {buildFurniture} from './furniture.js';

// The cabin's interior as a plain shell, its own scene: plastered walls with their openings, board floors, plaster ceilings
// (flat downstairs, following the roof's two slopes upstairs), the stair in its shut-off box, and flat glass in every window
// and the front doorway that takes the sky's horizon colour (a pane of its own for each, so that one can be made live by
// marking the stencil). Painted frames, sills and glazing bars stand in the windows, the living room's casement leaf swings
// outward and the hall's door leaf swings in. Interior [a, d, z] (z up from the ground floor) goes to three
// through toThree, so three x = a, y = up, z = −d. Every face is wound into the rooms and drawn single-sided; an internal
// wall is its two faces, 0.15 m apart, with reveals inside each opening.
// Lit, as it is unless its materials cannot be made, it holds no light source: every vertex carries the light it takes (its
// day, lamp and fire weights and its room, from shared/interior-light.js) and light.js's materials sum the frame's dials by them.
// So that no vertex is weighed in the wrong room, every face is cut where the rooms on its side meet, and is weighed a little
// inside the room it faces; a reveal in a doorway between rooms is weighed, each side, in the room on that side.

// The brushwork tiles every metre and a half, as on the cabin's eaves; sheets are cut finer than this so the vertex tint
// varies smoothly across them. Tints are linear and may pass 1: the brushwork texture is dark (about linear .33). Unlit (the
// fallback), three's Lambert divides the hemisphere light by π and plaster also glows a pale base of its own, so its strokes are
// a gentle variation on a pale ground rather than camouflage; boards have none and stay darker than the walls. Lit, plaster keeps
// its pale base (light.js adds it under the light), and each tint is the unlit one times the flat light's irradiance on that
// surface (about .78 on a wall, .89 on a floor), so a surface under a dial sum of 1 looks as it did unlit and the rest of the room
// falls away from it. The sum passes 1 in the brightest places (about 1.28 beside the glass at noon), and some of the brightest
// brushwork there clips; the lit tints were calmed so that little does.
const BRUSH_TILE = 1.6, STEP = .4, PLASTER = [1.35, 1.2, 1.05], PLASTER_BASE = [.3, .27, .21], BOARDS = [1.4, .97, .65];
// Lit plaster's brushwork is calmer than unlit: less of its tint and more of its pale ground, so it reads as cream and its strokes
// leave room under the light by the window before they clip.
const LIT_PLASTER = [.6, .54, .47], LIT_PLASTER_BASE = [.45, .405, .315], LIT_BOARDS = [1.25, .86, .58];
// How far inside its room a face's light is weighed past the wall's face, metres.
const INTO = .03;
// The furniture's light is weighed once a cell of this lattice (metres) and a facing rounded to this, so its many small faces cost no more
// to light than a few walls. The lattice is finer than the shell's own vertices (STEP, 0.4 m), between which a wall's or a floor's light is
// only interpolated. At 0.12 m and 0.25 the furniture added about 88 ms to a first build in the browser, against the 60 ms it has. Rounding a
// normal to 0.5 can turn it about 35° (the worst vertex is .29 off the exact field, on rail caps and the runner); a turn of 0.25 with this
// lattice drew the sofa's cushions and arm rolls no differently in the captures and cost about 8 ms more, so 0.5 stands, and the sofa's soft
// parts are pinned within 0.1 of the exact field (test/interior-furniture.test.js).
const WEIGH_GRID = .3, WEIGH_TURN = .5;
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
const steps = length => Math.max(1, Math.ceil(length / STEP - 1e-9));
// A plain daytime, the light the rooms show until a frame sets its own: full daylight from a pale sky, every lamp and the fire out.
const DAYTIME = {calendar: {light: 1, elevation: 1, hour: 12}, weather: {cloud: 0}, sky: {zenith: [.62, .70, .76], horizon: [.83, .83, .75]},
  cottage: null, pose: {main: 0, second: 0}, now: 0, seconds: 0, motion: false};
// `recipes` replaces the furniture's recipes by kind (buildFurniture's; its RECIPES unless given), as a test does to make one fail.

export function buildInterior(THREE, {interior: I, art, openings, recipes, sight = seenFrom}) {
  const W = I.wall, half = W / 2, rise = I.floorRise, [SA, SD] = I.size;
  const base = floor => floor * rise;
  // The ceiling's height above the ground floor at depth d on that storey.
  const ceiling = (floor, d) => floor === 0 ? I.groundCeiling : rise + ceilingHeight(I, 1, d);
  const near = (x, y) => Math.abs(x - y) < 1e-9;

  // ── the light: its materials first, since the tints depend on whether they could be made ──
  const map = art.surfaces.hills;
  // The flat light's materials, under the one hemisphere light. Built unlit, the tints are the unlit ones; when the lit surfaces are
  // given up after they were built (fallBack), their vertices keep the lit tints and each material's colour takes them back to the
  // unlit ones: plaster's `plasterK` (with its pale base glowing as before) and boards' `boardsK`, per channel.
  const linear = rgb => new THREE.Color().setRGB(...rgb, THREE.LinearSRGBColorSpace);
  const lambert = ({plasterK = [1, 1, 1], boardsK = [1, 1, 1]} = {}) => ({surface: new THREE.MeshLambertMaterial({map, vertexColors: true, color: linear(boardsK)}),
    plastered: new THREE.MeshLambertMaterial({map, vertexColors: true, color: linear(plasterK), emissive: linear(PLASTER_BASE)}),
    leafed: new THREE.MeshLambertMaterial({map, vertexColors: true, color: linear(boardsK), side: THREE.DoubleSide}),
    casement: new THREE.MeshLambertMaterial({map, vertexColors: true, color: linear(boardsK), side: THREE.DoubleSide,
      stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilRef: 0})});
  let light = null, made;
  try {
    light = createInteriorLight(THREE, {rooms: I.rooms.length});
    const surface = light.material({map}), leafed = light.material({map, side: THREE.DoubleSide});
    made = {surface, plastered: light.material({map, base: LIT_PLASTER_BASE}), leafed, casement: light.material({map, side: THREE.DoubleSide,
      stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilRef: 0})};
  } catch (error) {
    console.warn("The cabin's light could not be set up; its rooms stay evenly lit.", error);
    light?.dispose(); light = null;
    made = lambert();
  }
  const plaster = tint(light ? LIT_PLASTER : PLASTER, 61), boards = tint(light ? LIT_BOARDS : BOARDS, 62, .12);
  const dark = tint((light ? LIT_BOARDS : BOARDS).map(c => c * .7), 63, .1);

  // Each vertex's light from the field, at its position and its surface's normal (three's axes back to the interior frame), on
  // the storey `floorOf` its height gives, weighed at `place` of its position: by default a little inside the room its face looks
  // into, found from the face's middle.
  const field = createLightField(I, openings), inset = half + INTO;
  const storey = z => z >= rise - 1e-6 ? 1 : 0, nearer = z => z >= rise / 2 ? 1 : 0;
  const within = (x, [lo, hi]) => lo + inset > hi - inset ? (lo + hi) / 2 : Math.min(hi - inset, Math.max(lo + inset, x));
  const into = r => r ? p => [within(p[0], r.a), within(p[1], r.d), p[2]] : p => p;
  const roomOf = id => I.rooms.find(r => r.id === id);
  const weighed = (g, place, floorOf, weigh = field.weigh) => {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), out = new Float32Array(p.count * 4), spill = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const at = [p.getX(i), -p.getZ(i), p.getY(i)], w = weigh(floorOf(at[2]), place(at), [n.getX(i), -n.getZ(i), n.getY(i)]);
      out.set([w.day, w.lamp, w.fire, w.room], i * 4); spill.set([w.spill, w.spillRoom], i * 2);
    }
    g.setAttribute('light', new THREE.Float32BufferAttribute(out, 4)); g.setAttribute('spill', new THREE.Float32BufferAttribute(spill, 2));
    return g;
  };
  // A sheet over (s, t), sized by the lengths it spans along each, carrying its light; cut into `cols` × `rows` cells, by default
  // as finely as STEP.
  const face = (f, across, up, outward, colour, {place, floorOf = storey, tile = BRUSH_TILE, cols = steps(across), rows = steps(up), weigh} = {}) => {
    const g = sheet(THREE, f, {ns: cols, nt: rows, tile, outward, colour});
    if (!place) { const mid = f(.5, .5), u = V.norm(outward); place = into(roomAt(I, floorOf(mid[2]), [mid[0] + u[0] * .05, mid[1] + u[1] * .05])); }
    return weighed(g, place, floorOf, weigh);
  };
  // The field's weights at the middle of the cell of a WEIGH_GRID lattice holding the point (kept inside the point's room), for the
  // normal rounded to WEIGH_TURN, each worked out once: for the many small faces of the furniture, whose light varies over metres while
  // its vertices lie centimetres apart.
  const coarseWeigh = () => {
    const known = new Map(), cell = x => Math.floor(x / WEIGH_GRID), turn = x => Math.round(x / WEIGH_TURN);
    return (floor, p, n) => {
      const r = roomAt(I, floor, p), c = p.map(cell), q = n.map(turn);
      // (one number: the floor, the room, the cell (each index under 256 inside the cabin) and the facing (each −2 to 2, in nine slots))
      const key = ((((((floor * 64 + I.rooms.indexOf(r) + 1) * 256 + c[0]) * 256 + c[1]) * 256 + c[2]) * 9 + q[0] + 4) * 9 + q[1] + 4) * 9 + q[2] + 4;
      let w = known.get(key);
      if (!w) { w = field.weigh(floor, into(r)(c.map(k => (k + .5) * WEIGH_GRID)), V.norm(q)); known.set(key, w); }
      return w;
    };
  };

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
    // and where the rooms on its own side meet, so each piece lies in one room
    const k = axis === 'a' ? 0 : 1, sign = Math.sign(outward[k]), line = off - sign * half;
    const meets = I.rooms.filter(r => r.floor === floor && near(r[axis][sign > 0 ? 0 : 1], line)).flatMap(r => r[axis === 'a' ? 'd' : 'a'])
      .filter(x => x > lo + half + 1e-6 && x < hi - half - 1e-6);
    const cuts = [lo, hi, ...holes.flatMap(h => [h.x0, h.x1]), ...meets, ...(floor === 1 && axis === 'a' ? [I.ridgeAt] : [])].filter(x => x >= lo && x <= hi);
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
  // The sides, head and (if `sill`) sill of a hole through a wall, between the wall's faces at off0 and off1. Their faces look
  // along the wall, so each vertex is weighed in the room on its own side of the wall's centre line, or, given `side` (+1 or −1
  // across it), all of them in the room on that side.
  const holeFrame = (floor, axis, off0, off1, h, sill, side = 0) => {
    const along = alongAxis(axis), deep = Math.abs(off1 - off0), k = axis === 'a' ? 0 : 1, mid = (off0 + off1) / 2, middle = (h.x0 + h.x1) / 2;
    const rooms = [-1, 1].map(s => into(roomAt(I, floor, onLine(axis, mid + s * inset, middle, 0))));
    const place = p => rooms[(side || Math.sign(p[k] - mid) || 1) > 0 ? 1 : 0](p);
    for (const [x, sign] of [[h.x0, 1], [h.x1, -1]])
      walls.push(face((s, t) => onLine(axis, off0 + (off1 - off0) * s, x, h.z0 + (h.z1 - h.z0) * t), deep, h.z1 - h.z0, along.map(v => v * sign), plaster, {place}));
    const flat = (z, up) => walls.push(face((s, t) => onLine(axis, off0 + (off1 - off0) * t, h.x0 + (h.x1 - h.x0) * s, z), h.x1 - h.x0, deep, [0, 0, up], plaster, {place}));
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
        holeFrame(floor, axis, inner, outside, h, !h.door, inward);
      }
    }
  }

  // ── floors and ceilings, room by room: a plan rectangle less the holes {a0, a1, d0, d1} in it, cut into columns at the holes' edges ──
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
  const floors = [], ceilings = [], hall = roomAt(I, 0, [I.door.a, 1]);
  for (const r of I.rooms) holed(r.a, r.d, r.floor ? [well] : [], flatPiece(floors, base(r.floor), 1, boards));
  // the front doorway's threshold, out to the wall's outside, in the hall's light
  floors.push(face((s, t) => [I.door.a + (s - .5) * I.door.width, -half * t, 0], I.door.width, half, [0, 0, 1], boards, {place: into(hall)}));
  // the stairwell's edges between the ground ceiling and the floor above, where no wall closes them: its front, its open
  // side, and the strip of wall along a = 11
  const band = (pt, length, outward) => walls.push(face((s, t) => pt(s, I.groundCeiling + (rise - I.groundCeiling) * t), length, rise - I.groundCeiling, outward, plaster));
  band((s, z) => [well.a0 + (well.a1 - well.a0) * s, well.d0, z], well.a1 - well.a0, [0, 1, 0]);
  band((s, z) => [well.a0, well.d0 + (well.d1 - well.d0) * s, z], well.d1 - well.d0, [1, 0, 0]);
  band((s, z) => [well.a1 - half, well.d0 + (well.d1 - well.d0) * s, z], well.d1 - well.d0, [-1, 0, 0]);
  for (const r of I.rooms.filter(r => r.floor === 0)) holed(r.a, r.d, [well], flatPiece(ceilings, I.groundCeiling, -1, plaster));
  // Upstairs, each slope less its roof windows; each window a short reveal up to its glass.
  const roofHoles = I.windows.filter(w => w.kind === 'roof').map(w => ({a0: w.a - w.width / 2, a1: w.a + w.width / 2, d0: w.d[0], d1: w.d[1]}));
  for (const r of I.rooms.filter(r => r.floor === 1)) for (const [d0, d1] of [[0, I.ridgeAt], [I.ridgeAt, SD]]) {
    const span = [Math.max(d0, r.d[0]), Math.min(d1, r.d[1])];
    if (span[1] > span[0]) holed(r.a, span, roofHoles, (a0, a1, e0, e1) => ceilings.push(face((s, t) => { const d = e0 + (e1 - e0) * t; return [a0 + (a1 - a0) * s, d, ceiling(1, d)]; },
      a1 - a0, Math.hypot(e1 - e0, ceiling(1, e1) - ceiling(1, e0)), [0, 0, -1], plaster)));
  }
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
    stair.push(face((s, t) => [sa0 + width * s, d0, z0 + lift * t], width, lift, [0, -1, 0], boards, {floorOf: nearer}),
      face((s, t) => [sa0 + width * s, d0 + run * t, z1], width, run, [0, 0, 1], boards, {floorOf: nearer}));
    // its plastered side, with the walls: a row a tread high, so the rows run level from tread to tread, weighed as the treads are
    walls.push(face((s, t) => [sa0, d0 + run * s, z1 * t], run, z1, [-1, 0, 0], plaster, {floorOf: nearer, rows: k + 1}));
  }
  walls.push(face((s, t) => [sa0 + width * s, sd1, I.groundCeiling * t], width, I.groundCeiling, [0, 1, 0], plaster));
  const rail = (pt, length, outward) => stair.push(face((s, t) => pt(s, rise + RAIL * t), length, RAIL, outward, dark, {floorOf: nearer}));
  const runD = sd1 - sd0, side = sa0 + RAIL_THICK, front = sd0 + RAIL_THICK;
  rail((s, z) => [sa0, sd0 + runD * s, z], runD, [-1, 0, 0]);                        // along a = 9.6, landing side
  rail((s, z) => [side, front + (sd1 - front) * s, z], sd1 - front, [1, 0, 0]);       // and its stairwell side
  rail((s, z) => [sa0 + width * s, sd0, z], width, [0, -1, 0]);                       // along d = 1.5, landing side
  rail((s, z) => [side + (sa1 - side) * s, front, z], sa1 - side, [0, 1, 0]);         // and its stairwell side
  // its top, and its underside over the stairwell, seen from the flight
  for (const [z, up] of [[rise + RAIL, 1], [rise, -1]]) stair.push(face((s, t) => [sa0 + RAIL_THICK * s, sd0 + runD * t, z], RAIL_THICK, runD, [0, 0, up], dark, {floorOf: nearer}),
    face((s, t) => [side + (sa1 - side) * s, sd0 + RAIL_THICK * t, z], sa1 - side, RAIL_THICK, [0, 0, up], dark, {floorOf: nearer}));
  stair.push(
    face((s, t) => [sa0 + RAIL_THICK * s, sd1, rise + RAIL * t], RAIL_THICK, RAIL, [0, 1, 0], dark, {floorOf: nearer}));   // its end at the top of the flight

  // ── the openings: a pane in each, the painted frames, sills and bars, the casement leaf and the hall's door leaf ──
  // A point of an opening's pane: x along `across`, y along `up` from the centre, `off` metres into the room.
  const at = (o, x, y, off) => o.centre.map((c, i) => c + x * o.across[i] + y * o.up[i] - o.outward[i] * off);
  const inward = o => o.outward.map(v => -v);
  const paneOf = o => sheet(THREE, (s, t) => at(o, (2 * s - 1) * o.half[0], (2 * t - 1) * o.half[1], 0), {outward: inward(o)});
  // A painted rectangle [x0, x1] × [y0, y1] standing `off` into the room, facing it; nothing for an empty one. The joinery stands
  // in the wall's thickness or beyond it, so it is weighed in its opening's room.
  const lit = o => ({place: into(roomOf(o.room))});
  const board = (list, o, [x0, x1], [y0, y1], off) => {
    if (x1 - x0 > 1e-6 && y1 - y0 > 1e-6) list.push(face((s, t) => at(o, x0 + (x1 - x0) * s, y0 + (y1 - y0) * t, off), x1 - x0, y1 - y0, inward(o), dark, lit(o)));
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
    const z = -hy + SILL_THICK, deep = W + SILL, wide = hx + FRAME, edge = (x, sign) => joinery.push(face((s, t) => at(o, x, -hy + SILL_THICK * t, OFF + (deep - OFF) * s), deep - OFF, SILL_THICK, [sign * o.across[0], sign * o.across[1], sign * o.across[2]], dark, lit(o)));
    joinery.push(face((s, t) => at(o, -wide + 2 * wide * s, z, OFF + (deep - OFF) * t), 2 * wide, deep - OFF, [0, 0, 1], dark, lit(o)),
      face((s, t) => at(o, -wide + 2 * wide * s, -hy + SILL_THICK * t, deep), 2 * wide, SILL_THICK, inward(o), dark, lit(o)));
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
    const flat = (pt, lenS, lenT, outward) => slab.push(face(pt, lenS, lenT, outward, dark, {place: into(hall)}));
    flat((s, t) => [x0 + (x1 - x0) * s, d0, z0 + (z1 - z0) * t], x1 - x0, z1 - z0, [0, -1, 0]); flat((s, t) => [x0 + (x1 - x0) * s, d1, z0 + (z1 - z0) * t], x1 - x0, z1 - z0, [0, 1, 0]);
    flat((s, t) => [x0, d0 + (d1 - d0) * s, z0 + (z1 - z0) * t], d1 - d0, z1 - z0, [-1, 0, 0]); flat((s, t) => [x1, d0 + (d1 - d0) * s, z0 + (z1 - z0) * t], d1 - d0, z1 - z0, [1, 0, 0]);
    flat((s, t) => [x0 + (x1 - x0) * s, d0 + (d1 - d0) * t, z0], x1 - x0, d1 - d0, [0, 0, -1]); flat((s, t) => [x0 + (x1 - x0) * s, d0 + (d1 - d0) * t, z1], x1 - x0, d1 - d0, [0, 0, 1]);
  };
  box(hinge[0], hinge[0] + leafWidth, -thick / 2, thick / 2, 0, leafHigh);

  // ── assembly ──
  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };
  // Boards (floors, treads, rail) and plaster (walls, ceilings, the stair's plastered sides and the stairwell's bands), each with its own
  // material, lit or not: plaster's carries its pale base.
  const {surface, plastered, leafed} = made;
  const glass = new THREE.MeshBasicMaterial({color: new THREE.Color().setRGB(...FIRST_SKY, THREE.SRGBColorSpace)});
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
  casementLeaf.material = made.casement;
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
  // The fireplace and the breast above it, built from this file's faces and tints so that they are weighed and tinted as the shell is.
  const fireplace = buildFireplace(THREE, {interior: I, art, light, face, tint, tints: {plaster, boards}, materials: {surface, plastered}});
  scene.add(fireplace.object);
  // A lamp in every room, built from the same tints and materials, weighed by the same field.
  const fittings = buildFittings(THREE, {interior: I, light, field, tints: {plaster, boards}, materials: {surface, plastered}});
  scene.add(fittings.object);
  // The furnished rooms' furniture, from the same faces, tints and materials; any other geometry it makes is weighed by `lit`, in the
  // room it names, as a face is. Rooms listed in `furnishLater` are queued and built one at a time by `buildNext()`.
  const sets = [], setStats = [], builtRooms = [], failedSkipped = [], queuedSets = new Map();
  // Which rooms can be seen from which: built once; if it throws or is malformed, nothing is ever hidden.
  let sightSets = null, shownFrom = null;
  try {
    const table = sight(I);
    if (!table || typeof table !== 'object') throw new Error('sight table is not an object');
    const map = new Map();
    for (const r of I.rooms) {
      const list = table[r.id];
      if (!Array.isArray(list) || !list.includes(r.id)) throw new Error(`malformed sight entry for ${r.id}`);
      map.set(r.id, new Set(list));
    }
    sightSets = map;
  } catch (error) {
    console.warn("The cabin's room sight table could not be built; every room's furniture stays drawn.", error);
  }
  const sees = (from, target) => !sightSets || from == null || !sightSets.has(from) || sightSets.get(from).has(target);
  const showFrom = (roomId = null) => {
    shownFrom = roomId ?? null;
    for (const [room, set] of queuedSets) set.object.visible = sees(shownFrom, room);
  };
  // Every piece passed over so far: one array, replaced only when a build changes it, so a reader can tell by identity that it has.
  let skippedAll = Object.freeze([]);
  const noteSkipped = () => { const all = [...sets.flatMap(s => s.skipped), ...failedSkipped]; if (all.length !== skippedAll.length) skippedAll = Object.freeze(all); };
  let firstSet = null, firstFailed = false, flatMaterials = null, disposed = false;
  const later = Array.isArray(I.furnishLater) && Array.isArray(I.furniture) && I.furniture.length ? [...I.furnishLater] : [];
  const laterSet = new Set(later), queue = [...later];
  const buildSet = (only, name) => {
    const t0 = performance.now(), weigh = coarseWeigh();
    const set = buildFurniture(THREE, {interior: I, art, light, flat: flatMaterials,
      face: (f, across, up, outward, colour, options) => face(f, across, up, outward, colour, {weigh, ...options}),
      lit: (g, room) => weighed(g, into(roomOf(room)), storey, weigh), tint,
      materials: flatMaterials ?? {surface, leafed}, treads: TREADS, recipes, only, name,
      weightsAt: (point, normal, id) => field.weigh(storey(point[2]), into(roomOf(id))(point), normal)});
    return {set, ms: performance.now() - t0};
  };
  try {
    const firstOnly = laterSet.size ? new Set(I.furniture.map(e => e?.room).filter(r => !laterSet.has(r))) : null;
    const {set, ms} = buildSet(firstOnly, 'furniture');
    firstSet = set; sets.push(set); scene.add(set.object);
    const skippedSet = new Set(set.skipped);
    const firstRooms = I.rooms.filter(r => !laterSet.has(r.id) && I.furniture.some(e => e?.room === r.id && !skippedSet.has(e.id))).map(r => r.id);
    setStats.push({rooms: firstRooms, vertices: set.counts.vertices, meshes: set.counts.meshes, ms});
    builtRooms.push(...firstRooms); noteSkipped();
  } catch (error) {
    console.warn("The cabin's furniture could not be built; its rooms stay bare.", error);
    firstFailed = true; queue.length = 0;
  }
  // The added light (the lamps' halos, the flames and the fire's glow), a scene of its own that the view draws after the yard seen
  // through the live panes, into the same target, depth-tested against the rooms and with no stencil: drawn with the rooms it would
  // lie under the views, and a halo in front of a live pane would be cut along the pane's edge. When none of it lies over a live
  // pane the view puts it back with the rooms (overlayWithRooms), which saves a draw.
  const overlay = new THREE.Scene(); overlay.name = 'interior-overlay'; overlay.add(fittings.overlay, fireplace.overlay);
  // Lit, the rooms show a plain daytime until a frame sets its own light; unlit, one even light as before.
  const daytime = interiorDials({interior: I, ...DAYTIME}); fittings.setLight(daytime);
  let lastDials = daytime;
  if (light) light.set(daytime); else scene.add(new THREE.HemisphereLight(SKY, GROUND, LIGHT));
  const buildNext = () => {
    if (disposed || !queue.length) return null;
    const room = queue.shift(), ids = piecesIn(I, [room]);
    if (!ids.length) return room;
    try {
      const {set, ms} = buildSet(new Set([room]), `furniture-${room}`);
      sets.push(set);
      if (set.counts.meshes > 0) {
        queuedSets.set(room, set);
        set.object.visible = sees(shownFrom, room);
        scene.add(set.object);
        setStats.push({rooms: [room], vertices: set.counts.vertices, meshes: set.counts.meshes, ms});
        builtRooms.push(room);
        set.setLight(lastDials);
      }
    } catch (error) {
      console.warn(`The cabin's furniture for ${room} could not be built; it stays bare.`, error);
      failedSkipped.push(...ids);
    }
    noteSkipped();
    return room;
  };
  const buildRest = () => { while (buildNext() !== null) {} };
  const clamp01 = x => Math.min(1, Math.max(0, x));
  // Which of the flat light's materials each of the shell's lit meshes takes when the lit surfaces are given up.
  const FLAT = {floors: 'surface', stair: 'surface', frames: 'surface', ceilings: 'plastered', walls: 'plastered', casement: 'casement', 'door-leaf': 'leafed'};
  // Where the overlay's lit parts lie from `camera` against the live panes' rectangles (`views`, each with its `rect` [u0, v0, u1, v1]
  // on screen, 0–1 from the bottom left): 0 when none is in sight, 1 when some is but over no live pane, 2 when some lies over one.
  // Each part is taken as the box about its bounding sphere, on screen (a sphere about the eye or behind it counts as over every pane).
  // Nothing allocated.
  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), centre = new THREE.Vector3();
  let need = 0, cam = null, rects = null;
  const judge = sphere => {
    if (need === 2 || !frustum.intersectsSphere(sphere)) return;
    centre.copy(sphere.center).applyMatrix4(cam.matrixWorldInverse);
    const depth = -centre.z;
    if (depth <= sphere.radius + cam.near) { need = rects.length ? 2 : 1; return; }
    // (the box about the sphere in the camera's frame, each side taken at the depth that carries it furthest out: the radius at the
    // centre's depth alone falls short of the sphere's outline toward the edges of the screen)
    const r = sphere.radius, k = 1 / Math.tan(cam.fov * Math.PI / 360), far = depth + r, near = depth - r;
    const lo = x => (x - r) / (x - r < 0 ? near : far), hi = x => (x + r) / (x + r > 0 ? near : far), ndc = (x, s) => (x * s + 1) / 2;
    const u0 = ndc(lo(centre.x), k / cam.aspect), u1 = ndc(hi(centre.x), k / cam.aspect), v0 = ndc(lo(centre.y), k), v1 = ndc(hi(centre.y), k);
    need = Math.max(need, rects.some(({rect: q}) => u1 >= q[0] && u0 <= q[2] && v1 >= q[1] && v0 <= q[3]) ? 2 : 1);
  };
  const overlayNeed = (camera, views) => {
    camera.updateMatrixWorld(); frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    need = 0; cam = camera; rects = views; fittings.eachShown(judge); fireplace.eachShown(judge); cam = rects = null;
    return need;
  };
  // Whether the overlay's parts are drawn with the rooms (true: in their scene, as nothing lies over them) or after the views (false).
  let withRooms = false;
  const overlayWithRooms = on => { if (on === withRooms) return; withRooms = on; (on ? scene : overlay).add(fittings.overlay, fireplace.overlay); };
  return {scene, overlay, overlayNeed, overlayWithRooms, field, get lit() { return !!light; },
    // Whether furniture was built and drawn (false for a blueprint with none, as when it failed), its vertex and mesh counts (or null), and for tests a piece's box in the interior frame.
    furnished: !!firstSet && I.furniture.length > 0,
    get pending() { return [...queue]; },
    buildNext, buildRest, showFrom,
    get furnishedRooms() { return [...builtRooms]; },
    get shownRooms() { return builtRooms.filter(r => { const q = queuedSets.get(r); return !q || q.object.visible; }); },
    get furniture() {
      if (firstFailed) return null;
      return {vertices: setStats.reduce((t, s) => t + s.vertices, 0), meshes: setStats.reduce((t, s) => t + s.meshes, 0), sets: setStats.map(s => ({...s, rooms: [...s.rooms]}))};
    },
    pieceBox(id) { for (const s of sets) { const box = s.pieceBox(id); if (box) return box; } return null; },
    // The ids of the pieces passed over (each, and everything set on it; empty when none, or when no furniture was built).
    get skipped() { return skippedAll; },
    // A frame's dials (shared/interior-light.js's interiorDials) into every lit surface at once, and the lamps' glasses (lit or not).
    setLight(dials) { lastDials = dials; light?.set(dials); fittings.setLight(dials); for (const s of sets) s.setLight(dials); },
    // Gives the lit surfaces up for the flat light, as if they could never be made (for a lit program that would not compile on
    // this device, found only once it is first drawn): every lit surface of the shell, the fireplace, the fittings and the furniture takes the
    // Lambert materials and the hemisphere light comes in. The glasses, halos and fire carry on. Once only; nothing when unlit.
    fallBack() {
      if (!light) return;
      const ratio = (unlit, lit) => unlit.map((c, i) => c / lit[i]), flat = lambert({plasterK: ratio(PLASTER, LIT_PLASTER), boardsK: ratio(BOARDS, LIT_BOARDS)});
      flatMaterials = flat;
      for (const [name, kind] of Object.entries(FLAT)) { const m = scene.getObjectByName(name); if (m) m.material = flat[kind]; }
      fireplace.fallBack(flat); fittings.fallBack(flat); for (const s of sets) s.fallBack(flat);
      light.dispose(); light = null;
      scene.add(new THREE.HemisphereLight(SKY, GROUND, LIGHT));
    },
    // The lamps' levels alone, a number per room in interior.rooms order (see fittings.js).
    setLamps: fittings.setLamps,
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
    // The fire's dials for a frame: {fire, embers, seconds, motion} (see fireplace.js); cheap enough for every frame indoors.
    setFire: fireplace.setFire,
    setDoor(open) { doorLeaf.rotation.y = doorTurn * clamp01(open) * DOOR_SWING; },
    dispose() {
      disposed = true; queue.length = 0;
      const materials = new Set(markers.values());
      scene.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
      for (const m of materials) m.dispose();
      fireplace.dispose(); fittings.dispose(); for (const s of sets) s.dispose();
    }};
}
