import {useState} from 'react';
import Sheet from './Sheet';
import Voice from './Voice';
import {clarificationCopy} from '../lib/conversation.mjs';
export type FeedbackSource='manual'|'voice'|'tag';
type Props={result:any;onClose:()=>void;onReply:(text:string,source:FeedbackSource)=>void;onConfirm:(answer:'yes'|'no')=>void;onBloodPressure:()=>void};
export default function FollowUp({result,onClose,onReply,onConfirm,onBloodPressure}:Props){
  const [text,setText]=useState(''),[source,setSource]=useState<FeedbackSource>('manual'),[status,setStatus]=useState('');
  const options=Array.isArray(result.options)?result.options:[];const copy=clarificationCopy(result);
  function reply(value:string,from:FeedbackSource){if(value.trim())onReply(value.trim(),from);}
  if(result.inputKind==='blood_pressure')return <Sheet title="记录这次血压" onClose={onClose}><p className="question-copy">{result.question}</p><button className="primary full" onClick={onBloodPressure}>填写血压与测量时间</button><p className="muted">请按实际测量结果填写，历史记录会保留原来的日期和时间。</p></Sheet>;
  return <Sheet title={copy.title} onClose={onClose}>
    <p className="question-copy">{result.question||'哪里和平时不一样？可以用自己的话说，不必挑某个标签。'}</p>
    {result.level==='confirm'&&<div className="button-row"><button className="primary" onClick={()=>onConfirm('yes')}>有些不舒服</button><button className="secondary" onClick={()=>onConfirm('no')}>没有明显不适</button></div>}
    {copy.kind==='preference'&&<button className="primary full" onClick={()=>reply('你帮我选','tag')}>你帮我选一个</button>}
    {copy.kind==='symptom'&&result.level!=='confirm'&&<button className="text-button" onClick={()=>reply('我不确定','tag')}>我不确定，先休息一下</button>}
    {result.level!=='confirm'&&options.length>0&&<div className="followup-options">{options.map((o:any,i:number)=>{const label=typeof o==='string'?o:o.label;const value=typeof o==='string'?o:o.value||o.label;return <button className="secondary" key={i} onClick={()=>reply(value,'tag')}>{label}</button>;})}</div>}
    <form className="followup-form" onSubmit={e=>{e.preventDefault();reply(text,source);}}>
      <label className="field">{copy.label}<textarea aria-label="补充你的感受" rows={3} maxLength={1200} placeholder={copy.placeholder} value={text} onChange={e=>{setText(e.target.value);setSource('manual');}}/></label>
      <div className="followup-actions"><Voice onText={value=>{setText(t=>t?t+'，'+value:value);setSource('voice');}} onMessage={setStatus}/><button className="primary" disabled={!text.trim()}>发送补充</button></div>
    </form>
    <p className="muted">{copy.hint}</p>
    {status&&<p className="soft-note" role="status">{status}</p>}
  </Sheet>;
}
