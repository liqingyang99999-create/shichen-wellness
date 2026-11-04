/** Only a versioned APK served from this application's download directory is trusted. */
export function parseRelease(value, origin) {
  if (!value || !Number.isSafeInteger(value.versionCode) || value.versionCode < 1 ||
      !/^\d+\.\d+\.\d+-preview$/.test(value.versionName || '')) throw Error('更新信息格式不正确，请稍后重试。');
  const url = new URL(value.apkUrl, origin);
  if (url.origin !== new URL(origin).origin || url.pathname !== `/download/shichen-wellness-${value.versionName}.apk` || url.search || url.hash || url.username || url.password) throw Error('下载地址校验失败，请稍后重试。');
  if (!/^[a-f0-9]{64}$/i.test(value.sha256 || '') || !Number.isSafeInteger(value.size) || value.size <= 0) throw Error('安装包信息不完整，请稍后重试。');
  return { versionCode: value.versionCode, versionName: value.versionName, apkUrl: url.href,
    sha256: value.sha256, size: value.size, publishedAt: String(value.publishedAt || '').slice(0, 10),
    notes: Array.isArray(value.notes) ? value.notes.filter(x => typeof x === 'string').slice(0, 8).map(x => x.slice(0, 180)) : [] };
}

export function compareRelease(release, installed) {
  if (Number.isSafeInteger(installed?.versionCode)) return Math.sign(release.versionCode - installed.versionCode);
  // Old shells did not expose a build number. Only compare recognized semantic versions.
  const parts = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-preview)?$/.exec(installed?.appVersion || '');
  if (!parts) return null;
  const next = release.versionName.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) { const diff = next[i] - Number(parts[i + 1]); if (diff) return Math.sign(diff); }
  return 0;
}
