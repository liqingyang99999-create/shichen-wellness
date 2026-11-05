import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../data/cards.json' with {type:'json'};
import {analyzeText,decide} from '../lib/decision.mjs';
import {runCareAi} from '../server/care-ai.mjs';

const now='2026-11-05T15:30:00+08:00';
const exact='刚生气，头有一点晕，没有其他不舒服';
const allowed=new Set(['BR01','BR03','BR04','EM01','EM03','EM05','SU06']);
const base={now,profile:{conditions:['hypertension'],fluidRestricted:true,limitedMobility:true},vitals:{source:'unavailable'},recentCards:[]};
const run=(text=exact,extra={})=>decide({...base,text,...extra},cards);

test('exact colloquial mild isolated dizziness gets a canonical in-place support card',()=>{
 const a=analyzeText(exact);assert.deepEqual(a.symptoms,['dizzy']);assert.equal(a.course.mildDizziness,true);assert.equal(a.course.otherDiscomfortDenied,true);
 assert.equal(a.course.redFlagsDenied,false);assert.equal(a.course.neurologicalDenied,false,'global no-other-discomfort does not fabricate itemized denials');
 const d=run();assert.equal(d.reason,'graded_symptom_support');assert.ok(allowed.has(d.card.id));assert.equal(d.recheck.afterSeconds,30);assert.equal(d.clarificationContext.topic,'dizziness');
 assert.match(d.message,/头晕/);assert.doesNotMatch(d.message,/排除|因.*生气|没有胸痛|没有.*一侧无力/);
});
test('adequate explicit companion denials also qualify without requiring the global phrase',()=>{
 const d=run('刚生气，头有一点晕，没有胸痛、气短、冷汗或晕厥，没有一侧无力，讲话正常，面部正常');
 assert.equal(d.reason,'graded_symptom_support');assert.ok(allowed.has(d.card.id));assert.doesNotMatch(d.message,/你说没有其他不舒服/);
 for(const uncertainty of ['可能','应该','好像','大概','也许'])assert.notEqual(run(`头有一点晕，${uncertainty}没有其他不舒服`).reason,'graded_symptom_support');
});
test('meal incompatibility is distinguished from cooldown while preserving passive rest and recheck',()=>{
 const d=run(exact+'，嘴里还有饭，正在吃饭');assert.equal(d.card,null);assert.equal(d.reason,'graded_support_unavailable');assert.doesNotMatch(d.message,/冷却/);assert.match(d.message,/暂停进食/);assert.ok(d.recheck);
});

test('support stays available through distinct reviewed actions, with strict 24-hour cooldown',()=>{
 const recentCards=[];
 for(let i=0;i<allowed.size;i++){
  const d=run(exact,{recentCards});assert.ok(d.card,`selection ${i+1}`);assert.ok(allowed.has(d.card.id));assert.ok(!recentCards.some(r=>r.id===d.card.id));assert.equal(d.card.requiresGettingUp,false);assert.ok(!d.card.audio);assert.deepEqual(d.card.steps,cards.find(c=>c.id===d.card.id).steps);
  assert.doesNotMatch(d.card.steps.join(' ').replace(/不需要起身/g,''),/起身|站立|踮脚|喝水|饮水|屏息|屏气|闭眼|深吸气/);
  recentCards.push({id:d.card.id,shownAt:now,category:d.card.category,actionFamily:d.card.actionFamily,slot:15});
 }
 const end=run(exact,{recentCards});assert.equal(end.card,null);assert.equal(end.reason,'graded_support_cooldown');assert.match(end.message,/冷却/);assert.ok(end.recheck);
});

test('vague, persistent, mixed or uncertain symptoms do not enter the isolated support branch',()=>{
 for(const text of ['头有一点晕，还有点心慌，没有其他不舒服','头有一点晕，已经持续加重，没有其他不舒服','反复头晕，有一点晕，没有其他不舒服','头有一点晕，持续了一个小时，没有其他不舒服','头有一点晕，已经半小时了，没有其他不舒服']){
  const d=run(text);assert.notEqual(d.reason,'graded_symptom_support',text);assert.equal(d.card,null,text);
 }
 for(const conditions of [['coronary'],['heart_failure']]){const d=run(exact,{profile:{conditions}});assert.notEqual(d.level,'emergency');assert.ok(d.card?.reviewedSupport);}
 for(const text of ['刚生气，我头晕','头有一点晕，不知道有没有其他不舒服','头有一点晕，不是没有其他不舒服']){const d=run(text);assert.ok(d.card?.reviewedSupport);assert.equal(d.assessmentIncomplete,true);assert.equal(d.assessmentPending,true);}
});

test('acute chest pain, sweats and focal neurologic signs always override mild wording',()=>{
 for(const suffix of ['但现在剧烈胸痛，大汗淋漓','现在左手突然抬不起来','但是突然说不清话','但是头晕得站不稳','现在快要晕倒']){
  const d=run(exact+'，'+suffix);assert.equal(d.level,'emergency',suffix);assert.equal(d.card,null);assert.match(d.message,/120/);
 }
 const bp=run(exact,{bloodPressure:{systolic:185,diastolic:122,measuredAt:now}});assert.equal(bp.level,'emergency');
 const hr=run(exact,{vitals:{source:'simulation',measuredAt:now,quality:'good',heartRate:150,durationMinutes:10}});assert.equal(hr.card,null);
 assert.equal(run(exact+'。但是现在越来越重，站不稳了。').level,'emergency');
 for(const suffix of ['。并没有站不稳。','。昨天站不稳，但是现在已经没有了。','。朋友站不稳。'])assert.notEqual(run(exact+suffix).level,'emergency',suffix);
});

