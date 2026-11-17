import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoliageMesh,foliageWeights,sampleFoliage,validateFoliageConfig} from '../shared/foliage.js';
import {LAKESIDE_FOLIAGE as config} from '../shared/lakeside-foliage.js';

test('foliage reconstructs the same poses without intervening frames',()=>{
  for(const patch of config.patches){
    const expected=sampleFoliage(18432.4,patch,config.seed);
    for(const time of [2,-1,999999,18,0])sampleFoliage(time,patch,config.seed);
    assert.deepEqual(sampleFoliage(18432.4,patch,config.seed),expected);
  }
});
test('calm is at rest and strong gusts stay inside the authored displacement envelope',()=>{
  for(const patch of config.patches)for(const time of [-3153600000,0,.001,17.3,18432,3153600000]){
    const calm=sampleFoliage(time,patch,config.seed,0);
    assert.equal(Math.abs(calm.bend)+Math.abs(calm.flutter)+Math.abs(calm.lift),0);
    for(const wind of [null,.05,.53,1]){
      const pose=sampleFoliage(time,patch,config.seed,wind);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(Math.hypot(Math.abs(pose.bend)+Math.abs(pose.flutter),pose.lift)<=patch.maxDisplacement);
    }
  }
});
test('motion remains continuous across phase wraps, including long elapsed times',()=>{
  const patch=config.patches[0];
  for(const time of [17.3,31.7,17300000,3153600000]){
    const a=sampleFoliage(time-.0001,patch),b=sampleFoliage(time+.0001,patch);
    for(const key of ['bend','flutter','lift'])assert.ok(Math.abs(a[key]-b[key])<.002);
  }
});
test('neighboring patches share gusts but retain different seeded responses',()=>{
  const p=config.patches[4],neighbor={...p,id:'neighbor',bounds:[p.bounds[0]+8,p.bounds[1],...p.bounds.slice(2)]};
  const a=sampleFoliage(12,p),b=sampleFoliage(12,neighbor);
  assert.ok(Math.abs(a.gust-b.gust)<.01);assert.notEqual(a.bend,b.bend);
});
test('mesh anchors and both side seams remain fixed; tip weights increase smoothly',()=>{
  for(const patch of config.patches){
    for(const u of [0,.1,.5,.9,1])assert.deepEqual(foliageWeights(u,patch.anchor[1],patch),[0,0]);
    for(const v of [0,.2,.5,.8,1])for(const u of [0,1])assert.deepEqual(foliageWeights(u,v,patch),[0,0]);
    const weights=[0,.25,.5,.75,1].map(t=>foliageWeights(.5,patch.type==='grass'?1-t:t,patch)[0]);
    assert.ok(weights.every((w,i)=>!i||w>=weights[i-1]));assert.equal(weights.at(-1),1);
    const mesh=createFoliageMesh(patch,config.atlasSize);assert.equal(mesh.length,patch.mesh[0]*patch.mesh[1]*36);
    assert.ok([...mesh].every(Number.isFinite));
  }
});
test('asset layout validates and rejects unsafe configuration before allocating GPU resources',()=>{
  assert.equal(validateFoliageConfig(config,1672,941),config);
  const reject=change=>{const c=structuredClone(config);change(c);assert.throws(()=>validateFoliageConfig(c,1672,941),/Invalid foliage/);};
  reject(c=>c.patches[0].maxDisplacement=Infinity);reject(c=>c.patches[0].anchor[1]=.5);
  reject(c=>c.patches[0].rect[0]=0);reject(c=>c.patches[1].rect=c.patches[0].rect);
  reject(c=>c.patches[0].bounds[0]=-1);reject(c=>c.patches[0].mesh=[0,3]);
  reject(c=>c.patches[1].id=c.patches[0].id);reject(c=>c.assets.day='');
});
import {foliageMotion,seedValue,windClock,WIND_WRAP} from '../shared/foliage.js';
test('foliage motion is the patch sampler with its hash and delay passed in',()=>{
  for(const patch of config.patches)for(const t of [0,12.5,1e3,1e7+.25]){
    const [x,y]=patch.bounds,{type,exposure,maxDisplacement}=patch;
    assert.deepEqual(foliageMotion(t,{type,exposure,maxDisplacement,random:seedValue(config.seed,patch.id),delay:x/520+y/1800},config.seed),sampleFoliage(t,patch,config.seed));
  }
});
test('the wind clock keeps small, wrapped values that carry the gust phases',()=>{
  const TAU=Math.PI*2,t=1e7+.25,clock=windClock(t);
  assert.equal(WIND_WRAP,4096);
  assert.ok(Object.values(clock).every(Number.isFinite));
  assert.ok(clock.time>=0&&clock.time<4096);
  for(const k of ['crest','broad','settle'])assert.ok(clock[k]>=0&&clock[k]<TAU,k);
  const d=3,mod=(v,n)=>((v%n)+n)%n,expected=Math.sin(mod(t-d,17.3)/17.3*TAU+941*.01);
  assert.ok(Math.abs(Math.sin(clock.crest-TAU*d/17.3)-expected)<1e-6);
  assert.ok(clock.strength>=0&&clock.strength<=1);
});
test('foliage with no exposure holds still',()=>{
  for(const t of [0,12.5,1e7+.25]){
    const m=foliageMotion(t,{type:'leaf',exposure:0,maxDisplacement:1,random:.4,delay:2});
    assert.deepEqual([m.bend,m.flutter,m.lift].map(Math.abs),[0,0,0]);
  }
});
