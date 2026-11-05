import {copyFile,writeFile} from 'node:fs/promises';
await copyFile(new URL('../pages/worker.mjs',import.meta.url),new URL('../dist/_worker.js',import.meta.url));
await writeFile(new URL('../dist/_routes.json',import.meta.url),JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
console.log('Pages assets and API service binding prepared.');
