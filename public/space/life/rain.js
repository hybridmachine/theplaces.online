import {sheltered} from '../../../shared/lakeside-life.js';

// Rain around the visitor: thin slanted streaks like the 2D painting's, falling in columns fixed in the yard (hashed from a 3 m
// cell around the walker, so they do not travel with them), leaning south with the wind. A streak is not drawn where the cabin's
// roof or the oak's crown would keep it off. three.js is handed in, so this runs in Node.

export const RAIN = {count: 900, radius: 9, height: 7, speed: 9, length: .45, slant: .35};
const CELL = 3, TINT = [223 / 255, 230 / 255, 224 / 255], SOUTH = [0, -1];
// A column wanders no further from its cell's centre than keeps it, and its lean, within `radius` of any eye in the cell.
const REACH = RAIN.radius - CELL * Math.SQRT1_2 - RAIN.slant * RAIN.height;
const toThree = ([x, y, z]) => [x, z, -y];

// A stable pseudo-random number in [0, 1) from integers.
function hash(...ints) {
  let h = 0x9e3779b9;
  for (const n of ints) { h = Math.imul(h ^ (n | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}

// Where streak `index` has its top `seconds` into the fall, for a visitor at `eye` [x, y, z] and a wind of 0..1 blowing south.
export function rainDrop(index, seconds, eye, wind) {
  const cx = Math.floor(eye[0] / CELL), cy = Math.floor(eye[1] / CELL);
  const angle = hash(index, cx, cy, 1) * 2 * Math.PI, reach = REACH * Math.sqrt(hash(index, cx, cy, 2)), phase = hash(index, cx, cy, 3);
  const fallen = (((phase * RAIN.height + RAIN.speed * seconds) % RAIN.height) + RAIN.height) % RAIN.height;
  const lean = RAIN.slant * Math.min(Math.max(wind, 0), 1) * fallen;
  return [(cx + .5) * CELL + Math.cos(angle) * reach + SOUTH[0] * lean, (cy + .5) * CELL + Math.sin(angle) * reach + SOUTH[1] * lean,
    eye[2] + RAIN.height * .4 - fallen];
}

export function createRain(THREE, ctx) {
  const {scene, layout} = ctx, positions = new Float32Array(RAIN.count * 6);
  const geometry = new THREE.BufferGeometry(), attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('position', attribute); geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({color: new THREE.Color(...TINT), transparent: true, opacity: 0, depthWrite: false});
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'rain'; lines.renderOrder = 10; lines.frustumCulled = false; lines.visible = false; scene.add(lines);
  const eye = [0, 0, 0];
  return {
    update(frame) {
      const {rain = 0, wind = 0} = frame.weather ?? {}, at = frame.camera?.position;
      if (!(rain > .05) || !at) { lines.visible = false; geometry.setDrawRange(0, 0); return false; }
      eye[0] = at.x; eye[1] = -at.z; eye[2] = at.y;
      const count = Math.round(RAIN.count * Math.min(rain, 1)), dir = SOUTH, seconds = frame.motionSeconds ?? 0;
      let drawn = 0;
      for (let i = 0; i < count; i++) {
        const top = rainDrop(i, seconds, eye, wind);
        if (hash(i, 7) >= sheltered(layout, top)) continue;
        const [px, py, pz] = toThree(top), k = drawn * 6, lean = RAIN.slant * Math.min(Math.max(wind, 0), 1) * RAIN.length;
        positions[k] = px; positions[k + 1] = py; positions[k + 2] = pz;
        positions[k + 3] = px + dir[0] * lean; positions[k + 4] = py - RAIN.length; positions[k + 5] = pz - dir[1] * lean;
        drawn++;
      }
      attribute.needsUpdate = true; geometry.setDrawRange(0, drawn * 2);
      material.opacity = .10 + rain * .13; lines.visible = true;
      return true;
    },
    dispose() { scene.remove(lines); geometry.dispose(); material.dispose(); },
  };
}
