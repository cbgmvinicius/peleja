const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create table public.account_handles(user_id uuid primary key,username text,active boolean);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;create function public.has_peleja_access() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.account_handles where user_id=auth.uid() and active)$$;grant usage on schema public,auth to authenticated,anon;`);
await db.exec(read('supabase-sessions.sql'));await db.exec(read('supabase-sessions.sql'));
await db.exec(read('supabase-sessions-cycles.sql'));await db.exec(read('supabase-sessions-cycles.sql'));
for(const [id,name] of [[A,'Ana'],[B,'Beto'],[C,'Caio']]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into public.account_handles values($1,$2,true)',[id,name]);}
const user=async id=>{await db.exec('reset role');await db.query("select set_config('request.uid',$1,false)",[id]);await db.exec('set role authenticated');};
const state=async()=> (await db.query('select public.focus_state() as data')).rows[0].data;
const create=async(peer=null)=>(await db.query("select public.focus_create('Hematologia',25,$1) as data",[peer])).rows[0].data;
const act=async(s,action)=>(await db.query('select public.focus_act($1,$2,$3) as data',[s.id,s.version,action])).rows[0].data;
await user(A);let data=await create(B),s=data.sessions[0];assert.equal(s.cycles_enabled,true);assert.equal(s.status,'invited');assert.equal(s.running_since,null);
await assert.rejects(()=>act(s,'accept'),/Confirme/);await assert.rejects(()=>create(),/já tem/);
await user(C);assert.equal((await state()).sessions.length,0);await assert.rejects(()=>act(s,'accept'),/indisponível/);assert.equal((await db.query('select * from public.focus_sessions')).rows.length,0);
await assert.rejects(()=>db.query('update public.focus_sessions set elapsed_ms=100000'),/permission denied/);
await user(B);data=await act(s,'accept');s=data.sessions[0];assert.equal(s.status,'running');
await user(A);data=await act(s,'pause');const pending=data.sessions[0];assert.equal(pending.status,'running');assert.equal(pending.pending_by,A);
await assert.rejects(()=>act(pending,'confirm'),/outro participante/);
await user(B);await assert.rejects(()=>act(s,'end'),/sessão mudou/);data=await act(pending,'confirm');s=data.sessions[0];assert.equal(s.status,'paused');assert.equal(s.running_since,null);assert(s.elapsed_ms>=0);
data=await act(s,'resume');s=data.sessions[0];assert.equal(s.status,'paused');await user(A);data=await act(s,'confirm');s=data.sessions[0];assert.equal(s.status,'running');
// Simulate closed app / disconnected clients: server elapsed time remains authoritative.
await db.exec('reset role');await db.query("update public.focus_sessions set running_since=clock_timestamp()-interval '10 minutes' where id=$1",[s.id]);await user(A);
data=await act(s,'end');s=data.sessions[0];assert.equal(s.status,'running');await user(B);data=await act(s,'reject');s=data.sessions[0];assert.equal(s.status,'running');assert.equal(s.pending_action,null);
data=await act(s,'end');s=data.sessions[0];await user(A);data=await act(s,'confirm');s=data.sessions[0];assert.equal(s.status,'ended');assert(s.elapsed_ms>=600000);
data=await create();s=data.sessions[0];assert.equal(s.status,'running');data=await act(s,'pause');s=data.sessions[0];assert.equal(s.status,'paused');data=await act(s,'end');assert.equal(data.sessions[0].status,'ended');
await db.exec('reset role');await db.query('update public.account_handles set active=false where user_id=$1',[A]);await user(A);await assert.rejects(state,/Acesso negado/);
await db.exec('reset role;set role anon');await assert.rejects(state,/permission denied/);
console.log('PASS Sessions: invitation consent, participant privacy, blocked direct writes, stale versions, dual confirmation, reject, offline elapsed time, solo, revoked and anonymous denied');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
