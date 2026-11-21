import {KINDS, corners} from '../../../shared/furniture.js';
import {lightSum} from '../../../shared/interior-light.js';
import {roomAt} from '../../../shared/interior.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {mergeGeometries} from '../geometry.js';
import {hash} from '../scene/noise.js';
import {createKit, TUCK} from './furniture-kit.js';
import {MANTEL} from './fireplace.js';

// The furniture of the furnished rooms (the blueprint's interior.furniture), drawn from the kit (furniture-kit.js) by one recipe per
// kind and merged into a few meshes by material: wood (the shell's lit `surface` material), cloth (its double-sided `leafed` one) and
// stone (a lit material of its own over the stone brushwork, for the mantel's jug and candlesticks). Two more meshes are not lit by the
// room's weights: the shades of the two lamps (`shades`, one colour for the mesh, set by setLight from the room's light and the living
// room's lamp) and the grounding (a soft dark patch on the floor under each solid piece).
// Where a piece stands comes from its entry: standing pieces at their `at` and `turn`, wall-hung ones on the face of their wall line,
// set-on ones on their parent (on a seat at the parent kind's `seat`, otherwise on its top) or on the fireplace's mantel. A piece
// whose kind has no recipe, whose parent cannot be found, or whose recipe throws, is passed over, with one warning for the whole
// build naming each and why. Every irregularity comes from a seed of the entry's id.

// Linear tints, lit; the flat light's (built unlit) is each divided by the flat light's irradiance on a floor, as the shell's boards are.
// (the reds and blues faded toward grey, as the painting's are: nothing saturated; `walnut` is the stair's joinery, darker than its treads;
// `slate` the hall's runner, a worn grey-blue)
const COLOURS = {oak: [1.05, .78, .5], darkOak: [.6, .42, .28], walnut: [.26, .17, .11], rugRed: [.86, .46, .36], ochre: [1.05, .84, .5], green: [.52, .62, .5],
  blue: [.54, .6, .7], slate: [.6, .62, .64], linen: [1.2, 1.12, .95], glass: [.82, .9, .98]};
const FLAT = .89;
const MESHES = {wood: 'furniture-wood', cloth: 'furniture-cloth', stone: 'furniture-stone', shades: 'shades'};
// The grounding: each solid piece's patch is its turned footprint grown by `reach` metres, drawn in by `inner` at its dark middle, which is
// `dark` black (alpha) and fades to nothing at the rim; `lift` above the floor (or above the rug a piece stands on); the newel and the
// standing lamp's foot take a round patch of radius `disc`.
export const GROUND = {reach: .22, dark: .42, inner: .05, lift: .003, disc: .2};
const ROUND = ['newel', 'standing-lamp'];
// A lamp's shade, linear: pale (times the room's light there, without the lamp's own) with the lamp out, and glowing warm with the living
// room's lamp lit; between them by that lamp's level. Lit, it stays under 1 even at the shade's brightest band (SHADE_FORM), so its warmth
// shows on the shade itself instead of clipping to a flat cream.
export const SHADE_PALE = [1.12, 1.08, 1.05], SHADE_WARM = [.98, .62, .3];
// The shade's form, painted into its vertex tint (the mesh takes one colour a frame): bands up the cone from its foot (t 0) to its top
// (t 1), each with how much of the colour it keeps: a darker rim at the foot, brightest low where the bulb shines through, fading upward
// to a darker top edge. And across it: the side away from the room's middle keeps `away` of it, so the cone reads round.
const SHADE_FORM = {bands: [[0, .66], [.06, .92], [.3, 1], [.75, .86], [.93, .76], [1, .56]], away: .78};
const SHADE_ROOM = 'living';
const clamp01 = x => Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
const finite = v => Number.isFinite(v) ? v : 0;
// The stone's brushwork on the mantel's small pieces: finer than the breast's, so a jug shows a few strokes, not one stone.
const STONE_TILE = SPACE_ART.surfaces.stone.metres * .2;
// The stair's handrail's radius.
const RAIL_RADIUS = .024;
// The stair's joinery's brushwork scale, metres a tile: coarse against its thin parts, so each baluster and the rail take an even stain
// rather than the treads' strokes, and read as a piece apart from the flight.
const RAIL_TILE = 3;
// The window seat's squab cushion's thickness, metres: part of the seat's height, so what is set on the seat sits on it.
const WINDOW_SQUAB = .07;
const idSeed = id => [...String(id)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) % 100000;
// A piece's size: its entry's, or its kind's.
const sizeOf = e => e.size || KINDS[e.kind].size;
const halves = e => sizeOf(e).map(v => v / 2);
const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
// The pegs of a run of hooks (a resolved wall-hung entry): their x along it in its frame, one every 28 cm or so; the middle one (the hat's)
// and the others (the coats', in turn).
const pegsOf = e => {
  const w = (e.along[1] - e.along[0]) / 2, n = Math.max(2, Math.round(2 * w / .28)), xs = Array.from({length: n}, (_, k) => -w + (k + .5) * 2 * w / n), hat = Math.floor(n / 2);
  return {xs, hat: xs[hat], coats: xs.filter((_, k) => k !== hat)};
};
// The upholstered kinds' builds: colour (times), seat and back cushions, the arms' and back's thickness; and each piece's own build from
// its seed: its arms' and back's rolls a little fuller or leaner and its arms a little higher or lower (the throw reads its sofa's).
const UPHOLSTERY = {sofa: {colour: 'green', times: 1, seats: 2, backs: 2, arm: .18, back: .2}, armchair: {colour: 'rugRed', times: .75, seats: 1, backs: 1, arm: .15, back: .18}};
const upholsteryOf = e => {
  const u = UPHOLSTERY[e.kind], r = k => hash(k, 11, idSeed(e.id));
  return {...u, armR: u.arm / 2 * (.8 + .4 * r(21)), backR: u.back / 2 * (.85 + .15 * r(22)), armTop: .6 + .06 * (r(23) - .5)};
};

