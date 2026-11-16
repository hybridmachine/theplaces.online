import {sampleFoliage} from '../shared/foliage.js';
import {LAKESIDE_FOLIAGE} from '../shared/lakeside-foliage.js';
import {sampleWind} from '../shared/wind.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const oak=LAKESIDE_FOLIAGE.patches.find(patch=>patch.id==='oak-low');

// Cosmetic sound, sampled from the same real-second gust as the oak artwork.
// Only the crest is audible; most of each breeze remains quiet.
export function rustleLevel(epoch,now,rain=0){
  if(![epoch,now,rain].every(Number.isFinite)||now<epoch)return 0;
  const seconds=(now-epoch)/1000,wind=sampleWind(seconds);
  const {gust}=sampleFoliage(seconds,oak,LAKESIDE_FOLIAGE.seed);
  return .22*clamp((gust-.64)/.36)**2*clamp((wind-.12)/.32)*(1-.8*clamp(rain));
}

// A distant, unnamed ambient bird may answer an actually heard shared call.
// It creates no inhabitant or history event. Identity determines chance/delay,
// so repeated snapshots and different visitors do not roll new chances.
export function distantReply(action){
  if(typeof action?.id!=='string'||!Number.isFinite(action.phraseStart))return null;
  let seed=2166136261;
  for(const character of action.id)seed=Math.imul(seed^character.charCodeAt(0),16777619)>>>0;
  seed=Math.imul(seed^(seed>>>16),2246822507)>>>0;seed=(seed^(seed>>>13))>>>0;
  if(seed/4294967296>=.45)return null;
  const start=action.phraseStart+3400+(seed%1300);
  return {id:action.id,start,end:start+700};
}
