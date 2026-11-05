import test from 'node:test';
import assert from 'node:assert/strict';
import {getMorningBaseline,groupDailyBloodPressure,adherenceSummary,dueMedications} from '../lib/records.mjs';
const now='2026-11-05T12:00:00+08:00';
const bp=(id,measuredAt,systolic=120,diastolic=80,isMorning=false)=>({id,measuredAt,systolic,diastolic,isMorning});
test('morning baseline requires explicit tag and cannot be overwritten by subsequent records or backfills',()=>{
  const original=bp('first','2026-11-05T07:30:00+08:00',130,85,true);
  const records=[bp('unmarked','2026-11-05T06:00:00+08:00'),original,bp('later','2026-11-05T09:00:00+08:00',125,80,true),bp('backfill','2026-11-05T06:30:00+08:00',110,70,true)];
  assert.equal(getMorningBaseline(records,now)?.id,'first');assert.equal(groupDailyBloodPressure(records)[0].morningBaseline?.id,'first');
  assert.equal(getMorningBaseline([records[0]],now),null);
  assert.equal(getMorningBaseline([bp('tomorrow','2026-11-06T07:00:00+08:00',120,80,true)],now),null);
});
test('blood pressure grouping uses explicit local dates, validated numbers and unique record IDs',()=>{
  const records=[bp('a','2026-11-04T16:30:00Z',120,80),bp('b','2026-11-05T10:00:00+08:00',140,90),bp('a','2026-11-05T07:00:00+08:00',200,100),bp('bad','invalid'),bp('invalid','2026-11-05T08:00:00+08:00',70,90)];
  const groups=groupDailyBloodPressure(records);assert.equal(groups.length,1);assert.equal(groups[0].date,'2026-11-05');assert.equal(groups[0].count,2);assert.equal(groups[0].systolic,130);
  assert.equal(groupDailyBloodPressure(records,{timeZone:'UTC'}).length,2);
});
test('adherence uses real due opportunities, deduplicates completion and labels self-reported change',()=>{
  const opportunities=[{id:'a',cardId:'card1',scheduledAt:'2026-11-05T08:00:00+08:00'},{id:'b',cardId:'card2',scheduledAt:'2026-11-05T09:00:00+08:00'},{id:'future',cardId:'card3',scheduledAt:'2026-11-05T20:00:00+08:00'}];
  const completions=[{id:'1',opportunityId:'a',cardId:'card1',completedAt:'2026-11-05T08:01:00+08:00',symptomBefore:2,symptomAfter:1},{id:'2',opportunityId:'a',cardId:'card1',completedAt:'2026-11-05T08:02:00+08:00',symptomBefore:2,symptomAfter:0},{id:'3',opportunityId:'unknown',cardId:'card1',completedAt:'2026-11-05T10:00:00+08:00'},{id:'4',opportunityId:'b',cardId:'wrong',completedAt:'2026-11-05T10:00:00+08:00'}];
  const result=adherenceSummary(opportunities,completions,{now});assert.equal(result.scheduled,2);assert.equal(result.completed,1);assert.equal(result.rate,0.5);assert.equal(result.unmatchedCompletions,2);assert.deepEqual(result.symptomReports,{paired:1,improved:1,unchanged:0,worsened:0});assert.match(result.interpretation,/自述.*不能.*疗效/);
  assert.equal(adherenceSummary([],completions,{now}).rate,null);
});
test('medication reminders use only user-entered enabled times and stable local occurrence keys',()=>{
  const meds=[{id:'a',name:'用户填写的药名',times:['08:00','08:00','wrong'],enabled:true},{id:'b',name:'另一条',times:['08:00'],enabled:false},{id:'c',name:'无时间的药',times:[],enabled:true}];
  const due=dueMedications(meds,'2026-11-05T08:04:00+08:00');assert.equal(due.length,1);assert.equal(due[0].key,'a:2026-11-05:08:00');assert.equal(due[0].scheduledAt,'2026-11-05T00:00:00.000Z');
  assert.equal(dueMedications(meds,'2026-11-05T08:05:01+08:00').length,0);
  for(const status of ['taken','snoozed','skipped'])assert.equal(dueMedications(meds,'2026-11-05T08:04:00+08:00',[{medicationId:'a',scheduledAt:due[0].scheduledAt,status,at:'2026-11-05T08:01:00+08:00'}]).length,0);
  assert.equal(dueMedications(meds,'2026-11-06T08:01:00+08:00',[{medicationId:'a',scheduledAt:due[0].scheduledAt,status:'taken',at:'2026-11-05T08:01:00+08:00'}]).length,1);
});
test('medication grace window crosses midnight using the scheduled day and respects explicit timezone',()=>{
  const med={id:'late',name:'自填',times:['23:59'],enabled:true};
  const due=dueMedications([med],'2026-11-05T00:02:00+08:00');assert.equal(due[0]?.key,'late:2026-11-04:23:59');
  assert.equal(dueMedications([{...med,times:['00:00']}],'2026-11-04T16:01:00Z',[],{timeZone:'UTC'}).length,0);
});
test('historical completion cutoffs and symptom counts stay separate from causal treatment claims',()=>{
  const opportunity={id:'o',cardId:'c',scheduledAt:'2026-11-05T08:00:00+08:00'};
  const completion={opportunityId:'o',cardId:'c',completedAt:'2026-11-05T10:00:00+08:00'};
  const summary=adherenceSummary([opportunity],[completion],{now,to:'2026-11-05T09:00:00+08:00',symptomLog:[{id:'s1',recordedAt:'2026-11-05T08:10:00+08:00',symptoms:['dizzy','dizzy','fatigue'],severity:2},{id:'s2',recordedAt:'2026-11-05T08:20:00+08:00',symptoms:['fatigue'],severity:1},{id:'s3',recordedAt:'2026-11-05T11:00:00+08:00',symptoms:['dizzy'],severity:1}]});
  assert.equal(summary.completed,0);assert.equal(summary.rate,0);assert.deepEqual(summary.selfReportedSymptoms,{reports:2,bySymptom:{dizzy:1,fatigue:2}});
});
test('completion before a scheduled opportunity cannot inflate adherence',()=>{
  const opportunities=[{id:'planned',cardId:'card',scheduledAt:'2026-11-05T11:00:00+08:00'}];
  const completions=[{id:'early',opportunityId:'planned',cardId:'card',completedAt:'2026-11-05T10:00:00+08:00'}];
  const result=adherenceSummary(opportunities,completions,{now});assert.equal(result.scheduled,1);assert.equal(result.completed,0);assert.equal(result.unmatchedCompletions,1);
});
