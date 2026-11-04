import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflow, parseDialogue, retrieveCatalog, evaluateEligibility } from '../server/engine.mjs';
import { requestModel } from '../server/model.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const copy = value => JSON.parse(JSON.stringify(value));
const snapshot = (changes = {}) => ({
  now: '2026-11-03T15:30:00+08:00', timezone: 'Asia/Shanghai', sleepState: 'awake',
  usualAwake: { start: '07:00', end: '23:00' }, scheduleConfirmed: true,
  dnd: [], screenMinutes: 90, sedentaryMinutes: 60, activityMinutes: 0,
  intent: 'eye', canLookFar: true, canCloseEyes: true, sitting: true,
  canLeaveSeat: false, spaceEnough: false, ...changes
});
const state = (changes = {}) => ({ day: '2026-11-03', ordinaryCount: 1, lastReminderAt: '2026-11-03T13:20:00+08:00', recentCards: [], solarSeen: {}, displayEvents: [], ...changes });
let number = 0;
const env = (changes = {}) => ({ RUN_ID: `test-${++number}`, RANDOM: () => 0, ...changes });
const node = (result, id) => result.trace.find(n => n.id === id);
const liveEnv = (reply) => env({ LLM_API_KEY: 'test-secret', LLM_MODEL: 'test-model', LLM_BASE_URL: 'https://example.invalid/v1',
  FETCH: async (url, init) => {
    assert.equal(url, 'https://example.invalid/v1/chat/completions');
    const request = JSON.parse(init.body);
    const input = JSON.parse(request.messages[1].content);
    const content = await reply(input, request.messages[0].content);
    return new Response(JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }), { status: 200 });
  }
});

test('offline mode really retrieves fixed cards without mutating input or claiming AI success', async () => {
  const inputSnapshot = snapshot(), inputState = state();
  const beforeSnapshot = copy(inputSnapshot), beforeState = copy(inputState);
  const result = await runWorkflow({ snapshot: inputSnapshot, state: inputState }, env());
  assert.equal(result.providerMode, 'offline');
  assert.equal(result.decision.allowed, true);
  assert.ok(result.card.tags.includes('eye'));
  assert.deepEqual(result.card.steps, catalog.cards.find(c => c.id === result.card.id).steps);
  assert.equal(result.card.source.id, result.card.sourceId);
  assert.equal(node(result, 'N04').status, 'fallback');
  assert.equal(node(result, 'N05').status, 'success');
  assert.ok(node(result, 'N05').output.hits.length > 0);
  assert.equal(node(result, 'N08').status, 'fallback');
  assert.equal(result.state.ordinaryCount, 2);
  assert.equal(result.trace.length, 11);
  assert.deepEqual(inputSnapshot, beforeSnapshot);
  assert.deepEqual(inputState, beforeState);
});

test('normal daily quota and two-hour interval are enforced; preview uses neither', async () => {
  const full = await runWorkflow({ snapshot: snapshot(), state: state({ ordinaryCount: 6 }) }, env());
  assert.equal(full.card, null);
  assert.match(full.decision.reason, /6次/);
  assert.equal(node(full, 'N08').status, 'skipped');
  const tooSoon = await runWorkflow({ snapshot: snapshot(), state: state({ lastReminderAt: '2026-11-03T14:30:00+08:00' }) }, env());
  assert.equal(tooSoon.card, null);
  assert.match(tooSoon.decision.reason, /2小时/);
  const preview = await runWorkflow({ snapshot: snapshot(), state: state({ ordinaryCount: 6 }), mode: 'preview' }, env());
  assert.ok(preview.card);
  assert.equal(preview.state.ordinaryCount, 6);
  assert.equal(preview.state.lastReminderAt, '2026-11-03T13:20:00+08:00');
});

test('sleep, busy and DND suppress proactive display; real evaluator click cannot wake virtual user', async () => {
  for (const change of [{ sleepState: 'asleep', sleepObservedAt: '2026-11-03T15:29:00+08:00', evaluatorClicked: true, foreground: true, lastUserInteractionAt: '2026-11-03T15:30:00+08:00' }, { busy: true }, { dnd: [{ start: '15:00', end: '16:00' }] }]) {
    const result = await runWorkflow({ snapshot: snapshot(change), state: state() }, env());
    assert.equal(result.card, null);
    assert.equal(result.state.ordinaryCount, 1);
  }
});

