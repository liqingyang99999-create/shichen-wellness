import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { deviceDiagnosticSummary, devicePermissionActions, devicePermissionFeedback, normalizeDeviceStatus } from '../../lib/device-status.mjs';
import { isNative, nativeRequest } from '../native-bridge';
import './device-data.css';

type Phase = 'loading' | 'ready' | 'error';
const sensorLabel = (value: boolean | null) => value === true ? '有' : value === false ? '无' : '未返回';
const ageLabel = (value: number | null) => value === null ? '未返回' : value < 60 ? `${value} 秒前` : `${Math.floor(value / 60)} 分钟前`;
const fallbackLabels: Record<string, string> = { counter_no_events: '计数器未返回事件', counter_no_increment: '计数器未出现增量', counter_registration_failed: '计数器注册失败' };

export default function DeviceData() {
  const native = isNative();
  const [raw, setRaw] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>(native ? 'loading' : 'ready');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const active = useRef(false);
  const requestRunning = useRef(false);
  const actionRunning = useRef(false);

  const refresh = useCallback(async (manual = false) => {
    if (!native || requestRunning.current || actionRunning.current || !active.current) return;
    requestRunning.current = true;
    setPhase('loading');
    if (manual) setMessage('正在重新读取设备状态…');
    try {
      const next = await nativeRequest('getCapabilities');
      if (!next || typeof next !== 'object' || !next.location || !next.usage || !next.steps) throw new Error('Invalid capabilities');
      if (active.current) {
        setRaw(next); setPhase('ready');
        if (manual) setMessage(`已重新读取：${normalizeDeviceStatus(next, { native: true, phase: 'ready' }).rows.find(item => item.id === 'steps')?.value || '设备状态已更新'}。`);
      }
    } catch {
      // A bridge failure says nothing about whether Android granted permission.
      if (active.current) {
        setRaw(null); setPhase('error');
        if (manual) setMessage('这次未读到设备接口，不代表权限未开启；可稍后再试。');
      }
    } finally {
      requestRunning.current = false;
    }
  }, [native]);

  useEffect(() => {
    active.current = true;
    if (native) void refresh();
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', resume);
    window.addEventListener('shichen-native-resume', resume);
    document.addEventListener('visibilitychange', resume);
    // This component only exists while Settings is open. Pause polling when the
    // document is hidden; one in-flight request prevents overlapping bridge calls.
    const timer = native ? window.setInterval(resume, 5000) : null;
    return () => {
      active.current = false;
      window.removeEventListener('focus', resume);
      window.removeEventListener('shichen-native-resume', resume);
      document.removeEventListener('visibilitychange', resume);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [native, refresh]);

  async function permissionAction(method: string) {
    if (actionRunning.current || requestRunning.current) return;
    actionRunning.current = true;
    setBusy(true); setMessage('');
    const previousPermission = raw?.steps?.permission;
    try {
      const next = await nativeRequest(method);
      if (active.current) {
        if (next?.location && next?.usage && next?.steps) { setRaw(next); setPhase('ready'); }
        setMessage(devicePermissionFeedback(method, next, previousPermission));
      }
    } catch {
      if (active.current) setMessage('暂未完成权限操作，请返回应用后刷新状态，或在系统设置中检查。');
    } finally {
      actionRunning.current = false;
      if (active.current) {
        setBusy(false);
        void refresh();
      }
    }
  }

  const model = normalizeDeviceStatus(raw, { native, phase });
  const diagnostic = deviceDiagnosticSummary(raw, { native, phase });
  const permissionActions = devicePermissionActions(raw);
  async function copyDiagnostic() {
    const text = JSON.stringify(diagnostic, null, 2);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (active.current) { setCopyFallback(''); setCopyMessage('已复制诊断摘要；仅含版本、权限、监听和事件状态，不含步数值。'); }
    } catch {
      if (active.current) { setCopyFallback(text); setCopyMessage('可长按下方文本，全选后复制诊断摘要。'); }
    }
  }

  return <section className="mobile-setting-section device-data" aria-labelledby="device-data-title">
    <div className="device-data-heading"><h3 id="device-data-title">设备数据与权限</h3>{native && <span className="device-data-refresh" role="status">{phase === 'loading' ? '正在刷新…' : phase === 'error' ? '读取未成功' : '已更新'}</span>}</div>
    {!native && <p className="mobile-setting-note">当前为网页版。时间、定位与天气可在网页使用；以下系统数据需在安装版中查看。</p>}
    <div className="device-data-rows">{model.rows.map(item => <div className="device-data-row" key={item.id}>
      <div className="device-data-label"><h4>{item.title}</h4><span className={`device-data-permission${item.permission === 'granted' ? ' is-granted' : ''}`}>权限 · {item.permissionLabel}</span></div>
      <p className="device-data-value">{item.value}</p><p className="device-data-note">{item.note}</p>
    </div>)}<div className="device-data-row device-data-health"><h4>{model.health.title}</h4><p className="device-data-value">{model.health.value}</p><p className="device-data-note">{model.health.note}</p></div></div>
    {native && <><div className="mobile-permission-buttons">
      <button type="button" disabled={busy || phase === 'loading'} onClick={() => permissionAction(permissionActions.usage.method)}>{permissionActions.usage.label}</button>
      <button type="button" disabled={busy || phase === 'loading'} onClick={() => permissionAction(permissionActions.activity.method)}>{permissionActions.activity.label}</button>
      {permissionActions.retrySteps && <button type="button" disabled={busy || phase === 'loading'} onClick={() => permissionAction(permissionActions.retrySteps!.method)}>{permissionActions.retrySteps.label}</button>}
      <button type="button" disabled={busy || phase === 'loading'} onClick={() => permissionAction('openAppSettings')}>系统权限设置</button>
      <button type="button" disabled={busy || phase === 'loading'} onClick={() => refresh(true)}><RefreshCw size={13}/>刷新状态</button>
    </div><p className="mobile-setting-note">已授权后不重复弹窗，可管理权限或重新检测计步。设置打开时每 5 秒更新，返回应用也会刷新。卓易通可能未转发宿主数据；读数仅在这里展示。</p></>}
    {message && <p className="mobile-setting-note" role="status">{message}</p>}
    <details className="device-data-diagnostics"><summary>查看设备接入状态</summary><dl>
      <dt>安装包版本</dt><dd>{native ? model.appVersion : '当前为网页版'}</dd>
      <dt>Android API</dt><dd>{model.apiLevel ?? '未返回'}</dd>
      <dt>安装版本码</dt><dd>{diagnostic.versionCode ?? '旧版未返回'}</dd>
      <dt>累计计步传感器</dt><dd>{sensorLabel(diagnostic.steps.counterAvailable)}</dd>
      <dt>逐步计数传感器</dt><dd>{sensorLabel(diagnostic.steps.detectorAvailable)}</dd>
      <dt>计步监听</dt><dd>{diagnostic.steps.listenerRegistered === true ? '已开启' : diagnostic.steps.listenerRegistered === false ? '未开启' : '未返回'}</dd>
      <dt>有效传感器事件</dt><dd>{diagnostic.steps.eventsCount === null ? '未返回' : `${diagnostic.steps.eventsCount} 次`}</dd>
      <dt>最近事件</dt><dd>{ageLabel(diagnostic.steps.secondsSinceLastEvent)}</dd>
      <dt>本段监听开始</dt><dd>{ageLabel(diagnostic.steps.secondsSinceListenerRegistered)}</dd>
      <dt>本段出现增量</dt><dd>{diagnostic.steps.segmentHasIncrement === null ? '旧版未返回' : diagnostic.steps.segmentHasIncrement ? '是' : '尚未观察到'}</dd>
      <dt>备用传感器尝试</dt><dd>{diagnostic.steps.fallbackAttempted === null ? '旧版未返回' : diagnostic.steps.fallbackAttempted ? fallbackLabels[diagnostic.steps.fallbackReason || ''] || '已尝试' : '未尝试'}</dd>
    </dl><button type="button" className="mobile-link device-data-copy" onClick={copyDiagnostic}><Copy size={13}/>复制诊断摘要</button><p className="device-data-note">摘要不含位置、地址、步数值或聊天内容；包含监听状态、事件数量和距最近事件的时间，复制后由你决定是否分享。</p>{copyMessage && <p className="mobile-setting-note" role="status">{copyMessage}</p>}</details>
    {copyFallback && <textarea className="device-data-copy-fallback" aria-label="诊断摘要，可手动复制" readOnly value={copyFallback} rows={9} onFocus={event => event.currentTarget.select()}/>}
  </section>;
}
