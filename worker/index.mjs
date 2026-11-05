import {handleCareAi} from '../server/care-ai.mjs';
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/care-ai'||path==='/api/care-ai/status')return handleCareAi(request,env);
  if(path.startsWith('/api/'))return Response.json({error:'接口不存在。'},{status:404});
  return env.ASSETS.fetch(request);
}};
