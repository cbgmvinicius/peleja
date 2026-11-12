// Mini Pomodoro: a floating player while a session is on outside the Pomodoro tab, also over the solver.
const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const MIN=60000,START=Date.parse('2026-11-05T12:00:00Z'),SESSION='0f1e2d3c-4b5a-4968-8776-655443322110';

async function app(session){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#pomodoro'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let clock=START;w.PELEJA_NOW=()=>clock;
 const sounds=[];w.Audio=class{constructor(src){this.src=src;this.volume=1;this.paused=true;sounds.push(this);}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}};
 const remote={revision:1,catalog_revision:1,catalog:{materials:[],simulations:[],exams:[]},payload:{materials:[],exams:[],simulations:[],courses:[]}};
 const server={session,sets:[],blocks:[]};
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list'||name==='quiz_sessions_mine'||name==='pomodoro_blocks_mine')return {data:[]};
  if(name==='save_workspace'){remote.payload=structuredClone(args.p_payload);remote.revision++;return {data:{revision:remote.revision,catalog_revision:1}};}
  if(name==='pomodoro_block_save'){server.blocks.push(args);return {data:null};}
  if(name==='pomodoro_session_get')return {data:server.session?structuredClone(server.session):null};
  if(name==='pomodoro_session_set'){server.sets.push(args);
   if(server.session&&Date.parse(server.session.changedAt)>=Date.parse(args.p_changed_at))return {data:structuredClone(server.session)};
   server.session={state:structuredClone(args.p_state),changedAt:args.p_changed_at};return {data:null};}
  return {data:true};},
  from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Aluno',role:'participant'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 return {w,$:id=>w.document.getElementById(id),P:w.PELEJA_POMODORO,server,sounds,advance:ms=>{clock+=ms;},now:()=>clock};
}

(async()=>{
 const a=await app(null),$=a.$,P=a.P,mini=()=>$('pomoMini');
 assert.ok(mini(),'the mini player exists');assert.equal(mini().hidden,true,'idle: hidden');
 // A session on the Pomodoro tab: the tab already shows it.
 a.w.showPomodoro();P.actions.toggle();await tick(80);assert.equal(mini().hidden,true,'hidden on the Pomodoro tab');
 // Another tab: the player shows the phase, the time and the set.
 $('navLibrary').click();await tick(80);
 assert.equal(mini().hidden,false);assert.equal(mini().dataset.mode,'focus');assert.match(mini().textContent,/Foco/);assert.match(mini().textContent,/25:00|24:5\d/);assert.match(mini().textContent,/série 1 de 4/);
 // The buttons drive the timer.
 mini().querySelector('.pomo-mini-toggle').click();await tick(40);assert.equal(P.state().timer.status,'paused');assert.equal(mini().dataset.status,'paused');assert.match(mini().textContent,/Pausado/);
 assert.equal(mini().querySelector('.pomo-mini-skip').hidden,true,'skip only while running');
 mini().querySelector('.pomo-mini-toggle').click();await tick(40);assert.equal(P.state().timer.status,'running');
 a.advance(2*MIN);mini().querySelector('.pomo-mini-skip').click();await tick(40);assert.equal(P.state().timer.mode,'short','skip ends the focus');assert.equal(mini().dataset.mode,'short');
 // Over the question solver (a modal dialog in the top layer) the player moves inside it, and back out on close.
 const d=a.w.document.getElementById('solverDialog');assert.ok(d,'solver dialog present');
 d.setAttribute('open','');await tick(60);assert.equal(mini().parentElement,d,'inside the open solver');
 d.removeAttribute('open');await tick(60);assert.notEqual(mini().parentElement,d,'back on the page');
 // Folding keeps only the time.
 mini().querySelector('.pomo-mini-fold').click();assert.equal(mini().dataset.small,'true');
 // Concluir ends the session (it asks first while sets are left) and the player goes away.
 mini().querySelector('.pomo-mini-finish').click();await tick(40);a.w.document.getElementById('confirmAccept')?.click();await tick(120);
 assert.equal(P.state().timer.status,'idle');assert.equal(mini().hidden,true);
 // Flow: "Foco · flow", the time, the set and "Começar pausa"; past the minimum it counts up.
 P.state().config.flow=true;P.actions.toggle();await tick(60);
 assert.equal(mini().hidden,false);assert.match(mini().textContent,/Foco · flow/);assert.match(mini().textContent,/série 1 de 4/);
 assert.equal(mini().querySelector('.pomo-mini-break').hidden,false,'Começar pausa in flow');assert.ok(mini().querySelector('.pomo-mini-toggle svg'),'the toggle has its icon');assert.ok(mini().querySelector('.pomo-mini-fold svg'),'the fold has its icon');
 a.advance(30*MIN);P.advance();await tick(600);assert.match(mini().querySelector('.pomo-mini-time').textContent,/^\+05:0\d$/);
 mini().querySelector('.pomo-mini-break').click();await tick(40);assert.equal(P.state().timer.mode,'short','Começar pausa ends the focus');
 P.actions.stop();await tick(40);assert.equal(mini().hidden,true);
 // Hidden must win over the player's own display:flex (it showed an empty shell on the Pomodoro tab).
 assert.match(fs.readFileSync(path.join(root,'pomodoro.css'),'utf8'),/\.pomo-mini\[hidden\][^{]*\{display:none!important\}/);
 console.log('PASS Pomodoro mini player: hidden idle and on its tab, phase/time/set, pause/continue/skip, inside the solver dialog, fold, finish');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
