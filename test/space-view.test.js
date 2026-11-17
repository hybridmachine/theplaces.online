import test from 'node:test';
import assert from 'node:assert/strict';
import {lightLevels, verticalFov} from '../public/space/space-view.js';
import {skyColours, weatherSky} from '../public/space/sky-dome.js';

const close = (actual, expected, tolerance = 1e-6) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `${actual} ≉ ${expected}`));
const CLEAR = {cloud: .18, rain: 0}, RAIN = {cloud: .9, rain: .8};

test('the vertical field of view keeps 100° across and never opens past 75°', () => {
  assert.ok(Math.abs(verticalFov(16 / 9) - 67.67) <= .1, String(verticalFov(16 / 9)));
  assert.equal(verticalFov(390 / 844), 75);
  assert.equal(verticalFov(1), 75);
});

test('the clear sky is the day colours by day and the night scaling of them by night', () => {
  const day = [157, 179, 193].map(v => v / 255), horizon = [211, 211, 191].map(v => v / 255), night = [.22, .31, .43];
  const noon = skyColours({light: 1}, 0), midnight = skyColours({light: 0}, 0);
  close(noon.zenith, day); close(noon.horizon, horizon);
  close(midnight.zenith, day.map((v, i) => v * night[i])); close(midnight.horizon, horizon.map((v, i) => v * night[i]));
});

test('cloud dims the sky light as it dims the sun, and leaves the clear day as it was', () => {
  for (const light of [0, .3, .5, .7, 1]) {
    const clear = lightLevels({light}, CLEAR), rain = lightLevels({light}, RAIN);
    assert.ok(rain.hemisphere < clear.hemisphere, `hemisphere at light ${light}`);
    assert.ok(rain.direct < clear.direct || clear.direct === 0, `direct at light ${light}`);
    assert.equal(rain.blend, clear.blend);
  }
  // Clear skies keep today's light: day 1.7 and 2.3 less the thin cloud, night 1.1.
  assert.equal(lightLevels({light: 1}, CLEAR).hemisphere, 1.7);
  assert.equal(lightLevels({light: 0}, CLEAR).hemisphere, 1.1);
  assert.ok(Math.abs(lightLevels({light: 1}, CLEAR).direct - 2.3 * (1 - .18 * .65)) < 1e-9);
  // Cloud dims night and day by the same share, so night keeps its place against day.
  const ratio = light => lightLevels({light}, RAIN).hemisphere / lightLevels({light}, CLEAR).hemisphere;
  assert.ok(Math.abs(ratio(0) - ratio(1)) < 1e-9);
});

test('rain greys the sky colours the far ground fades toward, and clear skies keep them', () => {
  const clear = skyColours({light: 1}, 0);
  close(weatherSky(clear, CLEAR).horizon, clear.horizon); close(weatherSky(clear, CLEAR).zenith, clear.zenith);
  const wet = weatherSky(clear, RAIN);
  for (const key of ['zenith', 'horizon']) wet[key].forEach((v, i) => assert.ok(v < clear[key][i], `${key}[${i}]`));
});

test('thin cloud up to 0.2 lights the yard as clear skies do, and half cloud lies between clear and rain', () => {
  for (const light of [0, .3, .7, 1]) {
    const clear = lightLevels({light}, CLEAR), edge = lightLevels({light}, {cloud: .2, rain: 0}), half = lightLevels({light}, {cloud: .5, rain: 0}), rain = lightLevels({light}, RAIN);
    assert.equal(edge.hemisphere, clear.hemisphere);
    assert.ok(Math.abs(edge.direct - clear.direct) <= 2.3 * .02 * .65 + 1e-12, 'the sun keeps its own thin-cloud shade');
    assert.ok(half.hemisphere < clear.hemisphere && half.hemisphere > rain.hemisphere, `hemisphere at light ${light}`);
    assert.ok(half.direct < clear.direct && half.direct > rain.direct, `direct at light ${light}`);
  }
});
