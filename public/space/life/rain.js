import {sheltered} from '../../../shared/lakeside-life.js';

// Rain around the visitor: thin slanted streaks like the 2D painting's, falling in columns fixed in the yard modulo a square tile
// of side 2 x radius that is always centred on the walker, so a column stays put as they walk until it leaves the square and
// re-enters on the far side. They lean south with the wind. A streak is not drawn where the cabin's roof or the oak's crown would
// keep it off. three.js is handed in, so this runs in Node.

export const RAIN = {count: 2400, radius: 9, height: 7, speed: 9, length: .45, slant: .35};
const TINT = [223 / 255, 230 / 255, 224 / 255], SOUTH = [0, -1], SIDE = 2 * RAIN.radius;
const toThree = ([x, y, z]) => [x, z, -y];
const wrap = (v, side) => ((v % side) + side) % side;

// A stable pseudo-random number in [0, 1) from integers.
function hash(...ints) {
  let h = 0x9e3779b9;
  for (const n of ints) { h = Math.imul(h ^ (n | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}

// Where streak `index` has its top `seconds` into the fall, for a visitor at `eye` [x, y, z] and a wind of 0..1 blowing south.
export function rainDrop(index, seconds, eye, wind) {
  const column = (axis, salt) => eye[axis] - RAIN.radius + wrap(hash(index, salt) * SIDE - eye[axis] + RAIN.radius, SIDE);
  const fallen = wrap(hash(index, 3) * RAIN.height + RAIN.speed * seconds, RAIN.height);
  const lean = RAIN.slant * Math.min(Math.max(wind, 0), 1) * fallen;
  return [column(0, 1) + SOUTH[0] * lean, column(1, 2) + SOUTH[1] * lean, eye[2] + RAIN.height * .4 - fallen];
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
