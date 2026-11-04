import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatSnapshot, createReminderState, applyDialogueProposals, refreshChatTime, toShanghaiISO, CONTEXT_BOOLEAN_FIELDS } from '../lib/context.mjs';
import { parseDialogue } from '../server/model.mjs';
import { runWorkflow } from '../server/engine.mjs';

const now = '2026-11-04T14:20:00+08:00';
const values = parsed => Object.fromEntries(parsed.proposals.map(p => [p.field, p.value]));
function mock(proposals, inspect = () => {}) {
  return { LLM_API_KEY: 'memory-test', LLM_MODEL: 'memory-test', LLM_BASE_URL: 'https://unit.invalid/v1', FETCH: async (_url, init) => {
    const payload = JSON.parse(init.body), input = JSON.parse(payload.messages[1].content);
    assert.ok(input.contextSnapshot);
    assert.equal(input.panelSnapshot, undefined);
    inspect(input, payload.messages[0].content);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ proposals, ambiguities: [] }) } }] }));
  } };
}

test('chat snapshot and reminder state start independently of panel A and never inherit its example data', () => {
  const panel = { now: '2026-11-03T15:30:00+08:00', intent: 'eye', screenMinutes: 95, sleepState: 'awake', sitting: true };
  const panelState = { ordinaryCount: 4, recentCards: ['10'] };
  const before = JSON.stringify({ panel, panelState });
  const chat = createChatSnapshot(now), state = createReminderState(now);
  assert.equal(chat.now, now);
  assert.equal(chat.intent, 'general');
  assert.equal(chat.sleepState, 'unknown');
  for (const field of [...CONTEXT_BOOLEAN_FIELDS, 'screenMinutes', 'sedentaryMinutes', 'activityMinutes', 'simulatedInteractionAt']) assert.equal(Object.hasOwn(chat, field), false);
  assert.equal(state.ordinaryCount, 0);
  assert.equal(state.lastReminderAt, null);
  chat.intent = 'quiet'; state.recentCards.push('M001');
  assert.equal(JSON.stringify({ panel, panelState }), before);
  assert.deepEqual(createReminderState(now).recentCards, []);
});

test('Shanghai time conversion, live refresh and explicit time preserve independent clock semantics', () => {
  assert.equal(toShanghaiISO('2026-11-03T20:30:00Z'), '2026-11-04T04:30:00+08:00');
  assert.equal(toShanghaiISO(new Date('2026-11-04T05:00:00Z')), '2026-11-04T13:00:00+08:00');
  const chat = { ...createChatSnapshot(now), sleepObservedAt: now, sleepValidUntil: '2026-11-04T14:25:00+08:00' };
  const fresh = refreshChatTime(chat, Date.parse('2026-11-04T08:00:00Z'), 'live');
  assert.equal(fresh.now, '2026-11-04T16:00:00+08:00');
  assert.equal(fresh.sleepObservedAt, now);
  assert.equal(fresh.sleepState, 'unknown');
  assert.equal(refreshChatTime(chat, '2026-11-05T10:00:00Z', 'explicit').now, now);
  assert.equal(chat.now, now);
});

test('applying confirmed proposals returns a new snapshot and preserves saved conditions without setting wakefulness', () => {
  const chat = { ...createChatSnapshot(now), spaceEnough: true, canLeaveSeat: false };
  const next = applyDialogueProposals(chat, [
    { field: 'atMeal', value: false }, { field: 'mealPhase', value: 'after' }, { field: 'intent', value: 'quiet' },
    { field: 'screenMinutes', value: -1 }, { field: '__proto__', value: { unsafe: true } }
  ]);
  assert.equal(next.spaceEnough, true); assert.equal(next.canLeaveSeat, false);
  assert.equal(next.atMeal, false); assert.equal(next.mealPhase, 'after');
  assert.equal(next.sleepState, 'unknown'); assert.equal(next.screenMinutes, undefined);
  assert.equal(next.simulatedInteractionAt, undefined); assert.equal({}.unsafe, undefined);
  assert.equal(chat.atMeal, undefined); assert.equal(chat.intent, 'general');
  const observed = applyDialogueProposals(chat, [{ field: 'sleepState', value: 'asleep' }, { field: 'now', value: '2026-11-04T13:00:00+08:00' }]);
  assert.equal(observed.sleepObservedAt, '2026-11-04T13:00:00+08:00');
  assert.equal(observed.sleepValidUntil, '2026-11-04T13:05:00+08:00');
});

test('lunch and colloquial post-lunch tiredness do not invent clock, screen data or eye/move intent', async () => {
  const chat = createChatSnapshot(now);
  const parsed = await parseDialogue('刚吃完午饭，有点晕碳', chat);
  const p = values(parsed);
  assert.equal(p.atMeal, false); assert.equal(p.mealPhase, 'after');
  assert.ok(p.intent === 'quiet' || p.intent === undefined || p.intent === 'general');
  for (const field of ['now', 'screenMinutes', 'sedentaryMinutes', 'activityMinutes', 'sleepState']) assert.equal(p[field], undefined);
  assert.equal(chat.now, now);
});

test('meal phase is explicit: before and after are not currently eating; lunch alone has no phase or hour', async () => {
  for (const [text, phase, atMeal] of [['还没吃午饭', 'before', false], ['正在吃午饭', 'during', true], ['刚吃完午饭', 'after', false]]) {
    const p = values(await parseDialogue(text, createChatSnapshot(now)));
    assert.equal(p.mealPhase, phase); assert.equal(p.atMeal, atMeal); assert.equal(p.now, undefined);
  }
  const bare = values(await parseDialogue('午饭', createChatSnapshot(now)));
  assert.equal(bare.mealPhase, undefined); assert.equal(bare.atMeal, undefined); assert.equal(bare.now, undefined);
});

