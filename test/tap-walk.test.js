import test from 'node:test';
import assert from 'node:assert/strict';
import {tapInput, tapRoute} from '../public/space/tap-walk.js';
import {LAKESIDE_SPACE as space} from '../shared/lakeside-space.js';
import {LAKESIDE_INTERIOR as walkPlan} from '../shared/lakeside-interior.js';
import {glideClear, stepWalker} from '../shared/walker.js';

test('a tap across the oak follows walkable segments and stops at the point without rotating the view', () => {
  const view = {space, state: {place: 'yard', position: [2, 4.5], yaw: .7, pitch: 0}};
  const goal = [7, 4.5];
  assert.equal(glideClear(space, view.state.position, goal), false);
  const route = tapRoute(view, {point: goal});
  let previous = view.state.position;
  for (const point of route.points) {
    assert.ok(glideClear(space, previous, point));
    previous = point;
  }
  for (let i = 0; i < 300; i++) {
    const input = tapInput(route, view.state, .05);
    if (!input) break;
    view.state = stepWalker(space, view.state, input, .05);
  }
  assert.equal(tapInput(route, view.state, .05), null);
  assert.ok(Math.hypot(view.state.position[0] - goal[0], view.state.position[1] - goal[1]) < .035);
  assert.equal(view.state.yaw, .7);
});

test('the hall exit is reachable on foot, and an upstairs floor directly above is not a downstairs target', () => {
  const view = {walkPlan, state: {place: 'cabin', floor: 0, ...walkPlan.entry}};
  const exit = {point: [walkPlan.door.a, .34], heading: Math.PI};
  assert.ok(tapRoute(view, exit));
  assert.equal(tapRoute(view, {point: walkPlan.entry.position, height: walkPlan.floorRise}), null);
  const input = tapInput(tapRoute(view, exit), {...view.state, position: exit.point, yaw: Math.PI}, .05);
  assert.equal(input.atDoor, true);
  assert.equal(input.forward, 1);
});
