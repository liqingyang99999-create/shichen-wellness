"use client";
import {useEffect, useRef, useState} from 'react';
import {MapPin, LocateFixed, Search, CloudSun} from 'lucide-react';
import {CONDITION_FIELDS, sanitizeConditions, sanitizePreset, readLocationPreferences, writeLocationPreferences, precisePositionUsable, matchLocationPreset, requestPreciseLocation, weatherRequestPath, lookupCurrentCity} from '../../lib/location.mjs';
import './location-weather.css';

type Conditions = Partial<Record<string, boolean>>;
type City = {id:string;name:string;admin1:string;admin2:string;countryCode:string;latitude:number;longitude:number;timezone:string};
type Position = {source:'gps';latitude:number;longitude:number;accuracy:number;observedAt:string};
type Preset = {id:'home'|'company';name:string;address:string;city:City|null;coords:({source:string;latitude:number;longitude:number;accuracy?:number})|null;radius:number;conditions:Conditions};
export type OnlineWeather = {source:'open-meteo';city:string;tempC:number;rain:boolean;wind:number;windUnit:string;description:string;observedAt:string;fetchedAt:string;locationSource:'gps'|'city';[key:string]:unknown};
type Props = {mode:'panel'|'chat';conditions:Conditions;weather?:OnlineWeather|null;onWeather:(weather:OnlineWeather|null)=>void;onConditions:(patch:Conditions,label:string)=>void};
const LABELS:Record<string,string> = {canLeaveSeat:'可以离座',canLookFar:'可以远眺',canCloseEyes:'可以闭目',sitting:'已坐稳',spaceEnough:'空间足够',hasSupport:'有固定支撑',waterAvailable:'有饮用水',headphones:'正在用耳机',atMeal:'正在进餐',goingOut:'准备外出'};
const EMPTY_PRESETS:Preset[] = [];
const cityLabel = (city:City) => [...new Set([city.name,city.admin2,city.admin1].filter(Boolean))].join(' · ');
const errorText = (error:unknown) => error instanceof Error ? error.message : '暂时未能完成，请重试。';

