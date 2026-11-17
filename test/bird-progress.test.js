import test from 'node:test';
import assert from 'node:assert/strict';
import {createBirdState,birdFixture,BIRD_ID,sampleBird,birdProgress} from '../shared/bird.js';
import {LAKESIDE_BIRD} from '../shared/lakeside-bird.js';
import {birdPose} from '../shared/world.js';
function cases(){
  const out=[],{locations,routes}=LAKESIDE_BIRD;
  for(const name of ['Oak perch','Sheltered bird','Roof perch','Oak flight','Shelter flight','Roof flight','nope']){
    const f=birdFixture(name);if(!f)continue;
    for(const rm of [false,true])for(const at of f.state.pending?[0,2000,f.state.pending.end]:[0])out.push({id:`fixture ${name} at ${at} rm ${rm}`,state:f.state,action:null,now:at,rm});
  }
  for(const id of Object.keys(locations)){
    const s=createBirdState(0,false);s.locationId=id;s.direction=id==='nest'?-1:locations[id].direction;
    out.push({id:`settled ${id}`,state:s,action:null,now:5000,rm:false});
    out.push({id:`settled ${id} rm`,state:s,action:null,now:5000,rm:true});
  }
  for(const [rid,r] of Object.entries(routes))for(const t of [0,.25,.5,1]){
    const s=createBirdState(0,false);s.locationId=r.from;s.direction=1;
    s.pending={id:'x',actor:BIRD_ID,rulesVersion:1,kind:'flight',from:r.from,to:r.to,routeId:rid,routeVersion:1,start:1000,end:1000+r.durationMs,phaseSeed:1.3};
    for(const rm of [false,true])out.push({id:`route ${rid} t ${t} rm ${rm}`,state:s,action:null,now:1000+t*r.durationMs,rm});
  }
  {const s=createBirdState(0,false);s.locationId='oak-perch';s.direction=1;
   s.pending={id:'c',actor:BIRD_ID,rulesVersion:1,kind:'call',from:'oak-perch',to:'oak-perch',start:1000,end:1000+5600,phaseSeed:.5,phrase:'oak-phrase-1',phraseStart:6000};
   out.push({id:'call',state:s,action:null,now:7000,rm:false});}
  {const s=createBirdState(0,false);s.locationId='oak-perch';s.direction=1;
   s.pending={id:'x',actor:BIRD_ID,rulesVersion:1,kind:'flight',from:'oak-perch',to:'roof-perch',routeId:'oak-perch:roof-perch',routeVersion:1,start:1000,end:1000+routes['oak-perch:roof-perch'].durationMs,phaseSeed:1.3};
   out.push({id:'before start',state:s,action:null,now:500,rm:false});}
  const c=createBirdState(0,true);
  for(const rm of [false,true]){
    out.push({id:`construction none rm ${rm}`,state:c,action:null,now:3000,rm});
    for(const t of [0,.2,.44,.5,.57,.8,1]){const a={start:1000,end:17000};out.push({id:`construction t ${t} rm ${rm}`,state:c,action:a,now:1000+t*16000,rm});}
  }
  out.push({id:'invalid',state:{...c,id:'bad'},action:null,now:0,rm:false});
  out.push({id:'null state',state:null,action:null,now:0,rm:false});
  return out;
}
const poses=()=>[0,.1,.2,.3,.44,.5,.57,.8,.99,1].map(t=>({t,pose:birdPose({start:1000,end:17000},1000+t*16000)})).concat([{t:'none',pose:birdPose(null,0)}]);

import {lifeLayout, birdPlace} from '../shared/lakeside-life.js';

