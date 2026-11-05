import {withDeadline,nativeFeatureError,savedImageMessage,sharedImageMessage} from './device-actions.mjs';
export function createImageShareClient({isNative,nativeRequest,navigator:nav,File:FileType,timeoutMs=12000}){
  const call=async(method,payload,signal)=>{try{return await withDeadline(()=>nativeRequest(method,timeoutMs,payload),{timeoutMs,signal,message:'系统处理图片超时，请重试或先保存预览图。'});}catch(error){throw nativeFeatureError(error);}};
  return {
    async save(image,signal){
      if(!isNative())throw Error('网页版请点击预览下方“下载PNG图片”，并在浏览器下载列表查看。');
      if(!image?.dataUrl?.startsWith('data:image/png;base64,'))throw Error('分享图片尚未生成，请先生成预览。');
      const result=await call('saveImage',{pngBase64:image.dataUrl.slice('data:image/png;base64,'.length),displayName:image.filename},signal);
      return {...result,message:savedImageMessage(result)};
    },
    async share(image,saved,signal){
      if(isNative()){
        const file=saved?.saved===true&&saved.uri?saved:await this.save(image,signal);
        if(signal?.aborted){const error=new Error('操作已取消。');error.name='AbortError';throw error;}
        try{const result=await call('shareImage',{uri:file.uri},signal);return {saved:file,message:sharedImageMessage(result)};}
        catch(error){throw Object.assign(new Error(`${savedImageMessage(file)} ${error instanceof Error?error.message:'系统分享没有打开。'}`),{saved:file});}
      }
      const file=new FileType([image.blob],image.filename,{type:'image/png'});
      if(!nav.canShare?.({files:[file]})||typeof nav.share!=='function')throw Error('此浏览器不能直接分享文件，请先下载PNG图片，再从文件或图库中分享。');
      try{await withDeadline(()=>nav.share({files:[file],title:'护心打卡'}),{timeoutMs:60000,signal,message:'分享面板等待已结束；可返回应用重新分享。'});return {message:'系统分享流程已返回，应用无法确认对方是否收到。'};}
      catch(error){if(error?.name==='AbortError')throw new Error('已取消系统分享，预览图片仍保留。');throw error;}
    }
  };
}
