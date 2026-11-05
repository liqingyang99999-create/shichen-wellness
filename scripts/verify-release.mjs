import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),data=JSON.parse(await readFile(new URL('public/download/latest.json',root),'utf8'));
if(data.versionName!=='1.0.0'||data.versionCode!==10||data.apkUrl!=='/download/shichen-wellness-1.0.0.apk')throw Error('Unexpected release version.');
const strict=process.argv.includes('--require-apk');let present=0;
for(const name of ['shichen-wellness-1.0.0.apk','shichen-wellness-1.0.0-preview.apk','shichen-wellness-preview.apk']){
 let bytes;try{bytes=await readFile(new URL('public/download/'+name,root));}catch(error){if(error.code==='ENOENT'&&!strict)continue;throw error;}
 if(bytes.length!==data.size||createHash('sha256').update(bytes).digest('hex')!==data.sha256)throw Error('Release APK mismatch: '+name);present++;
}
const html=await readFile(new URL('public/download/index.html',root),'utf8');if(!html.includes(data.apkUrl))throw Error('Download URL mismatch.');
const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));if(pkg.version!==data.versionName)throw Error('Package version mismatch.');
console.log(JSON.stringify({version:data.versionName,versionCode:data.versionCode,verifiedApkAliases:present,sourceOnly:present===0}));
