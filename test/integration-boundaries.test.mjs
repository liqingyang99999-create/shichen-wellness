import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decide} from '../lib/decision.mjs';
import {retainSafetyDecision,mergeUnresolvedComplaint} from '../lib/safety-state.mjs';
import {followUpText} from '../lib/conversation.mjs';
import {shichen,solarTerm} from '../lib/time.mjs';
const cards=JSON.parse(readFileSync(new URL('../data/cards.json',import.meta.url)));
const base={now:'2026-11-05T08:20:00+08:00',profile:{conditions:[],constitution:[]},vitals:{source:'simulation',measuredAt:'2026-11-05T08:20:00+08:00',quality:'good',heartRate:72}};
test('an isolated complaint receives support, while a new concerning combination overrides a normal watch',()=>{
  const first=decide({...base,text:'我现在心慌'},cards);
  assert.equal(first.level,'clarify');
  assert.equal(first.reason,'graded_support_check');
  assert.equal(first.assessmentPending,true);
  assert.ok(first.card);assert.equal(first.recheck.afterSeconds,30);
  const text=mergeUnresolvedComplaint('我现在心慌','现在也胸闷');
  const second=decide({...base,text},cards);
  assert.equal(second.level,'emergency');
  assert.equal(second.card,null);
  assert.equal(retainSafetyDecision(first,second,{continuingAssessment:true}),second);
  const restored=JSON.parse(JSON.stringify({decision:second,text}));
  assert.equal(retainSafetyDecision(restored.decision,{level:'baseline'}),restored.decision);
});
test('persistent cardiac discomfort or new breathlessness upgrades the pending assessment',()=>{
  const first=decide({...base,text:'我现在心慌'},cards);
  assert.equal(first.assessmentPending,true);
  for(const latest of ['心慌一直没有缓解','现在还气短']){
    const text=mergeUnresolvedComplaint('我现在心慌',latest);
    const second=decide({...base,text},cards);
    assert.equal(second.level,'emergency',latest);
    assert.equal(second.card,null);
    assert.equal(retainSafetyDecision(first,second,{continuingAssessment:true}),second);
  }
});
test('long multi-turn clarification never truncates a newly reported emergency',()=>{
  let lastText='手脚发麻',activeText=lastText;
  let result=decide({...base,text:lastText},cards);
  for(let turn=0;turn<6;turn++){
    const answer=turn===5?'现在胸痛冒冷汗':'我还在想怎么描述，'+'暂时说不清。'.repeat(60);
    const text=followUpText(result,lastText,answer);
    const combinedText=mergeUnresolvedComplaint(activeText,text);
    const candidate=decide({...base,text:combinedText,clarificationContext:result.clarificationContext,continuingAssessment:true},cards);
    result=retainSafetyDecision(result,candidate,{continuingAssessment:true});
    activeText=combinedText;lastText=text;
  }
  assert.equal(result.level,'emergency');
  assert.ok(result.evidence[0].symptoms.includes('chest_pain'));
  assert.equal(result.card,null);
});
test('automatic time and device refresh cannot dismiss an ongoing assessment',()=>{
  const first=decide({...base,text:'我现在心慌'},cards);
  for(const now of ['2026-11-05T11:30:00+08:00','2026-11-05T23:30:00+08:00']){
    const candidate=decide({...base,now,text:'',vitals:{...base.vitals,measuredAt:now,asleep:now.includes('23:30')}},cards);
    assert.equal(retainSafetyDecision(first,candidate),first);
  }
  const answer=decide({...base,text:'心慌轻微短暂，正在缓解，没有胸痛、气短、冷汗或晕厥'},cards);
  assert.equal(answer.reason,'graded_symptom_support');
  assert.ok(answer.card);assert.ok(answer.recheck);
  assert.equal(retainSafetyDecision(first,answer,{continuingAssessment:true}),answer);
});

test('a short unchanged recheck does not invent persistent cardiac discomfort',()=>{
  const first=decide({...base,text:'心慌有一点，刚开始，没有其他不舒服'},cards);
  assert.ok(first.card);assert.ok(first.recheck);
  const second=decide({...base,text:'',recheckOutcome:'unchanged',continuingAssessment:true,clarificationContext:first.clarificationContext},cards);
  assert.equal(second.reason,'graded_support_unchanged');assert.notEqual(second.level,'emergency');
  assert.ok(second.recheck);assert.equal(retainSafetyDecision(first,second,{continuingAssessment:true}),second);
});
test('only explicit recovery clears accumulated current complaints; same-level evidence updates',()=>{
  assert.equal(mergeUnresolvedComplaint('心慌','',{resolvedSafety:true}),'');
  assert.equal(mergeUnresolvedComplaint('心慌','刚吃饱'),'心慌。刚吃饱');
  assert.equal(mergeUnresolvedComplaint('心慌','心慌'),'心慌');
  const a={level:'symptom',card:null,reason:'first'},b={level:'symptom',card:null,reason:'updated'};
  assert.equal(retainSafetyDecision(a,b),b);
});
test('latest BP uses chronological time across ISO offsets',()=>{
  const readings=[{measuredAt:'2026-11-05T07:10:00+08:00',systolic:136,diastolic:82},{measuredAt:'2026-11-05T00:20:00.000Z',systolic:186,diastolic:122}];
  const latest=readings.sort((a,b)=>Date.parse(b.measuredAt)-Date.parse(a.measuredAt))[0];
  assert.equal(decide({...base,bloodPressure:latest,text:'头晕'},cards).level,'emergency');
});
test('Beijing quiet hours and 2026 solar term civil dates follow the configured boundaries',()=>{
  assert.equal(shichen('2026-11-05T22:59:00+08:00').night,false);
  assert.equal(shichen('2026-11-05T23:00:00+08:00').night,true);
  assert.equal(shichen('2026-11-06T04:59:00+08:00').night,true);
  assert.equal(shichen('2026-11-06T05:00:00+08:00').night,false);
  assert.equal(solarTerm('2026-11-06T12:00:00+08:00').name,'霜降');
  assert.equal(solarTerm('2026-11-08T12:00:00+08:00').name,'立冬');
});
