import { runWorkflow } from './engine.mjs';
import catalog from './catalog.json' with { type: 'json' };
import { createChatSnapshot, createReminderState, toShanghaiISO, CONTEXT_FOCUS_VALUES, ACTIVITY_PHASES } from '../lib/context.mjs';

export const MAX_AGENT_BODY_BYTES = 16_384;
const VERSION = '1.0.0';
const enumField = (values, description) => ({ type: 'string', enum: values, description });
const dateField = description => ({ type: 'string', format: 'date-time', maxLength: 35, description });
const conditionNames = {
  canLeaveSeat: '已确认可以离开座位', canLookFar: '已确认可以安全看远', canCloseEyes: '已确认可以短暂闭目',
  sitting: '已确认坐稳', spaceEnough: '已确认活动空间足够', hasSupport: '已确认有稳固支撑',
  waterAvailable: '已确认有合适饮用水', headphones: '已确认正在使用耳机', atMeal: '已确认正在用餐', goingOut: '已确认准备出门'
};
const snapshotProperties = {
  now: dateField('可省略：使用服务器当前北京时间。指定时须为带时区的 ISO 日期时间，如 2026-11-04T12:03:00+08:00。'),
  timezone: { type: 'string', const: 'Asia/Shanghai', description: '当前仅支持北京时间。' },
  intent: enumField(['general', 'eye', 'move', 'quiet'], '已确认的意愿：一般、休息眼睛、轻量活动、安静休息。缺省 general。'),
  sleepState: enumField(['unknown', 'awake', 'asleep'], '缺省 unknown；不得根据客户端点击自行假定清醒。此接口仅主动预览，不发提醒。'),
  sleepObservedAt: dateField('清醒状态的实际观察时间；指定 sleepState 而省略此字段时，按 snapshot.now 的明确自述处理。'),
  sleepValidUntil: dateField('可选清醒状态有效期；缺省为观察时间后五分钟。'),
  mealPhase: enumField(['before', 'during', 'after'], '明确的餐前、用餐中或餐后情境，不用于推断钟点。'),
  mood: enumField(['low', 'settled'], '本人明确表示心情低落或已经平复；不是情绪诊断，未知省略。'),
  contextFocus: enumField(CONTEXT_FOCUS_VALUES, '最近明确表达的推荐主题；不能替代进餐、姿势等执行条件。未知省略。'),
  activityPhase: enumField(ACTIVITY_PHASES, '明确描述的当前活动；驾驶、骑行、过马路时不生成分心的行动。运动后不等于疲劳或已知活动分钟。'),
  ...Object.fromEntries(Object.entries(conditionNames).map(([key, description]) => [key, { type: 'boolean', description: `${description}；不知道就省略，不能猜测为 true。` }])),
  ...Object.fromEntries(['screenMinutes', 'sedentaryMinutes', 'activityMinutes'].map(key => [key, { type: 'number', minimum: 0, maximum: 1440, description: '用户明确提供的分钟数；不知道就省略。' }])),
  weather: {
    type: 'object', additionalProperties: false, required: ['observedAt', 'rain'],
    description: '调用方已确认的天气观察；接口不主动获取天气，也不接收地址或经纬度。',
    properties: { observedAt: dateField('天气观察时间，须带时区。'), rain: { type: 'boolean' }, tempC: { type: 'number', minimum: -100, maximum: 100 }, wind: { type: 'number', minimum: 0, maximum: 150 } }
  },
  previewSolar: { type: 'boolean', description: 'true 时，若当天在固定节气日期表内，主动预览对应节气卡；不写首见记录。否则普通预览。' }
};
export const AGENT_REQUEST_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['snapshot'],
  properties: { snapshot: { type: 'object', additionalProperties: false, properties: snapshotProperties, description: '明确确认的情境。可传空对象，使用当前北京时间和未知条件。' } }
};
export const AGENT_FUNCTION_TOOL = {
  type: 'function',
  function: {
    name: 'preview_shichen_wellness_card',
    description: '只读预览一张时辰心管家日常行动卡。只传用户明确确认的情境；未知字段省略，不推断钟点、环境或能力。不诊断、不宣称疗效，不创建提醒，不修改频次或保存个人状态。可能调用配置的大模型并产生费用；失败会明确回退。由调用方服务器携带 Bearer 密钥请求 POST /api/agent/card。',
    parameters: AGENT_REQUEST_SCHEMA
  }
};

