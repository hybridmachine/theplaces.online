import {Ambience} from '../sound.js';
import {soundStudyFrame} from './sound-fixtures.js';
import {distantReply} from '../ambient-score.js';

// Render isolated production voices with native Web Audio. No audible playback,
// server writes, or OfflineAudioContext.suspend dependency (including Firefox).
export async function measureSoundMix(){
  const stems={};
  for(const name of ['water','lake','reply','breeze','cottage','rain']){
    const ctx=new OfflineAudioContext(2,24000*4,24000);
    const wrapper=new Proxy(ctx,{get(target,key){
      if(key==='state')return 'running';if(key==='resume'||key==='suspend')return async()=>{};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
    const audio=new Ambience({createContext:()=>wrapper,isHidden:()=>false,background:name==='water'});await audio.toggle();
    if(name==='reply'){
      const sample=soundStudyFrame('lake',1.8);audio.pendingReply=distantReply(sample.display.bird.pending);
      audio.syncReply({...sample.display,now:audio.pendingReply.start-200},1,0);
    }else{
      const sample=soundStudyFrame(name,1.8);audio.update(sample.light,sample.rain,sample.display);
    }
    const rendered=await ctx.startRendering(),data=rendered.getChannelData(0);let peak=0,squares=0,maxWindowRms=0,window=0;
    for(let i=0;i<data.length;i++){
      peak=Math.max(peak,Math.abs(data[i]));squares+=data[i]**2;window+=data[i]**2;
      if((i+1)%480===0){maxWindowRms=Math.max(maxWindowRms,Math.sqrt(window/480));window=0;}
    }
    audio.hold();stems[name]={peak,rms:Math.sqrt(squares/data.length),maxWindowRms};
  }
  return stems;
}

export function soundMixChecks(stems){
  return ['lake','reply','cottage','breeze','rain'].map(name=>{
    const ratio=stems[name].maxWindowRms/stems.water.maxWindowRms;
    return {name:`${name} detail stands above the lake background`,pass:ratio>(name==='breeze'?1.5:3),
      detail:{...stems[name],backgroundRms:stems.water.maxWindowRms,marginDb:20*Math.log10(ratio)}};
  });
}
