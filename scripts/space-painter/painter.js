// Offline stroke painter (runs in a browser page): turns colours sampled from the day painting into tileable, brushed textures.
import {SPACE_ART} from '../../shared/lakeside-space-art.js';
import {REGIONS} from './regions.js';

// One fixed seed per slot; every random number a texture uses comes from it.
export const SEEDS = Object.freeze({meadow: 3, earth: 5, shore: 9, stone: 13, slate: 17, bark: 19, water: 37, drystone: 43, hills: 41,
  door: 47, window: 53, cards: 59});

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

// Picks pixel colours from the named region, area-weighted; `keep` rejects pixels that belong to something else (after `tries`
// rejections it gives up and takes any pixel).
function sampler(paint, rects, rand, keep = null, tries = 40) {
  const areas = rects.map(r => r[2] * r[3]), total = areas.reduce((a, b) => a + b, 0);
  const raw = () => {
    let t = rand() * total, k = 0; while (t > areas[k] && k < rects.length - 1) t -= areas[k++];
    const r = rects[k], x = r[0] + (rand() * r[2] | 0), y = r[1] + (rand() * r[3] | 0), i = (y * paint.width + x) * 4;
    return [paint.data[i], paint.data[i + 1], paint.data[i + 2]];
  };
  const pick = () => { for (let n = 0; n < tries; n++) { const c = raw(); if (!keep || keep(c)) return c; } return raw(); };
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
    const c = canvas(size), g = c.getContext('2d'), S = size, k = size / 1024, rows = 16, rh = S / rows;
    g.fillStyle = css(mul(slate.mean, .72)); g.fillRect(0, 0, S, S);
    for (let row = 0; row < rows; row++) {
      // Each row starts anywhere across a whole slate and slates vary two-to-one in width, so joints never line up in a lattice.
      const start = r() * 110 * k; let x = start;
      while (x < start + S - 24 * k) {
        const left = start + S - x - 3 * k; let w = (36 + r() * 74) * k; if (left - w < 34 * k) w = left;
        const col = mix(slate.pick(), slate.mean, .3), shade = .85 + r() * .3;
        for (const o of [-.25, 0, .25]) // three side-by-side strokes fill each slate from its top edge down
          wrapped(g, S, x + w / 2 + (o + (r() - .5) * .1) * w, row * rh + rh * .55 + (r() - .5) * rh * .15, {angle: around(r, Math.PI / 2, .06), len: rh * (.95 + r() * .2), width: w * (.45 + r() * .15),
            color: jitter(r, mul(mix(col, slate.pick(), .25), shade), .06), alpha: .9, bristles: 5, taper: .3, ridge: .2}, r);
        x += w + 3 * k;
      }
      for (let x2 = 0; x2 < S; x2 += 30 * k) wrapped(g, S, x2 + r() * 20 * k, row * rh + 3 * k, {angle: around(r, 0, .05), len: (40 + r() * 30) * k, width: (4 + r() * 3) * k, color: mul(slate.mean, .5), alpha: .7, bristles: 1}, r);
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
    const hills = sampler(paint, REGIONS.hills, r, c => lum(c) < 185), k = size / 1024;
    return strokeTile(size, hills.mean, 3500, () => ({
      x: r() * size, y: r() * size, angle: around(r, r() < .5 ? .5 : -.5, .3), len: (40 + r() * 80) * k, width: (16 + r() * 24) * k, color: hills.pick(), alpha: .8, bristles: 3}), r);
  },
};

// ── Brush cards: alpha-tested shapes, one per 512 px cell, painted in cell pixels (scaled by `k` if the cell size changes). ──

const MARGIN = 8, FRINGE_ALPHA = 8; // clear border per cell; 8-bit alpha of the colour carried under the transparent interior

