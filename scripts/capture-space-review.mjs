// Review captures of the 3D yard from named poses under the light studies:
//   node scripts/capture-space-review.mjs [--only name,name] [--tier full|light|plain] [--study day|dawn|dusk|night|rain] [--compare] [--life] [--garden]
// Saves <pose>-<study>-<tier>.jpg (1440 × 810, JPEG quality 90, so the committed pack stays small) to
// docs/space-validation/review/. Needs a server (SKY_PREVIEW_URL, default http://127.0.0.1:4190). --tier starts the view
// locked at that tier (?tier=) and is recorded in the file name. --compare takes only the arrival pose and saves
// docs/space-validation/arrival-vs-painting.jpg (quality 90): the painting and the arrival capture side by side at the
// same height, and the two laid over each other at half strength. --life takes instead the yard's living things (lit windows,
// the casement, smoke, rain, the wet path, ripples, the bird at each place, the nest filling) as life-<what>-<tier>.jpg; each
// names its own study, pose and fixture, so --only, --study and --compare do not apply. Outside --garden the garden is shown on
// day 230 of year 0 (the fixture's gardenDay) whatever the server's date, unless a shot's fixture names another day. --garden takes instead the garden's year
// as garden-day-<n>-<tier>.jpg (twelve days of year 0) and garden-year-<y>-<tier>.jpg (day 230 of years 1–3), each the arrival,
// garden and garden-behind poses side by side, each at half size (2160 × 405, JPEG quality 80) under the day study, the day given as the fixture's gardenDay; --only takes
// shot names (day-230, year-2), and --study and --compare do not apply.
import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, cabinFrame, cabinFront, doorPosition, openingCentre} from '../shared/lakeside-dressing.js';
import {lifeLayout, birdPlace} from '../shared/lakeside-life.js';
import {birdFixture, createBirdState, birdProgress} from '../shared/bird.js';
import {coincidenceFixture} from '../shared/coincidences.js';
import {terrainHeight} from '../shared/space.js';
import {eyePosition} from '../shared/walker.js';
const {chromium} = createRequire(import.meta.url)('playwright');

const STUDIES = ['dawn', 'day', 'dusk', 'night', 'rain'], TIERS = ['full', 'light', 'plain'];
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const toward = ([x, y], [tx, ty]) => Math.atan2(tx - x, ty - y);
// Two and a half metres out from the door, looking back at the cabin's front wall.
const door = doorPosition(S, D), {yaw: cy} = S.cabin, side = cabinFront(S), out = [Math.cos(cy) * side, -Math.sin(cy) * side];
const before = [door[0] + out[0] * 2.5, door[1] + out[1] * 2.5];
const [ox, oy] = S.oak.position;
const POSES = {
  arrival: {position: [0, 0], yaw: Math.PI / 2, pitch: 0},
  'cabin-front': {position: before, yaw: toward(before, door), pitch: .05},
  'cabin-back': {position: [31, 11], yaw: 4.39, pitch: 0},
  'gable-north': {position: [19, 16], yaw: 2.9, pitch: 0},
  'gable-south': {position: [25, -1], yaw: 5.9, pitch: 0},
  shore: {position: [6, -6.5], yaw: toward([6, -6.5], [13, 6]), pitch: 0},
  woods: {position: [10, 12], yaw: 0, pitch: 0},
  canopy: {position: [ox + 1.4, oy - .6], yaw: toward([ox + 1.4, oy - .6], [ox, oy]), pitch: 1},
  // Where the woods come down to the water: the weakest corners, kept in the pack so they are judged.
  'woods-end-northwest': {position: [-11, 20], yaw: 3.14, pitch: 0},
  'woods-end-north-gable': {position: [16, 16], yaw: 1.4, pitch: 0},
  'woods-end-northeast': {position: [20, 12], yaw: .9, pitch: 0},
  // The kitchen garden, from the path side and from between it and the cabin.
  garden: {position: [10.2, 5.2], yaw: toward([10.2, 5.2], [13.6, 8.3]), pitch: -.12},
  'garden-behind': {position: [14.4, 12.6], yaw: toward([14.4, 12.6], [13.6, 8.4]), pitch: -.2},
};

