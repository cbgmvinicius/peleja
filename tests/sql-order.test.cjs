// The files in supabase/ are applied in numeric order. This rebuilds an empty database from them and compares
// every function with supabase/functions.snapshot, so a file that brings an old version back shows up here.
// After changing a function on purpose: node tests/sql-order.test.cjs --update
// To compare production with the repository, run the query at the end of SUPABASE_SETUP.md and diff it with the snapshot.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.join(__dirname,'..','supabase'),snapshot=path.join(dir,'functions.snapshot');
(async()=>{
const files=fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort();
assert.ok(files.length>=27);
files.forEach((n,i)=>assert.match(n,new RegExp('^'+String(i+1).padStart(2,'0')+'-[a-z-]+\\.sql$'),'numbered without gaps or repeats: '+n));
const db=new PGlite();
try{
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
grant usage on schema public,auth to authenticated,anon,service_role;
create function public.rls_auto_enable() returns void language sql as $$select$$;`); // Supabase creates this one itself
for(const n of files){try{await db.exec(fs.readFileSync(path.join(dir,n),'utf8').replace(/^﻿/,''));}catch(e){throw Error(n+': '+e.message);}}
const built=(await db.query(`select string_agg(n.nspname||'.'||p.proname||'/'||p.pronargs||'='||left(md5(regexp_replace(p.prosrc,'\\s+','','g')),8),E'\\n' order by 1) s
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname<>'rls_auto_enable'`)).rows[0].s+'\n';
if(process.argv.includes('--update')){fs.writeFileSync(snapshot,built);console.log('Snapshot updated: '+built.trim().split('\n').length+' functions');return;}
const expected=fs.readFileSync(snapshot,'utf8').replace(/\r/g,'');
const a=new Map(built.trim().split('\n').map(l=>l.split('='))),b=new Map(expected.trim().split('\n').map(l=>l.split('=')));
const changed=[...new Set([...a.keys(),...b.keys()])].filter(k=>a.get(k)!==b.get(k)).map(k=>(!b.has(k)?'new: ':!a.has(k)?'missing: ':'changed: ')+k);
assert.deepEqual(changed,[],'functions differ from supabase/functions.snapshot (run with --update if intended)');
// What the app depends on, whatever the snapshot says.
const src=async name=>(await db.query('select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and proname=$2',['public',name])).rows.map(r=>r.prosrc).join('\n');
assert.match(await src('save_workspace'),/'driveUrl'/,'publishing the catalog keeps the Drive and NotebookLM links');
assert.match(await src('save_workspace'),/questionSessions/);
assert.match(await src('is_peleja_admin'),/p\.role='admin'/);
for(const gone of ['focus_create','restore_personal_backup','study_progress'])assert.equal(await src(gone),'','legacy function is back: '+gone);
for(const needed of ['save_simulation_attempt_next','simulation_results_next','peleja_score_attempt'])assert.notEqual(await src(needed),'','missing: '+needed);
console.log('PASS SQL files rebuild the database in numeric order: '+files.length+' files, '+a.size+' functions match the snapshot');
}finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
