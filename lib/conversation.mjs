import {analyzeText} from './decision.mjs';
// Keep related replies together; unrelated new messages always begin a new turn.
export function toggleContextTag(current, tag) {
  const list = [...new Set(Array.isArray(current) ? current : [])];
  return list.includes(tag) ? list.filter(value => value !== tag) : [...list, tag];
}
export function followUpText(result, previous, reply) {
  const answer = String(reply || '').trim();
  const context = String(result?.clarificationContext?.text || previous || '').trim();
  if (!answer || !context || answer.startsWith(context)) return answer || context;
  if(context.endsWith(`补充：${answer}`)||context===answer)return context;
  return `${context}。补充：${answer}`;
}

export function clarificationKind(result){
  if(result?.level==='confirm'||result?.inputKind==='blood_pressure'||result?.assessmentPending||['cardiac','dizziness','numbness','wellbeing'].includes(result?.clarificationContext?.topic)||['symptom','risk_check'].includes(result?.questionPurpose))return 'symptom';
  if(result?.questionPurpose==='preference'||result?.clarificationContext?.kind==='preference'||result?.clarificationContext?.topic==='preference'||result?.reason==='ai_no_suitable_card')return 'preference';
  return 'open';
}

export function clarificationCopy(result){
  const kind=clarificationKind(result);
  return kind==='preference'?{kind,title:'选个适合的小行动',label:'也可以说说你的想法',placeholder:'都可以、想轻松一点，或补充你现在方便做的事…',hint:'不必按选项回答；没有偏好也可以让我来选。'}
    :kind==='symptom'?{kind,title:result?.level==='confirm'?'想听听你的感受':'补充一个情况',label:'按自己的感受说',placeholder:'可以说现在的程度、什么时候开始，或还有什么变化；不确定也可以告诉我…',hint:'用自己的话回答就好，不必猜测或勉强选择。'}
    :{kind,title:'再说一点，我在听',label:'用自己的话补充',placeholder:'说说发生的事、现在的感受，或你想做些什么…',hint:'不用按固定选项回答。'};
}

export function followUpTurn(result,previous,reply){
  const kind=clarificationKind(result),answer=String(reply||'').trim();
  const latest=analyzeText(answer);
  const topicChanged=kind==='preference'&&(latest.emergency||latest.symptoms?.length>0||/(?:有点|有些|有一点|感觉)?饿(?:了|得|着|$)|饥饿|其实|换个话题|不说这个|(?:想|要|希望|打算)(?:听|睡|吃|喝|走|散步|画|读|打电话|拍|写|安静|休息|放松)/.test(answer));
  if(topicChanged)return {text:answer,options:{latestInput:answer,topicChanged:true,clarificationAttempts:0,preferenceDelegated:false,questionPurpose:undefined,clarificationContext:undefined,continuingAssessment:false}};
  const text=followUpText(result,previous,answer);
  const attempts=Math.min(2,Math.max(0,Number(result?.clarificationAttempts)||0)+1);
  const explicitDelegate=/都(?:行|可以|好)|随(?:便|意)|没(?:有)?(?:什么)?偏好|你(?:帮我|来|看着)?(?:选|决定|安排)|帮我(?:选|决定|安排)|^(?:不知道|不确定)[吧。！!]*$/.test(answer);
  const selectedOption=(Array.isArray(result?.options)?result.options:[]).some(option=>answer===(typeof option==='string'?option:option?.value||option?.label));
  // Free-form sentences may change the goal. Let the semantic service decide;
  // do not force them into the old choices or reset the clarification budget.
  const topicChangeCandidate=kind==='preference'&&!explicitDelegate&&!selectedOption&&answer.replace(/[\s。，！？.!?]/g,'').length>=3;
  const delegated=kind==='preference'&&(explicitDelegate||attempts>=2&&!topicChangeCandidate);
  const context={...(result?.clarificationContext||{}),text};
  if(kind==='preference'){context.kind='preference';context.topic='preference';}
  if(kind==='symptom')context.kind='symptom';
  return {text,options:{clarificationContext:context,continuingAssessment:kind==='symptom',latestInput:answer,clarificationAttempts:attempts,preferenceDelegated:delegated,topicChangeCandidate,...(kind!=='open'?{questionPurpose:kind==='symptom'?'symptom':'preference'}:{})}};
}
export function assessmentReplyOptions(result) {
  return result?.assessmentPending || result?.clarificationContext
    ? {continuingAssessment:true,clarificationContext:result.clarificationContext,...(Number.isInteger(result.clarificationAttempts)?{clarificationAttempts:Math.max(0,Math.min(2,result.clarificationAttempts))}:{}),...(['symptom','risk_check'].includes(result.questionPurpose)?{questionPurpose:result.questionPurpose}:{})}
    : {};
}
export function completedActionRecord(action, at, before = '', after = '') {
  if (!action?.id || !action?.card?.id) return null;
  const valid = value => value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 3;
  return {id: action.id, cardId: action.card.id, title: action.card.title,
    opportunityId: action.opportunityId, completedAt: at,
    ...(valid(before) ? {symptomBefore: Number(before)} : {}),
    ...(valid(after) ? {symptomAfter: Number(after)} : {})};
}
