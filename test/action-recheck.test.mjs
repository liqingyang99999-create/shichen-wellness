import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../data/cards.json' with {type:'json'};
import {decide} from '../lib/decision.mjs';
import {completedActionRecord} from '../lib/conversation.mjs';
import {retainSafetyDecision,mergeUnresolvedComplaint} from '../lib/safety-state.mjs';
import {safetySnapshot,requiresActionRecheck,recheckOptions,clearResolvedSafety,matchingStatus,initialSafetyDecision,immediateLocalDecision,currentAssessmentCard,preservesCurrentAction,pendingAssessmentResponse} from '../lib/action-recheck.mjs';
const text='刚生气，头有一点晕，没有其他不舒服';
const context={now:'2026-11-05T15:30:00+08:00',profile:{conditions:['hypertension']},vitals:{source:'unavailable'},recentCards:[]};
const support=()=>decide({...context,text},cards);

test('a real mild-dizziness card keeps its follow-up when persisted and requires reassessment on completion',()=>{
 const decision=support();assert.ok(decision.card);assert.equal(decision.recheck.afterSeconds,30);
 const saved=JSON.parse(JSON.stringify(safetySnapshot(decision,text)));
 assert.equal(saved.text,text);assert.equal(saved.decision.clarificationContext.topic,'dizziness');
 assert.equal(requiresActionRecheck(saved.decision,decision.card.id),true);
 assert.equal(requiresActionRecheck(saved.decision,'unrelated-old-action'),false);
 const record=completedActionRecord({id:'session',card:decision.card},context.now);
 assert.ok(record);assert.equal(record.symptomAfter,undefined,'checking in does not claim relief');
 const ordinary={level:'baseline',card:cards.find(c=>c.id!==decision.card.id)};
 assert.strictEqual(retainSafetyDecision(saved.decision,ordinary),saved.decision);
});

test('feedback carries the original dizziness context to graded relief and medical-review results',()=>{
 const decision=support();
 for(const [outcome,reason] of [['improved','symptoms_improved'],['unchanged','graded_support_unchanged'],['persistent','graded_support_unchanged'],['worse','symptoms_medical_review']]){
  const options=recheckOptions(outcome,decision);
  assert.equal(options.clarificationContext.topic,'dizziness');assert.equal(options.resolvedSafety,outcome==='improved');
  const next=decide({...context,text:'',...options},cards);
  assert.equal(next.reason,reason);assert.strictEqual(retainSafetyDecision(decision,next,options),next);
 }
 assert.throws(()=>recheckOptions('completed',decision));
});

test('danger added during reassessment still wins over improved feedback',()=>{
 const decision=support(),options=recheckOptions('improved',decision);
 const next=decide({...context,...options,text:'现在剧烈胸痛，大汗淋漓'},cards);
 assert.equal(next.level,'emergency');assert.strictEqual(retainSafetyDecision(decision,next,options),next);
});

test('cooldown exhaustion retains rest and reassessment without creating an unrelated action',()=>{
 const recentCards=['BR01','BR03','BR04','EM01','EM03','EM05','SU06'].map(id=>({id,shownAt:context.now}));
 const decision=decide({...context,text,recentCards},cards);
 assert.equal(decision.reason,'graded_support_cooldown');assert.equal(decision.card,null);
 assert.ok(safetySnapshot(decision,text));assert.ok(decision.careSteps.length);assert.ok(decision.recheck);
 assert.equal(requiresActionRecheck(decision,'BR01'),false);
 assert.equal(decide({...context,text:'',...recheckOptions('persistent',decision)},cards).reason,'graded_support_unchanged');
});

test('explicit episode end immediately clears old complaint while daily AI is still pending',()=>{
 const old={activeSafety:{decision:{level:'emergency'},text:'剧烈胸痛，大汗淋漓'},profile:context.profile};
 for(const options of [{resolvedSafety:true},{explicitReset:true}]){
  const cleared=clearResolvedSafety(old,options);
  const restored=JSON.parse(JSON.stringify(cleared));
  assert.equal(restored.activeSafety,null);
  const fresh=mergeUnresolvedComplaint(restored.activeSafety?.text||'',text,{});
  assert.equal(fresh,text);
  const next=decide({...context,text:fresh},cards);
  assert.equal(next.reason,'graded_symptom_support');
  const danger=decide({...context,text:mergeUnresolvedComplaint(restored.activeSafety?.text||'','现在又剧烈胸痛',{})},cards);
  assert.equal(danger.level,'emergency','fresh danger is still detected after reset');
 }
 assert.strictEqual(clearResolvedSafety(old,{}),old);
 assert.strictEqual(clearResolvedSafety(old,{resolvedSafety:'yes'}),old);
});

