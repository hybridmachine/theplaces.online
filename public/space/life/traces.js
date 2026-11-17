import {terrainHeight} from '../../../shared/space.js';
import {dripPose, sampleSurface, surfaceFixture} from '../../../shared/surface-weather.js';
import {smooth} from '../../../shared/world.js';

// What the rain leaves in the yard, read from the shared surface reservoirs: the path and shore stones darken (the terrain
// material's own uniform, set through yard.setWet), a shallow puddle fills on the path in the sky's colour, and under the oak
// a drop now and then falls from a low clump to the ground. A study shows its fixture; a stale or missing surface shows nothing.
// three.js is handed in, so this runs in Node.

const SIDES = 14, LIFT = .015, DROP = .16, TINT = [214 / 255, 224 / 255, 226 / 255];
const FALLBACK_SKY = {zenith: [.6, .7, .76], horizon: [.83, .83, .75]};
const toThree = ([x, y, z]) => [x, z, -y];
// A stable pseudo-random number in [0, 1) from integers.
function hash(...ints) {
  let h = 0x9e3779b9;
  for (const n of ints) { h = Math.imul(h ^ (n | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}

// The wetness the yard shows this frame, as the 2D painting does: a study's fixture, else the shared state's; null if it cannot be read.
export function surfaceNow(frame) {
  return frame.fixture?.surface ?? (frame.study ? surfaceFixture(frame.study) : sampleSurface(frame.snapshot?.world?.environment, frame.epoch, frame.now));
}

// A flat irregular patch of 14 sides that follows the ground; a second ring just outside is transparent, so the edge is soft.
function puddleGeometry(THREE, space, {center, radius, turn}) {
  const position = [], color = [], index = [], cos = Math.cos(turn), sin = Math.sin(turn);
  const at = (x, y, alpha) => { position.push(...toThree([x, y, terrainHeight(space, x, y) + LIFT])); color.push(1, 1, 1, alpha); };
  at(center[0], center[1], 1);
  for (const [ring, alpha, grow] of [[0, 1, .55], [1, 0, 1.2]]) for (let i = 0; i < SIDES; i++) {
    const a = (i + (hash(i, 5) - .5) * .5) / SIDES * Math.PI * 2, r = (.8 + .4 * hash(i, 6)) * grow;
    const u = Math.cos(a) * radius[0] * r * (ring ? 1 + (hash(i, 7) - .5) * .1 : 1), v = Math.sin(a) * radius[1] * r;
    at(center[0] + u * cos - v * sin, center[1] + u * sin + v * cos, alpha);
  }
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES, a = 1 + i, b = 1 + j, c = 1 + SIDES + i, d = 1 + SIDES + j;
    index.push(0, a, b, a, c, d, a, d, b); // counter-clockwise seen from above
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
  g.setIndex(index); g.computeVertexNormals();
  return g;
}

export function createTraces(THREE, ctx) {
  const {scene, yard, space, layout} = ctx, {puddle, drips} = layout.weather;
  const group = new THREE.Group(); group.name = 'traces'; scene.add(group);
  const patch = new THREE.Mesh(puddleGeometry(THREE, space, puddle), new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: 0,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1}));
  patch.name = 'puddle'; patch.renderOrder = 10; patch.frustumCulled = false; patch.visible = false; group.add(patch);
  const streaks = drips.map(drip => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color: new THREE.Color(...TINT), transparent: true, opacity: 0, depthWrite: false}));
    line.name = drip.id; line.renderOrder = 10; line.frustumCulled = false; line.visible = false; group.add(line);
    return line;
  });
  const clear = () => { patch.visible = false; for (const line of streaks) line.visible = false; };
  return {
    update(frame) {
      const surface = surfaceNow(frame);
      if (!surface) { yard.setWet({path: 0, stone: 0}); clear(); return false; }
      yard.setWet({path: surface.pathWetness, stone: surface.stoneWetness});
      let active = surface.pathWetness > .01 || surface.stoneWetness > .01;
      const fill = smooth(.08, .3, surface.puddleStorage) * .85;
      patch.visible = fill > 0;
      if (patch.visible) {
        const {zenith, horizon} = yard.sky ?? FALLBACK_SKY;
        patch.material.color.setRGB(...[0, 1, 2].map(k => Math.min((horizon[k] + zenith[k]) / 2 * 1.02, 1)), THREE.SRGBColorSpace);
        patch.material.opacity = fill; active = true;
      }
      drips.forEach((drip, i) => {
        const line = streaks[i], pose = frame.motion ? dripPose(frame.motionSeconds ?? 0, {x: 0, y: 0, fall: 1, seed: drip.seed}, surface.canopyStorage, frame.weather?.rain ?? 0) : null;
        line.visible = !!pose;
        if (!pose) return;
        const z = drip.top[2] - drip.fall * pose.y, p = line.geometry.attributes.position, [x, y] = drip.top;
        p.array.set([...toThree([x, y, z]), ...toThree([x, y, Math.min(z + DROP, drip.top[2])])]); p.needsUpdate = true;
        line.material.opacity = pose.alpha; active = true;
      });
      return active;
    },
    dispose() {
      scene.remove(group); patch.geometry.dispose(); patch.material.dispose();
      for (const line of streaks) { line.geometry.dispose(); line.material.dispose(); }
    },
  };
}
