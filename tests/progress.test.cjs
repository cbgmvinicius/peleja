const {PGlite}=require('@electric-sql/pglite'),{JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
(async()=>{
const courseData=JSON.parse(read('courses-data.js').split(' = ')[1].trim().replace(/;$/,''));
const ids=courseData.modules.flatMap(m=>m.lessons.map(l=>l.id));
assert.equal(ids.length,128);
for(const id of ids)assert(read('supabase-progress.sql').includes("'"+id+"'"));
const db=new PGlite();let w;
try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
grant usage on schema public,auth to authenticated,anon,service_role;`);
await db.exec(read('supabase-schema.sql').replace(/^\uFEFF/,''));await db.exec(read('supabase-upgrade.sql'));
await db.exec(read('supabase-progress.sql'));await db.exec(read('supabase-progress.sql'));
await db.query("insert into auth.users(id,email) values($1,'vinicius@peleja.invalid'),($2,'wilton@peleja.invalid'),($3,'tiago@peleja.invalid')",[A,B,C]);
await db.query("insert into public.account_handles values($1,'vinicius',true),($2,'wilton',true),($3,'tiago',true)",[A,B,C]);
const exam=(id,date,materialIds)=>({id,date,materialIds,subject:'Disciplina '+id,type:'PR2'});
const catalog={materials:['a','b','c','d'].map(id=>({id})),exams:[exam('past','2026-10-15',['d']),exam('next','2026-10-22',['a','b','a','deleted']),exam('tie','2026-10-22',['b']),exam('later','2026-10-26',['b','c']),exam('undated','',['c'])],simulations:[]};
await db.query('update public.academic_catalog set payload=$1',[JSON.stringify(catalog)]);
const payload={materials:[{id:'a',read:true,notes:'PRIVATE SECRET'},{id:'b',read:false},{id:'c',read:true},{id:'d',read:true}],exams:[{id:'next',grade:'',total:'invalid',correct:'',wrong:''}],simulations:[],courses:[{id:'ecg-m06-01'},{id:'ecg-m06-01'},{id:'ecg-extra-01'},{id:'unknown'}]};
await db.query('insert into public.user_workspace(user_id,payload) values($1,$2),($3,$4)',[A,JSON.stringify(payload),B,JSON.stringify({...payload,exams:[{id:'next',performed:true},{id:'tie',grade:0}]})]);
async function user(id){await db.exec('reset role');await db.query("select set_config('request.uid',$1,false)",[id]);await db.exec('set role authenticated');}
const load=async()=> (await db.query("select public.study_progress('2026-10-16') result")).rows[0].result;
await user(A);const rows=await load();const a=rows.find(r=>r.user_id===A),b=rows.find(r=>r.user_id===B),c=rows.find(r=>r.user_id===C);
assert.deepEqual(a.materials,{done:2,total:3});assert.equal(a.next.total,2);assert.equal(a.next.done,1);assert.equal(a.next.exams.length,2);
assert.equal(b.next.date,'2026-10-26');assert.equal(b.next.total,2);assert.equal(b.next.done,1);
assert.deepEqual(a.courses,{done:2,total:128});assert.equal(c.has_data,false);
assert(!JSON.stringify(rows).includes('PRIVATE SECRET'));assert(!JSON.stringify(rows).includes('watchedAt'));
assert.equal((await db.query('select * from public.user_workspace')).rows.length,1);
await user(B);assert.equal((await load()).length,3);
await db.exec('reset role');await db.query('update public.account_handles set active=false where user_id=$1',[B]);
await user(A);assert.equal((await load()).length,2);
await user(B);await assert.rejects(load,/Acesso negado/);
await db.exec('reset role;set role anon');await assert.rejects(load,/permission denied/);
console.log('PASS Shared progress: private aggregate only, active members, anonymous/revoked denied, deduplication, dated/undated/past exams, performed and zero grade, exact courses, missing workspace');
const dom=new JSDOM(read('index.html'),{url:'https://peleja.test',runScripts:'outside-only'});w=dom.window;
w.PELEJA_ACCESS={signedIn:true,accessAllowed:true};w.PELEJA_STORAGE={snapshot:()=>({dirty:false})};
w.PELEJA_PROGRESS={load:async()=>rows};w.eval(read('progress.js'));await new Promise(r=>setTimeout(r,0));
const d=w.document;assert.equal(d.querySelectorAll('.study-progress-row').length,3);
assert.match(d.getElementById('studyProgressList').textContent,/2 de 3 apostilas estudadas/);
d.getElementById('studyProgressScope').click();assert.match(d.getElementById('studyProgressList').textContent,/1 de 2 apostilas estudadas/);
d.querySelector('[data-progress-kind="courses"]').click();assert(d.getElementById('studyProgressScopeWrap').hidden);assert.match(d.getElementById('studyProgressList').textContent,/2 de 128 aulas vistas/);
d.querySelector('[data-progress-kind="materials"]').click();assert(d.getElementById('studyProgressScope').checked);
// Logout invalidates an in-flight response and clears every participant immediately.
let resolve;w.PELEJA_PROGRESS.load=()=>new Promise(r=>resolve=r);d.getElementById('refreshStudyProgress').click();
w.PELEJA_ACCESS={signedIn:false,accessAllowed:false};w.dispatchEvent(new w.Event('peleja:access-changed'));resolve(rows);await new Promise(r=>setTimeout(r,0));
assert.equal(d.querySelectorAll('.study-progress-row').length,0);
w.PELEJA_ACCESS={signedIn:true,accessAllowed:true};w.PELEJA_PROGRESS.load=async()=>{throw Error('offline');};d.getElementById('refreshStudyProgress').click();await new Promise(r=>setTimeout(r,0));
assert.match(d.getElementById('studyProgressStatus').textContent,/Não foi possível/);
console.log('PASS Dashboard switches, counts, retained scope, zero/unknown data, failed load and stale response after logout');
}finally{w?.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
