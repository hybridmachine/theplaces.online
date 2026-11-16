import {mkdir,writeFile} from 'node:fs/promises';
import {WorldStore} from '../src/store.js';
import {calendar} from '../shared/world.js';
const epoch=1_800_000_000_000,day=86400_000,results=[];
for(const [days,seedOffset]of [[1,0],[30,0],[30,1],[30,987654],[365,0]]){
  const origin=epoch+seedOffset,store=new WorldStore(':memory:',origin),end=origin+days*day,start=performance.now();
  let yields=0,snapshot;
  try{
    for(;;){try{snapshot=store.snapshot(end);break;}catch(error){if(error.code!=='WORLD_CATCHING_UP')throw error;yields++;}}
    const elapsedMs=performance.now()-start;
    const actions=store.db.prepare("SELECT payload FROM events WHERE type='coincidence.started' ORDER BY at").all().map(e=>JSON.parse(e.payload));
    const gaps=actions.slice(1).map((a,i)=>(a.start-actions[i].start)/60000).sort((a,b)=>a-b);
    let windows=0,quiet=0,dayWindows=0,quietDay=0,index=0;
    for(let at=origin;at+300000<=end;at+=60000){
      while(index<actions.length&&actions[index].end<=at)index++;
      const empty=index===actions.length||actions[index].start>=at+300000;windows++;quiet+=empty;
      if([0,1,2,3,4,5].every(m=>calendar(origin,at+m*60000).light>=.45)){dayWindows++;quietDay+=empty;}
    }
    const otherActions=store.db.prepare("SELECT payload FROM events WHERE type='bird.action-started' OR type LIKE 'cottage.%'").all().map(e=>JSON.parse(e.payload));
    const row={realDays:days,seedOffset,elapsedMs,yields,episodes:actions.length,
      gapMinutes:{min:gaps[0],median:gaps[Math.floor(gaps.length/2)],mean:gaps.reduce((a,b)=>a+b,0)/gaps.length,max:gaps.at(-1)},
      activePercent:100*actions.reduce((n,a)=>n+a.end-a.start,0)/(days*day),quietWindowPercent:100*quiet/windows,quietDaylightWindowPercent:100*quietDay/dayWindows,
      overlapsWithBirdOrCottage:actions.filter(a=>otherActions.some(b=>a.start<b.end&&a.end>b.start)).length,
      stateBytes:Buffer.byteLength(JSON.stringify(snapshot.world.coincidences)),snapshotBytes:Buffer.byteLength(JSON.stringify(snapshot)),
      events:store.db.prepare("SELECT count(*) n FROM events WHERE type LIKE 'coincidence.%'").get().n,
      databaseBytes:store.db.prepare('PRAGMA page_count').get().page_count*store.db.prepare('PRAGMA page_size').get().page_size};
    results.push(row);console.log(`${days} days, seed +${seedOffset}: ${row.episodes} ripples, ${row.activePercent.toFixed(2)}% active, ${row.quietDaylightWindowPercent.toFixed(1)}% quiet daylight windows, ${Math.round(elapsedMs)} ms`);
    if(row.activePercent>=1||row.quietDaylightWindowPercent<80||row.quietWindowPercent<80)process.exitCode=1;
    if(days===1){
      const events=store.db.prepare('SELECT at,type,payload FROM events WHERE noteVisible=0 ORDER BY seq').all();
      await mkdir('docs/coincidences-validation',{recursive:true});await writeFile('docs/coincidences-validation/day-timeline.json',JSON.stringify(events.filter(e=>e.at<origin+day/(365/30)),null,2)+'\n');
    }
  }finally{store.close();}
}
await mkdir('docs/coincidences-validation',{recursive:true});
await writeFile('docs/coincidences-validation/state-results.json',JSON.stringify({node:process.version,epoch,results},null,2)+'\n');
