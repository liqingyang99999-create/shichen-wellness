import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constitutionBadge,cardActionSummary,conciseCardReason} from '../lib/presentation.mjs';
import {decide} from '../lib/decision.mjs';
const cards=JSON.parse(readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
const get=id=>cards.find(card=>card.id===id);
const now='2026-11-05T08:20:00+08:00';
const stored={constitution:{mode:'simplified',primary:['qi_deficiency','phlegm_damp'],scores:{qi_deficiency:75,phlegm_damp:75}}};
const report=(card,extra={})=>({level:'baseline',card,evidence:[{kind:'self-report',symptoms:[],context:[],emotion:null,...extra}],message:'完整规则理由，保留在详情。'});

test('badge uses recorded primary tendencies, including actual nested profile shape',()=>{
  assert.equal(constitutionBadge(stored),'气虚、痰湿倾向（简测）');
  assert.equal(constitutionBadge({constitution:{mode:'standard',primary:['balanced']}}),'平和表现');
  assert.equal(constitutionBadge({constitution:['qi_stagnation']}),'气郁倾向');
  assert.equal(constitutionBadge({constitution:'yang_deficiency'}),'阳虚倾向');
  assert.equal(constitutionBadge({constitution:['qi_deficiency','qi_deficiency']}),'气虚倾向');
});

test('unknown or incomplete assessments are never inferred from labels or scores',()=>{
  assert.equal(constitutionBadge(null),'体质尚未记录');
  assert.equal(constitutionBadge({constitution:{scores:{balanced:100},label:'平和质'}}),'体质尚未记录');
  assert.equal(constitutionBadge({constitution:{primary:[],mode:'standard'}}),'暂无明确体质倾向');
  assert.equal(constitutionBadge({constitution:['all','made_up']}),'体质尚未记录');
  assert.doesNotMatch(constitutionBadge({constitution:['qi_deficiency','phlegm_damp','qi_stagnation']}),/确诊|概率/);
});

test('generic food card stays specific without invented constitution treatment or excessive why text',()=>{
  const card=get('FD04'),value=conciseCardReason({decision:report(card),profile:stored,now});
  assert.equal(value,'现在是辰时。建议把薯类放进下一餐的主食安排。');
  assert.doesNotMatch(value,/气虚|痰湿|健脾|温胃|治疗|治病|风险|手表/);
  assert.equal(cardActionSummary(card),'把薯类放进下一餐的主食安排');
});

test('constitution appears only when the actual card preference matches',()=>{
  const card=get('BR02'),decision=report(card,{symptoms:['fatigue']});
  const value=conciseCardReason({decision,profile:stored,now});
  assert.match(value,/你刚提到有些疲累/);assert.match(value,/参考你记录的气虚、痰湿倾向/);
  assert.doesNotMatch(value,/因为.*体质|气虚导致|对症|专门治疗/);
  assert.doesNotMatch(conciseCardReason({decision,profile:{constitution:['yang_deficiency']},now}),/阳虚|体质/);
});

test('selected decision evidence beats stale, negated or hypothetical chat text',()=>{
  const card=get('BR01'),decision=report(card);
  const value=conciseCardReason({decision,profile:stored,now,text:'昨天很难过，今天没有头晕；如果胸闷怎么办',feedbackSource:'voice'});
  assert.doesNotMatch(value,/难过|头晕|胸闷|语音|你刚提到/);
  const current=conciseCardReason({decision:report(card,{symptoms:['fatigue'],context:['after_meal']}),now,feedbackSource:'voice'});
  assert.match(current,/你在语音中提到刚吃完饭、有些疲累/);
});

test('self-report claims are restricted to the chosen card matching tags',()=>{
  const card=get('FD04');
  const value=conciseCardReason({decision:report(card,{symptoms:['dry_mouth'],emotion:'sad'}),now});
  assert.doesNotMatch(value,/口干|低落/);
});

test('only fresh sourced weather relevant to the selected card is mentioned',()=>{
  const card=get('SE07'),decision=report(card);
  const weather={temperature:3,drop24h:6,measuredAt:'2026-11-05T08:00:00+08:00',source:'open-meteo'};
  assert.match(conciseCardReason({decision,now,weather}),/天气记录为3°C/);
  const forecast={...weather,temperature:12,minTemperature:2};
  assert.match(conciseCardReason({decision,now,weather:forecast}),/今日预报最低温为2°C/);
  for(const altered of [{source:'simulation'},{source:'device'},{measuredAt:'2026-11-05T05:20:00+08:00'},{measuredAt:'2026-11-05T08:21:00+08:00'},{measuredAt:'invalid'},{temperature:NaN,drop24h:undefined}]){
    assert.doesNotMatch(conciseCardReason({decision,now,weather:{...weather,...altered}}),/天气|°C|降温/);
  }
  assert.doesNotMatch(conciseCardReason({decision:report(get('FD04')),now,weather}),/天气|°C|降温/);
});

test('card reasons never reinterpret missing or abnormal device evidence as normal',()=>{
  const card=get('BR01'),decision=report(card);
  for(const evidence of [{kind:'data-quality',reason:'vitals_unavailable'},{kind:'vitals',source:'simulation',signals:[{key:'heart_rate',value:130}]},{kind:'vitals',source:'device',signals:[]}]){
    const value=conciseCardReason({decision:{...decision,evidence:[...decision.evidence,evidence]},now});
    assert.doesNotMatch(value,/设备正常|身体正常|手表正常|心率正常|实时监测|心率|血压/);
  }
});

test('safety and clarification messages remain complete and cannot become wellness recommendations',()=>{
  for(const level of ['emergency','confirm','clarify','silent','symptom']){
    const message='保留这条完整的必要提示。不要用普通养生行动替代。';
    assert.equal(conciseCardReason({decision:{level,message,card:null},now}),message);
    if(level!=='symptom')assert.equal(conciseCardReason({decision:{level,message,card:get('BR01')},now}),message);
  }
  const decision=report(get('BR02'),{symptoms:['dizzy']});
  assert.equal(conciseCardReason({decision,profile:stored,now}),decision.message);
});

test('separate card details do not inherit another decision context',()=>{
  const decision=report(get('BR02'),{symptoms:['fatigue']});
  const result=conciseCardReason({decision,card:get('FD04'),profile:stored,now});
  assert.doesNotMatch(result,/疲累|气虚|痰湿/);assert.match(result,/薯类/);
});

test('invalid time and missing data degrade without inventing a time or measurement',()=>{
  assert.doesNotThrow(()=>conciseCardReason({card:get('FD04'),now:'not-a-date'}));
  const value=conciseCardReason({card:get('FD04')});
  assert.doesNotMatch(value,/辰时|天气|体质|实时/);
  assert.equal(conciseCardReason(), '');
});

test('actual engine decisions use supported profile and self-report without changing source data',()=>{
  const before=JSON.stringify(cards);
  const decision=decide({now,text:'我刚吃完饭，有点累',profile:{constitution:stored.constitution.primary},vitals:{source:'unavailable'}},cards);
  assert.ok(decision.card);
  const value=conciseCardReason({decision,profile:stored,now,text:'我刚吃完饭，有点累'});
  assert.match(value,/现在是辰时/);assert.match(value,/刚吃完饭|疲累/);
  assert.ok(value.length<=120,value);assert.ok(value.split('。').filter(Boolean).length<=2);
  assert.equal(JSON.stringify(cards),before);
});

test('all current cards produce short summaries and five-tone cards stay non-curative',()=>{
  for(const card of cards.filter(c=>c.enabled!==false)){
    const value=conciseCardReason({decision:report(card),now});
    assert.ok(value.length<=100,card.id+':'+value);
    assert.ok(value.split('。').filter(Boolean).length<=2,card.id);
    if(card.audio)assert.doesNotMatch(value,/降压|安神治疗|补气|脏腑|治病/);
  }
});
test('confirmed objective variation remains visible and is labelled simulation truthfully',()=>{
 const decision={...report(get('BR01')),confirmation:'no'};
 decision.evidence.push({kind:'vitals',source:'simulation',signals:[{key:'stress',value:84}]});
 assert.match(conciseCardReason({decision,now}),/模拟记录有波动，你确认暂无明显不适/);
 decision.confirmation=null;
 assert.doesNotMatch(conciseCardReason({decision,now}),/你确认/);
});
