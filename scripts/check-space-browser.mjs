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
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Each visitor gets a fresh context, so its localStorage starts empty.
async function visitor(size=viewport,init){
  const context=await browser.newContext({viewport:size,deviceScaleFactor:1});if(init)await context.addInitScript(init);
  const page=await context.newPage();const own=[];page.on('pageerror',e=>{own.push(e.message);errors.push(e.message);});
  await context.route('https://fonts.googleapis.com/**',route=>route.abort());page.own=own;return page;
}
// Ready: the 3D canvas is showing and the frame loop has stepped the walker at least once.
const ready=page=>page.waitForFunction(()=>window.__space?.renderer&&!document.querySelector('#space').hidden&&window.__space.lastStep!==null,null,{timeout:30_000});
const state=page=>page.evaluate(()=>structuredClone(window.__space.state));
const arrivalPose=page=>page.evaluate(async()=>structuredClone((await import('/shared/lakeside-space.js')).LAKESIDE_SPACE.arrival));
const near=(a,b,e)=>Math.abs(a.position[0]-b.position[0])<=e&&Math.abs(a.position[1]-b.position[1])<=e&&Math.abs(a.yaw-b.yaw)<=e&&Math.abs(a.pitch-b.pitch)<=e;
const shows2D=page=>page.evaluate(()=>{const visible=id=>{const e=document.querySelector(id);return !e.hidden&&getComputedStyle(e).display!=='none'&&e.getClientRects().length>0;};
  return {spaceHidden:document.querySelector('#space').hidden,painting:visible('#painting'),fallback:visible('#fallback')};});
