// Offline stroke painter (runs in a browser page): turns colours sampled from the day painting into tileable, brushed textures.
import {SPACE_ART} from '../../shared/lakeside-space-art.js';
import {REGIONS} from './regions.js';

// One fixed seed per slot; every random number a texture uses comes from it.
export const SEEDS = Object.freeze({meadow: 3, earth: 5, shore: 9, stone: 13, slate: 17, bark: 19, water: 37, drystone: 43, hills: 41});

const TAU = Math.PI * 2;
const rng = seed => () => {
  seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const clamp = (x, a = 0, b = 255) => Math.max(a, Math.min(b, x));
const css = (c, a = 1) => `rgba(${clamp(c[0]) | 0},${clamp(c[1]) | 0},${clamp(c[2]) | 0},${a})`;
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lum = c => .3 * c[0] + .59 * c[1] + .11 * c[2];
const around = (rand, a, spread) => a + (rand() - .5) * 2 * spread;
const jitter = (rand, c, k = .08) => c.map(v => v * (1 + (rand() - .5) * k));

// Picks pixel colours from the named region, area-weighted; `keep` rejects pixels that belong to something else.
function sampler(paint, rects, rand, keep = null) {
  const areas = rects.map(r => r[2] * r[3]), total = areas.reduce((a, b) => a + b, 0);
  const raw = () => {
    let t = rand() * total, k = 0; while (t > areas[k] && k < rects.length - 1) t -= areas[k++];
    const r = rects[k], x = r[0] + (rand() * r[2] | 0), y = r[1] + (rand() * r[3] | 0), i = (y * paint.width + x) * 4;
    return [paint.data[i], paint.data[i + 1], paint.data[i + 2]];
  };
  const pick = () => { for (let n = 0; n < 40; n++) { const c = raw(); if (!keep || keep(c)) return c; } return raw(); };
  const mean = [0, 0, 0]; for (let n = 0; n < 3000; n++) { const c = pick(); for (let q = 0; q < 3; q++) mean[q] += c[q] / 3000; }
  return {pick, mean};
}

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// One tapered, bristle-streaked dab, blunt at its start and drawn out to a point, centred on (x, y).
function dab(g, x, y, s, rand) {
  const {angle = 0, len: L, width: W, color: c, alpha = .9, bend = 0, bristles = 4, ridge = 0, taper = 1} = s;
  const h = W / 2, b = bend * W;
  g.save(); g.translate(x, y); g.rotate(angle);
  g.beginPath();
  g.moveTo(-L / 2, -h * .85);
  g.bezierCurveTo(-L / 6, -h * 1.05 + b, L / 4, -h * (1 - .3 * taper) + b, L / 2, b * .6 + (rand() - .5) * h * .5 * taper + h * (1 - taper) * -.9);
  if (taper < 1) g.lineTo(L / 2, h * (1 - taper) * .9 + b * .6);
  g.bezierCurveTo(L / 4, h * (1 - .3 * taper) + b, -L / 6, h * 1.05 + b, -L / 2, h * .85);
  g.quadraticCurveTo(-L / 2 - h * .8, 0, -L / 2, -h * .85);
  g.fillStyle = css(c, alpha); g.fill();
  g.lineCap = 'round';
  for (let k = 0; k < bristles; k++) {
    const o = (rand() * 2 - 1) * h * .8, shade = 1 + (rand() - .5) * .38;
    g.strokeStyle = css(mul(c, shade), .3 + rand() * .35);
    g.lineWidth = Math.max(.6, W * (.05 + rand() * .1));
    const s0 = -L / 2 + rand() * L * .15, e = L / 2 * (1 - Math.abs(o) / h * .5) - rand() * L * .25;
    g.beginPath(); g.moveTo(s0, o); g.quadraticCurveTo(0, o + b * .9, e, o * .5 + b * .6); g.stroke();
  }
  if (ridge > 0) { // a lighter lip on the upper edge, like paint catching light
    g.strokeStyle = css(mul(c, 1.25), ridge); g.lineWidth = Math.max(.7, W * .1);
    g.beginPath(); g.moveTo(-L / 2 + W * .2, -h * .7); g.quadraticCurveTo(0, -h * .95 + b, L * .35, -h * .4 + b * .6); g.stroke();
  }
  g.restore();
}

// Draws a dab at (x, y) and at every wrapped copy that reaches into the tile, so the tile repeats seamlessly.
function wrapped(g, size, x, y, s, rand) {
  const r = s.len / 2 + s.width, seed = rand() * 1e9 | 0; // every copy replays the same bristles
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    const px = x + dx, py = y + dy;
    if (px < -r || px > size + r || py < -r || py > size + r) continue;
    dab(g, px, py, s, rng(seed));
  }
}

