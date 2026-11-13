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
  {id:'derm:2',title:'D10 Acne',subject:'Dermatologia',classDate:'2026-10-11'}],simulations:[],exams:[{id:'e1',subject:'Dermatologia',type:'PR2.1',date:'2099-12-31',materialIds:['derm:1','derm:2']},{id:'e2',subject:'Dermatologia',type:'PR2.2',date:'2100-01-15',materialIds:['derm:2']}]},
  payload:{materials:[],exams:[],simulations:[],courses:[],questionSessions:[]}};
 const calls=[],state={sessions:[]};
 const score=answers=>{let answered=0,correct=0;for(const [k,a] of Object.entries(answers))if(a.o!=null){answered++;if(questions[k].answerOptions[a.o].isCorrect)correct++;}return {answered,correct};};
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{calls.push([name,structuredClone(args)]);
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list')return {data:[{id:'set-1',materialId:'derm:1',title:'Micoses',count:3,fingerprint:'f',createdAt:'2026-11-01T00:00:00Z'},{id:'set-exam',examId:'e1',title:'PR2.1 tudo em um',count:3,fingerprint:'g',createdAt:'2026-11-02T00:00:00Z'}]};
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
const pickOpt=(p,name,value)=>{const r=p.q(`input[name=${name}][value=${value}]`);r.checked=true;r.dispatchEvent(new p.w.Event('change',{bubbles:true}));};
const radio=(p,name,value)=>{const r=p.q(`input[name=${name}][value=${value}]`);r.checked=true;r.dispatchEvent(new p.w.Event('change',{bubbles:true}));};

(async()=>{
 const p=await app();const {w,$,q,qa,state}=p;
 const press=(key,extra={})=>{w.document.activeElement?.blur?.();w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...extra}));return tick();};
 const current=()=>state.sessions[0];
 const layoutQ=()=>{const s=current();return s.layout.questions[Number(q('#solverKicker').textContent.match(/(\d+) \//)[1])-1];};
 // A choice saved back when Treino asked for confirmation is read as the new Treino (on click).
 w.localStorage.setItem('peleja-solver-v1',JSON.stringify({settings:{confirm:true,reveal:'each',shuffleQuestions:false,shuffleOptions:true}}));
 q('[data-solve]').click();await tick(120);
 assert.equal(q('input[name=solverMode][value=treino]').checked,true,'old Treino stays Treino');assert.equal(q('input[name=solverOpt-confirm][value=false]').checked,true,'and now marks on click');
 assert.equal(JSON.parse(w.localStorage.getItem('peleja-solver-v1')).clickDefault,true,'read once');
 // ---- Treino (on click): a number marks that letter at once and shows the key ----
 $('solverStart').click();await tick(80);
 let qi=layoutQ(),opts=current().layout.options[qi];
 await press('2');
 await tick(20);assert.equal(qa('.solver-option')[1].dataset.state!=null,true);
 // the server copy is saved later; the screen shows it answered with the key open
 assert.ok(q('.solver-why'),'key shown right away');assert.equal($('solverConfirm'),null);
 const picked=qa('.solver-option')[1];assert.equal(optionText(picked),questions[qi].answerOptions[opts[1]].text,'2 = the second letter on screen (shuffled options)');
 assert.match(picked.dataset.state,/right|wrong/);
 await press('1');assert.equal(qa('.solver-option')[1].dataset.state,picked.dataset.state,'answered: other numbers do nothing');
 await press('ArrowRight');assert.match(q('#solverKicker').textContent,/^2 \/ 3/);
 await press('ArrowLeft');assert.match(q('#solverKicker').textContent,/^1 \/ 3/);await press('ArrowRight');
 await press('1',{ctrlKey:true});assert.equal(q('.solver-why'),null,'Ctrl+1 is not a shortcut');
 await press('9');assert.equal(q('.solver-why'),null,'no option 9');
 // a struck-out option ignores its number
 qa('.solver-option')[0].querySelector('.solver-cut').click();await tick();await press('1');assert.equal(q('.solver-why'),null,'struck out: ignored');
 assert.match(q('.solver-keys').textContent,/1–5 marcam/);
 // ---- Personalizar > Com confirmação: a number only selects; Enter records it ----
 $('solverClose').click();await tick(60);if($('solverLeave').open){$('solverDiscard').click();await tick(80);}
 q('[data-solve]').click();await tick(120);radio(p,'solverMode','prova');pickOpt(p,'solverOpt-confirm','true');
 $('solverStart').click();await tick(80);
 await press('2');assert.equal(qa('.solver-option')[1].dataset.state,'chosen','selected, not answered');assert.equal(Object.keys(current().answers).length,0);
 assert.match(q('.solver-keys').textContent,/1–5 selecionam · Enter confirma/);
 await press('Enter');await tick(20);assert.match(q('#solverKicker').textContent,/^2 \/ 3/,'Enter records and moves on (key at the end)');
 await press('ArrowLeft');assert.equal(qa('.solver-option')[1].dataset.state,'marked');
 // The keys line hides on touch screens (CSS media query).
 assert.match(fs.readFileSync(path.join(root,'solver.css'),'utf8'),/@media \(hover:hover\) and \(pointer:fine\)\{\.solver-keys\{display:block\}\}/);
 console.log('PASS solver keys: 1–5 mark on click / select with confirmation (shuffled, struck-out and answered ignored, no Ctrl), Enter confirms, arrows move, quick modes on click, old saved Treino migrates');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