// Captured from sampleBird and birdPose before they were rewritten on top of birdProgress; they must not change.
const EXPECTED = {
 "fixture Oak perch at 0 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "fixture Oak perch at 0 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "fixture Sheltered bird at 0 rm false": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": true,
  "wingPhase": 0,
  "locationId": "oak-shelter"
 },
 "fixture Sheltered bird at 0 rm true": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": true,
  "wingPhase": 0,
  "locationId": "oak-shelter"
 },
 "fixture Roof perch at 0 rm false": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "roof-perch"
 },
 "fixture Roof perch at 0 rm true": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "roof-perch"
 },
 "fixture Oak flight at 0 rm false": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "fixture Oak flight at 2000 rm false": {
  "x": 0.2087505980861244,
  "y": 0.22460680127523913,
  "scale": 1,
  "direction": -1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 74,
  "locationId": "nest"
 },
 "fixture Oak flight at 4000 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 148,
  "locationId": "nest"
 },
 "fixture Oak flight at 0 rm true": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "fixture Oak flight at 2000 rm true": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "fixture Oak flight at 4000 rm true": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "fixture Shelter flight at 0 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "fixture Shelter flight at 2000 rm false": {
  "x": 0.18449654900994153,
  "y": 0.2814368095633538,
  "scale": 1,
  "direction": -1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 74,
  "locationId": "oak-perch"
 },
 "fixture Shelter flight at 6000 rm false": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 222,
  "locationId": "oak-perch"
 },
 "fixture Shelter flight at 0 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "fixture Shelter flight at 2000 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "fixture Shelter flight at 6000 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "fixture Roof flight at 0 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "fixture Roof flight at 2000 rm false": {
  "x": 0.1997212927988856,
  "y": 0.25908412796777897,
  "scale": 0.9697119341563786,
  "direction": 1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 74,
  "locationId": "oak-perch"
 },
 "fixture Roof flight at 9000 rm false": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 333,
  "locationId": "oak-perch"
 },
 "fixture Roof flight at 0 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "fixture Roof flight at 2000 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "fixture Roof flight at 9000 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "settled nest": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "settled nest rm": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "settled oak-perch": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "settled oak-perch rm": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "settled oak-shelter": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": true,
  "wingPhase": 0,
  "locationId": "oak-shelter"
 },
 "settled oak-shelter rm": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": true,
  "wingPhase": 0,
  "locationId": "oak-shelter"
 },
 "settled roof-perch": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "roof-perch"
 },
 "settled roof-perch rm": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "roof-perch"
 },
 "route nest:oak-perch t 0 rm false": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 1.3,
  "locationId": "nest"
 },
 "route nest:oak-perch t 0 rm true": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "route nest:oak-perch t 0.25 rm false": {
  "x": 0.22703653333746074,
  "y": 0.23162043086020523,
  "scale": 1,
  "direction": -1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 38.3,
  "locationId": "nest"
 },
 "route nest:oak-perch t 0.25 rm true": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "route nest:oak-perch t 0.5 rm false": {
  "x": 0.2087505980861244,
  "y": 0.22460680127523913,
  "scale": 1,
  "direction": -1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 75.3,
  "locationId": "nest"
 },
 "route nest:oak-perch t 0.5 rm true": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "route nest:oak-perch t 1 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 149.3,
  "locationId": "nest"
 },
 "route nest:oak-perch t 1 rm true": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "route oak-perch:nest t 0 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 1.3,
  "locationId": "oak-perch"
 },
 "route oak-perch:nest t 0 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:nest t 0.25 rm false": {
  "x": 0.19136531044991964,
  "y": 0.2352386701626428,
  "scale": 1,
  "direction": 1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 38.3,
  "locationId": "oak-perch"
 },
 "route oak-perch:nest t 0.25 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:nest t 0.5 rm false": {
  "x": 0.2087505980861244,
  "y": 0.2246068012752391,
  "scale": 1,
  "direction": 1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 75.3,
  "locationId": "oak-perch"
 },
 "route oak-perch:nest t 0.5 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:nest t 1 rm false": {
  "x": 0.23400000000000004,
  "y": 0.24,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 149.3,
  "locationId": "oak-perch"
 },
 "route oak-perch:nest t 1 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:oak-shelter t 0 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 1.3,
  "locationId": "oak-perch"
 },
 "route oak-perch:oak-shelter t 0 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:oak-shelter t 0.25 rm false": {
  "x": 0.18624876104473498,
  "y": 0.26776194395091657,
  "scale": 1,
  "direction": -1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 56.8,
  "locationId": "oak-perch"
 },
 "route oak-perch:oak-shelter t 0.25 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:oak-shelter t 0.5 rm false": {
  "x": 0.17411782296650719,
  "y": 0.31190223166843783,
  "scale": 1,
  "direction": -1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 112.3,
  "locationId": "oak-perch"
 },
 "route oak-perch:oak-shelter t 0.5 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:oak-shelter t 1 rm false": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 223.3,
  "locationId": "oak-perch"
 },
 "route oak-perch:oak-shelter t 1 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-shelter:oak-perch t 0 rm false": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 1.3,
  "locationId": "oak-shelter"
 },
 "route oak-shelter:oak-perch t 0 rm true": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": true,
  "wingPhase": 0,
  "locationId": "oak-shelter"
 },
 "route oak-shelter:oak-perch t 0.25 rm false": {
  "x": 0.14693368793104253,
  "y": 0.35001502204270724,
  "scale": 1,
  "direction": 1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 56.8,
  "locationId": "oak-shelter"
 },
 "route oak-shelter:oak-perch t 0.25 rm true": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": true,
  "wingPhase": 0,
  "locationId": "oak-shelter"
 },
 "route oak-shelter:oak-perch t 0.5 rm false": {
  "x": 0.17411782296650719,
  "y": 0.31190223166843783,
  "scale": 1,
  "direction": 1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 112.3,
  "locationId": "oak-shelter"
 },
 "route oak-shelter:oak-perch t 0.5 rm true": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": true,
  "wingPhase": 0,
  "locationId": "oak-shelter"
 },
 "route oak-shelter:oak-perch t 1 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 223.3,
  "locationId": "oak-shelter"
 },
 "route oak-shelter:oak-perch t 1 rm true": {
  "x": 0.13098086124401914,
  "y": 0.3645058448459086,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": true,
  "wingPhase": 0,
  "locationId": "oak-shelter"
 },
 "route oak-perch:roof-perch t 0 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 1.3,
  "locationId": "oak-perch"
 },
 "route oak-perch:roof-perch t 0 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:roof-perch t 0.25 rm false": {
  "x": 0.2036168586694453,
  "y": 0.2623471007717023,
  "scale": 0.9625,
  "direction": 1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 84.55,
  "locationId": "oak-perch"
 },
 "route oak-perch:roof-perch t 0.25 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:roof-perch t 0.5 rm false": {
  "x": 0.2561303827751196,
  "y": 0.3091126461211477,
  "scale": 0.88,
  "direction": 1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 167.8,
  "locationId": "oak-perch"
 },
 "route oak-perch:roof-perch t 0.5 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route oak-perch:roof-perch t 1 rm false": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 334.3,
  "locationId": "oak-perch"
 },
 "route oak-perch:roof-perch t 1 rm true": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "route roof-perch:oak-perch t 0 rm false": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 1.3,
  "locationId": "roof-perch"
 },
 "route roof-perch:oak-perch t 0 rm true": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "roof-perch"
 },
 "route roof-perch:oak-perch t 0.25 rm false": {
  "x": 0.3090679405978992,
  "y": 0.37810458792383433,
  "scale": 0.7975,
  "direction": -1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 84.55,
  "locationId": "roof-perch"
 },
 "route roof-perch:oak-perch t 0.25 rm true": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "roof-perch"
 },
 "route roof-perch:oak-perch t 0.5 rm false": {
  "x": 0.2561303827751196,
  "y": 0.3091126461211477,
  "scale": 0.88,
  "direction": -1,
  "flying": true,
  "carrying": false,
  "hidden": false,
  "wingPhase": 167.8,
  "locationId": "roof-perch"
 },
 "route roof-perch:oak-perch t 0.5 rm true": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "roof-perch"
 },
 "route roof-perch:oak-perch t 1 rm false": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": -1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 334.3,
  "locationId": "roof-perch"
 },
 "route roof-perch:oak-perch t 1 rm true": {
  "x": 0.3277511961722488,
  "y": 0.41870350690754515,
  "scale": 0.76,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "roof-perch"
 },
 "call": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "before start": {
  "x": 0.1854066985645933,
  "y": 0.24654622741764082,
  "scale": 1,
  "direction": 1,
  "flying": false,
  "carrying": false,
  "hidden": false,
  "wingPhase": 0,
  "locationId": "oak-perch"
 },
 "construction none rm false": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "construction t 0 rm false": {
  "x": 0.234,
  "y": 0.24,
  "flying": true,
  "carrying": false,
  "direction": 1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "construction t 0.2 rm false": {
  "x": 0.38639218632607064,
  "y": 0.4140195341848235,
  "flying": true,
  "carrying": false,
  "direction": 1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 118.4,
  "locationId": "nest"
 },
 "construction t 0.44 rm false": {
  "x": 0.49,
  "y": 0.62,
  "flying": false,
  "carrying": false,
  "direction": 1,
  "legacy": true,
  "scale": 0.85,
  "wingPhase": 260.48,
  "locationId": "nest"
 },
 "construction t 0.5 rm false": {
  "x": 0.49,
  "y": 0.62,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 0.85,
  "wingPhase": 296,
  "locationId": "nest"
 },
 "construction t 0.57 rm false": {
  "x": 0.49,
  "y": 0.62,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 0.85,
  "wingPhase": 337.44,
  "locationId": "nest"
 },
 "construction t 0.8 rm false": {
  "x": 0.3542536631994665,
  "y": 0.31959953211666875,
  "flying": true,
  "carrying": true,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 473.6,
  "locationId": "nest"
 },
 "construction t 1 rm false": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 592,
  "locationId": "nest"
 },
 "construction none rm true": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "construction t 0 rm true": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 0,
  "locationId": "nest"
 },
 "construction t 0.2 rm true": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 118.4,
  "locationId": "nest"
 },
 "construction t 0.44 rm true": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 260.48,
  "locationId": "nest"
 },
 "construction t 0.5 rm true": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 296,
  "locationId": "nest"
 },
 "construction t 0.57 rm true": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 337.44,
  "locationId": "nest"
 },
 "construction t 0.8 rm true": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 473.6,
  "locationId": "nest"
 },
 "construction t 1 rm true": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1,
  "legacy": true,
  "scale": 1,
  "wingPhase": 592,
  "locationId": "nest"
 },
 "invalid": null,
 "null state": null
};
const POSES = {
 "0": {
  "x": 0.234,
  "y": 0.24,
  "flying": true,
  "carrying": false,
  "direction": 1
 },
 "1": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1
 },
 "0.1": {
  "x": 0.3015788880540947,
  "y": 0.31545783245679937,
  "flying": true,
  "carrying": false,
  "direction": 1
 },
 "0.2": {
  "x": 0.38639218632607064,
  "y": 0.4140195341848235,
  "flying": true,
  "carrying": false,
  "direction": 1
 },
 "0.3": {
  "x": 0.4632569496619084,
  "y": 0.5159367956423742,
  "flying": true,
  "carrying": false,
  "direction": 1
 },
 "0.44": {
  "x": 0.49,
  "y": 0.62,
  "flying": false,
  "carrying": false,
  "direction": 1
 },
 "0.5": {
  "x": 0.49,
  "y": 0.62,
  "flying": false,
  "carrying": false,
  "direction": -1
 },
 "0.57": {
  "x": 0.49,
  "y": 0.62,
  "flying": false,
  "carrying": false,
  "direction": -1
 },
 "0.8": {
  "x": 0.3542536631994665,
  "y": 0.31959953211666875,
  "flying": true,
  "carrying": true,
  "direction": -1
 },
 "0.99": {
  "x": 0.23644484133472518,
  "y": 0.24042939615379774,
  "flying": true,
  "carrying": true,
  "direction": -1
 },
 "none": {
  "x": 0.234,
  "y": 0.24,
  "flying": false,
  "carrying": false,
  "direction": -1
 }
};
const L = lifeLayout(), BIRD = L.bird;
const norm = v => JSON.parse(JSON.stringify(v));

