// The yard's living things behind one entry. Each presenter is create<Name>(THREE, ctx) → {update(frame) → active, dispose()};
// one that throws, while being built or while updating, is given up and never run again, and the rest carry on.
// three.js is handed in, so this runs in Node.
import {createCottage} from './cottage.js';
import {createWind} from './wind.js';
import {createSmoke} from './smoke.js';
import {createRain} from './rain.js';
import {createTraces} from './traces.js';
import {createRipples} from './ripples.js';
import {createBird} from './bird.js';
import {createNest} from './nest.js';
import {createFarBirds} from './far-birds.js';

// Ordered; later tasks add the presenters here one at a time.
export const PRESENTERS = {wind: createWind, cottage: createCottage, smoke: createSmoke, rain: createRain, traces: createTraces, ripples: createRipples,
  bird: createBird, nest: createNest, farBirds: createFarBirds};

export function createLife(THREE, ctx, makers = PRESENTERS) {
  const live = new Map(), status = {};
  const fail = (name, error) => {
    status[name] = 'failed';
    const presenter = live.get(name); live.delete(name);
    try { presenter?.dispose(); } catch {}
    console.warn(`The yard's ${name} could not be kept; carrying on without it.`, error);
  };
  for (const [name, make] of Object.entries(makers)) {
    try { live.set(name, make(THREE, ctx)); status[name] = 'idle'; }
    catch (error) { fail(name, error); }
  }
  let disposed = false;
  return {
    status,
    update(frame) {
      if (disposed) return;
      for (const [name, presenter] of [...live]) {
        try { status[name] = presenter.update(frame) ? 'active' : 'idle'; }
        catch (error) { fail(name, error); }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const presenter of live.values()) { try { presenter.dispose(); } catch {} }
      live.clear();
    },
  };
}

// What a presenter is given each frame. Absent parts of the world are the presenters' to tolerate; nothing is read here.
export function lifeFrame({snapshot, now, study = null, motion, motionSeconds, realSeconds, camera, conditions, fixture = null}) {
  return {
    snapshot, now, epoch: snapshot.world.epoch, calendar: conditions.calendar, weather: conditions.weather,
    study, motion, motionSeconds, realSeconds, camera, fixture,
  };
}
