import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const directory=process.env.SPACE_VALIDATION_DIR||'docs/space-validation';await mkdir(directory,{recursive:true});
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
async function visitor(size=viewport,init){
  const context=await browser.newContext({viewport:size,deviceScaleFactor:1});if(init)await context.addInitScript(init);
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
  // 1. The default page is the painting and never asks for three.js, the 3D view's modules or its art.
  const plain=await visitor(),fetched=[];plain.on('request',r=>fetched.push(r.url()));
  await plain.goto(base);await plain.waitForLoadState('load');await plain.waitForTimeout(2000);
  const spaceRequests=fetched.filter(u=>SPACE_FILES.test(u)),plainHidden=await plain.locator('#space').evaluate(e=>e.hidden);
  check('Default page requests nothing of the 3D view (three-, /space/, lakeside-space-v1) and hides #space',!spaceRequests.length&&plainHidden,{spaceRequests,spaceHidden:plainHidden,requests:fetched.length});
  await plain.context().close();

  // 2. The 3D view loads the whole art bundle as WebP, without console errors.
  const page=await visitor(),bundle=new Map();
  page.on('response',r=>{if(r.url().includes('/lakeside-space-v1/'))bundle.set(r.url().split('/').pop(),{status:r.status(),type:r.headers()['content-type']});});
  await page.goto(`${base}/?space=1&check`);await ready(page);
  const {artFiles}=await import('../shared/lakeside-space-art.js'),wanted=artFiles().map(f=>f.file);
  const bundleFiles=Object.fromEntries(wanted.map(f=>[f,bundle.get(f)??null]));
  check(`?space=1&check loads all ${wanted.length} bundle files as image/webp with status 200 and no console errors`,
    wanted.length===12&&wanted.every(f=>bundle.get(f)?.status===200&&bundle.get(f)?.type==='image/webp')&&!page.consoleErrors.length,{files:bundleFiles,consoleErrors:page.consoleErrors});

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

  // 9. Forget visit memory on the default painting page also forgets the place.
  const painted=await visitor();await painted.goto(`${base}/?space=1&check`);await ready(painted);
  const walkedState=await painted.evaluate(()=>{window.__space.state={...window.__space.state,position:[1,0]};return structuredClone(window.__space.state);});
  await painted.waitForFunction(()=>localStorage.getItem('a-view:place:lakeside-cottage')!==null,null,{timeout:10_000});
  const seeded=await painted.evaluate(()=>localStorage.getItem('a-view:place:lakeside-cottage'));
  await painted.goto(base);await painted.waitForLoadState('load');
  await painted.locator('#notes-button').click();await painted.locator('#forget-visits').click();await painted.keyboard.press('Escape');
  const paintedAfterForget=await painted.evaluate(()=>localStorage.getItem('a-view:place:lakeside-cottage'));
  await painted.goto(`${base}/?space=1&check`);await ready(painted);const paintedReturn=await state(painted);
  check('Forget visit memory on the default page forgets the place for the next 3D visit',!!seeded&&paintedAfterForget===null&&near(paintedReturn,arrival,1e-9),
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

  // 13. The windows stay dark at night: the middle of the front-left window, seen from in front of the door under the night study,
  // is dark and darker than the stone beside it; under the day study the same point stays dark while the stone is lighter
  // (so the projection is on the glass, not the wall).
  const dark=await visitor({width:1440,height:810});await dark.goto(`${base}/?space=1&check`);await ready(dark);await studyLight(dark,'night');
  const win=await dark.evaluate(async()=>{
    const [{LAKESIDE_SPACE:S},{LAKESIDE_DRESSING:D,cabinFront,doorPosition},{terrainHeight}]=await Promise.all([import('/shared/lakeside-space.js'),import('/shared/lakeside-dressing.js'),import('/shared/space.js')]);
    // As cabin.js places it: `along` metres along the cabin's long axis from the door's own spot, its sill measured from the threshold.
    const w=D.cabin.windows.find(x=>x.id==='front-left'),{yaw,size:[,short]}=S.cabin,door=doorPosition(S,D),side=cabinFront(S),u=[Math.sin(yaw),Math.cos(yaw)],out=[Math.cos(yaw)*side,-Math.sin(yaw)*side];
    const da=D.cabin.door,edge=a=>terrainHeight(S,door[0]+u[0]*(a-da.along),door[1]+u[1]*(a-da.along));
    const threshold=Math.min(edge(da.along-da.width/2),edge(da.along+da.width/2));
    const centre=[door[0]+u[0]*(w.along-da.along),door[1]+u[1]*(w.along-da.along),threshold+w.sill+w.height/2];
    // and a point on the stone wall beside it, recorded for comparison
    const wall=[door[0]+u[0]*(w.along+w.width+.3-da.along),door[1]+u[1]*(w.along+w.width+.3-da.along),centre[2]];
    const at=[door[0]+out[0]*4,door[1]+out[1]*4];
    window.__space.state={position:at,yaw:Math.atan2(centre[0]-at[0],centre[1]-at[1]),pitch:.12};
    return {centre,wall,at};});
  await dark.waitForTimeout(1500);
  const [seen,beside]=await dark.evaluate(points=>{const s=window.__space,c=s.camera;c.updateMatrixWorld();
    // world [x, y, z] → three (x, z, −y), then through the camera to CSS pixels
    const e=c.matrixWorldInverse.elements,p=c.projectionMatrix.elements,m=(M,a)=>[0,1,2,3].map(r=>M[r]*a[0]+M[r+4]*a[1]+M[r+8]*a[2]+M[r+12]*a[3]);
    return points.map(([x,y,z])=>{const q=m(p,m(e,[x,z,-y,1]));return [(q[0]/q[3]+1)/2*innerWidth,(1-q[1]/q[3])/2*innerHeight];});},[win.centre,win.wall]);
  const night=await drawAndRead(dark,[seen,beside]),[nightWindow,nightWall]=night.pixels.map(luminance);
  await studyLight(dark,'day');await dark.waitForTimeout(1500);
  const day=await drawAndRead(dark,[seen,beside]),[dayWindow,dayWall]=day.pixels.map(luminance);
  check('Under the night study the front-left window is dark (luminance below 0.25) and darker than the wall beside it; by day it stays dark and the wall is lighter',
    seen.every(Number.isFinite)&&seen[0]>0&&seen[0]<1440&&seen[1]>0&&seen[1]<810&&nightWindow<.25&&nightWindow<nightWall&&dayWindow<.25&&dayWall>dayWindow+.1,
    {window:win,pixel:seen,wallPixel:beside,night:{window:{rgba:night.pixels[0],luminance:nightWindow},wall:{rgba:night.pixels[1],luminance:nightWall}},
      day:{window:{rgba:day.pixels[0],luminance:dayWindow},wall:{rgba:day.pixels[1],luminance:dayWall}}});
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
  if(errors.length)console.log(`Page errors: ${errors.join(' | ')}`);
}finally{await browser.close();await writeFile(`${directory}/space-browser-results.json`,JSON.stringify({results,errors},null,2)+'\n');}
if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
