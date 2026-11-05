const RETENTION_MS=8*24*60*60*1000;
// Keep the last occurrence of every ID, rather than an arbitrary last-N list.
// Legacy records without a usable timestamp start a conservative cooldown now.
export function mergeCardHistory(groups,now,cards=[]) {
  const nowMs=Date.parse(now);
  if(!Number.isFinite(nowMs))throw new TypeError('卡片历史需要有效时间');
  const catalog=new Map(cards.map(c=>[c.id,c]));
  const latest=new Map();
  for(const records of groups)for(const record of Array.isArray(records)?records:[]) {
    const id=typeof record==='string'?record:record?.id;
    if(typeof id!=='string'||!id)continue;
    const rawAt=Date.parse(record?.shownAt);
    const shownAt=Number.isFinite(rawAt)?new Date(rawAt).toISOString():new Date(nowMs).toISOString();
    const at=Date.parse(shownAt);
    if(nowMs-at>RETENTION_MS)continue;
    const card=catalog.get(id);
    const next={id,shownAt,category:card?.category||record?.category,actionFamily:card?.actionFamily||record?.actionFamily};
    if(!latest.has(id)||at>Date.parse(latest.get(id).shownAt))latest.set(id,next);
  }
  return [...latest.values()].sort((a,b)=>Date.parse(a.shownAt)-Date.parse(b.shownAt));
}

export function recordCardSelection(history,card,now,cards=[]) {
  return mergeCardHistory([history,[{id:card.id,shownAt:now,category:card.category,actionFamily:card.actionFamily}]],now,cards);
}
