import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldStore} from '../src/store.js';
import {WorldClient} from '../public/world-client.js';
import {sceneText,SceneDescriber} from '../public/scene-description.js';
import {calendar,weather} from '../shared/world.js';
import {LAKESIDE_COINCIDENCES,validCoincidenceArt} from '../shared/lakeside-coincidences.js';
import {createCoincidenceState,validCoincidenceState,decideCoincidence,completeCoincidence,sampleCoincidence,coincidenceFixture,COINCIDENCE_REST_MS} from '../shared/coincidences.js';
const epoch=1_800_000_000_000,day=86400_000;
function firstAction(at=epoch){
  let state=createCoincidenceState(at,at);
  for(let i=0;i<1440;i++){
    state=decideCoincidence(state,at,state.nextDecisionAt).state;
    if(state.pending)return state.pending;
  }
  throw new Error('No seeded episode in a real day');
}
const history=store=>store.db.prepare('SELECT * FROM events ORDER BY seq').all();

test('sparse opportunities obey actual conditions, rest, canonical time, and valid state',()=>{
  for(const origin of [epoch,epoch+1,epoch+987654]){
    let state=createCoincidenceState(origin,origin),lastEnd=null,episodes=0;
    for(let i=0;i<30*1440;i++){
      const result=decideCoincidence(state,origin,state.nextDecisionAt);state=result.state;
      assert.ok(validCoincidenceState(state));
      if(!state.pending)continue;
      const a=state.pending,c=calendar(origin,a.start),w=weather(origin,a.start);episodes++;
      assert.ok(c.light>=.45&&w.rain<.03&&w.wind<.30);
      assert.ok(a.start-(lastEnd??origin)>=COINCIDENCE_REST_MS);
      assert.equal(result.event.noteVisible,0);assert.equal(result.event.at,a.start);
      state=completeCoincidence(state,a.end).state;lastEnd=a.end;assert.ok(validCoincidenceState(state));
    }
    assert.ok(episodes>100&&episodes<600);
  }
  assert.throws(()=>decideCoincidence(createCoincidenceState(epoch,epoch),epoch,epoch+1),/Off-grid/);
});

test('invalid state and unavailable layout cannot invent a ripple',()=>{
  const {state,now}=coincidenceFixture(4);assert.ok(validCoincidenceState(state));assert.ok(validCoincidenceArt(LAKESIDE_COINCIDENCES));
  for(const change of [{rulesVersion:2},{seed:NaN},{decisionIndex:-1},{nextDecisionAt:1},{restUntil:0},{pending:undefined},
    {pending:{...state.pending,locationId:'shore-rock'}},{pending:{...state.pending,end:Infinity}},
    {pending:{...state.pending,start:0}},{pending:{...state.pending,variationSeed:-1}}]){
    assert.equal(validCoincidenceState({...state,...change}),false);assert.equal(sampleCoincidence({...state,...change},now),null);
  }
  assert.equal(sampleCoincidence(state,now,null),null);
  assert.equal(sampleCoincidence(state,now,{...LAKESIDE_COINCIDENCES,version:2}),null);
  assert.equal(sampleCoincidence(state,now,{...LAKESIDE_COINCIDENCES,locations:{'shore-reflection':null}}),null);
  assert.equal(sampleCoincidence(state,state.pending.start),null);assert.equal(sampleCoincidence(state,state.pending.end),null);
  assert.equal(sampleCoincidence(state,now).age,.4);
});

test('irregular sampling and unobserved catch-up produce identical states, revisions, and ordered history',()=>{
  const a=new WorldStore(':memory:',epoch),b=new WorldStore(':memory:',epoch);
  try{
    for(let at=epoch;at<epoch+day;at+=13_731)a.advance(at);
    const first=a.snapshot(epoch+day),second=b.snapshot(epoch+day);
    assert.deepEqual({...first,notes:{...first.notes,id:second.notes.id}},second);assert.deepEqual(history(a),history(b));
    const events=history(a);assert.ok(events.some(e=>e.type==='coincidence.started'));
    for(let i=1;i<events.length;i++)assert.ok(events[i].at>=events[i-1].at);
  }finally{a.close();b.close();}
});

