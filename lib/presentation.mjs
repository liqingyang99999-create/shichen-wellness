import {shichen} from './time.mjs';

// Presentation only: this module never changes eligibility, sources or safety decisions.
const constitutionLabels=Object.freeze({balanced:'平和',qi_deficiency:'气虚',yang_deficiency:'阳虚',yin_deficiency:'阴虚',phlegm_damp:'痰湿',damp_heat:'湿热',blood_stasis:'血瘀',qi_stagnation:'气郁',special:'特禀'});
const list=value=>Array.isArray(value)?value:typeof value==='string'?[value]:[];
const clean=value=>typeof value==='string'?value.trim():'';
const time=value=>value instanceof Date?value.getTime():typeof value==='string'&&value.trim()?Date.parse(value):NaN;
function constitutionKeys(profile){
  const c=profile?.constitution;
  return [...new Set(list(c&&typeof c==='object'&&!Array.isArray(c)?c.primary:c).filter(key=>Object.hasOwn(constitutionLabels,key)))];
}
function tendencyLabel(keys){
  if(keys.length===1&&keys[0]==='balanced')return '平和表现';
  const labels=keys.slice(0,2).map(key=>constitutionLabels[key]);
  return labels.join('、')+(keys.length>2?`等${keys.length}项`:'')+'倾向';
}

/** Short badge for the stored questionnaire result, not a diagnosis or inferred score. */
export function constitutionBadge(profile){
  const keys=constitutionKeys(profile),c=profile?.constitution;
  if(!keys.length)return c&&typeof c==='object'&&!Array.isArray(c)&&Array.isArray(c.primary)&&c.primary.length===0?'暂无明确体质倾向':'体质尚未记录';
  const mode=c?.mode||profile?.assessmentMode;
  return tendencyLabel(keys)+(mode==='simplified'?'（简测）':'');
}

// These are plain-language summaries of the actual card actions, not new effects.
const purposes=Object.freeze({
  staple_swap:'把薯类放进下一餐的主食安排',
  natural_breath:'留意几次自然呼吸，给自己一点安静',
  comfortable_posture:'找个有支撑的舒服姿势，轻松歇一会',
  jaw_relax:'轻轻松开咬紧的下颌',
  hands_rest:'让双手有支撑地歇一会',
  grounding_support:'感受身下的安稳支撑',
  grounding_colors:'看看身边的颜色，让注意力停一会',
  flower_notice:'欣赏一小片花景，暂时放下任务',
  avoid_draft:'调整直吹的风，让身边更舒适',
  cold_indoor:'先避开室内直吹的冷风',
  drymouth_plainwater:'在适合自己饮水安排的前提下，小口润一润',
  drymouth_lipcare:'用熟悉的润唇用品照顾干燥唇部',
  drymouth_oralcare:'给今天的口腔清洁留好时间',
  drymouth_pattern:'记下口干最明显的时段',
  bitter_timing:'记下口味变化开始的时间',
  bitter_trigger_food:'先不追加让自己不舒服的刺激食物',
  bitter_dental_question:'把口腔的具体变化整理成一个咨询问题',
  bitter_med_question:'记下近期新增用品，方便向药师询问',
  stool_frequency:'记下排便次数和变稀的起始时间',
  stool_handwash:'把如厕后的手卫生做好',
  stool_med_context:'整理近期用药的名称和开始时间',
  stool_help_summary:'把排便变化整理成一句便于咨询的话',
  urine_frequency:'把尿色和排尿次数一起记下',
  urine_associated:'补充尿色变化时的其他感受',
  urine_personal_plan:'先查看自己已有的液体安排',
  urine_baseline:'记录这次变化与平常有什么不同',
  appetite_small_plate:'按原有饮食安排，从小份熟悉食物开始',
  appetite_meal_help:'请人分担一个备餐环节',
  appetite_intake_note:'记下最近几餐的实际食量变化',
  appetite_mealtime:'给下一餐留一个从容的时间',
  emotion_unsent:'先写一句不发送的话，给回应留点时间',
  emotion_fact_guess:'把看到的事实与自己的猜想分开',
  emotion_i_statement:'用一句“我感到”表达自己的需要',
  emotion_talk_time:'为这次交流另选一个方便的时段',
  emotion_neutral_listener:'想一位愿意倾听的朋友，需要时再联系',
  emotion_response_pause:'回应前先停一小会，呼吸照常',
  meal_attention:'先从容吃完口中食物，再继续交流',
  meal_space:'把手边餐具放稳，再继续这一餐',
  qigong_raise:'从坐姿小幅上托开始舒展',
  qigong_open:'试一小段坐姿开合，动作保持轻缓',
  qigong_single_raise:'试一小段坐姿分掌，停在舒适范围',
  qigong_look:'从缓慢、小幅转头开始',
  qigong_shift:'先体验坐姿重心的小幅变化',
  qigong_lower:'让手掌沿大腿缓缓滑一小段',
  qigong_fist:'试一小段松握与收放',
  qigong_heel:'坐稳后轻抬脚跟，再慢慢落下'
});
const toneLabels={gong:'宫',shang:'商',jue:'角',zhi:'徵',yu:'羽'};

