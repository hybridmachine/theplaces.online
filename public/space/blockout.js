import {terrainHeight} from '../../shared/space.js';
import {toThree} from './geometry.js';

// The flat-coloured stand-in for the part of the yard not painted yet: the hills. The builder makes its
// own materials; dispose a part by disposing the geometry and material of every mesh in it.
export {toThree};

const COLOURS = {hills: '#7f958f'};
const DEG = Math.PI / 180;
const materials = (THREE, ...names) => Object.fromEntries(names.map(k => [k, new THREE.MeshLambertMaterial({color: COLOURS[k]})]));
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
    mesh(THREE, material, name) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material); if (name) mesh.name = name;
      return mesh;
    }
  };
}

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
