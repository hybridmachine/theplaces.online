import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4177',directory=process.env.SOUND_VALIDATION_DIR||'docs/sound-validation';
await mkdir(directory,{recursive:true});
const results=[],errors=[],check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required'],...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
  const p=await browser.newPage({viewport:{width:1280,height:800}});p.on('pageerror',error=>errors.push(error.message));
  await p.addInitScript(()=>{
    window.__contexts=[];const Native=window.AudioContext;
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);this.__gains=[];this.__starts=[];window.__contexts.push(this);}
      createGain(){const gain=super.createGain();this.__gains.push(gain);return gain;}
      createOscillator(){const osc=super.createOscillator(),start=osc.start.bind(osc);osc.start=at=>{this.__starts.push(at);return start(at);};return osc;}
    };
  });
  await p.goto(`${base}/dev/sound-study.html`);
  check('Study loads with sound off and no audio context',await p.evaluate(()=>__contexts.length===0&&document.querySelector('#listen').getAttribute('aria-pressed')==='false'));
  await p.screenshot({path:`${directory}/listening-study.png`});
  await p.locator('#listen').click();await p.waitForFunction(()=>document.querySelector('#listen').getAttribute('aria-pressed')==='true');
  check('Explicit Listen starts native audio',await p.evaluate(()=>__contexts.at(-1).state==='running'));
  await p.locator('#listen').click();
  check('Stop closes the context and restores the selector',await p.evaluate(()=>__contexts.at(-1).state==='closed'&&!document.querySelector('#scene').disabled));
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:`${directory}/listening-portrait.png`});
  check('Listening controls fit a narrow viewport',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const [name,seconds,voices]of [['lake',8,5],['breeze',4,0],['cottage',4,1],['rain',2,0]]){
    await p.locator('#scene').selectOption(name);await p.locator('#listen').click();
    await p.waitForFunction(()=>document.querySelector('#listen').getAttribute('aria-pressed')==='true');
    const played=await p.evaluate(async seconds=>{
      const ctx=__contexts.at(-1),analyser=ctx.createAnalyser();analyser.fftSize=2048;ctx.__gains[0].connect(analyser);
      const pcm=new Float32Array(analyser.fftSize);let peak=0;
      const interval=setInterval(()=>{analyser.getFloatTimeDomainData(pcm);for(const value of pcm)peak=Math.max(peak,Math.abs(value));},20);
      await new Promise(resolve=>setTimeout(resolve,seconds*1000));clearInterval(interval);ctx.__gains[0].disconnect(analyser);
      return {peak,voices:ctx.__starts.length,context:ctx.state};
    },seconds);
    check(`Actual ${name} study emits its selected sound`,played.peak>.003&&played.voices===voices&&played.context==='running',played);
    await p.locator('#listen').click();
  }
  check('All four studies can start and stop without accumulating contexts',await p.evaluate(()=>__contexts.length===5&&__contexts.every(ctx=>ctx.state==='closed')));
  const native=await p.evaluate(async()=>{
    const {Ambience}=await import('/sound.js'),{soundStudyFrame}=await import('/dev/sound-fixtures.js'),{distantReply}=await import('/ambient-score.js');
    const audio=new Ambience(),sample=soundStudyFrame('lake',1.8),reply=distantReply(sample.display.bird.pending);
    try{
      await audio.toggle();audio.update(sample.light,sample.rain,sample.display);
      const called=audio.phraseNodes.size===3;
      await new Promise(resolve=>setTimeout(resolve,750));
      const after=soundStudyFrame('lake',(reply.start-100-4000)/1000);
      audio.update(after.light,after.rain,after.display);const answered=audio.replyNodes.size===2;
      const cottage=soundStudyFrame('cottage',1.8);audio.update(cottage.light,cottage.rain,cottage.display);
      const creaked=audio.cottageNodes.size===1;
      const voices=[...audio.replyNodes,...audio.cottageNodes];audio.hold();
      const canceled=audio.phraseNodes.size===0&&audio.replyNodes.size===0&&audio.cottageNodes.size===0&&voices.every(voice=>voice.osc.onended===null);
      return {called,answered,creaked,canceled};
    }finally{audio.hold();await audio.context?.close();}
  });check('Native Web Audio schedules and cancels calls, replies and casement',Object.values(native).every(Boolean),native);

  // Render the production synth through a real OfflineAudioContext. Suspend at
  // short intervals so gain replacement happens after earlier samples render,
  // exactly as in live playback. Only the context clock adapter is test-only.
  const rendered=await p.evaluate(async()=>{
    const {Ambience}=await import('/sound.js'),{soundStudyFrame}=await import('/dev/sound-fixtures.js');
    const rate=24000,seconds=20,ctx=new OfflineAudioContext(2,rate*seconds,rate);
    const wrapper=new Proxy(ctx,{get(target,key){if(key==='state')return 'running';if(key==='resume'||key==='suspend')return async()=>{};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    const audio=new Ambience({createContext:()=>wrapper,isHidden:()=>false});await audio.toggle();
    let maxRustle=0,callVoices=0,replyVoices=0,cottageVoices=0;
    const tick=()=>{
      const elapsed=ctx.currentTime,sample=soundStudyFrame('lake',elapsed,{background:true}),cottage=soundStudyFrame('cottage',elapsed-8).display.cottage;
      if(cottage.pending){cottage.pending.start+=8000;cottage.pending.motionStart+=8000;cottage.pending.end+=8000;}
      sample.display.cottage=cottage;audio.update(sample.light,sample.rain,sample.display);
      maxRustle=Math.max(maxRustle,audio.rustleTarget);callVoices=Math.max(callVoices,audio.phraseNodes.size);replyVoices=Math.max(replyVoices,audio.replyNodes.size);cottageVoices=Math.max(cottageVoices,audio.cottageNodes.size);
    };
    tick();const ticks=[];
    for(let i=1;i<seconds*10;i++)ticks.push(ctx.suspend(i/10).then(()=>{tick();return ctx.resume();}));
    const buffer=await ctx.startRendering();await Promise.all(ticks);
    const left=buffer.getChannelData(0),right=buffer.getChannelData(1);let peak=0,squares=0,difference=0,finite=true;
    const bytes=new ArrayBuffer(44+left.length*4),view=new DataView(bytes),text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,rate,true);view.setUint32(28,rate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,left.length*4,true);
    for(let i=0;i<left.length;i++){
      finite&&=Number.isFinite(left[i])&&Number.isFinite(right[i]);peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));squares+=left[i]**2+right[i]**2;difference+=Math.abs(left[i]-right[i]);
      view.setInt16(44+i*4,Math.round(Math.max(-1,Math.min(1,left[i]))*32767),true);view.setInt16(46+i*4,Math.round(Math.max(-1,Math.min(1,right[i]))*32767),true);
    }
    let binary='';const data=new Uint8Array(bytes);for(let i=0;i<data.length;i+=16384)binary+=String.fromCharCode(...data.subarray(i,i+16384));
    audio.hold();return {wav:btoa(binary),metrics:{peak,rms:Math.sqrt(squares/(left.length*2)),stereoDifference:difference/left.length,finite,maxRustle,callVoices,replyVoices,cottageVoices,seconds,rate}};
  });
  await writeFile(`${directory}/sound-study.wav`,Buffer.from(rendered.wav,'base64'));
  const m=rendered.metrics;check('20-second production synthesis is finite, quiet and unclipped',m.finite&&m.peak>.005&&m.peak<.2&&m.rms>.001,m);
  check('Rendered study contains leaf swells, a call, an answer and a casement',m.maxRustle>.01&&m.callVoices===3&&m.replyVoices===2&&m.cottageVoices===1&&m.stereoDifference>0,m);

  const mixChecks=await p.evaluate(async()=>{
    const {measureSoundMix,soundMixChecks}=await import('/dev/sound-mix-check.js');
    return soundMixChecks(await measureSoundMix());
  });
  for(const result of mixChecks)check(result.name,result.pass,result.detail);
  // Expose only references for this test response; production app.js is unchanged.
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  await p.route('**/app.js',route=>route.fulfill({contentType:'text/javascript',body:source+'\nwindow.__soundApp={audio,painter}; const originalUpdate=audio.update.bind(audio); audio.update=(light,rain,display)=>{window.__soundFrame=display;return originalUpdate(light,rain,display);};'}));
  await p.route('https://fonts.googleapis.com/**',route=>route.abort());
  await p.goto(base);await p.waitForFunction(()=>window.__soundFrame);
  check('Painting stays opt-in and passes shared sound inputs',await p.evaluate(()=>!__soundApp.audio.context&&Number.isFinite(__soundFrame.epoch)&&!!__soundFrame.cottage&&typeof __soundFrame.birdActive==='boolean'&&typeof __soundFrame.cottageActive==='boolean'));
  await p.locator('#sound-button').click();await p.waitForFunction(()=>window.__soundApp.audio.enabled);
  await p.locator('#pause-button').click();await p.waitForFunction(()=>!window.__soundFrame.active);
  check('Pausing suppresses additions and retains the existing water bed',await p.evaluate(()=>__soundApp.audio.enabled&&__soundApp.audio.rustleTarget===0&&__soundApp.audio.context.state==='running'));
  await p.locator('#pause-button').click();await p.locator('#about-button').click();await p.locator('[data-light="day"]').click();
  await p.waitForFunction(()=>!window.__soundFrame.active);
  check('Private light studies suppress shared sound actions',await p.evaluate(()=>__soundApp.audio.replyNodes.size===0&&__soundApp.audio.cottageNodes.size===0&&__soundApp.audio.rustleTarget===0));
  await p.locator('#return-live').click();await p.emulateMedia({reducedMotion:'reduce'});
  await p.waitForFunction(()=>!window.__soundFrame.cottageActive);
  check('Reduced motion suppresses creaks for a held casement',await p.evaluate(()=>!__soundFrame.cottageActive));
  await p.locator('#sound-button').click();check('Painting mute suspends audio',await p.evaluate(()=>!__soundApp.audio.enabled&&__soundApp.audio.context.state==='suspended'));
  check('No uncaught browser errors',errors.length===0,errors);
  await writeFile(`${directory}/browser-results.json`,JSON.stringify({results},null,2)+'\n');
  if(results.some(result=>!result.pass))process.exitCode=1;
}finally{await browser.close();}
