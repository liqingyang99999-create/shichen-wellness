// UI state guard: routine refreshes must not dismiss an unresolved safety alert.
// Resolving an alert is an explicit UI action, never inferred from normal data.
export function retainSafetyDecision(previous, candidate, {resolvedSafety=false,explicitReset=false,continuingAssessment=false,selectionMode} = {}) {
  // A newly reported emergency always wins, even during an explicit reset.
  if(candidate?.level==='emergency')return candidate;
  if(resolvedSafety===true||explicitReset===true)return candidate;
  const reviewedSupport=d=>['symptom','clarify'].includes(d?.level)&&d?.recheck&&['cardiac','dizziness','numbness','wellbeing'].includes(d?.clarificationContext?.topic)&&(d.card?.id||['isolated_dizziness_cooldown','isolated_dizziness_unavailable','graded_support_cooldown','graded_support_unavailable'].includes(d.reason));
  if(['same_category','alternative_method'].includes(selectionMode)&&reviewedSupport(previous)&&reviewedSupport(candidate)&&previous.clarificationContext.topic===candidate.clarificationContext.topic)return candidate;
  if(previous?.level!=='emergency'&&continuingAssessment&&(candidate?.assessmentPending||candidate?.assessmentResolved||candidate?.level==='symptom'))return candidate;
  if(previous?.level==='symptom'&&!previous.card&&candidate?.level==='symptom'&&!candidate.card)return candidate;
  const locked=previous?.level==='emergency'||previous?.assessmentPending||!!previous?.recheck||previous?.level==='symptom'&&!previous.card;
  return locked?previous:candidate;
}

export function mergeUnresolvedComplaint(previousText,newText,{resolvedSafety=false,explicitReset=false}={}) {
  const next=String(newText||'').trim();
  if(resolvedSafety===true||explicitReset===true)return next;
  const previous=String(previousText||'').trim();
  if(!next||next===previous)return previous;
  if(next.startsWith(previous))return next;
  return previous?`${previous}。${next}`:next;
}
