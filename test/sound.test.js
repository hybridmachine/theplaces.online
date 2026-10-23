import test from 'node:test';
import assert from 'node:assert/strict';
import { Ambience } from '../public/sound.js';
import {createBirdState,BIRD_ID} from '../shared/bird.js';
import {createCottageState} from '../shared/cottage.js';
import {distantReply,rustleLevel} from '../public/ambient-score.js';
import {soundStudyFrame,SOUND_STUDY_SECONDS} from '../public/dev/sound-fixtures.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function audioHarness(options={}) {
  let hidden = false;
  const oscillators=[];
  const gain = {
    value: .09, events: [], targets: 0,
    cancelScheduledValues(time) { this.events = this.events.filter(event => event.time < time); this.value = 0; },
    setValueAtTime(value, time) { this.value = value; this.events.push({ type: 'value', value, time }); },
    setTargetAtTime(value, time) { this.targets++; this.events.push({ type: 'target', value, time }); },
  };
  const node = () => ({ connect() {}, disconnect() {}, start() {} });
  const context = {
    state: 'suspended', currentTime: 0, sampleRate: 10, destination: {},
    createGain: () => ({ gain:{...gain,events:[],setValueAtTime:gain.setValueAtTime,linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}, connect() {},disconnect() {} }),
    createOscillator:()=>{
      const oscillator={...node(),frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},starts:[],stops:[],start(at){this.starts.push(at);},stop(at){this.stops.push(at);}};
      oscillators.push(oscillator);return oscillator;
    },
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: node,
    createBiquadFilter: () => ({ ...node(), frequency: { value: 0 }, Q: { value: 0 } }),
    async resume() { this.state = 'running'; },
    async suspend() { this.state = 'suspended'; },
  };
  const audio = new Ambience({
    createContext: () => context,
    isHidden: () => hidden,
    ...options,
  });
  // Capture the actual master gain separately from transient phrase envelopes.
  const createGain=context.createGain;let master=null;
  context.createGain=()=>{const node=createGain();if(!master){master=node;node.gain=gain;}return node;};
  return { audio, context, gain, oscillators, setHidden: value => { hidden = value; } };
}

test('concurrent audio toggles coalesce without scheduling a local bird timer', async t => {
  t.mock.method(globalThis,'setInterval',()=>{throw new Error('Bird sounds must follow shared actions');});
  const { audio, context, oscillators } = audioHarness();
  const resumed = deferred();
  context.resume = async () => { await resumed.promise; context.state = 'running'; };
  const first = audio.toggle(), second = audio.toggle();
  assert.equal(first, second);
  assert.equal(oscillators.length, 0);
  resumed.resolve();
  assert.equal(await first, true);
  assert.equal(oscillators.length, 0);
  const stopped = deferred();
  context.suspend = async () => { await stopped.promise; context.state = 'suspended'; };
  const off = audio.toggle();
  assert.equal(audio.toggle(), off);
  stopped.resolve();
  assert.equal(await off, false);
  assert.equal(oscillators.length, 0);
  assert.equal(await audio.toggle(), true);
  assert.equal(oscillators.length, 0);
  await audio.toggle();
  assert.equal(oscillators.length, 0);
});

test('the study presents each detail early and isolates it from lake ambience by default',()=>{
  assert.equal(SOUND_STUDY_SECONDS,20);
  const call=soundStudyFrame('lake',0),window=soundStudyFrame('cottage',0);
  assert.equal(call.display.bird.pending.phraseStart-call.display.now,2000);
  assert.equal(window.display.cottage.pending.motionStart-window.display.now,2000);
  assert.equal(call.display.epoch,undefined);
  assert.equal(window.display.epoch,undefined);
  const breeze=soundStudyFrame('breeze',2);
  assert.ok(rustleLevel(breeze.display.epoch,breeze.display.now)>.1);
  assert.ok(soundStudyFrame('rain',0).rain>0);
  assert.ok(Number.isFinite(soundStudyFrame('lake',0,{background:true}).display.epoch));
});