export default function LocationWeather({mode,conditions,weather,onWeather,onConditions}:Props) {
  const [presets,setPresets] = useState<Preset[]>(EMPTY_PRESETS);
  const [city,setCity] = useState<City|null>(null);
  const [position,setPosition] = useState<Position|null>(null);
  const [query,setQuery] = useState('');
  const [cities,setCities] = useState<City[]>([]);
  const [searched,setSearched] = useState(false);
  const [searching,setSearching] = useState(false);
  const [working,setWorking] = useState(false);
  const [message,setMessage] = useState('');
  const [matchNote,setMatchNote] = useState('');
  const [draftId,setDraftId] = useState<'home'|'company'>('home');
  const [address,setAddress] = useState('');
  const [draftConditions,setDraftConditions] = useState<Conditions>({});
  const [coordinateChoice,setCoordinateChoice] = useState<'none'|'gps'|'city'|'saved'>('none');
  const weatherSequence = useRef(0);
  const searchSequence = useRef(0);
  const weatherAbort = useRef<AbortController|null>(null);
  const searchAbort = useRef<AbortController|null>(null);
  const mounted = useRef(false);
  const presetsRef = useRef<Preset[]>(EMPTY_PRESETS);
  presetsRef.current = presets;
  useEffect(() => {
    mounted.current = true;
    try {
      const stored = readLocationPreferences(window.localStorage);
      setPresets(stored.presets as Preset[]);
      setCity(stored.city as City|null);
      setQuery(stored.city?.name || '');
    } catch { setMessage('浏览器未开放本机存储，仍可定位或手选城市获取天气。'); }
    return () => { mounted.current=false; weatherSequence.current++; searchSequence.current++; weatherAbort.current?.abort(); searchAbort.current?.abort(); };
  }, [mode]);

  const persist = (nextPresets:Preset[], nextCity:City|null) => { try { return writeLocationPreferences(window.localStorage,{presets:nextPresets,city:nextCity}); } catch { return false; } };
  const beginWeather = () => {
    weatherSequence.current++;
    weatherAbort.current?.abort();
    weatherAbort.current = new AbortController();
    onWeather(null);
    setWorking(true);
    setMessage('');
    return weatherSequence.current;
  };
  const isCurrent = (id:number) => mounted.current && id === weatherSequence.current;

  async function loadWeather(coords:{latitude:number;longitude:number}, label:string, source:'gps'|'city', id:number, cityLookup?:Promise<{name:string}|null>) {
    try {
      const response = await fetch(weatherRequestPath(coords),{signal:weatherAbort.current?.signal});
      const body = await response.json() as {error?:string;weather?:OnlineWeather};
      if (!response.ok) throw new Error(body.error || '在线天气获取失败，请稍后再试。');
      if (!body.weather || body.weather.source !== 'open-meteo' || !Number.isFinite(body.weather.tempC) || !Number.isFinite(Date.parse(body.weather.observedAt))) throw new Error('天气结果不完整，请重新获取。');
      const recognized = cityLookup ? await cityLookup : null;
      if (!isCurrent(id)) return;
      onWeather({...body.weather,city:recognized?.name || label,locationSource:source});
      setMessage(cityLookup && !recognized ? '在线天气已更新；城市名暂未识别，显示当前位置，可手动选城市。' : '在线天气已更新。');
    } catch (error) {
      if (!isCurrent(id)) return;
      onWeather(null);
      setMessage(`${errorText(error)} 也可以使用手动模拟天气。`);
    } finally { if (isCurrent(id)) setWorking(false); }
  }

  async function locate() {
    const id = beginWeather();
    setPosition(null);
    setMatchNote('');
    try {
      const current = await requestPreciseLocation(navigator.geolocation) as Position;
      if (!isCurrent(id)) return;
      setPosition(current);
      setCity(null);
      const matched = matchLocationPreset(current,presetsRef.current) as Preset|null;
      if (matched) {
        const patch = sanitizeConditions(matched.conditions);
        onConditions(patch,matched.name);
        setMatchNote(`匹配到「${matched.name}」，已套用你保存的条件，仍可随时修改。`);
      } else {
        setMatchNote(precisePositionUsable(current) ? '没有唯一匹配的已保存地点，保留当前手动条件。' : '定位精度或时效不足以识别家/公司，保留当前手动条件。');
      }
      // This direct browser lookup only receives the just-granted device position.
      const cityLookup = lookupCurrentCity(current,{signal:weatherAbort.current?.signal});
      await loadWeather(current,matched?.city?.name || '当前位置','gps',id,cityLookup);
    } catch (error) {
      if (!isCurrent(id)) return;
      onWeather(null);
      setMessage(errorText(error));
      setWorking(false);
    }
  }

  async function searchCities() {
    const q = query.trim();
    if (q.length < 2) { setMessage('请输入至少两个字的国内城市名称。'); return; }
    const id = ++searchSequence.current;
    searchAbort.current?.abort();
    searchAbort.current = new AbortController();
    setSearching(true); setSearched(false); setCities([]); setMessage('');
    try {
      const response = await fetch(`/api/weather/cities?q=${encodeURIComponent(q)}`,{signal:searchAbort.current.signal});
      const body = await response.json() as {error?:string;cities?:City[]};
      if (!response.ok) throw new Error(body.error || '城市查询失败。');
      if (!mounted.current || searchSequence.current !== id) return;
      setCities(Array.isArray(body.cities) ? body.cities : []); setSearched(true);
    } catch (error) {
      if (mounted.current && searchSequence.current === id) setMessage(errorText(error));
    } finally { if (mounted.current && searchSequence.current === id) setSearching(false); }
  }

  async function chooseCity(selected:City) {
    searchSequence.current++; searchAbort.current?.abort(); setSearching(false);
    const id = beginWeather();
    setCity(selected); setPosition(null); setCities([]); setSearched(false); setQuery(selected.name);
    setMatchNote('使用城市天气，不据此识别家/公司；当前手动条件保持不变。');
    persist(presetsRef.current,selected);
    await loadWeather(selected,selected.name,'city',id);
  }

  function editPreset(id:'home'|'company') {
    const preset = presets.find(p => p.id === id);
    setDraftId(id); setAddress(preset?.address || '');
    setDraftConditions(preset ? sanitizeConditions(preset.conditions) : {});
    setCoordinateChoice(preset?.coords ? 'saved' : 'none');
  }

  function savePreset() {
    const existing = presets.find(p => p.id === draftId);
    let coords:Preset['coords'] = null;
    let selectedCity = city;
    if (coordinateChoice === 'gps') {
      if (!precisePositionUsable(position)) { setMessage('请先点击定位，获得精度 100 米内、5 分钟内的新位置，再保存。'); return; }
      coords = position;
    } else if (coordinateChoice === 'city') {
      if (!city) { setMessage('请先搜索并选择国内城市。'); return; }
      coords = {source:'city',latitude:city.latitude,longitude:city.longitude};
    } else if (coordinateChoice === 'saved') {
      coords = existing?.coords || null;
      selectedCity = existing?.city || city;
    }
    const preset = sanitizePreset({id:draftId,address,city:selectedCity,coords,conditions:draftConditions}) as Preset;
    const next = [...presets.filter(p => p.id !== draftId),preset];
    if (!persist(next,city)) { setMessage('浏览器未允许保存；本次地点尚未保存。'); return; }
    setPresets(next); setCoordinateChoice(preset.coords ? 'saved' : 'none');
    setMessage(preset.coords?.source === 'gps' ? `「${preset.name}」已保存在本机；以后主动定位时可匹配。` : `「${preset.name}」已保存在本机，可手动使用；尚未启用精确位置识别。`);
  }

  function deletePreset(preset:Preset) {
    const next = presets.filter(p => p.id !== preset.id);
    if (!persist(next,city)) { setMessage('浏览器未允许保存更改，请重试。'); return; }
    setPresets(next);
    if (draftId === preset.id) { setAddress(''); setDraftConditions({}); setCoordinateChoice('none'); }
    setMessage(`已删除本机的「${preset.name}」配置；当前手动条件不变。`);
  }

  return <section className="location-module" aria-label="定位与天气">
    <div className="location-heading"><h3><MapPin size={16}/>定位与天气</h3><span>按需获取</span></div>
    <p className="location-caption">主动定位获取当地天气；联网查询仅使用降低精度的位置。拒绝定位也可手填国内城市，时辰仍按北京时间显示。</p>
    <button type="button" className="location-locate" onClick={locate} disabled={working}><LocateFixed size={15}/>{working?'正在获取位置或天气…':'获取当前位置与天气'}</button>
    <div className="location-search"><input aria-label="国内城市名称" value={query} maxLength={60} placeholder="国内城市，例如杭州" onChange={event=>{setQuery(event.target.value);setCities([]);setSearched(false);searchSequence.current++;searchAbort.current?.abort();setSearching(false);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void searchCities();}}}/><button type="button" onClick={searchCities} disabled={searching}><Search size={15}/>{searching?'查询中':'查城市'}</button></div>
    {cities.length>0&&<ul className="location-cities" aria-label="选择城市">{cities.map(c=><li key={c.id}><button type="button" onClick={()=>chooseCity(c)}>{cityLabel(c)}<span>选取天气</span></button></li>)}</ul>}
    {searched&&!cities.length&&<p className="location-caption">暂未找到匹配城市，可尝试城市简称或拼音。</p>}
    {city&&!weather&&<p className="location-caption">已选：{cityLabel(city)} <button type="button" className="location-link" onClick={()=>chooseCity(city)} disabled={working}>获取天气</button></p>}
    {weather?.source==='open-meteo'&&<div className="location-weather"><CloudSun size={21}/><div><strong>{weather.city} · {weather.tempC}°C</strong><span>{weather.description} · 风速 {weather.wind} {weather.windUnit}</span><small>天气时刻：{new Date(weather.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间）</small></div></div>}
    {message&&<p className="location-status" role="status">{message}</p>}
    {matchNote&&<p className="location-caption">{matchNote}</p>}
    {mode==='panel'&&<p className="location-caption">真实天气按采集时间校验，模拟时间不同可能不参与筛选。</p>}
    <details className="location-presets"><summary>家 / 公司与地点条件</summary>
      <p className="location-caption">详细地址、位置和预设只保存在本机浏览器。定位本身不代表可以闭目、有水或已经坐稳。</p>
      {presets.map(p=><div className="location-preset" key={p.id}><strong>{p.name}</strong><span>{p.address || p.city?.name || '未填写地址'} · {p.coords?.source==='gps'?'已保存精确位置':'手动使用，未开位置识别'}</span><div><button type="button" onClick={()=>{onConditions(sanitizeConditions(p.conditions),p.name);setMatchNote(`已手动使用「${p.name}」中保存的条件，可继续修改。`);}}>手动使用条件</button><button type="button" onClick={()=>editPreset(p.id)}>编辑</button><button type="button" onClick={()=>deletePreset(p)}>删除</button></div></div>)}
      <div className="location-editor">
        <label>保存为<select value={draftId} onChange={event=>editPreset(event.target.value as 'home'|'company')}><option value="home">家</option><option value="company">公司</option></select></label>
        <label>具体地址（选填，只保存在本机）<input value={address} maxLength={200} placeholder="街道、小区或楼层；不用于联网搜索" onChange={event=>setAddress(event.target.value)}/></label>
        <label>地点坐标<select value={coordinateChoice} onChange={event=>setCoordinateChoice(event.target.value as typeof coordinateChoice)}><option value="none">不保存坐标，仅手动使用</option><option value="gps" disabled={!position}>保存刚获取的精确定位</option><option value="city" disabled={!city}>使用已选城市（不能自动识别地点）</option>{presets.find(p=>p.id===draftId)?.coords&&<option value="saved">保留这个地点的原有坐标</option>}</select></label>
        <button type="button" className="location-link" onClick={()=>setDraftConditions(sanitizeConditions(conditions))}>将当前已确认条件填入下方</button>
        <div className="location-conditions">{CONDITION_FIELDS.map(field=><label key={field}>{LABELS[field]}<select aria-label={`${draftId==='home'?'家':'公司'}预设：${LABELS[field]}`} value={draftConditions[field]===true?'yes':draftConditions[field]===false?'no':'unknown'} onChange={event=>{const value=event.target.value;setDraftConditions(previous=>{const next={...previous};if(value==='unknown')delete next[field];else next[field]=value==='yes';return next;});}}><option value="unknown">不预设</option><option value="yes">是</option><option value="no">否</option></select></label>)}</div>
        <p className="location-caption">自动匹配需精度在 100 米内的新定位与已保存精确位置，默认范围 150 米，并计入两次定位误差；重叠地点不自动套用。未匹配或未预设的条件保持原值。</p>
        <button type="button" className="location-save" onClick={savePreset}>保存到本机</button>
      </div>
    </details>
    <p className="location-attribution">天气：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · 城市搜索：<a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · 城市识别：<a href="https://www.bigdatacloud.com/" target="_blank" rel="noreferrer">BigDataCloud</a> · 非商业演示接口</p>
  </section>;
}
