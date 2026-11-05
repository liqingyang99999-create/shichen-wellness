import test from 'node:test';
import assert from 'node:assert/strict';
import {applySimulationTime} from '../lib/simulation-input.mjs';

test('simulation submission reads the current native control value, not an earlier React snapshot',()=>{
 const input={value:'2026-11-05T08:10'},submitted=[];
 input.value='2026-11-05T15:30';
 applySimulationTime(input,value=>submitted.push(value));
 assert.deepEqual(submitted,['2026-11-05T07:30:00.000Z']);
 input.value='2026-11-05T23:30';applySimulationTime(input,value=>submitted.push(value));
 assert.equal(submitted.at(-1),'2026-11-05T15:30:00.000Z');
});

test('incomplete and rollover dates never commit a previous or normalized simulation time',()=>{
 let called=false;
 for(const value of ['', '2026-11-05','2026-02-30T15:30','2026-13-01T15:30','2026-11-05T24:30','2026-11-05T15:70','2026-11-05T15:30:45'])assert.throws(()=>applySimulationTime({value},()=>{called=true;}),/有效/);
 assert.equal(called,false);assert.equal(applySimulationTime({value:'2028-02-29T00:00'},()=>{}),'2028-02-28T16:00:00.000Z');
});
