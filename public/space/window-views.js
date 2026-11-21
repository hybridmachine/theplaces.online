// The yard drawn into the frame through the cabin's live panes. Indoors the rooms are drawn first and each live pane marks the
// stencil with its own number (interior/index.js); then, for each, the yard is drawn into the same target from the visitor's
// eye carried out through that opening (shared/window-views.js: a turn about the vertical and a shift), only where the stencil
// holds that number, cut at the pane's plane so nothing nearer than the glass shows, and with the cabin's own outside hidden.
// What faces or follows the camera (the sky dome, the far birds, the smoke) is turned to each view's eye and back.
//
// The stencil is held as three's MaskPass holds it: set, then locked across the render so no material can change the test.
// In this three, setLocked guards only setTest and setMask; the yard's materials never write the stencil, so they never set its
// function or operations, and the locked EQUAL test with KEEP operations stands for the whole draw.
// three.js is handed in, so this runs in Node.
import {toThree} from './geometry.js';
import {carry, cutPlane, screenRect} from '../../shared/window-views.js';

const fromThree = v => [v.x, -v.z, v.y];   // three (x, y, z) back to the interior's [a, d, z]

// createWindowViews(THREE, {openings, yardScene, yard, life, sky}) → {prepare(camera, ids, stencilOf) → View[], draw(renderer),
// prepared, dispose()}. A View is {id, ref, camera, plane, rect: [u0, v0, u1, v1] on screen 0–1, eye: camera.matrixWorld}. draw
// passes on a throw; whoever wraps it (SpaceView) reports a failed draw to the pass by returning false.
// Throws if the yard, life or sky cannot be re-aimed (the views cannot be set up).
export function createWindowViews(THREE, {openings, yardScene, yard, life, sky}) {
  for (const [name, part, method] of [['yard', yard, 'setCabinShown'], ['life', life, 'aim'], ['sky', sky, 'centreOn']])
    if (typeof part?.[method] !== 'function') throw new Error(`The windows' views need the ${name}'s ${method}`);
  const byId = new Map(openings.map(o => [o.id, o])), cameras = [], planes = [];
  const normal = new THREE.Vector3(), point = new THREE.Vector3();
  let prepared = [], main = null;
  // The pane's bounding rectangle on the visitor's screen, 0–1 from the bottom left, of only the part in front of the eye (the
  // pane cut 0.05 m ahead, as liveOpenings sees it); empty ([0, 0, 0, 0]) when none of it is on screen. The camera is SpaceView's:
  // rotation (pitch, −yaw, 0) in YXZ order.
  const rectOf = (o, camera) => {
    const r = screenRect(o, {eye: fromThree(camera.position), yaw: -camera.rotation.y, pitch: camera.rotation.x, fov: camera.fov * Math.PI / 180, aspect: camera.aspect});
    return r ? r.map(x => (x + 1) / 2) : [0, 0, 0, 0];
  };
  return {
    get prepared() { return prepared; },
    // For each id (stencil numbers from stencilOf), a camera with the visitor's projection at the carried eye, turned by the
    // opening's turn with the same pitch, and the pane's plane in the yard. Ids the cabin does not know are passed over.
    prepare(camera, ids, stencilOf) {
      camera.updateMatrixWorld(); main = camera;
      const eye = fromThree(camera.position);
      prepared = ids.filter(id => byId.has(id)).map((id, k) => {
        const o = byId.get(id), c = cameras[k] ??= new THREE.PerspectiveCamera(), plane = planes[k] ??= new THREE.Plane();
        c.fov = camera.fov; c.aspect = camera.aspect; c.near = camera.near; c.far = camera.far; c.zoom = camera.zoom; c.updateProjectionMatrix();
        c.position.set(...toThree(carry(o, eye)));
        c.rotation.set(camera.rotation.x, camera.rotation.y + o.turn, camera.rotation.z, 'YXZ');
        c.updateMatrixWorld();
        const cut = cutPlane(o);
        plane.setFromNormalAndCoplanarPoint(normal.set(...toThree(cut.normal)).normalize(), point.set(...toThree(cut.point)));
        return {id, ref: stencilOf(id), camera: c, plane, rect: rectOf(o, camera), eye: c.matrixWorld};
      });
      return prepared;
    },
    // Draws each prepared view into whatever target is bound, over what is there. Everything it changes is put back, even if a
    // draw throws (the throw is passed on).
    draw(renderer) {
      if (!prepared.length) return;
      const stencil = renderer.state.buffers.stencil, autoClear = renderer.autoClear, clipping = renderer.clippingPlanes;
      try {
        yard.setCabinShown(false); renderer.autoClear = false;
        for (const view of prepared) {
          sky.centreOn(view.camera.position); life.aim(view.camera);
          renderer.clippingPlanes = [view.plane];
          stencil.setLocked(false); stencil.setTest(true);
          stencil.setOp(THREE.KeepStencilOp, THREE.KeepStencilOp, THREE.KeepStencilOp); stencil.setFunc(THREE.EqualStencilFunc, view.ref, 0xff);
          stencil.setLocked(true);
          renderer.render(yardScene, view.camera);
        }
      } finally {
        stencil.setLocked(false); stencil.setTest(false);
        renderer.clippingPlanes = clipping; renderer.autoClear = autoClear;
        yard.setCabinShown(true);
        if (main) { sky.centreOn(main.position); life.aim(main); }
      }
    },
    dispose() { prepared = []; main = null; cameras.length = 0; planes.length = 0; },
  };
}
