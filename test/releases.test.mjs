import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRelease, compareRelease } from '../lib/releases.mjs';
const origin='https://shichen-wellness.pages.dev';
const release={versionCode:4,versionName:'0.4.0-preview',apkUrl:'/download/shichen-wellness-0.4.0-preview.apk',sha256:'a'.repeat(64),size:3200000,notes:['语音输入']};
test('release supports trusted same-origin APK and version checks for old and new shells',()=>{
  const next=parseRelease(release,origin);
  assert.equal(next.apkUrl,origin+release.apkUrl);
  assert.equal(compareRelease(next,{versionCode:3}),1);
  assert.equal(compareRelease(next,{appVersion:'0.3.0-preview'}),1);
  assert.equal(compareRelease(next,{versionCode:4}),0);
  assert.equal(compareRelease(next,{appVersion:'0.5.0-preview'}),-1);
  assert.equal(compareRelease(next,{}),null);
});
test('release rejects foreign, redirect-shaped, unrelated and mismatched downloads',()=>{
  for(const apkUrl of ['https://evil.invalid/download/shichen-wellness-0.4.0-preview.apk','//evil.invalid/x.apk','javascript:alert(1)','/api/download.apk','/download/shichen-wellness-0.3.0-preview.apk',release.apkUrl+'?redirect=https://evil.invalid',release.apkUrl+'#fake']){
    assert.throws(()=>parseRelease({...release,apkUrl},origin));
  }
  for(const patch of [{sha256:''},{size:-1},{versionCode:NaN},{versionName:'latest'}])assert.throws(()=>parseRelease({...release,...patch},origin));
});