// A blade from (x, y) rising `lean` radians off upright and turning by `curl` radians over its length, tapering to a point. It is
// laid as overlapping tapered brush strokes along its spine, darker at the foot and lighter toward the tip, each stroke a little
// off in colour, so the outline breaks where one stroke hands over to the next. Returns false (drawing nothing) if any part would
// leave the cell's clear margin.
function blade(g, x, y, {len, lean, curl = 0, width, color, rib = false}, n, r) {
  const steps = Math.max(4, Math.min(12, Math.round(len / (width * 1.6)))), spine = []; let a = lean, px = x, py = y;
  for (let q = 0; q <= steps; q++) { spine.push([px, py, a]); px += Math.sin(a) * len / steps; py -= Math.cos(a) * len / steps; a += curl / steps; }
  const half = q => width / 2 * (1 - q / steps) ** .7 + 1;
  if (spine.some(([u, v], q) => u - half(q) < MARGIN + 4 || u + half(q) > n - MARGIN - 4 || v - half(q) < MARGIN + 4 || v > n - MARGIN)) return false;
  const seg = len / steps;
  for (let q = 0; q < steps; q++) {
    const [u0, v0, a0] = spine[q], [u1, v1] = spine[q + 1], t = (q + .5) / steps, last = q === steps - 1;
    const shade = .62 + .56 * t ** .8, w = width * (1 - t) ** .7 * (1.05 + r() * .2) + 1.5;
    dab(g, (u0 + u1) / 2, (v0 + v1) / 2, {angle: a0 - Math.PI / 2 + (r() - .5) * .06, len: seg * (last ? 1.15 : 1.7), width: Math.max(2, w), color: jitter(r, mul(color, shade), .12),
      alpha: 1, bristles: 3, bend: (r() - .5) * .25, taper: last ? 1 : .55, ridge: rib && t > .3 ? .45 : 0}, r);
  }
  return true;
}
// Keeps trying a blade, a little shorter each time, until it fits inside the cell.
function fitBlade(g, x, y, s, n, r) { for (let t = 0; t < 12 && !blade(g, x, y, s, n, r); t++) s = {...s, len: s.len * .88}; }

// Leaf masses (oak and woods): strokes scattered inside a union of lobes, minus small holes, lit from above both across the whole
// clump and on each lobe. With `rosette`, two to five leaves radiate unevenly from each point like the oak's sprays; otherwise each
// stroke stands alone, pointing outward at the edge so the outline breaks. `calm` pulls every colour toward the middle tone.
function leafMass(g, r, n, {lobes, holes = [], floor = n, count, leaf, rosette, light, mid, dark, contrast, calm = 0, taper = .7}) {
  const field = (x, y) => lobes.reduce((b, l) => {
    const dx = (x - l.x) / (l.rx ?? l.rad), dy = (y - l.y) / (l.column && y > l.y ? l.rad * 2.6 : l.rad), f = 1 - Math.hypot(dx, dy);
    return f > b[0] ? [f, l] : b;
  }, [-9, null]);
  const marks = [];
  for (let q = 0, tries = 0; q < count && tries < count * 40; tries++) {
    const x = MARGIN + r() * (n - 2 * MARGIN), y = MARGIN + r() * (n - 2 * MARGIN), [f, l] = field(x, y);
    if (f < 0 || y > floor - r() * 18 || holes.some(([hx, hy, hr]) => Math.hypot(x - hx, y - hy) < hr)) continue;
    const up = -(y - l.y) / l.rad, high = 1 - 2 * y / n, lit = .55 * up + .45 * high + (r() - .5) * .45;
    marks.push({x, y, f, lit, l}); q++;
  }
  marks.sort((a, b) => a.lit - b.lit); // shadowed leaves first, lit leaves laid over them
  for (const {x, y, f, lit, l} of marks) {
    const from = lit > .3 ? light : lit < -.15 ? dark : mid, col = mul(mix(from.pick(), mid.mean, calm), 1 + contrast * lit * .22);
    const out = Math.atan2(y - l.y, x - l.x), edge = f < .25, leaves = rosette ? 2 + (r() * 4 | 0) : 1, a0 = r() * TAU;
    for (let q = 0; q < leaves; q++) {
      const angle = rosette ? a0 + q / leaves * TAU + (r() - .5) * 1.4 : edge ? out + (r() - .5) * 1.2 : r() * TAU;
      const len = leaf[0] + r() * (leaf[1] - leaf[0]), o = rosette ? len * .45 : 0;
      dab(g, x + Math.cos(angle) * o, y + Math.sin(angle) * o, {angle, len, width: len * (.55 + r() * .3), color: jitter(r, col, .1), alpha: 1, bristles: 3,
        bend: (r() - .5) * .7, taper, ridge: lit > .5 ? .3 : 0}, r);
    }
  }
}