test('unknown night remains app-only; daytime unknown uses confirmed schedule without becoming awake', async () => {
  const night = await runWorkflow({ snapshot: snapshot({ now: '2026-11-03T23:30:00+08:00', sleepState: 'unknown' }), state: state() }, env());
  assert.equal(night.card, null);
  assert.equal(night.decision.channel, 'in_app');
  assert.equal(night.decision.sleepState, 'unknown');
  const day = await runWorkflow({ snapshot: snapshot({ sleepState: 'unknown' }), state: state() }, env());
  assert.ok(day.card);
  assert.equal(day.decision.permissionBySchedule, true);
  assert.equal(day.decision.sleepState, 'unknown');
  const unconfirmed = await runWorkflow({ snapshot: snapshot({ sleepState: 'unknown', scheduleConfirmed: false }), state: state() }, env());
  assert.equal(unconfirmed.card, null);
  const stale = await runWorkflow({ snapshot: snapshot({ sleepState: 'awake', sleepObservedAt: '2026-11-03T15:00:00+08:00' }), state: state() }, env());
  assert.equal(stale.decision.sleepState, 'unknown');
});

test('solar first confirmation including midnight survives full ordinary quota, is grounded, and is recorded once', async () => {
  const s = snapshot({ now: '2026-11-07T00:10:00+08:00', intent: 'general' });
  const before = state({ day: '2026-11-07', ordinaryCount: 6, lastReminderAt: '2026-11-07T00:00:00+08:00' });
  const result = await runWorkflow({ snapshot: s, state: before }, env());
  assert.equal(result.card.id, 'solar:2026-11-07:立冬');
  assert.equal(result.card.isSolar, true);
  assert.equal(result.state.ordinaryCount, 6);
  assert.equal(result.state.lastReminderAt, s.now);
  assert.equal(result.state.solarSeen['2026-11-07:立冬'], true);
  assert.equal(node(result, 'N05').output.hits[0].sourceId, result.card.sourceId);
  assert.equal(result.decision.countsTowardQuota, false);
  const again = await runWorkflow({ snapshot: s, state: result.state }, env());
  assert.equal(again.card, null);
  assert.match(again.decision.reason, /6次/);
});

test('solar preview leaves first-seen marker and reminder interval unchanged', async () => {
  const result = await runWorkflow({ snapshot: snapshot({ now: '2026-11-07T00:10:00+08:00', previewSolar: true }), state: state({ day: '2026-11-07' }), mode: 'preview' }, env());
  assert.equal(result.card.isSolar, true);
  assert.deepEqual(result.state.solarSeen, {});
  assert.equal(result.state.ordinaryCount, 1);
  assert.equal(result.state.lastReminderAt, '2026-11-03T13:20:00+08:00');
});

test('ordinary snooze keeps original card, exempts own repeat and interval but still counts and checks current state', async () => {
  const s = snapshot({ now: '2026-11-03T15:40:00+08:00', snooze: { sourceCardId: '10', dueAt: '2026-11-03T15:40:00+08:00', parentDisplayEventId: 'parent' } });
  const before = state({ ordinaryCount: 2, recentCards: ['10'], lastReminderAt: '2026-11-03T15:30:00+08:00' });
  const result = await runWorkflow({ snapshot: s, state: before, mode: 'snooze' }, env());
  assert.equal(result.card.id, '10');
  assert.equal(result.state.ordinaryCount, 3);
  assert.equal(result.state.lastReminderAt, s.now);
  const asleep = await runWorkflow({ snapshot: { ...s, sleepState: 'asleep' }, state: before, mode: 'snooze' }, env());
  assert.equal(asleep.card, null);
  const early = await runWorkflow({ snapshot: { ...s, now: '2026-11-03T15:39:00+08:00' }, state: before, mode: 'snooze' }, env());
  assert.equal(early.card, null);
});

