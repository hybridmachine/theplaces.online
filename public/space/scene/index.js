import {buildCabin} from './cabin.js';
import {buildCover} from './cover.js';
import {buildGround} from './ground.js';
import {buildHills} from './hills.js';
import {buildOak, buildWoods} from './trees.js';

// The painted yard as named parts: terrain, lake, wall, cabin, oak, woods, cover, hills. `art` is the loaded bundle
// (art-loader.js); the scene uses its textures but leaves them to the bundle's own dispose.
export function buildScene(THREE, {space, dressing, art}) {
  const ground = buildGround(THREE, {space, dressing, art}), cover = buildCover(THREE, {space, dressing, art}).object;
  const parts = {terrain: ground.terrain, lake: ground.lake, wall: ground.wall, cabin: buildCabin(THREE, {space, dressing, art}).object, oak: buildOak(THREE, {space, dressing, art}).object,
    woods: buildWoods(THREE, {space, dressing, art}).object, cover, hills: buildHills(THREE, {space, dressing, art}).object};
  const group = new THREE.Group(); group.name = 'yard';
  group.add(...Object.values(parts));
  return {group, parts,
    // Display-space sky colours, 0–1, as the sky dome draws them this frame.
    setSky({zenith, horizon}) { ground.setSky({zenith, horizon}); },
    dispose() {
      const materials = new Set();
      group.traverse(o => {
        o.geometry?.dispose();
        if (o.isInstancedMesh) o.dispose(); // its per-instance buffers
        for (const m of [o.material ?? []].flat()) materials.add(m);
      });
      for (const m of materials) m.dispose();
    }};
}
