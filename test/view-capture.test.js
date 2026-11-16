import test from 'node:test';
import assert from 'node:assert/strict';
import {captureMetadata,wrapCaption,NOTE_LIMIT,MAX_CAPTURE_EDGE} from '../public/view-capture.js';
import {SCENES,calendar,viewConditions} from '../shared/world.js';

const scene=SCENES[0],epoch=1_800_000_000_000;
test('capture date uses the rendered calendar and the same one-based day as field notes',()=>{
  const c=calendar(epoch,epoch),metadata=captureMetadata(scene,c,{capturedAt:123});
  assert.equal(metadata.dateLabel,'Year 1 / Day 136 / 15:30');
  assert.equal(metadata.modeLabel,'Live view');
  assert.match(metadata.filename,/lakeside-cottage-year-1-day-136-1530-live-123\.png$/);
  c.hour=0;c.year=20;
  assert.equal(metadata.dateLabel,'Year 1 / Day 136 / 15:30');
  assert.ok(Object.isFrozen(metadata));
});
test('study, pause, disconnection, fallback and reduced motion retain all qualifiers',()=>{
  const c=viewConditions(epoch,epoch,'night').calendar;
  const metadata=captureMetadata(scene,c,{study:'night',paused:true,disconnected:true,staticPainting:true,reducedMotion:true,capturedAt:123});
  assert.equal(metadata.dateLabel,'Study time: Year 1 / Day 136 / 00:30');
  assert.equal(metadata.modeLabel,'Private light study: Night / Paused view / Connection lost / Static painting / Reduced motion');
  assert.match(metadata.filename,/study-night-paused-disconnected-static/);
  assert.ok(!metadata.modeLabel.includes('Live view'));
});
test('an undated fallback never invents a world date or claims to be live',()=>{
  const metadata=captureMetadata(scene,null,{reconnecting:true,capturedAt:123});
  assert.equal(metadata.dateLabel,'World date unavailable');
  assert.equal(metadata.modeLabel,'Static painting');
  assert.match(metadata.filename,/undated-/);
});
test('unpaused stale and reconnecting views have explicit provenance',()=>{
  const c=calendar(epoch,epoch);
  assert.equal(captureMetadata(scene,c,{disconnected:true}).modeLabel,'Last displayed view / Connection lost');
  assert.equal(captureMetadata(scene,c,{reconnecting:true}).modeLabel,'Last displayed view / Reconnecting');
  assert.equal(captureMetadata(scene,c,{paused:true}).modeLabel,'Paused view');
});
test('caption wrapping preserves words and Unicode without overrunning narrow cards',()=>{
  const measure=s=>Array.from(s).length;
  for(const text of ['Rain on the lake. A light in the window.','x'.repeat(NOTE_LIMIT),'Quiet 🌙 by the lake','湖畔の夕暮れ'.repeat(10),'a\n\n    b']){
    const lines=wrapCaption(text,12,measure);
    assert.ok(lines.every(line=>measure(line)<=12));
    assert.equal(lines.join('').replace(/\s/g,''),text.replace(/\s/g,''));
    assert.ok(lines.every(line=>!/[\uD800-\uDBFF]$/.test(line)&&! /^[\uDC00-\uDFFF]/.test(line)));
  }
  assert.deepEqual(wrapCaption('  ',20,measure),[]);
  assert.equal(MAX_CAPTURE_EDGE,2560);
});
