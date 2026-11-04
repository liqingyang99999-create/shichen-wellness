// Primary API documentation: https://open-meteo.com/en/docs
// https://open-meteo.com/en/docs/geocoding-api | https://open-meteo.com/en/terms
// Free endpoint: non-commercial educational demo only; no API key is required.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 97, 99]);
const CODE_LABELS = {0:'晴',1:'晴间多云',2:'多云',3:'阴',45:'雾',48:'雾凇',51:'小毛毛雨',53:'毛毛雨',55:'较强毛毛雨',56:'冻毛毛雨',57:'冻毛毛雨',61:'小雨',63:'中雨',65:'大雨',66:'冻雨',67:'冻雨',71:'小雪',73:'中雪',75:'大雪',77:'米雪',80:'阵雨',81:'较强阵雨',82:'强阵雨',85:'阵雪',86:'较强阵雪',95:'雷暴',96:'雷暴伴冰雹',97:'强雷暴',99:'雷暴伴强冰雹'};
const finite = n => typeof n === 'number' && Number.isFinite(n);
const coordinate = (value, limit) => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit ? Number(Number(value).toFixed(2)) : null;

async function fetchJson(url, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher(url.toString(), {signal:controller.signal, headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error('upstream');
    const body = await response.json();
    if (!body || typeof body !== 'object' || body.error) throw new Error('upstream');
    return body;
  } finally { clearTimeout(timer); }
}

function utcTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z)?$/.test(value)) return null;
  const ms = Date.parse(value.endsWith('Z') ? value : `${value}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Return a plain result so the Node and Worker HTTP adapters can share it. */
export async function handleWeatherApi(input, env = {}) {
  const url = input instanceof URL ? input : new URL(input);
  const fetcher = typeof env.WEATHER_FETCH === 'function' ? env.WEATHER_FETCH : globalThis.fetch;
  const now = typeof env.WEATHER_NOW === 'function' ? env.WEATHER_NOW : Date.now;
  if (url.pathname === '/api/weather/cities') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2 || q.length > 60) return {status:400, body:{error:'请输入 2–60 字的国内城市名称，不要输入详细门牌地址。'}};
    const upstream = new URL(GEOCODE);
    upstream.search = new URLSearchParams({name:q, count:'8', language:'zh', format:'json', countryCode:'CN'}).toString();
    try {
      const data = await fetchJson(upstream, fetcher);
      const cities = (Array.isArray(data.results) ? data.results : []).filter(c => c.country_code === 'CN' && finite(c.latitude) && finite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180 && typeof c.name === 'string').slice(0, 8).map(c => ({
        id:String(c.id), name:c.name.slice(0, 80), admin1:typeof c.admin1 === 'string' ? c.admin1.slice(0,80) : '',
        admin2:typeof c.admin2 === 'string' ? c.admin2.slice(0,80) : '', countryCode:'CN',
        latitude:c.latitude, longitude:c.longitude, timezone:typeof c.timezone === 'string' ? c.timezone : 'Asia/Shanghai',
      }));
      return {status:200, body:{cities, attribution:'Open-Meteo / GeoNames'}};
    } catch { return {status:502, body:{error:'城市查询暂未成功，请稍后再试；现有手动条件仍保留。'}}; }
  }
  if (url.pathname === '/api/weather/current') {
    const latitude = coordinate(url.searchParams.get('latitude'), 90);
    const longitude = coordinate(url.searchParams.get('longitude'), 180);
    if (latitude === null || longitude === null) return {status:400, body:{error:'天气位置坐标无效，请重新定位或选择城市。'}};
    const upstream = new URL(FORECAST);
    upstream.search = new URLSearchParams({latitude:String(latitude),longitude:String(longitude),current:'temperature_2m,relative_humidity_2m,weather_code,precipitation,rain,showers,wind_speed_10m',timezone:'UTC',timeformat:'iso8601',wind_speed_unit:'ms',temperature_unit:'celsius',precipitation_unit:'mm',forecast_days:'1'}).toString();
    try {
      const data = await fetchJson(upstream, fetcher);
      const c = data.current;
      const observedAt = utcTime(c?.time);
      // Unknown/malformed values must not silently become a dry or calm condition.
      if (!c || data.utc_offset_seconds !== 0 || !observedAt || !finite(c.temperature_2m) || !finite(c.wind_speed_10m) || !finite(c.rain) || !finite(c.showers) || !finite(c.precipitation) || !Number.isInteger(c.weather_code) || !(c.weather_code in CODE_LABELS) || c.wind_speed_10m < 0 || c.rain < 0 || c.showers < 0 || c.precipitation < 0) throw new Error('malformed');
      const weather = {
        source:'open-meteo', tempC:c.temperature_2m, rain:c.rain + c.showers > 0 || RAIN_CODES.has(c.weather_code),
        precipitationMm:c.precipitation, wind:c.wind_speed_10m, windUnit:'m/s',
        code:c.weather_code, description:CODE_LABELS[c.weather_code],
        humidity:finite(c.relative_humidity_2m) ? c.relative_humidity_2m : null,
        observedAt, fetchedAt:new Date(now()).toISOString(), timezone:'UTC',
        attribution:'Open-Meteo', attributionUrl:'https://open-meteo.com/',
      };
      // Do not return requested or upstream grid coordinates; they never belong in a snapshot.
      return {status:200, body:{weather}};
    } catch { return {status:502, body:{error:'在线天气获取失败。旧在线天气已失效，可改用手动模拟天气。'}}; }
  }
  return {status:404, body:{error:'天气接口不存在。'}};
}

export async function handleWeatherRequest(request, env = {}) {
  if (request.method !== 'GET') return new Response(JSON.stringify({error:'请使用 GET'}), {status:405,headers:{'Content-Type':'application/json; charset=utf-8','Allow':'GET'}});
  const result = await handleWeatherApi(new URL(request.url), env);
  return new Response(JSON.stringify(result.body), {status:result.status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
