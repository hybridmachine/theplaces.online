import {createBirdState,BIRD_ID} from '../../shared/bird.js';
import {createCottageState} from '../../shared/cottage.js';
import {distantReply} from '../ambient-score.js';

export const SOUND_STUDY_SECONDS=20;
const start=4000;
let callId;
for(let i=0;i<1000;i++)if(distantReply({id:`sound-study-${i}`,phraseStart:6000})){callId=`sound-study-${i}`;break;}

// Private, in-memory fixtures. No server calls or writes to the shared world.
export function soundStudyFrame(name,elapsed,{background=false}={}){
  const now=start+elapsed*1000,bird=createBirdState(0,false),cottage=createCottageState(0,0);
  bird.locationId='oak-perch';
  if(name==='lake'&&now<=6600)bird.pending={id:callId,actor:BIRD_ID,rulesVersion:1,kind:'call',from:'oak-perch',to:'oak-perch',
    start:1000,phraseStart:6000,end:6600,phaseSeed:0,phrase:'oak-phrase-1'};
  if(name==='cottage'&&now<=10000){
    cottage.casement=1;cottage.pending={id:'sound-study-window',actor:cottage.residentId,kind:'casement',room:'main',from:1,target:0,start:1000,motionStart:6000,end:10000};
  }
  // Start beside a real gust crest; a demo should not wait thirty seconds for
  // its first leaf sound. Live world timing is unchanged.
  const epoch=name==='breeze'||background?-25000:undefined;
  return {light:1,rain:name==='rain'?.65:0,display:{epoch,now,active:true,birdActive:true,cottageActive:true,bird,cottage,validUntil:60000}};
}
