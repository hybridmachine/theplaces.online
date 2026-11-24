// The kinds of furniture the cabin interior can hold, and what each takes up on the floor.
// Pure data and geometry: no three.js. Metres, in the interior frame (a, d).
// A piece faces its local −deep side; `turn` (radians, anticlockwise seen from above) rotates it about `at`.

// `seat`, where a piece has one, is its seat's height (metres): what is set on it sits there rather than on its top.
const kind = (standing, size, height, extra = {}) => Object.freeze({standing, size: Object.freeze(size), height, ...extra});
const solid = (size, height, extra) => kind('solid', size, height, extra);
const walkOver = (height) => kind('walk-over', [1, 1], height);
const wallHung = (height) => kind('wall-hung', [0, 0], height);
const setOn = (height) => kind('set-on', [0, 0], height);

export const KINDS = Object.freeze({
  sofa: solid([2.2, .9], .85, {seat: .45}),
  armchair: solid([.85, .85], .9, {seat: .45}),
  'low-table': solid([1.0, .6], .42),
  'side-table': solid([.45, .45], .55),
  console: solid([1.8, .35], .85),
  bookshelf: solid([2.6, .35], 2.1),
  'window-seat': solid([1.8, .48], .45, {seat: .45}),
  'standing-lamp': solid([.3, .3], 1.6),
  'log-basket': solid([.45, .45], .4),
  'fire-irons': solid([.2, .2], .7),
  'boot-bench': solid([1.25, .38], .45),
  'umbrella-stand': solid([.3, .3], .6),
  newel: solid([.12, .12], 1.1),
  'sink-unit': solid([1.3, .6], .9),
  range: solid([1.0, .6], .9),
  worktop: solid([1.6, .6], .9),
  dresser: solid([1.2, .45], 2.0),
  'kitchen-table': solid([1.5, .8], .75),
  'dining-table': solid([1.8, .9], .75),
  chair: solid([.45, .45], .9, {seat: .45}),
  sideboard: solid([1.6, .45], .85),
  desk: solid([1.5, .7], .75),
  wardrobe: solid([1.0, .6], 2.0),
  'double-bed': solid([1.6, 2.05], 1.1, {seat: .55}),
  chest: solid([1.2, .45], .5),
  basin: solid([.6, .45], .85),
  toilet: solid([.45, .7], .8),
  shower: solid([.9, .9], 2.0),
  bathtub: solid([1.7, .75], .6),
  'wash-tub': solid([.9, .6], .85),
  'drying-rack': solid([1.0, .45], 1.2),
  basket: solid([.45, .45], .4),
  'pantry-shelf': solid([2.0, .35], 2.0),
  sack: solid([.5, .45], .6),
  crate: solid([.5, .45], .6),
  'single-bed': solid([1.05, 2.0], 1.0, {seat: .55}),
  'chest-of-drawers': solid([1.0, .5], .9),
  'small-desk': solid([1.2, .6], .75),
  daybed: solid([2.0, .9], .75, {seat: .45}),
  'floor-cushion': solid([.55, .55], .16),
  telescope: solid([.65, .65], 1.45),
  'eave-bookshelf': solid([3.0, .35], 1.88),
  'sloped-bookshelf': solid([1.45, .35], 2.40, {sloped: true, minHeight: 1.5}),
  rug: walkOver(.02),
  runner: walkOver(.015),
  doormat: walkOver(.015),
  'bath-mat': walkOver(.015),
  hooks: wallHung(.1),
  picture: wallHung(.6),
  mirror: wallHung(.9),
  'pan-rail': wallHung(.05),
  'towel-rail': wallHung(.05),
  'table-lamp': setOn(.45),
  cushion: setOn(.15),
  throw: setOn(.05),
  clock: setOn(.2),
  jug: setOn(.25),
  candlestick: setOn(.25),
  book: setOn(.04),
  cup: setOn(.09),
  coat: setOn(1.1),
  hat: setOn(.15),
  boots: setOn(.3),
  pan: setOn(.3),
  kettle: setOn(.22),
  cloth: setOn(.05),
  jar: setOn(.18),
  breadboard: setOn(.03),
  loaf: setOn(.1),
  bowl: setOn(.1),
  plates: setOn(.12),
  pillow: setOn(.14),
  blanket: setOn(.1),
  towel: setOn(.6),
});

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const occupies = k => k && (k.standing === 'solid' || k.standing === 'walk-over');
const sizeOf = (entry, k) => entry.size || k.size;

