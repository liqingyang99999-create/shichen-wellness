export const LOCATION_STORAGE_KEY = 'shichen-location-preferences-v1';
export const CONDITION_FIELDS = Object.freeze(['canLeaveSeat','canLookFar','canCloseEyes','sitting','spaceEnough','hasSupport','waterAvailable','headphones','atMeal','goingOut']);
export const LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
export const LOCATION_MAX_ACCURACY_M = 100;
export const DEFAULT_MATCH_RADIUS_M = 150;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';

export function sanitizeConditions(input = {}) {
  const result = {};
  for (const key of CONDITION_FIELDS) if (typeof input?.[key] === 'boolean') result[key] = input[key];
  return result;
}

export function validCoordinates(value) {
  return !!value && finite(value.latitude) && finite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}

export function roundWeatherCoordinates(coords) {
  if (!validCoordinates(coords)) throw new Error('位置坐标无效');
  return {latitude:Number(coords.latitude.toFixed(2)),longitude:Number(coords.longitude.toFixed(2))};
}

export function sanitizeCity(value) {
  if (!validCoordinates(value) || value.countryCode !== 'CN' || !text(value.name,80)) return null;
  return {id:text(String(value.id || ''),80),name:text(value.name,80),admin1:text(value.admin1,80),admin2:text(value.admin2,80),countryCode:'CN',latitude:value.latitude,longitude:value.longitude,timezone:text(value.timezone,80) || 'Asia/Shanghai'};
}

export function sanitizePreset(value) {
  if (!value || !['home','company'].includes(value.id)) return null;
  let coords = null;
  if (validCoordinates(value.coords) && value.coords.source === 'gps' && finite(value.coords.accuracy) && value.coords.accuracy >= 0 && value.coords.accuracy <= LOCATION_MAX_ACCURACY_M) {
    coords = {source:'gps',latitude:value.coords.latitude,longitude:value.coords.longitude,accuracy:value.coords.accuracy};
  } else if (validCoordinates(value.coords) && value.coords.source === 'city') {
    coords = {source:'city',latitude:value.coords.latitude,longitude:value.coords.longitude};
  }
  return {id:value.id,name:value.id === 'home' ? '家' : '公司',address:text(value.address,200),city:sanitizeCity(value.city),coords,radius:DEFAULT_MATCH_RADIUS_M,conditions:sanitizeConditions(value.conditions)};
}

export function readLocationPreferences(storage) {
  try {
    const data = JSON.parse(storage.getItem(LOCATION_STORAGE_KEY) || '{}');
    if (data.version !== 1) return {presets:[],city:null};
    const map = new Map();
    for (const item of Array.isArray(data.presets) ? data.presets : []) { const p = sanitizePreset(item); if (p) map.set(p.id,p); }
    return {presets:[...map.values()].slice(0,2),city:sanitizeCity(data.city)};
  } catch { return {presets:[],city:null}; }
}

export function writeLocationPreferences(storage, preferences) {
  try {
    const map = new Map();
    for (const value of preferences.presets || []) { const p = sanitizePreset(value); if (p) map.set(p.id,p); }
    storage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({version:1,presets:[...map.values()].slice(0,2),city:sanitizeCity(preferences.city)}));
    return true;
  } catch { return false; }
}

export function distanceMeters(a,b) {
  if (!validCoordinates(a) || !validCoordinates(b)) return Infinity;
  const rad = n => n * Math.PI / 180;
  const dlat = rad(b.latitude-a.latitude), dlon = rad(b.longitude-a.longitude);
  const h = Math.sin(dlat/2)**2 + Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}

export function precisePositionUsable(position, now = Date.now()) {
  const at = Date.parse(position?.observedAt);
  return validCoordinates(position) && position.source === 'gps' && finite(position.accuracy) && position.accuracy >= 0 && position.accuracy <= LOCATION_MAX_ACCURACY_M && Number.isFinite(at) && at <= now + 1000 && now - at <= LOCATION_MAX_AGE_MS;
}

/** City centroids never match a precise place. Ambiguous overlapping places do not auto-apply. */
export function matchLocationPreset(position, values, now = Date.now()) {
  if (!precisePositionUsable(position,now)) return null;
  const matches = (values || []).map(sanitizePreset).filter(Boolean).filter(p => p.coords?.source === 'gps' && distanceMeters(position,p.coords) + position.accuracy + p.coords.accuracy <= p.radius);
  return matches.length === 1 ? matches[0] : null;
}

/** Called only from an explicit click; this module does not read browser permissions on load. */
export function requestPreciseLocation(geolocation) {
  return new Promise((resolve,reject) => {
    if (!geolocation?.getCurrentPosition) { reject(new Error('当前浏览器不支持定位，请手填国内城市。')); return; }
    geolocation.getCurrentPosition(position => {
      if (!finite(position?.timestamp) || !position?.coords) { reject(new Error('定位结果无效，请手填国内城市。')); return; }
      const date = new Date(position.timestamp);
      if (!Number.isFinite(date.getTime())) { reject(new Error('定位时间无效，请重新获取或手填国内城市。')); return; }
      const coords = {source:'gps',latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,observedAt:date.toISOString()};
      if (!validCoordinates(coords) || !finite(coords.accuracy) || coords.accuracy < 0) { reject(new Error('定位结果无效，请手填国内城市。')); return; }
      resolve(coords);
    }, error => reject(new Error(error?.code === 1 ? '定位未获允许，可以手填国内城市。' : error?.code === 3 ? '定位超时，可以重试或手填国内城市。' : '暂时无法获取位置，可以手填国内城市。')), {enableHighAccuracy:true,timeout:12000,maximumAge:0});
  });
}

/** Only rounded coordinates cross the network boundary; no address or GPS accuracy is sent. */
export function weatherRequestPath(coords) {
  const rounded = roundWeatherCoordinates(coords);
  return `/api/weather/current?${new URLSearchParams({latitude:String(rounded.latitude),longitude:String(rounded.longitude)})}`;
}

/** Browser-only, freshly permission-granted GPS lookup. Never use saved or arbitrary coordinates.
 * Docs: https://www.bigdatacloud.com/docs/free-api/free-reverse-geocode-to-city-api
 * Policy: https://www.bigdatacloud.com/docs/article/fair-use-policy-for-free-client-side-reverse-geocoding-api
 * The caller runs this only in the locate button handler. Coordinates are rounded locally;
 * only the city name is retained, and a reverse-lookup failure never invalidates weather.
 */
export async function lookupCurrentCity(position, options = {}) {
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const at = Date.parse(position?.observedAt);
  if (!validCoordinates(position) || position.source !== 'gps' || !Number.isFinite(at) || at > now + 1000 || now - at > LOCATION_MAX_AGE_MS) return null;
  const coords = roundWeatherCoordinates(position);
  const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
  url.search = new URLSearchParams({latitude:String(coords.latitude),longitude:String(coords.longitude),localityLanguage:'zh'}).toString();
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort',abort,{once:true});
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort,3500);
  try {
    const response = await (options.fetcher || globalThis.fetch)(url.toString(),{signal:controller.signal});
    if (!response.ok) return null;
    const body = await response.json();
    // Do not use locality, street, postcode, plusCode, or the response coordinates.
    const name = text(body?.city,80);
    if (!name) return null;
    return {name,countryCode:text(body.countryCode,2),source:'bigdatacloud'};
  } catch { return null; }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort',abort); }
}
