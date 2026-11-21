import {KINDS} from '../../../shared/furniture.js';
import {hash, stream} from '../scene/noise.js';

// The furniture kit: flat helpers that make a piece's parts from buildInterior's `face`, so every vertex carries the light it takes
// (its day, lamp, fire and spill weights, weighed by the same light field as the walls) and a vertex tint. A piece is drawn in its own
// frame, metres: x across it, y deep (it faces its local −y side), z up from its floor; `placed(entry)` maps that frame into the
// interior's [a, d, z] at the entry's `at` and `turn`, and every helper takes such a map (`at`) first. Colours are tint functions of
// the interior point (buildInterior's `tint`). Each helper returns an array of geometries carrying position, normal, uv, colour, light
// and spill. Nothing is lit by anything but the field: what the field cannot know (a shelf's inside, a bench's underside) is darkened
// in the tint, by TUCK.

// How much of its tint a tucked face keeps (linear).
export const TUCK = .45;
// The brushwork's scale on furniture, metres a tile: finer than the shell's 1.6, so small pieces read as painted, not smeared.
const TILE = .9;
// How far a box's corners are pulled in at most, metres; never more than a quarter of the box's own size.
const BROKEN = .012;
// How many cells a cushion's side is cut into each way: enough for its bulge and its dent to read.
const CUSHION_CUTS = 4;
// A box's faces, each by its four corners (corner k is [x, y, z] = [k & 1, k >> 1 & 1, k >> 2 & 1] of the box) at (s, t) = (0, 0),
// (1, 0), (0, 1), (1, 1), and its outward normal in the piece's frame. The front faces −y, the way the piece faces.
const FACES = {under: [[0, 1, 2, 3], [0, 0, -1]], top: [[4, 5, 6, 7], [0, 0, 1]], front: [[0, 1, 4, 5], [0, -1, 0]], back: [[2, 3, 6, 7], [0, 1, 0]],
  left: [[0, 2, 4, 6], [-1, 0, 0]], right: [[1, 3, 5, 7], [1, 0, 0]]};
const lerp = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
// A seed from numbers (to the millimetre), for helpers given none: the same piece in the same place always breaks the same way.
const seedOf = (...xs) => xs.reduce((h, x) => hash(Math.round(x * 1000), h, 977) * 4294967296 >>> 0, 1);

