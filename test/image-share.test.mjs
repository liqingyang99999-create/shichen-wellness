import test from 'node:test';
import assert from 'node:assert/strict';
import {createImageShareClient} from '../lib/image-share-client.mjs';
import {savedImageMessage,WEB_DOWNLOAD_MESSAGE} from '../lib/device-actions.mjs';
const image={blob:new Blob(['png'],{type:'image/png'}),dataUrl:'data:image/png;base64,cG5n',filename:'护心打卡-2026-11-06.png'};
test('native save requires MediaStore acknowledgment and reports its actual location',async()=>{
  const calls=[];let result={saved:true,uri:'content://media/image/5',location:'Pictures/时辰心管家'};
  const client=createImageShareClient({isNative:()=>true,nativeRequest:async(method,timeout,payload)=>{calls.push({method,payload});return result;}});
  const saved=await client.save(image);assert.match(saved.message,/Pictures\/时辰心管家/);assert.equal(calls[0].method,'saveImage');assert.equal(calls[0].payload.pngBase64,'cG5n');
  result={saved:false};await assert.rejects(client.save(image),/尚未确认/);assert.throws(()=>savedImageMessage({saved:true}),/尚未确认/);
});
test('native sharing uses only a confirmed saved URI and does not claim the recipient received it',async()=>{
  const calls=[];const client=createImageShareClient({isNative:()=>true,nativeRequest:async(method,timeout,payload)=>{calls.push({method,payload});return method==='saveImage'?{saved:true,uri:'content://media/image/6',location:'图片库'}:{opened:true};}});
  const result=await client.share(image,null);assert.deepEqual(calls.map(c=>c.method),['saveImage','shareImage']);assert.deepEqual(calls[1].payload,{uri:'content://media/image/6'});assert.match(result.message,/是否发送由你决定/);assert.doesNotMatch(result.message,/分享成功|发送成功/);
});
test('a failed share retains the actual saved file so retry does not duplicate the gallery image',async()=>{
  const calls=[];let opened=false;
  const client=createImageShareClient({isNative:()=>true,nativeRequest:async(method,timeout,payload)=>{calls.push({method,payload});if(method==='saveImage')return {saved:true,uri:'content://media/image/7',location:'Pictures/时辰心管家',displayName:'checkin_actual_123.png'};if(!opened)throw Error('系统分享未打开');return {opened:true};}});
  let saved;
  await assert.rejects(client.share(image,null),error=>{saved=error.saved;assert.equal(saved.displayName,'checkin_actual_123.png');assert.equal(saved.uri,'content://media/image/7');assert.match(error.message,/Pictures/);return true;});
  opened=true;await client.share(image,saved);
  assert.deepEqual(calls.map(item=>item.method),['saveImage','shareImage','shareImage']);
});
test('web preview/download wording never claims the file reached the gallery',async()=>{
  assert.match(WEB_DOWNLOAD_MESSAGE,/已请求浏览器下载/);assert.doesNotMatch(WEB_DOWNLOAD_MESSAGE,/^分享图已下载|^已保存/);assert.match(WEB_DOWNLOAD_MESSAGE,/不代表已保存到手机图库/);
  const client=createImageShareClient({isNative:()=>false,navigator:{canShare:()=>false},File});
  await assert.rejects(client.save(image),/下载PNG/);await assert.rejects(client.share(image,null),/先下载/);
  const cancelled=createImageShareClient({isNative:()=>false,navigator:{canShare:()=>true,share:async()=>{const e=Error('cancel');e.name='AbortError';throw e;}},File});await assert.rejects(cancelled.share(image,null),/已取消.*仍保留/);
});
test('old shells and stalled saving provide a bounded actionable failure',async()=>{
  const old=createImageShareClient({isNative:()=>true,nativeRequest:async()=>{throw Error('unsupported method');}});await assert.rejects(old.save(image),/安装1\.0/);
  const stuck=createImageShareClient({isNative:()=>true,nativeRequest:()=>new Promise(()=>{}),timeoutMs:10});await assert.rejects(stuck.save(image),/图片超时/);
});
