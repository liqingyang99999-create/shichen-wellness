const validTime=value=>Number.isFinite(value)&&value>0;
export function reminderSystemStatus(raw){
  const known=raw&&typeof raw==='object';
  const granted=raw?.permission==='granted';
  const disabledChannels=[['card','日常'],['medicine','用药'],['silent','静音']].filter(([key])=>raw?.channels?.[key]===false).map(([,label])=>label);
  const notification=!known?'正在读取':raw.permission==='denied'?'待开启通知权限':!granted?'尚未授权':raw.canNotify===false||raw.channelsEnabled===false?'通知频道待开启':disabledChannels.length?'部分通知频道关闭':raw.canNotify===true?'已允许':'已授权 · 频道待核对';
  const count=Number.isInteger(raw?.scheduled)&&raw.scheduled>=0?raw.scheduled:null;
  const schedule=count===null?'尚未读取日程':count===0?'尚未登记日程':`已登记 ${count} 个提醒`;
  const mode=raw?.scheduleMode==='exact'?'准点权限已开启':raw?.scheduleMode==='inexact'?'系统弹性提醒，可能延迟':'';
  const battery=raw?.backgroundRestricted===true?'后台运行受限制':raw?.batterySaver===true?'当前开启省电模式':raw?.batteryOptimizationIgnored===true?'已允许不受电池优化限制':raw?.batteryOptimizationIgnored===false?'使用系统电池优化':'尚未读取';
  return {notification,channelNote:disabledChannels.length?`${disabledChannels.join('、')}频道未开启`:'',schedule,battery,mode,count,nextAt:validTime(raw?.nextAt)?raw.nextAt:null,backgroundSupported:raw?.backgroundSupported===true,exactPermission:raw?.exactPermission||'unknown',showExactSettings:raw?.exactPermission==='denied'};
}
