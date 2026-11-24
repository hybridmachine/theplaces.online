// The cabin's interior in metres: `a` 0-18 along the front wall from the chimney end, `d` 0-12 back from the front wall, z up
// from the ground floor. Authored data only; the rules that say it is valid live in interior.js.
import {obstaclesOf} from './furniture.js';

const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;
const room = (id, name, floor, a, d) => ({id, name, floor, a, d});
// An opening in the wall on the line `line` = `at` between two rooms of one floor; `span` is its range along that wall.
const opening = (floor, rooms, line, at, span) => ({id: rooms.join('-'), floor, rooms, line, at, span});
const wallWindow = (id, room, wall, a, d) => ({id, room, kind: 'wall', wall, a, width: 1.4, sill: .8, height: 1.5});
const fitting = (room, kind, at) => ({room, kind, at});
const roofWindow = (id, room, a, width, d) => ({id, room, kind: 'roof', a, width, d});
// Furniture: a piece standing on the floor at `at` turned by `turn` (radians, anticlockwise seen from above; a piece faces its local −deep side,
// so turn 0 faces −d, π/2 faces +a, π faces +d and −π/2 faces −a); one hung on the wall line `line` of axis `wall`, over `along` at height `z`;
// or one set on another piece (or the mantel).
const standing = (id, kind, room, at, turn = 0, size) => ({id, kind, room, at, turn, ...(size ? {size} : {})});
const hung = (id, kind, room, wall, line, along, z) => ({id, kind, room, wall, line, along, z});
const setOn = (id, kind, room, on) => ({id, kind, room, on});
const many = (n, id, kind, room, on) => Array.from({length: n}, (_, i) => setOn(`${id}-${i + 1}`, kind, room, on));

