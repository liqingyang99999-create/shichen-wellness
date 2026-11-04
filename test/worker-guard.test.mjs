import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Execute the actual Worker without starting Vite, installing tools, or contacting
// Cloudflare. Strip types only; preserve the production request handling logic.
const source = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8');
const linked = stripTypeScriptTypes(source).replace("'../server/http.mjs'", JSON.stringify(new URL('../server/http.mjs', import.meta.url).href));
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`);
const paths = ['/api/run', '/api/parse', '/api/agent/card'];
const request = path => new Request(`https://unit.invalid${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"snapshot":{}}' });

test('Worker fails closed for every model POST when rate limiter binding is absent', async () => {
  let modelCalls = 0;
  const env = { LLM_API_KEY: 'in-memory-test', LLM_MODEL: 'in-memory-test', FETCH: async () => { modelCalls++; throw Error('must not call'); } };
  for (const path of paths) assert.equal((await worker.fetch(request(path), env)).status, 503, path);
  assert.equal(modelCalls, 0);
});

test('Worker rejects a denied shared rate limit before any model call', async () => {
  let modelCalls = 0;
  const keys = [];
  const env = {
    LLM_API_KEY: 'in-memory-test', LLM_MODEL: 'in-memory-test',
    FETCH: async () => { modelCalls++; throw Error('must not call'); },
    DEMO_RATE_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: false }; } }
  };
  for (const path of paths) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 429, path); assert.equal(response.headers.get('Retry-After'), '60');
  }
  assert.equal(keys.length, paths.length); assert.equal(new Set(keys).size, 1); assert.equal(modelCalls, 0);
});
