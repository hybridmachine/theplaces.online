// Entirely synthesized ambience. Audio only starts after a deliberate user gesture.
import {validBirdState} from '../shared/bird.js';
import {validCottageState} from '../shared/cottage.js';
import {rustleLevel,distantReply} from './ambient-score.js';

function texturedNoise(ctx,kind){
  const buffer=ctx.createBuffer(1,ctx.sampleRate*11,ctx.sampleRate),data=buffer.getChannelData(0);
  let seed=kind==='leaves'?941:173,until=0,age=0,length=1,level=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<data.length;i++){
    if(i>=until){
      age=0;length=ctx.sampleRate*(kind==='leaves'?.025+random()*.045:.012+random()*.025);
      until=i+length+ctx.sampleRate*(kind==='leaves'?random()*.025:.025+random()*.085);level=.35+random()*.65;
    }
    const envelope=age<length?Math.sin(Math.PI*age/length)**(kind==='leaves'?2:4):0;
    data[i]=(random()*2-1)*level*envelope;age++;
  }
  return buffer;
}
export class Ambience {
  constructor({createContext=()=>{
    const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!AudioContext)throw new Error('Audio is unavailable in this browser.');
    return new AudioContext();
  },isHidden=()=>document.hidden,background=true}={}){
    this.enabled=false;this.context=null;this.transition=null;
    this.createContext=createContext;this.isHidden=isHidden;
    this.phraseNodes=new Set();this.lastPhraseId=null;
    this.replyNodes=new Set();this.cottageNodes=new Set();this.pendingReply=null;this.lastCottageId=null;
    this.lastRustleAt=-Infinity;this.rustleTarget=0;
    this.lastGainAt=-Infinity;this.gainTarget=null;
    this.background=background;this.waterTarget=null;this.rainTarget=0;this.lastRainAt=-Infinity;
  }
  toggle(){
    if(this.transition)return this.transition;
    // Coalesce repeated clicks while the browser is resuming or suspending audio.
    this.transition=this.applyToggle().finally(()=>{this.transition=null;});
    return this.transition;
  }
  async applyToggle(){
    if(this.enabled){
      this.hold();await this.context.suspend();this.enabled=false;return false;
    }
    if(!this.context){
      const ctx=this.context=this.createContext();this.master=ctx.createGain();this.master.gain.value=.24;this.master.connect(ctx.destination);
      const buffer=ctx.createBuffer(1,ctx.sampleRate*7,ctx.sampleRate);const data=buffer.getChannelData(0);let previous=0,waterSeed=3829;
      for(let i=0;i<data.length;i++){
        waterSeed=(Math.imul(waterSeed,1664525)+1013904223)>>>0;
        previous=(previous+(waterSeed/2147483648-1)*.025)/1.025;
        const phase=i/data.length;
        data[i]=previous*3*(.25+.75*Math.sin(Math.PI*phase)**2);
      }
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
      this.water=ctx.createGain();this.waterTarget=this.background ? .025 : 0;this.water.gain.value=this.waterTarget;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=500;
      source.connect(filter);filter.connect(this.water);this.water.connect(this.master);source.start();
      // Short grains give leaves a crinkling texture and rain a light patter.
      const leafSource=ctx.createBufferSource(),leafFilter=ctx.createBiquadFilter();
      leafSource.buffer=texturedNoise(ctx,'leaves');leafSource.loop=true;leafFilter.type='bandpass';leafFilter.frequency.value=2400;leafFilter.Q.value=.65;
      this.rustle=ctx.createGain();this.rustle.gain.value=0;
      leafSource.connect(leafFilter);leafFilter.connect(this.rustle);this.connectAt(this.rustle,-.4);leafSource.start();
      const rainSource=ctx.createBufferSource(),rainFilter=ctx.createBiquadFilter();
      rainSource.buffer=texturedNoise(ctx,'rain');rainSource.loop=true;rainFilter.type='bandpass';rainFilter.frequency.value=3300;rainFilter.Q.value=.8;
      this.rain=ctx.createGain();this.rain.gain.value=0;
      rainSource.connect(rainFilter);rainFilter.connect(this.rain);this.connectAt(this.rain,.15);rainSource.start();
    }
    await this.context.resume();this.enabled=true;if(this.isHidden())await this.context.suspend();return true;
  }
  update(light,rain,display=null){
    this.light=light;
    if(!this.enabled||this.transition||this.context?.state!=='running'||this.isHidden()||!display?.active||
      !Number.isFinite(display.now)||!Number.isFinite(display.validUntil)||display.now>=display.validUntil)this.hold();
    // A live visit can briefly wait at a commit boundary while its lease is valid.
    // Keep only an already-heard call's candidate; no details play on held time.
    else if(display.waitingForCommit)this.hold({preserveReply:true});
    else{
      this.syncBird(display);
      this.syncCottage(display);
      this.syncReply(display,light,rain);
      this.syncRustle(display,rain);
    }
    if(!this.enabled||this.context?.state!=='running')return;
    const time=this.context.currentTime,wet=Number.isFinite(rain)?Math.max(0,Math.min(1,rain)):0,target=.24+wet*.06;
    for(const [name,value]of [['water',this.background ? .025 : 0],['rain',.6*wet*wet]]){
      if(value===this[`${name}Target`])continue;
      if(name==='rain'&&(time-this.lastRainAt<.5||(value!==0&&Math.abs(value-this.rainTarget)<.001)))continue;
      const gain=this[name].gain,current=gain.value;gain.cancelScheduledValues(0);gain.setValueAtTime(current,time);gain.setTargetAtTime(value,time,.15);this[`${name}Target`]=value;
      if(name==='rain')this.lastRainAt=time;
    }
    if(time-this.lastGainAt<.5||(this.gainTarget!==null&&Math.abs(target-this.gainTarget)<.001))return;
    const gain=this.master.gain,current=gain.value;
    // Retain the current audible value, but replace the automation history.
    // Only one starting value and one target remain, even after hours of rendering.
    gain.cancelScheduledValues(0);gain.setValueAtTime(current,time);gain.setTargetAtTime(target,time,2);
    this.lastGainAt=time;this.gainTarget=target;
  }
  hold({preserveReply=false}={}){
    this.cancelBird();if(!preserveReply)this.pendingReply=null;
    this.cancelVoices(this.replyNodes);this.cancelVoices(this.cottageNodes);
    if(this.rustle&&(this.rustleTarget!==0||this.rustle.gain.value!==0)){
      this.rustle.gain.cancelScheduledValues(0);this.rustle.gain.setValueAtTime(0,this.context.currentTime);
      this.rustleTarget=0;this.lastRustleAt=-Infinity;
    }
  }
  cancelBird(){
    // A canceled look-ahead must not leave an answer to an unheard call.
    if(this.pendingReply&&this.context.currentTime<this.replyCallEndsAt)this.pendingReply=null;
    for(const nodes of this.phraseNodes)this.releasePhrase(nodes,true);
  }
  releasePhrase(nodes,stop=false){
    if(!this.phraseNodes.delete(nodes))return;
    const {osc,gain}=nodes;osc.onended=null;
    if(stop){try{osc.stop();}catch{}}
    try{osc.disconnect();}catch{}
    try{gain.disconnect();}catch{}
  }
  syncBird(display){
    const action=display?.bird?.pending;
    if(!this.enabled||this.transition||this.context?.state!=='running'||this.isHidden()||!display?.active||
      display.birdActive===false||!validBirdState(display.bird)||action?.kind!=='call'||!Number.isFinite(display.now)||
      !Number.isFinite(display.validUntil)||action.end>display.validUntil){this.cancelBird();return;}
    if(action.id===this.lastPhraseId)return;
    this.cancelBird();
    const delay=(action.phraseStart-display.now)/1000;
    if(delay<0){this.lastPhraseId=action.id;return;}
    if(delay>.25)return; // Small look-ahead; never queue minutes of sound.
    this.lastPhraseId=action.id;
    this.phrase(this.context.currentTime+delay);
    this.replyCallEndsAt=this.context.currentTime+delay+.42;
    this.pendingReply=distantReply(action);
  }
  connectAt(node,position){
    // Older Web Audio implementations can safely render the same voice in mono.
    if(!this.context.createStereoPanner){node.connect(this.master);return null;}
    const pan=this.context.createStereoPanner();pan.pan.value=position;node.connect(pan);pan.connect(this.master);return pan;
  }
  releaseVoice(set,voice,stop=false){
    if(!set.delete(voice))return;
    voice.osc.onended=null;
    if(stop){try{voice.osc.stop();}catch{}}
    for(const node of [voice.osc,voice.gain,voice.filter,voice.pan]){try{node?.disconnect();}catch{}}
  }
  cancelVoices(set){for(const voice of set)this.releaseVoice(set,voice,true);}
  voice(set,{time,duration,frequency,endFrequency,peak,position,cutoff,type='sine'}){
    const ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    osc.type=type;osc.frequency.setValueAtTime(frequency,time);osc.frequency.exponentialRampToValueAtTime(endFrequency,time+duration*.8);
    filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.5;
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(peak,time+duration*.18);gain.gain.setValueAtTime(peak,time+duration*.5);gain.gain.exponentialRampToValueAtTime(.0001,time+duration*.95);gain.gain.linearRampToValueAtTime(0,time+duration);
    osc.connect(filter);filter.connect(gain);const pan=this.connectAt(gain,position),voice={osc,gain,filter,pan};
    set.add(voice);osc.onended=()=>this.releaseVoice(set,voice);osc.start(time);osc.stop(time+duration);
  }
  syncRustle(display,rain){
    const time=this.context.currentTime,target=rustleLevel(display.epoch,display.now,rain);
    if(time-this.lastRustleAt<.5||target===this.rustleTarget||(target!==0&&Math.abs(target-this.rustleTarget)<.001))return;
    const gain=this.rustle.gain,current=gain.value;
    gain.cancelScheduledValues(0);gain.setValueAtTime(current,time);gain.setTargetAtTime(target,time,.3);
    this.lastRustleAt=time;this.rustleTarget=target;
  }
  syncReply(display,light,rain){
    if(this.replyNodes.size&&this.replyEnd>display.validUntil)this.cancelVoices(this.replyNodes);
    if(!Number.isFinite(light)||!Number.isFinite(rain)||light<.45||rain>.12){
      this.pendingReply=null;this.cancelVoices(this.replyNodes);return;
    }
    const reply=this.pendingReply;if(!reply)return;
    const delay=(reply.start-display.now)/1000;
    if(delay<0){this.pendingReply=null;return;}
    if(delay>.25||reply.end>display.validUntil)return;
    this.pendingReply=null;
    this.replyEnd=reply.end;
    const time=this.context.currentTime+delay;
    for(let i=0;i<2;i++)this.voice(this.replyNodes,{time:time+i*.27,duration:.21,frequency:1650+i*130,endFrequency:2200-i*100,peak:.13,position:.55,cutoff:3000});
  }
  syncCottage(display){
    const action=display.cottage?.pending;
    if(display.cottageActive!==true||!validCottageState(display.cottage)||action?.kind!=='casement'||action.end>display.validUntil){this.cancelVoices(this.cottageNodes);return;}
    if(action.id===this.lastCottageId)return;
    this.cancelVoices(this.cottageNodes);
    const delay=(action.motionStart-display.now)/1000;
    if(delay<0){this.lastCottageId=action.id;return;}
    if(delay>.25)return;
    this.lastCottageId=action.id;
    this.voice(this.cottageNodes,{time:this.context.currentTime+delay,duration:Math.min(1.1,(action.end-action.motionStart)/1000),
      frequency:action.target?320:440,endFrequency:action.target?470:285,peak:.18,position:.25,cutoff:1200,type:'triangle'});
  }
  phrase(time){
    const ctx=this.context;
    for(let i=0;i<3;i++){
      const start=time+i*.13,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';
      osc.frequency.setValueAtTime(2000+i*220,start);osc.frequency.exponentialRampToValueAtTime(3200-i*200,start+.07);osc.frequency.exponentialRampToValueAtTime(2400,start+.12);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.16,start+.02);gain.gain.setValueAtTime(.16,start+.065);gain.gain.exponentialRampToValueAtTime(.0001,start+.15);
      const nodes={osc,gain};this.phraseNodes.add(nodes);
      osc.onended=()=>this.releasePhrase(nodes);
      osc.connect(gain);gain.connect(this.master);osc.start(start);osc.stop(start+.16);
    }
  }
  async visibility(){this.hold();if(this.transition)await this.transition;if(!this.context||!this.enabled)return;if(this.isHidden())await this.context.suspend();else await this.context.resume();}
}