async function hold(page,keys,ms){const start=performance.now();for(const k of keys)await page.keyboard.down(k);await wait(ms);for(const k of [...keys].reverse())await page.keyboard.up(k);return (performance.now()-start)/1000;}
try{
  // 1. The default page is the painting and never asks for three.js.
  const plain=await visitor(),fetched=[];plain.on('request',r=>fetched.push(r.url()));
  await plain.goto(base);await plain.waitForLoadState('load');await plain.waitForTimeout(2000);
  const threeRequests=fetched.filter(u=>u.includes('three-')),plainHidden=await plain.locator('#space').evaluate(e=>e.hidden);
  check('Default page loads without three.js and hides #space',!threeRequests.length&&plainHidden,{threeRequests,spaceHidden:plainHidden,requests:fetched.length});
  await plain.context().close();

  // 2. Arrival pose.
  const page=await visitor();await page.goto(`${base}/?space=1&check`);await ready(page);
  const arrival=await arrivalPose(page),arrived=await state(page),gl=await page.evaluate(()=>{const g=window.__space.renderer.getContext(),d=g.getExtension('WEBGL_debug_renderer_info');
    return {version:g.getParameter(g.VERSION),renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),...window.__space.renderer.info.render};});
  check('?space=1 arrives at the arrival pose',near(arrived,arrival,1e-9),{state:arrived,arrival,gl});
  await page.waitForTimeout(4000);await page.screenshot({path:`${directory}/arrival.png`});

  // 3. Two seconds of W walks east at walking pace.
  const before=await state(page),held=await hold(page,['KeyW'],2000);await page.waitForTimeout(200);const after=await state(page);
  const east=after.position[0]-before.position[0],drift=Math.abs(after.position[1]-before.position[1]);
  check('Holding W for 2 s walks 2.2–3.2 m east',east>=2.2&&east<=3.2&&drift<.01,{east,drift,heldSeconds:held,expectedAtWalkingPace:1.4*held,before,after});

  // 4. Forty seconds of Shift+W from four headings never leaves walkable ground (four visitors walk at once).
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

  // 5. An open dialog holds the walker still even while W stays down.
  await page.keyboard.down('KeyW');await page.waitForTimeout(300);
  await page.evaluate(()=>document.querySelector('#about-dialog').showModal());await page.waitForTimeout(100);
  const dialogStart=await state(page);await page.waitForTimeout(1000);const dialogEnd=await state(page);
  await page.keyboard.up('KeyW');await page.evaluate(()=>document.querySelector('#about-dialog').close());
  check('Opening #about-dialog while W is held stops walking',near(dialogStart,dialogEnd,0),{dialogStart,dialogEnd});

  // 6. Walk, turn and look, stand still, reload: the place is remembered.
  await hold(page,['KeyW','KeyE'],600);
  await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.down();await page.mouse.move(viewport.width/2-40,viewport.height/2+50,{steps:5});await page.mouse.up();
  await page.waitForTimeout(3500);
  const stopped=await state(page),stored=await page.evaluate(()=>localStorage.getItem('a-view:place:lakeside-cottage'));
  await page.reload();await ready(page);const remembered=await state(page);
  check('After 3.5 s still, a reload returns to the same place',near(stopped,remembered,1e-6)&&!near(stopped,arrival,.01)&&!!stored,{stopped,remembered,storedBeforeReload:stored&&JSON.parse(stored)});
  await page.waitForTimeout(4000);await page.screenshot({path:`${directory}/remembered.png`});

  // 7. Forget visit memory also forgets the place.
  await page.locator('#notes-button').click();await page.locator('#forget-visits').click();await page.keyboard.press('Escape');
  const afterForget=await page.evaluate(()=>localStorage.getItem('a-view:place:lakeside-cottage'));
  await page.reload();await ready(page);const forgotten=await state(page);
  check('Forget visit memory returns the next visit to the arrival pose',near(forgotten,arrival,1e-9),{state:forgotten,storedAfterForget:afterForget});
  await page.context().close();

  // 8. No WebGL2: the painting.
  const flat=await visitor(viewport,()=>{const original=HTMLCanvasElement.prototype.getContext;window.__webgl2Refused=0;
    HTMLCanvasElement.prototype.getContext=function(type,...rest){if(type==='webgl2'){window.__webgl2Refused++;return null;}return original.call(this,type,...rest);};});
  await flat.goto(`${base}/?space=1&check`);await flat.waitForLoadState('load');await flat.waitForTimeout(4000);
  const flatView=await shows2D(flat),refused=await flat.evaluate(()=>window.__webgl2Refused);
  check('Without WebGL2 the 2D view is shown',flatView.spaceHidden&&(flatView.painting||flatView.fallback)&&refused>0&&!flat.own.length,{...flatView,webgl2Refused:refused,pageErrors:flat.own});
  await flat.context().close();

  // 9. Context loss returns to the painting within 2 s.
  const lost=await visitor();await lost.goto(`${base}/?space=1&check`);await ready(lost);
  const lossStart=performance.now();
  await lost.evaluate(()=>window.__space.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  const returned=await lost.waitForFunction(()=>{const s=document.querySelector('#space'),p=document.querySelector('#painting'),f=document.querySelector('#fallback');return s.hidden&&(!p.hidden||!f.hidden);},null,{timeout:2000}).then(()=>true,()=>false);
  const lossSeconds=(performance.now()-lossStart)/1000,lostView=await shows2D(lost);
  check('WebGL context loss returns to the 2D view within 2 s',returned&&lostView.spaceHidden&&(lostView.painting||lostView.fallback),{...lostView,seconds:lossSeconds});
  await lost.context().close();

  // 10. Portrait phone viewport: field of view capped, frame drawn.
  const phone=await visitor({width:390,height:844});await phone.goto(`${base}/?space=1&check`);await ready(phone);
  const portrait=await phone.evaluate(()=>{const s=window.__space,g=s.renderer.getContext();s.renderer.render(s.scene,s.camera);
    const read=(x,y)=>{const b=new Uint8Array(4);g.readPixels(x,y,1,1,g.RGBA,g.UNSIGNED_BYTE,b);return [...b];};
    const w=g.drawingBufferWidth,h=g.drawingBufferHeight;return {fov:s.camera.fov,width:w,height:h,centre:read(w>>1,h>>1),corner:read(0,h-1)};});
  check('At 390 × 844 the vertical field of view is ≤ 75° and the frame is drawn',portrait.fov<=75&&portrait.centre.some((v,i)=>v!==portrait.corner[i]),portrait);
  await phone.context().close();
  if(errors.length)console.log(`Page errors: ${errors.join(' | ')}`);
}finally{await browser.close();await writeFile(`${directory}/space-browser-results.json`,JSON.stringify({results,errors},null,2)+'\n');}
if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
