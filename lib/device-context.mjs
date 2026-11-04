import { createChatSnapshot, createReminderState, CONTEXT_BOOLEAN_FIELDS } from './context.mjs';

export function resolveEntryMode(search = '', narrow = false) {
  const mode = new URLSearchParams(search).get('mode');
  if (mode === 'daily' || mode === 'chat') return mode;
  if (mode === 'demo' || mode === 'panel') return 'panel';
  return narrow ? 'daily' : 'panel';
}

// Only explicit daily conditions are allowed into a model request. Device usage,
// step counts, coordinates and demo counters deliberately have no mapping here.
export function createDailySnapshot(now, confirmed = {}) {
  const snapshot = { ...createChatSnapshot(now), inputMode: 'daily' };
  if (confirmed.previewSolar === true) snapshot.previewSolar = true;
  for (const field of CONTEXT_BOOLEAN_FIELDS) if (typeof confirmed[field] === 'boolean') snapshot[field] = confirmed[field];
  if (['awake', 'asleep'].includes(confirmed.sleepState) && Number.isFinite(Date.parse(confirmed.sleepObservedAt)) && Number.isFinite(Date.parse(confirmed.sleepValidUntil))) {
    snapshot.sleepState = confirmed.sleepState;
    snapshot.sleepObservedAt = confirmed.sleepObservedAt;
    snapshot.sleepValidUntil = confirmed.sleepValidUntil;
  }
  if (['before', 'during', 'after'].includes(confirmed.mealPhase)) snapshot.mealPhase = confirmed.mealPhase;
  const weather = confirmed.weather;
  if (weather && ['open-meteo', 'manual'].includes(weather.source) && Number.isFinite(Date.parse(weather.observedAt))) {
    snapshot.weather = { source: weather.source, observedAt: weather.observedAt };
    if (typeof weather.rain === 'boolean') snapshot.weather.rain = weather.rain;
    for (const field of ['tempC', 'wind']) if (Number.isFinite(weather[field])) snapshot.weather[field] = weather[field];
    for (const field of ['city', 'description', 'windUnit', 'fetchedAt', 'locationSource']) if (typeof weather[field] === 'string') snapshot.weather[field] = weather[field].slice(0, 160);
  }
  return snapshot;
}

export function createDailyRequest(now, confirmed = {}, previous = {}) {
  const snapshot = createDailySnapshot(now, confirmed);
  const state = createReminderState(snapshot.now);
  state.recentCards = (Array.isArray(previous.recentCards) ? previous.recentCards : []).filter(id => typeof id === 'string' && id.length < 100).slice(-3);
  return { snapshot, state, mode: 'preview', dialogue: '', confirmed: true };
}

