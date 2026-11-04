import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCATION_STORAGE_KEY,LEGACY_LOCATION_STORAGE_KEY,roundWeatherCoordinates,weatherRequestPath,readLocationPreferences,writeLocationPreferences,requestPreciseLocation,lookupCurrentCity,cancelCityLookups} from '../lib/location.mjs';
const now=Date.parse('2026-11-04T04:00:00Z');
const gps={source:'gps',latitude:30.27416,longitude:120.15515,accuracy:10,observedAt:new Date(now).toISOString()};
const home={id:'home',address:'旧版家庭详细门牌',coords:{...gps},conditions:{canCloseEyes:false,sitting:true}};
const city={id:'1',name:'杭州',admin1:'浙江',admin2:'杭州',latitude:30.27416,longitude:120.15515,countryCode:'CN',timezone:'Asia/Shanghai'};
function storage(){const map=new Map();return{getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),map};}

test('network request uses rounded coordinates and no precise location, accuracy or address',()=>{
 assert.deepEqual(roundWeatherCoordinates(gps),{latitude:30.27,longitude:120.16});
 const path=weatherRequestPath({...gps,address:'secret'});
 assert.equal(path,'/api/weather/current?latitude=30.27&longitude=120.16');
 assert.equal(path.includes('27416'),false);
 assert.throws(()=>weatherRequestPath({latitude:91,longitude:120}));
});

test('legacy place records migrate only city and explicit recognition choice and remove the obsolete key',()=>{
 const local=storage();
 const activity=JSON.stringify({conditions:{sitting:false,waterAvailable:true},largeText:true});
 const weather=JSON.stringify({source:'open-meteo',city:'杭州',tempC:18});
 local.setItem('shichen-mobile-preferences-v1',activity);
 local.setItem('shichen-mobile-weather-v1',weather);
 local.setItem(LEGACY_LOCATION_STORAGE_KEY,JSON.stringify({version:1,city,presets:[home,{...home,id:'company',address:'旧版公司地址'}],cityLookupConsent:true}));
 assert.deepEqual(readLocationPreferences(local),{city,cityLookupConsent:true});
 assert.equal(local.getItem(LEGACY_LOCATION_STORAGE_KEY),null);
 const saved=JSON.parse(local.getItem(LOCATION_STORAGE_KEY));
 assert.deepEqual(saved,{version:2,city,cityLookupConsent:true});
 assert.equal(local.getItem('shichen-mobile-preferences-v1'),activity);
 assert.equal(local.getItem('shichen-mobile-weather-v1'),weather);
 assert.equal(local.getItem(LOCATION_STORAGE_KEY).includes('详细门牌'),false);
 assert.equal(local.getItem(LOCATION_STORAGE_KEY).includes('presets'),false);
 assert.equal(local.getItem(LOCATION_STORAGE_KEY).includes('conditions'),false);
});

test('writing weather preferences never persists passed-in addresses, precise place coordinates or conditions',()=>{
 const local=storage();
 assert.equal(writeLocationPreferences(local,{city,presets:[home],address:home.address,coords:gps,conditions:home.conditions,cityLookupConsent:true,modelKey:'do not store'}),true);
 assert.deepEqual(readLocationPreferences(local),{city,cityLookupConsent:true});
 assert.deepEqual(JSON.parse(local.getItem(LOCATION_STORAGE_KEY)),{version:2,city,cityLookupConsent:true});
});

test('current weather choice wins over obsolete presets and never revives withdrawn consent',()=>{
 const local=storage();
 writeLocationPreferences(local,{city:null,cityLookupConsent:false});
 local.setItem(LEGACY_LOCATION_STORAGE_KEY,JSON.stringify({version:1,city,presets:[home],cityLookupConsent:true}));
 assert.deepEqual(readLocationPreferences(local),{city:null,cityLookupConsent:false});
 assert.equal(local.getItem(LEGACY_LOCATION_STORAGE_KEY),null);
});

test('malformed or unsupported legacy data is discarded without touching other preferences',()=>{
 for(const raw of ['not-json',JSON.stringify({version:9,presets:[home],cityLookupConsent:true})]){
  const local=storage();local.setItem(LEGACY_LOCATION_STORAGE_KEY,raw);local.setItem('unrelated','keep');
  assert.deepEqual(readLocationPreferences(local),{city:null,cityLookupConsent:false});
  assert.equal(local.getItem(LEGACY_LOCATION_STORAGE_KEY),null);
  assert.equal(local.getItem('unrelated'),'keep');
 }
 const local=storage();
 local.setItem(LOCATION_STORAGE_KEY,'not-json');
 local.setItem(LEGACY_LOCATION_STORAGE_KEY,JSON.stringify({version:1,cityLookupConsent:true,presets:[home]}));
 assert.deepEqual(readLocationPreferences(local),{city:null,cityLookupConsent:false});
 assert.equal(local.getItem(LEGACY_LOCATION_STORAGE_KEY),null);
});

