"use client";

export const activityFields = [
  ['busy','勿扰 / 忙碌'], ['canLeaveSeat','可以离座'], ['canLookFar','可以远眺'],
  ['canCloseEyes','可以短暂闭目'], ['sitting','已经坐稳'], ['spaceEnough','空间足够'],
  ['hasSupport','有固定扶手'], ['waterAvailable','手边有饮用水'],
  ['headphones','正在使用耳机'], ['atMeal','正在进餐'], ['goingOut','准备外出']
] as const;

export default function ActivityConditions({snapshot,onChange}:{snapshot:any,onChange:(key:string,value:boolean|undefined)=>void}){
 return <div className="condition-grid">{activityFields.map(([key,label])=><label key={key}>
  <span>{label}</span><select aria-label={label} value={snapshot[key]===true?'yes':snapshot[key]===false?'no':'unknown'}
   onChange={e=>onChange(key,e.target.value==='unknown'?undefined:e.target.value==='yes')}>
   <option value="unknown">未说明</option><option value="yes">是</option><option value="no">否</option>
  </select>
 </label>)}</div>;
}
