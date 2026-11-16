import {terrainHeight} from '../../shared/space.js';

// World axes are x east, y north, z up; three's are X east, Y up, Z south. A proper rotation, so winding survives it.
export const toThree = ([x, y, z]) => [x, z, -y];

const COLOURS = {moss: '#6f7f52', water: '#9fb3b4', stone: '#b9a67c', slate: '#5f6468', dark: '#2e2a25',
  bark: '#4a3f33', leaf: '#4f6340', wall: '#9c927c', hills: '#7f958f', woods: '#4b5b43'};
const DEG = Math.PI / 180, LAKE_OFFSET = -.004, WALL = {height: 1.1, half: .25, minGround: .3};
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
// Deterministic jitter in [0, 1) so the blockout is the same on every load.
const jitter = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Collects flat-shaded triangles in world coordinates and turns them into one three mesh.
function solid() {
  const out = [];
  const tri = (a, b, c) => { for (const p of [a, b, c]) out.push(...toThree(p)); };
  return {
    tri,
    // A convex planar polygon, wound so its normal agrees with `outward`.
    face(pts, outward) {
      const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
      const p = dot(n, outward) < 0 ? [...pts].reverse() : pts;
      for (let i = 1; i < p.length - 1; i++) tri(p[0], p[i], p[i + 1]);
    },
    // A unit icosahedron (world coordinates) scaled by `radii` about `centre`.
    blob(ico, centre, radii) {
      for (let i = 0; i < ico.length; i += 9) {
        const v = k => add(centre, [ico[i + k] * radii[0], ico[i + k + 1] * radii[1], ico[i + k + 2] * radii[2]]);
        tri(v(0), v(3), v(6));
      }
    },
    mesh(THREE, material, name) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material); if (name) mesh.name = name;
      return mesh;
    }
  };
}

// A vertical prism over a convex footprint (any winding) from `low` to `high`, with or without a top.
function prism(s, footprint, low, high, top = true) {
  const mid = footprint.reduce((m, p) => [m[0] + p[0] / footprint.length, m[1] + p[1] / footprint.length], [0, 0]);
  const lo = Array.isArray(low) ? low : footprint.map(() => low), hi = Array.isArray(high) ? high : footprint.map(() => high);
  footprint.forEach((a, i) => {
    const j = (i + 1) % footprint.length, b = footprint[j], m = [(a[0] + b[0]) / 2 - mid[0], (a[1] + b[1]) / 2 - mid[1], 0];
    s.face([[...a, lo[i]], [...b, lo[j]], [...b, hi[j]], [...a, hi[i]]], m);
  });
  if (top) s.face(footprint.map((p, i) => [...p, hi[i]]), [0, 0, 1]);
}