export function createKit(THREE, {face, lit, tint}) {
  // The piece's frame into the interior's: [a, d, z] for local (x, y, z), turned anticlockwise by `turn` about `at` and raised by
  // `lift` (the floor, or the top of whatever the piece is set on).
  const placed = ({at, turn = 0, lift = 0}) => {
    const c = Math.cos(turn), s = Math.sin(turn);
    return (x, y, z) => [at[0] + x * c - y * s, at[1] + x * s + y * c, lift + z];
  };
  // A frame inside another: tilted by `tilt` about its own x axis (its +y rising), turned by `turn` about its z, set at `offset`.
  const moved = (at, [ox, oy, oz] = [0, 0, 0], {turn = 0, tilt = 0} = {}) => {
    const c = Math.cos(turn), s = Math.sin(turn), ct = Math.cos(tilt), st = Math.sin(tilt);
    return (x, y, z) => { const y1 = y * ct - z * st, z1 = y * st + z * ct; return at(ox + x * c - y1 * s, oy + x * s + y1 * c, oz + z1); };
  };
  // A local direction in the interior's frame.
  const direction = (at, n) => { const o = at(0, 0, 0), q = at(...n); return [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; };
  const tucked = colour => p => colour(p).map(c => c * TUCK);

  // Six faces (less `skip`) between eight local corners, each its own face; those named in `tuck` darkened. `cuts` fixes the cells.
  const hexahedron = (at, corner, colour, {tile = TILE, tuck = [], skip = [], cuts = {}} = {}) => {
    const out = [];
    for (const [name, [[k00, k10, k01, k11], n]] of Object.entries(FACES)) {
      if (skip.includes(name)) continue;
      const [p00, p10, p01, p11] = [k00, k10, k01, k11].map(k => corner[k]);
      out.push(face((s, t) => at(...lerp(lerp(p00, p10, s), lerp(p01, p11, s), t)), Math.max(dist(p00, p10), dist(p01, p11)), Math.max(dist(p00, p01), dist(p10, p11)),
        direction(at, n), tuck.includes(name) ? tucked(colour) : colour, {tile, ...cuts}));
    }
    return out;
  };
  const cornersOf = ([x0, x1], [y0, y1], [z0, z1]) => Array.from({length: 8}, (_, k) => [k & 1 ? x1 : x0, k & 2 ? y1 : y0, k & 4 ? z1 : z0]);

  // A board: a box with square edges. `tuck` and `skip` name faces as box's do.
  const board = (at, xs, ys, zs, colour, {tile, tuck, skip} = {}) => hexahedron(at, cornersOf(xs, ys, zs), colour, {tile, tuck, skip});

  // A box with its edges broken: each corner pulled in across and deep by up to `broken`, from the seed. Faces named in `tuck`
  // ('under', 'top', 'front', 'back', 'left', 'right', and 'inside' for a hollow box) are darkened. Given `hollow` (a thickness) it is
  // a carcass open at its front: its outer faces, the rims of its front, and its inner faces, which are 'inside'.
  const box = (at, [x0, x1], [y0, y1], [z0, z1], colour, {tile, broken = BROKEN, tuck = [], skip = [], seed, hollow = 0} = {}) => {
    const p0 = at(x0, y0, z0), random = stream(seed ?? seedOf(...p0, x1 - x0, y1 - y0, z1 - z0), 3), most = Math.min(broken, (x1 - x0) / 4, (y1 - y0) / 4);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, inward = (v, c) => v + Math.sign(c - v) * most * random();
    const corner = cornersOf([x0, x1], [y0, y1], [z0, z1]).map(([x, y, z]) => [inward(x, cx), inward(y, cy), z]);
    if (!hollow) return hexahedron(at, corner, colour, {tile, tuck, skip});
    const out = hexahedron(at, corner, colour, {tile, tuck, skip: [...skip, 'front']}), h = hollow, inner = cornersOf([x0 + h, x1 - h], [y0, y1 - h], [z0 + h, z1 - h]);
    // the front's rims: between each outer front edge and the inner one
    const rim = (a, b, c, d) => out.push(face((s, t) => at(...lerp(lerp(a, b, s), lerp(c, d, s), t)), dist(a, b), dist(a, c), direction(at, [0, -1, 0]), tuck.includes('front') ? tucked(colour) : colour, {tile}));
    rim(corner[0], corner[1], inner[0], inner[1]); rim(inner[4], inner[5], corner[4], corner[5]); rim(corner[0], inner[0], corner[4], inner[4]); rim(inner[1], corner[1], inner[5], corner[5]);
    // and the inside: each inner face looks into the carcass, the way opposite to its outer twin
    const inside = tuck.includes('inside') ? tucked(colour) : colour;
    for (const [name, [[k00, k10, k01, k11], n]] of Object.entries(FACES)) {
      if (name === 'front') continue;
      const [q00, q10, q01, q11] = [k00, k10, k01, k11].map(k => inner[k]);
      out.push(face((s, t) => at(...lerp(lerp(q00, q10, s), lerp(q01, q11, s), t)), dist(q00, q10), dist(q00, q01), direction(at, n.map(v => -v)), inside, {tile}));
    }
    return out;
  };

  // A square post of half-width `radius` standing at [x, y] from z0 to z1: its four sides and its top.
  const post = (at, [x, y], [z0, z1], radius, colour, {tile, tuck} = {}) =>
    hexahedron(at, cornersOf([x - radius, x + radius], [y - radius, y + radius], [z0, z1]), colour, {tile, tuck, skip: ['under']});

  // A cushion over the box [x0, x1] × [y0, y1] × [z0, z1]: every side cut CUSHION_CUTS × CUSHION_CUTS, its sides bulging out and its top up, the top
  // sagging toward a dent at a seeded place. Its edges stay where the box's are, so its faces close; its bottom lies flat on its seat.
  const cushion = (at, [x0, x1], [y0, y1], [z0, z1], colour, {seed, tile = TILE * .6, bulge = .5, sag = .3} = {}) => {
    const random = stream(seed ?? seedOf(...at(x0, y0, z0)), 5), hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
    const cx = x0 + hx, cy = y0 + hy, cz = z0 + hz, rise = bulge * hz, out = .5 * bulge * hz;
    const dent = [(random() - .5) * 1.1, (random() - .5) * 1.1], deep = sag * hz * (.7 + .6 * random());
    // a point of the unit box's surface ([-1, 1] across and deep, [-1, 1] up) to the cushion's: pushed along its face's normal
    const shape = (u, v, w, n) => {
      const pinch = (p, q) => (1 - p * p) * (1 - q * q);
      let x = cx + u * hx, y = cy + v * hy, z = cz + w * hz;
      if (n[2] > 0) z += pinch(u, v) * (rise - deep * Math.exp(-((u - dent[0]) ** 2 + (v - dent[1]) ** 2) / .35));
      if (n[0]) x += n[0] * out * pinch(v, w); if (n[1]) y += n[1] * out * pinch(u, w);
      return [x, y, z];
    };
    const sides = {
      under: [(s, t) => [2 * s - 1, 2 * t - 1, -1], 2 * hx, 2 * hy], top: [(s, t) => [2 * s - 1, 2 * t - 1, 1], 2 * hx, 2 * hy],
      front: [(s, t) => [2 * s - 1, -1, 2 * t - 1], 2 * hx, 2 * hz], back: [(s, t) => [2 * s - 1, 1, 2 * t - 1], 2 * hx, 2 * hz],
      left: [(s, t) => [-1, 2 * s - 1, 2 * t - 1], 2 * hy, 2 * hz], right: [(s, t) => [1, 2 * s - 1, 2 * t - 1], 2 * hy, 2 * hz]};
    return Object.entries(sides).map(([name, [unit, across, up]]) => {
      const n = FACES[name][1];
      return face((s, t) => at(...shape(...unit(s, t), n)), across, up, direction(at, n), colour, {tile, cols: CUSHION_CUTS, rows: CUSHION_CUTS});
    });
  };

  // A run of books along x from x0 to x1, standing on z0 with their spines at depth y (they reach back from it): mixed thicknesses,
  // heights up to `height` and depths, a few gaps, now and then one leaning into the gap after it or a short stack lying flat. Each
  // book is its spine, top and two sides (the sides darkened, pressed between neighbours); `colours` are the covers' tints.
  const books = (at, [x0, x1], y, z0, {height = .26, seed, colours, tile = TILE * .5} = {}) => {
    const random = stream(seed ?? seedOf(...at(x0, y, z0)), 7), out = [], pick = () => colours[Math.floor(random() * colours.length) % colours.length];
    const book = (corner, colour) => out.push(...hexahedron(at, corner, colour, {tile, tuck: ['left', 'right'], skip: ['under', 'back'], cuts: {cols: 1, rows: 1}}));
    let x = x0 + .005 + random() * .02;
    while (x < x1 - .02) {
      const r = random(), depth = .15 + .07 * random();
      if (r < .08 && x + .3 < x1) { x += .06 + .14 * random(); continue; }                            // a gap
      if (r < .14 && x + .25 < x1) {                                                                // a short stack lying flat
        let z = z0; const n = 2 + Math.floor(random() * 3), long = .17 + .05 * random();
        for (let k = 0; k < n; k++) { const thick = .025 + .02 * random(), skew = (random() - .5) * .015;
          book(cornersOf([x + skew, x + skew + long], [y, y + depth], [z, z + thick]), pick()); z += thick; }
        x += long + .01 + .02 * random(); continue;
      }
      const thick = .018 + .032 * random(), tall = height * (.72 + .28 * random());
      if (x + thick > x1) break;
      if (r < .2 && x + thick + tall * .45 < x1) {                                                   // leaning: tipped about its foot's far edge
        const lean = .18 + .22 * random(), c = Math.cos(lean), s = Math.sin(lean), px = x + thick;
        const tip = ([dx, dz]) => [px + dx * c + dz * s, z0 - dx * s + dz * c];
        book(Array.from({length: 8}, (_, k) => { const [bx, bz] = tip([k & 1 ? 0 : -thick, k & 4 ? tall : 0]); return [bx, k & 2 ? y + depth : y, bz]; }), pick());
        x = px + tall * s + .004; continue;
      }
      book(cornersOf([x, x + thick], [y + .01 * random(), y + depth], [z0, z0 + tall]), pick());     // standing
      x += thick + .001;
    }
    return out;
  };

  // A framed panel hung on its wall (a wall-hung entry, resolved to its wall's face: `at` there, turned to face the room, with its
  // `along` and its centre height `z`): a frame of `colour` standing off the wall, and inside it the panel, one tint or [upper, lower].
  const framed = (wallEntry, colour, {panel = colour, frame = .05, deep = .03, split = .58} = {}) => {
    const at = placed(wallEntry), w = (wallEntry.along[1] - wallEntry.along[0]) / 2, h = KINDS[wallEntry.kind].height / 2, z = wallEntry.z;
    const out = [], back = {skip: ['back']};
    out.push(...box(at, [-w, w], [-deep, 0], [z - h, z - h + frame], colour, back), ...box(at, [-w, w], [-deep, 0], [z + h - frame, z + h], colour, back),
      ...box(at, [-w, -w + frame], [-deep, 0], [z - h + frame, z + h - frame], colour, back), ...box(at, [w - frame, w], [-deep, 0], [z - h + frame, z + h - frame], colour, back));
    const [upper, lower] = Array.isArray(panel) ? panel : [panel, panel], inner = [-w + frame, w - frame], low = z - h + frame, high = z + h - frame, cut = low + (high - low) * (1 - split);
    const sheet = (z0, z1, tone) => out.push(face((s, t) => at(inner[0] + (inner[1] - inner[0]) * s, -deep * .4, z0 + (z1 - z0) * t), inner[1] - inner[0], z1 - z0, direction(at, [0, -1, 0]), tone, {tile: TILE * .5}));
    if (upper === lower) sheet(low, high, upper); else { sheet(low, cut, lower); sheet(cut, high, upper); }
    return out;
  };

  // A mat lying on the floor: a slab `thick` high over [−hx, hx] × [−hy, hy], its edges a little uneven (drawn in, never out, and true
  // at the corners), its top a `field` with a darker `border` band of width `band` round it. Its underside is not drawn.
  const mat = (at, [hx, hy], thick, field, border, {band = .12, seed, uneven = .015, tile = TILE * .8} = {}) => {
    const random = stream(seed ?? seedOf(...at(0, 0, 0)), 9), phase = [0, 1, 2, 3].map(() => [random() * 6.3, random() * 6.3, 2 + random() * 3]);
    // the outline: side k (front, right, back, left, anticlockwise from the front-left corner) at s ∈ [0, 1]
    const ends = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]], innerEnds = ends.map(([x, y]) => [x - Math.sign(x) * band, y - Math.sign(y) * band]);
    const edge = (k, s) => {
      const [p, q] = [ends[k], ends[(k + 1) % 4]], [f, g, n] = phase[k], wobble = Math.sin(Math.PI * s) * uneven * (.5 + .3 * Math.sin(s * n * 3.1 + f) + .2 * Math.sin(s * 17 + g));
      const x = p[0] + (q[0] - p[0]) * s, y = p[1] + (q[1] - p[1]) * s;
      return [x - Math.sign(x) * (k % 2 ? wobble : 0), y - Math.sign(y) * (k % 2 ? 0 : wobble)];
    };
    const out = [], up = direction(at, [0, 0, 1]);
    out.push(face((s, t) => at(innerEnds[0][0] + (innerEnds[1][0] - innerEnds[0][0]) * s, innerEnds[0][1] + (innerEnds[3][1] - innerEnds[0][1]) * t, thick),
      2 * (hx - band), 2 * (hy - band), up, field, {tile}));
    for (let k = 0; k < 4; k++) {
      const [ip, iq] = [innerEnds[k], innerEnds[(k + 1) % 4]], length = Math.hypot(ends[(k + 1) % 4][0] - ends[k][0], ends[(k + 1) % 4][1] - ends[k][1]);
      out.push(face((s, t) => { const o = edge(k, s), i = [ip[0] + (iq[0] - ip[0]) * s, ip[1] + (iq[1] - ip[1]) * s]; return at(o[0] + (i[0] - o[0]) * t, o[1] + (i[1] - o[1]) * t, thick); },
        length, band, up, border, {tile}));
      const [ox, oy] = edge(k, .5), outward = direction(at, [Math.sign(ox) * (k % 2), Math.sign(oy) * (1 - k % 2), 0]);
      out.push(face((s, t) => at(...edge(k, s), thick * t), length, thick, outward, border, {tile, rows: 1}));
    }
    return out;
  };

  return {placed, moved, board, box, post, cushion, books, framed, mat, lit, tint};
}
