import {useEffect,useRef,useState} from 'react';
import {Mic,Square} from 'lucide-react';
import Sheet from './Sheet';
import NativeVoice from './NativeVoice';
import {isNative} from './native-bridge';
type VoiceProps={onText:(text:string)=>void;onMessage:(text:string)=>void};
export default function Voice(props:VoiceProps){return isNative()?<NativeVoice {...props}/>:<BrowserVoice {...props}/>;}
function BrowserVoice({onText,onMessage}:VoiceProps){
  const [intro,setIntro]=useState(false),[listening,setListening]=useState(false);
  const accepted=useRef(false),rec=useRef<any>(null),pressed=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true);
  const callbacks=useRef({onText,onMessage});callbacks.current={onText,onMessage};
  function cancel(report=false){
    const r=rec.current;rec.current=null;pressed.current=false;
    if(timer.current)clearTimeout(timer.current);timer.current=null;
    if(r){r.onresult=null;r.onerror=null;r.onend=null;try{r.abort();}catch{/* Already ended. */}}
    if(mounted.current){setListening(false);if(report&&r)callbacks.current.onMessage('语音输入已取消，未填入识别内容。');}
  }
  useEffect(()=>{
    mounted.current=true;
    const blur=()=>cancel(true),visibility=()=>{if(document.hidden)cancel(true);};
    window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
    return()=>{mounted.current=false;window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);cancel();};
  },[]);
  function stop(){
    pressed.current=false;
    if(timer.current)clearTimeout(timer.current);timer.current=null;
    const r=rec.current;
    if(!r)return;
    try{r.stop();if(rec.current===r)timer.current=setTimeout(()=>{if(rec.current===r)cancel(true);},5000);}catch{cancel(true);}
  }
  function start(){
    if(rec.current)return;
    if(!accepted.current){setIntro(true);return;}
    const Constructor=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!Constructor){callbacks.current.onMessage('这个浏览器没有语音转写服务，可用输入法麦克风或快捷标签。');return;}
    const r=new Constructor();rec.current=r;r.lang='zh-CN';r.continuous=false;r.interimResults=false;setListening(true);
    r.onresult=(e:any)=>{
      if(!mounted.current||rec.current!==r)return;
      const text=e.results?.[0]?.[0]?.transcript;
      if(text){callbacks.current.onText(text);callbacks.current.onMessage('识别文字已填入，可修改后发送。');}
    };
    r.onerror=(e:any)=>{if(mounted.current&&rec.current===r){cancel();callbacks.current.onMessage(e.error==='not-allowed'?'麦克风未获允许，请在浏览器站点设置中开启。':e.error==='no-speech'?'没有听到清晰声音，请再试一次。':e.error==='aborted'?'已结束录音。':'语音服务暂不可用，可使用输入法语音。');}};
    r.onend=()=>{if(rec.current!==r)return;if(timer.current)clearTimeout(timer.current);timer.current=null;rec.current=null;pressed.current=false;if(mounted.current)setListening(false);};
    try{r.start();timer.current=setTimeout(stop,45000);}catch{cancel();callbacks.current.onMessage('语音未能启动，请使用输入法语音。');}
  }
  return <><button type="button" className={`voice ${listening?'listening':''}`} aria-label={listening?'结束语音输入':'按住说话'} style={{touchAction:'none'}}
    onPointerDown={e=>{
      if(e.button!==0)return;e.preventDefault();
      if(rec.current){stop();return;}
      pressed.current=true;
      try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* Cancel on pointerleave if capture is unavailable. */}
      start();
    }}
    onPointerUp={e=>{if(pressed.current)stop();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerLeave={e=>{if(pressed.current&&!e.currentTarget.hasPointerCapture(e.pointerId))cancel(true);}}
    onPointerCancel={()=>cancel(true)} onLostPointerCapture={()=>{if(pressed.current)cancel(true);}}
    onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(e.repeat)return;if(rec.current)stop();else{pressed.current=true;start();}}}}
    onKeyUp={e=>{if((e.key===' '||e.key==='Enter')&&pressed.current){e.preventDefault();stop();}}}
  >{listening?<Square size={17}/>:<Mic size={22}/>}</button>{intro&&<Sheet title="说说此刻" onClose={()=>{setIntro(false);pressed.current=false;}}><p>浏览器语音服务可能联网处理声音。本站只接收转写文字，不保存录音。</p><p className="muted">识别后可以修改，再由你发送。下次可按住麦克风说话；离开页面会取消录音。</p><button className="primary full" onClick={()=>{accepted.current=true;setIntro(false);pressed.current=false;start();}}>允许使用语音服务并开始</button></Sheet>}</>;
}
