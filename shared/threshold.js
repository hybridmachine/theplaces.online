// When the cabin's front door opens for a visitor in the yard, and when a visitor is carried through it.
// Pure rules: yard axes are x east, y north, yaw is azimuth clockwise from north; indoors `[a, d]` is used as the yard's `[x, y]`.
import {cabinFront, doorPosition} from './lakeside-dressing.js';

export const THRESHOLD = {openWithin: 1.5, enterWithin: .7, facing: Math.PI / 3, leaveBefore: .45, outside: .9, swingSeconds: .8, fadeSeconds: .6};

// Unit vector pointing out of the front wall (the front face's outward side, as in the dressing's facePoint).
export function doorOutward(space) {
  const {yaw} = space.cabin, front = cabinFront(space);
  return [front * Math.cos(yaw), -front * Math.sin(yaw)];
}

// The angle between a heading and a direction, however the yaw has wrapped.
const angleBetween = (yaw, [x, y]) => Math.acos(Math.max(-1, Math.min(1, Math.sin(yaw) * x + Math.cos(yaw) * y)));

const toDoor = (space, dressing, {position: [x, y]}) => {
  const [dx, dy] = doorPosition(space, dressing);
  return [dx - x, dy - y];
};

export function doorWanted(space, dressing, state) {
  const v = toDoor(space, dressing, state), distance = Math.hypot(...v);
  return distance <= THRESHOLD.openWithin && (distance === 0 || angleBetween(state.yaw, [v[0] / distance, v[1] / distance]) <= THRESHOLD.facing);
}

export const entering = (space, dressing, state, input) =>
  doorWanted(space, dressing, state) && Math.hypot(...toDoor(space, dressing, state)) <= THRESHOLD.enterWithin && input.forward > 0;

export function leaving(interior, state, input) {
  const {a, width} = interior.door, [sa, sd] = state.position;
  return state.floor === 0 && Math.abs(sa - a) <= width / 2 && sd < THRESHOLD.leaveBefore
    && angleBetween(state.yaw, [0, -1]) <= THRESHOLD.facing && input.forward > 0;
}

export const insidePose = interior => ({place: 'cabin', floor: 0, position: [...interior.entry.position], yaw: interior.entry.yaw, pitch: interior.entry.pitch});

export function outsidePose(space, dressing) {
  const out = doorOutward(space), [x, y] = doorPosition(space, dressing);
  return {place: 'yard', position: [x + out[0] * THRESHOLD.outside, y + out[1] * THRESHOLD.outside], yaw: Math.atan2(out[0], out[1]), pitch: 0};
}
