import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../pages/worker.mjs';

test('Pages routes API calls through service binding with body and origin intact',async()=>{
  const request=new Request('https://example.pages.dev/api/run',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.pages.dev'},body:JSON.stringify({mode:'preview'})});
  let seen;
  const response=await gateway.fetch(request,{SHICHEN_API:{fetch:async r=>{seen={url:r.url,origin:r.headers.get('Origin'),body:await r.json()};return Response.json({providerMode:'live'});}},ASSETS:{fetch:()=>{throw Error('API must not be treated as an asset');}}});
  assert.equal(response.status,200);
  assert.deepEqual(seen,{url:'https://example.pages.dev/api/run',origin:'https://example.pages.dev',body:{mode:'preview'}});
});
test('Pages fails closed for missing backend and delegates non-API files only to assets',async()=>{
  assert.equal((await gateway.fetch(new Request('https://example.pages.dev/api/run'),{})).status,503);
  const response=await gateway.fetch(new Request('https://example.pages.dev/?mode=daily'),{ASSETS:{fetch:async()=>new Response('UI')},SHICHEN_API:{fetch:()=>{throw Error('Unexpected API');}}});
  assert.equal(await response.text(),'UI');
});
