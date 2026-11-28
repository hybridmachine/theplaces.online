import test from 'node:test';
import assert from 'node:assert/strict';
import {tapInput, tapRoute} from '../public/space/tap-walk.js';
import {LAKESIDE_SPACE as space} from '../shared/lakeside-space.js';
import {LAKESIDE_INTERIOR as walkPlan} from '../shared/lakeside-interior.js';
import {glideClear, stepWalker} from '../shared/walker.js';
import {SpaceView} from '../public/space/space-view.js';
import {PlaceMemory, PLACE_KEY, STILL_MS} from '../public/space/place-memory.js';

test('arrival stays unsaved through idle frames, pagehide and Forget; a stalled tap still saves its stop', t => {
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  const records = new Map(), memory = new PlaceMemory({space, clock: () => now, storage: {
    getItem: key => records.get(key) ?? null, removeItem: key => records.delete(key),
    setItem: (key, value) => records.set(key, value),
  }});
  const view = Object.assign(Object.create(SpaceView.prototype), {
    space, memory, placed: true, arrival: space.arrival, state: {place: 'yard', ...space.arrival},
    keys: {input: () => ({}), moving: () => false}, lastStep: null, look: [0, 0], glideFrom: null,
  });
  view.step(); now += STILL_MS; view.step(); view.flushPlace();
  assert.equal(records.size, 0);
  assert.equal(view.forgetPlace(), null);
  // This almost parallel approach to the western wall is legal but slows to a crawl.
  view.state = {...view.state, position: [-13.999, 4]};
  view.route = tapRoute(view, {point: [-13.9999, 5]});
  assert.ok(view.route);
  view.step();
  assert.ok(view.route, 'a zero-duration frame does not cancel a walk');
  now += 50; view.step();
  assert.equal(view.route, null);
  now += 50; view.step(); now += STILL_MS; view.step();
  assert.deepEqual(JSON.parse(records.get(PLACE_KEY)).position, view.state.position);
});

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
