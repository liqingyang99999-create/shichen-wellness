import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { deviceDiagnosticSummary, normalizeDeviceStatus } from '../../lib/device-status.mjs';
import { isNative, nativeRequest } from '../native-bridge';
import './device-data.css';

type Phase = 'loading' | 'ready' | 'error';
const sensorLabel = (value: boolean | null) => value === true ? '有' : value === false ? '无' : '未返回';

export default function DeviceData() {
  const native = isNative();
  const [raw, setRaw] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>(native ? 'loading' : 'ready');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const active = useRef(false);
  const requestRunning = useRef(false);
  const actionRunning = useRef(false);

  const refresh = useCallback(async (manual = false) => {
    if (!native || requestRunning.current || actionRunning.current || !active.current) return;
    requestRunning.current = true;
    setPhase('loading');
    if (manual) setMessage('');
    try {
      const next = await nativeRequest('getCapabilities');
      if (!next || typeof next !== 'object' || !next.location || !next.usage || !next.steps) throw new Error('Invalid capabilities');
      if (active.current) { setRaw(next); setPhase('ready'); }
    } catch {
      // A bridge failure says nothing about whether Android granted permission.
      if (active.current) { setRaw(null); setPhase('error'); }
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
    let success = false;
    try {
      await nativeRequest(method);
      success = true;
    } catch {
      if (active.current) setMessage('暂未完成权限操作，请返回应用后刷新状态，或在系统设置中检查。');
    } finally {
      actionRunning.current = false;
      if (active.current) {
        setBusy(false);
        if (success) setMessage(method === 'requestActivity' ? '已返回授权结果；可保持应用在前台走几步。' : '从系统设置返回后会自动刷新。');
        void refresh();
      }
    }
  }

  const model = normalizeDeviceStatus(raw, { native, phase });
  const diagnostic = deviceDiagnosticSummary(raw, { native, phase });
  async function copyDiagnostic() {
    const text = JSON.stringify(diagnostic, null, 2);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (active.current) { setCopyFallback(''); setMessage('已复制诊断摘要；仅包含版本、权限和传感器状态。'); }
    } catch {
      if (active.current) { setCopyFallback(text); setMessage('可长按下方文本，全选后复制诊断摘要。'); }
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
      <button type="button" disabled={busy || phase === 'loading'} onClick={() => permissionAction('openUsageSettings')}>屏幕使用授权</button>
      <button type="button" disabled={busy || phase === 'loading'} onClick={() => permissionAction('requestActivity')}>活动权限</button>
      <button type="button" disabled={busy || phase === 'loading'} onClick={() => permissionAction('openAppSettings')}>系统权限设置</button>
      <button type="button" disabled={busy || phase === 'loading'} onClick={() => refresh(true)}><RefreshCw size={13}/>刷新状态</button>
    </div><p className="mobile-setting-note">设置打开时每 5 秒更新，返回应用也会刷新。计步和亮屏读数仅在这里展示，不当作运动或连续看屏时长。</p></>}
    <details className="device-data-diagnostics"><summary>查看设备接入状态</summary><dl>
      <dt>安装包版本</dt><dd>{native ? model.appVersion : '当前为网页版'}</dd>
      <dt>Android API</dt><dd>{model.apiLevel ?? '未返回'}</dd>
      <dt>累计计步传感器</dt><dd>{sensorLabel(diagnostic.steps.counterAvailable)}</dd>
      <dt>逐步计数传感器</dt><dd>{sensorLabel(diagnostic.steps.detectorAvailable)}</dd>
      <dt>计步监听</dt><dd>{diagnostic.steps.listenerRegistered === true ? '已开启' : diagnostic.steps.listenerRegistered === false ? '未开启' : '未返回'}</dd>
    </dl><button type="button" className="mobile-link device-data-copy" onClick={copyDiagnostic}><Copy size={13}/>复制诊断摘要</button><p className="device-data-note">摘要不含位置、地址、健康读数或聊天内容；复制后由你决定是否分享。</p></details>
    {message && <p className="mobile-setting-note" role="status">{message}</p>}
    {copyFallback && <textarea className="device-data-copy-fallback" aria-label="诊断摘要，可手动复制" readOnly value={copyFallback} rows={9} onFocus={event => event.currentTarget.select()}/>}
  </section>;
}
