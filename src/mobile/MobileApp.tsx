import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Settings, ArrowUp, RefreshCw, Check, LoaderCircle, ChevronRight, MessageCircle, MapPin, X, ExternalLink } from 'lucide-react';
import { createReminderState } from '../../lib/context.mjs';
import { mobileSnapshot, mobileTime, sceneForCard, actionDurationSeconds } from '../../lib/mobile-context.mjs';
import { readLocationPreferences, requestPreciseLocation, weatherRequestPath, lookupCurrentCity, matchLocationPreset, sanitizeConditions } from '../../lib/location.mjs';
import ActivityConditions from '../components/ActivityConditions';
import LocationWeather from '../components/LocationWeather';
import { isNative, nativeRequest } from '../native-bridge';
import Sheet from './Sheet';
import './mobile.css';

const TIME_NAMES=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const MERIDIANS=['足少阳胆经','足厥阴肝经','手太阴肺经','手阳明大肠经','足阳明胃经','足太阴脾经','手少阴心经','手太阳小肠经','足太阳膀胱经','足少阴肾经','手厥阴心包经','手少阳三焦经'];
type HistoryItem={id:number;text:string;reply:string;cardTitle:string;time:string};
const PREF_KEY='shichen-mobile-preferences-v1';
const WEATHER_KEY='shichen-mobile-weather-v1';
function readPreferences(){try{const x=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');return {conditions:x.conditions&&typeof x.conditions==='object'?x.conditions:{},largeText:x.largeText===true};}catch{return {conditions:{},largeText:false};}}
function readWeather(){try{const value=JSON.parse(localStorage.getItem(WEATHER_KEY)||'null');const age=Date.now()-Date.parse(value?.observedAt);return value?.source==='open-meteo'&&Number.isFinite(value.tempC)&&age>=0&&age<6*3600000?value:null;}catch{return null;}}
async function api(path:string,body?:unknown,signal?:AbortSignal):Promise<any>{const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal});const data:any=await response.json();if(!response.ok)throw Error(data.error||'暂时没有连接上，请稍后重试。');return data;}

