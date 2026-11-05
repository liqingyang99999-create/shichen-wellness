// Original pentatonic miniatures. Names refer to the modal tonic, not a medical effect.
export const musicModes = {
  gong: {label:'宫音',name:'远山',scale:[60,62,64,67,69],phrase:[0,2,3,2,1,0,1,2,4,3,2,1,2,1,0]},
  shang:{label:'商音',name:'清溪',scale:[62,64,67,69,72],phrase:[0,1,3,2,1,0,2,3,4,2,3,1,2,1,0]},
  jue:  {label:'角音',name:'疏林',scale:[64,67,69,72,74],phrase:[0,2,1,3,2,0,1,3,4,3,1,2,1,0,0]},
  zhi:  {label:'徵音',name:'晴岚',scale:[55,57,60,62,64],phrase:[0,1,2,4,3,2,0,2,3,4,2,3,1,0,0]},
  yu:   {label:'羽音',name:'静水',scale:[57,60,62,64,67],phrase:[0,2,3,1,0,1,2,4,3,2,1,2,1,0,0]},
};
export const midiHz = midi => 440 * 2 ** ((midi-69)/12);
export function musicScore(mode){
  const m=musicModes[mode];
  if(!m)throw new Error('未知五音调式');
  const notes=m.phrase.map((degree,i)=>({at:.25+i*1.8,duration:i===14?3.2:2.4,midi:m.scale[degree],gain:.26,voice:'pluck'}));
  for(let i=0;i<5;i++)notes.push({at:i*5.4,duration:5.8,midi:m.scale[0]-12,gain:.075,voice:'pad'});
  return {mode,label:m.label,name:m.name,duration:30,notes};
}