test('solar snooze does not count; old solar card cannot be deferred into next date', async () => {
  const s = snapshot({ now: '2026-11-07T15:40:00+08:00', snooze: { sourceCardId: 'solar:2026-11-07:立冬', dueAt: '2026-11-07T15:40:00+08:00' } });
  const before = state({ day: '2026-11-07', ordinaryCount: 6, solarSeen: { '2026-11-07:立冬': true } });
  const result = await runWorkflow({ snapshot: s, state: before, mode: 'snooze' }, env());
  assert.equal(result.card.isSolar, true);
  assert.equal(result.state.ordinaryCount, 6);
  const nextDay = await runWorkflow({ snapshot: { ...s, now: '2026-11-08T15:40:00+08:00' }, state: before, mode: 'snooze' }, env());
  assert.equal(nextDay.card, null);
});

test('reroll removes recent three, does not count, and never treats empty hours as all-day', async () => {
  const result = await runWorkflow({ snapshot: snapshot({ intent: 'general', canLeaveSeat: true, spaceEnough: true, hasSupport: true }), state: state({ recentCards: ['03', '04', '05'] }), mode: 'reroll' }, env());
  assert.ok(result.card);
  assert.ok(!['03', '04', '05'].includes(result.card.id));
  assert.ok(result.card.hours.includes(15));
  assert.equal(result.state.ordinaryCount, 1);
  const smallCatalog = { ...catalog, cards: catalog.cards.filter(c => ['10', '11'].includes(c.id)) };
  const exhausted = await runWorkflow({ snapshot: snapshot(), state: state({ recentCards: ['10', '11'] }), mode: 'reroll' }, env({ CATALOG: smallCatalog }));
  assert.equal(exhausted.card, null);
  const noHours = { ...catalog.cards[0], hours: [], tags: ['eye'], requirements: {} };
  assert.equal(evaluateEligibility({ card: noHours, snapshot: snapshot(), context: { hour: 15 } }).eligible, false);
});

test('missing source fails closed even though card text matches query', async () => {
  const broken = copy(catalog); broken.sources = [];
  assert.deepEqual(retrieveCatalog({ queryText: '远眺', tags: ['eye'], hour: 15 }, broken), []);
  const result = await runWorkflow({ snapshot: snapshot(), state: state() }, env({ CATALOG: broken }));
  assert.equal(result.card, null);
  assert.equal(node(result, 'N05').status, 'blocked');
});

test('live adapter makes actual query and explanation calls with trace and immutable action steps', async () => {
  let calls = 0;
  const result = await runWorkflow({ snapshot: snapshot(), state: state() }, liveEnv(input => {
    calls++;
    if (input.providedTags) return { contextTags: ['eye'], intent: 'eye', queryText: '眼睛 远眺 闭目', evidenceFields: ['screenMinutes'] };
    return { explanation: '申时，结合看屏后的休息情境，选出这张符合当前条件的卡。', sourceIds: [input.retrievedSources[0].sourceId], reasonIds: ['time', 'screen'] };
  }));
  assert.equal(calls, 2);
  assert.equal(result.providerMode, 'live');
  assert.equal(node(result, 'N04').output.queryText, '眼睛 远眺 闭目');
  assert.equal(node(result, 'N08').status, 'success');
  assert.deepEqual(result.card.steps, catalog.cards.find(c => c.id === result.card.id).steps);
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});

test('invalid JSON and ungrounded explanation fall back visibly and cannot alter action', async () => {
  const invalid = await runWorkflow({ snapshot: snapshot(), state: state() }, liveEnv(() => 'not-json'));
  assert.ok(invalid.card);
  assert.equal(invalid.providerMode, 'fallback');
  assert.equal(node(invalid, 'N08').status, 'fallback');
  const invented = await runWorkflow({ snapshot: snapshot(), state: state() }, liveEnv(input => input.providedTags
    ? { contextTags: ['eye'], queryText: '远眺' }
    : { explanation: '今天做这个最有效，按压100次。', sourceIds: ['invented-source'], steps: ['危险替换'] }));
  assert.ok(invented.card);
  assert.equal(node(invented, 'N08').status, 'fallback');
  assert.ok(!invented.explanation.includes('100'));
  assert.deepEqual(invented.card.steps, catalog.cards.find(c => c.id === invented.card.id).steps);
});

