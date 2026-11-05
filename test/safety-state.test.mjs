import test from 'node:test';
import assert from 'node:assert/strict';
import {retainSafetyDecision} from '../lib/safety-state.mjs';

const emergency=Object.freeze({level:'emergency',reason:'current_red_flag',message:'立即求助',card:null});
const symptom=Object.freeze({level:'symptom',reason:'high_bp_recheck',message:'暂停并复测',card:null});
const ordinary=Object.freeze({level:'baseline',card:Object.freeze({id:'daily'})});

test('supportive cards with a pending symptom recheck remain until feedback or explicit resolution',()=>{
 const pending={level:'symptom',reason:'isolated_mild_dizziness_support',card:{id:'BR01'},recheck:{afterSeconds:30}};
 assert.strictEqual(retainSafetyDecision(pending,ordinary),pending);
 assert.strictEqual(retainSafetyDecision(pending,{level:'silent',reason:'sleeping_at_night'}),pending);
 const improved={level:'baseline',reason:'symptoms_improved',assessmentResolved:true};
 assert.strictEqual(retainSafetyDecision(pending,improved,{continuingAssessment:true}),improved);
 assert.strictEqual(retainSafetyDecision(pending,symptom,{continuingAssessment:true}),symptom);
 assert.strictEqual(retainSafetyDecision(pending,ordinary,{resolvedSafety:true}),ordinary);
 assert.strictEqual(retainSafetyDecision(pending,ordinary,{explicitReset:true}),ordinary);
 assert.strictEqual(retainSafetyDecision(pending,emergency),emergency);
});
test('explicit alternative can replace only a reviewed dizziness card while preserving its recheck',()=>{
 const pending={level:'symptom',reason:'isolated_mild_dizziness_support',card:{id:'BR01'},recheck:{afterSeconds:30},clarificationContext:{topic:'dizziness'}};
 const alternate={...pending,card:{id:'BR04'}};
 const exhausted={...pending,reason:'isolated_dizziness_cooldown',card:null};
 for(const selectionMode of ['same_category','alternative_method']){
  assert.strictEqual(retainSafetyDecision(pending,alternate,{selectionMode}),alternate);
  assert.strictEqual(retainSafetyDecision(pending,exhausted,{selectionMode}),exhausted);
  assert.strictEqual(retainSafetyDecision(pending,ordinary,{selectionMode}),pending);
  assert.strictEqual(retainSafetyDecision(emergency,alternate,{selectionMode}),emergency);
 }
 assert.strictEqual(retainSafetyDecision(pending,alternate),pending,'automatic refresh cannot replace a pending recheck');
});

test('graded cardiac and numbness alternatives preserve the same unresolved assessment',()=>{
 for(const topic of ['cardiac','numbness','wellbeing']){
  const support={level:'symptom',reason:topic==='wellbeing'?'matching_current_context':'graded_symptom_support',card:{id:'BR01'},recheck:{afterSeconds:30},clarificationContext:{topic}};
  const alternate={...support,card:{id:'BR03'}};
  assert.strictEqual(retainSafetyDecision(support,alternate,{selectionMode:'alternative_method'}),alternate);
  assert.strictEqual(retainSafetyDecision(support,alternate),support);
  assert.strictEqual(retainSafetyDecision(support,ordinary,{selectionMode:'alternative_method'}),support);
  const wrongTopic={...alternate,clarificationContext:{topic:topic==='cardiac'?'numbness':'cardiac'}};
  assert.strictEqual(retainSafetyDecision(support,wrongTopic,{selectionMode:'alternative_method'}),support);
  assert.strictEqual(retainSafetyDecision(support,emergency,{selectionMode:'alternative_method'}),emergency);
 }
});

test('automatic routine, silent and confirmation results cannot dismiss an unresolved safety alert',()=>{
  for(const previous of [emergency,symptom])for(const candidate of [ordinary,{level:'silent',card:null},{level:'confirm',card:null},null,undefined])assert.strictEqual(retainSafetyDecision(previous,candidate),previous);
  assert.strictEqual(retainSafetyDecision(emergency,symptom),emergency);
});
test('new emergency upgrades a symptom warning and is never suppressed by a simultaneous reset',()=>{
  assert.strictEqual(retainSafetyDecision(symptom,emergency),emergency);
  const newer=Object.freeze({...emergency,reason:'high_bp_with_symptoms'});
  assert.strictEqual(retainSafetyDecision(emergency,newer),newer);
  assert.strictEqual(retainSafetyDecision(symptom,newer,{resolvedSafety:true,explicitReset:true}),newer);
});
test('only explicit boolean recovery or reset releases the warning',()=>{
  for(const options of [{resolvedSafety:true},{explicitReset:true}])assert.strictEqual(retainSafetyDecision(emergency,ordinary,options),ordinary);
  assert.strictEqual(retainSafetyDecision(symptom,null,{resolvedSafety:true}),null);
  assert.strictEqual(retainSafetyDecision(emergency,ordinary,{resolvedSafety:'yes',explicitReset:1}),emergency);
});
test('ordinary and supportive symptom cards do not create a safety lock',()=>{
  const supportive={level:'symptom',reason:'matching_current_context',card:{id:'fatigue-support'}};
  assert.strictEqual(retainSafetyDecision(supportive,ordinary),ordinary);
  assert.strictEqual(retainSafetyDecision(ordinary,symptom),symptom);
  assert.strictEqual(retainSafetyDecision(null,ordinary),ordinary);
});
test('pending symptom assessment survives clock/weather refresh but accepts a related answer',()=>{
  const pending={level:'clarify',assessmentPending:true};
  assert.strictEqual(retainSafetyDecision(pending,ordinary),pending);
  const next={level:'symptom',reason:'gentle_rest_recheck',card:null};
  assert.strictEqual(retainSafetyDecision(pending,next,{continuingAssessment:true}),next);
  assert.strictEqual(retainSafetyDecision(emergency,next,{continuingAssessment:true}),emergency);
});
