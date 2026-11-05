import test from 'node:test';
import assert from 'node:assert/strict';
import {toggleContextTag,followUpText,followUpTurn,clarificationCopy,completedActionRecord,assessmentReplyOptions} from '../lib/conversation.mjs';
import {retainSafetyDecision} from '../lib/safety-state.mjs';
test('sequential symptoms and context retain every selected fact and toggle off only one',()=>{
  let tags=[];for(const tag of ['刚生完气','头晕','没睡好'])tags=toggleContextTag(tags,tag);
  assert.deepEqual(tags,['刚生完气','头晕','没睡好']);
  assert.deepEqual(toggleContextTag(tags,'头晕'),['刚生完气','没睡好']);
});
test('followup retains the question context, never duplicates full answer context',()=>{
  const q={clarificationContext:{text:'胸口不舒服'}};
  assert.equal(followUpText(q,'旧的主题','刚开始'),'胸口不舒服。补充：刚开始');
  assert.equal(followUpText(q,'','胸口不舒服，没有疼痛'),'胸口不舒服，没有疼痛');
});
test('completion needs an action session, keeps stable identity, and does not invent symptom improvement',()=>{
  assert.equal(completedActionRecord(null,'2026-11-05'),null);
  const action={id:'once',card:{id:'A',title:'静息'},opportunityId:'morning'};
  const first=completedActionRecord(action,'2026-11-05');
  assert.equal(first.id,completedActionRecord(action,'2026-11-05').id);
  assert.equal('symptomAfter' in first,false);
  assert.equal(completedActionRecord(action,'2026-11-05','2','1').symptomAfter,1);
});
test('main composer can continue a pending assessment while automatic refresh stays locked',()=>{
 const pending={level:'clarify',assessmentPending:true,clarificationContext:{topic:'cardiac',text:'心慌'}};
 const gentle={level:'symptom',reason:'gentle_rest_recheck',card:null};
 assert.strictEqual(retainSafetyDecision(pending,gentle,assessmentReplyOptions(pending)),gentle);
 assert.strictEqual(retainSafetyDecision(pending,{level:'baseline',card:{id:'ordinary'}}),pending);
 assert.deepEqual(assessmentReplyOptions({level:'baseline'}),{});
 const answered={level:'symptom',card:{id:'NP02'},recheck:{afterSeconds:30},questionPurpose:'symptom',clarificationAttempts:1,clarificationContext:{topic:'numbness',text:'手麻。补充：我不确定'}};
 assert.equal(assessmentReplyOptions(answered).clarificationAttempts,1);
 assert.equal(assessmentReplyOptions(answered).questionPurpose,'symptom');
});

test('preference follow-up uses everyday language and delegation keeps the original request',()=>{
 const result={level:'clarify',questionPurpose:'preference',question:'想保暖还是轻松休息？',clarificationContext:{kind:'preference',topic:'preference',text:'天气太冷'}};
 const copy=clarificationCopy(result);assert.equal(copy.kind,'preference');assert.doesNotMatch(copy.placeholder,/哪里不舒服|症状|何时开始/);
 for(const reply of ['都行','你帮我选','随便，我现在在家','没有偏好']){
  const turn=followUpTurn(result,'其他旧内容',reply);
  assert.match(turn.text,/天气太冷/);assert.ok(turn.text.includes(reply));assert.doesNotMatch(turn.text,/想保暖还是/);
  assert.equal(turn.options.preferenceDelegated,true);assert.equal(turn.options.clarificationAttempts,1);assert.equal(turn.options.continuingAssessment,false);
 }
});