const lunchContext = (changes = {}) => ({ now: '2026-11-04T12:03:00+08:00', timezone: 'Asia/Shanghai', inputMode: 'chat',
  sleepState: 'unknown', intent: 'quiet', mealPhase: 'after', atMeal: false, dnd: [], ...changes });
const explanationEnv = (explanation, reasonIds, inspect = () => {}) => liveEnv((input, prompt) => {
  if (input.providedTags) return { contextTags: input.providedTags, queryText: '当前时段 日常休息' };
  inspect(input, prompt);
  return { explanation, sourceIds: [input.retrievedSources[0].sourceId], reasonIds };
});

test('actual lunch hallucination with valid IDs falls back without inventing screen use or quiet surroundings', async () => {
  const hallucination = '午时静心小憩，结合看屏后的休息意愿与安静环境，匹配到这张卡。';
  let explanationCalls = 0;
  const result = await runWorkflow({ snapshot: lunchContext(), state: {}, mode: 'preview' }, explanationEnv(hallucination, ['time', 'request-quiet'], (input, prompt) => {
    explanationCalls++;
    assert.ok(!input.allowedReasons.some(r => ['screen', 'current-sitting', 'closed-eyes-available'].includes(r.id)));
    assert.ok(input.allowedReasons.some(r => r.id === 'after-meal'));
    assert.ok(!prompt.includes('合格示例：“申时，结合看屏'));
  }));
  assert.equal(explanationCalls, 1, 'validation must not retry the model');
  assert.equal(node(result, 'N08').status, 'fallback');
  assert.equal(node(result, 'N08').output.rawOutput.explanation, hallucination);
  assert.match(node(result, 'N08').output.error, /看屏经历/);
  assert.doesNotMatch(result.explanation, /看屏|安静环境/);
  assert.match(result.explanation, /餐后/);
  assert.equal(result.state.ordinaryCount, 0);
  assert.deepEqual(result.card.steps, catalog.cards.find(c => c.id === result.card.id).steps);
});

test('uncited or unknown context cannot be smuggled through legal generic reason IDs', async () => {
  for (const claim of ['安静环境', '周围很安静', '久坐经历', '刚运动', '运动后', '当前坐稳', '可以闭目', '可以看远', '可以离座', '空间充足', '已有稳固支撑', '手边有水', '正在使用耳机', '准备出门']) {
    const result = await runWorkflow({ snapshot: lunchContext(), mode: 'preview' }, explanationEnv(`午时，结合${claim}，选出这张卡。`, ['time', 'request-quiet']));
    assert.equal(node(result, 'N08').status, 'fallback', claim);
    assert.match(node(result, 'N08').output.error, /解释使用未确认或未引用/, claim);
  }
  for (const change of [{ mealPhase: undefined }, { screenMinutes: 30 }]) {
    const text = change.screenMinutes ? '午时，结合看屏后的休息情境，选出这张卡。' : '午时，结合餐后情境，选出这张卡。';
    const result = await runWorkflow({ snapshot: lunchContext(change), mode: 'preview' }, explanationEnv(text, ['time', 'selection']));
    assert.equal(node(result, 'N08').status, 'fallback', 'a fact must exist and its reason ID must be cited');
  }
});

test('confirmed meal, quiet intent and execution conditions keep grounded explanations live', async () => {
  for (const [changes, explanation, ids] of [
    [{}, '午时，结合餐后想安静休息的意愿，从符合条件的候选中选出这张卡。', ['time', 'after-meal', 'request-quiet', 'selection']],
    [{ sitting: true, canCloseEyes: true }, '结合餐后、已坐稳且可以闭目的条件，选出这张卡。', ['after-meal', 'current-sitting', 'closed-eyes-available']],
    [{ canLookFar: true, canLeaveSeat: true }, '结合餐后、可以看远及可以离座的条件，选出这张卡。', ['after-meal', 'look-far-available', 'leave-seat-available']],
    [{ activityMinutes: 10 }, '结合餐后情境、近期活动记录与安静休息主题，选出这张卡。', ['after-meal', 'activity-duration', 'request-quiet']]
  ]) {
    const result = await runWorkflow({ snapshot: lunchContext(changes), mode: 'preview' }, explanationEnv(explanation, ids));
    assert.equal(node(result, 'N08').status, 'success', node(result, 'N08').output.error);
    assert.equal(result.explanation, explanation);
    assert.equal(result.providerMode, 'live');
  }
});

