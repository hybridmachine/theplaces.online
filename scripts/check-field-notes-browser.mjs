import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {WorldStore} from '../src/store.js';
import {identityOf,recapText} from '../shared/field-notes.js';
import {MEMORY_KEY,SESSION_KEY,PLACE_KEY} from '../public/visit-memory.js';

const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4175';
const directory=process.env.NOTES_VALIDATION_DIR||'docs/field-notes-validation';
await mkdir(directory,{recursive:true});
const results=[],errors=[],epoch=1_800_000_000_000;
const check=(name,pass,detail)=>{results.push({name,pass,...(detail===undefined?{}:{detail})});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
const store=new WorldStore(':memory:',epoch);
const first=store.snapshot(epoch),strand=store.snapshot(epoch+28_000),nextStrand=store.snapshot(strand.world.action.end);
let complete=nextStrand;while(complete.world.action)complete=store.snapshot(complete.world.action.end);
const day=store.snapshot(epoch+86_400_000),month=store.snapshot(epoch+30*86_400_000);
const request=(a,b)=>({identity:identityOf(b.notes),after:a.notes.head,through:b.notes.head});
const browser=await chromium.launch({headless:true,
  ...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),
  ...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}:{}),
});
async function fixture({previous,current,width=1440,fail=false,blocked=false}={}){
  const height=width===320?568:width===390?844:900;
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  const state={current,fail,notesRequests:0,delay:null};
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());
  await context.route('**/api/world',r=>r.fulfill({json:state.current}));
  await context.route('**/api/stream',r=>r.abort());
  await context.route('**/api/notes?*',async r=>{
    state.notesRequests++;
    if(state.delay)await state.delay;
    if(state.fail)return r.fulfill({status:503,body:'Unavailable'});
    const q=JSON.parse(new URL(r.request().url()).searchParams.get('interval'));
    await r.fulfill({json:state.reset?{...q,coverage:'reset',facts:[]}:store.notes(q)});
  });
  await context.addInitScript(({previous,key,blocked})=>{
    Object.defineProperty(performance,'now',{value:()=>10000});
    if(blocked){for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{get(){throw new Error('Storage blocked');}});return;}
    if(previous&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,
      identity:{id:previous.notes.id,worldId:previous.notes.worldId,sceneId:previous.notes.sceneId,epoch:previous.notes.epoch},
      observed:{cursor:previous.notes.head,at:previous.serverTime},read:previous.notes.head}));
  },{previous,key:MEMORY_KEY,blocked});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/?space=0`);await page.waitForSelector('#painting.ready');
  await page.waitForFunction(()=>document.querySelector('#event-list').children.length>0);
  return {context,page,state};
}
async function open(page){await page.locator('#notes-button').click();await page.waitForFunction(()=>!document.querySelector('#recap-text').textContent.includes('Looking back'));}
const memory=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),MEMORY_KEY);
const close=page=>page.locator('#notes-dialog .close-panel').click();
try{
  // Exercise the actual HTTP contract as well as the routed time fixtures below.
  const snapshot=await (await fetch(`${base}/api/world`)).json(),q=request(snapshot,snapshot);
  const url=`${base}/api/notes?${new URLSearchParams({interval:JSON.stringify(q)})}`;
  const response=await fetch(url),payload=await response.json();
  check('HTTP notes contract and no-store',response.ok&&response.headers.get('cache-control')==='no-store'&&payload.coverage==='complete'&&payload.facts.length===0);
  check('Malformed intervals return 400',(await fetch(`${base}/api/notes?interval=bad`)).status===400&&(await fetch(`${base}/api/notes?interval={}`)).status===400);
  check('HEAD and read-only methods',(await (await fetch(url,{method:'HEAD'})).text())===''&&(await fetch(url,{method:'POST'})).status===405);

  for(const [name,previous,current,width] of [
    ['first-visit',null,first,1440],['nest-progress',first,strand,1440],['nest-complete',strand,complete,1440],
    ['bird-habit',complete,day,1440],['cottage-only',day,month,1440],['quiet-return',day,day,1440],
    ['long-absence',first,month,1440],['portrait',first,month,390],['narrow-portrait',first,month,320],
  ]){
    const {context,page,state}=await fixture({previous,current,width});
    check(`${name}: no automatic panel`,!await page.locator('#notes-dialog').isVisible());
    await open(page);
    const text=await page.locator('#recap-text').textContent();
    const expected=previous?recapText(store.notes(request(previous,current))):'This browser will remember your visit. Small changes will be gathered here when you return.';
    const headerEntry=await page.locator('header #notes-button').isVisible();
    const recapVisible=await page.locator('#visit-recap').isVisible();
    check(`${name}: factual recap and notebook hierarchy`,text===expected&&headerEntry&&recapVisible===!!previous,{text,headerEntry,recapVisible});
    check(`${name}: quiet read`,await page.locator('#note-dot').isHidden());
    const fits=await page.locator('#notes-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().left>=0);
    check(`${name}: panel fits viewport`,fits);
    await page.screenshot({path:`${directory}/${name}.png`});
    if(name==='cottage-only'||name==='portrait'||name==='narrow-portrait'){
      const group=page.locator('#event-list details'),toggle=group.locator('summary');
      check(`${name}: repeated lights form one collapsed entry with a count`,
        await group.count()===1&&await page.locator('#event-list > li').count()===1&&
        !(await group.evaluate(el=>el.open))&&(await toggle.innerText()).includes(`${current.events.length} times`));
      await toggle.scrollIntoViewIfNeeded();await toggle.focus();
      const dialog=page.locator('#notes-dialog'),before=await toggle.boundingBox(),paper=await dialog.boundingBox();
      await page.keyboard.press('Enter');
      const expanded=await toggle.boundingBox(),openedPaper=await dialog.boundingBox();
      check(`${name}: expanding keeps the notebook and disclosure anchored`,
        Math.abs(openedPaper.y-paper.y)<1&&Math.abs(expanded.y-before.y)<1&&Math.abs(expanded.x-before.x)<1);
      await page.mouse.click(before.x+before.width/2,before.y+before.height/2);
      check(`${name}: clicking the same spot collapses the dates`,!(await group.evaluate(el=>el.open)));
      await toggle.press('Enter');
      const dates=await group.locator('time:visible').evaluateAll(els=>els.map(el=>el.dateTime));
      check(`${name}: expanding preserves every original timestamp in order`,
        JSON.stringify(dates)===JSON.stringify(current.events.map(event=>new Date(event.at).toISOString())));
      const closeButton=page.locator('#notes-dialog .close-panel'),top=(await closeButton.boundingBox()).y;
      await page.locator('#forget-visits').scrollIntoViewIfNeeded();
      check(`${name}: Close stays visible and clickable at the bottom of a long notebook`,
        await page.locator('.notes-body').evaluate(el=>el.scrollTop>0)&&
        await closeButton.evaluate((el,top)=>{
          const r=el.getBoundingClientRect();
          return Math.abs(r.y-top)<1&&r.height>=44&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
        },top));
      await closeButton.click();
      check(`${name}: closing from the bottom returns focus to Field notes`,
        await page.locator('#notes-dialog').isHidden()&&await page.locator('#notes-button').evaluate(el=>el===document.activeElement));
      await open(page);
      check(`${name}: reopening starts at the current visit recap`,await page.locator('.notes-body').evaluate(el=>el.scrollTop===0));
    }
    if(name==='long-absence'){
      check('Long absence is independent of recent-20 list',!await page.locator('#event-list').textContent().then(t=>t.includes('nest'))&&text.includes('nest'));
      await close(page);await page.reload();await page.waitForSelector('#painting.ready');await open(page);
      check('Reload preserves the recap interval',await page.locator('#recap-text').textContent()===text);
      await close(page);await page.locator('#notes-button').focus();await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      check('Keyboard opening, Escape, and focus return',await page.locator('#notes-dialog').isHidden()&&await page.locator('#notes-button').evaluate(el=>el===document.activeElement));
      check('Recap fetched only on demand and cached during visit',state.notesRequests===2,{requests:state.notesRequests});
    }
    await context.close();
  }
  {
    const {context,page}=await fixture({current:day,width:320});
    await open(page);
    const groups=page.locator('#event-list details'),firstName=groups.first().locator('summary');
    await firstName.click();
    const body=page.locator('.notes-body');
    await body.evaluate(el=>{
      const dates=el.querySelector('details[open] .note-dates');
      el.scrollTop+=dates.getBoundingClientRect().top-el.getBoundingClientRect().top+60;
    });
    check('Small phone: the current event stays readable above its scrolling dates',await firstName.evaluate(el=>{
      const r=el.getBoundingClientRect(),top=el.closest('.notes-body').getBoundingClientRect().top;
      return Math.abs(r.top-top)<1&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    }));
    await groups.last().locator('summary').click();
    await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    check('Small phone: scrolling past a group releases its event name',
      await firstName.evaluate(el=>el.getBoundingClientRect().bottom<=el.closest('.notes-body').getBoundingClientRect().top));
    await context.close();
  }
  {
    const {context,page,state}=await fixture({previous:first,current:strand});
    await page.locator('#pause-button').click();await open(page);
    const timeline=await page.locator('#event-list').textContent(),recap=await page.locator('#recap-text').textContent();
    const before=await memory(page);
    state.current=day;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(150);
    check('Pause holds timeline and recap against newer snapshots',timeline===await page.locator('#event-list').textContent()&&recap===await page.locator('#recap-text').textContent());
    check('Paused background snapshots do not advance observed memory',(await memory(page)).observed.at===before.observed.at);
    await close(page);await page.locator('#pause-button').click();await page.waitForFunction(()=>document.querySelector('#nest-detail').textContent.includes('completed'));
    await page.waitForFunction(()=>!document.querySelector('#note-dot').hidden);
    check('Newer notes remain unread until resume/display',await page.locator('#note-dot').isVisible());
    await page.locator('#about-button').click();await page.locator('[data-light="rain"]').click();await open(page);
    check('Study identifies shared-world history',(await page.locator('#notes-mode').textContent()).includes('Shared-world history'));
    const studyMemory=await memory(page);state.current=month;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(150);
    check('Private studies do not advance visit observations',(await memory(page)).observed.at===studyMemory.observed.at);
    await context.close();
  }
  {
    const {context,page,state}=await fixture({previous:first,current:month,fail:true});await open(page);
    check('Failed lookup is not described as no changes',(await page.locator('#recap-text').textContent()).includes('could not be loaded'));
    check('Failed recap leaves progress unread',await page.locator('#note-dot').isVisible());
    state.fail=false;await page.locator('#retry-notes').click();await page.waitForFunction(()=>document.querySelector('#recap-text').textContent.includes('nest was finished'));
    check('Explicit retry recovers history',await page.locator('#note-dot').isHidden());
    const spot=JSON.stringify({version:2,place:'cabin',floor:1,position:[5,6],yaw:1,pitch:.2});
    await page.evaluate(([key,spot])=>{
      localStorage.setItem('a-view:follow:lakeside-cottage','true');localStorage.setItem(key,spot);
    },[PLACE_KEY,spot]);
    const visit=()=>page.evaluate(key=>sessionStorage.getItem(key),SESSION_KEY);
    const place=()=>page.evaluate(key=>localStorage.getItem(key),PLACE_KEY);
    const previousVisit=await visit(),previousHistory=await memory(page),recap=await page.locator('#recap-text').textContent();
    await page.locator('#forget-visits').click();
    await page.waitForFunction(()=>document.querySelector('#recap-heading').textContent==='A place to return to');
    check('Forget resets recap and preserves Follow',await page.evaluate(()=>localStorage.getItem('a-view:follow:lakeside-cottage')==='true')&&!(await page.locator('#recap-text').textContent()).includes('nest was finished'));
    const undo=page.getByRole('button',{name:'Undo',exact:true});
    check('Forget clears visit and spot while keeping keyboard focus on Undo',await visit()===null&&await memory(page)===null&&await place()===null&&await undo.evaluate(el=>el===document.activeElement));
    await page.keyboard.press('Enter');
    check('Undo restores the recap, read progress, visit interval and cabin spot',await visit()===previousVisit&&JSON.stringify(await memory(page))===JSON.stringify(previousHistory)&&await place()===spot&&await page.locator('#recap-text').textContent()===recap);
    await page.reload();await page.waitForSelector('#painting.ready');await open(page);
    check('Restored visit and spot survive reload',await visit()===previousVisit&&await place()===spot&&await page.locator('#recap-text').textContent()===recap);
    await page.getByRole('button',{name:'Forget visit memory'}).click();await close(page);await open(page);
    await page.waitForFunction(()=>document.querySelector('#recap-text').textContent.startsWith('This browser will remember'));
    check('Closing Field notes discards Undo and leaves the spot forgotten',await undo.count()===0&&await place()===null);
    check('Forget notice clears once the new baseline is saved',(await memory(page)).observed.at===month.serverTime);
    await context.close();
  }
  {
    const {context,page,state}=await fixture({previous:first,current:strand});
    let release;state.delay=new Promise(r=>{release=r;});
    const requested=page.waitForRequest('**/api/notes?*');
    await page.locator('#notes-button').click();await requested;
    state.current=nextStrand;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(count=>document.querySelectorAll('#event-list time').length===count,nextStrand.events.length);
    state.delay=null;release();
    await page.waitForFunction(()=>!document.querySelector('#recap-text').textContent.includes('Looking back'));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    check('Delayed recap leaves later same-visit notes unread',(await memory(page)).read.seq===strand.notes.head.seq&&await page.locator('#note-dot').isVisible());
    await close(page);await open(page);
    check('Reopening acknowledges the newer recent notes',(await memory(page)).read.seq===nextStrand.notes.head.seq&&await page.locator('#note-dot').isHidden()&&state.notesRequests===1);
    await context.close();
  }
  {
    const {context,page,state}=await fixture({previous:first,current:strand});state.reset=true;
    await open(page);
    await page.waitForFunction(()=>document.querySelector('#recap-text').textContent.startsWith('This browser will remember'));
    check('History-reset notice clears once the new baseline is saved',(await memory(page)).observed.at===strand.serverTime);
    await context.close();
  }
  {
    const {context,page,state}=await fixture({previous:first,current:strand});
    let release;state.delay=new Promise(r=>{release=r;});
    await page.locator('#notes-button').click();
    await page.waitForFunction(()=>document.querySelector('#recap-text').textContent.includes('Looking back'));
    await close(page);state.delay=null;release();await page.waitForTimeout(100);
    check('Closing a pending recap does not acknowledge notes',await page.locator('#note-dot').isVisible());
    await open(page);const recap=await page.locator('#recap-text').textContent();
    const visit=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),SESSION_KEY);
    state.current=day;
    const other=await context.newPage();await other.goto(`${base}/?space=0`);await other.waitForSelector('#painting.ready');await open(other);
    await page.waitForTimeout(100);
    const retained=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),SESSION_KEY);
    check('Another tab preserves this visit baseline and recap',JSON.stringify(visit.baseline)===JSON.stringify(retained.baseline)&&recap===await page.locator('#recap-text').textContent());
    check('Read progress synchronizes across tabs',(await memory(page)).read.seq===day.notes.head.seq);
    await context.close();
  }
  {
    const {context,page}=await fixture({current:first,blocked:true});await open(page);
    check('Blocked storage retains usable field notes',(await page.locator('#visit-storage').textContent()).includes('cannot be remembered')&&await page.locator('#event-list li').count()>0);
    await context.close();
  }
  await writeFile(`${directory}/browser-results.json`,JSON.stringify({browser:await browser.version(),results,errors},null,2)+'\n');
  if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
}finally{store.close();await browser.close();}
