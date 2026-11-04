import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCATION_STORAGE_KEY,sanitizeConditions,roundWeatherCoordinates,weatherRequestPath,readLocationPreferences,writeLocationPreferences,matchLocationPreset,precisePositionUsable,requestPreciseLocation,distanceMeters,lookupCurrentCity} from '../lib/location.mjs';
const now=Date.parse('2026-11-04T04:00:00Z');
const gps={source:'gps',latitude:30.27416,longitude:120.15515,accuracy:10,observedAt:new Date(now).toISOString()};
const home={id:'home',address:'只应留在本机的详细门牌',coords:{...gps},conditions:{canCloseEyes:false,sitting:true}};
const city={id:'1',name:'杭州',admin1:'浙江',admin2:'杭州',latitude:30.27416,longitude:120.15515,countryCode:'CN',timezone:'Asia/Shanghai'};
function storage(){const map=new Map();return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),map};}

test('only explicitly saved booleans form a condition patch; unknown fields do not clear manual values',()=>{
 const patch=sanitizeConditions({canCloseEyes:false,sitting:true,waterAvailable:'true',canLookFar:null,address:'secret',latitude:30,intent:'eye',weather:{rain:false},__proto__:{busy:true}});
 assert.deepEqual(patch,{canCloseEyes:false,sitting:true});
 const manual={waterAvailable:true,canLookFar:false,sitting:false};
 assert.deepEqual({...manual,...patch},{waterAvailable:true,canLookFar:false,sitting:true,canCloseEyes:false});
});

test('network request uses rounded coordinates and no precise location, accuracy or address',()=>{
 assert.deepEqual(roundWeatherCoordinates(gps),{latitude:30.27,longitude:120.16});
 const path=weatherRequestPath({...gps,address:'secret'});
 assert.equal(path,'/api/weather/current?latitude=30.27&longitude=120.16');
 assert.equal(path.includes('27416'),false);
 assert.throws(()=>weatherRequestPath({latitude:91,longitude:120}));
});

test('local storage preserves address and explicitly saved conditions without unrelated payload fields',()=>{
 const local=storage();
 assert.equal(writeLocationPreferences(local,{city,presets:[{...home,name:'恶意地址回调',conditions:{...home.conditions,token:'secret'},modelKey:'do not store'}]}),true);
 const loaded=readLocationPreferences(local);
 assert.equal(loaded.presets[0].address,home.address);
 assert.equal(loaded.presets[0].name,'家');
 assert.equal(loaded.presets[0].coords.source,'gps');
 assert.equal(loaded.presets[0].radius,150);
 assert.deepEqual(loaded.presets[0].conditions,home.conditions);
 assert.equal(local.map.get(LOCATION_STORAGE_KEY).includes('do not store'),false);
});

test('invalid storage is ignored and a blocked store reports failure',()=>{
 const local=storage();local.setItem(LOCATION_STORAGE_KEY,'not-json');
 assert.deepEqual(readLocationPreferences(local),{presets:[],city:null});
 local.setItem(LOCATION_STORAGE_KEY,JSON.stringify({version:2,presets:[home]}));
 assert.deepEqual(readLocationPreferences(local),{presets:[],city:null});
 assert.equal(writeLocationPreferences({setItem(){throw Error('blocked');}},{presets:[home]}),false);
});

test('unique fresh precise GPS location matches a saved place',()=>{
 assert.equal(matchLocationPreset(gps,[home],now)?.id,'home');
 assert.equal(distanceMeters(gps,gps),0);
 assert.ok(distanceMeters(gps,{...gps,latitude:gps.latitude+0.001})>100);
});

test('city centroids, unlocated addresses and coarse GPS never match a place',()=>{
 assert.equal(matchLocationPreset({...gps,source:'city'},[home],now),null);
 assert.equal(matchLocationPreset(gps,[{...home,coords:{...gps,source:'city'}}],now),null);
 assert.equal(matchLocationPreset(gps,[{...home,coords:null}],now),null);
 assert.equal(matchLocationPreset({...gps,accuracy:101},[home],now),null);
 assert.equal(matchLocationPreset(gps,[{...home,coords:{...gps,accuracy:101}}],now),null);
});

test('stale, future, outside-radius and uncertainty-boundary positions do not apply a preset',()=>{
 assert.equal(matchLocationPreset({...gps,observedAt:new Date(now-300001).toISOString()},[home],now),null);
 assert.equal(matchLocationPreset({...gps,observedAt:new Date(now+60000).toISOString()},[home],now),null);
 assert.equal(matchLocationPreset({...gps,latitude:gps.latitude+0.003},[home],now),null);
 assert.equal(matchLocationPreset({...gps,latitude:gps.latitude+0.001,accuracy:50},[home],now),null);
 assert.equal(precisePositionUsable({...gps,accuracy:-1},now),false);
});

test('overlapping home and company are ambiguous and never auto-apply',()=>{
 assert.equal(matchLocationPreset(gps,[home,{...home,id:'company'}],now),null);
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
 const result=await lookupCurrentCity(gps,{now,fetcher:async value=>{requested=new URL(value);return new Response(JSON.stringify({city:'杭州',countryCode:'CN',locality:'不应保留的小区',postcode:'310000',latitude:30.27416,longitude:120.15515}));}});
 assert.equal(requested.origin,'https://api.bigdatacloud.net');
 assert.equal(requested.searchParams.get('latitude'),'30.27');
 assert.equal(requested.searchParams.get('longitude'),'120.16');
 assert.deepEqual(result,{name:'杭州',countryCode:'CN',source:'bigdatacloud'});
});

test('city recognition never queries saved city coordinates or stale positions and returns null on failure',async()=>{
 let calls=0;
 const options={now,fetcher:async()=>{calls++;throw Error('offline');}};
 assert.equal(await lookupCurrentCity({...gps,source:'city'},options),null);
 assert.equal(await lookupCurrentCity({...gps,observedAt:new Date(now-300001).toISOString()},options),null);
 assert.equal(calls,0);
 assert.equal(await lookupCurrentCity(gps,options),null);
 assert.equal(calls,1);
 assert.equal(await lookupCurrentCity(gps,{now,fetcher:async()=>new Response(JSON.stringify({locality:'只找到街区'}))}),null);
});
