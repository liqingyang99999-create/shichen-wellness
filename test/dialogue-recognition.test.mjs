import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDialogue } from '../server/model.mjs';
import { createChatSnapshot } from '../lib/context.mjs';

const now = '2026-11-04T18:23:00+08:00';
const snapshot = () => createChatSnapshot(now);
const values = result => Object.fromEntries(result.proposals.map(p => [p.field, p.value]));
const p = (field, value, evidence) => ({ field, value, evidence });
const mock = proposals => ({
  LLM_API_KEY: 'fixture-only', LLM_MODEL: 'fixture-only', LLM_BASE_URL: 'https://unit.invalid/v1',
  FETCH: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ proposals, ambiguities: [] }) } }] }))
});

test('reported 18:23 sentence yields awake and before-meal without invented time, posture or activity', async () => {
  const text = '我刚起床，该去吃晚饭了';
  const expected = { mealPhase: 'before', atMeal: false, sleepState: 'awake' };
  const expectedModel = [p('sleepState', 'awake', '刚起床'), p('mealPhase', 'before', '该去吃晚饭了'), p('atMeal', false, '该去吃晚饭了')];
  for (const env of [{}, mock(expectedModel)]) {
    const current = snapshot(), result = await parseDialogue(text, current, env);
    assert.deepEqual(values(result), expected);
    assert.equal(current.now, now);
    assert.deepEqual(result.conflicts, [], 'resolving unknown wakefulness is not a conflicting manual condition');
    assert.equal(result.providerMode, env.LLM_MODEL ? 'live' : 'offline');
  }
});

test('common wake-up and meal expressions share offline and model evidence validation', async () => {
  for (const text of ['我刚睡醒', '我起床了', '我醒了', '我已经起床']) {
    const offline = await parseDialogue(text, snapshot());
    assert.equal(values(offline).sleepState, 'awake', text);
    const live = await parseDialogue(text, snapshot(), mock(offline.proposals));
    assert.equal(live.providerMode, 'live', text);
    assert.equal(values(live).canLeaveSeat, undefined, text);
    assert.equal(values(live).sitting, undefined, text);
  }
  for (const [text, phase, atMeal] of [
    ['我准备去吃晚饭', 'before', false], ['该去吃晚饭了', 'before', false], ['我要去吃饭', 'before', false],
    ['饭还没吃', 'before', false], ['我吃好了', 'after', false], ['我吃饭呢', 'during', true]
  ]) {
    const offline = await parseDialogue(text, snapshot());
    assert.equal(values(offline).mealPhase, phase, text); assert.equal(values(offline).atMeal, atMeal, text);
    assert.equal(values(offline).goingOut, undefined, text); assert.equal(values(offline).now, undefined, text);
    assert.equal((await parseDialogue(text, snapshot(), mock(offline.proposals))).providerMode, 'live', text);
  }
});

test('one invalid model field does not erase valid fields and missing rule facts are added', async () => {
  const result = await parseDialogue('我刚起床，该去吃晚饭了', snapshot(), mock([
    p('sleepState', 'awake', '刚起床'), p('canLeaveSeat', true, '刚起床')
  ]));
  assert.equal(result.providerMode, 'fallback');
  assert.deepEqual(values(result), {sleepState:'awake', mealPhase:'before', atMeal:false});
  assert.deepEqual(result.validation, {modelAccepted:1, modelRejected:1, ruleAdded:2});
});

test('empty or entirely invalid model extraction still recovers explicit colloquial facts', async () => {
  for (const proposals of [[], [p('intent', 'eye', '刚起床')]]) {
    const result = await parseDialogue('我刚起床，该去吃晚饭了', snapshot(), mock(proposals));
    assert.equal(result.providerMode, 'fallback'); assert.equal(result.validation.modelAccepted, 0);
    assert.deepEqual(values(result), {mealPhase:'before', atMeal:false, sleepState:'awake'});
  }
});

