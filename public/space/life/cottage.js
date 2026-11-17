import {cottageFixture, sampleCottage} from '../../../shared/cottage.js';

// The cottage in the yard: its two front windows lit by their rooms, the main room's casement swung open, and a warm light laid
// on the yard outside each window after dark, all from the shared cottage as the 2D painting samples it. A study shows its
// fixture; under reduced motion the casement snaps to where it settles. three.js is handed in, so this runs in Node.

const LAMP = 0xffb561, REACH = 5, DECAY = 2, BRIGHTNESS = 2.2;
const toThree = ([x, y, z]) => [x, z, -y];

// {main, second, open}, each 0–1, or null when the world has no cottage this can read.
export function cottagePose(frame) {
  return frame.fixture?.cottagePose ?? (frame.study ? cottageFixture(frame.study)
    : sampleCottage(frame.snapshot.world.cottage, frame.now, {reducedMotion: !frame.motion}));
}

export function createCottage(THREE, ctx) {
  const {scene, yard, layout} = ctx, rooms = Object.keys(layout.cottage.lights);
  // Always in the scene, so lighting a room never changes the yard's shaders.
  const lights = Object.fromEntries(rooms.map(room => {
    const light = new THREE.PointLight(LAMP, 0, REACH, DECAY);
    light.name = `cottage-${room}`; light.position.set(...toThree(layout.cottage.lights[room]));
    scene.add(light);
    return [room, light];
  }));
  const dark = () => { yard.setCottage({main: 0, second: 0, open: 0}); for (const light of Object.values(lights)) light.intensity = 0; };
  return {
    update(frame) {
      const pose = cottagePose(frame);
      if (!pose) { dark(); return false; }
      yard.setCottage(pose);
      const night = 1 - frame.calendar.light;
      for (const room of rooms) lights[room].intensity = pose[room] * night * BRIGHTNESS;
      return true;
    },
    dispose() {
      dark();
      for (const light of Object.values(lights)) { scene.remove(light); light.dispose(); }
    },
  };
}
