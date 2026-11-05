import {withDeadline,nativeFeatureError,notificationPermissionMessage} from './device-actions.mjs';
export function createNotificationClient({isNative,nativeRequest,window:win,navigator:nav,timeoutMs=12000}){
  let registration;
  const call=async(method,payload,signal)=>{try{return await withDeadline(()=>nativeRequest(method,timeoutMs,payload),{timeoutMs,signal,message:'系统响应超时，请查看手机上的授权提示，再重试。'});}catch(error){throw nativeFeatureError(error);}};
  const prepare=signal=>{
    if(!nav.serviceWorker||!win.isSecureContext)return Promise.resolve(null);
    registration??=withDeadline(()=>nav.serviceWorker.register('/sw.js').then(()=>nav.serviceWorker.ready),{timeoutMs,signal,message:'通知服务初始化超时，请刷新页面后重试。'}).catch(error=>{registration=undefined;throw error;});
    return registration;
  };
  const route=(id,targetUrl)=>{
    const url=new URL(targetUrl||win.location.href,win.location.origin),mode=url.searchParams.get('mode');
    if(url.origin!==win.location.origin||url.pathname!=='/'||mode&&!['personal','competition'].includes(mode))throw Error('通知只能打开本站的个人或竞赛入口。');
    if(typeof id!=='string'||!id||id.length>160||/[\u0000-\u001f\u007f]/u.test(id))throw Error('通知标识无效。');
    return {version:1,mode:mode==='competition'?'competition':'personal',noticeId:id};
  };
  const enable=async signal=>{
    if(isNative())return notificationPermissionMessage(await call('requestNotificationPermission',{},signal));
    if(!win.Notification||!win.isSecureContext)throw Error('当前浏览器未提供系统通知，可继续查看应用内通知中心。');
    const permission=await withDeadline(()=>win.Notification.requestPermission(),{timeoutMs,signal,message:'通知授权等待超时，请在浏览器站点设置中确认后重试。'});
    notificationPermissionMessage({permission});await prepare(signal);return '浏览器系统通知权限已开启；网页需要保持运行。';
  };
  const send=async({title,body,id,silent=false,targetUrl,kind='card',test=false},signal)=>{
    const data=route(id,targetUrl);
    const systemTitle=test?'时辰心管家 · 测试通知':kind==='medicine'?'你设置的用药时间到了':'时辰心管家 · 日常提醒';
    const systemBody=test?'这是你刚刚发起的测试通知，点按可返回通知中心。':kind==='medicine'?'请打开应用核对自己保存的用药安排。':'请在方便时打开应用，查看此刻的日常安排。';
    if(isNative()){
      const result=await call('showNotification',{id,title:systemTitle,body:systemBody,route:'notifications',mode:data.mode,kind:kind==='medicine'?'medicine':'card',test,silent},signal);
      if(result?.shown!==true)throw Error('系统尚未确认通知已提交，请检查应用通知权限。');
      return {submitted:true,channel:'native'};
    }
    if(!win.Notification||win.Notification.permission!=='granted')throw Error('系统通知未开启，请先点击“开启系统通知”。');
    const worker=await prepare(signal),options={body:systemBody,tag:id,icon:'/icon.svg',badge:'/icon.svg',silent,data};
    await withDeadline(()=>{
      if(worker)return worker.showNotification(systemTitle,options);
      const notification=new win.Notification(systemTitle,options);
      notification.onclick=()=>{notification.close();win.focus();win.dispatchEvent(new win.CustomEvent('shichen-open-notifications',{detail:data}));};
    },{timeoutMs,signal,message:'提交通知超时，请检查系统设置后重试。'});
    return {submitted:true,channel:'web'};
  };
  const synchronize=async(payload,signal)=>{
    if(!isNative())return {native:false,message:payload.enabled?'网页计划已保存；页面关闭后不保证提醒。':'系统通知未开启；日常时点仍保留在应用内。'};
    if(!payload.enabled){const cancelled=await call('cancelReminders',{mode:payload.mode},signal);if(!(cancelled?.cancelled===true||Number.isInteger(cancelled?.cancelled)&&cancelled.cancelled>=0))throw Error('系统尚未确认取消提醒，请重新检查。');return {native:true,scheduled:0,message:'已取消此模式的本地定时提醒。'};}
    const result=await call('syncReminders',payload,signal);
    if(result?.permission&&result.permission!=='granted')notificationPermissionMessage(result);
    if(result?.canNotify===false)throw Error('日程已登记，但所需通知频道被关闭。请到系统通知设置开启频道，再重新检查；登记不代表通知能够显示。');
    if(!Number.isInteger(result?.scheduled)||result.scheduled<0)throw Error('系统没有返回有效的日程确认，请重新保存。');
    return {native:true,...result,message:`已同步${result.scheduled}个系统日程${result.skippedNight?`，${result.skippedNight}个夜间时点按静默设置跳过`:''}，切到后台后仍可提醒。${result.scheduleMode==='inexact'?'当前使用系统弹性提醒，可能延迟。':''}`};
  };
  const openNativeSettings=(method,signal)=>isNative()?call(method,{},signal):Promise.reject(Error('请在安卓安装版中设置后台提醒。'));
  const scheduleTest=async(mode,signal)=>{
    if(!isNative())throw Error('后台提醒测试请在安卓安装版中使用。');
    if(!['personal','competition'].includes(mode))throw Error('提醒模式无效。');
    const result=await call('scheduleTestNotification',{mode,route:'notifications'},signal);
    if(result?.scheduled!==true||!Number.isFinite(result.scheduledAt)||result.scheduledAt<=0)throw Error('系统尚未确认后台测试日程，请检查权限后重试。');
    return result;
  };
  return {prepare,enable,send,synchronize,scheduleTest,status:signal=>isNative()?call('getNotificationStatus',{},signal):Promise.resolve({permission:win.Notification?.permission||'unsupported'}),openSettings:signal=>isNative()?call('openNotificationSettings',{},signal):Promise.reject(Error('请在浏览器的站点设置中调整通知权限。')),openBatterySettings:signal=>openNativeSettings('openBatterySettings',signal),openExactSettings:signal=>openNativeSettings('openExactAlarmSettings',signal)};
}
