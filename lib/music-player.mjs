import {musicScore,midiHz} from './music-score.mjs';

// Created only on an explicit play gesture. One context owns all scheduled sounds.
export class FiveTonePlayer {
  constructor({createContext,onState=(_state)=>{}}={}){
    this.createContext=createContext||(()=>{const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)throw Error('当前浏览器不支持音频播放，请使用更新的浏览器。');return new C();});
    this.onState=onState;this.volume=.35;this.generation=0;this.context=null;this.master=null;this.nodes=[];this.timer=null;
  }
  setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));if(this.master&&this.context)this.master.gain.setTargetAtTime(this.volume*.5,this.context.currentTime,.04);}
  async play(mode){
    const score=musicScore(mode);this.stop();const generation=this.generation;
    const ctx=this.createContext();this.context=ctx;this.onState('loading');
    try {
      await ctx.resume();
      if(this.generation!==generation||this.context!==ctx)return false;
      if(ctx.state!=='running')throw Error('播放尚未获准，请再次点击开始聆听。');
      const master=ctx.createGain();master.gain.value=this.volume*.5;master.connect(ctx.destination);this.master=master;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2400;filter.Q.value=.4;filter.connect(master);
      const start=ctx.currentTime+.05;
      for(const note of score.notes){
        const envelope=ctx.createGain();envelope.connect(filter);const at=start+note.at;const end=Math.min(start+29.8,at+note.duration);const attack=note.voice==='pad'?1.1:.025;
        envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(note.gain,at+attack);envelope.gain.exponentialRampToValueAtTime(.0001,end);
        const oscillator=ctx.createOscillator();oscillator.type=note.voice==='pad'?'sine':'triangle';oscillator.frequency.value=midiHz(note.midi);oscillator.connect(envelope);oscillator.start(at);oscillator.stop(end+.03);this.nodes.push(oscillator);
      }
      this.onState('playing');
      this.timer=setTimeout(()=>{if(this.generation===generation)this.stop();},score.duration*1000+100);
      return true;
    }catch(error){if(this.generation!==generation)return false;if(this.context===ctx)this.stop();throw error;}
  }
  stop(){
    this.generation++;if(this.timer)clearTimeout(this.timer);this.timer=null;
    const ctx=this.context;this.context=null;
    // Mute immediately before disposing scheduled nodes: no future note survives a switch.
    if(this.master&&ctx){this.master.gain.cancelScheduledValues(ctx.currentTime);this.master.gain.setValueAtTime(0,ctx.currentTime);}
    for(const node of this.nodes){try{node.stop();node.disconnect();}catch{}}
    this.nodes=[];this.master=null;if(ctx&&ctx.state!=='closed')void ctx.close().catch(()=>{});
    this.onState('stopped');
  }
}