test('eye topic or eye-rest intention alone neither asserts screen history nor pollutes fallback', async () => {
  const s = lunchContext({ intent: 'eye', mealPhase: undefined });
  const text = '午时，结合休息眼睛的意愿，选出这张眼部休息主题的卡。';
  const live = await runWorkflow({ snapshot: s, mode: 'preview' }, explanationEnv(text, ['time', 'request-eye']));
  assert.equal(node(live, 'N08').status, 'success');
  const fallback = await runWorkflow({ snapshot: s, mode: 'preview' }, explanationEnv('午时，结合看屏后的休息情境，选出这张卡。', ['time', 'request-eye']));
  assert.equal(node(fallback, 'N08').status, 'fallback');
  assert.match(fallback.explanation, /休息眼睛/);
  assert.doesNotMatch(fallback.explanation, /看屏/);
});

test('dialogue proposes explicit changes and waits; confirmed panel remains authoritative', async () => {
  const text = '现在15:30，已经睡着，不能离座。';
  const parsed = await parseDialogue(text, snapshot(), {});
  assert.equal(parsed.providerMode, 'offline');
  assert.ok(parsed.proposals.some(p => p.field === 'sleepState' && p.value === 'asleep'));
  assert.ok(parsed.conflicts.some(p => p.field === 'sleepState'));
  const waiting = await runWorkflow({ snapshot: snapshot(), state: state(), dialogue: text }, env());
  assert.equal(waiting.requiresConfirmation, true);
  assert.equal(node(waiting, 'N03').status, 'waiting');
  assert.equal(node(waiting, 'N04').status, 'skipped');
  const confirmed = await runWorkflow({ snapshot: snapshot(), state: state(), dialogue: text, confirmed: true }, env());
  assert.ok(confirmed.card);
  assert.equal(confirmed.decision.sleepState, 'awake');
});

test('duplicate display and superseded run do not commit state', async () => {
  const fixedEnv = env();
  const first = await runWorkflow({ snapshot: snapshot(), state: state(), mode: 'preview' }, fixedEnv);
  const duplicate = await runWorkflow({ snapshot: snapshot(), state: first.state, mode: 'preview' }, fixedEnv);
  assert.equal(duplicate.card, null);
  assert.match(duplicate.decision.reason, /已提交/);
  assert.equal(duplicate.state.displayEvents.length, 1);
  const stale = await runWorkflow({ snapshot: snapshot(), state: state() }, env({ IS_CURRENT_RUN: () => false }));
  assert.equal(stale.card, null);
  assert.equal(stale.state.ordinaryCount, 1);
});

test('invalid snapshot is rejected before model or retrieval', async () => {
  const result = await runWorkflow({ snapshot: snapshot({ now: 'not-a-date' }), state: state() }, liveEnv(() => { throw Error('Must not run'); }));
  assert.equal(result.card, null);
  assert.equal(node(result, 'N01').status, 'error');
  assert.equal(node(result, 'N05').status, 'skipped');
});

test('thinking settings use provider-specific top-level HTTP fields and remain portable', async () => {
  for (const [base, setting, expected] of [
    ['https://api.deepseek.com', 'disabled', 'deepseek'],
    ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'disabled', 'qwen'],
    ['https://api.openai.com/v1', 'disabled', 'generic'],
    ['https://api.deepseek.com', undefined, 'generic']
  ]) {
    let sent;
    const result = await requestModel({ system: 'Return JSON.', input: {} }, {
      LLM_BASE_URL: base, LLM_API_KEY: 'test-key', LLM_MODEL: 'test-model', LLM_THINKING: setting,
      FETCH: async (_url, init) => {
        sent = JSON.parse(init.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
      }
    });
    assert.equal(result.mode, 'live');
    assert.equal(sent.extra_body, undefined);
    assert.deepEqual(sent.thinking, expected === 'deepseek' ? { type: 'disabled' } : undefined);
    assert.equal(sent.enable_thinking, expected === 'qwen' ? false : undefined);
  }
});
