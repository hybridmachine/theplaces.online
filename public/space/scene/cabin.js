import {terrainHeight} from '../../../shared/space.js';
import {PROUD, cabinFrame} from '../../../shared/lakeside-dressing.js';
import {lifeLayout} from '../../../shared/lakeside-life.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {basis, cardBatch, cardMaterial, mergeGeometries, sheet, toThree, V} from '../geometry.js';
import {clamp01, hash, lin, noise, stream} from './noise.js';

// The cabin in paint: stone walls a little out of true under an overhanging, sagging slate roof, a chimney, the door and
// windows as panels just proud of the wall, dark eave boards and soffits under the overhang, dabs breaking the roof's edges
// and the corners, and shrubs at its foot.
// Every wall, chimney, board and soffit face is wound outward and drawn single-sided; only the roof (its overhang is seen from
// below) and the casement leaf are two-sided; so is the front door, seen from either side once it swings in. World axes x east, y north, z up, metres; three is passed in. Local axes: `a` along the long axis, `b` across it.

// The eaves carry the hills' loose brushwork (no joints in it) under their own dark colour.
const BRUSH_TILE = 1.6, UNDER_ROOF = .03, FASCIA = .12, STONE_TILE = SPACE_ART.surfaces.stone.metres;
const STONE = lin([182, 156, 108]), SLATE = lin([128, 126, 124]);
// The casement leaf runs from the window's outer edge to its first glazing bar, as the window panel is painted (a 22 px frame and
// bars at thirds of the 212 px between, on 256 px), stands this far proud of the panel, and behind it the opening shows the middle
// pane's glass, stretched, so the room's light shows through without bars.
const LEAF = (22 + 212 / 3) / 256, LEAF_PROUD = .012, PANE = [.42, .42, .58, .58];
// The front door opens inward this far (radians), over a doorway of this flat dark tone (linear), which warms toward WARM_DOORWAY as
// the hall's lamp is lit (setDoorway; only with the interior on).
const DOOR_SWING = 1.45;
export const DOORWAY = [.035, .03, .025], WARM_DOORWAY = [.1, .042, .009];
// With the interior on, the doorway's tone is shaded by height so the recess reads as a lit space and not a flat card: times
// DOORWAY_LOW at its floor (warmest), falling to DOORWAY_HIGH at its head.
const DOORWAY_LOW = [1.3, 1.15, .95], DOORWAY_HIGH = [.5, .47, .47];
// The doorway is cut this far inside the door leaf all round, so the shut leaf covers it; it is lined with stone this deep (the
// wall's thickness) and then dark back to a backing this far in, past the open leaf's free edge, over a floor this far above the ground.
const HOLE_INSET = .03, REVEAL = .3, RECESS = 1.2, RECESS_FLOOR = .03;
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

  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };

  // ── the doorway: a hole in the door's wall a little inside the door leaf, so the shut leaf covers it, lined with stone
  // for the wall's depth and then dark back to a backing deeper than the door is wide, so the leaf swings into it in sight ──
  const {door} = dressing.cabin, doorSide = (door.face === 'back' ? -1 : 1) * front, wallTop = a => roofZ(a, doorSide * W) - UNDER_ROOF;
  const hole = {a0: door.along - door.width / 2 + HOLE_INSET, a1: door.along + door.width / 2 - HOLE_INSET, head: doorGround + door.height - HOLE_INSET};
  // A point `d` metres in from the door's wall surface; the recess floor keeps a little above the ground inside, never below the threshold.
  const recessPoint = (a, d, z) => wallPoint(doorSide, true, a, doorSide * W, z, -d);
  const floorZ = (a, d) => { const p = recessPoint(a, d, doorGround); return Math.max(doorGround, terrainHeight(space, p[0], p[1]) + RECESS_FLOOR); };
  const sill = a => floorZ(Math.min(hole.a1, Math.max(hole.a0, a)), 0);
  const outward = V.scale(v, doorSide);

  // ── walls: two long faces to the eaves and two gables to just under the roof; the door's wall has its hole ──
  const walls = [];
  // The door's wall is one grid whose lines run round the hole, with the hole's cells left out; its texture coordinates are
  // those of the whole wall as one 24 × 12 sheet (metres along each row from the wall's end, and up each column), so the stone
  // lies as it would without the hole.
  const frontAt = (a, t) => wallPoint(doorSide, true, a, doorSide * W, base + (wallTop(a) - base) * t);
  const stoneUV = (a, z) => {
    const t = (z - base) / (wallTop(a) - base), step = 2 * L / 24, n = Math.min(24, Math.ceil((a + L) / step - 1e-9));
    let x = 0, y = 0, p = frontAt(-L, t);
    for (let i = 1; i <= n; i++) { const q = frontAt(Math.min(a, -L + i * step), t); x += V.len(V.sub(q, p)); p = q; }
    p = frontAt(a, 0);
    for (let j = 1, m = Math.ceil(t * 12 - 1e-9); j <= m; j++) { const q = frontAt(a, Math.min(t, j / 12)); y += V.len(V.sub(q, p)); p = q; }
    return [x / STONE_TILE, y / STONE_TILE];
  };
  const doorWall = () => {
    const cols = [...Array.from({length: 11}, (_, i) => -L + (hole.a0 + L) * i / 11), ...Array.from({length: 4}, (_, i) => hole.a0 + (hole.a1 - hole.a0) * i / 4),
      ...Array.from({length: 12}, (_, i) => hole.a1 + (L - hole.a1) * i / 11)];
    // Rows from the base to the sill, the sill to the head, and the head to the eaves.
    const bands = [[4, a => base, sill], [7, sill, () => hole.head], [2, () => hole.head, wallTop]], rows = [];
    for (const [n, lo, hi] of bands) for (let j = rows.length ? 1 : 0; j <= n; j++) rows.push(a => lo(a) + (hi(a) - lo(a)) * j / n);
    const ns = cols.length - 1, nt = rows.length - 1, point = (s, t) => { const a = cols[Math.round(s * ns)]; return frontAt(a, (rows[Math.round(t * nt)](a) - base) / (wallTop(a) - base)); };
    const g = sheet(THREE, point, {ns, nt, tile: STONE_TILE, outward, colour: stoneTint});
    const uv = g.getAttribute('uv'), index = g.index.array, keep = [];
    for (let k = 0; k < uv.count; k++) { const a = cols[k % (ns + 1)]; uv.setXY(k, ...stoneUV(a, rows[Math.floor(k / (ns + 1))](a))); }
    for (let k = 0; k < index.length; k += 6) {
      const i = (k / 6) % ns, j = Math.floor(k / 6 / ns);
      if (!(i >= 11 && i < 15 && j >= 4 && j < 11)) keep.push(...index.slice(k, k + 6));
    }
    g.setIndex(keep); g.computeVertexNormals();
    return g;
  };
  // The hole's stone sides and head, as deep as the wall, and its dark sides, top, floor and backing behind them.
  const jamb = (a, d0, d1) => (s, t) => { const d = d0 + (d1 - d0) * s, z = floorZ(a, d); return recessPoint(a, d, z + (hole.head - z) * t); };
  const reveals = [], recess = [];
  for (const [a, facing] of [[hole.a0, u], [hole.a1, V.scale(u, -1)]]) {
    reveals.push(sheet(THREE, jamb(a, 0, REVEAL), {ns: 2, nt: 8, tile: STONE_TILE, outward: facing, colour: stoneTint}));
    recess.push(sheet(THREE, jamb(a, REVEAL, RECESS), {ns: 2, nt: 2, outward: facing}));
  }
  const ceiling = (d0, d1) => (s, t) => recessPoint(hole.a0 + (hole.a1 - hole.a0) * s, d0 + (d1 - d0) * t, hole.head);
  reveals.push(sheet(THREE, ceiling(0, REVEAL), {ns: 4, nt: 2, tile: STONE_TILE, outward: [0, 0, -1], colour: stoneTint}));
  recess.push(sheet(THREE, ceiling(REVEAL, RECESS), {ns: 2, nt: 2, outward: [0, 0, -1]}),
    sheet(THREE, (s, t) => { const a = hole.a0 + (hole.a1 - hole.a0) * s, d = RECESS * t; return recessPoint(a, d, floorZ(a, d)); }, {ns: 6, nt: 6, outward: [0, 0, 1]}),
    sheet(THREE, (s, t) => { const a = hole.a0 + (hole.a1 - hole.a0) * s, z = floorZ(a, RECESS); return recessPoint(a, RECESS, z + (hole.head - z) * t); }, {ns: 2, nt: 2, outward}));
  walls.push(doorWall(), ...reveals);
  for (const side of [-1, 1]) {
    if (side !== doorSide) walls.push(sheet(THREE, (s, t) => { const a = -L + 2 * L * s, b = side * W; return wallPoint(side, true, a, b, base + (roofZ(a, b) - UNDER_ROOF - base) * t); },
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

  // ── the door and windows: panels following the wall's surface, just proud of it, textured edge to edge. The back window
  // is a plain dark panel; each front window has its own material mixing the dark panel with the lit one by its room's light,
  // and the main room's has its casement leaf as a separate two-sided mesh hinged on its outer edge ──
  const {windows} = dressing.cabin, cottage = lifeLayout(space, dressing).cottage;
  const openings = new THREE.Group(); openings.name = 'openings';
  const panelMaterials = {door: new THREE.MeshLambertMaterial({map: art.panels.door, side: THREE.DoubleSide}), window: new THREE.MeshLambertMaterial({map: art.panels.window})};
  // The lit panel is emitted, so lamplight is the same by day or night; the dark panel is lit by the scene and fades as the room lights.
  const litMaterial = (side = THREE.FrontSide) => new THREE.MeshLambertMaterial({map: art.panels.window, emissiveMap: art.panels.windowLit, emissive: 0xffffff, emissiveIntensity: 0, side});
  const roomOf = Object.fromEntries(Object.entries(cottage.rooms).map(([room, id]) => [id, room]));
  const lit = Object.fromEntries(Object.values(cottage.rooms).map(id => [id, litMaterial()]));
  // Part of a panel: s from s0 to s1 of its width, `off` metres proud of the wall, with texture coordinates [u0, v0, u1, v1] over that part.
  const panelSheet = (face, along, z0, width, height, {s0 = 0, s1 = 1, off = PROUD, uvRect = [s0, 0, s1, 1]} = {}) => {
    const side = (face === 'back' ? -1 : 1) * front, ns = 4, nt = 4, at = (s, t) => wallPoint(side, true, along + (s0 + (s1 - s0) * s - .5) * width * side, side * W, z0 + height * t, off);
    const g = sheet(THREE, at, {ns, nt, outward: V.scale(v, side)}), uv = g.getAttribute('uv'), [u0, v0, u1, v1] = uvRect;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * (i % (ns + 1)) / ns, v0 + (v1 - v0) * Math.floor(i / (ns + 1)) / nt);
    return {g, at, side};
  };
  const panel = (name, geometry, material) => { const m = new THREE.Mesh(geometry, material); m.name = name; openings.add(m); return m; };
  // The threshold height (doorGround) comes from cabinFrame, as do the panel positions the life layout anchors to.
  // The door is a leaf hinged on one edge over the dark recess cut into the wall, which the shut door covers; built about its
  // hinge as the casement is, it swings the other way, in.
  const doorway = panel('doorway', merged(recess), new THREE.MeshBasicMaterial({color: new THREE.Color(...DOORWAY)}));
  // Its shading by height, carried in its vertex colours and used only once the interior sets its tone (setDoorway).
  { const p = doorway.geometry.getAttribute('position'), c = doorway.geometry.getAttribute('color'), [z0, z1] = [doorGround, hole.head];
    for (let i = 0; i < p.count; i++) { const t = clamp01((p.getY(i) - z0) / (z1 - z0)) ** .8; c.setXYZ(i, ...DOORWAY_LOW.map((v, k) => v + (DOORWAY_HIGH[k] - v) * t)); } }
  const frontDoor = (() => {
    const {g, at, side} = panelSheet(door.face, door.along, doorGround - .03, door.width, door.height + .03);
    const [h0, h1, free] = [at(0, 0), at(0, 1), at(1, .5)].map(p => new THREE.Vector3(...toThree(p)));
    g.translate(-h0.x, -h0.y, -h0.z);
    const axis = h1.clone().sub(h0).normalize(), out = new THREE.Vector3(...toThree(V.scale(v, side)));
    const turn = axis.clone().cross(free.clone().sub(h0)).dot(out) >= 0 ? -1 : 1; // the way that takes the free edge in from the wall
    const mesh = new THREE.Mesh(g, panelMaterials.door); mesh.name = 'door'; mesh.position.copy(h0);
    doorway.add(mesh);
    return {mesh, axis, turn};
  })();
  // How far the front door stands open, 0 shut to 1 open.
  const setDoor = open => frontDoor.mesh.quaternion.setFromAxisAngle(frontDoor.axis, frontDoor.turn * clamp01(open) * DOOR_SWING);
  setDoor(0);
  // How far the doorway's tone has warmed with the hall's lamp, 0 dark to 1 lit.
  // By the level squared, so the hall's night lamp burning low gives only a dim warm tone.
  // The first call (only ever made with the interior on) turns its shading by height on.
  const setDoorway = level => {
    if (!doorway.material.vertexColors) { doorway.material.vertexColors = true; doorway.material.needsUpdate = true; }
    const k = clamp01(Number.isFinite(level) ? level : 0) ** 2; doorway.material.color.setRGB(...DOORWAY.map((c, i) => c + (WARM_DOORWAY[i] - c) * k));
  };
  let leaf = null;
  for (const w of windows) {
    const name = `window-${w.id}`, z0 = doorGround + w.sill, material = lit[w.id] ?? panelMaterials.window;
    if (w.id !== cottage.casement.window) { panel(name, panelSheet(w.face, w.along, z0, w.width, w.height).g, material); continue; }
    const rest = panelSheet(w.face, w.along, z0, w.width, w.height, {s0: LEAF}).g, opening = panelSheet(w.face, w.along, z0, w.width, w.height, {s1: LEAF, uvRect: PANE}).g;
    const host = panel(name, merged([rest, opening]), material);
    // The leaf, built about its hinge (its outer edge, s = 0), so turning the mesh about the hinge's line swings it.
    const {g, at, side} = panelSheet(w.face, w.along, z0, w.width, w.height, {s1: LEAF, off: PROUD + LEAF_PROUD});
    const [h0, h1, free] = [at(0, 0), at(0, 1), at(1, .5)].map(p => new THREE.Vector3(...toThree(p)));
    g.translate(-h0.x, -h0.y, -h0.z);
    const axis = h1.clone().sub(h0).normalize(), out = new THREE.Vector3(...toThree(V.scale(v, side)));
    const turn = axis.clone().cross(free.clone().sub(h0)).dot(out) >= 0 ? 1 : -1; // the way that takes the free edge out from the wall
    const mesh = new THREE.Mesh(g, litMaterial(THREE.DoubleSide)); mesh.name = 'casement'; mesh.position.copy(h0);
    host.add(mesh);
    leaf = {mesh, axis, turn};
  }
  // Each room's light (0–1) and how far the casement stands open (0–1), from the shared cottage.
  const setCottage = ({main = 0, second = 0, open = 0} = {}) => {
    const value = {main, second}, set = (material, k) => { k = clamp01(k); material.color.setScalar(1 - k); material.emissiveIntensity = k; };
    for (const [id, material] of Object.entries(lit)) set(material, value[roomOf[id]]);
    if (!leaf) return;
    set(leaf.mesh.material, value[roomOf[cottage.casement.window]]);
    leaf.mesh.quaternion.setFromAxisAngle(leaf.axis, leaf.turn * clamp01(open) * cottage.casement.maxAngle);
  };

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
  const object = new THREE.Group(); object.name = 'cabin';
  // The building itself, apart from the shrubs at its foot: seen from indoors through a window the building is hidden (it would
  // stand in the way), while the shrubs, which stand out past the walls, are part of the yard that is seen.
  const building = new THREE.Group(); building.name = 'building';
  building.add(mesh('walls', merged(walls), stone),
    mesh('roof', merged(roof), new THREE.MeshLambertMaterial({map: art.surfaces.slate, vertexColors: true, side: THREE.DoubleSide})),
    mesh('eaves', merged([...boards, ...soffits]), new THREE.MeshLambertMaterial({map: art.surfaces.hills, vertexColors: true})),
    mesh('chimney', merged(stack), stone), openings, mesh('dabs', dabs.geometry(THREE), cards));
  object.add(building, mesh('shrubs', shrubs.geometry(THREE), cards));
  setCottage({});
  return {object, building, setCottage, setDoor, setDoorway, dispose() {
    const materials = new Set();
    object.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
    for (const m of materials) m.dispose();
  }};
}
