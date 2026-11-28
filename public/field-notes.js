import {calendar,clockLabel} from '../shared/world.js';
import {recapText,sameIdentity,sameInterval,validHistory,validSummary} from '../shared/field-notes.js';
import {VisitMemory,MEMORY_KEY,SESSION_KEY,forgetStoredPlace} from './visit-memory.js';

function noteTime(root,epoch,event) {
  const time=root.createElement('time'),c=calendar(epoch,event.at);
  time.textContent=`YEAR ${c.year} · DAY ${c.dayOfYear+1} · ${clockLabel(c.hour)}`;
  time.dateTime=new Date(event.at).toISOString();
  return time;
}

function dateRange(epoch,events) {
  const first=calendar(epoch,events.at(-1).at),last=calendar(epoch,events[0].at);
  const start=first.dayOfYear+1,end=last.dayOfYear+1;
  if(first.year!==last.year)return `Year ${first.year}, day ${start} – Year ${last.year}, day ${end}`;
  if(start===end)return `Year ${first.year}, day ${start}`;
  return `Year ${first.year}, days ${start}–${end}`;
}

export async function fetchNotes(interval,signal) {
  const response=await fetch(`/api/notes?${new URLSearchParams({interval:JSON.stringify(interval)})}`,{
    cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10_000)]),
  });
  if(!response.ok)throw new Error('Notes unavailable');
  const value=await response.json();
  if(!validSummary(value,interval))throw new Error('Invalid notes response');
  return value;
}

