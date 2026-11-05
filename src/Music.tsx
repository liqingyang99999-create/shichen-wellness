import {useEffect,useRef,useState} from 'react';
import {Music2,Volume2,Square} from 'lucide-react';
import {FiveTonePlayer} from '../lib/music-player.mjs';
import {musicModes} from '../lib/music-score.mjs';
export function useFiveToneMusic(){
  const [state,setState]=useState('stopped');const [volume,setVolumeState]=useState(.35);
  const player=useRef<FiveTonePlayer|null>(null);
  if(!player.current)player.current=new FiveTonePlayer({onState:setState});
  useEffect(()=>()=>player.current?.stop(),[]);
  return {state,volume,start:(mode:string)=>player.current!.play(mode),stop:()=>player.current!.stop(),setVolume:(value:number)=>{setVolumeState(value);player.current!.setVolume(value);}};
}
export function MusicControls({mode,music,onStop}:{mode:string;music:ReturnType<typeof useFiveToneMusic>;onStop:()=>void}){
  const meta=musicModes[mode as keyof typeof musicModes];if(!meta)return null;
  return <section className="music-player" aria-label="五音音乐播放器"><div className="music-heading"><Music2 size={19}/><span>{meta.label} · {meta.name}<small>原创五音舒缓音景 · 30 秒</small></span><span role="status" className="music-status">{music.state==='playing'?'正在播放':music.state==='loading'?'准备播放':'点击开始聆听'}</span></div><div className="music-volume"><Volume2 size={17}/><label><span className="sr-only">音乐音量</span><input type="range" min="0" max="100" step="1" value={Math.round(music.volume*100)} onChange={e=>music.setVolume(Number(e.target.value)/100)}/></label><span>{Math.round(music.volume*100)}%</span>{music.state!=='stopped'&&<button type="button" className="text-button" onClick={onStop}><Square size={13}/>停止</button>}</div></section>;
}
