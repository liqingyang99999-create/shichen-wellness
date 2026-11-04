import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflow } from '../server/engine.mjs';

test('daily preview preserves unknown device facts and records its actual source', async () => {
  const now = '2026-11-04T13:00:00+08:00';
  const result = await runWorkflow({ snapshot: {now,inputMode:'daily',sleepState:'unknown',intent:'general'}, mode:'preview' }, {});
  assert.ok(result.card);
  assert.equal(result.state.ordinaryCount,0);
  const frozen=result.trace.find(n=>n.id==='N03').output.snapshot;
  for (const key of ['screenMinutes','sedentaryMinutes','activityMinutes','sitting']) assert.equal(frozen[key],undefined);
  assert.equal(result.decision.sleepState,'unknown');
  assert.deepEqual(result.trace.find(n=>n.id==='N11').output.inputSources,{situation:'current-time-and-confirmed-conditions',weather:'unavailable'});
});

test('daily context does not turn a simulation interaction into a real wake signal', async () => {
  const now = '2026-11-04T23:30:00+08:00';
  const result = await runWorkflow({snapshot:{now,inputMode:'daily',sleepState:'unknown',simulatedInteractionAt:now,intent:'quiet'},mode:'auto'},{});
  assert.equal(result.card,null);
  assert.equal(result.decision.sleepState,'unknown');
});
