import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileSnapshot, applyMobileDialogue, MOBILE_CONTEXT_TTL, actionDurationSeconds } from '../lib/mobile-context.mjs';
import { normalizeMobileInput } from '../server/mobile.mjs';
const now='2026-11-04T13:30:00+08:00';

test('action timer uses only a single explicit duration, not a range or setup hint',()=>{
 assert.equal(actionDurationSeconds('约1分钟'),60);
 assert.equal(actionDurationSeconds('约45秒'),45);
 for (const value of ['30–60秒','1–2分钟','约30秒启动','按需约2分钟','约30秒起','从下一口开始','按需完成',undefined]) assert.equal(actionDurationSeconds(value),null);
});

test('mobile context drops expired conversations and never imports native cumulative metrics',()=>{
 const context={capturedAt:Date.parse(now)-MOBILE_CONTEXT_TTL,snapshot:{now:'2026-11-04T06:30:00+08:00',screenMinutes:90,intent:'eye',canCloseEyes:true}};
 const snapshot=mobileSnapshot(now,{sitting:true,screenMinutesToday:99,sessionSteps:300},context);
 assert.equal(snapshot.now,now);
 assert.equal(snapshot.sitting,true);
 assert.equal(snapshot.screenMinutes,undefined);
 assert.equal(snapshot.screenMinutesToday,undefined);
 assert.equal(snapshot.sessionSteps,undefined);
 assert.equal(snapshot.canCloseEyes,undefined);
 assert.equal(snapshot.intent,'general');
});

test('mobile direct conversation preserves real clock unless an explicit time is proposed',()=>{
 const base=mobileSnapshot(now,{},null,null);
 const lunch=applyMobileDialogue(base,{proposals:[{field:'mealPhase',value:'after'},{field:'intent',value:'quiet'}]});
 assert.equal(lunch.now,now);
 assert.equal(lunch.mealPhase,'after');
 const explicit=applyMobileDialogue(lunch,{proposals:[{field:'now',value:'2026-11-04T06:30:00+08:00'},{field:'canLeaveSeat',value:false},{field:'apiKey',value:'must-not-copy'}]});
 assert.equal(explicit.now,'2026-11-04T06:30:00+08:00');
 assert.equal(explicit.canLeaveSeat,false);
 assert.equal(explicit.apiKey,undefined);
});

test('real weather response is reduced to mobile API fields without coordinates or presentation metadata',()=>{
 const {inputMode,...snapshot}=mobileSnapshot(now,{},null,{source:'open-meteo',observedAt:'2026-11-04T05:15:00Z',fetchedAt:'2026-11-04T05:30:00Z',tempC:18,wind:2,rain:false,city:'杭州',humidity:62,precipitationMm:0,timezone:'UTC',code:1,attribution:'Open-Meteo',latitude:30.2});
 assert.equal(snapshot.weather.tempC,18);
 assert.equal(snapshot.weather.latitude,undefined);
 assert.equal(snapshot.weather.attribution,undefined);
 assert.doesNotThrow(()=>normalizeMobileInput({snapshot}));
});
