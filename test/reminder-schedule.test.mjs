import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoutineTimes,readReminderConfig,buildNativeReminderPayload,routineAttemptDue,isQuietTime,nativeNoticeRecords} from '../lib/reminder-schedule.mjs';

test('all four hourly rhythms use the selected daytime interval and the 18-reminder limit',()=>{
  for(const hours of [1,2,3,4]){
    const times=buildRoutineTimes({mode:'interval',intervalHours:hours,start:'05:00',end:'23:00'});
    assert.equal(times[0],'05:00');assert.ok(times.length<=18);assert.ok(!times.some(isQuietTime));
    assert.equal(times.length,Math.ceil(18/hours));
  }
  const full=buildRoutineTimes({mode:'interval',intervalHours:1,start:'05:00',end:'23:00'});
  assert.equal(full.length,18);assert.equal(full.at(-1),'22:00');
  assert.deepEqual(buildRoutineTimes({mode:'interval',intervalHours:3,start:'08:30',end:'20:30'}),['08:30','11:30','14:30','17:30','20:30']);
});
test('presets and custom times validate, deduplicate and never silently move night times',()=>{
  assert.deepEqual(buildRoutineTimes(),['07:30','12:00','19:00']);
  assert.deepEqual(buildRoutineTimes({mode:'shichen',start:'09:00',end:'17:00'}),['09:00','11:00','15:00','17:00']);
  assert.deepEqual(buildRoutineTimes({mode:'custom',customTimes:['19:00','08:00','08:00']}),['08:00','19:00']);
  for(const config of [{mode:'interval',intervalHours:0},{start:'22:00',end:'06:00'},{start:'04:59'},{mode:'custom',customTimes:['25:00']},{mode:'custom',customTimes:['23:00']},{mode:'custom',customTimes:[]},{mode:'custom',customTimes:Array.from({length:19},(_,i)=>`08:${String(i).padStart(2,'0')}`)}])assert.throws(()=>buildRoutineTimes(config));
  assert.deepEqual(readReminderConfig(null,['07:00','09:00','11:00','15:00','17:00','19:00']).mode,'shichen');
  const legacy=readReminderConfig(null,['00:00','06:30','18:45','18:45']);assert.equal(legacy.mode,'custom');assert.deepEqual(buildRoutineTimes(legacy),['06:30','18:45']);
});
test('pausing cancels native schedule while medication times remain unchanged and names stay local',()=>{
  const store={notificationEnabled:true,remindersPaused:false,routineTimes:['07:30','12:00','19:00'],medications:[{id:'m1',name:'私人药名',times:['00:30','08:00','08:00'],enabled:true},{id:'m2',times:['18:00'],enabled:false}]};
  const payload=buildNativeReminderPayload(store,'personal');assert.equal(payload.enabled,true);assert.equal(payload.nightMedicationSilent,false);
  assert.deepEqual(payload.reminders.filter(r=>r.kind==='medicine').map(r=>r.time),['00:30','08:00']);
  assert.ok(!JSON.stringify(payload).includes('私人药名'));assert.deepEqual(payload.quietHours,{start:'23:00',end:'05:00'});
  assert.equal(buildNativeReminderPayload({...store,remindersPaused:true}).enabled,false);
  assert.equal(buildNativeReminderPayload({...store,notificationEnabled:false}).enabled,false);
  assert.equal(buildNativeReminderPayload({...store,nightMedicationSilent:true}).nightMedicationSilent,true);
});
test('foreground schedule honors pause, sleep, night, duplicate attempts and supports more than six windows',()=>{
  const times=buildRoutineTimes({mode:'interval',intervalHours:1,start:'05:00',end:'23:00'}),attempts=[];
  for(const time of times){const id=routineAttemptDue({time,day:'2026-11-06',times,attempts});assert.ok(id);attempts.push(id);assert.equal(routineAttemptDue({time,day:'2026-11-06',times,attempts}),null);}
  assert.equal(attempts.length,18);
  for(const extra of [{paused:true},{asleep:true}])assert.equal(routineAttemptDue({time:'07:00',day:'2026-11-07',times,...extra}),null);
  assert.equal(routineAttemptDue({time:'23:00',day:'2026-11-07',times:['23:00']}),null);
  assert.ok(routineAttemptDue({time:'07:00',day:'2026-11-07',times,attempts}));
});
test('native delivered records preserve mode and actual timestamps without claiming medication was taken',()=>{
  const now=Date.parse('2026-11-06T10:00:00+08:00');
  const notices=nativeNoticeRecords({recent:[{id:'r1',mode:'personal',kind:'medicine',at:now},{id:'other',mode:'competition',kind:'card',at:now},{id:'future',mode:'personal',kind:'card',at:now+86400000},{id:'bad',mode:'personal',kind:'unknown',at:now}]},'personal',now);
  assert.equal(notices.length,1);assert.match(notices[0].body,/不表示已经服药/);assert.equal(notices[0].medicationId,undefined);assert.equal(notices[0].scheduledAt,undefined);
});
test('native test receipts retain the original ID for deduplication with the foreground result',()=>{
  const now=Date.now();
  const [record]=nativeNoticeRecords({recent:[{id:'test-unique-1',kind:'card',test:true,mode:'personal',at:now}]},'personal',now);
  assert.equal(record.id,'test-unique-1');assert.match(record.title,/测试通知/);assert.match(record.body,/主动发起/);assert.doesNotMatch(record.title,/日常提醒/);
  const existing=[{id:'test-unique-1'}];assert.equal([record].filter(item=>!existing.some(item2=>item2.id===item.id)).length,0);
});
