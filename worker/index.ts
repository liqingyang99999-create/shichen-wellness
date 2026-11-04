import { handleApi } from '../server/http.mjs';

interface Env {
  ASSETS: Fetcher;
  DEMO_RATE_LIMITER?: {limit(options: {key:string}):Promise<{success:boolean}>};
  LLM_API_KEY?: string;
  AGENT_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // A shared demonstration budget at each Cloudflare location, not a billing cap.
      if (request.method === 'POST' && ['/api/run','/api/parse','/api/agent/card','/api/mobile/card'].includes(url.pathname)) {
        if (!env.DEMO_RATE_LIMITER) return Response.json({error:'演示请求限制未配置，请联系维护者。'}, {status:503});
        const {success} = await env.DEMO_RATE_LIMITER.limit({key:'shichen-demo-model-requests'});
        if (!success) return Response.json({error:'当前演示请求较多，请稍后再试。'}, {status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
      }
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
