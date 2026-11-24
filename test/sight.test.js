import test from 'node:test';
import assert from 'node:assert/strict';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {SIGHT, seenFrom, doorBoxes, boxInView, doorInView} from '../shared/sight.js';

const S = seenFrom(I), sees = (a, b) => S[a].includes(b);

test('SIGHT exports the sampling constants', () => {
  assert.deepEqual(SIGHT, {grid: .5, door: .1, widen: .1});
  assert.ok(Object.isFrozen(SIGHT));
});

test('every room sees itself, and the table covers every room', () => {
  for (const r of I.rooms) assert.ok(sees(r.id, r.id));
  assert.deepEqual(Object.keys(S).sort(), I.rooms.map(r => r.id).sort());
});

test('the two rooms of every opening see each other', () => {
  for (const o of I.openings) {
    assert.ok(sees(o.rooms[0], o.rooms[1]));
    assert.ok(sees(o.rooms[1], o.rooms[0]));
  }
});

test('seeing is mutual', () => {
  for (const a of I.rooms) for (const b of I.rooms) assert.equal(sees(a.id, b.id), sees(b.id, a.id));
});

test('walls hide: the kitchen and the study do not see the master bedroom', () => {
  assert.ok(!sees('kitchen', 'master'));
  assert.ok(!sees('study', 'master'));
  assert.ok(!sees('dining', 'master'));
});

test('doors show: hall sees study and passage; passage sees master; kitchen sees the study through two openings', () => {
  assert.ok(sees('hall', 'study'));
  assert.ok(sees('hall', 'passage'));
  assert.ok(sees('passage', 'master'));
  assert.ok(sees('kitchen', 'study'));
});

test('a narrow line through several doorways is found: the pantry and the study, the linen cupboard and the landing', () => {
  assert.ok(sees('pantry', 'study'));
  assert.ok(sees('linen', 'landing'));
});

test('the stair joins the floors: hall and landing see each other, and what each sees on its own floor', () => {
  assert.ok(sees('hall', 'landing'));
  for (const b of S.landing) if (I.rooms.find(r => r.id === b).floor === 1) assert.ok(sees('hall', b));
});

test('the same table on two builds, frozen, and each list in I.rooms order', () => {
  assert.deepEqual(seenFrom(I), S);
  assert.ok(Object.isFrozen(S) && Object.isFrozen(S.hall));
  const order = new Map(I.rooms.map((r, i) => [r.id, i]));
  for (const list of Object.values(S)) {
    for (let i = 1; i < list.length; i++) assert.ok(order.get(list[i - 1]) < order.get(list[i]));
  }
});

test('a blueprint with an opening closed loses the sight through it', () => {
  const shut = {...I, openings: I.openings.filter(o => o.id !== 'passage-master')};
  assert.ok(!seenFrom(shut).passage.includes('master'));
});

function planesFrom({at, facing, fovH = 100 * Math.PI / 180, aspect = 1440 / 810, pitch = 0}) {
  const [ea, ed, ez] = at;
  const ha = facing[0] - ea, hd = facing[1] - ed, len = Math.hypot(ha, hd);
  const fha = ha / len, fhd = hd / len;
  const right = [fhd, -fha, 0];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fwd = [fha * cp, fhd * cp, sp];
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  const hx = fovH / 2, hy = Math.atan(Math.tan(hx) / aspect);
  const plane = n => {
    const l = Math.hypot(...n);
    const u = n.map(v => v / l);
    return [u[0], u[1], u[2], -(u[0] * ea + u[1] * ed + u[2] * ez)];
  };
  const combine = (a, ca, b, cb) => [a[0] * ca + b[0] * cb, a[1] * ca + b[1] * cb, a[2] * ca + b[2] * cb];
  return [
    plane(combine(fwd, Math.sin(hx), right, Math.cos(hx))),
    plane(combine(fwd, Math.sin(hx), right, -Math.cos(hx))),
    plane(combine(fwd, Math.sin(hy), up, Math.cos(hy))),
    plane(combine(fwd, Math.sin(hy), up, -Math.cos(hy))),
  ];
}

