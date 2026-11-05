import {useEffect,useRef,useState} from 'react';
import {Mic} from 'lucide-react';
import {nativeRequest} from './native-bridge';
import Sheet from './Sheet';

type Props={onText:(text:string)=>void;onMessage:(text:string)=>void};
/** A system recognition Activity, not WebView microphone capture. No audio is returned. */
export default function NativeVoice({onText,onMessage}:Props){
  const [intro,setIntro]=useState(false),[busy,setBusy]=useState(false);
  const accepted=useRef(false),active=useRef(false),request=useRef(0),running=useRef(false);
  const callbacks=useRef({onText,onMessage});callbacks.current={onText,onMessage};
  useEffect(()=>{active.current=true;return()=>{active.current=false;request.current++;};},[]);
  async function start(){
    if(running.current)return;
    const token=++request.current;running.current=true;setBusy(true);setIntro(false);accepted.current=true;
    const current=()=>active.current&&request.current===token;
    try{
      const capability=await nativeRequest('getCapabilities');
      if(!current())return;
      if(!capability?.speech)throw Error('当前安装版未提供系统语音，请在设置中检查安装包更新；也可使用输入法麦克风。');
      if(capability.speech.available!==true)throw Error('当前安卓环境没有可用的系统语音服务，可使用输入法麦克风。');
      callbacks.current.onMessage('请在系统语音界面说话；识别后可编辑，再由你发送。');
      // A normal switch to the system Activity hides WebView. Do not cancel on blur.
      const result=await nativeRequest('startSpeechRecognition',180000);
      if(!current())return;
      if(result?.cancelled){callbacks.current.onMessage('已取消语音输入。');return;}
      if(typeof result?.text!=='string'||!result.text.trim())throw Error('没有收到清晰的识别文字，可以再试一次。');
      let text=result.text.trim().slice(0,1200);
      if(/[\uD800-\uDBFF]$/.test(text))text=text.slice(0,-1);
      callbacks.current.onText(text);
      callbacks.current.onMessage('识别文字已填入，可修改后发送。');
    }catch(error){if(current())callbacks.current.onMessage(error instanceof Error?error.message:'系统语音暂不可用，可使用输入法麦克风。');}
    finally{if(request.current===token){running.current=false;if(active.current)setBusy(false);}}
  }
  return <><button type="button" className={`voice ${busy?'listening':''}`} disabled={busy} aria-label={busy?'正在等待系统语音':'点按语音输入'} aria-busy={busy} onClick={()=>{if(accepted.current)void start();else setIntro(true);}}><Mic size={22}/></button>
    {intro&&<Sheet title="说说此刻" onClose={()=>setIntro(false)}><p>将打开手机的系统语音识别界面。系统服务可能联网处理声音；本应用只接收文字，不保存录音。</p><p className="muted">文字先填入输入框，可修改后主动发送。可在系统界面取消；安装版使用点按启动。</p><button type="button" className="primary full" onClick={()=>void start()}>允许使用系统语音并开始</button></Sheet>}
  </>;
}
