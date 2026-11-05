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
for (const name of ['peleja-icon-16.png','peleja-icon-32.png','peleja-icon-192.png','peleja-icon-512.png','peleja-icon-maskable-192.png','peleja-icon-maskable-512.png','apple-touch-icon.png','peleja-logo.svg','anking.png']) files.push('assets/'+name);
for (const name of files) await copyFile(path.join(root,name),path.join(dest,name));
// Connected release. Explicit manifest keeps development snapshots out of Pages.
const nextFiles=JSON.parse(await readFile(path.join(root,'scripts/next-public-files.json'),'utf8'));
for(const name of nextFiles){
 if(name.includes('..')||path.isAbsolute(name))throw new Error('Invalid public path');
 const target=path.join(dest,'next',name);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,'next',name),target);
}
await writeFile(path.join(dest,'index.html'),`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Peleja</title><link rel="icon" type="image/png" href="assets/peleja-icon-32.png"></head><body><p>Abrindo Peleja…</p><script>location.replace(new URL('next/access/',location.href).href+location.search+location.hash);</script><noscript>Ative o JavaScript para abrir o Peleja.</noscript></body></html>`);
// Retires the old app's service worker: clears its caches, unregisters itself and reloads the tabs it
// controlled, so browsers stuck on a cached old Peleja (e.g. Samsung Internet) land on the current one.
await writeFile(path.join(dest,'sw.js'),`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('peleja-'))await caches.delete(key);await self.clients.claim();const tabs=await self.clients.matchAll({type:'window'});await self.registration.unregister();for(const tab of tabs)tab.navigate(tab.url).catch(()=>{});})()));`);
await writeFile(path.join(dest,'.nojekyll'),'');
// Cache-proof release: GitHub Pages lets browsers keep files for 10 minutes, so every local script and
// stylesheet reference gets a content hash (?v=…) and every page carries the release it belongs to;
// next/release-check.js compares it with release.json and reloads into the new version.
const commit=process.env.GITHUB_SHA||'local';
await stampVersions(path.join(dest,'next'),commit);
await writeFile(path.join(dest,'release.json'),JSON.stringify({version:'26.0.0',commit,builtAt:new Date().toISOString()},null,2));
console.log(`Interface preparada: ${dest}. Somente arquivos públicos selecionados foram incluídos.`);

async function stampVersions(base,release){
 const {readdir}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat();
 const files=await walk(base),hashes=new Map();
 const hash=async file=>{if(!hashes.has(file)){try{hashes.set(file,createHash('sha256').update(await readFile(file)).digest('hex').slice(0,12));}catch{hashes.set(file,null);}}return hashes.get(file);};
 // Local .js/.css/.json reference (optionally already versioned), resolved from the file that names it.
 const ref=/(["'])((?!https?:|\/\/|data:)[^"'?#\s]+?\.(?:js|css|json))(\?v=[^"'#]*)?\1/g;
 const stamp=async(file,text,onlyVersioned)=>{
  let out='',last=0;
  for(const m of text.matchAll(ref)){
   const [whole,quote,target,version]=m;if(onlyVersioned&&!version)continue;
   const h=await hash(path.resolve(path.dirname(file),target));if(!h)continue;
   out+=text.slice(last,m.index)+quote+target+'?v='+h+quote;last=m.index+whole.length;
  }
  return out+text.slice(last);
 };
 // Scripts first, until stable: stamping a script changes its own content and therefore its hash.
 for(let pass=0;pass<6;pass++){
  let changed=false;hashes.clear();
  for(const file of files.filter(f=>f.endsWith('.js'))){const text=await readFile(file,'utf8'),next=await stamp(file,text,true);if(next!==text){await writeFile(file,next);changed=true;}}
  if(!changed)break;if(pass===5)throw new Error('Versões dos scripts não estabilizaram.');
 }
 hashes.clear();
 for(const file of files.filter(f=>f.endsWith('.html'))){
  let text=await stamp(file,await readFile(file,'utf8'),false);
  text=text.replace(/<meta name="peleja-release"[^>]*>/,'').replace(/<head>/i,`<head><meta name="peleja-release" content="${release}">`);
  await writeFile(file,text);
 }
}
