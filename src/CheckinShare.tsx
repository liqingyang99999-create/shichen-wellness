import {useEffect,useRef,useState} from 'react';
import {Share2,Download,Image as ImageIcon} from 'lucide-react';
import {generateCheckinImage} from './share';
import {isNative,nativeRequest} from './native-bridge';
import {createImageShareClient} from '../lib/image-share-client.mjs';
import {WEB_DOWNLOAD_MESSAGE,withDeadline} from '../lib/device-actions.mjs';
const client=createImageShareClient({isNative,nativeRequest,navigator,File});
type ImageResult={blob:Blob;dataUrl:string;filename:string};
export default function CheckinShare({title,day}:{title:string;day:string}){
  const [image,setImage]=useState<ImageResult|null>(null),[saved,setSaved]=useState<any>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState('');
  const active=useRef(true),request=useRef<AbortController|null>(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;request.current?.abort();};},[]);
  async function run(label:string,task:(signal:AbortSignal)=>Promise<string>){
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(label);setMessage(label);
    try{const text=await task(controller.signal);if(active.current&&!controller.signal.aborted)setMessage(text);}
    catch(error){if(active.current&&!controller.signal.aborted){if(error&&typeof error==='object'&&'saved' in error){const confirmed=error.saved as any;if(confirmed?.saved===true&&confirmed.uri)setSaved(confirmed);}setMessage(error instanceof Error?error.message:'图片操作未完成，请重试。');}}
    finally{if(active.current&&request.current===controller)setBusy('');}
  }
  function generate(){void run('正在生成分享图…',async signal=>{const result=await withDeadline(()=>generateCheckinImage(title,day),{timeoutMs:7000,signal,message:'生成图片超时，请重试。'});if(active.current&&!signal.aborted){setImage(result);setSaved(null);}return '分享图已生成。请预览后选择保存或分享。';});}
  return <section className="section checkin-share" aria-label="打卡分享图片"><button type="button" className="secondary full" disabled={!!busy} onClick={generate}><ImageIcon size={17}/>{image?'重新生成分享图':'生成打卡分享图'}</button>
    {image&&<><img className="share-preview" src={image.dataUrl} alt="打卡分享图片预览，包含行动标题与日期，不含个人健康资料"/>
      {isNative()?<button className="secondary full" disabled={!!busy} onClick={()=>void run('正在保存到系统图片库…',async signal=>{const result=await client.save(image,signal);if(active.current&&!signal.aborted)setSaved(result);return result.message;})}><Download size={17}/>保存到手机图片库</button>:<a className="secondary full" href={image.dataUrl} download={image.filename} onClick={()=>setMessage(WEB_DOWNLOAD_MESSAGE)}><Download size={17}/>下载PNG图片</a>}
      <button className="secondary full" disabled={!!busy} onClick={()=>void run('正在打开系统分享…',async signal=>{const result=await client.share(image,saved,signal);if(active.current&&!signal.aborted&&result.saved)setSaved(result.saved);return result.message;})}><Share2 size={17}/>打开系统分享</button>
      <p className="muted">文件名：{saved?.displayName||image.filename}{saved?.location?` · ${saved.location}`:''}</p>
    </>}
    {message&&<p className="soft-note" role="status">{message}</p>}
    {busy&&<button className="text-button" onClick={()=>{request.current?.abort();setBusy('');setMessage('已停止等待。若系统已经打开保存或分享界面，请在手机上确认结果。');}}>停止等待</button>}
    <p className="muted">不含姓名、疾病和血压。Android安装版通过系统图片库保存，无需开放全部文件访问；卓易通内保存的图片可能需要从容器内图库或系统分享导出。</p>
  </section>;
}