// A 1 m grid over the yard inside a 10 m skirt out to the hill ring, one watertight mesh with shared border vertices.
function terrain(THREE, space, material) {
  const [x0, x1, y0, y1] = [-60, 140, -60, 70], nx = x1 - x0 + 1, ny = y1 - y0 + 1, E = 1500, S = 10;
  const position = [], index = [], coarse = new Map();
  const vertex = (x, y) => { position.push(...toThree([x, y, terrainHeight(space, x, y)])); return position.length / 3 - 1; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vertex(x0 + i, y0 + j);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx; // counter-clockwise seen from above
    index.push(a, b, c, a, c, d);
  }
  const inFine = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const at = (x, y) => inFine(x, y) ? (y - y0) * nx + x - x0 : coarse.get(x * 1e4 + y) ?? coarse.set(x * 1e4 + y, vertex(x, y)).get(x * 1e4 + y);
  // Fine-grid points strictly between two skirt corners lying on the yard's border (empty if the edge is not on it).
  const between = ([ax, ay], [bx, by]) => {
    const onBorder = ax === bx ? (ax === x0 || ax === x1) && Math.min(ay, by) >= y0 && Math.max(ay, by) <= y1
      : (ay === y0 || ay === y1) && Math.min(ax, bx) >= x0 && Math.max(ax, bx) <= x1;
    return onBorder ? Array.from({length: S - 1}, (_, k) => [ax + Math.sign(bx - ax) * (k + 1), ay + Math.sign(by - ay) * (k + 1)]) : [];
  };
  for (let y = -E; y < E; y += S) for (let x = -E; x < E; x += S) {
    if (x >= x0 && x + S <= x1 && y >= y0 && y + S <= y1) continue; // the fine grid covers it
    const corners = [[x, y], [x + S, y], [x + S, y + S], [x, y + S]], loop = [], plain = [];
    corners.forEach((c, k) => {
      const next = corners[(k + 1) % 4], mid = between(c, next);
      loop.push(c, ...mid); plain.push(!mid.length);
    });
    // Fan from a corner whose two edges carry no border points, so no fan triangle is degenerate.
    const apex = corners.findIndex((_, k) => plain[k] && plain[(k + 3) % 4]), start = loop.indexOf(corners[apex]);
    const ring = [...loop.slice(start), ...loop.slice(0, start)].map(([px, py]) => at(px, py));
    for (let k = 1; k < ring.length - 1; k++) index.push(ring[0], ring[k], ring[k + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'terrain';
  return mesh;
}

// Flat water over the whole hill ring, a few millimetres below z = 0 so the shoreline, where the terrain crosses z = 0, does not flicker.
function lake(THREE, material) {
  const s = solid();
  s.face([[-1500, -1500, LAKE_OFFSET], [1500, -1500, LAKE_OFFSET], [1500, 1500, LAKE_OFFSET], [-1500, 1500, LAKE_OFFSET]], [0, 0, 1]);
  return s.mesh(THREE, material, 'lake');
}

function cabin(THREE, space, m) {
  const {center: c, size: [long, short], yaw, wallHeight, ridgeHeight} = space.cabin;
  const u = [Math.sin(yaw), Math.cos(yaw)], v = [Math.cos(yaw), -Math.sin(yaw)], L = long / 2, W = short / 2;
  const floor = terrainHeight(space, ...c);
  const at = (a, b, z = 0) => [c[0] + a * u[0] + b * v[0], c[1] + a * u[1] + b * v[1], z];
  // Walls reach below the lowest ground along the footprint, so the slope shows no gap under them.
  let base = floor;
  for (let k = 0; k <= 8; k++) for (const [a, b] of [[-L + k * L / 4, -W], [-L + k * L / 4, W], [-L, -W + k * W / 4], [L, -W + k * W / 4]])
    base = Math.min(base, terrainHeight(space, ...at(a, b)));
  base -= .2;
  const eave = floor + wallHeight, ridge = floor + ridgeHeight;
  const walls = solid(), roof = solid(), openings = solid();
  prism(walls, [at(-L, -W), at(L, -W), at(L, W), at(-L, W)].map(p => p.slice(0, 2)), base, eave, false);
  for (const e of [-1, 1]) walls.face([at(e * L, -W, eave), at(e * L, W, eave), at(e * L, 0, ridge)], [e * u[0], e * u[1], 0]);
  for (const side of [-1, 1]) roof.face([at(-L, side * W, eave), at(L, side * W, eave), at(L, 0, ridge), at(-L, 0, ridge)], [side * v[0], side * v[1], 1]);
  // Chimney: a stone stack rising through the roof near one gable end.
  const ch = [[L - 1.1, -.4], [L - .3, -.4], [L - .3, .4], [L - 1.1, .4]].map(([a, b]) => at(a, b).slice(0, 2));
  prism(walls, ch, eave, ridge + 1);
  // Door and windows: dark cards just proud of the long face that looks toward the arrival position.
  const front = dot([v[0], v[1], 0], [space.arrival.position[0] - c[0], space.arrival.position[1] - c[1], 0]) > 0 ? 1 : -1;
  const card = (sign, a, halfWidth, z0, z1) => {
    const b = sign * (W + .02), out = [sign * v[0], sign * v[1], 0];
    openings.face([at(a - halfWidth, b, z0), at(a + halfWidth, b, z0), at(a + halfWidth, b, z1), at(a - halfWidth, b, z1)], out);
  };
  card(front, 0, .5, floor, floor + 2);
  for (const a of [-2.6, 2.6]) card(front, a, .5, floor + .9, floor + 1.9);
  card(-front, 0, .3, floor + 1.2, floor + 1.8);
  const group = new THREE.Group(); group.name = 'cabin';
  group.add(walls.mesh(THREE, m.stone), roof.mesh(THREE, m.slate), openings.mesh(THREE, m.dark));
  return group;
}

function oak(THREE, space, m, ico) {
  const {position: [x, y], radius, height} = space.oak, ground = terrainHeight(space, x, y);
  const trunk = solid(), canopy = solid(), n = 8;
  const ring = (r) => Array.from({length: n}, (_, i) => [x + r * Math.sin(i * 2 * Math.PI / n), y + r * Math.cos(i * 2 * Math.PI / n)]);
  // A tapered trunk from below the ground up into the canopy.
  const lo = ring(radius), hi = ring(radius * .45);
  lo.forEach((a, i) => {
    const j = (i + 1) % n, mid = [(a[0] + lo[j][0]) / 2 - x, (a[1] + lo[j][1]) / 2 - y, 0];
    trunk.face([[...a, ground - .3], [...lo[j], ground - .3], [...hi[j], ground + 8], [...hi[i], ground + 8]], mid);
  });
  // A rough canopy: one large mass from 5 m up to the tree's height, with smaller lumps around it.
  const top = ground + height, mid = ground + 5 + (height - 5) / 2, r = (height - 5) / 2;
  canopy.blob(ico, [x, y, mid], [r * 1.05, r, r]);
  for (let k = 0; k < 5; k++) {
    const a = k * 72 * DEG + jitter(k) * .6, d = r * .75, h = mid - 1 + jitter(k + 9) * 2.5, s = r * (.5 + .15 * jitter(k + 3));
    canopy.blob(ico, [x + d * Math.sin(a), y + d * Math.cos(a), Math.min(h, top - s)], [s, s, s * .85]);
  }
  const group = new THREE.Group(); group.name = 'oak';
  group.add(trunk.mesh(THREE, m.bark), canopy.mesh(THREE, m.leaf));
  return group;
}

// Wall pieces about 1 m long that follow the ground, skipped where it falls below the water's edge.
function wall(THREE, space, material) {
  const s = solid(), w = space.wall;
  w.forEach((a, i) => {
    const b = w[(i + 1) % w.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1] * WALL.half, d[0] * WALL.half];
    const steps = Math.ceil(len), at = t => [a[0] + d[0] * t, a[1] + d[1] * t];
    for (let k = 0; k < steps; k++) {
      // Each run reaches half a thickness past the corners so the corners close.
      const t0 = k === 0 ? -WALL.half : k * len / steps, t1 = k === steps - 1 ? len + WALL.half : (k + 1) * len / steps;
      const p0 = at(t0), p1 = at(t1), h0 = terrainHeight(space, ...p0), h1 = terrainHeight(space, ...p1);
      if (Math.min(h0, h1) < WALL.minGround) continue;
      const foot = [add(p0, n, -1), add(p1, n, -1), add(p1, n), add(p0, n)];
      prism(s, foot, Math.min(h0, h1) - .3, [h0, h1, h1, h0].map(h => h + WALL.height));
    }
  });
  return s.mesh(THREE, material, 'wall');
}

// Unit normal of wall edge i pointing away from the enclosed yard.
const wallOutward = (w, i, d) => {
  const area = w.reduce((s, p, k) => s + p[0] * w[(k + 1) % w.length][1] - w[(k + 1) % w.length][0] * p[1], 0);
  return area > 0 ? [d[1], -d[0]] : [-d[1], d[0]];
};

// Distant ridges all round, tallest to the east, and woodland just beyond the wall wherever the ground is land.
function hills(THREE, space, m, ico) {
  const [ax, ay] = space.arrival.position, eye = terrainHeight(space, ax, ay) + space.eyeHeight;
  const ridges = solid(), woods = solid(), step = 3 * DEG, below = -2;
  const row = (theta) => {
    const near = 500 + 90 * jitter(Math.round(theta / step)), far = Math.min(900, near + 260);
    const crest = near + (far - near) * (.4 + .2 * jitter(theta * 7));
    const east = Math.max(0, Math.cos(theta - 90 * DEG)) ** 2;
    const rise = (1.2 + 3.6 * east + .5 * Math.sin(theta * 5) + .3 * Math.sin(theta * 13 + 1)) * DEG;
    const p = (r, z) => [ax + r * Math.sin(theta), ay + r * Math.cos(theta), z];
    // Bases sit just under the ground or water there; crests stand clear of the rising land behind the yard.
    const ground = r => Math.max(0, terrainHeight(space, ...p(r)));
    return [p(near, ground(near) + below), p(crest, Math.max(eye + crest * Math.tan(rise), ground(crest) + 12)), p(far, ground(far) + below)];
  };
  for (let k = 0; k < 360 / 3; k++) {
    const t0 = k * step, t1 = (k + 1) % 120 * step, r0 = row(t0), r1 = row(t1), mid = (t0 + t1 + (k === 119 ? 2 * Math.PI : 0)) / 2;
    const radial = [Math.sin(mid), Math.cos(mid), 0];
    ridges.face([r0[0], r1[0], r1[1], r0[1]], [-radial[0], -radial[1], 0]);
    ridges.face([r0[1], r1[1], r1[2], r0[2]], radial);
  }
  const w = space.wall;
  w.forEach((a, i) => {
    const b = w[(i + 1) % w.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const out = wallOutward(w, i, d);
    for (let t = -10, k = 0; t <= len + 10; t += 5, k++) { // past the ends too, so the corners are wooded
      const seed = i * 101 + k, r = 4 + 1.5 * jitter(seed), off = 8 + r + (17 - 2 * r) * jitter(seed + 1);
      const x = a[0] + d[0] * t + out[0] * off, y = a[1] + d[1] * t + out[1] * off;
      const g = Math.min(...[[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dy]) => terrainHeight(space, x + dx, y + dy)));
      if (g < WALL.minGround) continue;
      const tall = 5 + 2.5 * jitter(seed + 2);
      woods.blob(ico, [x, y, g + tall * .55], [r, r, tall]);
    }
  });
  const group = new THREE.Group(); group.name = 'hills';
  group.add(ridges.mesh(THREE, m.hills), woods.mesh(THREE, m.woods));
  return group;
}

export function buildBlockout(THREE, space) {
  const materials = Object.fromEntries(Object.entries(COLOURS).map(([k, color]) => [k, new THREE.MeshLambertMaterial({color})]));
  const icoGeometry = new THREE.IcosahedronGeometry(1, 0), ico = Array.from(icoGeometry.attributes.position.array);
  icoGeometry.dispose();
  const group = new THREE.Group(); group.name = 'blockout';
  group.add(terrain(THREE, space, materials.moss), lake(THREE, materials.water), cabin(THREE, space, materials),
    oak(THREE, space, materials, ico), wall(THREE, space, materials.wall), hills(THREE, space, materials, ico));
  return {group, dispose() {
    group.traverse(o => o.geometry?.dispose());
    for (const m of Object.values(materials)) m.dispose();
  }};
}
