// Plain data helpers shared by browser and server; no clock reads or I/O.
export const CONTEXT_BOOLEAN_FIELDS = Object.freeze(['busy', 'paused', 'resting', 'canLeaveSeat', 'canLookFar', 'canCloseEyes', 'sitting', 'spaceEnough', 'hasSupport', 'headphones', 'atMeal', 'goingOut', 'waterAvailable']);
export const CONTEXT_NUMERIC_FIELDS = Object.freeze(['screenMinutes', 'sedentaryMinutes', 'activityMinutes']);
export const LIFESTYLE_FOCUS_VALUES = Object.freeze(['journal', 'photo', 'drawing', 'tea', 'family', 'stretch', 'plants', 'daydream', 'flowers', 'qigong']);
export const CONTEXT_FOCUS_VALUES = Object.freeze(['meal-before', 'meal-during', 'meal-after', 'emotion', 'eye', 'move', 'quiet', 'hydration', 'post-exercise', 'bedtime', 'general', ...LIFESTYLE_FOCUS_VALUES]);
export const ACTIVITY_PHASES = Object.freeze(['driving', 'cycling', 'crossing', 'transit', 'post-exercise', 'bedtime', 'unknown']);
const copy = value => JSON.parse(JSON.stringify(value || {}));

export function toShanghaiISO(value) {
  const raw = typeof value === 'string' && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? `${value.replace(' ', 'T')}+08:00` : value;
  const ms = value instanceof Date ? value.getTime() : typeof raw === 'number' ? raw : Date.parse(raw);
  if (!Number.isFinite(ms)) throw new TypeError('需要有效日期或时间');
  return `${new Date(ms + 8 * 3600000).toISOString().slice(0, 19)}+08:00`;
}

export function createChatSnapshot(nowISO) {
  return { now: toShanghaiISO(nowISO), timezone: 'Asia/Shanghai', intent: 'general', sleepState: 'unknown', dnd: [] };
}

export function createReminderState(nowISO) {
  return { day: toShanghaiISO(nowISO).slice(0, 10), ordinaryCount: 0, lastReminderAt: null, recentCards: [], solarSeen: {}, displayEvents: [] };
}

export function applyDialogueProposals(snapshot, proposals = []) {
  const next = copy(snapshot);
  let sleepChanged = false;
  for (const p of Array.isArray(proposals) ? proposals : []) {
    if (!p || typeof p.field !== 'string') continue;
    if (CONTEXT_BOOLEAN_FIELDS.includes(p.field) && typeof p.value === 'boolean') next[p.field] = p.value;
    else if (CONTEXT_NUMERIC_FIELDS.includes(p.field) && Number.isFinite(p.value) && p.value >= 0 && p.value <= 1440) next[p.field] = p.value;
    else if (p.field === 'intent' && ['eye', 'move', 'quiet', 'general'].includes(p.value)) next.intent = p.value;
    else if (p.field === 'mealPhase' && ['before', 'during', 'after'].includes(p.value)) next.mealPhase = p.value;
    else if (p.field === 'mood' && ['low', 'settled'].includes(p.value)) next.mood = p.value;
    else if (p.field === 'activityPhase' && ACTIVITY_PHASES.includes(p.value)) next.activityPhase = p.value;
    else if (p.field === 'sleepState' && ['awake', 'asleep', 'unknown'].includes(p.value)) { next.sleepState = p.value; sleepChanged = true; }
    else if (p.field === 'now' && typeof p.value === 'string') { try { next.now = toShanghaiISO(p.value); } catch { /* Invalid proposal stays unapplied. */ } }
  }
  if (sleepChanged) {
    next.sleepObservedAt = next.now;
    next.sleepValidUntil = toShanghaiISO(Date.parse(next.now) + 5 * 60000);
  }
  return next;
}

// A new topic replaces the previous recommendation topic, not physical limitations.
// Preserved conditions still protect the person, e.g. eating + low mood stays eating.
export function applyLatestDialogue(snapshot, parsed = {}) {
  const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  const next = applyDialogueProposals(snapshot, proposals);
  const fields = new Set(proposals.map(p => p?.field));
  let focus = CONTEXT_FOCUS_VALUES.includes(parsed.focus) ? parsed.focus : null;
  if (!focus && Array.isArray(parsed.clearFocus) && parsed.clearFocus.includes(next.contextFocus)) focus = 'general';
  // Clear only explicitly denied transient facts, never unrelated saved limits.
  if (parsed.clearFields?.includes('mealPhase') && !fields.has('mealPhase')) {
    delete next.mealPhase;
    if (!fields.has('atMeal')) delete next.atMeal;
    if (!focus && next.contextFocus?.startsWith('meal-')) focus = 'general';
  }
  if (parsed.clearFields?.includes('mood') && !fields.has('mood')) {
    delete next.mood;
    if (!focus && next.contextFocus === 'emotion') focus = 'general';
  }
  if (!focus && fields.has('mood')) focus = next.mood === 'low' ? 'emotion' : 'general';
  if (!focus && fields.has('mealPhase')) focus = `meal-${next.mealPhase}`;
  if (!focus && fields.has('intent')) focus = next.intent;
  if (fields.has('atMeal') && next.atMeal === false && !fields.has('mealPhase') && next.mealPhase === 'during') {
    delete next.mealPhase;
    if (!focus && next.contextFocus === 'meal-during') focus = 'general';
  }
  if (focus) {
    next.contextFocus = focus;
    if (!['eye', 'move', 'quiet'].includes(focus) && !fields.has('intent')) next.intent = 'general';
  }
  return next;
}

export function refreshChatTime(snapshot, dateNow, timeSource = 'live') {
  const next = copy(snapshot);
  if (timeSource === 'explicit') return next;
  if (timeSource !== 'live') throw new TypeError('时间来源须为live或explicit');
  next.now = toShanghaiISO(dateNow);
  next.timezone = 'Asia/Shanghai';
  // Time refresh is not evidence of wakefulness; explicit observations retain
  // their own timestamps and can become stale in the existing workflow rules.
  return next;
}
