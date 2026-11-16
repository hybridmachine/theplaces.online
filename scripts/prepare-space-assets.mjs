// Offline art bundle for the walkable yard: paints (or takes a supplied plate for) each slot in headless Chromium and writes WebP.
// node scripts/prepare-space-assets.mjs [--only slot,slot]
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {SPACE_ART, artFiles} from '../shared/lakeside-space-art.js';
import {SEEDS} from './space-painter/painter.js';

const {chromium} = createRequire(import.meta.url)('playwright');
const root = new URL('../', import.meta.url), at = path => new URL(path, root);
const out = at('public/assets/lakeside-space-v1/'), plates = at('artwork/lakeside-space-v1/plates/'), sheetPath = at('docs/space-validation/art-sheet.png');
const origin = 'http://painter.invalid/';

const all = artFiles(), known = new Set(all.map(f => f.slot));
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg < 0 ? null : (process.argv[onlyArg + 1] ?? '').split(',').filter(Boolean);
if (only && (!only.length || only.some(s => !known.has(s)))) { console.error(`--only takes slot names from: ${[...known].join(', ')}`); process.exit(2); }
const hasPlate = slot => existsSync(new URL(`${slot}.png`, plates));
// Without --only, every slot that has a plate or a painter; slots with neither are left for later.
const wanted = all.filter(f => only ? only.includes(f.slot) : hasPlate(f.slot) || f.slot in SEEDS);
for (const f of all) if (!only && !wanted.includes(f)) console.log(`skip ${f.slot}: no plate and no painter yet`);

// The page may load only the painter, the shared slot table and the day painting.
const served = path => path.startsWith('scripts/space-painter/') || path.startsWith('shared/') || path === 'public/assets/lakeside-day.png';
const types = {js: 'text/javascript', png: 'image/png', html: 'text/html'};

const browser = await chromium.launch({args: ['--use-gl=angle']});
let failed = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.route(`${origin}**`, async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    if (path === '') return route.fulfill({contentType: types.html, body: '<!doctype html><meta charset="utf-8"><title>painter</title>'});
    if (!served(path) || path.includes('..') || !existsSync(at(path))) return route.fulfill({status: 404, body: ''});
    route.fulfill({contentType: types[path.split('.').pop()] ?? 'application/octet-stream', body: await readFile(at(path))});
  });
  await page.goto(origin);
  await page.evaluate(async () => {
    const image = new Image(); image.src = '/public/assets/lakeside-day.png'; await image.decode();
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(image, 0, 0);
    window.painting = g.getImageData(0, 0, c.width, c.height);
    window.painter = await import('/scripts/space-painter/painter.js');
    window.encode = async (canvas, type, quality) => new Uint8Array(await (await new Promise(ok => canvas.toBlob(ok, type, quality))).arrayBuffer());
  });

  await mkdir(out, {recursive: true});
  const previous = existsSync(new URL('export.json', out)) ? JSON.parse(await readFile(new URL('export.json', out), 'utf8')).files : [];
  const entries = new Map(previous.filter(f => existsSync(new URL(f.file, out))).map(f => [f.slot, f]));
  for (const want of wanted) {
    const plate = hasPlate(want.slot);
    try {
      const bytes = Buffer.from(await page.evaluate(async ({slot, width, height, alpha, plate, quality}) => {
        let canvas;
        if (plate) {
          const image = new Image(); image.src = `data:image/png;base64,${plate}`; await image.decode();
          if (image.naturalWidth !== width || image.naturalHeight !== height) throw new Error(`plate is ${image.naturalWidth}×${image.naturalHeight}, want ${width}×${height}`);
          canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          const g = canvas.getContext('2d', {willReadFrequently: true}); g.drawImage(image, 0, 0);
          if (alpha) { const d = g.getImageData(0, 0, width, height).data; let clear = false; for (let i = 3; i < d.length && !clear; i += 4) clear = d[i] === 0;
            if (!clear) throw new Error('plate has no transparent pixel'); }
        } else canvas = await window.painter.paintSlot(slot, window.painting);
        if (canvas.width !== width || canvas.height !== height) throw new Error(`painted ${canvas.width}×${canvas.height}, want ${width}×${height}`);
        return [...await window.encode(canvas, 'image/webp', quality)];
      }, {...want, plate: plate ? (await readFile(new URL(`${want.slot}.png`, plates))).toString('base64') : null, quality: SPACE_ART.quality}));
      if (bytes.subarray(8, 12).toString('latin1') !== 'WEBP') throw new Error('the browser did not encode WebP');
      await writeFile(new URL(want.file, out), bytes);
      entries.set(want.slot, {...want, seed: SEEDS[want.slot] ?? 0, source: plate ? 'plate' : 'painted', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
      console.log(`${want.slot}: ${plate ? 'plate' : 'painted'}, ${bytes.length} bytes`);
    } catch (e) { failed = true; console.error(`${want.slot}: ${e.message.split('\n')[0].replace(/^page.evaluate: (Error: )?/, '')}`); }
  }

  const files = all.filter(f => entries.has(f.slot)).map(f => entries.get(f.slot));
  await writeFile(new URL('export.json', out), JSON.stringify({version: SPACE_ART.version, quality: SPACE_ART.quality, files}, null, 2) + '\n');
  const total = files.reduce((s, f) => s + f.bytes, 0);
  console.log(`${files.length} files, ${total} bytes of ${SPACE_ART.budgetBytes}`);
  if (total > SPACE_ART.budgetBytes) { failed = true; console.error('over budget'); }

  // Contact sheet: each texture tiled 2 × 2 at reduced size with its slot name, so seams show.
  const sheet = await page.evaluate(async tiles => {
    const cell = 256, pad = 12, label = 22, cols = 4, rows = Math.ceil(tiles.length / cols);
    const c = document.createElement('canvas'); c.width = cols * (2 * cell + pad) + pad; c.height = rows * (2 * cell + label + pad) + pad;
    const g = c.getContext('2d'); g.fillStyle = '#e8e4da'; g.fillRect(0, 0, c.width, c.height);
    for (const [k, t] of tiles.entries()) {
      const image = new Image(); image.src = `data:image/webp;base64,${t.data}`; await image.decode();
      const s = cell / Math.max(t.width, t.height), w = t.width * s, h = t.height * s;
      const x = pad + (k % cols) * (2 * cell + pad), y = pad + Math.floor(k / cols) * (2 * cell + label + pad);
      if (t.alpha) for (let q = 0; q < 64; q++) { g.fillStyle = (q + (q >> 3)) % 2 ? '#bbb' : '#fff'; g.fillRect(x + (q % 8) * 64, y + (q >> 3) * 64, 64, 64); }
      for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.drawImage(image, x + i * w, y + j * h, w, h);
      g.fillStyle = '#222'; g.font = '16px sans-serif'; g.fillText(`${t.slot} (${t.width}×${t.height}, ${t.source})`, x, y + 2 * cell + 17);
    }
    return [...await window.encode(c, 'image/png')];
  }, await Promise.all(files.map(async f => ({...f, data: (await readFile(new URL(f.file, out))).toString('base64')}))));
  await mkdir(new URL('.', sheetPath), {recursive: true});
  await writeFile(sheetPath, Buffer.from(sheet));
} finally { await browser.close(); }
process.exit(failed ? 1 : 0);
