import {createRequire} from 'node:module';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D,cabinFrame,cabinFront,doorPosition,openingCentre,oakPlan} from '../shared/lakeside-dressing.js';
import {lifeLayout,birdPlace} from '../shared/lakeside-life.js';
import {terrainHeight} from '../shared/space.js';
import {eyePosition} from '../shared/walker.js';
import {birdFixture,createBirdState,birdProgress} from '../shared/bird.js';
import {coincidenceFixture} from '../shared/coincidences.js';
import {doorOutward} from '../shared/threshold.js';
import {LAKESIDE_INTERIOR as I} from '../shared/lakeside-interior.js';
import {viewOpenings,screenRect} from '../shared/window-views.js';
import {roomLamps,DIALS} from '../shared/interior-light.js';
import {calendar,weather} from '../shared/world.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const directory=process.env.SPACE_VALIDATION_DIR||'docs/space-validation';await mkdir(directory,{recursive:true});
const interiorDirectory=process.env.INTERIOR_VALIDATION_DIR||'docs/interior-validation';let interiorFrom=null,noonDir=null;const noonChildren=[];
// The clear-noon server (check 52) and its temporary directory are stopped on every way out: the run's end, an error, Ctrl-C and a kill.
const stopNoon=()=>{for(const c of noonChildren)if(c.exitCode===null)c.kill();noonChildren.length=0;if(noonDir){rmSync(noonDir,{recursive:true,force:true});noonDir=null;}};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopNoon();process.exit(1);});
process.on('exit',stopNoon);
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4190';
// Headless Chromium's default SwiftShader draws this scene at under 10 fps, below the walker's 0.1 s step cap, so the
// walking checks would measure the software rasteriser. ANGLE uses the machine's GPU where one is available.
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),
  args:process.env.SKY_GPU==='metal'?['--enable-gpu','--use-gl=angle','--use-angle=metal']:['--use-gl=angle']});
