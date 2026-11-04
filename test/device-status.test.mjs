import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeviceStatus, deviceDiagnosticSummary } from '../lib/device-status.mjs';

const base = () => ({
  platform: 'android', appVersion: '0.3.0-preview', apiLevel: 35,
  location: { permission: 'granted' },
  usage: { permission: 'granted', status: 'available', reason: 'complete_day', screenMinutesToday: 0, observedMinutes: 0 },
  steps: { permission: 'granted', available: true, status: 'available', sessionSteps: 0, counterAvailable: true, detectorAvailable: false, listenerRegistered: true, source: 'step-counter' },
  health: { available: false, reason: 'not-connected' },
});
const normalize = (raw, options = {}) => normalizeDeviceStatus(raw, { native: true, phase: 'ready', ...options });
const row = (model, id) => model.rows.find(item => item.id === id);

test('initial loading and bridge failure never imply permission denied', () => {
  for (const phase of ['loading', 'error']) {
    const model = normalize(null, { phase });
    for (const item of model.rows) {
      assert.equal(item.permission, 'unknown');
      assert.doesNotMatch(item.permissionLabel, /未授权/);
    }
  }
  assert.match(row(normalize(null, { phase: 'loading' }), 'usage').value, /正在读取/);
  assert.match(row(normalize(base(), { phase: 'error' }), 'usage').value, /连接暂不可用/);
});

test('zero is a valid measurement, missing is never converted into zero', () => {
  const data = base();
  assert.match(row(normalize(data), 'usage').value, /0 分钟/);
  assert.match(row(normalize(data), 'steps').value, /0 步/);
  data.usage.screenMinutesToday = null;
  data.steps.sessionSteps = null;
  assert.doesNotMatch(row(normalize(data), 'usage').value, /0 分钟/);
  assert.doesNotMatch(row(normalize(data), 'steps').value, /0 步/);
});

test('permission denial wins over a stale or inconsistent measurement', () => {
  const data = base();
  data.usage.permission = 'denied'; data.steps.permission = 'denied';
  const model = normalize(data);
  assert.equal(row(model, 'usage').value, '等待屏幕使用授权');
  assert.equal(row(model, 'steps').value, '等待活动权限');
  assert.equal(row(model, 'steps').permissionLabel, '未授权');
});

test('partial screen intervals are labelled as fragments, never today total', () => {
  const data = base();
  data.usage = { permission: 'granted', status: 'partial', reason: 'restart_gap', screenMinutesToday: 999, observedMinutes: 12, windowStart: Date.parse('2026-11-04T02:00:00+08:00'), windowEnd: Date.parse('2026-11-04T10:00:00+08:00') };
  const usage = row(normalize(data), 'usage');
  assert.equal(usage.value, '已捕获片段 12 分钟');
  assert.doesNotMatch(usage.value, /今日|999/);
  assert.match(usage.note, /可能有缺口/);
  assert.match(usage.note, /重启/);
});

test('permission grant is displayed separately from absence of screen events', () => {
  const data = base();
  data.usage.status = 'no_events'; data.usage.reason = 'no_screen_events'; data.usage.screenMinutesToday = null;
  const usage = row(normalize(data), 'usage');
  assert.equal(usage.permissionLabel, '已授权');
  assert.match(usage.value, /暂无亮屏事件/);
});

test('query unavailable and query failure have distinct explanations', () => {
  const data = base(); data.usage.status = 'error'; data.usage.screenMinutesToday = null;
  data.usage.reason = 'query_unavailable';
  assert.match(row(normalize(data), 'usage').note, /未提供可用的亮屏事件查询/);
  data.usage.reason = 'query_failed';
  assert.match(row(normalize(data), 'usage').note, /本次系统查询未成功/);
});

test('sensor missing, waiting, paused and registration failure stay distinct', () => {
  const data = base();
  data.steps.available = false;
  assert.match(row(normalize(data), 'steps').value, /未提供计步传感器/);
  data.steps.available = true; data.steps.sessionSteps = null;
  data.steps.status = 'waiting_for_sensor';
  assert.match(row(normalize(data), 'steps').value, /首次读数/);
  data.steps.status = 'registration_failed';
  assert.match(row(normalize(data), 'steps').value, /监听未成功/);
  data.steps.status = 'paused'; data.steps.sessionSteps = 23;
  assert.match(row(normalize(data), 'steps').value, /23 步 · 已暂停/);
});

test('0.2 compatibility does not invent a cause for a missing reading', () => {
  const data = { appVersion: '0.2.0-preview', location: { permission: 'granted' }, usage: { permission: 'granted', screenMinutesToday: null }, steps: { permission: 'granted', available: true, sessionSteps: null } };
  assert.match(row(normalize(data), 'usage').note, /旧版接口未提供缺失原因/);
  assert.match(row(normalize(data), 'steps').note, /旧版接口未提供缺失原因/);
  assert.equal(normalize(data).apiLevel, null);
});

test('web states and health explicitly report the unavailable integration', () => {
  const model = normalize(null, { native: false });
  assert.equal(row(model, 'usage').value, '网页版不提供');
  assert.equal(model.health.value, '尚未配置服务接入');
  assert.match(model.health.note, /开启手机权限不能直接读取/);
});

test('unknown statuses and invalid numbers do not become valid measurements', () => {
  const data = base();
  data.usage.screenMinutesToday = '12'; data.usage.status = 'garbage'; data.usage.reason = 'secret-data';
  data.steps.sessionSteps = -1;
  assert.doesNotMatch(row(normalize(data), 'usage').value, /12 分钟/);
  assert.doesNotMatch(row(normalize(data), 'steps').value, /-1/);
  assert.doesNotMatch(JSON.stringify(normalize(data)), /secret-data|garbage/);
});

test('diagnostic allowlist strips location, identifiers, records and arbitrary text', () => {
  const data = base();
  data.deviceId = 'SECRET_DEVICE_ID'; data.key = 'SECRET_API_KEY'; data.address = 'SECRET_ADDRESS';
  data.location.coordinates = 'SECRET_GPS'; data.health.records = 'SECRET_HEALTH';
  data.usage.scope = 'SECRET_SCOPE'; data.usage.records = ['SECRET_APP']; data.usage.reason = 'SECRET_REASON';
  data.steps.sessionSteps = 987654; data.steps.lastSensorAt = 123456789; data.steps.eventsCount = 456789;
  const summary = deviceDiagnosticSummary(data, { native: true, phase: 'ready' });
  const text = JSON.stringify(summary);
  assert.doesNotMatch(text, /SECRET_|987654|123456789|456789/);
  assert.equal(summary.usage.reason, 'unknown');
  assert.equal(summary.steps.hasReading, true);
  assert.equal(summary.steps.counterAvailable, true);
  assert.equal(summary.appVersion, '0.3.0-preview');
  assert.equal(summary.apiLevel, 35);
});

test('diagnostics never reuse a stale snapshot after bridge failure', () => {
  const summary = deviceDiagnosticSummary(base(), { native: true, phase: 'error' });
  assert.equal(summary.query, 'error');
  assert.equal(summary.steps.permission, 'unknown');
  assert.equal(summary.steps.hasReading, false);
});