// ── the recipes: (kit, entry, palette, {interior, treads, plain}) → {wood?: [geometry], cloth?: [geometry], stone?: [geometry], shades?: [geometry]} ──
// `entry` is resolved: `at`, `turn` and `lift` place it (kit.placed), a set-on one also carries its `parent` (resolved), its `index`
// among the pieces of its kind on that parent and their `count`. `palette.<colour>(k = 0, spread = .08, times = 1)` is that colour's
// tint function (times `times`), varied by the piece's seed plus k; `palette.seed` is the piece's seed and `palette.random(k)` a
// fixed number in [0, 1) from it. The last argument is the whole interior, the stair's tread count (for the newel's rail) and a `plain` kit
// (the same, its geometry not weighed by the light's field) for what the shades draw.
const rug = (field, border, band) => (kit, e, pal) => {
  const [hx, hy] = halves(e);
  return {cloth: kit.mat(kit.placed(e), [hx, hy], .01, pal[field](0, .1), pal[border](1, .1, .6), {band, seed: pal.seed})};
};
// A table: a top board with broken edges, four posts, and on the console a lower shelf.
const table = ({colour, top = .035, leg = .022, inset = .06, shelf = null}) => (kit, e, pal) => {
  const [hx, hy] = halves(e), h = KINDS[e.kind].height, at = kit.placed(e), wood = pal[colour](0, .07), legs = pal[colour](1, .06, .9);
  const out = kit.box(at, [-hx, hx], [-hy, hy], [h - top, h], wood, {tuck: ['under'], seed: pal.seed});
  for (const x of [-1, 1]) for (const y of [-1, 1]) out.push(...kit.post(at, [x * (hx - inset), y * (hy - inset)], [0, h - top], leg, legs));
  if (shelf) out.push(...kit.board(at, [-hx + inset - leg, hx - inset + leg], [-hy + inset - leg, hy - inset + leg], [shelf, shelf + .025], wood, {tuck: ['under']}));
  return {wood: out};
};

// A sofa or armchair: feet, a frame under the seat, arms that are boxes with a roll along their tops, a back that is a box with a roll
// along its top (both rolls a little different piece by piece), seat cushions on the frame and back cushions leaning on the back.
const upholstered = (kit, e, pal) => {
  const [hx, hy] = halves(e), {height: h, seat} = KINDS[e.kind], at = kit.placed(e), {colour, times, seats, backs, back, armR, backR, armTop} = upholsteryOf(e);
  const cover = pal[colour](0, .07, times), dim = pal[colour](1, .07, times * .85), feet = pal.darkOak(2, .06);
  const inner = hx - 2 * armR, base = seat - .15, wood = [], cloth = [];   // the arms' inner faces; the frame's top, under the seat cushions
  for (const x of [-1, 1]) for (const y of [-1, 1]) wood.push(...kit.post(at, [x * (hx - .06), y * (hy - .06)], [0, .08], .022, feet));
  cloth.push(...kit.box(at, [-inner, inner], [-hy + .02, hy - back], [.08, base], dim, {skip: ['top', 'back'], tuck: ['under'], seed: pal.seed}));
  for (const side of [-1, 1]) {
    const cx = side * (hx - armR);
    cloth.push(...kit.box(at, side < 0 ? [-hx, -inner] : [inner, hx], [-hy + .02, hy], [.08, armTop], cover, {skip: ['top'], tuck: ['under'], broken: 0}),
      ...kit.roll(at, [cx, -hy + .02, armTop], [cx, hy - .005, armTop], armR, cover, {ends: dim}));
  }
  const top = h - backR;
  cloth.push(...kit.box(at, [-inner, inner], [hy - back, hy], [.08, top], cover, {skip: ['top'], tuck: ['under'], broken: 0}),
    ...kit.roll(at, [-hx + armR * .4, hy - back / 2, top], [hx - armR * .4, hy - back / 2, top], backR, cover, {ends: dim}));
  const w = 2 * inner / seats, bw = 2 * inner / backs;
  for (let k = 0; k < seats; k++) cloth.push(...kit.cushion(at, [-inner + k * w + .005, -inner + (k + 1) * w - .005], [-hy + .03, hy - back], [base, seat], cover, {seed: pal.seed * 7 + k, sag: .35, skip: ['under']}));
  for (let k = 0; k < backs; k++) {
    const lean = kit.moved(at, [-inner + (k + .5) * bw, hy - back, seat - .02], {tilt: 1.32 + (pal.random(30 + k) - .5) * .08});
    cloth.push(...kit.cushion(lean, [-bw / 2 + .01, bw / 2 - .01], [0, h - seat - .1], [0, .15], cover, {seed: pal.seed * 7 + 10 + k, bulge: .6, sag: .2, skip: ['under']}));
  }
  return {wood, cloth};
};
// A lamp's shade, an open cone from [radius, z] at its foot to [radius, z] at its top, drawn by the plain kit (its geometry is not weighed:
// the shades' one colour is set a frame), its form painted in by SHADE_FORM: banded up the cone, darker on the side away from `middle`
// (the [a, d] of its room's middle).
const shade = (plain, at, [r0, z0], [r1, z1], colour, middle) => {
  const {bands, away} = SHADE_FORM, [a, d] = at(0, 0, 0), toward = Math.atan2(middle[1] - d, middle[0] - a);
  const side = p => { const facing = Math.cos(Math.atan2(p[1] - d, p[0] - a) - toward); return away + (1 - away) * (.5 + .5 * facing); };
  return plain.turned(at, [0, 0], bands.map(([t]) => [r0 + (r1 - r0) * t, z0 + (z1 - z0) * t]), (p, k) => colour(p).map(c => c * bands[k][1] * side(p)), {segments: 14});
};
const middleOf = (I, id) => { const r = I.rooms.find(x => x.id === id); return [(r.a[0] + r.a[1]) / 2, (r.d[0] + r.d[1]) / 2]; };
// The inside of an open turned piece (profile points from `from` on) darker than its outside.
const lined = (colour, from) => (p, k) => k >= from ? colour(p).map(c => c * TUCK) : colour(p);