// ── The living things. Each shot: a study (the light and the weather), a pose, and what the yard is told. `fixture` is what
// window.__space.fixture takes (honoured only under ?check); `live` hands the presenters no study, as a live visit would (a study
// omits the smoke, the ripple and the bird unless a fixture gives them), while the light and weather stay the study's; `hearth` and
// `nest` set the snapshot's hearth burning and the nest's materials, and `motionSeconds` the life's clock, which no fixture reaches. Poses are aimed at world points
// computed from lifeLayout() and the cabin's frame.
const layout = lifeLayout(S, D), frame = cabinFrame(S, D), arrivalEye = S.arrival.position;
const lookFrom = (position, target) => {
  const e = eyePosition(S, {position}), dx = target[0] - e[0], dy = target[1] - e[1];
  return {position, yaw: Math.atan2(dx, dy), pitch: Math.atan2(target[2] - e[2], Math.hypot(dx, dy))};
};
const aroundOak = (radius, degrees) => [ox + radius * Math.sin(degrees * Math.PI / 180), oy + radius * Math.cos(degrees * Math.PI / 180)];
const beside = (centre, metres, along = 0) => [centre[0] + out[0] * metres + frame.u[0] * along, centre[1] + out[1] * metres + frame.u[1] * along];
const above = p => [p[0], p[1], p[2] + .1];
const leftWindow = openingCentre(S, D, 'window-front-left'), doorCentre = openingCentre(S, D, 'door'), chimney = layout.cottage.chimney;
const underEave = [S.cabin.center[0] + frame.u[0] * (frame.L - 1.5) + out[0] * (frame.W + .2), S.cabin.center[1] + frame.u[1] * (frame.L - 1.5) + out[1] * (frame.W + .2)];
const eaveHeight = eyePosition(S, {position: underEave})[2];
const [px, py] = layout.weather.puddle.center, puddle = [px, py, terrainHeight(S, px, py)];
const towardArrival = (target, metres) => { const d = Math.hypot(arrivalEye[0] - target[0], arrivalEye[1] - target[1]); return [target[0] + (arrivalEye[0] - target[0]) / d * metres, target[1] + (arrivalEye[1] - target[1]) / d * metres]; };
const nestFixture = {state: createBirdState(0, false), now: 0}, shelter = birdFixture('Sheltered bird'), flight = birdFixture('Roof flight', 4500);
// 6.5 s into the 9 s flight from the oak perch to the roof: over the lawn with sky behind it. The sight keeps clear of the crown.
const flying = at => { const f = birdFixture('Roof flight', at); return {fixture: {bird: f}, place: birdPlace(birdProgress(f.state, null, f.now), layout).position}; };
const flightA = flying(6500), flightB = flying(6560), flightEye = p => nearer(p, .6);
// The bird is drawn 36 cm long: the roof perch, 22 m from the arrival, is taken from partway along the sight (the oak's perches only show from where the check finds them).
const nearer = (p, k) => [arrivalEye[0] + (p[0] - arrivalEye[0]) * k, arrivalEye[1] + (p[1] - arrivalEye[1]) * k];
const nestEye = aroundOak(2.5, 60), nestAt = above(layout.bird.locations.nest.point);
const rippleShot = id => ({study: 'day', live: true, fixture: {coincidence: coincidenceFixture(4, id)}, pose: lookFrom(arrivalEye, [...layout.ripples[id].center, 0])});
const LIFE = {
  'windows-night-path': {study: 'night', pose: lookFrom(D.path[5], doorCentre)},
  'windows-night-beside': {study: 'night', pose: lookFrom(beside(doorCentre, 1.8, -1.2), leftWindow)},
  'casement-open-day': {study: 'day', fixture: {cottagePose: {main: 0, second: 0, open: 1}}, pose: lookFrom(beside(doorCentre, 3), leftWindow)},
  'smoke-day': {study: 'day', live: true, hearth: true, pose: lookFrom(towardArrival(chimney, 14), [chimney[0], chimney[1], chimney[2] + 2.5])},
  'smoke-glow-night': {study: 'night', live: true, hearth: true, fixture: {cottagePose: {main: 1, second: .65, open: 0}},
    pose: lookFrom(beside(doorCentre, 9), [(doorCentre[0] + chimney[0]) / 2, (doorCentre[1] + chimney[1]) / 2, (doorCentre[2] + chimney[2]) / 2])},
  'rain-eave-rain': {study: 'rain', pose: lookFrom(underEave, [underEave[0] - frame.u[0] * 6, underEave[1] - frame.u[1] * 6, eaveHeight])},
  'rain-walking-rain': {study: 'rain', pose: structuredClone(S.arrival), walk: 1200},
  'path-day': {study: 'day', pose: lookFrom(arrivalEye, puddle)},
  'path-rain': {study: 'rain', pose: lookFrom(arrivalEye, puddle)},
  'ripple-shore-reflection': rippleShot('shore-reflection'),
  'ripple-open-water': rippleShot('open-water'),
  'ripple-near-water': rippleShot('near-water'),
  'bird-perch': {study: 'day', fixture: {bird: birdFixture('Oak perch')}, pose: lookFrom(arrivalEye, above(layout.bird.locations['oak-perch'].point))},
  'bird-nest': {study: 'day', fixture: {bird: nestFixture}, pose: lookFrom(nestEye, nestAt)},
  'bird-shelter': {study: 'day', fixture: {bird: shelter}, pose: lookFrom(aroundOak(5.5, 315), above(layout.bird.locations['oak-shelter'].point))},
  'bird-roof': {study: 'day', fixture: {bird: birdFixture('Roof perch')}, pose: lookFrom(nearer(layout.bird.locations['roof-perch'].point, .75), above(layout.bird.locations['roof-perch'].point))},
  'bird-flight-a': {study: 'day', fixture: flightA.fixture, pose: lookFrom(flightEye(flightA.place), flightA.place)},
  'bird-flight-b': {study: 'day', fixture: flightB.fixture, pose: lookFrom(flightEye(flightA.place), flightA.place)},
  // the three distant birds' crossing is the first 23 s of each 135 s cycle, so the clock the life sees is set to 9 s into one
  'far-birds-day': {study: 'day', live: true, motionSeconds: 9, pose: {position: [...arrivalEye], yaw: 2, pitch: .17}},
  'nest-5': {study: 'day', nest: 5, pose: lookFrom(nestEye, nestAt)},
  'nest-12': {study: 'day', nest: 12, pose: lookFrom(nestEye, nestAt)},
};
// ── The garden's year: the day study at twelve days of year 0, and at day 230 of each later year, from three poses each.
const GARDEN = Object.fromEntries([
  ...[20, 112, 128, 140, 160, 185, 205, 230, 255, 275, 295, 316].map(n => [`day-${n}`, {fixture: {gardenDay: n}}]),
  ...[1, 2, 3].map(y => [`year-${y}`, {fixture: {gardenDay: 365 * y + 230}}]),
]), GARDEN_POSES = ['arrival', 'garden', 'garden-behind'];
// Every run but --garden shows the garden of one fixed day (day 230 of year 0, the full garden), so its captures do not change
// with the server's date; a shot's own fixture is laid over it and may name another day.
const YARD = {gardenDay: 230};
const lifeRun = process.argv.includes('--life'), gardenRun = !lifeRun && process.argv.includes('--garden');
const compare = process.argv.includes('--compare');
const shots = lifeRun ? LIFE : gardenRun ? GARDEN : POSES;
const only = lifeRun || gardenRun ? arg('only')?.split(',') ?? Object.keys(shots) : compare ? ['arrival'] : arg('only')?.split(',') ?? Object.keys(POSES), study = gardenRun ? 'day' : arg('study') ?? 'day', tier = arg('tier') ?? 'full';
const unknown = only.filter(n => !shots[n]);
if (unknown.length || !STUDIES.includes(study) || !TIERS.includes(tier)) {
  console.error(`Unknown ${unknown.length ? `pose ${unknown.join(', ')}` : !STUDIES.includes(study) ? `study ${study}` : `tier ${tier}`}.`);
  console.error(`${lifeRun || gardenRun ? 'Shots' : 'Poses'}: ${Object.keys(shots).join(', ')}. Studies: ${STUDIES.join(', ')}. Tiers: ${TIERS.join(', ')}.`);
  process.exit(2);
}

