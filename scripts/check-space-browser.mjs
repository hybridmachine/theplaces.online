import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {LAKESIDE_SPACE as S} from '../shared/lakeside-space.js';
import {LAKESIDE_DRESSING as D,cabinFrame,cabinFront,doorPosition,openingCentre,oakPlan} from '../shared/lakeside-dressing.js';
import {lifeLayout,birdPlace} from '../shared/lakeside-life.js';
import {terrainHeight} from '../shared/space.js';
import {eyePosition} from '../shared/walker.js';
import {birdFixture,createBirdState,birdProgress} from '../shared/bird.js';
import {coincidenceFixture} from '../shared/coincidences.js';
import {doorOutward} from '../shared/threshold.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const directory=process.env.SPACE_VALIDATION_DIR||'docs/space-validation';await mkdir(directory,{recursive:true});
const interiorDirectory=process.env.INTERIOR_VALIDATION_DIR||'docs/interior-validation';let interiorFrom=null;
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
  await setPose(inside,atDoor(.6));await inside.waitForTimeout(1500);const openAngle=await doorAngle(inside);
  await inside.evaluate(()=>{window.__veil=[];window.__veilTimer=setInterval(()=>window.__veil.push(+(window.__space.canvas.style.opacity||1)),20);});
  await hold(inside,['KeyW'],900);await inside.waitForTimeout(600);
  const entered=await indoorsState(inside),veil=await inside.evaluate(()=>{clearInterval(window.__veilTimer);return window.__veil;});
  check('With ?interior=1 the door opens for a visitor at it; holding W fades out and in and sets them in the entry hall',
    openAngle>1&&entered.place==='cabin'&&entered.floor===0&&entered.room==='entry hall'&&Math.min(...veil)<.5&&entered.opacity==='1',
    {openAngle,entered,darkestOpacity:Math.min(...veil),samples:veil.length});
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
  if(errors.length)console.log(`Page errors: ${errors.join(' | ')}`);
}finally{await browser.close();await writeFile(`${directory}/space-browser-results.json`,JSON.stringify({results,errors},null,2)+'\n');
  if(interiorFrom!==null)await writeFile(`${interiorDirectory}/browser-results.json`,JSON.stringify({results:results.slice(interiorFrom),errors},null,2)+'\n');}
if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
