// Keep permission, data availability, and measurement scope separate. This module
// also defines the allowlist for the user-triggered diagnostic summary.
const USAGE_STATES = ['available', 'partial', 'no_events', 'permission_required', 'error'];
const USAGE_REASONS = ['complete_day', 'midnight_state_unknown', 'restart_gap', 'no_screen_events', 'usage_permission_missing', 'query_unavailable', 'query_failed'];
const STEP_STATES = ['available', 'waiting_for_sensor', 'permission_required', 'unsupported', 'registration_failed', 'paused'];
const STEP_REASONS = ['foreground_steps_observed', 'activity_permission_missing', 'no_step_sensor', 'awaiting_first_event', 'app_background', 'sensor_registration_failed'];
const PERMISSIONS = ['granted', 'denied'];
const pick = (value, values) => values.includes(value) ? value : 'unknown';
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const boolean = value => typeof value === 'boolean' ? value : null;
const hasNumber = value => number(value) !== null;
const permissionText = permission => permission === 'granted' ? '已授权' : permission === 'denied' ? '未授权' : '状态未知';
const version = value => typeof value === 'string' && /^[\w.+-]{1,40}$/.test(value) ? value : '未知';
const minutes = value => `${Math.round(value)} 分钟`;
function time(value) {
  const n = number(value);
  return n && !Number.isNaN(new Date(n).getTime()) ? new Date(n).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
}

export function normalizeDeviceStatus(raw, options = {}) {
  const native = options.native !== false;
  const phase = pick(options.phase, ['loading', 'ready', 'error']);
  const data = object(raw);
  const waiting = phase === 'loading' && !raw;
  const failed = phase === 'error';
  const unavailable = !native || waiting || failed || !raw;
  const pending = waiting ? '正在读取' : failed ? '连接暂不可用' : !native ? '网页版不提供' : '尚未读取';
  const pendingNote = waiting ? '正在读取设备返回的状态。' : failed ? '未能读取安装版接口，请刷新重试；这不代表权限被拒绝。' : !native ? '请在安卓安装版中查看系统授权与读数。' : '点击刷新状态读取设备信息。';
  const location = object(data.location);
  const usage = object(data.usage);
  const steps = object(data.steps);
  const locationPermission = unavailable ? 'unknown' : pick(location.permission, PERMISSIONS);
  const usagePermission = unavailable ? 'unknown' : pick(usage.permission, PERMISSIONS);
  const stepsPermission = unavailable ? 'unknown' : pick(steps.permission, PERMISSIONS);
  const row = (id, title, permission) => ({ id, title, permission, permissionLabel: unavailable ? pending : permissionText(permission), value: pending, note: pendingNote, state: 'unknown' });
  const locationRow = row('location', '定位', locationPermission);
  const usageRow = row('usage', '屏幕使用', usagePermission);
  const stepsRow = row('steps', '活动步数', stepsPermission);

  if (!unavailable) {
    locationRow.value = locationPermission === 'granted' ? '可请求当前位置' : locationPermission === 'denied' ? '等待定位授权' : '定位状态未知';
    locationRow.note = '城市与天气在上方定位设置中获取；定位许可与定位成功分别判断。';
    locationRow.state = locationPermission;
    const usageState = pick(usage.status, USAGE_STATES);
    const reason = pick(usage.reason, USAGE_REASONS);
    usageRow.state = usageState;
    if (usagePermission === 'denied') {
      usageRow.value = '等待屏幕使用授权';
      usageRow.note = '点击“屏幕使用授权”，允许后返回应用即可刷新。';
    } else if (usagePermission !== 'granted') {
      usageRow.value = '权限状态未知';
      usageRow.note = '安装版未返回可识别的授权状态，请刷新重试。';
    } else if ((usageState === 'available' || usageState === 'unknown') && hasNumber(usage.screenMinutesToday)) {
      usageRow.value = `今日已记录亮屏 ${minutes(usage.screenMinutesToday)}`;
      usageRow.note = '当前安卓环境自零点至查询时的亮屏累计，不等于连续看屏时长。';
    } else if (usageState === 'partial' && hasNumber(usage.observedMinutes)) {
      usageRow.value = `已捕获片段 ${minutes(usage.observedMinutes)}`;
      const start = time(usage.windowStart), end = time(usage.windowEnd);
      const range = start && end ? `事件范围 ${start}–${end}，其中可能有缺口。` : '';
      const gap = reason === 'restart_gap' ? '存在重启造成的记录缺口' : reason === 'midnight_state_unknown' ? '零点亮屏状态不完整' : '记录范围不完整';
      usageRow.note = `${range}${gap}，仅统计已捕获片段，不能当作今日总量。`;
    } else if (usageState === 'no_events') {
      usageRow.value = '已授权，暂无亮屏事件';
      usageRow.note = '系统暂未返回可用记录；在卓易通内，宿主手机的记录可能无法传入。不能将无记录记作 0。';
    } else if (usageState === 'error') {
      usageRow.value = '已授权，暂时无法查询';
      usageRow.note = reason === 'query_unavailable' ? '此安卓环境未提供可用的亮屏事件查询。' : '本次系统查询未成功，请稍后刷新；没有把缺失读数记作 0。';
    } else {
      usageRow.value = '已授权，尚无可用读数';
      usageRow.note = usageState === 'unknown' ? '旧版接口未提供缺失原因；更新安装包后可查看详细状态。' : '当前未返回完整读数，请稍后刷新。';
    }

    const stepState = pick(steps.status, STEP_STATES);
    stepsRow.state = stepState;
    if (stepsPermission === 'denied') {
      stepsRow.value = '等待活动权限';
      stepsRow.note = '点击“活动权限”，允许后保持应用在前台走几步。';
    } else if (stepsPermission !== 'granted') {
      stepsRow.value = '权限状态未知';
      stepsRow.note = '安装版未返回可识别的授权状态，请刷新重试。';
    } else if (stepState === 'unsupported' || steps.available === false) {
      stepsRow.value = '当前环境未提供计步传感器';
      stepsRow.note = '活动权限已开，但没有可读取的计步传感器；可在聊天中补充活动情况。';
    } else if (stepState === 'registration_failed') {
      stepsRow.value = '传感器监听未成功';
      stepsRow.note = '系统显示有传感器，但未成功开始读取。可刷新或重新打开应用再试。';
    } else if ((stepState === 'available' || stepState === 'paused' || stepState === 'unknown') && hasNumber(steps.sessionSteps)) {
      stepsRow.value = `本次前台 ${Math.round(steps.sessionSteps)} 步${stepState === 'paused' ? ' · 已暂停' : ''}`;
      stepsRow.note = stepState === 'unknown' ? '当前前台会话首次读数后的步数，不含离开应用期间或华为健康记录。' : '仅含本次打开期间已监测到的前台步数，不含后台或华为健康记录。';
    } else if (stepState === 'waiting_for_sensor') {
      stepsRow.value = '等待传感器首次读数';
      stepsRow.note = '监听已开启，请保持应用在前台走几步；首次读数建立基线后才累计步数。';
    } else if (stepState === 'paused') {
      stepsRow.value = '前台计步已暂停';
      stepsRow.note = '回到应用后将重新读取；暂停期间不累计步数。';
    } else {
      stepsRow.value = '已授权，尚无计步读数';
      stepsRow.note = stepState === 'unknown' ? '旧版接口未提供缺失原因；更新安装包后可区分传感器不可用与等待读数。' : '请保持应用在前台走几步，再查看状态。';
    }
  }

  return {
    native, phase, appVersion: unavailable ? '未知' : version(data.appVersion),
    apiLevel: unavailable ? null : number(data.apiLevel),
    refreshing: phase === 'loading',
    rows: [locationRow, usageRow, stepsRow],
    health: { title: '华为运动健康 / 睡眠', value: '尚未配置服务接入', note: '当前安装版没有接入华为运动健康服务。需先完成开发者服务配置与接入，再由你授权；开启手机权限不能直接读取这些数据。暂可通过聊天补充睡眠与活动。' },
  };
}

