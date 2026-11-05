import {createNotificationClient} from '../lib/notification-client.mjs';
import {isNative,nativeRequest} from './native-bridge';
const client=createNotificationClient({isNative,nativeRequest,window,navigator});
export const enableNotifications=(signal?:AbortSignal)=>client.enable(signal);
export const notificationStatus=(signal?:AbortSignal)=>client.status(signal);
export const openNotificationSettings=(signal?:AbortSignal)=>client.openSettings(signal);
export const openBatterySettings=(signal?:AbortSignal)=>client.openBatterySettings(signal);
export const openExactAlarmSettings=(signal?:AbortSignal)=>client.openExactSettings(signal);
export const scheduleBackgroundTest=(mode:'personal'|'competition',signal?:AbortSignal)=>client.scheduleTest(mode,signal);
export const syncNotifications=(payload:any,signal?:AbortSignal)=>client.synchronize(payload,signal);
export async function notify(title:string,body:string,tag:string,silent=false,targetUrl?:string,kind='card'){
  try{await client.send({title,body,id:tag,silent,targetUrl,kind});return true;}catch{return false;}
}
export async function testNotification(mode:'personal'|'competition',signal?:AbortSignal){
  const id='test-'+crypto.randomUUID();
  const result=await client.send({id,title:'时辰心管家 · 测试通知',body:'这是你刚刚发起的测试通知，点按可返回通知中心。',test:true,targetUrl:`${location.origin}/?mode=${mode}`},signal);
  return {id,...result};
}