// The stair's newel at its foot, a handrail from it up the flight's open side and a baluster on each tread beneath it (kit, the interior,
// the stair's tread count and the wood's tint). The rail's middle runs `height` above the treads' line on the flight's edge, a = stair.a[0],
// to where its top meets the ground ceiling, under the landing's own rail; it is weighed in the room the newel stands in.
export function stairRail(kit, I, {treads, colour}) {
  const R = I.stairRail, [a0] = I.stair.a, [d0, d1] = I.stair.d, rise = I.floorRise, run = (d1 - d0) / treads;
  const along = d => R.height + rise * (d - d0) / (d1 - d0), [na, nd] = R.newel, foot = along(nd), H = R.newelHeight;
  const at = kit.placed({at: [0, 0], room: roomAt(I, 0, R.newel)?.id}), wood = [];
  // the newel: a turned post with a block where the rail meets it, a neck and a cap
  const tile = RAIL_TILE;
  wood.push(...kit.turned(at, [na, nd], [[0, 0], [.06, 0], [.06, 0], [.06, .12], [.048, .16], [.045, foot - .16], [.078, foot - .1], [.078, foot - .1], [.078, foot + .1],
    [.078, foot + .1], [.05, foot + .13], [.045, H - .12], [.07, H - .08], [.07, H - .045], [.045, H - .015], [0, H]], colour, {segments: 10, tile}));
  // the rail, from inside the newel's block to the ceiling
  const end = Math.min(R.ends, d0 + (I.groundCeiling - RAIL_RADIUS - R.height) * (d1 - d0) / rise);
  wood.push(...kit.roll(at, [a0, nd, foot], [a0, end, along(end)], RAIL_RADIUS, colour, {sides: 6, tile}));
  // a baluster on each tread whose middle is under the rail, from the tread up into the rail's middle
  for (let k = 0; k < treads; k++) {
    const d = d0 + (k + .5) * run, z0 = (k + 1) * rise / treads, top = along(d);
    if (d >= Math.min(R.ends, end)) break;
    wood.push(...kit.turned(at, [a0, d], [[0, z0], [.02, z0], [.02, z0], [.02, z0 + .05], [.014, z0 + .08], [.013, top - .06], [.018, top - .035], [0, top]], colour, {segments: 6, tile}));
  }
  return {wood};
}

