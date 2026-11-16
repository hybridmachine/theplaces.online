import {DEG} from './celestial.js';
import {SKY_CAMERA} from './celestial-projection.js';

// The yard in metres: x east, y north, z up; z = 0 is the lake surface. Yaw is azimuth clockwise from north.
const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;

export const LAKESIDE_SPACE = deep({
  version: 1, eyeHeight: 1.6,
  arrival: {position: [0, 0], yaw: SKY_CAMERA.bearing, pitch: 0},
  shoreline: [[-30, -14], [-4, -10], [8, -7], [20, -3], [34, 4], [60, 10], [120, 14]],
  wall: [[-14, -16], [40, -16], [40, 24], [-14, 24]],
  cabin: {center: [21, 7], size: [9, 6], yaw: 160 * DEG, wallHeight: 2.6, ridgeHeight: 4.6},
  oak: {position: [4.5, 4.5], radius: .7, height: 14},
  colliders: [{type: 'box', center: [21, 7], half: [4.9, 3.4], yaw: 160 * DEG}, {type: 'circle', center: [4.5, 4.5], radius: 1.1}],
  softMargin: 1.5, waterEdge: .05
});
