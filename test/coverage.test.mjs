import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import catalog from '../server/catalog.json' with { type: 'json' };
import { auditCoverage } from './coverage-audit.mjs';
import { runWorkflow } from '../server/engine.mjs';

test('every eligible ordinary hour/intent/boolean pool offers eight cards and survives recent-three exclusion', () => {
  const report = auditCoverage();
  fs.mkdirSync(new URL('./reports/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('./reports/coverage.json', import.meta.url), JSON.stringify(report, null, 2));
  assert.equal(report.totalCases, 655360);
  assert.equal(report.schema.passed, true, JSON.stringify(report.schema, null, 2));
  assert.deepEqual(report.duplicateIds, []);
  assert.deepEqual(report.missingSourceIds, []);
  assert.equal(report.insufficientCases, 0, JSON.stringify({ total: report.insufficientCases, exampleGroups: report.insufficientGroups.slice(0, 8) }, null, 2));
  assert.ok(report.minimumCandidates >= 8);
});

test('reported screenshot: 09:12, eye intent and 45 screen minutes continue rerolling without repeats', async () => {
  const snapshot = {
    now: '2026-11-04T09:12:00+08:00', sleepState: 'awake', intent: 'eye', screenMinutes: 45,
    sedentaryMinutes: 30, activityMinutes: 0, sitting: true, canLookFar: true,
    canCloseEyes: true, canLeaveSeat: true, spaceEnough: true, hasSupport: true,
    usualAwake: { start: '07:00', end: '23:00' }, weather: { rain: false }, dnd: []
  };
  let state = { day: '2026-11-04', ordinaryCount: 1, lastReminderAt: '2026-11-04T07:00:00+08:00', recentCards: [] };
  const seen = new Set();
  for (let i = 0; i < 16; i++) {
    const priorRecent = [...state.recentCards];
    const result = await runWorkflow({ snapshot, state, mode: i ? 'reroll' : 'auto' }, { RUN_ID: `screenshot-regression-${i}`, RANDOM: () => 0 });
    assert.ok(result.card, `iteration ${i}: ${result.decision.reason}`);
    assert.ok(result.card.tags.includes('eye'));
    assert.ok(!priorRecent.includes(result.card.id), `recent-three exclusion lost at ${i}`);
    assert.equal(result.card.source.id, result.card.sourceId);
    assert.deepEqual(result.card.steps, catalog.cards.find(c => c.id === result.card.id).steps);
    assert.equal(result.providerMode, 'offline');
    assert.equal(result.state.ordinaryCount, 2, 'reroll must not charge quota');
    seen.add(result.card.id);
    state = result.state;
  }
  assert.ok(seen.size >= 4);
});