export const RECIPES = {
  rug: rug('rugRed', 'rugRed', .16),
  runner: rug('slate', 'slate', .09),
  doormat: rug('ochre', 'ochre', .06),
  'low-table': table({colour: 'darkOak', top: .04, leg: .025, inset: .07}),
  'side-table': table({colour: 'oak', leg: .02, inset: .05}),
  console: table({colour: 'darkOak', leg: .022, inset: .05, shelf: .18}),
  // A carcass open at the front with its insides darkened, an upright in the middle, five shelves (the lowest a plinth) and books.
  bookshelf(kit, e, pal) {
    const [hx, hy] = halves(e), h = KINDS[e.kind].height, at = kit.placed(e), wood = pal.oak(0, .07), T = .03;
    const shut = {tuck: ['under', 'back', 'left', 'right']};
    const carcass = [...kit.box(at, [-hx, hx], [-hy, hy], [0, h], wood, {hollow: T, tuck: ['inside', 'back'], seed: pal.seed}),
      ...kit.board(at, [-T / 2, T / 2], [-hy + .01, hy - T], [T, h - T], wood, {tuck: ['left', 'right', 'back']})];
    const shelves = [.1, .5, .9, 1.3, 1.7], spines = -hy + .025;
    const covers = [pal.rugRed(2, .12, .8), pal.ochre(3, .12, .85), pal.blue(4, .12, .8), pal.green(5, .12, .85), pal.linen(6, .06, .8), pal.darkOak(7, .1, 1.2)];
    const cloth = [];
    shelves.forEach((z, k) => {
      for (const [x0, x1] of [[-hx + T, -T / 2], [T / 2, hx - T]]) {
        carcass.push(...kit.board(at, [x0, x1], [-hy + .008, hy - T], [z - .03, z], wood, shut));
        const room = (shelves[k + 1] ?? h - T) - z - (k + 1 < shelves.length ? .03 : 0);
        cloth.push(...kit.books(at, [x0, x1], spines, z, {height: Math.min(.3, room * .8), seed: pal.seed * 10 + k * 2 + (x0 < 0 ? 0 : 1), colours: covers}));
      }
    });
    return {wood: carcass, cloth};
  },
  // A boxed bench under the casement: a darker plinth set back, the painted body with two fielded panels on its front (stiles and rails
  // standing proud, their undersides in shadow), a seat board overhanging it, and a long squab cushion over the board, sagging where it is
  // sat on. The loose cushions sit on the squab (WINDOW_SQUAB high).
  'window-seat'(kit, e, pal) {
    const [hx, hy] = halves(e), h = KINDS[e.kind].height - WINDOW_SQUAB, at = kit.placed(e), paint = pal.linen(0, .06, .78), seat = pal.oak(1, .07);
    const front = -hy + .04, proud = front - .02, frame = {tuck: ['under'], skip: ['back']}, base = .09, top = h - .035, mid = (base + top) / 2;
    const wood = [...kit.box(at, [-hx + .02, hx - .02], [-hy + .08, hy], [0, base], paint, {tuck: ['front', 'left', 'right', 'top'], skip: ['under', 'back'], broken: 0}),
      ...kit.box(at, [-hx + .015, hx - .015], [front, hy], [base, top], paint, {skip: ['under', 'back'], seed: pal.seed}),
      ...kit.box(at, [-hx, hx], [-hy, hy], [top, h], seat, {tuck: ['under'], skip: ['back'], seed: pal.seed + 1})];
    // the panels' frame: a rail along the foot and the head, a stile at each end and one between
    for (const [z0, z1] of [[base, base + .06], [top - .06, top]]) wood.push(...kit.board(at, [-hx + .015, hx - .015], [proud, front], [z0, z1], paint, frame));
    for (const x of [-hx + .015, -.035, hx - .085]) wood.push(...kit.board(at, [x, x + .07], [proud, front], [base + .06, top - .06], paint, frame));
    // (the panels themselves, the body's front between them, a shade darker, as a recess holds a little shadow)
    wood.push(...[[-hx + .085, -.035], [.035, hx - .085]].flatMap(([x0, x1]) => kit.board(at, [x0, x1], [front - .002, front], [base + .06, top - .06], pal.linen(2, .05, .56), {skip: ['back', 'under', 'top', 'left', 'right']})));
    const squab = kit.cushion(at, [-hx + .03, hx - .03], [-hy + .015, hy - .02], [h, h + WINDOW_SQUAB], pal.ochre(3, .06, .82), {seed: pal.seed + 2, bulge: .7, sag: .6, skip: ['under']});
    return {wood, cloth: squab};
  },
  // A seat board, two ends and an open shelf beneath; its back, under the coats, darkened.
  'boot-bench'(kit, e, pal) {
    const [hx, hy] = halves(e), h = KINDS[e.kind].height, at = kit.placed(e), wood = pal.darkOak(0, .08), T = .04;
    return {wood: [...kit.box(at, [-hx, hx], [-hy, hy], [h - T, h], wood, {tuck: ['under', 'back'], seed: pal.seed}),
      ...kit.board(at, [-hx + .02, -hx + .02 + T], [-hy + .02, hy - .02], [0, h - T], wood, {tuck: ['back', 'right']}),
      ...kit.board(at, [hx - .02 - T, hx - .02], [-hy + .02, hy - .02], [0, h - T], wood, {tuck: ['back', 'left']}),
      ...kit.board(at, [-hx + .02 + T, hx - .02 - T], [-hy + .04, hy - .04], [.1, .125], wood, {tuck: ['under', 'back']})]};
  },
  // A board on the wall and a peg every 28 cm or so, each a short post standing out of the board.
  hooks(kit, e, pal) {
    const at = kit.placed(e), w = (e.along[1] - e.along[0]) / 2, h = KINDS[e.kind].height / 2, z = e.z, wood = pal.oak(0, .07), pegs = pal.darkOak(1, .06);
    const out = kit.box(at, [-w, w], [-.025, 0], [z - h, z + h], wood, {skip: ['back'], seed: pal.seed});
    for (const x of pegsOf(e).xs) {
      const peg = (u, v, s) => at(x + u, -.025 - s, z + v);   // the peg's z runs out of the board
      out.push(...kit.post(peg, [0, 0], [0, .07], .012, pegs));
    }
    return {wood: out};
  },
  picture(kit, e, pal) {
    const k = pal.seed % 3, frame = [pal.darkOak(0, .06), pal.ochre(0, .06, .8), pal.oak(0, .06)][k];
    const panels = [[pal.blue(1, .14, 1.1), pal.green(2, .14)], [pal.linen(1, .1, .9), pal.ochre(2, .14, .9)], [pal.blue(1, .14, 1.2), pal.rugRed(2, .14, .8)]][k];
    return {wood: kit.framed(e, frame, {panel: panels, split: [.58, .45, .62][k]})};
  },
  mirror: (kit, e, pal) => ({wood: kit.framed(e, pal.oak(0, .06), {panel: [pal.glass(1, .03), pal.glass(2, .03, .9)], frame: .06})}),
  // Lying on its parent's top, a little askew.
  book(kit, e, pal) {
    const at = kit.moved(kit.placed(e), [-.18, .04, 0], {turn: .35});
    return {cloth: kit.box(at, [-.08, .08], [-.115, .115], [0, .03], pal.blue(0, .1, .9), {skip: ['under'], seed: pal.seed})};
  },
  // A cup: a short post, its top the dark of the tea, and a handle.
  cup(kit, e, pal) {
    const at = kit.moved(kit.placed(e), [.22, -.08, 0], {turn: .8}), china = pal.linen(0, .04);
    return {wood: [...kit.post(at, [0, 0], [0, .085], .035, china, {tuck: ['top']}), ...kit.board(at, [.035, .055], [-.008, .008], [.025, .065], china, {skip: ['left']})]};
  },
  // A mantel clock: a dark case with a pale face.
  clock(kit, e, pal) {
    const at = kit.placed(e), h = KINDS[e.kind].height;
    return {wood: [...kit.box(at, [-.13, .13], [-.05, .05], [0, h], pal.darkOak(0, .06), {skip: ['under'], seed: pal.seed}),
      ...kit.board(at, [-.08, .08], [-.056, -.05], [h * .25, h * .9], pal.linen(1, .03), {skip: ['back']})]};
  },
  sofa: upholstered,
  armchair: upholstered,
  // A turned stem on a weighted foot, a fitting at its top and the shade over it.
  'standing-lamp'(kit, e, pal, {plain, interior}) {
    const at = kit.placed(e), h = KINDS[e.kind].height, wood = pal.darkOak(0, .07), top = h - .25;
    return {wood: kit.turned(at, [0, 0], [[0, 0], [.13, 0], [.13, 0], [.135, .015], [.12, .035], [.05, .05], [.03, .08], [.02, .12], [.016, .14], [.016, top - .05],
      [.024, top - .04], [.024, top - .01], [.012, top], [0, top]], wood, {segments: 10}),
      shades: shade(plain, at, [.165, h - .33], [.11, h - .02], pal.shade(1), middleOf(interior, e.room))};
  },
  // A rounded pot of a base on its table, a short stem and the shade.
  'table-lamp'(kit, e, pal, {plain, interior}) {
    const at = kit.moved(kit.placed(e), [-.04, .05, 0]), h = KINDS[e.kind].height, pot = pal.blue(0, .08, .9);
    return {wood: kit.turned(at, [0, 0], [[0, 0], [.055, 0], [.055, 0], [.072, .03], [.078, .08], [.06, .14], [.026, .17], [.014, .19], [.014, .26], [0, .26]], pot, {segments: 10}),
      shades: shade(plain, at, [.14, .22], [.09, h - .02], pal.shade(1), middleOf(interior, e.room))};
  },
  // A woven basket, open, its inside darker, and four logs across it, their cut ends paler than their bark.
  'log-basket'(kit, e, pal) {
    const at = kit.placed(e), weave = pal.ochre(0, .1, .7), bark = pal.darkOak(1, .1), cut = pal.oak(2, .08, .95), j = k => (pal.random(k) - .5) * .02;
    const wood = kit.turned(at, [0, 0], [[0, 0], [.17, 0], [.17, 0], [.2, .04], [.215, .27], [.222, .3], [.205, .305], [.2, .29], [.18, .05], [0, .05]], lined(weave, 7));
    for (const [k, [from, to, r]] of [[[-.19, -.06, .12], [.19, -.04, .15], .055], [[-.18, .07, .13], [.17, .08, .12], .05], [[-.17, -.01, .26], [.19, .03, .28], .06],
      [[-.12, .1, .3], [.16, -.08, .35], .045]].entries())
      wood.push(...kit.roll(at, from.map((v, i) => v + j(k * 6 + i)), to.map((v, i) => v + j(k * 6 + 3 + i)), r, bark, {sides: 6, ends: cut}));
    return {wood};
  },
  // A stand with a weighted foot, a crossbar at its top, and three irons (poker, tongs, shovel) hanging from it, brass-handled.
  'fire-irons'(kit, e, pal) {
    const at = kit.placed(e), h = KINDS[e.kind].height, iron = pal.darkOak(0, .05, .45), brass = pal.ochre(1, .06, .8);
    const out = [...kit.box(at, [-.08, .08], [-.08, .08], [0, .025], iron, {skip: ['under'], seed: pal.seed}), ...kit.post(at, [0, .055], [.025, h - .04], .01, iron),
      ...kit.board(at, [-.075, .075], [.045, .065], [h - .08, h - .065], iron)];
    [-.055, 0, .055].forEach((x, k) => out.push(...kit.post(at, [x, .03], [.05 + .02 * k, h - .1], .006, iron),
      ...kit.box(at, [x - .012, x + .012], [.018, .042], [h - .1, h - .02], brass, {skip: ['under'], broken: .003})));
    out.push(...kit.board(at, [.02, .09], [.015, .035], [.03, .11], iron));   // the shovel's blade
    return {wood: out};
  },
  // A painted tin stand, open, its inside darker, with a walking stick and a furled umbrella in it.
  'umbrella-stand'(kit, e, pal) {
    const at = kit.placed(e), tin = pal.green(0, .08, .7);
    return {wood: [...kit.turned(at, [0, 0], [[0, 0], [.12, 0], [.12, 0], [.125, .02], [.13, .48], [.138, .5], [.125, .505], [.12, .49], [.115, .03], [0, .03]], lined(tin, 7), {segments: 10}),
      ...kit.roll(at, [-.03, .02, .04], [-.07, .05, .58], .012, pal.darkOak(1, .06), {sides: 6}),
      ...kit.roll(at, [.03, -.02, .04], [.05, -.06, .575], .026, pal.rugRed(2, .08, .6), {sides: 7, ends: pal.darkOak(3, .06)})]};
  },
  // A blue-glazed jug on the mantel toward its front-wall end, with a handle.
  jug(kit, e, pal) {
    const at = kit.moved(kit.placed(e), [-.8, 0, 0]), glaze = pal.blue(0, .06, 1.15);   // (blue, so it does not sink into the breast's stone)
    return {stone: [...kit.turned(at, [0, 0], [[0, 0], [.05, 0], [.05, 0], [.062, .03], [.07, .09], [.064, .15], [.048, .2], [.046, .225], [.054, .25], [.046, .25], [.04, .23], [0, .23]],
      lined(glaze, 9), {segments: 10, tile: STONE_TILE}),
      ...kit.roll(at, [.06, 0, .2], [.1, 0, .17], .01, glaze, {sides: 5, tile: STONE_TILE}), ...kit.roll(at, [.1, 0, .17], [.066, 0, .07], .01, glaze, {sides: 5, tile: STONE_TILE})]};
  },
  // A brass candlestick with its candle, either side of the clock.
  candlestick(kit, e, pal) {
    const at = kit.moved(kit.placed(e), [((e.index || 0) - ((e.count || 1) - 1) / 2) * .9, 0, 0]), brass = pal.ochre(0, .06, .8), wax = pal.linen(1, .04);
    const profile = [[0, 0], [.045, 0], [.045, 0], [.045, .012], [.03, .02], [.014, .04], [.012, .15], [.026, .16], [.026, .17], [.01, .17], [.01, .17], [.01, .25], [0, .25]];
    return {stone: kit.turned(at, [0, 0], profile, (p, k) => (k >= 10 ? wax : brass)(p), {segments: 8, tile: STONE_TILE})};
  },
  // A coat hung on its peg: a sheet from the collar out over the shoulders, in at the waist and out to the hem, standing off the wall more
  // in the middle (less down its opening), folded toward the hem; each coat on its peg (the hat has the middle one), the second standing
  // farther out where it overlaps the first.
  coat(kit, e, pal) {
    const hooks = e.parent, i = e.index || 0, pegs = pegsOf(hooks).coats, x0 = pegs[i % pegs.length], at = kit.placed(e), top = hooks.z + .03, long = KINDS.coat.height - .05;
    const stand = [.03, .13, .03][i % 3], [colour, times] = [['green', .65], ['darkOak', 1.3], ['blue', .7]][i % 3];
    const pointOf = (s, t) => {
      const wide = .14 + .32 * smooth(t / .12) - .05 * Math.sin(Math.PI * Math.min(1, t / .85)) + .08 * smooth((t - .5) / .5), body = .35 + .65 * smooth(t / .3);
      const opening = 1 - .35 * smooth((t - .1) / .1) * Math.exp(-(((s - .5) / .07) ** 2));
      return [x0 + (.5 - s) * wide, -(.02 + (stand + .08 * Math.sin(Math.PI * s) * opening) * body), top - long * t];
    };
    return {cloth: kit.drape(at, pointOf, .5, long, pal[colour](0, .08, times), {seed: pal.seed, folds: .04})};
  },
  // A felt hat hung crown up on the middle peg (the peg under its brim, inside the crown), tipped toward the room.
  hat(kit, e, pal) {
    const hooks = e.parent, at = kit.moved(kit.placed(e), [pegsOf(hooks).hat, -.17, hooks.z + .02], {tilt: .45});
    return {cloth: kit.turned(at, [0, 0], [[.085, 0], [.16, 0], [.165, .008], [.16, .014], [.09, .016], [.088, .02], [.085, .08], [.078, .11], [.06, .12], [0, .125]],
      pal.darkOak(0, .08, .9), {segments: 10})};
  },
  // A throw over the sofa's (or chair's) arm at its +x end, toward the front: from the seat up the arm's inside, over its roll and down its
  // outside, resting on the roll and folding where it hangs.
  throw(kit, e, pal) {
    const parent = e.parent;
    if (!UPHOLSTERY[parent?.kind]) throw new Error('a throw goes over a sofa\'s or chair\'s arm');
    const [hx, hy] = halves(parent), seat = KINDS[parent.kind].seat, {armR, armTop} = upholsteryOf(parent), at = kit.moved(kit.placed(e), [0, 0, -seat]);
    const off = .012, R = armR + off, cx = hx - armR, inside = armTop - seat - .04, over = Math.PI * R, hang = .32, length = inside + over + hang, [y0, y1] = [-hy + .08, .06];
    const path = l => l < inside ? [hx - 2 * armR - off, seat + .04 + l] : l < inside + over ? [cx + R * Math.cos(Math.PI - (l - inside) / R), armTop + R * Math.sin(Math.PI - (l - inside) / R)]
      : [hx + off, armTop - (l - inside - over)];
    const pointOf = (s, t) => { const [x, z] = path(t * length); return [x, y1 - (y1 - y0) * s, z]; };
    const free = (s, t) => { const l = t * length; return l < inside ? .5 * (1 - l / inside) : l < inside + over ? 0 : (l - inside - over) / hang; };
    return {cloth: kit.drape(at, pointOf, y1 - y0, length, pal.ochre(0, .1, .78), {seed: pal.seed, free, folds: .05, cell: .07})};
  },
  // A pair of boots on the bench's lower shelf, toes out: a foot and a shaft each.
  boots(kit, e, pal) {
    const at = kit.placed(e), bench = KINDS[e.parent.kind], shelf = .125 - (bench.seat ?? bench.height), leather = pal.darkOak(0, .08, .75), out = [];
    for (const [k, x] of [.06, .19].entries()) {
      const skew = kit.moved(at, [x, 0, shelf], {turn: (pal.random(k) - .5) * .2});
      out.push(...kit.box(skew, [-.05, .05], [-.13, .12], [0, .08], leather, {skip: ['under'], seed: pal.seed + k}),
        ...kit.box(skew, [-.045, .045], [.02, .12], [.08, .26], leather, {skip: ['under'], tuck: ['back'], seed: pal.seed + k + 2}));
    }
    return {wood: out};
  },
  newel: (kit, e, pal, {interior, treads}) => stairRail(kit, interior, {treads, colour: pal.walnut(0, .05)}),
  // A cushion on its parent: lying flat on a window seat (or anything else), standing up against the back on a sofa or chair.
  cushion(kit, e, pal) {
    const kind = e.parent?.kind, n = e.count || 1, i = e.index || 0, at = kit.placed(e), jitter = k => (pal.random(k) - .5);
    const colours = {sofa: ['ochre', 'rugRed', 'linen'], armchair: ['blue', 'ochre'], 'window-seat': ['blue', 'green']}[kind] ?? ['linen'];
    const colour = pal[colours[(i + pal.seed) % colours.length]](0, .1, .9);
    if (kind === 'sofa' || kind === 'armchair') {
      // (leaning on the back cushions' fronts, which stand about 0.1 m in front of the middle)
      const spread = kind === 'sofa' ? .58 : 0, x = (i - (n - 1) / 2) * spread + jitter(1) * .06, back = -.03;
      const upright = kit.moved(at, [x, back, 0], {turn: jitter(2) * .2, tilt: 1.15 + jitter(3) * .15});
      return {cloth: kit.cushion(upright, [-.22, .22], [0, .42], [0, .15], colour, {seed: pal.seed})};
    }
    // on the window seat: plump and square, askew; the first propped against the wall (the seat's +y side), the rest lying on the squab
    if (kind === 'window-seat') {
      const hy = halves(e.parent)[1], x = (i - (n - 1) / 2) * .7 + jitter(1) * .06;
      const pose = i % 2 ? kit.moved(at, [x, jitter(2) * .05 - .16, 0], {turn: .3 + jitter(3) * .3, tilt: .1}) : kit.moved(at, [x, hy - .3, 0], {turn: jitter(3) * .2, tilt: .5});
      return {cloth: kit.cushion(pose, [-.18, .18], [0, .32], [0, .14], colour, {seed: pal.seed, bulge: .8, sag: .4, taper: .6, cuts: 4})};
    }
    const x = (i - (n - 1) / 2) * .62 + jitter(1) * .05, flat = kit.moved(at, [x, jitter(2) * .04, 0], {turn: jitter(3) * .25});
    return {cloth: kit.cushion(flat, [-.26, .26], [-.19, .19], [0, .12], colour, {seed: pal.seed})};
  },
};

