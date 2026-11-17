import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {WorldStore} from '../src/store.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const directory=process.env.COINCIDENCE_VALIDATION_DIR||'docs/coincidences-validation';await mkdir(directory,{recursive:true});
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4181';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),
  ...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}: {})});
const results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
try{
  const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/dev/sky-study.html`);await page.waitForFunction(()=>window.skyStudy?.ready);
  await page.evaluate(async()=>{await Promise.all([skyStudy.painter.foliageTask,skyStudy.painter.weatherTask,skyStudy.painter.cottageTask]);document.querySelector('aside').classList.add('hidden');skyStudy.fixture('Quiet ripple');});
  const footprint=await page.evaluate(()=>{
    const s=skyStudy,p=s.painter,gl=p.gl,w=gl.canvas.width,h=gl.canvas.height;
    const capture=()=>{s.render();const b=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
    const checks=[];
    for(const location of Object.keys(p.scene.coincidences.locations))for(const hour of [0,5,12,19.5]){
      s.state.hour=hour;s.state.rippleLocation='';const baseline=capture();
      for(const seconds of [0,1,4,7,10]){
        s.state.rippleLocation=location;s.state.rippleTime=seconds;const pixels=capture(),art=p.scene.coincidences.locations[location];
        let changed=0,outside=0,maxDifference=0;
        for(let i=0;i<pixels.length;i+=4){let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(pixels[i+c]-baseline[i+c]));
          if(!d)continue;changed++;maxDifference=Math.max(d,maxDifference);
          const x=i/4%w,y=h-1-Math.floor(i/4/w);
          if(Math.abs(x-art.center[0])>art.radius[0]+2||Math.abs(y-art.center[1])>art.radius[1]+2)outside++;
        }
        checks.push({location,hour,seconds,changed,outside,maxDifference,error:gl.getError()});
      }
    }
    return checks;
  });
  check('Ripples never alter pixels beyond approved water footprints',footprint.every(c=>!c.outside&&!c.error),footprint);
  check('Start/end frames exactly match the undisturbed painting',footprint.filter(c=>c.seconds===0||c.seconds===10).every(c=>c.changed===0));
  check('Every location has a readable but bounded daylight disturbance',footprint.filter(c=>c.hour===12&&c.seconds===4).every(c=>c.changed>20&&c.maxDifference<35));
  for(const [name,fixture]of [['ripple-day','Quiet ripple'],['ripple-dusk','Ripple at dusk'],['ripple-rain','Ripple in rain']]){
    await page.evaluate(fixture=>skyStudy.fixture(fixture),fixture);await page.screenshot({path:`${directory}/${name}.png`});
  }
  await page.evaluate(()=>{skyStudy.fixture('Quiet ripple');skyStudy.state.rippleGuides=true;skyStudy.render();});
  await page.screenshot({path:`${directory}/locations.png`});
  const modes=await page.evaluate(()=>{
    const s=skyStudy,p=s.painter;s.state.rippleGuides=false;s.fixture('Quiet ripple');
    const pixels=()=>{s.render();const b=new Uint8Array(p.canvas.width*p.canvas.height*4);p.gl.readPixels(0,0,p.canvas.width,p.canvas.height,p.gl.RGBA,p.gl.UNSIGNED_BYTE,b);return b;};
    const same=(a,b)=>a.every((v,i)=>v===b[i]);
    const active=pixels(),paused=same(active,pixels());
    p.motionChanged({matches:true});s.render();const reduced=!p.coincidenceActive;
    p.motionChanged({matches:false});const resumed=same(active,pixels());
    const draw=p.gl.drawArrays;
    p.gl.drawArrays=function(...args){if(this.getParameter(this.CURRENT_PROGRAM)===p.renderer.rippleProgram){p.gl.drawArrays=draw;throw new Error('Injected optional draw failure');}return draw.apply(this,args);};
    s.render();const fallback=!p.coincidenceActive&&p.ready&&!!p.weatherRenderer&&!!p.cottageRenderer&&!!p.foliageRenderer;
    p.renderer.rippleFailure=null;s.render();
    const art=p.scene.coincidences;p.scene.coincidences={...art,version:99};s.render();const invalidArt=!p.coincidenceActive&&p.ready;p.scene.coincidences=art;s.render();
    return {paused,reduced,resumed,fallback,invalidArt};
  });for(const [name,pass]of Object.entries(modes))check(`Ripple display: ${name}`,pass);
  const compileFailure=await page.evaluate(async()=>{
    const {SkyRenderer,loadSkyAssets}=await import('/sky-renderer.js'),p=skyStudy.painter,gl=p.gl;
    const images=await loadSkyAssets(p.scene),renderer=new SkyRenderer(gl,p.scene,images),source=gl.shaderSource;
    try{
      gl.shaderSource=function(shader,text){return source.call(this,shader,text.includes('rippleBounds')?'invalid optional shader':text);};
      renderer.draw({...skyStudy.conditions(),realSeconds:12,ripple:{center:[934,681],radius:[28,8],age:.4,variation:1}});
      return {failed:!!renderer.rippleFailure,baseline:!renderer.rippleActive&&gl.isProgram(renderer.program)&&gl.getError()===0};
    }finally{gl.shaderSource=source;renderer.dispose();skyStudy.render();}
  });check('Optional shader compile failure still renders the baseline sky',compileFailure.failed&&compileFailure.baseline,compileFailure);
  await page.setViewportSize({width:390,height:844});
  for(const pan of [.38,1]){
    await page.evaluate(pan=>{skyStudy.painter.pan=pan;skyStudy.painter.updateCrop();skyStudy.fixture('Quiet ripple');},pan);
    await page.screenshot({path:`${directory}/portrait-${pan===1?'lake':'default'}.png`});
  }
  await page.setViewportSize({width:1672,height:941});
  await page.evaluate(()=>{skyStudy.painter.pan=.38;skyStudy.painter.updateCrop();skyStudy.fixture('Quiet ripple');});
  const restoration=await page.evaluate(async()=>{
    const p=skyStudy.painter,extension=p.gl.getExtension('WEBGL_lose_context');extension.loseContext();await new Promise(r=>setTimeout(r,100));skyStudy.render();
    const held=!p.coincidenceActive&&!p.ready;extension.restoreContext();
    for(let i=0;i<200&&!p.ready;i++)await new Promise(r=>setTimeout(r,25));
    await Promise.all([p.foliageTask,p.weatherTask,p.cottageTask]);skyStudy.render();
    return {held,restored:p.coincidenceActive&&p.ready&&p.gl.getError()===0};
  });check('Context loss omits the ripple and restoration samples the displayed phase',restoration.held&&restoration.restored,restoration);
  const performance=await page.evaluate(async()=>{
    const s=skyStudy,p=s.painter;
    async function measure(location){s.state.rippleLocation=location;s.render();const samples=[];
      for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);const start=globalThis.performance.now();s.render();p.gl.finish();samples.push(globalThis.performance.now()-start);}
      samples.sort((a,b)=>a-b);return {median:samples[22],p95:samples[42]};}
    const baseline=await measure(''),ripple=await measure('shore-reflection');
    return {baseline,ripple,textures:p.renderer.textures.length,staticUploads:p.renderer.stats.staticUploads};
  });check('Optional ripple uses the existing seven sky textures',performance.textures===7,performance);
  const epoch=1_800_000_000_000,store=new WorldStore(':memory:',epoch);
  let active,ended;
  try{
    for(let t=epoch+60000;t<epoch+86400000;t+=60000){const snap=store.snapshot(t);if(snap.world.coincidences.pending){active=store.snapshot(t+3000);ended=store.snapshot(snap.world.coincidences.pending.end+1000);break;}}
  }finally{store.close();}
  if(!active)throw new Error('No live ripple fixture');
  let response=active;
  const a=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1}),b=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
  for(const visitor of [a,b]){
    visitor.on('pageerror',e=>errors.push(e.message));
    await visitor.addInitScript(()=>Object.defineProperty(performance,'now',{value:()=>10000}));
    await visitor.route('https://fonts.googleapis.com/**',route=>route.abort());
    await visitor.route('**/api/world',route=>route.fulfill({json:response}));await visitor.route('**/api/stream',route=>route.abort());
    await visitor.goto(`${base}/?space=0`);await visitor.waitForFunction(()=>document.querySelector('#scene-description').textContent.includes('small ripple'));
  }
  const capture={animations:'disabled',style:'.chrome, #toast, #welcome { visibility: hidden !important; }'};
  const pixels=visitor=>visitor.locator('#painting').screenshot(capture);
  check('Two visitors show identical committed ripple pixels',(await pixels(a)).equals(await pixels(b)));
  const unread=await a.locator('#note-dot').isVisible();
  await a.locator('#pause-button').click();const paused=await pixels(a),text=await a.locator('#scene-description').textContent();
  response=ended;await a.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await a.waitForTimeout(200);
  check('Pause preserves the ripple and its description after shared completion',paused.equals(await pixels(a))&&text===await a.locator('#scene-description').textContent());
  check('Hidden coincidence commits do not change the unread indicator',unread===await a.locator('#note-dot').isVisible());
  await a.locator('#pause-button').click();await a.waitForFunction(()=>!document.querySelector('#scene-description').textContent.includes('small ripple'));
  check('Resume skips the completed episode',!paused.equals(await pixels(a)));
  await b.locator('#about-button').click();await b.locator('[data-light="day"]').click();
  check('Private studies omit the live coincidence',!(await b.locator('#scene-description').textContent()).includes('small ripple'));
  await b.locator('#return-live').click();await b.waitForFunction(()=>document.querySelector('#scene-description').textContent.includes('small ripple'));
  await b.emulateMedia({reducedMotion:'reduce'});await b.waitForFunction(()=>!document.querySelector('#scene-description').textContent.includes('small ripple'));
  check('Reduced-motion visitors receive no moving-ripple description',!(await b.locator('#scene-description').textContent()).includes('small ripple'));
  await a.close();await b.close();
  if(process.env.COINCIDENCE_RECORD==='1'){
    const recorded=await browser.newPage({viewport:{width:1440,height:810},recordVideo:{dir:directory,size:{width:1440,height:810}}});
    await recorded.goto(`${base}/dev/sky-study.html?fixture=Quiet%20ripple`);await recorded.waitForFunction(()=>window.skyStudy?.ready);
    await recorded.evaluate(async()=>{
      const s=skyStudy;await Promise.all([s.painter.foliageTask,s.painter.weatherTask,s.painter.cottageTask]);
      document.querySelector('aside').classList.add('hidden');s.fixture('Quiet ripple');s.state.rippleTime=0;s.state.ripplePlaying=true;s.state.playing=true;
    });
    await recorded.waitForTimeout(12_000);const video=recorded.video();await recorded.close();await video.saveAs(`${directory}/ripple-real-speed.webm`);await video.delete();
  }
  check('No browser exceptions',errors.length===0,errors);
}finally{await browser.close();await writeFile(`${directory}/browser-results.json`,JSON.stringify({results,errors},null,2)+'\n');}
if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
