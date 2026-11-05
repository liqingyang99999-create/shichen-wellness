import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../data/cards.json' with {type:'json'};
import {decide,analyzeText} from '../lib/decision.mjs';
import {runCareAi} from '../server/care-ai.mjs';
const now='2026-11-05T15:30:00+08:00';
const base={now,profile:{conditions:[]},vitals:{source:'unavailable'},clarificationContext:{kind:'symptom',topic:'numbness',text:'我手有点麻'},clarificationAttempts:1,latestInput:'我不确定，先休息',text:'我不确定，先休息',currentCardId:'NP02',sameEpisodeContinuation:true,continuingAssessment:true,recentCards:cards.filter(c=>c.reviewedSupport).map(c=>({id:c.id,shownAt:now}))};
test('same unfinished episode retains its canonical card without treating clarification as another push',()=>{
 const d=decide(base,cards);assert.equal(d.card?.id,'NP02');assert.equal(d.retainedCurrentCard,true);assert.equal(d.assessmentIncomplete,true);assert.equal(d.question,undefined);assert.deepEqual(d.card.steps,cards.find(c=>c.id==='NP02').steps);
});
test('new episodes, completed feedback, alternatives and mismatched topics never bypass cooldown',()=>{
 for(const extra of [{sameEpisodeContinuation:false},{continuingAssessment:false},{recheckOutcome:'unchanged'},{selectionMode:'alternative_method'},{topicChanged:true},{resolvedSafety:true},{explicitReset:true},{clarificationContext:{topic:'cardiac',text:'有点心慌'}}]){
  const d=decide({...base,...extra},cards);assert.notEqual(d.retainedCurrentCard,true,JSON.stringify(extra));assert.notEqual(d.card?.id,'NP02');
 }
});
test('urgent changes and newly incompatible context stop retention',()=>{
 assert.equal(decide({...base,text:'现在胸痛冒冷汗',latestInput:'现在胸痛冒冷汗'},cards).level,'emergency');
 assert.equal(decide({...base,text:'正在吃饭',latestInput:'正在吃饭'},cards).card,null);
 const prior='两只手有点麻，现在手压在身下';
 const latest='已经松开了压着的手，正在减轻';
 const d=decide({...base,currentCardId:'NP01',text:latest,latestInput:latest,clarificationContext:{topic:'numbness',text:prior}},cards);
 assert.ok(!analyzeText(prior+'。'+latest).context.includes('posture_pressure'));
 assert.notEqual(d.retainedCurrentCard,true);assert.notEqual(d.card?.id,'NP01');
});
test('server understands the new reply before re-showing a card and does not claim a new AI selection',async()=>{
 const stages=[];const context={...base};delete context.text;
 const r=await runCareAi({consent:true,text:base.text,context,turns:[]},{},{model:async stage=>{stages.push(stage);return {intent:'symptom',activity:'rest',facts:[],needsClarification:true,question:'发麻从什么时候开始的？',summary:'仍不确定，想先休息。'};}});
 assert.deepEqual(stages,['understand']);assert.equal(r.ai.status,'guard');assert.equal(r.ai.stage,'same_episode_continuation');assert.equal(r.decision.retainedCurrentCard,true);assert.equal(r.decision.card.id,'NP02');
 const danger=await runCareAi({consent:true,text:'胸痛冒冷汗',context:{...context,latestInput:'胸痛冒冷汗'},turns:[]},{},{model:()=>{throw Error('no model before urgent guard');}});
 assert.equal(danger.decision.level,'emergency');assert.equal(danger.decision.card,null);
});
