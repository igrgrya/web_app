import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),assets={};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.xml':'application/xml; charset=utf-8','.xsl':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'};
function collect(dir,prefix=''){for(const item of readdirSync(dir,{withFileTypes:true})){const full=join(dir,item.name),key=prefix+'/'+item.name;if(item.isDirectory())collect(full,key);else assets[key]={type:types[extname(item.name)]??'application/octet-stream',body:readFileSync(full).toString('base64')};}}
collect(join(root,'public'));
const seed=JSON.parse(readFileSync(join(root,'worker/seed.json'),'utf8')),source=readFileSync(join(root,'worker/index.js'),'utf8');
mkdirSync(join(root,'dist/server'),{recursive:true});mkdirSync(join(root,'dist/.openai'),{recursive:true});
writeFileSync(join(root,'dist/server/index.js'),`const DATA=${JSON.stringify(seed)};\nconst ASSETS=${JSON.stringify(assets)};\n${source}`);
copyFileSync(join(root,'.openai/hosting.json'),join(root,'dist/.openai/hosting.json'));
console.log(`Built ${Object.keys(assets).length} assets and study dataset`);
