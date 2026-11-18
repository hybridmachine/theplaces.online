import { clockLabel, viewConditions } from '../shared/world.js';
import {sampleSurface, surfaceDescription, surfaceFixture} from '../shared/surface-weather.js';
import {cottageDescription} from '../shared/cottage.js';
import {birdDescription} from '../shared/bird.js';
import {sampleCoincidence} from '../shared/coincidences.js';

export function sceneText(snapshot, now, { study = null, paused = false, disconnected = false, staticCottage = false, reducedMotion = false, birdUnavailable = false, coincidenceActive = false, room = null } = {}) {
  const { calendar, weather } = viewConditions(snapshot.world.epoch, now, study);
  const nest = snapshot.world.nest.stage === 'built'
    ? 'A completed nest rests in the oak.'
    : `A bird is building a nest in the oak. ${snapshot.world.nest.materials} strands gathered.`;
  const prefix = study ? 'Private light study. ' : '';
  const conditions = `${calendar.season}. ${calendar.period}. ${weather.name}. ${nest}`;
  const surface = surfaceDescription(study ? surfaceFixture(study) : sampleSurface(snapshot.world.environment, snapshot.world.epoch, now));
  const cottage=study?'':cottageDescription(snapshot.world.cottage);
  const cottageText=cottage?`${staticCottage?' The cottage is shown as a static painting. Shared cottage state: ':' '}${cottage}`:'';
  const bird=study?'':birdDescription(snapshot.world.bird,snapshot.world.action,now,{reducedMotion,unavailable:birdUnavailable});
  const ripple=!study&&!reducedMotion&&coincidenceActive&&sampleCoincidence(snapshot.world.coincidences,now)?' A small ripple is spreading on the lake.':'';
  return {
    // Indoors the room comes first; the announcement keeps to the world's conditions.
    description: `${room ? `Inside the cabin, in the ${room}. ` : ''}${prefix}Year ${calendar.year}, day ${calendar.dayOfYear + 1}, ${clockLabel(calendar.hour)}. ${conditions}${surface ? ` ${surface}` : ''}${cottageText}${bird?` ${bird}`:''}${ripple}${paused ? ' This view is paused.' : ''}`,
    // Keep the exact clock available for inspection without announcing every minute.
    announcement: `${prefix}${conditions}${disconnected ? ' Connection lost; holding the last consistent view.' : ''}`,
  };
}

// The label timer and snapshot arrival can run before the frame that starts or
// stops drawing a ripple, or that moves the visitor into another room. This keeps
// the description in step with what was drawn.
export class SceneDescriber {
  constructor({describe,announce}){this.describe=describe;this.announce=announce;this.ripple=null;this.room=undefined;}
  update(snapshot,now,options,{announce=true}={}){
    const {description,announcement}=sceneText(snapshot,now,options);
    this.ripple=!!options.coincidenceActive;this.room=options.room??null;this.describe(description);
    if(announce)this.announce(announcement);
  }
  // Call after each frame with the rendered snapshot and its displayed time.
  // The live announcement keeps the cadence of update().
  rendered(snapshot,now,options){
    if(!!options.coincidenceActive===this.ripple&&(options.room??null)===this.room)return false;
    this.update(snapshot,now,options,{announce:false});return true;
  }
}
