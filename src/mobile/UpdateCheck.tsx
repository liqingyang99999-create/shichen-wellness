import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { parseRelease, compareRelease } from '../../lib/releases.mjs';
import { isNative, nativeRequest } from '../native-bridge';
import './input-tools.css';

export default function UpdateCheck() {
  const native = isNative();
  const [installed, setInstalled] = useState<any>(null);
  const [release, setRelease] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const checking = useRef(false);
  useEffect(() => {
    active.current = true;
    if (native) void nativeRequest('getCapabilities').then(value => { if (active.current) setInstalled(value); }).catch(() => {});
    return () => { active.current = false; controller.current?.abort(); };
  }, [native]);
  async function check() {
    if (checking.current) return;
    checking.current = true; setBusy(true); setError(''); setRelease(null);
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch('/download/latest.json', { cache: 'no-store', signal: abort.signal });
      if (!response.ok) throw Error('暂时未获取到更新，请稍后再试。');
      const next = parseRelease(await response.json(), window.location.origin);
      if (active.current) setRelease(next);
    } catch (reason) { if (active.current) setError(reason instanceof Error && reason.name !== 'AbortError' ? reason.message : '检查更新超时，请确认网络后重试。'); }
    finally { clearTimeout(timer); checking.current = false; if (active.current) setBusy(false); }
  }
  const comparison = release ? compareRelease(release, installed) : null;
  const downloadable = release && (!native || comparison === null || comparison > 0);
  const legacyNative = native && installed && !installed.speech;
  return <section className="mobile-setting-section mobile-updates">
    <h3>版本与更新</h3>
    <p className="mobile-setting-note">{native ? `当前安装版：${installed?.appVersion || '暂未获取'}` : '当前使用网页版，安装版可在这里下载。'}</p>
    <button type="button" className="mobile-setting-nav" onClick={() => void check()} disabled={busy}>{busy ? '正在检查更新…' : '检查更新'}<RefreshCw size={17} className={busy ? 'mobile-spin' : ''}/></button>
    {error && <p role="alert" className="update-error">{error}</p>}
    {release && <div className="update-result" role="status">
      <strong>{native && comparison !== null && comparison <= 0 ? '已是最新安装版' : `可下载版本 ${release.versionName}`}</strong>
      <p className="mobile-setting-note">{release.publishedAt} · {(release.size / 1048576).toFixed(1)} MB</p>
      <ul>{release.notes.map((note: string) => <li key={note}>{note}</li>)}</ul>
      {native && comparison === null && <p className="mobile-setting-note">未读到当前版本，下载后请按系统提示确认是否更新。</p>}
      {downloadable && !legacyNative && <a className="mobile-primary update-download" href={release.apkUrl}><Download size={16}/>下载安装包</a>}
      {downloadable && legacyNative && <div>
        <p className="mobile-setting-note">这个旧安装版需要在手机浏览器下载一次新版。安装 0.4 后，之后可在这里直接打开下载。</p>
        <input className="mobile-search" aria-label="安装版下载页地址" readOnly value="https://shichen-wellness.pages.dev/download/" onFocus={event=>event.currentTarget.select()}/>
        <button type="button" className="mobile-link" onClick={async()=>{try{await navigator.clipboard.writeText('https://shichen-wellness.pages.dev/download/');setCopyMessage('已复制，请在手机浏览器粘贴打开。');}catch{setCopyMessage('请长按上方地址复制，在手机浏览器打开。');}}}>复制下载页地址</button>
        {copyMessage&&<p className="mobile-setting-note">{copyMessage}</p>}
      </div>}
      <p className="mobile-setting-note">下载后在系统安装器或卓易通中打开，按提示覆盖安装。界面和卡片联网同步，原生功能通过安装包更新。</p>
    </div>}
  </section>;
}
