// How much of the painterly pass this device can hold. Pure: fed the time of every rendered frame, no DOM, no three.js.
export const TIERS = Object.freeze(['full', 'light', 'plain']);
// Stalls one after another with no ordinary frame between them are a very slow device, not a hidden tab.
const STALL_RUN = 8;
const median = values => { const v = [...values].sort((a, b) => a - b), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// Feed it the time of every rendered frame. It returns the tier to use from now on. After the start and after every
// step down it ignores settleMs of frames, then gathers frame intervals until windowMs of them have accumulated; an
// interval longer than stallMs (a stall or a hidden tab) is discarded and empties the window. If the window's median
// interval is longer than a frame at target, the tier steps down one and measures again; otherwise, or on plain, it
// locks for good. The median keeps one hitch from stepping a device down and jitter from hiding a slow one.
export function createTierMeter({target = 24, settleMs = 1500, windowMs = 3000, stallMs = 2000, start = 'full', locked = false} = {}) {
  if (!TIERS.includes(start)) throw new Error(`Unknown tier ${start}`);
  let index = TIERS.indexOf(start), lock = locked || index === TIERS.length - 1;
  let since = null, previous = null, frames = [], sum = 0, stalls = [];
  const settle = t => { since = t; previous = null; frames = []; sum = 0; stalls = []; };
  // A small tolerance, so a device running exactly on target is not stepped down by rounding.
  const measured = (interval, t) => {
    if (interval > 1000 / target + 1e-6) { index++; if (index === TIERS.length - 1) lock = true; else settle(t); }
    else lock = true;
  };
  return {
    get tier() { return TIERS[index]; },
    get locked() { return lock; },
    frame(t) {
      if (lock) return TIERS[index];
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
