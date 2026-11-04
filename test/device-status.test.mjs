import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeviceStatus, deviceDiagnosticSummary, devicePermissionActions, devicePermissionFeedback } from '../lib/device-status.mjs';

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

test('a verified zero screen duration is valid, while a zero step baseline is not an observed total', () => {
  const data = base();
  assert.match(row(normalize(data), 'usage').value, /0 分钟/);
  data.steps.eventsCount = 1;
  assert.equal(row(normalize(data), 'steps').value, '已收到基线，等待步数增量');
  assert.doesNotMatch(row(normalize(data), 'steps').value, /0 步/);
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
  data.steps.sessionSteps = 987654; data.steps.lastSensorAt = 123456789; data.steps.eventsCount = 7;
  data.steps.lastIncrementAt = 123450000; data.steps.fallbackReason = 'SECRET_FALLBACK';
  const summary = deviceDiagnosticSummary(data, { native: true, phase: 'ready', now: 123469789 });
  const text = JSON.stringify(summary);
  assert.doesNotMatch(text, /SECRET_|987654|123456789|123450000/);
  assert.equal(summary.usage.reason, 'unknown');
  assert.equal(summary.steps.hasReading, true);
  assert.equal(summary.steps.counterAvailable, true);
  assert.equal(summary.steps.eventsCount, 7);
  assert.equal(summary.steps.secondsSinceLastEvent, 13);
  assert.equal(summary.steps.fallbackReason, 'unknown');
  assert.equal(summary.appVersion, '0.3.0-preview');
  assert.equal(summary.apiLevel, 35);
});

test('diagnostics never reuse a stale snapshot after bridge failure', () => {
  const summary = deviceDiagnosticSummary(base(), { native: true, phase: 'error' });
  assert.equal(summary.query, 'error');
  assert.equal(summary.steps.permission, 'unknown');
  assert.equal(summary.steps.hasReading, false);
});

test('legacy counter baseline, repeated unchanged readings and a real increment are separate', () => {
  const data = base();
  data.steps.eventsCount = 0;
  assert.equal(row(normalize(data), 'steps').state, 'waiting_for_sensor');
  data.steps.eventsCount = 1;
  assert.equal(row(normalize(data), 'steps').state, 'baseline_only');
  assert.equal(deviceDiagnosticSummary(data).steps.hasReading, false);
  data.steps.eventsCount = 2;
  assert.equal(row(normalize(data), 'steps').state, 'waiting_for_increment');
  assert.match(row(normalize(data), 'steps').value, /尚未观察到步数增量/);
  data.steps.sessionSteps = 5;
  assert.equal(row(normalize(data), 'steps').value, '本次前台 5 步');
  assert.equal(deviceDiagnosticSummary(data).steps.hasReading, true);
});

test('0.5 baseline and stale events do not claim motion absence or sensor failure', () => {
  const data = base(); data.versionCode = 5; data.appVersion = '0.5.0-preview';
  data.steps = { ...data.steps, status: 'baseline_only', reason: 'counter_baseline_only', sessionSteps: null, baselineEstablished: true, segmentHasIncrement: false, eventsCount: 1 };
  assert.equal(row(normalize(data), 'steps').state, 'baseline_only');
  assert.match(row(normalize(data), 'steps').value, /基线/);
  data.steps.status = 'no_events'; data.steps.reason = 'sensor_no_recent_events';
  assert.equal(row(normalize(data), 'steps').value, '近期未收到计步事件');
  assert.match(row(normalize(data), 'steps').note, /静止时也可能/);
  assert.match(row(normalize(data), 'steps').note, /不能据此认定传感器故障/);
  data.steps.sessionSteps = 23;
  assert.match(row(normalize(data), 'steps').note, /此前已记录 23 步/);
  data.steps.status = 'baseline_only';
  assert.match(row(normalize(data), 'steps').value, /23 步 · 本段待增量/);
});

