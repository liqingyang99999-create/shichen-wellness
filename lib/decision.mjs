import {solarTerm} from './time.mjs';
// Deterministic safety-first preview. Never an AI diagnosis or a validated risk score.
export const DECISION_SOURCES = Object.freeze({
  chest:'https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack',
  bloodPressure:'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/when-to-call-911-for-high-blood-pressure',
  palpitations:'https://www.nhs.uk/symptoms/heart-palpitations/',
  breathing:'https://www.nhs.uk/symptoms/shortness-of-breath/',
  bleeding:'https://www.nhs.uk/symptoms/bleeding-from-the-bottom-rectal-bleeding/',
  dehydration:'https://www.nhs.uk/conditions/dehydration/',
  confusion:'https://www.nhs.uk/symptoms/confusion/',
  stroke:'https://www.nhs.uk/conditions/stroke/symptoms/',
  dizziness:'https://www.nhs.uk/symptoms/dizziness/',
  numbness:'https://www.nhs.uk/symptoms/pins-and-needles/'
});
export const DEMO_THRESHOLDS = Object.freeze({freshMinutes:10,heartRateHigh:120,heartRateLow:45,heartRateIncrease:25,hrvDecreaseFraction:0.3,stressHigh:80,shortSleepHours:6,severeHeartRateHigh:140,severeHeartRateLow:40,persistenceMinutes:10,validated:false});
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const timestamp=value=>typeof value==='string'?Date.parse(value):NaN;
const hits=(text,re)=>[...text.matchAll(new RegExp(re.source,'gu'))];
const acute=new Set(['chest_pain','chest_pressure','chest_tightness','palpitations','dizzy','severe_dizziness','breathlessness','severe_breathlessness','syncope','near_syncope','stroke_sign','vision_change','severe_headache','cold_sweat','black_stool','bloody_stool','heavy_bleeding','severe_dehydration','confusion']);
const supportiveSymptoms=['dry_mouth','bitter_taste','loose_stool','yellow_urine','poor_appetite','fatigue','poor_sleep'];
// Reviewed quiet actions: no meal preparation, walking, exercise or new fluid intake.
const quietAfterCheckFamilies=new Set(['natural_breath','comfortable_posture','jaw_relax','hands_rest','grounding_support','grounding_colors','flower_notice','music_gong','music_shang','music_jue','music_zhi','music_yu','bed_eyelids','bed_brow_release','bed_texture','bed_ambient_sound','bed_familiar_place','bed_sleep_pressure','bed_defer_task','bed_clock_check','bed_blanket_edge','bed_pillow_edge','bed_thought_noticing','bed_day_closing']);
const gentlestFamilies=new Set(['natural_breath','hands_rest','grounding_support','bed_eyelids','bed_brow_release','bed_ambient_sound','bed_familiar_place','bed_sleep_pressure','bed_defer_task','bed_clock_check','bed_thought_noticing','bed_day_closing']);
const patterns = [
  ['chest_pain',/胸(?:口|部)?(?:有点|有些|轻微|明显|突然)?(?:疼|痛)|心(?:口|前区)疼|压榨(?:样|性)?(?:胸痛|胸部不适)|胸口像被(?:压|挤)/],
  ['chest_pressure',/胸(?:口|部)?(?:有点|有些|轻微|明显)?(?:压迫感|压榨感|重压感|挤压感)|胸口.{0,4}像压着/],
  ['chest_tightness',/胸(?:口|部)?(?:有一点|有点|有些|轻微|明显|突然)?(?:发闷|闷|憋闷|发紧|紧缩|不舒服|不适)/],
  ['severe_breathlessness',/喘不过气|呼吸(?:非常|十分|严重)?困难|(?:严重|十分严重的)气促|(?:喘得|气促得)(?:说不出话|不能说话|讲不出完整句子)|嘴唇(?:发紫|青紫)|无法呼吸/],
  ['breathlessness',/气短|气促|呼吸不畅|喘得厉害|喘不上气/],
  ['syncope',/晕倒|昏倒|昏厥|晕厥|失去意识|不省人事/],
  ['near_syncope',/快(?:要)?晕(?:倒)?|要晕过去|眼前发黑|快昏倒/],
  ['stroke_sign',/口角歪斜|嘴(?:角)?歪(?:了)?|一侧(?:肢体|手脚|胳膊|身体)?(?:突然)?无力|(?:左|右)(?:手|胳膊|腿)(?:突然)?(?:抬不起来|使不上劲)|突然(?:说不清话|口齿不清|视力下降)|说话(?:突然)?含糊|(?:说话|讲话)不清楚/],
  ['numbness',/(?:手脚|双手|双脚|两只手|两只脚)(?:突然)?(?:有点|有一点|都)?(?:发麻|麻木|麻)|(?:手指|脚趾|四肢|胳膊|手|脚|腿)(?:突然)?(?:有点|有一点|一直)?(?:发麻|麻木|麻)|(?:一侧|单侧|左侧|右侧)(?:突然)?(?:发麻|麻木)|麻木感/],
  ['severe_dizziness',/头晕得(?:站不稳|走不了)|(?:剧烈|严重)眩晕/],
  ['vision_change',/视物模糊|视力(?:突然)?下降|看东西突然模糊/],
  ['severe_headache',/突然(?:剧烈)?头痛|剧烈头痛|头痛欲裂/],
  ['cold_sweat',/大汗淋漓|冒冷汗|出冷汗|冷汗直冒/],
  ['black_stool',/黑便|(?:大便|粪便|便便)(?:是|发|变|呈)?黑(?:色)?|柏油样(?:大便|便)/],
  ['bloody_stool',/便血|血便|(?:大便|粪便|便便)(?:有|带|混有)血|拉(?:出)?血(?:便)?/],
  ['heavy_bleeding',/便血(?:一直|大量)?不止|大量(?:便血|血便)|(?:肛门|大便).{0,5}出血不止|马桶(?:水)?(?:全|都)?(?:是血|被血染红)|排出大血块/],
  ['severe_dehydration',/严重脱水|喝(?:水|什么)都吐|无法保留液体|一天没(?:有)?尿|尿量明显减少/],
  ['confusion',/意识混乱|神志不清|叫不醒|难以唤醒|突然(?:糊涂|不认识人|分不清方向)/],
  ['self_harm',/(?:想|打算|准备|要)(?:自杀|伤害自己|结束自己的生命|结束生命)|正在(?:割腕|伤害自己)|不想活了/],
  ['palpitations',/心慌|心悸|心跳(?:很快|特别快|乱|不齐)|心脏怦怦/],
  ['dizzy',/头(?:有(?:一)?点(?:点|儿)?|有些|稍微|发)?晕|眩晕|晕乎/],
  ['fatigue',/疲惫|乏力|很累|有点累|困倦|犯困|没劲|没(?:有)?力气|腿软/],
  ['poor_sleep',/没睡好|睡不好|失眠|熬夜|睡得(?:很少|不好)|睡眠不足/],
  ['dry_mouth',/口干|口渴|嘴(?:巴|里)?(?:有点|很|发)?干|嗓子干/],
  ['bitter_taste',/口苦|嘴(?:巴|里)?(?:有点|很|发)?苦/],
  ['loose_stool',/便溏|拉肚子|腹泻|大便(?:稀|不成形)|稀便/],
  ['yellow_urine',/小便(?:有点|很|发|偏)?黄|尿(?:液|色)?(?:有点|很|发|偏)?黄/],
  ['poor_appetite',/没(?:有)?胃口|胃口(?:差|不好)|食欲(?:不振|不好|差)|吃不下(?:饭|东西)/]
];
function documentQuotes(text) {
  return text.replace(/[“「『‘"']([^”」』’"']*)[”」』’"']/gu,(whole,content,index)=>{
    const before=text.slice(Math.max(0,index-28),index),after=text.slice(index+whole.length,index+whole.length+18);
    return /文档|说明书|指南|示例|例句|台词|引文|关键词|翻译|写着|科普/.test(before)||/是(?:一个)?例句|这(?:个|是).*示例|什么意思|怎么翻译/.test(after)?' '.repeat(whole.length):whole;
  });
}
function relevant(text,index) {
  const sentence=text.slice(0,index).split(/[。！？!?；;\n]/u).at(-1);
  const clause=sentence.split(/[，,]/u).at(-1);
  const current=[...sentence.matchAll(/但(?:是)?|不过|可是|然而|现在|此刻|目前|今天|确实|正在/gu)].at(-1)?.index??-1;
  const conditional=[...sentence.matchAll(/如果|假如|假设|万一|比如|例如|要是|明天|后天|以前|既往|曾经|去年|昨天|前天|前几天|上周|上个月|文档|说明书|指南|示例|例句|台词|关键词|翻译|科普|文章|写着|想了解|想知道|什么是|什么叫|解释/gu)].at(-1)?.index??-1;
  if(conditional>=0) {
    const strict=/^(?:如果|假如|假设|万一|比如|例如|要是|明天|后天|以前|既往|曾经|去年|昨天|前天|前几天|上周|上个月|文档|说明书|指南|示例|例句|台词|关键词|翻译|科普|文章|写着)/u.test(sentence.slice(conditional));
    const clauseStart=Math.max(sentence.lastIndexOf('，'),sentence.lastIndexOf(','))+1;
    const contrast=[...sentence.matchAll(/但(?:是)?|不过|可是|然而/gu)].at(-1)?.index??-1;
    if(strict&&!(contrast>conditional||conditional<clauseStart&&current>=clauseStart)||!strict&&conditional>current)return false;
  }
  if(/不是(?:没有|不)/u.test(clause.slice(-10)))return true;
  if(/(?:没有|没|并无|无|不是|否认|未出现|未感到|并非|不再|不想|不愿|不打算|不需要|不喜欢|不算|无需|不要|别|不)(?:要|任何|明显|感到|觉得|感觉|出现|发生|很|特别|十分|那么|这么|太|非常)*\s*$/u.test(clause))return false;
  if(/(?:没有|并无|否认)[^但可是]{0,64}[、及和或]\s*$/u.test(clause))return false;
  return true;
}
function currentMatches(text,pattern){return hits(text,pattern).filter(m=>{
  const after=text.slice(m.index+m[0].length),clause=(text.slice(0,m.index).split(/[。！？!?；;\n，,]/u).at(-1)+m[0]+after.split(/[。！？!?；;\n，,]/u)[0]);
  if(/^(?:是什么|什么意思|的定义|的科普|一词|这个词)/u.test(after)||/(?:阅读|看了|学习).*(?:科普|文章|文档|说明书)/u.test(clause))return false;
  return relevant(text,m.index)&&!(/^(?:已经)?(?:没有了|已消失|缓解了|好了)/u.test(after));
});}
function numbnessDetails(text) {
  const has=re=>currentMatches(text,re).length>0;
  const onset=has(/突然开始|(?:发麻|麻木)(?:是)?突然(?:出现|发生|开始)|(?:手脚|手|脚|胳膊|腿)(?:是)?突然(?:有点|有一点)?(?:发麻|麻木|麻)|突然(?:一侧|单侧|左侧|右侧)(?:发麻|麻木)|突然(?:一侧|左侧|右侧|左|右)?(?:手脚|手|脚|胳膊|腿)(?:有点|有一点)?(?:发麻|麻木|麻)/)?'sudden':has(/逐渐(?:开始|出现)|慢慢(?:出现|开始)|(?:发麻|麻木).{0,5}逐渐/)?'gradual':has(/(?:发麻|麻木).{0,10}(?:(?:说不清|不确定|不知道)开始时间|开始时间(?:说不清|不确定|不知道))/)?'unknown':null;
  const distribution=has(/(?:一侧|单侧|左侧|右侧|左半身|右半身)(?:的)?(?:手脚|手|脚|胳膊|腿|身体|肢体)?(?:突然)?(?:有点|有一点)?(?:发麻|麻木|麻)|(?:左|右)(?:手|脚|胳膊|腿)(?:突然)?(?:有点|有一点)?(?:发麻|麻木|麻)|(?:发麻|麻木)(?:只)?(?:在|发生在)(?:一侧|单侧|左侧|右侧)/)?'one_sided':has(/(?:两侧|双侧|两边)(?:的)?(?:手脚|手|脚|身体)?(?:都|有点|有一点)?(?:发麻|麻木|麻)|(?:双手|双脚|两只手|两只脚)(?:都|有点|有一点)?(?:发麻|麻木|麻)/)?'both':has(/(?:发麻|麻木).{0,8}(?:分不清|不确定|说不清)(?:哪一侧|哪侧|部位)/)?'unknown':null;
  const associatedDenied=has(/(?:没有|未见)(?:其他)?(?:一侧)?无力/)&&has(/(?:说话|讲话|言语)(?:都|也)?正常/)&&has(/(?:面部|脸)(?:都|也)?正常/);
  return {onset,distribution,associatedDenied};
}
function chineseNumber(value){
  if(/^\d+(?:\.\d+)?$/.test(value))return Number(value);
  if(value==='半')return .5;
  const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};let total=0,current=0;
  for(const ch of value){if(Object.hasOwn(digits,ch))current=digits[ch];else if(ch==='十'||ch==='百'){total+=(current||1)*(ch==='十'?10:100);current=0;}else return null;}return total+current;
}
function complaintDurations(text){
  const durations=[];
  for(const m of currentMatches(text,/(?:持续(?:了)?|已经(?:有|过)?|(?:有|快)(?:了)?)(半|[零〇一二两三四五六七八九十百\d.]+)(?:来|多)?(?:个)?(小时|分钟|秒钟|秒)/)){
    const prefix=text.slice(Math.max(0,m.index-80),m.index);
    const mentions=patterns.flatMap(([key,re])=>currentMatches(prefix,re).map(hit=>({key,index:hit.index,end:hit.index+hit[0].length}))).sort((a,b)=>b.index-a.index);
    const nearest=mentions[0];if(!nearest)continue;
    // Duration belongs to the most recent complaint, never to a wait, meal or sleep.
    const between=prefix.slice(nearest.end);if(between.length>24||/等饭|等车|等待|睡了|睡眠|吃饭|工作|排队|运动|走了/.test(between))continue;
    const amount=chineseNumber(m[1]);if(amount===null)continue;
    durations.push({symptom:nearest.key,minutes:amount*(m[2]==='小时'?60:m[2].startsWith('秒')?1/60:1)});
  }
  return durations;
}
function symptomCourse(text) {
  const has=re=>currentMatches(text,re).length>0;
  const isolatedDenial=currentMatches(text,/(?:没有|没|并无)(?:其他|其它|别的)(?:的)?(?:不舒服|不适|症状)/).some(m=>!/(?:不是|并非|不能说|不确定|不知道|说不准|难说|可能|应该|好像|大概|也许|似乎).{0,4}$/.test(text.slice(0,m.index).split(/[。！？!?；;\n，,]/).at(-1)||''));
  return {
    mild:has(/轻微|轻度|很轻|有(?:一)?点(?:心慌|胸闷|头晕|发麻|麻)|头(?:有(?:一)?点(?:点|儿)?|有些|稍微)晕/),
    severity:has(/严重|剧烈|重度|十分难受|特别厉害/)?'severe':has(/中等|中度|程度一般|有些明显|明显(?:乏力|疲乏|心慌|胸闷|发麻|头晕)/)?'moderate':has(/轻微|轻度|很轻|有(?:一)?点(?:心慌|胸闷|头晕|发麻|麻)|头(?:有(?:一)?点(?:点|儿)?|稍微)晕/)?'mild':'unknown',
    mildDizziness:has(/(?:有(?:一)?点(?:点|儿)?|轻微|轻度)(?:的)?(?:头晕|眩晕|晕乎)|头(?:有(?:一)?点(?:点|儿)?|稍微)晕|(?:头晕|眩晕|晕乎)(?:程度)?(?:很轻|轻微|轻度)/),
    otherDiscomfortDenied:isolatedDenial,
    brief:has(/短暂|只(?:有|持续)?几秒|一小会|只持续不到一分钟/),
    improving:has(/正在缓解|已经缓解|逐渐缓解|明显缓解|正在减轻|有所减轻|后减轻|比刚才轻/),
    worsening:has(/加重|越来越(?:重|厉害)|正在恶化/),
    stable:has(/没有加重|没加重|差不多|和刚才一样|没有变化/),
    persistent:has(/(?:持续|一直)(?:不|没有|未|没)(?:缓解|消退|好转)|一直心慌|仍(?:然)?(?:未|没有|没)(?:缓解|消退|好转)|还(?:没有|未|没)(?:缓解|消退|好转)|未缓解|还在持续|一直没停|一直没好|(?:持续|逐渐|正在)加重|越来越(?:重|厉害)|正在恶化/),
    durations:complaintDurations(text),
    recurrent:has(/反复(?:心慌|胸闷|头晕|发麻|出现|发作)|(?:心慌|胸闷|头晕|发麻).{0,5}反复|又出现(?:心慌|胸闷|头晕|发麻)/),
    redFlagsDenied:/(?:没有|否认)[^。；]{0,16}胸痛[^。；]{0,20}(?:气短|呼吸困难)[^。；]{0,20}冷汗[^。；]{0,20}(?:晕厥|晕倒|近晕厥)/u.test(text),
    neurologicalDenied:numbnessDetails(text).associatedDenied
  };
}
function eachComplaintHasGentleCourse(text,symptoms) {
  const complaints=symptoms.filter(s=>['palpitations','chest_tightness','dizzy'].includes(s));
  if(complaints.length<2)return true;
  // A later description of one complaint must not describe another by accident.
  // A complete follow-up naming all complaints may update their shared course.
  const cleaned=documentQuotes(String(text||''));
  const boundaries=[...cleaned.matchAll(/[。；;\n]|但是|但|此外|另外|不过/gu)].map(m=>({start:m.index,end:m.index+m[0].length}));
  return complaints.every(symptom=>{
    const pattern=patterns.find(([key])=>key===symptom)[1];
    const mention=currentMatches(cleaned,pattern).at(-1);
    if(!mention)return false;
    const start=boundaries.filter(b=>b.end<=mention.index).at(-1)?.end||0;
    const end=boundaries.find(b=>b.start>mention.index)?.start??cleaned.length;
    const course=symptomCourse(cleaned.slice(start,end));
    return course.mild&&course.brief&&course.improving&&!course.persistent;
  });
}
export function analyzeText(value = '') {
  // Long continuation threads must never discard the newly reported symptom.
  const original=String(value??'').slice(-12000),text=documentQuotes(original);
  const symptoms=[...new Set(patterns.filter(([,pattern])=>currentMatches(text,pattern).length).map(([key])=>key))];
  // Associate a current loss of balance across clauses with current dizziness,
  // but do not combine another person's observation into the user's symptoms.
  const ownMention=m=>!/(?:爸爸|妈妈|父亲|母亲|朋友|家人|爷爷|奶奶|别人|他|她)[^我]{0,14}$/.test(text.slice(0,m.index).split(/[。！？!?；;\n，,]/).at(-1)||'');
  if(symptoms.includes('dizzy')&&currentMatches(text,patterns.find(([key])=>key==='dizzy')[1]).some(ownMention)&&currentMatches(text,/站不稳|走不稳|无法站立|无法行走/).some(ownMention)&&!symptoms.includes('severe_dizziness'))symptoms.push('severe_dizziness');
  const numbness=symptoms.includes('numbness')?numbnessDetails(text):null;
  const course=symptomCourse(text);
  if(numbness?.onset==='sudden'&&numbness.distribution==='one_sided'&&!symptoms.includes('stroke_sign'))symptoms.push('stroke_sign');
  const emotions=[['angry',/生完气|生气|愤怒|恼火|心烦|烦躁|吵完架|吵架|气死我了/],['anxious',/焦虑|紧张|担心|害怕/],['sad',/难过|伤心|低落|心情不好|不开心/],['suppressed_emotion',/情绪(?:憋着|压着|压抑|憋闷)|(?:憋着|压着)(?:情绪|不说)|有话(?:憋着|不想说)|心里(?:憋屈|委屈|压抑)|闷闷不乐/]].flatMap(([name,re])=>currentMatches(text,re).map(m=>({name,index:m.index})));
  const emotion=emotions.sort((a,b)=>b.index-a.index)[0]?.name||null;
  const context=[];
  const dailyNeeds=[['hunger',/(?:有点|有一点|肚子)?饿(?:了|得|着)?|想吃(?:点|一点|些)?东西/],['hydration',/想喝(?:点|一点|些)?水/],['rest',/想(?:安静|静静|自己)(?:地)?(?:待|呆|休息)|想休息|想睡(?:觉|一会)|困了/],['homesick',/想家(?:了)?|想念(?:家人|爸爸|妈妈|父母)|感到孤独|(?:有点|觉得|很)孤单/],['family',/想(?:联系|给).{0,8}(?:家人|父母|朋友)|给家人打电话/],['journal',/写(?:三行|几句|点)?日记/],['drawing',/画(?:个|一幅|点)?(?:简笔画|画)/],['photo',/拍(?:一张|张)?照/],['plants',/给植物浇水|照顾植物/],['tea',/泡(?:一杯|杯)?茶|想喝茶/]];
  for(const [key,re] of dailyNeeds)if(currentMatches(text,re).length)context.push(key);
  if(currentMatches(text,/不(?:想|愿)(?:再)?(?:说话|聊天|联系|打电话)|想(?:自己|一个人)(?:待|呆)|不想联系家人/).length)context.push('private_rest');
  for(const [name,re] of [['after_meal',/刚(?:刚)?吃完(?:饭|午饭|晚饭|早饭)|刚吃饱|餐后|饭后/],['eating',/正在吃(?:饭|东西|午饭|晚饭)|吃饭呢|正在用餐/],['before_meal',/准备吃(?:饭|午饭|晚饭)|还没吃饭|饭前/],['sedentary',/久坐|坐了很久/],['eye',/眼睛(?:酸|累)|看屏(?:太久|累)|想休息眼睛/],['bedtime',/准备睡觉|睡前/],['awake',/还没睡|还醒着|仍然清醒|我醒着|刚睡醒|刚起床/],['road_attention',/正在开车|我在开车|正在骑车|我在骑车|正在过马路/]])if(currentMatches(text,re).length)context.push(name);
  if(currentMatches(text,/天气(?:太|很|有点)?冷|(?:室内|屋里|房间|外面)(?:太|很|有点)?冷|天(?:太|很)冷|冷飕飕/).length)context.push('cold_weather');
  if(currentMatches(text,/晨起|刚(?:刚)?起床|刚(?:刚)?醒来|准备起床|刚睡醒/).length)context.push('morning_rise');
  if(currentMatches(text,/(?:手|胳膊|腿|身体).{0,6}压在|压在身下|压着(?:双手|手|胳膊|腿)|腿(?:长时间)?交叉|盘腿.{0,6}麻|压麻了/).some(m=>{const clause=text.slice(0,m.index).split(/[。！？!?；;\n，,]/).at(-1)||'';const tail=text.slice(m.index).split(/[。！？!?；;\n]/)[0];return !/刚才|之前|以前/.test(clause)&&!/换开|拿开|已经(?:松开|解除)|不再压/.test(tail);} ))context.push('posture_pressure');
  if(context.includes('posture_pressure')){
    const released=currentMatches(text,/已经(?:松开|解除|拿开)|换开(?:了)?姿势|不再压着/).at(-1)?.index??-1;
    const pressed=currentMatches(text,/压在身下|压着(?:双手|手|胳膊|腿)|(?:手|胳膊|腿|身体).{0,6}压在/).at(-1)?.index??-1;
    if(released>pressed)context.splice(context.indexOf('posture_pressure'),1);
  }
  if(symptoms.includes('numbness')&&currentMatches(text,/(?:双手|两只手|手指|手脚|左手|右手|手)(?:突然)?(?:有点|有一点|都)?(?:发麻|麻木|麻)/).length)context.push('hand_numbness');
  if(currentMatches(text,/(?:(?:听|播放|放)(?:一点|点|一会儿|一些|一段|段)?)?(?:轻音乐|舒缓音乐|五音|[宫商角徵征羽](?:音|调))|(?:听|播放|放)(?:一点|点|一会儿|一些|一段|段)?音乐/).length)context.push('music');
  const musicModes=[['gong',/宫(?:音|调)/],['shang',/商(?:音|调)/],['jue',/角(?:音|调)/],['zhi',/[徵征](?:音|调)/],['yu',/羽(?:音|调)/]].filter(([,re])=>currentMatches(text,new RegExp(`(?:(?:听|播放|放)(?:一点|点|一会儿|一些|一段|段)?)?(?:${re.source})`,'u')).length).map(([mode])=>mode);
  const severe=symptoms.some(s=>['self_harm','chest_pain','chest_pressure','severe_breathlessness','severe_dizziness','syncope','near_syncope','stroke_sign','severe_headache','cold_sweat','heavy_bleeding','confusion'].includes(s));
  const bleedingWithInstability=symptoms.some(s=>['black_stool','bloody_stool'].includes(s))&&symptoms.some(s=>['dizzy','palpitations','near_syncope','syncope'].includes(s));
  const combination=symptoms.includes('palpitations')&&symptoms.some(s=>['breathlessness','chest_tightness','dizzy'].includes(s))||symptoms.includes('breathlessness')&&symptoms.includes('chest_tightness');
  // Five minutes is a conservative workflow boundary for an ongoing cardiac
  // complaint lasting several minutes, not a diagnostic or validated score.
  const persistentPalpitations=symptoms.some(s=>['palpitations','chest_tightness'].includes(s))&&(course.persistent||course.durations.some(d=>['palpitations','chest_tightness'].includes(d.symptom)&&d.minutes>=5));
  const generic=currentMatches(text,/不舒服|难受|不适|感觉不好/).length>0;
  const explicitlyWell=currentMatches(text,/没(?:有)?(?:什么)?(?:不舒服|不适)|状态(?:还)?好|我很好|感觉(?:挺|很|还)?好|没事|一切正常/).length>0;
  const ambiguous=!symptoms.length&&!emotion&&!context.length&&!!original.trim()&&!explicitlyWell;
  const unclearBody=currentMatches(text,/胸(?:口|部).{0,10}(?:怪怪|说不清|说不上来)|(?:身体|感觉)(?:有点|很)?怪怪/).length>0;
  return {emergency:severe||bleedingWithInstability||combination||persistentPalpitations,symptoms,emotion,context,musicModes,numbness,course,ambiguous:unclearBody||ambiguous||generic&&!symptoms.length&&!emotion&&!explicitlyWell,reason:severe||bleedingWithInstability?'current_red_flag':combination||persistentPalpitations?'concerning_palpitations':symptoms.length?'current_symptoms':emotion?'current_emotion':context.length?'current_context':explicitlyWell?'feels_well':original.trim()?'needs_detail':'no_text'};
}
function localClock(now,timeZone='Asia/Shanghai') {
  const ms=timestamp(now);if(!Number.isFinite(ms))throw new TypeError('需要有效的当前时间');
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',year:'numeric',month:'2-digit',day:'2-digit',hourCycle:'h23'}).formatToParts(ms).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const hour=Number(p.hour);
  return {ms,hour,slot:hour===0?23:hour%2?hour:hour-1,day:`${p.year}-${p.month}-${p.day}`,night:hour>=23||hour<5};
}
const conditionAliases={高血压:'hypertension',冠心病:'coronary',冠状动脉疾病:'coronary',冠状动脉粥样硬化性心脏病:'coronary',糖尿病:'diabetes',肥胖:'obesity',心衰:'heart_failure',心力衰竭:'heart_failure',限水:'fluid_restriction',糖尿病足:'diabetic_foot',皮肤破损:'skin_injury',食物过敏:'food_allergy',行动不便:'mobility_limited'};
function conditions(profile){
  const result=new Set((Array.isArray(profile?.conditions)?profile.conditions:[]).filter(x=>typeof x==='string').map(c=>conditionAliases[c]||c));
  if(profile?.fluidRestricted===true)result.add('fluid_restriction');
  if(profile?.limitedMobility===true)result.add('mobility_limited');
  if(typeof profile?.allergies==='string'&&profile.allergies.trim()||Array.isArray(profile?.allergies)&&profile.allergies.length)result.add('food_allergy');
  return result;
}
function vitalsEvidence(vitals,clock) {
  if(!vitals||!['simulation','device'].includes(vitals.source))return {usable:false,evidence:[{kind:'data-quality',reason:'vitals_unavailable',label:'未获得可用设备数据，不能据此判断状态正常'}],signals:[]};
  const at=timestamp(vitals.measuredAt),age=clock.ms-at;
  if(vitals.quality!=='good'||!Number.isFinite(at)||age<0||age>DEMO_THRESHOLDS.freshMinutes*60000)return {usable:false,evidence:[{kind:'data-quality',source:vitals.source,reason:'vitals_stale_or_poor',label:'数据时间或质量不足，本次不据此判断身体状态'}],signals:[]};
  const hasMeasurement=finite(vitals.heartRate)&&vitals.heartRate>0&&vitals.heartRate<=300||finite(vitals.hrv)&&vitals.hrv>=0||finite(vitals.stress)&&vitals.stress>=0&&vitals.stress<=100||finite(vitals.sleepHours)&&vitals.sleepHours>=0&&vitals.sleepHours<=24||finite(vitals.steps)&&vitals.steps>=0||typeof vitals.asleep==='boolean';
  if(!hasMeasurement)return {usable:false,evidence:[{kind:'data-quality',source:vitals.source,reason:'vitals_missing_measurements',label:'来源标记不等于已经读到数据，本次未提供可用观测值'}],signals:[]};
  const signals=[];
  const add=(key,value)=>signals.push({key,value});
  if(finite(vitals.heartRate)&&vitals.heartRate>0&&vitals.heartRate<=300) {
    if(vitals.heartRate>=120||vitals.heartRate<=45)add('heart_rate',vitals.heartRate);
    else if(finite(vitals.baselineHeartRate)&&vitals.baselineHeartRate>0&&vitals.heartRate-vitals.baselineHeartRate>=25)add('heart_rate_change',vitals.heartRate);
  }
  if(finite(vitals.hrv)&&vitals.hrv>=0&&finite(vitals.baselineHrv)&&vitals.baselineHrv>0&&vitals.hrv<=vitals.baselineHrv*0.7)add('hrv_change',vitals.hrv);
  if(finite(vitals.stress)&&vitals.stress>=80&&vitals.stress<=100)add('stress',vitals.stress);
  if(finite(vitals.sleepHours)&&vitals.sleepHours>=0&&vitals.sleepHours<6)add('short_sleep',vitals.sleepHours);
  const persistence=finite(vitals.durationMinutes)&&vitals.durationMinutes>=0?vitals.durationMinutes:null;
  const severe=signals.some(s=>s.key==='heart_rate')&&(vitals.heartRate>=140||vitals.heartRate<=40);
  const label=vitals.source==='simulation'?'模拟数据，仅演示判断流程':'设备汇总，不能替代症状判断';
  return {usable:true,signals,severe,persistence,evidence:[{kind:'vitals',source:vitals.source,observedAt:vitals.measuredAt,signals,persistenceMinutes:persistence,label,limitation:'阈值为未验证的演示规则，不是临床诊断阈值；未由步数推断静息状态'}]};
}
function bpEvidence(bp,clock) {
  if(!bp)return null;
  const at=timestamp(bp.measuredAt);
  if(!finite(bp.systolic)||!finite(bp.diastolic)||bp.systolic<=0||bp.diastolic<=0||bp.systolic<=bp.diastolic||!Number.isFinite(at)||clock.ms-at<0)return {usable:false,evidence:{kind:'blood-pressure',reason:'bp_unverified',label:'血压读数或时间需核对，不能据此保证安全'}};
  if(clock.ms-at>10*60000)return {usable:false,historical:true,evidence:{kind:'blood-pressure',source:'self-entered',reason:'historical_bp',observedAt:bp.measuredAt,systolic:bp.systolic,diastolic:bp.diastolic,label:'历史血压留作记录，不当作当前测量，也不妨碍当前情境判断'}};
  return {usable:true,high:bp.systolic>=180||bp.diastolic>=120,evidence:{kind:'blood-pressure',source:'self-entered',systolic:bp.systolic,diastolic:bp.diastolic,observedAt:bp.measuredAt,url:DECISION_SOURCES.bloodPressure,label:'用户录入血压；180/120边界在演示中保守触发核对'}};
}
function observedSummary(v,device) {
  const baseline=finite(v.baselineHeartRate)&&v.baselineHeartRate>0?`（所提供的个人基线为${v.baselineHeartRate}次/分）`:'';
  const labels={heart_rate:`心率为${v.heartRate}次/分${baseline}`,heart_rate_change:`心率为${v.heartRate}次/分，比所提供的个人基线高${v.heartRate-v.baselineHeartRate}次/分`,hrv_change:'HRV低于所提供的个人基线',stress:`设备压力值为${v.stress}/100`,short_sleep:`记录的睡眠时长为${v.sleepHours}小时`};
  const hasCurrentSignal=device.signals.some(s=>s.key!=='short_sleep');
  const prefix=`${hasCurrentSignal&&device.persistence!==null&&device.persistence>0?`近${device.persistence}分钟的`:''}${v.source==='simulation'?'模拟记录':'设备记录'}`;
  return `${prefix}显示${device.signals.slice(0,2).map(s=>labels[s.key]).join('、')}`;
}
function quietAfterNegativeCheck(input,clock) {
  if(input.confirmation!=='no')return false;
  const device=vitalsEvidence(input.vitals,clock);
  return device.usable&&device.signals.length>0;
}
function chooseCard(input,cards,analysis,clock,triggers,supportSymptoms=null) {
  const profile=input.profile||{},known=conditions(profile),symptoms=new Set(analysis.symptoms);
  const constitutionSet=new Set((Array.isArray(profile.constitution)?profile.constitution:typeof profile.constitution==='string'?[profile.constitution]:[]).filter(c=>typeof c==='string'&&c!=='all'));
  if([...symptoms].some(s=>acute.has(s)))known.add('acute_symptoms');
  for(const symptom of symptoms)known.add(symptom);
  if(symptoms.has('dizzy'))known.add('dizziness');
  if(symptoms.has('chest_pain')||symptoms.has('chest_tightness'))known.add('chest_discomfort');
  const recent=Array.isArray(input.recentCards)?input.recentCards:[];
  const id=r=>typeof r==='string'?r:r?.id;
  // Undated legacy records and future timestamps cannot establish elapsed time.
  const cooledDown=card=>!recent.some(r=>id(r)===card.id&&(!Number.isFinite(timestamp(r?.shownAt))||clock.ms-timestamp(r.shownAt)<(card.frequency==='weekly'?7:1)*86400000));
  const history=[...recent].sort((a,b)=>(timestamp(a?.shownAt)||0)-(timestamp(b?.shownAt)||0));
  const latest=history.at(-1),lastCard=cards.find(c=>c.id===id(latest));
  const families=new Set(history.slice(-2).filter(r=>!Number.isFinite(timestamp(r?.shownAt))||clock.ms-timestamp(r.shownAt)<86400000).map(r=>r?.actionFamily||cards.find(c=>c.id===id(r))?.actionFamily).filter(Boolean));
  const lastSlot=latest?.slot??(Number.isFinite(timestamp(latest?.shownAt))?localClock(latest.shownAt,input.timeZone||'Asia/Shanghai').slot:null);
  const sameCategory=input.selectionMode==='same_category',current=cards.find(c=>c.id===input.currentCardId);
  const musicRequested=triggers.includes('music');
  const quietOnly=quietAfterNegativeCheck(input,clock)||analysis.context.some(c=>['rest','private_rest'].includes(c))||analysis.symptoms.includes('fatigue')&&analysis.symptoms.every(s=>['fatigue','poor_sleep'].includes(s));
  if(sameCategory&&!current)return null;
  const selfReportedCold=analysis.context.includes('cold_weather');
  const cold=selfReportedCold||finite(input.weather?.temperature)&&input.weather.temperature<=5||finite(input.weather?.minTemperature)&&input.weather.minTemperature<=5||finite(input.weather?.drop24h)&&input.weather.drop24h>=5;const hot=!selfReportedCold&&finite(input.weather?.temperature)&&input.weather.temperature>=30;const term=solarTerm(input.now);const meal=triggers.some(t=>['baseline','before_meal'].includes(t))&&[7,11,17].includes(clock.slot);
  let pool=cards.filter(card=>{
    const reviewed=card?.reviewedSupport;
    const supportEligible=Array.isArray(supportSymptoms)&&reviewed?.kind==='passive_rest'&&reviewed.duringAssessment===true&&Array.isArray(reviewed.symptomKeys)&&supportSymptoms.every(s=>reviewed.symptomKeys.includes(s))&&Array.isArray(reviewed.requiredContexts)&&reviewed.requiredContexts.every(c=>analysis.context.includes(c));
    if(!card||card.enabled===false||!Array.isArray(card.steps)||!card.steps.length||!Array.isArray(card.slots)||!card.slots.includes(clock.slot)||!Array.isArray(card.triggers)||!(supportEligible||card.triggers.some(t=>triggers.includes(t)))||!cooledDown(card))return false;
    if(supportSymptoms&&(!supportEligible||card.requiresGettingUp!==false||card.indoor!==true||card.audio))return false;
    if(sameCategory&&(card.category!==current.category||card.id===current.id))return false;
    if(quietOnly&&!quietAfterCheckFamilies.has(card.actionFamily))return false;
    if(analysis.context.includes('hunger')&&!card.triggers.includes('hungry'))return false;
    if(analysis.context.includes('hydration')&&!card.triggers.includes('dry_mouth'))return false;
    if(analysis.context.includes('private_rest')&&/家人|家庭|社交/.test(card.category))return false;
    if(musicRequested&&(!card.triggers.includes('music')||!card.audio?.mode))return false;
    if(musicRequested&&analysis.musicModes.length&&!analysis.musicModes.includes(card.audio.mode))return false;
    if(card.weatherCondition==='hot'&&!hot||card.weatherCondition==='cold'&&!cold)return false;
    if(card.solarTerms!==undefined&&(!Array.isArray(card.solarTerms)||card.solarTerms.length>0&&!card.solarTerms.includes(term.name)))return false;
    if(!Array.isArray(card.constitutions)||!card.constitutions.some(c=>c==='all'||constitutionSet.has(c)))return false;
    const reviewedExceptions=supportEligible?new Set(['acute_symptoms',...supportSymptoms,...(supportSymptoms.includes('dizzy')?['dizziness']:[]),...(supportSymptoms.includes('chest_tightness')?['chest_discomfort']:[])]):new Set();
    if(!Array.isArray(card.contraindications)||card.contraindications.some(c=>known.has(c)&&!reviewedExceptions.has(c)))return false;
    if(card.requiredContexts!==undefined&&(!Array.isArray(card.requiredContexts)||!card.requiredContexts.every(c=>analysis.context.includes(c))))return false;
    if(Array.isArray(card.incompatibilities)&&card.incompatibilities.some(c=>known.has(c)||analysis.context.includes(c)||c===analysis.emotion))return false;
    if(known.has('food_allergy')&&/食养|饮食|药膳|食物|food|tea/i.test(`${card.category} ${card.actionFamily}`))return false;
    if(analysis.context.includes('eating')&&!card.triggers.includes('eating'))return false;
    if(cold&&card.indoor!==true)return false;
    if(clock.night&&(!card.nightSafe||card.audio||/运动|舒展|拉伸|功法|八段锦|食物|饮食|食养|锻炼|散步|exercise|stretch|food|qigong|walk/i.test(`${card.category} ${card.actionFamily}`)))return false;
    return true;
  });
  if(!pool.length)return null;
  if(sameCategory) {
    pool.sort((a,b)=>a.id.localeCompare(b.id));
    return pool.find(c=>c.id.localeCompare(current.id)>0)||pool[0];
  }
  // Specific multi-symptom coverage beats aesthetic/seasonal preferences.
  const coverage=card=>triggers.filter(t=>card.triggers.includes(t)).length;
  const mostMatched=Math.max(...pool.map(coverage));pool=pool.filter(card=>coverage(card)===mostMatched);
  const nextCategory=lastSlot!==null&&lastSlot!==clock.slot?(latest?.category||lastCard?.category):null;
  const variedCategory=nextCategory?pool.filter(card=>card.category!==nextCategory):[];
  if(variedCategory.length)pool=variedCategory;
  const variedFamily=pool.filter(card=>!families.has(card.actionFamily));
  if(variedFamily.length)pool=variedFamily;
  const score=card=>(analysis.context.includes('morning_rise')&&gentlestFamilies.has(card.actionFamily)?8:0)+(meal&&card.category==='日常食养'?5:0)+(card.preferredSeasons?.includes(term.season)?1:0)+(card.preferredSolarTerms?.includes(term.name)?2:0)+(hot&&card.weatherCondition==='hot'?10:0)+(cold&&(card.coldWeatherPreferred===true||card.actionFamily==='bed_blanket_edge'||/保暖|加衣|避开直吹|避直吹|挡风/.test(`${card.title} ${card.why}`))?10:0)+(Array.isArray(card.preferredConstitutions)&&card.preferredConstitutions.some(c=>constitutionSet.has(c))?3:0);
  const best=Math.max(...pool.map(score));
  if(best>0)pool=pool.filter(card=>score(card)===best);
  pool.sort((a,b)=>a.id.localeCompare(b.id));
  const sequence=Number.isSafeInteger(input.sequence)&&input.sequence>=0?input.sequence:0;
  return pool[sequence%pool.length];
}
function methodBurden(card) {
  if(gentlestFamilies.has(card.actionFamily))return 0;
  if(quietAfterCheckFamilies.has(card.actionFamily))return 1;
  return /穴位|八段锦|舒展|食养|四季|起居|家人|健康|急救预演|五音|生活|情绪调适/.test(card.category||'')?2:null;
}
function alternativeMethod(input,cards,analysis,clock,triggers,supportSymptoms=null) {
  const current=cards.find(c=>c.id===input.currentCardId);
  if(!current)return {card:null,lowerBurden:false};
  const same=chooseCard({...input,selectionMode:'same_category'},cards,analysis,clock,triggers,supportSymptoms);
  if(same)return {card:same,lowerBurden:false};
  const burden=methodBurden(current);
  if(burden===null||burden<=0)return {card:null,lowerBurden:false};
  const quieter=cards.filter(c=>c.id!==current.id&&gentlestFamilies.has(c.actionFamily)&&methodBurden(c)<burden&&!c.audio);
  const fallbackTriggers=triggers.filter(t=>t!=='music');
  if(!fallbackTriggers.length)fallbackTriggers.push('baseline');
  const fallback=chooseCard({...input,selectionMode:undefined,sequence:0,currentCardId:undefined},quieter,analysis,clock,fallbackTriggers,supportSymptoms);
  return {card:fallback,lowerBurden:!!fallback};
}
function matchingExplanation(input,card,analysis,clock) {
  const names={23:'子',1:'丑',3:'寅',5:'卯',7:'辰',9:'巳',11:'午',13:'未',15:'申',17:'酉',19:'戌',21:'亥'};
  const hour=value=>`${String(value).padStart(2,'0')}:00`;
  const reasons=[`${names[clock.slot]}时（${hour(clock.slot)}–${hour((clock.slot+2)%24)}）。${card.reason||card.why||'安排一件适合当前条件的小事。'}`];
  const provenance=['当前时辰'];
  if(String(input.text||'').trim())provenance.push(input.feedbackSource==='voice'?'您的语音反馈':'您的手动反馈');
  if(vitalsEvidence(input.vitals,clock).usable&&input.vitals?.source==='device')provenance.push('手表数据');
  reasons.unshift(`基于：${provenance.join(' + ')}。`);
  const emotions={angry:'心里烦躁',anxious:'有些紧张',sad:'情绪低落',suppressed_emotion:'情绪有些压抑'};
  if(analysis.emotion)reasons.unshift(analysis.context.includes('eating')?`你提到正在进餐，也有${emotions[analysis.emotion]}的感受；先照顾好这一餐。`:`你刚提到${emotions[analysis.emotion]}，先留一点空间照顾当前感受。`);
  if(input.confirmation==='no')reasons.unshift(quietAfterNegativeCheck(input,clock)?'已记录你暂时没有不适，先安排低负担的安静休息；数据变化的原因仍需核对。':'已记录你暂时没有不适。');
  const constitution=Array.isArray(input.profile?.constitution)?input.profile.constitution:typeof input.profile?.constitution==='string'?[input.profile.constitution]:[];
  if(Array.isArray(card.preferredConstitutions)&&card.preferredConstitutions.some(c=>c!=='all'&&constitution.includes(c))&&typeof card.preferenceReason==='string'&&card.preferenceReason.trim())reasons.push(`结合你记录的体质倾向：${card.preferenceReason}`);
  const term=solarTerm(input.now);if(card.solarTerms?.includes(term.name)||card.preferredSeasons?.includes(term.season)||card.preferredSolarTerms?.includes(term.name))reasons.push(`现在是${term.name}，采用${term.season}季生活安排；具体仍按当地供应和体感调整。`);if([7,11,17].includes(clock.slot)&&card.category==='日常食养')reasons.push('当前接近常见用餐时间，先安排一件备餐小事。');
  const weather=[];
  if(analysis.context.includes('cold_weather'))reasons.push('你说天气太冷，本次按自述的冷环境优先安排室内、舒适的方式；这不是实测温度。');
  if(analysis.context.includes('morning_rise'))reasons.push('你刚提到醒来或准备起床，先从舒适的小事开始，不急着起身。');
  if(finite(input.weather?.temperature)&&input.weather.temperature<=5)weather.push(`已提供的当前气温为${input.weather.temperature}°C`);
  if(finite(input.weather?.minTemperature)&&input.weather.minTemperature<=5)weather.push(`今日预报最低气温${input.weather.minTemperature}°C`);
  if(finite(input.weather?.drop24h)&&input.weather.drop24h>=5)weather.push(`近24小时降温${input.weather.drop24h}°C`);
  if(weather.length)reasons.push(`${weather.join('，')}，这次选择在室内完成的行动。`);
  return reasons.join(' ');
}
function clarificationFor(text) {
  const value=String(text||'');
  if(/胸(?:口|部)/.test(value))return {question:'请说说胸口具体是什么感觉、何时开始，是否还伴有其他变化？',options:['胸口发闷','胸痛','其他感觉，我来描述']};
  if(/肚子|排便|大便|肠|胃/.test(value))return {question:'请说说肚子或排便具体有什么变化，从什么时候开始？也可以直接描述其他感受。',options:['大便变稀','吃不下饭','疼痛或其他变化']};
  if(/嘴|口腔|口里|喉咙|嗓子/.test(value))return {question:'请用自己的话说说口中或喉咙的具体感觉，持续多久了？',options:['口干','口苦','疼痛或其他感觉']};
  if(/心情|情绪|心里/.test(value))return {question:'你愿意说说此刻的情绪或刚发生的事吗？不用从固定选项中挑选。',options:['情绪憋着不说','有些紧张','其他感受']};
  return {question:'请用自己的话说说此刻最明显的感受、发生的事情或想做什么。',options:[]};
}
function currentSymptomAssessment(input,analysis,device,known,clock,cards) {
  const symptoms=analysis.symptoms.filter(s=>['palpitations','chest_tightness','dizzy','numbness'].includes(s));
  if(!symptoms.length)return null;
  const cardiac=symptoms.some(s=>['palpitations','chest_tightness'].includes(s)),dizzy=symptoms.includes('dizzy'),numb=symptoms.includes('numbness');
  const topic=cardiac?'cardiac':dizzy?'dizziness':'numbness';
  const labels=symptoms.map(s=>({palpitations:'心慌',chest_tightness:'胸闷',dizzy:'头晕',numbness:'发麻'}[s])).join('、');
  const c=analysis.course,severity=c.severity||'unknown';
  const course=c.worsening?'worsening':c.persistent?'persistent':c.recurrent?'recurrent':c.improving?'improving':c.stable?'stable':c.brief?'brief':'unknown';
  const context={kind:'symptom',topic,text:String(input.text||'').slice(-4000)};
  const source=cardiac?DECISION_SOURCES.palpitations:dizzy?DECISION_SOURCES.dizziness:DECISION_SOURCES.numbness;
  const attempts=Math.max(0,Math.min(2,Number.isInteger(input.clarificationAttempts)?input.clarificationAttempts:0));
  const careSteps=['留在有支撑的坐姿、靠姿或躺姿，不突然起身或做用力动作。','呼吸按自己的节奏，不刻意吸深、加快或屏气；任何新的明显不适都可立即反馈。'];
  const shared={severity,course,supportiveSymptoms:symptoms,clarificationContext:context,source,careSteps,questionPurpose:'symptom',clarificationAttempts:attempts};
  const prolonged=currentMatches(input.text,/一直|反复|多次|(?:持续|已经|有|快)(?:了)?(?:半|一|两|二|三|四|五|六|七|八|九|十|\d+)(?:个)?小时|(?:已经|持续了?)(?:半天|一天|几天)/).length>0;
  if(device.severe||severity==='severe'||c.worsening||c.persistent||c.recurrent||prolonged||cardiac&&(known.has('heart_failure')||known.has('coronary')))return {...shared,level:'symptom',reason:'symptoms_medical_review',message:`你提到${labels}，目前的程度、过程或既往病史需要进一步评估。先停止活动、原位休息，并及时联系医疗人员；若出现胸痛、明显气短、快晕倒或新的单侧无力、说话异常，立即求助，不等待卡片计时。`,card:null,medicalReviewRecommended:true};
  const companionDenied=c.otherDiscomfortDenied||c.redFlagsDenied;
  const neuroDenied=c.otherDiscomfortDenied||c.neurologicalDenied;
  const numbDetail=analysis.numbness||{};
  const numbKnown=numbDetail.distribution==='both'&&(numbDetail.onset==='gradual'||c.brief||c.improving||analysis.context.includes('posture_pressure'))&&(neuroDenied||numbDetail.associatedDenied);
  const cardiacKnown=!cardiac||severity==='mild'&&companionDenied&&(c.brief||c.improving||c.stable);
  const dizzyKnown=!dizzy||severity==='mild'&&(c.otherDiscomfortDenied||c.redFlagsDenied&&c.neurologicalDenied);
  const needsDetail=severity==='unknown'||!cardiacKnown||!dizzyKnown||numb&&!numbKnown;
  let question='';
  if(needsDetail&&attempts<1){
    if(numb&&!numbKnown)question=!numbDetail.onset||!numbDetail.distribution?'发麻是突然开始还是逐渐出现，主要是一侧还是两侧？有没有同时无力或说话变化？':'发麻之外有没有无力、说话或面部变化？';
    else if(cardiac)question=companionDenied?'这次心慌或胸闷大约持续多久，现在是轻微、明显还是正在加重？':'这次不适持续多久，是否伴有胸痛、气短或快要晕倒？';
    else question='这次头晕是轻微还是明显，有没有站不稳、快晕倒或单侧无力、说话变化？';
  }
  const triggers=[...symptoms,...(analysis.emotion?[analysis.emotion]:[]),'baseline'];
  const choose=(candidateInput)=>input.selectionMode==='alternative_method'?alternativeMethod(candidateInput,cards,analysis,clock,triggers,symptoms).card:chooseCard(candidateInput,cards,analysis,clock,triggers,symptoms);
  // Continuing an unfinished action is a re-display of that same episode,
  // not a new push. Revalidate every card condition against the new reply.
  const continuation=input.sameEpisodeContinuation===true&&input.continuingAssessment===true&&input.currentCardId&&input.clarificationContext?.topic===topic&&!input.recheckOutcome&&!input.selectionMode&&!input.topicChanged&&!input.resolvedSafety&&!input.explicitReset;
  const current=continuation?cards.find(item=>item.id===input.currentCardId):null;
  const hasExposure=current&&Array.isArray(input.recentCards)&&input.recentCards.some(row=>(typeof row==='string'?row:row?.id)===current.id);
  const retained=hasExposure?chooseCard({...input,recentCards:input.recentCards.filter(row=>(typeof row==='string'?row:row?.id)!==current.id)},[current],analysis,clock,triggers,symptoms):null;
  const card=retained||choose(input),withoutHistory=card?null:choose({...input,recentCards:[]});
  const reason=card?question?'graded_support_check':'graded_symptom_support':withoutHistory?'graded_support_cooldown':'graded_support_unavailable';
  const message=card?question?`先给${labels}留一点安稳休息的时间。还有一项关键信息想确认；这张卡只提供原位、低负担的支持。`:needsDetail?'目前仍有信息不能确认，先保持原位舒适休息，不需要反复回答同一个问题。若不适持续、反复或出现新的变化，请联系医疗人员。':`你提到${labels}，先暂停手头任务，保持有支撑的坐姿、靠姿或躺姿，做一件不费力的小事，30秒后再看看变化。`:withoutHistory?'当前适合的静息卡都在24小时冷却中，先继续原位休息，不换成运动或其他不相关操作。':analysis.context.includes('eating')?'你还在用餐，先暂停进食、保持原位休息，暂不安排呼吸或动作卡；稍后再反馈感受。':'当前条件没有合适的新支持卡，先留在原位舒适休息，不勉强开始其他动作。';
  return {...shared,level:question?'clarify':'symptom',reason,message,card,...(retained?{retainedCurrentCard:true}:{}),assessmentPending:!!question,assessmentIncomplete:needsDetail,followUpStage:question?'key_details':undefined,question:question||undefined,options:[],inputKind:topic,recheck:{afterSeconds:30,question:`休息片刻后，${labels}比刚才有什么变化？`,options:['已缓解','差不多','加重或新不适']}};
}
export function decide(request = {}, cards = []) {
  const previous=['numbness','cardiac','dizziness','wellbeing'].includes(request.clarificationContext?.topic)&&typeof request.clarificationContext.text==='string'&&request.resolvedSafety!==true&&request.explicitReset!==true?request.clarificationContext.text.slice(-4000).trim():'';
  let next=String(request.text||'').trim();
  // A 30-second feedback button reports change, not a newly established long
  // duration. Explicit new symptom text is always kept for independent triage.
  const latest=String(request.latestInput||next).trim();
  const buttonOnly=/^(?:已(?:明显)?(?:改善|缓解)|差不多|没有变化|没什么变化|仍未缓解|感觉加重了|加重或新不适|不确定)[。！!\s]*$/.test(latest);
  if(previous&&request.recheckOutcome&&buttonOnly&&next.endsWith(latest))next=next.slice(0,-latest.length).replace(/[。\s]+$/,'');
  let combined=previous&&!next.includes(previous)?`${previous}。${next}`:next;
  if(combined.length>12000)combined=previous?`${previous}。${combined.slice(-6000)}`:combined.slice(-12000);
  const input={...request,text:combined};
  const clock=localClock(input.now,input.timeZone||'Asia/Shanghai'),analysis=analyzeText(input.text),profile=conditions(input.profile),device=vitalsEvidence(input.vitals,clock),bp=bpEvidence(input.bloodPressure,clock);
  // The UI may supply the unmerged reply as an additional independent safety check.
  const latestAnalysis=typeof request.latestInput==='string'?analyzeText(request.latestInput):null;
  if(latestAnalysis?.emergency){analysis.emergency=true;analysis.reason=latestAnalysis.reason;analysis.symptoms=[...new Set([...analysis.symptoms,...latestAnalysis.symptoms])];}
  const evidence=[{kind:'self-report',symptoms:analysis.symptoms,emotion:analysis.emotion,context:analysis.context,musicModes:analysis.musicModes,numbness:analysis.numbness,severity:analysis.course.severity,course:analysis.course},...device.evidence,...(bp?[bp.evidence]:[])];
  const reply=(level,reason,message,extra={})=>({level,reason,message,evidence,...extra});
  const emergency=reason=>reply('emergency',reason,'请立即停止活动，拨打120或当地急救电话，请身边人协助；不要自行驾车，也不要等待按摩、调息或手表读数改善。',{card:null,source:analysis.symptoms.includes('stroke_sign')?DECISION_SOURCES.stroke:analysis.symptoms.includes('confusion')?DECISION_SOURCES.confusion:analysis.symptoms.some(s=>['heavy_bleeding','black_stool','bloody_stool'].includes(s))?DECISION_SOURCES.bleeding:reason==='high_bp_with_symptoms'?DECISION_SOURCES.bloodPressure:analysis.symptoms.includes('severe_breathlessness')||analysis.symptoms.includes('breathlessness')?DECISION_SOURCES.breathing:reason==='concerning_palpitations'?DECISION_SOURCES.palpitations:DECISION_SOURCES.chest});
  if(analysis.symptoms.includes('self_harm'))return reply('emergency','self_harm_urgent_support','先把可能伤害自己的物品放远，联系一位信任的人陪在身边；如果已经受伤、服下过量药物或可能马上行动，请立即拨打120或当地急救电话。你不必一个人面对这一刻。',{card:null});
  if(analysis.emergency)return emergency(analysis.reason);
  if(profile.has('coronary')&&analysis.symptoms.some(s=>['chest_pain','chest_pressure','chest_tightness'].includes(s)))return emergency('coronary_chest_discomfort');
  if(bp?.usable&&bp.high&&analysis.symptoms.some(s=>acute.has(s)||s==='numbness'))return emergency('high_bp_with_symptoms');
  if(clock.night&&device.usable&&input.vitals.asleep===true&&!String(input.text||'').trim()&&input.manualMeasurement!==true)return reply('silent','sleeping_at_night','已标记睡眠，非急症数据仅保留记录，保持安静。',{card:null});
  if(bp?.usable&&bp.high)return reply('symptom','high_bp_recheck','当前血压数值很高，暂停日常行动。安静至少1分钟后按正确方法复测，并尽快联系医疗人员；若出现胸痛、气短、晕厥等症状，立即拨打120。不要自行加减药量。',{card:null});
  if(analysis.symptoms.some(s=>['black_stool','bloody_stool'].includes(s)))return reply('symptom','gastrointestinal_bleeding_review','你提到黑便或便中带血，先暂停日常养生活动，尽快联系医疗人员核查；若大量或持续出血、头晕欲倒、意识不清，请立即拨打120。这里不根据颜色判断病因。',{card:null,source:DECISION_SOURCES.bleeding});
  if(analysis.symptoms.includes('severe_dehydration'))return reply('symptom','dehydration_review','你描述的脱水、明显尿量减少或无法保留液体需要尽快就医评估，先不安排日常卡片；若意识混乱、难以唤醒、呼吸困难或快要晕倒，立即拨打120。',{card:null,source:DECISION_SOURCES.dehydration});
  if(analysis.symptoms.some(s=>acute.has(s)&&!['palpitations','chest_tightness','dizzy'].includes(s)))return reply('symptom','symptoms_before_devices','你描述的不适优先于正常手表读数。先停止当前活动，在安全位置休息并及时联系医疗人员；若持续、加重或伴胸痛、呼吸困难、近晕厥，立即拨打120。此时不推荐运动或穴位操作。',{card:null});
  if(analysis.context.includes('road_attention'))return reply('silent','road_attention','请先专注路况，到安全地点停稳后再查看。',{card:null});
  if(bp&&!bp.usable&&!bp.historical||input.manualMeasurement===true&&!input.bloodPressure)return reply('clarify','verify_blood_pressure','请先核对血压数字和测量时间；记录有误不能作为状态正常的依据。',{inputKind:'blood_pressure',question:timestamp(input.bloodPressure?.measuredAt)>clock.ms?'这条血压的测量时间在当前时间之后，请核对收缩压、舒张压和实际测量时间。':'请填写或核对这次记录的收缩压、舒张压和实际测量时间。',options:[],card:null});
  if(analysis.ambiguous)return reply('clarify','unclear_current_situation','先听清你的描述，再安排适合的内容。',{...clarificationFor(input.text),card:null});
  if(device.usable&&device.severe&&device.persistence!==null&&device.persistence>=10)return reply('symptom','persistent_objective_warning',`${observedSummary(input.vitals,device)}。即使自觉无不适，也先暂停活动、核对设备并尽快咨询医疗人员；若出现胸痛、气短或近晕厥，立即拨打120。这里不判断异常原因。`,{card:null});
  const cardiacContext=analysis.symptoms.some(s=>['palpitations','chest_tightness'].includes(s))||input.clarificationContext?.topic==='cardiac';
  const dizzinessContext=analysis.symptoms.includes('dizzy')||input.clarificationContext?.topic==='dizziness';
  const numbnessContext=analysis.symptoms.includes('numbness')||input.clarificationContext?.topic==='numbness';
  const wellbeingContext=analysis.symptoms.some(s=>supportiveSymptoms.includes(s)&&s!=='poor_sleep')||input.clarificationContext?.topic==='wellbeing';
  if(input.recheckOutcome==='worse'&&(cardiacContext||dizzinessContext||numbnessContext||wellbeingContext))return reply('symptom','symptoms_medical_review','已记录不适比刚才加重，停止继续做卡片并及时联系医疗人员评估；若出现胸痛、明显气短、快晕倒、站不稳或新的单侧无力、说话异常，立即求助。',{card:null,severity:analysis.course.severity,course:'worsening',source:cardiacContext?DECISION_SOURCES.palpitations:dizzinessContext?DECISION_SOURCES.dizziness:DECISION_SOURCES.numbness,clarificationContext:input.clarificationContext,careSteps:['保持原位、有支撑的舒适姿势，请身边人留意你的变化。']});
  if(['unchanged','persistent'].includes(input.recheckOutcome)&&(cardiacContext||dizzinessContext||numbnessContext||wellbeingContext))return reply('symptom','graded_support_unchanged','这30秒内没有明显变化，不等于已经出现急症。先继续原位休息，不急着反复换卡；如果不适持续不消退、反复发作或程度加重，请及时联系医疗人员。新的胸痛、明显气短、快晕倒或单侧无力、言语异常应立即求助。',{card:null,severity:analysis.course.severity,course:'unchanged',clarificationContext:input.clarificationContext,careSteps:['继续保持有支撑的舒适姿势，留意感受的后续变化。'],recheck:{afterSeconds:30,question:'现在的感受有什么变化？',options:['已缓解','差不多','加重或新不适']}});
  if(input.recheckOutcome==='improved'&&(cardiacContext||dizzinessContext||numbnessContext||wellbeingContext))return reply('baseline','symptoms_improved','已记录感受明显改善。继续保持舒适休息，不急着恢复活动；若再次出现或反复发作，请联系医疗人员进一步评估。',{assessmentResolved:true,card:null,careSteps:['继续在安全、舒适的位置休息片刻。','若再次出现或反复发作，联系医疗人员；新的危险表现应立即求助。']});
  if(device.usable&&device.signals.length&&!analysis.symptoms.length&&!analysis.emotion&&input.confirmation!=='yes'&&input.confirmation!=='no') {
    const message=`${observedSummary(input.vitals,device)}。先核对你此刻的感受，这些数据不能确定原因。`;
    return reply('confirm','objective_needs_subjective_check',message,{question:`${observedSummary(input.vitals,device)}。你现在有明显不舒服吗？`,options:['有，我来描述','没有，先核对数据'],card:null});
  }
  if(input.confirmation==='yes'&&!analysis.symptoms.length&&!analysis.emotion)return reply('clarify','confirmation_needs_symptoms','请说说不适部位、感觉和开始时间；如果是胸痛、喘不过气或快要晕倒，立即拨打120。',{question:'现在最明显的身体感受是什么？',card:null});
  if(device.usable&&device.severe&&input.confirmation==='no')return reply('confirm','severe_value_verify',`${observedSummary(input.vitals,device)}。已记录你暂时没有不适，但该数值仍需核对。先暂停活动、检查佩戴并复测；持续异常应联系医疗人员。不能据此判断原因。`,{card:null});
  const normalized=(Array.isArray(cards)?cards:[]).filter(Boolean).map(card=>({...card,steps:Array.isArray(card.steps)&&card.steps.length?card.steps:typeof card.action==='string'&&card.action.trim()?[card.action]:[],why:card.reason||card.why}));
  const assessment=currentSymptomAssessment(input,analysis,device,profile,clock,normalized);
  if(assessment)return {...assessment,evidence};
  if(wellbeingContext&&(analysis.course.severity==='severe'||analysis.course.worsening||analysis.course.persistent))return reply('symptom','symptoms_medical_review','你提到的不适较明显或正在加重，先暂停日常行动并联系医疗人员评估，不以普通养生卡替代核查。',{card:null,severity:analysis.course.severity,course:analysis.course.worsening?'worsening':'persistent',clarificationContext:{kind:'symptom',topic:'wellbeing',text:input.text.slice(-4000)},careSteps:['留在舒适、有支撑的位置，留意新的症状或变化。']});
  const triggers=[...new Set([...analysis.symptoms.filter(s=>supportiveSymptoms.includes(s)),...(analysis.emotion?[analysis.emotion]:[]),...analysis.context.filter(c=>['eating','after_meal','before_meal','homesick','family','journal','drawing','photo','plants','tea'].includes(c)),...(analysis.context.includes('hunger')?['hungry']:[]),...(analysis.context.includes('hydration')?['dry_mouth']:[])])];
  if(analysis.context.includes('music')&&!analysis.symptoms.some(s=>!['fatigue','poor_sleep'].includes(s)))triggers.push('music');
  if(!triggers.length)triggers.push('baseline');
  const alternative=input.selectionMode==='alternative_method'?alternativeMethod(input,normalized,analysis,clock,triggers):null;
  const card=alternative?alternative.card:chooseCard(input,normalized,analysis,clock,triggers);
  if(!card) {
    if(analysis.context.includes('hunger'))return reply('silent','hunger_no_compatible_card','收到，你现在有些饿。这次没有适合当前时间和已知饮食安排的新卡；先按自己原有的进餐安排处理，需要备餐帮助时可告诉身边的人，不必继续回答偏好问题。',{card:null});
    const current=normalized.find(c=>c.id===input.currentCardId);
    const currentStillCompatible=['same_category','alternative_method'].includes(input.selectionMode)&&current&&chooseCard({...input,selectionMode:undefined,recentCards:[]},[current],analysis,clock,triggers);
    return currentStillCompatible?reply('silent',input.selectionMode==='alternative_method'?'alternative_exhausted':'category_exhausted',input.selectionMode==='alternative_method'?'当前没有同类或更低负担、同时满足条件的新方式。':'这一类暂时没有同时符合当前情境、安全条件和24小时冷却要求的新卡。',{card:null}):reply('silent','no_compatible_card','当前没有同时满足时辰、情境、已知条件和24小时冷却要求的卡片，先不安排新的行动。',{card:null});
  }
  return reply(analysis.symptoms.length?'symptom':'baseline',alternative?.lowerBurden?'alternative_lower_burden':triggers.includes('baseline')?'daily_opportunity':'matching_current_context',`${alternative?.lowerBurden?'同类暂时没有合适的新卡，换成更低负担的安静方式。 ':''}${matchingExplanation(input,card,analysis,clock)}`,{card,...(wellbeingContext?{severity:analysis.course.severity,course:analysis.course.worsening?'worsening':analysis.course.improving?'improving':analysis.course.stable?'stable':'unknown',clarificationContext:{kind:'symptom',topic:'wellbeing',text:input.text.slice(-4000)},careSteps:['按当前卡片轻松尝试，感到不适时随时停止。'],recheck:{afterSeconds:30,question:'此刻的感受比刚才有什么变化？',options:['已缓解','差不多','加重或新不适']}}:{}),confirmation:['yes','no'].includes(input.confirmation)?input.confirmation:null});
}
