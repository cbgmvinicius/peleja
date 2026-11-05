const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const MIN=60000;

async function app(){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#biblioteca'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let clock=Date.parse('2026-11-05T12:00:00Z');w.PELEJA_NOW=()=>clock;
 // Audio stub: records every sound created, its volume and whether it is playing.
 const sounds=[];w.Audio=class{constructor(src){this.src=src;this.volume=1;this.paused=true;this.loop=false;sounds.push(this);}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}};
 const remote={revision:1,catalog_revision:1,catalog:{materials:[],simulations:[],exams:[]},payload:{materials:[],exams:[],simulations:[],courses:[]}};
 const saved=[];let failSave=false;
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list'||name==='quiz_sessions_mine')return {data:[]};
  if(name==='pomodoro_block_save'){if(failSave)throw Error('offline');saved.push(args);return {data:null};}
  return {data:true};},
  from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Aluno',role:'participant'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 return {w,$:id=>w.document.getElementById(id),sounds,saved,setFail:v=>{failSave=v;},advance:ms=>{clock+=ms;},now:()=>clock};
}

(async()=>{
 const p=await app(),{w,$,sounds,saved}=p,P=w.PELEJA_POMODORO;
 const ambient=()=>sounds.filter(s=>s.loop).at(-1),chimes=()=>sounds.filter(s=>!s.loop).map(s=>s.src.match(/sounds\/(\w+)/)[1]);
 const settle=async()=>{p.advance(2000);await tick(120);};

 // Navigation: its own tab, hides the other pages and is hidden again by them.
 $('navPomodoro').click();await tick();
 assert.equal($('pomodoroPage').hidden,false);assert.equal($('libraryPage').hidden,true);assert.ok($('navPomodoro').classList.contains('selected'));
 await tick(50);assert.equal(w.location.hash,'#pomodoro');
 $('navLibrary').click();await tick();assert.equal($('pomodoroPage').hidden,true);assert.equal($('libraryPage').hidden,false);
 $('navPomodoro').click();await tick();
 // Phone bar: Pomodoro takes the Simulados slot; Simulados moves into "Mais".
 assert.ok(w.document.querySelector('.mobile-tabs [data-target=navPomodoro]'));assert.equal(w.document.querySelector('.mobile-tabs [data-target=navMocks]'),null);
 assert.ok(w.document.querySelector('.mobile-sheet [data-target=navMocks]'));

 // Task and sound through their dialogs.
 $('pomoTask').click();$('pomoTaskInput').value='  Hematologia  ';$('pomoDialog').querySelector('.primary').click();
 assert.equal($('pomoTaskName').textContent,'Hematologia');
 $('pomoSoundBtn').click();$('pomoSoundOn').checked=true;$('pomoDialog').querySelector('[data-sound=forest]').click();$('pomoDialog').querySelector('.primary').click();
 assert.equal(P.state().sound.id,'forest');assert.equal(P.state().sound.enabled,true);
 assert.equal(ambient(),undefined,'no ambient while idle');

 // Play: focus with the ambient at full volume.
 $('pomoPlay').click();await settle();
 assert.equal($('pomoStatus').dataset.on,'true');assert.match(ambient().src,/forest/);assert.equal(ambient().paused,false);assert.ok(ambient().volume>.95);
 // Manual pause silences, the same button resumes.
 $('pomoPlay').click();await settle();assert.equal(P.state().timer.status,'paused');assert.ok(ambient().volume<.01);assert.equal(ambient().paused,true);
 p.advance(10*MIN);P.advance();assert.equal(P.state().timer.mode,'focus','paused time does not count');
 $('pomoPlay').click();await settle();assert.equal(P.state().timer.status,'running');assert.ok(ambient().volume>.95);
 // Mute chip.
 $('pomoSoundChip').click();await settle();assert.ok(ambient().volume<.01);$('pomoSoundChip').click();await settle();assert.ok(ambient().volume>.95);

 // End of focus: short break starts by itself, block saved, ambient ducks, chime.
 p.advance(25*MIN);await tick(700);
 assert.equal(P.state().timer.mode,'short');assert.equal(P.state().timer.status,'running');assert.equal(P.state().timer.setsDone,1);
 assert.equal(saved.length,1);assert.equal(saved[0].p_task,'Hematologia');assert.equal(saved[0].p_focus_ms,25*MIN);assert.equal(saved[0].p_flow_extra_ms,0);
 assert.ok(chimes().includes('session_end'));await settle();assert.ok(Math.abs(ambient().volume-.1)<.02,'ducked during the break');
 assert.equal($('pomoDone').textContent,'1');
 // End of the break: focus again on its own.
 p.advance(5*MIN);await tick(700);assert.equal(P.state().timer.mode,'focus');assert.ok(chimes().includes('session_start'));
 await settle();assert.ok(ambient().volume>.95);

 // Flowmodoro: at the minimum the focus keeps counting; "Começar pausa" records the extra.
 $('pomoSetsBtn').click();$('pomoFlowOn').checked=true;$('pomoDialog').querySelector('.primary').click();
 assert.equal($('pomoFlowBreak').hidden,false);
 const chimesBefore=chimes().length;
 p.advance(25*MIN+3*MIN);await tick(700);
 assert.equal(P.state().timer.mode,'focus','still focusing past the minimum');assert.equal(P.state().timer.flowNotified,true);assert.equal(chimes().length,chimesBefore+1);
 assert.match($('pomoTime').textContent,/^\+0?\d:\d\d/);
 $('pomoFlowBreak').click();await tick();
 assert.equal(P.state().timer.mode,'short');assert.equal(saved.length,2);assert.ok(saved[1].p_flow_extra_ms>=3*MIN-2000);assert.equal(saved[1].p_planned_ms,25*MIN);

 // Offline: the block waits in the outbox and goes when the connection comes back.
 $('pomoSetsBtn').click();$('pomoFlowOn').checked=false;$('pomoDialog').querySelector('.primary').click();
 p.advance(5*MIN);await tick(700);assert.equal(P.state().timer.mode,'focus');
 p.setFail(true);p.advance(25*MIN);await tick(700);assert.equal(saved.length,2);assert.equal(P.outbox().length,1);
 p.setFail(false);w.dispatchEvent(new w.Event('online'));await tick(80);assert.equal(saved.length,3);assert.equal(P.outbox().length,0);

 // Catch-up after the tab was away: the last set finishes and the session stops at the goal.
 assert.equal(P.state().timer.setsDone,3);
 assert.equal(P.state().timer.mode,'long','long break after set 3 of 4');p.advance(15*MIN+25*MIN+1000);P.advance();P.render();
 assert.equal(P.state().timer.status,'idle');assert.equal(saved.length,4);assert.equal($('pomoLeft').textContent,'Meta concluída');
 await settle();assert.ok(ambient().volume<.01,'no sound when idle');

 // Stop mid-focus records what was done (one minute or more), under a minute records nothing.
 $('pomoPlay').click();p.advance(40*1000);P.actions.stop();assert.equal(saved.length,4);
 $('pomoPlay').click();p.advance(12*MIN);P.actions.stop();await tick(40);assert.equal(saved.length,5);assert.equal(saved[4].p_focus_ms,12*MIN);

 // Settings: a Pomodoro section under Peleja.
 assert.ok($('pomodoroSettingsEdit'));$('pomodoroSettingsEdit').click();assert.equal($('pomodoroSettingsPanel').hidden,false);
 $('pomoPrefEffects').click();assert.equal(P.state().prefs.effects,false);
 console.log('PASS pomodoro: tab and phone bar, task/sound dialogs, loud focus, silent pause, ducked break, auto break/focus, flow extra, outbox, catch-up to goal, stop, settings');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
