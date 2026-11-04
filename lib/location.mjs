export const LOCATION_STORAGE_KEY = 'shichen-weather-preferences-v2';
export const LEGACY_LOCATION_STORAGE_KEY = 'shichen-location-preferences-v1';
export const LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
const activeCityLookups = new Set();
const finite = n => typeof n === 'number' && Number.isFinite(n);
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';

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

const emptyPreferences = () => ({city:null,cityLookupConsent:false});
const onlyWeatherPreferences = value => ({city:sanitizeCity(value?.city),cityLookupConsent:value?.cityLookupConsent === true});
function removeLegacyPreferences(storage) {
  // This exact obsolete key also held addresses and place-specific conditions.
  // Never clear unrelated activity preferences, weather cache, or other storage.
  try { storage.removeItem(LEGACY_LOCATION_STORAGE_KEY); } catch { /* Retry on the next read. */ }
}

export function readLocationPreferences(storage) {
  try {
    const current = storage.getItem(LOCATION_STORAGE_KEY);
    if (current !== null) {
      let value;
      try { value = JSON.parse(current); } catch { /* Invalid current data never revives a legacy consent. */ }
      removeLegacyPreferences(storage);
      return value?.version === 2 ? onlyWeatherPreferences(value) : emptyPreferences();
    }
    const legacy = storage.getItem(LEGACY_LOCATION_STORAGE_KEY);
    if (legacy === null) return emptyPreferences();
    let value;
    try { value = JSON.parse(legacy); } catch { /* Corrupt legacy data is replaced with empty weather preferences. */ }
    // Migrate only the selected city and the separate city-recognition choice.
    // The old presets, precise coordinates, addresses and conditions are never returned or applied.
    const preferences = value?.version === 1 ? onlyWeatherPreferences(value) : emptyPreferences();
    writeLocationPreferences(storage,preferences);
    return preferences;
  } catch { return emptyPreferences(); }
}

export function writeLocationPreferences(storage, preferences = {}) {
  try {
    storage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({version:2,...onlyWeatherPreferences(preferences)}));
    removeLegacyPreferences(storage);
    return true;
  } catch { return false; }
}

/** The caller requests first-time permission only after a click; existing grants may refresh on app start. */
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

/** Stop pending city lookups after the separate optional consent is withdrawn. */
export function cancelCityLookups() {
  for (const controller of activeCityLookups) controller.abort();
}

/** Browser-only, fresh GPS lookup with a separate explicit opt-in. Never use saved or arbitrary coordinates.
 * Docs: https://www.bigdatacloud.com/docs/free-api/free-reverse-geocode-to-city-api
 * Policy: https://www.bigdatacloud.com/docs/article/fair-use-policy-for-free-client-side-reverse-geocoding-api
 * The caller runs this after a location action or a permitted launch refresh. Coordinates are rounded locally;
 * only the city name is retained, and a reverse-lookup failure never invalidates weather.
 */
export async function lookupCurrentCity(position, options = {}) {
  // A system location grant alone never authorizes this third-party request.
  if (options.consent !== true) return null;
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const at = Date.parse(position?.observedAt);
  if (!validCoordinates(position) || position.source !== 'gps' || !Number.isFinite(at) || at > now + 1000 || now - at > LOCATION_MAX_AGE_MS) return null;
  const coords = roundWeatherCoordinates(position);
  const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
  url.search = new URLSearchParams({latitude:String(coords.latitude),longitude:String(coords.longitude),localityLanguage:'zh'}).toString();
  const controller = new AbortController();
  activeCityLookups.add(controller);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort',abort,{once:true});
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort,3500);
  try {
    if (controller.signal.aborted) return null;
    const response = await (options.fetcher || globalThis.fetch)(url.toString(),{signal:controller.signal});
    if (!response.ok) return null;
    const body = await response.json();
    if (controller.signal.aborted) return null;
    // Do not use locality, street, postcode, plusCode, or the response coordinates.
    const name = text(body?.city,80);
    if (!name) return null;
    return {name,countryCode:text(body.countryCode,2),source:'bigdatacloud'};
  } catch { return null; }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort',abort); activeCityLookups.delete(controller); }
}
