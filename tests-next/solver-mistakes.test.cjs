const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const opt=(text,isCorrect)=>({text,isCorrect,rationale:'Por que '+text});
const questions=[
 {question:'Q1 <b>agente</b>?',answerOptions:[opt('Malassezia',true),opt('Candida',false),opt('Tinea',false)],hint:'Levedura',topic:''},
 {question:'Q2 tratamento?',answerOptions:[opt('Griseofulvina',true),opt('Nistatina',false)],hint:'',topic:''},
 {question:'Q3 transmissão?',answerOptions:[opt('Gato',true),opt('Mosquito',false)],hint:'',topic:''}];

async function app(){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#biblioteca'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const remote={revision:1,catalog_revision:1,catalog:{materials:[
  {id:'derm:1',title:'D09 Micoses',subject:'Dermatologia',classDate:'2026-10-10'},
  {id:'derm:2',title:'D10 Acne',subject:'Dermatologia',classDate:'2026-10-11'},
  {id:'derm:3',title:'D11 Rosácea',subject:'Dermatologia',classDate:'2026-10-12'}],simulations:[],exams:[{id:'e1',subject:'Dermatologia',type:'PR2.1',date:'2099-12-31',materialIds:['derm:2','derm:1']},{id:'e2',subject:'Dermatologia',type:'PR2.2',date:'2100-01-15',materialIds:['derm:2']},{id:'e3',subject:'Dermatologia',type:'PR2.3',date:'2100-02-15',materialIds:['derm:3']}]},
  payload:{materials:[],exams:[],simulations:[],courses:[],questionSessions:[]}};
 const calls=[],state={sessions:[]};
 const score=answers=>{let answered=0,correct=0;for(const [k,a] of Object.entries(answers))if(a.o!=null){answered++;if(questions[k].answerOptions[a.o].isCorrect)correct++;}return {answered,correct};};
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{calls.push([name,structuredClone(args)]);
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list')return {data:[{id:'set-1',materialId:'derm:1',title:'Micoses',count:3,fingerprint:'f',createdAt:'2026-11-01T00:00:00Z'},{id:'set-exam',examId:'e1',title:'PR2.1 tudo em um',count:3,fingerprint:'g',createdAt:'2026-11-02T00:00:00Z'},{id:'set-2',materialId:'derm:2',title:'Acne',count:3,fingerprint:'h',createdAt:'2026-11-03T00:00:00Z'}]};
  if(name==='quiz_sessions_mine'&&state.mine)return {data:structuredClone(state.mine[args.p_set]||[])};
  if(name==='question_set')return {data:{id:'set-1',questions}};
  if(name==='quiz_sessions_counted')return {data:structuredClone(state.counted||[])};
  if(name==='quiz_sessions_mine')return {data:structuredClone(state.sessions)};
  if(name==='quiz_session_start'){state.sessions=state.sessions.filter(s=>s.status!=='active');const s={id:'s'+(state.sessions.length+1)+'-'+Date.now(),setId:args.p_set,mode:args.p_mode,clock:args.p_clock,timerSeconds:args.p_timer,layout:args.p_layout,answers:{},elapsedMs:0,status:'active',createdAt:new Date().toISOString()};state.sessions.unshift(s);return {data:s.id};}
  if(name==='quiz_session_save'){const s=state.sessions.find(x=>x.id===args.p_id);s.answers=args.p_answers;s.elapsedMs=args.p_elapsed;const r=score(args.p_answers);if(args.p_finish){const first=!state.sessions.some(x=>x.status==='done'&&x.counted&&x.setId===s.setId);Object.assign(s,{status:'done',...r,counted:first&&r.answered>0,finishedAt:new Date().toISOString()});return {data:{...r,counted:s.counted}};}return {data:{...r,counted:false}};}
  if(name==='quiz_session_delete'){const s=state.sessions.find(x=>x.id===args.p_id);if(!s)return {error:{message:'Sessão não encontrada'}};state.sessions=state.sessions.filter(x=>x!==s);return {data:{status:s.status,counted:!!s.counted}};}
  if(name==='save_workspace'){remote.payload=structuredClone(args.p_payload);remote.revision++;return {data:{revision:remote.revision,catalog_revision:1}};}
  return {data:true};},
  from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Aluno',role:'participant'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 const $=id=>w.document.getElementById(id);
 return {w,$,calls,state,remote,q:sel=>w.document.querySelector(sel),qa:sel=>[...w.document.querySelectorAll(sel)]};
}
const optionText=li=>li.querySelector('.solver-text').textContent;
const pick=(p,text)=>p.qa('.solver-option').find(li=>optionText(li)===text).querySelector('.solver-pick').click();
const footButton=(p,text)=>p.qa('#solverFoot button').find(b=>b.textContent===text);
const count=(calls,name)=>calls.filter(([n])=>n===name).length;
// A finished attempt with the given answers ({question index: option index}); score as the server keeps it.
const done=(answers,at)=>{const a=Object.fromEntries(Object.entries(answers).map(([k,o])=>[k,{o,x:[]}]));const answered=Object.keys(a).length,correct=Object.entries(answers).filter(([k,o])=>questions[k].answerOptions[o].isCorrect).length;return {id:'d'+at,status:'done',answers:a,answered,correct,layout:{questions:Object.keys(a).map(Number),options:{}},finishedAt:`2026-11-0${at}T10:00:00Z`};};

