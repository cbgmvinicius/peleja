const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
(async()=>{
const db=new PGlite();
try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
grant usage on schema public,auth to authenticated,anon,service_role;`);
await db.exec(read('supabase-schema.sql').replace(/^\uFEFF/,''));await db.exec(read('supabase-upgrade.sql'));
await db.exec(read('supabase-material-exams.sql'));await db.exec(read('supabase-material-exams.sql'));
await db.query("insert into auth.users(id,email) values($1,'vinicius@peleja.invalid'),($2,'wilton@peleja.invalid')",[A,B]);
await db.query("insert into public.account_handles values($1,'vinicius',true),($2,'wilton',true)",[A,B]);
const materials=[{id:'a',subject:'Clínica Médica III'},{id:'b',subject:'Pediatria'},{id:'c',subject:'Clínica Médica III'}];
const exam=(type,materialIds)=>({type,materialIds});
await db.query('update public.academic_catalog set payload=$1',[JSON.stringify({materials,exams:[exam('PR2.1',['a','a','b']),exam(' pr2.1 ',['a']),exam('PR2',['c']),exam('Final',[])]})]);
const payload={materials:materials.map((m,i)=>({...m,notes:'PRIVATE',questionEntries:[{questions:10,correct:8-i,wrong:2+i}]}))};
await db.query('insert into public.user_workspace(user_id,payload) values($1,$3),($2,$3)',[A,B,JSON.stringify(payload)]);
await db.query("select set_config('request.uid',$1,false)",[A]);await db.exec('set role authenticated');
const load=async()=> (await db.query('select public.material_exam_results() result')).rows[0].result;
const result=await load();assert.deepEqual(result.types,['FINAL','PR2','PR2.1']);
assert.equal(result.rows.length,6);assert.equal(result.rows.find(r=>r.user_id===A&&r.exam_type==='PR2.1'&&r.area==='Clínica Médica').total,10);
assert(!JSON.stringify(result).includes('PRIVATE'));assert.equal((await db.query('select * from public.user_workspace')).rows.length,1);
await db.exec('reset role');await db.query('update public.account_handles set active=false where user_id=$1',[B]);await db.exec('set role authenticated');assert.equal((await load()).rows.length,3);
await db.query("select set_config('request.uid',$1,false)",[B]);await assert.rejects(load,/Acesso negado/);
await db.exec('reset role;set role anon');await assert.rejects(load,/permission denied/);
console.log('PASS Material exam results: privacy, inactive/anonymous denied, deduplication, types');
}finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


