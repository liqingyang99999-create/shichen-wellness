import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../data/cards.json' with {type:'json'};
import {decide} from '../lib/decision.mjs';
import {runCareAi,sanitizeCareRequest,handleCareAi,callCareModel,CareAiError} from '../server/care-ai.mjs';
const now='2026-11-05T08:00:00+08:00';
const body=(text='',extra={})=>({consent:true,text,turns:[],context:{now,profile:{constitution:['qi_deficiency'],conditions:[]},vitals:{source:'unavailable'},recentCards:[],...extra}});
const understand=(extra={})=>({intent:'wellbeing',activity:'none',facts:[],needsClarification:false,question:'',summary:'根据本次表达选择合适的小事。',...extra});
const autoModel=extra=>async(stage,input)=>stage==='understand'?understand(extra):{cardId:input.candidates.at(-1).id,explanation:'结合当前时辰，先选择一件轻松的小事。',question:''};
test('explanations cannot claim the current time period ended or infer a completed meal',async()=>{
 for(const explanation of ['辰时刚过，先安排一件轻松的小事。','辰时刚过早饭时段，先安静一会。','现在辰时已经结束，先安静一会。','你已经吃完早餐，先安排轻松的小事。','早餐后先留一点时间照顾自己。']){
  let selectedId;const r=await runCareAi(body('我很好',{now:'2026-11-05T08:10:00+08:00'}),{}, {model:async(stage,input)=>{if(stage==='understand')return understand();selectedId=input.candidates[0].id;return {cardId:selectedId,explanation,question:''};}});
  assert.equal(r.ai.status,'used');assert.equal(r.ai.explanationSource,'local');assert.equal(r.decision.card.id,selectedId);assert.doesNotMatch(r.decision.message,/刚过|已经结束|吃完早餐|早餐后/);assert.match(r.decision.message,/辰时/);
 }
});
test('actual two stages rank a validated candidate rather than merely rewrite local explanation',async()=>{
 const stages=[];const result=await runCareAi(body('我很好'),{}, {model:async(s,i)=>{stages.push(s);return autoModel()(s,i);}});
 assert.deepEqual(stages,['understand','select']);assert.equal(result.ai.status,'used');assert.equal(result.ai.stage,'selected');assert.ok(cards.some(c=>c.id===result.decision.card.id));assert.deepEqual(result.decision.card.steps,cards.find(c=>c.id===result.decision.card.id).steps);
});
test('known emergency, sleeping, objective confirmation never waits for a model',async()=>{
 for(const b of [body('剧烈胸痛，大汗淋漓'),body('',{now:'2026-11-05T23:30:00+08:00',vitals:{source:'simulation',measuredAt:'2026-11-05T23:30:00+08:00',quality:'good',asleep:true}}),body('',{vitals:{source:'simulation',measuredAt:now,quality:'good',heartRate:125,durationMinutes:10}})]){
  const r=await runCareAi(b,{}, {model:()=>{throw Error('must not call');}});assert.equal(r.ai.status,'guard');assert.ok(!r.decision.card);
 }
});
test('a passive card preserves the focused symptom question and cannot fabricate absent red flags',async()=>{
 const r=await runCareAi(body('刚生完气，有点心慌'),{}, {model:autoModel({intent:'symptom',facts:[],question:'这次是从什么时候开始的？'})});
 assert.equal(r.decision.assessmentPending,true);assert.ok(r.decision.card.reviewedSupport);assert.equal(r.decision.recheck.afterSeconds,30);
 assert.equal(r.decision.question,decide({text:'刚生完气，有点心慌',now},cards).question);assert.doesNotMatch(r.ai.effectiveText,/没有胸痛|没有气短/);
});
test('empty input ranks daily cards without asking an invented generic question',async()=>{
 const stages=[];const r=await runCareAi(body(),{}, {model:async(s,i)=>{stages.push(s);return autoModel()(s,i);}});
 assert.deepEqual(stages,['select']);assert.equal(r.ai.stage,'selected');assert.ok(r.decision.card);assert.equal(r.decision.question,undefined);
});
test('empty input with no eligible cards or pending confirmation never falsely claims model use',async()=>{
 for(const [request,library] of [[body(),[]],[body('',{confirmation:'yes'}),cards]]){
  const r=await runCareAi(request,{}, {cards:library,model:()=>{throw Error('must not call');}});
  assert.equal(r.ai.status,'guard');assert.equal(r.ai.model,null);assert.equal(r.decision.card,null);
 }
});