(async()=>{
 const p=await app();const {w,$,q,qa,calls,state}=p;
 state.mine={
  'set-exam':[done({0:0,1:0,2:1},1)],                 // Q3 wrong
  'set-1':[done({0:0},3),done({0:1,1:0},2)],         // Q1 wrong once, right later: still an error
  'set-2':[done({1:1},4),{id:'open',status:'active',answers:{0:{o:1,x:[]}},layout:{questions:[0],options:{}}}], // Q2 wrong; open round ignored
 };
 w.location.hash='#provas';await tick(120);
 const buttons=qa('#facultyList [data-solve-exam]');assert.equal(buttons.length,3);
 const byType=t=>qa('#facultyList [data-solve-exam]').find(b=>b.closest('.faculty-card').querySelector('.faculty-tag').textContent===t);
 // An exam whose only questions are in its subjects' lists opens too; one with none stays dimmed.
 assert.equal(byType('PR2.2').getAttribute('aria-disabled'),'false','subject lists are enough');
 assert.equal(byType('PR2.3').getAttribute('aria-disabled'),'true','no lists at all: dimmed');

 // ---- PR2.1: its own list plus D09 and D10 ----
 byType('PR2.1').click();await tick(150);
 const read=calls.filter(([n])=>n==='quiz_sessions_mine').map(([,a])=>a.p_set);
 for(const id of ['set-exam','set-1','set-2'])assert.ok(read.includes(id),'reads '+id);
 const mistakesButton=$('solverMistakes');assert.ok(mistakesButton,'button in the exam menu');assert.equal(mistakesButton.disabled,false);
 assert.equal($('solverMistakesCount').textContent,'3');assert.ok(mistakesButton.querySelector('svg'),'target icon');assert.match(mistakesButton.textContent,/^Erros3$/);assert.ok($('solverStart'),'Começar stays');
 assert.equal(mistakesButton.previousElementSibling.textContent,'Cancelar');assert.equal(mistakesButton.nextElementSibling,$('solverStart'),'between Cancelar and Começar');
 const starts=count(calls,'quiz_session_start');
 mistakesButton.click();await tick(80);
 assert.equal(count(calls,'quiz_session_start'),starts,'no list session is opened (and none is replaced)');
 assert.equal($('solverKicker').textContent,'SÓ MEUS ERROS · 1 / 3');
 assert.equal(q('.solver-stem').textContent,'Q3 transmissão?','Treino keeps the order: exam list first, then subjects in topic order');
 pick(p,'Gato');await tick();
 footButton(p,'Próxima').click();await tick();assert.equal(q('.solver-stem').textContent,'Q1 <b>agente</b>?');
 pick(p,'Candida');await tick();
 footButton(p,'Próxima').click();await tick();assert.equal(q('.solver-stem').textContent,'Q2 tratamento?');
 const saves=count(calls,'quiz_session_save');
 footButton(p,'Finalizar').click();await tick();$('confirmAccept').click();await tick(150);
 assert.equal(count(calls,'quiz_session_save'),saves,'the errors round is not saved');
 assert.equal(q('.solver-score strong').firstChild.textContent,'1/3');assert.doesNotMatch(q('.solver-score .solver-note').textContent,/estatísticas/,'never counts');
 // Redo the missed ones: same questions, nothing read again.
 const reads=count(calls,'quiz_sessions_mine');
 footButton(p,'Refazer erradas').click();await tick(80);
 assert.equal($('solverKicker').textContent,'SÓ MEUS ERROS · 1 / 2');assert.equal(count(calls,'quiz_sessions_mine'),reads);
 // Leaving with answers asks once (nothing to keep), then closes; nothing is deleted.
 pick(p,'Malassezia');await tick();
 $('solverClose').click();await tick();
 assert.equal($('solverLeave').open,false);assert.equal($('confirmDialog').open,true);assert.equal($('confirmTitle').textContent,'Sair da rodada de erros?');
 $('confirmAccept').click();await tick(120);
 assert.equal($('solverDialog').open,false);assert.equal(count(calls,'quiz_session_delete'),0,'nothing is deleted');

 // ---- PR2.2: no list of its own, only D10's ----
 byType('PR2.2').click();await tick(150);
 assert.equal($('solverDialog').open,true);assert.equal($('solverStart'),null,'nothing to start besides the errors');
 assert.ok($('solverMistakes').classList.contains('primary'));assert.equal($('solverMistakesCount').textContent,'1');
 assert.match($('solverMistakesLead').textContent,/não tem lista própria/);
 $('solverMistakes').click();await tick(80);assert.equal(q('.solver-stem').textContent,'Q2 tratamento?');
 $('solverClose').click();await tick(80);assert.equal($('confirmDialog').open,false,'nothing answered: closes right away');assert.equal($('solverDialog').open,false);

 // ---- No errors yet: the button is there, disabled, with 0 ----
 state.mine={'set-exam':[done({0:0},1)]};
 byType('PR2.1').click();await tick(150);
 assert.equal($('solverMistakes').disabled,true);assert.equal($('solverMistakesCount').textContent,'0');assert.match($('solverMistakes').title,/Nenhum erro/);
 // Material menus (Biblioteca) do not get the button.
 $('solverClose').click();await tick(60);
 w.location.hash='#biblioteca';await tick(120);q('[data-row] [data-solve]').click();await tick(120);assert.equal($('solverMistakes'),null);
 console.log('PASS solver mistakes: exam + subject lists, every question ever missed, errors round not saved, redo, leave confirm, exam without own list, empty state');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