test('removing background water keeps detail voices and rain available with bounded automation',async()=>{
  const {audio,context,oscillators}=audioHarness({background:false});await audio.toggle();
  assert.equal(audio.water.gain.value,0);
  audio.update(1,0,display(callingBird()));assert.equal(oscillators.length,3);
  for(let frame=0;frame<600;frame++){
    context.currentTime=frame/30;audio.update(1,(Math.sin(frame/60)+1)/2);
    assert.ok(audio.rain.gain.events.length<=2);
  }
  assert.equal(audio.waterTarget,0);assert.ok(audio.rain.gain.targets<=40);assert.ok(audio.rainTarget>0);
  audio.background=true;audio.update(1,.5);assert.equal(audio.waterTarget,.025);
  await audio.toggle();
});

function answeredBird(){
  for(let i=0;i<100;i++){const bird=callingBird(`reply-${i}`);if(distantReply(bird.pending))return bird;}
  throw new Error('No answering fixture');
}
function movingWindow(){
  const cottage=createCottageState(0,0);
  cottage.pending={id:'window-1',actor:cottage.residentId,kind:'casement',room:'main',from:0,target:1,start:1000,motionStart:6000,end:10000};
  return cottage;
}

test('leaf gusts share world time, leave substantial quiet, and attenuate in rain',()=>{
  let quiet=0,peak=0;
  for(let second=0;second<3600;second++){
    const level=rustleLevel(0,second*1000);quiet+=level===0;peak=Math.max(peak,level);
    assert.equal(level,rustleLevel(1700000000000,1700000000000+second*1000));
    assert.ok(rustleLevel(0,second*1000,1)<=level);
  }
  assert.ok(quiet>3600*.7);assert.ok(peak>.1&&peak<=.22);
  assert.equal(rustleLevel(undefined,1000),0);assert.equal(rustleLevel(0,NaN),0);
});

test('leaf automation stays bounded and hold silences it while retaining the water bed',async()=>{
  const {audio,context,gain}=audioHarness();await audio.toggle();
  let peak=0;
  for(let frame=0;frame<1800;frame++){
    context.currentTime=frame/30;
    audio.update(1,0,{active:true,epoch:0,now:frame/30*1000,validUntil:100000});
    peak=Math.max(peak,audio.rustleTarget);assert.ok(audio.rustle.gain.events.length<=2);
  }
  assert.ok(peak>0);assert.ok(audio.rustle.gain.targets<=120);
  audio.hold();assert.equal(audio.rustle.gain.value,0);assert.ok(gain.targets>0);
  audio.rustle.gain.value=.002;audio.hold();
  assert.equal(audio.rustle.gain.value,0,'hold also cancels an envelope still fading toward zero');
  await audio.toggle();
});

test('a distant answer follows a heard call across its completion snapshot without replay',async()=>{
  const {audio,context,oscillators}=audioHarness(),bird=answeredBird(),reply=distantReply(bird.pending);
  await audio.toggle();context.currentTime=10;audio.update(1,0,display(bird));
  assert.deepEqual(audio.pendingReply,reply);
  context.currentTime=11.2;
  bird.pending=null;
  audio.update(1,0,{...display(bird,7000),validUntil:30000});
  assert.equal(audio.replyNodes.size,0);assert.deepEqual(audio.pendingReply,reply);
  context.currentTime=14;
  audio.update(1,0,{...display(bird,reply.start-200),validUntil:30000});
  assert.equal(audio.replyNodes.size,2);assert.equal(oscillators.length,5);
  assert.ok(Math.abs(oscillators[3].starts[0]-14.2)<.00001);
  for(let i=0;i<100;i++)audio.update(1,0,{...display(bird,reply.start-100),validUntil:30000});
  assert.equal(oscillators.length,5);
  for(const voice of [...audio.replyNodes])voice.osc.onended();
  assert.equal(audio.replyNodes.size,0);await audio.toggle();
});

