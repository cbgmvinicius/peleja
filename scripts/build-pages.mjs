import {readFile, mkdir, copyFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context={};vm.runInNewContext(await readFile(path.join(root,'supabase-config.js'),'utf8'),context);
const cfg=context.PELEJA_BACKEND || {};
const key=String(cfg.supabasePublishableKey||'');
let publicKey=key.startsWith('sb_publishable_');
if (key.split('.').length===3) {
  try { publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon'; } catch {}
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.supabaseUrl||'') || !publicKey) {
  throw new Error('Publicação bloqueada: configure a URL e uma chave pública publishable/anon. Chaves administrativas nunca são aceitas.');
}
const dest=path.join(root,'dist','public');
await mkdir(path.dirname(dest),{recursive:true});
await mkdir(dest); // Refuse reuse: no unrelated/private file can remain in the artifact.
const files=['index.html','styles.css','app.js','cloud.js','storage.js','ui.js','sw.js','supabase-config.js','academic-data.js','academic-data.json','manifest.webmanifest'];
await mkdir(path.join(dest,'assets'));
for (const name of ['peleja-icon-16.png','peleja-icon-32.png','peleja-icon-192.png','peleja-icon-512.png']) files.push('assets/'+name);
for (const name of files) await copyFile(path.join(root,name),path.join(dest,name));
await writeFile(path.join(dest,'.nojekyll'),'');
await writeFile(path.join(dest,'release.json'),JSON.stringify({version:'25.0.0',commit:process.env.GITHUB_SHA||'local',builtAt:new Date().toISOString()},null,2));
console.log(`Interface preparada: ${dest}. Somente arquivos públicos selecionados foram incluídos.`);
