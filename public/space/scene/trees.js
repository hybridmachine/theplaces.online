import {terrainHeight} from '../../../shared/space.js';
import {oakPlan, woodsPlan} from '../../../shared/lakeside-dressing.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {basis, cardBatch, cardMaterial, mergeGeometries, sheet, tube, V} from '../geometry.js';

// The old oak and the woods beyond the wall, in paint. The oak is a forked, tapering trunk wound outward and drawn single-sided,
// limbs and twigs as bark tubes, and its clumps as fixed leaf cards in one merged mesh; the woods are soft masses of fixed
// cards that pale and cool with distance. Cards never turn to face the camera. World axes x east, y north, z up, metres.

const TAU = 2 * Math.PI, DEG = Math.PI / 180;
const clamp01 = t => Math.max(0, Math.min(1, t));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// Seeded value noise in [0, 1] (as in ground.js), and a seeded stream of numbers in [0, 1).
const hash = (i, j, seed) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const noise = (x, y, seed) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const stream = seed => { let n = 0; return () => hash(n++, 23, seed); };
// The side the painting is lit from: over the lake, east-south-east.
const SUN = [Math.sin(115 * DEG), Math.cos(115 * DEG), 0];
// The trunk keeps this far inside its collider (space.colliders' circle) up to above head height.
const TRUNK_CLEAR = .12;