// `treads` is the stair's tread count (buildInterior's), which the newel's balusters follow.
// `weightsAt(point, normal, roomId)` is the light field's weights at a point of the interior frame, in that room.
export function buildFurniture(THREE, {interior: I, art, light, face, lit, tint, tints, materials, treads, weightsAt = () => ({day: 0, lamp: 0, fire: 0, room: -1, spill: 0, spillRoom: -1})}) {
  const kit = createKit(THREE, {face, lit, tint}), plain = createKit(THREE, {face, lit: g => g, tint}), byId = new Map(I.furniture.map(e => [e.id, e])), rooms = new Map(I.rooms.map(r => [r.id, r]));
  const colours = light ? COLOURS : Object.fromEntries(Object.entries(COLOURS).map(([k, c]) => [k, c.map(v => v / FLAT)]));
  const paletteFor = seed => ({seed, random: k => hash(k, 11, seed),
    // the shades' own: pale and neutral, not lit by the room's weights, so not taken back by the flat light's ratio
    shade: (k = 0, spread = .04) => tint([1, 1, 1], seed + k, spread),
    ...Object.fromEntries(Object.entries(colours).map(([name, c]) => [name, (k = 0, spread = .08, times = 1) => tint(c.map(v => v * times), seed + k, spread)]))});

  // Where an entry stands: the entry with `at`, `turn` and `lift` (and, set on a piece, its parent and its place among its kind
  // there), or null when it cannot be placed.
  const resolve = (entry, depth = 0) => {
    const k = KINDS[entry?.kind], room = rooms.get(entry?.room);
    if (!k || !room || depth > 2) return null;
    const floor = room.floor * I.floorRise;
    if (k.standing === 'solid' || k.standing === 'walk-over') return Array.isArray(entry.at) ? {...entry, turn: entry.turn || 0, lift: floor} : null;
    if (k.standing === 'wall-hung') {
      // on the wall's face on the room's side, facing the room
      const axis = entry.wall === 'a' ? 'a' : 'd', side = room[axis][0] >= entry.line - 1e-6 ? 1 : -1, onFace = entry.line + side * I.wall / 2, mid = (entry.along[0] + entry.along[1]) / 2;
      return axis === 'a' ? {...entry, at: [onFace, mid], turn: side * Math.PI / 2, lift: floor} : {...entry, at: [mid, onFace], turn: side > 0 ? Math.PI : 0, lift: floor};
    }
    const siblings = I.furniture.filter(x => x.on === entry.on && x.kind === entry.kind), place = {index: siblings.indexOf(entry), count: siblings.length};
    if (entry.on === 'mantel') {
      const fp = I.fireplace;
      return {...entry, ...place, at: [fp.a + fp.breast.depth - MANTEL.into + MANTEL.depth / 2, fp.d], turn: Math.PI / 2, lift: floor + fp.mantel, parent: {kind: 'mantel'}};
    }
    const parent = resolve(byId.get(entry.on), depth + 1);
    if (!parent) return null;
    const pk = KINDS[parent.kind];
    return {...entry, ...place, at: parent.at, turn: parent.turn, lift: pk.standing === 'wall-hung' ? parent.lift : parent.lift + (pk.seat ?? pk.height), parent};
  };

  // Every piece's geometries by mesh, and the range of vertices each piece has in each.
  const lists = {wood: [], cloth: [], stone: [], shades: []}, counts = {wood: 0, cloth: 0, stone: 0, shades: 0}, ranges = new Map(), skipped = [], scene = {interior: I, treads, plain};
  for (const entry of I.furniture) {
    const recipe = Object.hasOwn(RECIPES, entry?.kind) ? RECIPES[entry.kind] : null;
    if (!recipe) { skipped.push(`${entry?.id} (no recipe for ${entry?.kind})`); continue; }
    let made;
    try {
      const where = resolve(entry);
      if (!where) throw new Error('it cannot be placed');
      made = recipe(kit, where, paletteFor(idSeed(entry.id)), scene);
      for (const k of Object.keys(made)) if (!lists[k]) throw new Error(`no mesh for ${k}`);
    } catch (error) { skipped.push(`${entry.id} (${error?.message ?? error})`); continue; }
    const own = [];
    for (const [k, list] of Object.entries(made)) {
      const count = list.reduce((t, g) => t + g.getAttribute('position').count, 0);
      own.push({mesh: MESHES[k], first: counts[k], count}); lists[k].push(...list); counts[k] += count;
    }
    ranges.set(entry.id, own);
  }
  if (skipped.length) console.warn(`The cabin's furniture passed over ${skipped.length} piece(s) it could not draw: ${skipped.join(', ')}.`);

  const object = new THREE.Group(); object.name = 'furniture'; object.userData.pieces = ranges;
  // The stone's own material, as the fireplace's: lit over the stone brushwork (plain where the art has none), or Lambert when built unlit.
  const stoneMap = art?.surfaces?.stone ? {map: art.surfaces.stone} : {};
  let stone = lists.stone.length ? (light ? light.material(stoneMap) : new THREE.MeshLambertMaterial({...stoneMap, vertexColors: true})) : null;
  // The shades' own: one colour for the mesh, set by setLight; double-sided, as an open cone is seen inside and out.
  const shadeMaterial = lists.shades.length ? new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide, fog: false}) : null;
  const material = {wood: materials.surface, cloth: materials.leafed, stone, shades: shadeMaterial};
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const g = mergeGeometries(THREE, list); for (const x of list) x.dispose();
    const m = new THREE.Mesh(g, material[k]); m.name = MESHES[k]; object.add(m);
  }
  // A piece's box in the interior frame {a, d, z}, from its own vertices; null for a piece not drawn.
  const pieceBox = id => {
    const own = ranges.get(id);
    if (!own) return null;
    const box = {a: [Infinity, -Infinity], d: [Infinity, -Infinity], z: [Infinity, -Infinity]};
    for (const {mesh, first, count} of own) {
      const p = object.getObjectByName(mesh).geometry.getAttribute('position');
      for (let i = first; i < first + count; i++) for (const [k, v] of [['a', p.getX(i)], ['d', -p.getZ(i)], ['z', p.getY(i)]]) { box[k][0] = Math.min(box[k][0], v); box[k][1] = Math.max(box[k][1], v); }
    }
    return box;
  };
  // ── the grounding: one patch a solid piece, merged into one mesh ──
  // A walk-over piece (a rug) the piece's middle stands on: the patch lies just over its top, not under it.
  const rugs = I.furniture.filter(e => KINDS[e.kind]?.standing === 'walk-over' && ranges.has(e.id));
  const under = e => {
    const rug = rugs.find(r => { const [w, h] = sizeOf(r), c = Math.cos(r.turn || 0), s = Math.sin(r.turn || 0), x = e.at[0] - r.at[0], y = e.at[1] - r.at[1];
      return Math.abs(x * c + y * s) <= w / 2 && Math.abs(-x * s + y * c) <= h / 2; });
    return rug ? pieceBox(rug.id).z[1] : null;
  };
  const position = [], colour = [], index = [], grounded = new Map();
  const patchOf = e => {
    const room = rooms.get(e.room), first = position.length / 3, wall = I.wall / 2, z = (under(e) ?? room.floor * I.floorRise) + GROUND.lift;
    // (a vertex past a wall's face is brought to it, so the dark stops at the wall and shows nowhere past it, doorways included)
    const put = (a, d, alpha) => {
      position.push(Math.min(Math.max(a, room.a[0] + wall), room.a[1] - wall), z, -Math.min(Math.max(d, room.d[0] + wall), room.d[1] - wall)); colour.push(0, 0, 0, alpha);
    };
    // A triangle, wound to face up (three's y).
    const tri = (i, j, k) => {
      const at = n => [position[3 * (first + n)], position[3 * (first + n) + 2]], [A, B, C] = [i, j, k].map(at);
      (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]) >= 0 ? index.push(first + i, first + j, first + k) : index.push(first + i, first + k, first + j);
    };
    if (ROUND.includes(e.kind)) {
      // a fan of rings: dark to the middle ring, nothing at the rim
      const rings = [[0, GROUND.dark], [GROUND.disc * .45, GROUND.dark], [GROUND.disc, 0]], n = 14;
      put(e.at[0], e.at[1], GROUND.dark);
      for (const [r, alpha] of rings.slice(1)) for (let k = 0; k < n; k++) put(e.at[0] + r * Math.cos(2 * Math.PI * k / n), e.at[1] + r * Math.sin(2 * Math.PI * k / n), alpha);
      const at = (ring, k) => 1 + ring * n + k % n;
      for (let k = 0; k < n; k++) tri(0, at(0, k), at(0, k + 1));
      for (let k = 0; k < n; k++) { tri(at(0, k), at(1, k), at(1, k + 1)); tri(at(0, k), at(1, k + 1), at(0, k + 1)); }
    } else {
      // a 3 × 3 cut about the turned footprint, the middle cell the footprint drawn in
      const [w, h] = sizeOf(e), cs = Math.cos(e.turn || 0), sn = Math.sin(e.turn || 0), R = GROUND.reach, k = GROUND.inner;
      const cuts = half => [-(half + R), -Math.max(half - k, 0), Math.max(half - k, 0), half + R], us = cuts(w / 2), vs = cuts(h / 2);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const inner = i > 0 && i < 3 && j > 0 && j < 3;
        put(e.at[0] + us[i] * cs - vs[j] * sn, e.at[1] + us[i] * sn + vs[j] * cs, inner ? GROUND.dark : 0);
      }
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const v = 4 * j + i; tri(v, v + 1, v + 5); tri(v, v + 5, v + 4); }
    }
    grounded.set(e.id, {first, count: position.length / 3 - first});
  };
  for (const e of I.furniture) if (KINDS[e.kind]?.standing === 'solid' && ranges.has(e.id)) patchOf(e);
  let ground = null;
  if (grounded.size) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colour, 4)); g.setIndex(index);
    // Not lit: black with an alpha, blended over the floor (lifted just off it, and pulled toward the eye by its polygon offset) in the rooms'
    // own scene, never into the depth buffer, so it hides nothing drawn after it; nothing of it is in the overlay.
    ground = new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1}));
    ground.name = 'grounding'; ground.renderOrder = 0; object.add(ground);
  }
  object.userData.grounding = grounded;

  // ── the shades' colour ──
  // The room's light at each shade but for its own lamp, as an unlit glass takes it (fittings.js): weighed at the shade's middle over four
  // sideways facings, and the frame's sum of them by lightSum. A neighbour's lamp is not in it: the shade follows the living room's lamp alone.
  const sideways = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]], mean = (ws, k) => ws.reduce((t, w) => t + w[k], 0) / ws.length;
  const atShades = (() => {
    const mesh = object.getObjectByName(MESHES.shades), ws = [];
    for (const [id, own] of ranges) for (const r of own) {
      if (r.mesh !== MESHES.shades) continue;
      const p = mesh.geometry.getAttribute('position'), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = r.first; i < r.first + r.count; i++) [p.getX(i), -p.getZ(i), p.getY(i)].forEach((v, c) => { lo[c] = Math.min(lo[c], v); hi[c] = Math.max(hi[c], v); });
      const middle = lo.map((v, c) => (v + hi[c]) / 2);
      for (const n of sideways) ws.push(weightsAt(middle, n, byId.get(id).room));
    }
    return ws.length ? {day: mean(ws, 'day'), fire: mean(ws, 'fire'), lamp: 0, room: -1, spill: 0, spillRoom: -1} : null;
  })();
  // The dials as lightSum reads them, every value finite: refilled each frame, nothing allocated.
  const livingAt = I.rooms.findIndex(r => r.id === SHADE_ROOM), safe = {day: [0, 0, 0], fill: [0, 0, 0], fire: 0, lamps: new Float64Array(I.rooms.length)};
  function setLight(dials) {
    if (!shadeMaterial || !atShades) return;
    for (let c = 0; c < 3; c++) { safe.day[c] = finite(dials?.day?.[c]); safe.fill[c] = finite(dials?.fill?.[c]); }
    safe.fire = finite(dials?.fire); for (let i = 0; i < safe.lamps.length; i++) safe.lamps[i] = finite(dials?.lamps?.[i]);
    const level = clamp01(safe.lamps[livingAt] ?? 0), [r, g, b] = [0, 1, 2].map(c => SHADE_PALE[c] * lightSum(safe, atShades, c) * (1 - level) + SHADE_WARM[c] * level);
    shadeMaterial.color.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  }
  setLight();
  const vertices = object.children.reduce((t, m) => t + m.geometry.getAttribute('position').count, 0);
  return {object, counts: {vertices, meshes: object.children.length}, pieceBox,
    // The frame's dials: the lit surfaces follow them through the shell's materials; the shades' colour is set here, from the living room's
    // lamp and the light at the shades without it.
    setLight,
    // The lit surfaces given up (buildInterior's fallBack): wood and cloth take the shell's flat surface and its double-sided one, the
    // stone a Lambert of its own whose colour takes its lit tints back to the unlit ones. The shades and the grounding are not lit surfaces and carry on.
    fallBack(flat) {
      if (!light) return;
      if (stone) { stone.dispose(); stone = new THREE.MeshLambertMaterial({...stoneMap, vertexColors: true, color: new THREE.Color().setRGB(1 / FLAT, 1 / FLAT, 1 / FLAT, THREE.LinearSRGBColorSpace)}); }
      for (const m of object.children) if (m.name === MESHES.wood) m.material = flat.surface; else if (m.name === MESHES.cloth) m.material = flat.leafed; else if (m.name === MESHES.stone) m.material = stone;
    },
    dispose() { object.traverse(o => o.geometry?.dispose()); stone?.dispose(); shadeMaterial?.dispose(); ground?.material.dispose(); }};
}
