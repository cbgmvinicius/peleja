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
const files=['index.html','styles.css','courses-data.js','courses.js','english.js','english-data.js','progress.js','app.js','cloud.js','storage.js','ui.js','appearance.js','focus.js','questions.js','sw.js','supabase-config.js','academic-data.js','academic-data.json','manifest.webmanifest'];
await mkdir(path.join(dest,'assets'));
await mkdir(path.join(dest,'assets/fonts'));
for (const name of ['GoogleSans-latin.woff2','OFL.txt','SOURCE.md']) files.push('assets/fonts/'+name);
for (const name of ['peleja-icon-16.png','peleja-icon-32.png','peleja-icon-192.png','peleja-icon-512.png','anking.png']) files.push('assets/'+name);
for (const name of files) await copyFile(path.join(root,name),path.join(dest,name));
// Connected release. Explicit manifest keeps development snapshots out of Pages.
const nextFiles=JSON.parse(await readFile(path.join(root,'scripts/next-public-files.json'),'utf8'));
for(const name of nextFiles){
 if(name.includes('..')||path.isAbsolute(name))throw new Error('Invalid public path');
 const target=path.join(dest,'next',name);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,'next',name),target);
}
await writeFile(path.join(dest,'index.html'),`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Peleja</title></head><body><p>Abrindo Peleja…</p><script>location.replace(new URL('next/access/',location.href).href+location.search+location.hash);</script><noscript>Ative o JavaScript para abrir o Peleja.</noscript></body></html>`);
await writeFile(path.join(dest,'sw.js'),`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('peleja-'))await caches.delete(key);await self.clients.claim();})()));`);
await writeFile(path.join(dest,'.nojekyll'),'');
await writeFile(path.join(dest,'release.json'),JSON.stringify({version:'26.0.0',commit:process.env.GITHUB_SHA||'local',builtAt:new Date().toISOString()},null,2));
console.log(`Interface preparada: ${dest}. Somente arquivos públicos selecionados foram incluídos.`);