// Lobes for one oak spray: an uneven fan of lobes reaching out, up and a little down from the heart of the clump, kept inside the cell.
function oakLobes(r, n) {
  const k = n / 512, lobes = [], count = 7 + (r() * 4 | 0), lean = (r() - .5) * .7;
  for (let q = 0; q < count; q++) {
    const rad = (32 + r() * 40) * k, ang = -Math.PI / 2 + lean + (q / (count - 1) - .5) * 3.8 + (r() - .5) * .5, dist = (80 + r() * 95) * k;
    lobes.push({x: clamp(n / 2 + Math.cos(ang) * dist * 1.25, rad + 40 * k, n - rad - 40 * k), y: clamp(n * .55 + Math.sin(ang) * dist * .85, rad + 36 * k, n - rad - 44 * k), rad});
  }
  lobes.push({x: n / 2, y: n * .56, rad: 58 * k}); // the heart of the spray, so no lobe floats free
  return lobes;
}

// Removes the soft part of every edge (cards are alpha-tested near 0.5), then carries edge colour outward across the whole cell
// interior under a faint alpha (below the cut, but enough for the colour to survive encoding), so texture filtering and every mip
// level see the shape's own colour instead of black. The cell's outer MARGIN stays fully clear.
function finishCard(g, n) {
  const img = g.getImageData(0, 0, n, n), d = img.data, filled = new Uint8Array(n * n), inside = (x, y) => x >= MARGIN && y >= MARGIN && x < n - MARGIN && y < n - MARGIN;
  let front = [];
  for (let p = 0; p < n * n; p++) { const a = d[p * 4 + 3] / 255; d[p * 4 + 3] = clamp(((a - .5) * 3.2 + .5) * 255); if (d[p * 4 + 3] >= 128) { filled[p] = 1; front.push(p); } }
  while (front.length) { // grow ring by ring; each new pixel takes the mean colour of its already-coloured neighbours
    const ring = [];
    for (const p of front) for (const [dx, dy] of NEIGHBOURS) { const x = p % n + dx, y = (p / n | 0) + dy, q = y * n + x;
      if (inside(x, y) && !filled[q]) { filled[q] = 2; ring.push(q); } }
    for (const q of ring) { let s0 = 0, s1 = 0, s2 = 0, m = 0; const x = q % n, y = q / n | 0;
      for (const [dx, dy] of NEIGHBOURS) { const o = (y + dy) * n + x + dx; if (filled[o] === 1) { s0 += d[o * 4]; s1 += d[o * 4 + 1]; s2 += d[o * 4 + 2]; m++; } }
      d[q * 4] = s0 / m; d[q * 4 + 1] = s1 / m; d[q * 4 + 2] = s2 / m; d[q * 4 + 3] = Math.max(d[q * 4 + 3], FRINGE_ALPHA); }
    for (const q of ring) filled[q] = 1;
    front = ring;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inside(x, y)) d.fill(0, (y * n + x) * 4, (y * n + x) * 4 + 4);
  return img;
}
const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