test('restart during an episode preserves phase and completes exactly once',()=>{
  const directory=mkdtempSync(join(tmpdir(),'a-view-ripple-')),file=join(directory,'world.sqlite');
  try{
    const a=firstAction();let store=new WorldStore(file,epoch),before=store.snapshot(a.start+3000);store.close();
    store=new WorldStore(file,a.start+4000);const after=store.snapshot(a.start+3000);assert.deepEqual(after,before);
    assert.deepEqual(sampleCoincidence(after.world.coincidences,a.start+3000),sampleCoincidence(before.world.coincidences,a.start+3000));
    assert.equal(store.snapshot(a.end).world.coincidences.pending,null);store.snapshot(a.end+1);
    assert.equal(store.db.prepare("SELECT count(*) n FROM events WHERE type='coincidence.completed'").get().n,1);store.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('coincidences preserve the other subsystems and their semantic event histories',()=>{
  const active=new WorldStore(':memory:',epoch),quiet=new WorldStore(':memory:',epoch);
  try{
    const state=quiet.snapshot(epoch).world;state.coincidences.restUntil=epoch+2*day;
    quiet.db.prepare('UPDATE world SET state=?').run(JSON.stringify(state));
    const a=active.snapshot(epoch+day),b=quiet.snapshot(epoch+day);
    for(const key of ['environment','bird','cottage','nest','action'])assert.deepEqual(a.world[key],b.world[key]);
    const other=store=>history(store).filter(e=>!e.type.startsWith('coincidence.')).map(({seq,...e})=>e);
    assert.deepEqual(other(active),other(quiet));
  }finally{active.close();quiet.close();}
});

test('v4 upgrades preserve existing history and introduce no backfilled coincidences',()=>{
  for(const upgradeAt of [epoch+day,epoch+1000]){
    const directory=mkdtempSync(join(tmpdir(),'a-view-ripple-upgrade-')),file=join(directory,'world.sqlite');
    try{
      let store=new WorldStore(file,epoch);const saved=store.snapshot(epoch+300_000),old={...saved.world,version:4};delete old.coincidences;
      store.db.prepare('UPDATE world SET state=?').run(JSON.stringify(old));const events=history(store);store.close();
      store=new WorldStore(file,upgradeAt);const migrated=JSON.parse(store.db.prepare('SELECT state FROM world').get().state);
      assert.equal(migrated.version,5);assert.equal(migrated.coincidences.introducedAt,Math.max(upgradeAt,old.updatedAt));
      assert.equal(migrated.coincidences.pending,null);assert.deepEqual(history(store),events);
      for(const key of ['epoch','environment','bird','cottage','nest','action'])assert.deepEqual(migrated[key],old[key]);
      assert.equal(store.notesId,saved.notes.id);store.close();
      store=new WorldStore(file,upgradeAt+1);assert.deepEqual(JSON.parse(store.db.prepare('SELECT state FROM world').get().state),migrated);store.close();
    }finally{rmSync(directory,{recursive:true,force:true});}
  }
});

test('action state and hidden history roll back together when the transaction fails',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const action=firstAction(),before=store.snapshot(action.start-1),events=history(store);
    store.db.exec("CREATE TRIGGER reject_ripple BEFORE INSERT ON events WHEN NEW.type='coincidence.started' BEGIN SELECT RAISE(ABORT,'blocked'); END");
    assert.throws(()=>store.advance(action.start),/blocked/);
    assert.deepEqual(JSON.parse(store.db.prepare('SELECT state FROM world').get().state),before.world);assert.deepEqual(history(store),events);
    store.db.exec('DROP TRIGGER reject_ripple');assert.equal(store.snapshot(action.start).world.coincidences.pending.id,action.id);
    store.snapshot(action.start);assert.equal(history(store).filter(e=>e.type==='coincidence.started').length,1);
  }finally{store.close();}
});

test('clients hold before admission and completion, skip missed episodes, and reject incompatible worlds',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    let elapsed=0;const action=firstAction(),client=new WorldClient({clock:()=>elapsed});
    assert.ok(client.accept(store.snapshot(action.start-1)));elapsed=2000;assert.equal(client.now(),action.start-1);assert.ok(client.needsRefresh());
    assert.ok(client.accept(store.snapshot(action.start+2000)));assert.equal(client.snapshot.world.coincidences.pending.id,action.id);
    elapsed+=20_000;assert.equal(client.now(),action.end-1);
    const complete=store.snapshot(action.end+1000);assert.ok(client.accept(complete));assert.equal(sampleCoincidence(complete.world.coincidences,client.now()),null);
    for(const version of [6,999])assert.equal(new WorldClient().accept({...complete,world:{...complete.world,version}}),false);
    assert.equal(new WorldClient().accept({...complete,world:{...complete.world,coincidences:null}}),false);
    assert.equal(client.accept(store.snapshot(action.end+1000)),false);
  }finally{store.close();}
});

