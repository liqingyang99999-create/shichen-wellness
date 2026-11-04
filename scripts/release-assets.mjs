import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseRelease } from '../lib/releases.mjs';

// A cached old download page may still use the unversioned APK alias. Keep it
// byte-for-byte identical to the manifest's version, never to a previous build.
export async function prepareReleaseAssets(clientRoot, { requireApk = false } = {}) {
  const downloads = join(clientRoot, 'download');
  const metadata = JSON.parse(await readFile(join(downloads, 'latest.json'), 'utf8'));
  const release = parseRelease(metadata, 'https://shichen-wellness.pages.dev');
  const html = await readFile(join(downloads, 'index.html'), 'utf8');
  if (!html.includes(`href="${metadata.apkUrl}"`) || !html.includes(`版本 ${release.versionName}`)) {
    throw Error('Download page and release manifest versions do not match.');
  }
  const apkPath = join(downloads, `shichen-wellness-${release.versionName}.apk`);
  let bytes;
  try { bytes = await readFile(apkPath); }
  catch (error) {
    if (error.code !== 'ENOENT' || requireApk) throw error;
    // Source-only CI does not have private-signed APK artifacts. Deployment is stricter.
    return { version: release.versionName, apkPresent: false };
  }
  if (bytes.length !== release.size || createHash('sha256').update(bytes).digest('hex') !== release.sha256) {
    throw Error('APK bytes do not match the release manifest.');
  }
  await copyFile(apkPath, join(downloads, 'shichen-wellness-preview.apk'));
  const versionedPage = join(downloads, release.versionName);
  await mkdir(versionedPage, { recursive: true });
  await writeFile(join(versionedPage, 'index.html'), html);
  return { version: release.versionName, apkPresent: true };
}