// The two chimney breasts as solid rectangles of their floors.
const BREASTS = [{floor: 0, a: [0, .5], d: [2.5, 4.5]}, {floor: 1, a: [0, .4], d: [2.9, 4.1]}];
// The stair's newel at its foot corner, and its handrail: `height` above the treads, the newel `newelHeight` tall, ending at d = `ends`.
const STAIR_RAIL = {newel: [9.55, 1.42], height: .9, newelHeight: 1.1, ends: 3.84};
const FURNITURE = [
  // The living room: the fire group on the hearth rug, the casement's window seat, the bookshelf on the kitchen wall.
  standing('hearth-rug', 'rug', 'living', [2.6, 3.5], .03, [2.34, 1.93]),
  standing('low-table', 'low-table', 'living', [2.6, 3.5], Math.PI / 2),
  standing('sofa', 'sofa', 'living', [4.95, 3.5], -Math.PI / 2),                  // facing the fire
  standing('console', 'console', 'living', [5.575, 3.5], Math.PI / 2),            // against the sofa's back
  standing('armchair-front', 'armchair', 'living', [2.2, 1.7], Math.PI + .61),    // facing into the room, turned 35° toward the hearth
  standing('armchair-back', 'armchair', 'living', [2.3, 5.25], -.52),              // facing the front wall, turned 30° toward the hearth
  standing('side-table', 'side-table', 'living', [3.225, 1.525]),
  standing('window-seat', 'window-seat', 'living', [4.2, .315], Math.PI),
  standing('bookshelf', 'bookshelf', 'living', [1.8, 6.75]),
  standing('standing-lamp', 'standing-lamp', 'living', [3.3, 6.7]),
  standing('log-basket', 'log-basket', 'living', [.85, 5]),
  standing('fire-irons', 'fire-irons', 'living', [.65, 2.25]),
  hung('picture-1', 'picture', 'living', 'd', 0, [1.2, 2], 1.5),
  hung('picture-2', 'picture', 'living', 'a', 7, [5.6, 6.4], 1.5),
  hung('picture-3', 'picture', 'living', 'a', 0, [5.2, 6], 1.5),
  setOn('table-lamp', 'table-lamp', 'living', 'side-table'),
  setOn('clock', 'clock', 'living', 'mantel'), setOn('jug', 'jug', 'living', 'mantel'), ...many(2, 'candlestick', 'candlestick', 'living', 'mantel'),
  ...many(3, 'cushion-sofa', 'cushion', 'living', 'sofa'), setOn('cushion-armchair-front', 'cushion', 'living', 'armchair-front'),
  setOn('cushion-armchair-back', 'cushion', 'living', 'armchair-back'), ...many(2, 'cushion-window-seat', 'cushion', 'living', 'window-seat'),
  setOn('throw', 'throw', 'living', 'sofa'), setOn('book', 'book', 'living', 'low-table'), setOn('cup', 'cup', 'living', 'low-table'),
  // The hall: the bench and hooks behind the open leaf, the umbrella stand in its pocket, the runner to the dining room, the newel.
  standing('boot-bench', 'boot-bench', 'hall', [7.265, .975], Math.PI / 2),
  standing('umbrella-stand', 'umbrella-stand', 'hall', [8.05, .3]),
  standing('runner', 'runner', 'hall', [8.7, 3.9], .02, [.908, 4.58]),
  standing('doormat', 'doormat', 'hall', [9, .45], 0, [.9, .5]),
  standing('newel', 'newel', 'hall', STAIR_RAIL.newel),
  hung('hooks', 'hooks', 'hall', 'a', 7, [.35, 1.6], 1.6),
  hung('mirror', 'mirror', 'hall', 'a', 7, [5.6, 6.2], 1.5),
  ...many(3, 'coat', 'coat', 'hall', 'hooks'), setOn('hat', 'hat', 'hall', 'hooks'), setOn('boots', 'boots', 'hall', 'boot-bench'),
  // The kitchen: back-wall sink, range and worktop under a pan rail, dresser between the west doors, farmhouse table and two chairs.
  standing('sink-unit', 'sink-unit', 'kitchen', [3.25, 11.62]),
  standing('range', 'range', 'kitchen', [4.4, 11.62]),
  standing('worktop', 'worktop', 'kitchen', [5.7, 11.62]),
  standing('dresser', 'dresser', 'kitchen', [2.8, 9.5], Math.PI / 2),
  standing('kitchen-table', 'kitchen-table', 'kitchen', [4.75, 9.5]),
  standing('chair-kitchen-1', 'chair', 'kitchen', [4.35, 8.82], Math.PI + .06),
  standing('chair-kitchen-2', 'chair', 'kitchen', [5.15, 8.82], Math.PI - .1),
  hung('pan-rail', 'pan-rail', 'kitchen', 'd', 12, [4.65, 6.45], 1.75),
  ...many(5, 'pan', 'pan', 'kitchen', 'pan-rail'),
  setOn('kettle', 'kettle', 'kitchen', 'range'), setOn('cloth', 'cloth', 'kitchen', 'range'),
  ...many(3, 'jar', 'jar', 'kitchen', 'worktop'), setOn('breadboard', 'breadboard', 'kitchen', 'worktop'),
  setOn('bowl-kitchen', 'bowl', 'kitchen', 'kitchen-table'), setOn('loaf', 'loaf', 'kitchen', 'kitchen-table'),
  ...many(3, 'plates-dresser', 'plates', 'kitchen', 'dresser'), ...many(2, 'cup-dresser', 'cup', 'kitchen', 'dresser'),
  // The dining room: rug, table for six under the lamp, six chairs, sideboard left of the back window, two pictures on the east wall.
  standing('dining-rug', 'rug', 'dining', [9, 9.5], .02, [2.9, 3.6]),
  standing('dining-table', 'dining-table', 'dining', [9, 9.5], Math.PI / 2),
  standing('chair-dining-1', 'chair', 'dining', [8.30, 9.05], Math.PI / 2 + .05),
  standing('chair-dining-2', 'chair', 'dining', [8.30, 9.95], Math.PI / 2),
  standing('chair-dining-3', 'chair', 'dining', [9.70, 9.05], -Math.PI / 2),
  standing('chair-dining-4', 'chair', 'dining', [9.70, 9.95], -Math.PI / 2 - .08),
  standing('chair-dining-5', 'chair', 'dining', [9, 8.33], Math.PI),
  standing('chair-dining-6', 'chair', 'dining', [9, 10.67], 0),
  standing('sideboard', 'sideboard', 'dining', [8.3, 11.7]),
  hung('picture-4', 'picture', 'dining', 'a', 11, [8.2, 9.0], 1.5),
  hung('picture-5', 'picture', 'dining', 'a', 11, [9.9, 10.7], 1.5),
  setOn('jug-sideboard', 'jug', 'dining', 'sideboard'), setOn('plates-sideboard', 'plates', 'dining', 'sideboard'),
  ...many(2, 'candlestick-dining', 'candlestick', 'dining', 'dining-table'), setOn('bowl-dining', 'bowl', 'dining', 'dining-table'),
  // The study: desk and chair under the front window, two bookshelves on the back wall, reading corner, rug and gable picture.
  standing('study-rug', 'rug', 'study', [14.6, 2.3], .02, [3.0, 1.6]),
  standing('desk', 'desk', 'study', [13.8, .45], Math.PI),
  standing('chair-desk', 'chair', 'study', [13.8, 1.15], .04),
  standing('bookshelf-study-1', 'bookshelf', 'study', [13.4, 3.75]),
  standing('bookshelf-study-2', 'bookshelf', 'study', [16.1, 3.75]),
  standing('armchair-study', 'armchair', 'study', [17.0, 1.0], -Math.PI / 2 - .5),
  standing('side-table-study', 'side-table', 'study', [16.1, .5]),
  hung('picture-study', 'picture', 'study', 'a', 18, [1.8, 2.6], 1.5),
  setOn('desk-lamp', 'table-lamp', 'study', 'desk'),
  ...many(2, 'book-desk', 'book', 'study', 'desk'), setOn('cup-desk', 'cup', 'study', 'desk'),
  setOn('book-study-table', 'book', 'study', 'side-table-study'),
  // The closet passage: two wardrobes flanking the wall lamp, and a runner between the hall and bath doors.
  standing('wardrobe-passage-1', 'wardrobe', 'passage', [11.7, 4.375], Math.PI),
  standing('wardrobe-passage-2', 'wardrobe', 'passage', [13.3, 4.375], Math.PI),
  standing('passage-runner', 'runner', 'passage', [12.5, 5.6], .02, [1.8, .7]),
  // The master bedroom: double bed against the back wall with bedside tables and lamps, blanket chest, rug, gable wardrobes, pictures.
  standing('master-rug', 'rug', 'master', [14.5, 10.3], .02, [3.0, 3.2]),
  standing('bed', 'double-bed', 'master', [14.5, 10.9]),
  standing('bedside-1', 'side-table', 'master', [13.4, 11.65]),
  standing('bedside-2', 'side-table', 'master', [15.6, 11.65]),
  standing('blanket-chest', 'chest', 'master', [14.5, 9.55]),
  standing('wardrobe-master-1', 'wardrobe', 'master', [17.625, 9.0], -Math.PI / 2),
  standing('wardrobe-master-2', 'wardrobe', 'master', [17.625, 10.0], -Math.PI / 2),
  hung('picture-master-1', 'picture', 'master', 'd', 12, [14.1, 14.9], 1.6),
  hung('picture-master-2', 'picture', 'master', 'a', 11, [9.0, 9.8], 1.5),
  setOn('bedside-lamp-1', 'table-lamp', 'master', 'bedside-1'),
  setOn('bedside-lamp-2', 'table-lamp', 'master', 'bedside-2'),
  ...many(2, 'pillow', 'pillow', 'master', 'bed'),
  setOn('bed-blanket', 'blanket', 'master', 'bed'),
  setOn('book-bedside', 'book', 'master', 'bedside-1'),
  // The ground-floor bathroom: basin under mirror and toilet flanking the wall lamp, corner shower, roll-top bathtub, bath mat and towel rail.
  standing('basin', 'basin', 'bath-ground', [15.1, 4.3], Math.PI),
  standing('toilet', 'toilet', 'bath-ground', [16.7, 4.425], Math.PI),
  standing('shower', 'shower', 'bath-ground', [17.475, 4.525], Math.PI),
  standing('bathtub', 'bathtub', 'bath-ground', [16.3, 6.55]),
  standing('bath-mat', 'bath-mat', 'bath-ground', [16.3, 5.75], .03, [.9, .55]),
  hung('mirror-bath', 'mirror', 'bath-ground', 'd', 4, [14.8, 15.4], 1.5),
  hung('towel-rail', 'towel-rail', 'bath-ground', 'a', 18, [5.3, 6.1], 1.2),
  setOn('towel-rail-1', 'towel', 'bath-ground', 'towel-rail'),
  setOn('towel-tub', 'towel', 'bath-ground', 'bathtub'),
  setOn('jug-basin', 'jug', 'bath-ground', 'basin'),
  // The laundry: copper wash tub on a stand, standing drying rack with cloths, two baskets with folded linen.
  standing('wash-tub', 'wash-tub', 'laundry', [.9, 7.375], Math.PI),
  standing('drying-rack', 'drying-rack', 'laundry', [1.3, 9.2]),
  standing('basket-1', 'basket', 'laundry', [.3, 8.7]),
  standing('basket-2', 'basket', 'laundry', [.3, 9.2]),
  ...many(3, 'cloth-rack', 'cloth', 'laundry', 'drying-rack'),
  setOn('linen-basket', 'towel', 'laundry', 'basket-2'),
  // The pantry: two tall shelf units of jars facing each other, grain sacks and stacked wooden crates flanking the wall lamp.
  standing('pantry-shelf-1', 'pantry-shelf', 'pantry', [1.1, 9.75], Math.PI),
  standing('pantry-shelf-2', 'pantry-shelf', 'pantry', [1.1, 11.75]),
  standing('sacks', 'sack', 'pantry', [.325, 10.15]),
  standing('crates', 'crate', 'pantry', [.325, 11.35]),
  // The landing: cushioned window seat on the front wall east of the wall lamp, runner along the west walk, framed picture.
  standing('landing-seat', 'window-seat', 'landing', [9.8, .315], Math.PI),
  standing('landing-runner', 'runner', 'landing', [8.3, 3.5], .02, [.9, 3.8]),
  hung('picture-landing', 'picture', 'landing', 'a', 7, [1.2, 2.0], 1.5),
  ...many(2, 'cushion-landing', 'cushion', 'landing', 'landing-seat'),
  // The sky room: daybed with cushions and throw under the back roof window, rug, floor cushions and a brass tripod telescope aimed at the glass.
  standing('sky-rug', 'rug', 'sky-room', [3.5, 9.6], .01, [3.2, 2.8]),
  standing('daybed', 'daybed', 'sky-room', [3.5, 10.7]),
  standing('floor-cushion-1', 'floor-cushion', 'sky-room', [1.9, 9.5], .2),
  standing('floor-cushion-2', 'floor-cushion', 'sky-room', [2.4, 8.6], -.3),
  standing('telescope', 'telescope', 'sky-room', [4.9, 9.0], -1.91),
  ...many(2, 'cushion-daybed', 'cushion', 'sky-room', 'daybed'),
  setOn('throw-daybed', 'throw', 'sky-room', 'daybed'),
  // Bedroom 2: single bed under the front slope, bedside table and lamp, rug, chest of drawers under a mirror, corner chair and gable picture.
  standing('bed2-rug', 'rug', 'bedroom-2', [2.8, 1.9], .02, [2.2, 2.4]),
  standing('bed-2', 'single-bed', 'bedroom-2', [2.4, 1.075], Math.PI),
  standing('bed2-side-table', 'side-table', 'bedroom-2', [3.3, .35], Math.PI),
  standing('bed2-chest', 'chest-of-drawers', 'bedroom-2', [2.2, 6.65]),
  standing('bed2-chair', 'chair', 'bedroom-2', [.8, 1.4], Math.PI + .5),
  hung('mirror-bed2', 'mirror', 'bedroom-2', 'd', 7, [1.9, 2.5], 1.5),
  hung('picture-bed2', 'picture', 'bedroom-2', 'a', 0, [5.0, 5.8], 1.5),
  setOn('bed2-lamp', 'table-lamp', 'bedroom-2', 'bed2-side-table'),
  setOn('pillow-bed2', 'pillow', 'bedroom-2', 'bed-2'),
  setOn('blanket-bed2', 'blanket', 'bedroom-2', 'bed-2'),
  setOn('book-bed2', 'book', 'bedroom-2', 'bed2-side-table'),
  setOn('jug-bed2', 'jug', 'bedroom-2', 'bed2-chest'),
  // Bedroom 3: single bed under the front slope, bedside table and lamp, rug, small writing desk and chair in roof light, gable picture.
  standing('bed3-rug', 'rug', 'bedroom-3', [15.3, 1.9], -.02, [2.2, 2.4]),
  standing('bed-3', 'single-bed', 'bedroom-3', [15.8, 1.075], Math.PI),
  standing('bed3-side-table', 'side-table', 'bedroom-3', [14.9, .35], Math.PI),
  standing('bed3-desk', 'small-desk', 'bedroom-3', [11.375, 3.0], Math.PI / 2),
  standing('bed3-chair', 'chair', 'bedroom-3', [12.05, 3.0], -Math.PI / 2 - .08),
  hung('picture-bed3', 'picture', 'bedroom-3', 'a', 18, [3.0, 3.8], 1.5),
  setOn('bed3-lamp', 'table-lamp', 'bedroom-3', 'bed3-side-table'),
  setOn('pillow-bed3', 'pillow', 'bedroom-3', 'bed-3'),
  setOn('blanket-bed3', 'blanket', 'bedroom-3', 'bed-3'),
  setOn('cup-bed3', 'cup', 'bedroom-3', 'bed3-side-table'),
  ...many(2, 'book-bed3', 'book', 'bedroom-3', 'bed3-desk'),
];

