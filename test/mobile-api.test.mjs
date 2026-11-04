import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { handleApi } from '../server/http.mjs';
import { runWorkflow } from '../server/engine.mjs';
import { normalizeMobileInput, MAX_MOBILE_BODY_BYTES } from '../server/mobile.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const origin = 'https://unit.invalid';
const fixedNow = Date.parse('2026-11-04T08:03:00Z');
const request = (body = {}, options = {}) => new Request(`${origin}${options.path || '/api/mobile/card'}`, {
  method: options.method || 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...options.headers },
  ...(options.method === 'GET' ? {} : { body: options.raw ?? JSON.stringify(body) })
});
const call = async (body, env = {}) => { const response = await handleApi(request(body), { MOBILE_NOW: () => fixedNow, ...env }); return { status: response.status, body: await response.json() }; };

test('mobile chat applies lunch context directly without guessing noon or demanding confirmation', async () => {
  const { status, body } = await call({ text: '我刚吃完午饭，有点晕碳，想安静坐一会。' });
  assert.equal(status, 200); assert.ok(body.card); assert.equal(body.requiresConfirmation, undefined);
  assert.equal(body.context.now, '2026-11-04T16:03:00+08:00');
  assert.equal(body.card.timeLabel, '申时'); assert.equal(body.context.mealPhase, 'after');
  assert.equal(body.context.atMeal, false); assert.equal(body.context.intent, 'quiet');
  assert.equal(body.context.screenMinutes, undefined); assert.equal(body.context.sleepState, 'unknown');
  const n3 = body.trace.find(n => n.id === 'N03');
  assert.equal(n3.status, 'success'); assert.equal(n3.input.confirmed, false);
  assert.equal(n3.input.confirmationMode, 'automatic-from-user-message');
  assert.equal(body.trace.find(n => n.id === 'N11').output.inputSources.situation, 'user-description-automatically-parsed');
  assert.equal(body.state.ordinaryCount, 0); assert.equal(body.decision.countsTowardQuota, false);
});

test('explicit chat clock overrides supplied clock; unmentioned conditions remain unknown', async () => {
  const { body } = await call({ text: '现在晚上十一点半，我还醒着，不能起身，想休息。', snapshot: { now: '2026-11-04T16:03:00+08:00' } });
  assert.equal(body.context.now, '2026-11-04T23:30:00+08:00');
  assert.equal(body.context.sleepState, 'awake'); assert.equal(body.context.canLeaveSeat, false);
  assert.equal(body.context.sleepObservedAt, body.context.now);
  for (const field of ['canCloseEyes', 'sitting', 'spaceEnough', 'screenMinutes']) assert.equal(body.context[field], undefined);
  assert.equal(body.card.timeLabel, '子时'); assert.ok(body.card.night);
});

test('empty chat uses real server time and preview, while explicit simulated time is accepted', async () => {
  const { body: ordinary } = await call({});
  assert.equal(ordinary.context.now, '2026-11-04T16:03:00+08:00');
  assert.equal(ordinary.context.inputMode, 'daily'); assert.equal(ordinary.context.sleepState, 'unknown');
  assert.equal(ordinary.trace.find(n => n.id === 'N02').status, 'skipped');
  assert.ok(ordinary.card);
  const { body: solar } = await call({ snapshot: { now: '2026-11-07T00:10:00+08:00', previewSolar: true } });
  assert.equal(solar.card.id, 'solar:2026-11-07:立冬');
  assert.equal(solar.state.ordinaryCount, 0); assert.deepEqual(solar.state.solarSeen, {});
});

test('only last three card IDs survive input state and fixed catalog cannot be overridden', async () => {
  const { body: first } = await call({});
  const { body: next } = await call({ state: { recentCards: [first.card.id] } }, { CATALOG: { cards: [], sources: [] } });
  assert.ok(next.card); assert.notEqual(next.card.id, first.card.id);
  assert.deepEqual(next.card.steps, catalog.cards.find(c => c.id === next.card.id).steps);
  assert.equal(next.state.ordinaryCount, 0);
});

test('mobile endpoint rejects runtime/provider/raw-device injection and invalid inputs', async () => {
  const invalid = [null, [], { snapshot: null }, { text: 1 }, { text: 'a'.repeat(1201) },
    { env: { LLM_API_KEY: 'request-secret' } }, { mode: 'auto' }, { confirmed: true }, { catalog: {} },
    { state: { ordinaryCount: 2 } }, { state: { recentCards: ['1', '2', '3', '4'] } },
    { snapshot: { now: '2026-02-30T12:00:00+08:00' } }, { snapshot: { now: '12:00' } },
    { snapshot: { now: '2026-11-04T12:00:00' } }, { snapshot: { timezone: 'UTC' } },
    { snapshot: { seed: 'control' } }, { snapshot: { inputMode: 'panel' } },
    { snapshot: { address: 'private-address' } }, { snapshot: { latitude: 31.1 } },
    { snapshot: { usageStats: { privateApp: 30 } } }, { snapshot: { screenMinutes: null } },
    { snapshot: { activityMinutes: -1 } }, { snapshot: { canLeaveSeat: 'yes' } },
    { snapshot: { weather: { source: 'simulation', observedAt: '2026-11-04T12:00:00+08:00' } } },
    { snapshot: { mealPhase: 'after', atMeal: true } }, { snapshot: { dnd: [{ start: '24:00', end: '06:00' }] } }
  ];
  for (const input of invalid) {
    const { status, body } = await call(input);
    assert.equal(status, 400, JSON.stringify(input));
    assert.doesNotMatch(JSON.stringify(body), /request-secret|private-address|privateApp/);
  }
  assert.throws(() => normalizeMobileInput({ snapshot: { screenMinutes: NaN } }, fixedNow));
  assert.throws(() => normalizeMobileInput({ snapshot: { activityMinutes: Infinity } }, fixedNow));
  const proto = await handleApi(request({}, { raw: '{"snapshot":{"__proto__":{"canLeaveSeat":true}}}' }));
  assert.equal(proto.status, 400); assert.equal({}.canLeaveSeat, undefined);
});

