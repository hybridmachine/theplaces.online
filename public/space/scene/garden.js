import {gardenPlan} from '../../../shared/lakeside-dressing.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {basis, cardBatch, cardMaterial, mergeGeometries, sheet, tube, V} from '../geometry.js';
import {hash, noise, stream} from './noise.js';

// The kitchen garden: two raised beds of weathered boards filled with dark soil, and in them corn, a teepee of bean poles and
// staked tomatoes (gardenPlan). Boards, stalks, poles and stakes are solid, in the bark's paint with the grain run along them;
// every leaf, tassel, ear, flower and fruit is a fixed card cut from the atlas's neutral dabs and tinted, leaning with the
// yard's wind. World axes x east, y north, z up, metres; three is passed in.

const LIP = .05, TAU = 2 * Math.PI, UP = [0, 0, 1];
// The dab's stroke fills this much of its square cell, across and up, so a card is sized by the stroke it shows.
const STROKE = [.85, .36];
// Linear colours. The bark's paint is dark, so what borrows it is tinted above 1: boards silvered, poles pale, stalks green.
const BOARD = [1.9, 1.75, 1.5], POLE = [2.1, 1.85, 1.45], STALK = [1.2, 2.3, .9], VINE = [1.0, 1.7, .8], SOIL = [.5, .42, .36];
const CORN = [.4, .52, .12], BEAN = [.22, .37, .08], TOMATO = [.16, .29, .07], STRAW = [.85, .74, .42], EAR = [.6, .66, .2], BLOSSOM = [.95, .93, .85];
const FRUIT = [[.78, .12, .07], [.72, .1, .06], [.8, .3, .08], [.5, .55, .16]];
const shade = (c, k) => c.map(x => x * k);

