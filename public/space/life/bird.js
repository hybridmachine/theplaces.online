import {birdProgress} from '../../../shared/bird.js';
import {birdPlace} from '../../../shared/lakeside-life.js';
import {mergeGeometries} from '../geometry.js';

// The small bird of the oak as a painted model: the 2D silhouette's body, breast, head, beak, eye and cocked tail in its
// colours, two wings hinged at the shoulder, legs while perched and a twig while it carries one. It sits where the shared
// bird is (its feet on the place), faces along its heading and pitches with its climb; the oak's wood and leaves hide it by
// depth like anything else (the sheltering bird really sits behind the trunk). As in the 2D painting a study omits it
// (unless a fixture says otherwise), reduced motion settles it and never beats its wings. three.js is handed in, so this runs in Node.

// Drawn at this many times the layout's 18 cm (36 cm), so that the bird on the roof ridge (22 m from the arrival) and on its oak
// perch can be found at all, with a head and a cocked tail rather than a dark speck.
export const DRAWN = 2;
// The model is built in the 2D silhouette's own units (one per centimetre, 18 from beak to tail) with x forward, y up from the
// feet and z to its right; three's Group then scales it, so its forward is +x until turned.
const UNITS = 18, BEAT = .85, LIFT = .25, TUCK = .7;
const COLOURS = {body: '#4a4b3b', breast: '#8f7d5c', head: '#393e32', wing: '#4b5041', eye: '#d9d5b7', legs: '#62573f', twig: '#a88e63'};
const toThree = ([x, y, z]) => [x, z, -y];

// Where the bird is this frame (birdPlace), or null: none in a study unless a fixture gives one, none while it is still building
// its nest after dark (as the 2D painting omits it), and settled where it rests under reduced motion.
export function birdNow(frame, layout) {
  const source = frame.fixture?.bird ?? (frame.study ? null : {state: frame.snapshot?.world?.bird, now: frame.now});
  if (!source?.state) return null;
  const progress = birdProgress(source.state, frame.snapshot?.world?.action ?? null, source.now, {reducedMotion: !frame.motion});
  if (!progress || (source.state.mode === 'construction' && frame.calendar?.elevation < -.12)) return null;
  return birdPlace(progress, layout);
}

// Flat triangles in one colour (linear), non-indexed so each face is lit flat.
function triangles(THREE, points, colour) {
  const g = new THREE.BufferGeometry(), c = new THREE.Color(colour);
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(points.flatMap(() => [c.r, c.g, c.b]), 3));
  g.computeVertexNormals();
  return g;
}
// A low-poly solid (three's own primitive, made non-indexed), coloured and moved into place; the primitive is let go here.
function solid(THREE, primitive, colour, place) {
  const g = primitive.index ? primitive.toNonIndexed() : primitive.clone(); primitive.dispose();
  place(g);
  const c = new THREE.Color(colour), n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({length: n}, () => [c.r, c.g, c.b]).flat(), 3));
  g.deleteAttribute('uv'); g.computeVertexNormals();
  return g;
}
const blob = (THREE, colour, [x, y, z], [rx, ry, rz], tilt = 0) => solid(THREE, new THREE.IcosahedronGeometry(1, 0), colour, g => { g.scale(rx, ry, rz); g.rotateZ(tilt); g.translate(x, y, z); });
// A thin open three-sided rod from a to b.
function rod(THREE, colour, a, b, radius) {
  const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  return solid(THREE, new THREE.CylinderGeometry(radius, radius, d.length(), 3, 1, true), colour, g => {
    g.translate(0, d.length() / 2, 0); g.applyQuaternion(q); g.translate(...a);
  });
}

function mergeAll(THREE, parts) {
  const g = mergeGeometries(THREE, parts);
  for (const p of parts) p.dispose();
  return g;
}

// The right wing (z+) spread flat from its shoulder: leading edge forward, tip out and back. The left is its mirror.
const WING = [[1.2, 0, 0], [-3.3, 0, 0], [.3, 0, 6], [-4, 0, 5.4], [-2.6, 0, 10.4]];
const wingTriangles = side => [[0, 1, 2], [1, 3, 2], [2, 3, 4]].flatMap(t => t.map(i => [WING[i][0], 0, WING[i][2] * side]));

