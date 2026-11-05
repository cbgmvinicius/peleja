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
  {id:'derm:2',title:'D10 Acne',subject:'Dermatologia',classDate:'2026-10-11'}],simulations:[],exams:[{id:'e1',subject:'Dermatologia',type:'PR2.1',date:'2099-12-31',materialIds:['derm:1','derm:2']}]},
  payload:{materials:[],exams:[],simulations:[],courses:[],questionSessions:[]}};
 const calls=[],state={sessions:[]};
 const score=answers=>{let answered=0,correct=0;for(const [k,a] of Object.entries(answers))if(a.o!=null){answered++;if(questions[k].answerOptions[a.o].isCorrect)correct++;}return {answered,correct};};
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{calls.push([name,structuredClone(args)]);
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list')return {data:[{id:'set-1',materialId:'derm:1',title:'Micoses',count:3,fingerprint:'f',createdAt:'2026-11-01T00:00:00Z'}]};
  if(name==='question_set')return {data:{id:'set-1',questions}};
  if(name==='quiz_sessions_mine')return {data:structuredClone(state.sessions)};
  if(name==='quiz_session_start'){state.sessions=state.sessions.filter(s=>s.status!=='active');const s={id:'s'+(state.sessions.length+1),mode:args.p_mode,clock:args.p_clock,timerSeconds:args.p_timer,layout:args.p_layout,answers:{},elapsedMs:0,status:'active',createdAt:new Date().toISOString()};state.sessions.unshift(s);return {data:s.id};}
  if(name==='quiz_session_save'){const s=state.sessions.find(x=>x.id===args.p_id);s.answers=args.p_answers;s.elapsedMs=args.p_elapsed;const r=score(args.p_answers);if(args.p_finish){const first=!state.sessions.some(x=>x.status==='done'&&x.counted);Object.assign(s,{status:'done',...r,counted:first&&r.answered>0,finishedAt:new Date().toISOString()});return {data:{...r,counted:s.counted}};}return {data:{...r,counted:false}};}
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
const radio=(p,name,value)=>{const r=p.q(`input[name=${name}][value=${value}]`);r.checked=true;r.closest('fieldset').dispatchEvent(new p.w.Event('change',{bubbles:true}));};
const optionText=li=>li.querySelector('.solver-text').textContent;

(async()=>{
 const p=await app();const {w,$,q,qa,calls,state,remote}=p;
 // Library: the material with questions shows "Resolver questões"; the other keeps the round target.
 const row1=q('[data-row] [data-solve]'),rows=qa('[data-row]');assert.ok(row1,'solve button');assert.equal(rows.length,2);
 assert.equal(rows[0].querySelector('[data-questions]'),null);assert.ok(rows[1].querySelector('[data-questions]'));
 // "Mais ações" opens for members with only "Registrar questões externas".
 const more=rows[0].querySelector('[data-edit-menu]');assert.equal(more.hidden,false);more.click();await tick();
 assert.equal($('rowMenu').hidden,false);assert.equal($('registerQuestions').hidden,false);assert.equal(w.getComputedStyle($('editSubject')).display,'none');
 $('registerQuestions').click();await tick();assert.equal($('questionsDialog').open,true);$('questionsClose').click();await tick();
 // Ranking / dashboard use "Apostilas".
 assert.match(fs.readFileSync(path.join(root,'connected-simulations.js'),'utf8'),/data-kind="materials">Apostilas</);assert.match(fs.readFileSync(path.join(root,'dashboard.js'),'utf8'),/>Apostilas<\/button>/);

 // ---- Treino ----
 row1.click();await tick(80);
 assert.equal($('solverDialog').open,true);assert.equal($('solverTitle').textContent,'D09 Micoses');
 $('solverStart').click();await tick(80);
 const start=calls.find(([n])=>n==='quiz_session_start')[1];
 assert.deepEqual(start.p_layout.questions,[0,1,2],'training keeps question order');
 for(const k of ['0','1','2'])assert.deepEqual([...start.p_layout.options[k]].sort(),questions[k].answerOptions.map((_,i)=>i),'options are a permutation');
 assert.equal(q('#solverKicker').textContent,'1 / 3');assert.equal(q('.solver-stem').textContent,'Q1 <b>agente</b>?','stem stays text');
 // Scissors: strike and lock an option, then bring it back.
 let options=qa('.solver-option');const wrongLi=options.find(li=>optionText(li)==='Candida');
 wrongLi.querySelector('.solver-cut').click();await tick();
 let cut=qa('.solver-option').find(li=>optionText(li)==='Candida');assert.ok(cut.hasAttribute('data-cut'));assert.equal(cut.querySelector('.solver-pick').disabled,true);
 // Hint toggles.
 q('.solver-hint-toggle').click();assert.equal(q('.solver-hint').hidden,false);
 // Answer correctly: key and every comment appear, and the answer is locked.
 qa('.solver-option').find(li=>optionText(li)==='Malassezia').querySelector('.solver-pick').click();await tick();
 options=qa('.solver-option');assert.equal(options.find(li=>optionText(li)==='Malassezia').dataset.state,'right');
 assert.equal(qa('.solver-why').length,3,'all comments shown');assert.ok(options.every(li=>li.querySelector('.solver-pick').disabled));assert.equal(q('.solver-cut'),null);
 // Q2 wrong, Q3 skipped.
 qa('#solverFoot button').find(b=>b.textContent==='Próxima').click();await tick();
 qa('.solver-option').find(li=>optionText(li)==='Nistatina').querySelector('.solver-pick').click();await tick();
 assert.equal(qa('.solver-option').find(li=>optionText(li)==='Nistatina').dataset.state,'wrong');assert.equal(qa('.solver-option').find(li=>optionText(li)==='Griseofulvina').dataset.state,'right');
 qa('#solverFoot button').find(b=>b.textContent==='Próxima').click();await tick();
 assert.equal(q('#solverKicker').textContent,'3 / 3');
 qa('#solverFoot button').find(b=>b.textContent==='Finalizar').click();await tick();
 assert.equal($('confirmDialog').open,true,'skipped questions need confirmation');$('confirmAccept').click();await tick(120);
 // Result: 1/3, recorded once as a round of the material.
 assert.match(q('.solver-score strong').textContent,/^1\/3/);
 const counts=Object.fromEntries(qa('.solver-filters button').map(b=>[b.dataset.kind,b.querySelector('small').textContent]));assert.deepEqual(counts,{all:'3',right:'1',wrong:'1',skipped:'1'});
 const saves=calls.filter(([n])=>n==='save_workspace');assert.equal(saves.length,1);
 const entry=remote.payload.materials.find(m=>m.id==='derm:1').questionEntries.find(e=>e.id.startsWith('quiz-'));
 assert.equal(entry.questions,2);assert.equal(entry.correct,1);assert.equal(entry.wrong,1);
 // Review opens a question with the key.
 qa('.solver-review-list button')[1].click();await tick();assert.match(q('#solverKicker').textContent,/REVISÃO · 2 \/ 3/);assert.equal(qa('.solver-why').length,2);
 qa('#solverFoot button').find(b=>b.textContent==='Voltar ao resultado').click();await tick();
 // Redo missed: a new session with the wrong + skipped questions, not counted again.
 qa('#solverFoot button').find(b=>b.textContent==='Refazer erradas').click();await tick(80);
 const redo=calls.filter(([n])=>n==='quiz_session_start').at(-1)[1];assert.deepEqual(redo.p_layout.questions,[1,2]);
 assert.equal(q('#solverKicker').textContent,'1 / 2');
 qa('.solver-option').find(li=>optionText(li)==='Griseofulvina').querySelector('.solver-pick').click();await tick();
 // Close mid-session: progress is saved and can be resumed.
 $('solverClose').click();await tick(120);assert.equal($('solverDialog').open,false);
 const open=state.sessions.find(s=>s.status==='active');assert.deepEqual(Object.keys(open.answers),['1']);
 q('[data-solve]').click();await tick(120);
 const resume=qa('.solver-resume button').find(b=>b.textContent==='Continuar');assert.ok(resume,'resume offered');
 resume.click();await tick(80);assert.equal(q('#solverKicker').textContent,'2 / 2','resumes at the first unanswered question');
 $('solverClose').click();await tick(80);

 // ---- Prova ----
 q('[data-solve]').click();await tick(120);
 radio(p,'solverMode','prova');radio(p,'solverClock','timer');assert.equal(q('.solver-minutes').hidden,false);
 q('#solverMinutes').value='2';$('solverStart').click();await tick(80);
 const exam=calls.filter(([n])=>n==='quiz_session_start').at(-1)[1];assert.equal(exam.p_mode,'prova');assert.equal(exam.p_timer,120);
 assert.deepEqual([...exam.p_layout.questions].sort(),[0,1,2]);
 const first=exam.p_layout.questions[0];
 // Choosing does not reveal the key and can be changed.
 let picks=qa('.solver-pick');picks[0].click();await tick();assert.equal(qa('.solver-option')[0].dataset.state,'chosen');assert.equal(q('.solver-why'),null);
 qa('.solver-pick')[1].click();await tick();assert.equal(qa('.solver-option')[1].dataset.state,'chosen');assert.equal(qa('.solver-option')[0].dataset.state,undefined);
 assert.match(q('#solverClock').textContent,/^0[12]:[0-5]\d$/,'timer counts down');
 qa('#solverFoot button').find(b=>b.textContent==='Finalizar prova').click();await tick();$('confirmAccept').click();await tick(120);
 assert.match(q('#solverKicker').textContent,/RESULTADO DA PROVA/);
 const examSave=calls.filter(([n])=>n==='quiz_session_save').at(-1)[1];assert.equal(examSave.p_finish,true);
 assert.equal(examSave.p_answers[first].o,exam.p_layout.options[first][1]);
 assert.equal(calls.filter(([n])=>n==='save_workspace').length,1,'later sessions do not count again');
 console.log('PASS solver: solve button and menu, training reveal/lock/scissors/hint, result + stats round once, review, redo missed, resume, exam shuffle/change/timer');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
