import {Ambience} from '../sound.js';
import {soundStudyFrame,SOUND_STUDY_SECONDS} from './sound-fixtures.js';

const scene=document.querySelector('#scene'),button=document.querySelector('#listen'),status=document.querySelector('#status'),background=document.querySelector('#background');
const descriptions={lake:'A three-note call at 2 seconds, followed by a quieter answer around 6 seconds.',breeze:'A close, papery rustle swells during the first few seconds, then falls quiet.',cottage:'A wooden creak at 2 seconds as the casement begins to close.',rain:'Light rain patters on the leaves from the start.'};
let audio=null,started=0,frameId=null,lastSecond=-1;
async function stop(message='Sound is off.'){
  cancelAnimationFrame(frameId);frameId=null;
  const previous=audio;audio=null;
  if(previous){previous.hold();if(previous.context)await previous.context.close();}
  button.textContent='Listen';button.setAttribute('aria-pressed','false');scene.disabled=false;status.textContent=message;
  document.querySelector('#remaining').textContent='';
}
function frame(){
  if(!audio)return;
  const elapsed=(performance.now()-started)/1000;
  if(elapsed>=SOUND_STUDY_SECONDS){stop('The study has ended. Stay a while, or listen again.');return;}
  audio.background=background.checked;
  const sample=soundStudyFrame(scene.value,elapsed,{background:background.checked});audio.update(sample.light,sample.rain,sample.display);
  const second=Math.floor(elapsed);
  if(second!==lastSecond){lastSecond=second;document.querySelector('#remaining').textContent=`${SOUND_STUDY_SECONDS-second} seconds remaining`;}
  frameId=requestAnimationFrame(frame);
}
button.addEventListener('click',async()=>{
  button.disabled=true;
  try{
    if(audio)await stop();
    else{
      const next=audio=new Ambience({background:background.checked});await next.toggle();
      if(audio!==next)return;
      if(document.hidden){await stop('Listening stopped while the page was away.');return;}
      scene.disabled=true;button.textContent='Stop listening';button.setAttribute('aria-pressed','true');status.textContent='Listening. Leave room for the quiet moments.';started=performance.now();lastSecond=-1;frame();
    }
  }catch(error){await stop(error.message);}
  finally{button.disabled=false;}
});
scene.addEventListener('change',()=>{document.querySelector('#description').textContent=descriptions[scene.value];});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&audio)stop('Listening stopped while the page was away. Press Listen to begin again.');});
addEventListener('pagehide',()=>{if(audio)stop();});
