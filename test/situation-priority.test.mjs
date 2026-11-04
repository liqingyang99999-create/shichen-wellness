import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDialogue, runWorkflow, evaluateEligibility } from '../server/engine.mjs';
import { applyLatestDialogue, createChatSnapshot, LIFESTYLE_FOCUS_VALUES } from '../lib/context.mjs';
import { mobileSnapshot } from '../lib/mobile-context.mjs';
import { normalizeMobileInput } from '../server/mobile.mjs';
import { normalizeAgentInput } from '../server/agent-api.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const now = '2026-11-04T19:30:00+08:00';
const facts = parsed => Object.fromEntries(parsed.proposals.map(p => [p.field,p.value]));
const frozen = result => result.trace.find(node => node.id === 'N03').output.snapshot;
const resultFor = (text, snapshot = {}, state = {}, random = 0.99999) => runWorkflow({snapshot:{...createChatSnapshot(now),inputMode:'chat',...snapshot},dialogue:text,autoApplyDialogue:true,mode:'preview',state},{RANDOM:()=>random});

test('reported eating expressions have distinct phases and never invent fatigue or a desire to rest', async () => {
  for(const [text,phase] of [['我正在吃东西','during'],['我吃饭呢','during'],['我刚吃完饭','after'],['我刚吃完东西','after'],['我准备吃饭','before'],['我没吃饭','before']]) {
    const parsed=await parseDialogue(text,createChatSnapshot(now));
    const values=facts(parsed);
    assert.equal(values.mealPhase,phase,text);assert.equal(values.atMeal,phase==='during',text);
    for(const field of ['intent','sleepState','screenMinutes','sedentaryMinutes','activityMinutes','mood','now'])assert.equal(values[field],undefined,`${text}: ${field}`);
  }
  for(const text of ['我没有在吃东西','我没有吃完饭','我妈正在吃东西','明天准备吃饭','如果我刚吃完饭']) {
    assert.equal(facts(await parseDialogue(text,createChatSnapshot(now))).mealPhase,undefined,text);
  }
});

test('explicit denial clears stale meal or mood facts without inventing the opposite state', async () => {
  const previous={...createChatSnapshot(now),mealPhase:'after',atMeal:false,mood:'low',contextFocus:'meal-after',canLeaveSeat:false};
  const before=applyLatestDialogue(previous,await parseDialogue('我没吃饭',previous));
  assert.equal(before.mealPhase,'before');assert.equal(before.contextFocus,'meal-before');
  const incomplete=applyLatestDialogue(previous,await parseDialogue('我没有吃完饭',previous));
  assert.equal(incomplete.mealPhase,undefined);assert.equal(incomplete.atMeal,undefined);assert.equal(incomplete.canLeaveSeat,false);
  const deniedMood=applyLatestDialogue({...previous,contextFocus:'emotion'},await parseDialogue('我没有心情不好',previous));
  assert.equal(deniedMood.mood,undefined);assert.equal(deniedMood.contextFocus,'general');
  for(const text of ['我朋友没有心情不好','明天可能没有心情不好']) {
    assert.equal(applyLatestDialogue(previous,await parseDialogue(text,previous)).mood,'low',text);
  }
  const corrected=applyLatestDialogue(previous,await parseDialogue('我没有吃完饭，现在确实吃完饭了',previous));
  assert.equal(corrected.mealPhase,'after','later affirmative correction wins');
});

test('mood is grounded in current self-description, including corrections rather than diagnosis', async () => {
  for(const text of ['我心情不好','我有点难过','我不是困，是心烦']) {
    const parsed=await parseDialogue(text,createChatSnapshot(now));
    assert.equal(facts(parsed).mood,'low');assert.equal(parsed.focus,'emotion');
    assert.equal(facts(parsed).sleepState,undefined);assert.equal(facts(parsed).intent,undefined);
  }
  for(const text of ['我没有心情不好','我朋友心情不好','明天可能心情不好'])assert.equal(facts(await parseDialogue(text,createChatSnapshot(now))).mood,undefined,text);
  assert.equal(facts(await parseDialogue('我心情不好。现在心情平复了',createChatSnapshot(now))).mood,'settled');
});

