import {cp,copyFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const at=p=>fileURLToPath(new URL('../'+p,import.meta.url));
await mkdir(at('dist/pages'),{recursive:true});
await cp(at('dist/client'),at('dist/pages'),{recursive:true});
await copyFile(at('pages/worker.mjs'),at('dist/pages/_worker.js'));
await writeFile(at('dist/pages/_routes.json'),JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
console.log('Pages UI bundle and service-binding gateway prepared; no model secrets copied.');
