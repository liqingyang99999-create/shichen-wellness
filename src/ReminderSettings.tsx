import {useCallback,useEffect,useRef,useState} from 'react';
import type {Store} from './model';
import {buildRoutineTimes,parseCustomTimes,readReminderConfig,buildNativeReminderPayload} from '../lib/reminder-schedule.mjs';
import {enableNotifications,openNotificationSettings,syncNotifications,testNotification,notificationStatus,openBatterySettings,openExactAlarmSettings,scheduleBackgroundTest} from './notifications';
import {isNative} from './native-bridge';
import {reminderSystemStatus} from '../lib/notification-status.mjs';

type Props={store:Store;competition:boolean;onChange:(patch:Partial<Store>)=>void;onTest:(id:string)=>void;syncMessage:string};
export default function ReminderSettings({store,competition,onChange,onTest,syncMessage}:Props){
  const [config,setConfig]=useState<NonNullable<Store['reminderConfig']>>(()=>readReminderConfig(store.reminderConfig,store.routineTimes));
  const [custom,setCustom]=useState(()=>config.customTimes.join('、'));
  const [busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const native=isNative(),[system,setSystem]=useState<any>(null),[statusError,setStatusError]=useState('');
  const refreshing=useRef(false);
  const active=useRef(true),request=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{if(!native||refreshing.current)return;refreshing.current=true;try{const next=await notificationStatus();if(active.current){setSystem(next);setStatusError('');}}catch(error){if(active.current)setStatusError(error instanceof Error?error.message:'系统状态暂未读取，请刷新重试。');}finally{refreshing.current=false;}},[native]);
  useEffect(()=>{active.current=true;void refresh();const resume=()=>{if(!document.hidden)void refresh();};window.addEventListener('focus',resume);window.addEventListener('shichen-native-resume',resume);document.addEventListener('visibilitychange',resume);return()=>{active.current=false;request.current?.abort();window.removeEventListener('focus',resume);window.removeEventListener('shichen-native-resume',resume);document.removeEventListener('visibilitychange',resume);};},[refresh]);
  useEffect(()=>{if(syncMessage)void refresh();},[syncMessage,refresh]);
  const mode=competition?'competition':'personal';
  async function run(label:string,task:(signal:AbortSignal)=>Promise<string>){
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setBusy(label);setMessage(label);
    try{const result=await task(controller.signal);if(active.current&&!controller.signal.aborted)setMessage(result);}
    catch(error){if(active.current&&!controller.signal.aborted)setMessage(error instanceof Error?error.message:'操作未完成，请重试。');}
    finally{if(active.current&&request.current===controller){setBusy('');void refresh();}}
  }
  function cancelWait(){request.current?.abort();setBusy('');setMessage('已停止等待；系统权限提示可能仍在手机上。完成后可重新检查。');}
  function enable(){void run('正在请求系统通知权限…',async signal=>{const result=await enableNotifications(signal);if(signal.aborted)return '';onChange({notificationEnabled:true,remindersPaused:false});return `${result}提醒设置正在同步，请查看下方状态。`;});}
  function pause(){onChange({remindersPaused:true,notificationEnabled:false});void run('正在暂停并取消本地提醒…',async signal=>{const result=await syncNotifications({...buildNativeReminderPayload(store,mode),enabled:false},signal);return result.native?result.message:'本模式的日常与用药定时提醒已暂停，时间记录仍保留。';});}
  function save(){try{const next={...config,customTimes:config.mode==='custom'?parseCustomTimes(custom):config.customTimes},times=buildRoutineTimes(next);onChange({reminderConfig:next,routineTimes:times});setConfig(next);setMessage(`已保存${times.length}个日常时点：${times.join('、')}。${store.remindersPaused?'当前仍暂停提醒。':store.notificationEnabled?'正在同步到系统。':'若需要系统通知，请点击开启。'}`);}catch(error){setMessage(error instanceof Error?error.message:'时间设置有误。');}}
  function test(){void run('正在提交一条真实测试通知…',async signal=>{const result=await testNotification(mode,signal);if(signal.aborted)return '';onTest(result.id);return '已向系统提交一条测试通知，请查看通知栏；展示方式还受手机的通知和勿扰设置影响。';});}
  const status=reminderSystemStatus(system);
  const at=(value:number)=>new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  return <section className="reminder-settings" aria-label="提醒设置">
    <p className="muted">{native?'提醒交给手机系统，切到后台后无需保持网页打开。':'网页需要保持运行；关闭后不保证按时提醒。可安装安卓版使用后台提醒。'}普通提醒在23:00—05:00静默。</p>
    {native&&<div className="reminder-system-status" aria-label="系统提醒状态"><dl><div><dt>系统通知</dt><dd>{status.notification}{status.channelNote&&<small>{status.channelNote}</small>}</dd></div><div><dt>本机日程</dt><dd>{status.schedule}{status.nextAt&&<small>下一次 {at(status.nextAt)}</small>}{status.mode&&<small>{status.mode}</small>}</dd></div><div><dt>电池与后台</dt><dd>{status.battery}</dd></div></dl><button className="text-button" disabled={!!busy} onClick={()=>void refresh()}>刷新系统状态</button>{statusError&&<p className="muted" role="status">{statusError}</p>}</div>}
    <div className="button-row"><button className="secondary" disabled={!!busy} onClick={enable}>{busy==='正在请求系统通知权限…'?'正在请求…':store.notificationEnabled&&!store.remindersPaused?'重新检查权限':'开启系统通知'}</button><button className="secondary" disabled={!!busy} onClick={test}>发送测试通知</button></div>
    <button className="text-button" onClick={pause}>{store.remindersPaused?'再次确认取消定时提醒':'暂停本模式的定时提醒'}</button>
    {native&&<><button className="secondary full" disabled={!!busy} onClick={()=>void run('正在登记一分钟后的后台测试…',async signal=>{const result=await scheduleBackgroundTest(mode,signal);return `已登记 ${at(result.scheduledAt)} 的测试。现在可以按手机主页键，将应用切到后台后查看通知栏。${result.scheduleMode==='inexact'?'当前系统可能延迟送达。':''}`;})}>一分钟后提醒我 · 测试后台</button><details className="reminder-system-options"><summary>系统通知与后台设置</summary><div className="button-row"><button className="text-button" disabled={!!busy} onClick={()=>void run('正在打开系统通知设置…',async signal=>{await openNotificationSettings(signal);return '通知设置已打开，返回后会重新读取状态。';})}>通知设置</button><button className="text-button" disabled={!!busy} onClick={()=>void run('正在打开电池与后台设置…',async signal=>{await openBatterySettings(signal);return '请在系统电池设置中找到时辰心管家，按需要允许后台运行。返回后会重新读取状态。';})}>电池与后台设置</button>{status.showExactSettings&&<button className="text-button" disabled={!!busy} onClick={()=>void run('正在打开准点提醒设置…',async signal=>{await openExactAlarmSettings(signal);return '请按需要允许闹钟和提醒权限；未允许时使用系统弹性提醒。';})}>允许准点提醒</button>}</div><p className="muted">强制停止应用、关机或退出安卓容器会中断提醒，重新打开应用后恢复日程。省电、勿扰及手机厂商的后台设置也可能影响送达。</p></details></>}
    {busy&&<button className="text-button" onClick={cancelWait}>停止等待</button>}
    <p className="soft-note" role="status" aria-live="polite">{message|| (store.remindersPaused?'定时提醒已暂停。':store.notificationEnabled?'已允许系统通知。':'尚未开启系统通知。')}</p>
    {syncMessage&&<p className="muted" role="status">{syncMessage}</p>}
    <label className="field">日常提醒节律<select aria-label="日常提醒节律" value={config.mode==='interval'?`interval-${config.intervalHours}`:config.mode} onChange={e=>{const value=e.target.value;setConfig(c=>({...c,mode:value.startsWith('interval-')?'interval':value,intervalHours:value.startsWith('interval-')?Number(value.split('-')[1]):c.intervalHours}));}}>
      <option value="daily">早中晚 · 07:30 / 12:00 / 19:00</option><option value="shichen">白天六个时辰窗口</option>{[1,2,3,4].map(hours=><option key={hours} value={`interval-${hours}`}>每{hours}小时一次</option>)}<option value="custom">自定义多个时间</option>
    </select></label>
    <div className="form-grid"><label className="field">日间开始<input aria-label="日间开始" type="time" min="05:00" max="22:59" value={config.start} onChange={e=>setConfig(c=>({...c,start:e.target.value}))}/></label><label className="field">日间结束<input aria-label="日间结束" type="time" min="05:01" max="23:00" value={config.end} onChange={e=>setConfig(c=>({...c,end:e.target.value}))}/></label></div>
    {config.mode==='custom'&&<label className="field">提醒时间<input aria-label="自定义提醒时间" value={custom} placeholder="08:00、12:30、19:00" onChange={e=>setCustom(e.target.value)} maxLength={180}/></label>}
    <p className="muted">每天最多18个普通时点。间隔从日间开始计算；预设时点只保留日间范围内的时间。提醒还需符合当时状态与卡片冷却。</p>
    <button className="secondary full" disabled={!!busy} onClick={save}>保存提醒节律</button>
    <label className="check reminder-night"><input type="checkbox" checked={store.nightMedicationSilent===true} onChange={e=>onChange({nightMedicationSilent:e.target.checked})}/><span>按原时间保留夜间用药静音提醒<small>默认关闭；只发静音通知，不判断是否睡着，不更改你录入的医嘱时间。</small></span></label>
  </section>;
}
