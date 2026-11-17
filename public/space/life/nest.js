import {hash} from '../../../shared/world.js';
import {mergeGeometries, tube} from '../geometry.js';
import {DRAWN} from './bird.js';

// The nest in the oak's fork: as in the 2D painting (Painting.drawNest), three twig strokes for each material the bird has
// brought, every third one pale, each placed by hashes of its index. Here a stroke is a thin rod that sags across a small
// bowl around the nest's point, so the bowl fills in as materials arrive. Rebuilt only when the count changes; nothing when
// the world has no nest. three.js is handed in, so this runs in Node.

const COLOURS = ['#b2a079', '#5f5940'], SIDES = 3, SAMPLES = 5;

// The yard points of stroke i around a bowl centred at `at` of rim radius r: from one side of the rim, down through the bowl,
// up to the rim further round, like the 2D quadratic that dips between its ends.
function stroke(i, [x, y, z], r) {
  const a = hash(i + 1), b = hash(i + 99), c = hash(i), from = a * Math.PI * 2, to = from + 1.4 + b * 1.3, mid = (from + to) / 2;
  const rim = z + r * .1, ends = [[from, r * (.85 + .25 * b), rim + r * (b - .5) * .25], [to, r * (.9 + .2 * a), rim + r * (a - .5) * .2]];
  const [p0, p2] = ends.map(([t, k, h]) => [x + Math.sin(t) * k, y + Math.cos(t) * k, h]);
  const p1 = [x + Math.sin(mid) * r * (.35 + .25 * c), y + Math.cos(mid) * r * (.35 + .25 * c), rim - r * (.7 + .35 * c)];
  return Array.from({length: SAMPLES}, (_, k) => {
    const u = k / (SAMPLES - 1), v = 1 - u;
    return [0, 1, 2].map(d => v * v * p0[d] + 2 * v * u * p1[d] + u * u * p2[d]);
  });
}

export function createNest(THREE, ctx) {
  const {scene, layout} = ctx, at = layout.bird.locations.nest.point, size = layout.bird.length * DRAWN;
  const r = size * .55, thick = size * .022, colours = COLOURS.map(c => new THREE.Color(c));
  const material = new THREE.MeshLambertMaterial({vertexColors: true});
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = 'nest'; mesh.visible = false; mesh.userData.strokes = 0; scene.add(mesh);
  let built = null;
  const build = count => {
    const parts = Array.from({length: count}, (_, i) => {
      const g = tube(THREE, stroke(i, at, r).map(p => [...p, thick]), {sides: SIDES}), c = colours[i % 3 === 0 ? 0 : 1], colour = g.attributes.color;
      for (let k = 0; k < colour.count; k++) colour.setXYZ(k, c.r, c.g, c.b);
      return g;
    });
    const merged = parts.length ? mergeGeometries(THREE, parts) : new THREE.BufferGeometry();
    for (const p of parts) p.dispose();
    mesh.geometry.dispose(); mesh.geometry = merged; mesh.userData.strokes = count;
  };
  return {
    update(frame) {
      const nest = frame.snapshot?.world?.nest, materials = Number.isFinite(nest?.materials) ? Math.max(0, Math.min(12, Math.floor(nest.materials))) : null;
      if (materials === null) { mesh.visible = false; return false; }
      if (materials !== built) { build(materials * 3); built = materials; }
      mesh.visible = materials > 0;
      return mesh.visible;
    },
    dispose() { scene.remove(mesh); mesh.geometry.dispose(); material.dispose(); },
  };
}
