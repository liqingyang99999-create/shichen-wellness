import { runWorkflow, parseDialogue } from './engine.mjs';
import catalog from './catalog.json' with { type:'json' };
import { handleWeatherApi } from './weather.mjs';
import { handleAgentApi } from './agent-api.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function handleApi(request,env={}) {
 const url=new URL(request.url);const path=url.pathname;
 if(path.startsWith('/api/agent/'))return handleAgentApi(request,env);
 if(path.startsWith('/api/weather/')){
  if(request.method!=='GET')return json({error:'天气查询请使用GET'},405);
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'不支持跨域请求'},403);
  const result=await handleWeatherApi(url,env);return json(result.body,result.status);
 }
 if(path==='/api/status')return json({configured:!!(env.LLM_API_KEY&&env.LLM_MODEL),model:env.LLM_MODEL||null});
 if(path==='/api/catalog')return json(catalog);
 if(!['/api/run','/api/parse'].includes(path))return json({error:'接口不存在'},404);
 if(request.method!=='POST')return json({error:'请使用POST'},405);
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'不支持跨域请求'},403);
 const raw=await request.text();if(raw.length>100000)return json({error:'输入过长'},413);
 try{const b=JSON.parse(raw);if(path==='/api/parse')return json(await parseDialogue(b.text,b.snapshot,env));return json(await runWorkflow(b,env));}
 catch{return json({error:'输入格式或情境字段无效，请检查后重试。'},400);}
}