test('doorBoxes: one box per opening per room', () => {
  const boxes = doorBoxes(I);
  const bathOp = I.openings.find(o => o.rooms.includes('bath-ground'));
  assert.equal(boxes['bath-ground'].length, 1);
  assert.deepEqual(boxes['bath-ground'][0], {
    a: [bathOp.at - I.wall / 2, bathOp.at],
    d: [...bathOp.span],
    z: [0, I.doorHead],
  });
  assert.equal(boxes.passage.length, 3);
  assert.equal(boxes['bedroom-2'].length, 1);
  assert.deepEqual(boxes['bedroom-2'][0].z, [I.floorRise, I.floorRise + I.doorHead]);
  assert.ok(Object.isFrozen(boxes) && Object.isFrozen(boxes['bath-ground']) && Object.isFrozen(boxes['bath-ground'][0]));
  assert.deepEqual(doorBoxes(I), boxes);
});

test('an opening ahead is in view, one behind is not', () => {
  const boxes = doorBoxes(I);
  const eye = [...I.spots.dresser, 1.6];
  const west = planesFrom({at: eye, facing: [0, 9.5]});
  assert.equal(doorInView(boxes, 'laundry', west), true);
  assert.equal(doorInView(boxes, 'pantry', west), true);
  const east = planesFrom({at: eye, facing: [7, 9.5]});
  assert.equal(doorInView(boxes, 'laundry', east), false);
  assert.equal(doorInView(boxes, 'pantry', east), false);
});

test("4b's kitchen pose does not see the bathroom door", () => {
  const boxes = doorBoxes(I);
  const planes = planesFrom({at: [...I.spots.speed[2], 1.6], facing: [10, 12]});
  assert.equal(doorInView(boxes, 'bath-ground', planes), false);
});

test("the living capture pose sees neither small room's door", () => {
  const boxes = doorBoxes(I);
  const planes = planesFrom({at: [6.2, 5.2, 1.6], facing: [0, 3.5]});
  assert.equal(doorInView(boxes, 'laundry', planes), false);
  assert.equal(doorInView(boxes, 'pantry', planes), false);
});

test('a box that holds the camera is in view', () => {
  const boxes = doorBoxes(I);
  assert.equal(doorInView(boxes, 'bath-ground', planesFrom({at: [14, 5.5, 1.6], facing: [11, 5.5]})), true);
  assert.equal(doorInView(boxes, 'bath-ground', planesFrom({at: [13.96, 5.5, 1.6], facing: [13.96, 4.0]})), true);
});

test('openings to rooms outside seen are skipped when seen is given', () => {
  const boxes = doorBoxes(I);
  const planes = planesFrom({at: [...I.spots.speed[2], 1.6], facing: [10, 12]});
  assert.equal(doorInView(boxes, 'passage', planes, S.kitchen), false);
});

test('pitch', () => {
  const boxes = doorBoxes(I);
  const at = [13.6, 5.5, 1.6];
  assert.equal(doorInView(boxes, 'bath-ground', planesFrom({at, facing: [14, 5.5], pitch: 0})), true);
  assert.equal(doorInView(boxes, 'bath-ground', planesFrom({at, facing: [14, 5.5], pitch: -60 * Math.PI / 180})), true);
  assert.equal(doorInView(boxes, 'bath-ground', planesFrom({at, facing: [14, 5.5], pitch: 40 * Math.PI / 180})), true);
  assert.equal(doorInView(boxes, 'bath-ground', planesFrom({at, facing: [11, 5.5], pitch: 0})), false);
});

test('unusable planes hide nothing', () => {
  const boxes = doorBoxes(I);
  const box = boxes['bath-ground'][0];
  const planes = planesFrom({at: [13.6, 5.5, 1.6], facing: [11, 5.5]});
  assert.equal(boxInView(box, null), true);
  assert.equal(boxInView(box, []), true);
  assert.equal(boxInView(box, [...planes, [NaN, 0, 0, 0]]), true);
  assert.equal(boxInView(box, [[1, 0, 0, Infinity]]), true);
  assert.equal(doorInView(boxes, 'no-such-room', planes), true);
});
