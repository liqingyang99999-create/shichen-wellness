export function applySimulationTime(field,onTime){
  const value=String(field?.value||'');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('请填写完整、有效的模拟日期和时间。');
  const stamp=Date.parse(`${value}:00+08:00`);
  if(!Number.isFinite(stamp)||new Date(stamp+8*3600000).toISOString().slice(0,16)!==value)throw Error('请填写完整、有效的模拟日期和时间。');
  const result=new Date(stamp).toISOString();
  onTime(result);
  return result;
}