export function buildGarden(THREE, {space, dressing, art}) {
  const plan = gardenPlan(space, dressing), th = dressing.garden.board, tile = SPACE_ART.surfaces.bark.metres;
  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };
  const tinted = (g, colour) => { const c = g.getAttribute('color'); for (let i = 0; i < c.count; i++) c.setXYZ(i, ...colour); return g; };

  // ── the beds: four boards a side seen from outside, their inner faces above the soil, their top edges, and the soil ──
  const boards = [], soil = [];
  for (const bed of plan.beds) {
    const u = [Math.sin(bed.yaw), Math.cos(bed.yaw), 0], v = [Math.cos(bed.yaw), -Math.sin(bed.yaw), 0], [l, w] = bed.half, lip = bed.top + LIP;
    const at = (a, b, z) => [bed.center[0] + a * u[0] + b * v[0], bed.center[1] + a * u[1] + b * v[1], z];
    // two planks deep, each its own weathered tone, darker toward the ground and in slow patches along its length
    const tone = k => p => shade(BOARD, k * (.8 + .35 * noise(p[0] * 1.7 + k * 40, p[1] * 1.7 + p[2] * .6, 61))), plank = tone(1), seam = bed.top - .1;
    // `s` runs up the board and `t` along it, so the bark's streaks lie along the plank as grain
    const face = (a0, b0, a1, b1, z0, z1, outward, colour = plank) => boards.push(sheet(THREE, (s, t) => at(a0 + (a1 - a0) * t, b0 + (b1 - b0) * t, z0 + (z1 - z0) * s),
      {nt: 6, tile, outward, colour}));
    // outside, each side shows two planks, the lower one darker and running into the ground
    const outer = (a0, b0, a1, b1, outward) => { face(a0, b0, a1, b1, bed.base, seam, outward, tone(.82)); face(a0, b0, a1, b1, seam, lip, outward); };
    for (const side of [-1, 1]) {
      outer(-l, side * w, l, side * w, V.scale(v, side)); outer(side * l, -w, side * l, w, V.scale(u, side));
      face(-l + th, side * (w - th), l - th, side * (w - th), bed.top - .03, lip, V.scale(v, -side));
      face(side * (l - th), -w + th, side * (l - th), w - th, bed.top - .03, lip, V.scale(u, -side));
      // the top edges: the long boards run the bed's whole length, the end boards fit between them
      boards.push(sheet(THREE, (s, t) => at(-l + 2 * l * t, side * (w - th * s), lip), {nt: 6, tile, outward: UP, colour: p => shade(plank(p), 1.12)}));
      boards.push(sheet(THREE, (s, t) => at(side * (l - th * s), (-w + th) + 2 * (w - th) * t, lip), {nt: 3, tile, outward: UP, colour: p => shade(plank(p), 1.12)}));
    }
    soil.push(sheet(THREE, (s, t) => { const a = (-l + th) + 2 * (l - th) * s, b = (-w + th) + 2 * (w - th) * t; return at(a, b, bed.top + .025 * noise(a * 3 + bed.center[0], b * 3, 62)); },
      {ns: 8, nt: 4, tile: SPACE_ART.surfaces.earth.metres * .5, outward: UP, colour: p => shade(SOIL, .8 + .4 * noise(p[0] * 2.3, p[1] * 2.3, 63))}));
  }

  // ── the crops ──
  const stems = [], leaves = cardBatch(SPACE_ART), cells = SPACE_ART.cards.cells.dab;
  // One dab as a blade or a round leaf: from `from`, `length` metres along unit `dir` (its blunt end at `from`), `width` across
  // along unit `across`, tinted and a little darker along one edge.
  const blade = (from, dir, across, length, width, colour, r, cell = cells[0]) => {
    const k = .88 + .24 * r();
    leaves.add(V.add(from, dir, length / 2), V.scale(dir, length / 2 / STROKE[0]), V.scale(across, width / 2 / STROKE[1]), cell, shade(colour, k * .7), shade(colour, k), UP, false,
      {kind: 'crop', random: hash(leaves.count, 5, 64)});
  };
  // A unit vector `elevation` radians above the horizontal toward azimuth `az`, and one across it turned `twist` out of the level.
  const aim = (az, elevation, twist) => {
    const out = [Math.sin(az), Math.cos(az), 0], dir = V.add(V.scale(out, Math.cos(elevation)), UP, Math.sin(elevation));
    const level = [Math.cos(az), -Math.sin(az), 0], rise = V.cross(level, dir);
    return [dir, V.norm(V.add(V.scale(level, Math.cos(twist)), rise, Math.sin(twist)))];
  };
  const round = (centre, normal, radius, colour, r) => {
    const [right, up] = basis(V.norm(normal)), turn = r() * TAU, dir = V.add(V.scale(right, Math.cos(turn)), up, Math.sin(turn)), across = V.add(V.scale(up, Math.cos(turn)), right, -Math.sin(turn));
    blade(V.add(centre, dir, -radius), dir, across, radius * 2, radius * 1.7, colour, r, cells[r() < .5 ? 0 : 1]);
  };

  for (const p of plan.plants) {
    const r = stream(Math.floor(p.seed * 1e6), 12), [fx, fy, fz] = p.foot, H = p.height;
    const along = t => [fx + p.lean[0] * t, fy + p.lean[1] * t, fz + H * t];
    if (p.kind === 'corn') {
      stems.push(tinted(tube(THREE, [[...along(-.03), .024], [...along(.5), .017], [...along(.93), .008]], {sides: 5, tile}), STALK));
      // leaves alternate up two sides of the stalk, each arching out and then drooping to its tip
      const n = 7 + Math.floor(r() * 3), side = r() * TAU;
      for (let i = 0; i < n; i++) {
        const t = .14 + .7 * (i + r() * .5) / n, az = side + i * Math.PI + (r() - .5) * .9, length = (.5 + r() * .3) * (1 - .35 * Math.abs(t - .45)), width = .07 + r() * .03;
        const twist = (r() < .5 ? -1 : 1) * (.5 + r() * .7), [up1, across1] = aim(az, .6 + r() * .4, twist), [up2, across2] = aim(az + (r() - .5) * .3, -.25 - r() * .5, twist);
        const from = along(t), bend = V.add(from, up1, length * .42);
        blade(from, up1, across1, length * .55, width, CORN, r); blade(bend, up2, across2, length * .55, width * .85, shade(CORN, 1.08), r);
      }
      for (let k = 0; k < 3; k++) { const [dir, across] = aim(r() * TAU, 1.1 + r() * .4, r() * TAU); blade(along(.9), dir, across, .16 + r() * .08, .03, STRAW, r); }
      if (r() < .8) { const [dir, across] = aim(side + Math.PI / 2 + (r() - .5), 1.15, r() * TAU); blade(along(.4 + r() * .12), dir, across, .2, .06, EAR, r); }
    } else if (p.kind === 'bean') {
      // the pole runs on a little past where the poles cross
      const top = along(1.07);
      stems.push(tinted(tube(THREE, [[...along(-.03), .014], [...top, .011]], {sides: 5, tile}), POLE));
      stems.push(tinted(tube(THREE, [0, .25, .5, .75, .98].map(t => { const c = along(t), a = t * 9 + p.seed * TAU; return [c[0] + Math.sin(a) * .018, c[1] + Math.cos(a) * .018, c[2], .005]; }), {sides: 4, tile}), VINE));
      const n = 24 + Math.floor(r() * 6);
      for (let i = 0; i < n; i++) {
        const t = .06 + .88 * (i + r()) / n, a = r() * TAU, out = [Math.sin(a), Math.cos(a), 0], c = V.add(along(t), out, .04 + r() * .07);
        round(c, V.add(out, [r() - .5, r() - .5, r() * .9], .8), .045 + r() * .025, shade(BEAN, .85 + r() * .4), r);
        if (r() < .14) round(V.add(c, out, .03), out, .022, BLOSSOM, r);
      }
    } else {
      // a stake beside the stem, the plant a loose ball of leaf about its upper half, the fruit hanging low on its outside
      const a = r() * TAU, stake = [fx + Math.sin(a) * .07, fy + Math.cos(a) * .07];
      stems.push(tinted(tube(THREE, [[...stake, fz - .03, .013], [...stake, fz + 1.05 + r() * .1, .012]], {sides: 5, tile}), POLE));
      stems.push(tinted(tube(THREE, [[...along(-.03), .012], [...along(.75), .007]], {sides: 4, tile}), VINE));
      const centre = along(.55), rx = .26 + r() * .06, rz = H * .45;
      const shell = (k, low) => { const az = r() * TAU, z = low ? -.75 + r() * .7 : -.9 + r() * 1.9, h = Math.sqrt(1 - Math.min(1, z * z)); return [[Math.sin(az) * h, Math.cos(az) * h, z], k]; };
      for (let i = 0, n = 34 + Math.floor(r() * 6); i < n; i++) {
        const [d, k] = shell(.3 + r() * .7), c = V.add(centre, [d[0] * rx * k, d[1] * rx * k, d[2] * rz * k]);
        round(c, V.add(d, [r() - .5, r() - .5, r() - .3], .7), .08 + r() * .05, shade(TOMATO, .8 + r() * .5), r);
      }
      for (let i = 0, n = 5 + Math.floor(r() * 4); i < n; i++) {
        const [d] = shell(1, true), c = V.add(centre, [d[0] * rx * 1.08, d[1] * rx * 1.08, d[2] * rz]), colour = FRUIT[Math.floor(r() * r() * FRUIT.length)], size = .032 + r() * .014;
        // two cards crossed, so a fruit shows from the side as well as face on
        round(c, [d[0], d[1], 0], size, colour, r); round(c, [-d[1], d[0], 0], size, colour, r);
      }
    }
  }

  const wood = new THREE.MeshLambertMaterial({map: art.surfaces.bark, vertexColors: true});
  const mesh = (name, geometry, material) => { const m = new THREE.Mesh(geometry, material); m.name = name; return m; };
  const object = new THREE.Group(); object.name = 'garden';
  object.add(mesh('beds', merged(boards), wood), mesh('soil', merged(soil), new THREE.MeshLambertMaterial({map: art.surfaces.earth, vertexColors: true})),
    mesh('stems', merged(stems), wood), mesh('leaves', leaves.geometry(THREE), cardMaterial(THREE, art.cards, SPACE_ART)));
  return {object};
}
