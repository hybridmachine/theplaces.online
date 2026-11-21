import {KINDS} from '../../../shared/furniture.js';
import {basis, toThree, V} from '../geometry.js';
import {hash, stream} from '../scene/noise.js';

// The furniture kit: flat helpers that make a piece's parts from buildInterior's `face`, so every vertex carries the light it takes
// (its day, lamp, fire and spill weights, weighed by the same light field as the walls) and a vertex tint. A piece is drawn in its own
// frame, metres: x across it, y deep (it faces its local −y side), z up from its floor; `placed(entry)` maps that frame into the
// interior's [a, d, z] at the entry's `at` and `turn`, and every helper takes such a map (`at`) first. Colours are tint functions of
// the interior point (buildInterior's `tint`). Each helper returns an array of geometries carrying position, normal, uv, colour, light
// and spill. Nothing is lit by anything but the field: what the field cannot know (a shelf's inside, a bench's underside) is darkened
// in the tint, by TUCK. The sculpted helpers (turned, roll, drape) make curved surfaces that are not `face`s: they set their own uv and
// colour and are weighed by `lit` in the room their map names (`placed` and `moved` carry the entry's room).

// How much of its tint a tucked face keeps (linear).
export const TUCK = .45;
// The brushwork's scale on furniture, metres a tile: finer than the shell's 1.6, so small pieces read as painted, not smeared.
const TILE = .9;
// How far a box's corners are pulled in at most, metres; never more than a quarter of the box's own size.
const BROKEN = .012;
// How many cells a cushion's side is cut into each way: enough for its bulge and its dent to read.
const CUSHION_CUTS = 3;
// A roll's rings stand at most this far apart along it (metres), so its light, weighed at its vertices, follows it.
const ROLL_RING = .4;
// A drape's cells are about this size (metres; a drape may ask for finer), and never more than DRAPE_CUTS a side.
const DRAPE_CELL = .13, DRAPE_CUTS = 12;
// How much of its tint a drape keeps at most in a fold's trough (1 − FOLD_SHADE), where it hangs free.
const FOLD_SHADE = .3;
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
  // The map carries the entry's `room`, in which the sculpted helpers weigh what they make.
  const placed = ({at, turn = 0, lift = 0, room}) => {
    const c = Math.cos(turn), s = Math.sin(turn);
    return Object.assign((x, y, z) => [at[0] + x * c - y * s, at[1] + x * s + y * c, lift + z], {room});
  };
  // A frame inside another: tilted by `tilt` about its own x axis (its +y rising), turned by `turn` about its z, set at `offset`.
  const moved = (at, [ox, oy, oz] = [0, 0, 0], {turn = 0, tilt = 0} = {}) => {
    const c = Math.cos(turn), s = Math.sin(turn), ct = Math.cos(tilt), st = Math.sin(tilt);
    return Object.assign((x, y, z) => { const y1 = y * ct - z * st, z1 = y * st + z * ct; return at(ox + x * c - y1 * s, oy + x * s + y1 * c, oz + z1); }, {room: at.room});
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
  // Sides named in `skip` (as box's) are not drawn: those nothing will see. Given `taper` (0 to 1), a loose cushion's: its thickness
  // falls toward its edges by that much, to a seam round its middle, so it reads stuffed rather than boxed; `cuts` overrides CUSHION_CUTS.
  const cushion = (at, [x0, x1], [y0, y1], [z0, z1], colour, {seed, tile = TILE * .6, bulge = .5, sag = .3, skip = [], taper = 0, cuts = CUSHION_CUTS} = {}) => {
    const random = stream(seed ?? seedOf(...at(x0, y0, z0)), 5), hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
    const cx = x0 + hx, cy = y0 + hy, cz = z0 + hz, rise = bulge * hz, out = .5 * bulge * hz;
    const dent = [(random() - .5) * 1.1, (random() - .5) * 1.1], deep = sag * hz * (.7 + .6 * random());
    // a point of the unit box's surface ([-1, 1] across and deep, [-1, 1] up) to the cushion's: pushed along its face's normal
    const shape = (u, v, w, n) => {
      const pinch = (p, q) => (1 - p * p) * (1 - q * q);
      let x = cx + u * hx, y = cy + v * hy, z = cz + w * hz;
      if (n[2] > 0) z += pinch(u, v) * (rise - deep * Math.exp(-((u - dent[0]) ** 2 + (v - dent[1]) ** 2) / .35));
      if (n[0]) x += n[0] * out * pinch(v, w); if (n[1]) y += n[1] * out * pinch(u, w);
      if (taper) z = cz + (z - cz) * (1 - taper * (1 - pinch(u, v)));
      return [x, y, z];
    };
    const sides = {
      under: [(s, t) => [2 * s - 1, 2 * t - 1, -1], 2 * hx, 2 * hy], top: [(s, t) => [2 * s - 1, 2 * t - 1, 1], 2 * hx, 2 * hy],
      front: [(s, t) => [2 * s - 1, -1, 2 * t - 1], 2 * hx, 2 * hz], back: [(s, t) => [2 * s - 1, 1, 2 * t - 1], 2 * hx, 2 * hz],
      left: [(s, t) => [-1, 2 * s - 1, 2 * t - 1], 2 * hy, 2 * hz], right: [(s, t) => [1, 2 * s - 1, 2 * t - 1], 2 * hy, 2 * hz]};
    return Object.entries(sides).filter(([name]) => !skip.includes(name)).map(([name, [unit, across, up]]) => {
      const n = FACES[name][1];
      return face((s, t) => at(...shape(...unit(s, t), n)), across, up, direction(at, n), colour, {tile, cols: cuts, rows: cuts});
    });
  };

  // A run of books along x from x0 to x1, standing on z0 with their spines at depth y (they reach back from it): mixed thicknesses,
  // heights up to `height` and depths, a few gaps, now and then one leaning into the gap after it or a short stack lying flat. Each
  // book is its spine, top and two sides (the sides darkened, pressed between neighbours); `colours` are the covers' tints.
  const books = (at, [x0, x1], y, z0, {height = .26, seed, colours, tile = TILE * .5} = {}) => {
    const random = stream(seed ?? seedOf(...at(x0, y, z0)), 7), pick = () => colours[Math.floor(random() * colours.length) % colours.length];
    // The whole run is one geometry, weighed once by `lit` (each book's faces drawn as `face` would draw a 1 × 1 sheet: its four corners,
    // uv in metres over `tile`, the quad's own normal turned the way its face looks): a run's dozens of little sheets cost more to make
    // and merge than to light.
    const position = [], normal = [], uv = [], color = [], index = [];
    const book = (corner, colour) => {
      for (const name of ['top', 'front', 'left', 'right']) {
        const [[k00, k10, k01, k11], n] = FACES[name], q = [k00, k10, k01, k11].map(k => at(...corner[k])), tone = name === 'left' || name === 'right' ? tucked(colour) : colour;
        const out = direction(at, n), across = dist(q[0], q[1]), up = dist(q[0], q[2]);
        let m = V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[2], q[0])));
        const flip = V.dot(m, out) < 0; if (flip) m = V.scale(m, -1);
        const base = position.length / 3;
        q.forEach((p, k) => { position.push(...toThree(p)); normal.push(...toThree(m)); uv.push(k & 1 ? across / tile : 0, k & 2 ? up / tile : 0); color.push(...tone(p)); });
        index.push(...(flip ? [base, base + 3, base + 1, base, base + 2, base + 3] : [base, base + 1, base + 3, base, base + 3, base + 2]));
      }
    };
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
      const thick = .024 + .038 * random(), tall = height * (.72 + .28 * random());
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
    if (!index.length) return [];
    const g = new THREE.BufferGeometry();
    for (const [name, list, size] of [['position', position, 3], ['normal', normal, 3], ['uv', uv, 2], ['color', color, 3]]) g.setAttribute(name, new THREE.Float32BufferAttribute(list, size));
    g.setIndex(index);
    return [lit(g, at.room)];
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

  // ── the sculpted helpers ──
  // A grid of local points `rows[j][i]` with their local normals, mapped by `at` into the interior; uv in metres along i and along j
  // over `tile`, colour `colourOf(point, j)` (a tint, which may read the row), each triangle wound to face its vertices' normals (a
  // triangle with no area is left out). Weighed by `lit` in `at`'s room, unless `weighed` is false (its caller then gives it its light).
  const grid = (at, rows, normals, colourOf, tile, weighed = true) => {
    const nj = rows.length, ni = rows[0].length, position = [], normal = [], uv = [], color = [], pts = [], ns = [];
    const along = Array(nj).fill(0), up = Array(ni).fill(0);
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const p = at(...rows[j][i]), n = V.norm(direction(at, normals[j][i]));
      if (i) along[j] += dist(p, pts[j * ni + i - 1]);
      if (j) up[i] += dist(p, pts[(j - 1) * ni + i]);
      pts.push(p); ns.push(n);
      position.push(...toThree(p)); normal.push(...toThree(n)); uv.push(along[j] / tile, up[i] / tile); color.push(...colourOf(p, j));
    }
    const index = [], tri = (p, q, r) => {
      const c = V.cross(V.sub(pts[q], pts[p]), V.sub(pts[r], pts[p]));
      if (V.len(c) < 1e-10) return;
      index.push(...(V.dot(c, V.add(V.add(ns[p], ns[q]), ns[r])) >= 0 ? [p, q, r] : [p, r, q]));
    };
    for (let j = 0; j < nj - 1; j++) for (let i = 0; i < ni - 1; i++) {
      const p = j * ni + i, q = p + 1, r = p + ni + 1, t = p + ni;
      tri(p, q, r); tri(p, r, t);
    }
    const g = new THREE.BufferGeometry();
    for (const [name, list, size] of [['position', position, 3], ['normal', normal, 3], ['uv', uv, 2], ['color', color, 3]]) g.setAttribute(name, new THREE.Float32BufferAttribute(list, size));
    g.setIndex(index);
    return weighed ? lit(g, at.room) : g;
  };
  // A profile [[radius, z], …] spun about the local z axis of `at` in `segments`: each point's normal the mean of its two spans' (a
  // point repeated is a crease: each copy takes the span on its own side). Going up the outside, the normals face out.
  const lathe = (at, profile, colourOf, segments, tile) => {
    const spans = profile.slice(1).map(([r, z], k) => { const [r0, z0] = profile[k], l = Math.hypot(r - r0, z - z0); return l < 1e-9 ? null : [(z - z0) / l, -(r - r0) / l]; });
    const flat = profile.map((_, k) => {
      const [p, q] = [spans[k - 1], spans[k]], m = p && q ? [p[0] + q[0], p[1] + q[1]] : p || q || [1, 0], l = Math.hypot(...m) || 1;
      return [m[0] / l, m[1] / l];
    });
    const ring = f => Array.from({length: segments + 1}, (_, i) => f(2 * Math.PI * i / segments));
    return grid(at, profile.map(([r, z]) => ring(a => [r * Math.cos(a), r * Math.sin(a), z])),
      flat.map(([nr, nz]) => ring(a => [nr * Math.cos(a), nr * Math.sin(a), nz])), colourOf, tile);
  };

  // A turned piece: `profile` [[radius, z], …] (bottom to top, outside first; repeat a point for a crease) spun about the vertical at
  // [x, y] of `at`. `colourOf(point, k)` is a tint, which may read k, the profile point's index. Returns [geometry].
  const turned = (at, [x, y], profile, colourOf, {segments = 12, tile = TILE * .5} = {}) =>
    [lathe(Object.assign((u, v, w) => at(x + u, y + v, w), {room: at.room}), profile, colourOf, segments, tile)];

  // A round bar of `radius` between the local points `from` and `to`, its ends closed (in `ends`, by default its own colour), with a
  // ring every ROLL_RING at most. Returns [geometry].
  const roll = (at, from, to, radius, colour, {sides = 8, ends = colour, tile = TILE * .5} = {}) => {
    const axis = V.sub(to, from), length = V.len(axis), u = V.norm(axis), [r1, r2] = basis(u);
    const frame = Object.assign((x, y, z) => at(...V.add(V.add(V.add(from, r1, x), r2, y), u, z)), {room: at.room});
    const n = Math.max(1, Math.ceil(length / ROLL_RING - 1e-9)), side = Array.from({length: n + 1}, (_, k) => [radius, length * k / n]);
    const profile = [[0, 0], [radius, 0], ...side, [radius, length], [0, length]], last = profile.length - 2;
    return [lathe(frame, profile, (p, k) => (k < 2 || k >= last ? ends : colour)(p), sides, tile)];
  };

  // A sheet of cloth over `pointOf(s, t)` (local points, s and t in [0, 1]; its front is the side ∂p/∂s × ∂p/∂t points to), `across`
  // and `down` metres along s and t, folded: pushed out along its front by up to `folds` metres in seeded waves across s, as much as
  // `free(s, t)` (0 where it rests on something, 1 where it hangs; by default t). Double-sided: its back is drawn too, a few
  // millimetres behind, facing the other way, and takes its front's light (a cloth's two sides, millimetres apart, are lit alike;
  // weighing the back again doubled the drape's cost to build). The folds' troughs are darkened in the tint, by up to FOLD_SHADE where the
