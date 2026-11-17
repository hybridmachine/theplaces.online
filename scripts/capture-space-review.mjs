// Review captures of the 3D yard from named poses under the light studies:
//   node scripts/capture-space-review.mjs [--only name,name] [--tier full|light|plain] [--study day|dawn|dusk|night|rain] [--compare]
// Saves <pose>-<study>-<tier>.jpg (1440 × 810, JPEG quality 90, so the committed pack stays small) to
// docs/space-validation/review/. Needs a server (SKY_PREVIEW_URL, default http://127.0.0.1:4190). --tier starts the view
// locked at that tier (?tier=) and is recorded in the file name. --compare takes only the arrival pose and saves
// docs/space-validation/arrival-vs-painting.jpg (quality 90): the painting and the arrival capture side by side at the
// same height, and the two laid over each other at half strength.
import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D, cabinFront, doorPosition} from '../shared/lakeside-dressing.js';
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
};
const compare = process.argv.includes('--compare');
const only = compare ? ['arrival'] : arg('only')?.split(',') ?? Object.keys(POSES), study = arg('study') ?? 'day', tier = arg('tier') ?? 'full';
const unknown = only.filter(n => !POSES[n]);
if (unknown.length || !STUDIES.includes(study) || !TIERS.includes(tier)) {
  console.error(`Unknown ${unknown.length ? `pose ${unknown.join(', ')}` : !STUDIES.includes(study) ? `study ${study}` : `tier ${tier}`}.`);
  console.error(`Poses: ${Object.keys(POSES).join(', ')}. Studies: ${STUDIES.join(', ')}. Tiers: ${TIERS.join(', ')}.`);
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
  for (const name of only) {
    await page.evaluate(p => { window.__space.state = structuredClone(p); }, POSES[name]);
    await page.waitForTimeout(1500);
    const path = `${directory}/${name}-${study}-${tier}.jpg`, shot = await page.screenshot({path, type: 'jpeg', quality: 90});
    console.log(path);
    if (compare) await saveComparison(context, shot);
  }
  await context.close();
} finally { await browser.close(); }
if (errors.length) { console.log(`Page errors: ${errors.join(' | ')}`); process.exitCode = 1; }