test('blocked migration remains usable without returning any preset and retries cleanup later',()=>{
 const local=storage();
 local.setItem(LEGACY_LOCATION_STORAGE_KEY,JSON.stringify({version:1,city,presets:[home],cityLookupConsent:true}));
 const blocked={getItem:local.getItem,setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 assert.deepEqual(readLocationPreferences(blocked),{city,cityLookupConsent:true});
 assert.equal(writeLocationPreferences(blocked,{city}),false);
 assert.notEqual(local.getItem(LEGACY_LOCATION_STORAGE_KEY),null);
 assert.deepEqual(readLocationPreferences(local),{city,cityLookupConsent:true});
 assert.equal(local.getItem(LEGACY_LOCATION_STORAGE_KEY),null);
});

test('failed legacy deletion cannot reintroduce preset values through the new preferences',()=>{
 const local=storage();
 local.setItem(LEGACY_LOCATION_STORAGE_KEY,JSON.stringify({version:1,city,presets:[home],cityLookupConsent:true}));
 const removeBlocked={...local,removeItem(){throw Error('blocked');}};
 assert.deepEqual(readLocationPreferences(removeBlocked),{city,cityLookupConsent:true});
 assert.equal(writeLocationPreferences(removeBlocked,{city:null,cityLookupConsent:false}),true);
 assert.deepEqual(readLocationPreferences(removeBlocked),{city:null,cityLookupConsent:false});
 assert.deepEqual(readLocationPreferences(local),{city:null,cityLookupConsent:false});
 assert.equal(local.getItem(LEGACY_LOCATION_STORAGE_KEY),null);
});

test('GPS wrapper requests high accuracy only when called, and can be tested with a stub',async()=>{
 let calls=0;let opts;
 const stub={getCurrentPosition(success,error,options){calls++;opts=options;success({coords:{latitude:30,longitude:120,accuracy:12},timestamp:now});}};
 assert.equal(calls,0);
 const result=await requestPreciseLocation(stub);
 assert.equal(calls,1);
 assert.deepEqual(opts,{enableHighAccuracy:true,timeout:12000,maximumAge:0});
 assert.equal(result.source,'gps');
 assert.equal(result.observedAt,new Date(now).toISOString());
});

test('GPS permission denial, timeout and malformed data give fallback messages',async()=>{
 await assert.rejects(requestPreciseLocation({getCurrentPosition(success,error){error({code:1});}}),/手填国内城市/);
 await assert.rejects(requestPreciseLocation({getCurrentPosition(success,error){error({code:3});}}),/超时/);
 await assert.rejects(requestPreciseLocation({getCurrentPosition(success){success({coords:{latitude:30,longitude:120,accuracy:10},timestamp:NaN});}}),/无效/);
 await assert.rejects(requestPreciseLocation(null),/不支持定位/);
});

test('city recognition uses freshly obtained rounded GPS coordinates and retains only the city',async()=>{
 let requested;
 const result=await lookupCurrentCity(gps,{consent:true,now,fetcher:async value=>{requested=new URL(value);return new Response(JSON.stringify({city:'杭州',countryCode:'CN',locality:'不应保留的小区',postcode:'310000',latitude:30.27416,longitude:120.15515}));}});
 assert.equal(requested.origin,'https://api.bigdatacloud.net');
 assert.equal(requested.searchParams.get('latitude'),'30.27');
 assert.equal(requested.searchParams.get('longitude'),'120.16');
 assert.deepEqual(result,{name:'杭州',countryCode:'CN',source:'bigdatacloud'});
});

test('city recognition never queries saved city coordinates or stale positions and returns null on failure',async()=>{
 let calls=0;
 const options={consent:true,now,fetcher:async()=>{calls++;throw Error('offline');}};
 assert.equal(await lookupCurrentCity({...gps,source:'city'},options),null);
 assert.equal(await lookupCurrentCity({...gps,observedAt:new Date(now-300001).toISOString()},options),null);
 assert.equal(calls,0);
 assert.equal(await lookupCurrentCity(gps,options),null);
 assert.equal(calls,1);
 assert.equal(await lookupCurrentCity(gps,{consent:true,now,fetcher:async()=>new Response(JSON.stringify({locality:'只找到街区'}))}),null);
});

test('city recognition is off for legacy preferences even when system location was granted',()=>{
 for(const value of [undefined,'true',1,{},null]) {
  const local=storage();
  local.setItem(LEGACY_LOCATION_STORAGE_KEY,JSON.stringify({version:1,city,presets:[home],cityLookupConsent:value,locationPermission:'granted'}));
  assert.equal(readLocationPreferences(local).cityLookupConsent,false);
 }
});

test('city recognition requires literal explicit consent before making any network request',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return new Response(JSON.stringify({city:'杭州'}));};
 for(const consent of [undefined,false,'true',1,null]) assert.equal(await lookupCurrentCity(gps,{now,consent,fetcher}),null);
 assert.equal(calls,0);
 // Location-based weather remains available independently of city recognition.
 assert.equal(weatherRequestPath(gps),'/api/weather/current?latitude=30.27&longitude=120.16');
});

test('city recognition choice can be saved and revoked without losing the selected city',()=>{
 const local=storage();
 writeLocationPreferences(local,{city,cityLookupConsent:true});
 let saved=readLocationPreferences(local);
 assert.equal(saved.cityLookupConsent,true);
 assert.equal(writeLocationPreferences(local,{...saved,cityLookupConsent:false}),true);
 saved=readLocationPreferences(local);
 assert.equal(saved.cityLookupConsent,false);
 assert.equal(saved.city.name,city.name);
 assert.deepEqual(Object.keys(saved).sort(),['city','cityLookupConsent']);
});

test('withdrawing city recognition cancels a pending request and ignores its late response',async()=>{
 let finish,signal;
 const request=lookupCurrentCity(gps,{now,consent:true,fetcher:async(_url,options)=>{
  signal=options.signal;
  return new Promise(resolve=>{finish=resolve;});
 }});
 assert.equal(signal.aborted,false);
 cancelCityLookups();
 assert.equal(signal.aborted,true);
 finish(new Response(JSON.stringify({city:'杭州',countryCode:'CN'})));
 assert.equal(await request,null);
});
