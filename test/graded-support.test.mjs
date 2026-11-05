import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../data/cards.json' with {type:'json'};
import {analyzeText,decide} from '../lib/decision.mjs';
import {runCareAi} from '../server/care-ai.mjs';

const now='2026-11-05T15:30:00+08:00';
const supportIds=['BR01','BR03','BR04','EM01','EM03','EM05','SU06','NP01','NP02'];
const base={now,profile:{conditions:['hypertension']},vitals:{source:'unavailable'},recentCards:[]};
const run=(text,extra={})=>decide({...base,text,...extra},cards);
const eligible=(text,extra={})=>cards.filter(c=>decide({...base,text,...extra},[c]).card).map(c=>c.id);
const gentle='有一点心慌，只有一小会，没有其他不舒服';
function passive(d){
 assert.ok(d.card,'a canonical passive support card is available');
 assert.ok(supportIds.includes(d.card.id),d.card.id);
 assert.equal(d.card.requiresGettingUp,false);
 assert.ok(!d.card.audio);
 assert.deepEqual(d.card.steps,cards.find(c=>c.id===d.card.id).steps,'server keeps reviewed action steps');
 assert.equal(d.recheck.afterSeconds,30);
}

test('minimal mild palpitations and hand numbness get passive support plus one factual question',()=>{
 for(const text of ['有一点心慌','我手有点麻']){
  const d=run(text);passive(d);assert.equal(d.level,'clarify');assert.equal(d.severity,'mild');
  assert.equal(d.reason,'graded_support_check');assert.ok(d.question);assert.equal(d.assessmentPending,true);
  assert.equal(d.assessmentIncomplete,true);assert.equal(d.questionPurpose,'symptom');
  assert.equal(analyzeText(text).course.otherDiscomfortDenied,false,'missing details are not invented');
 }
});

test('unknown severity stays unknown after an unanswered first question without looping',()=>{
 const first=run('我心慌');passive(first);assert.equal(first.severity,'unknown');assert.ok(first.question);
 const next=run('都行',{clarificationContext:{kind:'symptom',topic:'cardiac',text:'我心慌'},questionPurpose:'symptom',clarificationAttempts:1});
 passive(next);assert.equal(next.severity,'unknown');assert.equal(next.assessmentIncomplete,true);
 assert.equal(next.assessmentPending,false);assert.equal(next.question,undefined);assert.match(next.message,/信息不能确认/);
 const self=next.evidence.find(e=>e.kind==='self-report');assert.equal(self.course.otherDiscomfortDenied,false);
});

test('moderate isolated symptoms retain grading rather than becoming mild or automatically emergency',()=>{
 for(const text of ['心慌程度中等，没有其他不舒服','手有点麻，程度中等，没有其他不舒服']){
  const d=run(text);passive(d);assert.equal(d.severity,'moderate');assert.equal(d.level,'clarify');
  assert.ok(d.question);assert.equal(d.assessmentIncomplete,true);
 }
});

test('a complete brief mild description resolves the question but keeps the recheck',()=>{
 const d=run(gentle);passive(d);assert.equal(d.level,'symptom');assert.equal(d.reason,'graded_symptom_support');
 assert.equal(d.assessmentPending,false);assert.equal(d.assessmentIncomplete,false);assert.equal(d.question,undefined);
});

test('reviewed passive metadata is explicit and matches actual safe support candidates',()=>{
 const reviewed=cards.filter(c=>c.reviewedSupport);
 assert.deepEqual(reviewed.map(c=>c.id).sort(),[...supportIds].sort());
 for(const c of reviewed){assert.equal(c.reviewedSupport.kind,'passive_rest');assert.equal(c.reviewedSupport.duringAssessment,true);assert.equal(c.requiresGettingUp,false);assert.ok(c.reviewedSupport.symptomKeys.length);}
 const pressure='两只手现在还压在身下，手有一点麻，刚刚开始，没有其他不舒服';
 assert.deepEqual(eligible(pressure).sort(),[...supportIds].sort());
});

test('pressure release card requires still-current pressure; hand observation requires a hand fact',()=>{
 const current='两只手现在还压在身下，手有一点麻，刚刚开始，没有其他不舒服';
 assert.ok(eligible(current).includes('NP01'));assert.ok(eligible(current).includes('NP02'));
 for(const text of ['刚才双手压在身下，换开姿势后双手有一点麻但正在减轻，没有其他不舒服','双手有一点麻，没有压着手，没有其他不舒服']){
  assert.ok(!eligible(text).includes('NP01'),text);assert.ok(eligible(text).includes('NP02'),text);
 }
 assert.ok(!eligible('两只脚有一点麻，没有其他不舒服').includes('NP02'));
 const hypothetical='如果以后手被压麻了怎么办？现在手不麻，也没有压着手';
 assert.ok(!eligible(hypothetical).some(id=>['NP01','NP02'].includes(id)));
});

test('fluid restriction and limited mobility preserve passive care rather than recommending fluids',()=>{
 const d=run(gentle,{profile:{conditions:['hypertension'],fluidRestricted:true,limitedMobility:true}});passive(d);
 assert.doesNotMatch(d.card.steps.join(' '),/喝水|饮水|散步|站立|起身/);
});

