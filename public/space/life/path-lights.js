import {pathLightLevel} from '../../../shared/path-lights.js';

// The path lights by the cottage door: lit from dusk to early dawn and dark by day, from the sun's height alone
// (shared/path-lights.js), so a light study shows them as that hour would. No world state; three.js is handed in and unused.
export function createPathLights(THREE, {yard}) {
  return {
    update(frame) {
      const level = pathLightLevel(frame.calendar);
      yard.setPathLights(level);
      return level > 0;
    },
    dispose() { yard.setPathLights(0); },
  };
}
