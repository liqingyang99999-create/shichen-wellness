/** @template T @param {()=>Promise<T>|T} operation @param {{timeoutMs?:number,signal?:AbortSignal,message?:string}} options @returns {Promise<T>} */
export function withDeadline(operation,{timeoutMs=12000,signal,message='等待已超时，请完成系统提示后重试。'}={}){
  return new Promise((resolve,reject)=>{
    let settled=false,timer;
    const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);};
    const abort=()=>{const error=new Error('操作已取消。');error.name='AbortError';finish(reject,error);};
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>finish(reject,new Error(message)),timeoutMs);
    try{Promise.resolve(operation()).then(value=>finish(resolve,value),error=>finish(reject,error));}catch(error){finish(reject,error);}
  });
}
export function nativeFeatureError(error){const message=error instanceof Error?error.message:String(error||'');return /unknown|unsupported|not.supported|not.implemented|未支持|不支持|未知方法|未识别/i.test(message)?new Error('当前安装包尚不支持此功能，请先在“版本与更新”安装1.0或更新版本。'):error instanceof Error?error:new Error('设备功能暂不可用，请重试。');}
export function notificationPermissionMessage(result){
  if(result?.permission==='denied')throw Error('系统通知未获允许，请在系统的应用通知设置中开启。');
  if(result?.permission!=='granted')throw Error('你暂未开启系统通知，可以稍后重新申请。');
  if(result.canNotify===false||result.channelsEnabled===false)throw Error('通知权限已允许，但应用通知频道被关闭，请在系统通知设置中开启。');
  return '系统通知权限已开启。';
}
export function savedImageMessage(result){
  if(result?.saved!==true||typeof result.uri!=='string'||!result.uri)throw Error('系统尚未确认图片保存成功，请重试或使用预览下载。');
  const location=typeof result.location==='string'&&result.location.trim()?result.location.trim():'系统图片库';
  return `图片已保存到${location}。图库同步可能稍有延迟，可按文件名查找。`;
}
export function sharedImageMessage(result){if(result?.opened!==true)throw Error('未能打开系统分享，请先保存图片后手动分享。');return '已打开系统分享面板，是否发送由你决定。';}
export const WEB_DOWNLOAD_MESSAGE='已请求浏览器下载。请在浏览器下载列表查看；这不代表已保存到手机图库。';
