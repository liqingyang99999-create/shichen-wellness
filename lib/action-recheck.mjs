import {analyzeText} from './decision.mjs';
export function safetySnapshot(decision,text){
  const unresolved=decision?.level==='emergency'||decision?.assessmentPending||!!decision?.recheck||decision?.level==='symptom'&&!decision.card;
  return unresolved?{decision,text,rulesVersion:'0.12'}:null;
}

export function initialSafetyDecision(snapshot){
  if(!snapshot)return null;
  const decision=snapshot.decision;
  if(decision?.level==='emergency'||snapshot.rulesVersion==='0.12')return decision;
  const analysis=analyzeText(snapshot.text||'');
  const mild=analysis.course?.mild||analysis.course?.mildDizziness||/(?:有点|一点|轻微)/.test(snapshot.text||'');
  const legacySupport=decision?.assessmentPending&&['cardiac','dizziness','numbness','wellbeing'].includes(decision?.clarificationContext?.topic)||String(decision?.reason||'').startsWith('isolated_')||['gentle_rest_recheck','clarify_dizziness','clarify_palpitations','clarify_numbness'].includes(decision?.reason);
  // Only old low-intensity supportive/clarifying states are refreshed. Preserve
  // the statement for current rules; do not erase acute or sustained warnings.
  return legacySupport&&mild&&!analysis.emergency&&!analysis.course?.persistent&&!analysis.course?.recurrent?null:decision;
}

export function requiresActionRecheck(decision,actionCardId){
  return decision?.level!=='emergency'&&!!decision?.recheck&&!!actionCardId&&decision.card?.id===actionCardId;
}

export function currentAssessmentCard(decision,options={}){
  if(options.continuingAssessment!==true||options.selectionMode||options.recheckOutcome||options.topicChanged===true||options.resolvedSafety===true||options.explicitReset===true||!decision?.card?.id||!decision?.recheck||!['symptom','clarify'].includes(decision.level))return {};
  return {currentCardId:decision.card.id,sameEpisodeContinuation:true};
}

export function preservesCurrentAction(previous,next,options={}){
  return !!(currentAssessmentCard(previous,options).currentCardId&&next?.retainedCurrentCard===true&&next.card?.id===previous.card.id&&next.recheck&&next.clarificationContext?.topic===previous.clarificationContext?.topic);
}

export function pendingAssessmentResponse(localDecision,candidate,revalidated){
  if((!localDecision?.assessmentPending&&!localDecision?.retainedCurrentCard)||candidate?.card||candidate?.level==='emergency')return candidate;
  if(revalidated?.level==='emergency'||revalidated?.level==='symptom'&&!revalidated.card&&!revalidated.assessmentPending)return revalidated;
  return localDecision;
}

export function recheckOptions(outcome,decision){
  if(!['improved','unchanged','persistent','worse'].includes(outcome))throw new Error('请选择现在的感受');
  return {recheckOutcome:outcome,clarificationContext:decision?.clarificationContext,resolvedSafety:outcome==='improved',continuingAssessment:true};
}

export function matchingStatus(decision,ai){
  if(decision?.level==='emergency')return '急症优先响应';
  const source=ai||decision?.ai;
  if(source?.status==='used'&&source.stage&&source.stage!=='selected')return decision?.card?'AI 理解 · 基础匹配':'AI 理解';
  return source?.status==='used'?'AI 匹配':'基础匹配';
}

export function immediateLocalDecision(decision){
  return decision?.assessmentResolved===true||['emergency','silent','confirm'].includes(decision?.level)||decision?.inputKind==='blood_pressure'||decision?.level==='symptom'&&!decision.card;
}

// End the previous episode before an asynchronous daily selection starts. A new
// input must never inherit already-resolved symptoms while that request waits.
export function clearResolvedSafety(store,options={}){
  return options.resolvedSafety===true||options.explicitReset===true?{...store,activeSafety:null}:store;
}
