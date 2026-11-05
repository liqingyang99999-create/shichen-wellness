// Local record helpers. Times are explicit, no network and no medication advice.
const DEFAULT_ZONE = 'Asia/Shanghai';
const millis = value => typeof value === 'string' || value instanceof Date ? Date.parse(value) : NaN;
const validNumber = value => typeof value === 'number' && Number.isFinite(value);
function localParts(value, timeZone = DEFAULT_ZONE) {
  const ms = millis(value);
  if (!Number.isFinite(ms)) throw new TypeError('需要有效时间');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(ms).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {ms,date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour),minute:Number(parts.minute),second:Number(parts.second)};
}
function validBP(record) {
  return record && typeof record.id === 'string' && Number.isFinite(millis(record.measuredAt))
    && validNumber(record.systolic) && validNumber(record.diastolic)
    && record.systolic > record.diastolic && record.systolic >= 40 && record.systolic <= 300
    && record.diastolic >= 20 && record.diastolic <= 200;
}
function uniqueById(records) {
  const known=new Set();
  return records.filter(record=>{if(known.has(record.id))return false;known.add(record.id);return true;});
}
export function getMorningBaseline(records = [], now, {timeZone=DEFAULT_ZONE} = {}) {
  const day=localParts(now,timeZone);
  // The array is append-only history: a later measurement/backfill must not
  // silently replace the first explicitly tagged morning record.
  return uniqueById(records.filter(validBP)).find(record=>record.isMorning===true && millis(record.measuredAt)<=day.ms && localParts(record.measuredAt,timeZone).date===day.date) || null;
}
export function groupDailyBloodPressure(records = [], {timeZone=DEFAULT_ZONE} = {}) {
  const groups=new Map(),valid=uniqueById(records.filter(validBP));
  for(const record of [...valid].sort((a,b)=>millis(a.measuredAt)-millis(b.measuredAt))) {
    const date=localParts(record.measuredAt,timeZone).date;
    if(!groups.has(date))groups.set(date,[]);
    groups.get(date).push(record);
  }
  return [...groups].map(([date,items])=>({date,count:items.length,systolic:Math.round(items.reduce((n,r)=>n+r.systolic,0)/items.length*10)/10,diastolic:Math.round(items.reduce((n,r)=>n+r.diastolic,0)/items.length*10)/10,records:items,morningBaseline:valid.find(r=>r.isMorning===true&&localParts(r.measuredAt,timeZone).date===date)||null}));
}
export function adherenceSummary(opportunities = [], completions = [], {now=new Date().toISOString(),from,to,symptomLog=[]} = {}) {
  const end=millis(now),begin=from===undefined?-Infinity:millis(from),limit=to===undefined?end:Math.min(end,millis(to));
  if(!Number.isFinite(end)||Number.isNaN(begin)||Number.isNaN(limit))throw new TypeError('统计区间无效');
  const scheduled=uniqueById(opportunities.filter(o=>o&&typeof o.id==='string'&&Number.isFinite(millis(o.scheduledAt))))
    .filter(o=>millis(o.scheduledAt)>=begin&&millis(o.scheduledAt)<=limit);
  const ids=new Set(scheduled.map(o=>o.id)),done=new Map();
  let unmatchedCompletions=0;
  for(const completion of completions) {
    if(!completion||!Number.isFinite(millis(completion.completedAt))||millis(completion.completedAt)>limit||millis(completion.completedAt)<begin)continue;
    if(!ids.has(completion.opportunityId)){unmatchedCompletions++;continue;}
    const opportunity=scheduled.find(o=>o.id===completion.opportunityId);
    if(completion.cardId!==opportunity.cardId||millis(completion.completedAt)<millis(opportunity.scheduledAt)){unmatchedCompletions++;continue;}
    if(!done.has(completion.opportunityId))done.set(completion.opportunityId,completion);
  }
  const symptomReports={paired:0,improved:0,unchanged:0,worsened:0};
  for(const record of done.values()) {
    if(![record.symptomBefore,record.symptomAfter].every(value=>Number.isInteger(value)&&value>=0&&value<=3))continue;
    symptomReports.paired++;
    symptomReports[record.symptomAfter<record.symptomBefore?'improved':record.symptomAfter>record.symptomBefore?'worsened':'unchanged']++;
  }
  const reports=uniqueById((Array.isArray(symptomLog)?symptomLog:[]).filter(r=>r&&typeof r.id==='string'&&Number.isInteger(r.severity)&&r.severity>=0&&r.severity<=3&&Number.isFinite(millis(r.recordedAt))&&millis(r.recordedAt)>=begin&&millis(r.recordedAt)<=limit&&Array.isArray(r.symptoms)));
  const selfReportedSymptoms={reports:reports.length,bySymptom:{}};
  for(const report of reports)for(const symptom of new Set(report.symptoms.filter(s=>typeof s==='string'&&s.trim()&&s!=='__proto__'&&s!=='constructor'&&s!=='prototype')))selfReportedSymptoms.bySymptom[symptom]=(Object.hasOwn(selfReportedSymptoms.bySymptom,symptom)?selfReportedSymptoms.bySymptom[symptom]:0)+1;
  return {scheduled:scheduled.length,completed:done.size,rate:scheduled.length?done.size/scheduled.length:null,unmatchedCompletions,symptomReports,selfReportedSymptoms,interpretation:'完成率以已到时间的计划机会为分母；感受变化来自用户自述，不能据此推断行动疗效。'};
}
export function dueMedications(meds = [], now, acknowledged = [], {timeZone=DEFAULT_ZONE,windowMinutes=5} = {}) {
  const local=localParts(now,timeZone);
  const window=Number.isFinite(windowMinutes)?Math.min(5,Math.max(0,windowMinutes)):5;
  const output=[],seen=new Set();
  for(const med of meds) {
    if(!med||med.enabled!==true||typeof med.id!=='string'||!med.id||typeof med.name!=='string'||!med.name.trim()||!Array.isArray(med.times))continue;
    for(const time of med.times) {
      if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))continue;
      const [hour,minute]=time.split(':').map(Number);
      let age=(local.hour*60+local.minute-hour*60-minute)*60000+local.second*1000+(local.ms%1000);
      if(age<0)age+=86400000; // The preceding day's 23:59 can be due just after midnight.
      if(age<0||age>window*60000)continue;
      const scheduledAt=new Date(local.ms-age).toISOString(),key=`${med.id}:${localParts(scheduledAt,timeZone).date}:${time}`;
      if(seen.has(key))continue;seen.add(key);
      const acknowledgedOccurrence=acknowledged.some(ack=>ack&&ack.medicationId===med.id&&millis(ack.scheduledAt)===millis(scheduledAt)&&['taken','skipped','snoozed'].includes(ack.status)&&Number.isFinite(millis(ack.at))&&millis(ack.at)<=local.ms);
      if(!acknowledgedOccurrence)output.push({id:key,key,medicationId:med.id,name:med.name,scheduledAt,time,note:typeof med.note==='string'?med.note:''});
    }
  }
  return output;
}
