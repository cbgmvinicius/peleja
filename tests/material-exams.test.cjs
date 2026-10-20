const {PGlite}=require('@electric-sql/pglite'),{JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
(async()=>{
const db=new PGlite();let w;
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
const dom=new JSDOM(read('index.html'),{url:'https://peleja.test',runScripts:'outside-only'});w=dom.window;
w.PELEJA_BACKEND={};w.eval(read('storage.js'));
w.eval(read('cloud.js').replace('  init().catch(', '  Promise.resolve().catch(').replace(/\}\)\(\);\s*$/, 'globalThis.__test={state,bind,setTab,rows,fillFilters,renderRanking};})();'));
const api=w.__test,el=id=>w.document.getElementById(id);api.bind();
api.state.data={profiles:[{id:A,display_name:'Pessoa'}],materials:[{user_id:A,area:'Clínica Médica',total:20,correct:14}],materialExams:result,university:[],catalogs:[]};
api.setTab('materials');assert.equal(el('rankingMaterialExamWrap').hidden,false);
assert.equal(api.rows()[0].total,20);
w.document.querySelector('[data-ranking-exam="PR2.1"]').click();
assert.equal(w.document.querySelector('[data-ranking-exam="PR2.1"]').getAttribute('aria-pressed'),'true');
assert.equal(api.rows()[0].total,20);assert.equal(api.rows()[0].correct,15);
w.document.querySelector('[data-ranking-area="Clínica Médica"]').click();assert.equal(api.rows()[0].total,10);assert.equal(api.rows()[0].correct,8);
assert.match(el('rankingFilterSummary').textContent,/PR2.1.*Clínica Médica/);
api.fillFilters();assert.equal(el('rankingMaterialExamFilter').value,'PR2.1');
w.document.querySelector('[data-ranking-exam="FINAL"]').click();assert.equal(api.rows().length,0);
el('clearRankingFilters').click();assert.equal(el('rankingMaterialExamFilter').value,'all');assert.equal(el('rankingAreaFilter').value,'all');
api.setTab('faculty');assert.equal(el('rankingMaterialExamWrap').hidden,true);
console.log('PASS Material exam filters: privacy, inactive/anonymous denied, deduplication, types, combined area, reset, refresh and empty results');
}finally{w?.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


