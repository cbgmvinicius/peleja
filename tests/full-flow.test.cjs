const {PGlite}=require('@electric-sql/pglite');const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const keys=['medstudy_materials_v1','medstudy_exams_v1','medstudy_simulations_v1'];
const legacy={materials:[{id:'m',subject:'Pediatria',title:'Aula',read:true,made:true,notes:'Somente Vinícius',questionEntries:[{id:'q',date:'2026-09-28',questions:10,correct:8,wrong:2}]}],exams:[{id:'e',subject:'Pediatria',type:'Prova',date:'2026-09-28',materialIds:['m'],total:10,correct:8,wrong:2}],simulations:[{id:'s',name:'Evento',date:'2026-09-28',questions:[{id:'q1',number:1,area:'Pediatria',correctAnswer:'A',userAnswer:'A',flashFront:'LEGADO',flashBack:'PRESERVADO'},{id:'q2',number:2,area:'Cirurgia',correctAnswer:'B',userAnswer:'C'}]}]};
(async()=>{
const db=new PGlite();const windows=[];let queue=Promise.resolve();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('request.email',true))$$;
grant usage on schema public,auth to authenticated,anon,service_role;`);
await db.exec(fs.readFileSync(path.join(root,'supabase-schema.sql'),'utf8').replace(/^\uFEFF/,''));
await db.exec(fs.readFileSync(path.join(root,'supabase-upgrade.sql'),'utf8'));
await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'vinicius@peleja.invalid','{\"display_name\":\"Vinícius\"}'),($2,'wilton@peleja.invalid','{\"display_name\":\"Wilton\"}')",[A,B]);
await db.query("insert into public.account_handles values($1,'vinicius',true),($2,'wilton',true)",[A,B]);
function client(id){
  function execute(sql,args=[]){
    const promise=queue.then(async()=>{
      await db.exec('reset role');await db.query("select set_config('request.uid',$1,false)",[id]);await db.exec('set role authenticated');
      try{return {data:(await db.query(sql,args)).rows,error:null};}catch(e){return {data:null,error:{message:e.message}};}
    });queue=promise.then(()=>{});return promise;
  }
  return {
    auth:{getSession:async()=>({data:{session:{user:{id,email:(id===A?'vinicius':'wilton')+'@peleja.invalid'}}}}),onAuthStateChange(){},signOut:async()=>({})},
    async rpc(name,args={}){const entries=Object.entries(args);const sql='select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') as value';const res=await execute(sql,entries.map(([,v])=>typeof v==='object'&&v!==null?JSON.stringify(v):v));return res.error?res:{data:res.data[0].value,error:null};},
    from(table){let columns='*',filters=[],order=[],range=null,single=false;
      const q={select(c){columns=c;return q;},eq(k,v){filters.push([k,v]);return q;},order(k){order.push(k);return q;},range(a,b){range=[a,b];return q;},maybeSingle(){single=true;return run();},single(){single=true;return run();},then(a,b){return run().then(a,b);}};
      async function run(){let sql='select '+columns+' from public.'+table;if(filters.length)sql+=' where '+filters.map(([k],i)=>k+'=$'+(i+1)).join(' and ');if(order.length)sql+=' order by '+order.join(',');if(range)sql+=' limit '+(range[1]-range[0]+1)+' offset '+range[0];const r=await execute(sql,filters.map(x=>x[1]));if(single&&!r.error)r.data=r.data[0]||null;return r;}return q;
    },
  };
}
async function boot(id,seed=false){
  const logs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>logs.push(e));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://peleja.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;windows.push(w);
  w.PELEJA_BACKEND={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_test_only_no_real_key'};
  w.__api=client(id);w.PELEJA_ACADEMIC_DATA={materials:[],exams:[]};w.fetch=async()=>({ok:false});w.confirm=()=>true;w.supabase={createClient:()=>w.__api};
  if(seed)keys.forEach((k,i)=>w.localStorage.setItem(k,JSON.stringify(legacy[['materials','exams','simulations'][i]])));
  w.eval(fs.readFileSync(path.join(root,'storage.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/\}\)\(\);\s*$/,'globalThis.__app={state,els,saveAll,handleAction,handleExamSubmit,handleSimulationSubmit,openSimulationModal};\n})();'));
  w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8').replace('  init().catch(','  globalThis.__ready=init().catch(').replace(/\}\)\(\);\s*$/,'globalThis.__cloud={state,sync,loadRanking,reloadWorkspace,openSharedSimulation,saveSharedSimulation,readPages,authChanged};\n})();'));
  await w.__ready;assert.equal(w.document.body.dataset.accessState,'granted',w.document.getElementById('authMessage').textContent);assert.equal(logs.length,0,logs.map(String).join('\n'));return w;
}
function personalExam(w){return w.__app.state.exams.find(e=>e.id==='e');}
function enterResult(w,correct){w.__app.handleAction('edit-exam','e');w.__app.els.examTotalInput.value='10';w.__app.els.examCorrectInput.value=String(correct);w.__app.els.examWrongInput.value=String(10-correct);w.__app.handleExamSubmit({preventDefault(){}});}
try{
const a=await boot(A,true);assert.equal(personalExam(a).correct,8);assert.equal(a.PELEJA_STORAGE.snapshot().dirty,false);
assert.equal(a.document.getElementById('accountModalTitle').textContent,'Minha conta');
assert.equal(a.document.getElementById('accountModal').getAttribute('aria-hidden'),'true','Restoring a valid session should dismiss the automatic login gate');
a.document.getElementById('accountButton').click();
assert.equal(a.document.getElementById('accountModal').getAttribute('aria-hidden'),'false','An explicit account open should stay open');
a.document.getElementById('closeAccountModal').click();
a.__app.openSimulationModal(a.__app.state.simulations[0]);
const draftInput=a.document.querySelector('[data-field="userAnswer"]');draftInput.value='D';
const initialGeneration=a.PELEJA_STORAGE.generation, initialRevision=a.__cloud.state.authRevision;
for(const event of ['SIGNED_IN','TOKEN_REFRESHED']){
 await a.__cloud.authChanged({...a.__cloud.state.session},event);
 assert.equal(a.document.getElementById('simulationModal').getAttribute('aria-hidden'),'false');
 assert.equal(draftInput.value,'D');assert.equal(a.PELEJA_STORAGE.generation,initialGeneration);
 assert.equal(a.__cloud.state.authRevision,initialRevision);
 assert.equal(a.document.getElementById('accountModal').getAttribute('aria-hidden'),'true');
}
a.document.getElementById('closeSimulationModal').click();
console.log('PASS Reconfirmed session preserves open drafts and keeps account controls consistent');
const originalCreated='2026-01-01T12:00:00.000Z', originalUpdated='2026-01-02T12:00:00.000Z';
a.__app.state.materials[0].source='private-import';a.__app.state.materials[0].dateConfidence='recorded';
a.__app.state.exams[0].source='private-import';
a.__app.state.simulations[0].createdAt=originalCreated;a.__app.state.simulations[0].updatedAt=originalUpdated;
a.__app.saveAll();await a.__cloud.sync();await a.__cloud.reloadWorkspace();
assert.equal(a.__app.state.materials[0].source,'private-import');assert.equal(a.__app.state.materials[0].dateConfidence,'recorded');
assert.equal(a.__app.state.exams[0].source,'private-import');
assert.equal(a.__app.state.simulations[0].createdAt,originalCreated);assert.equal(a.__app.state.simulations[0].updatedAt,originalUpdated);
const metadataDevice=await boot(A);assert.equal(metadataDevice.__app.state.materials[0].source,'private-import');assert.equal(metadataDevice.__app.state.simulations[0].createdAt,originalCreated);
console.log('PASS Shared catalog refresh preserves private provenance and original event timestamps across devices');
const accountMessage=a.document.getElementById('authMessage');
a.document.getElementById('accountButton').click();
a.document.getElementById('syncAccountButton').click();
assert.match(accountMessage.textContent,/Tudo salvo na nuvem.*sincronizadas automaticamente/);
assert.equal(accountMessage.closest('[hidden]'),null,'Sync feedback must remain visible after login');
const realRpc=a.__api.rpc.bind(a.__api);
enterResult(a,9);
let finishSave;
a.__api.rpc=async(name,args)=>name==='save_workspace'?new Promise(resolve=>{finishSave=resolve;}):realRpc(name,args);
const feedbackSave=a.__cloud.sync();
assert.match(accountMessage.textContent,/Sincronizando dados/);
await a.__cloud.sync();assert.match(accountMessage.textContent,/já está em andamento/);
finishSave({error:{message:'Falha de conexão de teste'}});await feedbackSave;
assert.match(accountMessage.textContent,/Falha de conexão de teste/);
assert.equal(accountMessage.closest('[hidden]'),null);
assert.equal(a.PELEJA_STORAGE.snapshot().dirty,true);
a.__api.rpc=realRpc;enterResult(a,8);await a.__cloud.sync();
assert.match(accountMessage.textContent,/salvos na nuvem/);
assert.equal(accountMessage.closest('[hidden]'),null);
console.log('PASS Account sync gives visible feedback when clean, saving, busy, failed and saved');
assert.equal(a.__cloud.state.data.simulations.find(r=>r.user_id===A).correct,1);
assert.equal(a.document.querySelector('[data-field="flashFront"]'),null);assert.equal(a.document.getElementById('errorNotebookList'),null);
assert.equal(a.document.getElementById('registerForm'),null);assert(a.document.getElementById('loginUsername'));
console.log('PASS Real app imports owner legacy data, publishes catalog and preserves private fields without notebook UI');
const b=await boot(B);assert.equal(personalExam(b).correct,null);assert.equal(b.__app.state.materials[0].notes,'');
assert.equal(b.__app.state.materials[0].source,'');assert.equal(b.__app.state.exams[0].source,'');
enterResult(b,4);await b.__cloud.sync();assert.equal(b.PELEJA_STORAGE.snapshot().dirty,false,b.document.getElementById('authMessage').textContent);
const b2=await boot(B);assert.equal(personalExam(b2).correct,4);assert.equal(b2.document.getElementById('examAccuracyKpi').textContent,'40%');
console.log('PASS Participant result survives a fresh device and does not inherit the owner result');
a.__app.handleAction('delete-question-entry','m','q');await a.__cloud.sync();
assert.equal(a.__app.state.materials[0].questionEntries.length,0);
assert.equal(a.__app.state.materials[0].questions,0);
console.log('PASS Deleting the last question entry stays deleted');

enterResult(b,6);await b.__cloud.sync();enterResult(b2,5);await b2.__cloud.sync();assert.match(b2.document.getElementById('authMessage').textContent,/CONFLICT/);assert.equal(personalExam(b2).correct,5);
await b2.__cloud.reloadWorkspace();assert.equal(personalExam(b2).correct,6);assert(b2.localStorage.getItem('peleja_account_v1:'+encodeURIComponent('user:'+B)+':recovery'));
console.log('PASS Device conflict preserves unsynced data and explicit reload keeps a recovery snapshot');
b.__cloud.openSharedSimulation('res::s');
assert.equal(b.document.getElementById('sharedEntryMode').value,'quick','New attempt starts with quick result');
assert.equal(b.document.getElementById('sharedQuickPanel').hidden,false);
b.document.getElementById('sharedEntryMode').value='quick';b.document.getElementById('sharedQuickCorrect').value='1';
for(const input of b.document.querySelectorAll('[data-quick-area]'))input.value=input.dataset.quickArea==='Pediatria'?'1':'0';
await b.__cloud.saveSharedSimulation({preventDefault(){}});
assert.equal(b.document.getElementById('simulationAccuracyKpi').textContent,'50.0%');assert.equal(b.__cloud.state.data.manualSimulations.find(r=>r.user_id===B).correct,1);
console.log('PASS Quick result updates personal simulation indicators and ranking from the same source');
const backup={app:'Peleja',owner:'user:'+B,...JSON.parse(JSON.stringify(b.PELEJA_STORAGE.snapshot().payload)),cloudAttempts:await b.PELEJA_CLOUD_BACKUP.exportAttempts()};
assert.equal(backup.cloudAttempts.manual.length,1);assert.equal(backup.cloudAttempts.answers.length,0);
const invalid=JSON.parse(JSON.stringify(backup));invalid.cloudAttempts.manual[0].correct=99;
await assert.rejects(()=>b.PELEJA_CLOUD_BACKUP.restore(invalid),e=>/Acertos/.test(e.message));
await b.__cloud.reloadWorkspace();assert.equal(personalExam(b).correct,6);
await assert.rejects(()=>b.PELEJA_CLOUD_BACKUP.restore({...backup,owner:'user:'+A}),e=>/outra conta/.test(e.message));
await b.PELEJA_CLOUD_BACKUP.restore(backup);
assert.equal(b.__cloud.state.data.manualSimulations.find(r=>r.user_id===B).correct,1);
console.log('PASS Online backup roundtrip restores own results; invalid import rolls back and another owner is denied');
await b2.__cloud.reloadWorkspace();
let release, entered, pause=true;
const gate=new Promise(r=>release=r), started=new Promise(r=>entered=r), originalRpc=b2.__api.rpc.bind(b2.__api);
b2.__api.rpc=async(name,args)=>{if(name==='save_workspace'&&pause){pause=false;entered();await gate;}return originalRpc(name,args);};
enterResult(b2,7);const pending=b2.__cloud.sync();await started;enterResult(b2,8);
const activeSave=b2.__cloud.state.syncing;
await b2.__cloud.authChanged({...b2.__cloud.state.session},'TOKEN_REFRESHED');
assert.equal(b2.__cloud.state.syncing,activeSave,'Refreshing a token must not detach an in-flight save');
await new Promise(r=>setTimeout(r,1300));release();await pending;
await new Promise(r=>setTimeout(r,1600));assert.equal(b2.PELEJA_STORAGE.snapshot().dirty,false);
const latest=await boot(B);assert.equal(personalExam(latest).correct,8);
console.log('PASS Edits during a slow save trigger another upload and reach a fresh device');

const sim=a.__app.state.simulations[0];a.__app.openSimulationModal(sim);
a.document.querySelector('[data-field="correctAnswer"]').value='C';a.__app.handleSimulationSubmit({preventDefault(){}});await a.__cloud.sync();
assert.equal(a.__app.state.simulations[0].questions[0].flashBack,'PRESERVADO');
await b.__cloud.loadRanking();assert.equal(b.document.getElementById('simulationCountKpi').textContent,'0');
b.__cloud.openSharedSimulation('res::s');assert.match(b.document.getElementById('sharedSimulationValidation').textContent,/mudou/);
console.log('PASS Changed key removes stale quick result from ranking and requests review; legacy fields survive editor saves');
await a.__app.handleAction('delete-exam','e');await a.__cloud.sync();await b2.__cloud.reloadWorkspace();assert.equal(b2.__app.state.exams.length,0);
console.log('PASS Admin deletion propagates to another device and is not resurrected by static academic data');
assert.equal(a.document.getElementById('simulationModal').getAttribute('aria-hidden'),'true');

await queue;await db.exec('reset role');await db.exec("insert into public.simulation_catalog(key,name,date,created_by) select 'page-'||g, 'Pagination '||g, '2026-09-28'::date,auth.uid() from generate_series(1,1101) g");
const page=await b2.__cloud.readPages('simulation_catalog','key,name,date,created_by',['key']);
assert(!page.error);assert.equal(page.data.length,1102);
await b2.__cloud.authChanged(null,'SIGNED_OUT');assert.equal(b2.PELEJA_STORAGE.scope,null);assert.equal(b2.__app.state.exams.length,0);assert.equal(b2.__cloud.state.data,null);
assert.equal(b2.document.getElementById('accountModalTitle').textContent,'Entrar no Peleja');
assert.equal(b2.document.getElementById('accountModal').getAttribute('aria-hidden'),'false','Signed-out users still need the login gate');
console.log('PASS Ranking reads more than 1000 records without truncation; logout removes active personal state');
console.log('PASS Full frontend + PostgreSQL integration complete (simulated browser; no production services)');
}finally{for(const w of windows)w.close();await queue;await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
