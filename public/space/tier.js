// How much of the painterly pass this device can hold. Pure: fed the time of every rendered frame, no DOM, no three.js.
export const TIERS = Object.freeze(['full', 'light', 'plain']);
// Stalls one after another with no ordinary frame between them are a very slow device, not a hidden tab.
export const STALL_RUN = 8;
// A window steps down only when its median interval is this much longer than a frame at target. app.js draws on whole
// display refreshes, so on a 48 Hz display the median interval is two refreshes, which is exactly a frame at 24 fps:
// without room above it, timestamp rounding and jitter would decide, and a healthy device could lose a tier for good.
export const TOLERANCE = 1.08;
export const median = values => { const v = [...values].sort((a, b) => a - b), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// Feed it the time of every rendered frame. It returns the tier to use from now on. After the start and after every
// step down it ignores settleMs of frames, then gathers frame intervals until windowMs of them have accumulated; an
// interval longer than stallMs (a stall or a hidden tab) is discarded and empties the window. If the window's median
// interval is longer than a frame at target by more than TOLERANCE, the tier steps down one and measures again; otherwise,
// or on plain, it locks for good. The median keeps one hitch from stepping a device down and jitter from hiding a slow one.
// Frames drawn indoors (the cabin's rooms, far cheaper than the yard) are measured as well, but only to step down: a good
// window indoors starts another instead of locking, so the yard still gets a window of its own. Stepping indoors or out
// settles and starts the window afresh, so neither place is measured by the other's frames. A held frame (several live
// openings, each a whole extra yard) is not measured at all: the window is settled afresh, so only a view that costs
// little more than the room itself can cost the tier; the view budget sheds openings first.
export function createTierMeter({target = 24, settleMs = 1500, windowMs = 3000, stallMs = 2000, start = 'full', locked = false} = {}) {
  if (!TIERS.includes(start)) throw new Error(`Unknown tier ${start}`);
  let index = TIERS.indexOf(start), lock = locked || index === TIERS.length - 1;
  let since = null, previous = null, frames = [], sum = 0, stalls = [], inside = false;
  const settle = t => { since = t; previous = null; frames = []; sum = 0; stalls = []; };
  const measured = (interval, t) => {
    if (interval > 1000 / target * TOLERANCE) { index++; if (index === TIERS.length - 1) lock = true; else settle(t); }
    else if (inside) { frames = []; sum = 0; }
    else lock = true;
  };
  return {
    get tier() { return TIERS[index]; },
    get locked() { return lock; },
    frame(t, {indoors = false, hold = false} = {}) {
      if (lock) return TIERS[index];
      if (indoors !== inside) { inside = indoors; settle(t); }
      if (hold) { settle(t); return TIERS[index]; }
      if (since === null) since = t;
      if (t - since < settleMs) return TIERS[index];
      if (previous === null) { previous = t; return TIERS[index]; }
      const interval = t - previous; previous = t;
      if (interval > stallMs) {
        frames = []; sum = 0; stalls.push(interval);
        if (stalls.length > STALL_RUN) measured(median(stalls), t);
      } else {
        stalls = []; frames.push(interval); sum += interval;
        if (sum >= windowMs) measured(median(frames), t);
      }
      return TIERS[index];
    },
  };
}
