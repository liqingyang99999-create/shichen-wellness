export type RecheckOutcome='improved'|'unchanged'|'persistent'|'worse';
export default function RecheckActions({onReply,question,compact=false}:{onReply:(outcome:RecheckOutcome)=>void;question?:string;compact?:boolean}){
 return <div className={compact?'recheck-actions compact':'recheck-actions'} aria-label="休息后感受复评"><p>{question||'现在感觉怎么样？'}</p><div className="followup-options"><button className="secondary" onClick={()=>onReply('improved')}>已缓解</button><button className="secondary" onClick={()=>onReply('unchanged')}>差不多</button><button className="secondary" onClick={()=>onReply('worse')}>加重或出现新不适</button></div></div>;
}