test('graded support can ask one question while keeping its action and neutral unchanged feedback',()=>{
 const decision={level:'clarify',reason:'graded_support_check',assessmentPending:true,card:{id:'BR01'},recheck:{afterSeconds:30},clarificationContext:{topic:'numbness',text:'手有点麻'}};
 assert.ok(safetySnapshot(decision,'手有点麻'));
 assert.equal(requiresActionRecheck(decision,'BR01'),true);
 const options=recheckOptions('unchanged',decision);
 assert.equal(options.recheckOutcome,'unchanged');assert.equal(options.resolvedSafety,false);assert.equal(options.clarificationContext.text,'手有点麻');
 assert.equal(matchingStatus(decision,{status:'guard'}),'基础匹配');
 assert.equal(matchingStatus(decision,{status:'used'}),'AI 匹配');
 assert.equal(matchingStatus(decision,{status:'used',stage:'follow_up'}),'AI 理解 · 基础匹配');
 assert.equal(matchingStatus({level:'clarify'},{status:'used',stage:'follow_up'}),'AI 理解');
 assert.equal(matchingStatus({level:'symptom'},{status:'used',stage:'semantic_guard'}),'AI 理解');
 assert.equal(matchingStatus(decision,{status:'used',stage:'semantic_guard'}),'AI 理解 · 基础匹配');
 assert.equal(matchingStatus(decision,{status:'used',stage:'selected'}),'AI 匹配');
 assert.equal(matchingStatus({level:'emergency'},{status:'guard'}),'急症优先响应');
 const wellbeing={level:'symptom',card:{id:'DRY01'},recheck:{afterSeconds:30},clarificationContext:{topic:'wellbeing',text:'有点口干'}};
 assert.equal(requiresActionRecheck(wellbeing,'DRY01'),true);
 assert.equal(recheckOptions('unchanged',wellbeing).clarificationContext.topic,'wellbeing');
});

test('old mild support is reevaluated from saved human input while unresolved emergencies stay visible',()=>{
 const legacy={decision:{level:'symptom',reason:'isolated_mild_dizziness_support',card:{id:'EM05'}},text};
 assert.equal(initialSafetyDecision(legacy),null);assert.equal(legacy.text,text);
 assert.strictEqual(initialSafetyDecision({...legacy,rulesVersion:'0.12'}),legacy.decision);
 const acute={decision:{level:'emergency'},text:'现在剧烈胸痛'};
 assert.strictEqual(initialSafetyDecision(acute),acute.decision);
 const persistent={decision:{level:'symptom',reason:'symptoms_medical_review'},text:'头有点晕，持续了很久'};
 assert.strictEqual(initialSafetyDecision(persistent),persistent.decision);
 const newSnapshot=safetySnapshot(support(),text);assert.equal(newSnapshot.rulesVersion,'0.12');
});

test('improvement feedback is a final local state until the person explicitly returns to daily cards',()=>{
 const decision=support();const options=recheckOptions('improved',decision);
 const improved=decide({...context,text:'',...options},cards);
 assert.equal(improved.assessmentResolved,true);assert.equal(improved.card,null);assert.equal(immediateLocalDecision(improved),true);
 assert.equal(immediateLocalDecision(decision),false,'support cards remain eligible for AI selection');
 const daily=decide({...context,text:'',resolvedSafety:true},cards);
 assert.ok(daily.card);assert.equal(daily.assessmentResolved,undefined);
});

test('different mild complaints keep their own card and reassessment through persistence and completion',()=>{
 for(const [description,topic] of [['手有点麻','numbness'],['有点心慌','cardiac'],['有点胸闷','cardiac'],['嘴巴有点干','wellbeing'],['最近胃口不好','wellbeing']]){
  const decision=decide({...context,text:description},cards);
  assert.ok(decision.card,description);assert.notEqual(decision.level,'emergency',description);
  const restored=JSON.parse(JSON.stringify(safetySnapshot(decision,description)));
  assert.equal(initialSafetyDecision(restored).clarificationContext.topic,topic,description);
  assert.equal(requiresActionRecheck(restored.decision,decision.card.id),true,description);
  const options=recheckOptions('unchanged',restored.decision);
  const next=decide({...context,text:'',...options},cards);
  assert.notEqual(next.level,'emergency',`${description}: unchanged alone must not become an emergency`);
  assert.ok(next.recheck,description);
  assert.strictEqual(retainSafetyDecision(restored.decision,next,options),next,description);
 }
});

test('supplementing the same unfinished support card preserves its session only after revalidation',()=>{
 const previous={level:'clarify',assessmentPending:true,card:{id:'NP02'},recheck:{afterSeconds:30},clarificationContext:{kind:'symptom',topic:'numbness',text:'手有点麻'}};
 const options={continuingAssessment:true};
 assert.deepEqual(currentAssessmentCard(previous,options),{currentCardId:'NP02',sameEpisodeContinuation:true});
 const next={...previous,level:'symptom',assessmentPending:false,retainedCurrentCard:true};
 assert.equal(preservesCurrentAction(previous,next,options),true);
 for(const override of [{selectionMode:'alternative_method'},{recheckOutcome:'unchanged'},{resolvedSafety:true},{explicitReset:true},{topicChanged:true}])assert.equal(preservesCurrentAction(previous,next,{...options,...override}),false);
 assert.equal(preservesCurrentAction(previous,{...next,retainedCurrentCard:false},options),false);
 assert.equal(preservesCurrentAction(previous,{...next,card:{id:'BR01'}},options),false);
 assert.equal(preservesCurrentAction(previous,{...next,clarificationContext:{topic:'cardiac'}},options),false);
 assert.equal(preservesCurrentAction(previous,{level:'emergency'},options),false);
});

test('a semantic safety upgrade cannot be replaced by the earlier passive support card',()=>{
 const local={level:'clarify',assessmentPending:true,card:{id:'NP02'},recheck:{afterSeconds:30}};
 const modelQuestion={level:'clarify',card:null,question:'还有别的情况吗？'};
 assert.strictEqual(pendingAssessmentResponse(local,modelQuestion,local),local);
 const answered={...local,level:'symptom',assessmentPending:false,retainedCurrentCard:true};
 assert.strictEqual(pendingAssessmentResponse(answered,modelQuestion,answered),answered);
 for(const validated of [{level:'emergency',reason:'new_danger'},{level:'symptom',card:null,reason:'symptoms_medical_review'}])assert.strictEqual(pendingAssessmentResponse(local,{level:'symptom',card:null},validated),validated);
});
