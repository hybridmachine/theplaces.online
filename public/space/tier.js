// How much of the painterly pass this device can hold. Pure: fed the time of every rendered frame, no DOM, no three.js.
export const TIERS = Object.freeze(['full', 'light', 'plain']);
// Gaps one after another with no ordinary frame between them are a very slow device, not a hidden tab or a stall.
const GAP_RUN = 8;

// Feed it the time of every rendered frame. It returns the tier to use from now on. After the start and after every
// step down it ignores settleMs of frames, then gathers frame intervals until windowMs of them have accumulated; one
// interval longer than gapMs is discarded and empties the window. Below target the tier steps down one and measures
// again; otherwise, or on plain, it locks for good.
export function createTierMeter({target = 24, settleMs = 1500, windowMs = 3000, gapMs = 250, start = 'full', locked = false} = {}) {
  if (!TIERS.includes(start)) throw new Error(`Unknown tier ${start}`);
  let index = TIERS.indexOf(start), lock = locked || index === TIERS.length - 1;
  let since = null, previous = null, frames = 0, sum = 0, gaps = 0, gapSum = 0;
  const settle = t => { since = t; previous = null; frames = sum = gaps = gapSum = 0; };
  // A small tolerance, so a device running exactly on target is not stepped down by rounding.
  const measured = (count, ms, t) => {
    if (count * 1000 / ms < target - 1e-6) { index++; if (index === TIERS.length - 1) lock = true; else settle(t); }
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
      if (interval > gapMs) {
        frames = sum = 0; gaps++; gapSum += interval;
        if (gaps > GAP_RUN) measured(gaps, gapSum, t);
      } else {
        gaps = gapSum = 0; frames++; sum += interval;
        if (sum >= windowMs) measured(frames, sum, t);
      }
      return TIERS[index];
    },
  };
}
