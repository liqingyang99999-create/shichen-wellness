import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decide,analyzeText} from '../lib/decision.mjs';
import {mergeCardHistory,recordCardSelection} from '../lib/card-history.mjs';
import {mergeUnresolvedComplaint} from '../lib/safety-state.mjs';

// Independent integration matrix uses the shipped catalog, not replicas of the selector.
const cards=JSON.parse(readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
const at='2026-11-05T12:30:00+08:00';
const profile={conditions:[],constitution:['qi_deficiency','qi_stagnation']};
const good=(now=at)=>({source:'device',quality:'good',measuredAt:now,heartRate:72,hrv:40,stress:20,sleepHours:7});
const run=(text='',extra={},library=cards)=>decide({now:at,text,profile,vitals:{source:'unavailable'},...extra},library);
const evidence=r=>r.evidence.find(e=>e.kind==='self-report');
const mildCardiac='心慌轻微短暂，正在缓解，没有胸痛、气短、冷汗或晕厥';
const noRoutine=result=>{assert.equal(result.card,null);assert.notEqual(result.level,'baseline');};

test('immediate red flags beat emotions, meals, night, normal devices and alternative requests',()=>{
  const flags=['我现在胸痛','我喘不过气','我冒冷汗','我刚刚晕倒','胸口压榨感一直没停'];
  for(const flag of flags)for(const mood of ['我很焦虑','刚刚吵完架'])for(const meal of ['刚吃完饭','正在吃饭'])for(const hour of ['00','12','23']){
    const now=`2026-11-05T${hour}:30:00+08:00`;
    const r=run(`${mood}，${meal}，${flag}`,{now,vitals:{...good(now),asleep:hour!=='12'},selectionMode:'alternative_method',currentCardId:'BR01'});
    assert.equal(r.level,'emergency',`${flag}/${mood}/${meal}/${hour}`);assert.equal(r.card,null);assert.match(r.message,/120/);
  }
});

test('coronary history cannot be softened by modifiers, low intensity or reassuring devices',()=>{
  for(const text of ['胸口有点不舒服','胸部有一点发闷','胸口轻微不适','新出现胸闷，感觉不太严重']){
    const r=run(text,{profile:{...profile,conditions:['coronary']},vitals:good()});
    assert.equal(r.level,'emergency',text);assert.equal(r.card,null);
  }
});

test('unknown cardiac details stay in assessment despite simultaneous ordinary symptoms or emotion',()=>{
  for(const text of ['我有点心慌，还有口干','刚吃完饭，胸闷又有点没胃口','我很焦虑，心慌胸闷','我还醒着，心慌，想听音乐']){
    const r=run(text,{vitals:good()});assert.notEqual(r.level,'baseline');
    if(text.includes('心慌胸闷')){assert.equal(r.level,'emergency');assert.equal(r.card,null);continue;}
    assert.equal(r.level,'clarify',text);assert.equal(r.inputKind,'cardiac');assert.equal(r.assessmentPending,true);
    assert.ok(r.card?.reviewedSupport);assert.equal(r.recheck.afterSeconds,30);
    assert.equal(r.clarificationContext?.topic,'cardiac');
  }
});

test('only explicitly mild brief improving symptoms with denied red flags enter bounded rest and recheck',()=>{
  const r=run(mildCardiac,{vitals:good()});
  assert.equal(r.reason,'graded_symptom_support');assert.ok(r.card?.reviewedSupport);
  assert.ok(Array.isArray(r.careSteps)&&r.careSteps.length);assert.equal(r.recheck?.afterSeconds,30);
  assert.doesNotMatch(r.careSteps.join(''),/按揉|内关|针|艾灸|喝水|深呼吸|憋气/);
  for(const altered of ['心慌短暂，正在缓解','心慌轻微，没有胸痛、气短、冷汗或晕厥','心慌轻微短暂，但正在加重']){
    const other=run(altered,{vitals:good()});assert.notEqual(other.level,'baseline');if(other.card){assert.ok(other.card.reviewedSupport);assert.ok(other.assessmentIncomplete);}else assert.match(other.reason,/review|palpitations/);
  }
  for(const condition of ['coronary','heart_failure']){
    const other=run(mildCardiac,{profile:{...profile,conditions:[condition]},vitals:good()});noRoutine(other);assert.notEqual(other.reason,'gentle_rest_recheck',condition);
  }
});

test('persistent or worsening symptoms upgrade instead of repeating a wellness attempt',()=>{
  const context={topic:'cardiac',text:mildCardiac};
  for(const outcome of ['persistent','worse']){
    const r=run('',{clarificationContext:context,recheckOutcome:outcome,vitals:good(),selectionMode:'alternative_method',currentCardId:'BR01'});
    noRoutine(r);assert.notEqual(r.reason,'gentle_rest_recheck');assert.match(r.message,/求助|医疗|就医|120/);
  }
  const newFlag=run('现在胸痛冒冷汗',{clarificationContext:context,recheckOutcome:'improved',vitals:good()});
  assert.equal(newFlag.level,'emergency');assert.equal(newFlag.card,null);
  assert.equal(run('心慌持续不缓解，刚吃完饭又很焦虑',{vitals:good()}).level,'emergency');
});

test('dizziness needs its own details and a worsening second symptom cannot inherit an improving course',()=>{
  const unknown=run('刚吃完饭有点头晕，又有点口干和担心',{vitals:good()});
  assert.ok(unknown.card?.reviewedSupport);assert.equal(unknown.inputKind,'dizziness');assert.equal(unknown.assessmentPending,true);
  const mild='头晕轻微短暂，正在缓解，没有胸痛、气短、冷汗或晕厥；没有一侧无力，讲话正常，面部正常';
  const rest=run(mild,{vitals:good()});assert.equal(rest.reason,'graded_symptom_support');assert.ok(rest.card?.reviewedSupport);
  const continued=run('',{clarificationContext:{topic:'dizziness',text:mild},recheckOutcome:'persistent',vitals:good()});
  assert.equal(continued.level,'symptom');assert.equal(continued.reason,'graded_support_unchanged');noRoutine(continued);
  for(const worsening of ['但头晕越来越厉害','头晕一直未缓解','头晕正在加重']){
    const mixed=run(`${mildCardiac}；${worsening}，没有一侧无力，讲话正常，面部正常`,{vitals:good()});
    noRoutine(mixed);assert.notEqual(mixed.reason,'gentle_rest_recheck',worsening);
  }
  for(const unassessed of ['此外还有头晕','头晕持续了一小时']){
    const mixed=run(`心慌轻微短暂，正在缓解，没有胸痛、气短、冷汗或晕厥；${unassessed}，没有一侧无力，讲话正常，面部正常`,{vitals:good()});
    noRoutine(mixed);assert.notEqual(mixed.reason,'gentle_rest_recheck',unassessed);
  }
  const newFlag=run('现在一侧无力，说话含糊',{clarificationContext:{topic:'dizziness',text:mild},recheckOutcome:'improved',vitals:good()});
  assert.equal(newFlag.level,'emergency');assert.equal(newFlag.card,null);
});

test('numbness slang cannot disappear behind anxiety or an ordinary fatigue label',()=>{
  for(const text of ['我手脚有点麻，今天很焦虑','手指有一点麻，还感觉有点累']){
    const r=run(text,{vitals:good()});assert.ok(r.card?.reviewedSupport);assert.ok(evidence(r).symptoms.includes('numbness'),text);assert.equal(r.inputKind,'numbness');
  }
  for(const text of ['我左手突然有点麻','我右脚突然麻了，还说话含糊','突然一侧手脚麻木，嘴角歪了','现在说话不清楚，左手麻']){
    assert.equal(run(text,{vitals:good()}).level,'emergency',text);
  }
});

test('denials and historical statements are not transformed into current emergencies',()=>{
  const ordinary=['我没有胸痛，也没有心慌，只是口干','不是头晕，是刚吃完饭犯困','昨天有些紧张，今天没有心慌，正在吃饭','如果胸痛要怎么办？我现在没有不舒服'];
  for(const text of ordinary){const r=run(text);assert.notEqual(r.level,'emergency',text);assert.ok(!evidence(r).symptoms.some(s=>['chest_pain','palpitations','dizzy'].includes(s)),text);}
  for(const text of ['我并不是没有胸痛','我没有胸痛和气短，但是现在心慌冒冷汗'])assert.equal(run(text).level,'emergency',text);
  const a=analyzeText('以前没有胸痛，不过现在胸痛');assert.ok(a.symptoms.includes('chest_pain'));
});

test('active meal plus mood remains meal-compatible; explicit discomfort is never hidden by meal preference',()=>{
  for(const mood of ['心情低落','很焦虑','刚生完气']){
    const r=run(`我正在吃饭，${mood}`);assert.ok(r.card,mood);assert.ok(r.card.triggers.includes('eating'));
    assert.equal(r.card.audio,undefined);assert.doesNotMatch(r.card.category,/穴位|八段锦|舒展/);
  }
  for(const text of ['正在吃饭，心慌','刚吃完饭，头晕','刚吃完饭，胸痛又想听音乐']){
    const d=run(text,{vitals:good()});assert.notEqual(d.level,'baseline');if(text==='刚吃完饭，头晕')assert.ok(d.card?.reviewedSupport);else noRoutine(d);
  }
  const atNight=run('我正在吃饭，很难过',{now:'2026-11-05T23:30:00+08:00'});
  assert.equal(atNight.card,null,'bed-only night contract never creates a meal-in-bed instruction');
});

test('multiple supportive symptoms still intersect fluid, allergy and mobility restrictions',()=>{
  const restricted={conditions:['heart_failure','diabetes'],fluidRestricted:true,limitedMobility:true,allergies:'豆类',constitution:['yin_deficiency','phlegm_damp']};
  for(const text of ['口干又口苦，很焦虑','口干，小便黄，刚吃完饭','没有胃口还很累','我口干，想听音乐'])for(let sequence=0;sequence<12;sequence++){
    const r=run(text,{profile:restricted,sequence});
    if(!r.card)continue;
    assert.notEqual(r.card.id,'DM01');assert.ok(!r.card.contraindications.includes('heart_failure'),r.card.id);
    assert.ok(!r.card.contraindications.includes('fluid_restriction'),r.card.id);
    assert.doesNotMatch(r.card.actionFamily,/herbal|qigong|walk|acupressure_zusanli/);
  }
  assert.equal(run('我没有不舒服',{profile:restricted},[cards.find(c=>c.id==='AC07')]).card,null);
});

test('cold environment and constitution preferences never override known constraints',()=>{
  for(const weather of [{temperature:3},{temperature:12,minTemperature:1},{temperature:18,drop24h:6}])for(const constitution of [[],['yang_deficiency'],['yin_deficiency','qi_deficiency']]){
    const r=run('',{weather,profile:{...profile,constitution,conditions:['diabetes'],limitedMobility:true}});
    assert.ok(r.card);assert.equal(r.card.indoor,true);assert.ok(!r.card.contraindications.includes('mobility_limited'));assert.notEqual(r.card.id,'AC07');
  }
  const selfCold=run('天气太冷了，我刚睡醒，不想起床',{now:'2026-11-05T06:30:00+08:00',weather:{temperature:32}});
  assert.ok(selfCold.card);assert.notEqual(selfCold.card.weatherCondition,'hot');
});

test('night combined with fatigue, emotion and cold only offers bed-compatible non-audio content',()=>{
  for(const hour of ['00','02','04','23'])for(const text of ['还醒着，没睡好又有点累','还醒着，有点紧张','天气冷，心里有些憋屈']){
    const r=run(text,{now:`2026-11-05T${hour}:30:00+08:00`,weather:{temperature:2}});
    assert.ok(r.card,`${hour}:${text}`);assert.equal(r.card.nightSafe,true);assert.equal(r.card.requiresGettingUp,false);assert.equal(r.card.audio,undefined);
    assert.doesNotMatch([r.card.title,...r.card.steps,r.card.why,r.card.safety_note].join(''),/心血管|血压|胸闷|心悸|风险|疾病/);
  }
  const now='2026-11-05T00:30:00+08:00';
  assert.equal(run('',{now,vitals:{...good(now),asleep:true}}).level,'silent');
  assert.equal(run('我胸痛',{now,vitals:{...good(now),asleep:true}}).level,'emergency');
});

test('freshness and objective-warning denial do not manufacture normal health or bypass symptoms',()=>{
  const high={...good(),heartRate:150,durationMinutes:12};
  const current=run('',{vitals:high,confirmation:'no'});noRoutine(current);assert.notEqual(current.level,'baseline');
  for(const patch of [{quality:'poor'},{source:'unavailable'},{measuredAt:'2026-11-05T12:19:59+08:00'},{measuredAt:'2026-11-05T12:31:00+08:00'}]){
    const stale=run('我没有不舒服',{vitals:{...high,...patch}});
    assert.ok(!stale.evidence.some(e=>e.kind==='vitals'));assert.doesNotMatch(stale.message,/手表正常|身体正常|数据正常/);
    assert.equal(run('我胸痛',{vitals:{...high,...patch},confirmation:'no'}).level,'emergency');
  }
  const pressure=run('头晕，但我想换一个方法',{bloodPressure:{systolic:186,diastolic:122,measuredAt:at},vitals:good(),selectionMode:'alternative_method',currentCardId:'BR01'});
  assert.equal(pressure.level,'emergency');
});

test('24-hour ID cooldown survives serialization, mode changes and same-category/alternative requests',()=>{
  let history=[];const first=run('',{vitals:good()});assert.ok(first.card);
  history=recordCardSelection(history,first.card,at,cards);
  const persisted=JSON.parse(JSON.stringify(history));
  for(const selectionMode of [undefined,'same_category','alternative_method']){
    const recentCards=mergeCardHistory([persisted,history],'2026-11-05T13:30:00+08:00',cards);
    const r=run('',{now:'2026-11-05T13:30:00+08:00',recentCards,selectionMode,currentCardId:first.card.id});
    assert.notEqual(r.card?.id,first.card.id,selectionMode||'ordinary');
  }
  const single=[cards.find(c=>c.id==='BR01')],shown=[{id:'BR01',shownAt:at}];
  assert.equal(run('',{now:'2026-11-06T12:29:59+08:00',recentCards:shown},single).card,null);
  assert.equal(run('',{now:'2026-11-06T12:30:00+08:00',recentCards:shown},single).card?.id,'BR01');
});

test('exhausted categories can lower burden only with a genuinely eligible, uncooled action',()=>{
  const eligible=cards.filter(c=>c.enabled!==false);
  const recentCards=eligible.filter(c=>c.id!=='BR01').map(c=>({id:c.id,shownAt:at}));
  const replacement=run('',{selectionMode:'alternative_method',currentCardId:'AC01',recentCards});
  assert.equal(replacement.card?.id,'BR01');assert.equal(replacement.reason,'alternative_lower_burden');
  const exhausted=run('',{selectionMode:'alternative_method',currentCardId:'AC01',recentCards:[...recentCards,{id:'BR01',shownAt:at}]});
  assert.equal(exhausted.card,null);
  assert.equal(run('胸痛',{selectionMode:'alternative_method',currentCardId:'AC01',recentCards}).level,'emergency');
});

test('weekly rehearsal remains stricter than 24 hours even after persisted history is merged',()=>{
  const card=cards.find(c=>c.id==='ER01'),shownAt='2026-11-01T12:30:00+08:00';
  const history=JSON.parse(JSON.stringify(mergeCardHistory([[{id:card.id,shownAt}]],at,cards)));
  assert.equal(run('',{recentCards:history},[card]).card,null);
  assert.equal(run('',{now:'2026-11-08T12:30:00+08:00',recentCards:history},[card]).card?.id,card.id);
  assert.equal(run('',{recentCards:[{id:card.id,shownAt:'2026-11-06T12:30:00+08:00'}]},[card]).card,null);
});

test('unresolved symptom context survives an intervening emotion or meal message',()=>{
  const accumulated=mergeUnresolvedComplaint('心慌还没有说清','我刚吃完饭，很焦虑');
  const r=run(accumulated,{vitals:good()});assert.ok(r.card?.reviewedSupport);assert.equal(r.assessmentIncomplete,true);
  assert.ok(evidence(r).symptoms.includes('palpitations'));assert.ok(evidence(r).context.includes('after_meal'));
  const red=run(mergeUnresolvedComplaint(accumulated,'现在胸痛冒冷汗'),{vitals:good()});assert.equal(red.level,'emergency');
});
