import test from 'node:test';
import assert from 'node:assert/strict';
import {decide} from '../lib/decision.mjs';
import {mergeUnresolvedComplaint,retainSafetyDecision} from '../lib/safety-state.mjs';
import {aiRequestBody,redactAiText,createAiRequestGate,fetchAiDecision,aiReplayInput} from '../lib/web-ai-client.mjs';
test('AI request boundary strips profile identity, medication history and precise location',()=>{
 const input={text:'我叫张大爷，电话13812345678，邮箱a@example.com，昨夜没睡好',profile:{name:'张大爷',age:67,height:166,weight:68,conditions:['hypertension'],constitution:['qi_deficiency'],fluidRestricted:true},weather:{city:'某某街道12号',latitude:39.12345,longitude:117.12345,temperature:5},medications:[{name:'PRIVATE'}],bpHistory:[{id:'PRIVATE'}],now:'2026-11-05T10:00:00+08:00'};
 const body=aiRequestBody(input,[{role:'user',content:'张大爷 13812345678'}]);
 const json=JSON.stringify(body);for(const banned of ['张大爷','13812345678','a@example.com','PRIVATE','某某街道','39.12345','height','weight'])assert.equal(json.includes(banned),false,banned);
 assert.equal(body.context.profile.ageBand,'older_adult');assert.equal(body.context.profile.fluidRestricted,true);assert.deepEqual(body.context.profile.constitution,['qi_deficiency']);
 assert.equal(aiRequestBody({profile:{age:35}}).context.profile.ageBand,'adult');assert.equal('ageBand' in aiRequestBody({profile:{age:15}}).context.profile,false);assert.equal('ageBand' in aiRequestBody({}).context.profile,false);
});
test('AI request keeps bounded current symptom context and recent turns, not full history',()=>{
 const turns=Array.from({length:30},(_,i)=>({role:'user',content:'q'.repeat(2000)+i}));
 const body=aiRequestBody({text:'头晕',latestInput:'仍未好转',clarificationContext:{topic:'dizziness',text:'刚才头晕'},recentCards:Array.from({length:300},(_,i)=>({id:String(i),shownAt:'2026-11-05',secret:'not transmitted'}))},turns);
 assert.equal(body.turns.length,6);assert.equal(body.turns[0].content.length,900);assert.equal(body.context.recentCards.length,250);assert.equal(body.context.latestInput,'仍未好转');assert.equal(body.context.clarificationContext.text,'刚才头晕');assert.equal(JSON.stringify(body).includes('not transmitted'),false);
});
test('request gate cancels old generation and revocation invalidates the current response',()=>{
 const gate=createAiRequestGate();const first=gate.begin();assert.equal(gate.isCurrent(first.id),true);const second=gate.begin();assert.equal(first.signal.aborted,true);assert.equal(gate.isCurrent(first.id),false);assert.equal(gate.isCurrent(second.id),true);gate.cancel();assert.equal(second.signal.aborted,true);assert.equal(gate.isCurrent(second.id),false);
});
test('network requests are same origin, bounded and reject a fake success marker',async()=>{
 let captured;await assert.rejects(fetchAiDecision({consent:true},{fetchImpl:async(url,options)=>{captured={url,options};return {ok:true,json:async()=>({decision:{level:'baseline'},ai:{status:'mock'}})};}}));
 assert.equal(captured.url,'/api/care-ai');assert.equal(captured.options.credentials,'same-origin');assert.equal(captured.options.method,'POST');
});
test('AI transport times out rather than leave a spinning input forever',async()=>{
 await assert.rejects(fetchAiDecision({consent:true},{timeoutMs:10,fetchImpl:async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))))}));
});
test('AI transport honors cancellation and validates response level',async()=>{
 const abort=new AbortController();abort.abort();await assert.rejects(fetchAiDecision({}, {signal:abort.signal,fetchImpl:async(_,options)=>{assert.equal(options.signal.aborted,true);throw Error('aborted');}}));
 await assert.rejects(fetchAiDecision({}, {fetchImpl:async()=>({ok:true,json:async()=>({decision:{level:'approved'},ai:{status:'used'}})})}));
 const r=await fetchAiDecision({}, {fetchImpl:async()=>({ok:true,json:async()=>({decision:{level:'clarify',question:'哪里不一样？'},ai:{status:'used'}})})});assert.equal(r.decision.level,'clarify');
});
test('redaction leaves symptom negation and timings intact',()=>{assert.equal(redactAiText('没有胸痛，昨夜23点口干，今天08点好些了'),'没有胸痛，昨夜23点口干，今天08点好些了');});