const BLUEPRINT = {
  version: 1, size: [18, 12], wall: .15, eyeClear: .25,
  floorRise: 3.0, groundCeiling: 2.7, eaveCeiling: 1.9, ridgeCeiling: 3.6, ridgeAt: 6, doorHead: 2.1, roofReveal: .15,
  rooms: [
    room('living', 'living room', 0, [0, 7], [0, 7]),
    room('hall', 'entry hall', 0, [7, 11], [0, 7]),
    room('study', 'study', 0, [11, 18], [0, 4]),
    room('passage', 'closet passage', 0, [11, 14], [4, 7]),
    room('bath-ground', 'bathroom', 0, [14, 18], [4, 7]),
    room('laundry', 'laundry', 0, [0, 2.5], [7, 9.5]),
    room('pantry', 'pantry', 0, [0, 2.5], [9.5, 12]),
    room('kitchen', 'kitchen', 0, [2.5, 7], [7, 12]),
    room('dining', 'dining room', 0, [7, 11], [7, 12]),
    room('master', 'master bedroom', 0, [11, 18], [7, 12]),
    room('bedroom-2', 'second bedroom', 1, [0, 7], [0, 7]),
    room('landing', 'landing', 1, [7, 11], [0, 7]),
    room('bedroom-3', 'third bedroom', 1, [11, 18], [0, 7]),
    room('sky-room', 'sky room', 1, [0, 7], [7, 12]),
    room('nook', 'library nook', 1, [7, 11], [7, 12]),
    room('bath-upper', 'upstairs bathroom', 1, [11, 15], [7, 12]),
    room('box-room', 'box room', 1, [15, 18], [7, 9.5]),
    room('linen', 'linen cupboard', 1, [15, 18], [9.5, 12])
  ],
  openings: [
    opening(0, ['hall', 'living'], 'a', 7, [2, 5]),
    opening(0, ['hall', 'study'], 'a', 11, [.3, 1.3]),
    opening(0, ['hall', 'passage'], 'a', 11, [5.7, 6.7]),
    opening(0, ['hall', 'dining'], 'd', 7, [7.6, 10.4]),
    opening(0, ['living', 'kitchen'], 'd', 7, [3.5, 6]),
    opening(0, ['kitchen', 'dining'], 'a', 7, [7.5, 11.5]),
    opening(0, ['kitchen', 'laundry'], 'a', 2.5, [7.8, 8.8]),
    opening(0, ['kitchen', 'pantry'], 'a', 2.5, [10.2, 11.2]),
    opening(0, ['passage', 'bath-ground'], 'a', 14, [5, 6]),
    opening(0, ['passage', 'master'], 'd', 7, [12, 13]),
    opening(1, ['landing', 'bedroom-2'], 'a', 7, [3, 4]),
    opening(1, ['landing', 'bedroom-3'], 'a', 11, [5.7, 6.7]),
    opening(1, ['landing', 'nook'], 'd', 7, [7.5, 10.5]),
    opening(1, ['nook', 'sky-room'], 'a', 7, [9, 10]),
    opening(1, ['nook', 'bath-upper'], 'a', 11, [9, 10]),
    opening(1, ['bath-upper', 'linen'], 'a', 15, [10.2, 11.2]),
    opening(1, ['bedroom-3', 'box-room'], 'd', 7, [16, 17])
  ],
  // Foot at d = 1.5 on the ground floor, top at d = 5.4 on the upper floor.
  stair: {a: [9.6, 11], d: [1.5, 5.4]},
  door: {a: 9, width: 1},
  // The front door's leaf, fully open: hinged on the living-room edge of the doorway (a = door.a - width/2) and standing into the hall.
  doorLeaf: {a: 8.5, d: [0, 1], thick: .05},
  windows: [
    wallWindow('living', 'living', 'front', 4.2),
    wallWindow('study', 'study', 'front', 13.8),
    wallWindow('dining', 'dining', 'back', 10),
    roofWindow('bedroom-2', 'bedroom-2', 3.5, 1, [2, 3.4]),
    roofWindow('bedroom-3', 'bedroom-3', 14.5, 1, [2, 3.4]),
    roofWindow('sky-room', 'sky-room', 3.5, 2.4, [8.6, 10.4])
  ],
  entry: {position: [9, .8], yaw: 0, pitch: 0},
  // The fireplace on the living room's chimney wall (a = 0), centred at d: the breast it stands in, the opening of its fire, the hearth
  // slab reaching into the room, the mantel shelf's height above the floor, and the narrower breast that continues upstairs.
  fireplace: {a: 0, d: 3.5, breast: {width: 2, depth: .5}, mouth: {width: 1.1, height: .9}, slab: .5, mantel: 1.25, upper: {width: 1.2, depth: .4}},
  breasts: BREASTS,
  furniture: FURNITURE,
  furnishLater: ['kitchen', 'dining', 'study', 'passage', 'master', 'bath-ground', 'laundry', 'pantry'],
  furnishUpper: ['landing', 'bedroom-2', 'bedroom-3', 'sky-room'],
  stairRail: STAIR_RAIL,
  // Where the rules say the visitor can stand: on the hearth rug facing the fire, at the casement, before the bookshelf, at the range,
  // before the dresser, at the dining window, beside the desk, before the study shelves, in the passage, at the foot and side of the bed,
  // in the ground-floor bathroom, laundry and pantry, and the six spots the frame cost is measured from.
  spots: {
    hearth: [1.7, 3.5], casement: [4.2, .95], bookshelf: [1.8, 6.1],
    range: [4.4, 10.9], dresser: [3.5, 9.5], diningWindow: [10, 11.4],
    desk: [15.0, .7], shelves: [14.6, 3.1], wardrobes: [12.5, 5.4], bedFoot: [14.5, 8.8], bedside: [12.7, 11.0],
    bath: [15.5, 5.5], laundry: [1.6, 8.3], pantry: [1.5, 10.7],
    speed: [[4.2, 3], [3.8, 5.5], [5.2, 7.9], [11.9, .8], [12.5, 7.9], [14.6, 5.5]],
  },
  // Named standable spots and speed poses on the upper floor (floor 1).
  upperSpots: {
    landingSeat: [8.4, 1.0], bed2: [3.5, 4.0], bed3: [14.5, 4.0], skyWindow: [3.5, 8.2], nookChair: [9.0, 9.2],
    speed: [[8.4, 5.8], [5.8, 9.5]],
  },
  // One lamp for every room: `at` is the glass's centre [a, d, z], z above the ground floor.
  fittings: [
    fitting('living', 'hanging', [3.8, 3.5, 2.15]), fitting('study', 'hanging', [14.5, 2, 2.15]), fitting('kitchen', 'hanging', [4.75, 9.5, 2.15]),
    fitting('dining', 'hanging', [9, 9.5, 2.15]), fitting('master', 'hanging', [14.5, 9.5, 2.15]),
    fitting('hall', 'wall', [10.2, .2, 1.8]), fitting('passage', 'wall', [12.5, 4.2, 1.8]), fitting('bath-ground', 'wall', [16, 4.2, 1.8]),
    fitting('laundry', 'wall', [.2, 8.25, 1.8]), fitting('pantry', 'wall', [.2, 10.75, 1.8]),
    fitting('bedroom-2', 'hanging', [3.5, 5, 5.15]), fitting('bedroom-3', 'hanging', [14.5, 5, 5.15]), fitting('sky-room', 'hanging', [5.8, 8, 5.15]),
    fitting('nook', 'hanging', [9, 9.5, 5.15]),
    fitting('landing', 'wall', [8.2, .2, 4.5]), fitting('bath-upper', 'wall', [13, 11.8, 4.5]), fitting('box-room', 'wall', [17.8, 8.25, 4.8]),
    fitting('linen', 'wall', [17.8, 10.75, 4.6])
  ],
  lightSeed: 20261120
};
export const SLICE_4C = Object.freeze(['study', 'passage', 'master']);
export const SLICE_4D = Object.freeze(['bath-ground', 'laundry', 'pantry']);
export const SLICE_4E = Object.freeze(['landing', 'bedroom-2', 'bedroom-3', 'sky-room', 'nook']);
// What the walker keeps clear of: the breasts and one rectangle per solid piece, worked out before the blueprint is frozen.
export const LAKESIDE_INTERIOR = deep({...BLUEPRINT, obstacles: obstaclesOf(BLUEPRINT)});