// Tileable clump field in about [-1, 1]: soft blobs scattered (wrapped) over the unit tile.
function clumpField(rand, n = 40, rmin = .04, rmax = .12) {
  const blobs = Array.from({length: n}, () => [rand(), rand(), rmin + rand() * (rmax - rmin), rand() < .55 ? 1 : -1]);
  return (u, v) => {
    let s = 0;
    for (const [x, y, r, k] of blobs) {
      let dx = Math.abs(u - x), dy = Math.abs(v - y); dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
      const d2 = (dx * dx + dy * dy) / (r * r); if (d2 < 1) s += k * (1 - d2) * (1 - d2);
    }
    return Math.max(-1, Math.min(1, s));
  };
}

// A ground of one colour, then `count` wrapped strokes from `stroke(i, n) -> {x, y, ...dab}`.
function strokeTile(size, ground, count, stroke, rand) {
  const c = canvas(size), g = c.getContext('2d');
  g.fillStyle = css(ground); g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) { const s = stroke(i, count); wrapped(g, size, s.x, s.y, s, rand); }
  return c;
}

// One stone of w × h centred on (cx, cy), wrapped: an angular shape painted flat, shadowed below and lit on top, then worked with
// broken-colour dabs (some of them moss when `moss`).
function stoneAt(g, r, S, cx, cy, w, h, from, {round, sides: [s0, s1], moss = false}) {
  const k = S / 1024, col = mix(from.mean, from.pick(), .55), kk = .88 + r() * .28;
  const pts = [], sides = s0 + (r() * (s1 - s0) | 0), a0 = r() * TAU;
  for (let q = 0; q < sides; q++) { const an = a0 + (q + (r() - .5) * .5) / sides * TAU, j = .82 + r() * .3;
    pts.push([clamp(Math.cos(an) * round * j, -.5, .5) * w, clamp(Math.sin(an) * round * j, -.5, .5) * h]); }
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    const ox = cx + dx, oy = cy + dy;
    if (ox < -w || ox > S + w || oy < -h || oy > S + h) continue;
    g.beginPath(); pts.forEach(([px, py], q) => q ? g.lineTo(ox + px, oy + py) : g.moveTo(ox + px, oy + py)); g.closePath();
    g.fillStyle = css(mul(col, kk)); g.fill();
    g.save(); g.clip();
    g.fillStyle = css(mul(col, kk * .72), .55); g.fillRect(ox - w, oy + h * .22, w * 2, h);
    g.fillStyle = css(mix(mul(col, kk * 1.18), [235, 222, 190], .2), .5); g.fillRect(ox - w, oy - h, w * 2, h * .62);
    g.restore();
  }
  const dabs = 4 + (w * h / (700 * k * k) | 0);
  for (let d = 0; d < dabs; d++) {
    const ry = (r() - .5) * h * .8;
    wrapped(g, S, cx + (r() - .5) * w * .85, cy + ry, {angle: around(r, 0, .3), len: (16 + r() * 28) * k, width: (8 + r() * 10) * k,
      color: jitter(r, mul(mix(moss && r() < .6 ? [104, 118, 64] : col, from.pick(), .35), kk * (1.08 - ry / h * .5) * (1 + (r() - .5) * .16)), .05), alpha: .7, bristles: 4, taper: .5, ridge: ry < 0 ? .3 : 0}, r);
  }
}

// Courses of stones (see stoneAt) over a mortar ground, veiled with small dabs that cross stones and joints alike. Sizes are in pixels of a 1024 tile and scale with `size`.
function coursed(r, size, from, {mortar, course, length, gap, round, sides: [s0, s1] = [5, 8], moss = 0}) {
  const c = canvas(size), g = c.getContext('2d'), S = size, k = size / 1024;
  g.fillStyle = css(mortar); g.fillRect(0, 0, S, S);
  for (let q = 0; q < 1500; q++) wrapped(g, S, r() * S, r() * S, {angle: r() * TAU, len: (20 + r() * 30) * k, width: (10 + r() * 10) * k, color: jitter(r, mortar, .2), alpha: .5, bristles: 2}, r);
  const rows = []; let y = 0;
  while (y < S) { const h = (course[0] + r() * (course[1] - course[0])) * k; rows.push(h); y += h; }
  const scale = S / y; let yy = 0;
  for (const h0 of rows) {
    const h = h0 * scale, start = r() * 60 * k; let x = start;
    while (x < start + S - 40 * k) {
      const w = Math.min((length[0] + r() * (length[1] - length[0])) * k, start + S - x - gap[0] * k);
      stoneAt(g, r, S, x + w / 2, yy + h / 2, w, h, from, {round, sides: [s0, s1], moss: r() < moss});
      x += w + (gap[0] + r() * (gap[1] - gap[0])) * k;
    }
    yy += h;
  }
  for (let q = 0; q < 5000; q++) wrapped(g, S, r() * S, r() * S, {angle: around(r, 0, .6), len: (8 + r() * 18) * k, width: (4 + r() * 7) * k,
    color: mix(from.pick(), from.mean, .3), alpha: .32, bristles: 2, taper: .6}, r);
  return c;
}