test('granted permissions manage settings and offer a separate truthful retry action', () => {
  const data = base();
  assert.deepEqual(devicePermissionActions(data).activity, { label: '管理活动权限', method: 'openAppSettings' });
  assert.equal(devicePermissionActions(data).usage.label, '管理屏幕使用权限');
  assert.equal(devicePermissionActions(data).retrySteps.label, '重新读取计步');
  data.versionCode = 5; data.appVersion = '0.5.0-preview';
  assert.deepEqual(devicePermissionActions(data).retrySteps, { label: '重新检测计步', method: 'requestActivity' });
  data.steps.permission = 'denied'; data.usage.permission = 'denied';
  assert.deepEqual(devicePermissionActions(data).activity, { label: '活动权限', method: 'requestActivity' });
  assert.equal(devicePermissionActions(data).retrySteps, null);
  assert.equal(devicePermissionActions(data).usage.label, '屏幕使用授权');
});

test('permission feedback does not confuse a bridge success with a granted permission or real readings', () => {
  const data = base();
  assert.match(devicePermissionFeedback('requestActivity', data, 'granted'), /旧安装版不会重启监听/);
  data.steps.permission = 'denied';
  assert.match(devicePermissionFeedback('requestActivity', data), /仍未开启/);
  assert.match(devicePermissionFeedback('requestActivity', null), /暂未读到/);
  data.steps.permission = 'granted'; data.versionCode = 5;
  data.actionFeedback = { action: 'retry_activity', status: 'restarted', message: 'SECRET_UNTRUSTED_MESSAGE' };
  const restarted = devicePermissionFeedback('requestActivity', data, 'granted');
  assert.match(restarted, /已重新开始计步监听/);
  assert.match(restarted, /不等于已经取得步数/);
  assert.doesNotMatch(restarted, /SECRET/);
  data.actionFeedback.status = 'unavailable';
  data.steps.status = 'paused';
  assert.match(devicePermissionFeedback('requestActivity', data), /回到应用前台/);
  assert.doesNotMatch(devicePermissionFeedback('requestActivity', data), /当前环境没有可用计步传感器/);
  // onResume may occur between creating actionFeedback and collecting capabilities.
  data.steps.status = 'waiting_for_sensor';
  assert.doesNotMatch(devicePermissionFeedback('requestActivity', data), /当前环境没有可用计步传感器/);
  data.steps.available = false; data.steps.status = 'unsupported';
  assert.match(devicePermissionFeedback('requestActivity', data), /没有可用计步传感器/);
  data.actionFeedback.status = 'failed';
  assert.match(devicePermissionFeedback('requestActivity', data), /注册计步监听未成功/);
});

test('0.5 diagnostics copy event availability and relative ages without step values or absolute times', () => {
  const data = base(); data.versionCode = 5;
  data.steps = { ...data.steps, eventsCount: 2, sessionSteps: 347, lastSensorAt: 400000, listenerRegisteredAt: 350000, baselineEstablished: true, segmentHasIncrement: true, fallbackAttempted: true, fallbackReason: 'counter_no_events', observationTimeoutSeconds: 60 };
  const diagnostic = deviceDiagnosticSummary(data, { now: 405000 });
  assert.equal(diagnostic.schema, 'shichen-device-diagnostic-v2');
  assert.equal(diagnostic.versionCode, 5);
  assert.equal(diagnostic.steps.eventsCount, 2);
  assert.equal(diagnostic.steps.secondsSinceLastEvent, 5);
  assert.equal(diagnostic.steps.secondsSinceListenerRegistered, 55);
  assert.equal(diagnostic.steps.fallbackReason, 'counter_no_events');
  assert.equal(diagnostic.steps.segmentHasIncrement, true);
  assert.doesNotMatch(JSON.stringify(diagnostic), /347|400000|350000/);
  data.steps.lastSensorAt = 900000;
  data.steps.eventsCount = -1;
  const invalid = deviceDiagnosticSummary(data, { now: 405000 });
  assert.equal(invalid.steps.secondsSinceLastEvent, null);
  assert.equal(invalid.steps.eventsCount, null);
});
