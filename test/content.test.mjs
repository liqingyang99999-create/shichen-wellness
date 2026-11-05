import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cards=JSON.parse(readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
const sources=JSON.parse(readFileSync(new URL('../data/sources.json',import.meta.url),'utf8'));
const live=cards.filter(c=>c.enabled!==false);
const slots=[23,1,3,5,7,9,11,13,15,17,19,21];
const constitutions=new Set(['all','balanced','qi_deficiency','yang_deficiency','yin_deficiency','phlegm_damp','damp_heat','blood_stasis','qi_stagnation','special']);
const scenes=new Set(['bamboo','flowers','leaves','meadow','night','sky','tea','water']);
const acute=['acute_symptoms','dizzy','palpitations','chest_tightness'];

test('reviewed symptom support stays passive and keeps context requirements',()=>{
  const support=live.filter(c=>c.reviewedSupport);
  assert.ok(support.length>=9);
  for(const c of support){
    assert.equal(c.reviewedSupport.kind,'passive_rest',c.id);
    assert.equal(c.requiresGettingUp,false,c.id);
    assert.equal(c.indoor,true,c.id);
    assert.equal(c.audio,undefined,c.id);
    assert.ok(c.reviewedSupport.symptomKeys.length,c.id);
    assert.ok(!/穴位|八段锦|食养|舒展/.test(c.category),c.id);
    assert.ok(c.contraindications.includes('acute_symptoms'),c.id);
    assert.deepEqual(c.reviewedSupport.requiredContexts,c.requiredContexts||[],c.id);
  }
  assert.deepEqual(cards.find(c=>c.id==='NP01').requiredContexts,['posture_pressure']);
  assert.deepEqual(cards.find(c=>c.id==='NP02').requiredContexts,['hand_numbness']);
});

test('hunger and homesickness have direct actions with their existing limits',()=>{
  const hunger=live.filter(c=>c.triggers.includes('hungry'));
  assert.ok(hunger.length>=2);
  for(const c of hunger){
    assert.deepEqual(c.requiredContexts,['hunger'],c.id);
    assert.equal(c.nightSafe,false,c.id);
    assert.ok(c.contraindications.includes('acute_symptoms'),c.id);
    assert.ok(c.incompatibilities.includes('eating'),c.id);
    assert.ok(!c.triggers.includes('baseline'),c.id);
  }
  const homesick=live.filter(c=>c.triggers.includes('homesick'));
  assert.ok(homesick.some(c=>c.triggers.includes('family')));
  assert.ok(homesick.some(c=>c.nightSafe&&!c.triggers.includes('family')));
});
test('catalog has genuine, unique complete base-card records',()=>{
  assert.ok(live.length>=180);
  assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
  assert.equal(new Set(live.map(c=>c.steps.join('|'))).size,live.length);
  for(const c of cards){
    for(const key of ['id','title','category','actionFamily','why','action','reason','safety_note'])assert.ok(typeof c[key]==='string'&&c[key].trim(),c.id+':'+key);
    assert.equal(c.cooldown,'24h',c.id); assert.equal(c.reason,c.why,c.id);
    assert.ok(Array.isArray(c.incompatibilities),c.id);
    assert.equal(c.durationSeconds,30,c.id); assert.equal(c.indoor,true,c.id);
    assert.ok(typeof c.nightSafe==='boolean',c.id);
    assert.ok([2,3].includes(c.steps.length),c.id);
    assert.ok(c.steps.every(s=>typeof s==='string'&&s.length>5&&s.length<=100),c.id);
    assert.ok(c.slots.length&&c.slots.every(s=>slots.includes(s)),c.id);
    assert.ok(c.constitutions.length&&c.constitutions.every(s=>constitutions.has(s)),c.id);
    assert.ok(c.triggers.length&&c.triggers.every(s=>typeof s==='string'),c.id);
    assert.ok(Array.isArray(c.contraindications),c.id);
    assert.ok(scenes.has(c.scene),c.id);
    assert.ok(['normal','weekly'].includes(c.frequency),c.id);
    assert.equal(c.medicalReview,'conservative-preview',c.id);
  }
});
test('all card references resolve to explicit scoped primary-source records',()=>{
  const ids=new Set(sources.map(s=>s.id));assert.equal(ids.size,sources.length);
  for(const s of sources){assert.ok(s.title&&s.publisher&&s.scope);assert.ok(s.url.startsWith('https://'));assert.equal(s.accessed,'2026-11-05');}
  for(const c of cards)assert.ok(c.sourceIds.length&&c.sourceIds.every(id=>ids.has(id)),c.id);
});
test('every shichen has several quiet baseline, fatigue and after-meal choices',()=>{
  for(const slot of slots)for(const trigger of ['baseline','fatigue','after_meal']){
    const pool=live.filter(c=>c.slots.includes(slot)&&c.triggers.includes(trigger)&&c.nightSafe&&!c.requiredContexts?.length&&!/八段锦|舒展身体|日常食养/.test(c.category));
    assert.ok(pool.length>=5,slot+':'+trigger+':'+pool.length);
    assert.ok(new Set(pool.map(c=>c.actionFamily)).size>=4,slot+':'+trigger);
  }
});
test('eating support is quiet and contains no movement or acupressure',()=>{
  const eating=live.filter(c=>c.triggers.includes('eating'));assert.ok(eating.length>=3);
  for(const c of eating){assert.equal(c.nightSafe,false);assert.equal(c.category,'起居生活');assert.deepEqual(c.slots,slots);assert.deepEqual(c.requiredContexts,['eating']);assert.ok(c.triggers.includes('sad'));}
});
test('all seven light-touch points exclude acute symptoms and relevant risks',()=>{
  const points=live.filter(c=>c.category==='穴位轻触');assert.equal(points.length,7);
  for(const c of points)for(const risk of [...acute,'skin_injury','reduced_sensation','bleeding_risk'])assert.ok(c.contraindications.includes(risk),c.id+':'+risk);
  assert.ok(cards.find(c=>c.id==='AC05').contraindications.includes('pregnancy'));
  for(const risk of ['diabetes','diabetic_foot','heart_failure','leg_swelling'])assert.ok(cards.find(c=>c.id==='AC07').contraindications.includes(risk));
  assert.ok(points.every(c=>!c.triggers.some(t=>acute.includes(t))));
});
test('eight qigong forms are daytime reduced-range starters, never acute-symptom treatments',()=>{
  const forms=live.filter(c=>c.category==='坐姿八段锦');assert.equal(forms.length,8);
  for(const c of forms){assert.equal(c.steps.length,3);assert.equal(c.nightSafe,false);for(const risk of [...acute,'exercise_restricted'])assert.ok(c.contraindications.includes(risk),c.id);assert.ok(/起步|预备|准备|减幅/.test(c.title+' '+c.why));}
  for(const c of live.filter(c=>['舒展身体','自然呼吸'].includes(c.category)))assert.ok(c.contraindications.includes('acute_symptoms'),c.id);
});
test('unreviewed herbal records cannot enter recommendation pool',()=>{
  const herbs=cards.filter(c=>c.category==='待审药膳');assert.equal(herbs.length,2);
  for(const c of herbs){assert.equal(c.enabled,false);assert.equal(c.reviewStatus,'needs-clinician-review');assert.ok(c.contraindications.includes('heart_failure'));assert.ok(c.contraindications.includes('medication_interaction_unknown'));}
  assert.ok(live.every(c=>!c.actionFamily.startsWith('herbal_')));
});
test('emergency rehearsal remains low-frequency and baseline-only',()=>{
  const rehearsals=live.filter(c=>c.category==='急救预演');assert.equal(rehearsals.length,6);
  for(const c of rehearsals){assert.equal(c.frequency,'weekly');assert.deepEqual(c.triggers,['baseline']);assert.ok(c.contraindications.includes('acute_symptoms'));}
  assert.match(cards.find(c=>c.id==='ER01').steps.join(''),/不拨打测试电话/);
  assert.match(cards.find(c=>c.id==='ER04').steps.join(''),/立即拨打120/);
});
test('comfort preferences are explicit, reversible metadata with no disease-specific prescription',()=>{
  const preferred=live.filter(c=>c.preferredConstitutions);
  assert.ok(preferred.length>=12);
  for(const c of preferred){assert.ok(c.preferredConstitutions.every(k=>constitutions.has(k)&&k!=='all'));assert.match(c.preferenceReason,/若你/);assert.deepEqual(c.constitutions,['all']);}
  assert.ok(live.filter(c=>c.coldWeatherPreferred===true).length>=3);
});

test('new subjective symptoms have several bounded support actions rather than acupressure or prescriptions',()=>{
  for(const tag of ['dry_mouth','bitter_taste','loose_stool','yellow_urine','poor_appetite']){
    const pool=live.filter(c=>c.triggers.includes(tag));
    assert.ok(pool.length>=4,tag);
    assert.ok(new Set(pool.map(c=>c.actionFamily)).size>=4,tag);
    for(const c of pool){assert.equal(c.category,'日常不适照护');assert.ok(c.contraindications.includes('acute_symptoms'));assert.ok(c.incompatibilities.includes('eating'));}
  }
  assert.ok(live.filter(c=>c.triggers.includes('suppressed_emotion')).length>=6);
  for(const risk of ['heart_failure','fluid_restriction','kidney_condition','swallowing_difficulty'])assert.ok(cards.find(c=>c.id==='DM01').contraindications.includes(risk));
  assert.ok(cards.find(c=>c.id==='PA01').contraindications.includes('swallowing_difficulty'));
});

test('all 24 terms have their own genuinely different action and exclusive term metadata',()=>{
  const terms=['立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒'];
  const pool=live.filter(c=>c.category==='节气专属');
  assert.equal(pool.length,24);assert.equal(new Set(pool.map(c=>c.actionFamily)).size,24);
  for(const term of terms){const match=pool.filter(c=>c.solarTerms?.includes(term));assert.equal(match.length,1,term);assert.equal(match[0].solarTerms.length,1);assert.ok(match[0].sourceIds.includes('HKO_TERMS'));}
});

test('night cards are explicitly bed-compatible and contain no cardiovascular threat copy or audio requirement',()=>{
  const pool=live.filter(c=>c.nightSafe);assert.ok(pool.length>=24);
  for(const c of pool){
    assert.equal(c.requiresGettingUp,false,c.id);assert.equal(c.audio,undefined,c.id);
    assert.doesNotMatch([c.title,...c.steps,c.why,c.safety_note].join(''),/心血管|血压|胸闷|心悸|风险|疾病/,c.id);
    assert.ok(!['日常食养','起居生活','家人联系','节气专属','健康小知识','急救预演'].includes(c.category),c.id);
  }
  assert.equal(pool.filter(c=>c.category==='床上安静').length,12);
});

test('five sound cards identify separate playable modes without constitution or organ prescriptions',()=>{
  const pool=live.filter(c=>c.audio);assert.equal(pool.length,5);
  assert.deepEqual(pool.map(c=>c.audio.mode).sort(),['gong','shang','jue','zhi','yu'].sort());
  for(const c of pool){assert.equal(c.audio.durationSeconds,30);assert.equal(c.nightSafe,false);assert.ok(c.triggers.includes('music'));assert.equal(c.preferredConstitutions,undefined);assert.ok(c.sourceIds.includes('WHO_LISTENING'));assert.ok(c.sourceIds.includes('BEIJING_FIVE_TONES'));assert.doesNotMatch(c.title+c.why+c.steps.join(''),/降压|补气|治病|入肝|入肾|入脾|入肺|入心/);}
});
