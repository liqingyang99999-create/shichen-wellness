import {cp,copyFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {relative,isAbsolute} from 'node:path';
import {prepareReleaseAssets} from './release-assets.mjs';
const at=p=>fileURLToPath(new URL('../'+p,import.meta.url));
await prepareReleaseAssets(at('dist/client'));
// Remove only this project's resolved Pages build folder; stale assets must not survive.
const target=at('dist/pages');
const child=relative(at('dist'),target);
if(!child||child.startsWith('..')||isAbsolute(child))throw Error('Unsafe Pages build path.');
await rm(target,{recursive:true,force:true});
await mkdir(at('dist/pages'),{recursive:true});
await cp(at('dist/client'),at('dist/pages'),{recursive:true});
await copyFile(at('pages/worker.mjs'),at('dist/pages/_worker.js'));
await writeFile(at('dist/pages/_routes.json'),JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
console.log('Pages UI bundle and service-binding gateway prepared; no model secrets copied.');