const directory = 'docs/space-validation/review', base = process.env.SKY_PREVIEW_URL || 'http://127.0.0.1:4190';
await mkdir(directory, {recursive: true});
const browser = await chromium.launch({headless: true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {}),
  args: process.env.SKY_GPU === 'metal' ? ['--enable-gpu', '--use-gl=angle', '--use-angle=metal'] : ['--use-gl=angle']});
const errors = [];
// The painting at the capture's height beside the capture, then the two at half strength each, drawn on a canvas in a blank page.
async function saveComparison(context, shot) {
  const painting = await readFile('public/assets/lakeside-day.png'), page = await context.newPage(), path = 'docs/space-validation/arrival-vs-painting.jpg';
  const png = await page.evaluate(async ([a, b]) => {
    const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
    const [paint, view] = await Promise.all([load(a), load(b)]), h = view.height, pw = Math.round(paint.width * h / paint.height), gap = 8;
    const c = Object.assign(document.createElement('canvas'), {width: pw + view.width * 2 + gap * 2, height: h}), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, h);
    g.drawImage(paint, 0, 0, pw, h); g.drawImage(view, pw + gap, 0);
    const x = pw + view.width + gap * 2; g.drawImage(paint, x, 0, view.width, h); g.globalAlpha = .5; g.drawImage(view, x, 0);
    return c.toDataURL('image/jpeg', .9);
  }, [`data:image/png;base64,${painting.toString('base64')}`, `data:image/jpeg;base64,${shot.toString('base64')}`]);
  await writeFile(path, Buffer.from(png.split(',')[1], 'base64'));
  await page.close();
  console.log(path);
}
// Lossless captures of one size side by side, each scaled by `scale`, drawn on a canvas in a blank page and encoded once as
// a JPEG of `quality`.
async function saveSideBySide(context, images, path, {scale = .5, quality = .8} = {}) {
  const page = await context.newPage();
  const jpeg = await page.evaluate(async ([sources, scale, quality]) => {
    const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
    const views = await Promise.all(sources.map(load)), width = Math.round(views[0].width * scale), height = Math.round(views[0].height * scale);
    const c = Object.assign(document.createElement('canvas'), {width: width * views.length, height}), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    views.forEach((v, i) => g.drawImage(v, i * width, 0, width, height));
    return c.toDataURL('image/jpeg', quality);
  }, [images.map(b => `data:image/png;base64,${b.toString('base64')}`), scale, quality]);
  await writeFile(path, Buffer.from(jpeg.split(',')[1], 'base64'));
  await page.close();
}
try {
  const context = await browser.newContext({viewport: {width: 1440, height: 810}, deviceScaleFactor: 1});
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('requestfailed', r => { if (!r.url().startsWith('https://fonts.')) errors.push(`${r.url()} ${r.failure()?.errorText}`); });
  await page.goto(`${base}/?space=1&check&tier=${tier}`);
  await page.waitForFunction(() => window.__space?.renderer && !document.querySelector('#space').hidden && window.__space.lastStep !== null, null, {timeout: 30_000});
  const shownTier = await page.evaluate(() => window.__space.tier);
  if (shownTier !== tier) throw new Error(`The view is on the ${shownTier} tier, not ${tier}.`);
  // The study buttons do nothing until the first world snapshot has arrived, so press until one takes.
  await page.waitForFunction(s => { const b = document.querySelector(`[data-light="${s}"]`); b.click(); return b.getAttribute('aria-pressed') === 'true'; }, study, {timeout: 15_000, polling: 250});
  // The interface stays out of the picture.
  await page.addStyleTag({content: '.chrome, .welcome, #toast, dialog { visibility: hidden !important; }'});
  const press = name => page.waitForFunction(s => { const b = document.querySelector(`[data-light="${s}"]`); if (b.getAttribute('aria-pressed') !== 'true') b.click(); return b.getAttribute('aria-pressed') === 'true'; }, name, {timeout: 15_000, polling: 250});
  // What the snapshot cannot be told by a fixture, set from here: handed to the life as each frame goes in (see LIFE above).
  if (lifeRun) await page.evaluate(() => {
    const view = window.__space, update = view.life.update.bind(view.life);
    window.__shot = {live: false, hearth: false, nest: null, motionSeconds: null};
    view.life.update = frame => {
      const {live, hearth, nest, motionSeconds} = window.__shot; let snapshot = frame.snapshot;
      if (hearth || nest !== null) {
        const world = {...snapshot.world};
        if (hearth) world.cottage = {...world.cottage, hearth: {on: true, since: world.cottage.introducedAt, lastBurn: null}};
        if (nest !== null) world.nest = {...world.nest, materials: nest};
        snapshot = {...snapshot, world};
      }
      update({...frame, snapshot, study: live ? null : frame.study, motionSeconds: motionSeconds ?? frame.motionSeconds});
    };
  });
  for (const name of only) {
    if (lifeRun) {
      const shot = LIFE[name];
      await press(shot.study);
      await page.evaluate(([s, f]) => { window.__shot = {live: !!s.live, hearth: !!s.hearth, nest: s.nest ?? null, motionSeconds: s.motionSeconds ?? null}; window.__space.fixture = f; }, [shot, {...YARD, ...shot.fixture}]);
      await page.evaluate(p => { window.__space.state = structuredClone(p); }, shot.pose);
      await page.waitForTimeout(1500);
      if (shot.walk) await page.keyboard.down('KeyW');
      if (shot.walk) await page.waitForTimeout(shot.walk);
      const path = `${directory}/life-${name}-${tier}.jpg`;
      await page.screenshot({path, type: 'jpeg', quality: 90});
      if (shot.walk) await page.keyboard.up('KeyW');
      console.log(path);
      continue;
    }
    if (gardenRun) {
      await page.evaluate(f => { window.__space.fixture = f; }, GARDEN[name].fixture);
      const images = [];
      for (const pose of GARDEN_POSES) {
        await page.evaluate(p => { window.__space.state = structuredClone(p); }, POSES[pose]);
        await page.waitForTimeout(1500);
        images.push(await page.screenshot({type: 'png'}));
      }
      const path = `${directory}/garden-${name}-${tier}.jpg`;
      await saveSideBySide(context, images, path);
      console.log(path);
      continue;
    }
    await page.evaluate(([p, f]) => { window.__space.state = structuredClone(p); window.__space.fixture = f; }, [POSES[name], YARD]);
    await page.waitForTimeout(1500);
    const path = `${directory}/${name}-${study}-${tier}.jpg`, shot = await page.screenshot({path, type: 'jpeg', quality: 90});
    console.log(path);
    if (compare) await saveComparison(context, shot);
  }
  await context.close();
} finally { await browser.close(); }
if (errors.length) { console.log(`Page errors: ${errors.join(' | ')}`); process.exitCode = 1; }
