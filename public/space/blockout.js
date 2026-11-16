import {terrainHeight} from '../../shared/space.js';
import {toThree} from './geometry.js';

// The flat-coloured stand-ins for the parts of the yard not painted yet: oak, woods and hills. Each builder makes its
// own materials; dispose a part by disposing the geometry and material of every mesh in it.
export {toThree};

const COLOURS = {bark: '#4a3f33', leaf: '#4f6340', hills: '#7f958f', woods: '#4b5b43'};
const DEG = Math.PI / 180, MIN_GROUND = .3;
const materials = (THREE, ...names) => Object.fromEntries(names.map(k => [k, new THREE.MeshLambertMaterial({color: COLOURS[k]})]));
// A unit icosahedron as a flat list of triangle corners, for blobs.
const icosahedron = THREE => { const g = new THREE.IcosahedronGeometry(1, 0), a = Array.from(g.attributes.position.array); g.dispose(); return a; };
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

export function blockoutOak(THREE, space) {
  const m = materials(THREE, 'bark', 'leaf'), ico = icosahedron(THREE);
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

// Unit normal of wall edge i pointing away from the enclosed yard.
const wallOutward = (w, i, d) => {
  const area = w.reduce((s, p, k) => s + p[0] * w[(k + 1) % w.length][1] - w[(k + 1) % w.length][0] * p[1], 0);
  return area > 0 ? [d[1], -d[0]] : [-d[1], d[0]];
};

// Distant ridges all round, tallest to the east.
export function blockoutHills(THREE, space) {
  const m = materials(THREE, 'hills');
  const [ax, ay] = space.arrival.position, eye = terrainHeight(space, ax, ay) + space.eyeHeight;
  const ridges = solid(), step = 3 * DEG, below = -2;
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
  const group = new THREE.Group(); group.name = 'hills';
  group.add(ridges.mesh(THREE, m.hills, 'ridges'));
  return group;
}

// Woodland just beyond the wall wherever the ground is land.
export function blockoutWoods(THREE, space) {
  const m = materials(THREE, 'woods'), ico = icosahedron(THREE), woods = solid(), w = space.wall;
  w.forEach((a, i) => {
    const b = w[(i + 1) % w.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const out = wallOutward(w, i, d);
    for (let t = -10, k = 0; t <= len + 10; t += 5, k++) { // past the ends too, so the corners are wooded
      const seed = i * 101 + k, r = 4 + 1.5 * jitter(seed), off = 8 + r + (17 - 2 * r) * jitter(seed + 1);
      const x = a[0] + d[0] * t + out[0] * off, y = a[1] + d[1] * t + out[1] * off;
      const g = Math.min(...[[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dy]) => terrainHeight(space, x + dx, y + dy)));
      if (g < MIN_GROUND) continue;
      const tall = 5 + 2.5 * jitter(seed + 2);
      woods.blob(ico, [x, y, g + tall * .55], [r, r, tall]);
    }
  });
  const group = new THREE.Group(); group.name = 'woods';
  group.add(woods.mesh(THREE, m.woods, 'blobs'));
  return group;
}