test('missed calls, canceled visits, bad weather and short leases do not invent distant answers',async()=>{
  for(const mode of ['late','hold','night','rain','lease','missed-reply','hidden','pause']){
    const {audio,setHidden}=audioHarness(),bird=answeredBird(),reply=distantReply(bird.pending);await audio.toggle();
    audio.update(1,0,display(bird,mode==='late'?6001:5800));
    if(mode==='hold')audio.hold();
    if(mode==='hidden'){setHidden(true);await audio.visibility();setHidden(false);await audio.visibility();}
    if(mode==='pause')audio.update(1,0,{...display(bird),active:false});
    bird.pending=null;
    audio.update(mode==='night'?0:1,mode==='rain'?.5:0,{...display(bird,reply.start+(mode==='missed-reply'?1:-100)),validUntil:mode==='lease'?reply.start+50:30000});
    assert.equal(audio.replyNodes.size,0,mode);await audio.toggle();
  }
});

test('casement sound starts with committed motion, deduplicates, and releases nodes once',async()=>{
  const {audio,context,oscillators}=audioHarness(),cottage=movingWindow(),before=structuredClone(cottage);
  const frame={active:true,cottageActive:true,cottage,now:5800,validUntil:10000};
  await audio.toggle();context.currentTime=4;
  audio.update(1,0,{...frame,now:5000});assert.equal(oscillators.length,0);
  audio.update(1,0,frame);assert.equal(audio.cottageNodes.size,1);assert.equal(oscillators[0].starts[0],4.2);
  audio.update(1,0,structuredClone(frame));assert.equal(oscillators.length,1);assert.deepEqual(cottage,before);
  const voice=[...audio.cottageNodes][0],ended=voice.osc.onended;let disconnects=0;
  for(const node of [voice.osc,voice.gain,voice.filter])node.disconnect=()=>{disconnects++;};
  audio.hold();audio.hold();ended();assert.equal(disconnects,3);assert.equal(audio.cottageNodes.size,0);
  audio.update(1,0,frame);assert.equal(oscillators.length,1);await audio.toggle();
});

test('casement audio respects renderer, reduced-motion, lease and arrival boundaries',async()=>{
  for(const mode of ['static','paused','late','lease','wrong-action','invalid']){
    const {audio,oscillators}=audioHarness(),cottage=movingWindow();await audio.toggle();
    if(mode==='wrong-action')cottage.pending.kind='light';
    if(mode==='invalid')cottage.pending.motionStart=NaN;
    audio.update(1,0,{active:mode!=='paused',cottageActive:mode!=='static',cottage,now:mode==='late'?6001:5800,validUntil:mode==='lease'?6100:10000});
    assert.equal(oscillators.length,0,mode);await audio.toggle();
  }
});

test('mute, hide and inactive display stop all new voices and preserve opt-in',async()=>{
  for(const mode of ['mute','hidden','inactive','expired']){
    const {audio,context,setHidden}=audioHarness(),bird=answeredBird(),reply=distantReply(bird.pending);await audio.toggle();
    audio.update(1,0,display(bird));bird.pending=null;
    context.currentTime=4;
    const cottage=movingWindow();cottage.pending.motionStart=reply.start;cottage.pending.end=reply.start+4000;
    const frame={...display(bird,reply.start-100),cottage,cottageActive:true,validUntil:30000};
    audio.update(1,0,frame);assert.equal(audio.replyNodes.size,2);assert.equal(audio.cottageNodes.size,1);
    if(mode==='mute')await audio.toggle();
    else if(mode==='hidden'){setHidden(true);await audio.visibility();}
    else audio.update(1,0,{...frame,...(mode==='expired'?{validUntil:frame.now}:{active:false})});
    assert.equal(audio.replyNodes.size,0,mode);assert.equal(audio.cottageNodes.size,0,mode);
    if(audio.enabled)await audio.toggle();
  }
});

test('a renderer disappearing before the call sounds cannot leave a distant answer',async()=>{
  const {audio,context}=audioHarness(),bird=answeredBird(),reply=distantReply(bird.pending);await audio.toggle();
  audio.update(1,0,display(bird));assert.ok(audio.pendingReply);
  context.currentTime=.05;
  audio.update(1,0,{...display(bird,5850),birdActive:false});assert.equal(audio.pendingReply,null);
  context.currentTime=4;bird.pending=null;
  audio.update(1,0,{...display(bird,reply.start-100),validUntil:30000});assert.equal(audio.replyNodes.size,0);
  await audio.toggle();
});

