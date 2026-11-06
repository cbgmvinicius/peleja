const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const MIN=60000;

let mine=[];
async function app(){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#biblioteca'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let clock=Date.parse('2026-11-05T12:00:00Z');w.PELEJA_NOW=()=>clock;
 // Audio stub: records every sound created, its volume and whether it is playing.
 const sounds=[];w.Audio=class{constructor(src){this.src=src;this.volume=1;this.paused=true;this.loop=false;sounds.push(this);}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}};
 const remote={revision:1,catalog_revision:1,catalog:{materials:[],simulations:[],exams:[]},payload:{materials:[],exams:[],simulations:[],courses:[]}};
 const saved=[],mineCalls=[];let failSave=false;
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list'||name==='quiz_sessions_mine')return {data:[]};
  if(name==='pomodoro_blocks_mine'){mineCalls.push(args);return {data:structuredClone(mine)};}
  if(name==='pomodoro_block_save'){if(failSave)throw Error('offline');saved.push(args);mine.unshift({id:args.p_id,task:args.p_task,startedAt:args.p_started,endedAt:args.p_ended,focusMs:args.p_focus_ms,plannedMs:args.p_planned_ms,flowExtraMs:args.p_flow_extra_ms});return {data:null};}
  return {data:true};},
  from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Aluno',role:'participant'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 return {mineCalls,w,$:id=>w.document.getElementById(id),sounds,saved,setFail:v=>{failSave=v;},advance:ms=>{clock+=ms;},now:()=>clock};
}

// Clock: Thu 2026-11-05 15:00 local. Blocks on Nov 5, 4, 3 (streak 3), Oct 30 and a 5-day run in September (best 5).
const local=(d,h,m=0)=>new Date(2026,d[0]-1,d[1],h,m).toISOString();
const block=(id,day,h,min,task,extra=0)=>({id,task,startedAt:local(day,h),endedAt:local(day,h,min),focusMs:min*MIN,plannedMs:25*MIN,flowExtraMs:extra*MIN});
mine=[block('a',[11,5],9,50,'Hematologia',25),block('b',[11,5],10,25,'Hematologia'),block('c',[11,4],9,25,'Cardio'),block('d',[11,3],21,40,'Hematologia'),block('e',[10,30],9,25,'Cardio'),
 ...[10,11,12,13,14].map((d,i)=>block('s'+i,[9,d],8,30,'Revisão'))];
(async()=>{
 const p=await app(),{w,$}=p,P=w.PELEJA_POMODORO;
 p.advance(Date.parse(local([11,5],15))-p.now());
 $('navPomodoro').click();await p.tick?.();
 assert.equal($('pomoInsights').hidden,true);
 $('pomoViewInsights').click();await new Promise(r=>setTimeout(r,80));
 assert.equal($('pomoInsights').hidden,false);assert.equal($('pomodoroPage').dataset.view,'insights');
 assert.equal(p.mineCalls.length,1);
 const tiles=[...w.document.querySelectorAll('.pomo-tile')].map(t=>t.textContent);
 // week: Oct 30 .. Nov 5 → 50+25+25+40+25 = 165 min in 5 sessions over 4 days
 assert.match(tiles[0],/Foco total2h 45min/);assert.match(tiles[0],/4 dias/);
 assert.match(tiles[1],/^Sessões5/);assert.match(tiles[1],/[+]25 min no flow/);
 assert.match(tiles[2],/Sequência3 dias/);assert.match(tiles[2],/Melhor: 5 dias/);
 assert.match(tiles[3],/09h/);
 assert.match(w.document.querySelector('.pomo-tasks').textContent,/Hematologia1h 55min · 70%/);
 assert.match($('pomoInsights').textContent,/Principal: Hematologia/);
 // year: today selected with its total; clicking another day shows it
 assert.match($('pomoDayDetail').textContent,/5 nov · 1h 15min de foco em 2 sessões/);
 w.document.querySelector('[data-day="2026-09-12"]').click();assert.match($('pomoDayDetail').textContent,/12 set · 30 min de foco em 1 sessão/);
 assert.equal(w.document.querySelector('[data-day="2026-11-05"]').dataset.level,'3');
 // Period: year includes September.
 [...w.document.querySelectorAll('.pomo-period button')].find(b=>b.textContent==='Ano').click();
 assert.match(w.document.querySelector('.pomo-tile').textContent,/5h 15min/);
 // A block finished now shows up at once (outbox), before the server has it.
 P.state().task='Nefro';$('pomoViewTimer').click();$('pomoPlay').click();p.advance(25*MIN);await new Promise(r=>setTimeout(r,700));
 $('pomoViewInsights').click();await new Promise(r=>setTimeout(r,80));
 assert.match(w.document.querySelector('.pomo-tasks').textContent,/Nefro/);
 assert.equal(new Set([...w.document.querySelectorAll('.pomo-tasks li span:first-child')].map(n=>n.textContent)).size,[...w.document.querySelectorAll('.pomo-tasks li')].length);
 console.log('PASS pomodoro insights: streak and best, period totals, flow extra, peak hour, tasks share, year days, week hours, new blocks at once');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
