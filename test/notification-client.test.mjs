import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationClient} from '../lib/notification-client.mjs';
import {withDeadline} from '../lib/device-actions.mjs';
function environment({permission='granted',requestPermission,worker}={}){
  const calls=[];
  class Notification{static permission=permission;static requestPermission=requestPermission||(()=>Promise.resolve(permission));constructor(title,options){calls.push({title,options});}}
  const window={Notification,isSecureContext:true,location:{origin:'https://example.pages.dev',href:'https://example.pages.dev/?mode=personal'},focus(){},dispatchEvent(){},CustomEvent:class{}};
  const navigator=worker?{serviceWorker:{register:()=>Promise.resolve({}),ready:Promise.resolve(worker)}}:{};
  return {calls,window,navigator};
}
test('permission granted, denied and dismissed report different outcomes and never silently enable',async()=>{
  for(const permission of ['denied','default']){
    const env=environment({permission}),client=createNotificationClient({...env,isNative:()=>false,timeoutMs:20});
    await assert.rejects(client.enable(),permission==='denied'?/未获允许/:/暂未开启/);assert.equal(env.calls.length,0);
  }
  const client=createNotificationClient({...environment(),isNative:()=>false});assert.match(await client.enable(),/已开启/);
});
test('unanswered permission and service-worker readiness time out and a retry can succeed',async()=>{
  const env=environment({requestPermission:()=>new Promise(()=>{})}),client=createNotificationClient({...env,isNative:()=>false,timeoutMs:10});
  await assert.rejects(client.enable(),/超时/);
  const stuck=environment();stuck.navigator.serviceWorker={register:()=>Promise.resolve({}),ready:new Promise(()=>{})};
  const retry=createNotificationClient({...stuck,isNative:()=>false,timeoutMs:10});await assert.rejects(retry.enable(),/初始化超时/);
  stuck.navigator.serviceWorker.ready=Promise.resolve({showNotification:async()=>{}});assert.match(await retry.enable(),/已开启/);
});
test('canceling a pending action prevents late permission replies from completing the UI action',async()=>{
  let finish;const env=environment({requestPermission:()=>new Promise(resolve=>{finish=resolve;})});const client=createNotificationClient({...env,isNative:()=>false,timeoutMs:100});
  const controller=new AbortController(),pending=client.enable(controller.signal);controller.abort();await assert.rejects(pending,{name:'AbortError'});finish('granted');assert.equal(env.calls.length,0);
  const already=new AbortController();already.abort();let called=false;await assert.rejects(withDeadline(()=>{called=true;},{signal:already.signal}),{name:'AbortError'});assert.equal(called,false);
});
test('test notification actually submits once independent of card selection and returns submission not visual-delivery proof',async()=>{
  const env=environment(),client=createNotificationClient({...env,isNative:()=>false});
  const result=await client.send({id:'test-1',test:true,title:'测试',body:'真实测试',targetUrl:'https://example.pages.dev/?mode=competition'});
  assert.equal(result.submitted,true);assert.equal(env.calls.length,1);assert.equal(env.calls[0].options.data.mode,'competition');
  await assert.rejects(client.send({id:'bad',title:'x',body:'x',targetUrl:'https://evil.example/'}),/本站/);assert.equal(env.calls.length,1);
});
test('native request uses explicit test flag, generic notification content and rejects a false success',async()=>{
  const calls=[];let response={shown:true};const client=createNotificationClient({...environment(),isNative:()=>true,nativeRequest:async(method,timeout,payload)=>{calls.push({method,payload});return response;}});
  await client.send({id:'test',test:true,title:'胸痛',body:'某人血压190',targetUrl:'https://example.pages.dev/?mode=personal'});
  assert.equal(calls[0].method,'showNotification');assert.equal(calls[0].payload.test,true);assert.match(calls[0].payload.title,/测试通知/);assert.doesNotMatch(JSON.stringify(calls[0].payload),/胸痛|190/);
  response={shown:false};await assert.rejects(client.send({id:'two',title:'x',body:'x'}),/尚未确认/);
});
test('both browser notification paths keep medication names and health details out of system notifications',async()=>{
  const workerCalls=[];
  for(const worker of [undefined,{showNotification:async(title,options)=>workerCalls.push({title,options})}]){
    const env=environment({worker}),client=createNotificationClient({...env,isNative:()=>false});
    await client.send({id:'medicine-opaque-0800',kind:'medicine',title:'张某的私人药名',body:'私人药名 10mg，血压190'});
    const submitted=worker?workerCalls.at(-1):env.calls[0];
    assert.match(submitted.title,/用药时间/);assert.doesNotMatch(JSON.stringify(submitted),/私人药名|190|10mg|张某/);
  }
});
test('native pause really cancels and new schedules propagate permission failure instead of reporting success',async()=>{
  const calls=[];const client=createNotificationClient({...environment(),isNative:()=>true,nativeRequest:async(method,timeout,payload)=>{calls.push({method,payload});return method==='cancelReminders'?{cancelled:4,mode:payload.mode}:{scheduled:0,permission:'denied'};}});
  assert.match((await client.synchronize({mode:'personal',enabled:false})).message,/已取消/);assert.equal(calls[0].method,'cancelReminders');
  await assert.rejects(client.synchronize({mode:'personal',enabled:true,reminders:[]}),/未获允许/);
  const old=createNotificationClient({...environment(),isNative:()=>true,nativeRequest:async()=>{throw Error('unknown method');}});await assert.rejects(old.enable(),/安装1\.0/);
  const blocked=createNotificationClient({...environment(),isNative:()=>true,nativeRequest:async()=>({scheduled:4,permission:'granted',canNotify:false})});await assert.rejects(blocked.synchronize({mode:'personal',enabled:true}),/日程已登记.*频道被关闭/);
});

test('native background test requires an explicit valid receipt, while settings do not claim permission granted',async()=>{
 const calls=[];let response={scheduled:true,scheduledAt:Date.now()+60000,exact:false,scheduleMode:'inexact'};
 const client=createNotificationClient({...environment(),isNative:()=>true,nativeRequest:async(method,timeout,payload)=>{calls.push({method,payload});return response;}});
 assert.equal((await client.scheduleTest('personal')).scheduled,true);assert.equal(calls[0].method,'scheduleTestNotification');assert.equal(calls[0].payload.mode,'personal');
 response={scheduled:false};await assert.rejects(client.scheduleTest('personal'),/尚未确认/);
 await assert.rejects(client.scheduleTest('unexpected'),/模式无效/);
 response={opened:true};await client.openBatterySettings();await client.openExactSettings();
 assert.deepEqual(calls.slice(-2).map(c=>c.method),['openBatterySettings','openExactAlarmSettings']);
 const web=createNotificationClient({...environment(),isNative:()=>false});await assert.rejects(web.scheduleTest('personal'),/安卓安装版/);
});
