// The way through the cabin's front door: the door's swing for this visitor, and the fade that carries them across.
// Pure: no DOM, no three.js. `seconds` is any monotonic clock; the first frame (and the first after a crossing is asked for)
// only starts the clock.
import {THRESHOLD, doorWanted, entering, insidePose, leaving, outsidePose} from '../../shared/threshold.js';

// Indoors the door stands open while the visitor is this close to the hall's entry spot.
const NEAR_ENTRY = 2.5, ENTER_OPEN = .9;
const clamp01 = v => Math.max(0, Math.min(1, v));
const copy = p => ({...p, position: [...p.position]});

export function createPassage({space, dressing, interior, motion}) {
  let door = 0, last = null, crossing = null;
  const wanted = state => state.place === 'cabin'
    ? state.floor === 0 && Math.hypot(state.position[0] - interior.entry.position[0], state.position[1] - interior.entry.position[1]) <= NEAR_ENTRY
    : doorWanted(space, dressing, state);
  const passage = {
    get busy() { return crossing !== null; },
    send(pose) { crossing = {to: copy(pose), start: null, movedAt: null}; },
    frame(state, input, seconds, {ready}) {
      const dt = last === null ? 0 : Math.max(0, seconds - last);
      last = seconds;
      door = clamp01(door + (wanted(state) ? 1 : -1) * dt / THRESHOLD.swingSeconds);
      if (!crossing) {
        if (state.place === 'cabin' ? leaving(interior, state, input) : ready && door >= ENTER_OPEN && entering(space, dressing, state, input))
          passage.send(state.place === 'cabin' ? outsidePose(space, dressing) : insidePose(interior));
        else return {door, veil: 0, move: null};
      }
      crossing.start ??= seconds;
      // Without motion the crossing is a cut: moved at once, no veil.
      if (!motion()) { const move = crossing.to; crossing = null; return {door, veil: 0, move}; }
      const half = THRESHOLD.fadeSeconds / 2;
      if (crossing.movedAt === null) {
        if (seconds - crossing.start < half) return {door, veil: (seconds - crossing.start) / half, move: null};
        crossing.movedAt = seconds;
        return {door, veil: 1, move: crossing.to};
      }
      const veil = 1 - (seconds - crossing.movedAt) / half;
      if (veil <= 0) { crossing = null; return {door, veil: 0, move: null}; }
      return {door, veil, move: null};
    }
  };
  return passage;
}
