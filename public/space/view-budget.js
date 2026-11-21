// How many of the cabin's windows may be live, by how the frames are doing. Pure: fed the time of every rendered frame, no DOM, no three.js.
import {STALL_RUN, TOLERANCE, median} from './tier.js';
import {LIVE_CAP} from '../../shared/window-views.js';

// Each live opening is a whole extra drawing of the yard, so indoors with several live, slow frames shed openings (down to one)
// before the tier meter may step the tier down (it is held meanwhile). Measured as the tier meter measures: settleMs of frames
// ignored after every change, then intervals gathered until windowMs have accumulated; the median interval against a frame at
// target times TOLERANCE. An interval longer than stallMs (a stall or a hidden tab) is discarded and empties the window; but more
// than STALL_RUN of them one after another, with no ordinary frame between, are a device the extra drawings have overwhelmed, and
// are measured as the tier meter measures them (it is held, so nothing else would ever shed).
// Outdoors, or with at most one opening live, nothing is measured and the window is settled afresh. Stepping indoors gives
// back the full allowance of three. It runs whether or not the tier is locked.
export function createViewBudget({target = 24, settleMs = 1500, windowMs = 3000, stallMs = 2000} = {}) {
  let allowed = 3, inside = false, since = null, previous = null, frames = [], sum = 0, stalls = [];
  const settle = t => { since = t; previous = null; frames = []; sum = 0; stalls = []; };
  const measured = (interval, t) => { if (interval > 1000 / target * TOLERANCE) { allowed--; settle(t); } else { frames = []; sum = 0; } };
  return {
    limit(tier) {
      if (!(tier in LIVE_CAP)) throw new Error(`Unknown tier ${tier}`);
      return Math.min(LIVE_CAP[tier], allowed);
    },
    frame(t, {indoors = false, live = 0} = {}) {
      if (indoors !== inside) { inside = indoors; if (indoors) allowed = 3; settle(t); }
      if (!indoors || live <= 1 || allowed <= 1) { settle(t); return; }
      if (since === null) since = t;
      if (t - since < settleMs) return;
      if (previous === null) { previous = t; return; }
      const interval = t - previous; previous = t;
      if (interval > stallMs) {
        frames = []; sum = 0; stalls.push(interval);
        if (stalls.length > STALL_RUN) measured(median(stalls), t);
        return;
      }
      stalls = []; frames.push(interval); sum += interval;
      if (sum >= windowMs) measured(median(frames), t);
    },
  };
}