test('evidence cannot cut off original negation or turn planned future activity into current facts', async () => {
  for (const [text, proposals, excluded] of [
    ['我不是刚醒，也没有吃完晚饭', [p('sleepState','awake','刚醒'),p('mealPhase','after','吃完晚饭')], {sleepState:'awake',mealPhase:'after'}],
    ['我不能闭眼', [p('canCloseEyes',true,'闭眼')], {canCloseEyes:true}],
    ['我打算明天看屏30分钟', [p('screenMinutes',30,'看屏30分钟'),p('intent','eye','看屏')], {screenMinutes:30,intent:'eye'}],
    ['我准备看屏30分钟', [p('screenMinutes',30,'看屏30分钟')], {screenMinutes:30,intent:'eye'}],
    ['我明天准备去吃晚饭', [p('mealPhase','before','准备去吃晚饭')], {mealPhase:'before'}],
    ['如果我刚起床，准备吃晚饭', [p('sleepState','awake','刚起床'),p('mealPhase','before','准备吃晚饭')], {sleepState:'awake',mealPhase:'before'}]
  ]) {
    for (const env of [{}, mock(proposals)]) {
      const result = await parseDialogue(text, snapshot(), env), found = values(result);
      for (const [field,value] of Object.entries(excluded)) assert.notEqual(found[field],value,`${text}: ${field}`);
      if (env.LLM_MODEL) assert.equal(result.validation.modelAccepted,0,text);
    }
  }
});

test('third-person subject carries over comma clauses but explicit first-person clause restores the user', async () => {
  for (const text of ['我妈刚醒，正在吃晚饭', '他刚起床，准备去吃晚饭', '她看屏30分钟']) {
    assert.deepEqual(values(await parseDialogue(text, snapshot())), {}, text);
    const result = await parseDialogue(text, snapshot(), mock([p('sleepState','awake',text),p('atMeal',true,text)]));
    assert.equal(result.validation.modelAccepted,0,text);
  }
  const own = values(await parseDialogue('我妈刚醒，我准备去吃晚饭', snapshot()));
  assert.deepEqual(own,{mealPhase:'before',atMeal:false});
});

test('last explicit correction wins over an earlier model quote', async () => {
  const text = '我可以离座，不能离座。刚起床，不对，我还没起床。正在吃晚饭，已经吃完晚饭。看屏30分钟，不对，看屏20分钟。';
  const result = await parseDialogue(text,snapshot(),mock([
    p('canLeaveSeat',true,'可以离座'),p('sleepState','awake','刚起床'),
    p('atMeal',true,'正在吃晚饭'),p('screenMinutes',30,'看屏30分钟')
  ]));
  const found=values(result);
  assert.equal(result.validation.modelAccepted,0);
  assert.equal(found.canLeaveSeat,false); assert.equal(found.sleepState,'unknown');
  assert.equal(found.mealPhase,'after'); assert.equal(found.atMeal,false); assert.equal(found.screenMinutes,20);
});

test('clock and numeric facts remain exact and preserve the original date qualifier', async () => {
  const wrong = await parseDialogue('明天13:00，看屏25分钟',snapshot(),mock([
    p('now','2026-11-04T13:00:00+08:00','13:00'), p('screenMinutes',95,'看屏25分钟')
  ]));
  assert.equal(wrong.validation.modelAccepted,0);
  assert.equal(values(wrong).now,'2026-11-05T13:00:00+08:00');
  assert.notEqual(values(wrong).screenMinutes,95);
  const correct = await parseDialogue('现在18:23，看屏半小时',snapshot(),mock([
    {...p('screenMinutes',30,'看屏半小时'),unit:'小时'}, p('now',now,'18:23')
  ]));
  assert.equal(correct.providerMode,'live'); assert.equal(values(correct).screenMinutes,30);
  assert.equal(correct.proposals.find(p=>p.field==='screenMinutes').unit,'分钟');
  const numericClock = await parseDialogue('现在18:23',snapshot(),mock([p('now',Date.parse(now),'18:23')]));
  assert.equal(numericClock.validation.modelAccepted,0);
  assert.equal(values(numericClock).now,now);
});