test('all eligible support cards observe strict cooldown without escaping into exercise',()=>{
 const available=eligible(gentle);assert.equal(available.length,7);
 const recentCards=available.map(id=>({id,shownAt:now,slot:15}));
 const d=run(gentle,{recentCards});assert.equal(d.card,null);assert.equal(d.reason,'graded_support_cooldown');
 assert.match(d.message,/24小时冷却/);assert.equal(d.recheck.afterSeconds,30);
});

test('dangerous symptom combinations and persistent cardiac symptoms override mild wording',()=>{
 for(const text of ['左手突然有点麻，说话含糊不清','左手突然发麻','有一点心慌，还有胸闷','有一点心慌和头晕','心慌一直不消退','胸闷持续不缓解']){
  const d=run(text);assert.equal(d.level,'emergency',text);assert.equal(d.card,null);assert.match(d.message,/120/);
 }
});

test('severe isolated symptoms and coronary history do not borrow mild support eligibility',()=>{
 const severe=run('心慌十分难受，没有胸痛');assert.equal(severe.severity,'severe');assert.equal(severe.card,null);assert.equal(severe.medicalReviewRecommended,true);
 const coronary=run('胸口有一点闷，没有其他不舒服',{profile:{conditions:['coronary']}});
 assert.equal(coronary.level,'emergency');assert.equal(coronary.card,null);
});

test('severity denial and a few seconds duration are not upgraded to severe or prolonged',()=>{
 const text='不是严重心慌，只是轻微心慌，持续几秒，正在减轻，没有其他不舒服';
 const a=analyzeText(text);assert.equal(a.course.severity,'mild');assert.equal(a.course.persistent,false);
 const d=run(text);passive(d);assert.equal(d.severity,'mild');assert.notEqual(d.reason,'symptoms_medical_review');
});

test('reported twenty-minute chest tightness with no improvement is not reset to an unknown short episode',()=>{
 const text='胸闷已经持续了二十分钟，还没有好转。';
 const d=run(text);assert.equal(d.card,null);assert.ok(['symptom','emergency'].includes(d.level));
 assert.notEqual(d.reason,'graded_support_check');assert.equal(d.question,undefined);
 assert.match(d.message,/医疗|就医|120/);
});

test('30-second unchanged and generic worse feedback are distinguished from new acute evidence',()=>{
 const context={clarificationContext:{kind:'symptom',topic:'cardiac',text:gentle},continuingAssessment:true};
 const unchanged=run('差不多',{...context,recheckOutcome:'unchanged',latestInput:'差不多'});
 assert.equal(unchanged.level,'symptom');assert.equal(unchanged.reason,'graded_support_unchanged');assert.equal(unchanged.card,null);assert.equal(unchanged.course,'unchanged');
 const worse=run('加重或新不适',{...context,recheckOutcome:'worse',latestInput:'加重或新不适'});
 assert.equal(worse.level,'symptom');assert.equal(worse.reason,'symptoms_medical_review');assert.equal(worse.card,null);
 const danger=run('现在胸痛冒冷汗',{...context,recheckOutcome:'worse',latestInput:'现在胸痛冒冷汗'});
 assert.equal(danger.level,'emergency');assert.equal(danger.card,null);
});

test('improved feedback acknowledges resolution and never immediately starts a new baseline action',async()=>{
 const context={...base,clarificationContext:{kind:'symptom',topic:'cardiac',text:gentle},continuingAssessment:true,resolvedSafety:true,recheckOutcome:'improved'};
 const local=decide({...context,text:''},cards);assert.equal(local.reason,'symptoms_improved');assert.equal(local.assessmentResolved,true);assert.equal(local.card,null);
 const result=await runCareAi({consent:true,text:'',context},{},{cards,model:async()=>{throw new Error('resolved feedback must not invoke ranking');}});
 assert.equal(result.decision.reason,'symptoms_improved');assert.equal(result.decision.assessmentResolved,true);assert.equal(result.decision.card,null);assert.equal(result.ai.status,'guard');
 const daily=run('已没有不舒服，回到日常建议',{resolvedSafety:true,explicitReturnDaily:true,explicitReset:true});assert.ok(daily.card);assert.equal(daily.level,'baseline');
});

test('night support is quiet and sleeping suppression cannot hide a fresh acute report',()=>{
 const night='2026-11-05T23:30:00+08:00';
 const d=run(gentle,{now:night});passive(d);assert.equal(d.card.nightSafe,true);
 const vitals={source:'simulation',quality:'good',measuredAt:night,heartRate:72,baselineHeartRate:70,asleep:true};
 const sleeping=run('',{now:night,vitals});assert.equal(sleeping.level,'silent');assert.equal(sleeping.reason,'sleeping_at_night');assert.equal(sleeping.card,null);
 const acute=run('剧烈胸痛，大汗淋漓',{now:night,vitals});assert.equal(acute.level,'emergency');assert.equal(acute.card,null);
});