const greenish = c => c[1] >= c[2] * 1.12 && c[1] >= c[0] * .85 && lum(c) > 55;
const earthy = c => c[0] >= c[1] * .95 && c[0] > c[2] * 1.08;

const PAINTERS = {
  // Short upright dabs, light and dark patches from a slow periodic field, a few cream specks of flower.
  meadow(paint, r, size) {
    const meadow = sampler(paint, REGIONS.meadow, r, greenish), cream = sampler(paint, REGIONS.meadow, r, c => lum(c) > 190);
    const field = clumpField(r, 90, .03, .09), k = size / 1024;
    return strokeTile(size, meadow.mean, 16000, (i, n) => {
      const x = r() * size, y = r() * size, f = field(x / size, y / size), late = i / n, flower = late > .985 && r() < .5;
      const c = flower ? mix(cream.pick(), [238, 232, 205], .4) : mul(mix(meadow.pick(), [96, 118, 62], .18), 1 + .1 * f + (late > .85 ? .08 : 0));
      return {x, y, angle: around(r, -Math.PI / 2, .45), len: (flower ? 6 + r() * 6 : 16 + r() * 30) * k, width: (flower ? 5 + r() * 3 : 5 + r() * 6) * k,
        color: c, alpha: .85, bristles: 3, bend: (r() - .5) * .6, ridge: late > .8 ? .25 : 0};
    }, r);
  },
  // Worn earth: rounded dabs in every direction, then small pebbles of light and dark.
  earth(paint, r, size) {
    const earth = sampler(paint, REGIONS.earth, r, c => earthy(c) && lum(c) > 125), k = size / 1024;
    return strokeTile(size, earth.mean, 9000, (i, n) => {
      const pebble = i / n > .9, c = pebble ? mul(earth.pick(), r() < .5 ? .76 : 1.1) : mix(earth.pick(), earth.mean, .35);
      return {x: r() * size, y: r() * size, angle: r() * TAU, len: (pebble ? 6 + r() * 10 : 20 + r() * 34) * k, width: (pebble ? 5 + r() * 5 : 10 + r() * 14) * k,
        color: c, alpha: .85, bristles: 3, ridge: pebble ? .4 : .15};
    }, r);
  },
  // Shore: sand worked with blunt, blocky stones.
  shore(paint, r, size) {
    const shore = sampler(paint, REGIONS.shore, r, c => c[2] < c[0] * 1.02 && lum(c) > 50 && !greenish(c) && Math.max(...c) - Math.min(...c) < 60), earth = sampler(paint, REGIONS.earth, r, c => earthy(c) && lum(c) > 125);
    const k = size / 1024, c = strokeTile(size, mix(shore.mean, earth.mean, .6), 8000, (i, n) => {
      const grit = i / n > .85, col = grit ? mul(shore.pick(), .8 + r() * .35) : mix(shore.pick(), earth.pick(), .6);
      return {x: r() * size, y: r() * size, angle: r() * TAU, len: (grit ? 6 + r() * 10 : 14 + r() * 24) * k, width: (grit ? 5 + r() * 5 : 8 + r() * 10) * k,
        color: col, alpha: .85, bristles: 3, ridge: grit ? .35 : .1};
    }, r), g = c.getContext('2d');
    for (let q = 0; q < 70; q++) { // scattered rounded stones, each sitting in its own soft shadow
      const w = (36 + r() * 90) * k, h = w * (.55 + r() * .3), x = r() * size, y = r() * size;
      wrapped(g, size, x + w * .08, y + h * .3, {angle: around(r, 0, .2), len: w * 1.05, width: h * .8, color: mul(shore.mean, .55), alpha: .45, bristles: 0, taper: .2}, r);
      stoneAt(g, r, size, x, y, w, h, shore, {round: .52, sides: [8, 11], moss: r() < .2});
    }
    return c;
  },
  // Cottage stone: courses of honey stones over light mortar.
  stone(paint, r, size) {
    const stone = sampler(paint, REGIONS.stone, r, c => c[0] > c[2] * 1.15 && c[0] >= c[1] * .98 && lum(c) > 110);
    return coursed(r, size, stone, {mortar: mix(mul(stone.mean, .78), [150, 140, 120], .35), course: [34, 94], length: [45, 175], gap: [2, 6], round: .62});
  },
  // Slate: courses across the roof, strokes following the slope (texture v runs up the slope), a shadow under each course.
  slate(paint, r, size) {
    const slate = sampler(paint, REGIONS.slate, r, c => Math.max(...c) - Math.min(...c) < 34 && lum(c) < 160 && lum(c) > 60);
    const c = canvas(size), g = c.getContext('2d'), S = size, rows = 16, rh = S / rows;
    g.fillStyle = css(mul(slate.mean, .72)); g.fillRect(0, 0, S, S);
    for (let row = 0; row < rows; row++) {
      const start = (row % 2) * 30 + r() * 20; let x = start;
      while (x < start + S - 20) {
        const w = Math.min(40 + r() * 40, start + S - x - 3), col = mix(slate.pick(), slate.mean, .3), shade = .85 + r() * .3;
        for (const o of [-.25, 0, .25]) // three side-by-side strokes fill each slate from its top edge down
          wrapped(g, S, x + w / 2 + (o + (r() - .5) * .1) * w, row * rh + rh * .55 + (r() - .5) * rh * .15, {angle: around(r, Math.PI / 2, .06), len: rh * (.95 + r() * .2), width: w * (.45 + r() * .15),
            color: jitter(r, mul(mix(col, slate.pick(), .25), shade), .06), alpha: .9, bristles: 5, taper: .3, ridge: .2}, r);
        x += w + 3;
      }
      for (let x2 = 0; x2 < S; x2 += 30) wrapped(g, S, x2 + r() * 20, row * rh + 3, {angle: around(r, 0, .05), len: 40 + r() * 30, width: 4 + r() * 3, color: mul(slate.mean, .5), alpha: .7, bristles: 1}, r);
    }
    return c;
  },
  // Bark: long vertical strokes over a dark ground, lighter ridges, a little moss.
  bark(paint, r, size) {
    const bark = sampler(paint, REGIONS.bark, r), k = size / 1024;
    return strokeTile(size, mul(bark.mean, .7), 5000, (i, n) => {
      const moss = r() < .12, c = moss ? mix(bark.pick(), [110, 120, 70], .5) : mul(mix(bark.pick(), bark.mean, .25), .85 + r() * .35);
      return {x: r() * size, y: r() * size, angle: around(r, Math.PI / 2, .06), len: (80 + r() * 200) * k, width: (6 + r() * 12) * k, color: c, alpha: .85, bristles: 4, bend: (r() - .5) * .5, ridge: i / n > .6 ? .3 : 0};
    }, r);
  },
  // Water: long, thin horizontal strokes of the lake's silvery blues, in slow lighter and darker bands like soft reflections.
  water(paint, r, size) {
    const water = sampler(paint, REGIONS.water, r, c => c[2] >= c[1] * .97), k = size / 1024;
    const waves = Array.from({length: 5}, () => [1 + (r() * 4 | 0), 0, r() * TAU]);
    const band = (u, v) => waves.reduce((t, [n, m, p]) => t + Math.sin(TAU * (n * v + m * u) + p), 0) / 2.5;
    return strokeTile(size, water.mean, 9000, () => {
      const x = r() * size, y = r() * size, f = band(x / size, y / size);
      return {x, y, angle: around(r, 0, .02), len: (60 + r() * 220) * k, width: (3 + r() * 7) * k, alpha: .75, bristles: 3, taper: .6,
        color: f > .45 && r() < .5 ? mix(water.pick(), [226, 224, 210], .35) : mul(water.pick(), 1 + .06 * f)};
    }, r);
  },
  // Dry-stone wall: rounder grey stones in rough courses over deep shadowed joints, some mossy.
  drystone(paint, r, size) {
    const dry = sampler(paint, REGIONS.drystone, r, c => lum(c) > 95 && !greenish(c));
    return coursed(r, size, dry, {mortar: mul(dry.mean, .42), course: [110, 190], length: [130, 300], gap: [6, 14], round: .6, sides: [8, 11], moss: .25});
  },
  // Far hills: soft slanting dabs of hazy greens and blues.
  hills(paint, r, size) {
    const hills = sampler(paint, REGIONS.hills, r, c => lum(c) < 185), k = size / 512;
    return strokeTile(size, hills.mean, 3500, () => ({
      x: r() * size, y: r() * size, angle: around(r, r() < .5 ? .5 : -.5, .3), len: (20 + r() * 40) * k, width: (8 + r() * 12) * k, color: hills.pick(), alpha: .8, bristles: 3}), r);
  },
};

// Paints one slot's texture at its exported size. `painting` is the ImageData of the day painting.
export async function paintSlot(slot, painting) {
  const paint = PAINTERS[slot], surface = SPACE_ART.surfaces[slot];
  if (!paint || !surface) throw new Error(`No painter for slot '${slot}'`);
  return paint(painting, rng(SEEDS[slot]), surface.size);
}
