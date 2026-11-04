import { createChatSnapshot, applyLatestDialogue, CONTEXT_BOOLEAN_FIELDS, CONTEXT_NUMERIC_FIELDS, CONTEXT_FOCUS_VALUES, ACTIVITY_PHASES, toShanghaiISO } from './context.mjs';
import { cardScene } from './card-scenes.mjs';

export const MOBILE_CONTEXT_TTL = 30 * 60 * 1000;
export function mobileSnapshot(now, conditions = {}, context = null, weather = null, simulatedTime = '') {
  const s = { ...createChatSnapshot(simulatedTime || now), inputMode: 'chat' };
  for (const key of CONTEXT_BOOLEAN_FIELDS) if (typeof conditions[key] === 'boolean') s[key] = conditions[key];
  if (context && Number.isFinite(context.capturedAt) && Date.parse(now) - context.capturedAt >= 0 && Date.parse(now) - context.capturedAt < MOBILE_CONTEXT_TTL) {
    for (const key of CONTEXT_BOOLEAN_FIELDS) if (typeof context.snapshot?.[key] === 'boolean') s[key] = context.snapshot[key];
    for (const key of CONTEXT_NUMERIC_FIELDS) if (Number.isFinite(context.snapshot?.[key])) s[key] = context.snapshot[key];
    if (['eye','move','quiet','general'].includes(context.snapshot?.intent)) s.intent = context.snapshot.intent;
    if (['before','during','after'].includes(context.snapshot?.mealPhase)) s.mealPhase = context.snapshot.mealPhase;
    if (['low','settled'].includes(context.snapshot?.mood)) s.mood = context.snapshot.mood;
    if (CONTEXT_FOCUS_VALUES.includes(context.snapshot?.contextFocus)) s.contextFocus = context.snapshot.contextFocus;
    if (ACTIVITY_PHASES.includes(context.snapshot?.activityPhase)) s.activityPhase = context.snapshot.activityPhase;
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
  return { ...applyLatestDialogue(snapshot, parsed), inputMode: 'chat' };
}

export function mobileTime(value) { return toShanghaiISO(value); }

// A range, open-ended instruction or setup time is not a fixed action duration.
export function actionDurationSeconds(duration) {
  const match = typeof duration === 'string' && duration.trim().match(/^(?:约)?(\d+(?:\.\d+)?)(秒|分钟)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * (match[2] === '分钟' ? 60 : 1);
  return Number.isInteger(seconds) && seconds > 0 && seconds <= 3600 ? seconds : null;
}

export function sceneForCard(card, now, sceneCycle = 0) {
  return cardScene(card, now, sceneCycle);
}
