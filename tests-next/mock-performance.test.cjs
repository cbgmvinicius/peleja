// Mini Pomodoro: a floating player while a session is on outside the Pomodoro tab, also over the solver.
const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const MIN=60000,START=Date.parse('2026-11-05T12:00:00Z'),SESSION='0f1e2d3c-4b5a-4968-8776-655443322110';

const stats=cs=>({'Clínica Médica':{answered:40,correct:cs[0],wrong:40-cs[0]},'Cirurgia':{answered:30,correct:cs[1],wrong:30-cs[1]},'Pediatria':{answered:30,correct:cs[2],wrong:30-cs[2]}});
const res=(user,cs)=>({user_id:user,simulation_key:'k1',total:100,correct:cs.reduce((a,b)=>a+b,0),wrong:100-cs.reduce((a,b)=>a+b,0),area_stats:stats(cs),mode:'quick'});
const RESULTS=[res('student',[30,20,22]),res('u2',[33,24,20]),res('u3',[20,15,15])];
const TABLES={profiles:[{id:'student',display_name:'Eu Mesmo'},{id:'u2',display_name:'Wilton'},{id:'u3',display_name:'Ulisses'}],simulation_catalog:[{key:'k1',name:'SIM 1',date:'2026-11-01'},{key:'k2',name:'SIM 2',date:'2026-11-02'}]};
async function app(session,{phone=false}={}){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#pomodoro'}),w=dom.window;
 w.matchMedia=query=>({matches:phone&&/max-width:\s*760px/.test(query),media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let clock=START;w.PELEJA_NOW=()=>clock;
 const sounds=[];w.Audio=class{constructor(src){this.src=src;this.volume=1;this.paused=true;sounds.push(this);}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}};
 const remote={revision:1,catalog_revision:1,catalog:{materials:[],simulations:[],exams:[]},payload:{materials:[],exams:[],simulations:[],courses:[]}};
 const server={session,sets:[],blocks:[]};
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:RESULTS};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list'||name==='quiz_sessions_mine'||name==='pomodoro_blocks_mine')return {data:[]};
  if(name==='save_workspace'){remote.payload=structuredClone(args.p_payload);remote.revision++;return {data:{revision:remote.revision,catalog_revision:1}};}
  if(name==='pomodoro_block_save'){server.blocks.push(args);return {data:null};}
  if(name==='pomodoro_session_get')return {data:server.session?structuredClone(server.session):null};
  if(name==='pomodoro_session_set'){server.sets.push(args);
   if(server.session&&Date.parse(server.session.changedAt)>=Date.parse(args.p_changed_at))return {data:structuredClone(server.session)};
   server.session={state:structuredClone(args.p_state),changedAt:args.p_changed_at};return {data:null};}
  return {data:true};},
  from:table=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async(from)=>({data:from?[]:(TABLES[table]||[])}),maybeSingle:async()=>({data:{display_name:'Eu Mesmo',role:'participant'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 return {w,$:id=>w.document.getElementById(id),P:w.PELEJA_POMODORO,server,sounds,advance:ms=>{clock+=ms;},now:()=>clock};
}

(async()=>{
 const a=await app(null),w=a.w,$=a.$,q=s=>w.document.querySelector(s);
 w.showMocks();await tick(200);
 const btn=name=>[...w.document.querySelectorAll('.mock-card')].find(c=>c.textContent.includes(name)).querySelector('[data-mock-performance]');
 btn('SIM 1').click();await tick(80);
 const title=()=>q('.performance-personal h3').textContent;
 assert.equal(title(),'Meu desempenho');assert.ok($('performanceResult'),'my result can be edited');assert.equal(q('.performance-score').textContent,'72%');
 const row=id=>q(`[data-performance-person="${id}"]`);
 assert.equal(row('student').getAttribute('aria-pressed'),'true','mine is the one shown');assert.equal(row('u2').getAttribute('role'),'button');assert.equal(row('u2').tabIndex,0);
 // Picking someone shows their score, numbers and areas; only my own result has the edit button.
 row('u2').click();await tick(60);
 assert.match(title(),/Desempenho de Wilton$/);assert.equal(q('.performance-score').textContent,'77%');assert.equal($('performanceResult'),null);
 assert.match(q('.performance-personal .stats').textContent,/Acertos77/);assert.match(q('.area-chart-row').textContent,/Clínica Médica.*83%.*33 acertos.*7 erros/);
 assert.equal(row('u2').getAttribute('aria-pressed'),'true');assert.equal(row('student').getAttribute('aria-pressed'),'false');
 // Keyboard too.
 row('u3').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick(60);assert.match(title(),/Desempenho de Ulisses$/);
 // "Voltar ao meu", and picking my own row, bring mine back.
 $('performanceMine').click();await tick(60);assert.equal(title(),'Meu desempenho');assert.ok($('performanceResult'));
 row('u2').click();await tick(60);row('student').click();await tick(60);assert.equal(title(),'Meu desempenho');
 // Another simulation, or opening again, starts on mine.
 row('u2').click();await tick(60);$('performanceClose').click();await tick(400);btn('SIM 1').click();await tick(80);assert.equal(title(),'Meu desempenho','reopening starts on mine');
 row('u2').click();await tick(60);$('performanceClose').click();await tick(400);btn('SIM 2').click();await tick(80);assert.equal(title(),'Meu desempenho');assert.match(q('.performance-personal').textContent,/Resultado ainda não registrado/);
 // Compact layout: one line per area on desktop.
 assert.match(fs.readFileSync(path.join(root,'style.css'),'utf8'),/#performanceContent \.area-chart-row\{display:grid;grid-template-columns:minmax\(0,12em\)/);
 console.log('PASS simulation performance: pick anyone in the classification (click/keyboard) to see their score, numbers and areas; only mine is editable; back to mine; compact one-screen layout');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