test('preference context crosses the boundary without losing delegation or new information',()=>{
 const body=aiRequestBody({text:'天气冷。补充：你帮我选，我只能坐着',latestInput:'你帮我选，我只能坐着',questionPurpose:'preference',clarificationAttempts:2,preferenceDelegated:true,clarificationContext:{kind:'preference',topic:'preference',text:'天气冷。补充：我只能坐着'}});
 assert.equal(body.context.questionPurpose,'preference');assert.equal(body.context.preferenceDelegated,true);assert.equal(body.context.clarificationAttempts,2);
 assert.equal(body.context.clarificationContext.kind,'preference');assert.match(body.context.latestInput,/只能坐着/);
 const continuation=aiRequestBody({text:'手有点麻。补充：我不确定',currentCardId:'NP02',sameEpisodeContinuation:true,continuingAssessment:true});
 assert.equal(continuation.context.currentCardId,'NP02');assert.equal(continuation.context.sameEpisodeContinuation,true);assert.equal(continuation.context.continuingAssessment,true);
 const changed=aiRequestBody({text:'天气冷。补充：我有点想家了',latestInput:'我有点想家了',questionPurpose:'preference',clarificationAttempts:2,preferenceDelegated:false,topicChangeCandidate:true});
 assert.equal(changed.context.topicChangeCandidate,true);assert.equal(changed.context.preferenceDelegated,false);assert.equal(changed.context.latestInput,'我有点想家了');assert.equal(changed.context.clarificationAttempts,2);
});

test('explicit return to daily drops the closed emergency conversation without inventing symptom denial',()=>{
 const turns=[{role:'user',content:'剧烈胸痛，大汗淋漓'},{role:'assistant',content:'请立即拨打120'}];
 for(const flag of ['resolvedSafety','explicitReset']){
  const input={text:'',now:'2026-11-05T10:00:00+08:00',[flag]:true};
  const combined=mergeUnresolvedComplaint(turns[0].content,input.text,input);
  const body=aiRequestBody({...input,text:combined},turns);
  assert.equal(body.text,'');assert.equal(body.context.latestInput,'');assert.deepEqual(body.turns,[]);
  assert.equal(JSON.stringify(body).includes('胸痛'),false);assert.equal(JSON.stringify(body).includes('没有不舒服'),false);
 }
});

test('semantic new topics reset only a lifestyle preference, never an unresolved physical concern',()=>{
 const input={text:'天气冷。补充：我想家了',latestInput:'我想家了',questionPurpose:'preference',clarificationContext:{kind:'preference',topic:'preference',text:'天气冷'},clarificationAttempts:2,preferenceDelegated:false};
 const next=aiReplayInput(input,{level:'baseline'},{topicChanged:true,effectiveText:'我想家了'});
 assert.equal(next.text,'我想家了');assert.equal(next.clarificationAttempts,0);assert.equal(next.clarificationContext,undefined);assert.equal(next.questionPurpose,undefined);assert.equal(next.continuingAssessment,false);
 assert.equal(aiReplayInput(input,{level:'baseline'},{topicChanged:'true'}).clarificationAttempts,2);
 for(const local of [{level:'emergency'},{level:'clarify',assessmentPending:true},{level:'symptom',recheck:{afterSeconds:30}}]){
  const held=aiReplayInput(input,local,{topicChanged:true,effectiveText:'我想家了'});
  assert.equal(held.clarificationAttempts,2);assert.deepEqual(held.clarificationContext,input.clarificationContext);
 }
 const clinical={...input,questionPurpose:'symptom',clarificationContext:{kind:'symptom',topic:'cardiac',text:'心慌'}};
 assert.deepEqual(aiReplayInput(clinical,{level:'symptom'},{topicChanged:true}).clarificationContext,clinical.clarificationContext);
});
test('reset clears past dialogue, never a fresh red flag in the current message',()=>{
 const input={text:'现在又剧烈胸痛，大汗淋漓',now:'2026-11-05T10:00:00+08:00',resolvedSafety:true};
 const combined=mergeUnresolvedComplaint('昨日头晕',input.text,input);
 const request=aiRequestBody({...input,text:combined},[{role:'user',content:'昨日头晕'}]);
 assert.equal(request.text,input.text);assert.deepEqual(request.turns,[]);
 const decision=decide({...request.context,text:request.text},[]);
 assert.equal(decision.level,'emergency');assert.equal(retainSafetyDecision({level:'baseline'},decision,input).level,'emergency');
});
