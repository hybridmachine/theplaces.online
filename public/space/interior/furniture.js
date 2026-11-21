import {KINDS} from '../../../shared/furniture.js';
import {mergeGeometries} from '../geometry.js';
import {hash} from '../scene/noise.js';
import {createKit} from './furniture-kit.js';
import {MANTEL} from './fireplace.js';

// The furniture of the furnished rooms (the blueprint's interior.furniture), drawn from the kit (furniture-kit.js) by one recipe per
// kind and merged into a few meshes by material: wood (the shell's lit `surface` material) and cloth (its double-sided `leafed` one).
// Where a piece stands comes from its entry: standing pieces at their `at` and `turn`, wall-hung ones on the face of their wall line,
// set-on ones on their parent (on a seat at the parent kind's `seat`, otherwise on its top) or on the fireplace's mantel. A piece
// whose kind has no recipe, whose parent cannot be found, or whose recipe throws, is passed over, with one warning for the whole
// build; the kinds still to be drawn (NOT_DRAWN_YET) are passed over quietly. Every irregularity comes from a seed of the entry's id.

// Linear tints, lit; the flat light's (built unlit) is each divided by the flat light's irradiance on a floor, as the shell's boards are.
const COLOURS = {oak: [1.05, .78, .5], darkOak: [.6, .42, .28], rugRed: [.95, .4, .3], ochre: [1.1, .85, .45], green: [.5, .62, .48], blue: [.5, .6, .75],
  linen: [1.2, 1.12, .95], glass: [.82, .9, .98]};
const FLAT = .89;
// The kinds whose recipes are not written yet: their entries are passed over without a warning.
const NOT_DRAWN_YET = new Set(['sofa', 'armchair', 'standing-lamp', 'table-lamp', 'log-basket', 'fire-irons', 'jug', 'candlestick', 'umbrella-stand', 'coat', 'hat',
  'throw', 'boots', 'newel']);
const MESHES = {wood: 'furniture-wood', cloth: 'furniture-cloth'};
const idSeed = id => [...String(id)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) % 100000;
// A piece's size: its entry's, or its kind's.
const sizeOf = e => e.size || KINDS[e.kind].size;
const halves = e => sizeOf(e).map(v => v / 2);

// ── the recipes: (kit, entry, palette) → {wood?: [geometry], cloth?: [geometry]} ──
// `entry` is resolved: `at`, `turn` and `lift` place it (kit.placed), a set-on one also carries its `parent` (resolved), its `index`
// among the pieces of its kind on that parent and their `count`. `palette.<colour>(k = 0, spread = .08, times = 1)` is that colour's
// tint function (times `times`), varied by the piece's seed plus k; `palette.seed` is the piece's seed and `palette.random(k)` a
// fixed number in [0, 1) from it.
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

