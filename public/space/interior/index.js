import {ceilingHeight, wallSegments} from '../../../shared/interior.js';
import {mergeGeometries, sheet} from '../geometry.js';
import {noise} from '../scene/noise.js';

// The cabin's interior as a plain shell, its own scene: plastered walls with their openings, board floors, plaster ceilings
// (flat downstairs, following the roof's two slopes upstairs), the stair in its shut-off box, and flat glass in every window
// and the front doorway that takes the sky's horizon colour. Interior [a, d, z] (z up from the ground floor) goes to three
// through toThree, so three x = a, y = up, z = −d. Every face is wound into the rooms and drawn single-sided; an internal
// wall is its two faces, 0.15 m apart, with reveals inside each opening.

// The brushwork tiles every metre and a half, as on the cabin's eaves; sheets are cut finer than this so the vertex tint
// varies smoothly across them. Tints are linear and may pass 1: the brushwork texture is dark (about linear .33) and three's
// Lambert divides the hemisphere light by π. Plaster also glows a pale base of its own, so its strokes are a gentle
// variation on a pale ground rather than camouflage; boards have none and stay darker than the walls.
const BRUSH_TILE = 1.6, STEP = .4, PLASTER = [1.35, 1.2, 1.05], PLASTER_BASE = [.3, .27, .21], BOARDS = [1.4, .97, .65];
// Reveal depth of a roof window, the rail's height and thickness, and the stair's treads.
const ROOF_REVEAL = .15, RAIL = .9, RAIL_THICK = .04, TREADS = 15;
const SKY = 0xf4ead8, GROUND = 0xd9cdb8, LIGHT = 3.1, FIRST_SKY = [.83, .83, .75];
const tint = (base, seed, depth = .08) => p => {
  const k = 1 - depth + 2 * depth * noise((p[0] + p[2] * .6) * .7, (p[1] - p[2] * .4) * .7, seed);
  return base.map(c => c * k);
};
const plaster = tint(PLASTER, 61), boards = tint(BOARDS, 62, .12), dark = tint(BOARDS.map(c => c * .7), 63, .1);
const steps = length => Math.max(1, Math.ceil(length / STEP - 1e-9));

export function buildInterior(THREE, {interior: I, art}) {
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
  // The front door and the wall windows, as holes in their outer walls; each also gets a pane of glass at the wall's outside.
  const outerHoles = [{line: 0, x0: I.door.a - I.door.width / 2, x1: I.door.a + I.door.width / 2, z0: 0, z1: I.doorHead, door: true},
    ...I.windows.filter(w => w.kind === 'wall').map(w => ({line: w.wall === 'front' ? 0 : SD, x0: w.a - w.width / 2, x1: w.a + w.width / 2, z0: w.sill, z1: w.sill + w.height}))];
  const panes = [];
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
        panes.push(face((s, t) => onLine(axis, outside, h.x0 + (h.x1 - h.x0) * s, h.z0 + (h.z1 - h.z0) * t), h.x1 - h.x0, h.z1 - h.z0, n.map(v => v * inward)));
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
    const up = (a, d, t) => [a, d, ceiling(1, d) + ROOF_REVEAL * t], da = h.a1 - h.a0, dd = h.d1 - h.d0;
    ceilings.push(face((s, t) => up(h.a0, h.d0 + dd * s, t), dd, ROOF_REVEAL, [1, 0, 0], plaster), face((s, t) => up(h.a1, h.d0 + dd * s, t), dd, ROOF_REVEAL, [-1, 0, 0], plaster),
      face((s, t) => up(h.a0 + da * s, h.d0, t), da, ROOF_REVEAL, [0, 1, 0], plaster), face((s, t) => up(h.a0 + da * s, h.d1, t), da, ROOF_REVEAL, [0, -1, 0], plaster));
    panes.push(face((s, t) => up(h.a0 + da * s, h.d0 + dd * t, 1), da, dd, [0, 0, -1]));
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

  // ── assembly ──
  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };
  // Boards (floors, treads, rail) and plaster (walls, ceilings, the stair's plastered sides and the stairwell's bands).
  const surface = new THREE.MeshLambertMaterial({map: art.surfaces.hills, vertexColors: true});
  const plastered = new THREE.MeshLambertMaterial({map: art.surfaces.hills, vertexColors: true, emissive: new THREE.Color().setRGB(...PLASTER_BASE, THREE.LinearSRGBColorSpace)});
  const glass = new THREE.MeshBasicMaterial({color: new THREE.Color().setRGB(...FIRST_SKY, THREE.SRGBColorSpace)});
  const scene = new THREE.Scene(); scene.name = 'interior';
  const mesh = (name, list, material) => { const m = new THREE.Mesh(merged(list), material); m.name = name; scene.add(m); };
  mesh('floors', floors, surface); mesh('ceilings', ceilings, plastered); mesh('walls', walls, plastered); mesh('stair', stair, surface); mesh('glass', panes, glass);
  scene.add(new THREE.HemisphereLight(SKY, GROUND, LIGHT));
  return {scene,
    // Display-space sky colours, 0–1, as the yard's setSky receives them; the glass shows the horizon.
    setSky({horizon}) { glass.color.setRGB(...horizon, THREE.SRGBColorSpace); },
    dispose() {
      const materials = new Set();
      scene.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
      for (const m of materials) m.dispose();
    }};
}
