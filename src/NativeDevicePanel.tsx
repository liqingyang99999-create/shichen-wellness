import {useCallback,useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {isNative,nativeRequest} from './native-bridge';
import {normalizeDeviceStatus,devicePermissionActions,devicePermissionFeedback} from '../lib/native-device-status.mjs';

/** Display-only system summaries. Never map foreground steps to daily health data. */
export default function NativeDevicePanel(){
  const native=isNative();
  const [raw,setRaw]=useState<any>(null),[phase,setPhase]=useState<'loading'|'ready'|'error'>(native?'loading':'ready'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const active=useRef(false),query=useRef(false),action=useRef(false);
  const refresh=useCallback(async(manual=false)=>{
    if(!native||!active.current||query.current||action.current)return;
    query.current=true;setPhase('loading');
    try{const next=await nativeRequest('getCapabilities');if(!next?.location||!next?.usage||!next?.steps)throw Error('设备接口返回不完整。');if(active.current){setRaw(next);setPhase('ready');if(manual)setMessage('设备状态已重新读取，缺失读数不会补成 0。');}}
    catch(error){if(active.current){setRaw(null);setPhase('error');setMessage(error instanceof Error?error.message:'设备状态暂不可用，请稍后刷新。');}}
    finally{query.current=false;}
  },[native]);
  useEffect(()=>{
    active.current=true;void refresh();
    const resume=()=>{if(!document.hidden)void refresh();};
    window.addEventListener('shichen-native-resume',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    const timer=native?setInterval(resume,5000):null;
    return()=>{active.current=false;window.removeEventListener('shichen-native-resume',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);if(timer)clearInterval(timer);};
  },[native,refresh]);
  async function run(method:string){
    if(action.current||query.current)return;action.current=true;setBusy(true);setMessage('');
    try{const next=await nativeRequest(method);if(active.current){if(next?.location&&next?.usage&&next?.steps){setRaw(next);setPhase('ready');}setMessage(devicePermissionFeedback(method,next,raw?.steps?.permission));}}
    catch(error){if(active.current)setMessage(error instanceof Error?error.message:'权限操作未完成，可返回后刷新。');}
    finally{action.current=false;if(active.current){setBusy(false);void refresh();}}
  }
  if(!native)return null;
  const model=normalizeDeviceStatus(raw,{native,phase}),actions=devicePermissionActions(raw),disabled=busy||phase==='loading';
  return <section className="section" aria-label="安卓设备数据与权限"><h3>安卓设备数据与权限</h3><p className="muted">安装版 {model.appVersion} · {phase==='loading'?'正在读取':phase==='error'?'读取未成功':'状态已更新'}</p>
    {model.rows.map(row=><div className="soft-note" key={row.id}><strong>{row.title} · {row.permissionLabel}</strong><p>{row.value}</p><p className="muted">{row.note}</p></div>)}
    <div className="soft-note"><strong>{model.health.title}</strong><p>{model.health.value}</p><p className="muted">{model.health.note}</p></div>
    <div className="button-row"><button type="button" className="secondary" disabled={disabled} onClick={()=>void run(actions.usage.method)}>{actions.usage.label}</button><button type="button" className="secondary" disabled={disabled} onClick={()=>void run(actions.activity.method)}>{actions.activity.label}</button></div>
    {actions.retrySteps&&<button type="button" className="secondary full" disabled={disabled} onClick={()=>void run(actions.retrySteps!.method)}>{actions.retrySteps.label}</button>}
    <button type="button" className="text-button" disabled={disabled} onClick={()=>void refresh(true)}><RefreshCw size={15}/>刷新设备状态</button>
    {message&&<p role="status" className="soft-note">{message}</p>}<p className="muted">此处是当前安卓环境的屏幕汇总与前台步数，不当作全天步数、连续看屏或华为健康记录。授权成功不代表卓易通已转发宿主数据。</p>
  </section>;
}
