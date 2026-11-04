"use client";
import {useEffect, useRef, useState} from 'react';
import {MapPin, LocateFixed, Search, CloudSun} from 'lucide-react';
import {LOCATION_STORAGE_KEY, readLocationPreferences, writeLocationPreferences, requestPreciseLocation, weatherRequestPath, lookupCurrentCity, cancelCityLookups} from '../../lib/location.mjs';
import './location-weather.css';
import './city-consent.css';

type City = {id:string;name:string;admin1:string;admin2:string;countryCode:string;latitude:number;longitude:number;timezone:string};
type Position = {source:'gps';latitude:number;longitude:number;accuracy:number;observedAt:string};
export type OnlineWeather = {source:'open-meteo';city:string;tempC:number;rain:boolean;wind:number;windUnit:string;description:string;observedAt:string;fetchedAt:string;locationSource:'gps'|'city';[key:string]:unknown};
type Props = {mode:'panel'|'chat'|'daily';weather?:OnlineWeather|null;onWeather:(weather:OnlineWeather|null)=>void};
const cityLabel = (city:City) => [...new Set([city.name,city.admin2,city.admin1].filter(Boolean))].join(' · ');
const errorText = (error:unknown) => error instanceof Error ? error.message : '暂时未能完成，请重试。';

export default function LocationWeather({mode,weather,onWeather}:Props) {
  const [city,setCity] = useState<City|null>(null);
  const [cityLookupConsent,setCityLookupConsent] = useState(false);
  const cityConsentRef = useRef(false);
  const [query,setQuery] = useState('');
  const [cities,setCities] = useState<City[]>([]);
  const [searched,setSearched] = useState(false);
  const [searching,setSearching] = useState(false);
  const [working,setWorking] = useState(false);
  const [message,setMessage] = useState('');
  const weatherSequence = useRef(0);
  const searchSequence = useRef(0);
  const weatherAbort = useRef<AbortController|null>(null);
  const searchAbort = useRef<AbortController|null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    try {
      const stored = readLocationPreferences(window.localStorage);
      setCity(stored.city as City|null);
      setQuery(stored.city?.name || '');
      cityConsentRef.current = stored.cityLookupConsent;
      setCityLookupConsent(stored.cityLookupConsent);
    } catch { setMessage('浏览器未开放本机存储，仍可定位或手选城市获取天气。'); }
    const syncConsent = (event:StorageEvent) => {
      if (event.key !== LOCATION_STORAGE_KEY && event.key !== null) return;
      const allowed = readLocationPreferences(window.localStorage).cityLookupConsent;
      cityConsentRef.current = allowed; setCityLookupConsent(allowed);
      if (!allowed) cancelCityLookups();
    };
    window.addEventListener('storage',syncConsent);
    return () => { mounted.current=false; weatherSequence.current++; searchSequence.current++; weatherAbort.current?.abort(); searchAbort.current?.abort(); window.removeEventListener('storage',syncConsent); };
  }, [mode]);

  const persist = (nextCity:City|null, consent=cityConsentRef.current) => { try { return writeLocationPreferences(window.localStorage,{city:nextCity,cityLookupConsent:consent}); } catch { return false; } };
  function changeCityConsent(allowed:boolean) {
    let saved=false;
    try { saved=writeLocationPreferences(window.localStorage,{...readLocationPreferences(window.localStorage),cityLookupConsent:allowed}); } catch { /* Keep the displayed choice consistent with persisted consent. */ }
    if (!saved) { setMessage('未能保存城市识别选项，请重试；也可在系统中撤销定位权限。'); return; }
    cityConsentRef.current = allowed; setCityLookupConsent(allowed);
    if (!allowed) cancelCityLookups();
    setMessage(allowed ? '已开启城市识别，下次定位时使用。' : '已关闭城市识别；仍可获取天气或手选城市，已有天气显示不变。');
  }
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
      onWeather({...body.weather,city:cityConsentRef.current && recognized?.name || label,locationSource:source});
      setMessage(cityLookup && cityConsentRef.current && !recognized ? '在线天气已更新；城市名暂未识别，显示当前位置，可手动选城市。' : '在线天气已更新。');
    } catch (error) {
      if (!isCurrent(id)) return;
      onWeather(null);
      setMessage(`${errorText(error)} ${mode==='panel'?'也可以使用手动模拟天气。':'也可以手动选择城市重试。'}`);
    } finally { if (isCurrent(id)) setWorking(false); }
  }

  async function locate() {
    const id = beginWeather();
    try {
      const current = await requestPreciseLocation(navigator.geolocation) as Position;
      if (!isCurrent(id)) return;
      setCity(null);
      persist(null);
      // System location permission and third-party city recognition are separate choices.
      const cityLookup = cityConsentRef.current ? lookupCurrentCity(current,{consent:true,signal:weatherAbort.current?.signal}) : undefined;
      await loadWeather(current,'当前位置','gps',id,cityLookup);
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
    setCity(selected); setCities([]); setSearched(false); setQuery(selected.name);
    persist(selected);
    await loadWeather(selected,selected.name,'city',id);
  }

  return <section className="location-module" aria-label="定位与天气">
    <div className="location-heading"><h3><MapPin size={16}/>定位与天气</h3><span>按需获取</span></div>
    <p className="location-caption">主动定位获取当地天气；联网查询仅使用降低精度的位置。拒绝定位也可手填国内城市，时辰仍按北京时间显示。</p>
    <button type="button" className="location-locate" onClick={locate} disabled={working}><LocateFixed size={15}/>{working?'正在获取位置或天气…':'获取当前位置与天气'}</button>
    <div className="location-city-consent">
      <label><input type="checkbox" checked={cityLookupConsent} onChange={event=>changeCityConsent(event.target.checked)}/><span>允许 BigDataCloud 识别城市名<span className="location-city-optional">可选 · 默认关闭</span></span></label>
      <p>开启后，将 IP 与约略位置发送至境外服务，用于识别城市及匿名聚合改进 IP 定位。</p>
      <details><summary>数据与选择说明</summary><p>只发送当次经纬度（保留两位小数）与语言参数；BigDataCloud 同时接收网络 IP。系统定位授权不会自动开启此选项。关闭时仍可查天气并显示“当前位置”，也可手选城市；关闭会取消尚未完成的识别请求，不能撤回已发送的数据。<a href="/privacy/#providers" target="_blank" rel="noreferrer">查看第三方处理说明</a></p></details>
    </div>
    <div className="location-search"><input aria-label="国内城市名称" value={query} maxLength={60} placeholder="国内城市，例如杭州" onChange={event=>{setQuery(event.target.value);setCities([]);setSearched(false);searchSequence.current++;searchAbort.current?.abort();setSearching(false);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void searchCities();}}}/><button type="button" onClick={searchCities} disabled={searching}><Search size={15}/>{searching?'查询中':'查城市'}</button></div>
    {cities.length>0&&<ul className="location-cities" aria-label="选择城市">{cities.map(c=><li key={c.id}><button type="button" onClick={()=>chooseCity(c)}>{cityLabel(c)}<span>选取天气</span></button></li>)}</ul>}
    {searched&&!cities.length&&<p className="location-caption">暂未找到匹配城市，可尝试城市简称或拼音。</p>}
    {city&&!weather&&<p className="location-caption">已选：{cityLabel(city)} <button type="button" className="location-link" onClick={()=>chooseCity(city)} disabled={working}>获取天气</button></p>}
    {weather?.source==='open-meteo'&&<div className="location-weather"><CloudSun size={21}/><div><strong>{weather.city} · {weather.tempC}°C</strong><span>{weather.description} · 风速 {weather.wind} {weather.windUnit}</span><small>天气时刻：{new Date(weather.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间）</small></div></div>}
    {message&&<p className="location-status" role="status">{message}</p>}
    {mode==='panel'&&<p className="location-caption">真实天气按采集时间校验，模拟时间不同可能不参与筛选。</p>}
    <p className="location-attribution">天气：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · 城市搜索：<a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · 城市识别：<a href="https://www.bigdatacloud.com/" target="_blank" rel="noreferrer">BigDataCloud</a> · 非商业演示接口</p>
  </section>;
}