test('two preference clarifications preserve a new natural sentence for semantic interpretation',()=>{
 let result={level:'clarify',questionPurpose:'preference',clarificationContext:{kind:'preference',topic:'preference',text:'天气太冷'}};
 const first=followUpTurn(result,'','我正在办公室，只能坐着');
 assert.equal(first.options.preferenceDelegated,false);
 result={...result,...first.options};
 const second=followUpTurn(result,first.text,'喜欢安静，暂时不能离座');
 assert.equal(second.options.clarificationAttempts,2);assert.equal(second.options.preferenceDelegated,false);assert.equal(second.options.topicChangeCandidate,true);
 assert.match(second.text,/只能坐着/);assert.match(second.text,/不能离座/);
 const repeated=followUpTurn({...result,...second.options},second.text,'喜欢安静，暂时不能离座');
 assert.equal(repeated.text,second.text);assert.equal(repeated.options.clarificationAttempts,2);
});

test('clinical uncertainty is never converted to preference delegation or an invented denial',()=>{
 const result={level:'clarify',assessmentPending:true,questionPurpose:'risk_check',clarificationAttempts:2,clarificationContext:{topic:'cardiac',text:'有点心慌'}};
 const turn=followUpTurn(result,'','不知道，你帮我选');
 assert.equal(clarificationCopy(result).kind,'symptom');assert.equal(turn.options.preferenceDelegated,false);
 assert.equal(turn.options.continuingAssessment,true);assert.match(turn.text,/不知道/);assert.doesNotMatch(turn.text,/没有胸痛|没有其他/);
 const danger=followUpTurn({level:'clarify',questionPurpose:'preference'},'天气冷','你帮我选，但现在胸痛冒冷汗');
 assert.match(danger.options.latestInput,/胸痛冒冷汗/);
});

test('new intentions and physical changes interrupt a preference loop even after its second question',()=>{
 const result={level:'clarify',questionPurpose:'preference',clarificationAttempts:2,clarificationContext:{kind:'preference',topic:'preference',text:'天气太冷'}};
 for(const answer of ['我想听音乐','我有点饿了','其实现在有点心慌','你帮我选，但我现在胸痛冒冷汗']){
  const turn=followUpTurn(result,'天气太冷',answer);
  assert.equal(turn.text,answer);assert.equal(turn.options.latestInput,answer);assert.equal(turn.options.preferenceDelegated,false);
  assert.equal(turn.options.clarificationAttempts,0);assert.equal(turn.options.topicChanged,true);assert.equal(turn.options.clarificationContext,undefined);
 }
});

test('open follow-ups also retain an answered-round budget and all actual new information',()=>{
 const first=followUpTurn({level:'clarify',question:'你想先做些什么？'},'我有点饿了','现在不太方便做饭');
 assert.equal(first.options.clarificationAttempts,1);assert.match(first.text,/饿了/);assert.match(first.text,/不太方便做饭/);
 const second=followUpTurn({level:'clarify',...first.options},first.text,'想简单一点');
 assert.equal(second.options.clarificationAttempts,2);assert.match(second.text,/简单一点/);
 assert.equal(second.options.preferenceDelegated,false,'open uncertainty is not fabricated preference consent');
});

test('complete new natural sentences go to semantic interpretation without a frontend emotion dictionary',()=>{
 const result={level:'clarify',questionPurpose:'preference',clarificationAttempts:1,clarificationContext:{kind:'preference',text:'天气太冷'},options:['保暖','轻松休息']};
 for(const answer of ['想家了','情绪低落','有点孤独','今天只想找个人聊聊']){
  const turn=followUpTurn(result,'天气太冷',answer);
  assert.equal(turn.options.latestInput,answer);assert.equal(turn.options.topicChangeCandidate,true);
  assert.equal(turn.options.preferenceDelegated,false);assert.equal(turn.options.clarificationAttempts,2);
 }
 const choose=followUpTurn(result,'天气太冷','都行');assert.equal(choose.options.preferenceDelegated,true);assert.equal(choose.options.topicChangeCandidate,false);
 const uncertain=followUpTurn(result,'天气太冷','不确定');assert.equal(uncertain.options.preferenceDelegated,true);
});