test('latest topic replaces stale quiet/eye focus while explicit safety conditions remain unchanged', async () => {
  let snapshot={...createChatSnapshot(now),intent:'eye',contextFocus:'eye',screenMinutes:40,canLeaveSeat:false,canCloseEyes:false};
  for(const [text,focus] of [['我刚吃完饭','meal-after'],['我心情不好','emotion'],['我准备吃饭','meal-before']]) {
    snapshot=applyLatestDialogue(snapshot,await parseDialogue(text,snapshot));
    assert.equal(snapshot.contextFocus,focus);assert.equal(snapshot.intent,'general');
    assert.equal(snapshot.canLeaveSeat,false);assert.equal(snapshot.canCloseEyes,false);
  }
  const next=mobileSnapshot(now,{}, {capturedAt:Date.parse(now),snapshot});
  assert.equal(next.contextFocus,'meal-before');assert.equal(next.mood,'low');
  const {inputMode,...wire}=next;
  assert.equal(normalizeMobileInput({snapshot:wire}).snapshot.contextFocus,'meal-before');
  assert.equal(normalizeAgentInput({snapshot:{mood:'low',contextFocus:'emotion'}}).mood,'low');
});

test('all three screenshots select relevant groups even at the extreme end of random selection', async () => {
  for(const [text,tag] of [['我正在吃东西','meal-during'],['我刚吃完饭','meal-after'],['我心情不好','emotion']]) {
    for(const random of [0,0.49,0.99999]) {
      const result=await resultFor(text,{intent:'quiet',contextFocus:'quiet'}, {},random);
      assert.ok(result.card,text);assert.ok(result.card.tags.includes(tag),`${text}: ${result.card.title}`);
      assert.doesNotMatch(result.explanation,/用户已确认|已确认的.*意愿/);
      assert.equal(frozen(result).sleepState,'unknown');
      assert.equal(frozen(result).sitting,undefined);
    }
  }
});

test('meal phase pools cover all hours and survive recent-three exclusion without mixing phases', async () => {
  for(let hour=0;hour<24;hour++)for(const [text,tag] of [['我正在吃东西','meal-during'],['我刚吃完饭','meal-after']]) {
    let state={recentCards:[]};
    for(let turn=0;turn<5;turn++) {
      const result=await resultFor(text,{now:`2026-11-04T${String(hour).padStart(2,'0')}:30:00+08:00`},state,0);
      assert.ok(result.card,`${hour}: ${text}: ${result.decision.reason}`);
      assert.ok(result.card.tags.includes(tag));assert.ok(!state.recentCards.includes(result.card.id));
      state=result.state;
    }
  }
});

test('eating never admits generic writing, closed-eye, breathing drills, walking or eye cards', async () => {
  const snapshot={atMeal:true,mealPhase:'during',intent:'general',sitting:true,canLeaveSeat:true,canCloseEyes:true,spaceEnough:true,hasSupport:true};
  for(const id of ['15','11','07','T024','T033']) {
    const card=catalog.cards.find(c=>c.id===id);
    assert.equal(evaluateEligibility({card,snapshot,context:{hour:19,day:'2026-11-04'},mode:'preview'}).eligible,false,id);
  }
  let state={recentCards:[]};
  for(let turn=0;turn<7;turn++) {
    const result=await resultFor('我正在吃东西，心情不好',{},state,0);
    assert.ok(result.card?.tags.includes('meal-during'));
    assert.doesNotMatch(result.card.steps.join(''),/闭目|闭眼|写下|起身|走动|深呼吸|屏息/);
    state=result.state;
  }
});

test('seasonal dishes require explicit before-meal context and match verified seasonal boundaries', async () => {
  for(const [date,season] of [['2026-11-04','autumn'],['2026-11-08','winter'],['2026-06-01','summer'],['2026-03-01','spring']]) {
    const result=await resultFor('准备吃饭',{now:`${date}T19:30:00+08:00`});
    assert.ok(result.card.tags.includes('seasonal-food'));assert.ok(result.card.seasons.includes(season));
  }
  for(const text of ['午饭','我刚吃完饭','我心情不好','我正在吃东西']) {
    const result=await resultFor(text);
    assert.ok(!result.card?.tags.includes('seasonal-food'),text);
  }
  const unknownYear=await resultFor('准备吃饭',{now:'2027-03-01T19:30:00+08:00'});
  assert.ok(!unknownYear.card?.tags.includes('seasonal-food'),'no seasonal promise from an unverified year');
});

