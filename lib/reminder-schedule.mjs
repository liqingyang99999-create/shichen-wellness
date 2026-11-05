export const MAX_ROUTINE_REMINDERS=18;
export const DEFAULT_REMINDER_CONFIG=Object.freeze({mode:'daily',intervalHours:2,start:'07:00',end:'21:00',customTimes:[]});
const presets={daily:['07:30','12:00','19:00'],shichen:['07:00','09:00','11:00','15:00','17:00','19:00']};
export function minuteOfDay(time){return typeof time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?Number(time.slice(0,2))*60+Number(time.slice(3)):null;}
const timeAt=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export function isQuietTime(time){const minute=minuteOfDay(time);return minute===null||minute<300||minute>=1380;}
export function parseCustomTimes(value){const times=Array.isArray(value)?value:typeof value==='string'?value.trim().split(/[，,、\s]+/u).filter(Boolean):[];if(times.some(time=>minuteOfDay(time)===null))throw Error('请填写完整时间，例如 08:00、12:30、19:00。');return [...new Set(times)].sort();}
export function buildRoutineTimes(config={}){
  const c={...DEFAULT_REMINDER_CONFIG,...config},start=minuteOfDay(c.start),end=minuteOfDay(c.end);
  if(start===null||end===null||start<300||end>1380||start>=end)throw Error('日间起止需在05:00—23:00之间，结束时间应晚于开始时间。');
  let times;
  if(c.mode==='interval'){
    if(![1,2,3,4].includes(Number(c.intervalHours)))throw Error('间隔请选择1、2、3或4小时。');
    times=[];for(let minute=start;minute<=end&&minute<1380;minute+=Number(c.intervalHours)*60)times.push(timeAt(minute));
  }else if(c.mode==='custom'){
    times=parseCustomTimes(c.customTimes);
    if(times.some(time=>minuteOfDay(time)<start||minuteOfDay(time)>end||isQuietTime(time)))throw Error('自定义时点需落在所设日间范围内；23:00—05:00保持静默。');
  }else if(presets[c.mode])times=presets[c.mode].filter(time=>minuteOfDay(time)>=start&&minuteOfDay(time)<=end&&!isQuietTime(time));
  else throw Error('请选择有效的提醒节律。');
  if(!times.length)throw Error('这个日间范围没有提醒时点，请调整时间。');
  if(times.length>MAX_ROUTINE_REMINDERS)throw Error('每天普通提醒最多18个时点，请减少数量或延长间隔。');
  return times;
}
export function readReminderConfig(config,legacyTimes){
  if(config){try{buildRoutineTimes(config);return {...DEFAULT_REMINDER_CONFIG,...config};}catch{/* Migrate invalid data conservatively. */}}
  const valid=Array.isArray(legacyTimes)?[...new Set(legacyTimes.filter(time=>minuteOfDay(time)!==null&&!isQuietTime(time)))].sort().slice(0,MAX_ROUTINE_REMINDERS):[];
  if(valid.length&&JSON.stringify(valid)!==JSON.stringify(presets.daily))return {...DEFAULT_REMINDER_CONFIG,mode:JSON.stringify(valid)===JSON.stringify(presets.shichen)?'shichen':'custom',start:'05:00',end:'23:00',customTimes:valid};
  return {...DEFAULT_REMINDER_CONFIG,customTimes:[]};
}
export function buildNativeReminderPayload(store,mode='personal'){
  if(!['personal','competition'].includes(mode))throw Error('提醒模式无效。');
  const config=readReminderConfig(store.reminderConfig,store.routineTimes),times=buildRoutineTimes(config);
  const reminders=times.map(time=>({id:`routine-${time.replace(':','')}`,kind:'card',time,enabled:true}));
  for(const medication of Array.isArray(store.medications)?store.medications:[]){
    if(medication.enabled!==true||typeof medication.id!=='string')continue;
    for(const time of [...new Set(Array.isArray(medication.times)?medication.times:[])])if(minuteOfDay(time)!==null)reminders.push({id:`medicine-${medication.id}-${time.replace(':','')}`,kind:'medicine',time,enabled:true});
  }
  return {mode,enabled:store.notificationEnabled===true&&store.remindersPaused!==true,quietHours:{start:'23:00',end:'05:00'},nightMedicationSilent:store.nightMedicationSilent===true,reminders};
}
/** @param {{time:string,day:string,times:string[],attempts?:string[],paused?:boolean,asleep?:boolean}} options */
export function routineAttemptDue({time,day,times,attempts=[],paused=false,asleep=false}){
  if(paused||asleep||isQuietTime(time)||!times.includes(time))return null;
  const id=`routine-${day}-${time}`;
  if(attempts.includes(id)||attempts.filter(value=>value.startsWith(`routine-${day}-`)).length>=MAX_ROUTINE_REMINDERS)return null;
  return id;
}
export function nativeNoticeRecords(status,mode,now=Date.now()){
  return (Array.isArray(status?.recent)?status.recent:[]).slice(-30).filter(item=>item&&item.mode===mode&&['card','medicine','test'].includes(item.kind)&&typeof item.id==='string'&&item.id.length<=160&&Number.isFinite(item.at)&&item.at>0&&item.at<=now+60000).map(item=>{
    const isTest=item.test===true||item.kind==='test';
    return {id:isTest?item.id:`native-${item.id}-${item.at}`,title:isTest?'时辰心管家 · 测试通知':item.kind==='medicine'?'你设置的用药时间到了':'日常提醒已到时',body:isTest?'这是你主动发起的测试通知。':item.kind==='medicine'?'这是一条系统用药提醒记录，请到“用药时间”核对原来的安排；它不表示已经服药。':'系统已提交本地提醒，打开首页后会按当前情况重新判断。',at:new Date(item.at).toISOString(),kind:item.kind==='medicine'&&!isTest?'medicine':'card',read:false};
  });
}
