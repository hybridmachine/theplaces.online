const deep = v => Array.isArray(v) ? Object.freeze(v.map(deep)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))) : v;

export const SPACE_ART = deep({
  version: 1, base: '/assets/lakeside-space-v1/', budgetBytes: 4_000_000, quality: .9,
  // metres: world distance one tile covers
  surfaces: {
    meadow: {file: 'meadow.webp', size: 1024, metres: 6},   earth: {file: 'earth.webp', size: 1024, metres: 5},
    shore:  {file: 'shore.webp',  size: 1024, metres: 5},   stone: {file: 'stone.webp', size: 1024, metres: 2.4},
    slate:  {file: 'slate.webp',  size: 1024, metres: 2.6}, bark:  {file: 'bark.webp',  size: 1024, metres: 2},
    water:  {file: 'water.webp',  size: 1024, metres: 14},  drystone: {file: 'drystone.webp', size: 512, metres: 2},
    hills:  {file: 'hills.webp',  size: 512,  metres: 220}, // the cabin's eave boards and soffits borrow this brushwork too (cabin.js)
  },
  // windowLit is the window with a lamp lit inside; the cottage's front windows mix the two by their rooms' light.
  panels: {door: {file: 'door.webp', width: 256, height: 512}, window: {file: 'window.webp', width: 256, height: 256},
    windowLit: {file: 'window-lit.webp', width: 256, height: 256}},
  cards: {file: 'cards.webp', size: 2048, cell: 512,
    cells: {oak: [0, 1, 2, 3], woods: [4, 5], dab: [6, 7], grass: [8, 9, 10], flower: [11], reeds: [12, 13]}},
});

// One entry per file: {slot, file, width, height, alpha}. alpha is true only for 'cards'.
export function artFiles(art = SPACE_ART) {
  return [
    ...Object.entries(art.surfaces).map(([slot, s]) => ({slot, file: s.file, width: s.size, height: s.size, alpha: false})),
    ...Object.entries(art.panels).map(([slot, p]) => ({slot, file: p.file, width: p.width, height: p.height, alpha: false})),
    {slot: 'cards', file: art.cards.file, width: art.cards.size, height: art.cards.size, alpha: true},
  ];
}

// Cell index (row-major, 4 per row, row 0 at the top) → [u, v, w, h] in texture space with v up.
export function cellRect(index, art = SPACE_ART) {
  const n = art.cards.size / art.cards.cell, w = 1 / n;
  return [(index % n) * w, (n - 1 - Math.floor(index / n)) * w, w, w];
}