const results=[],errors=[],viewport={width:1672,height:941};
// Checks are numbered in the order they run; the number is kept in the results, matching the comments below.
const check=(name,pass,detail)=>{const n=results.length+1;results.push({n,name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${n}. ${name}`);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Each visitor gets a fresh context, so its localStorage starts empty.
// page.own: its page errors; page.consoleErrors: console errors other than a resource that failed to load (a check that
// aborts a request expects that one).
async function visitor(size=viewport,init,options={}){
  const context=await browser.newContext({viewport:size,deviceScaleFactor:1,...options});if(init)await context.addInitScript(init);
  const page=await context.newPage();const own=[],consoleErrors=[];page.on('pageerror',e=>{own.push(e.message);errors.push(e.message);});
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))consoleErrors.push(m.text());});
  await context.route('https://fonts.googleapis.com/**',route=>route.abort());page.own=own;page.consoleErrors=consoleErrors;return page;
}
// Draws one frame now (through the painterly pass where the tier has it) and reads pixels back from the canvas before it
// is presented. points: [[x, y], ...] in CSS pixels from the top left. Returns [r, g, b, a] per point and the backing size.
const drawAndRead=(page,points)=>page.evaluate(points=>{const s=window.__space,g=s.renderer.getContext();
  if(s.passMode==='off'||!s.pass)s.renderer.render(s.scene,s.camera);else s.pass.render(s.scene,s.camera);
  const k=g.drawingBufferWidth/innerWidth,read=([x,y])=>{const b=new Uint8Array(4);g.readPixels(Math.round(x*k),Math.round(g.drawingBufferHeight-1-y*k),1,1,g.RGBA,g.UNSIGNED_BYTE,b);return [...b];};
  return {pixels:points.map(read),width:g.drawingBufferWidth,height:g.drawingBufferHeight};},points);
const luminance=([r,g,b])=>(.2126*r+.7152*g+.0722*b)/255;
const differ=(a,b)=>a.some((v,i)=>Math.abs(v-b[i])>2);
// Presses a light-study button until it takes (the buttons do nothing until the first world snapshot has arrived).
const studyLight=(page,name)=>page.waitForFunction(s=>{const b=document.querySelector(`[data-light="${s}"]`);b.click();return b.getAttribute('aria-pressed')==='true';},name,{timeout:15_000,polling:250});
// Poses and pixels for the living things. A pose is {position, yaw, pitch}; lookFrom aims the eye at a world point [x, y, z].
const lookFrom=(position,target)=>{const e=eyePosition(S,{position}),dx=target[0]-e[0],dy=target[1]-e[1];
  return {position:[...position],yaw:Math.atan2(dx,dy),pitch:Math.atan2(target[2]-e[2],Math.hypot(dx,dy))};};
const setPose=(page,pose)=>page.evaluate(p=>{window.__space.state=p;},pose);
const setFixture=(page,fixture)=>page.evaluate(f=>{window.__space.fixture=f;},fixture);
// World points [x, y, z] → CSS pixels through the camera as it now stands (world → three is (x, z, −y)).
const project=(page,points)=>page.evaluate(points=>{const c=window.__space.camera;c.updateMatrixWorld();
  const e=c.matrixWorldInverse.elements,p=c.projectionMatrix.elements,m=(M,a)=>[0,1,2,3].map(r=>M[r]*a[0]+M[r+4]*a[1]+M[r+8]*a[2]+M[r+12]*a[3]);
  return points.map(([x,y,z])=>{const q=m(p,m(e,[x,z,-y,1]));return [(q[0]/q[3]+1)/2*innerWidth,(1-q[1]/q[3])/2*innerHeight];});},points);
// The living things are looked at in 1440 × 810 windows.
const SHOT={width:1440,height:810};
const onScreen=([x,y],margin=0)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=margin&&y>=margin&&x<=SHOT.width-margin&&y<=SHOT.height-margin;
// Draws one frame and reads a square of pixels (side 2·half+1) round each CSS-pixel centre. With `hide` (names of objects in the
// scene) it draws again with them hidden, in the same call so the world has not moved, and returns that too; with `unripple` the
// lake's ring is taken away for the second draw (the next frame puts it back).
const patchRead=(page,centres,half,{hide=[],unripple=false}={})=>page.evaluate(({centres,half,hide,unripple})=>{
  const s=window.__space,g=s.renderer.getContext(),W=g.drawingBufferWidth,H=g.drawingBufferHeight,k=W/innerWidth;
  const draw=()=>{if(s.passMode==='off'||!s.pass)s.renderer.render(s.scene,s.camera);else s.pass.render(s.scene,s.camera);};
  const read=()=>centres.map(([cx,cy])=>{const x0=Math.max(0,Math.round(cx*k)-half),y0=Math.max(0,Math.round(H-1-cy*k)-half),w=Math.min(W-x0,2*half+1),h=Math.min(H-y0,2*half+1);
    if(w<=0||h<=0)return null;const b=new Uint8Array(w*h*4);g.readPixels(x0,y0,w,h,g.RGBA,g.UNSIGNED_BYTE,b);return [...b];});
  draw();const on=read();let off=null;
  if(hide.length||unripple){const objects=hide.map(n=>s.scene.getObjectByName(n)).filter(Boolean),was=objects.map(o=>o.visible);
    objects.forEach(o=>{o.visible=false;});if(unripple)s.yard.setRipple(null);draw();off=read();objects.forEach((o,i)=>{o.visible=was[i];});}
  return {on,off,found:hide.map(n=>!!s.scene.getObjectByName(n))};},{centres,half,hide,unripple});
// How many pixels of two patches differ by more than 2 in any channel, and of how many.
const changed=(a,b)=>{if(!a||!b)return {n:0,of:0};let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])>2||Math.abs(a[i+1]-b[i+1])>2||Math.abs(a[i+2]-b[i+2])>2)n++;return {n,of:a.length/4};};
const changedAll=(as,bs)=>as.reduce((t,a,i)=>{const c=changed(a,bs[i]);return {n:t.n+c.n,of:t.of+c.of};},{n:0,of:0});
const meanRgb=a=>{const t=[0,0,0];for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)t[c]+=a[i+c];return t.map(v=>v/(a.length/4));};
const meanLuminance=patches=>patches.reduce((t,a)=>t+luminance(meanRgb(a)),0)/patches.length;
const SPACE_FILES=/three-|\/space\/|lakeside-space-v1/;
// Ready: the 3D canvas is showing, the frame loop has stepped the walker at least once, and the clouds have arrived.
const ready=page=>page.waitForFunction(()=>window.__space?.renderer&&!document.querySelector('#space').hidden&&window.__space.lastStep!==null&&window.__space.sky?.clouds.visible,null,{timeout:30_000});
const state=page=>page.evaluate(()=>structuredClone(window.__space.state));
const arrivalPose=page=>page.evaluate(async()=>structuredClone((await import('/shared/lakeside-space.js')).LAKESIDE_SPACE.arrival));
const near=(a,b,e)=>Math.abs(a.position[0]-b.position[0])<=e&&Math.abs(a.position[1]-b.position[1])<=e&&Math.abs(a.yaw-b.yaw)<=e&&Math.abs(a.pitch-b.pitch)<=e;
const shows2D=page=>page.evaluate(()=>{const visible=id=>{const e=document.querySelector(id);return !e.hidden&&getComputedStyle(e).display!=='none'&&e.getClientRects().length>0;};
  return {spaceHidden:document.querySelector('#space').hidden,painting:visible('#painting'),fallback:visible('#fallback')};});
async function hold(page,keys,ms){const start=performance.now();for(const k of keys)await page.keyboard.down(k);await wait(ms);for(const k of [...keys].reverse())await page.keyboard.up(k);return (performance.now()-start)/1000;}
try{
  // 1. ?space=0 is the painting and never asks for three.js, the 3D view's modules or its art.
  const plain=await visitor(),fetched=[];plain.on('request',r=>fetched.push(r.url()));
  await plain.goto(`${base}/?space=0`);await plain.waitForLoadState('load');await plain.waitForTimeout(2000);
  const spaceRequests=fetched.filter(u=>SPACE_FILES.test(u)),plainHidden=await plain.locator('#space').evaluate(e=>e.hidden);
  check('?space=0 requests nothing of the 3D view (three-, /space/, lakeside-space-v1) and hides #space',!spaceRequests.length&&plainHidden,{spaceRequests,spaceHidden:plainHidden,requests:fetched.length});
  await plain.context().close();

  // 2. The 3D view loads the whole art bundle as WebP, without console errors.
  const page=await visitor(),bundle=new Map();
  page.on('response',r=>{if(r.url().includes('/lakeside-space-v1/'))bundle.set(r.url().split('/').pop(),{status:r.status(),type:r.headers()['content-type']});});
  await page.goto(`${base}/?space=1&check`);await ready(page);
  const {artFiles}=await import('../shared/lakeside-space-art.js'),wanted=artFiles().map(f=>f.file);
  const bundleFiles=Object.fromEntries(wanted.map(f=>[f,bundle.get(f)??null]));
  check(`?space=1&check loads all ${wanted.length} bundle files as image/webp with status 200 and no console errors`,
    wanted.length===13&&wanted.every(f=>bundle.get(f)?.status===200&&bundle.get(f)?.type==='image/webp')&&!page.consoleErrors.length,{files:bundleFiles,consoleErrors:page.consoleErrors});

  // 3. Arrival pose.
  const arrival=await arrivalPose(page),arrived=await state(page),gl=await page.evaluate(()=>{const g=window.__space.renderer.getContext(),d=g.getExtension('WEBGL_debug_renderer_info');
    return {version:g.getParameter(g.VERSION),renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),...window.__space.renderer.info.render};});
  check('?space=1 arrives at the arrival pose',near(arrived,arrival,1e-9),{state:arrived,arrival,gl});
  await page.waitForTimeout(4000);await page.screenshot({path:`${directory}/arrival.png`});

  // 4. Two seconds of W walks east at walking pace.
  const before=await state(page),held=await hold(page,['KeyW'],2000);await page.waitForTimeout(200);const after=await state(page);
  const east=after.position[0]-before.position[0],drift=Math.abs(after.position[1]-before.position[1]);
  check('Holding W for 2 s walks 2.2–3.2 m east',east>=2.2&&east<=3.2&&drift<.01,{east,drift,heldSeconds:held,expectedAtWalkingPace:1.4*held,before,after});

  // 5. Forty seconds of Shift+W from four headings never leaves walkable ground (four visitors walk at once).
  const headings=[0,Math.PI/2,Math.PI,3*Math.PI/2];
  const walks=await Promise.all(headings.map(async yaw=>{
    const walker=await visitor();await walker.goto(`${base}/?space=1&check`);await ready(walker);
    await walker.evaluate(yaw=>{window.__space.state={...window.__space.state,yaw};},yaw);
    await walker.evaluate(async()=>{
      const [{walkable},{LAKESIDE_SPACE}]=await Promise.all([import('/shared/space.js'),import('/shared/lakeside-space.js')]);
      const samples=window.__walkSamples=[];const sample=()=>{const p=[...window.__space.state.position];samples.push({p,walkable:walkable(LAKESIDE_SPACE,p)});};
      sample();window.__walkTimer=setInterval(sample,250);
    });
    const seconds=await hold(walker,['Shift','KeyW'],40_000);
    const samples=await walker.evaluate(()=>{clearInterval(window.__walkTimer);return window.__walkSamples;});
    await walker.context().close();
    const end=samples.at(-1).p,travelled=Math.hypot(end[0]-samples[0].p[0],end[1]-samples[0].p[1]);
    return {yaw,seconds,samples:samples.length,unwalkable:samples.filter(s=>!s.walkable).map(s=>s.p),start:samples[0].p,end,travelled};
  }));
  check('Shift+W for 40 s from four headings stays on walkable ground',walks.every(w=>!w.unwalkable.length&&w.seconds>=40&&w.samples>=150&&w.travelled>1),walks);

  // 6. An open dialog holds the walker still even while W stays down (and W is shown to be live first).
  const keyStart=await state(page);await page.keyboard.down('KeyW');await page.waitForTimeout(300);const keyMoved=await state(page);
  const walkedBeforeDialog=Math.hypot(keyMoved.position[0]-keyStart.position[0],keyMoved.position[1]-keyStart.position[1]);
  await page.evaluate(()=>document.querySelector('#about-dialog').showModal());await page.waitForTimeout(100);
  const dialogStart=await state(page);await page.waitForTimeout(1000);const dialogEnd=await state(page);
  await page.keyboard.up('KeyW');await page.evaluate(()=>document.querySelector('#about-dialog').close());
  check('Opening #about-dialog while W is held stops walking',walkedBeforeDialog>.1&&near(dialogStart,dialogEnd,0),{walkedBeforeDialog,dialogStart,dialogEnd});

  // 7. Walk, turn and look, stand still, reload: the place is remembered.
  await hold(page,['KeyW','KeyE'],600);
  await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.down();await page.mouse.move(viewport.width/2-40,viewport.height/2+50,{steps:5});await page.mouse.up();
  await page.waitForTimeout(3500);
  const stopped=await state(page),stored=await page.evaluate(()=>localStorage.getItem('a-view:place:lakeside-cottage'));
  await page.reload();await ready(page);const remembered=await state(page);
  check('After 3.5 s still, a reload returns to the same place',near(stopped,remembered,1e-6)&&!near(stopped,arrival,.01)&&!!stored,{stopped,remembered,storedBeforeReload:stored&&JSON.parse(stored)});
  await page.waitForTimeout(4000);await page.screenshot({path:`${directory}/remembered.png`});

  // 8. Forget visit memory also forgets the place.
  await page.locator('#notes-button').click();await page.locator('#forget-visits').click();await page.keyboard.press('Escape');
  const afterForget=await page.evaluate(()=>localStorage.getItem('a-view:place:lakeside-cottage'));
  await page.reload();await ready(page);const forgotten=await state(page);
  check('Forget visit memory returns the next visit to the arrival pose',near(forgotten,arrival,1e-9),{state:forgotten,storedAfterForget:afterForget});
  await page.context().close();

  // 9. Forget visit memory on the painting page also forgets the place.
  const painted=await visitor();await painted.goto(`${base}/?space=1&check`);await ready(painted);
  const walkedState=await painted.evaluate(()=>{window.__space.state={...window.__space.state,position:[1,0]};return structuredClone(window.__space.state);});
  await painted.waitForFunction(()=>localStorage.getItem('a-view:place:lakeside-cottage')!==null,null,{timeout:10_000});
  const seeded=await painted.evaluate(()=>localStorage.getItem('a-view:place:lakeside-cottage'));
  await painted.goto(`${base}/?space=0`);await painted.waitForLoadState('load');
  await painted.locator('#notes-button').click();await painted.locator('#forget-visits').click();await painted.keyboard.press('Escape');
  const paintedAfterForget=await painted.evaluate(()=>localStorage.getItem('a-view:place:lakeside-cottage'));
  await painted.goto(`${base}/?space=1&check`);await ready(painted);const paintedReturn=await state(painted);
  check('Forget visit memory on the painting page forgets the place for the next 3D visit',!!seeded&&paintedAfterForget===null&&near(paintedReturn,arrival,1e-9),
    {walkedState,seeded:seeded&&JSON.parse(seeded),storedAfterForget:paintedAfterForget,state:paintedReturn});
  await painted.context().close();

  // 10. Each tier, started locked with ?tier=, draws a frame with something in it and reports that tier.
  // 11. Frame rate per tier at the arrival pose, recorded, not asserted: requestAnimationFrame callbacks over 4 s (capped by
  // the display), the scene's triangles and draw calls, and the synchronous time of one frame (drawn, then read back so the
  // GPU has finished) at 1440 × 810.
  const tiers=[],rates=[];
  for(const tier of ['full','light','plain']){
    // under the day study, so the numbers do not depend on the hour the check runs
    const t=await visitor({width:1440,height:810});await t.goto(`${base}/?space=1&check&tier=${tier}`);await ready(t);await studyLight(t,'day');
    await t.evaluate(async()=>{const {LAKESIDE_SPACE}=await import('/shared/lakeside-space.js');window.__space.state=structuredClone(LAKESIDE_SPACE.arrival);});
    await t.waitForTimeout(1500);
    const reported=await t.evaluate(()=>window.__space.tier),frame=await drawAndRead(t,[[720,405],[2,2],[360,600],[1080,300],[720,100]]);
    const blank=frame.pixels.every(p=>!differ(p,frame.pixels[0]));
    tiers.push({tier,reported,pixels:frame.pixels,blank});
    const callbacks=await t.evaluate(()=>new Promise(done=>{let n=0;const end=performance.now()+4000;const tick=now=>{n++;if(now<end)requestAnimationFrame(tick);else done(n);};requestAnimationFrame(tick);}));
    const measured=await t.evaluate(()=>{const s=window.__space,g=s.renderer.getContext(),b=new Uint8Array(4);
      s.renderer.render(s.scene,s.camera);const {triangles,calls}=s.renderer.info.render;
      const draw=()=>{if(s.passMode==='off'||!s.pass)s.renderer.render(s.scene,s.camera);else s.pass.render(s.scene,s.camera);g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,b);};
      draw();const times=[];for(let k=0;k<20;k++){const t0=performance.now();draw();times.push(performance.now()-t0);}
      times.sort((a,b)=>a-b);return {triangles,calls,frameMs:{median:+times[10].toFixed(2),fastest:+times[0].toFixed(2),slowest:+times[19].toFixed(2)},
        backing:[g.drawingBufferWidth,g.drawingBufferHeight]};});
    rates.push({tier,fps:callbacks/4,...measured});
    await t.context().close();
  }
  check('Each tier (?tier=full, light, plain) draws a non-blank frame and reports its tier',tiers.every(t=>t.reported===t.tier&&!t.blank),tiers);
  check('Frame rate per tier at the arrival pose (recorded, not asserted)',true,rates);
  for(const r of rates)console.log(`  ${r.tier}: ${r.fps} fps (display-capped), ${r.frameMs.median} ms per frame synchronously, ${r.triangles} triangles, ${r.calls} draw calls`);

  // 12. A resize to a portrait phone and back: the frame is drawn and the canvas's backing store follows the viewport.
  const turning=await visitor({width:1280,height:720});await turning.goto(`${base}/?space=1&check`);await ready(turning);
  await turning.setViewportSize({width:390,height:844});await turning.waitForTimeout(500);
  await turning.setViewportSize({width:1280,height:720});await turning.waitForTimeout(500);
  const turned=await drawAndRead(turning,[[640,360],[1,1]]),ratio=await turning.evaluate(()=>Math.min(devicePixelRatio||1,1.6));
  const canvasSize=await turning.evaluate(()=>{const c=document.querySelector('#space');return [c.width,c.height];});
  check('After resizing to 390 × 844 and back to 1280 × 720 the frame is drawn and the canvas matches the viewport × pixel ratio',
    differ(turned.pixels[0],turned.pixels[1])&&canvasSize[0]===Math.round(1280*ratio)&&canvasSize[1]===Math.round(720*ratio),{centre:turned.pixels[0],corner:turned.pixels[1],canvasSize,ratio});
  await turning.context().close();

  // 13. The windows are lit by their rooms. Under the night study, from 2.5 m in front of the door, the middle of each front window
  // is brighter than the wall beside it and warm (red above blue); from 2.5 m behind the cabin the back window, whose room is not
  // lit, is darker than the wall; under the day study the front windows are not brighter than the wall. Each sample is the mean of
  // a 9 × 9 patch, so a glazing bar does not decide it.
  const frame=cabinFrame(S,D),doorAt=doorPosition(S,D),frontOut=[Math.cos(S.cabin.yaw)*cabinFront(S),-Math.sin(S.cabin.yaw)*cabinFront(S)];
  const windowProbe=id=>{const centre=openingCentre(S,D,`window-${id}`),w=D.cabin.windows.find(x=>x.id===id),side=Math.sign(w.along)||1,reach=w.width/2+.4;
    return {id,centre,wall:[centre[0]+frame.u[0]*side*reach,centre[1]+frame.u[1]*side*reach,centre[2]]};};
  const eyeFront=[doorAt[0]+frontOut[0]*2.5,doorAt[1]+frontOut[1]*2.5];
  const backCentre=openingCentre(S,D,'window-back'),eyeBack=[backCentre[0]-frontOut[0]*2.5,backCentre[1]-frontOut[1]*2.5];
  const dark=await visitor({width:1440,height:810});await dark.goto(`${base}/?space=1&check`);await ready(dark);
  const litSample=async(probe,eye)=>{await setPose(dark,lookFrom(eye,probe.centre));await dark.waitForTimeout(1200);
    const at=await project(dark,[probe.centre,probe.wall]),read=await patchRead(dark,at,4),[glass,wall]=read.on.map(meanRgb);
    return {id:probe.id,pixel:at[0],wallPixel:at[1],inView:at.every(p=>onScreen(p,8)),glass,wall,glassLuminance:luminance(glass),wallLuminance:luminance(wall)};};
  const probes=['front-left','front-right','back'].map(windowProbe),litSamples={};
  for(const study of ['night','day']){
    await studyLight(dark,study);await dark.waitForTimeout(800);
    litSamples[study]=[await litSample(probes[0],eyeFront),await litSample(probes[1],eyeFront),await litSample(probes[2],eyeBack)];
  }
  const [nightLeft,nightRight,nightBack]=litSamples.night,[dayLeft,dayRight]=litSamples.day;
  const lit=x=>x.inView&&x.glassLuminance>x.wallLuminance&&x.glass[0]>x.glass[2];
  check('Under the night study from 2.5 m in front of the door each front window is brighter than the wall beside it and warm; from behind the cabin the back window is darker than the wall; by day the front windows are not brighter than the wall',
    lit(nightLeft)&&lit(nightRight)&&nightBack.inView&&nightBack.glassLuminance<nightBack.wallLuminance&&
    dayLeft.inView&&dayRight.inView&&dayLeft.glassLuminance<=dayLeft.wallLuminance&&dayRight.glassLuminance<=dayRight.wallLuminance,litSamples);
  await dark.context().close();

  // 14. No WebGL2: the painting.
  const flat=await visitor(viewport,()=>{const original=HTMLCanvasElement.prototype.getContext;window.__webgl2Refused=0;
    HTMLCanvasElement.prototype.getContext=function(type,...rest){if(type==='webgl2'){window.__webgl2Refused++;return null;}return original.call(this,type,...rest);};});
  await flat.goto(`${base}/?space=1&check`);await flat.waitForLoadState('load');await flat.waitForTimeout(4000);
  const flatView=await shows2D(flat),refused=await flat.evaluate(()=>window.__webgl2Refused);
  check('Without WebGL2 the 2D view is shown',flatView.spaceHidden&&(flatView.painting||flatView.fallback)&&refused>0&&!flat.own.length,{...flatView,webgl2Refused:refused,pageErrors:flat.own});
  await flat.context().close();

  // 15. Context loss returns to the painting within 2 s.
  const lost=await visitor();await lost.goto(`${base}/?space=1&check`);await ready(lost);
  const lossStart=performance.now();
  await lost.evaluate(()=>window.__space.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  const returned=await lost.waitForFunction(()=>{const s=document.querySelector('#space'),p=document.querySelector('#painting'),f=document.querySelector('#fallback');return s.hidden&&(!p.hidden||!f.hidden);},null,{timeout:2000}).then(()=>true,()=>false);
  const lossSeconds=(performance.now()-lossStart)/1000,lostView=await shows2D(lost);
  check('WebGL context loss returns to the 2D view within 2 s',returned&&lostView.spaceHidden&&(lostView.painting||lostView.fallback),{...lostView,seconds:lossSeconds});
  await lost.context().close();

  // 16. Portrait phone viewport: field of view capped, frame drawn.
  const phone=await visitor({width:390,height:844});await phone.goto(`${base}/?space=1&check`);await ready(phone);
  const portrait=await phone.evaluate(()=>{const s=window.__space,g=s.renderer.getContext();s.renderer.render(s.scene,s.camera);
    const read=(x,y)=>{const b=new Uint8Array(4);g.readPixels(x,y,1,1,g.RGBA,g.UNSIGNED_BYTE,b);return [...b];};
    const w=g.drawingBufferWidth,h=g.drawingBufferHeight;return {fov:s.camera.fov,width:w,height:h,centre:read(w>>1,h>>1),corner:read(0,h-1)};});
  check('At 390 × 844 the vertical field of view is ≤ 75° and the frame is drawn',portrait.fov<=75&&portrait.centre.some((v,i)=>v!==portrait.corner[i]),portrait);
  await phone.context().close();
  // 17. A scene build that fails after the context exists: the 2D view, the context given back, no page errors.
  const broken=await visitor(viewport,()=>{const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...rest){const g=original.call(this,type,...rest);if(type==='webgl2'&&this.id==='space')window.__spaceGL=g;return g;};});
  await broken.route('**/assets/lakeside-space-v1/meadow.webp',route=>route.abort());
  await broken.goto(`${base}/?space=1&check`);await broken.waitForLoadState('load');
  await broken.waitForFunction(()=>window.__space?.failed,null,{timeout:30_000}).catch(()=>{});await broken.waitForTimeout(1000);
  const brokenView=await shows2D(broken),brokenGL=await broken.evaluate(()=>({context:!!window.__spaceGL,lost:window.__spaceGL?.isContextLost()??null}));
  check('A failed scene build shows the 2D view and gives its WebGL context back',brokenView.spaceHidden&&(brokenView.painting||brokenView.fallback)&&brokenGL.context&&brokenGL.lost===true&&!broken.own.length,
    {...brokenView,...brokenGL,pageErrors:broken.own});
  await broken.context().close();

  // 18–19. The bundle's card atlas refused, or its stone texture answered empty: the 2D view, #space hidden, no toast, no page error.
  for(const [file,label,answer] of [['cards.webp','A cards.webp request that is aborted',route=>route.abort()],
    ['stone.webp','A stone.webp answered 200 with an empty body',route=>route.fulfill({status:200,contentType:'image/webp',body:''})]]){
    const p=await visitor();await p.route(`**/assets/lakeside-space-v1/${file}`,answer);
    await p.goto(`${base}/?space=1&check`);await p.waitForLoadState('load');
    await p.waitForFunction(()=>window.__space?.failed,null,{timeout:30_000}).catch(()=>{});await p.waitForTimeout(1500);
    const view=await shows2D(p),toastShown=await p.evaluate(()=>document.querySelector('#toast').classList.contains('show')),failed=await p.evaluate(()=>!!window.__space?.failed);
    check(`${label} shows the 2D view with #space hidden, no toast and no page error`,failed&&view.spaceHidden&&(view.painting||view.fallback)&&!toastShown&&!p.own.length,
      {...view,failed,toastShown,pageErrors:p.own});
    await p.context().close();
  }

  // 20. Left to itself, the meter on this machine settles on the full tier and locks within about 6 s of the view being shown.
  // 21. A running view stepped down live: its meter is swapped for a stub that answers light, then plain locked. After each
  // step the view reports that tier and pass mode and draws a frame with something in it; on plain the pass is released and
  // the scene drawn straight to the canvas; a resize afterwards (with no pass) still draws and sizes the canvas.
  const live=await visitor({width:1280,height:720});await live.goto(`${base}/?space=1&check`);await ready(live);
  await live.waitForTimeout(6000);
  const untouched=await live.evaluate(()=>({tier:window.__space.tier,locked:window.__space.meter.locked,passMode:window.__space.passMode,pass:!!window.__space.pass}));
  check('An untouched view on this machine reports the full tier, locked, after about 6 s',untouched.tier==='full'&&untouched.locked&&untouched.passMode==='full'&&untouched.pass,untouched);
  await live.evaluate(()=>{const now={tier:'full',locked:false};window.__liveSteps=[];
    window.__space.meter={get tier(){return now.tier;},get locked(){return now.locked;},frame(){const next=window.__liveSteps.shift();if(next)Object.assign(now,next);return now.tier;}};});
  const livePoints=[[640,360],[2,2],[320,560],[960,260],[640,90]],nonBlank=f=>f.pixels.some(p=>differ(p,f.pixels[0]));
  const liveView=()=>live.evaluate(()=>{const s=window.__space;return {tier:s.tier,locked:s.meter.locked,passMode:s.passMode,pass:!!s.pass,filterScale:s.pass?.scale??null};});
  const steps=[];
  for(const [tier,locked,passMode] of [['light',false,'light'],['plain',true,'off']]){
    await live.evaluate(step=>window.__liveSteps.push(step),{tier,locked});
    const took=await live.waitForFunction(mode=>window.__space.passMode===mode&&window.__liveSteps.length===0,passMode,{timeout:5000}).then(()=>true,()=>false);
    await live.waitForTimeout(300);
    steps.push({step:tier,took,...await liveView(),frame:await drawAndRead(live,livePoints)});
  }
  await live.setViewportSize({width:390,height:844});await live.waitForTimeout(500);
  await live.setViewportSize({width:1100,height:700});await live.waitForTimeout(500);
  const resized={...await liveView(),frame:await drawAndRead(live,[[550,350],[2,2],[275,520],[825,240],[550,80]]),
    canvas:await live.evaluate(()=>{const c=document.querySelector('#space');return [c.width,c.height];}),ratio:await live.evaluate(()=>Math.min(devicePixelRatio||1,1.6))};
  const [lightStep,plainStep]=steps;
  check('A running view stepped down live (full → light → plain, locked) reports each tier and pass mode, releases the pass on plain, and draws after each step and after a resize',
    lightStep.took&&lightStep.tier==='light'&&lightStep.passMode==='light'&&lightStep.pass&&lightStep.filterScale===.6&&nonBlank(lightStep.frame)&&
    plainStep.took&&plainStep.tier==='plain'&&plainStep.locked&&plainStep.passMode==='off'&&!plainStep.pass&&nonBlank(plainStep.frame)&&
    resized.passMode==='off'&&!resized.pass&&nonBlank(resized.frame)&&resized.canvas[0]===Math.round(1100*resized.ratio)&&resized.canvas[1]===Math.round(700*resized.ratio)&&!live.own.length,
    {steps,resized,pageErrors:live.own});
  await live.context().close();
  // 22. A context that cannot render to half-float colour (neither EXT_color_buffer_float nor EXT_color_buffer_half_float)
  // cannot run the painterly pass. The view starts locked on plain, builds no pass, draws the yard, and raises no GL error.
  const dull=await visitor({width:1280,height:720},()=>{const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...rest){const g=original.call(this,type,...rest);
      if(g&&type==='webgl2'&&this.id==='space'&&!g.__withheld){g.__withheld=true;const ask=g.getExtension.bind(g);
        g.getExtension=name=>/^EXT_color_buffer_(half_)?float$/.test(name)?null:ask(name);}
      return g;};});
  await dull.goto(`${base}/?space=1&check`);await ready(dull);await dull.waitForTimeout(6000);
  const dullView=await dull.evaluate(()=>{const s=window.__space,g=s.renderer.getContext();const glErrors=[];for(let e=g.getError();e!==g.NO_ERROR&&glErrors.length<8;e=g.getError())glErrors.push(e);
    return {tier:s.tier,locked:s.meter.locked,passMode:s.passMode,pass:!!s.pass,withheld:g.getExtension('EXT_color_buffer_float')===null&&g.getExtension('EXT_color_buffer_half_float')===null,glErrors};});
  const dullFrame=await drawAndRead(dull,[[640,360],[2,2],[320,560],[960,260],[640,90]]);
  const dullAfter=await dull.evaluate(()=>{const g=window.__space.renderer.getContext();return g.getError();});
  check('Without half-float colour targets the view starts locked on plain, builds no painterly pass, draws the yard and raises no GL error',
    dullView.withheld&&dullView.tier==='plain'&&dullView.locked&&dullView.passMode==='off'&&!dullView.pass&&!dullView.glErrors.length&&dullAfter===0&&
    dullFrame.pixels.some(p=>differ(p,dullFrame.pixels[0]))&&!dull.own.length&&!dull.consoleErrors.length,
    {...dullView,glErrorAfterDraw:dullAfter,frame:dullFrame,pageErrors:dull.own,consoleErrors:dull.consoleErrors});
  await dull.context().close();

  // ── The yard's living things (checks 23–29). Poses are computed from lifeLayout() and the cabin's frame, never typed; each
  // sample point is projected through the camera. A fixture (honoured only under ?check) sets what a presenter shows.
  const layout=lifeLayout(S,D),arrivalEye=S.arrival.position,[ox,oy]=S.oak.position;
  const aroundOak=(radius,degrees)=>[ox+radius*Math.sin(degrees*Math.PI/180),oy+radius*Math.cos(degrees*Math.PI/180)];
  const alive=await visitor({width:1440,height:810});await alive.goto(`${base}/?space=1&check`);await ready(alive);await studyLight(alive,'day');
  const lifeStatus=page=>page.evaluate(()=>({...window.__space.life.status}));

  // 23. The casement: with the main room's casement set open the pixels over the window differ from the same view with it shut.
  const casementEye=lookFrom(eyeFront,probes[0].centre);await setPose(alive,casementEye);await alive.waitForTimeout(600);
  const casementAt=await project(alive,[probes[0].centre]),casement={};
  for(const [label,open] of [['open',1],['shut',0],['shutAgain',0]]){
    await setFixture(alive,{cottagePose:{main:0,second:0,open}});await alive.waitForTimeout(800);casement[label]=(await patchRead(alive,casementAt,45)).on[0];}
  const casementDiff=changed(casement.open,casement.shut),casementControl=changed(casement.shut,casement.shutAgain);
  check('With the casement set open the pixels over the front-left window differ from the same view with it shut (and two shut frames agree)',
    onScreen(casementAt[0],45)&&casementDiff.n>=200&&casementControl.n<casementDiff.n/10,{pixel:casementAt[0],open:casementDiff,control:casementControl});
  await setFixture(alive,null);

  // 24. Wind in the oak's crown: two frames 1.5 s apart differ over the crown's sprays; with reduced motion they are identical.
  const crownPoints=async page=>{const at=await project(page,oakPlan(S,D).clumps.map(c=>c.center));return at.filter(q=>onScreen(q,20)).slice(0,12);};
  const crownFrames=async page=>{await setPose(page,structuredClone(S.arrival));await page.waitForTimeout(800);const at=await crownPoints(page);
    const first=(await patchRead(page,at,8)).on;await page.waitForTimeout(1500);const second=(await patchRead(page,at,8)).on;return {sprays:at.length,...changedAll(first,second)};};
  const moving=await crownFrames(alive);
  const still=await visitor({width:1440,height:810},null,{reducedMotion:'reduce'});await still.goto(`${base}/?space=1&check`);await ready(still);await studyLight(still,'day');
  const stillMotion=await still.evaluate(()=>window.__space.motion),stillCrown=await crownFrames(still);
  check('Two frames 1.5 s apart differ within the oak\'s crown; with reduced motion emulated they are identical there',
    moving.sprays>=4&&moving.n>=20&&stillMotion===false&&stillCrown.sprays>=4&&stillCrown.n===0,{moving,reducedMotion:{motion:stillMotion,...stillCrown}});
  await still.context().close();

  // 25. Rain: the path ahead is darker than by day, the rain presenter is active, and a view along the front wall from under the
  // eave draws the same with the streaks hidden (nothing falls there) where, in the open, hiding them changes the picture.
  const pathPoints=[[1.5,.2],[3.5,.3],[5.5,.9],[7.5,1.6],[9.5,2.4],[11.5,3.4]].map(([x,y])=>[x,y,terrainHeight(S,x,y)]);
  await setPose(alive,structuredClone(S.arrival));
  const pathLuminance={};
  for(const study of ['day','rain']){await studyLight(alive,study);await alive.waitForTimeout(1500);
    pathLuminance[study]=meanLuminance((await patchRead(alive,await project(alive,pathPoints),6)).on);}
  const rainStatus=(await lifeStatus(alive)).rain;
  const grid=(xs,ys)=>ys.flatMap(y=>xs.map(x=>[x,y])),across=(from,to,n)=>Array.from({length:n},(_,i)=>from+(to-from)*i/(n-1));
  const rainOpen=await patchRead(alive,grid(across(80,1360,8),[260,420,580]),10,{hide:['rain']}),openChange=changedAll(rainOpen.on,rainOpen.off);
  const eaveSide=frontOut.map(v=>v*(frame.W+.2));
  const eaveEye=[S.cabin.center[0]+frame.u[0]*(frame.L-1.5)+eaveSide[0],S.cabin.center[1]+frame.u[1]*(frame.L-1.5)+eaveSide[1]];
  const eaveHeight=eyePosition(S,{position:eaveEye})[2],eaveTarget=[eaveEye[0]-frame.u[0]*6,eaveEye[1]-frame.u[1]*6,eaveHeight];
  await setPose(alive,lookFrom(eaveEye,eaveTarget));await alive.waitForTimeout(1200);
  const eaveState=await state(alive),wallAt=(await project(alive,[[S.cabin.center[0]+frame.u[0]*(frame.L-6)+frontOut[0]*frame.W,S.cabin.center[1]+frame.u[1]*(frame.L-6)+frontOut[1]*frame.W,eaveHeight]]))[0];
  const wallSide=wallAt[0]<SHOT.width/2?across(80,620,5):across(820,1360,5);
  const rainEave=await patchRead(alive,grid(wallSide,[260,420,580]),10,{hide:['rain']}),eaveChange=changedAll(rainEave.on,rainEave.off);
  const sheltered=await import('../shared/lakeside-life.js').then(m=>m.sheltered(layout,[eaveState.position[0],eaveState.position[1],eaveHeight]));
  check('Under the rain study the path ahead is darker than by day and the rain presenter is active; a view along the front wall from under the eave equals the same view with the rain hidden',
    pathLuminance.rain<pathLuminance.day&&rainStatus==='active'&&sheltered===0&&eaveChange.n/eaveChange.of<.002&&openChange.n/openChange.of>.005,
    {pathLuminance,rainStatus,eave:{position:eaveState.position,sheltered,wallPixel:wallAt,changed:eaveChange},open:openChange});

  // 26. Ripples: with a fish ripple four seconds old set at each spot (no study, motion on) the lake differs there from the same
  // frame without the ring, and the ripple presenter is active.
  const water=await visitor({width:1440,height:810});await water.goto(`${base}/?space=1&check`);await ready(water);await setPose(water,structuredClone(S.arrival));
  const spots={};
  for(const [id,{center,radius}] of Object.entries(layout.ripples)){
    await setFixture(water,{coincidence:coincidenceFixture(4,id)});await water.waitForTimeout(900);
    const points=[[0,0],...[.4,.7,.95].flatMap(f=>Array.from({length:8},(_,i)=>[Math.sin(i*Math.PI/4)*radius*f,Math.cos(i*Math.PI/4)*radius*f]))].map(([dx,dy])=>[center[0]+dx,center[1]+dy,0]);
    const at=(await project(water,points)).filter(q=>onScreen(q,10)),read=await patchRead(water,at,8,{unripple:true});
    spots[id]={samples:at.length,...changedAll(read.on,read.off),active:await water.evaluate(()=>window.__space.coincidenceActive)};
  }
  check('With a ripple set at each of the three spots the lake there differs from the same frame without it and coincidenceActive is true',
    Object.values(spots).every(v=>v.samples>=8&&v.n>=30&&v.active),spots);
  await water.context().close();

  // 27. The bird, drawn at each place: hiding the `bird` group changes pixels at its projected place, from where it is seen. The perch,
  // the roof and the flight are seen from the arrival; the nest from beneath the crown; the sheltering bird from behind the oak, and
  // from the arrival (where the trunk stands between) hiding it changes nothing.
  const places=layout.bird.locations,above=p=>[p[0],p[1],p[2]+.1];
  const birdSeen=async(fixture,target,eye)=>{await setFixture(alive,{bird:fixture});await setPose(alive,lookFrom(eye,target));await alive.waitForTimeout(800);
    const at=await project(alive,[target]),read=await patchRead(alive,at,24,{hide:['bird']});
    return {eye,pixel:at[0],inView:onScreen(at[0],24),group:read.found[0],changed:changed(read.on[0],read.off[0]),status:(await lifeStatus(alive)).bird};};
  const seen=(r,min=8)=>r.group&&r.inView&&r.status==='active'&&r.changed.n>=min;
  const perched=await birdSeen(birdFixture('Oak perch'),above(places['oak-perch'].point),arrivalEye);
  const roofed=await birdSeen(birdFixture('Roof perch'),above(places['roof-perch'].point),arrivalEye);
  const nested=[];for(const [r,b] of [[2.5,60],[2.5,270],[4,90],[4,300]])nested.push({radius:r,bearing:b,...await birdSeen({state:createBirdState(0,false),now:0},above(places.nest.point),aroundOak(r,b))});
  const sheltered2=birdFixture('Sheltered bird'),shelterTarget=above(places['oak-shelter'].point);
  const behind=await birdSeen(sheltered2,shelterTarget,aroundOak(5.5,315)),hidden=await birdSeen(sheltered2,shelterTarget,arrivalEye);
  const flight=birdFixture('Roof flight',4500),flying=birdPlace(birdProgress(flight.state,null,flight.now),layout);
  const flown=await birdSeen(flight,flying.position,[flying.position[0]-3,flying.position[1]-4]);
  check('The bird is drawn at the oak perch, the nest, the sheltering place (from behind the oak, not from the arrival), the roof perch and mid-flight: hiding it changes pixels at its place',
    seen(perched)&&seen(roofed)&&nested.some(n=>seen(n))&&seen(behind)&&hidden.group&&hidden.inView&&hidden.status==='active'&&hidden.changed.n===0&&flying.flying&&seen(flown),
    {perched,roofed,nested,behind,hiddenFromArrival:hidden,flight:{position:flying.position,flying:flying.flying,...flown}});
  // 28. Under a study with no fixture the bird is not shown and its presenter reports idle.
  await setFixture(alive,null);await alive.waitForTimeout(800);
  const noBird=await lifeStatus(alive),noBirdVisible=await alive.evaluate(()=>window.__space.scene.getObjectByName('bird').visible);
  check('Under a study with no fixture life.status.bird is idle and the bird is not drawn',noBird.bird==='idle'&&noBirdVisible===false,{status:noBird,visible:noBirdVisible});
  check('No page errors from the living things so far',!alive.own.length&&!alive.consoleErrors.length,{pageErrors:alive.own,consoleErrors:alive.consoleErrors});
  await alive.context().close();

  // 29. A presenter that throws is given up and the yard carries on: the rain's update and the ripples' build are stubbed to throw,
  // under the rain study; the yard still draws, those two report failed and every other presenter active or idle.
  const stubbed=await visitor({width:1280,height:720});
  await stubbed.context().route('**/space/life/rain.js',route=>route.fulfill({contentType:'text/javascript',body:
    "export const RAIN={count:0,radius:9,height:7,speed:9,length:.45,slant:.35};export const rainDrop=()=>[0,0,0];export function createRain(){return {update(){throw new Error('stub');},dispose(){}};}"}));
  await stubbed.context().route('**/space/life/ripples.js',route=>route.fulfill({contentType:'text/javascript',body:
    "export const rippleNow=()=>null;export function createRipples(){throw new Error('stub');}"}));
  await stubbed.goto(`${base}/?space=1&check`);await ready(stubbed);await studyLight(stubbed,'rain');await stubbed.waitForTimeout(1500);
  const stubStatus=await lifeStatus(stubbed),stubFrame=await drawAndRead(stubbed,[[640,360],[2,2],[320,560],[960,260],[640,90]]);
  const others=Object.entries(stubStatus).filter(([name])=>!['rain','ripples'].includes(name));
  check('With the rain and ripple presenters stubbed to throw, the yard still draws, they report failed and every other presenter reports active or idle, with no page errors',
    stubStatus.rain==='failed'&&stubStatus.ripples==='failed'&&others.length>=7&&others.every(([,v])=>v==='active'||v==='idle')&&stubFrame.pixels.some(q=>differ(q,stubFrame.pixels[0]))&&!stubbed.own.length,
    {status:stubStatus,frame:stubFrame,pageErrors:stubbed.own});
  await stubbed.context().close();

  // 30. Frame cost per tier at the arrival pose under the day and the rain studies (recorded, not asserted): rAF callbacks over 4 s, the
  // synchronous time of one frame (as check 11), and the median and slowest time of the life's update on the CPU (the rain rebuilds its
  // streaks there every frame); and a view left alone under the rain study still settles on the full tier.
  const costs=[];
  for(const tier of ['full','light','plain'])for(const study of ['day','rain']){
    const t=await visitor({width:1440,height:810});await t.goto(`${base}/?space=1&check&tier=${tier}`);await ready(t);await studyLight(t,study);
    await t.evaluate(async()=>{const {LAKESIDE_SPACE}=await import('/shared/lakeside-space.js'),s=window.__space,update=s.life.update.bind(s.life);window.__space.state=structuredClone(LAKESIDE_SPACE.arrival);
      window.__lifeMs=[];s.life.update=f=>{const t0=performance.now();update(f);window.__lifeMs.push(performance.now()-t0);};});
    await t.waitForTimeout(1500);await t.evaluate(()=>{window.__lifeMs.length=0;});
    const callbacks=await t.evaluate(()=>new Promise(done=>{let n=0;const end=performance.now()+4000;const tick=now=>{n++;if(now<end)requestAnimationFrame(tick);else done(n);};requestAnimationFrame(tick);}));
    const measured=await t.evaluate(()=>{const s=window.__space,g=s.renderer.getContext(),b=new Uint8Array(4),life=[...window.__lifeMs].sort((a,b)=>a-b);
      s.renderer.render(s.scene,s.camera);const {triangles,calls}=s.renderer.info.render,rain=s.scene.getObjectByName('rain');
      const draw=()=>{if(s.passMode==='off'||!s.pass)s.renderer.render(s.scene,s.camera);else s.pass.render(s.scene,s.camera);g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,b);};
      draw();const times=[];for(let k=0;k<20;k++){const t0=performance.now();draw();times.push(performance.now()-t0);}times.sort((a,b)=>a-b);
      return {triangles,calls,streaks:rain?.visible?rain.geometry.drawRange.count/2:0,frameMs:{median:+times[10].toFixed(2),fastest:+times[0].toFixed(2),slowest:+times[19].toFixed(2)},
        lifeMs:{median:+life[life.length>>1].toFixed(3),slowest:+life.at(-1).toFixed(3),frames:life.length},rain:s.life.status.rain};});
    costs.push({tier,study,fps:callbacks/4,...measured});await t.context().close();
  }
  const alone=await visitor({width:1280,height:720});await alone.goto(`${base}/?space=1&check`);await ready(alone);await studyLight(alone,'rain');await alone.waitForTimeout(7000);
  const settled=await alone.evaluate(()=>({tier:window.__space.tier,locked:window.__space.meter.locked,passMode:window.__space.passMode,rain:window.__space.life.status.rain}));
  check('Frame cost per tier under the day and rain studies (recorded); a view left alone under the rain study settles on the full tier, locked',
    settled.tier==='full'&&settled.locked&&settled.passMode==='full'&&settled.rain==='active'&&costs.every(c=>c.study!=='rain'||c.rain==='active'),{costs,leftAloneUnderRain:settled});
  for(const c of costs)console.log(`  ${c.tier} ${c.study}: ${c.fps} fps (display-capped), ${c.frameMs.median} ms per frame synchronously, life update ${c.lifeMs.median} ms (slowest ${c.lifeMs.slowest}), ${c.streaks} streaks, ${c.triangles} triangles, ${c.calls} draw calls`);
  await alone.context().close();

  // ── The cabin's interior, behind ?interior=1 (checks 32–39). Captures and their results go to INTERIOR_VALIDATION_DIR.
  await mkdir(interiorDirectory,{recursive:true});interiorFrom=results.length;
  const out=doorOutward(S),doorSpot=doorPosition(S,D),outYaw=Math.atan2(out[0],out[1]),wrapAngle=a=>Math.abs(Math.atan2(Math.sin(a),Math.cos(a)));
  // A yard pose m metres out from the door, facing it; the door leaf's swing in radians, read from its quaternion.
  const atDoor=m=>({place:'yard',position:[doorSpot[0]+out[0]*m,doorSpot[1]+out[1]*m],yaw:Math.atan2(-out[0],-out[1]),pitch:0});
  const doorAngle=page=>page.evaluate(()=>{const q=window.__space.scene.getObjectByName('door').quaternion;return 2*Math.acos(Math.min(1,Math.abs(q.w)));});
  // Captures are JPEG at quality 85, as the review pack's are, so the committed frames stay small.
  const shotJpeg=path=>({path,type:'jpeg',quality:85});
  const indoorsState=page=>page.evaluate(()=>({...structuredClone(window.__space.state),room:window.__space.room,cameraY:window.__space.camera.position.y,opacity:window.__space.canvas.style.opacity}));
  // 32. Without ?interior=1 the door stays shut for a visitor standing at it, facing it.
  const shut=await visitor();await shut.goto(`${base}/?check`);await ready(shut);
  await setPose(shut,atDoor(1.2));await shut.waitForTimeout(2000);const shutAngle=await doorAngle(shut),shutBuilt=await shut.evaluate(()=>!!window.__space.inside||!!window.__space.passage);
  await setPose(shut,atDoor(3));await shut.waitForTimeout(800);await shut.screenshot(shotJpeg(`${interiorDirectory}/door-shut.jpg`));
  check('Without ?interior=1, 2 s at the door facing it leaves the door shut and builds no interior',shutAngle<1e-6&&!shutBuilt,{shutAngle,shutBuilt,consoleErrors:shut.consoleErrors,pageErrors:shut.own});
  const quietShut=!shut.consoleErrors.length&&!shut.own.length;await shut.context().close();

  // 33. With it the door swings open, and holding W carries the visitor into the entry hall through a fade.
  const inside=await visitor();await inside.goto(`${base}/?check&interior=1`);await ready(inside);
  await setPose(inside,atDoor(1.45));await inside.waitForTimeout(350);await inside.screenshot(shotJpeg(`${interiorDirectory}/door-opening.jpg`));
  await inside.waitForTimeout(1200);await inside.screenshot(shotJpeg(`${interiorDirectory}/door-open.jpg`));
  // The painterly pass masks the lake in the yard; indoors, where the downstairs floor lies at the water's height, it masks nothing.
  const waterMask=page=>page.evaluate(()=>{const s=window.__space;return s.pass&&s.passMode!=='off'?s.pass.canvas.uniforms.waterMask.value:null;});
  const yardMask=await waterMask(inside);
  await setPose(inside,atDoor(.6));await inside.waitForTimeout(1500);const openAngle=await doorAngle(inside);
  await inside.evaluate(()=>{window.__veil=[];window.__veilTimer=setInterval(()=>window.__veil.push(+(window.__space.canvas.style.opacity||1)),20);});
  await hold(inside,['KeyW'],900);await inside.waitForTimeout(600);
  const entered=await indoorsState(inside),hallMask=await waterMask(inside),veil=await inside.evaluate(()=>{clearInterval(window.__veilTimer);return window.__veil;});
  check('With ?interior=1 the door opens for a visitor at it; holding W fades out and in and sets them in the entry hall, where the pass masks no water',
    openAngle>1&&entered.place==='cabin'&&entered.floor===0&&entered.room==='entry hall'&&Math.min(...veil)<.5&&entered.opacity==='1'&&yardMask===1&&hallMask===0,
    {openAngle,entered,darkestOpacity:Math.min(...veil),samples:veil.length,yardMask,hallMask});
  await inside.screenshot(shotJpeg(`${interiorDirectory}/hall.jpg`));

  // 34. From the stair's foot, holding W climbs to the upper floor, the eye 3 m higher.
  await setPose(inside,{place:'cabin',floor:0,position:[10.3,1],yaw:0,pitch:0});await inside.waitForTimeout(300);const foot=await indoorsState(inside);
  // Held until the visitor is up (the climb's time depends on the frame rate), for at most 8 s.
  await inside.keyboard.down('KeyW');
  const climbed=await inside.waitForFunction(()=>window.__space.state.floor===1,null,{timeout:8000,polling:50}).then(()=>true,()=>false);
  await inside.keyboard.up('KeyW');await inside.waitForTimeout(300);const top={...await indoorsState(inside),climbed};
  check('Holding W from the stair foot reaches floor 1 within 8 s, with the camera 3 m higher',foot.floor===0&&top.climbed&&top.floor===1&&top.room==='landing'&&Math.abs(top.cameraY-foot.cameraY-3)<.01,{foot,top});

  // 35. Still on the landing, a reload returns to the same room and floor.
  await inside.waitForTimeout(3500);const storedIndoors=await inside.evaluate(()=>JSON.parse(localStorage.getItem('a-view:place:lakeside-cottage')));
  await inside.reload();await ready(inside);await inside.waitForTimeout(300);const back=await indoorsState(inside);
  check('After 3.5 s still indoors, a reload returns to the same room and floor',back.place==='cabin'&&back.floor===top.floor&&back.room===top.room&&near(back,top,1e-6),{top,back,stored:storedIndoors});
  await setPose(inside,{place:'cabin',floor:1,position:[8,1],yaw:0,pitch:0});await inside.waitForTimeout(800);await inside.screenshot(shotJpeg(`${interiorDirectory}/landing.jpg`));

  // The rooms, captured: each pose stands on that room's floor, looking across it.
  const rooms=[['living-room',{place:'cabin',floor:0,position:[6.4,3.5],yaw:3*Math.PI/2,pitch:0},'living room'],
    ['kitchen',{place:'cabin',floor:0,position:[6.4,7.6],yaw:-Math.PI/4+2*Math.PI,pitch:0},'kitchen'],
    ['sky-room',{place:'cabin',floor:1,position:[6.4,7.6],yaw:-Math.PI/4+2*Math.PI,pitch:.25},'sky room']],roomsSeen={};
  for(const [file,pose,name] of rooms){await setPose(inside,pose);await inside.waitForTimeout(800);roomsSeen[file]=(await indoorsState(inside)).room;await inside.screenshot(shotJpeg(`${interiorDirectory}/${file}.jpg`));
    if(roomsSeen[file]!==name)console.log(`  ${file}: expected ${name}, in ${roomsSeen[file]}`);}

  // 36. The Return button from indoors fades to the arrival pose in the yard.
  await setPose(inside,{place:'cabin',floor:1,position:[3,9],yaw:0,pitch:0});await inside.waitForTimeout(300);
  await inside.evaluate(()=>document.querySelector('#arrival-button').click());await inside.waitForTimeout(1500);
  const cameHome=await indoorsState(inside);
  check('The Return button from indoors ends at the arrival pose in the yard',cameHome.place==='yard'&&near(cameHome,arrival,1e-9)&&cameHome.opacity==='1',{cameHome,arrival});

  // 37. Walking out through the hall's doorway ends in the yard, facing away from the door.
  await setPose(inside,{place:'cabin',floor:0,position:[9,1.2],yaw:Math.PI,pitch:0});await inside.waitForTimeout(300);
  await hold(inside,['KeyW'],1200);await inside.waitForTimeout(600);const outside=await indoorsState(inside);
  const outDistance=Math.hypot(outside.position[0]-doorSpot[0],outside.position[1]-doorSpot[1]);
  check('Walking out through the doorway ends in the yard facing away from the door',outside.place==='yard'&&wrapAngle(outside.yaw-outYaw)<.01&&outDistance>=.85,{outside,outYaw,outDistance});

  // 38. No page or console errors in any interior visitor.
  check('No page or console errors with or without ?interior=1, and each room capture stands in its room',quietShut&&!inside.consoleErrors.length&&!inside.own.length&&rooms.every(([f,,name])=>roomsSeen[f]===name),
    {consoleErrors:inside.consoleErrors,pageErrors:inside.own,roomsSeen});
  await inside.context().close();

  // 39. An interior whose build throws (no art to paint it with) keeps the door shut and the visitor in the yard, warned of once.
  const failing=await visitor();const warnings=[];failing.on('console',m=>{if(m.type()==='warning'&&/interior could not be built/.test(m.text()))warnings.push(m.text());});
  await failing.goto(`${base}/?check&interior=1`);await ready(failing);
  await failing.evaluate(()=>{window.__space.art=null;});
  await setPose(failing,atDoor(.6));await failing.waitForTimeout(2000);
  await hold(failing,['KeyW'],1200);await failing.waitForTimeout(600);
  const stuck={...await indoorsState(failing),door:await doorAngle(failing),insideFailed:await failing.evaluate(()=>window.__space.insideFailed)};
  check('With the interior build forced to fail, standing at the door and holding W leaves the door shut and the visitor in the yard, with one warning and no page errors',
    stuck.door<1e-6&&stuck.place==='yard'&&stuck.opacity==='1'&&stuck.insideFailed&&warnings.length===1&&!failing.own.length,{stuck,warnings,pageErrors:failing.own});
  await failing.context().close();
  // ── The cabin's windows, live (checks 40–51). Poses and pane crops come from viewOpenings and screenRect, never typed numbers.
  const openings=viewOpenings(I,S,D),opening=id=>openings.find(o=>o.id===id);
  // Looking at an opening from [a, d] on its floor: yaw clockwise from +d seen from above, pitch up (level for the wall windows).
  const eyeAt=(floor,[a,d])=>[a,d,floor*I.floorRise+S.eyeHeight];
  const facing=(o,spot,level=o.kind!=='roof')=>{const e=eyeAt(o.floor,spot),r=o.centre.map((c,i)=>c-e[i]);
    return {place:'cabin',floor:o.floor,position:[...spot],yaw:Math.atan2(r[0],r[1]),pitch:level?0:Math.atan2(r[2],Math.hypot(r[0],r[1]))};};
  // A pane's rectangle in CSS pixels [x0, y0, x1, y1] from the top left, shrunk by `inset` of its size so only glass is read.
  const paneBox=(page,o,pose,inset=.15)=>page.evaluate(({o,pose,inset,eye})=>({o,pose,inset,eye,cam:{fov:window.__space.camera.fov*Math.PI/180,aspect:window.__space.camera.aspect},W:innerWidth,H:innerHeight}),{o,pose,inset,eye:eyeAt(pose.floor,pose.position)})
    .then(({cam,W,H,eye})=>{const r=screenRect(o,{eye,yaw:pose.yaw,pitch:pose.pitch,fov:cam.fov,aspect:cam.aspect});if(!r)return null;
      const x0=(r[0]+1)/2*W,x1=(r[2]+1)/2*W,y0=(1-r[3])/2*H,y1=(1-r[1])/2*H,dx=(x1-x0)*inset,dy=(y1-y0)*inset;return [x0+dx,y0+dy,x1-dx,y1-dy].map(Math.round);});
  // Draws one frame with SpaceView's own indoor draw (drawIndoors, which render calls: openWindows, then the rooms and the live
  // views) and reads each box's pixels; with `flat` the views are left out (the shell's flat glass), with `hide` those named objects
  // of the yard are hidden for a second draw of the same frame.
  const indoorRead=(page,boxes,{flat=false,hide=[]}={})=>page.evaluate(({boxes,flat,hide})=>{
    const s=window.__space,g=s.renderer.getContext(),W=g.drawingBufferWidth,H=g.drawingBufferHeight,k=W/innerWidth,b=[];
    const draw=()=>s.drawIndoors({flat});
    const read=()=>boxes.map(([x0,y0,x1,y1])=>{const X=Math.round(x0*k),Y=Math.round(H-y1*k),w=Math.round((x1-x0)*k),h=Math.round((y1-y0)*k),p=new Uint8Array(w*h*4);g.readPixels(X,Y,w,h,g.RGBA,g.UNSIGNED_BYTE,p);return [...p];});
    const ids=draw(),on=read();let off=null;
    if(hide.length){const objects=hide.map(n=>s.scene.getObjectByName(n)).filter(Boolean),was=objects.map(o=>o.visible);objects.forEach(o=>{o.visible=false;});draw();off=read();objects.forEach((o,i)=>{o.visible=was[i];});}
    return {ids,on,off};},{boxes,flat,hide});
  // How many of a crop's pixels differ from its own first pixel (a flat colour has none), and of how many.
  const varied=a=>{let n=0;for(let i=4;i<a.length;i+=4)if(Math.abs(a[i]-a[0])>2||Math.abs(a[i+1]-a[1])>2||Math.abs(a[i+2]-a[2])>2)n++;return {n,of:a.length/4};};
  const moveTo=async(page,pose)=>{await setPose(page,pose);await page.waitForTimeout(700);};
  // A pane is live when the last frame drew it and its glass is not the shell's flat glass: the live crop and the flat one differ over most of it.
  const paneLive=async(page,o,pose)=>{const box=await paneBox(page,o,pose);if(!box)return {box,live:false};
    const lv=await indoorRead(page,[box]),fl=await indoorRead(page,[box],{flat:true}),c=changed(lv.on[0],fl.on[0]),v=varied(lv.on[0]);
    return {box,ids:lv.ids,live:lv.ids.includes(o.id)&&c.n>c.of*.6,unlike:c,varied:v,mean:meanRgb(lv.on[0]).map(Math.round)};};
  const win=await visitor();await win.goto(`${base}/?check&interior=1&tier=full`);await ready(win);await studyLight(win,'day');
  // The bedrooms and the sky room stand on the upper floor, so the whole cabin is built first by walking in through the door.
  await setPose(win,atDoor(.6));await win.waitForTimeout(1500);await hold(win,['KeyW'],900);await win.waitForTimeout(900);
  const paneSpots={living:[4.2,3],study:[13.8,2.2],dining:[10,9],'bedroom-2':[3.5,5],'bedroom-3':[14.5,5],'sky-room':[3.5,7.6]};
  // 40. Each of the six windows by day, from a pose in its room facing it: live, and its glass is not the flat horizon colour.
  const panes={};
  for(const id of Object.keys(paneSpots)){const o=opening(id),pose=facing(o,paneSpots[id]);await moveTo(win,pose);panes[id]={pose:{floor:pose.floor,position:pose.position,yaw:+pose.yaw.toFixed(3),pitch:+pose.pitch.toFixed(3)},...await paneLive(win,o,pose),room:(await indoorsState(win)).room};
    await win.screenshot(shotJpeg(`${interiorDirectory}/window-${id}.jpg`));}
  check('Each of the six windows by day, from its room and facing it, is live and shows more than the flat horizon colour',Object.values(panes).every(p=>p.live),{panes});

  // 41. The open door from the hall is live; from 3 m back in the hall with the leaf shut it is not.
  const doorOpening=opening('door'),doorPose=facing(doorOpening,[9,2.2],true);
  await moveTo(win,doorPose);await win.waitForTimeout(1500);const doorOpen=await paneLive(win,doorOpening,doorPose);
  await win.screenshot(shotJpeg(`${interiorDirectory}/door-from-hall.jpg`));
  const backPose=facing(doorOpening,[9,3.8],true);await moveTo(win,backPose);await win.waitForTimeout(2000);
  const doorShutAngle=await doorAngle(win),doorBack=await indoorRead(win,[[0,0,4,4]]);
  check('The open door from the hall is live; from 3 m back in the hall with the leaf shut it is not',doorOpen.live&&!doorBack.ids.includes('door')&&doorShutAngle<.05,{doorOpen,backIds:doorBack.ids,leafAngle:doorShutAngle});

  // 42. Parallax: the living window from [3.2, 3] and [5.2, 3], both facing the front wall, shows different yard.
  const living=opening('living'),parallax={};
  for(const [label,spot] of [['left',[3.2,3]],['right',[5.2,3]],['rightAgain',[5.2,3]]]){const pose={place:'cabin',floor:0,position:spot,yaw:Math.PI,pitch:0};await moveTo(win,pose);
    const box=await paneBox(win,living,pose,.1),read=await indoorRead(win,[box]);parallax[label]={box,ids:read.ids,pixels:read.on[0]};
    if(label!=='rightAgain')await win.screenshot(shotJpeg(`${interiorDirectory}/living-${label}.jpg`));}
  // The two boxes differ in size and place, so each is read over the pane's own width and height: resampled to a 24 x 12 grid.
  const resampled=({box,pixels})=>{const w=box[2]-box[0],h=box[3]-box[1],out=[];for(let j=0;j<12;j++)for(let i=0;i<24;i++){const x=Math.min(w-1,Math.floor((i+.5)*w/24)),y=Math.min(h-1,Math.floor((j+.5)*h/12)),q=((h-1-y)*w+x)*4;out.push(pixels[q],pixels[q+1],pixels[q+2],255);}return out;};
  const gridL=resampled(parallax.left),gridR=resampled(parallax.right),gridR2=resampled(parallax.rightAgain),parallaxDiff=changed(gridL,gridR),parallaxControl=changed(gridR,gridR2);
  check('The living window from [3.2, 3] and from [5.2, 3] shows different yard (more than a tenth of its pane differs; the same spot twice agrees)',
    parallax.left.ids.includes('living')&&parallax.right.ids.includes('living')&&parallaxDiff.n>parallaxDiff.of/10&&parallaxControl.n<parallaxDiff.n/2,{left:parallax.left.box,right:parallax.right.box,parallaxDiff,parallaxControl});

  // 43. The sideways cut: from the kitchen, looking along the back wall through the kitchen-dining opening at the dining window.
  const dining=opening('dining'),sidePose=facing(dining,[3.2,10],true);await moveTo(win,sidePose);
  const side=await paneLive(win,dining,sidePose);await win.screenshot(shotJpeg(`${interiorDirectory}/dining-from-kitchen.jpg`));const sideRoom=(await indoorsState(win)).room;
  check('From the kitchen, looking along the wall at the dining window, the pane is live and shows yard or sky, not one flat colour',sideRoom==='kitchen'&&side.live&&side.varied.n>side.varied.of*.2,{side,sideRoom});

  // 44. Two at once: from the hall, 2.4 m from the entry spot with the door open, turned between the door and the living window
  // (seen through the wide hall-living opening); each of the two is live and its glass differs from the flat glass over a third of its pane.
  const twoSpot=[8,3],bearing=[doorOpening,living].map(o=>facing(o,twoSpot).yaw);
  const twoPose={place:'cabin',floor:0,position:twoSpot,yaw:Math.atan2(Math.sin(bearing[0])+Math.sin(bearing[1]),Math.cos(bearing[0])+Math.cos(bearing[1])),pitch:0};
  await moveTo(win,twoPose);await win.waitForTimeout(1500);const twoBoxes=await Promise.all([doorOpening,living].map(o=>paneBox(win,o,twoPose)));
  const twoLive=twoBoxes.every(Boolean)?await indoorRead(win,twoBoxes):{ids:[],on:[]},twoFlat=twoBoxes.every(Boolean)?await indoorRead(win,twoBoxes,{flat:true}):{on:[]};
  const twoUnlike=twoBoxes.map((_,i)=>changed(twoLive.on[i]||[],twoFlat.on[i]||[]));await win.screenshot(shotJpeg(`${interiorDirectory}/hall-two-views.jpg`));
  check('From the hall near the entry spot with the door open, the door and the living window are both live and both show more than the flat glass',
    (await indoorsState(win)).room==='entry hall'&&['door','living'].every(id=>twoLive.ids.includes(id))&&twoUnlike.every(c=>c.of>0&&c.n>c.of/3),{ids:twoLive.ids,boxes:twoBoxes,unlike:twoUnlike,pose:twoPose});

  // 45. Rain: streaks fall in the living window's pane and none in the wall beside it (the same wall, to its left, clamped to the screen).
  await studyLight(win,'rain');const rainPose={place:'cabin',floor:0,position:[4.2,3],yaw:Math.PI,pitch:0};await moveTo(win,rainPose);await win.waitForTimeout(1500);
  const rainBox=await paneBox(win,living,rainPose,.1),paneFull=await paneBox(win,living,rainPose,0),paneW=paneFull[2]-paneFull[0];
  const wallBox=[Math.max(0,paneFull[0]-Math.round(1.25*paneW)),paneFull[1],Math.max(0,paneFull[0]-Math.round(.25*paneW)),paneFull[3]].map((v,i)=>Math.min(i%2?viewport.height:viewport.width,v));
  const rainy=await indoorRead(win,[rainBox,wallBox],{hide:['rain']}),streaksIn=changed(rainy.on[0],rainy.off[0]),streaksWall=changed(rainy.on[1],rainy.off[1]),wallSeen=varied(rainy.on[1]);
  await win.screenshot(shotJpeg(`${interiorDirectory}/living-rain.jpg`));
  const streakMin=Math.round(streaksIn.of/2000);
  check('Under the rain study streaks fall in the living window\'s pane (at least 1 pixel in 2000 of it) and none in the wall beside it, which is on screen and not blank',
    rainy.ids.includes('living')&&wallBox[2]>wallBox[0]&&wallBox[3]>wallBox[1]&&wallSeen.n>wallSeen.of*.2&&streaksIn.n>=streakMin&&streaksWall.n===0,{pane:streaksIn,streakMin,wall:streaksWall,wallVaries:wallSeen,wallBox,rainBox});

  // 46. Night: the living pane is darker than by day.
  await studyLight(win,'day');await moveTo(win,rainPose);await win.waitForTimeout(800);const dayPane=await indoorRead(win,[rainBox]);
  await studyLight(win,'night');await moveTo(win,rainPose);await win.waitForTimeout(800);const nightPane=await indoorRead(win,[rainBox]);
  await win.screenshot(shotJpeg(`${interiorDirectory}/living-night.jpg`));
  const dayLum=luminance(meanRgb(dayPane.on[0])),nightLum=luminance(meanRgb(nightPane.on[0]));
  check('At night the living window\'s pane is darker than by day',dayPane.ids.includes('living')&&nightPane.ids.includes('living')&&nightLum<dayLum*.7,{dayLum:+dayLum.toFixed(3),nightLum:+nightLum.toFixed(3)});

  // 47. The casement: with the casement open the living window, captured from inside, differs from the same view with it shut.
  await studyLight(win,'day');await moveTo(win,rainPose);const caseBox=await paneBox(win,living,rainPose,0),caseFrames={};
  for(const [label,open] of [['shut',0],['open',1]]){await setFixture(win,{cottagePose:{main:0,second:0,open}});await win.waitForTimeout(1200);caseFrames[label]=(await indoorRead(win,[caseBox])).on[0];
    if(open)await win.screenshot(shotJpeg(`${interiorDirectory}/casement-open.jpg`));}
  await setFixture(win,null);const caseDiff=changed(caseFrames.open,caseFrames.shut);
  check('With the casement open, the living window seen from inside differs from the same view with it shut',caseDiff.n>=200,{caseBox,caseDiff});

  // 48. On &tier=plain the living window is live and not flat.
  const lowTier=await visitor();await lowTier.goto(`${base}/?check&interior=1&tier=plain`);await ready(lowTier);await studyLight(lowTier,'day');
  await setPose(lowTier,atDoor(.6));await lowTier.waitForTimeout(1500);await hold(lowTier,['KeyW'],900);await lowTier.waitForTimeout(900);
  const plainPose={place:'cabin',floor:0,position:[4.2,3],yaw:Math.PI,pitch:0};await moveTo(lowTier,plainPose);
  const plainPane=await paneLive(lowTier,living,plainPose),plainTier=await lowTier.evaluate(()=>window.__space.tier);
  check('On &tier=plain the living window is live and not flat',plainTier==='plain'&&plainPane.live,{plainTier,plainPane});
  const plainQuiet=!lowTier.consoleErrors.length&&!lowTier.own.length;await lowTier.context().close();

  // 49. The yard from outdoors at the arrival pose is unchanged by ?interior=1. What moved between two loads was the view's frozen motion
  // clock: under reduced motion it freezes at the seconds-since-epoch of the first frame, which differs per load and moves the wind, the
  // clouds and the water. Each load pins it (frozenMotion) to the same value, under the day study, so two loads of one configuration
  // draw the same picture. Two loads without the flag are the control; the flagged load must differ from the first of them in at most
  // 2% of a dense grid over the whole frame and of a dense grid over a crop tight on the cabin's door and front windows, and so must
  // the control pair (a noisy control fails the check rather than hiding a change).
  const STILL=.02,gridPoints=(x0,y0,x1,y1,nx,ny)=>{const q=[];for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)q.push([x0+(i+.5)*(x1-x0)/nx,y0+(j+.5)*(y1-y0)/ny]);return q;};
  const wholeFrame=gridPoints(0,0,viewport.width,viewport.height,96,54);let cabinCrop=null,cabinBox=null;const yardFrames=[];
  for(const query of ['?check','?check','?check&interior=1']){const y=await visitor({width:viewport.width,height:viewport.height},null,{reducedMotion:'reduce'});await y.goto(`${base}/${query}`);await ready(y);await studyLight(y,'day');
    await y.evaluate(async()=>{const {LAKESIDE_SPACE}=await import('/shared/lakeside-space.js'),s=window.__space;s.state=structuredClone(LAKESIDE_SPACE.arrival);s.frozenMotion=1234;});await y.waitForTimeout(2000);
    if(!cabinCrop){const at=await project(y,['door','window-front-left','window-front-right'].map(n=>openingCentre(S,D,n))),xs=at.map(q=>q[0]),ys=at.map(q=>q[1]),m=40;
      cabinBox=[Math.max(0,Math.min(...xs)-m),Math.max(0,Math.min(...ys)-m),Math.min(viewport.width,Math.max(...xs)+m),Math.min(viewport.height,Math.max(...ys)+m)].map(Math.round);cabinCrop=gridPoints(...cabinBox,64,32);}
    const frame=await drawAndRead(y,[...wholeFrame,...cabinCrop]);
    yardFrames.push({quiet:!y.consoleErrors.length&&!y.own.length,whole:frame.pixels.slice(0,wholeFrame.length),cabin:frame.pixels.slice(wholeFrame.length)});await y.context().close();}
  const share=(f,g,part)=>f[part].filter((p,i)=>differ(p,g[part][i])).length/f[part].length,fig=n=>+n.toFixed(4);
  const yardShares={controlWhole:fig(share(yardFrames[0],yardFrames[1],'whole')),controlCabin:fig(share(yardFrames[0],yardFrames[1],'cabin')),
    flaggedWhole:fig(share(yardFrames[0],yardFrames[2],'whole')),flaggedCabin:fig(share(yardFrames[0],yardFrames[2],'cabin'))};
  check('The yard from outdoors at the arrival pose is the same with and without ?interior=1: with the world held still, two loads without it differ in at most 2% of the points, and the flagged load differs from one in at most 2%, over the whole frame and over the cabin\'s door and windows',
    cabinBox[2]-cabinBox[0]>40&&cabinBox[3]-cabinBox[1]>40&&Object.values(yardShares).every(v=>v<=STILL)&&yardFrames.every(f=>f.quiet),
    {...yardShares,limit:STILL,wholePoints:wholeFrame.length,cabinPoints:cabinCrop.length,cabinBox,pinned:'frozenMotion = 1234, reduced motion, day study, arrival pose'});

  // The windows' visitor is done with (its errors are read in check 51): a page left open keeps drawing at the display's rate and takes about half the
  // GPU from the one being timed (a yard frame measured 26 ms beside it and 12.5 ms alone), so it is closed before any speed is measured.
  await win.context().close();
  // 50. Speed, on &tier=full: the synchronous time of one whole frame forced to finish with readPixels (as check 30 measures it), the
  // median of 20, at the arrival pose (the pass drawing the yard) and in the living room at [4.2, 3] facing the window (SpaceView's
  // own indoor draw, drawIndoors, with the live views). Frame intervals cannot tell them apart: headless frames are locked to the display.
  const median=a=>[...a].sort((p,q)=>p-q)[a.length>>1];
  const timeFrames=(page,indoors)=>page.evaluate(indoors=>{const s=window.__space,g=s.renderer.getContext(),b=new Uint8Array(4);
    const draw=()=>{if(indoors)s.drawIndoors();
      else if(s.passMode==='off'||!s.pass)s.renderer.render(s.scene,s.camera);else s.pass.render(s.scene,s.camera,{water:true,views:null});
      g.readPixels(0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,b);};
    draw();draw();const times=[];for(let k=0;k<20;k++){const t0=performance.now();draw();times.push(performance.now()-t0);}return {times,live:[...s.live],tier:s.tier,passMode:s.passMode};},indoors);
  // Six rounds of yard then room on the one warmed page (each switch given time to settle), the first round discarded: each place's
  // figure is the median of its rounds' medians, so a slow patch of the machine falls on both places alike. The whole measurement is one
  // function of the study the page is under, so the day figure (check 50) and the night figure (check 63) are the same method.
  const roomSpot=rainPose,speedMethod='Six rounds of 20 forced frames at the yard\'s arrival pose then in the living room at [4.2, 3] on one warmed page, tier=full, 1440 x 810; the first round is discarded and each place\'s figure is the median of the other five rounds\' medians. A frame is timed synchronously, forced to finish with readPixels; indoors it is SpaceView.drawIndoors, the indoor draw render itself calls (openWindows, then pass.render(inside.scene, camera, {water: false, views})).';
  const measureSpeed=async study=>{
    const speed=await visitor({width:1440,height:810});await speed.goto(`${base}/?check&interior=1&tier=full`);await ready(speed);await studyLight(speed,study);
    const rounds=[];
    await speed.evaluate(async()=>{window.__arrival=structuredClone((await import('/shared/lakeside-space.js')).LAKESIDE_SPACE.arrival);});
    await setPose(speed,atDoor(.6));await speed.waitForTimeout(1500);await hold(speed,['KeyW'],900);await speed.waitForTimeout(900);
    for(let k=0;k<6;k++){
      await speed.evaluate(()=>{window.__space.state=structuredClone(window.__arrival);});await speed.waitForTimeout(700);const y=await timeFrames(speed,false);
      await moveTo(speed,roomSpot);await speed.waitForTimeout(400);const r=await timeFrames(speed,true);
      rounds.push({yardMs:+median(y.times).toFixed(2),roomMs:+median(r.times).toFixed(2),yardTier:y.tier,roomLive:r.live,roomLit:await speed.evaluate(()=>window.__space.lit)});}
    const kept=rounds.slice(1),yardMs=+median(kept.map(r=>r.yardMs)).toFixed(2),roomMs=+median(kept.map(r=>r.roomMs)).toFixed(2),costRatio=+(roomMs/yardMs).toFixed(3);
    const roundRatios=kept.map(r=>+(r.roomMs/r.yardMs).toFixed(3));
    await moveTo(speed,twoPose);await speed.waitForTimeout(1500);const hallTime=await timeFrames(speed,true),hallMs=+median(hallTime.times).toFixed(2);
    const quiet=!speed.consoleErrors.length&&!speed.own.length;await speed.context().close();
    return {study,rounds,kept,yardMs,roomMs,costRatio,roundRatios,hallTime,hallMs,quiet};};
  const daySpeed=await measureSpeed('day'),{yardMs,roomMs,costRatio,roundRatios,hallTime,hallMs,rounds,kept}=daySpeed;
  check('Speed on &tier=full: a frame in the living room facing the window costs at most 1.1 times a frame at the yard\'s arrival pose (median of rounds, yard and room alternating)',
    kept.every(r=>r.yardTier==='full'&&r.roomLive.includes('living'))&&costRatio<=1.1,{yardMs,roomMs,ratio:costRatio,limit:1.1,roundRatios,ratioSpread:[Math.min(...roundRatios),Math.max(...roundRatios)],rounds,discardedFirstRound:true,method:speedMethod,hallDoorOpenMs:hallMs,hallLive:hallTime.live,hallNote:'recorded only, not a pass/fail: the hall pose of check 44, 20 frames, door open',
      pageAlone:'no other page is open while this is timed (see the note before check 50); the yard figure is the same under every study'});
  console.log(`  speed (full): yard ${yardMs} ms, living room ${roomMs} ms (${costRatio}x), hall with the door open ${hallMs} ms (${hallTime.live.length} live)`);
  const speedQuiet=daySpeed.quiet;

  // 51. No page or console errors in any of these visitors.
  check('No page or console errors in the windows\' visitors',!win.consoleErrors.length&&!win.own.length&&plainQuiet&&speedQuiet,{windows:{consoleErrors:win.consoleErrors,pageErrors:win.own},plainQuiet,speedQuiet});

  // ── The cabin's light (checks 52–65). The rooms take daylight through their windows by day and their lamps' and fire's light after dusk,
  // painted into the surfaces (no light sources). Every pose and patch is computed from the blueprint (shared/lakeside-interior.js) and
  // the openings (viewOpenings), then projected through the camera as it stands; nothing is typed in screen pixels.
  const fixtureLamps=(levels={})=>I.rooms.map(r=>levels[r.id]??0);
  const livingRoom=I.rooms.find(r=>r.id==='living'),fp=I.fireplace,lampOf=id=>I.fittings.find(f=>f.room===id).at,hallLamp=lampOf('hall'),livingLamp=lampOf('living');
  // A pose standing at [a, d] on `floor` looking at [a, d, z] (interior frame), `tilt` radians above that aim.
  const aim=(floor,spot,target,tilt=0)=>{const e=eyeAt(floor,spot),r=target.map((c,i)=>c-e[i]);return {place:'cabin',floor,position:[...spot],yaw:Math.atan2(r[0],r[1]),pitch:Math.atan2(r[2],Math.hypot(r[0],r[1]))+tilt};};
  const crop=(p,half)=>[p[0]-half,p[1]-half,p[0]+half,p[1]+half].map(Math.round);
  const rectOf=(points,inset=0)=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),dx=(x1-x0)*inset,dy=(y1-y0)*inset;return [x0+dx,y0+dy,x1-dx,y1-dy].map(Math.round);};
  const inFrame=(b,m=0)=>b[0]>=m&&b[1]>=m&&b[2]<=viewport.width-m&&b[3]<=viewport.height-m&&b[2]>b[0]&&b[3]>b[1];
  const warmth=rgb=>rgb[0]/Math.max(rgb[2],1),lum=rgb=>luminance(rgb),r3=v=>+v.toFixed(3),rgbOf=a=>meanRgb(a).map(Math.round);
  // Draws one indoor frame and reads one pixel at each CSS-pixel point (the grid for a frame's mean and for comparing two frames).
  const indoorPixels=(page,points)=>page.evaluate(points=>{const s=window.__space,g=s.renderer.getContext(),W=g.drawingBufferWidth,H=g.drawingBufferHeight,k=W/innerWidth;s.drawIndoors();
    return points.map(([x,y])=>{const b=new Uint8Array(4);g.readPixels(Math.min(W-1,Math.round(x*k)),Math.min(H-1,Math.max(0,Math.round(H-1-y*k))),1,1,g.RGBA,g.UNSIGNED_BYTE,b);return [...b];});},points);
  const framePoints=gridPoints(0,0,viewport.width,viewport.height,64,36),frameMean=async page=>{const px=await indoorPixels(page,framePoints),rgb=[0,1,2].map(c=>px.reduce((t,p)=>t+p[c],0)/px.length);return {rgb:rgb.map(Math.round),lum:lum(rgb)};};
  // Patches of the interior's world points [a, d, z]: where they land on screen, and their mean colour in one indoor draw.
  const patches=async(page,points,half=9,extra={})=>{const at=await project(page,points),boxes=at.map(p=>crop(p,half)),read=await indoorRead(page,boxes,extra);
    return {at:at.map(p=>p.map(Math.round)),boxes,seen:boxes.every(b=>inFrame(b)),rgb:read.on.map(rgbOf),off:read.off?.map(rgbOf),pixels:read.on};};
  const stand=async(page,pose,ms=900)=>{await setPose(page,pose);await page.waitForTimeout(ms);};
  // Into the cabin through its door (the whole cabin is built on the way), then holding still.
  const walkIn=async page=>{await setPose(page,atDoor(.6));await page.waitForTimeout(1500);await hold(page,['KeyW'],900);await page.waitForTimeout(900);};
  const lightShot=(page,name)=>page.screenshot(shotJpeg(`${interiorDirectory}/light-${name}.jpg`));
  const litState=page=>page.evaluate(()=>({lit:window.__space.lit,insideLit:window.__space.inside.lit,room:window.__space.room}));
  // The poses. Living room: standing at its back looking at the window wall, tilted so a floor patch by the window and one at the room's far end are both in view.
  const win0=I.windows.find(w=>w.id==='living'),nearFloor=[win0.a,1,0],farFloor=[win0.a,livingRoom.d[1]-2.4,0];
  const livingPose=aim(0,[win0.a,livingRoom.d[1]-.2],[win0.a,(nearFloor[1]+farFloor[1])/2,0]);
  // Facing the lamp and the gable wall from the room's hall side; the wall patch is plaster beside the chimney breast.
  const duskPose=aim(0,[livingRoom.a[1]-1.1,fp.d],[livingLamp[0],fp.d,livingLamp[2]],-.22),gablePlaster=[.08,fp.d-fp.breast.width/2-1.2,1.5];
  const duskRead=async page=>{await stand(page,duskPose);const p=await patches(page,[livingLamp,gablePlaster],6),g=await patches(page,[livingLamp,[livingLamp[0],livingLamp[1]-.13,livingLamp[2]],[livingLamp[0],livingLamp[1]+.13,livingLamp[2]]],2);
    return {glass:p.rgb[0],core:g.rgb[0],glow:[0,1,2].map(c=>Math.round((g.rgb[1][c]+g.rgb[2][c])/2)),wall:p.rgb[1],seen:p.seen&&g.seen,at:p.at};};

  // The server's clock, moved, for a true clear noon: no study gives one (the day study is 15:30), so a second server is started on a
  // fresh database with its Date.now moved forward to the next clear noon (the whole app, caption included, then shows that moment; the
  // client takes its time from the server). The first start only creates the database, whose epoch fixes the world's hours.
  noonDir=await mkdtemp(join(tmpdir(),'a-view-noon-'));
  // A free port unless NOON_PORT names one, so a stale server from an earlier run can never be the one that answers.
  const noonPort=process.env.NOON_PORT?Number(process.env.NOON_PORT):await new Promise((done,fail)=>{const probe=createServer();probe.once('error',fail);probe.listen(0,'127.0.0.1',()=>{const {port}=probe.address();probe.close(()=>done(port));});});
  const serverFile=fileURLToPath(new URL('../src/server.js',import.meta.url));
  const bootServer=shift=>{const child=spawn(process.execPath,[...(shift?['--import',`${noonDir}/shift.mjs`]:[]),serverFile],{env:{...process.env,PORT:String(noonPort),A_VIEW_DB:`${noonDir}/world.sqlite`,CLOCK_SHIFT_MS:String(shift)},stdio:'ignore'});noonChildren.push(child);return child;};
  // Up when the child we started is alive and the server on the port tells the time we gave it (its clock moved by `shift`) from the world we made (`epoch`, when known): anything else is somebody else's server or a failed start.
  const serverUp=async(child,shift,epoch)=>{for(let k=0;k<100;k++){
      if(child.exitCode!==null)throw new Error(`The noon server exited (code ${child.exitCode}) before it answered on port ${noonPort}; is the port in use?`);
      try{const r=await fetch(`http://127.0.0.1:${noonPort}/api/world`);if(r.ok){const w=await r.json();
        if(Math.abs(w.serverTime-(Date.now()+shift))>5000||(epoch!==undefined&&w.world.epoch!==epoch))throw new Error(`The server on port ${noonPort} is not the noon server this run started (its clock reads ${new Date(w.serverTime).toISOString()}, wanted about ${new Date(Date.now()+shift).toISOString()}${epoch!==undefined?`, epoch ${w.world.epoch} against ${epoch}`:''}).`);return w;}}
      catch(e){if(/noon server/.test(e.message))throw e;}await wait(150);}
    throw new Error(`The noon server did not answer on port ${noonPort} within 15 s.`);};
  const stopServer=child=>new Promise(done=>{if(child.exitCode!==null)return done();child.once('exit',done);child.kill();});
  await writeFile(`${noonDir}/shift.mjs`,'const real=Date.now.bind(Date),shift=Number(process.env.CLOCK_SHIFT_MS)||0;Date.now=()=>real()+shift;\n');
  const noonServer=async()=>{
    const first=bootServer(0),epoch=(await serverUp(first,0)).world.epoch;await stopServer(first);
    // The first moment after the page could be ready (30 s on) when the world's hour is within 20 minutes of 12:00 and the sky clear for a minute either side.
    const from=Date.now()+30_000,clear=t=>weather(epoch,t).cloud<.15;let at=null;
    for(let t=from;t<from+60*86_400_000&&at===null;t+=5000)if(Math.abs(calendar(epoch,t).hour-12)<.33&&[-60_000,0,60_000].every(d=>clear(t+d)))at=t;
    if(at===null)throw new Error('No clear noon within 60 days.');
    const shift=at-(Date.now()+8000);const second=bootServer(shift);await serverUp(second,shift,epoch);return {epoch,shiftedBy:shift,port:noonPort,worldHourAimed:+calendar(epoch,at).hour.toFixed(3)};};

  // 52 (and the noon readings that checks 53 and 54 compare with). On the noon server a visitor stands in the living room at the poses the studies use.
  const noonRun=await noonServer(),noonBase=`http://127.0.0.1:${noonPort}`;
  const noonPage=await visitor();await noonPage.goto(`${noonBase}/?check&interior=1&tier=full`);await ready(noonPage);await walkIn(noonPage);
  await stand(noonPage,livingPose,1200);
  const noonClock=await noonPage.evaluate(()=>({time:document.querySelector('#world-time').textContent,weather:document.querySelector('#weather').textContent,study:window.__space.fixture}));
  const noonFloor=await patches(noonPage,[nearFloor,farFloor]),noonMean=await frameMean(noonPage),noonState=await litState(noonPage);await lightShot(noonPage,'living-noon');
  const noonDusk=await duskRead(noonPage);
  const noonQuiet=!noonPage.consoleErrors.length&&!noonPage.own.length;await noonPage.context().close();stopNoon();
  const noonHour=(([h,m])=>h+m/60)(noonClock.time.split(':').map(Number));
  // 52. The living room at clear noon, from inside: the floor by the window is brighter than the floor across the room.
  const NEAR_OVER_FAR=1.25,noonRatio=lum(noonFloor.rgb[0])/lum(noonFloor.rgb[1]);
  check(`The living room at a clear noon (the world's clock really at noon): the floor by the window is at least ${NEAR_OVER_FAR} times as bright as the floor across the room`,
    Math.abs(noonHour-12)<.5&&/Clear/.test(noonClock.weather)&&noonFloor.seen&&noonRatio>=NEAR_OVER_FAR&&noonState.insideLit===true,
    {ratio:r3(noonRatio),limit:NEAR_OVER_FAR,near:noonFloor.rgb[0],far:noonFloor.rgb[1],nearAt:nearFloor,farAt:farFloor,screen:noonFloor.at,clock:noonClock,server:noonRun,note:'the on-screen clock and the drawn scene are the same moment: the server\'s Date.now is moved, no study is used'});

  // The rest on the main server, in the cabin, under the studies.
  const lite=await visitor();await lite.goto(`${base}/?check&interior=1&tier=full`);await ready(lite);await studyLight(lite,'day');await walkIn(lite);
  // 53. Under the overcast (rain) study the same frame is darker than at noon.
  await studyLight(lite,'rain');await stand(lite,livingPose,1200);const overMean=await frameMean(lite);await lightShot(lite,'living-overcast');
  const OVERCAST_UNDER=.9;
  check(`The same pose under the overcast study is darker than at noon (mean luminance at most ${OVERCAST_UNDER} of noon's)`,overMean.lum<=noonMean.lum*OVERCAST_UNDER,
    {noon:r3(noonMean.lum),overcast:r3(overMean.lum),ratio:r3(overMean.lum/noonMean.lum),limit:OVERCAST_UNDER,noonRgb:noonMean.rgb,overcastRgb:overMean.rgb});

  // 54. Dusk study: the lamp's own light. The living lamp is read lit (the study) and then forced out by fixture with everything else the same (every other room's
  // level as the study has it, the fire still burning); the ring beside its glass must be warmer and brighter lit, and the glass itself brighter lit and at least as bright as its ring.
  await studyLight(lite,'dusk');const dusk=await duskRead(lite);await lightShot(lite,'living-dusk');const duskState=await litState(lite);
  const duskLevels=await lite.evaluate(()=>[...window.__space.dials.lamps]),lampIndex=I.rooms.findIndex(r=>r.id==='living');
  await setFixture(lite,{lamps:duskLevels.map((v,i)=>i===lampIndex?0:v/DIALS.lamp)});await lite.waitForTimeout(800);const duskOut=await duskRead(lite);const outState=await litState(lite);await setFixture(lite,null);
  const GLASS_WARM=1.3,WALL_WARMER=1.05,RING_BRIGHTER=1.15,RING_WARMER=1.05,GLASS_BRIGHTER=1.1,wallRatio=warmth(dusk.wall)/warmth(noonDusk.wall),
    ringBrighter=lum(dusk.glow)/lum(duskOut.glow),ringWarmer=warmth(dusk.glow)/warmth(duskOut.glow),glassBrighter=lum(dusk.core)/lum(duskOut.core),glassOverRing=lum(dusk.core)/lum(dusk.glow);
  check(`At dusk the living lamp's own light shows: the ring beside its glass is warm (red over blue at least ${GLASS_WARM}), at least ${RING_BRIGHTER} times as bright and ${RING_WARMER} times as warm as the same ring with that lamp forced out, its glass is at least ${GLASS_BRIGHTER} times as bright as the unlit glass and at least as bright as its ring; the gable's plaster is at least ${WALL_WARMER} times warmer than at noon`,
    dusk.seen&&duskOut.seen&&noonDusk.seen&&warmth(dusk.glow)>=GLASS_WARM&&ringBrighter>=RING_BRIGHTER&&ringWarmer>=RING_WARMER&&glassBrighter>=GLASS_BRIGHTER&&glassOverRing>=1&&wallRatio>=WALL_WARMER&&duskState.lit?.lamp===true&&outState.lit?.lamp===false,
    {glow:dusk.glow,glowOut:duskOut.glow,glowWarmth:r3(warmth(dusk.glow)),limitGlow:GLASS_WARM,ringBrighter:r3(ringBrighter),limitRingBrighter:RING_BRIGHTER,ringWarmer:r3(ringWarmer),limitRingWarmer:RING_WARMER,
      glass:dusk.core,glassOut:duskOut.core,glassBrighter:r3(glassBrighter),limitGlassBrighter:GLASS_BRIGHTER,glassOverRing:r3(glassOverRing),glassPatch:dusk.glass,glassCoreWarmth:r3(warmth(dusk.core)),noonGlassPatch:noonDusk.glass,
      finding:'the lit glass\'s centre clips to white (about 253,253,253) at this distance; it is warm only at its rim and in its halo, which is why the colour is read in the ring',
      wallDusk:dusk.wall,wallNoon:noonDusk.wall,wallWarmthDusk:r3(warmth(dusk.wall)),wallWarmthNoon:r3(warmth(noonDusk.wall)),ratio:r3(wallRatio),limitWall:WALL_WARMER,screen:dusk.at,lit:duskState.lit,litWithLampForcedOut:outState.lit});

  // 55. Night study with the fire: flames in the mouth's crop (the crop differs from the same frame with the fire out and is brighter), the hearth slab warmer than the far floor.
  await studyLight(lite,'night');
  const nightPose=aim(0,[livingRoom.a[1]-.4,fp.d],[1.5,fp.d+1,.55]),mouthCorners=[[fp.breast.depth,fp.d-fp.mouth.width/2,.15],[fp.breast.depth,fp.d+fp.mouth.width/2,.15],[fp.breast.depth,fp.d-fp.mouth.width/2,fp.mouth.height],[fp.breast.depth,fp.d+fp.mouth.width/2,fp.mouth.height]];
  const slab=[fp.breast.depth+fp.slab/2,fp.d,.05],hearthFar=[livingLamp[0]+.6,fp.d+2.4,0];
  await stand(lite,nightPose,1200);const mouthBox=rectOf(await project(lite,mouthCorners),.12);
  const fireLit=await indoorRead(lite,[mouthBox]),floorRead=await patches(lite,[slab,hearthFar]);await lightShot(lite,'living-night');const nightState=await litState(lite);
  await setFixture(lite,{hearth:{fire:0,embers:0}});await lite.waitForTimeout(500);const fireOut=await indoorRead(lite,[mouthBox]);await setFixture(lite,null);
  const flames=changed(fireLit.on[0],fireOut.on[0]),FLAMES=.25,MOUTH_BRIGHTER=1.3,mouthRatio=lum(meanRgb(fireLit.on[0]))/lum(meanRgb(fireOut.on[0])),SLAB_WARMER=1.05,slabRatio=warmth(floorRead.rgb[0])/warmth(floorRead.rgb[1]);
  check(`Night study with the fire: the mouth's crop differs from the same frame with the fire out over at least ${FLAMES} of it and is at least ${MOUTH_BRIGHTER} times as bright, and the hearth slab is at least ${SLAB_WARMER} times warmer than the floor further from the fire`,
    inFrame(mouthBox)&&floorRead.seen&&flames.n>=flames.of*FLAMES&&mouthRatio>=MOUTH_BRIGHTER&&slabRatio>=SLAB_WARMER&&nightState.lit?.fire==='burning'&&nightState.lit?.lamp===true,
    {mouthBox,flames,flameShare:r3(flames.n/flames.of),limitFlames:FLAMES,mouthLit:rgbOf(fireLit.on[0]),mouthOut:rgbOf(fireOut.on[0]),mouthRatio:r3(mouthRatio),limitMouth:MOUTH_BRIGHTER,
      slab:floorRead.rgb[0],floor:floorRead.rgb[1],slabWarmth:r3(warmth(floorRead.rgb[0])),floorWarmth:r3(warmth(floorRead.rgb[1])),ratio:r3(slabRatio),limitSlab:SLAB_WARMER,slabAt:slab,floorAt:hearthFar,lit:nightState.lit});

  // 56. Midnight (the night study, 00:30), every lamp and the fire forced out. Dim; and the way on from the living room into the hall can be seen: the floor of the opening is darker
  // than the plaster beside it (boards are a darker surface than plaster under the same night fill, and no lamp lifts the hall beyond), and the opening's two edges are luminance steps along
  // horizontal lines at three heights. The margins are what a dim screen can show: a step under 2% of full luminance (5 of 255 levels) is lost, so the way must be at least 10% darker
  // than the wall (and by at least that step), and each edge must step by at least that much at both of two heights, 0.3 m and 0.9 m up (higher, at
  // 1.5 m, the plaster each side of a jamb takes the same fill and the step there is nearly nothing, so it is not read).
  const hallOpening=I.openings.find(o=>o.id==='hall-living'),[o0,o1]=hallOpening.span,wallSpan=[hallOpening.span[1]+.25,livingRoom.d[1]-.25],opZ=[.15,.7],edgeHeights=[.3,.9];
  const outPose=aim(0,[1.6,(o0+o1)/2],[hallOpening.at,(o0+o1)/2,1.2]);
  await stand(lite,outPose,1200);const litFrame=await frameMean(lite);
  await setFixture(lite,{lamps:fixtureLamps(),hearth:{fire:0,embers:0}});await lite.waitForTimeout(800);
  const rectAt=async(a,span)=>rectOf(await project(lite,[[a,span[0],opZ[0]],[a,span[1],opZ[0]],[a,span[0],opZ[1]],[a,span[1],opZ[1]]]),.1);
  const wayBox=await rectAt(hallOpening.at,[o0,o1]),wallBox2=await rectAt(hallOpening.at,wallSpan),outFrame=await frameMean(lite);
  const edgeAt=await project(lite,[o0,o1].flatMap(e=>edgeHeights.map(z=>[hallOpening.at,e,z]))),edgeBoxes=edgeAt.flatMap(([x,y])=>[[x-14,y-3,x-4,y+3],[x+4,y-3,x+14,y+3]].map(b=>b.map(Math.round)));
  const outCrops=await indoorRead(lite,[wayBox,wallBox2,...edgeBoxes]);await lightShot(lite,'living-out');
  const DIM=.25,STEP=.02,WAY_DARKER=.9,wayLum=lum(meanRgb(outCrops.on[0])),wallLum=lum(meanRgb(outCrops.on[1])),
    edgeSteps=edgeAt.map((_,k)=>r3(Math.abs(lum(meanRgb(outCrops.on[2+2*k]))-lum(meanRgb(outCrops.on[3+2*k]))))),edgeOk=[0,1].map(e=>edgeSteps.slice(e*edgeHeights.length,(e+1)*edgeHeights.length).every(v=>v>=STEP));
  const thinnest=Math.min(wallLum-wayLum,...edgeSteps);
  check(`Midnight with every lamp and the fire out: the frame is dim (mean luminance under ${DIM} and at most half the lit frame's), the hall–living opening's floor is darker than the plaster beside it (at most ${WAY_DARKER} of its luminance and at least ${STEP} less), and each edge of the opening is a luminance step of at least ${STEP} at both ${edgeHeights.join(' m and ')} m up`,
    outFrame.lum<DIM&&outFrame.lum<=litFrame.lum/2&&inFrame(wayBox)&&inFrame(wallBox2)&&edgeBoxes.every(b=>inFrame(b))&&wayLum<=wallLum*WAY_DARKER&&wallLum-wayLum>=STEP&&edgeOk.every(Boolean),
    {frameOut:r3(outFrame.lum),frameLit:r3(litFrame.lum),limitDim:DIM,wayBox,wallBox:wallBox2,way:rgbOf(outCrops.on[0]),wall:rgbOf(outCrops.on[1]),wayLum:r3(wayLum),wallLum:r3(wallLum),wayOverWall:r3(wayLum/wallLum),limitWayOverWall:WAY_DARKER,darkerBy:r3(wallLum-wayLum),limitStep:STEP,
      lighter:'the wall: plaster is a paler surface than the boards of the hall floor seen through the opening, and with the lamps out both take only the night fill',edgeHeights,edgeSteps:{left:edgeSteps.slice(0,2),right:edgeSteps.slice(2)},edgesAtBothHeights:edgeOk,
      thin:`the margins are set from what a dim screen shows, not from the measured values: the thinnest of the wall-over-way difference and the four edge steps is ${r3(thinnest)} against the ${STEP} step (${r3(thinnest/STEP)} times it)`});

  // 57. The hall and stair at night, asleep (every lamp out but the two night lamps, as the shared rules set them for a sleeping house): the wall lamp's glass glows.
  const asleep=roomLamps(I,{dark:1,pose:{main:0,second:0},lights:{main:{on:false,at:-Infinity},second:{on:false,at:-Infinity}},now:0,settled:true});
  await setFixture(lite,{lamps:asleep,hearth:{fire:0,embers:0}});
  const hallPose=aim(0,[8.2,5.2],[hallLamp[0],hallLamp[1],hallLamp[2]],-.05);await stand(lite,hallPose,1200);
  const glass=await patches(lite,[hallLamp],5),around=await patches(lite,[[hallLamp[0],hallLamp[1],hallLamp[2]+.55],[hallLamp[0]-.6,hallLamp[1],hallLamp[2]]],9);await lightShot(lite,'hall-night');const hallState=await litState(lite);
  const GLOW=2,glowOver=lum(glass.rgb[0])/Math.max(lum(around.rgb[0]),lum(around.rgb[1]));
  check(`The hall and stair at night, asleep: the wall lamp's glass is at least ${GLOW} times as bright as the wall around it, and warm`,
    glass.seen&&around.seen&&glowOver>=GLOW&&warmth(glass.rgb[0])>=1.2&&hallState.lit?.lamp===true&&hallState.room==='entry hall',
    {glass:glass.rgb[0],above:around.rgb[0],beside:around.rgb[1],glowOver:r3(glowOver),limit:GLOW,glassWarmth:r3(warmth(glass.rgb[0])),levels:asleep.map(r3),at:glass.at,lit:hallState.lit});

  // 58. The master bedroom by day, then lit by fixture: brighter and warmer.
  await setFixture(lite,null);await studyLight(lite,'day');
  const master=I.rooms.find(r=>r.id==='master'),masterPose=aim(0,[master.a[1]-.7,master.d[1]-.7],[(master.a[0]+master.a[1])/2,(master.d[0]+master.d[1])/2,1.2]);
  await stand(lite,masterPose,1200);const masterDay=await frameMean(lite);await lightShot(lite,'master-day');
  await setFixture(lite,{lamps:fixtureLamps({master:1}),hearth:{fire:0,embers:0}});await lite.waitForTimeout(800);const masterLit=await frameMean(lite);const masterState=await litState(lite);await lightShot(lite,'master-lit');
  const MASTER_BRIGHTER=1.2,MASTER_WARMER=1.05,masterRatio=masterLit.lum/masterDay.lum,masterWarm=warmth(masterLit.rgb)/warmth(masterDay.rgb);
  check(`The master bedroom lit by fixture is at least ${MASTER_BRIGHTER} times as bright and ${MASTER_WARMER} times as warm as by day`,
    masterRatio>=MASTER_BRIGHTER&&masterWarm>=MASTER_WARMER&&masterState.room==='master bedroom'&&masterState.lit?.lamp===true,
    {day:masterDay.rgb,lit:masterLit.rgb,dayLum:r3(masterDay.lum),litLum:r3(masterLit.lum),brighter:r3(masterRatio),limitBrighter:MASTER_BRIGHTER,warmer:r3(masterWarm),limitWarmer:MASTER_WARMER,lit_:masterState.lit,clockNote:'the study is the day study, so the caption reads 15:30 in both captures; the lamp is lit by fixture, not by the clock'});

  // 59. The kitchen lit by fixture with the dining room out, from the dining room. A lamp's light passes through an opening but never through a wall: the
  // dining face of the shared wall beyond the opening's jamb, and the floor at its foot there (where the line to the kitchen's lamp crosses the wall's solid
  // run), take none of the kitchen's lamp, while the kitchen seen through the opening is lit (the control). What spills through the opening onto the dining
  // floor in front of it is check 66's.
  await studyLight(lite,'night');
  const kitchen=I.rooms.find(r=>r.id==='kitchen'),shared=I.openings.find(o=>o.id==='kitchen-dining'),wallA=shared.at+I.wall/2,[s0,s1]=shared.span,diningRoom=I.rooms.find(r=>r.id==='dining');
  const stripSpan=[s1+.05,diningRoom.d[1]-.05],kitchenFar=[kitchen.a[0]+1,(s0+s1)/2,1.3];
  const dinePose=aim(0,[diningRoom.a[1]-.5,(s0+s1)/2-.6],[(wallA+kitchenFar[0])/2,(stripSpan[0]+stripSpan[1])/2+.4,1.2]);
  const sample=async()=>{const strip=rectOf(await project(lite,[[wallA,stripSpan[0],.3],[wallA,stripSpan[1],.3],[wallA,stripSpan[0],1.9],[wallA,stripSpan[1],1.9]]),.1),
    floorBehind=[wallA+.1,(s1+diningRoom.d[1])/2+.1,0],p=await patches(lite,[floorBehind,kitchenFar],6),read=await indoorRead(lite,[strip]);
    return {strip,stripRgb:rgbOf(read.on[0]),floor:p.rgb[0],kitchenFar:p.rgb[1],seen:inFrame(strip)&&p.seen};};
  await stand(lite,dinePose,1000);
  await setFixture(lite,{lamps:fixtureLamps(),hearth:{fire:0,embers:0}});await lite.waitForTimeout(800);const bothOut=await sample();
  await setFixture(lite,{lamps:fixtureLamps({kitchen:1}),hearth:{fire:0,embers:0}});await lite.waitForTimeout(800);const kitchenOn=await sample();await lightShot(lite,'kitchen-dining');
  const KITCHEN_SEEN=1.5,LEAK=1.05,leak=[lum(kitchenOn.stripRgb)/lum(bothOut.stripRgb),lum(kitchenOn.floor)/lum(bothOut.floor)],kitchenGain=lum(kitchenOn.kitchenFar)/lum(bothOut.kitchenFar);
  check(`From the dining room, with the kitchen's lamp lit and the dining room's out, the dining face of the shared wall beyond the opening's jamb and the floor at its foot (behind the wall's solid run from the kitchen's lamp) are no brighter than with the kitchen out too (at most ${LEAK} times), while the kitchen seen through the opening is at least ${KITCHEN_SEEN} times as bright`,
    bothOut.seen&&kitchenOn.seen&&leak.every(v=>v<=LEAK)&&kitchenGain>=KITCHEN_SEEN,
    {wallStrip:{out:bothOut.stripRgb,kitchenLit:kitchenOn.stripRgb,ratio:r3(leak[0])},floorBehindWall:{out:bothOut.floor,kitchenLit:kitchenOn.floor,ratio:r3(leak[1])},kitchenSeen:{out:bothOut.kitchenFar,lit:kitchenOn.kitchenFar,ratio:r3(kitchenGain)},limitLeak:LEAK,limitKitchen:KITCHEN_SEEN,strip:kitchenOn.strip,pose:dinePose,clockNote:'the night study, so the caption reads 00:30; the kitchen\'s lamp is lit by fixture and the dining room\'s forced out, not by the world\'s lights'});
  await setFixture(lite,null);

  // 60. The doorway from the yard at night, the door open: its crop is warmer than by day.
  const doorCentre=openingCentre(S,D,'door'),doorLook={...atDoor(1.45),...lookFrom(atDoor(1.45).position,doorCentre)};await setPose(lite,doorLook);await lite.waitForTimeout(2500);
  const doorCrop=async()=>{const [c,t,b]=await project(lite,[doorCentre,[doorCentre[0],doorCentre[1],doorCentre[2]+.8],[doorCentre[0],doorCentre[1],doorCentre[2]-.8]]),ppm=Math.abs(b[1]-t[1])/1.6,box=[c[0]-.2*ppm,c[1]-.45*ppm,c[0]+.2*ppm,c[1]+.45*ppm].map(Math.round);
    const px=(await drawAndRead(lite,gridPoints(...box,8,16))).pixels;return {box,rgb:[0,1,2].map(i=>Math.round(px.reduce((t,p)=>t+p[i],0)/px.length)),open:await doorAngle(lite)};};
  await studyLight(lite,'day');await lite.waitForTimeout(1500);const doorDay=await doorCrop();
  await studyLight(lite,'night');await lite.waitForTimeout(1500);const doorNight=await doorCrop();await lightShot(lite,'doorway-night');
  const DOOR_WARMER=1.1,doorWarm=warmth(doorNight.rgb)/warmth(doorDay.rgb);
  check(`The doorway seen from the yard with the door open is at least ${DOOR_WARMER} times warmer at night than by day (red over blue)`,
    doorDay.open>1&&doorNight.open>1&&inFrame(doorNight.box)&&doorWarm>=DOOR_WARMER,
    {day:doorDay.rgb,night:doorNight.rgb,dayWarmth:r3(warmth(doorDay.rgb)),nightWarmth:r3(warmth(doorNight.rgb)),ratio:r3(doorWarm),limit:DOOR_WARMER,box:doorNight.box,leafAngle:{day:r3(doorDay.open),night:r3(doorNight.open)}});

  // 61. The same moment is the same light. Three loads with the world held still (the motion clock pinned as in check 49, reduced motion) at the night study, in the
  // living room: A and B, and A and C, differ in at most 2% of a dense grid over the whole indoor frame. The control: the same pose with every lamp and the fire out
  // differs from A in far more, so a blind or noisy comparison fails rather than passes.
  const momentGrid=gridPoints(0,0,viewport.width,viewport.height,96,54),momentFrames=[];let momentQuiet=true;
  for(const label of ['A','B','C']){const m=await visitor({width:viewport.width,height:viewport.height},null,{reducedMotion:'reduce'});await m.goto(`${base}/?check&interior=1&tier=full`);await ready(m);await studyLight(m,'night');
    await m.evaluate(()=>{window.__space.frozenMotion=1234;});await walkIn(m);await stand(m,nightPose,1500);momentFrames.push(await indoorPixels(m,momentGrid));
    if(label==='A'){await setFixture(m,{lamps:fixtureLamps(),hearth:{fire:0,embers:0}});await m.waitForTimeout(600);momentFrames.push(await indoorPixels(m,momentGrid));}
    momentQuiet=momentQuiet&&!m.consoleErrors.length&&!m.own.length;await m.context().close();}
  const momentShare=(f,g)=>f.filter((p,i)=>differ(p,g[i])).length/f.length,[momentA,momentOut,momentB,momentC]=momentFrames,
    moment={AB:fig(momentShare(momentA,momentB)),AC:fig(momentShare(momentA,momentC)),control:fig(momentShare(momentA,momentOut))},CONTROL_MIN=.2;
  check('The same moment draws the same light: with the world held still, two other loads draw the interior frame within 2% of the first over a dense grid, and the same pose with the lamps and fire out differs by far more',
    moment.AB<=STILL&&moment.AC<=STILL&&moment.control>=CONTROL_MIN&&momentQuiet,{...moment,limit:STILL,controlLeast:CONTROL_MIN,points:momentGrid.length,pinned:'frozenMotion = 1234, reduced motion, night study, living room at the fire'});

  // 62. The lit materials are in use and the interior scene holds no light source.
  const sources=await lite.evaluate(()=>{const s=window.__space,found=[];s.inside.scene.traverse(o=>{if(o.isLight)found.push(o.type);});let meshes=0;s.inside.scene.traverse(o=>{if(o.isMesh)meshes++;});return {lit:s.inside.lit,lights:found,meshes};});
  check('The interior uses its lit materials (inside.lit) and its scene holds no light source of any kind',sources.lit===true&&sources.lights.length===0&&sources.meshes>0,sources);
  const liteQuiet=!lite.consoleErrors.length&&!lite.own.length;await lite.context().close();

  // 63. Speed under the night study (yard and living room both under it, the lamp and the fire lit): check 50's measurement, the same function.
  const nightSpeed=await measureSpeed('night'),nightLit=nightSpeed.kept.every(r=>r.roomLit?.lamp===true&&r.roomLit?.fire==='burning');
  check('Speed on &tier=full under the night study (the living room\'s lamp and fire lit): a frame in the living room facing the window costs at most 1.1 times a frame at the yard\'s arrival pose, measured as check 50 measures it',
    nightSpeed.kept.every(r=>r.yardTier==='full'&&r.roomLive.includes('living'))&&nightLit&&nightSpeed.costRatio<=1.1,
    {yardMs:nightSpeed.yardMs,roomMs:nightSpeed.roomMs,ratio:nightSpeed.costRatio,limit:1.1,roundRatios:nightSpeed.roundRatios,ratioSpread:[Math.min(...nightSpeed.roundRatios),Math.max(...nightSpeed.roundRatios)],rounds:nightSpeed.rounds,discardedFirstRound:true,
      method:speedMethod,litInTheRoom:nightLit,dayRatio:costRatio,dayYardMs:yardMs,
      nightYardNote:'a yard frame costs the same by night as by day when timed alone (12.5 ms by day, 12.1 ms by night: 44 against 47 draw calls, 330,704 against 333,404 triangles, no shadow pass in either); an earlier day figure of 26 ms was measured while the windows\' visitor was still open and drawing, which halves the GPU. The ratio compares the same page\'s room frame with its yard frame under one study: the room frame is drawIndoors, the cabin\'s own scene plus the live views of this very yard through its panes, so it shows that the lit interior costs no more than the yard it looks onto; it does not show what a night yard costs against a day one, which is the same.',hallDoorOpenMs:nightSpeed.hallMs,hallLive:nightSpeed.hallTime.live});
  console.log(`  speed (full, night): yard ${nightSpeed.yardMs} ms, living room ${nightSpeed.roomMs} ms (${nightSpeed.costRatio}x)`);

  // 64. The interior's build time: the first buildInside, in milliseconds, and the first indoor draw (where the lit programs are compiled). Recorded, not asserted.
  const built=await visitor();await built.goto(`${base}/?check&interior=1&tier=full`);await ready(built);
  await built.evaluate(()=>{const s=window.__space,build=s.buildInside.bind(s),draw=s.drawIndoors.bind(s);
    s.buildInside=()=>{if(s.inside||s.insideFailed||s.__buildMs!==undefined)return build();const t=performance.now();build();s.__buildMs=performance.now()-t;};
    s.drawIndoors=o=>{if(s.__firstDrawMs!==undefined)return draw(o);const t=performance.now();const r=draw(o);s.__firstDrawMs=performance.now()-t;return r;};});
  await walkIn(built);const buildTimes=await built.evaluate(()=>({buildMs:window.__space.__buildMs,firstIndoorDrawMs:window.__space.__firstDrawMs,lit:window.__space.inside.lit}));
  check('The interior\'s build time (the first buildInside) and its first indoor draw, in milliseconds (recorded, not asserted)',Number.isFinite(buildTimes.buildMs)&&buildTimes.buildMs>0&&buildTimes.lit===true,
    {buildMs:+buildTimes.buildMs?.toFixed(1),firstIndoorDrawMs:+buildTimes.firstIndoorDrawMs?.toFixed(1),note:'headless Chrome on the machine\'s GPU through ANGLE; one load, the page\'s first build after a cold start'});
  console.log(`  interior build: ${buildTimes.buildMs?.toFixed(1)} ms, first indoor draw ${buildTimes.firstIndoorDrawMs?.toFixed(1)} ms`);
  const builtQuiet=!built.consoleErrors.length&&!built.own.length;await built.context().close();

  // 65. No page or console errors in any of the light's visitors.
  check('No page or console errors in the light\'s visitors',noonQuiet&&liteQuiet&&momentQuiet&&builtQuiet&&nightSpeed.quiet,{noonQuiet,liteQuiet,momentQuiet,builtQuiet,nightSpeedQuiet:nightSpeed.quiet,lite:{consoleErrors:lite.consoleErrors,pageErrors:lite.own}});
  // ── The light's fix wave (checks 66–70), on one more visitor: light through openings, borrowed daylight, halos over the live panes, the fallback.
  const more=await visitor();await more.goto(`${base}/?check&interior=1&tier=full`);await ready(more);await studyLight(more,'night');await walkIn(more);
  // 66. The kitchen lit by fixture with the dining room out, from the dining room looking back at the kitchen: along the floor straight through the
  // kitchen-dining opening there is no ruled edge. Each floor patch is read with the kitchen lit and with every lamp out; its gain (lit over out,
  // which the boards' own pattern cancels from) must not step between neighbours 0.2 m apart by more than STEP_GAIN of the line's whole rise.
  const lineD=(s0+s1)/2,lineAs=Array.from({length:15},(_,k)=>+(shared.at-1.4+k*.2).toFixed(2)),linePoints=lineAs.map(a=>[a,lineD,0]);
  await stand(more,aim(0,[diningRoom.a[1]-1.1,lineD],[shared.at-.6,lineD,0]),1200);
  await setFixture(more,{lamps:fixtureLamps(),hearth:{fire:0,embers:0}});await more.waitForTimeout(800);const lineOut=await patches(more,linePoints,3);
  await setFixture(more,{lamps:fixtureLamps({kitchen:1}),hearth:{fire:0,embers:0}});await more.waitForTimeout(800);const lineOn=await patches(more,linePoints,3);
  await more.screenshot(shotJpeg(`${interiorDirectory}/light-kitchen-floor.jpg`));
  const gains=lineOn.rgb.map((c,i)=>lum(c)/Math.max(lum(lineOut.rgb[i]),1e-3)),rise=Math.max(...gains)-1,lineSteps=gains.slice(1).map((g,i)=>Math.abs(g-gains[i])/Math.max(rise,1e-6)),STEP_GAIN=.3,RISE_LEAST=.5;
  const lineWall=lineAs.findIndex(a=>a>shared.at)-1;
  check(`With the kitchen lit and the dining room out, the lamp's light runs on across the floor through the kitchen-dining opening with no ruled edge: between floor patches 0.2 m apart the gain (lit over out) steps by at most ${STEP_GAIN} of its whole rise, which is at least ${RISE_LEAST}`,
    lineOn.seen&&lineOut.seen&&rise>=RISE_LEAST&&lineSteps.every(v=>v<=STEP_GAIN),
    {along:lineAs,d:lineD,gains:gains.map(r3),steps:lineSteps.map(r3),limit:STEP_GAIN,rise:r3(rise),limitRise:RISE_LEAST,stepAtTheWallLine:r3(lineSteps[lineWall]),wallLineBetween:[lineAs[lineWall],lineAs[lineWall+1]],screen:lineOn.at,
      note:'before light passed through openings the patches past a = 7 kept a gain of 1 (none of the kitchen\'s lamp) and the step at the wall line was all of the rise'});
  // 67. The master bedroom by day is brighter toward its doorway (from the passage, d = 7, a 12-13) than at its far wall: the floor patch just inside the
  // doorway over the one by the far wall, by day (every lamp out), against the same two patches lit only by the night's even fill (every lamp and the fire
  // out), which gives what the boards alone make of them.
  const masterDoor=I.openings.find(o=>o.id==='passage-master'),doorMid=(masterDoor.span[0]+masterDoor.span[1])/2,masterNear=[doorMid,master.d[0]+.45,0],masterFar=[doorMid,master.d[1]-.45,0];
  const masterView=aim(0,[master.a[1]-1.2,(master.d[0]+master.d[1])/2],[doorMid,(master.d[0]+master.d[1])/2,0]);
  await studyLight(more,'day');await setFixture(more,{lamps:fixtureLamps(),hearth:{fire:0,embers:0}});await stand(more,masterView,1200);const masterDayFloor=await patches(more,[masterNear,masterFar],12);
  await more.screenshot(shotJpeg(`${interiorDirectory}/light-master-doorway.jpg`));
  await studyLight(more,'night');await setFixture(more,{lamps:fixtureLamps(),hearth:{fire:0,embers:0}});await stand(more,masterView,1200);const masterNightFloor=await patches(more,[masterNear,masterFar],12);
  const NEAR_DOOR=1.1,dayRatio=lum(masterDayFloor.rgb[0])/lum(masterDayFloor.rgb[1]),boardsRatio=lum(masterNightFloor.rgb[0])/lum(masterNightFloor.rgb[1]),doorGain=dayRatio/boardsRatio;
  check(`The master bedroom by day is brighter toward its doorway than at its far wall: the floor just inside the doorway over the floor by the far wall, against the same under the night's even fill, is at least ${NEAR_DOOR}`,
    masterDayFloor.seen&&masterNightFloor.seen&&doorGain>=NEAR_DOOR,{day:masterDayFloor.rgb,fill:masterNightFloor.rgb,dayRatio:r3(dayRatio),boardsRatio:r3(boardsRatio),gain:r3(doorGain),limit:NEAR_DOOR,near:masterNear,far:masterFar,screen:masterDayFloor.at});
  // 68. A lit lamp in front of a live roof window: from the back of the third bedroom looking up at its roof window past its hanging lamp, at night, the
  // halo's pixels that lie over the live pane (a ring about the glass, below and beside it, clear of the shade) are brighter with the lamp lit than out.
  const roof3=opening('bedroom-3'),lamp3=lampOf('bedroom-3'),bedroom3=I.rooms.find(r=>r.id==='bedroom-3'),roofPose=facing(roof3,[lamp3[0],bedroom3.d[1]-.4]);
  const ring=[[-.13,0],[.13,0],[0,-.13],[-.09,-.09],[.09,-.09]].map(([da,dz])=>[lamp3[0]+da,lamp3[1],lamp3[2]+dz]);
  await setFixture(more,{lamps:fixtureLamps({'bedroom-3':1}),hearth:{fire:0,embers:0}});await stand(more,roofPose,1200);
  const roofLive=await paneLive(more,roof3,roofPose),roofBox=await paneBox(more,roof3,roofPose,.04),ringAt=await project(more,ring);
  const overPane=ringAt.map((p,i)=>({p:p.map(Math.round),i})).filter(({p})=>roofBox&&p[0]>roofBox[0]+3&&p[0]<roofBox[2]-3&&p[1]>roofBox[1]+3&&p[1]<roofBox[3]-3);
  const ringBoxes=overPane.map(({p})=>crop(p,2)),haloLit=await indoorRead(more,ringBoxes);await more.screenshot(shotJpeg(`${interiorDirectory}/light-halo-window.jpg`));
  await setFixture(more,{lamps:fixtureLamps(),hearth:{fire:0,embers:0}});await more.waitForTimeout(800);const haloOut=await indoorRead(more,ringBoxes);
  const HALO_OVER=1.15,haloRatios=overPane.map((_,k)=>lum(meanRgb(haloLit.on[k]))/Math.max(lum(meanRgb(haloOut.on[k])),1e-3));
  check(`A lit lamp in front of a live roof window: the halo's pixels over the pane (at least two of a ring about the glass) are at least ${HALO_OVER} times as bright with the lamp lit as out, the pane live in both`,
    roofLive.live&&overPane.length>=2&&haloLit.ids.includes(roof3.id)&&haloOut.ids.includes(roof3.id)&&haloRatios.every(v=>v>=HALO_OVER),
    {paneBox:roofBox,ringOverPane:overPane.map(({p,i})=>({at:p,offset:ring[i].map((c,j)=>r3(c-lamp3[j]))})),lit:haloLit.on.map(rgbOf),out:haloOut.on.map(rgbOf),ratios:haloRatios.map(r3),limit:HALO_OVER,live:roofLive,pose:roofPose,
      note:'drawn with the rooms, before the views, the halo was cut away wherever the yard was drawn into the pane: those pixels were the same lit as out'});
  // 69. The fallback drawn by a real renderer: in the living room by day facing its window (live), the lit surfaces are given up (inside.fallBack(), what a
  // lit program that failed to compile calls); a frame is still drawn, the rooms are no longer lit, a hemisphere light is in their scene, the window is still live.
  await setFixture(more,null);await studyLight(more,'day');await stand(more,rainPose,1200);const beforeFall=await paneLive(more,living,rainPose);
  const fell=await more.evaluate(()=>{const s=window.__space;s.inside.fallBack();let hemispheres=0;s.inside.scene.traverse(o=>{if(o.isHemisphereLight)hemispheres++;});return {lit:s.inside.lit,hemispheres};});
  await more.waitForTimeout(1200);const fallFrame=await frameMean(more),afterFall=await paneLive(more,living,rainPose);await lightShot(more,'fallback');
  check('Given up for the flat light (inside.fallBack()) with the living window live, the room is still drawn (mean luminance above 0.1), inside.lit is false, its scene holds one hemisphere light, and the window is still live',
    beforeFall.live&&fell.lit===false&&fell.hemispheres===1&&fallFrame.lum>.1&&afterFall.live&&!more.own.length,{before:beforeFall,fell,frame:fallFrame,after:afterFall,pageErrors:more.own});
  // 70. No page or console errors in this visitor.
  const moreQuiet=!more.consoleErrors.length&&!more.own.length;await more.context().close();
  check('No page or console errors in the fix wave\'s visitor',moreQuiet,{consoleErrors:more.consoleErrors,pageErrors:more.own});
  if(errors.length)console.log(`Page errors: ${errors.join(' | ')}`);
}finally{await browser.close();stopNoon();await writeFile(`${directory}/space-browser-results.json`,JSON.stringify({results,errors},null,2)+'\n');
  if(interiorFrom!==null)await writeFile(`${interiorDirectory}/browser-results.json`,JSON.stringify({results:results.slice(interiorFrom),errors},null,2)+'\n');}
if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
