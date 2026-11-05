import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(await readFile(new URL('../src/native-bridge.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(channel){
  const api={},sent=[];let n=0;
  const bridge=channel===false?undefined:{postMessage(raw){sent.push(JSON.parse(raw));}};
  runInNewContext(source,{exports:api,window:{ShichenNative:bridge},crypto:{randomUUID:()=>String(++n)},setTimeout,clearTimeout,Map,Error});
  return {api,bridge,sent,reply(data){bridge.onmessage({data:JSON.stringify(data)});}};
}
test('native bridge is optional and does not request data or permissions on import',async()=>{
  const web=setup(false);assert.equal(web.api.isNativeApp(),false);await assert.rejects(web.api.nativeRequest('getCapabilities'),/安卓安装版/);
  const native=setup();assert.equal(native.api.isNativeApp(),true);assert.deepEqual(native.sent,[]);
});
test('native bridge preserves text, cancellation and service errors without auto-sending chat',async()=>{
  const s=setup();const text=s.api.nativeRequest('startSpeechRecognition',1000);assert.equal(s.sent[0].method,'startSpeechRecognition');s.reply({id:s.sent[0].id,ok:true,data:{text:'刚吃完午饭'}});assert.equal((await text).text,'刚吃完午饭');
  const cancelled=s.api.nativeRequest('startSpeechRecognition',1000);s.reply({id:s.sent[1].id,ok:true,data:{cancelled:true}});assert.equal((await cancelled).cancelled,true);
  const failure=s.api.nativeRequest('startSpeechRecognition',1000);s.reply({id:s.sent[2].id,ok:false,error:'当前环境没有系统语音'});await assert.rejects(failure,/没有系统语音/);
  assert.equal(s.sent.length,3);
});
test('bridge separates concurrent request IDs and ignores late, malformed and unrelated replies',async()=>{
  const s=setup(),one=s.api.nativeRequest('getCapabilities',1000),two=s.api.nativeRequest('requestActivity',1000);
  s.bridge.onmessage({data:'not-json'});s.reply({id:'unrelated',ok:true,data:{bad:true}});
  s.reply({id:s.sent[1].id,ok:true,data:{steps:{permission:'denied'}}});assert.equal((await two).steps.permission,'denied');
  s.reply({id:s.sent[0].id,ok:true,data:{appVersion:'0.8.0-preview'}});assert.equal((await one).appVersion,'0.8.0-preview');
  const timeout=s.api.nativeRequest('startSpeechRecognition',5),id=s.sent[2].id;await assert.rejects(timeout,/语音等待已结束/);s.reply({id,ok:true,data:{text:'迟到的识别'}});
});
test('payload is transmitted as data while the second timeout argument stays compatible',async()=>{
  const s=setup(),payload={mode:'personal',enabled:true,reminders:[{id:'opaque-1',kind:'card',time:'09:00'}]};
  const scheduled=s.api.nativeRequest('syncReminders',1000,payload);
  assert.deepEqual(s.sent[0].payload,payload);assert.equal(s.sent[0].method,'syncReminders');
  s.reply({id:s.sent[0].id,ok:true,data:{scheduled:1,permission:'granted',exact:false}});
  assert.equal((await scheduled).scheduled,1);
  const image=s.api.nativeRequest('saveImage',5,{pngBase64:'aGVsbG8='});
  await assert.rejects(image,/未确认前不会记为成功/);
  s.reply({id:s.sent[1].id,ok:true,data:{saved:true,uri:'content://media/external/images/media/1'}});
  assert.equal(s.sent.length,2);
});
