import {gardenPlan, windowSpan} from '../../../shared/lakeside-dressing.js';
import {gardenState} from '../../../shared/garden-life.js';
import {SPACE_ART} from '../../../shared/lakeside-space-art.js';
import {basis, cardBatch, cardMaterial, mergeGeometries, sheet, tube, V} from '../geometry.js';
import {clamp01, hash, mix, noise, smoothstep, stream} from './noise.js';

// The kitchen garden: two raised beds of weathered boards, built once, and in them soil and crops as they stand on a world day
// (gardenState): corn, a teepee of bean poles and staked tomatoes that grow, flower, fruit, yellow and dry through the year,
// redrawn when the day changes. Boards, stalks, poles and stakes are solid, in the bark's paint with the grain run along them;
// every leaf, tassel, ear, flower and fruit is a card cut from the atlas's neutral dabs and tinted, leaning with the yard's
// wind. World axes x east, y north, z up, metres; three is passed in.

// The day drawn when none is given: late summer, the garden full grown.
export const GARDEN_DAY = 230;
const LIP = .05, TAU = 2 * Math.PI, UP = [0, 0, 1], SEAM = .025;
// The dab's stroke fills this much of its square cell, across and up, so a card is sized by the stroke it shows.
const STROKE = [.85, .36];
// Linear colours. The bark's paint is dark, so what borrows it is tinted above 1: boards silvered, poles pale, stalks green.
const BOARD = [1.9, 1.75, 1.5], POLE = [2.1, 1.85, 1.45], STALK = [1.2, 2.3, .9], VINE = [1.0, 1.7, .8], SOIL = [.5, .42, .36];
const DRY_STALK = [1.7, 1.5, 1.05], DEAD_STALK = [1.3, 1.15, .95], BLACK_STEM = [.45, .4, .32];
const CORN = [.4, .52, .12], BEAN = [.22, .37, .08], TOMATO = [.16, .29, .07], STRAW = [.85, .74, .42], EAR = [.6, .66, .2], BLOSSOM = [.95, .93, .85];
const HUSK = [.86, .8, .52], POD = [.3, .46, .1], DRY = [.42, .36, .28], BLACK = [.07, .06, .04];
const GREEN_FRUIT = [.5, .55, .16], ORANGE = [.8, .3, .08], RED = [.78, .12, .07];
const MULCH = [.62, .5, .26], OLD_MULCH = [.8, .74, .56];
const shade = (c, k) => c.map(x => x * k);

