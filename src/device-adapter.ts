import type {Vitals} from './model';
// Future signed native shell implements this interface. A web page never claims
// health permissions are granted merely because notifications/location work.
export type HealthPermission='heartRate'|'hrv'|'sleep'|'steps';
export interface HealthAdapter{getStatus():Promise<{connected:boolean;permissions:Partial<Record<HealthPermission,boolean>>}>;requestPermissions(scopes:HealthPermission[]):Promise<void>;readLatest():Promise<Vitals>;}
declare global{interface Window{ShichenHealthAdapter?:HealthAdapter;}}
export const healthScopes:[HealthPermission,string,string][]=[['heartRate','心率','用于心率变化与主诉交叉核对'],['hrv','心率变异性','用于个人恢复趋势，不直接诊断压力'],['sleep','睡眠记录','总时长、分期和夜间心率'],['steps','当日步数','用于调整活动强度']];
export const getHealthAdapter=()=>window.ShichenHealthAdapter||null;
