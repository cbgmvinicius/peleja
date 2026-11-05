const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'peleja-public-test-'));
fs.mkdirSync(path.join(temp,'scripts'));fs.copyFileSync(path.join(root,'scripts/build-pages.mjs'),path.join(temp,'scripts/build-pages.mjs'));
fs.copyFileSync(path.join(root,'scripts/next-public-files.json'),path.join(temp,'scripts/next-public-files.json'));fs.cpSync(path.join(root,'next'),path.join(temp,'next'),{recursive:true});
const config=(key,url='https://fixture.supabase.co')=>fs.writeFileSync(path.join(temp,'supabase-config.js'),'globalThis.PELEJA_BACKEND='+JSON.stringify({supabaseUrl:url,supabasePublishableKey:key}));
const run=()=>spawnSync(process.execPath,[path.join(temp,'scripts/build-pages.mjs')],{encoding:'utf8',env:{...process.env,GITHUB_SHA:'testrelease123'}});
config('');assert.notEqual(run().status,0);config('sb_secret_test_not_real');assert.notEqual(run().status,0);
config('sb_publishable_test_not_real');
for(const n of ['index.html','styles.css','courses-data.js','courses.js','english.js','english-data.js','progress.js','app.js','cloud.js','storage.js','ui.js','appearance.js','focus.js','questions.js','sw.js','academic-data.js','academic-data.json','manifest.webmanifest'])fs.copyFileSync(path.join(root,n),path.join(temp,n));
fs.cpSync(path.join(root,'assets'),path.join(temp,'assets'),{recursive:true});
fs.writeFileSync(path.join(temp,'peleja-backup-personal.json'),'PRIVATE TEST FIXTURE');
const built=run();assert.equal(built.status,0,built.stderr);
const dest=path.join(temp,'dist/public');assert(!fs.existsSync(path.join(dest,'peleja-backup-personal.json')));assert(!fs.existsSync(path.join(dest,'scripts')));
assert.equal(JSON.parse(fs.readFileSync(path.join(dest,'release.json'))).version,'26.0.0');assert.notEqual(run().status,0);
// Cache-proof release: content-hashed references and the release stamped into each page.
const crypto=require('node:crypto'),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0,12);
assert.equal(JSON.parse(fs.readFileSync(path.join(dest,'release.json'))).commit,'testrelease123');
for(const page of ['next/directions/index.html','next/access/index.html']){
 const html=fs.readFileSync(path.join(dest,page),'utf8'),dir=path.dirname(path.join(dest,page));
 assert.match(html,/<meta name="peleja-release" content="testrelease123">/);
 const refs=[...html.matchAll(/(?:src|href)="((?!https?:)[^"]+?\.(?:js|css))(\?v=([^"]*))?"/g)];assert.ok(refs.length>5);
 for(const [,file,,v] of refs)assert.equal(v,sha(path.join(dir,file)),page+' '+file);
 assert.match(html,/release-check\.js\?v=[0-9a-f]{12}/);
}
const connected=fs.readFileSync(path.join(dest,'next/directions/connected.js'),'utf8');
const loads=[...connected.matchAll(/'(\.\.\/access\/[^'?]+\.js)\?v=([^']+)'/g)];assert.ok(loads.length>=5);
for(const [,file,v] of loads)assert.equal(v,sha(path.join(dest,'next/directions',file)),'script loaded by connected.js: '+file);
const sw=fs.readFileSync(path.join(dest,'sw.js'),'utf8');new (require('node:vm').Script)(sw);for(const part of ['caches.delete(','self.registration.unregister()','.navigate(tab.url)'])assert.ok(sw.includes(part),'sw.js: '+part);
console.log('PASS Release stamps content hashes on every page and dynamically loaded script, and the commit on each page');
console.log('PASS Release rejects missing/administrative keys, excludes personal files and refuses stale output reuse');