const stringArray = { type: 'array', items: { type: 'string' } };
const sourceSchema = { type: 'object', additionalProperties: false, required: ['id', 'title', 'label', 'text', 'url'], properties: Object.fromEntries(['id', 'title', 'label', 'text', 'url'].map(key => [key, { type: 'string' }])) };
const cardSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'title', 'category', 'steps', 'duration', 'scene', 'tags', 'timeLabel', 'meridian', 'meridianTheme', 'sourceId', 'isSolar'],
  properties: { ...Object.fromEntries(['id', 'title', 'category', 'duration', 'scene', 'timeLabel', 'meridian', 'meridianTheme', 'sourceId'].map(key => [key, { type: 'string' }])), steps: stringArray, tags: stringArray, isSolar: { type: 'boolean' } }
};
const traceSchema = { type: 'object', additionalProperties: false, required: ['id', 'title', 'kind', 'status', 'durationMs'], properties: {
  ...Object.fromEntries(['id', 'title', 'kind', 'status'].map(key => [key, { type: 'string' }])), durationMs: { type: 'number' },
  hitCount: { type: 'integer' }, candidateCount: { type: 'integer' }, rejectedCount: { type: 'integer' }, sourceIds: stringArray, providerMode: { type: 'string' }
} };
const responseSchema = { type: 'object', additionalProperties: false, required: ['apiVersion', 'runId', 'mode', 'readOnly', 'persisted', 'counted', 'now', 'timezone', 'catalogVersion', 'providerMode', 'card', 'explanation', 'sources', 'decision', 'trace'], properties: {
  apiVersion: { const: VERSION }, runId: { type: 'string' }, mode: { const: 'preview' }, readOnly: { const: true }, persisted: { const: false }, counted: { const: false },
  now: dateField('本次采用的北京时间。'), timezone: { const: 'Asia/Shanghai' }, catalogVersion: { type: 'string' },
  providerMode: enumField(['live', 'mixed', 'fallback', 'offline'], 'live 表示实际执行的模型节点均成功；mixed 为部分回退；fallback 为调用后回退；offline 为未配置模型。'),
  card: { oneOf: [cardSchema, { type: 'null' }] }, explanation: { type: 'string' }, sources: { type: 'array', items: sourceSchema },
  decision: { type: 'object', additionalProperties: false, required: ['allowed', 'reason', 'channel', 'route', 'countsTowardQuota'], properties: { allowed: { type: 'boolean' }, reason: { type: 'string' }, channel: { type: 'string' }, route: { type: 'string' }, countsTowardQuota: { const: false } } },
  trace: { type: 'array', items: traceSchema, description: '仅节点摘要；不返回原始输入、模型原文、服务器配置或个人状态。' }
} };

