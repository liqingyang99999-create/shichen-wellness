import { createChatSnapshot, applyDialogueProposals, CONTEXT_BOOLEAN_FIELDS, CONTEXT_NUMERIC_FIELDS, toShanghaiISO } from './context.mjs';

export const MOBILE_CONTEXT_TTL = 30 * 60 * 1000;
export function mobileSnapshot(now, conditions = {}, context = null, weather = null, simulatedTime = '') {
  const s = { ...createChatSnapshot(simulatedTime || now), inputMode: 'chat' };
  for (const key of CONTEXT_BOOLEAN_FIELDS) if (typeof conditions[key] === 'boolean') s[key] = conditions[key];
  if (context && Number.isFinite(context.capturedAt) && Date.parse(now) - context.capturedAt >= 0 && Date.parse(now) - context.capturedAt < MOBILE_CONTEXT_TTL) {
    for (const key of CONTEXT_BOOLEAN_FIELDS) if (typeof context.snapshot?.[key] === 'boolean') s[key] = context.snapshot[key];
    for (const key of CONTEXT_NUMERIC_FIELDS) if (Number.isFinite(context.snapshot?.[key])) s[key] = context.snapshot[key];
    if (['eye','move','quiet','general'].includes(context.snapshot?.intent)) s.intent = context.snapshot.intent;
    if (['before','during','after'].includes(context.snapshot?.mealPhase)) s.mealPhase = context.snapshot.mealPhase;
  }
  if (weather?.source === 'open-meteo' && Number.isFinite(Date.parse(weather.observedAt))) {
    s.weather = { source: weather.source, observedAt: weather.observedAt };
    for (const key of ['fetchedAt','city','description','locationSource','windUnit']) if (typeof weather[key] === 'string') s.weather[key] = weather[key];
    for (const key of ['tempC','wind']) if (Number.isFinite(weather[key])) s.weather[key] = weather[key];
    if (typeof weather.rain === 'boolean') s.weather.rain = weather.rain;
  }
  return s;
}

// Only the server-validated, allowlisted dialogue fields enter the next request.
// Native daily screen totals and steps are never treated as continuous durations.
export function applyMobileDialogue(snapshot, parsed) {
  return { ...applyDialogueProposals(snapshot, parsed?.proposals || []), inputMode: 'chat' };
}

export function mobileTime(value) { return toShanghaiISO(value); }

// A range, open-ended instruction or setup time is not a fixed action duration.
export function actionDurationSeconds(duration) {
  const match = typeof duration === 'string' && duration.trim().match(/^(?:约)?(\d+(?:\.\d+)?)(秒|分钟)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * (match[2] === '分钟' ? 60 : 1);
  return Number.isInteger(seconds) && seconds > 0 && seconds <= 3600 ? seconds : null;
}

export function sceneForCard(card, now) {
  const hour = Number(String(now).slice(11,13));
  const text = `${card?.title || ''} ${card?.category || ''} ${(card?.tags || []).join(' ')}`;
  if (hour >= 21 || hour < 6 || /睡前|熄|晚间|夜间/.test(text)) return 'night';
  if (/眼|远眺|远方|看远|屏幕|阅读/.test(text)) return 'bamboo';
  if (/饮|水|呼吸|静心|安静/.test(text)) return 'water';
  if (/节气|出门|外出|起居|整理|秋|冬/.test(text)) return 'leaves';
  return 'bamboo';
}