export default function MobileApp(){
  const [prefs,setPrefs]=useState(readPreferences);
  const [clock,setClock]=useState(()=>mobileTime(new Date()));
  const [simulated,setSimulated]=useState(false);
  const [simulationTime,setSimulationTime]=useState(()=>mobileTime(new Date()).slice(0,16));
  const [weather,setWeather]=useState<any>(readWeather);
  const [context,setContext]=useState<any>(null);
  const [result,setResult]=useState<any>(null);
  const [history,setHistory]=useState<HistoryItem[]>([]);
  const [catalog,setCatalog]=useState<any>(null);
  const [status,setStatus]=useState<any>(null);
  const [text,setText]=useState('');
  const [sheet,setSheet]=useState<'settings'|'source'|'chat'|'catalog'|null>(null);
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState(false);
  const [stage,setStage]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [safe,setSafe]=useState(()=>{try{return localStorage.getItem('shichen-safety')==='seen';}catch{return false;}});
  const [countdown,setCountdown]=useState<number|null>(null);
  const [completed,setCompleted]=useState(false);
  const [started,setStarted]=useState(false);
  const [nativeStatus,setNativeStatus]=useState<any>(null);
  const [nativeBusy,setNativeBusy]=useState(false);
  const [nativeMessage,setNativeMessage]=useState('');
  const stateRef=useRef<any>(createReminderState(new Date().toISOString()));
  const requestRef=useRef<AbortController|null>(null);
  const mounted=useRef(false);
  const sequence=useRef(0);
  const running=useRef(false);
  const composerRef=useRef<HTMLTextAreaElement>(null);
  const lastInput=useRef('');
  const simulationNow=simulated&&simulationTime?`${simulationTime}:00+08:00`:'';
  const now=simulationNow||clock;
  const displayNow=result?.trace?.find((node:any)=>node.id==='N03')?.output?.snapshot?.now||now;
  const timeIndex=Math.floor((Number(now.slice(11,13))+1)%24/2);
  const start=(timeIndex*2+23)%24;
  const card=result?.card;
  const source=card?.source;
  const scene=sceneForCard(card,displayNow);
  const solarToday=catalog?.solar?.find((term:any)=>term.date===now.slice(0,10));

  useEffect(()=>{mounted.current=true;const controller=new AbortController();Promise.allSettled([api('/api/catalog',undefined,controller.signal),api('/api/status',undefined,controller.signal)]).then(([c,s])=>{if(!mounted.current)return;if(c.status==='fulfilled')setCatalog(c.value);if(s.status==='fulfilled')setStatus(s.value);});const interval=setInterval(()=>setClock(mobileTime(new Date())),30000);void generate('');void refreshKnownWeather(controller.signal);return()=>{mounted.current=false;controller.abort();requestRef.current?.abort();clearInterval(interval);};},[]);
  useEffect(()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch{/* Current-session settings remain usable. */}},[prefs]);
  useEffect(()=>{try{if(weather)localStorage.setItem(WEATHER_KEY,JSON.stringify(weather));else localStorage.removeItem(WEATHER_KEY);}catch{}},[weather]);
  useEffect(()=>{if(countdown===null||countdown<=0)return;const id=setTimeout(()=>setCountdown(value=>value===null?null:value-1),1000);return()=>clearTimeout(id);},[countdown]);
  useEffect(()=>{if(sheet==='settings'&&isNative())void refreshNative();},[sheet]);

  async function refreshNative(){try{setNativeStatus(await nativeRequest('getCapabilities'));}catch(e:any){setNativeMessage(e.message);}}
  async function refreshKnownWeather(signal:AbortSignal){
    // Automatic refresh only follows an existing grant or a city the person saved.
    // Never request a first permission from the home screen.
    try{
      const saved=readLocationPreferences(localStorage);
      let coords:any=saved.city;
      let label=saved.city?.name||'当前位置';
      let locationSource='city';
      if(!coords){
        let granted=false;
        if(isNative()){const capabilities=await nativeRequest('getCapabilities');granted=capabilities?.location?.permission==='granted';}
        else if(navigator.permissions){const permission=await navigator.permissions.query({name:'geolocation'});granted=permission.state==='granted';}
        if(!granted||signal.aborted)return;
        coords=await requestPreciseLocation(navigator.geolocation);locationSource='gps';
        const matched=matchLocationPreset(coords,saved.presets);
        if(matched&&mounted.current)setPrefs(previous=>({...previous,conditions:{...previous.conditions,...sanitizeConditions(matched.conditions)}}));
        const city=await lookupCurrentCity(coords,{signal});label=city?.name||matched?.city?.name||'当前位置';
      }
      if(signal.aborted)return;
      const data=await api(weatherRequestPath(coords),undefined,signal);
      if(mounted.current&&data.weather?.source==='open-meteo')setWeather({...data.weather,city:label,locationSource});
    }catch{/* Keep a fresh cached weather value, or leave the field unknown. */}
  }
  async function nativeAction(method:string){if(nativeBusy)return;setNativeBusy(true);setNativeMessage('');try{await nativeRequest(method);await refreshNative();if(method==='openUsageSettings'||method==='openAppSettings')setNativeMessage('从系统设置返回后，点击“刷新状态”查看授权结果。');}catch(e:any){setNativeMessage(e.message);}finally{setNativeBusy(false);}}

  async function generate(message:string,solar=false){
    if(running.current)return;
    running.current=true;const ticket=++sequence.current;const controller=new AbortController();requestRef.current=controller;
    setBusy(true);setError('');setNotice('');setCountdown(null);setCompleted(false);setStarted(false);lastInput.current=message;
    if(message.trim())composerRef.current?.blur();
    try{
      const {inputMode:_mode,...baseSnapshot}=mobileSnapshot(new Date().toISOString(),prefs.conditions,context,weather,simulationNow);
      const snapshot:any=baseSnapshot;
      if(solar)snapshot.previewSolar=true;
      setStage(message.trim()?'正在听懂你的近况，为你选卡':'为此刻找一张合适的卡');
      const response=await api('/api/mobile/card',{text:message,snapshot,state:{recentCards:(stateRef.current.recentCards||[]).slice(-3)}},controller.signal);
      if(!mounted.current||ticket!==sequence.current)return;
      setResult(response);stateRef.current=response.state||stateRef.current;
      if(message.trim()){
        if(response.context)setContext({snapshot:response.context,capturedAt:Date.now()});
        setHistory(items=>[...items,{id:Date.now(),text:message,reply:response.explanation||response.decision?.reason||'已根据当前情境更新。',cardTitle:response.card?.title||'',time:snapshot.now}].slice(-20));
        setText('');
      }
      if(!response.card)setNotice(response.decision?.reason||'此刻先休息一下，准备好时再来看看。');
    }catch(e:any){if(mounted.current&&ticket===sequence.current&&e.name!=='AbortError')setError(e.message||'连接中断，请重试。');}
    finally{if(ticket===sequence.current){running.current=false;if(mounted.current){setBusy(false);setStage('');}}}
  }
  function invalidate(){sequence.current++;requestRef.current?.abort();running.current=false;setBusy(false);setResult(null);setError('');setCountdown(null);setCompleted(false);setStarted(false);}
  function setCondition(key:string,value:boolean|undefined){invalidate();setContext(null);setPrefs(previous=>({...previous,conditions:{...previous.conditions,[key]:value}}));}
  function submit(event:FormEvent){event.preventDefault();if(text.trim())void generate(text.trim());}
  function dismissSafety(){setSafe(true);try{localStorage.setItem('shichen-safety','seen');}catch{}}
  const safeUrl=(value:any)=>typeof value==='string'&&/^https:\/\//.test(value)?value:undefined;

  return <div className={`mobile-app${prefs.largeText?' mobile-large-text':''}`}>
    <div className="mobile-top"><a href="?mode=app" className="mobile-brand">时辰心管家</a><button className="mobile-icon" aria-label="设置" onClick={()=>setSheet('settings')}><Settings size={23}/></button></div>
    <div className="mobile-time"><h1>{TIME_NAMES[timeIndex]}时 <span>{String(start).padStart(2,'0')}:00–{String((start+2)%24).padStart(2,'0')}:00</span></h1><p>{MERIDIANS[timeIndex]}<span className="mobile-time-divider">/</span>{simulated?'模拟时间 ':''}{now.slice(11,16)}</p>{weather&&<button className="mobile-weather" onClick={()=>setSheet('settings')}><MapPin size={12}/>{weather.city} {weather.description} {weather.tempC}°C</button>}</div>
    <main className="mobile-stage">
      {!safe&&<div className="mobile-safety"><span>轻柔操作，保证自身安全；不适时停止。</span><button aria-label="知道了" onClick={dismissSafety}><X size={15}/></button></div>}
      {error&&<div role="alert" className="mobile-error">{error}<button onClick={()=>generate(lastInput.current)} disabled={busy}>重试</button></div>}
      <article className={`wellness-card${busy?' wellness-busy':''}`} key={card?.id||'empty'} aria-label="此刻行动卡" aria-busy={busy}>
        <div className="wellness-art" aria-hidden="true"><img src={`/scenes/${scene}.webp`} alt=""/></div>
        {card?<>
          <div className="wellness-copy"><h2>{card.title}</h2><p className="wellness-duration">{card.duration||'按需完成'}</p>{card.isSolar&&<div className="wellness-poem"><p>{card.solar?.quote}</p><small>{card.solar?.author}《{card.solar?.title}》</small></div>}<ol className="wellness-steps">{card.steps.map((step:string,index:number)=><li key={index}><span>{index+1}</span><p>{step}</p></li>)}</ol></div>
          <div className="wellness-breathing-room"/>
          <div className="wellness-bottom"><button className="wellness-source" onClick={()=>setSheet('source')}>{source?.label||'常用健康小知识'}<span>查看出处</span></button><div className="wellness-actions"><button className="mobile-primary" disabled={busy||completed||(countdown!==null&&countdown>0)} onClick={()=>{if(started){setCompleted(true);setCountdown(null);}else{setStarted(true);setCountdown(actionDurationSeconds(card.duration));}}}>{completed?<><Check size={18}/>已完成</>:countdown!==null&&countdown>0?`剩余 ${countdown} 秒`:started?'完成行动':'开始行动'}</button><button className="mobile-secondary" onClick={()=>generate('')} disabled={busy}>换一张</button></div><p className="wellness-generation-time">依据 {displayNow.slice(11,16)} 的情境{simulated?' · 模拟时间':''}</p></div>
        </>:<div className="wellness-empty"><h2>{busy?'给此刻，留一点空白。':'让这一刻，轻松一点。'}</h2><p>{notice||'一件简单的小行动，陪你回到日常。'}</p>{!busy&&<button className="mobile-primary" onClick={()=>generate('')}>看看此刻的卡片</button>}</div>}
        {busy&&<div className="wellness-progress" role="status"><LoaderCircle size={16}/>{stage}</div>}
      </article>
      {solarToday&&!card?.isSolar&&<button className="mobile-solar" disabled={busy} onClick={()=>generate('',true)}>今日{solarToday.term} · 看节气诗意<ChevronRight size={15}/></button>}
      {notice&&card&&<p className="mobile-notice" role="status">{notice}</p>}
    </main>
    <div className="mobile-composer-wrap">{history.length>0&&<button className="mobile-chat-return" onClick={()=>setSheet('chat')}><MessageCircle size={13}/>查看这次对话<ChevronRight size={13}/></button>}<form className="mobile-composer" onSubmit={submit}><textarea ref={composerRef} aria-label="说说你现在的状态" rows={1} maxLength={1200} value={text} placeholder="说说你现在的状态…" onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(text.trim())void generate(text.trim());}}}/><button type="submit" aria-label="发送并生成卡片" disabled={busy||!text.trim()}>{busy?<LoaderCircle className="mobile-spin" size={21}/>:<ArrowUp size={24}/>}</button></form></div>

    {sheet==='source'&&card&&<Sheet title={card.isSolar?'节气诗意':source?.label||'常用健康小知识'} onClose={()=>setSheet(null)}>{card.isSolar?<><blockquote>{card.solar?.quote}</blockquote><p>{card.solar?.author}《{card.solar?.title}》</p><p>{card.solar?.theme}</p></>:<><p>{source?.text||'本卡依据常用生活知识整理。'}</p>{source?.title&&<h3>{source.title}</h3>}</>}{safeUrl(card.solar?.url||source?.url)&&<a className="mobile-external" href={card.solar?.url||source?.url} target="_blank" rel="noreferrer">查看相关原文<ExternalLink size={14}/></a>}{result.explanation&&<div className="mobile-explanation"><h3>为什么是这张卡</h3><p>{result.explanation}</p></div>}<button className="mobile-primary mobile-full" onClick={()=>setSheet(null)}>回到这张卡</button></Sheet>}
    {sheet==='chat'&&<Sheet title="这次对话" onClose={()=>setSheet(null)}><div className="mobile-conversation">{history.map(item=><div key={item.id}><p className="mobile-chat-user">{item.text}</p><p className="mobile-chat-reply">{item.reply}{item.cardTitle&&<strong>为你推荐：{item.cardTitle}</strong>}<small>{item.time.slice(11,16)}</small></p></div>)}</div><p className="mobile-setting-note">对话只保留在本次页面中。可以继续在底部补充近况。</p><button className="mobile-primary mobile-full" onClick={()=>{setSheet(null);setTimeout(()=>composerRef.current?.focus(),0);}}>继续说说</button></Sheet>}
    {sheet==='catalog'&&<Sheet title="行动卡片库" onClose={()=>setSheet(null)}><input className="mobile-search" aria-label="搜索卡片" placeholder="搜索名称或类别" value={query} onChange={event=>setQuery(event.target.value)}/><div className="mobile-catalog">{(catalog?.cards||[]).filter((c:any)=>`${c.title} ${c.category}`.includes(query.trim())).map((c:any)=><details key={c.id}><summary>{c.title}<span>{c.category}</span></summary><ol>{c.steps.map((step:string,i:number)=><li key={i}>{step}</li>)}</ol></details>)}</div></Sheet>}
    {sheet==='settings'&&<Sheet title="设置" onClose={()=>setSheet(null)}>
      <section className="mobile-setting-section"><h3>时间与阅读</h3><label className="mobile-toggle"><span>使用模拟时间<small>关闭后恢复手机当前北京时间</small></span><input type="checkbox" checked={simulated} onChange={event=>{invalidate();setSimulated(event.target.checked);setContext(null);}}/></label>{simulated&&<label className="mobile-field">模拟日期与时间<input aria-label="模拟日期与时间" type="datetime-local" value={simulationTime} onInput={event=>{const value=event.currentTarget.value;if(value){invalidate();setSimulationTime(value);setContext(null);}}} onChange={event=>{if(event.target.value){invalidate();setSimulationTime(event.target.value);setContext(null);}}}/></label>}<label className="mobile-toggle"><span>放大文字</span><input type="checkbox" checked={prefs.largeText} onChange={event=>setPrefs(previous=>({...previous,largeText:event.target.checked}))}/></label></section>
      <LocationWeather mode="daily" conditions={prefs.conditions} weather={weather} onWeather={value=>{invalidate();setWeather(value);}} onConditions={(patch,label)=>{invalidate();setContext(null);setPrefs(previous=>({...previous,conditions:{...previous.conditions,...patch}}));setNativeMessage(`已使用${label}保存的活动条件。`);}}/>
      <section className="mobile-setting-section"><h3>设备数据与权限</h3>{isNative()?<><dl className="mobile-capabilities"><dt>定位</dt><dd>{nativeStatus?.location?.permission==='granted'?'已授权':'未授权'}</dd><dt>今日屏幕使用</dt><dd>{nativeStatus?.usage?.permission==='granted'&&Number.isFinite(nativeStatus.usage.screenMinutesToday)?`${Math.round(nativeStatus.usage.screenMinutesToday)} 分钟`:'未获取'}</dd><dt>本次活动步数</dt><dd>{nativeStatus?.steps?.available&&Number.isFinite(nativeStatus.steps.sessionSteps)?`${nativeStatus.steps.sessionSteps} 步`:'未获取'}</dd><dt>华为健康 / 睡眠</dt><dd>未接入</dd></dl><div className="mobile-permission-buttons"><button disabled={nativeBusy} onClick={()=>nativeAction('openUsageSettings')}>屏幕使用授权</button><button disabled={nativeBusy} onClick={()=>nativeAction('requestActivity')}>活动权限</button><button disabled={nativeBusy} onClick={()=>nativeAction('openAppSettings')}>系统权限设置</button><button disabled={nativeBusy} onClick={()=>refreshNative()}><RefreshCw size={13}/>刷新状态</button></div><p className="mobile-setting-note">屏幕累计时长与本次步数只在这里展示，不当作连续看屏或运动时长。卓易通内可见的数据以系统实际返回为准。</p></>:<p className="mobile-setting-note">当前为网页版，可获取时间、定位与天气。屏幕使用和步数需在安装版中另行授权；华为健康、睡眠尚未接入。</p>}{nativeMessage&&<p role="status" className="mobile-setting-note">{nativeMessage}</p>}</section>
      <details className="mobile-setting-details"><summary>活动条件<ChevronRight size={16}/></summary><p className="mobile-setting-note">可以在聊天里告诉我；没有说明的条件保持未知。</p><ActivityConditions snapshot={prefs.conditions} onChange={setCondition}/><button className="mobile-link" onClick={()=>{invalidate();setContext(null);setPrefs(previous=>({...previous,conditions:{}}));setNotice('已清除活动条件。');}}>清除活动条件</button></details>
      <section className="mobile-setting-section"><button className="mobile-setting-nav" onClick={()=>setSheet('catalog')}>查看全部卡片<ChevronRight size={17}/></button><button className="mobile-setting-nav" onClick={()=>{invalidate();setContext(null);setHistory([]);setText('');setNotice('已清除本次对话。');}}>清除本次对话<RefreshCw size={15}/></button><a className="mobile-setting-nav" href="?mode=demo">打开参赛模拟演示<ChevronRight size={17}/></a><p className="mobile-setting-note">{status?.configured?'AI 已连接':'AI 状态暂未获取'} · {catalog?.cards?.length||'—'} 项行动<br/>聊天直接更新情境，不再逐项确认。卡片按已知条件筛选。</p></section>
      <button className="mobile-primary mobile-full" onClick={()=>{setSheet(null);if(!result)void generate('');}}>完成设置</button>
    </Sheet>}
  </div>;
}
