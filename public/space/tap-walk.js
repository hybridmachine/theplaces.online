// Screen picks use the same yard and cabin coordinate frames as the rendered camera.
import {Raycaster} from '../assets/vendor/three-0.170.0.module.js';
import {doorPosition} from '../../shared/lakeside-dressing.js';
import {doorOutward} from '../../shared/threshold.js';
import {canStep, floorAfter, indoorHeight} from '../../shared/interior.js';
import {walkable} from '../../shared/space.js';
import {glideClear, WALK} from '../../shared/walker.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pickDestination(view, x, y) {
  const rect = view.canvas.getBoundingClientRect();
  const ray = new Raycaster();
  ray.setFromCamera({x: 2 * (x - rect.left) / rect.width - 1, y: 1 - 2 * (y - rect.top) / rect.height}, view.camera);
  const inside = view.state.place === 'cabin';
  const {terrain, wall, cabin, lake, oak, garden, wheelbarrow} = view.yard.parts;
  const surfaces = inside ? view.inside.scene.children : [terrain, wall, cabin, lake, oak, garden, wheelbarrow];
  const [hit] = ray.intersectObjects(surfaces).filter(({object}) => {
    for (let part = object; part; part = part.parent) if (!part.visible) return false;
    return object.isMesh;
  });
  if (!hit) return null;
  const name = hit.object.name;
  if (view.passage && !view.insideFailed && ['door', 'doorway', 'door-leaf', 'pane-door'].includes(name)) {
    if (inside) return {point: [view.interior.door.a, .34], heading: Math.PI};
    const [x, y] = doorPosition(view.space, view.dressing), [ox, oy] = doorOutward(view.space);
    return {point: [x + .54 * ox, y + .54 * oy], heading: Math.atan2(-ox, -oy)};
  }
  const point = [hit.point.x, -hit.point.z];
  if (!inside) return hit.object === terrain && walkable(view.space, point) ? {point} : null;
  if (!['floors', 'stair'].includes(name) || hit.face.normal.y < .5) return null;
  return {point, height: hit.point.y};
}

// A tap selects visible floor. Follow the segment only if every step uses a legal floor transition.
function indoorSegment(plan, state, target) {
  const steps = Math.max(1, Math.ceil(distance(state.position, target.point) / .08));
  let current = state;
  for (let i = 1; i <= steps; i++) {
    const position = state.position.map((v, axis) => v + (target.point[axis] - v) * i / steps);
    if (!canStep(plan, current, position)) return false;
    current = {floor: floorAfter(plan, current, position), position};
  }
  // Modelled stair treads are discrete, while the walker's eye follows a ramp.
  return target.height === undefined || Math.abs(indoorHeight(plan, current.floor, current.position) - target.height) < .25;
}

// Most taps are a single segment. For a yard obstacle, find a short detour on a local grid.
// Every link, including the final approach, passes the same ground test as Return.
function yardRoute(space, start, goal) {
  const direct = (a, b) => glideClear(space, a, b);
  if (direct(start, goal)) return [goal];
  const frontier = [{point: start, previous: null, length: 0, cost: distance(start, goal)}];
  const best = new Map([['0,0', 0]]);
  for (let count = 0; frontier.length && count < 1800; count++) {
    let index = 0;
    for (let i = 1; i < frontier.length; i++) if (frontier[i].cost < frontier[index].cost) index = i;
    const node = frontier.splice(index, 1)[0];
    if (direct(node.point, goal)) {
      const route = [goal];
      for (let step = node; step.previous; step = step.previous) route.unshift(step.point);
      return route;
    }
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const point = [node.point[0] + dx * .5, node.point[1] + dy * .5];
      const key = point.map((v, i) => Math.round((v - start[i]) * 2)).join(',');
      const length = node.length + Math.hypot(dx, dy) * .5;
      if (length >= (best.get(key) ?? Infinity) || !direct(node.point, point)) continue;
      best.set(key, length);
      frontier.push({point, previous: node, length, cost: length + distance(point, goal)});
    }
  }
  return null;
}

export function tapRoute(view, target) {
  if (!target) return null;
  const points = view.state.place === 'yard' ? yardRoute(view.space, view.state.position, target.point)
    : indoorSegment(view.walkPlan, view.state, target) ? [target.point] : null;
  return points && {points, heading: target.heading};
}

export function tapInput(route, state, dt) {
  const point = route.points[0], dx = point[0] - state.position[0], dy = point[1] - state.position[1];
  const remaining = Math.hypot(dx, dy);
  if (remaining < .035) {
    if (route.points.length > 1) { route.points.shift(); return tapInput(route, state, dt); }
    if (route.heading === undefined) return null;
    // Face the door and continue the existing passage's forward intent while the leaf swings.
    const difference = route.heading - state.yaw;
    const angle = Math.atan2(Math.sin(difference), Math.cos(difference));
    const limit = WALK.turn * Math.min(dt, WALK.maxStep);
    return {look: [Math.max(-limit, Math.min(limit, angle)), 0], forward: Math.abs(angle) < .12 ? 1 : 0, atDoor: true};
  }
  const scale = 1 / Math.max(remaining, WALK.speed * Math.min(dt, WALK.maxStep));
  return {forward: (dx * Math.sin(state.yaw) + dy * Math.cos(state.yaw)) * scale,
    strafe: (dx * Math.cos(state.yaw) - dy * Math.sin(state.yaw)) * scale};
}
