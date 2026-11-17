import {shelterOf} from '../../../shared/lakeside-life.js';

// Rain around the visitor: thin slanted streaks like the 2D painting's, falling in columns fixed in the yard modulo a square tile
// of side 2 x radius that is always centred on the walker, so a column stays put as they walk until it leaves the square and
// re-enters on the far side. They lean south with the wind. A streak is not drawn where the cabin's roof or the oak's crown would
// keep it off. three.js is handed in, so this runs in Node.

export const RAIN = {count: 2400, radius: 9, height: 7, speed: 9, length: .45, slant: .35};
const TINT = [223 / 255, 230 / 255, 224 / 255], SOUTH = [0, -1], SIDE = 2 * RAIN.radius;
const wrap = (v, side) => ((v % side) + side) % side;

// A stable pseudo-random number in [0, 1) from integers.
function hash(...ints) {
  let h = 0x9e3779b9;
  for (const n of ints) { h = Math.imul(h ^ (n | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}

// Where streak `index` has its top `seconds` into the fall, for a visitor at `eye` [x, y, z] and a wind of 0..1 blowing south.
// The presenter below works the same out with its hashes kept and no arrays; a test holds the two to each other.
export function rainDrop(index, seconds, eye, wind) {
  const column = (axis, salt) => eye[axis] - RAIN.radius + wrap(hash(index, salt) * SIDE - eye[axis] + RAIN.radius, SIDE);
  const fallen = wrap(hash(index, 3) * RAIN.height + RAIN.speed * seconds, RAIN.height);
  const lean = RAIN.slant * Math.min(Math.max(wind, 0), 1) * fallen;
  return [column(0, 1) + SOUTH[0] * lean, column(1, 2) + SOUTH[1] * lean, eye[2] + RAIN.height * .4 - fallen];
}

export function createRain(THREE, ctx) {
  const {scene, layout} = ctx, positions = new Float32Array(RAIN.count * 6), share = shelterOf(layout);
  // Each streak's column (x, y), its start in the fall and its chance of getting through shelter never change: hashed once, kept
  // at full precision so the streaks are exactly rainDrop's.
  const seeds = new Float64Array(RAIN.count * 4);
  for (let i = 0; i < RAIN.count; i++) { seeds[i * 4] = hash(i, 1); seeds[i * 4 + 1] = hash(i, 2); seeds[i * 4 + 2] = hash(i, 3); seeds[i * 4 + 3] = hash(i, 7); }
  const geometry = new THREE.BufferGeometry(), attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('position', attribute); geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({color: new THREE.Color(...TINT), transparent: true, opacity: 0, depthWrite: false});
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'rain'; lines.renderOrder = 10; lines.frustumCulled = false; lines.visible = false; scene.add(lines);
  return {
    update(frame) {
      const {rain = 0, wind = 0} = frame.weather ?? {}, at = frame.camera?.position;
      if (!(rain > .05) || !at) { lines.visible = false; geometry.setDrawRange(0, 0); return false; }
      const ex = at.x, ey = -at.z, ez = at.y, R = RAIN.radius, H = RAIN.height, top = ez + H * .4, fall = RAIN.speed * (frame.motionSeconds ?? 0);
      const count = Math.round(RAIN.count * Math.min(rain, 1)), slant = RAIN.slant * Math.min(Math.max(wind, 0), 1), tail = slant * RAIN.length;
      let drawn = 0;
      for (let i = 0; i < count; i++) {
        const j = i * 4, fallen = wrap(seeds[j + 2] * H + fall, H), lean = slant * fallen;
        const x = ex - R + wrap(seeds[j] * SIDE - ex + R, SIDE) + SOUTH[0] * lean, y = ey - R + wrap(seeds[j + 1] * SIDE - ey + R, SIDE) + SOUTH[1] * lean, z = top - fallen;
        if (seeds[j + 3] >= share(x, y, z)) continue;
        // in three's axes: (x, z, -y)
        const k = drawn * 6;
        positions[k] = x; positions[k + 1] = z; positions[k + 2] = -y;
        positions[k + 3] = x + SOUTH[0] * tail; positions[k + 4] = z - RAIN.length; positions[k + 5] = -y - SOUTH[1] * tail;
        drawn++;
      }
      attribute.needsUpdate = true; geometry.setDrawRange(0, drawn * 2);
      material.opacity = .10 + rain * .13; lines.visible = true;
      return true;
    },
    dispose() { scene.remove(lines); geometry.dispose(); material.dispose(); },
  };
}
