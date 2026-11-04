import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility } from '../server/engine.mjs';

const card = (extra = {}) => ({ id: 'new-card', hours: [9, 15, 23], tags: ['eye', 'quiet'], night: true, ...extra });
const check = (value, snapshot = {}, extra = {}) => evaluateEligibility({ card: value, snapshot: { intent: 'eye', ...snapshot }, context: { hour: 15, day: '2026-11-04', weatherFresh: true, ...extra.context }, mode: extra.mode || 'auto', state: extra.state || {} });

test('declarative true/false requirements need explicit confirmations, including nested rain', () => {
  const c = card({ requirements: { trueFields: ['sitting', 'canCloseEyes'], falseFields: ['goingOut', 'weather.rain'], weatherFresh: true } });
  const s = { sitting: true, canCloseEyes: true, goingOut: false, weather: { rain: false } };
  assert.equal(check(c, s).eligible, true);
  for (const field of ['sitting', 'canCloseEyes', 'goingOut']) {
    const unknown = { ...s }; delete unknown[field];
    assert.equal(check(c, unknown).eligible, false, `missing ${field} must not be inferred`);
    assert.equal(check(c, { ...s, [field]: !s[field] }).eligible, false);
  }
  assert.equal(check(c, { ...s, weather: {} }).eligible, false);
  assert.equal(check(c, { ...s, weather: { rain: true } }).eligible, false);
  assert.equal(check(c, s, { context: { weatherFresh: false } }).eligible, false);
  const staleOnly = card({ requirements: { weatherFresh: false } });
  assert.equal(check(staleOnly, {}, { context: { weatherFresh: false } }).eligible, true);
  assert.equal(check(staleOnly, {}, { context: { weatherFresh: undefined } }).eligible, false);
});

test('explicit requirements migrate legacy IDs; absent requirements keep old behavior', () => {
  const old = card({ id: '04' });
  assert.equal(check(old, { spaceEnough: false }).eligible, false);
  assert.equal(check(old, { spaceEnough: true }).eligible, true);
  assert.equal(check({ ...old, requirements: {} }, { spaceEnough: false }).eligible, true);
  assert.equal(check({ ...old, requirements: { trueFields: ['sitting'] } }, { spaceEnough: true, sitting: false }).eligible, false);
  const legacyEye = card({ id: '11' });
  assert.equal(check(legacyEye, { sitting: true, canCloseEyes: false }).eligible, false);
  assert.equal(check(legacyEye, { sitting: true, canCloseEyes: true }).eligible, true);
});

test('malformed or contradictory requirements fail closed instead of silently removing conditions', () => {
  for (const requirements of [null, [], { trueFields: null }, { falseFields: null }, { trueFields: 'sitting' }, { falseFields: ['unrecognized'] }, { trueFields: ['sitting'], falseFields: ['sitting'] }, { weatherFresh: 'true' }, { unknownOption: true }]) {
    assert.equal(check(card({ requirements }), { sitting: true }).eligible, false, JSON.stringify(requirements));
  }
});

test('declarative migration preserves time, night, intent and recent-three filtering', () => {
  const c = card({ requirements: { trueFields: ['sitting'] } });
  assert.equal(check(c, { sitting: true }, { state: { recentCards: [c.id] } }).eligible, false);
  assert.equal(check(c, { sitting: true }, { mode: 'snooze', state: { recentCards: [c.id] } }).eligible, true);
  assert.equal(check(c, { sitting: false }, { mode: 'snooze', state: { recentCards: [c.id] } }).eligible, false);
  assert.equal(check(c, { sitting: true, intent: 'move' }).eligible, false);
  assert.equal(check(c, { sitting: true }, { context: { hour: 12 } }).eligible, false);
  assert.equal(check({ ...c, hours: [] }, { sitting: true }).eligible, false);
  assert.equal(check({ ...c, night: false }, { sitting: true }, { context: { night: true } }).eligible, false);
  assert.equal(check({ ...c, enabled: false }, { sitting: true }).eligible, false);
});