test('a daily time refresh cannot turn an optional model preference into a blocking question',async()=>{
 const r=await runCareAi(body('',{now:'2026-11-05T15:30:00+08:00'}),{}, {model:async(stage,input)=>{
  assert.equal(stage,'select');assert.equal(input.optionalPreferencesResolved,true);
  return {cardId:null,question:'你现在更想安静坐一会儿，还是安排下一餐？'};
 }});
 assert.ok(r.decision.card);assert.equal(r.decision.question,undefined);
 assert.equal(r.ai.status,'guard');assert.equal(r.ai.stage,'local_selection_fallback');
});
test('semantic positive evidence can escalate an unfamiliar idiom',async()=>{
 const r=await runCareAi(body('现在心脏像有小兔子在撞'),{}, {model:autoModel({intent:'symptom',facts:[{key:'palpitations',evidence:'现在心脏像有小兔子在撞',polarity:'present',time:'current'}],question:'这种感觉从什么时候开始的？'})});
 assert.equal(r.decision.assessmentPending,true);assert.equal(r.ai.positiveText,'心慌');
});
test('negation, old event, another person, hypothetical and absent evidence cannot create symptoms',async()=>{
 for(const text of ['我没有胸痛','昨天胸痛，现在想听轻音乐','如果胸痛怎么办','爸爸胸痛，我想听音乐']){
  const r=await runCareAi(body(text),{}, {model:async(s,i)=>s==='understand'?understand({facts:[{key:'chest_pain',evidence:'胸痛',polarity:'present',time:'current'}],needsClarification:true,question:'你想了解一般情况，还是描述现在自己的感受？'}):autoModel()(s,i)});
  assert.equal(r.ai.positiveText,'');if(decide({text,now},cards).level!=='emergency')assert.notEqual(r.decision.level,'emergency');else assert.equal(r.ai.status,'guard');
 }
});
test('invented fact substring is ignored and unknown complaint gets a free-text question',async()=>{
 const r=await runCareAi(body('嘴里总觉得怪怪的'),{}, {model:async()=>understand({intent:'unclear',needsClarification:true,question:'嘴里是什么感觉，从什么时候开始的？',facts:[{key:'chest_pain',evidence:'根本不存在',time:'current',polarity:'present'}]})});
 assert.equal(r.ai.positiveText,'');assert.equal(r.decision.level,'clarify');assert.deepEqual(r.decision.options,[]);assert.match(r.decision.question,/嘴里/);
});
test('clear benign activity may resolve generic ambiguity without adding a synthetic denial',async()=>{
 const r=await runCareAi(body('想给爸妈打个电话'),{}, {model:autoModel({intent:'activity',activity:'family'})});
 assert.equal(r.ai.effectiveText,'');assert.equal(r.ai.stage,'selected');assert.equal(r.ai.positiveText,'');
});
test('clear emotional rest request progresses even when model calls it wellbeing',async()=>{
 const r=await runCareAi(body('刚才跟家人吵了几句，心里还堵着，昨晚也没睡踏实，想安静一会儿'),{}, {model:autoModel({intent:'wellbeing',activity:'rest'})});
 assert.equal(r.ai.stage,'selected');assert.ok(r.decision.card);assert.equal(r.ai.effectiveText,'');
 const uncertain=await runCareAi(body('刚才跟家人吵了几句，胸口还堵着，想安静一会儿'),{}, {model:async()=>understand({intent:'wellbeing',activity:'rest'})});
 assert.equal(uncertain.decision.level,'clarify');assert.equal(uncertain.decision.card,null);
});
test('24-hour cooled cards cannot enter the model candidate list',async()=>{
 const first=await runCareAi(body(),{}, {model:autoModel()});const id=first.decision.card.id;
 const second=await runCareAi(body('',{recentCards:[{id,shownAt:now}]}),{}, {model:async(s,i)=>{if(s==='select')assert.ok(!i.candidates.some(c=>c.id===id));return autoModel()(s,i);}});
 assert.notEqual(second.decision.card.id,id);
});
test('night candidates exclude audio, food, exercise, and actions requiring rising',async()=>{
 const r=await runCareAi(body('我还醒着',{now:'2026-11-05T23:30:00+08:00'}),{}, {model:async(s,i)=>{if(s==='select')for(const c of i.candidates){const full=cards.find(x=>x.id===c.id);assert.equal(full.nightSafe,true);assert.ok(!full.audio);assert.ok(!/食养|八段锦|舒展/.test(full.category));}return autoModel()(s,i);}});assert.equal(r.ai.stage,'selected');
});
test('server projections preserve mobility, fluid, allergy restrictions but drop PII and histories',()=>{
 const clean=sanitizeCareRequest(body('你好',{profile:{name:'secret-name',age:65,limitedMobility:true,fluidRestricted:true,allergies:'花生',conditions:['diabetes'],constitution:['qi_deficiency']},weather:{city:'secret-city',latitude:39,temperature:8},medications:[{name:'secret-drug'}]}));
 assert.equal(clean.context.profile.limitedMobility,true);assert.equal(clean.context.profile.fluidRestricted,true);assert.deepEqual(clean.context.profile.allergies,['food_allergy']);assert.ok(!JSON.stringify(clean).includes('secret'));assert.ok(!JSON.stringify(clean).includes('花生'));
});
test('outdated weather is removed before candidate filtering and model context',async()=>{
 for(const measuredAt of ['2026-11-05T05:00:00+08:00','2026-11-04T08:00:00+08:00']){
  const r=await runCareAi(body('',{weather:{temperature:-5,drop24h:8,source:'open-meteo',measuredAt}}),{}, {model:async(s,i)=>{assert.deepEqual(i.context.weather,{});return {cardId:i.candidates[0].id,explanation:'当前气温很冷，所以选择室内休息。'};}});
  assert.equal(r.ai.explanationSource,'local');assert.doesNotMatch(r.decision.message,/气温很冷/);
 }
});
test('future weather timestamps are removed; fresh and untimed supplied records keep honest provenance',()=>{
 assert.deepEqual(sanitizeCareRequest(body('',{weather:{temperature:-5,source:'simulation',measuredAt:'2026-11-05T08:01:00+08:00'}})).context.weather,{});
 const fresh=sanitizeCareRequest(body('',{weather:{temperature:8,source:'simulation',measuredAt:now}})).context.weather;assert.equal(fresh.temperature,8);assert.equal(fresh.source,'simulation');assert.equal(fresh.measuredAt,now);
 const manual=sanitizeCareRequest(body('',{weather:{temperature:8,source:'open-meteo'}})).context.weather;assert.equal(manual.source,'provided');assert.equal(manual.measuredAt,undefined);
});
test('food allergy excludes food cards and mobility limits are preserved',async()=>{
 await runCareAi(body('',{profile:{constitution:['all'],conditions:[],allergies:'花生',limitedMobility:true}}),{}, {model:async(s,i)=>{if(s==='select')assert.ok(i.candidates.every(c=>!c.category.includes('食养')));return autoModel()(s,i);}});
});
test('unknown card IDs are rejected; unsafe explanation cannot replace an otherwise valid selection',async()=>{
 await assert.rejects(runCareAi(body(),{}, {model:async(s,i)=>s==='understand'?understand():{cardId:'inject-unknown',explanation:'休息一下。'}}),e=>e instanceof CareAiError);
 for(const explanation of ['这张卡可以降血压。','手表心率正常，已经排除危险。']){
  const r=await runCareAi(body(),{}, {model:async(s,i)=>s==='understand'?understand():{cardId:i.candidates[0].id,explanation,steps:['擅自服药']}});
  assert.equal(r.ai.status,'used');assert.equal(r.ai.explanationSource,'local');assert.ok(!r.decision.message.includes(explanation));assert.ok(!r.decision.card.steps.includes('擅自服药'));assert.deepEqual(r.decision.card.steps,cards.find(c=>c.id===r.decision.card.id).steps);
 }
});
test('known card codes and third-person wording are removed from the checked explanation',async()=>{
 const r=await runCareAi(body(),{}, {model:async(s,i)=>s==='understand'?understand():{cardId:i.candidates[0].id,explanation:`${i.candidates[0].id}让用户先留一小会儿，照顾当前的感受。`}});
 assert.equal(r.ai.explanationSource,'model');assert.doesNotMatch(r.decision.message,/用户|\b[A-Z]{1,4}\d{2,4}\b/);assert.match(r.decision.message,/你/);
});
test('model cannot override same-category alternative selection',async()=>{
 const first=await runCareAi(body(),{}, {model:autoModel()});
 const next=await runCareAi(body('',{currentCardId:first.decision.card.id,selectionMode:'same_category',recentCards:[{id:first.decision.card.id,shownAt:now}]}),{}, {model:async(s,i)=>{if(s==='select')assert.ok(i.candidates.every(c=>c.category===first.decision.card.category));return autoModel()(s,i);}});assert.notEqual(next.decision.card?.id,first.decision.card.id);
});
test('alternative-method pool keeps same-category before lower-burden options',async()=>{
 const first=await runCareAi(body(),{}, {model:autoModel()});let candidates=[];
 await runCareAi(body('',{currentCardId:first.decision.card.id,selectionMode:'alternative_method',recentCards:[{id:first.decision.card.id,shownAt:now}]}),{}, {model:async(s,i)=>{if(s==='select')candidates=i.candidates;return autoModel()(s,i);}});
 assert.ok(candidates.length);assert.ok(candidates.every(c=>c.category===first.decision.card.category));
});
test('next time slot varies category and action family before model ranking',async()=>{
 const first=await runCareAi(body(),{}, {model:autoModel()});let candidates=[];
 await runCareAi(body('',{now:'2026-11-05T10:00:00+08:00',recentCards:[{id:first.decision.card.id,shownAt:now,slot:7,category:first.decision.card.category,actionFamily:first.decision.card.actionFamily}]}),{}, {model:async(s,i)=>{if(s==='select')candidates=i.candidates;return autoModel()(s,i);}});
 assert.ok(candidates.length);assert.ok(candidates.every(c=>c.category!==first.decision.card.category));assert.ok(candidates.every(c=>cards.find(x=>x.id===c.id).actionFamily!==first.decision.card.actionFamily));
});
test('combined complaints preserve maximum trigger coverage before model ranking',async()=>{
 let candidates=[];await runCareAi(body('我口干，也有口苦'),{}, {model:async(s,i)=>{if(s==='select')candidates=i.candidates;return autoModel()(s,i);}});
 assert.ok(candidates.length);const eligible=cards.filter(c=>decide({text:'我口干，也有口苦',now},[c]).card?.id===c.id);const coverage=c=>['dry_mouth','bitter_taste'].filter(x=>c.triggers.includes(x)).length;const max=Math.max(...eligible.map(coverage));
 assert.ok(candidates.every(c=>coverage(cards.find(x=>x.id===c.id))===max));
});
test('stale and missing measurements never support invented factual explanations',async()=>{
 for(const vitals of [{source:'device',quality:'good',measuredAt:'2026-11-04T08:00:00+08:00',heartRate:70},{source:'device',quality:'good',measuredAt:now,sleepHours:8}]){
  const r=await runCareAi(body('',{vitals}),{}, {model:async(s,i)=>s==='understand'?understand():{cardId:i.candidates[0].id,explanation:'结合手表心率平稳，安排放松活动。',question:''}});
  assert.equal(r.ai.explanationSource,'local');assert.doesNotMatch(r.decision.message,/心率平稳/);
 }
});
test('daily baseline with ordinary simulated readings retains verified AI ranking if prose needs fallback',async()=>{
 const vitals={source:'simulation',quality:'good',measuredAt:now,heartRate:72,baselineHeartRate:70,hrv:42,baselineHrv:44,stress:28,sleepHours:7.2,nightHeartRate:59,steps:3260,durationMinutes:10};
 let selectedId;const r=await runCareAi(body('',{vitals}),{}, {model:async(s,i)=>{assert.equal(s,'select');selectedId=i.candidates[0].id;return {cardId:selectedId,explanation:'模拟心率平稳，用户可以安全地做这个活动。'};}});
 assert.equal(r.ai.status,'used');assert.equal(r.ai.explanationSource,'local');assert.equal(r.decision.card.id,selectedId);assert.doesNotMatch(r.decision.message,/平稳|安全|用户/);
});
test('semantic appetite and bowel mappings are recognized by the authoritative rules',async()=>{
 for(const [text,key,expected] of [['见到饭就没兴致','poor_appetite','poor_appetite'],['最近排便变得稀软','loose_stool','loose_stool']]){
  const r=await runCareAi(body(text),{}, {model:autoModel({intent:'symptom',facts:[{key,evidence:text,polarity:'present',time:'current'}]})});
  assert.ok(r.decision.evidence[0].symptoms.includes(expected));
 }
});
test('only explicitly latest-night poor sleep remains relevant past context',async()=>{
 for(const text of ['昨晚没睡踏实，想安静一会儿','昨夜没有睡好，今天想休息一下','最近一晚睡得不好','昨天晚上没睡安稳']){
  const r=await runCareAi(body(text),{}, {model:autoModel({intent:'wellbeing',activity:'rest',facts:[{key:'poor_sleep',evidence:text,polarity:'present',time:'past'}]})});
  assert.match(r.ai.positiveText,/没睡好/);assert.ok(r.decision.evidence[0].symptoms.includes('poor_sleep'));
 }
 for(const [text,key] of [['前天晚上没睡好','poor_sleep'],['上周那天昨晚没睡好','poor_sleep'],['昨晚没有失眠','poor_sleep'],['昨晚并非没睡好','poor_sleep'],['如果今晚睡不好','poor_sleep'],['昨晚胸痛，现在想休息','chest_pain'],['昨晚觉得很累','fatigue']]){
  const r=await runCareAi(body(text),{}, {model:autoModel({intent:'wellbeing',activity:'rest',facts:[{key,evidence:text,polarity:'present',time:'past'}]})});
  assert.equal(r.ai.positiveText,'');
 }
 for(const text of ['今晚打算熬夜','上周没睡好']){
  const r=await runCareAi(body(text),{}, {model:autoModel({facts:[{key:'poor_sleep',evidence:text,polarity:'present',time:'current'}]})});assert.equal(r.ai.positiveText,'');
 }
});
test('transport rejects blank, truncated and malformed provider output, never leaks provider error text',async()=>{
 for(const choice of [{finish_reason:'stop',message:{content:'   '}},{finish_reason:'length',message:{content:'{}'}},{finish_reason:'stop',message:{content:'[1]'}}])await assert.rejects(callCareModel('understand',{}, {LLM_API_KEY:'test-only',LLM_MODEL:'deepseek-flash',FETCH:async()=>Response.json({choices:[choice]})}),e=>e.code==='invalid_model_response');
});
test('transport deadline also aborts a stalled provider body',async()=>{
 await assert.rejects(callCareModel('understand',{}, {LLM_API_KEY:'test-only',LLM_MODEL:'deepseek-flash',LLM_TIMEOUT_MS:1000,FETCH:()=>new Promise(()=>{})}),e=>e.code==='model_timeout');
});
test('endpoint requires consent, same-origin and a configured rate limiter',async()=>{
 const req=(origin,payload=body())=>new Request('https://example/api/care-ai',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 assert.equal((await handleCareAi(req('https://evil.test'))).status,403);
 assert.equal((await handleCareAi(req('https://shichen-wellness.pages.dev'))).status,503);
 assert.equal((await handleCareAi(req('https://shichen-wellness.pages.dev.evil.test'))).status,403);
 assert.equal((await handleCareAi(req('https://care-preview.shichen-wellness.pages.dev'))).status,503);
 assert.equal((await handleCareAi(req('https://care-preview.shichen-wellness.pages.dev',{...body(),consent:false}),{DEMO_RATE_LIMITER:{limit:async()=>({success:true})}})).status,400);
 assert.equal((await handleCareAi(req('https://care-preview.shichen-wellness.pages.dev'),{DEMO_RATE_LIMITER:{limit:async()=>({success:false})}})).status,429);
});
test('request size is checked before parsing and status reveals no secret',async()=>{
 const r=await handleCareAi(new Request('https://x/api/care-ai',{method:'POST',headers:{Origin:'https://care-preview.shichen-wellness.pages.dev','Content-Type':'application/json'},body:'x'.repeat(65537)}),{DEMO_RATE_LIMITER:{limit:async()=>({success:true})}});assert.equal(r.status,413);
 const status=await handleCareAi(new Request('https://x/api/care-ai/status'),{LLM_API_KEY:'SECRET',LLM_MODEL:'deepseek-flash'});assert.equal((await status.json()).available,true);
});
