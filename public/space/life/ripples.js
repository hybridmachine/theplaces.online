import {sampleCoincidence} from '../../../shared/coincidences.js';

// The rings a rising fish leaves in the lake, from the shared coincidence at one of three fixed spots. As in the 2D painting,
// a study shows none and reduced motion (or pause) shows none. The rings themselves are drawn by the lake's shader (ground.js),
// set through yard.setRipple. three.js is handed in for the presenter contract; nothing here needs it, so this runs in Node.

// The ring to draw this frame, {center: [x, y], radius, age, variation} in the yard's axes, or null.
export function rippleNow(frame, layout) {
  if (frame.study || !frame.motion) return null;
  const {state, now} = frame.fixture?.coincidence ?? {state: frame.snapshot?.world?.coincidences, now: frame.now};
  const c = sampleCoincidence(state, now), at = c && layout.ripples[c.locationId];
  return at ? {center: [...at.center], radius: at.radius, age: c.age, variation: c.variation} : null;
}

export function createRipples(THREE, ctx) {
  const {yard, layout} = ctx;
  return {
    update(frame) {
      const ripple = rippleNow(frame, layout);
      yard.setRipple(ripple);
      return !!ripple;
    },
    dispose() { yard.setRipple(null); },
  };
}
