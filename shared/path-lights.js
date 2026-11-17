import {smooth} from './world.js';

// How brightly the path lights burn, 0–1, from the sun alone: they come on as it sets (from a little above the horizon,
// full a few minutes after sunset), burn all night, and go out at early dawn, while it is still well below the horizon and
// the sky has only begun to lighten. `calendar.elevation` is in radians; anything unreadable is dark.
const EVENING = [-.02, .06], MORNING = [-.19, -.09];
export function pathLightLevel(calendar) {
  const elevation = calendar?.elevation, hour = calendar?.hour;
  if (!Number.isFinite(elevation) || !Number.isFinite(hour)) return 0;
  return 1 - smooth(...(hour >= 12 ? EVENING : MORNING), elevation);
}
