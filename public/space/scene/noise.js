// Seeded noise and the small number and colour helpers the scene builders share. Every placement and tint in the yard comes
// through these, so changing one changes the yard.

export const clamp01 = t => Math.max(0, Math.min(1, t));
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const lin = rgb => rgb.map(v => (v / 255) ** 2.2); // vertex colours are linear
// Seeded value noise in [0, 1].
export const hash = (i, j, seed) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const noise = (x, y, seed) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
// A seeded stream of numbers in [0, 1); `lane` keeps streams with the same seed apart.
export const stream = (seed, lane) => { let n = 0; return () => hash(n++, lane, seed); };
