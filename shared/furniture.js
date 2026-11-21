// The kinds of furniture the cabin interior can hold, and what each takes up on the floor.
// Pure data and geometry: no three.js. Metres, in the interior frame (a, d).
// A piece faces its local −deep side; `turn` (radians, anticlockwise seen from above) rotates it about `at`.

const kind = (standing, size, height) => Object.freeze({standing, size: Object.freeze(size), height});
const solid = (size, height) => kind('solid', size, height);
const walkOver = (height) => kind('walk-over', [1, 1], height);
const wallHung = (height) => kind('wall-hung', [0, 0], height);
const setOn = (height) => kind('set-on', [0, 0], height);

export const KINDS = Object.freeze({
  sofa: solid([2.2, .9], .85),
  armchair: solid([.85, .85], .9),
  'low-table': solid([1.0, .6], .42),
  'side-table': solid([.45, .45], .55),
  console: solid([1.8, .35], .85),
  bookshelf: solid([2.6, .35], 2.1),
  'window-seat': solid([1.8, .48], .45),
  'standing-lamp': solid([.3, .3], 1.6),
  'log-basket': solid([.45, .45], .4),
  'fire-irons': solid([.2, .2], .7),
  'boot-bench': solid([1.25, .38], .45),
  'umbrella-stand': solid([.3, .3], .6),
  newel: solid([.12, .12], 1.1),
  rug: walkOver(.02),
  runner: walkOver(.015),
  doormat: walkOver(.015),
  hooks: wallHung(.1),
  picture: wallHung(.6),
  mirror: wallHung(.9),
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

// The same interior with no furniture, walked by the chimney breasts alone.
export const bareInterior = interior => Object.freeze({...interior, furniture: [], obstacles: interior.breasts});
