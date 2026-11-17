import {terrainHeight} from '../../../shared/space.js';
import {mergeGeometries, toThree, tube} from '../geometry.js';
import {lin, noise} from './noise.js';

const AXLE = -.62, FOOT = .29, RADIUS = .215;
// Local metres: x across the tray, y toward the handles, z up. Rounded corners and a narrower nose
// give the pressed tray its shape. The last two rings turn the sheet over into a worn rolled lip.
function trayGeometry(THREE) {
  const rings = [ // half width, front, back, height, paint
    [.17, -.26, .22, .425, [105, 71, 53]],
    [.20, -.30, .25, .445, [132, 76, 56]],
    [.32, -.52, .38, .68, [158, 87, 66]],
    [.35, -.57, .40, .735, [168, 96, 72]],
    [.361, -.58, .41, .747, [177, 143, 112]],
    [.36, -.58, .41, .73, [122, 103, 86]],
  ];
  const positions = [0, .425, 0], uv = [0, 0], colours = lin(rings[0][4]), indices = [], segments = 32;
  const rounded = n => Math.sign(n) * Math.abs(n) ** .57;
  for (const [width, front, back, height, paint] of rings) {
    const base = positions.length / 3, tint = lin(paint);
    for (let i = 0; i < segments; i++) {
      const a = 2 * Math.PI * i / segments;
      const length = rounded(Math.sin(a)), x = rounded(Math.cos(a)) * width * (.94 + .06 * length);
      const y = (front + back + length * (back - front)) / 2;
      const z = height + Math.max(0, -length) ** 2 * Math.max(0, height - .445) * .19;
      positions.push(...toThree([x, y, z]));
      uv.push(x / .54, y / .54);
      const shade = .87 + .2 * noise(x * 11, y * 12 + z, 81);
      colours.push(...tint.map(c => c * shade));
      const p = base + i, q = base + (i + 1) % segments;
      if (base === 1) indices.push(0, p, q);
      else indices.push(p - segments, p, q, p - segments, q, q - segments);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Cross section of a rubber tyre and its dished steel hub, spun about the axle.
function wheelGeometry(THREE) {
  const profile = [[0, -.083, 0xb3a18a], [.034, -.083, 0x978473], [.042, -.05, 0x756858],
    [.112, -.029, 0x918474], [.143, -.045, 0xb0a593], [.151, -.042, 0x473f38],
    [.185, -.048, 0x514b45], [.207, -.034, 0x423e39], [RADIUS, 0, 0x383630]];
  const section = [...profile, ...profile.slice(0, -1).reverse().map(([r, x, c]) => [r, -x, c])];
  const geometry = new THREE.LatheGeometry(section.map(([r, x]) => new THREE.Vector2(r, x)), 28);
  const colours = [];
  for (let i = 0; i < geometry.attributes.position.count; i++) new THREE.Color(section[i % section.length][2]).toArray(colours, 3 * i);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry.rotateZ(-Math.PI / 2);
}

export function buildWheelbarrow(THREE, {space, art}) {
  const object = new THREE.Group();
  object.name = 'wheelbarrow';
  const mesh = (name, geometry, material) => {
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    object.add(part);
    return part;
  };
  const paint = new THREE.MeshLambertMaterial({map: art.surfaces.hills, color: new THREE.Color().setScalar(2.9), vertexColors: true, side: THREE.DoubleSide});
  mesh('tray', trayGeometry(THREE), paint);
  const wheel = mesh('wheel', wheelGeometry(THREE), new THREE.MeshLambertMaterial({vertexColors: true}));
  wheel.position.set(...toThree([0, AXLE, RADIUS]));

  const wood = [], iron = [];
  for (const side of [-1, 1]) {
    const shaft = (width, y, z, radius) => [side * width, y, z, radius];
    wood.push(tube(THREE, [shaft(.079, AXLE - .045, .20, .026), shaft(.165, -.25, .39, .035),
      shaft(.19, .25, .415, .036), shaft(.26, .71, .59, .032), shaft(.28, .94, .64, .025),
      shaft(.28, .946, .64, .001)], {tile: 1.2}));
    // Each bent iron stand has a short skid on the ground and bolts up to the shaft at both ends.
    iron.push(tube(THREE, [shaft(.155, -.17, .39, .016), shaft(.23, FOOT - .05, .019, .019),
      shaft(.23, FOOT + .05, .019, .019), shaft(.193, .34, .45, .016)]));
  }
  for (const y of [-.24, .21]) iron.push(tube(THREE, [[-.19, y, .414, .022], [.19, y, .414, .022]]));
  mesh('stands', mergeGeometries(THREE, iron), new THREE.MeshLambertMaterial({color: 0x61574c}));
  mesh('shafts', mergeGeometries(THREE, wood), new THREE.MeshLambertMaterial({map: art.surfaces.bark, color: new THREE.Color(2.6, 2, 1.45)}));

  // Settle the wheel and both skids onto the grade. The parked footprint supplies the same heading to the walker.
  const {center: [cx, cy], yaw} = space.colliders.find(c => c.id === 'wheelbarrow');
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const ground = (x, y) => terrainHeight(space, cx + x * cos + y * sin, cy - x * sin + y * cos);
  const front = ground(0, AXLE), back = ground(0, FOOT);
  const pitch = Math.atan2(back - front, FOOT - AXLE), roll = Math.atan2(ground(.23, FOOT) - ground(-.23, FOOT), .46);
  object.rotation.set(pitch, -yaw, roll, 'YXZ');
  object.position.set(...toThree([cx, cy, front - AXLE * Math.sin(pitch)]));
  return object;
}