export const RECIPES = {
  rug: rug('rugRed', 'rugRed', .16),
  runner: rug('blue', 'blue', .09),
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
  // A boxed bench under the casement: a darker plinth set back, the body, and a seat board on top.
  'window-seat'(kit, e, pal) {
    const [hx, hy] = halves(e), h = KINDS[e.kind].height, at = kit.placed(e), paint = pal.linen(0, .06, .78), seat = pal.oak(1, .07);
    return {wood: [...kit.box(at, [-hx + .02, hx - .02], [-hy + .05, hy], [0, .07], paint, {tuck: ['front', 'left', 'right', 'top'], skip: ['under', 'back'], broken: 0}),
      ...kit.box(at, [-hx, hx], [-hy + .02, hy], [.07, h - .04], paint, {skip: ['under', 'back'], seed: pal.seed}),
      ...kit.box(at, [-hx, hx], [-hy, hy], [h - .04, h], seat, {tuck: ['under'], skip: ['back'], seed: pal.seed + 1})]};
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
    const out = kit.box(at, [-w, w], [-.025, 0], [z - h, z + h], wood, {skip: ['back'], seed: pal.seed}), n = Math.max(2, Math.round(2 * w / .28));
    for (let k = 0; k < n; k++) {
      const x = -w + (k + .5) * 2 * w / n, peg = (u, v, s) => at(x + u, -.025 - s, z + v);   // the peg's z runs out of the board
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
  // A cushion on its parent: lying flat on a window seat (or anything else), standing up against the back on a sofa or chair.
  cushion(kit, e, pal) {
    const kind = e.parent?.kind, n = e.count || 1, i = e.index || 0, at = kit.placed(e), jitter = k => (pal.random(k) - .5);
    const colours = {sofa: ['ochre', 'rugRed', 'linen'], armchair: ['blue', 'ochre'], 'window-seat': ['blue', 'green']}[kind] ?? ['linen'];
    const colour = pal[colours[(i + pal.seed) % colours.length]](0, .1, .9);
    if (kind === 'sofa' || kind === 'armchair') {
      const spread = kind === 'sofa' ? .58 : 0, x = (i - (n - 1) / 2) * spread + jitter(1) * .06, back = kind === 'sofa' ? .12 : .1;
      const upright = kit.moved(at, [x, back, 0], {turn: jitter(2) * .2, tilt: 1.15 + jitter(3) * .15});
      return {cloth: kit.cushion(upright, [-.22, .22], [0, .42], [0, .15], colour, {seed: pal.seed})};
    }
    const x = (i - (n - 1) / 2) * .62 + jitter(1) * .05, flat = kit.moved(at, [x, jitter(2) * .04, 0], {turn: jitter(3) * .25});
    return {cloth: kit.cushion(flat, [-.26, .26], [-.19, .19], [0, .12], colour, {seed: pal.seed})};
  },
};

export function buildFurniture(THREE, {interior: I, art, light, face, lit, tint, tints, materials}) {
  const kit = createKit(THREE, {face, lit, tint}), byId = new Map(I.furniture.map(e => [e.id, e])), rooms = new Map(I.rooms.map(r => [r.id, r]));
  const colours = light ? COLOURS : Object.fromEntries(Object.entries(COLOURS).map(([k, c]) => [k, c.map(v => v / FLAT)]));
  const paletteFor = seed => ({seed, random: k => hash(k, 11, seed),
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
  const lists = {wood: [], cloth: []}, counts = {wood: 0, cloth: 0}, ranges = new Map(), skipped = [];
  for (const entry of I.furniture) {
    const recipe = Object.hasOwn(RECIPES, entry?.kind) ? RECIPES[entry.kind] : null;
    if (!recipe) { if (!NOT_DRAWN_YET.has(entry?.kind)) skipped.push(entry?.id); continue; }
    let made;
    try {
      const where = resolve(entry);
      if (!where) throw new Error('it cannot be placed');
      made = recipe(kit, where, paletteFor(idSeed(entry.id)));
      for (const k of Object.keys(made)) if (!lists[k]) throw new Error(`no mesh for ${k}`);
    } catch (error) { skipped.push(entry.id); continue; }
    const own = [];
    for (const [k, list] of Object.entries(made)) {
      const count = list.reduce((t, g) => t + g.getAttribute('position').count, 0);
      own.push({mesh: MESHES[k], first: counts[k], count}); lists[k].push(...list); counts[k] += count;
    }
    ranges.set(entry.id, own);
  }
  if (skipped.length) console.warn(`The cabin's furniture passed over ${skipped.length} piece(s) it could not draw: ${skipped.join(', ')}.`);

  const object = new THREE.Group(); object.name = 'furniture'; object.userData.pieces = ranges;
  const material = {wood: materials.surface, cloth: materials.leafed};
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const g = mergeGeometries(THREE, list); for (const x of list) x.dispose();
    const m = new THREE.Mesh(g, material[k]); m.name = MESHES[k]; object.add(m);
  }
  const vertices = object.children.reduce((t, m) => t + m.geometry.getAttribute('position').count, 0);
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
  return {object, counts: {vertices, meshes: object.children.length}, pieceBox,
    // The frame's dials: nothing of the furniture follows them yet (its light is the shell's, through its materials).
    setLight() {},
    // The lit surfaces given up (buildInterior's fallBack): wood and cloth take the shell's flat surface and its double-sided one.
    fallBack(flat) {
      if (!light) return;
      for (const m of object.children) m.material = m.name === MESHES.cloth ? flat.leafed : flat.surface;
    },
    dispose() { object.traverse(o => o.geometry?.dispose()); }};
}