test('a shortened snapshot lease cancels a queued distant answer',async()=>{
  const {audio,context}=audioHarness(),bird=answeredBird(),reply=distantReply(bird.pending);await audio.toggle();
  audio.update(1,0,display(bird));context.currentTime=4;bird.pending=null;
  const frame={...display(bird,reply.start-100),validUntil:30000};audio.update(1,0,frame);
  assert.equal(audio.replyNodes.size,2);
  audio.update(1,0,{...frame,validUntil:reply.start+50});assert.equal(audio.replyNodes.size,0);
  audio.update(1,0,frame);assert.equal(audio.replyNodes.size,0);
  await audio.toggle();
});

test('a rejected resume releases the transition without starting a phrase', async () => {
  const { audio, context, oscillators } = audioHarness();
  context.resume = async () => { throw new Error('Audio was blocked'); };
  await assert.rejects(audio.toggle(), /blocked/);
  assert.equal(audio.enabled, false);
  assert.equal(oscillators.length, 0);
  context.resume = async () => { context.state = 'running'; };
  assert.equal(await audio.toggle(), true);
  assert.equal(oscillators.length, 0);
  await audio.toggle();
});

test('master gain replaces old automation and rate-limits changing weather updates', async () => {
  const { audio, context, gain } = audioHarness();
  await audio.toggle();
  gain.value = .08;
  audio.update(1, 0);
  assert.equal(gain.events[0].value, .08, 'the current audible gain survives cancellation');
  const firstTargets = gain.targets;
  for (let frame = 1; frame <= 1800; frame++) {
    context.currentTime = frame / 30;
    audio.update(1, (Math.sin(frame / 80) + 1) / 2);
    assert.ok(gain.events.length <= 2, 'automation history stays bounded');
  }
  assert.ok(gain.targets - firstTargets <= 120, 'no more than two targets per second');
  await audio.toggle();
});

test('unchanged weather and suspended audio add no repeated automation events', async () => {
  const { audio, context, gain, setHidden } = audioHarness();
  await audio.toggle();
  audio.update(1, .5);
  for (let second = 1; second <= 60; second++) { context.currentTime = second; audio.update(1, .5); }
  assert.equal(gain.targets, 1);
  setHidden(true);
  await audio.visibility();
  for (let frame = 0; frame < 1000; frame++) audio.update(1, frame % 2);
  assert.equal(gain.targets, 1, 'frozen AudioContext time must not collect events');
  setHidden(false);
  await audio.visibility();
  context.currentTime++;
  audio.update(1, 1);
  assert.equal(gain.targets, 2);
  await audio.toggle();
  context.currentTime++;
  audio.update(1, 0);
  assert.equal(gain.targets, 2);
});

test('hiding the page during resume suspends audio after the pending toggle', async () => {
  const { audio, context, setHidden, oscillators } = audioHarness();
  const resumed = deferred();
  context.resume = async () => { await resumed.promise; context.state = 'running'; };
  const enabling = audio.toggle();
  setHidden(true);
  const visibility = audio.visibility();
  resumed.resolve();
  await Promise.all([enabling, visibility]);
  assert.equal(context.state, 'suspended');
  assert.equal(oscillators.length, 0);
  await audio.toggle();
  assert.equal(oscillators.length, 0);
});

function callingBird(id='phrase-1'){
  const bird=createBirdState(0,false);bird.locationId='oak-perch';
  bird.pending={id,actor:BIRD_ID,rulesVersion:1,kind:'call',from:'oak-perch',to:'oak-perch',start:1000,phraseStart:6000,end:6600,phaseSeed:0,phrase:'oak-phrase-1'};
  return bird;
}
const display=(bird,now=5800)=>({bird,now,active:true,validUntil:6600});

