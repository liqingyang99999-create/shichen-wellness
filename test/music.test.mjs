import test from 'node:test';
import assert from 'node:assert/strict';
import {musicModes,musicScore,midiHz} from '../lib/music-score.mjs';
import {FiveTonePlayer} from '../lib/music-player.mjs';
const fakeContext=()=>{
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(value){this.value=value;}});
  const context={state:'suspended',currentTime:0,destination:{},oscillators:[],async resume(){this.state='running';},async close(){this.state='closed';},createGain(){return {gain:param(),connect(){}};},createBiquadFilter(){return {frequency:param(),Q:param(),connect(){}};},createOscillator(){const node={frequency:param(),stopped:0,connect(){},disconnect(){},start(at){this.at=at;},stop(){this.stopped++;}};context.oscillators.push(node);return node;}};
  return context;
};
test('five original pentatonic scores have different tonics and resolve within 30 seconds',()=>{
  const scores=Object.keys(musicModes).map(musicScore);assert.equal(scores.length,5);
  assert.equal(new Set(scores.map(s=>s.notes[0].midi%12)).size,5);
  for(const score of scores){assert.equal(score.duration,30);for(const n of score.notes){assert.ok([0,2,4,7,9].includes(n.midi%12));assert.ok(n.at>=0&&n.at+n.duration<=30);assert.ok(midiHz(n.midi)>90&&midiHz(n.midi)<700);}}
});
test('audio is created only on play, can change volume, and stop cancels future notes',async()=>{
  let created=0;const ctx=fakeContext();const player=new FiveTonePlayer({createContext:()=>{created++;return ctx;}});
  assert.equal(created,0);assert.equal(await player.play('gong'),true);assert.equal(created,1);assert.equal(ctx.state,'running');assert.ok(ctx.oscillators.length>=15);
  player.setVolume(.2);assert.equal(player.master.gain.value,.1);player.stop();assert.equal(ctx.state,'closed');assert.ok(ctx.oscillators.every(n=>n.stopped===2));assert.equal(player.nodes.length,0);
});
test('a stop or card switch while audio permission is pending prevents playback',async()=>{
  let resume;const ctx=fakeContext();ctx.resume=()=>new Promise(resolve=>{resume=()=>{ctx.state='running';resolve();};});
  const player=new FiveTonePlayer({createContext:()=>ctx});const promise=player.play('yu');player.stop();resume();assert.equal(await promise,false);assert.equal(ctx.oscillators.length,0);assert.equal(player.context,null);
});
test('unsupported audio and invalid music never pretend playback succeeded',async()=>{
  const states=[];const ctx=fakeContext();ctx.resume=async()=>{};const player=new FiveTonePlayer({createContext:()=>ctx,onState:s=>states.push(s)});
  await assert.rejects(player.play('gong'));assert.ok(!states.includes('playing'));assert.equal(ctx.state,'closed');await assert.rejects(player.play('unknown'));
});
