import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../server/http.mjs';
import { normalizeAgentInput, MAX_AGENT_BODY_BYTES } from '../server/agent-api.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const origin = 'https://unit.invalid';
const accessKey = 'unit-agent-key-never-a-real-secret';
const fixedNow = Date.parse('2026-11-04T04:03:00Z');
const serverEnv = extra => ({ AGENT_API_KEY: accessKey, AGENT_NOW: () => fixedNow, ...extra });
function request(body = { snapshot: {} }, extra = {}) {
  const { token = accessKey, path = '/api/agent/card', headers = {}, method = 'POST', raw } = extra;
  return new Request(`${origin}${path}`, { method, headers: { ...(token === null ? {} : { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body: raw ?? JSON.stringify(body) }) });
}
const read = async response => ({ status: response.status, body: await response.json() });

test('agent discovery is public OpenAPI 3.1 with bearer security and a read-only function tool', async () => {
  const response = await handleApi(new Request(`${origin}/api/agent/openapi.json`));
  const schema = await response.json();
  assert.equal(response.status, 200); assert.match(schema.openapi, /^3\.1\./);
  assert.equal(schema.components.securitySchemes.agentBearer.scheme, 'bearer');
  assert.deepEqual(schema.paths['/api/agent/card'].post.security, [{ agentBearer: [] }]);
  assert.equal(schema['x-agent-tool-annotations'].readOnlyHint, true);
  const tool = schema['x-agent-tool'].function;
  assert.equal(tool.name, schema.paths['/api/agent/card'].post.operationId);
  assert.equal(tool.parameters.additionalProperties, false);
  assert.equal(tool.parameters.properties.snapshot.additionalProperties, false);
  assert.doesNotMatch(JSON.stringify(schema), /unit-agent-key|LLM_API_KEY/);
});

test('agent key must be configured; missing and wrong bearer tokens fail before workflow', async () => {
  const noKey = await read(await handleApi(request(), {}));
  assert.equal(noKey.status, 503); assert.equal(noKey.body.code, 'agent_api_not_configured');
  for (const token of [null, '', 'incorrect-token']) {
    const response = await handleApi(request(undefined, { token }), serverEnv({ FETCH: () => { throw Error('Must not fetch'); } }));
    assert.equal(response.status, 401); assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
    const text = await response.text(); assert.ok(!text.includes(accessKey)); assert.ok(!text.includes('incorrect-token'));
  }
});

test('agent API uses explicit methods and JSON media type, without a state-changing GET', async () => {
  assert.equal((await handleApi(request(undefined, { method: 'GET' }), serverEnv())).status, 405);
  assert.equal((await handleApi(request(undefined, { path: '/api/agent/openapi.json' }), serverEnv())).status, 405);
  assert.equal((await handleApi(request(undefined, { headers: { 'Content-Type': 'text/plain' } }), serverEnv())).status, 415);
  assert.equal((await handleApi(request(undefined, { path: '/api/agent/unknown' }), serverEnv())).status, 404);
});

test('default agent preview uses actual Shanghai clock, unknown conditions, no quota or persistent state', async () => {
  const input = { snapshot: { intent: 'quiet', mealPhase: 'after', atMeal: false } };
  const before = structuredClone(input);
  for (let i = 0; i < 2; i++) {
    const { status, body } = await read(await handleApi(request(input), serverEnv()));
    assert.equal(status, 200); assert.equal(body.now, '2026-11-04T12:03:00+08:00');
    assert.equal(body.mode, 'preview'); assert.equal(body.readOnly, true); assert.equal(body.persisted, false); assert.equal(body.counted, false);
    assert.equal(body.decision.countsTowardQuota, false); assert.equal(body.providerMode, 'offline');
    assert.ok(body.card); assert.equal(body.trace.length, 11);
    assert.equal(body.trace.find(n => n.id === 'N02').status, 'skipped');
    for (const key of ['state', 'snapshot', 'ordinaryCount', 'lastReminderAt', 'solarSeen', 'displayEvents']) assert.equal(Object.hasOwn(body, key), false);
    assert.doesNotMatch(body.explanation, /看屏|安静环境/);
  }
  assert.deepEqual(input, before);
  const normalized = normalizeAgentInput({ snapshot: {} }, fixedNow);
  assert.equal(normalized.sleepState, 'unknown'); assert.equal(normalized.intent, 'general');
  for (const key of ['canLeaveSeat', 'canCloseEyes', 'sitting', 'screenMinutes', 'simulatedInteractionAt']) assert.equal(Object.hasOwn(normalized, key), false);
});

test('static dates convert to Shanghai time and cannot silently normalize invalid calendar dates', async () => {
  const { body } = await read(await handleApi(request({ snapshot: { now: '2026-11-03T17:12:00Z' } }), serverEnv()));
  assert.equal(body.now, '2026-11-04T01:12:00+08:00'); assert.equal(body.card.timeLabel, '丑时');
  for (const now of ['2026-02-30T12:00:00+08:00', '2026-11-04T25:00:00+08:00', '2026-11-04T12:00:00', '12:00', 'not-a-date']) {
    const response = await handleApi(request({ snapshot: { now } }), serverEnv());
    assert.equal(response.status, 400, now);
  }
});

test('only whitelisted fields are accepted; env, backend, state and private locations cannot enter workflow', async () => {
  const forbidden = [
    { snapshot: {}, env: { LLM_BASE_URL: 'https://attacker.invalid' } },
    { snapshot: {}, backendURL: 'https://attacker.invalid' }, { snapshot: {}, catalog: {} },
    { snapshot: {}, state: { ordinaryCount: 6 } }, { snapshot: {}, mode: 'auto' },
    { snapshot: { address: '私密门牌地址' } }, { snapshot: { latitude: 30.123456, longitude: 120.123456 } },
    { snapshot: { weather: { observedAt: '2026-11-04T12:00:00+08:00', rain: false, address: '私密门牌地址' } } },
    { snapshot: { LLM_API_KEY: 'request-secret' } }, { snapshot: { seed: 'forced' } }
  ];
  for (const input of forbidden) {
    const response = await handleApi(request(input), serverEnv());
    assert.equal(response.status, 400);
    const text = await response.text(); assert.doesNotMatch(text, /私密门牌地址|request-secret|attacker\.invalid/);
  }
  assert.equal((await handleApi(request(undefined, { path: '/api/agent/card?mode=auto' }), serverEnv())).status, 400);
  const proto = await handleApi(request(undefined, { raw: '{"snapshot":{"__proto__":{"canLeaveSeat":true}}}' }), serverEnv());
  assert.equal(proto.status, 400); assert.equal({}.canLeaveSeat, undefined);
});

test('invalid shape, non-finite numbers, wrong booleans and conflicting facts are rejected', async () => {
  for (const input of [null, [], {}, { snapshot: [] }, { snapshot: null }, { snapshot: { screenMinutes: -1 } },
    { snapshot: { screenMinutes: 1441 } }, { snapshot: { sitting: 'true' } }, { snapshot: { canLeaveSeat: null } },
    { snapshot: { intent: 'diagnose' } }, { snapshot: { timezone: 'UTC' } },
    { snapshot: { mealPhase: 'after', atMeal: true } },
    { snapshot: { sleepObservedAt: '2026-11-04T12:00:00+08:00', sleepValidUntil: '2026-11-04T11:00:00+08:00' } },
    { snapshot: { weather: { rain: false } } }]) {
    assert.equal((await handleApi(request(input), serverEnv())).status, 400, JSON.stringify(input));
  }
  assert.equal((await handleApi(request(undefined, { raw: '{"snapshot":{"screenMinutes":1e400}}' }), serverEnv())).status, 400);
  assert.throws(() => normalizeAgentInput({ snapshot: { screenMinutes: NaN } }, fixedNow));
  assert.throws(() => normalizeAgentInput({ snapshot: { screenMinutes: Infinity } }, fixedNow));
});

test('request size is limited by bytes even without a Content-Length header', async () => {
  const over = JSON.stringify({ snapshot: { address: '字'.repeat(MAX_AGENT_BODY_BYTES / 2) } });
  assert.ok(over.length < MAX_AGENT_BODY_BYTES);
  assert.equal((await handleApi(request(undefined, { raw: over }), serverEnv())).status, 413);
  assert.equal((await handleApi(request(undefined, { raw: '{broken-json' }), serverEnv())).status, 400);
});

test('card steps and sources come from fixed catalog and caller/server catalog overrides are ignored', async () => {
  const original = JSON.stringify(catalog);
  const { status, body } = await read(await handleApi(request({ snapshot: { intent: 'eye', screenMinutes: 25 } }), serverEnv({ CATALOG: { cards: [], sources: [] } })));
  assert.equal(status, 200); assert.ok(body.card);
  const fixed = catalog.cards.find(c => c.id === body.card.id);
  assert.deepEqual(body.card.steps, fixed.steps); assert.equal(body.card.sourceId, fixed.sourceId);
  const source = catalog.sources.find(s => s.id === fixed.sourceId);
  assert.deepEqual(body.sources, [{ id: source.id, title: source.title, label: source.label || '', text: source.text, url: source.url || '' }]);
  body.card.steps.push('client-only');
  assert.equal(JSON.stringify(catalog), original);
});

test('solar agent preview does not persist first-seen or ordinary reminder state', async () => {
  const input = { snapshot: { now: '2026-11-07T00:10:00+08:00', previewSolar: true } };
  for (let i = 0; i < 2; i++) {
    const { body } = await read(await handleApi(request(input), serverEnv()));
    assert.equal(body.card.id, 'solar:2026-11-07:立冬'); assert.equal(body.card.isSolar, true);
    assert.equal(body.decision.route, 'solar'); assert.equal(body.counted, false); assert.equal(body.persisted, false);
    assert.equal(body.sources[0].text, catalog.solar.find(s => s.term === '立冬').quote);
  }
});

function modelEnv(mode) {
  return serverEnv({ LLM_API_KEY: 'unit-model-key', LLM_MODEL: 'unit-model', LLM_BASE_URL: 'https://model.invalid/v1',
    FETCH: async (url, init) => {
      assert.equal(url, 'https://model.invalid/v1/chat/completions');
      assert.equal(init.headers.Authorization, 'Bearer unit-model-key');
      assert.ok(!init.body.includes(accessKey));
      const input = JSON.parse(JSON.parse(init.body).messages[1].content);
      const output = mode === 'fallback' ? 'invalid-json' : input.providedTags
        ? JSON.stringify({ queryText: '当前时段 安静休息', contextTags: input.providedTags })
        : JSON.stringify({ explanation: '结合当前时段，从符合已确认条件的候选中选出这张卡。', sourceIds: [input.retrievedSources[0].sourceId], reasonIds: ['time', 'selection'] });
      return new Response(JSON.stringify({ choices: [{ message: { content: output } }] }));
    }
  });
}
test('providerMode honestly distinguishes live mocks from fallback and exposes no secrets or raw trace', async () => {
  for (const mode of ['live', 'fallback']) {
    const response = await handleApi(request({ snapshot: { intent: 'quiet' } }), modelEnv(mode));
    const raw = await response.text(), body = JSON.parse(raw);
    assert.equal(response.status, 200); assert.equal(body.providerMode, mode);
    assert.equal(body.trace.find(n => n.id === 'N08').status, mode === 'live' ? 'success' : 'fallback');
    for (const n of body.trace) { assert.equal(Object.hasOwn(n, 'input'), false); assert.equal(Object.hasOwn(n, 'output'), false); }
    assert.doesNotMatch(raw, /unit-model-key|unit-agent-key|LLM_API_KEY|AGENT_API_KEY|rawOutput|contextSnapshot|model\.invalid/);
  }
});
