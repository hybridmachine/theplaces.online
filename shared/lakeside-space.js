import {DEG} from './celestial.js';
import {SKY_CAMERA} from './celestial-projection.js';

// The yard in metres: x east, y north, z up; z = 0 is the lake surface. Yaw is azimuth clockwise from north.
export const BED_CLEAR = .15;
const BED_YAW = 160 * DEG, bed = (id, center, size) => ({id, center, size, yaw: BED_YAW, height: .3});
// The raised beds of the kitchen garden, on the grass in front of the cabin's north end, parallel to its wall: `size` is
// [long, wide], `height` how far the boards stand above the highest ground under them.
const BEDS = [bed('corn', [12.6, 8.2], [2.8, 1.2]), bed('tomato', [14.6, 9.2], [2.6, 1.2])];
const CABIN = {center: [21, 7], size: [9, 6], yaw: 160 * DEG, wallHeight: 2.6, ridgeHeight: 4.6};
// The parked wheelbarrow, between the front wall and the tomato bed: `center` is the middle of its footprint, `yaw` the way
// its handles point, turned out from the wall toward the path. It stands off the wall, clear of the casement's swing.
const along = -3.24, across = CABIN.size[1] / 2 + .55;
const WHEELBARROW = {yaw: CABIN.yaw + 15 * DEG,
  center: [CABIN.center[0] + along * Math.sin(CABIN.yaw) + across * Math.cos(CABIN.yaw),
           CABIN.center[1] + along * Math.cos(CABIN.yaw) - across * Math.sin(CABIN.yaw)]};
// Half its footprint, [along the handles, across the tray], a little outside the wood and iron.
export const WHEELBARROW_HALF = [1.06, .48];
const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;

export const LAKESIDE_SPACE = deep({
  version: 1, eyeHeight: 1.6,
  arrival: {position: [0, 0], yaw: SKY_CAMERA.bearing, pitch: 0},
  shoreline: [[-30, -14], [-4, -10], [8, -7], [20, -3], [34, 4], [60, 10], [120, 14]],
  wall: [[-14, -16], [40, -16], [40, 24], [-14, 24]],
  cabin: CABIN,
  oak: {position: [4.5, 4.5], radius: .7, height: 14},
  beds: BEDS,
  wheelbarrow: WHEELBARROW,
  // the cabin's box first, then the oak's circle, then a box for each bed, standing BED_CLEAR outside its boards so a visitor's eye never
  // reaches them, then the wheelbarrow's footprint. `clearsCover` marks what stands on the meadow: no ground cover grows under it.
  colliders: [{type: 'box', center: [21, 7], half: [4.9, 3.4], yaw: 160 * DEG}, {type: 'circle', center: [4.5, 4.5], radius: 1.1},
    ...BEDS.map(b => ({type: 'box', center: b.center, half: [b.size[0] / 2 + BED_CLEAR, b.size[1] / 2 + BED_CLEAR], yaw: b.yaw, clearsCover: true})),
    {type: 'box', center: WHEELBARROW.center, half: WHEELBARROW_HALF, yaw: WHEELBARROW.yaw, clearsCover: true}],
  softMargin: 1.5, waterEdge: .05
});
