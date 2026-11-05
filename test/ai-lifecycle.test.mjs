import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../data/cards.json' with {type:'json'};
import {decide} from '../lib/decision.mjs';
import {createAiRequestGate,fetchAiDecision} from '../lib/web-ai-client.mjs';
import {settleAiRequest} from '../lib/ai-lifecycle.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const morning={now:'2026-11-05T06:30:00+08:00',text:'刚晨起，没有不舒服',vitals:{source:'simulation',measuredAt:'2026-11-05T06:30:00+08:00',quality:'good',heartRate:94,stress:84,sleepHours:4.2},confirmation:'no'};

function harness(){
 const gate=createAiRequestGate();let current=morning;
 const state={busy:true,result:{level:'pending'},status:'AI 正在理解'};
 const identity=()=>JSON.stringify(current);
 const run=(request,promise,extra={})=>settleAiRequest({gate,id:request.id,context:identity(),getContext:identity,load:()=>promise,onSuccess:reply=>{state.result=reply;state.status='AI 匹配';},onFailure:()=>{state.result=decide(current,cards);state.status='基础匹配';},onContextChanged:()=>{gate.cancel();state.result=decide(current,cards);state.busy=false;state.status='基础匹配 · 情境已更新';},onSettled:()=>{state.busy=false;},...extra});
 return {gate,state,run,change:input=>{current=input;}};
}

test('a successful response with changed context ends pending even without the React context effect',async()=>{
 const h=harness(),wait=deferred(),request=h.gate.begin(),run=h.run(request,wait.promise);
 h.change({...morning,now:'2026-11-05T23:30:00+08:00',text:'',vitals:{...morning.vitals,measuredAt:'2026-11-05T23:30:00+08:00',asleep:true}});
 wait.resolve({level:'baseline',card:{id:'OLD_MORNING_CARD'}});await run;
 assert.equal(h.state.busy,false);assert.equal(h.state.result.level,'silent');assert.equal(h.state.result.reason,'sleeping_at_night');assert.equal(h.state.result.card,null);
});

test('a failed old-context response recomputes current danger instead of showing its cached fallback',async()=>{
 const h=harness(),wait=deferred(),request=h.gate.begin(),run=h.run(request,wait.promise);
 h.change({...morning,text:'现在剧烈胸痛，大汗淋漓'});wait.reject(Error('network'));await run;
 assert.equal(h.state.busy,false);assert.equal(h.state.result.level,'emergency');
});

test('late completion from a superseded generation cannot clear a new wait or dismiss an emergency',async()=>{
 for(const failure of [false,true]){
  const h=harness(),first=deferred(),second=deferred(),a=h.gate.begin(),old=h.run(a,first.promise);
  const b=h.gate.begin(),fresh=h.run(b,second.promise);
  if(failure)first.reject(Error('old failure'));else first.resolve({level:'baseline',card:{id:'old'}});
  await old;assert.equal(h.state.busy,true);assert.equal(h.state.result.level,'pending');
  second.resolve({level:'emergency',reason:'new danger'});await fresh;assert.equal(h.state.busy,false);assert.equal(h.state.result.level,'emergency');
 }
});

test('confirmed morning recovery times out to a usable local card and settles UI state',async()=>{
 const h=harness(),request=h.gate.begin();
 await h.run(request,fetchAiDecision({}, {timeoutMs:5,fetchImpl:async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))))}));
 assert.equal(h.state.busy,false);assert.notEqual(h.state.result.level,'pending');assert.notEqual(h.state.result.level,'confirm');assert.ok(h.state.result.card);assert.equal(h.state.status,'基础匹配');
});

test('a response rejected during canonical-card validation settles to local matching',async()=>{
 const h=harness(),request=h.gate.begin();
 await h.run(request,Promise.resolve({card:{id:'invalid'}}),{onSuccess:()=>{throw Error('invalid card');}});
 assert.equal(h.state.busy,false);assert.ok(h.state.result.card);assert.equal(h.state.status,'基础匹配');
});
