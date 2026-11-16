import {calendar,weather} from './world.js';
import {LAKESIDE_COINCIDENCES,validCoincidenceArt} from './lakeside-coincidences.js';

export const COINCIDENCE_RULES=1,COINCIDENCE_DECISION_MS=60_000,COINCIDENCE_REST_MS=720_000;
const locations=Object.keys(LAKESIDE_COINCIDENCES.locations);
// Integer-only hashing keeps each purpose independent of request/frame order.
function hash32(text){let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;n=Math.imul(n,0x846ca68b);return (n^(n>>>16))>>>0;}
const random=(state,index,purpose)=>hash32(`${state.seed}:${index}:${purpose}`)/4294967296;
const actionId=(at,index)=>`coincidence-v1-${at}-${index}`;

export function createCoincidenceState(epoch,at){
  return {rulesVersion:COINCIDENCE_RULES,introducedAt:at,seed:hash32(`stillwater:lakeside-cottage:coincidences:1:${epoch}:${at}`),
    decisionIndex:0,nextDecisionAt:at+COINCIDENCE_DECISION_MS,restUntil:at+COINCIDENCE_REST_MS,pending:null};
}
export function validCoincidenceState(state){
  if(!state||state.rulesVersion!==COINCIDENCE_RULES||!Number.isSafeInteger(state.introducedAt)||
    !Number.isInteger(state.seed)||state.seed<0||state.seed>0xffffffff||!Number.isSafeInteger(state.decisionIndex)||state.decisionIndex<0||
    !Number.isSafeInteger(state.nextDecisionAt)||state.nextDecisionAt!==state.introducedAt+(state.decisionIndex+1)*COINCIDENCE_DECISION_MS||
    !Number.isSafeInteger(state.restUntil)||state.restUntil<state.introducedAt+COINCIDENCE_REST_MS)return false;
  const a=state.pending;if(a===null)return true;
  return !!a&&a.id===actionId(state.introducedAt,state.decisionIndex)&&a.kind==='fish-ripple'&&a.rulesVersion===COINCIDENCE_RULES&&
    a.layoutVersion===LAKESIDE_COINCIDENCES.version&&locations.includes(a.locationId)&&Number.isSafeInteger(a.start)&&
    a.start===state.nextDecisionAt-COINCIDENCE_DECISION_MS&&Number.isSafeInteger(a.end)&&a.end-a.start>=8000&&a.end-a.start<=12000&&
    a.start>=state.introducedAt+COINCIDENCE_REST_MS&&state.restUntil===a.end+COINCIDENCE_REST_MS&&
    Number.isInteger(a.variationSeed)&&a.variationSeed>=0&&a.variationSeed<=0xffffffff;
}
export const coincidenceBoundary=state=>state?Math.min(state.nextDecisionAt,state.pending?.end??Infinity):Infinity;
const event=(action,at,type)=>({id:`${action.id}:${type}`,at,type:`coincidence.${type}`,text:'',noteVisible:0,payload:{...action}});

export function decideCoincidence(state,epoch,at){
  if(at!==state.nextDecisionAt)throw new Error('Off-grid coincidence decision');
  const index=state.decisionIndex+1,next={...state,decisionIndex:index,nextDecisionAt:at+COINCIDENCE_DECISION_MS};
  if(state.pending||at<state.restUntil)return {state:next,event:null};
  const c=calendar(epoch,at),w=weather(epoch,at);
  if(c.light<.45||w.rain>=.03||w.wind>=.30||random(state,index,'admission')>=1/24)return {state:next,event:null};
  const action={id:actionId(state.introducedAt,index),kind:'fish-ripple',rulesVersion:COINCIDENCE_RULES,layoutVersion:LAKESIDE_COINCIDENCES.version,
    locationId:locations[Math.floor(random(state,index,'location')*locations.length)],start:at,
    end:at+8000+Math.floor(random(state,index,'duration')*4001),variationSeed:hash32(`${state.seed}:${index}:shape`)};
  next.pending=action;next.restUntil=action.end+COINCIDENCE_REST_MS;
  return {state:next,event:event(action,at,'started')};
}
export function completeCoincidence(state,at){
  if(!state.pending||at!==state.pending.end)throw new Error('Off-boundary coincidence completion');
  return {state:{...state,pending:null},event:event(state.pending,at,'completed')};
}

export function sampleCoincidence(state,now,art=LAKESIDE_COINCIDENCES){
  if(!validCoincidenceState(state)||!validCoincidenceArt(art))return null;
  const a=state.pending,p=a&&art.locations[a.locationId];
  if(!p||a.layoutVersion!==art.version||!Number.isFinite(now)||now<=a.start||now>=a.end)return null;
  return {id:a.id,locationId:a.locationId,center:p.center,radius:p.radius,age:(now-a.start)/(a.end-a.start),variation:a.variationSeed/4294967296*Math.PI*2};
}
export function coincidenceFixture(seconds=4,locationId='shore-reflection'){
  const state=createCoincidenceState(0,0),start=COINCIDENCE_REST_MS;
  Object.assign(state,{decisionIndex:12,nextDecisionAt:start+COINCIDENCE_DECISION_MS,restUntil:start+10_000+COINCIDENCE_REST_MS,
    pending:{id:actionId(0,12),kind:'fish-ripple',rulesVersion:1,layoutVersion:1,locationId,start,end:start+10_000,variationSeed:42871*10000}});
  return {state,now:start+seconds*1000};
}
