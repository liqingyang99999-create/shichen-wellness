// Node.js >=22.13.0. Reads caller credentials from the process environment only.
// Usage: node --env-file=.agent-client.env examples/agent-client.mjs [request.json]
import { readFile } from 'node:fs/promises';

try {
  const base = new URL(process.env.AGENT_BASE_URL || 'http://127.0.0.1:5174');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) || base.username || base.password || base.search || base.hash) throw new Error('使用 HTTPS 服务地址；仅本机回环地址可用 HTTP，不要把密钥放在 URL 中。');
  const token = String(process.env.AGENT_API_KEY || '').trim();
  if (!token) throw new Error('请在调用方环境设置 AGENT_API_KEY；不要使用模型供应商密钥。');
  const input = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : { snapshot: {} };
  const response = await fetch(new URL('/api/agent/card', base), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45_000),
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'ShichenWellnessAgentClient/1.0', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`API ${response.status}：${result.error || result.code || '请求失败'}`);
  // Result contains fixed actions, citations and trace summaries; no credentials.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  // Do not print request headers, URLs, environment, or upstream stack traces.
  process.stderr.write(`${error instanceof SyntaxError ? '请求文件不是有效 JSON。' : error.message}\n`);
  process.exitCode = 1;
}