test('LLM generic time explanations or invented confirmation fall back to the actual meal topic', async () => {
  for(const explanation of ['戌时，用户已确认希望安静休息。','结合当前时段，从候选中随机选出这张卡。']) {
    const env={LLM_API_KEY:'fixture-only',LLM_MODEL:'fixture-only',RANDOM:()=>0,FETCH:async (_url,init)=>{
      const input=JSON.parse(JSON.parse(init.body).messages[1].content);
      const output=input.dialogue!==undefined?{proposals:[{field:'intent',value:'quiet',evidence:'吃完饭'}]}:
        input.providedTags?{contextTags:input.providedTags,queryText:'休息眼睛 看远处'}:
          {explanation,sourceIds:[input.retrievedSources[0].sourceId],reasonIds:['time','selection']};
      return Response.json({choices:[{message:{content:JSON.stringify(output)}}]});
    }};
    const result=await runWorkflow({snapshot:{...createChatSnapshot(now),inputMode:'chat'},dialogue:'我刚吃完饭',autoApplyDialogue:true,mode:'preview'},env);
    assert.equal(frozen(result).intent,'general');assert.ok(result.card.tags.includes('meal-after'));
    assert.match(result.explanation,/餐后|用完餐/);assert.doesNotMatch(result.explanation,/已确认|眼睛|看远/);
    assert.equal(result.trace.find(n=>n.id==='N08').status,'fallback');
  }
});

test('driving, cycling and crossing block even manual preview; explicit safe corrections can clear them', async () => {
  for(const text of ['我正在开车','我骑车','我正在过马路']) {
    const result=await resultFor(text);assert.equal(result.card,null,text);assert.match(result.decision.reason,/路况/);
  }
  const driver={...createChatSnapshot(now),activityPhase:'driving'};
  for(const text of ['我已经停好车了','我不是开车，是坐车','我没在开车']) {
    const next=applyLatestDialogue(driver,await parseDialogue(text,driver));
    assert.notEqual(next.activityPhase,'driving');assert.equal(next.sitting,undefined);assert.equal(next.canLeaveSeat,undefined);
  }
  const stillDriving=applyLatestDialogue(driver,await parseDialogue('我心情不好',driver));
  assert.equal(stillDriving.activityPhase,'driving','changing topic must not erase a known safety restriction');
  assert.ok((await resultFor('我没在开车',{activityPhase:'driving'})).card,'explicitly negated driving is not blocked');
});

test('unknown meal phase stays absent; invalid declared stages never become a general applicable card', () => {
  assert.equal(normalizeMobileInput({snapshot:{}}).snapshot.mealPhase,undefined);
  assert.throws(()=>normalizeMobileInput({snapshot:{mealPhase:'unknown'}}));
  const example={id:'invalid-phase',hours:[19],night:true,tags:['food','meal-after'],requirements:{}};
  for(const mealPhases of [[],['unknown'],null])assert.equal(evaluateEligibility({card:{...example,mealPhases},snapshot:{mealPhase:'after'},context:{hour:19},mode:'preview'}).eligible,false);
});

test('common eye, work, bedtime and exercise expressions do not fabricate durations or permissions', async () => {
  for(const text of ['我眼睛有点酸','我久坐了','我在开会','我准备睡觉','我刚跑完步','我想喝水']) {
    const parsed=await parseDialogue(text,createChatSnapshot(now)),values=facts(parsed);
    for(const field of ['screenMinutes','sedentaryMinutes','activityMinutes','waterAvailable','canLeaveSeat','sleepState'])assert.equal(values[field],undefined,`${text}: ${field}`);
  }
  assert.equal(facts(await parseDialogue('我刚跑完步',createChatSnapshot(now))).activityPhase,'post-exercise');
  assert.equal((await parseDialogue('我想喝水',createChatSnapshot(now))).focus,'hydration');
  const result=await resultFor('我想喝水');
  assert.equal(frozen(result).waterAvailable,undefined);
  assert.ok(!result.card || result.card.tags.includes('water'));
});

