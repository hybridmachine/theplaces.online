import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {WorldStore} from '../src/store.js';

const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4176';
const directory=process.env.KEEP_VALIDATION_DIR||'docs/keep-view-validation';
const extraOnly=process.env.KEEP_EXTRA==='1';
await mkdir(directory,{recursive:true});
const results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,...(detail===undefined?{}:{detail})});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
const store=new WorldStore(':memory:',1_800_000_000_000),snapshot=store.snapshot(1_800_000_360_000);
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),
  ...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}:{}),});
const dataBytes=url=>Buffer.from(url.split(',')[1],'base64');
async function pixels(png){return sharp(png).ensureAlpha().raw().toBuffer();}
async function difference(a,b){const x=await pixels(a),y=await pixels(b);if(x.length!==y.length)return Infinity;let sum=0,max=0;for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);sum+=d;max=Math.max(max,d);}return {mean:sum/x.length,max};}
async function fixture({width=1280,height=800,fallback=false,unavailable=false,motion='reduce',dpr=1}={}){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:motion,acceptDownloads:true});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());
  await context.route('**/api/world',r=>unavailable?r.fulfill({status:503,body:'Unavailable'}):r.fulfill({json:snapshot}));
  if(fallback)await context.route('**/assets/lakeside-sky-v1/**',r=>r.abort());
  await context.addInitScript(()=>{
    window.__elapsed=0;Object.defineProperty(performance,'now',{value:()=>10000+window.__elapsed});
    window.EventSource=class {close(){}};
    window.__urls=new Set();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);window.__urls.add(url);return url;};
    URL.revokeObjectURL=url=>{window.__urls.delete(url);return revoke(url);};
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(()=>document.querySelector('#fallback').complete&&document.querySelector('#fallback').naturalWidth>0);
  if(!fallback&&!unavailable)await page.waitForSelector('#painting.ready');
  if(!unavailable)await page.waitForFunction(()=>document.querySelector('#world-time').textContent!=='15:30');
  // Let optional layers finish. With a fixed client clock, these remain stable.
  await page.waitForTimeout(1700);
  return {context,page};
}
async function ready(page){await page.waitForFunction(()=>!document.querySelector('#keep-download').disabled);}
async function open(page){await page.locator('#keep-button').click();await ready(page);}
const preview=page=>page.locator('#keep-preview').evaluate(c=>c.toDataURL());
const caption=page=>page.locator('.keep-caption').textContent();
async function close(page){
  // Native focus restoration precedes the queued close event. Wait for the
  // controller's cleanup as well as focus before checking resource lifetime.
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#keep-dialog').open&&document.querySelector('#keep-preview').width===1&&document.activeElement===document.querySelector('#keep-button'));
}
try{
  if(!extraOnly){
  {
    const {context,page}=await fixture({motion:'no-preference'});
    const before=await page.locator('#world').screenshot({style:'.chrome,#toast,#welcome{visibility:hidden!important}'});
    await open(page);const held=await preview(page),meta=await caption(page);
    const diff=await difference(before,dataBytes(held));
    check('Composite matches the displayed WebGL, life canvas and scene shading',diff.mean<.6&&diff.max<12,diff);
    check('Capture has a live label',meta.includes('Live view'));
    await page.locator('#keep-note').fill('Rain on the lake. A light in the window.');await ready(page);
    await page.screenshot({path:`${directory}/desktop.png`});
    await page.evaluate(()=>{window.__elapsed=40000;});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
    check('Note editing, live clock advance and resize retain capture pixels and metadata',held===await preview(page)&&meta===await caption(page));
    const expectedURL=await page.locator('#keep-open-image').getAttribute('href');
    const expected=await page.evaluate(async url=>Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),expectedURL);
    const downloadEvent=page.waitForEvent('download');await page.locator('#keep-download').click();const download=await downloadEvent;
    const exported=await readFile(await download.path());await writeFile(`${directory}/keepsake.png`,exported);
    check('Download uses the prepared PNG bytes',exported.equals(Buffer.from(expected)));
    check('PNG filename records the captured world time and mode',/lakeside-cottage-year-1-day-136-.*-live-\d+\.png$/.test(download.suggestedFilename()),download.suggestedFilename());
    const dims=await sharp(dataBytes(held)).metadata(),pad=Math.max(18,Math.round(dims.width*.035));
    const extracted=await sharp(exported).extract({left:pad,top:pad,width:dims.width,height:dims.height}).png().toBuffer();
    check('Postcard preserves painting pixels without controls or caption overlap',(await difference(extracted,dataBytes(held))).max===0);
    await page.waitForFunction(()=>document.activeElement===document.querySelector('#keep-button'));
    check('Download closes dialog and restores focus',await page.locator('#keep-dialog').isHidden());
    check('Acknowledgement does not claim completed saving',(await page.locator('#toast').textContent()).startsWith('Download started.'));
    await open(page);
    check('A previous download remains available if the browser did not save it',await page.locator('#keep-last-image').getAttribute('href')===expectedURL);
    await close(page);
    check('Closing releases temporary image URLs but retains the latest download',await page.evaluate(()=>window.__urls.size)===1);
    await context.close();
  }
  for(const width of [320,390,800,1440]){
    const {context,page}=await fixture({width,height:844});
    const fits=await page.locator('.tools button').evaluateAll(elements=>elements.filter(e=>!e.hidden).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>=44&&r.height>=44;}));
    check(`${width}px: all view controls fit and retain touch targets`,fits);
    await page.locator('#keep-button').focus();await page.keyboard.press('Enter');await ready(page);
    check(`${width}px: dialog fits without horizontal overflow`,await page.locator('#keep-dialog').evaluate(e=>{const r=e.getBoundingClientRect();return e.scrollWidth<=e.clientWidth&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
    await page.locator('#keep-note').fill('Quiet 🌙 by the lake');await ready(page);
    await page.screenshot({path:`${directory}/view-${width}.png`});
    const held=await preview(page);await page.setViewportSize({width,height:360});
    await page.locator('#keep-download').scrollIntoViewIfNeeded();
    check(`${width}px: short viewport keeps actions reachable and capture intact`,await page.locator('#keep-download').isVisible()&&held===await preview(page));
    await close(page);check(`${width}px: Escape returns keyboard focus`,await page.locator('#keep-button').evaluate(e=>e===document.activeElement));
    await context.close();
  }
  {
    const {context,page}=await fixture();
    await page.locator('#pause-button').click();await open(page);
    check('Paused and reduced-motion labels survive together',(await caption(page)).includes('Paused view / Reduced motion'));
    await close(page);await page.locator('#about-button').click();await page.locator('[data-light="night"]').click();await open(page);
    check('Private study retains paused state and identifies study time',(await caption(page)).includes('Private light study: Night / Paused view')&&(await caption(page)).includes('Study time:'));
    await close(page);check('Closing preserves private study and pause',await page.locator('#return-live').isVisible()&&await page.locator('#pause-button').getAttribute('aria-pressed')==='true');
    await page.locator('#return-live').click();await page.evaluate(()=>{window.__elapsed=60000;});await open(page);
    check('Expired connection produces a held-view label',(await caption(page)).includes('Last displayed view / Connection lost'));
    await close(page);await context.close();
  }
  for(const unavailable of [false,true]){
    const {context,page}=await fixture({fallback:true,unavailable});
    const before=await page.locator('#world').screenshot({style:'.chrome,#toast,#welcome{visibility:hidden!important}'});
    await open(page);const diff=await difference(before,dataBytes(await preview(page)));
    check(`Fallback ${unavailable?'without':'with'} world: pixels match visible original painting and overlays`,diff.mean<.6&&diff.max<12,diff);
    check(`Fallback ${unavailable?'without':'with'} world: honest caption`,(await caption(page)).includes('Static painting')&&(!unavailable||(await caption(page)).includes('World date unavailable')));
    await close(page);await context.close();
  }
  {
    const {context,page}=await fixture();
    await page.evaluate(()=>{window.__getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='2d'&&!this.id?null:window.__getContext.call(this,type,...args);};});
    await page.locator('#keep-button').click();await page.waitForSelector('#keep-retry-capture:not([hidden])');
    check('Failed capture shows no invented preview or downloadable image',await page.locator('#keep-details').isHidden()&&await page.locator('#keep-download').isDisabled());
    await page.evaluate(()=>{HTMLCanvasElement.prototype.getContext=window.__getContext;});
    await page.locator('#keep-retry-capture').click();await ready(page);
    check('Explicit recapture recovers a complete frame',await page.locator('#keep-details').isVisible());
    await close(page);await context.close();
  }
  {
    const {context,page}=await fixture();
    await page.evaluate(()=>{window.__toBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb){cb(null);};});
    await page.locator('#keep-button').click();await page.waitForSelector('#keep-retry-export:not([hidden])');
    const held=await preview(page);await page.locator('#keep-note').fill('A note that must survive.');
    await page.waitForSelector('#keep-retry-export:not([hidden])');
    check('Encoding failure retains preview and note',held===await preview(page)&&await page.locator('#keep-note').inputValue()==='A note that must survive.');
    await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=window.__toBlob;});await page.locator('#keep-retry-export').click();await ready(page);
    check('Export retry uses the same capture',held===await preview(page));
    await page.evaluate(()=>{window.__click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){throw new Error('Download blocked');};});
    await page.locator('#keep-download').click();
    check('Download dispatch failure keeps dialog and Open image fallback',await page.locator('#keep-dialog').isVisible()&&await page.locator('#keep-open-image').isVisible()&&(await page.locator('#keep-status').textContent()).includes('could not start'));
    await page.screenshot({path:`${directory}/download-error.png`});
    await page.evaluate(()=>{HTMLAnchorElement.prototype.click=window.__click;});
    await close(page);check('Cancel releases unused object URLs',await page.evaluate(()=>window.__urls.size)===0);
    await context.close();
  }
  {
    const {context,page}=await fixture();
    await page.evaluate(()=>{
      window.__pendingBlobs=[];window.__toBlob=HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob=function(cb,...args){window.__toBlob.call(this,blob=>window.__pendingBlobs.push(()=>cb(blob)),...args);};
    });
    await page.locator('#keep-button').click();await page.waitForFunction(()=>window.__pendingBlobs.length===1);
    await page.locator('#keep-note').fill('The newest note');await page.waitForFunction(()=>window.__pendingBlobs.length===2);
    await page.evaluate(()=>window.__pendingBlobs.shift()());
    check('An older encoding cannot enable a stale download',await page.locator('#keep-download').isDisabled());
    await close(page);await page.evaluate(()=>window.__pendingBlobs.shift()());
    check('Closing during encoding prevents late URLs and dialog resurrection',await page.evaluate(()=>window.__urls.size)===0&&await page.locator('#keep-dialog').isHidden());
    await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=window.__toBlob;});await open(page);
    check('A new capture works after cancelling pending work',await page.locator('#keep-note').inputValue()==='');
    await close(page);await context.close();
  }
  }
  for(const fallback of [false,true]){
    const {context,page}=await fixture({width:390,height:844,fallback});
    await open(page);const original=await preview(page);await close(page);
    await page.mouse.move(190,390);await page.mouse.down();await page.mouse.move(335,390,{steps:5});await page.mouse.up();
    const before=await page.locator('#world').screenshot({style:'.chrome,#toast,#welcome{visibility:hidden!important}'});
    await open(page);const moved=await preview(page),diff=await difference(before,dataBytes(moved));
    check(`${fallback?'Fallback':'GPU'} portrait capture preserves visitor panning`,original!==moved&&diff.mean<.6&&diff.max<12,diff);
    await close(page);await context.close();
  }
  {
    const {context,page}=await fixture({width:1800,height:1100,dpr:2});
    await open(page);const size=await page.locator('#keep-preview').evaluate(c=>({width:c.width,height:c.height}));
    check('High-DPI capture has bounded dimensions and the viewport aspect',size.width===2560&&Math.abs(size.width/size.height-1800/1100)<.002,size);
    await close(page);await page.setViewportSize({width:390,height:844});await open(page);
    const narrow=await page.locator('#keep-preview').evaluate(c=>({width:c.width,height:c.height}));
    check('High-DPI portrait preserves backing resolution',narrow.width===624&&narrow.height===1350,narrow);
    for(let i=0;i<12;i++){await page.keyboard.press('Tab');check(`Modal keyboard focus stays inside (${i+1})`,await page.locator('#keep-dialog').evaluate(d=>d.contains(document.activeElement)));}
    await close(page);await context.close();
  }
  {
    const {context,page}=await fixture();await open(page);const held=await preview(page),meta=await caption(page);
    await page.evaluate(()=>{window.__lose=document.querySelector('#painting').getContext('webgl').getExtension('WEBGL_lose_context');window.__lose.loseContext();});
    await page.waitForFunction(()=>document.querySelector('#painting').style.visibility==='hidden');
    check('GPU context loss cannot alter an existing capture',held===await preview(page)&&meta===await caption(page));
    await close(page);await open(page);
    check('Capture after context loss identifies the visible fallback',(await caption(page)).includes('Static painting'));
    await page.evaluate(()=>{const timeout=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>timeout(fn,delay===8000?50:delay,...args);});
    const downloaded=page.waitForEvent('download');await page.locator('#keep-download').click();await downloaded;
    await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('show'));
    check('Faded download toast has no invisible tab stop',await page.locator('#toast a').evaluate(a=>a.tabIndex===-1));
    await context.close();
  }
}catch(error){errors.push(error.stack);console.error(error);}
finally{
  await browser.close();store.close();
  await writeFile(`${directory}/${extraOnly?'extra-browser-results':'browser-results'}.json`,JSON.stringify({results,errors},null,2)+'\n');
  if(errors.length||results.some(r=>!r.pass))process.exitCode=1;
}