test('ripples do not add notes or announcements, and descriptions follow visible displayed state',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const action=firstAction(),before=store.snapshot(action.start-1),active=store.snapshot(action.start+3000),now=active.serverTime;
    assert.deepEqual(active.events,before.events);assert.deepEqual(active.notes,before.notes);
    const text=sceneText(active,now,{coincidenceActive:true}),quiet=sceneText(active,now);
    assert.match(text.description,/small ripple/);assert.equal(text.announcement,quiet.announcement);
    for(const option of [{study:'day'},{reducedMotion:true},{coincidenceActive:false}])assert.doesNotMatch(sceneText(active,now,{coincidenceActive:true,...option}).description,/small ripple/);
    assert.match(sceneText(active,now,{coincidenceActive:true,paused:true}).description,/small ripple.*paused/);
    assert.doesNotMatch(sceneText(active,action.end,{coincidenceActive:true}).description,/small ripple/);
    const facts=store.notes({identity:active.notes,after:before.notes.head,through:active.notes.head});assert.equal(facts.facts.length,0);
  }finally{store.close();}
});

test('the description follows the drawn ripple between label refreshes, without a new announcement',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const action=firstAction(),active=store.snapshot(action.start+3000),now=active.serverTime;
    const described=[],announced=[];
    const scene=new SceneDescriber({describe:text=>described.push(text),announce:text=>announced.push(text)});
    // Label refresh while the renderer is drawing the ripple, held by a pause.
    scene.update(active,now,{paused:true,coincidenceActive:true});
    assert.match(described.at(-1),/small ripple.*paused/);assert.equal(announced.length,1);
    // Further frames with the same drawn state write nothing.
    assert.equal(scene.rendered(active,now,{paused:true,coincidenceActive:true}),false);assert.equal(described.length,1);
    // A resize crops the ripple out: the next frame stops drawing it at the same held time.
    assert.equal(scene.rendered(active,now,{paused:true,coincidenceActive:false}),true);
    assert.doesNotMatch(described.at(-1),/small ripple/);assert.match(described.at(-1),/paused/);
    // Panning back draws it again before any label timer fires.
    assert.equal(scene.rendered(active,now,{paused:true,coincidenceActive:true}),true);
    assert.match(described.at(-1),/small ripple/);
    assert.equal(announced.length,1);
  }finally{store.close();}
});

test('the description follows the room the visitor walks into between label refreshes, without a new announcement',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const snapshot=store.snapshot(epoch+3000),now=snapshot.serverTime,described=[],announced=[];
    const scene=new SceneDescriber({describe:text=>described.push(text),announce:text=>announced.push(text)});
    scene.update(snapshot,now,{room:'entry hall'});
    assert.match(described.at(-1),/^Inside the cabin, in the entry hall\./);assert.equal(announced.length,1);
    // Frames in the same room write nothing.
    assert.equal(scene.rendered(snapshot,now,{room:'entry hall'}),false);assert.equal(described.length,1);
    // Each room crossed is named at once, even one passed through between refreshes, and out in the yard none is.
    for(const room of ['living room','kitchen',null]){
      assert.equal(scene.rendered(snapshot,now,{room}),true);
      if(room)assert.match(described.at(-1),new RegExp(`^Inside the cabin, in the ${room}\\.`));else assert.doesNotMatch(described.at(-1),/Inside the cabin/);
    }
    assert.equal(scene.rendered(snapshot,now,{}),false,'no room given is the yard');
    assert.equal(described.length,4);assert.equal(announced.length,1);
  }finally{store.close();}
});