// cloth hangs free: the coarse weighing rounds a normal to WEIGH_TURN, finer than which a fold's own turn would not show. Returns [front, back].
  const drape = (at, pointOf, across, down, colour, {seed, folds = .03, free = (s, t) => t, tile = TILE * .6, cell = DRAPE_CELL} = {}) => {
    const random = stream(seed ?? seedOf(...at(0, 0, 0)), 13), cols = Math.min(DRAPE_CUTS, Math.max(2, Math.ceil(across / cell))), rows = Math.min(DRAPE_CUTS, Math.max(2, Math.ceil(down / cell)));
    const waves = [0, 1, 2].map(k => [2 + k * 1.7 + random() * 1.5, random() * 6.3, 1 / (k + 1.4)]), h = 1e-3;
    const front = (s, t) => V.norm(V.cross(V.sub(pointOf(Math.min(1, s + h), t), pointOf(Math.max(0, s - h), t)), V.sub(pointOf(s, Math.min(1, t + h)), pointOf(s, Math.max(0, t - h)))));
    const fold = (s, t) => folds * free(s, t) * waves.reduce((sum, [f, phase, w]) => sum + w * (.5 + .5 * Math.sin(2 * Math.PI * f * s + phase + 2.2 * t)), 0) / 1.4;
    const pts = Array.from({length: rows + 1}, (_, j) => Array.from({length: cols + 1}, (_, i) => { const s = i / cols, t = j / rows; return V.add(pointOf(s, t), front(s, t), fold(s, t)); }));
    // the folded sheet's own normals, from its neighbours
    const at2 = (i, j) => pts[Math.min(rows, Math.max(0, j))][Math.min(cols, Math.max(0, i))];
    const normals = pts.map((row, j) => row.map((_, i) => V.norm(V.cross(V.sub(at2(i + 1, j), at2(i - 1, j)), V.sub(at2(i, j + 1), at2(i, j - 1))))));
    const back = pts.map((row, j) => row.map((p, i) => V.add(p, normals[j][i], -.004)));
    const face = grid(at, pts, normals, colour, tile), behind = grid(at, back, normals.map(row => row.map(n => V.scale(n, -1))), colour, tile, false);
    // (each vertex's tone: 1 on a fold's crest, less toward its trough as much as the cloth hangs free; grid's vertices run j by i)
    if (folds > 0) for (const g of [face, behind]) {
      const c = g.getAttribute('color');
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const s = i / cols, t = j / rows, f = free(s, t), tone = f > 0 ? 1 - FOLD_SHADE * f * (1 - fold(s, t) / (folds * f)) : 1, k = j * (cols + 1) + i;
        c.setXYZ(k, c.getX(k) * tone, c.getY(k) * tone, c.getZ(k) * tone);
      }
    }
    for (const name of ['light', 'spill']) if (face.getAttribute(name)) behind.setAttribute(name, face.getAttribute(name).clone());
    return [face, behind];
  };

  return {placed, moved, board, box, post, cushion, books, framed, mat, turned, roll, drape, lit, tint};
}