export function agentOpenApi() {
  const errors = Object.fromEntries([400, 401, 405, 413, 415, 500, 503].map(status => [String(status), {
    description: ({ 400: '输入不符合白名单或日期格式', 401: '缺少或错误的 Bearer 密钥', 405: '请求方法错误', 413: '请求超过 16 KiB', 415: '须使用 application/json', 500: '工作流未完成', 503: '服务端未配置 AGENT_API_KEY' })[status],
    content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['error', 'code'], properties: { error: { type: 'string' }, code: { type: 'string' } } } } }
  }]));
  return {
    openapi: '3.1.1', info: { title: '时辰心管家只读行动卡 API', version: VERSION, description: '健康成年人日常行动演示。固定卡库、只读预览；不创建提醒，不保留调用方会话状态。调用配置模型可能产生费用。' },
    servers: [{ url: '/' }],
    paths: {
      '/api/agent/openapi.json': { get: { operationId: 'getShichenAgentOpenApi', summary: '公开接口发现，无需密钥', security: [], responses: { 200: { description: 'OpenAPI 3.1.1 文档及 x-agent-tool 函数描述', content: { 'application/json': { schema: { type: 'object' } } } } } } },
      '/api/agent/card': { post: {
        operationId: 'preview_shichen_wellness_card', summary: '只读预览固定行动卡', description: AGENT_FUNCTION_TOOL.function.description,
        security: [{ agentBearer: [] }], 'x-read-only': true,
        requestBody: { required: true, content: { 'application/json': { schema: AGENT_REQUEST_SCHEMA, example: { snapshot: { intent: 'quiet', mealPhase: 'after', atMeal: false } } } } },
        responses: { 200: { description: '预览结果。无候选时 card 为 null；请读取 decision 和 providerMode。', content: { 'application/json': { schema: responseSchema } } }, ...errors }
      } }
    },
    components: { securitySchemes: { agentBearer: { type: 'http', scheme: 'bearer', description: '独立服务器 AGENT_API_KEY，不是模型供应商密钥。' } } },
    'x-agent-tool': AGENT_FUNCTION_TOOL, 'x-agent-tool-annotations': { readOnlyHint: true, destructiveHint: false }
  };
}