// What each kind of cell holds. `n` is the cell size, `i` the cell's place among its kind. Grass, flowers and reeds stand on the
// cell's bottom edge (just inside the margin) at its centre.
const CARDS = {
  // Lobed, lacy oak sprays: small leaves in uneven rosettes, yellow-green where lit, olive beneath, sky through small gaps.
  oak(g, r, n, i, s) {
    const lobes = oakLobes(r, n), k = n / 512, holes = [];
    for (let q = 0; q < 9 + (r() * 5 | 0); q++) { const l = lobes[r() * lobes.length | 0]; holes.push([l.x + (r() - .5) * l.rad * 1.4, l.y + (r() - .5) * l.rad * 1.4, (8 + r() * 13) * k]); }
    // Twigs, seen only in the shadowed lower half through the gaps: each starts somewhere in the heart of the spray (never below the
    // mass) and stops short inside a lower or side lobe; the lit top has none.
    const heart = lobes[lobes.length - 1]; g.lineCap = 'round'; g.strokeStyle = css(mul(s.bark.mean, .6));
    for (const l of lobes.slice(0, -1)) {
      if (l.y < heart.y - heart.rad * .4) continue;
      const sx = heart.x + (r() - .5) * heart.rad * 1.2, sy = heart.y + (r() - .2) * heart.rad * .5, ex = sx + (l.x - sx) * (.6 + r() * .25), ey = sy + (l.y - sy) * (.6 + r() * .25);
      g.lineWidth = (2 + r() * 2) * k; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo((sx + ex) / 2, Math.min(sy, ey) - 8 * k, ex, ey); g.stroke();
    }
    leafMass(g, r, n, {lobes, holes, count: 440 * k * k, leaf: [10 * k, 19 * k], rosette: true, light: s.leafLight, mid: s.leaf, dark: s.leafDark, contrast: .8, calm: .2, taper: .75});
  },
  // Distant tree masses: broad, flat-bottomed domes in a narrow sage-to-moss range, blunt strokes, softly lit tops.
  woods(g, r, n, i, s) {
    const k = n / 512, count = 4 + (r() * 2 | 0), floor = n * (.86 + r() * .05), lobes = [];
    for (let q = 0; q < count; q++) {
      const rad = (52 + r() * 40) * k, rx = rad * 1.15, x = clamp(60 * k + (q + .5) / count * (n - 120 * k) + (r() - .5) * 30 * k, rx + 28 * k, n - rx - 28 * k);
      lobes.push({x, y: clamp(n * (.4 + r() * .24) - (q === count >> 1 ? 60 * k : 0), rad + 28 * k, n), rad, rx, column: true});
    }
    leafMass(g, r, n, {lobes, floor, count: 1300 * k * k, leaf: [18 * k, 34 * k], rosette: false, light: s.woodsLight, mid: s.woods, dark: s.woodsDark, contrast: .5, calm: .45, taper: .6});
  },
  // Neutral light dabs (the scene tints them): one long loaded stroke, or a pair; ragged where the bristles run dry.
  dab(g, r, n, i) {
    const k = n / 512, strokes = i === 0 ? [[n / 2, n / 2, 0, 380, 160]] : [[n * .43, n * .42, -.16, 280, 120], [n * .58, n * .6, .1, 270, 112]];
    for (const [x, y, angle, len, width] of strokes) {
      const v = 214 + r() * 16, grey = [v, v, v], L = len * k, W = width * k;
      dab(g, x, y, {angle, len: L, width: W, color: grey, alpha: 1, bristles: 18, taper: .45, ridge: .5, bend: (r() - .5) * .3}, r);
      g.save(); g.translate(x, y); g.rotate(angle); g.lineCap = 'round';
      for (let q = 0; q < 7; q++) { // a few dry bristle trails past the tip
        const o = (r() - .5) * W * .6, from = L * (.3 + r() * .15);
        g.strokeStyle = css(mul(grey, .9 + r() * .12)); g.lineWidth = (4 + r() * 5) * k;
        g.beginPath(); g.moveTo(from, o); g.lineTo(from + (20 + r() * 40) * k, o * (1.05 + r() * .15)); g.stroke();
      }
      for (let q = 0; q < 12; q++) { const t = (r() - .5) * L * .85, side = r() < .5 ? -1 : 1; // nicks and lumps along both edges
        dab(g, t, side * W * (.4 + r() * .12), {angle: (r() - .5) * .5, len: (26 + r() * 46) * k, width: (12 + r() * 16) * k, color: mul(grey, .94 + r() * .1), alpha: 1, bristles: 3, taper: .7}, r); }
      g.restore();
    }
  },
  // Tufts of long blades fanning from one foot; each cell a different height, the last with a few seed heads.
  grass(g, r, n, i, s) {
    const k = n / 512, top = [470, 330, 420][i % 3] * k, foot = n - MARGIN - 1, blades = [150, 120, 130][i % 3];
    for (let q = 0; q < blades; q++) {
      const spread = (r() - .5) * 2, x = n / 2 + spread * 80 * k, len = top * (.32 + r() * .68) * (1 - .3 * Math.abs(spread)), lean = spread * .92 + (r() - .5) * .45;
      const col = r() < .14 ? mix(s.meadow.pick(), [180, 166, 110], .55) : mul(mix(s.meadow.pick(), [124, 150, 68], .3), .92 + r() * .28);
      fitBlade(g, x, foot, {len, lean, curl: lean * (.2 + r() * 1.1) + (r() - .5) * .5, width: (6 + r() * 9) * k, color: col, rib: r() < .4}, n, r);
    }
    if (i % 3 === 2) for (let q = 0; q < 7; q++) seedStalk(g, r, n, n / 2 + (r() - .5) * 110 * k, foot, top * (.8 + r() * .2), (r() - .5) * .5, mix(s.meadow.mean, [190, 172, 118], .6));
  },
  // Cow parsley: a thin stem carrying a flat cream umbel of small umbellets, a smaller side umbel, two small leaves low down.
  flower(g, r, n, i, s) {
    const k = n / 512, foot = n - MARGIN - 1, stem = mix(s.meadow.mean, [96, 112, 58], .5);
    const umbel = (ux, uy, size) => {
      const rays = 11 + (r() * 4 | 0); g.lineWidth = 2.6 * k; g.strokeStyle = css(mix(stem, [190, 190, 150], .25));
      const ends = Array.from({length: rays}, (_, q) => { const a = (q / (rays - 1) - .5) * 2.3 + (r() - .5) * .15, len = size * (.8 + r() * .3);
        return [ux + Math.sin(a) * len * 1.2, uy - Math.cos(a) * len * .5 - size * .1]; });
      for (const [ex, ey] of ends) { g.beginPath(); g.moveTo(ux, uy); g.lineTo(ex, ey); g.stroke(); }
      for (const [ex, ey] of ends) for (let d = 0; d < 22; d++) { const t = r() * Math.PI, rr = r() ** .6 * size * .3;
        g.fillStyle = css(mul(mix(s.cream.pick(), [242, 236, 214], .5), .8 + .22 * Math.sin(t)));
        g.beginPath(); g.arc(ex + Math.cos(t) * rr, ey - Math.sin(t) * rr * .5, (3.5 + r() * 3) * k, 0, TAU); g.fill(); }
    };
    g.lineCap = 'round'; g.strokeStyle = css(stem);
    const ux = n / 2 + 18 * k, uy = 140 * k, bx = n / 2 + 4 * k, by = 300 * k, sx = bx - 100 * k, sy = 228 * k;
    g.lineWidth = 5 * k; g.beginPath(); g.moveTo(n / 2, foot); g.quadraticCurveTo(n / 2 - 14 * k, 320 * k, ux, uy); g.stroke();
    g.lineWidth = 3.5 * k; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx - 50 * k, 268 * k, sx, sy); g.stroke();
    for (const [lx, ly, a] of [[n / 2 - 2 * k, 440 * k, -1], [n / 2 + 1 * k, 395 * k, .9]]) for (let d = 0; d < 5; d++) // two small divided leaves
      dab(g, lx + Math.sin(a) * (14 + d * 9) * k, ly - Math.cos(a) * (14 + d * 9) * k - d * 3 * k, {angle: a - Math.PI / 2 + (r() - .5) * .8, len: (24 - d * 3) * k, width: (13 - d * 1.5) * k, color: mul(stem, .9 + r() * .2), alpha: 1, bristles: 2, taper: .8}, r);
    umbel(ux, uy, 92 * k); umbel(sx, sy, 50 * k);
  },
  // Upright reed clusters: long narrow leaves standing nearly straight, some tips bending, a few feathery seed heads.
  reeds(g, r, n, i, s) {
    const k = n / 512, foot = n - MARGIN - 1;
    for (let q = 0; q < 60; q++) {
      const spread = (r() - .5) * 2, x = n / 2 + spread * 70 * k, len = (220 + r() * 270) * k, lean = spread * .28 + (r() - .5) * .24;
      fitBlade(g, x, foot, {len, lean, curl: r() < .22 ? (r() < .5 ? -1 : 1) * (.6 + r() * .7) : (r() - .5) * .25, width: (7 + r() * 8) * k, color: mul(s.reeds.pick(), .88 + r() * .3), rib: r() < .5}, n, r);
    }
    for (let q = 0; q < 4 + i * 2; q++) seedStalk(g, r, n, n / 2 + (r() - .5) * 70 * k, foot, (360 + r() * 120) * k, (r() - .5) * .3, mix(s.reeds.mean, [168, 146, 98], .55));
  },
};