test('HTTP boundary enforces same-origin JSON POST and 16 KiB measured in bytes', async () => {
  for (const [options, expected] of [
    [{ method: 'GET' }, 405], [{ headers: { Origin: 'https://other.invalid' } }, 403],
    [{ headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403],
    [{ headers: { 'Content-Type': 'text/plain' } }, 415],
    [{ path: '/api/mobile/card?mode=auto' }, 400], [{ path: '/api/mobile/other' }, 404],
    [{ raw: '{bad-json' }, 400], [{ raw: JSON.stringify({ text: '字'.repeat(MAX_MOBILE_BODY_BYTES / 2) }) }, 413]
  ]) assert.equal((await handleApi(request({}, options))).status, expected);
});

test('live model parses once, applies validated evidence, then performs query and explanation', async () => {
  let parseCalls = 0, queryCalls = 0, explainCalls = 0;
  const env = { LLM_API_KEY: 'unit-model-secret', LLM_MODEL: 'test-model', LLM_BASE_URL: 'https://model.invalid/v1',
    FETCH: async (_url, init) => {
      const input = JSON.parse(JSON.parse(init.body).messages[1].content);
      let output;
      if (input.allowedFields) {
        parseCalls++;
        output = { proposals: [{ field: 'intent', value: 'quiet', evidence: '想安静' }, { field: 'sitting', value: true, evidence: '坐着' }], ambiguities: [] };
      } else if (input.providedTags) {
        queryCalls++; assert.equal(input.snapshot.sitting, true); assert.equal(input.snapshot.intent, 'quiet');
        output = { queryText: '安静休息', contextTags: input.providedTags };
      } else {
        explainCalls++;
        output = { explanation: '结合当前时段，为你选出这张安静休息卡。', sourceIds: [input.retrievedSources[0].sourceId], reasonIds: ['time', 'selection'] };
      }
      return Response.json({ choices: [{ message: { content: JSON.stringify(output) } }] });
    }
  };
  const { status, body } = await call({ text: '我坐着，想安静一会。' }, env);
  assert.equal(status, 200); assert.ok(body.card); assert.equal(body.providerMode, 'live');
  assert.deepEqual([parseCalls, queryCalls, explainCalls], [1, 1, 1]);
  assert.equal(body.context.sitting, true);
  assert.doesNotMatch(JSON.stringify(body), /unit-model-secret|LLM_API_KEY/);
});

test('invalid model fields fall back to evidence-based parsing without applying hallucinated permissions', async () => {
  const { body } = await call({ text: '我刚吃完午饭。' }, {
    LLM_API_KEY: 'unit-secret', LLM_MODEL: 'unit-model',
    FETCH: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ proposals: [{ field: 'canLeaveSeat', value: true, evidence: '我刚吃完午饭' }] }) } }] })
  });
  assert.equal(body.providerMode, 'fallback'); assert.ok(body.card);
  assert.equal(body.context.canLeaveSeat, undefined); assert.equal(body.context.mealPhase, 'after');
  assert.equal(body.context.now, '2026-11-04T16:03:00+08:00');
});

test('legacy workflow still waits for confirmation unless explicitly using mobile automatic application', async () => {
  const legacy = await runWorkflow({ snapshot: { now: '2026-11-04T16:03:00+08:00', inputMode: 'chat' }, dialogue: '我刚吃完午饭。', mode: 'preview' });
  assert.equal(legacy.requiresConfirmation, true); assert.equal(legacy.card, null);
});

const workerSource = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8');
const linkedWorker = stripTypeScriptTypes(workerSource).replace("'../server/http.mjs'", JSON.stringify(new URL('../server/http.mjs', import.meta.url).href));
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(linkedWorker).toString('base64')}`);
test('mobile model calls use the same fail-closed Worker rate limit as other model endpoints', async () => {
  assert.equal((await worker.fetch(request({}), {})).status, 503);
  const keys = [];
  const denied = await worker.fetch(request({}), { DEMO_RATE_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } });
  assert.equal(denied.status, 429); assert.equal(denied.headers.get('Retry-After'), '60');
  assert.deepEqual(keys, ['shichen-demo-model-requests']);
});
