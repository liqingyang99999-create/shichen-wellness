import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Square } from 'lucide-react';
import { isNative, nativeRequest } from '../native-bridge';
import Sheet from './Sheet';
import './input-tools.css';

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const speechErrors: Record<string, string> = {
  'not-allowed': '麦克风未获允许。可在浏览器设置中开启，或使用输入法的麦克风。',
  'service-not-allowed': '当前浏览器不支持这项语音服务，请使用输入法的麦克风。',
  'audio-capture': '暂时无法使用麦克风，请检查设备或使用输入法的麦克风。',
  network: '语音服务连接失败，请使用输入法语音或稍后重试。',
  'no-speech': '没有听到清晰的语音，可以再试一次。',
};

export default function VoiceInput({ disabled, onText, onListening, onMessage }: {
  disabled: boolean; onText(text: string): void; onListening(value: boolean): void; onMessage(value: string, upgrade?: boolean): void;
}) {
  const [intro, setIntro] = useState(false);
  const [listening, setListening] = useState(false);
  const introduced = useRef(false);
  const active = useRef(true);
  const running = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const callbacks = useRef({ onText, onListening, onMessage });
  callbacks.current = { onText, onListening, onMessage };
  useEffect(() => {
    active.current = true;
    const hide = () => { if (document.visibilityState === 'hidden') recognition.current?.abort(); };
    document.addEventListener('visibilitychange', hide);
    return () => { active.current = false; document.removeEventListener('visibilitychange', hide); recognition.current?.abort(); };
  }, []);

  function finish() {
    running.current = false;
    if (active.current) { setListening(false); callbacks.current.onListening(false); }
  }
  function accept(text: unknown) {
    if (!active.current || typeof text !== 'string' || !text.trim()) return;
    callbacks.current.onText(text.trim().slice(0, 1200));
    callbacks.current.onMessage('文字已放入输入框，可修改后点击发送。');
  }
  async function start() {
    if (running.current || disabled) return;
    setIntro(false); introduced.current = true; running.current = true;
    setListening(true); callbacks.current.onListening(true); callbacks.current.onMessage('请说说你现在的状态…');
    if (isNative()) {
      try {
        const capability = await nativeRequest('getCapabilities');
        if (!capability?.speech) {
          if (active.current) callbacks.current.onMessage(`当前安装版 ${capability?.appVersion || '版本暂未获取'} 未提供应用内语音。网页更新不会自动升级安装包，请查看安装版更新；也可使用输入法的麦克风。`, true);
          return;
        }
        if (!capability.speech.available) throw new Error('当前安卓环境没有可用的语音服务，请使用输入法的麦克风。');
        const result = await nativeRequest('startSpeechRecognition', 180000);
        if (result?.cancelled && active.current) callbacks.current.onMessage('已取消语音输入。');
        else if (typeof result?.text === 'string' && result.text.trim()) accept(result.text);
        else if (active.current) callbacks.current.onMessage('没有收到识别文字，可以再试一次。');
      } catch (error) { if (active.current) callbacks.current.onMessage(error instanceof Error ? error.message : '语音暂不可用，请使用输入法的麦克风。'); }
      finally { finish(); }
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor) { callbacks.current.onMessage('这个浏览器暂不支持语音识别，可点输入框后使用输入法的麦克风。'); finish(); return; }
    const session = new Constructor(); recognition.current = session;
    let received = false;
    const timer = setTimeout(() => { session.abort(); }, 60000);
    session.lang = 'zh-CN'; session.continuous = false; session.interimResults = false; session.maxAlternatives = 1;
    session.onresult = event => { if (recognition.current !== session) return; received = true; accept(event.results[0]?.[0]?.transcript); };
    session.onerror = event => { clearTimeout(timer); if (recognition.current !== session) return; received = true; recognition.current = null; if (active.current) callbacks.current.onMessage(event.error === 'aborted' ? '已取消语音输入。' : speechErrors[event.error] || '语音暂不可用，请使用输入法的麦克风。'); finish(); };
    session.onend = () => { clearTimeout(timer); if (recognition.current !== session) return; if (!received && active.current) callbacks.current.onMessage('没有收到识别文字，可以再试一次。'); recognition.current = null; finish(); };
    try { session.start(); } catch { clearTimeout(timer); callbacks.current.onMessage('语音未能启动，请使用输入法的麦克风。'); recognition.current = null; finish(); }
  }
  return <>
    <button type="button" className={`mobile-voice-button${listening ? ' is-listening' : ''}`} aria-label={listening ? '结束语音输入' : '语音输入'} aria-pressed={listening} disabled={listening ? isNative() : disabled} onClick={() => {
      if (listening) recognition.current?.stop(); else if (introduced.current) void start(); else setIntro(true);
    }}>{listening ? <Square size={17}/> : <Mic size={21}/>}</button>
    {intro && createPortal(<Sheet title="说说此刻" onClose={() => setIntro(false)}>
      <p>把语音转成文字，再由你检查、修改和发送。</p>
      <p className="mobile-setting-note">将调用手机或浏览器的语音识别服务，服务可能联网处理声音。本应用接收识别后的文字，不保存录音；只有你点击发送，文字才交给 AI 生成卡片。</p>
      <button type="button" className="mobile-primary mobile-full" onClick={() => void start()}>开始语音输入</button>
      <button type="button" className="mobile-link" onClick={() => setIntro(false)}>继续打字</button>
    </Sheet>, document.body)}
  </>;
}
