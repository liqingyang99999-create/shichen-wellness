import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCardHistory,recordCardSelection} from '../lib/card-history.mjs';
const now='2026-11-05T12:00:00+08:00';
test('cooldown history cannot lose early cards after more than 80 switches',()=>{
  let history=[];
  for(let i=0;i<200;i++)history=recordCardSelection(history,{id:'C'+i,category:'test'},now);
  assert.equal(history.length,200);assert.equal(history[0].id,'C0');
});
test('merge keeps latest per ID across ISO offsets and reload journals',()=>{
  const a=[{id:'A',shownAt:'2026-11-05T10:00:00+08:00'}],b=[{id:'A',shownAt:'2026-11-05T03:00:00.000Z'},{id:'B',shownAt:now}];
  const merged=mergeCardHistory([a,b],now);assert.equal(merged.length,2);assert.equal(merged[0].shownAt,'2026-11-05T03:00:00.000Z');
  assert.deepEqual(mergeCardHistory([merged],now),merged);
});
test('legacy and future timestamps stay blocked; only genuinely old history expires',()=>{
  const merged=mergeCardHistory([['legacy',{id:'bad',shownAt:'x'},{id:'future',shownAt:'2026-11-10T10:00:00Z'},{id:'old',shownAt:'2026-10-01T00:00:00Z'}]],now);
  assert.equal(merged.length,3);assert.ok(merged.every(x=>x.id!=='old'));assert.equal(merged[0].shownAt,new Date(now).toISOString());
});