test('sampleBird and birdPose give exactly what they gave before the refactor', () => {
  for (const c of cases()) assert.deepStrictEqual(norm(sampleBird(c.state, c.action, c.now, {reducedMotion: c.rm})), EXPECTED[c.id], c.id);
  for (const x of poses()) assert.deepStrictEqual(norm(x.pose), POSES[x.t], `pose ${x.t}`);
});
test('birdProgress says which kind of place the bird is at', () => {
  const by = Object.fromEntries(cases().map(c => [c.id, birdProgress(c.state, c.action, c.now, {reducedMotion: c.rm})]));
  assert.equal(by['null state'], null); assert.equal(by.invalid, null);
  assert.deepStrictEqual(by['settled oak-perch'], {kind: 'settled', locationId: 'oak-perch', direction: 1});
  assert.equal(by['call'].kind, 'settled'); assert.equal(by['before start'].kind, 'settled');
  assert.equal(by['route oak-perch:roof-perch t 0.5 rm true'].kind, 'settled');
  for (const [id, p] of Object.entries(by)) if (id.startsWith('route ') && id.endsWith('rm false')) {
    assert.equal(p.kind, 'route', id); assert.equal(p.u, p.t * p.t * (3 - 2 * p.t), id);
    assert.equal(p.routeId, id.split(' ')[1]); assert.equal(`${p.from}:${p.to}`, p.routeId);
  }
  assert.equal(by['construction none rm false'].kind, 'settled'); assert.equal(by['construction none rm false'].locationId, 'nest');
  assert.equal(by['construction t 0.5 rm true'].kind, 'settled');
  const f = by['construction t 0.5 rm false']; assert.equal(f.kind, 'forage'); assert.equal(f.t, .5); assert.equal(f.pick, 3); assert.equal(f.flying, false); assert.equal(f.carrying, false);
  assert.equal(by['construction t 0.8 rm false'].carrying, true); assert.equal(by['construction t 0.2 rm false'].flying, true);
});
test('birdPlace puts the bird in the yard', () => {
  const state = (id, rm = false) => cases().find(c => c.id === id), prog = id => { const c = state(id); return birdProgress(c.state, c.action, c.now, {reducedMotion: c.rm}); };
  assert.equal(birdPlace(null, L), null);
  const perch = birdPlace({kind: 'settled', locationId: 'oak-perch', direction: 1}, L);
  assert.deepStrictEqual(perch.position, BIRD.locations['oak-perch'].point); assert.equal(perch.heading, BIRD.locations['oak-perch'].facing);
  assert.equal(perch.flying, false); assert.equal(perch.climb, 0);
  for (const [id, r] of Object.entries(BIRD.routes)) {
    const at = u => birdPlace({kind: 'route', routeId: id, from: r.from, to: r.to, t: u, u, wingPhase: 2}, L);
    for (const e of [0, 1]) for (let d = 0; d < 3; d++) assert.ok(Math.abs(at(e).position[d] - r.points[e ? 3 : 0][d]) < 1e-12, id);
    assert.equal(at(0).flying, false); assert.equal(at(.5).flying, true); assert.equal(at(.5).wingPhase, 2);
    const a = BIRD.locations[r.from].point, b = BIRD.locations[r.to].point, want = Math.atan2(b[0] - a[0], b[1] - a[1]);
    let off = Math.abs(at(.5).heading - want) % (2 * Math.PI); if (off > Math.PI) off = 2 * Math.PI - off;
    assert.ok(off < Math.PI / 2, `${id} heads ${off}`);
  }
  const ground = birdPlace(prog('construction t 0.5 rm false'), L);
  assert.deepStrictEqual(ground.position, BIRD.forage.points[3]); assert.equal(ground.flying, false); assert.equal(ground.carrying, false);
  const out = birdPlace(prog('construction t 0.2 rm false'), L), back = birdPlace(prog('construction t 0.8 rm false'), L);
  assert.equal(out.flying, true); assert.equal(back.carrying, true);
  assert.equal(birdPlace({kind: 'route', routeId: 'nope', from: 'nest', to: 'oak-perch', t: .5, u: .5, wingPhase: 0}, L), null);
});
