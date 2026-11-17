import {windClock} from '../../../shared/foliage.js';
import {SWAY_UNIFORMS} from '../geometry.js';

// The wind in the yard: each frame sets the uniforms every card material shares from windClock, so the oak, the woods, the
// shrubs, the grass and the reeds lean as sampleFoliage's patches do in 2D, gusts crossing the yard toward the south. Only
// wrapped and phase values reach the shader. Under reduced motion `motionSeconds` is frozen, so everything holds still.
export function createWind(THREE, ctx) {
  const {windClock: clock, windStrength, windAlong} = SWAY_UNIFORMS, [ax, ay] = ctx.layout.wind.direction;
  windAlong.value.x = ax; windAlong.value.y = ay;
  return {
    update(frame) {
      const {time, crest, broad, settle, strength} = windClock(frame.motionSeconds);
      Object.assign(clock.value, {x: time, y: crest, z: broad, w: settle});
      windStrength.value = strength;
      return true;
    },
    // the uniforms outlive the presenter; leave the cards at rest
    dispose() { windStrength.value = 0; },
  };
}
