// The cabin's interior in metres: `a` 0-18 along the front wall from the chimney end, `d` 0-12 back from the front wall, z up
// from the ground floor. Authored data only; the rules that say it is valid live in interior.js.
const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;
const room = (id, name, floor, a, d) => ({id, name, floor, a, d});
// An opening in the wall on the line `line` = `at` between two rooms of one floor; `span` is its range along that wall.
const opening = (floor, rooms, line, at, span) => ({id: rooms.join('-'), floor, rooms, line, at, span});
const wallWindow = (id, room, wall, a, d) => ({id, room, kind: 'wall', wall, a, width: 1.4, sill: .8, height: 1.5});
const fitting = (room, kind, at) => ({room, kind, at});
const roofWindow = (id, room, a, width, d) => ({id, room, kind: 'roof', a, width, d});

export const LAKESIDE_INTERIOR = deep({
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
  // The two chimney breasts as solid rectangles of their floors.
  obstacles: [{floor: 0, a: [0, .5], d: [2.5, 4.5]}, {floor: 1, a: [0, .4], d: [2.9, 4.1]}],
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
});
