import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../data/cards.json' with {type:'json'};
import {decide,analyzeText} from '../lib/decision.mjs';
import {runCareAi} from '../server/care-ai.mjs';
const now='2026-11-05T15:30:00+08:00';
const request=(text,extra={})=>({consent:true,text,context:{now,profile:{conditions:[]},vitals:{source:'unavailable'},recentCards:[],...extra},turns:[]});
const understanding=(extra={})=>({intent:'wellbeing',activity:'none',facts:[],needsClarification:false,question:'',summary:'根据你这次表达安排一件轻松小事。',...extra});
const model=(u,inspect=()=>{})=>async(stage,input)=>{inspect(stage,input);return stage==='understand'?u:{cardId:input.candidates[0].id,explanation:'先按你刚才表达的需要，留一点时间照顾自己。'};};
test('clear daily needs and emotional connection get relevant actions without optional questioning',async()=>{
 for(const [text,key,activity] of [['我有点饿了','hunger','meal'],['我现在想家了','homesick','none'],['我的情绪有点低落','sad','none'],['想安静休息','rest','rest'],['想喝点水','hydration','hydration']]){
  const u=understanding({activity,facts:[{key,evidence:text,time:'current',polarity:'present'}],needsClarification:true,question:'你更想哪一种方式呢？'});
  const r=await runCareAi(request(text),{}, {model:model(u)});
  assert.ok(r.decision.card,text);assert.equal(r.ai.stage,'selected');assert.equal(r.decision.question,undefined);
  if(key==='hunger')assert.ok(r.decision.card.triggers.includes('hungry'));
  if(key==='homesick')assert.ok(r.decision.card.triggers.includes('homesick'));
 }
});
test('semantic lifestyle intent supports held-out phrasing without making up clinical facts',async()=>{
 for(const text of ['活儿堆在一起，不知道先处理哪件','今天被误解了，真委屈','刚下夜班，脑子乱糟糟想静一静']){
  const seen=[];const u=understanding({intent:'activity',activity:'rest',speechAct:'emotion_connection',desiredSupport:text});
  const r=await runCareAi(request(text),{}, {model:model(u,(stage,input)=>seen.push([stage,input]))});
  assert.equal(r.ai.stage,'selected');assert.ok(r.decision.card);assert.equal(r.ai.positiveText,'');
  assert.equal(seen.at(-1)[1].understanding.desiredSupport,text);assert.equal(r.decision.question,undefined);
 }
});
test('delegation answers and one previously answered open preference cannot loop',async()=>{
 for(const latestInput of ['都行','你帮我选','不知道，你定','再给我一点想法']){
  const context={latestInput,questionPurpose:'preference',clarificationAttempts:1,clarificationContext:{kind:'preference',text:'天气太冷'}};
  const r=await runCareAi(request(latestInput,context),{}, {model:model(understanding({intent:'unclear',needsClarification:true,question:'室内活动还是保暖？'}))});
  assert.ok(r.decision.card,latestInput);assert.equal(r.decision.question,undefined);
 }
});
test('clear new semantic topic resets only old lifestyle preference context',async()=>{
 const text='有种小兔子在胸口跳的感觉';
 const context={latestInput:text,questionPurpose:'preference',topicChangeCandidate:true,clarificationAttempts:2,clarificationContext:{kind:'preference',text:'天气太冷'}};
 const u=understanding({intent:'symptom',activity:'rest',facts:[{key:'palpitations',evidence:text,polarity:'present',time:'current'}],needsClarification:true,question:'从什么时候开始的？'});
 const r=await runCareAi(request(text,context),{}, {model:model(u)});
 assert.equal(r.ai.topicChanged,true);assert.equal(r.decision.clarificationAttempts,0);assert.equal(r.decision.assessmentPending,true);assert.ok(r.decision.card.reviewedSupport);assert.doesNotMatch(r.ai.effectiveText,/天气太冷/);
});
test('meal needs respect night, contraindications and cooldown without unrelated fallback',()=>{
 for(const extra of [{now:'2026-11-05T23:30:00+08:00'},{profile:{allergies:'食物过敏'}},{recentCards:cards.filter(c=>c.triggers.includes('hungry')).map(c=>({id:c.id,shownAt:now}))}]){
  const d=decide({...request('我有点饿了',extra).context,text:'我有点饿了'},cards);assert.equal(d.card,null);assert.equal(d.reason,'hunger_no_compatible_card');assert.match(d.message,/饿/);
 }
});
test('ordinary low mood is not crisis screening, explicit current self-harm is intercepted before models',async()=>{
 assert.equal(analyzeText('我情绪低落，想家了').emergency,false);
 for(const text of ['我不想伤害自己','去年想伤害自己，现在没有这样的想法','如果想伤害自己怎么办'])assert.equal(analyzeText(text).emergency,false,text);
 const r=await runCareAi(request('我想伤害自己，手边已经准备了刀。'),{}, {model:()=>{throw Error('no model before urgent help');}});
 assert.equal(r.decision.reason,'self_harm_urgent_support');assert.equal(r.decision.card,null);assert.equal(r.ai.status,'guard');assert.match(r.decision.message,/信任的人|120/);
});