const lifestyleNow = '2026-11-04T10:30:00+08:00';
const activityConditions = {now:lifestyleNow,sitting:true,canLeaveSeat:true,spaceEnough:true,hasSupport:true,waterAvailable:true,canCloseEyes:true,atMeal:false};
const activityCases = [
  ['我想写三行日记','journal'],['我想拍一张照片','photo'],['我想画简笔画','drawing'],['我想泡茶','tea'],
  ['我想给家人打电话','family'],['我想拉伸一下','stretch'],['我想给植物浇水','plants'],['我想发呆','daydream'],
  ['我想买一束花','flowers'],['我想练一式八段锦','qigong'],['我想练双手托天','qigong'],['我想练左右开弓','qigong']
];

test('twelve explicit lifestyle requests reach their own activity without inventing execution conditions', async () => {
  for(const [text,focus] of activityCases) {
    const parsed=await parseDialogue(text,createChatSnapshot(lifestyleNow));
    assert.equal(parsed.focus,focus,text);
    for(const field of ['sitting','canLeaveSeat','spaceEnough','hasSupport','waterAvailable','sleepState','screenMinutes','activityMinutes'])assert.equal(facts(parsed)[field],undefined,`${text}: ${field}`);
    const result=await resultFor(text,activityConditions);
    assert.ok(result.card,`${text}: ${result.decision.reason}`);assert.ok(result.card.tags.includes(focus),text);assert.equal(result.card.explicitOnly,true);
    assert.equal(frozen(result).contextFocus,focus);
    const {inputMode,...wire}=frozen(result);
    assert.equal(normalizeMobileInput({snapshot:wire}).snapshot.contextFocus,focus);
    assert.equal(normalizeAgentInput({snapshot:{contextFocus:focus}}).contextFocus,focus);
  }
});

test('negated, third-person and future lifestyle references cannot activate an explicit-only card', async () => {
  for(const [text,focus] of activityCases) {
    const action=text.replace(/^我想/,'');
    for(const denied of [`我不想${action}`,`我不太想${action}`,`我朋友想${action}`,`明天我想${action}`,`如果我想${action}`]) {
      const parsed=await parseDialogue(denied,createChatSnapshot(lifestyleNow));
      assert.notEqual(parsed.focus,focus,denied);
      const result=await resultFor(denied,activityConditions);
      assert.ok(!result.card?.explicitOnly,denied);
    }
  }
  for(const text of ['我不喜欢拍照','我不想练八段锦的双手托天','我已经拍照了','明天给家人打电话']) {
    assert.equal((await parseDialogue(text,createChatSnapshot(lifestyleNow))).focus,null,text);
  }
  const reference=catalog.cards.find(c=>c.id==='L001');
  assert.ok(reference);
  assert.equal(evaluateEligibility({card:{...reference,explicitOnly:'true'},snapshot:activityConditions,context:{hour:10},mode:'preview'}).eligible,false);
});

test('a new explicit activity replaces the cached topic and denial clears it without clearing limits', async () => {
  let snapshot={...createChatSnapshot(lifestyleNow),intent:'quiet',contextFocus:'emotion',mood:'low',canLeaveSeat:false};
  for(const [text,focus] of activityCases.slice(0,10)) {
    snapshot=applyLatestDialogue(snapshot,await parseDialogue(text,snapshot));
    assert.equal(snapshot.contextFocus,focus,text);assert.equal(snapshot.canLeaveSeat,false);assert.equal(snapshot.intent,'general');
  }
  const denied=applyLatestDialogue(snapshot,await parseDialogue('我不想练八段锦了',snapshot));
  assert.equal(denied.contextFocus,'general');assert.equal(denied.canLeaveSeat,false);assert.equal(denied.mood,'low');
  assert.equal((await parseDialogue('我想拍照，但现在我想写日记',snapshot)).focus,'journal');
  assert.equal((await parseDialogue('我想拍照，但现在我想安静休息',snapshot)).focus,'quiet');
  const cached=mobileSnapshot(lifestyleNow,{}, {capturedAt:Date.parse(lifestyleNow),snapshot});
  assert.equal(cached.contextFocus,'qigong');
});