// Owns only the notes panel. The caller supplies the snapshot actually displayed.
export class FieldNotes {
  constructor({root=document,memory,request=fetchNotes,forgetPlace=forgetStoredPlace}={}) {
    this.root=root;this.request=request;
    if(!memory){
      let local,session;try{local=localStorage;session=sessionStorage;}catch{}
      try{if(performance.getEntriesByType('navigation')[0]?.type==='navigate')session?.removeItem(SESSION_KEY);}catch{}
      memory=new VisitMemory({local,session});
    }
    this.memory=memory;this.serial=0;this.summary=null;this.error=false;this.forgot=false;this.resetNotice=false;this.readHistory=null;
    // Set by the page while the 3D view is the painter; only the storage sentence reads it.
    this.inYard=false;
    this.$=selector=>root.querySelector(selector);
    this.forgetPlace=forgetPlace;
    this.undo=null;this.feedback='';
    this.$('#forget-visits').onclick=()=>this.undo?this.restoreVisit():this.forgetVisit();
    this.$('#retry-notes').onclick=()=>{this.error=false;this.render();this.load();};
    this.$('#notes-dialog').addEventListener('close',()=>{this.cancel();this.undo=null;this.feedback='';this.readHistory=null;});
  }
  forgetVisit() {
    this.cancel();
    const history=this.memory.forgetWithUndo();
    let restorePlace;
    try{restorePlace=this.forgetPlace(this.memory.local);}catch{this.memory.available=false;}
    if(history||restorePlace)this.undo={history,restorePlace,summary:this.summary,identity:this.snapshot?.notes};
    this.summary=null;this.error=false;this.forgot=true;this.resetNotice=false;
    this.feedback=this.undo?'Visit memory cleared. You can undo this until you close Field notes.':'Visit memory cleared.';
    this.render();
  }
  restoreVisit() {
    const {history,restorePlace,summary}=this.undo;
    this.undo=null;this.forgot=false;
    const restoredHistory=history&&this.memory.restore(history);
    let restoredPlace=false;
    try{restoredPlace=restorePlace?.();}catch{this.memory.available=false;}
    if(restoredHistory)this.summary=summary;
    if(restoredHistory&&restoredPlace)this.feedback='Visit history and your saved spot restored.';
    else if(restoredPlace)this.feedback='Your saved spot is restored.';
    else if(restoredHistory)this.feedback='Visit history restored.';
    else this.feedback='Your newer visit memory was kept.';
    if(!this.memory.available&&restoredHistory)this.feedback='Visit history restored for this tab.';
    this.render();this.load();this.acknowledge();
  }
  cancel() {this.serial++;this.pending?.abort();this.pending=null;}
  storageChanged(event) {
    if(event.key!==MEMORY_KEY&&event.key!==null)return;
    this.memory.storageChanged(event.newValue);
    if(event.newValue===null||this.undo?.identity&&this.memory.record&&!sameIdentity(this.undo.identity,this.memory.record.identity)){
      this.cancel();this.undo=null;this.feedback='';this.summary=null;this.error=false;
    }
    this.render();
  }
  update(snapshot,{live=false,valid=false,study=false,paused=false,visible=true}={}) {
    const mode=`${study}:${paused}:${visible}:${valid}`;
    if(mode!==this.mode){this.cancel();this.mode=mode;}
    const changed=this.snapshot!==snapshot;
    this.snapshot=snapshot;this.study=study;this.paused=paused;this.visible=visible;this.valid=valid;
    const generation=this.memory.generation;
    if(live&&valid&&this.undo?.identity&&validHistory(snapshot?.notes)&&!sameIdentity(this.undo.identity,snapshot.notes)){
      this.undo=null;this.feedback='';
    }
    if(!this.undo&&live&&valid&&visible&&(snapshot!==this.observedSnapshot||!this.memory.visit)){
      this.memory.observe(snapshot);this.observedSnapshot=snapshot;
    }
    if(generation!==this.memory.generation){this.cancel();this.summary=null;this.error=false;this.forgot=false;this.resetNotice=false;}
    if(changed||mode!==this.renderedMode||generation!==this.memory.generation){
      this.renderedMode=mode;this.render();
    }
    if(!this.undo&&this.$('#notes-dialog').open&&visible){this.captureReadHistory();this.load();this.acknowledge();}
  }
  captureReadHistory() {
    // Hold the history presented on opening (or its first loaded snapshot).
    // A later stream update must not extend what a pending recap acknowledges.
    if(!this.readHistory&&validHistory(this.snapshot?.notes))this.readHistory=structuredClone(this.snapshot.notes);
  }
  open() {
    this.readHistory=null;this.captureReadHistory();this.render();
    this.$('.notes-body').scrollTop=0;
    this.load();this.acknowledge();
  }
  async load() {
    const interval=this.memory.interval;
    if(!this.$('#notes-dialog').open||!this.visible||!interval||!validHistory(this.snapshot?.notes)||
      !sameIdentity(this.snapshot.notes,interval.identity)||this.pending||this.error||sameInterval(this.summary,interval))return;
    const serial=++this.serial,controller=new AbortController();this.pending=controller;this.render();
    try{
      const value=await this.request(interval,controller.signal);
      if(serial!==this.serial||!sameInterval(interval,this.memory.interval))return;
      if(!validSummary(value,interval))throw new Error('Invalid notes response');
      if(value.coverage==='reset'){
        // Keep reset handling local. A paused/study snapshot must never become an observation.
        this.memory.forget();this.summary=null;this.forgot=false;
        this.resetNotice=true;
      }else this.summary=value;
      this.error=false;
    }catch(error){if(serial===this.serial&&error.name!=='AbortError')this.error=true;}
    finally{if(serial===this.serial){this.pending=null;this.render();this.acknowledge();}}
  }
  acknowledge() {
    if(!this.visible||!this.$('#notes-dialog').open||!this.snapshot)return;
    // A failed/pending recap cannot consume unread history.
    if(this.memory.interval&&(!sameInterval(this.summary,this.memory.interval)||this.summary.coverage!=='complete'))return;
    if(this.pending||this.error)return;
    this.memory.read(this.readHistory);this.dot();
  }
  dot() {this.$('#note-dot').hidden=!this.memory.unread(this.snapshot?.notes);}
  renderEvents() {
    const {events=[],notes,world}=this.snapshot;
    const history=`${world.epoch}:${notes?.id}`,key=`${history}:${events[0]?.seq??0}`;
    if(key===this.listKey)return;
    this.listKey=key;
    // The snapshot is newest first. Each group's latest occurrence sets its place in the timeline.
    const groups=new Map();
    for(const event of events){
      const kind=JSON.stringify([event.type,event.text]);
      if(!groups.has(kind))groups.set(kind,[]);
      groups.get(kind).push(event);
    }
    const previous=this.listHistory===history?this.disclosures:new Map();
    this.listHistory=history;this.disclosures=new Map();
    const rows=[],list=this.$('#event-list');
    let refocus;
    for(const [kind,occurrences] of groups){
      const row=this.root.createElement('li'),event=occurrences[0];
      if(occurrences.length===1){
        const text=this.root.createElement('p');
        text.textContent=event.text;
        row.append(noteTime(this.root,world.epoch,event),text);
      }else{
        const details=this.root.createElement('details'),summary=this.root.createElement('summary');
        const range=this.root.createElement('span'),dates=this.root.createElement('ol');
        range.className='note-range';
        range.textContent=`${occurrences.length} times · ${dateRange(world.epoch,occurrences)}`;
        summary.append(event.text,range);
        dates.className='note-dates';
        for(const occurrence of occurrences){
          const item=this.root.createElement('li');
          item.append(noteTime(this.root,world.epoch,occurrence));dates.append(item);
        }
        const prior=previous.get(kind);
        details.open=prior?.details.open??false;
        if(prior&&this.root.activeElement===prior.summary)refocus=summary;
        details.append(summary,dates);row.append(details);
        this.disclosures.set(kind,{summary,details});
      }
      rows.push(row);
    }
    list.replaceChildren(...rows);
    refocus?.focus({preventScroll:true});
  }
  render() {
    const storageMessage=this.feedback||(this.memory.available?this.inYard?'This browser remembers your visit and where you stopped.':'This browser remembers your visit for your next field notes.':'Visits cannot be remembered on this browser. These notes are available for this visit.');
    const status=this.$('#visit-storage');
    if(status.textContent!==storageMessage)status.textContent=storageMessage;
    const button=this.$('#forget-visits'),label=this.undo?'Undo':'Forget visit memory';
    if(button.textContent!==label)button.textContent=label;
    if(!this.snapshot)return;
    const history=validHistory(this.snapshot.notes),interval=this.memory.interval;
    let text;
    if(!history)text='Visit history is unavailable. Recent notes are below.';
    else if(this.summary&&sameInterval(this.summary,interval))text=recapText(this.summary);
    else if(this.error)text='Earlier field notes could not be loaded.';
    else if(interval)text='Looking back through the field notes…';
    else if(this.resetNotice)text='The earlier visit could not be matched to this history. A new visit will be remembered here.';
    else if(this.forgot)text='Visit memory has been cleared. Your next live view will be remembered here.';
    else text='This browser will remember your visit. Small changes will be gathered here when you return.';
    // First visits open on the actual observations; promote the recap when there is history or a recovery action.
    this.$('#visit-recap').hidden = !!history && !interval && !this.resetNotice;
    this.$('#recap-heading').textContent=interval?'Since you were here':'A place to return to';
    this.$('#recap-text').textContent=text;
    this.$('#retry-notes').hidden=!this.error;
    this.$('#notes-mode').textContent=this.study?'Shared-world history · This light study is private.':this.paused?'Notes held with your paused view.':!this.valid?'Showing the last available history.':'';
    this.$('#notes-mode').hidden=!this.$('#notes-mode').textContent;
    this.renderEvents();
    this.dot();
  }
}
