import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEntryMode, createDailySnapshot, createDailyRequest } from '../lib/device-context.mjs';
import { runWorkflow } from '../server/engine.mjs';

test('mobile defaults to daily, desktop to demo, and explicit links override viewport', () => {
  assert.equal(resolveEntryMode('', true), 'daily');
  assert.equal(resolveEntryMode('', false), 'panel');
  assert.equal(resolveEntryMode('?mode=demo', true), 'panel');
  assert.equal(resolveEntryMode('?mode=daily', false), 'daily');
  assert.equal(resolveEntryMode('?mode=chat', false), 'chat');
});

test('daily refreshes real time and strips usage, step counts, demo metrics and exact positions', () => {
  const now='2026-11-04T06:12:00Z';
  const input={now:'2026-11-03T15:30:00+08:00',intent:'eye',screenMinutes:95,sedentaryMinutes:100,activityMinutes:20,steps:3000,usageMinutes:120,latitude:30.12345,longitude:120.12345,canLeaveSeat:false,sitting:true,weather:{source:'open-meteo',observedAt:now,tempC:20,rain:false,latitude:30.12345,city:'杭州'}};
  const before=JSON.stringify(input), s=createDailySnapshot(now,input);
  assert.equal(s.now,'2026-11-04T14:12:00+08:00');
  assert.equal(s.intent,'general'); assert.equal(s.canLeaveSeat,false);assert.equal(s.sitting,true);
  for(const key of ['screenMinutes','sedentaryMinutes','activityMinutes','steps','usageMinutes','latitude','longitude'])assert.equal(Object.hasOwn(s,key),false,key);
  assert.equal(Object.hasOwn(s.weather,'latitude'),false); assert.equal(s.weather.rain,false);
  assert.equal(JSON.stringify(input),before);
  assert.equal(createDailySnapshot(now,{weather:{source:'simulation',rain:false,observedAt:now}}).weather,undefined);
});

test('daily requests are preview with no simulated quota or clock while own recent cards can avoid repeats', () => {
  const r=createDailyRequest('2026-11-04T14:12:00+08:00',{}, {ordinaryCount:6,lastReminderAt:'2026-11-03T15:30:00+08:00',recentCards:['M001','M002','M003','M004'],solarSeen:{fake:true},displayEvents:[{id:'sim'}]});
  assert.equal(r.mode,'preview');assert.equal(r.snapshot.inputMode,'daily');assert.equal(r.state.ordinaryCount,0);assert.equal(r.state.lastReminderAt,null);
  assert.deepEqual(r.state.displayEvents,[]);assert.deepEqual(r.state.solarSeen,{});assert.deepEqual(r.state.recentCards,['M002','M003','M004']);
  assert.equal(r.snapshot.sleepState,'unknown');assert.equal(Object.hasOwn(r.snapshot,'sitting'),false);
});

test('explicit daily solar preview returns the actual date solar card without increasing reminder quota', async () => {
  const now='2026-11-07T00:10:00+08:00';
  const request=createDailyRequest(now,{previewSolar:true},{ordinaryCount:6});
  const result=await runWorkflow(request,{});
  assert.equal(request.mode,'preview');assert.equal(result.card.isSolar,true);
  assert.equal(result.card.solar.term,'立冬');assert.equal(result.state.ordinaryCount,0);
  assert.equal(result.decision.countsTowardQuota,false);
  assert.equal(createDailySnapshot(now,{previewSolar:'true'}).previewSolar,undefined);
  assert.equal(createDailySnapshot(now).previewSolar,undefined);
});