test('shared phrases use bounded look-ahead and deduplicate identical HTTP/SSE actions',async()=>{
  const {audio,context,oscillators}=audioHarness(),bird=callingBird(),before=structuredClone(bird);
  await audio.toggle();context.currentTime=10;
  audio.update(1,0,display(bird,5000));assert.equal(oscillators.length,0);
  audio.update(1,0,display(bird));assert.equal(oscillators.length,3);
  assert.deepEqual(oscillators.map(o=>o.starts[0]),[10.2,10.33,10.459999999999999]);
  for(let i=0;i<100;i++)audio.update(1,0,display(structuredClone(bird),5900));
  assert.equal(oscillators.length,3);assert.deepEqual(bird,before);
  for(const oscillator of oscillators)oscillator.onended();
  assert.equal(audio.phraseNodes.size,0);await audio.toggle();
});

test('two enabled clients map the same phrase to shared time despite different audio clocks',async()=>{
  const a=audioHarness(),b=audioHarness(),bird=callingBird();
  await a.audio.toggle();await b.audio.toggle();a.context.currentTime=10;b.context.currentTime=17;
  a.audio.update(1,0,display(bird,5800));b.audio.update(1,0,display(bird,5900));
  const worldA=5800+(a.oscillators[0].starts[0]-10)*1000,worldB=5900+(b.oscillators[0].starts[0]-17)*1000;
  assert.ok(Math.abs(worldA-worldB)<.001);assert.ok(Math.abs(worldA-6000)<.001);
  await a.audio.toggle();await b.audio.toggle();
});

test('phrase cleanup runs once across natural completion, cancellation, and late ended events',async()=>{
  const {audio}=audioHarness();await audio.toggle();
  audio.update(1,0,display(callingBird()));
  const voices=[...audio.phraseNodes],ended=voices.map(({osc})=>osc.onended),disconnects=[];
  for(const [i,{osc,gain}]of voices.entries()){
    osc.disconnect=()=>{disconnects.push(`osc-${i}`);if(i===1)throw new Error('Node already disconnected');};
    gain.disconnect=()=>{disconnects.push(`gain-${i}`);};
  }
  ended[0]();assert.equal(audio.phraseNodes.size,2);
  voices[1].osc.stop=()=>{assert.equal(voices[1].osc.onended,null);throw new Error('Already stopped');};
  audio.hold();audio.hold();
  for(const end of ended)end();
  assert.equal(audio.phraseNodes.size,0);
  assert.ok(voices.every(({osc})=>osc.onended===null));
  assert.deepEqual(disconnects,['osc-0','gain-0','osc-1','gain-1','osc-2','gain-2']);
  await audio.toggle();
});

test('mute, pause, study, hidden tabs, and invalid leases cancel queued sound without replay',async()=>{
  for(const mode of ['mute','pause','study','hidden','lease','boundary','unavailable']){
    const {audio,oscillators,setHidden}=audioHarness(),bird=callingBird();await audio.toggle();
    audio.update(1,0,display(bird));assert.equal(audio.phraseNodes.size,3);
    if(mode==='mute')await audio.toggle();
    else if(mode==='hidden'){setHidden(true);await audio.visibility();}
    else audio.update(1,0,{...display(bird),...(mode==='lease'?{validUntil:6100}:{active:false})});
    assert.equal(audio.phraseNodes.size,0,mode);assert.ok(oscillators.every(o=>o.stops.length===2),mode);
    if(mode==='mute')await audio.toggle();
    if(mode==='hidden'){setHidden(false);await audio.visibility();}
    audio.update(1,0,display(bird,5900));assert.equal(oscillators.length,3,`${mode} must not replay a canceled phrase`);
    await audio.toggle();
  }
});

test('late opt-in skips missed phrases and malformed bird state cannot create sound',async()=>{
  const {audio,oscillators}=audioHarness();await audio.toggle();
  audio.update(1,0,display(callingBird(),6001));assert.equal(oscillators.length,0);
  audio.update(1,0,display(callingBird(),5900));assert.equal(oscillators.length,0);
  const invalid=callingBird('bad');invalid.pending.phraseStart=NaN;
  audio.update(1,0,display(invalid));assert.equal(oscillators.length,0);
  audio.update(1,0,display(callingBird('next')));assert.equal(oscillators.length,3);
  await audio.toggle();
});