// A thin stalk ending in a loose, feathery seed head of short upward strokes.
function seedStalk(g, r, n, x, foot, len, lean, color) {
  const k = n / 512, tx = x + Math.sin(lean) * len, ty = foot - Math.cos(lean) * len;
  if (ty < MARGIN + 50 * k || tx < MARGIN + 30 * k || tx > n - MARGIN - 30 * k) return;
  g.strokeStyle = css(mul(color, .8)); g.lineWidth = 2.5 * k; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, foot); g.lineTo(tx, ty); g.stroke();
  for (let d = 0; d < 16; d++) { const t = r() * .3, px = tx - Math.sin(lean) * len * t, py = ty + Math.cos(lean) * len * t, side = r() < .5 ? -1 : 1;
    dab(g, px + side * 5 * k, py, {angle: -Math.PI / 2 + lean + side * (.3 + r() * .4), len: (12 + r() * 10) * k, width: (4 + r() * 3) * k, color: mul(color, .85 + r() * .3), alpha: 1, bristles: 1, taper: .9}, r); }
}

function paintCards(paint, r) {
  const {size, cell: n, cells} = SPACE_ART.cards, atlas = canvas(size), ag = atlas.getContext('2d'), per = size / n;
  const leafy = c => c[1] >= c[2] * 1.12 && c[1] >= c[0] * .85, S = (name, keep) => sampler(paint, REGIONS[name], r, keep, 2000);
  const s = {leaf: S('foliage', c => leafy(c) && c[1] >= c[0] * .95 && lum(c) > 80 && lum(c) < 140), leafLight: S('foliage', c => c[1] >= c[0] * .98 && c[1] > c[2] * 1.3 && lum(c) >= 135),
    leafDark: S('foliage', c => leafy(c) && lum(c) > 35 && lum(c) <= 85), bark: S('bark'),
    woods: S('woods', c => leafy(c) && c[1] >= c[0] && lum(c) > 70 && lum(c) < 130), woodsLight: S('woods', c => leafy(c) && c[1] >= c[0] && lum(c) >= 115 && lum(c) < 170),
    woodsDark: S('woods', c => leafy(c) && c[1] >= c[0] && lum(c) > 45 && lum(c) <= 85), meadow: S('meadow', greenish), cream: S('meadow', c => lum(c) > 190),
    reeds: S('reeds', c => c[1] >= c[2] * 1.15 && c[1] >= c[0] * .95 && lum(c) > 60 && lum(c) < 165)};
  for (const [kind, list] of Object.entries(cells)) list.forEach((index, i) => {
    const c = canvas(n), g = c.getContext('2d', {willReadFrequently: true});
    CARDS[kind](g, rng(r() * 4294967296 | 0), n, i, s);
    ag.putImageData(finishCard(g, n), (index % per) * n, Math.floor(index / per) * n);
  });
  return atlas;
}

