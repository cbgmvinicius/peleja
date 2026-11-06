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
 assert.match(tiles[2],/Horário de pico09h/);
 // Streak hero: lit today, 3 days, record 5, next milestone 7; the week shows Tue-Thu lit.
 const streak=$('pomoStreak');assert.equal(streak.dataset.state,'lit');assert.match(streak.textContent,/^3dias seguidos/);assert.match(streak.textContent,/Fogo aceso!/);
 assert.match(streak.textContent,/Recorde 5 dias/);assert.match(streak.textContent,/Próxima marca 7 dias · faltam 4/);
 assert.deepEqual([...streak.querySelectorAll('.pomo-streak-week li')].map(li=>li.dataset.state),['missed','missed','done','done','done','future','future']);
 assert.equal($('pomoStreakChip').dataset.state,'lit');assert.equal($('pomoStreakChip').textContent,'3');
 // Last 7 days: one column per day, today beats yesterday.
 const cols=[...w.document.querySelectorAll('.pomo-days li')];assert.equal(cols.length,7);assert.equal(cols[6].dataset.today,'true');
 assert.deepEqual(cols.map(c=>c.querySelector('.pomo-days-value').textContent),['25m','','','','40m','25m','1h15']);
 assert.ok(cols[6].querySelector('.pomo-days-mark'),'yesterday mark on today');
 assert.match($('pomoInsights').textContent,/Você já passou de ontem [(][+]50 min[)]/);
 assert.match(w.document.querySelector('.pomo-tasks').textContent,/Hematologia1h 55min · 70%/);
 assert.match($('pomoInsights').textContent,/Principal: Hematologia/);
 // year: weeks from the first focus (September) to now, each square with its day; a tap shows the day for 3 s
 const grid=w.document.querySelector('.pomo-year-grid'),weeks=grid.children.length/7;
 assert.ok(weeks>=9&&weeks<=11,'only the weeks since the first focus: '+weeks);assert.equal(grid.style.getPropertyValue('--weeks'),String(weeks));
 assert.equal(w.document.querySelector('[data-day="2026-11-05"]').textContent,'5');assert.equal(w.document.querySelector('[data-day="2026-11-05"]').dataset.today,'true');
 assert.equal($('pomoDayTip').hidden,true,'no balloon until a square is touched');
 w.document.querySelector('[data-day="2026-09-12"]').click();
 assert.equal($('pomoDayTip').hidden,false);assert.match($('pomoDayTip').textContent,/Sáb, 12 set30 min1 sessão/);
 w.document.querySelector('[data-day="2026-11-05"]').click();assert.match($('pomoDayTip').textContent,/Qui, 5 nov1h 15min2 sessões/);
 await new Promise(r=>setTimeout(r,3100));assert.equal($('pomoDayTip').hidden,true,'gone after 3 s');
 // a mouse shows it while hovering and hides it on leaving
 const PE=w.PointerEvent||w.MouseEvent,over=(type,target)=>{const ev=new PE(type,{bubbles:type!=='pointerleave'});Object.defineProperty(ev,'pointerType',{value:'mouse'});target.dispatchEvent(ev);};
 over('pointerover',w.document.querySelector('[data-day="2026-09-12"]'));assert.equal($('pomoDayTip').hidden,false);assert.match($('pomoDayTip').textContent,/12 set/);
 over('pointerleave',grid);assert.equal($('pomoDayTip').hidden,true);
 assert.equal(w.document.querySelector('[data-day="2026-11-05"]').dataset.level,'3');
 // Period: year includes September.
 [...w.document.querySelectorAll('.pomo-period button')].find(b=>b.textContent==='Ano').click();
 assert.match(w.document.querySelector('.pomo-tile').textContent,/5h 15min/);
 // A block finished now shows up at once (outbox), before the server has it.
 P.state().task='Nefro';$('pomoViewTimer').click();$('pomoPlay').click();p.advance(25*MIN);await new Promise(r=>setTimeout(r,700));
 $('pomoViewInsights').click();await new Promise(r=>setTimeout(r,80));
 assert.match(w.document.querySelector('.pomo-tasks').textContent,/Nefro/);
 assert.equal(new Set([...w.document.querySelectorAll('.pomo-tasks li span:first-child')].map(n=>n.textContent)).size,[...w.document.querySelectorAll('.pomo-tasks li')].length);
 // Next morning with no focus yet: the fire is at risk until midnight.
 p.advance(Date.parse(local([11,6],10))-p.now());$('pomoViewTimer').click();$('pomoViewInsights').click();
 assert.equal($('pomoStreak').dataset.state,'risk');assert.match($('pomoStreak').textContent,/próximas 14h 00min pra não perder 3 dias/);
 assert.match($('pomoStreak').textContent,/Defender o fogo agora/);assert.equal($('pomoStreakChip').dataset.state,'risk');
 assert.match($('pomoInsights').textContent,/Ontem foram 1h 40min[.] Bora igualar[?]/);
 // Two days later it is out; the record stays.
 p.advance(2*24*3600000);$('pomoViewTimer').click();$('pomoViewInsights').click();
 assert.equal($('pomoStreak').dataset.state,'out');assert.match($('pomoStreak').textContent,/^0dias seguidos/);assert.match($('pomoStreak').textContent,/Seu recorde é 5 dias/);
 $('pomoStreak').querySelector('.pomo-streak-go').click();assert.equal($('pomodoroPage').dataset.view,'timer');
 console.log('PASS pomodoro insights: fire lit/at risk/out with record and milestone, timer chip, last 7 days vs yesterday, period totals, peak hour, tasks, year days, new blocks at once');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
