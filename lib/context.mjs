// Plain data helpers shared by browser and server; no clock reads or I/O.
export const CONTEXT_BOOLEAN_FIELDS = Object.freeze(['busy', 'paused', 'resting', 'canLeaveSeat', 'canLookFar', 'canCloseEyes', 'sitting', 'spaceEnough', 'hasSupport', 'headphones', 'atMeal', 'goingOut', 'waterAvailable']);
export const CONTEXT_NUMERIC_FIELDS = Object.freeze(['screenMinutes', 'sedentaryMinutes', 'activityMinutes']);
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
    else if (p.field === 'sleepState' && ['awake', 'asleep', 'unknown'].includes(p.value)) { next.sleepState = p.value; sleepChanged = true; }
    else if (p.field === 'now' && typeof p.value === 'string') { try { next.now = toShanghaiISO(p.value); } catch { /* Invalid proposal stays unapplied. */ } }
  }
  if (sleepChanged) {
    next.sleepObservedAt = next.now;
    next.sleepValidUntil = toShanghaiISO(Date.parse(next.now) + 5 * 60000);
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