// ── Panels: opaque, painted to the full panel. ──
const PANELS = {
  // A weathered dark green ledged plank door in a painted frame, iron strap hinges and latch.
  door(paint, r, w, h) {
    const c = canvas(w, h), g = c.getContext('2d'), door = sampler(paint, REGIONS.door, r), k = w / 256;
    const green = mix(mul(door.mean, .7), [52, 76, 60], .45), frame = mix(green, [70, 88, 74], .5), F = 18 * k, planks = 4, pw = (w - 2 * F) / planks;
    g.fillStyle = css(mul(green, .55)); g.fillRect(0, 0, w, h);
    for (let p = 0; p < planks; p++) { // vertical strokes along each plank, each plank its own tone
      const x0 = F + p * pw, tone = .9 + r() * .2;
      for (let q = 0; q < 70; q++) dab(g, x0 + 4 * k + r() * (pw - 8 * k), F + r() * (h - 2 * F), {angle: around(r, Math.PI / 2, .02), len: (60 + r() * 140) * k, width: (6 + r() * 10) * k,
        color: jitter(r, mul(mix(green, door.pick(), .25), tone * (.92 + r() * .14)), .05), alpha: .9, bristles: 4, taper: .3}, r);
      g.strokeStyle = css(mul(green, .38)); g.lineWidth = 2.5 * k; g.beginPath(); g.moveTo(x0, F); // the joint
      for (let y = F; y <= h - F; y += 24 * k) g.lineTo(x0 + (r() - .5) * 1.4 * k, y); g.stroke();
    }
    for (let q = 0; q < 45; q++) dab(g, F + r() * (w - 2 * F), F + r() * (h - 2 * F), {angle: around(r, Math.PI / 2, .03), len: (20 + r() * 60) * k, width: (2 + r() * 3) * k,
      color: mix(door.pick(), [160, 170, 150], .3), alpha: .18 + r() * .17, bristles: 1, taper: .6}, r); // worn, dry paint
    const grime = g.createLinearGradient(0, h * .72, 0, h); grime.addColorStop(0, css([40, 44, 34], 0)); grime.addColorStop(1, css([40, 44, 34], .45));
    g.fillStyle = grime; g.fillRect(0, h * .72, w, h);
    for (const fy of [.2, .8]) for (let x = F + pw / 2; x < w - F; x += pw) for (const dy of [-6, 6]) { // nail heads where the ledges are
      g.fillStyle = css([34, 36, 30], .8); g.beginPath(); g.arc(x + (r() - .5) * 4 * k, h * fy + dy * k, 2.4 * k, 0, TAU); g.fill(); }
    for (const fy of [.18, .78]) { // strap hinges from the hanging side
      const y = h * fy; g.fillStyle = css([44, 40, 36]); g.beginPath(); g.moveTo(F - 2 * k, y - 6 * k); g.lineTo(F + 120 * k, y - 3 * k); g.lineTo(F + 132 * k, y); g.lineTo(F + 120 * k, y + 3 * k); g.lineTo(F - 2 * k, y + 6 * k); g.fill();
      g.fillStyle = css([110, 72, 48], .35); g.fillRect(F + 20 * k, y + 1 * k, 80 * k, 3 * k);
    }
    g.fillStyle = css([40, 38, 34]); g.fillRect(w - F - 46 * k, h * .5 - 16 * k, 20 * k, 32 * k); // latch plate, ring and keyhole
    g.strokeStyle = css([52, 48, 42]); g.lineWidth = 3.5 * k; g.beginPath(); g.arc(w - F - 36 * k, h * .5 + 22 * k, 9 * k, 0, TAU); g.stroke();
    g.fillStyle = css([20, 20, 18]); g.fillRect(w - F - 38 * k, h * .5 + 46 * k, 4 * k, 9 * k);
    // The painted frame around it, lighter on its worn inner edge, with a shadow where it meets the planks.
    for (const [x, y, fw, fh, angle] of [[0, 0, w, F, 0], [0, 0, F, h, Math.PI / 2], [w - F, 0, F, h, Math.PI / 2], [0, h - F, w, F, 0]]) {
      g.fillStyle = css(frame); g.fillRect(x, y, fw, fh);
      for (let q = 0; q < 40; q++) dab(g, x + r() * fw, y + r() * fh, {angle: around(r, angle, .03), len: (30 + r() * 60) * k, width: (5 + r() * 6) * k, color: jitter(r, mix(frame, door.pick(), .3), .08), alpha: .85, bristles: 3}, r);
    }
    g.fillStyle = css([24, 28, 22], .55); g.fillRect(F, F, w - 2 * F, 5 * k); g.fillRect(F, F, 4 * k, h - 2 * F);
    g.fillStyle = css(mix(frame, [200, 204, 186], .35), .6); g.fillRect(w - F - 2 * k, F, 2 * k, h - 2 * F);
    return c;
  },
  // A dark glazed casement: three by three panes behind pale painted bars, in a pale frame with a shadowed reveal. No light inside.
  window(paint, r, w, h) {
    const c = canvas(w, h), g = c.getContext('2d'), win = sampler(paint, REGIONS.window, r), k = w / 256;
    const glassFrom = sampler(paint, REGIONS.window, r, x => lum(x) < 85), paleFrom = sampler(paint, REGIONS.window, r, x => lum(x) > 150);
    const glass = mix(glassFrom.mean, [34, 42, 40], .4), pale = mix(paleFrom.mean, [214, 210, 196], .55), F = 22 * k, B = 7 * k;
    g.fillStyle = css(glass); g.fillRect(0, 0, w, h);
    for (let q = 0; q < 260; q++) dab(g, r() * w, r() * h, {angle: r() * TAU, len: (14 + r() * 30) * k, width: (6 + r() * 8) * k,
      color: jitter(r, mul(mix(glass, glassFrom.pick(), .35), .9 + r() * .2), .06), alpha: .7, bristles: 2, taper: .4}, r);
    for (let q = 0; q < 6; q++) dab(g, F + r() * (w - 2 * F), F + r() * (h * .5), {angle: -.9 + (r() - .5) * .2, len: (24 + r() * 40) * k, width: (4 + r() * 6) * k,
      color: [112, 124, 130], alpha: .08 + r() * .07, bristles: 1, taper: .8}, r); // dull reflections of the sky, nothing lit within
    g.fillStyle = css([14, 18, 16], .5); g.fillRect(F, F, w - 2 * F, 9 * k); g.fillRect(F, F, 8 * k, h - 2 * F); // reveal shadow
    const bar = (x, y, bw, bh, vertical) => { // a painted bar: a pale stroke laid along it, wobbling a little
      for (let q = 0; q < Math.max(bw, bh) / (24 * k); q++) {
        const t = (q + .5) * 24 * k, px = vertical ? x + bw / 2 + (r() - .5) * k : x + t, py = vertical ? y + t : y + bh / 2 + (r() - .5) * k;
        dab(g, px, py, {angle: (vertical ? Math.PI / 2 : 0) + (r() - .5) * .03, len: 36 * k, width: Math.min(bw, bh) * 1.05, color: jitter(r, mul(mix(pale, paleFrom.pick(), .3), .92 + r() * .14), .05), alpha: 1, bristles: 2, taper: .2}, r);
      }
    };
    for (const t of [1 / 3, 2 / 3]) { bar(F + (w - 2 * F) * t - B / 2, F, B, h - 2 * F, true); bar(F, F + (h - 2 * F) * t - B / 2, w - 2 * F, B, false); }
    for (const [x, y, fw, fh, v] of [[0, 0, w, F, false], [0, h - F, w, F, false], [0, 0, F, h, true], [w - F, 0, F, h, true]]) { // the frame: long strokes along each side
      g.fillStyle = css(mul(pale, .9)); g.fillRect(x, y, fw, fh);
      for (let q = 0; q < 16; q++) dab(g, x + (v ? fw * (.25 + r() * .5) : r() * fw), y + (v ? r() * fh : fh * (.25 + r() * .5)), {angle: (v ? Math.PI / 2 : 0) + (r() - .5) * .03,
        len: (50 + r() * 70) * k, width: Math.min(fw, fh) * (.35 + r() * .25), color: jitter(r, mul(mix(pale, paleFrom.pick(), .3), .86 + r() * .16), .04), alpha: .9, bristles: 3, taper: .3}, r);
    }
    g.fillStyle = css([30, 30, 26], .35); g.fillRect(F, h - F - 3 * k, w - 2 * F, 3 * k); // the bottom rail's lip
    return c;
  },
};

// Paints one slot's texture at its exported size. `painting` is the ImageData of the day painting.
export async function paintSlot(slot, painting) {
  const r = rng(SEEDS[slot]), surface = SPACE_ART.surfaces[slot], panel = SPACE_ART.panels[slot];
  if (slot === 'cards') return paintCards(painting, r);
  if (panel && PANELS[slot]) return PANELS[slot](painting, r, panel.width, panel.height);
  if (surface && PAINTERS[slot]) return PAINTERS[slot](painting, r, surface.size);
  throw new Error(`No painter for slot '${slot}'`);
}