export function createBird(THREE, ctx) {
  const {scene, layout} = ctx;
  const solidMaterial = new THREE.MeshLambertMaterial({vertexColors: true, flatShading: true});
  const thinMaterial = new THREE.MeshLambertMaterial({vertexColors: true, flatShading: true, side: THREE.DoubleSide});
  const group = new THREE.Group(); group.name = 'bird'; group.rotation.order = 'YZX'; group.visible = false; scene.add(group);
  const model = new THREE.Group(); model.scale.setScalar(layout.bird.length * DRAWN / UNITS); group.add(model);
  const mesh = (name, geometry, material = solidMaterial, parent = model) => { const m = new THREE.Mesh(geometry, material); m.name = name; parent.add(m); return m; };

  // The 2D silhouette, its y turned up: body tilted nose-up a little, the paler breast below and ahead, head, beak, eyes.
  mesh('body', mergeAll(THREE, [
    blob(THREE, COLOURS.body, [0, 6, 0], [5.3, 3.1, 2.9], .1),
    blob(THREE, COLOURS.breast, [1.3, 5.2, 0], [3.6, 2.4, 2.6]),
    blob(THREE, COLOURS.head, [4, 8, 0], [2.6, 2.5, 2.3]),
    solid(THREE, new THREE.ConeGeometry(.8, 2.6, 4), COLOURS.head, g => { g.rotateZ(-Math.PI / 2); g.translate(7, 7.6, 0); }),
    ...[1, -1].map(side => blob(THREE, COLOURS.eye, [5, 8.6, 1.9 * side], [.55, .55, .55])),
  ]));
  // The tail, the 2D triangle (root, raised tip, lower tip) given breadth: a fan on top widening to its tip and a keel to the
  // lower tip, so it reads from the side as in 2D and from below as a fan.
  const [rl, rr, tl, tr, low] = [[-3.6, 6.8, -1.1], [-3.6, 6.8, 1.1], [-10, 9, -1.9], [-10, 9, 1.9], [-8, 4, 0]];
  mesh('tail', triangles(THREE, [[rl, rr, tr], [rl, tr, tl], [rl, tl, low], [rr, low, tr], [tl, tr, low]].flat(), COLOURS.head), thinMaterial);
  // Each wing hangs from a shoulder pivot; folded, it is drawn smaller (TUCK), its span lies back along the flank and its chord
  // stands up the side.
  const wings = [1, -1].map(side => {
    const pivot = new THREE.Group(); pivot.name = side > 0 ? 'wing-right' : 'wing-left'; pivot.position.set(.3, 8, 2 * side); model.add(pivot);
    mesh(`${pivot.name}-vane`, triangles(THREE, wingTriangles(side), COLOURS.wing), thinMaterial, pivot);
    const span = new THREE.Vector3(-1, -.2, .08 * side).normalize(), chord = new THREE.Vector3(.2, 1, 0);
    chord.sub(span.clone().multiplyScalar(chord.dot(span))).normalize();
    const out = span.clone().multiplyScalar(side), normal = out.clone().cross(chord);
    const folded = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(chord, normal, out));
    return {pivot, side, folded};
  });
  const legs = mesh('legs', mergeAll(THREE, [1, -1].map(side => rod(THREE, COLOURS.legs, [.3, 0, .9 * side], [.3, 3.6, .9 * side], .28))));
  const twig = mesh('twig', rod(THREE, COLOURS.twig, [7.6, 7.3, 0], [13, 2.4, .8], .3));
  const axis = new THREE.Vector3(1, 0, 0);

  return {
    update(frame) {
      const place = birdNow(frame, layout);
      group.visible = !!place;
      if (!place) return false;
      group.position.set(...toThree(place.position));
      group.rotation.set(0, Math.PI / 2 - place.heading, place.climb);
      const beating = place.flying && frame.motion;
      // Half the beat rate wingPhase gives the 2D painting (37 rad/s), so a 30 fps frame never strobes it.
      const beat = LIFT + BEAT * Math.sin(place.wingPhase / 2);
      for (const {pivot, side, folded} of wings) {
        if (beating) pivot.quaternion.setFromAxisAngle(axis, -side * beat); else pivot.quaternion.copy(folded);
        pivot.scale.setScalar(beating ? 1 : TUCK);
      }
      legs.visible = !place.flying;
      twig.visible = !!place.carrying;
      return true;
    },
    dispose() {
      scene.remove(group);
      group.traverse(o => o.geometry?.dispose());
      solidMaterial.dispose(); thinMaterial.dispose();
    },
  };
}
