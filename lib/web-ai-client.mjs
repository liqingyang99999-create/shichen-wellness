// Minimal explicit request boundary. Never serialize the full local store.
export function redactAiText(value, name='') {
  let text=String(value||'').slice(0,2400);
  if(name&&name.length>=2)text=text.split(name).join('使用者');
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[邮箱已省略]').replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g,'[手机号已省略]').replace(/(?<!\d)\d{17}[\dXx](?!\d)/g,'[证件号已省略]');
}
const pick=(object,keys)=>Object.fromEntries(keys.filter(key=>object?.[key]!==undefined).map(key=>[key,object[key]]));
export function aiRequestBody(input, turns=[]) {
  const p=input.profile||{},name=p.name||'';
  const profile={...pick(p,['conditions','constitution','fluidRestricted','limitedMobility']),...(Number(p.age)>=18?{ageBand:Number(p.age)>=65?'older_adult':'adult'}:{}),allergies:redactAiText(p.allergies,name).slice(0,200)};
  const context={...pick(input,['now','confirmation','selectionMode','currentCardId','continuingAssessment','resolvedSafety','recheckOutcome','manualMeasurement','explicitReset','feedbackSource','questionPurpose','clarificationAttempts','preferenceDelegated','topicChanged','topicChangeCandidate','sameEpisodeContinuation']),profile,
    vitals:pick(input.vitals,['source','measuredAt','heartRate','baselineHeartRate','hrv','baselineHrv','stress','sleepHours','steps','asleep','quality','durationMinutes','sleepStages','nightHeartRate']),
    weather:pick(input.weather,['temperature','drop24h','minTemperature','measuredAt','source']),
    bloodPressure:input.bloodPressure?pick(input.bloodPressure,['systolic','diastolic','pulse','measuredAt']):null,
    recentCards:(input.recentCards||[]).slice(-250).map(r=>pick(r,['id','shownAt','category','actionFamily','slot'])),
    latestInput:redactAiText(input.latestInput||input.text,name),
    clarificationContext:input.clarificationContext?{topic:String(input.clarificationContext.topic||'').slice(0,40),...(['preference','symptom'].includes(input.clarificationContext.kind)?{kind:input.clarificationContext.kind}:{}),text:redactAiText(input.clarificationContext.text,name)}:undefined};
  return {consent:true,text:redactAiText(input.text,name),context,turns:(input.resolvedSafety===true||input.explicitReset===true?[]:turns).slice(-6).map(t=>({role:t.role==='assistant'?'assistant':'user',content:redactAiText(t.content,name).slice(0,900)}))};
}
export function createAiRequestGate(){let sequence=0,active=null;return {begin(){active?.abort();active=new AbortController();const id=++sequence;return {id,signal:active.signal};},isCurrent(id){return sequence===id&&!active?.signal.aborted;},cancel(){sequence++;active?.abort();active=null;}};}
// A verified semantic topic change may end a lifestyle preference round. It
// cannot remove an unresolved physical assessment or a local emergency gate.
export function aiReplayInput(input,localDecision,ai){
  const replay={...input,text:typeof ai?.effectiveText==='string'?ai.effectiveText:input.text};
  const preference=input.questionPurpose==='preference'&&input.clarificationContext?.kind==='preference';
  const clinical=localDecision?.level==='emergency'||localDecision?.assessmentPending||localDecision?.recheck||input.recheckOutcome||['cardiac','dizziness','numbness','wellbeing'].includes(input.clarificationContext?.topic);
  if(ai?.topicChanged===true&&preference&&!clinical){
    return {...replay,clarificationContext:undefined,questionPurpose:undefined,clarificationAttempts:0,preferenceDelegated:false,continuingAssessment:false,topicChanged:true};
  }
  return replay;
}
export async function fetchAiDecision(body,{signal,fetchImpl=fetch,timeoutMs=38000}={}){
  const controller=new AbortController();const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)controller.abort();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl('/api/care-ai',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
    if(!response.ok)throw new Error(response.status===429?'AI暂时繁忙':'AI暂时无法连接');
    const data=await response.json();
    if(!['used','guard'].includes(data?.ai?.status)||!data?.decision||!['baseline','symptom','clarify','confirm','emergency','silent'].includes(data.decision.level))throw new Error('AI返回内容未通过检查');
    return data;
  } finally {clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}