test('explicit clocks are parsed against the chat date; meal words and invalid clocks cannot change time', async () => {
  for (const [text, expected] of [
    ['现在13:00', '2026-11-04T13:00:00+08:00'],
    ['下午一点', '2026-11-04T13:00:00+08:00'],
    ['下午1:00', '2026-11-04T13:00:00+08:00'],
    ['明天13:00', '2026-11-05T13:00:00+08:00']
  ]) assert.equal(values(await parseDialogue(text, createChatSnapshot(now))).now, expected, text);
  for (const text of ['中午吃饭', '现在有点晕碳', '25:00', '看屏30分钟']) assert.equal(values(await parseDialogue(text, createChatSnapshot(now))).now, undefined, text);
});

test('negative execution conditions remain negative, including positive substrings inside negations', async () => {
  const text = '不可以离座，不能闭眼，不能远眺，没有固定扶手，空间不足，手边没有水，没戴耳机，不出门。';
  const p = values(await parseDialogue(text, createChatSnapshot(now)));
  for (const field of ['canLeaveSeat', 'canCloseEyes', 'canLookFar', 'hasSupport', 'spaceEnough', 'waterAvailable', 'headphones', 'goingOut']) assert.equal(p[field], false, field);
  const corrected = values(await parseDialogue('不能离座。现在可以离座。', createChatSnapshot(now)));
  assert.equal(corrected.canLeaveSeat, true);
});

test('LLM cannot use generic lunch evidence to inject eye/move intent or fabricated noon', async () => {
  const text = '刚吃完午饭，有点晕碳';
  for (const p of [
    { field: 'intent', value: 'eye', evidence: text },
    { field: 'intent', value: 'move', evidence: text },
    { field: 'now', value: '2026-11-04T12:00:00+08:00', evidence: '午饭' }
  ]) {
    const parsed = await parseDialogue(text, createChatSnapshot(now), mock([p]));
    assert.equal(parsed.providerMode, 'fallback');
    const safe = values(parsed);
    assert.equal(safe.now, undefined); assert.ok(!['eye', 'move'].includes(safe.intent));
  }
});

test('LLM numeric values must match the field and exact stated duration, not copied panel numbers', async () => {
  const text = '久坐55分钟，看屏25分钟';
  for (const p of [
    { field: 'screenMinutes', value: 95, evidence: '看屏25分钟' },
    { field: 'screenMinutes', value: 55, evidence: '久坐55分钟' },
    { field: 'canLeaveSeat', value: true, evidence: '不能离座' }
  ]) {
    const input = p.field === 'canLeaveSeat' ? '不能离座' : text;
    const parsed = await parseDialogue(input, createChatSnapshot(now), mock([p]));
    assert.equal(parsed.providerMode, 'fallback');
    assert.equal(values(parsed)[p.field], p.field === 'canLeaveSeat' ? false : 25);
  }
  const valid = await parseDialogue('看屏半小时', createChatSnapshot(now), mock([{ field: 'screenMinutes', value: 30, evidence: '看屏半小时' }]));
  assert.equal(valid.providerMode, 'live'); assert.equal(values(valid).screenMinutes, 30);
});

test('LLM explicit 13:00 stays live only when the proposed full time matches its evidence', async () => {
  const p = { field: 'now', value: '2026-11-04T13:00:00+08:00', evidence: '13:00' };
  const valid = await parseDialogue('现在13:00', createChatSnapshot(now), mock([p]));
  assert.equal(valid.providerMode, 'live'); assert.equal(values(valid).now, p.value);
  const incorrect = await parseDialogue('现在13:00', createChatSnapshot(now), mock([{ ...p, value: '2026-11-04T15:30:00+08:00' }]));
  assert.equal(incorrect.providerMode, 'fallback'); assert.equal(values(incorrect).now, p.value);
});

test('zero proposals can proceed to a grounded preview without invented background or quota', async () => {
  const chat = createChatSnapshot(now);
  const parsed = await parseDialogue('先看看有什么小事', chat, mock([]));
  assert.equal(parsed.providerMode, 'live'); assert.deepEqual(parsed.proposals, []);
  const result = await runWorkflow({ snapshot: applyDialogueProposals(chat, parsed.proposals), state: createReminderState(now), mode: 'preview' }, { RANDOM: () => 0, RUN_ID: 'empty-chat-preview' });
  assert.ok(result.card); assert.equal(result.state.ordinaryCount, 0);
  const frozen = result.trace.find(n => n.id === 'N03').output.snapshot;
  assert.equal(frozen.intent, 'general'); assert.equal(frozen.screenMinutes, undefined);
  assert.equal(frozen.sleepState, 'unknown'); assert.equal(frozen.now, now);
  assert.ok(!result.explanation.includes('看屏'));
});

test('post-lunch chat preview stays separate from panel and produces quiet content without invented eye context', async () => {
  const chat = createChatSnapshot(now), text = '刚吃完午饭，有点晕碳';
  const next = applyDialogueProposals(chat, (await parseDialogue(text, chat)).proposals);
  const result = await runWorkflow({ snapshot: next, state: createReminderState(now), mode: 'preview' }, { RANDOM: () => 0, RUN_ID: 'lunch-chat-preview' });
  assert.ok(result.card.tags.some(tag => ['quiet', 'breath', 'sleep'].includes(tag)));
  assert.equal(result.state.ordinaryCount, 0); assert.equal(result.decision.sleepState, 'unknown');
  assert.equal(next.now, now); assert.equal(next.screenMinutes, undefined);
  assert.ok(!result.explanation.includes('看屏'));
});
