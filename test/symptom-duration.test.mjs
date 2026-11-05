import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeText,decide} from '../lib/decision.mjs';
import cards from '../data/cards.json' with {type:'json'};
const run=text=>decide({now:'2026-11-05T15:30:00+08:00',text,profile:{conditions:[]},vitals:{source:'unavailable'}},cards);
test('ongoing cardiac symptoms retain Chinese and Arabic minute durations',()=>{
 for(const duration of ['五分钟','十分钟','二十分钟','三十五分钟','20分钟','15分钟','半小时']){
  const text=`胸闷已经持续了${duration}，还没有好转。`;const d=run(text);
  assert.equal(d.level,'emergency',text);assert.equal(d.card,null);assert.equal(d.question,undefined);
 }
 assert.equal(run('心慌还没有好转').level,'emergency');
 assert.equal(run('胸闷持续了12分钟').level,'emergency');
});
test('short improving episodes, negation and remote history do not inherit sustained urgency',()=>{
 for(const text of ['轻微心慌，只持续十秒，正在减轻，没有其他不舒服','轻微心慌，持续了20秒，正在缓解，没有其他不舒服','没有持续二十分钟，只是轻微心慌几秒，正在减轻','医生说我既往慢性胸闷，现在没有不适','以前胸闷持续了二十分钟，但现在没有胸闷']){
  assert.notEqual(run(text).level,'emergency',text);
 }
});
test('time spent waiting, sleeping or another symptom is not cardiac duration',()=>{
 for(const text of ['我等饭已经20分钟了，现在轻微心慌','睡了6小时，现在刚有点胸闷','轻微心慌几秒，等饭已经20分钟了','轻微心慌几秒，头晕已经20分钟']){
  assert.ok(!analyzeText(text).course.durations.some(d=>['palpitations','chest_tightness'].includes(d.symptom)&&d.minutes>=5),text);
 }
 assert.notEqual(run('我等饭已经20分钟了，现在轻微心慌').level,'emergency');
 assert.notEqual(run('睡了6小时，现在刚有点胸闷').level,'emergency');
});
