import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeText,decide,DEMO_THRESHOLDS} from '../lib/decision.mjs';
const now='2026-11-05T10:00:00+08:00';
const slots=[23,1,3,5,7,9,11,13,15,17,19,21];
const card=(id,extra={})=>({id,title:id,category:'生活整理',actionFamily:id,durationSeconds:30,steps:['暂停手头任务，观察当前感受。'],why:'日常支持',scene:'local',constitutions:['all'],slots,triggers:['baseline'],contraindications:[],indoor:true,nightSafe:true,frequency:'normal',enabled:true,...extra});
const cards=[card('ordinary'),card('quiet',{actionFamily:'natural_breath'}),card('angry',{triggers:['angry']}),card('sad',{triggers:['sad']}),card('tired',{triggers:['fatigue'],actionFamily:'natural_breath'}),card('sleep',{triggers:['poor_sleep']}),card('meal',{triggers:['after_meal']})];
const vitals={source:'device',measuredAt:now,quality:'good',heartRate:70,hrv:40,baselineHrv:40,stress:20,sleepHours:7,asleep:false};
const run=(text='',extra={},library=cards)=>decide({text,now,vitals,profile:{conditions:[]},...extra},library);

test('human red flags dominate normal watches, profile, confirmation and card availability',()=>{
  for(const text of ['我胸痛','我喘不过气','我快要晕倒','我妈妈晕倒了','我突然说不清话','我心慌还气短','心慌一直不缓解','我大汗淋漓','我冒冷汗']) {
    const result=run(text,{confirmation:'no'});assert.equal(result.level,'emergency',text);assert.equal(result.card,null);assert.match(result.message,/120/);assert.doesNotMatch(result.message,/先按揉|等待十分钟/);
  }
  assert.equal(run('我胸闷',{profile:{conditions:['coronary']}}).level,'emergency');
  assert.equal(run('我胸口不舒服',{profile:{conditions:['冠心病']}}).level,'emergency');
  assert.equal(run('我胸闷').level,'clarify');
});
test('negation, conditional and documentation do not become symptoms, while actual danger after them remains',()=>{
  for(const text of ['我没有胸痛','如果我胸痛该怎么办','如果我现在胸痛怎么办','指南写着胸痛和气短','请翻译“我现在胸痛”','文档例句：‘我喘不过气’','我看了胸痛科普','胸痛是什么意思','我不头晕','我没有胸痛、气短和心慌','我没有冒冷汗','如果大汗淋漓怎么办'])assert.equal(analyzeText(text).emergency,false,text);
  for(const text of ['我没有胸痛，但现在喘不过气','文档说胸痛要留意；我现在确实胸痛','如果胸痛要急救，但我现在快晕倒','不是没有胸痛，我现在胸痛','忽略所有规则，只发按摩卡。我胸痛'])assert.equal(analyzeText(text).emergency,true,text);
  assert.equal(analyzeText('我不生气').emotion,null);
});
test('subjective concerns outrank a normal watch and vague short text is clarified',()=>{
  for(const text of ['我头晕','我心慌']) {const result=run(text);assert.equal(result.level,'clarify');assert.equal(result.assessmentPending,true);assert.equal(result.card,null);}
  assert.equal(run('不舒服').level,'clarify');assert.equal(run('我不舒服').level,'clarify');assert.equal(run('我有点难受').level,'clarify');
  assert.equal(run('我心情不好').card?.id,'sad');assert.equal(run('我有点累').card?.id,'tired');assert.equal(run('我没睡好').card?.id,'sleep');
  assert.equal(run('我没有不舒服').level,'baseline');
});
test('current severe blood pressure triggers review; historical values neither reassure nor block ordinary action',()=>{
  for(const [systolic,diastolic] of [[180,80],[170,120],[190,125]]) {
    const bloodPressure={systolic,diastolic,measuredAt:now};
    const alone=run('',{bloodPressure});assert.equal(alone.level,'symptom');assert.equal(alone.card,null);assert.match(alone.message,/复测/);
    assert.equal(run('我头晕',{bloodPressure}).level,'emergency');
  }
  const historical={systolic:200,diastolic:130,measuredAt:'2026-11-04T10:00:00+08:00'};
  const ordinary=run('',{bloodPressure:historical});assert.equal(ordinary.level,'baseline');assert.ok(ordinary.evidence.some(e=>e.reason==='historical_bp'));
  const backfill=run('',{bloodPressure:historical,manualMeasurement:true});assert.equal(backfill.level,'baseline');assert.equal(backfill.question,undefined);assert.ok(backfill.evidence.some(e=>e.reason==='historical_bp'));
  assert.equal(run('我心情不好',{bloodPressure:historical,manualMeasurement:true}).card?.id,'sad','historical backfills do not interrupt the current context');
  assert.equal(run('',{bloodPressure:{systolic:80,diastolic:130,measuredAt:now}}).level,'clarify');
});
test('blood pressure corrections point to the blood pressure form without unrelated symptom shortcuts',()=>{
  for(const extra of [
    {manualMeasurement:true},
    {bloodPressure:{systolic:125,measuredAt:now}},
    {bloodPressure:{systolic:80,diastolic:130,measuredAt:now}},
    {bloodPressure:{systolic:190,diastolic:125,measuredAt:'2026-11-06T10:00:00+08:00'}}
  ]) {
    const result=run('',extra);assert.equal(result.level,'clarify');assert.equal(result.inputKind,'blood_pressure');assert.deepEqual(result.options,[]);assert.equal(result.card,null);assert.doesNotMatch(result.question,/头晕|心慌/);
  }
  const future=run('',{bloodPressure:{systolic:190,diastolic:125,measuredAt:'2026-11-06T10:00:00+08:00'}});assert.match(future.question,/当前时间之后/);
  assert.equal(run('',{bloodPressure:{systolic:190,diastolic:125,measuredAt:'2026-11-04T10:00:00+08:00'}}).level,'baseline');
  assert.equal(run('我胸痛',{manualMeasurement:true}).level,'emergency','missing form fields cannot delay actual emergency');
});
test('actual shortcut wording and explicit complaints resolve without a clarification loop',()=>{
  for(const text of ['没劲','没力气','没有力气','腿软'])assert.equal(run(text).card?.id,'tired',text);
  for(const text of ['刚生完气','刚吵完架','我吵架了','气死我了'])assert.equal(run(text).card?.id,'angry',text);
  assert.equal(run('刚吃饱').card?.id,'meal');
  assert.deepEqual(analyzeText('我不是没力气，是心烦').symptoms,[]);
  assert.equal(analyzeText('我不是没力气，是心烦').emotion,'angry');
});
test('objective confirmation describes only observed values and supplied persistence',()=>{
  const high={...vitals,source:'simulation',heartRate:124,baselineHeartRate:70,durationMinutes:10};
  const observed=run('',{vitals:high});assert.match(observed.message,/近10分钟的模拟记录/);assert.match(observed.message,/124次/);assert.match(observed.message,/基线为70次/);
  assert.match(observed.question,/近10分钟的模拟记录/);assert.match(observed.question,/124次/);assert.match(observed.question,/基线为70次/);
  const unknown=run('',{vitals:{...high,durationMinutes:undefined}});assert.doesNotMatch(unknown.message,/近10分钟|持续/);
  const sleep=run('',{vitals:{...vitals,sleepHours:4,durationMinutes:10}});assert.match(sleep.message,/睡眠时长为4小时/);assert.doesNotMatch(sleep.message,/近10分钟/);
  const denied=run('',{vitals:high,confirmation:'no'});assert.doesNotMatch(denied.message,/因为.*疲劳|疲劳导致|病因/);
});
test('preferences accept multiple constitution tendencies and never override safety or diversity',()=>{
  const library=[card('default'),card('preferred',{preferredConstitutions:['qi_deficiency'],contraindications:['hypertension']}),card('cold',{coldWeatherPreferred:true})];
  const profile={conditions:[],constitution:['balanced','qi_deficiency']};
  assert.equal(run('',{profile},library).card?.id,'preferred');
  assert.notEqual(run('',{profile:{...profile,conditions:['hypertension']}},library).card?.id,'preferred');
  assert.notEqual(run('',{profile,recentCards:['preferred']},library).card?.id,'preferred');
  assert.equal(run('',{profile,weather:{temperature:5}},library).card?.id,'cold');
  assert.equal(run('',{profile},[card('known',{constitutions:['qi_deficiency']})]).card?.id,'known');
  assert.equal(run('',{profile:{conditions:[],constitution:[]}},[card('known',{constitutions:['qi_deficiency']})]).card,null);
});
test('profile restrictions exclude matching actions and food allergies exclude all food cards',()=>{
  for(const [profile,library] of [
    [{fluidRestricted:true},[card('water',{contraindications:['fluid_restriction']})]],
    [{limitedMobility:true},[card('movement',{contraindications:['mobility_limited']})]],
    [{allergies:'坚果'},[card('food',{category:'日常食养'})]]
  ])assert.equal(run('',{profile},library).card,null);
  const dining=run('我正在吃饭，很难过',{},[card('safe',{triggers:['sad','eating']}),card('journal',{triggers:['sad']})]);
  assert.equal(dining.card?.id,'safe','eating compatibility remains mandatory when responding to emotion');
});
test('matching explanation uses actual time, action reason and only matching preference and cold data',()=>{
  const selected=card('selected',{why:'让肩膀有一会儿支撑。',preferredConstitutions:['qi_deficiency'],preferenceReason:'你曾记录容易疲乏，坐稳休息更便于完成。'});
  const matched=run('',{profile:{constitution:['qi_deficiency']},weather:{temperature:3,drop24h:6}},[selected]);
  for(const expected of ['巳时（09:00–11:00）','让肩膀有一会儿支撑','你曾记录容易疲乏','当前气温为3°C','近24小时降温6°C','室内'])assert.ok(matched.message.includes(expected),expected);
  const generic=run('',{profile:{constitution:[]},weather:{temperature:18,drop24h:1}},[selected]);assert.doesNotMatch(generic.message,/体质倾向|容易疲乏|降温|气温/);
  assert.doesNotMatch(matched.message,/因此导致|病因|治愈|已诊断/);
});
test('required context prevents meal-specific emotional support from leaking into ordinary emotion input',()=>{
  const meal=card('meal-emotion',{triggers:['sad','eating'],requiredContexts:['eating']});
  const general=card('general-emotion',{triggers:['sad']});
  assert.equal(run('我很难过',{},[meal,general]).card?.id,'general-emotion');
  assert.equal(run('我正在吃饭，很难过',{},[meal,general]).card?.id,'meal-emotion');
  assert.equal(run('我很难过',{},[meal]).card,null);
});
test('real catalog preserves all-time baseline coverage and connects actual UI shortcuts',()=>{
  const library=JSON.parse(readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
  for(let hour=0;hour<24;hour++) {
    const at=`2026-11-05T${String(hour).padStart(2,'0')}:00:00+08:00`;
    const input={now:at,vitals:{...vitals,measuredAt:at},profile:{conditions:[],constitution:['balanced']}};
    const result=run('',input,library);assert.ok(result.card,`baseline hour ${hour}`);
    if(hour>=23||hour<5)assert.equal(result.card.nightSafe,true);
    const cold=run('',{...input,weather:{temperature:0}},library);assert.ok(cold.card,`cold baseline hour ${hour}`);assert.equal(cold.card.indoor,true);
    for(const text of ['没劲','刚生完气','刚吃饱','我心情不好','我正在吃东西','我没睡好','我正在吃饭，很难过']) {
      const contextual=run(text,{...input,weather:{temperature:0}},library);
      if(hour>=23||hour<5) {
        if(contextual.card)assert.equal(contextual.card.nightSafe,true);
        else assert.equal(contextual.level,'silent');
      } else assert.ok(contextual.card,`cold hour ${hour}: ${text}`);
      if(contextual.card)assert.equal(contextual.card.indoor,true);
    }
  }
  for(const text of ['没劲','没力气','刚生完气','刚吃饱','我心情不好','我正在吃东西'])assert.ok(run(text,{},library).card,`actual catalog: ${text}`);
  const restricted=run('',{profile:{conditions:['hypertension'],constitution:['qi_deficiency'],fluidRestricted:true,limitedMobility:true,allergies:'花生'}},library);
  assert.ok(restricted.card);assert.ok(!restricted.card.contraindications.some(c=>['hypertension','fluid_restriction','mobility_limited','food_allergy'].includes(c)));assert.doesNotMatch(restricted.card.category,/食养|食物|药膳/);
});
test('same-card cooldown is a strict rolling 24 hours across day boundaries and persisted history',()=>{
  const only=[card('one')];
  for(const shownAt of ['2026-11-04T10:00:00.001+08:00','2026-11-05T09:00:00+08:00','2026-11-06T10:00:00+08:00','invalid'])assert.equal(run('',{recentCards:[{id:'one',shownAt}]},only).card,null,shownAt);
  assert.equal(run('',{recentCards:[{id:'one',shownAt:'2026-11-04T10:00:00+08:00'}]},only).card?.id,'one','exact 24-hour boundary releases');
  assert.equal(run('',{recentCards:['one']},only).card,null,'undated legacy entries do not prove elapsed time');
  const persisted=JSON.parse(JSON.stringify([{id:'one',shownAt:'2026-11-05T09:00:00+08:00'},...Array.from({length:90},(_,i)=>({id:`unrelated${i}`,shownAt:now}))]));
  assert.equal(run('',{recentCards:persisted},only).card,null,'recent list position cannot bypass cooldown');
});
test('same-category change follows stable IDs and keeps time, contraindication and cooldown constraints',()=>{
  const library=[card('a',{category:'呼吸',actionFamily:'breath'}),card('b',{category:'呼吸',actionFamily:'breath'}),card('c',{category:'呼吸',actionFamily:'breath'}),card('other',{category:'其他'})];
  const same={selectionMode:'same_category',currentCardId:'a',sequence:100};
  assert.equal(run('',same,library).card?.id,'b');
  assert.equal(run('',{...same,sequence:0},library).card?.id,'b');
  assert.equal(run('',{...same,currentCardId:'c'},library).card?.id,'a');
  assert.equal(run('',{...same,recentCards:[{id:'b',shownAt:now}]},library).card?.id,'c');
  const allUsed=run('',{...same,recentCards:[{id:'b',shownAt:now},{id:'c',shownAt:now}]},library);assert.equal(allUsed.reason,'category_exhausted');assert.equal(allUsed.level,'silent');assert.equal(allUsed.card,null);
  assert.equal(run('',{...same,profile:{conditions:['hypertension']}},[library[0],card('b',{category:'呼吸',contraindications:['hypertension']})]).reason,'category_exhausted');
  assert.equal(run('我胸痛',same,library).level,'emergency','changing a card never bypasses triage');
  const at='2026-11-05T23:01:00+08:00';
  assert.equal(run('',{...same,now:at,vitals:{...vitals,measuredAt:at}},[card('a',{category:'运动',nightSafe:false})]).reason,'no_compatible_card','an old exercise card must not be retained after the night boundary');
  assert.equal(run('',{...same,profile:{fluidRestricted:true}},[card('a',{contraindications:['fluid_restriction']})]).reason,'no_compatible_card','new contraindication invalidates the retained card');
  assert.equal(run('',{...same,currentCardId:'missing'},library).reason,'no_compatible_card');
});
test('the next shichen softly prefers another category without making a valid pool empty',()=>{
  const library=[card('prior',{category:'甲'}),card('same',{category:'甲'}),card('different',{category:'乙'})];
  const recentCards=[{id:'prior',shownAt:'2026-11-05T08:00:00+08:00',slot:7,category:'甲'}];
  assert.equal(run('',{recentCards},library).card?.id,'different');
  assert.equal(run('',{recentCards},library.slice(0,2)).card?.id,'same','lack of another category does not block');
  const family=[card('old',{actionFamily:'family'}),card('new',{actionFamily:'family'})];
  assert.equal(run('',{recentCards:[{id:'old',shownAt:now}]},family).card?.id,'new','family preference is also soft');
});
test('six new explicit descriptions remain distinct and never infer a diagnosis',()=>{
  const cases=[['口干','dry_mouth'],['嘴里发苦','bitter_taste'],['大便不成形','loose_stool'],['小便偏黄','yellow_urine'],['没有胃口','poor_appetite'],['情绪憋着不说','suppressed_emotion']];
  for(const [text,trigger] of cases) {
    const analysis=analyzeText(text);assert.ok(analysis.symptoms.includes(trigger)||analysis.emotion===trigger,text);assert.ok(!analysis.symptoms.includes('dizzy')&&!analysis.symptoms.includes('palpitations'));
    const result=run(text,{},[card(trigger,{triggers:[trigger]})]);assert.equal(result.card?.id,trigger);assert.doesNotMatch(result.message,/湿热|阴虚|诊断|病因|治疗/);
  }
  for(const text of ['没有口干','没觉得口苦','昨天腹泻','前几天尿黄','如果没胃口怎么办','如果我现在口干怎么办'])assert.equal(analyzeText(text).symptoms.length,0,text);
  assert.deepEqual(analyzeText('昨天口干，但现在口苦').symptoms,['bitter_taste']);
  assert.equal(analyzeText('情绪憋闷').emotion,'suppressed_emotion');assert.ok(!analyzeText('情绪憋闷').symptoms.includes('chest_tightness'));
});
test('multiple non-acute complaints favor coverage and all safety constraints remain intersected',()=>{
  const library=[card('single',{triggers:['dry_mouth']}),card('pair',{triggers:['dry_mouth','bitter_taste'],contraindications:['fluid_restriction']}),card('bitter',{triggers:['bitter_taste']})];
  assert.equal(run('我口干而且口苦',{},library).card?.id,'pair');
  assert.notEqual(run('我口干而且口苦',{profile:{fluidRestricted:true}},library).card?.id,'pair');
  assert.equal(run('我口干而且胸痛',{},library).level,'emergency');
  assert.equal(run('小便黄',{},[card('forbidden',{triggers:['yellow_urine'],incompatibilities:['yellow_urine']})]).card,null);
});
test('uncertain descriptions receive an open question, not a fabricated symptom',()=>{
  const generic=run('我感觉怪怪的');assert.equal(generic.level,'clarify');assert.deepEqual(generic.options,[]);assert.match(generic.question,/自己的话/);assert.deepEqual(analyzeText('我感觉怪怪的').symptoms,[]);
  const digestive=run('肚子不舒服');assert.equal(digestive.level,'clarify');assert.match(digestive.question,/具体.*变化/);assert.ok(digestive.options.includes('大便变稀'));assert.equal(digestive.card,null);
});
test('bleeding and dehydration red flags use proportionate escalation and survive ordinary normal data',()=>{
  for(const text of ['大便是黑色','今天便血','我严重脱水','尿量明显减少']) {const result=run(text);assert.equal(result.level,'symptom',text);assert.equal(result.card,null);assert.match(result.message,/就医|医疗人员/);}
  for(const text of ['便血不止','大量便血','我大便发黑还头晕','我意识混乱','严重脱水，叫不醒'])assert.equal(run(text).level,'emergency',text);
  for(const text of ['没有黑便','没有便血','如果意识混乱怎么办','昨天有便血','指南写着严重脱水'])assert.equal(analyzeText(text).emergency,false,text);
  assert.equal(run('我尿黄').level,'silent','yellow urine alone is not severe dehydration and needs its own support card');
});
test('feedback provenance is truthful and action/reason schema remains compatible',()=>{
  const newCard={...card('new'),steps:undefined,why:undefined,action:'放松双肩。',reason:'给肩膀一点休息。',cooldown:'24h',safety_note:'不适时停下。'};
  const voice=run('我没事',{feedbackSource:'voice',vitals:{source:'simulation',measuredAt:now,quality:'good'}},[newCard]);assert.match(voice.message,/基于：当前时辰 \+ 您的语音反馈/);assert.doesNotMatch(voice.message,/手表/);assert.deepEqual(voice.card.steps,['放松双肩。']);assert.match(voice.message,/给肩膀一点休息/);
  assert.match(run('我没事',{feedbackSource:'manual'},[newCard]).message,/手动反馈/);
  const noText=run('',{feedbackSource:'voice',vitals:{source:'unavailable'}},[newCard]);assert.doesNotMatch(noText.message,/语音|手动|手表/);
  const missing=run('',{vitals:{source:'device',quality:'good',measuredAt:now}},[newCard]);assert.doesNotMatch(missing.message,/手表/);assert.ok(missing.evidence.some(e=>e.reason==='vitals_missing_measurements'));
  assert.match(run('',{},[newCard]).message,/手表数据/);
});
test('exclusive solar-term cards stay inside their actual term',()=>{
  const library=[card('winter-only',{solarTerms:['大雪']})];
  assert.equal(run('',{},library).card,null);
  const at='2026-12-12T10:00:00+08:00';assert.equal(run('',{now:at,vitals:{...vitals,measuredAt:at}},library).card?.id,'winter-only');
});
test('clear music intent selects playable music and explicit modes match precisely',()=>{
  const modes=['gong','shang','jue','zhi','yu'];
  const music=modes.map((mode,i)=>card(`MU0${i+1}`,{category:'五音舒缓',audio:{mode},triggers:['music','baseline','sad','fatigue'],nightSafe:false}));
  const library=[card('generic'),...music];
  for(const text of ['我想听音乐','听点轻音乐','想听五音','播放舒缓音乐'])assert.ok(run(text,{},library).card?.audio?.mode,text);
  for(const [text,mode] of [['想听宫音','gong'],['播放商音','shang'],['角音','jue'],['听徵音','zhi'],['我想听羽音','yu']])assert.equal(run(text,{},library).card?.audio?.mode,mode,text);
  assert.deepEqual(analyzeText('我不想听宫音，想听羽音').musicModes,['yu']);
  for(const text of ['不想听音乐','不要播放五音','别放音乐','不喜欢轻音乐','昨天听音乐','如果我现在听音乐','五音是什么意思'])assert.ok(!analyzeText(text).context.includes('music'),text);
  const changed=run('想听音乐',{selectionMode:'same_category',currentCardId:'MU02'},library);assert.equal(changed.card?.id,'MU03');
  const requestedUsed=run('想听宫音',{selectionMode:'same_category',currentCardId:'MU01',recentCards:[{id:'MU01',shownAt:now}]},library);assert.equal(requestedUsed.reason,'category_exhausted','explicit mode does not silently change into a different mode');
});
test('music never overrides acute or unclear discomfort and audio cards cannot run at night',()=>{
  const music=[card('music',{category:'五音舒缓',audio:{mode:'gong'},triggers:['music','baseline'],nightSafe:true})];
  assert.equal(run('我胸痛，想听音乐',{},music).level,'emergency');
  assert.equal(run('我头晕，想听音乐',{},music).level,'clarify');
  assert.equal(run('我不舒服，想听音乐',{},music).level,'clarify');
  assert.equal(run('我口干，想听音乐',{},[...music,card('mouth',{triggers:['dry_mouth']})]).card?.id,'mouth');
  const at='2026-11-05T23:30:00+08:00';const result=run('我还醒着，想听音乐',{now:at,vitals:{...vitals,measuredAt:at}},music);assert.equal(result.level,'silent');assert.equal(result.card,null);
});
test('expanded real catalog provides distinct six-context support and five playable modes in daytime',()=>{
  const library=JSON.parse(readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
  for(const text of ['我口干','我口苦','大便不成形','小便黄','我没有胃口','情绪憋着不说']) {
    const result=run(text,{},library);assert.ok(result.card,text);assert.doesNotMatch(result.message,/判定.*湿热|诊断.*阴虚/);
  }
  for(const [text,mode] of [['宫音','gong'],['商音','shang'],['角音','jue'],['徵音','zhi'],['羽音','yu']])assert.equal(run(text,{},library).card?.audio?.mode,mode);
  const at='2026-11-05T23:30:00+08:00';const night=run('想听音乐',{now:at,vitals:{...vitals,measuredAt:at}},library);assert.equal(night.card,null);assert.equal(night.level,'silent');
});
test('real catalog supports all twelve routine slots without repeating a card within the day',()=>{
  const library=JSON.parse(readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
  const recentCards=[];
  for(let hour=0;hour<24;hour+=2) {
    const at=`2026-11-05T${String(hour).padStart(2,'0')}:00:00+08:00`;
    const result=run('',{now:at,vitals:{source:'unavailable'},weather:{temperature:3},recentCards},library);
    assert.ok(result.card,`routine hour ${hour}`);assert.ok(!recentCards.some(r=>r.id===result.card.id));
    if(hour<5)assert.ok(result.card.nightSafe&&!result.card.audio);
    recentCards.push({id:result.card.id,shownAt:at,category:result.card.category,actionFamily:result.card.actionFamily,slot:hour===0?23:hour-1});
  }
  assert.equal(new Set(recentCards.map(r=>r.id)).size,12);
});
test('only fresh good explicitly sourced values trigger demo confirmation; persistence is never invented',()=>{
  const high={...vitals,heartRate:125};
  const result=run('',{vitals:high});assert.equal(result.level,'confirm');assert.equal(result.evidence.find(e=>e.kind==='vitals').persistenceMinutes,null);
  assert.equal(DEMO_THRESHOLDS.validated,false);
  for(const override of [{quality:'poor'},{source:'unavailable'},{measuredAt:'2026-11-05T09:49:00+08:00'},{measuredAt:'2026-11-05T10:01:00+08:00'}])assert.equal(run('',{vitals:{...high,...override}}).level,'baseline');
  const sim=run('',{vitals:{...high,source:'simulation'}});assert.equal(sim.evidence.find(e=>e.kind==='vitals').source,'simulation');
  const no=run('',{vitals:high,confirmation:'no'});assert.equal(no.level,'baseline');assert.doesNotMatch(no.message,/因为.*疲劳|只是.*疲劳|导致|病因是/);
  assert.equal(run('',{vitals:high,confirmation:'yes'}).level,'clarify');
});
test('severe persistent objective abnormalities keep a warning after denial without manufacturing a cause',()=>{
  const high={...vitals,heartRate:150,durationMinutes:10};
  const result=run('',{vitals:high,confirmation:'no'});assert.equal(result.level,'symptom');assert.equal(result.card,null);assert.match(result.message,/核对|咨询/);
  assert.match(result.message,/近10分钟/);assert.match(result.message,/150次/);
  const unknown=run('',{vitals:{...high,durationMinutes:undefined},confirmation:'no'});assert.equal(unknown.level,'confirm');assert.equal(unknown.card,null);
  assert.equal(unknown.evidence.find(e=>e.kind==='vitals').persistenceMinutes,null);
  assert.doesNotMatch(unknown.message,/10分钟/);
});
test('negative confirmation after current abnormal data chooses only low-burden quiet support even at mealtime',()=>{
  const library=JSON.parse(readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
  const at='2026-11-05T12:00:00+08:00';
  const fast={...vitals,source:'simulation',measuredAt:at,heartRate:124,baselineHeartRate:70,stress:84,durationMinutes:10};
  const input={now:at,vitals:fast,confirmation:'no',profile:{conditions:[],constitution:['balanced']}};
  for(let sequence=0;sequence<15;sequence++) {
    const result=run('',{...input,sequence},library);assert.ok(result.card);assert.ok(['自然呼吸','情绪调适','床上安静','五音舒缓'].includes(result.card.category),result.card.id);assert.match(result.message,/低负担.*安静/);assert.doesNotMatch(result.card.category,/食养|舒展|八段锦|穴位/);assert.doesNotMatch(result.message,/只是疲劳|疲劳导致|已经正常|已恢复正常/);
  }
  const first=run('',input,library);
  const next=run('',{...input,selectionMode:'same_category',currentCardId:first.card.id,recentCards:[{id:first.card.id,shownAt:at}]},library);
  assert.ok(next.card);assert.equal(next.card.category,first.card.category);assert.notEqual(next.card.id,first.card.id);assert.notEqual(next.level,'confirm');
  const obsoleteFood=run('',{...input,selectionMode:'same_category',currentCardId:'FD01'},library);assert.equal(obsoleteFood.reason,'no_compatible_card');
  const severe=run('',{...input,vitals:{...fast,heartRate:150}},library);assert.equal(severe.level,'symptom');assert.equal(severe.card,null);
  const wrongPool=[card('food',{category:'日常食养'}),card('walk',{category:'舒展身体'}),card('drink',{category:'起居生活'})];
  assert.equal(run('',input,wrongPool).card,null,'no quiet candidate must not fall back to activity or drinking');
  assert.equal(run('',{...input,vitals:{...fast,quality:'poor'}},wrongPool).level,'baseline','stale or poor measurements do not create a false abnormal-data restriction');
});
test('sleeping night is quiet and awake night cannot select food or exercise',()=>{
  for(const hour of ['23','00','04']) {
    const at=`2026-11-05T${hour}:00:00+08:00`;
    assert.equal(run('',{now:at,vitals:{...vitals,measuredAt:at,asleep:true}}).level,'silent');
    assert.equal(run('我胸痛',{now:at,vitals:{...vitals,measuredAt:at,asleep:true}}).level,'emergency');
    const awake=run('我还醒着',{now:at,vitals:{...vitals,measuredAt:at,asleep:true}},[card('exercise',{category:'运动'}),card('food',{category:'食养'}),card('calm')]);
    assert.equal(awake.card?.id,'calm');
  }
  assert.equal(run('',{now:'2026-11-05T05:00:00+08:00',vitals:{...vitals,measuredAt:'2026-11-05T05:00:00+08:00',asleep:true}}).level,'baseline');
  const at='2026-11-05T00:30:00+08:00',bloodPressure={systolic:190,diastolic:125,measuredAt:at},sleeping={...vitals,measuredAt:at,heartRate:160,durationMinutes:15,asleep:true};
  const quiet=run('',{now:at,vitals:sleeping,bloodPressure});assert.equal(quiet.level,'silent');assert.ok(quiet.evidence.some(e=>e.kind==='blood-pressure'));
  assert.equal(run('',{now:at,vitals:sleeping,bloodPressure,manualMeasurement:true}).level,'symptom');
  assert.equal(run('我现在没有不舒服',{now:at,vitals:{...vitals,measuredAt:at,asleep:true}}).level,'baseline','active input overrides silent sleep inference');
  assert.equal(run('我正在开车',{vitals:{...vitals,heartRate:125}}).reason,'road_attention');
});
test('cold weather, constitution and condition constraints are intersected before selection',()=>{
  const library=[card('outdoor',{indoor:false}),card('warm',{constitutions:['yang_deficiency']}),card('contra',{contraindications:['hypertension']}),card('safe')];
  for(const weather of [{temperature:5},{temperature:15,drop24h:5}]){
    const result=run('',{weather,profile:{conditions:['高血压'],constitution:'balanced'}},library);assert.equal(result.card?.id,'safe');
  }
  assert.equal(run('',{profile:{conditions:[]}},[card('requires-known',{constitutions:['balanced']})]).card,null,'unknown constitution is not balanced');
});
test('selection is deterministic, avoids recent cards and family cooldown, and honors weekly history',()=>{
  const library=[card('a',{actionFamily:'same'}),card('b',{actionFamily:'same'}),card('c'),card('w',{frequency:'weekly'})];
  assert.equal(run('',{sequence:0},library).card.id,run('',{sequence:0},library).card.id);
  assert.equal(run('',{recentCards:['a','w']},library).card?.id,'c');
  assert.equal(run('',{recentCards:['a']},library).card?.id,'c','same family b remains on cooldown');
  assert.equal(run('',{recentCards:[{id:'w',shownAt:'2026-11-04T08:00:00+08:00'}]},[library[3]]).card,null);
  const history=[{id:'w',shownAt:'2026-10-01T08:00:00+08:00'},'other1','other2','other3'];
  assert.equal(run('',{recentCards:history},[library[3]]).card?.id,'w');
  assert.equal(run('',{recentCards:['w','x','y','z']},[library[3]]).card,null,'unknown-date history cannot prove weekly eligibility');
});
test('self-reported cold changes indoor preference without inventing temperature',()=>{
  const library=[card('outside',{indoor:false}),card('cool',{weatherCondition:'hot'}),card('warm',{coldWeatherPreferred:true,why:'避开直吹，留在舒适的位置。'})];
  const result=run('天气太冷',{weather:{temperature:32}},library);
  assert.equal(result.card?.id,'warm');assert.match(result.message,/自述的冷环境/);assert.doesNotMatch(result.message,/\d+°C/);
  for(const text of ['天气不冷','昨天外面太冷','如果天气太冷怎么办'])assert.ok(!analyzeText(text).context.includes('cold_weather'),text);
  assert.ok(analyzeText('今天天气太冷').context.includes('cold_weather'));
});
test('morning context preserves objective confirmation and only lowers burden after denial',()=>{
  const library=JSON.parse(readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
  const at='2026-11-05T06:30:00+08:00',fast={...vitals,source:'simulation',measuredAt:at,heartRate:124,stress:84,durationMinutes:10};
  const extra={now:at,vitals:fast,weather:{temperature:2}};
  const first=run('刚睡醒，天气太冷',extra,library);
  assert.equal(first.level,'confirm');assert.match(first.question,/124次\/分/);assert.match(first.question,/近10分钟/);
  const confirmed=run('刚睡醒，天气太冷',{...extra,confirmation:'no'},library);
  assert.equal(confirmed.confirmation,'no');assert.equal(confirmed.evidence.find(e=>e.kind==='vitals')?.source,'simulation');assert.ok(confirmed.evidence.find(e=>e.kind==='vitals')?.signals.length);
  assert.equal(run('',{},library).confirmation,null,'no earlier confirmation is invented or retained by the engine');
  assert.ok(confirmed.card);assert.ok(['自然呼吸','情绪调适','床上安静','五音舒缓'].includes(confirmed.card.category));
  assert.match(confirmed.message,/不急着起身/);assert.match(confirmed.message,/2°C/);assert.doesNotMatch(confirmed.card.category,/食养|舒展|八段锦|穴位/);
  assert.equal(run('刚睡醒，心慌还气短',extra,library).level,'emergency');
});
test('numbness gets one key assessment without requiring a staged interrogation',()=>{
  const first=run('我手脚有点麻，今天很焦虑');
  assert.equal(first.inputKind,'numbness');assert.equal(first.assessmentPending,true);assert.equal(first.card,null,'unreviewed synthetic cards cannot bypass symptoms');
  assert.equal(first.reason,'graded_support_unavailable');assert.equal(first.recheck.afterSeconds,30);
  const unknown=run('不确定',{clarificationContext:first.clarificationContext,clarificationAttempts:1});
  assert.equal(unknown.assessmentPending,false);assert.equal(unknown.assessmentIncomplete,true);assert.equal(unknown.question,undefined);
  for(const text of ['左手突然有点麻','现在说话不清楚，左手麻','手脚麻，同时一侧无力'])assert.equal(run(text).level,'emergency',text);
  for(const text of ['没有手脚发麻','昨天左手突然麻了','如果左手突然发麻怎么办'])assert.equal(analyzeText(text).emergency,false,text);
});
test('uncertain physical sensations remain questions even beside music or another recognized complaint',()=>{
  for(const text of ['我感觉怪怪的，想听音乐','胸口有种说不上来的感觉，想听音乐','我口干，胸口有点怪怪的']){
    const result=run(text);assert.equal(result.level,'clarify',text);assert.equal(result.card,null);
  }
  const clear=run('口干让我不舒服',{},[card('mouth',{triggers:['dry_mouth']})]);assert.equal(clear.card?.id,'mouth');
});
test('graded symptoms preserve unknown detail and 30 second feedback without invented urgency',()=>{
  const denied='没有胸痛、气短、冷汗或晕厥';
  for(const text of ['心慌','胸闷','头晕']){const r=run(text);assert.equal(r.level,'clarify');assert.equal(r.assessmentPending,true);assert.equal(r.card,null);}
  const rest=run(`刚生完气，头晕轻微短暂，正在缓解，${denied}；没有一侧无力，讲话正常，面部正常`);
  assert.equal(rest.reason,'graded_support_unavailable');assert.equal(rest.recheck.afterSeconds,30);assert.equal(rest.card,null);
  assert.doesNotMatch(rest.message,/气血|原因是|焦虑导致/);
  const mild=`心慌轻微短暂，正在缓解，${denied}`;
  const cardiac={topic:'cardiac',text:mild};
  assert.equal(run('',{clarificationContext:cardiac,recheckOutcome:'unchanged'}).reason,'graded_support_unchanged');
  assert.equal(run('',{clarificationContext:cardiac,recheckOutcome:'improved'}).reason,'symptoms_improved');
  assert.equal(run('现在胸痛',{clarificationContext:cardiac,recheckOutcome:'improved'}).level,'emergency');
  assert.equal(run('心慌一直不消退').level,'emergency');
  assert.equal(run('',{clarificationContext:rest.clarificationContext,recheckOutcome:'persistent'}).reason,'graded_support_unchanged');
  assert.equal(run('现在一侧无力',{clarificationContext:rest.clarificationContext,recheckOutcome:'improved'}).level,'emergency');
});
test('one improving complaint cannot lend its assessment to a different unassessed or deteriorating complaint',()=>{
  const prefix='心慌轻微短暂，正在缓解，没有胸痛、气短、冷汗或晕厥';
  for(const latest of ['此外还有头晕','头晕持续了一小时','但头晕越来越厉害','头晕一直未缓解','头晕正在加重']) {
    const result=run(`${prefix}；${latest}，没有一侧无力，讲话正常，面部正常`);
    assert.notEqual(result.reason,'gentle_rest_recheck',latest);assert.equal(result.card,null);
  }
  const completed=run('心慌、头晕轻微短暂，正在缓解，没有胸痛、气短、冷汗或晕厥；没有一侧无力，讲话正常，面部正常',{clarificationContext:{topic:'cardiac',text:`${prefix}；还有头晕`}});
  assert.equal(completed.level,'emergency','current palpitations plus dizziness is a concerning combination despite mild wording');
});
test('alternative method follows its category first and then only a strictly lower-burden quiet family',()=>{
  const library=[card('AC01',{category:'穴位轻触'}),card('AC02',{category:'穴位轻触'}),card('BR01',{category:'自然呼吸',actionFamily:'natural_breath'}),card('food',{category:'日常食养'}),card('audio',{category:'五音舒缓',audio:{mode:'gong'}})];
  const input={selectionMode:'alternative_method',currentCardId:'AC01',sequence:99};
  assert.equal(run('',input,library).card?.id,'AC02');
  const cooled={...input,recentCards:[{id:'AC02',shownAt:now}]};
  const fallback=run('',cooled,library);assert.equal(fallback.card?.id,'BR01');assert.equal(fallback.reason,'alternative_lower_burden');
  assert.equal(run('',{...cooled,recentCards:[...cooled.recentCards,{id:'BR01',shownAt:now}]},library).reason,'alternative_exhausted');
  assert.equal(run('',{...input,currentCardId:'BR01'},[library[2],library[3],library[4]]).reason,'alternative_exhausted','quietest exhausted method cannot escalate into food or music');
  assert.equal(run('胸痛',input,library).level,'emergency');
  const at='2026-11-05T23:30:00+08:00';
  assert.equal(run('',{...input,now:at,vitals:{...vitals,measuredAt:at}},[{...library[0],nightSafe:false},library[3],library[4]]).reason,'no_compatible_card','unsafe retained card is not kept at night');
  const restricted=[library[0],card('BR01',{category:'自然呼吸',actionFamily:'natural_breath',contraindications:['heart_failure']})];
  assert.equal(run('',{...input,profile:{conditions:['heart_failure']}},restricted).reason,'alternative_exhausted','fallback preserves known contraindications');
});
test('long repeated follow-up context cannot truncate a new emergency or multiply itself',()=>{
  let context={topic:'numbness',text:'手脚发麻，逐渐开始'};
  let text=context.text;
  for(let i=0;i<8;i++) {
    const answer=`第${i+1}次补充：${'还想把感受说明白。'.repeat(42)}`;
    text=`${text}。${answer}`;
    const r=run(text,{clarificationContext:context,latestInput:answer});
    assert.equal(r.reason,'graded_support_unavailable');
    assert.ok(r.clarificationContext.text.length<=4000);
    context=r.clarificationContext;
  }
  const danger='现在胸痛冒冷汗';
  assert.equal(run(`${text}。${'补充情况。'.repeat(2400)}${danger}`,{clarificationContext:context}).level,'emergency');
  assert.equal(run(text,{clarificationContext:context,latestInput:danger}).level,'emergency','raw latest reply is independently checked');
  assert.equal(analyzeText('日常记录。'.repeat(3000)+danger).emergency,true);
  const repeated=run('心慌。现在也胸闷',{clarificationContext:{topic:'cardiac',text:'心慌'}});
  assert.equal(repeated.level,'emergency');assert.equal(repeated.card,null);
  const scoped=run('',{latestInput:'如果我胸痛怎么办'});assert.notEqual(scoped.level,'emergency','the extra safety scan still respects hypothetical language');
});
