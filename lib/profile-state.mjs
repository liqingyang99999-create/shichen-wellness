// A completed questionnaire is one snapshot. An empty primary array is a valid
// assessment result, never a reason to fill it from the demonstration profile.
export function restoreExperienceStore(saved,competition,createDemo){
  return competition&&!saved.profile?createDemo():saved;
}

export function saveProfileSnapshot(store,profile,key,storage){
  const next={...store,profile:structuredClone(profile)};
  try{storage.setItem(key,JSON.stringify({version:1,data:next}));}catch{}
  return next;
}
