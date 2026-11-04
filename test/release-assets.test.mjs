import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {prepareReleaseAssets} from '../scripts/release-assets.mjs';

async function fixture(t, {missing=false,badHash=false,badHtml=false}={}) {
  const root=await mkdtemp(join(tmpdir(),'shichen-release-test-'));
  t.after(async()=>{const child=relative(tmpdir(),root);if(child&&!child.startsWith('..')&&!isAbsolute(child))await rm(root,{recursive:true,force:true});});
  const dir=join(root,'download');await mkdir(dir);
  const bytes=Buffer.from('test-only-new-installation-bytes');
  const release={versionCode:5,versionName:'0.5.0-preview',apkUrl:'/download/shichen-wellness-0.5.0-preview.apk',size:bytes.length,sha256:badHash?'a'.repeat(64):createHash('sha256').update(bytes).digest('hex')};
  await writeFile(join(dir,'latest.json'),JSON.stringify(release));
  await writeFile(join(dir,'index.html'),badHtml?'版本 0.2.0-preview':`版本 ${release.versionName}<a href="${release.apkUrl}">下载</a>`);
  await writeFile(join(dir,'shichen-wellness-preview.apk'),'old-alias-bytes');
  if(!missing)await writeFile(join(dir,'shichen-wellness-0.5.0-preview.apk'),bytes);
  return {root,dir,bytes};
}
test('release preparation refreshes legacy APK alias and produces a fresh versioned landing page',async t=>{
  const {root,dir,bytes}=await fixture(t);
  assert.deepEqual(await prepareReleaseAssets(root,{requireApk:true}),{version:'0.5.0-preview',apkPresent:true});
  assert.deepEqual(await readFile(join(dir,'shichen-wellness-preview.apk')),bytes);
  assert.deepEqual(await readFile(join(dir,'0.5.0-preview/index.html')),await readFile(join(dir,'index.html')));
});
test('source-only builds tolerate absent APKs but deployments reject them',async t=>{
  const {root}=await fixture(t,{missing:true});
  assert.equal((await prepareReleaseAssets(root)).apkPresent,false);
  await assert.rejects(prepareReleaseAssets(root,{requireApk:true}),{code:'ENOENT'});
});
test('incorrect APK hash cannot overwrite the legacy alias',async t=>{
  const {root,dir}=await fixture(t,{badHash:true});
  await assert.rejects(prepareReleaseAssets(root,{requireApk:true}),/APK bytes/);
  assert.equal(await readFile(join(dir,'shichen-wellness-preview.apk'),'utf8'),'old-alias-bytes');
});
test('stale download HTML cannot ship with a newer manifest',async t=>{
  const {root}=await fixture(t,{badHtml:true});
  await assert.rejects(prepareReleaseAssets(root),/versions do not match/);
});