// A point and radius `f` of the way along a polyline of [x, y, z, radius], by length.
function along(points, f) {
  const lens = points.slice(1).map((p, k) => V.len(V.sub(p.slice(0, 3), points[k].slice(0, 3)))), total = lens.reduce((s, l) => s + l, 0);
  let d = clamp01(f) * total, k = 0;
  while (k < lens.length - 1 && d > lens[k]) d -= lens[k++];
  const t = lens[k] ? d / lens[k] : 0;
  return points[k].map((v, i) => v + (points[k + 1][i] - v) * t);
}
// A polyline smoothed through its points (Catmull–Rom), `steps` pieces per span.
function smooth(points, steps = 4) {
  const out = [], n = points.length, P = k => points[Math.max(0, Math.min(n - 1, k))];
  for (let k = 0; k < n - 1; k++) for (let s = 0; s < steps; s++) {
    const t = s / steps, t2 = t * t, t3 = t2 * t, [a, b, c, d] = [P(k - 1), P(k), P(k + 1), P(k + 2)];
    out.push(b.map((_, i) => .5 * (2 * b[i] + (c[i] - a[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t2 + (3 * b[i] - a[i] - 3 * c[i] + d[i]) * t3)));
  }
  out.push(points[n - 1]);
  return out;
}

export function buildOak(THREE, {space, dressing, art}) {
  const plan = oakPlan(space, dressing), [ox, oy] = space.oak.position, g = terrainHeight(space, ox, oy), r = stream(dressing.seed + 21);
  const collider = space.colliders.find(c => c.type === 'circle')?.radius ?? space.oak.radius, low = g + space.eyeHeight + .8;

  // ── trunk: rings around the planned centreline, lobed and fluted like old oak, a second leader forking off to the north-west ──
  const barkTint = p => {
    const h = clamp01((p[2] - g) / 3.5), north = clamp01((p[1] - oy) / 1.2 + .4) * (1 - h);
    const n = .82 + .3 * noise(p[2] * 1.3, Math.atan2(p[0] - ox, p[1] - oy) * 2, 51);
    return mix([1.25, 1.18, 1.0].map(c => c * n * (.78 + .32 * h)), [1.0, 1.12, .6], .45 * north * noise(p[0] * 3, p[2] * 2, 52));
  };
  const lobed = (points, seed, clear) => {
    const ns = 22, nt = Math.max(8, Math.round(V.len(V.sub(points.at(-1), points[0])) * 3));
    return sheet(THREE, (s, t) => {
      const c = along(points, t), a = s * TAU, dir = [Math.sin(a), Math.cos(a), 0];
      // flutes that wander as they climb, swelling toward the root
      const flute = .07 * Math.sin(5 * a + c[2] * .35 + seed) + .05 * (noise(a * 1.6 + seed, c[2] * .8, 53) - .5) + .1 * clamp01(1 - (c[2] - g) / 1.2);
      let rad = c[3] * (1 + flute);
      if (clear && c[2] < low) rad = Math.min(rad, collider - TRUNK_CLEAR - Math.hypot(c[0] - ox, c[1] - oy));
      return V.add(c.slice(0, 3), dir, rad);
    }, {ns, nt, tile: SPACE_ART.surfaces.bark.metres, outward: p => { const c = along(points, clamp01((p[2] - points[0][2]) / (points.at(-1)[2] - points[0][2]))); return V.norm([p[0] - c[0], p[1] - c[1], 0]); }, colour: barkTint});
  };
  const main = plan.trunk, fork = [along(main, .3).slice(0, 3).concat(.36), [ox - .7, oy + .55, g + 4.8, .32], [ox - 1.5, oy + 1.0, g + 6.8, .2], [ox - 2.1, oy + 1.2, g + 8.6, .05]];
  const trunkParts = [lobed(smooth(main), 0, true), lobed(smooth(fork), 2.3, false)];

  // ── limbs: each planned limb smoothed, with twigs out to every clump it carries and finer ones through the leaves ──
  const limbParts = [], twigs = [];
  for (const limb of plan.limbs) {
    // each limb starts on the trunk's axis a little below where it leaves, so it grows out of the bark with no open end showing
    const [b] = limb.points, axis = along(main, clamp01((b[2] - .25 - main[0][2]) / (main.at(-1)[2] - main[0][2])));
    limbParts.push(tube(THREE, smooth([[axis[0], axis[1], b[2] - .25, b[3] * .9], ...limb.points]), {sides: 9, tile: SPACE_ART.surfaces.bark.metres}));
    for (const clump of plan.clumps.filter(c => c.limb === limb.id)) {
      const from = along(limb.points, .62 + r() * .2), to = V.add(clump.center, [0, 0, -.25 * clump.radius]);
      const mid = V.add(V.scale(V.add(from.slice(0, 3), to), .5), [0, 0, .3]);
      twigs.push(tube(THREE, smooth([from.slice(0, 3).concat(Math.min(from[3], .11)), mid.concat(.06), to.concat(.025)], 3), {sides: 5}));
      for (let k = 0; k < 3; k++) {
        const a = r() * TAU, out = clump.radius * (.6 + r() * .4), end = V.add(to, [Math.sin(a) * out, Math.cos(a) * out, (r() - .3) * .8]);
        twigs.push(tube(THREE, [to.concat(.03), V.add(V.scale(V.add(to, end), .5), [0, 0, .15]).concat(.02), end.concat(.008)], {sides: 4}));
      }
    }
  }

  // ── leaves: every clump a loose, flattened, lobed spray of fixed cards in several directions, lit from above and the sun side ──
  const cells = SPACE_ART.cards.cells.oak, leaves = cardBatch(SPACE_ART), clumps = [];
  const zs = plan.clumps.map(c => c.center[2]), zLow = Math.min(...zs) - 1.5, zHigh = Math.max(...zs) + 1.5, crown = [ox, oy, (zLow + zHigh) / 2];
  plan.clumps.forEach((clump, i) => {
    const start = leaves.count, R = clump.radius;
    // the spray runs outward from the trunk, so neighbouring clumps reach toward each other rather than rounding off
    const out = V.norm([clump.center[0] - ox, clump.center[1] - oy, 0]), side = [-out[1], out[0], 0], seed = hash(i, 0, 61) * 1000;
    const n = Math.round(10 + R * 10);
    let k = 0;
    for (let guard = 0; k < n && guard < n * 20; guard++) {
      // a point in a flattened, stretched ellipsoid, weighted to the shell, holed where the noise is low so sky shows through
      const u = r() * TAU, w = Math.acos(2 * r() - 1), f = Math.sqrt(.25 + .75 * r());
      const local = [Math.sin(w) * Math.cos(u) * f, Math.sin(w) * Math.sin(u) * f, Math.cos(w) * f];
      if (noise(local[0] * 2.2 + seed, local[1] * 2.2 + local[2] * 1.7, 62) < .3 + .25 * f) continue;
      // the outer edge of a spray droops, as an old oak's lower boughs do
      const c = V.add(V.add(V.add(clump.center, out, local[0] * R * 1.35), side, local[1] * R * 1.1), [0, 0, (local[2] * .5 - .25 * Math.max(0, local[0])) * R]);
      // half the cards stand (facing outward, give or take), the rest lie tilted so the clump has body from beneath
      let normal, up;
      if (k % 2 === 0) {
        // facing outward within ±40°, and tipped toward the ground so a visitor below never sees one edge-on
        const a = Math.atan2(c[0] - ox, c[1] - oy) + (r() - .5) * 1.4, tilt = -(.4 + r() * .45);
        normal = V.norm([Math.sin(a) * Math.cos(tilt), Math.cos(a) * Math.cos(tilt), Math.sin(tilt)]);
        const [right, up0] = basis(normal), turn = (r() - .5) * .5; up = V.add(V.scale(up0, Math.cos(turn)), right, Math.sin(turn));
      } else {
        const a = r() * TAU, tilt = (15 + r() * 30) * DEG;
        normal = V.norm([Math.sin(a) * Math.sin(tilt), Math.cos(a) * Math.sin(tilt), Math.cos(tilt)]);
        up = basis(normal)[r() < .5 ? 0 : 1];
      }
      const across = V.norm(V.cross(up, normal)), size = .75 + r() * .5;
      // lighter and warmer up top and on the sun side, darker and cooler beneath and deep inside
      const h = clamp01((c[2] - zLow) / (zHigh - zLow)), sun = V.dot(out, SUN), depth = 1 - f, under = clamp01(-local[2]);
      const k0 = (.86 + .26 * h + .1 * sun) * (1 - .2 * depth) * (1 - .2 * under) * (.94 + r() * .12);
      const top = mix([k0 * .88, k0 * .96, k0 * 1.0], [k0 * 1.04, k0 * 1.0, k0 * .82], clamp01(h + .3 * sun));
      leaves.add(c, V.scale(across, size), V.scale(up, size), cells[Math.floor(r() * cells.length)], top.map(v => v * .8), top,
        V.norm(V.add(V.norm(V.sub(c, crown)), [0, 0, .7])), r() < .5);
      k++;
    }
    if (k < n) throw new Error(`oak clump ${clump.id} placed only ${k} of ${n} leaf cards`);
    clumps.push({id: clump.id, start, count: leaves.count - start});
  });

  const bark = new THREE.MeshLambertMaterial({map: art.surfaces.bark, vertexColors: true});
  const mesh = (name, geometry, material) => { const m = new THREE.Mesh(geometry, material); m.name = name; return m; };
  const merged = list => { const geometry = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return geometry; };
  const leafMesh = mesh('leaves', leaves.geometry(THREE), cardMaterial(THREE, art.cards, SPACE_ART));
  // Each clump's cards, for swaying it later: `start` and `count` are in cards (4 vertices and 6 indices per card), in build order.
  leafMesh.userData.clumps = clumps;
  const object = new THREE.Group(); object.name = 'oak';
  // the limbs take the trunk's tint, so the bark runs on unbroken where they leave it
  const limbs = merged([...limbParts, ...twigs]), lp = limbs.getAttribute('position'), lc = limbs.getAttribute('color');
  for (let i = 0; i < lp.count; i++) lc.setXYZ(i, ...barkTint([lp.getX(i), -lp.getZ(i), lp.getY(i)]));
  object.add(mesh('trunk', merged(trunkParts), bark), mesh('limbs', limbs, bark), leafMesh);
  return {object, dispose: () => disposeAll(object)};
}

// The woods: a tree line seen across the wall, built from wide cards of the `woods` cells (each a broad mass with a feathered
// top) standing in the three planned rows. Every card spans several metres and overlaps its neighbours by well over a third,
// so no single crown's outline survives; a row shares one height range (the back row taller, paler and bluer, the front row
// lower and darker) that swells and dips only slowly along the band, so nothing stands clear of it. The cards are fixed in the
// world at varied yaw so they never line up into one flat screen, and the three rows give the band depth seen along it. (Cards
// standing across the rows were tried and dropped: seen edge-on from the yard they drew as thin poles.)
const WOODS_ROWS = [{offset: 8, top: 6.4, haze: 0, shade: .95}, {offset: 14, top: 7.6, haze: .2, shade: 1}, {offset: 20, top: 8.8, haze: .4, shade: 1.03}];
// The share of a woods card's height its mass fills below the feathered top line (from the cell's painting).
const WOODS_MASS = .6;

export function buildWoods(THREE, {space, dressing, art}) {
  const plan = woodsPlan(space, dressing), cells = SPACE_ART.cards.cells, cards = cardBatch(SPACE_ART), w = space.wall;
  const SAGE = [1.22, 1.3, 1.12], MOSS = [1.24, 1.28, .9], FAR = [1.6, 1.72, 1.85];
  // the nearest wall edge to a point: its direction, the normal into the yard, and how far beyond it the point is
  const area = w.reduce((s, p, k) => s + p[0] * w[(k + 1) % w.length][1] - w[(k + 1) % w.length][0] * p[1], 0);
  const nearestEdge = ([x, y]) => w.map((a, i) => {
    const b = w[(i + 1) % w.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const t = clamp01(((x - a[0]) * d[0] + (y - a[1]) * d[1]) / len), dist = Math.hypot(x - a[0] - d[0] * t * len, y - a[1] - d[1] * t * len);
    return {d, inward: area > 0 ? [-d[1], d[0]] : [d[1], -d[0]], dist};
  }).reduce((m, e) => e.dist < m.dist ? e : m);
  const card = (centre, along, inward, half, height, row, i, k) => {
    const ground = Math.min(...[-1, 0, 1].map(f => terrainHeight(space, centre[0] + along[0] * half * f, centre[1] + along[1] * half * f)));
    const hh = height / WOODS_MASS / 2, base = mix(mix(SAGE, MOSS, noise(centre[0] * .08, centre[1] * .08, 71)), FAR, row.haze).map(v => v * row.shade);
    cards.add([centre[0], centre[1], ground - .4 + hh], [along[0] * half, along[1] * half, 0], [0, 0, hh], cells.woods[(i + k) % 2],
      base.map(v => v * .82), base, V.norm([inward[0], inward[1], 1]), hash(i, k, 75) < .5);
  };
  plan.forEach((clump, i) => {
    const [x, y] = clump.center, edge = nearestEdge([x, y]);
    const row = WOODS_ROWS.reduce((m, r) => Math.abs(r.offset - edge.dist) < Math.abs(m.offset - edge.dist) ? r : m);
    const yaw = (hash(i, 1, 74) - .5) * .7, along = [edge.d[0] * Math.cos(yaw) - edge.d[1] * Math.sin(yaw), edge.d[0] * Math.sin(yaw) + edge.d[1] * Math.cos(yaw)];
    const height = row.top * (.84 + .3 * noise(x / 26, y / 26, 76) + .06 * hash(i, 2, 74)), half = 7 + 2 * hash(i, 3, 74);
    card([x, y], along, edge.inward, half, height, row, i, 0);
  });
  const object = new THREE.Group(); object.name = 'woods';
  const masses = new THREE.Mesh(cards.geometry(THREE), cardMaterial(THREE, art.cards, SPACE_ART)); masses.name = 'masses';
  object.add(masses);
  return {object, dispose: () => disposeAll(object)};
}

function disposeAll(object) {
  const materials = new Set();
  object.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
  for (const m of materials) m.dispose();
}
