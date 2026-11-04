// Pages serves the UI and calls our existing Worker via an account-scoped
// service binding. Browsers never need to contact workers.dev for API calls.
const unavailable = () => Response.json({error:'服务连接暂时不可用，请稍后重试。'},{status:503});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!env.SHICHEN_API?.fetch) return unavailable();
      try { return await env.SHICHEN_API.fetch(request); }
      catch { return unavailable(); }
    }
    if (!env.ASSETS?.fetch) return unavailable();
    return env.ASSETS.fetch(request);
  }
};