export function buildGarden(THREE, {space, dressing, art, day = GARDEN_DAY}) {
  const tile = SPACE_ART.surfaces.bark.metres, th = dressing.garden.board;
  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };
  const tinted = (g, colour) => { const c = g.getAttribute('color'); for (let i = 0; i < c.count; i++) c.setXYZ(i, ...colour); return g; };
  // the bed's own frame: `u` along its length (north plot at −a), `v` across
  const frame = bed => { const u = [Math.sin(bed.yaw), Math.cos(bed.yaw), 0], v = [Math.cos(bed.yaw), -Math.sin(bed.yaw), 0];
    return {u, v, at: (a, b, z) => [bed.center[0] + a * u[0] + b * v[0], bed.center[1] + a * u[1] + b * v[1], z]}; };

  // ── the beds: four boards a side seen from outside, their inner faces above the soil, and their top edges (built once) ──
  const boards = [];
  for (const bed of gardenPlan(space, dressing).beds) {
    const {u, v, at} = frame(bed), [l, w] = bed.half, lip = bed.top + LIP;
    // two planks deep, each its own weathered tone, darker toward the ground and in slow patches along its length
    const tone = k => p => shade(BOARD, k * (.8 + .35 * noise(p[0] * 1.7 + k * 40, p[1] * 1.7 + p[2] * .6, 61))), plank = tone(1), seam = bed.top - .1;
    // `s` runs up the board and `t` along it, so the bark's streaks lie along the plank as grain
    const face = (a0, b0, a1, b1, z0, z1, outward, colour = plank) => boards.push(sheet(THREE, (s, t) => at(a0 + (a1 - a0) * t, b0 + (b1 - b0) * t, z0 + (z1 - z0) * s),
      {nt: 6, tile, outward, colour}));
    // outside, each side shows two planks, the lower one darker and running into the ground
    const outer = (a0, b0, a1, b1, outward) => { face(a0, b0, a1, b1, bed.base, seam, outward, tone(.82)); face(a0, b0, a1, b1, seam, lip, outward); };
    for (const side of [-1, 1]) {
      outer(-l, side * w, l, side * w, V.scale(v, side)); outer(side * l, -w, side * l, w, V.scale(u, side));
      face(-l + th, side * (w - th), l - th, side * (w - th), bed.top - .03, lip, V.scale(v, -side));
      face(side * (l - th), -w + th, side * (l - th), w - th, bed.top - .03, lip, V.scale(u, -side));
      // the top edges: the long boards run the bed's whole length, the end boards fit between them
      boards.push(sheet(THREE, (s, t) => at(-l + 2 * l * t, side * (w - th * s), lip), {nt: 6, tile, outward: UP, colour: p => shade(plank(p), 1.12)}));
      boards.push(sheet(THREE, (s, t) => at(side * (l - th * s), (-w + th) + 2 * (w - th) * t, lip), {nt: 3, tile, outward: UP, colour: p => shade(plank(p), 1.12)}));
    }
  }

  // ── the soil of a day: each plot's own colour, darker when freshly dug, under straw while it rests, blended across the seam ──
  const plotColour = (soil, p) => {
    const earth = shade(SOIL, (.8 + .4 * noise(p[0] * 2.3, p[1] * 2.3, 63)) * (1 - .4 * soil.dug));
    if (!(soil.mulch > 0)) return earth;
    // straw, bleaching paler as it thins (mulch runs 1 → .6), lying in drifts that let a little soil show
    const straw = shade(mix(MULCH, OLD_MULCH, clamp01((1 - soil.mulch) / .4)), .85 + .3 * noise(p[0] * 9, p[1] * 9, 65));
    return mix(earth, straw, clamp01(soil.mulch * 1.4) * (.75 + .25 * noise(p[0] * 4, p[1] * 4, 66)));
  };
  const soilOf = state => merged(state.beds.map(bed => {
    const {u, at} = frame(bed), [l, w] = bed.half, L = l - th, W = w - th, plot = half => state.plots.find(q => q.id === `${bed.id}-${half}`);
    const north = plot('north'), south = plot('south');
    // rows along the bed, two of them SEAM either side of the line between the plots so the blend stays 5 cm wide
    const rows = [...[0, 1, 2, 3, 4].map(k => -L + (L - SEAM) * k / 4), ...[0, 1, 2, 3, 4].map(k => SEAM + (L - SEAM) * k / 4)];
    return sheet(THREE, (s, t) => { const a = rows[Math.round(s * (rows.length - 1))], b = -W + 2 * W * t; return at(a, b, bed.top + .025 * noise(a * 3 + bed.center[0], b * 3, 62)); },
      {ns: rows.length - 1, nt: 4, tile: SPACE_ART.surfaces.earth.metres * .5, outward: UP, colour: p => {
        const a = V.dot(V.sub(p, at(0, 0, p[2])), u);
        return mix(plotColour(north.soil, p), plotColour(south.soil, p), smoothstep(-SEAM, SEAM, a));
      }});
  }));

  // ── the crops of a day ──
  const cells = SPACE_ART.cards.cells.dab, [azMin] = windowSpan(space, dressing), toward = [-Math.cos(azMin), Math.sin(azMin), 0];
  // A unit vector `elevation` radians above the horizontal toward azimuth `az`, and one across it turned `twist` out of the level.
  const aim = (az, elevation, twist) => {
    const out = [Math.sin(az), Math.cos(az), 0], dir = V.add(V.scale(out, Math.cos(elevation)), UP, Math.sin(elevation));
    const level = [Math.cos(az), -Math.sin(az), 0], rise = V.cross(level, dir);
    return [dir, V.norm(V.add(V.scale(level, Math.cos(twist)), rise, Math.sin(twist)))];
  };
  // A leaf's colour by its stage: green yellowing toward straw from the lowest leaves (`low` 0) up, then drying on toward `dead`.
  const aged = (green, st, low, dead = DRY) => mix(mix(green, STRAW, clamp01((st.yellow - .5 * low) / .5)), dead, st.dry);

  const crops = state => {
    const stems = [], leaves = cardBatch(SPACE_ART);
    for (const p of state.plants) {
      const st = p.stage, h = st.height, r = stream(Math.floor(p.seed * 1e6), 12), [fx, fy, fz] = p.foot, H = p.height;
      // where on the plant, `t` of its grown height up; the bean poles and the stakes stand full height whatever the plant
      const along = (t, k = h) => [fx + p.lean[0] * t * k, fy + p.lean[1] * t * k, fz + H * k * t];
      // it sways more as it grows, and stiffly once dry; leaves and stalks fill out with its height
      const green = .25 + .75 * h, sway = {kind: 'crop', random: 0, scale: green + (.4 - green) * st.dry}, grow = .3 + .7 * h;
      let serial = 0;
      // One dab as a blade or a round leaf: from `from`, `length` metres along unit `dir` (its blunt end at `from`), `width`
      // across along unit `across`, tinted and a little darker along one edge. It takes its random numbers whether drawn or
      // not, so what a plant shows never reshuffles it. The card, as cut, is scaled toward `from` until no corner lies on the
      // window's side of the plant's room (p.room, measured at the foot) nor below the soil.
      const blade = (from, dir, across, length, width, colour, cell = cells[0]) => {
        const k = .88 + .24 * r(), random = hash(Math.floor(p.seed * 1e6), serial++, 64);
        if (!(length > .005)) return;
        const reach = (n, d, a) => length / 2 * V.dot(n, d) - length / 2 / STROKE[0] * Math.abs(V.dot(n, d)) - width / 2 / STROKE[1] * Math.abs(V.dot(n, a));
        const room = p.room + V.dot(toward, V.sub(from, p.foot)), floor = from[2] - fz, cw = reach(toward, dir, across), cz = reach(UP, dir, across);
        const fit = Math.min(1, cw < 0 ? room / -cw : 1, cz < 0 ? floor / -cz : 1);
        if (!(room > 0 && floor >= 0 && fit > .15)) return;
        leaves.add(V.add(from, dir, fit * length / 2), V.scale(dir, fit * length / 2 / STROKE[0]), V.scale(across, fit * width / 2 / STROKE[1]), cell, shade(colour, k * .7), shade(colour, k),
          UP, false, {...sway, random});
      };
      const round = (centre, normal, radius, colour) => {
        const [right, up] = basis(V.norm(normal)), turn = r() * TAU, dir = V.add(V.scale(right, Math.cos(turn)), up, Math.sin(turn)), across = V.add(V.scale(up, Math.cos(turn)), right, -Math.sin(turn));
        const cell = cells[r() < .5 ? 0 : 1];
        blade(V.add(centre, dir, -radius), dir, across, radius * 2, radius * 1.7, colour, cell);
      };
      // How far a leaf with order `rank` (0–.85, fixed by the seed) is out on a day: it unfurls as the leaf share passes it, and
      // dry plants drop leaves at random (`drop`) until a third are left.
      const unfurled = (rank, drop) => drop < st.dry * 2 / 3 ? 0 : clamp01((st.leaf - rank) / .15);
      const stem = (points, colour, sides = 5) => { if (V.len(V.sub(points.at(-1), points[0]).slice(0, 3)) > .02) stems.push(tinted(tube(THREE, points, {sides, tile}), colour)); };

      if (p.kind === 'corn') {
        stem([[...along(-.03), .024 * grow], [...along(.5), .017 * grow], [...along(.93), .008 * grow]], mix(mix(STALK, DRY_STALK, st.yellow), DEAD_STALK, st.dry));
        // leaves alternate up two sides of the stalk, each arching out and then drooping to its tip, drooping further as it dries
        const n = 7 + Math.floor(r() * 3), side = r() * TAU;
        for (let i = 0; i < n; i++) {
          const t = .14 + .7 * (i + r() * .5) / n, az = side + i * Math.PI + (r() - .5) * .9, length = (.5 + r() * .3) * (1 - .35 * Math.abs(t - .45)), width = .07 + r() * .03;
          const twist = (r() < .5 ? -1 : 1) * (.5 + r() * .7), [up1, across1] = aim(az, .6 + r() * .4 - .5 * st.dry, twist), [up2, across2] = aim(az + (r() - .5) * .3, -.25 - r() * .5 - .5 * st.dry, twist);
          const rank = .85 * (t - .14) / .7, out = unfurled(rank, r()) * grow, colour = aged(CORN, st, rank / .85), from = along(t), bend = V.add(from, up1, length * out * .42);
          blade(from, up1, across1, length * out * .55, width * out, colour); blade(bend, up2, across2, length * out * .55, width * out * .85, shade(colour, 1.08));
        }
        // the tassels come with the flowers and stay, drying, once the ears have set
        const tassel = st.fruit > 0 || st.yellow > 0 ? 1 : st.flower;
        for (let k = 0; k < 3; k++) {
          const [dir, across] = aim(r() * TAU, 1.1 + r() * .4, r() * TAU), length = .16 + r() * .08, out = clamp01((tassel - .8 * r()) / .2);
          blade(along(.9), dir, across, length * out, .03, mix(STRAW, DRY, st.dry));
        }
        if (r() < .8) { const [dir, across] = aim(side + Math.PI / 2 + (r() - .5), 1.15, r() * TAU); blade(along(.4 + r() * .12), dir, across, st.fruit > .02 ? .2 * (.3 + .7 * st.fruit) : 0, .06, mix(mix(EAR, HUSK, st.ripe), DRY, st.dry)); }
      } else if (p.kind === 'bean') {
        // the pole, whenever it stands, runs on a little past where the poles cross; the vine climbs it as the plant grows
        if (st.support) stem([[...along(-.03, 1), .014], [...along(1.07, 1), .011]], POLE);
        const top = Math.min(.98, 1.05 * h);
        stem([0, .25, .5, .75, 1].map(k => { const t = k * top, c = along(t, 1), a = t * 9 + p.seed * TAU; return [c[0] + Math.sin(a) * .018, c[1] + Math.cos(a) * .018, c[2], .005 * grow]; }),
          mix(mix(VINE, DRY_STALK, st.yellow), DEAD_STALK, st.dry), 4);
        const n = 24 + Math.floor(r() * 6);
        for (let i = 0; i < n; i++) {
          const t = .06 + .88 * (i + r()) / n, a = r() * TAU, out = [Math.sin(a), Math.cos(a), 0], c = V.add(along(t, 1), out, .04 + r() * .07), rank = .85 * (t - .06) / .88, drop = r();
          const normal = V.add(out, [r() - .5, r() - .5, r() * .9 - .6 * st.dry], .8), radius = .045 + r() * .025, tone = .85 + r() * .4;
          const leaf = unfurled(rank, drop);
          round(V.add(c, UP, -.03 * st.dry), normal, radius * leaf * (.6 + .4 * h), shade(aged(BEAN, st, rank / .85), tone));
          round(V.add(c, out, .03), out, r() < .14 * st.flower && leaf > 0 ? .022 : 0, BLOSSOM);
        }
        // pods: narrow blades hanging below the leaves, each out when the fruit share passes its own threshold
        for (let i = 0; i < 10; i++) {
          const t = .15 + .75 * r(), a = r() * TAU, [dir, across] = aim(a, -1.35, r() * TAU), length = .09 + r() * .05, out = clamp01((st.fruit - r()) / .15);
          blade(V.add(along(t, 1), [Math.sin(a), Math.cos(a), 0], .07), dir, across, length * out, .014, mix(mix(POD, HUSK, st.ripe), DRY, st.dry));
        }
      } else {
        // a stake beside the stem while it stands, the plant a loose ball of leaf about its upper half, the fruit hanging low on its outside
        const a = r() * TAU, stake = [fx + Math.sin(a) * .07, fy + Math.cos(a) * .07];
        const tall = 1.05 + r() * .1;
        if (st.support) stem([[...stake, fz - .03, .013], [...stake, fz + tall, .012]], POLE);
        stem([[...along(-.03), .012 * grow], [...along(.75), .007 * grow]], mix(mix(VINE, DRY_STALK, st.yellow), BLACK_STEM, st.dry), 4);
        const centre = along(.55), rx = (.26 + r() * .06) * grow, rz = H * h * .45 * (1 - .25 * st.dry);
        const shell = (k, low) => { const az = r() * TAU, z = low ? -.75 + r() * .7 : -.9 + r() * 1.9, s = Math.sqrt(1 - Math.min(1, z * z)); return [[Math.sin(az) * s, Math.cos(az) * s, z], k]; };
        for (let i = 0, n = 34 + Math.floor(r() * 6); i < n; i++) {
          // inner leaves first, the ball filling outward
          const [d, k] = shell(.3 + r() * .7), c = V.add(centre, [d[0] * rx * k, d[1] * rx * k, d[2] * rz * k]), rank = .85 * (k - .3) / .7;
          const normal = V.add(d, [r() - .5, r() - .5, r() - .3 - .6 * st.dry], .7), radius = .08 + r() * .05, tone = .8 + r() * .5;
          round(c, normal, radius * unfurled(rank, r()) * (.5 + .5 * h), shade(aged(TOMATO, st, (d[2] + 1) / 2, BLACK), tone));
        }
        for (let i = 0, n = 5 + Math.floor(r() * 4); i < n; i++) {
          const [d] = shell(1, true), c = V.add(centre, [d[0] * rx * 1.08, d[1] * rx * 1.08, d[2] * rz]), size = .032 + r() * .014, set = r();
          // each fruit is out while the fruit share passes `set`; it ripens green → orange → red as the ripeness passes its own
          // threshold, the late-set fruit (picked first as the share falls) ripening first, so they turn a few at a time
          const turn = clamp01((st.ripe - (.7 * set + .1 * r())) / .2), out = clamp01((st.fruit - set) / .1);
          const colour = mix(turn < .5 ? mix(GREEN_FRUIT, ORANGE, turn * 2) : mix(ORANGE, RED, turn * 2 - 1), BLACK, st.dry), radius = st.fruit > set ? size * (.4 + .6 * out) : 0;
          // two cards crossed, so a fruit shows from the side as well as face on
          round(c, [d[0], d[1], 0], radius, colour); round(c, [-d[1], d[0], 0], radius, colour);
        }
      }
    }
    return {stems: stems.length ? merged(stems) : empty(), leaves: leaves.geometry(THREE)};
  };
  // No stems on a day: the same attributes as a merged tube, holding nothing.
  const empty = () => { const g = new THREE.BufferGeometry(); for (const [n, k] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) g.setAttribute(n, new THREE.Float32BufferAttribute([], k)); g.setIndex([]); return g; };

  // ── the garden, and its redraw when the day changes: new soil, stems and leaves geometry, the old disposed ──
  const wood = new THREE.MeshLambertMaterial({map: art.surfaces.bark, vertexColors: true});
  const mesh = (name, geometry, material) => { const m = new THREE.Mesh(geometry, material); m.name = name; return m; };
  const object = new THREE.Group(); object.name = 'garden';
  const parts = {soil: mesh('soil', empty(), new THREE.MeshLambertMaterial({map: art.surfaces.earth, vertexColors: true})), stems: mesh('stems', empty(), wood),
    leaves: mesh('leaves', new THREE.BufferGeometry(), cardMaterial(THREE, art.cards, SPACE_ART))};
  object.add(mesh('beds', merged(boards), wood), parts.soil, parts.stems, parts.leaves);
  let drawn = null;
  const setDay = d => {
    if (d === drawn) return false;
    const state = gardenState(space, dressing, d);
    if (!state) return false;
    const next = {soil: soilOf(state), ...crops(state)};
    for (const name of ['soil', 'stems', 'leaves']) { const old = parts[name].geometry; parts[name].geometry = next[name]; old.dispose(); }
    drawn = d;
    return true;
  };
  if (!setDay(day)) setDay(GARDEN_DAY);
  return {object, setDay};
}