// The turned rectangle's four corners [a, d], anticlockwise, or null for anything with no floor footprint.
export function corners(entry) {
  const k = entry && has(KINDS, entry.kind) ? KINDS[entry.kind] : null;
  if (!occupies(k) || !Array.isArray(entry.at)) return null;
  const [w, h] = sizeOf(entry, k), turn = entry.turn || 0, c = Math.cos(turn), s = Math.sin(turn);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([u, v]) => [entry.at[0] + u * c - v * s, entry.at[1] + u * s + v * c]);
}

// The square-on rectangle that bounds the turned piece.
export function footprint(entry) {
  const pts = corners(entry);
  if (!pts) return null;
  const as = pts.map(p => p[0]), ds = pts.map(p => p[1]);
  return {a: [Math.min(...as), Math.max(...as)], d: [Math.min(...ds), Math.max(...ds)]};
}

// One obstacle per solid piece, on its room's floor; unknown kinds and rooms are skipped.
export function solidObstacles(interior) {
  const out = [];
  for (const entry of interior.furniture || []) {
    if (!entry || !has(KINDS, entry.kind) || KINDS[entry.kind].standing !== 'solid') continue;
    const room = (interior.rooms || []).find(r => r.id === entry.room), f = footprint(entry);
    if (room && f) out.push({floor: room.floor, a: f.a, d: f.d, id: entry.id});
  }
  return out;
}

export const obstaclesOf = interior => [...(interior.breasts || []), ...solidObstacles(interior)];

// The ids named and every piece set on one of them, directly or through a chain of `on`.
export function withDependents(furniture, ids) {
  const gone = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of furniture || []) if (e && e.on != null && !gone.has(e.id) && gone.has(e.on)) { gone.add(e.id); grew = true; }
  }
  return gone;
}

const frozenRect = o => Object.freeze({...o, a: Object.freeze([...o.a]), d: Object.freeze([...o.d])});
// The same interior without those pieces and whatever is set on them, its obstacles re-derived (obstaclesOf). A blueprint from before
// the furniture (no `breasts` field, its breasts stored in `obstacles`) keeps its own obstacles, less any of a piece taken away.
export function withoutPieces(interior, ids) {
  const gone = withDependents(interior.furniture, ids), out = {...interior};
  if (Array.isArray(interior.furniture)) out.furniture = Object.freeze(interior.furniture.filter(e => !gone.has(e?.id)));
  const obstacles = has(interior, 'breasts') ? obstaclesOf(out) : (interior.obstacles || []).filter(o => !gone.has(o.id));
  return Object.freeze({...out, obstacles: Object.freeze(obstacles.map(frozenRect))});
}

// The same interior with no furniture, walked by the chimney breasts alone.
export const bareInterior = interior => withoutPieces(interior, (interior.furniture || []).map(e => e?.id));

// Ids of the furniture entries whose room is one of roomIds.
export function piecesIn(interior, roomIds) {
  const rooms = new Set(roomIds || []);
  return (interior?.furniture || []).filter(e => e && rooms.has(e.room)).map(e => e.id);
}

// The same interior without those rooms' pieces (and whatever is set on them), its queues emptied unless keepQueue is set.
export function withoutRooms(interior, roomIds, {keepQueue = false} = {}) {
  const drop = new Set(roomIds || []);
  const filterQueue = list => keepQueue && Array.isArray(list)
    ? Object.freeze(list.filter(id => !drop.has(id))) : Object.freeze([]);
  const furnishLater = filterQueue(interior?.furnishLater);
  const furnishUpper = Array.isArray(interior?.furnishUpper) ? {furnishUpper: filterQueue(interior.furnishUpper)} : {};
  return Object.freeze({...withoutPieces(interior, piecesIn(interior, roomIds)), furnishLater, ...furnishUpper});
}
