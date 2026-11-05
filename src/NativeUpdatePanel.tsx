import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
import {isNative,nativeRequest} from './native-bridge';
import {parseRelease,compareRelease,apkUrlForInstalled} from '../lib/native-releases.mjs';
const DOWNLOAD_ORIGIN='https://shichen-wellness.pages.dev';
export default function NativeUpdatePanel(){
  const native=isNative();
  const [installed,setInstalled]=useState<any>(null),[release,setRelease]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const active=useRef(false),running=useRef(false),controller=useRef<AbortController|null>(null);
  useEffect(()=>{active.current=true;if(native)void nativeRequest('getCapabilities').then(value=>{if(active.current)setInstalled(value);}).catch(()=>{});return()=>{active.current=false;controller.current?.abort();};},[native]);
  async function check(){
    if(running.current)return;running.current=true;setBusy(true);setMessage('');setRelease(null);
    const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),15000);
    try{const response=await fetch('/download/latest.json',{cache:'no-store',signal:abort.signal});if(!response.ok)throw Error('暂时未获取到更新，请稍后重试。');const next=parseRelease(await response.json(),DOWNLOAD_ORIGIN);if(active.current)setRelease(next);}
    catch(error){if(active.current)setMessage(error instanceof Error&&error.name!=='AbortError'?error.message:'检查更新超时，请确认网络后重试。');}
    finally{clearTimeout(timer);running.current=false;if(active.current)setBusy(false);}
  }
  const comparison=release?compareRelease(release,installed):null;
  const apkUrl=release?apkUrlForInstalled(release,native?installed:null):'';
  const legacyNative=native&&installed&&!installed.speech;
  const downloadPage=release?`${DOWNLOAD_ORIGIN}/download/${release.versionName}/`:`${DOWNLOAD_ORIGIN}/download/`;
  async function copyDownload(){try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(downloadPage);if(active.current)setMessage('下载页地址已复制，请在手机浏览器打开。');}catch{if(active.current)setMessage('请长按下方下载页地址，全选复制后在手机浏览器打开。');}}
  return <section className="section" aria-label="版本与更新"><h3>版本与更新</h3><p className="muted">{native?`当前安装版：${installed?.appVersion||'暂未获取'}`:'当前使用网页版，可下载安卓安装包。'}</p><button type="button" className="secondary full" onClick={()=>void check()} disabled={busy}><RefreshCw size={16}/>{busy?'正在检查更新…':'检查安装包更新'}</button>
    {message&&<p role="status" className="soft-note">{message}</p>}{release&&<div role="status" className="soft-note"><strong>{native&&comparison!==null&&comparison<=0?'已是最新安装版':`可下载版本 ${release.versionName}`}</strong><p>{release.publishedAt} · {(release.size/1048576).toFixed(1)} MB</p><ul>{release.notes.map((text:string)=><li key={text}>{text}</li>)}</ul>{native&&comparison===null&&<p className="muted">未读到安装版本，下载后请按系统提示确认更新。</p>}{(!native||comparison===null||comparison>0)&&!legacyNative&&<a className="primary full" href={apkUrl}><Download size={16}/>下载安装包</a>}{legacyNative&&<p className="muted">当前安装包较旧，请复制下方专用下载页，在手机浏览器中下载新版，再按提示覆盖安装。</p>}<p className="muted">新版安装包会将下载交给系统浏览器；旧版本若未跳转，可复制下方地址。安装由你在系统或卓易通中确认，不会自动下载或安装。</p></div>}
    {!release&&<a className="text-button" href={`${DOWNLOAD_ORIGIN}/download/`} target="_blank" rel="noreferrer">打开安装包下载页</a>}
    <details><summary>在手机浏览器打开下载页</summary><input className="search" aria-label="安装包下载页地址" readOnly value={downloadPage} onFocus={event=>event.currentTarget.select()}/><button type="button" className="text-button" onClick={()=>void copyDownload()}>复制下载页地址</button></details>
  </section>;
}