test('negated, historical and hypothetical dizziness stays out; explicit resolution removes stale context only',()=>{
 for(const text of ['我没有头有一点晕','昨天头有一点晕，现在感觉很好','如果头有一点晕怎么办'])assert.ok(!analyzeText(text).symptoms.includes('dizzy'),text);
 const clarificationContext={topic:'cardiac',text:'我剧烈胸痛，大汗淋漓'};
 assert.equal(run(exact,{clarificationContext}).level,'emergency');
 for(const flag of ['resolvedSafety','explicitReset']){const d=run(exact,{clarificationContext,[flag]:true});assert.equal(d.reason,'graded_symptom_support');}
});

test('after-action feedback improves or escalates instead of treating completion as symptom resolution',()=>{
 const clarificationContext={topic:'dizziness',text:exact};
 assert.equal(run('仍未缓解',{clarificationContext,recheckOutcome:'persistent'}).reason,'graded_support_unchanged');
 assert.equal(run('感觉加重了',{clarificationContext,recheckOutcome:'worse'}).reason,'symptoms_medical_review');
 assert.equal(run('已明显改善',{clarificationContext,recheckOutcome:'improved'}).reason,'symptoms_improved');
 assert.equal(run('现在一侧无力',{clarificationContext,recheckOutcome:'worse'}).level,'emergency');
});
test('resolved feedback is returned directly by the API without entering an empty model candidate pool',async()=>{
 const request={consent:true,text:'已明显改善',turns:[],context:{...base,clarificationContext:{topic:'dizziness',text:exact},recheckOutcome:'improved'}};
 const r=await runCareAi(request,{}, {model:()=>{throw Error('must not call');}});assert.equal(r.ai.status,'guard');assert.equal(r.decision.reason,'symptoms_improved');assert.equal(r.decision.assessmentResolved,true);assert.equal(r.decision.card,null);
});

test('AI semantic normalization preserves original mild severity and cannot expand the safe pool',async()=>{
 const request={consent:true,text:exact,turns:[],context:base};let ids=[];
 const response=await runCareAi(request,{}, {model:async(stage,input)=>{
  if(stage==='understand')return {intent:'symptom',activity:'rest',facts:[{key:'dizzy',evidence:'头有一点晕',polarity:'present',time:'current'},{key:'angry',evidence:'刚生气',polarity:'present',time:'current'}],needsClarification:false,question:'',summary:'刚生气，头有一点晕，自述没有其他不舒服。'};
  ids=input.candidates.map(c=>c.id);return {cardId:ids.at(-1),explanation:'你刚生过气，也说头有一点晕，先留在原位，做一件安静的小事。'};
 }});
 assert.equal(response.ai.status,'used');assert.equal(response.decision.reason,'graded_symptom_support');assert.ok(ids.length>=6);assert.ok(ids.every(id=>allowed.has(id)));assert.ok(allowed.has(response.decision.card.id));assert.equal(response.decision.recheck.afterSeconds,30);
 assert.equal(analyzeText(response.ai.effectiveText).course.redFlagsDenied,false);
});
test('redundant AI dizziness-course questions cannot block an already-reviewed in-place action',async()=>{
 const request={consent:true,text:exact,turns:[],context:{...base,vitals:{source:'simulation',quality:'good',measuredAt:now,heartRate:72,baselineHeartRate:70,hrv:42,baselineHrv:42,stress:30,sleepHours:7.2,durationMinutes:10}}};
 const u={intent:'symptom',activity:'rest',facts:[{key:'dizzy',evidence:'头有一点晕',polarity:'present',time:'current'}],needsClarification:true,question:'这个头晕是现在还在，还是刚才生气后一阵已经过去了？',summary:'轻微头晕，自述没有其他不适。'};
 const selected=await runCareAi(request,{}, {model:async(stage,input)=>stage==='understand'?u:{cardId:input.candidates[0].id,explanation:'你说头有一点晕，先在原位安静休息，稍后再看看感受。'}});
 assert.equal(selected.ai.status,'used');assert.equal(selected.ai.stage,'selected');assert.ok(allowed.has(selected.decision.card.id));assert.ok(selected.decision.recheck);
 const fallback=await runCareAi(request,{}, {model:async stage=>stage==='understand'?u:{cardId:null,question:'头晕现在还在吗，持续多久了？'}});
 assert.equal(fallback.ai.status,'guard');assert.equal(fallback.ai.stage,'local_selection_fallback');assert.equal(fallback.ai.model,null);assert.ok(allowed.has(fallback.decision.card.id));assert.ok(fallback.decision.recheck);
});
test('new unknown symptoms, preference questions and red flags are not hidden by the redundant-question exception',async()=>{
 const u={intent:'symptom',activity:'rest',facts:[],needsClarification:true,question:'你说的恶心从什么时候开始？',summary:'需要了解恶心。'};
 const request={consent:true,text:exact+'，但还有些恶心',turns:[],context:base};
 const pending=await runCareAi(request,{}, {model:async()=>u});assert.equal(pending.decision.level,'clarify');assert.equal(pending.decision.card,null);assert.match(pending.decision.question,/恶心/);
 const preference=await runCareAi({...request,text:exact},{}, {model:async(stage)=>stage==='understand'?{...u,needsClarification:false,question:''}:{cardId:null,question:'你更愿意安静听呼吸，还是在心里辨认一下情绪？'}});assert.equal(preference.decision.level,'clarify');
 const acute=await runCareAi({...request,text:exact+'，胸痛大汗淋漓'},{}, {model:()=>{throw Error('must not call');}});assert.equal(acute.decision.level,'emergency');
});
