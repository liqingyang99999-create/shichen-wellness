export type Profile={name:string;age:number;height:number;weight:number;conditions:string[];constitution:any;assessmentMode:string;assessedAt:string;fluidRestricted?:boolean;limitedMobility?:boolean;allergies?:string};
export type BP={id:string;systolic:number;diastolic:number;pulse?:number;measuredAt:string;isMorning:boolean};
export type Card={id:string;title:string;category:string;actionFamily:string;durationSeconds:number;steps:string[];why:string;scene:string;sourceIds:string[];[key:string]:any};
export type Vitals={source:'simulation'|'device'|'unavailable';measuredAt:string;heartRate?:number;baselineHeartRate?:number;hrv?:number;baselineHrv?:number;stress?:number;sleepHours?:number;steps?:number;asleep?:boolean;quality:'good'|'poor';durationMinutes?:number;sleepStages?:{deep:number;light:number;rem:number;awake:number};nightHeartRate?:number};
export type Weather={temperature:number;drop24h:number;city:string;description:string;measuredAt:string;source:'open-meteo'|'simulation';minTemperature?:number};
export type Notice={id:string;title:string;body:string;at:string;kind:'card'|'medicine'|'confirm'|'emergency';read?:boolean;medicationId?:string;scheduledAt?:string;card?:Card;reason?:string};
export type Store={activeSafety:{decision:any;text:string}|null;profile:Profile|null;bp:BP[];medications:any[];acknowledged:any[];completions:any[];opportunities:any[];symptoms:any[];recentCards:any[];notices:Notice[];notificationEnabled:boolean;weather:Weather|null;routineTimes:string[];reminderConfig?:{mode:string;intervalHours:number;start:string;end:string;customTimes:string[]};remindersPaused?:boolean;nightMedicationSilent?:boolean;reminderAttempts:string[]};
export const conditions=[['hypertension','高血压'],['coronary','冠心病'],['diabetes','糖尿病'],['obesity','肥胖'],['heart_failure','慢性心力衰竭']];
export const emptyStore=():Store=>({activeSafety:null,profile:null,bp:[],medications:[],acknowledged:[],completions:[],opportunities:[],symptoms:[],recentCards:[],notices:[],notificationEnabled:false,weather:null,routineTimes:['07:30','12:00','19:00'],reminderAttempts:[]});
export function readStore(key:string):Store{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v?.version===1?{...emptyStore(),...v.data}:emptyStore();}catch{return emptyStore();}}
export const uid=()=>crypto.randomUUID();
export const localStamp=(date:Date|string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(date));
export const dayKey=(date:Date|string)=>localStamp(date).slice(0,10);
export const clockLabel=(date:Date|string)=>localStamp(date).slice(11,16);
export const dateInput=(date:Date|string)=>localStamp(date).slice(0,16).replace(' ','T');
export const fromDateInput=(str:string)=>new Date(str+':00+08:00').toISOString();
export function defaultVitals(now:string):Vitals{return {source:'simulation',measuredAt:now,heartRate:72,baselineHeartRate:70,hrv:42,baselineHrv:44,stress:28,sleepHours:7.2,nightHeartRate:59,steps:3260,asleep:false,quality:'good',durationMinutes:10,sleepStages:{deep:1.4,light:3.8,rem:2,awake:.3}};}
export const unknownVitals=(now:string):Vitals=>({source:'unavailable',measuredAt:now,quality:'poor'});