test('meal, road attention and unknown execution conditions outrank explicit lifestyle requests', async () => {
  for(const [text] of activityCases) {
    const eating=await resultFor(text,{...activityConditions,atMeal:true,mealPhase:'during'});
    assert.equal(eating.card,null,text);assert.match(eating.decision.reason,/用餐中/);
    const driving=await resultFor(text,{...activityConditions,activityPhase:'driving'});
    assert.equal(driving.card,null,text);assert.match(driving.decision.reason,/路况/);
  }
  const missing=await resultFor('我想练一式八段锦',{now:lifestyleNow});
  assert.equal(missing.card,null);assert.match(missing.decision.reason,/未确认/);
  assert.equal(frozen(missing).canLeaveSeat,undefined);assert.equal(frozen(missing).spaceEnough,undefined);
});

test('explicit-only cards stay out of ordinary pools and empty rerolls; renewed requests may reuse exhausted same activity', async () => {
  for(const focus of ['general','eye','quiet','emotion','meal-before']) {
    const snapshot={...activityConditions,intent:focus==='eye'||focus==='quiet'?focus:'general',contextFocus:focus,mood:'low',mealPhase:'before'};
    for(const card of catalog.cards.filter(c=>c.explicitOnly)) assert.equal(evaluateEligibility({card,snapshot,context:{hour:10,day:'2026-11-04',season:'autumn'},mode:'preview'}).eligible,false,`${focus}: ${card.id}`);
  }
  const first=await resultFor('我想拍照',activityConditions,{},0);
  assert.ok(first.card?.tags.includes('photo'));
  const snapshot=frozen(first);
  const reroll=await runWorkflow({snapshot,state:first.state,mode:'reroll'});
  assert.equal(reroll.card,null);assert.match(reroll.decision.reason,/最近3张/);
  const again=await resultFor('我还是想拍一张照片',snapshot,first.state,0);
  assert.equal(again.card?.id,first.card.id);assert.equal(again.trace.find(n=>n.id==='N06').output.explicitRepeat,true);
  const auto=await runWorkflow({snapshot:{...snapshot,sleepState:'awake'},state:{recentCards:[first.card.id]},dialogue:'我想拍照',autoApplyDialogue:true,mode:'auto'});
  assert.equal(auto.card,null,'ordinary push cannot bypass recency through a request');
});

test('all eight qigong names select their own form while unnamed requests retain recent-three variety', async () => {
  const names=['两手托天','左右开弓','调理脾胃','五劳七伤','摇头摆尾','两手攀足','攒拳怒目','背后七颠'];
  for(const name of names) {
    const result=await resultFor(`我想练${name}`,activityConditions);
    assert.ok(result.card?.title.includes(name),`${name}: ${result.card?.title || result.decision.reason}`);
  }
  const alias=await resultFor('我想练双手托天',activityConditions);
  assert.ok(alias.card?.title.includes('两手托天'));
  let state={recentCards:[]};
  for(let turn=0;turn<8;turn++) {
    const result=await resultFor('我想练一式八段锦',activityConditions,state,0);
    assert.ok(result.card?.tags.includes('qigong'));
    assert.ok(!state.recentCards.includes(result.card.id),'new eligible forms take priority over repeating a requested topic');
    assert.equal(result.trace.find(n=>n.id==='N06').output.explicitRepeat,false);
    state=result.state;
  }
  assert.equal(LIFESTYLE_FOCUS_VALUES.length,10);
});

test('model query and explanation cannot replace an explicit lifestyle request with a generic time theme', async () => {
  const env={LLM_API_KEY:'fixture-only',LLM_MODEL:'fixture-only',RANDOM:()=>0,FETCH:async (_url,init)=>{
    const input=JSON.parse(JSON.parse(init.body).messages[1].content);
    const output=input.dialogue!==undefined?{proposals:[]}:
      input.providedTags?{contextTags:input.providedTags,queryText:'静心休息 远眺'}:
        {explanation:'根据当前时辰，为你选择轻松的小行动。',sourceIds:[input.retrievedSources[0].sourceId],reasonIds:['requested-activity','time']};
    return Response.json({choices:[{message:{content:JSON.stringify(output)}}]});
  }};
  const result=await runWorkflow({snapshot:{...createChatSnapshot(lifestyleNow),...activityConditions},dialogue:'我想拍一张照片',autoApplyDialogue:true,mode:'preview'},env);
  assert.ok(result.card?.tags.includes('photo'));assert.match(result.explanation,/拍.*照片/);
  assert.equal(result.trace.find(n=>n.id==='N08').status,'fallback');
});