class InputError extends Error { constructor(message, status = 400, code = 'invalid_input') { super(message); this.status = status; this.code = code; } }
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
const errorResponse = (error, code, status, headers) => json({ error, code }, status, headers);
function validDate(value) {
  if (typeof value !== 'string') return false;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!m || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const d = new Date(0); d.setUTCFullYear(year, month - 1, day); d.setUTCHours(hour, minute, second, 0);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day && d.getUTCHours() === hour && d.getUTCMinutes() === minute && d.getUTCSeconds() === second;
}
function validate(value, schema) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('请求与 snapshot 须为 JSON 对象。');
    if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) throw new InputError('请求含未允许字段；仅接收文档列出的 snapshot 情境，不接收密钥、地址或运行配置。');
    if ((schema.required || []).some(key => !Object.hasOwn(value, key))) throw new InputError('缺少必需字段。');
    for (const key of Object.keys(value)) validate(value[key], schema.properties[key]);
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') throw new InputError('执行条件须为 true 或 false；未知条件请省略。');
  } else if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < schema.minimum || value > schema.maximum) throw new InputError('数值须为文档范围内的有限数字。');
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || (schema.maxLength && value.length > schema.maxLength) || (schema.enum && !schema.enum.includes(value)) || ('const' in schema && value !== schema.const)) throw new InputError('文本字段不符合允许值。');
    if (schema.format === 'date-time' && !validDate(value)) throw new InputError('日期须为真实有效且带时区的 ISO 日期时间，例如 2026-11-04T12:03:00+08:00。');
  }
}
export function normalizeAgentInput(input, nowMs = Date.now()) {
  validate(input, AGENT_REQUEST_SCHEMA);
  const raw = input.snapshot;
  if (raw.mealPhase && raw.atMeal !== undefined && raw.atMeal !== (raw.mealPhase === 'during')) throw new InputError('mealPhase 与 atMeal 不一致，请确认餐前、餐中或餐后情境。');
  if (raw.sleepValidUntil && raw.sleepObservedAt && Date.parse(raw.sleepValidUntil) <= Date.parse(raw.sleepObservedAt)) throw new InputError('清醒状态有效期须晚于观察时间。');
  const now = raw.now ? toShanghaiISO(raw.now) : toShanghaiISO(nowMs);
  const snapshot = { ...createChatSnapshot(now), ...JSON.parse(JSON.stringify(raw)), now, inputMode: 'agent' };
  if (snapshot.weather) snapshot.weather.source = 'agent-supplied';
  return snapshot;
}
async function readJson(request) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_AGENT_BODY_BYTES) throw new InputError('请求不能超过 16 KiB。', 413, 'body_too_large');
  if (!request.body) throw new InputError('请求体不能为空。');
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_AGENT_BODY_BYTES) { await reader.cancel(); throw new InputError('请求不能超过 16 KiB。', 413, 'body_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new InputError('请求须为有效 JSON。'); }
}
async function bearerMatches(header, expected) {
  const match = String(header || '').match(/^Bearer ([^\s]{1,2048})$/i);
  if (!match) return false;
  const encode = value => new TextEncoder().encode(value);
  const [actualHash, expectedHash] = await Promise.all([match[1], expected].map(value => globalThis.crypto.subtle.digest('SHA-256', encode(value))));
  const a = new Uint8Array(actualHash), b = new Uint8Array(expectedHash);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function publicResult(result, snapshot) {
  const c = result.card;
  const card = c ? Object.fromEntries(['id', 'title', 'category', 'steps', 'duration', 'scene', 'tags', 'timeLabel', 'meridian', 'meridianTheme', 'sourceId', 'isSolar'].map(key => [key, c[key]])) : null;
  const source = c?.source;
  return {
    apiVersion: VERSION, runId: result.runId, mode: 'preview', readOnly: true, persisted: false, counted: false,
    now: snapshot.now, timezone: 'Asia/Shanghai', catalogVersion: catalog.version, providerMode: result.providerMode,
    card, explanation: result.explanation,
    sources: source ? [{ id: source.id, title: source.title, label: source.label || '', text: source.text, url: source.url || '' }] : [],
    decision: { allowed: result.decision.allowed, reason: result.decision.reason, channel: result.decision.channel, route: result.decision.route, countsTowardQuota: false },
    trace: result.trace.map(n => ({ id: n.id, title: n.title, kind: n.kind, status: n.status, durationMs: n.durationMs,
      ...(n.id === 'N05' && n.output ? { hitCount: n.output.hits?.length || 0 } : {}),
      ...(n.id === 'N06' && n.output ? { candidateCount: n.output.candidates?.length || 0, rejectedCount: n.output.rejected?.length || 0 } : {}),
      ...(n.id === 'N08' && n.input ? { sourceIds: n.input.sourceIds, providerMode: n.output.providerMode } : {})
    }))
  };
}
export async function handleAgentApi(request, env = {}) {
  const path = new URL(request.url).pathname;
  if (path === '/api/agent/openapi.json') {
    if (request.method !== 'GET') return errorResponse('请使用 GET。', 'method_not_allowed', 405, { Allow: 'GET' });
    return json(agentOpenApi());
  }
  if (path !== '/api/agent/card') return errorResponse('接口不存在。', 'not_found', 404);
  if (request.method !== 'POST') return errorResponse('请使用 POST。', 'method_not_allowed', 405, { Allow: 'POST' });
  const key = typeof env.AGENT_API_KEY === 'string' ? env.AGENT_API_KEY.trim() : '';
  if (!key) return errorResponse('智能体接口尚未配置服务器访问密钥。', 'agent_api_not_configured', 503);
  if (!await bearerMatches(request.headers.get('authorization'), key)) return errorResponse('缺少或错误的 Bearer 访问密钥。', 'unauthorized', 401, { 'WWW-Authenticate': 'Bearer' });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return errorResponse('请使用 application/json 请求体。', 'unsupported_media_type', 415);
  try {
    if (new URL(request.url).search) throw new InputError('此接口不接受查询参数，请将情境放入 snapshot。');
    const input = await readJson(request);
    const snapshot = normalizeAgentInput(input, typeof env.AGENT_NOW === 'function' ? env.AGENT_NOW() : Date.now());
    // Never spread a request or the full server env into the engine. This also
    // prevents test/admin CATALOG overrides from changing this fixed-library API.
    const modelEnv = Object.fromEntries(['LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_THINKING', 'LLM_TIMEOUT_MS'].filter(key => env[key] !== undefined).map(key => [key, env[key]]));
    if (typeof env.FETCH === 'function') modelEnv.FETCH = env.FETCH;
    const result = await runWorkflow({ snapshot, mode: 'preview', state: createReminderState(snapshot.now) }, modelEnv);
    return json(publicResult(result, snapshot));
  } catch (error) {
    if (error instanceof InputError) return errorResponse(error.message, error.code, error.status);
    return errorResponse('行动卡预览暂未完成，请稍后再试。', 'workflow_failed', 500);
  }
}
