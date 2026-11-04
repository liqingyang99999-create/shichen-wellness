import { runWorkflow } from './engine.mjs';
import { CONTEXT_BOOLEAN_FIELDS, CONTEXT_NUMERIC_FIELDS, CONTEXT_FOCUS_VALUES, ACTIVITY_PHASES, createChatSnapshot, createReminderState, toShanghaiISO } from '../lib/context.mjs';

export const MAX_MOBILE_BODY_BYTES = 16_384;
const MAX_TEXT_LENGTH = 1200;
const booleanFields = new Set([...CONTEXT_BOOLEAN_FIELDS, 'previewSolar']);
const numericFields = new Set(CONTEXT_NUMERIC_FIELDS);
const dateFields = new Set(['now', 'sleepObservedAt', 'sleepValidUntil']);
const enums = { intent: ['general', 'eye', 'move', 'quiet'], sleepState: ['unknown', 'awake', 'asleep'], mealPhase: ['before', 'during', 'after'], mood: ['low', 'settled'], activityPhase: ACTIVITY_PHASES, contextFocus: CONTEXT_FOCUS_VALUES, timezone: ['Asia/Shanghai'] };
const snapshotFields = new Set([...booleanFields, ...numericFields, ...dateFields, ...Object.keys(enums), 'weather', 'dnd', 'usualAwake']);

class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new InputError(message, status); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keysOnly(value, allowed) {
  if (!isObject(value)) fail('请求、情境和状态须为 JSON 对象。');
  if (Object.keys(value).some(key => !allowed.has(key))) fail('请求包含未允许字段，请仅提供当前情境。');
}
function validDate(value) {
  if (typeof value !== 'string' || value.length > 35) return false;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!m || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const d = new Date(0); d.setUTCFullYear(year, month - 1, day); d.setUTCHours(hour, minute, second, 0);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day && d.getUTCHours() === hour && d.getUTCMinutes() === minute && d.getUTCSeconds() === second;
}
function requireDate(value) {
  if (!validDate(value)) fail('时间须为有效且带时区的 ISO 日期时间。');
}
function windowValue(value) {
  keysOnly(value, new Set(['start', 'end']));
  if (![value.start, value.end].every(v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))) fail('时段须使用 HH:mm 格式。');
  return { start: value.start, end: value.end };
}
function weatherValue(value) {
  if (value === null) return null;
  keysOnly(value, new Set(['source', 'observedAt', 'fetchedAt', 'city', 'description', 'locationSource', 'windUnit', 'rain', 'tempC', 'wind']));
  if (!['open-meteo', 'manual'].includes(value.source)) fail('天气须来自联网查询或手动填写。');
  requireDate(value.observedAt);
  if (value.fetchedAt !== undefined) requireDate(value.fetchedAt);
  for (const key of ['city', 'description', 'locationSource', 'windUnit']) if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 160)) fail('天气说明过长或格式不正确。');
  if (value.rain !== undefined && typeof value.rain !== 'boolean') fail('降雨状态须为 true 或 false。');
  for (const [key, min, max] of [['tempC', -100, 100], ['wind', 0, 150]]) if (value[key] !== undefined && (!Number.isFinite(value[key]) || value[key] < min || value[key] > max)) fail('天气数值超出范围。');
  return { ...value };
}

// Client and model data never select a provider, catalog, random seed, route,
// quota or permission. Raw GPS, health records and per-app usage are not inputs.
export function normalizeMobileInput(input, nowMs = Date.now()) {
  keysOnly(input, new Set(['text', 'snapshot', 'state']));
  if (input.text !== undefined && (typeof input.text !== 'string' || input.text.length > MAX_TEXT_LENGTH)) fail('聊天内容请控制在 1200 字符以内。');
  const text = (input.text || '').trim();
  const raw = input.snapshot === undefined ? {} : input.snapshot;
  keysOnly(raw, snapshotFields);
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (booleanFields.has(key)) { if (typeof value !== 'boolean') fail('活动条件须为 true 或 false；未知条件请省略。'); clean[key] = value; }
    else if (numericFields.has(key)) { if (!Number.isFinite(value) || value < 0 || value > 1440) fail('自述时长须为 0–1440 分钟；未知时请省略。'); clean[key] = value; }
    else if (dateFields.has(key)) { requireDate(value); clean[key] = toShanghaiISO(value); }
    else if (Object.hasOwn(enums, key)) { if (!enums[key].includes(value)) fail('情境取值不受支持。'); clean[key] = value; }
    else if (key === 'weather') clean.weather = weatherValue(value);
    else if (key === 'usualAwake') clean.usualAwake = windowValue(value);
    else if (key === 'dnd') { if (!Array.isArray(value) || value.length > 10) fail('勿扰时段最多 10 段。'); clean.dnd = value.map(windowValue); }
  }
  if (clean.mealPhase && clean.atMeal !== undefined && clean.atMeal !== (clean.mealPhase === 'during')) fail('用餐阶段与进餐状态不一致。');
  const now = clean.now || toShanghaiISO(nowMs);
  const observed = clean.sleepObservedAt || now;
  if (clean.sleepValidUntil && Date.parse(clean.sleepValidUntil) <= Date.parse(observed)) fail('状态有效期须晚于观察时间。');
  const snapshot = { ...createChatSnapshot(now), ...clean, now, inputMode: text ? 'chat' : 'daily' };
  const stateInput = input.state === undefined ? {} : input.state;
  keysOnly(stateInput, new Set(['recentCards']));
  const recent = stateInput.recentCards === undefined ? [] : stateInput.recentCards;
  if (!Array.isArray(recent) || recent.length > 3 || recent.some(id => typeof id !== 'string' || !id || id.length > 100)) fail('最近卡片须为最多三个有效 ID。');
  const state = { ...createReminderState(now), recentCards: [...new Set(recent)] };
  return { text, snapshot, state };
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_MOBILE_BODY_BYTES) fail('请求不能超过 16 KiB。', 413);
  if (!request.body) fail('请求体不能为空。');
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_MOBILE_BODY_BYTES) { await reader.cancel(); fail('请求不能超过 16 KiB。', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('请求须为有效 JSON。'); }
}
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });

export async function handleMobileApi(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/mobile/card') return json({ error: '接口不存在。' }, 404);
  if (request.method !== 'POST') return json({ error: '请使用 POST。' }, 405, { Allow: 'POST' });
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '不支持跨域请求。' }, 403);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: '请使用 application/json。' }, 415);
  try {
    if (url.search) fail('情境请放入 JSON 请求体。');
    const input = normalizeMobileInput(await readJson(request), typeof env.MOBILE_NOW === 'function' ? env.MOBILE_NOW() : Date.now());
    const modelEnv = Object.fromEntries(['LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_THINKING', 'LLM_TIMEOUT_MS'].filter(key => env[key] !== undefined).map(key => [key, env[key]]));
    if (typeof env.FETCH === 'function') modelEnv.FETCH = env.FETCH;
    const result = await runWorkflow({ snapshot: input.snapshot, state: input.state, dialogue: input.text, mode: 'preview', confirmed: false, autoApplyDialogue: true }, modelEnv);
    const context = result.trace.find(node => node.id === 'N03')?.output?.snapshot || input.snapshot;
    return json({ ...result, context });
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, error.status);
    return json({ error: '行动卡暂未生成，请稍后重试。' }, 500);
  }
}
