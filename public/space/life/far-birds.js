import {hash, mod} from '../../../shared/world.js';

// Three distant birds crossing the far sky over the lake now and then, with the timing of the 2D painting's
// (Painting.drawDistantBirds): in each 135-second cycle they cross for the first 23 seconds, by day only, each a small dark
// two-stroke shape with flicking wings. They are the visitor's own, like the rain: placed 900 m out along their directions
// from wherever the visitor stands, turned to face them, unfogged. A study and reduced motion show none. three.js is handed
// in, so this runs in Node.

const COUNT = 3, DISTANCE = 900, UNIT = 1.4, WIDTH = .85, SEGMENTS = 4;
const INK = [0x42 / 255, 0x4b / 255, 0x48 / 255], ALPHA = .6, FALLBACK_SKY = [.83, .83, .75];

// The birds in the sky this second, [{azimuth, elevation, wing}] (wing in [-1, 1]), or [] — the 2D painting's positions mapped
// onto the layout's ranges: across the painting's x (.45–1.05 at most) is the azimuth range, and down its y (the cycle's
// hashed height, the flock's stagger and a slow bob) is the elevation range from its top.
export function farBirdsNow(seconds, light, layout) {
  const {azimuth: [a0, a1], elevation: [e0, e1], period, crossing} = layout.farBirds;
  const cycle = Math.floor(seconds / period), t = mod(seconds, period);
  if (light < .4 || t > crossing) return [];
  return Array.from({length: COUNT}, (_, i) => {
    const x = .52 + t / crossing * .53 - i * .035, y = hash(cycle + 20) + i * .09 + Math.sin(t * .3 + i) * .08;
    return {azimuth: a0 + (a1 - a0) * (x - .45) / .6, elevation: e1 - (e1 - e0) * (y + .08) / 1.34, wing: Math.sin(t * 12 + i)};
  });
}

// The two strokes in the billboard's plane (x right, y up, in UNITs): from each wing tip, raised by `wing`, curving down to
// the body, as a ribbon WIDTH thick. Written into `array` as triangles facing +z.
function strokes(array, wing) {
  const at = (side, u) => { const v = 1 - u; return [side * (v * v * 4 + 2 * v * u * 2), v * v * wing * 3.5 - u * u]; };
  let k = 0;
  for (const side of [-1, 1]) for (let s = 0; s < SEGMENTS; s++) {
    const [a, b] = [at(side, s / SEGMENTS), at(side, (s + 1) / SEGMENTS)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l * WIDTH / 2, ny = dx / l * WIDTH / 2, q = [[a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]];
    for (const tri of [[0, 2, 1], [1, 2, 3]]) {
      const [p, r, w] = tri.map(i => q[i]), turn = (r[0] - p[0]) * (w[1] - p[1]) - (r[1] - p[1]) * (w[0] - p[0]);
      for (const [x, y] of turn >= 0 ? [p, r, w] : [p, w, r]) { array[k++] = x * UNIT; array[k++] = y * UNIT; array[k++] = 0; }
    }
  }
}

export function createFarBirds(THREE, ctx) {
  const {scene, yard, layout} = ctx;
  const group = new THREE.Group(); group.name = 'far-birds'; group.visible = false; scene.add(group);
  const material = new THREE.MeshBasicMaterial({fog: false});
  const birds = Array.from({length: COUNT}, () => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * SEGMENTS * 2 * 9), 3));
    const mesh = new THREE.Mesh(g, material); mesh.frustumCulled = false; group.add(mesh);
    return mesh;
  });
  const direction = new THREE.Vector3();
  return {
    update(frame) {
      const now = frame.study || !frame.motion ? [] : farBirdsNow(frame.motionSeconds ?? 0, frame.calendar?.light ?? 0, layout);
      group.visible = now.length > 0;
      if (!group.visible) return false;
      // The 2D strokes are the ink at .6 over the sky; here, opaque, the same mix of the two.
      const sky = yard?.sky?.horizon ?? FALLBACK_SKY;
      const mix = k => INK[k] * ALPHA + sky[k] * (1 - ALPHA);
      material.color.setRGB(mix(0), mix(1), mix(2), THREE.SRGBColorSpace);
      birds.forEach((mesh, i) => {
        const {azimuth, elevation, wing} = now[i], c = Math.cos(elevation);
        direction.set(Math.sin(azimuth) * c, Math.sin(elevation), -Math.cos(azimuth) * c); // in three's axes
        mesh.position.copy(frame.camera.position).addScaledVector(direction, DISTANCE);
        mesh.quaternion.copy(frame.camera.quaternion);
        strokes(mesh.geometry.attributes.position.array, wing); mesh.geometry.attributes.position.needsUpdate = true;
      });
      return true;
    },
    dispose() {
      scene.remove(group); material.dispose();
      for (const mesh of birds) mesh.geometry.dispose();
    },
  };
}
