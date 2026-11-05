// One completion boundary for success, failure and a missed React context
// effect. A superseded request must never settle a newer request's UI state.
export async function settleAiRequest({gate,id,context,getContext,load,onSuccess,onFailure,onContextChanged,onSettled}){
  try{
    const reply=await load();
    if(!gate.isCurrent(id))return;
    if(context!==getContext())return onContextChanged();
    return onSuccess(reply);
  }catch(error){
    if(!gate.isCurrent(id))return;
    if(context!==getContext())return onContextChanged();
    return onFailure(error);
  }finally{
    if(gate.isCurrent(id))onSettled();
  }
}
