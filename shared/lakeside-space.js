import {DEG} from './celestial.js';
import {SKY_CAMERA} from './celestial-projection.js';

// The yard in metres: x east, y north, z up; z = 0 is the lake surface. Yaw is azimuth clockwise from north.
export const BED_CLEAR = .15;
const BED_YAW = 160 * DEG, bed = (id, center, size) => ({id, center, size, yaw: BED_YAW, height: .3});
// The raised beds of the kitchen garden, on the grass in front of the cabin's north end, parallel to its wall: `size` is
// [long, wide], `height` how far the boards stand above the highest ground under them.
const BEDS = [bed('corn', [12.6, 8.2], [2.8, 1.2]), bed('tomato', [14.6, 9.2], [2.6, 1.2])];
const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;

export const LAKESIDE_SPACE = deep({
  version: 1, eyeHeight: 1.6,
  arrival: {position: [0, 0], yaw: SKY_CAMERA.bearing, pitch: 0},
  shoreline: [[-30, -14], [-4, -10], [8, -7], [20, -3], [34, 4], [60, 10], [120, 14]],
  wall: [[-14, -16], [40, -16], [40, 24], [-14, 24]],
  cabin: {center: [21, 7], size: [9, 6], yaw: 160 * DEG, wallHeight: 2.6, ridgeHeight: 4.6},
  oak: {position: [4.5, 4.5], radius: .7, height: 14},
  beds: BEDS,
  // the cabin's box first, then the oak's circle, then a box for each bed, standing BED_CLEAR outside its boards so a visitor's eye never reaches them
  colliders: [{type: 'box', center: [21, 7], half: [4.9, 3.4], yaw: 160 * DEG}, {type: 'circle', center: [4.5, 4.5], radius: 1.1},
    ...BEDS.map(b => ({type: 'box', center: b.center, half: [b.size[0] / 2 + BED_CLEAR, b.size[1] / 2 + BED_CLEAR], yaw: b.yaw}))],
  softMargin: 1.5, waterEdge: .05
});
