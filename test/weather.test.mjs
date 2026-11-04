import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWeatherApi,handleWeatherRequest} from '../server/weather.mjs';
const origin = 'https://demo.example';
const current = {utc_offset_seconds:0,current:{time:'2026-11-04T03:15',temperature_2m:19.2,relative_humidity_2m:64,weather_code:2,precipitation:0,rain:0,showers:0,wind_speed_10m:2.5}};
const json = value => new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
const url = path => new URL(path,origin);

test('weather request rounds coordinates before upstream and returns UTC observation time without coordinates',async()=>{
 let requested;
 const result = await handleWeatherApi(url('/api/weather/current?latitude=30.278888&longitude=120.155999'),{WEATHER_FETCH:async value=>{requested=new URL(value);return json(current);},WEATHER_NOW:()=>Date.parse('2026-11-04T03:25:00Z')});
 assert.equal(result.status,200);
 assert.equal(requested.origin,'https://api.open-meteo.com');
 assert.equal(requested.searchParams.get('latitude'),'30.28');
 assert.equal(requested.searchParams.get('longitude'),'120.16');
 assert.equal(requested.searchParams.get('timezone'),'UTC');
 assert.equal(requested.searchParams.get('wind_speed_unit'),'ms');
 assert.equal(result.body.weather.observedAt,'2026-11-04T03:15:00.000Z');
 assert.equal(result.body.weather.fetchedAt,'2026-11-04T03:25:00.000Z');
 assert.equal(result.body.weather.rain,false);
 assert.equal(result.body.weather.tempC,19.2);
 assert.equal(result.body.weather.windUnit,'m/s');
 assert.equal('latitude' in result.body.weather,false);
 assert.equal('longitude' in result.body.weather,false);
 assert.equal('fresh' in result.body.weather,false);
});

test('invalid or missing coordinates never trigger an upstream request',async()=>{
 let count=0;
 for(const path of ['/api/weather/current','/api/weather/current?latitude=&longitude=120','/api/weather/current?latitude=91&longitude=120','/api/weather/current?latitude=30&longitude=-181','/api/weather/current?latitude=NaN&longitude=0']){
  const result=await handleWeatherApi(url(path),{WEATHER_FETCH:async()=>{count++;return json(current);}});
  assert.equal(result.status,400);
 }
 assert.equal(count,0);
});

test('weather errors return no stale weather or invented dry value',async()=>{
 const variants=[{...current,current:{...current.current,rain:null}},{...current,utc_offset_seconds:28800},{...current,current:{...current.current,time:'not-a-date'}},{...current,current:{...current.current,weather_code:999}}];
 for(const value of variants){const result=await handleWeatherApi(url('/api/weather/current?latitude=30&longitude=120'),{WEATHER_FETCH:async()=>json(value)});assert.equal(result.status,502);assert.equal('weather' in result.body,false);}
 const network=await handleWeatherApi(url('/api/weather/current?latitude=30&longitude=120'),{WEATHER_FETCH:async()=>{throw Error('offline');}});
 assert.equal(network.status,502);
 assert.equal('weather' in network.body,false);
});

test('showers and rain weather codes count as rain even when the rain amount is zero',async()=>{
 for(const changes of [{showers:0.2},{weather_code:61},{weather_code:95}]){
  const result=await handleWeatherApi(url('/api/weather/current?latitude=30&longitude=120'),{WEATHER_FETCH:async()=>json({...current,current:{...current.current,...changes}})});
  assert.equal(result.body.weather.rain,true);
 }
});

test('city lookup is limited to CN, returns separate candidates and keeps geographic timezone',async()=>{
 let requested;
 const result=await handleWeatherApi(url('/api/weather/cities?q=%E6%9D%AD%E5%B7%9E'),{WEATHER_FETCH:async value=>{requested=new URL(value);return json({results:[{id:1,name:'杭州',country_code:'CN',latitude:30.2741,longitude:120.1551,admin1:'浙江',timezone:'Asia/Shanghai'},{id:2,name:'杭州同名',country_code:'US',latitude:30,longitude:120},{id:3,name:'坏坐标',country_code:'CN',latitude:null,longitude:120}]});}});
 assert.equal(requested.origin,'https://geocoding-api.open-meteo.com');
 assert.equal(requested.searchParams.get('countryCode'),'CN');
 assert.equal(requested.searchParams.get('language'),'zh');
 assert.equal(result.body.cities.length,1);
 assert.equal(result.body.cities[0].timezone,'Asia/Shanghai');
 assert.equal(result.body.cities[0].name,'杭州');
});

test('city lookup with too short query does not use network; no result is a successful empty list',async()=>{
 const bad=await handleWeatherApi(url('/api/weather/cities?q=x'),{WEATHER_FETCH:()=>{throw Error('must not call');}});
 assert.equal(bad.status,400);
 const empty=await handleWeatherApi(url('/api/weather/cities?q=abc'),{WEATHER_FETCH:async()=>json({})});
 assert.deepEqual(empty.body.cities,[]);
});

test('request adapter accepts GET and disables caching; rejects mutation methods',async()=>{
 const denied=await handleWeatherRequest(new Request(origin+'/api/weather/current',{method:'POST'}));
 assert.equal(denied.status,405);
 const response=await handleWeatherRequest(new Request(origin+'/api/weather/current?latitude=0&longitude=0'),{WEATHER_FETCH:async()=>json(current)});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await handleWeatherApi(url('/api/weather/nope'))).status,404);
});
