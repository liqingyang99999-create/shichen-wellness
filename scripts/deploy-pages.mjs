import {cp,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Isolate Pages from Vite's Worker deploy redirect in the parent .wrangler folder.
// Only public assets and the service-binding config enter this staging folder.
const stage=await mkdtemp(join(tmpdir(),'shichen-pages-'));
const config=JSON.parse(await readFile(join(root,'pages/wrangler.jsonc'),'utf8'));
delete config.$schema;
config.pages_build_output_dir='./public';
await cp(join(root,'dist/pages'),join(stage,'public'),{recursive:true});
await writeFile(join(stage,'wrangler.jsonc'),JSON.stringify(config,null,2));
console.log('Prepared isolated Pages deployment:',stage);
const child=spawn(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'pages','deploy','public','--project-name',config.name,'--branch','main'],{cwd:stage,stdio:'inherit',env:process.env});
child.on('error',()=>{console.error('Could not launch Wrangler.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