// Never export raw bridge objects, scope/error strings, coordinates, device IDs,
// application usage records, addresses, health values, or application secrets.
export function deviceDiagnosticSummary(raw, options = {}) {
  const data = object(options.phase === 'error' ? null : raw);
  const usage = object(data.usage), steps = object(data.steps);
  return {
    schema: 'shichen-device-diagnostic-v1',
    environment: options.native === false ? 'web' : 'android-bridge',
    query: pick(options.phase, ['loading', 'ready', 'error']),
    appVersion: version(data.appVersion),
    apiLevel: number(data.apiLevel),
    location: { permission: pick(object(data.location).permission, PERMISSIONS) },
    usage: {
      permission: pick(usage.permission, PERMISSIONS),
      status: pick(usage.status, USAGE_STATES),
      reason: pick(usage.reason, USAGE_REASONS),
      hasCompleteDayReading: hasNumber(usage.screenMinutesToday),
      hasPartialReading: hasNumber(usage.observedMinutes),
    },
    steps: {
      permission: pick(steps.permission, PERMISSIONS),
      status: pick(steps.status, STEP_STATES),
      reason: pick(steps.reason, STEP_REASONS),
      sensorAvailable: boolean(steps.available),
      counterAvailable: boolean(steps.counterAvailable),
      detectorAvailable: boolean(steps.detectorAvailable),
      listenerRegistered: boolean(steps.listenerRegistered),
      source: pick(steps.source, ['step-counter', 'step-detector', 'none']),
      hasReading: hasNumber(steps.sessionSteps),
    },
    health: { status: 'not_integrated' },
  };
}
