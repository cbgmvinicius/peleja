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
 const calls=[],state={sessions:[],lists:[{id:'set-1',materialId:'derm:1',title:'Micoses',count:3,fingerprint:'f',createdAt:'2026-11-01T00:00:00Z'},{id:'set-2',materialId:'derm:1',title:'Micoses 2',count:3,fingerprint:'h',createdAt:'2026-11-03T00:00:00Z'}]};
 const score=answers=>{let answered=0,correct=0;for(const [k,a] of Object.entries(answers))if(a.o!=null){answered++;if(questions[k].answerOptions[a.o].isCorrect)correct++;}return {answered,correct};};
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{calls.push([name,structuredClone(args)]);
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_set_update'){const s=state.lists.find(x=>x.id===args.p_id);s.title=args.p_title;return {data:null};}
  if(name==='question_sets_list')return {data:[...structuredClone(state.lists),{id:'set-exam',examId:'e1',title:'PR2.1 tudo em um',count:3,fingerprint:'g',createdAt:'2026-11-02T00:00:00Z'}]};
  if(name==='question_set')return {data:{id:'set-1',questions}};
  if(name==='quiz_sessions_counted')return {data:structuredClone(state.counted||[])};
  if(name==='quiz_sessions_mine')return {data:structuredClone(state.sessions)};
  if(name==='quiz_session_start'){state.sessions=state.sessions.filter(s=>s.status!=='active');const s={id:'s'+(state.sessions.length+1)+'-'+Date.now(),setId:args.p_set,mode:args.p_mode,clock:args.p_clock,timerSeconds:args.p_timer,layout:args.p_layout,answers:{},elapsedMs:0,status:'active',createdAt:new Date().toISOString()};state.sessions.unshift(s);return {data:s.id};}
  if(name==='quiz_session_save'){const s=state.sessions.find(x=>x.id===args.p_id);s.answers=args.p_answers;s.elapsedMs=args.p_elapsed;const r=score(args.p_answers);if(args.p_finish){const first=!state.sessions.some(x=>x.status==='done'&&x.counted&&x.setId===s.setId);Object.assign(s,{status:'done',...r,counted:first&&r.answered>0,finishedAt:new Date().toISOString()});return {data:{...r,counted:s.counted}};}return {data:{...r,counted:false}};}
  if(name==='quiz_session_delete'){const s=state.sessions.find(x=>x.id===args.p_id);if(!s)return {error:{message:'Sessão não encontrada'}};state.sessions=state.sessions.filter(x=>x!==s);return {data:{status:s.status,counted:!!s.counted}};}
  if(name==='save_workspace'){remote.payload=structuredClone(args.p_payload);remote.revision++;return {data:{revision:remote.revision,catalog_revision:1}};}
  return {data:true};},
  from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Aluno',role:globalThis.ROLE||'participant'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 const $=id=>w.document.getElementById(id);
 return {w,$,calls,state,remote,q:sel=>w.document.querySelector(sel),qa:sel=>[...w.document.querySelectorAll(sel)]};
}
const radio=(p,name,value)=>{const r=p.q(`input[name=${name}][value=${value}]`);r.checked=true;r.closest('fieldset').dispatchEvent(new p.w.Event('change',{bubbles:true}));};
const optionText=li=>li.querySelector('.solver-text').textContent;


const starts=calls=>calls.filter(([n])=>n==='quiz_session_start').map(c=>c[1]);
(async()=>{
 globalThis.ROLE='admin';
 const p=await app();const {w,$,q,qa,calls,state}=p;
 q('[data-row] [data-solve]').click();await tick(120);
 // two lists: cards to choose from, the admin can rename each
 const cards=qa('.solver-lists .solver-choice');assert.equal(cards.length,2);
 assert.equal(qa('.solver-rename').length,2,'admin sees the pencil');
 cards[0].querySelector('.solver-rename').click();await tick();
 const input=$('solverRenameInput');assert.equal(input.value,'Micoses');input.value='Micoses · lista A';$('solverRenameSave').click();await tick(80);
 const rename=calls.find(([n])=>n==='question_set_update')[1];assert.deepEqual(rename,{p_id:'set-1',p_title:'Micoses · lista A',p_questions:null});
 assert.match(q('.solver-lists').textContent,/Micoses · lista A/);
 // choose the second list: the session starts on it and the choice is remembered
 radio(p,'solverSet','set-2');await tick(60);
 // Personalizar: on click, key at the end, questions and options in order
 const opt=(k,v)=>{const i=q(`input[name=solverOpt-${k}][value=${v}]`);i.checked=true;i.dispatchEvent(new w.Event('change',{bubbles:true}));};
 opt('confirm','false');opt('reveal','end');opt('shuffleQuestions','false');opt('shuffleOptions','false');
 assert.equal(q('#solverCustomNote').hidden,false);assert.equal(q('#solverCustomNote').dataset.tip,'Personalizado: as suas escolhas abaixo');assert.equal(qa('input[name=solverMode]:checked').length,0,'no preset marked');
 $('solverStart').click();await tick(80);
 let s=starts(calls).at(-1);assert.equal(s.p_set,'set-2');assert.equal(s.p_mode,'prova');
 assert.deepEqual(s.p_layout.questions,[0,1,2]);for(const k of ['0','1','2'])assert.deepEqual(s.p_layout.options[k],questions[k].answerOptions.map((_,i)=>i));
 assert.deepEqual(s.p_layout.settings,{confirm:false,reveal:'end',shuffleQuestions:false,shuffleOptions:false});
 // marked on click, no confirmation button, no key yet
 qa('.solver-option')[1].querySelector('.solver-pick').click();await tick();
 assert.equal($('solverConfirm'),null);assert.equal(qa('.solver-why').length,0,'key only at the end');
 assert.equal(qa('.solver-option')[1].dataset.state,'marked');
 qa('.solver-option')[1].querySelector('.solver-pick').click();await tick();assert.equal(qa('.solver-option')[1].dataset.state,undefined,'tapping again clears it');
 qa('.solver-option')[0].querySelector('.solver-pick').click();await tick();
 // close keeping progress; the list and settings are remembered, the open session resumes the same way
 $('solverClose').click();await tick(60);if($('solverLeave').open){$('solverKeep').click();await tick(120);}
 q('[data-row] [data-solve]').click();await tick(150);
 assert.equal(q('input[name=solverSet]:checked').value,'set-2','last list remembered');
 assert.equal(q('#solverCustomNote').hidden,false,'last settings remembered');assert.equal(q('#solverAdvanced').open,false,'Personalizar does not open by itself');
 assert.match(q('.solver-resume small').textContent,/^Micoses · lista A · Personalizado · 1 de 3/);
 q('.solver-resume .primary').click();await tick(80);
 qa('.solver-option')[0].querySelector('.solver-pick').click();await tick();assert.equal($('solverConfirm'),null,'resumed with marking on click');
 // key after each answer + on click: revealed right away
 $('solverClose').click();await tick(60);if($('solverLeave').open){$('solverDiscard').click();await tick(120);}
 q('[data-row] [data-solve]').click();await tick(150);
 opt('reveal','each');$('solverStart').click();await tick(80);
 assert.equal(starts(calls).at(-1).p_mode,'treino');
 qa('.solver-option')[1].querySelector('.solver-pick').click();await tick();
 assert.ok(qa('.solver-why').length>0,'revealed on click');
 // members do not see the pencil
 console.log('PASS solver options: admin rename, choose list, Personalizar (click/confirm, key each/end, order/shuffle), remembered, resumed');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