/** Safe short action purpose; unfamiliar future cards retain their reviewed title. */
export function cardActionSummary(card){
  if(!card)return '';
  if(toneLabels[card.audio?.mode])return `听一小段${toneLabels[card.audio.mode]}调音景，给自己一点舒缓时间`;
  if(purposes[card.actionFamily])return purposes[card.actionFamily];
  const title=clean(card.title).replace(/^[^·]{1,4}\s*·\s*/u,'').replace(/[。！？!?]+$/u,'');
  return title?`从“${title}”这件小事开始`:'安排一件适合当前情境的小事';
}

const symptomLabels={fatigue:'有些疲累',poor_sleep:'最近没睡好',dry_mouth:'口干',bitter_taste:'口苦',loose_stool:'排便变稀',yellow_urine:'尿色偏黄',poor_appetite:'胃口不太好'};
const emotionLabels={angry:'有些烦躁',anxious:'有些紧张',sad:'情绪低落',suppressed_emotion:'心里有些憋闷'};
const contextLabels={eating:'正在进餐',after_meal:'刚吃完饭',before_meal:'正准备吃饭',music:'想听一段音乐'};
const acuteSymptoms=new Set(['chest_pain','chest_tightness','palpitations','dizzy','breathlessness','severe_breathlessness','syncope','near_syncope','stroke_sign','vision_change','severe_headache','cold_sweat','black_stool','bloody_stool','heavy_bleeding','severe_dehydration','confusion']);

function reportPhrase(report,card,feedbackSource){
  if(!report)return '';
  const triggers=new Set(list(card.triggers));
  const context=list(report.context).filter(key=>triggers.has(key)&&contextLabels[key]).slice(0,1).map(key=>contextLabels[key]);
  const symptoms=list(report.symptoms).filter(key=>triggers.has(key)&&symptomLabels[key]).slice(0,1).map(key=>symptomLabels[key]);
  const emotion=triggers.has(report.emotion)&&emotionLabels[report.emotion]?emotionLabels[report.emotion]:null;
  const phrases=[...context,...symptoms,...(emotion?[emotion]:[])].slice(0,2);
  if(!phrases.length)return '';
  return `${feedbackSource==='voice'?'你在语音中提到':'你刚提到'}${phrases.join('、')}`;
}
function weatherPhrase(weather,card,now){
  // Source flags alone do not make a weather value current. Match the app's 3h window.
  if(weather?.source!=='open-meteo')return '';
  const age=time(now)-time(weather.measuredAt);
  if(!Number.isFinite(age)||age<0||age>=10800000)return '';
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const number=value=>Number(value.toFixed(1));
  const cold=card.coldWeatherPreferred===true||card.weatherCondition==='cold';
  if(cold&&finite(weather.temperature)&&weather.temperature<=5)return `当地天气记录为${number(weather.temperature)}°C`;
  if(cold&&finite(weather.minTemperature)&&weather.minTemperature<=5)return `今日预报最低温为${number(weather.minTemperature)}°C`;
  if(cold&&finite(weather.drop24h)&&weather.drop24h>=5)return `天气记录较昨日降温${number(weather.drop24h)}°C`;
  if(card.weatherCondition==='hot'&&finite(weather.temperature)&&weather.temperature>=30)return `当地天气记录为${number(weather.temperature)}°C`;
  return '';
}
function preferencePhrase(profile,card){
  const known=constitutionKeys(profile),preferences=list(card.preferredConstitutions);
  const restricted=list(card.constitutions).filter(key=>key!=='all');
  const matched=known.filter(key=>preferences.includes(key)||restricted.includes(key));
  return matched.length?`参考你记录的${tendencyLabel(matched)}`:'';
}

/**
 * Compact home-card explanation (one or two sentences).
 * Supply the same decision inputs used for selection. Does not modify source details.
 * Non-card safety/confirmation branches return their complete message unchanged.
 * @param {any} options
 */
export function conciseCardReason({decision,card=decision?.card,profile,now,weather,text,feedbackSource}={}){
  const original=clean(decision?.message);
  if(!card||['emergency','confirm','clarify','silent'].includes(decision?.level))return original;
  const sameCard=!decision?.card?.id||!card.id||decision.card.id===card.id;
  const evidence=sameCard&&Array.isArray(decision?.evidence)?decision.evidence:[];
  const report=evidence.find(item=>item?.kind==='self-report');
  if(list(report?.symptoms).some(key=>acuteSymptoms.has(key)))return original||'先处理当前不适，再安排日常行动。';
  const moment=time(now);
  const clock=Number.isFinite(moment)?`现在是${shichen(new Date(moment)).name}`:'';
  const context=reportPhrase(report,card,feedbackSource);
  // Never use old chat text to override an explicit empty decision self-report.
  const fallback=!report&&!decision&&clean(text)?'结合你这次的描述':'';
  const preference=sameCard?preferencePhrase(profile,card):'';
  const environment=sameCard?weatherPhrase(weather,card,now):'';
  const vital=evidence.find(item=>item?.kind==='vitals'&&['device','simulation'].includes(item.source)&&Array.isArray(item.signals)&&item.signals.length);
  const verified=decision?.confirmation==='no'&&vital?`${vital.source==='simulation'?'模拟':'设备'}记录有波动，你确认暂无明显不适，先选轻量动作`:'';
  const parts=[verified,context||fallback,environment,preference].filter(Boolean).slice(0,2);
  const lead=[clock,...parts].filter(Boolean).join('；');
  const action=`建议${cardActionSummary(card)}。`;
  return lead?`${lead}。${action}`:action;
}
