import {edgeDistance, terrainHeight, walkable} from './space.js';
import {canStep, floorAfter, indoorHeight} from './interior.js';

export const WALK = Object.freeze({speed: 1.4, fast: 2.4, turn: 1.2, tilt: .8, pitchLimit: 1.2, maxStep: .1, glideSeconds: 2.5});

const TAU = Math.PI * 2, SUB = .1, PROBE = .01;
const SLIDES = [15, 30, 45, 60, 75, 85].flatMap(d => [d, -d]).map(d => d * Math.PI / 180);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = a => { const w = a % TAU; return w < 0 ? w + TAU : w; };

// One sub-step of `len` metres along unit direction (dx, dy); returns the new position (or the old one if boxed in).
// `ground` is {walkable(p, from), edgeDistance(p), softMargin, moved?(from, to)}; `moved` hears each accepted sub-step.
function advance(ground, [x, y], dx, dy, len) {
  const edge = ground.edgeDistance([x, y]);
  const toward = ground.edgeDistance([x + dx * PROBE, y + dy * PROBE]) < edge;
  const scale = toward ? clamp(edge / ground.softMargin, 0, 1) : 1, step = len * scale;
  if (!(step > 0)) return [x, y];
  for (const a of [0, ...SLIDES]) {
    const c = Math.cos(a), s = Math.sin(a), l = step * c;
    const p = [x + (dx * c - dy * s) * l, y + (dx * s + dy * c) * l];
    if (ground.walkable(p, [x, y])) { if (ground.moved) ground.moved([x, y], p); return p; }
  }
  return [x, y];
}

export function stepOn(ground, state, input, dt) {
  const t = clamp(Number.isFinite(dt) ? dt : 0, 0, WALK.maxStep);
  const [lookYaw = 0, lookPitch = 0] = input.look || [];
  const yaw = wrap(state.yaw + (input.turn || 0) * WALK.turn * t + lookYaw);
  const pitch = clamp(state.pitch + (input.tilt || 0) * WALK.tilt * t + lookPitch, -WALK.pitchLimit, WALK.pitchLimit);
  let f = input.forward || 0, r = input.strafe || 0;
  const mag = Math.hypot(f, r);
  if (mag > 1) { f /= mag; r /= mag; }
  // Yaw is azimuth clockwise from north (x east, y north): heading [sin yaw, cos yaw], right-hand side [cos yaw, -sin yaw].
  let dx = f * Math.sin(yaw) + r * Math.cos(yaw), dy = f * Math.cos(yaw) - r * Math.sin(yaw);
  const speed = input.fast ? WALK.fast : WALK.speed, dir = Math.hypot(dx, dy);
  let position = [state.position[0], state.position[1]];
  const total = dir * speed * t;
  if (total > 0) {
    dx /= dir; dy /= dir;
    const n = Math.ceil(total / SUB - 1e-9), len = total / n;
    for (let i = 0; i < n; i++) position = advance(ground, position, dx, dy, len);
  }
  return {position, yaw, pitch};
}

export const stepWalker = (space, state, input, dt) => stepOn({
  walkable: p => walkable(space, p), edgeDistance: p => edgeDistance(space, p), softMargin: space.softMargin
}, state, input, dt);

// Indoors the position is [a, d], used as the yard's [x, y]; the floor is tracked sub-step by sub-step.
export function stepIndoors(interior, state, input, dt) {
  let floor = state.floor;
  const next = stepOn({
    walkable: (p, from) => canStep(interior, {floor, position: from}, p),
    edgeDistance: () => Infinity,
    softMargin: 1,
    moved: (from, to) => { floor = floorAfter(interior, {floor, position: from}, to); }
  }, state, input, dt);
  return {place: 'cabin', floor, ...next};
}

export const indoorEye = (interior, state, eyeHeight) =>
  [state.position[0], state.position[1], indoorHeight(interior, state.floor, state.position) + eyeHeight];

export const eyePosition = (space, state) =>
  [state.position[0], state.position[1], terrainHeight(space, state.position[0], state.position[1]) + space.eyeHeight];

// Whether the straight line a glide follows from `from` to `to` (two [x, y]) keeps to walkable ground all the way. A glide can be
// stopped anywhere along it, and a visitor left inside the cabin, the oak, a bed or the water could not walk out again.
export function glideClear(space, from, to) {
  const n = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / SUB));
  for (let i = 0; i <= n; i++) if (!walkable(space, [from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n])) return false;
  return true;
}

export function glide(from, to, t) {
  if (t <= 0) return {position: [...from.position], yaw: from.yaw, pitch: from.pitch};
  if (t >= 1) return {position: [...to.position], yaw: to.yaw, pitch: to.pitch};
  const k = t * t * (3 - 2 * t), mix = (a, b) => a + (b - a) * k;
  let dYaw = (to.yaw - from.yaw) % TAU;
  if (dYaw > Math.PI) dYaw -= TAU; else if (dYaw < -Math.PI) dYaw += TAU;
  return {position: [mix(from.position[0], to.position[0]), mix(from.position[1], to.position[1])], yaw: wrap(from.yaw + dYaw * k), pitch: mix(from.pitch, to.pitch)};
}
