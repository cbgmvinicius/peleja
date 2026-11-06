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
  if(name==='question_sets_list'||name==='quiz_sessions_mine'||name==='pomodoro_blocks_mine')return {data:[]};
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
 const ambient=()=>sounds.filter(s=>s.loop&&!s.preview).at(-1),chimes=()=>sounds.filter(s=>!s.loop).map(s=>s.src.match(/sounds\/(\w+)/)[1]);
 const settle=async()=>{p.advance(2000);await tick(120);};
 const save=()=>$('pomoDialog').querySelector('.pomo-sheet-save').click();

 // Navigation: its own tab, hides the other pages and is hidden again by them.
 $('navPomodoro').click();await tick();
 assert.equal($('pomodoroPage').hidden,false);assert.equal($('libraryPage').hidden,true);assert.ok($('navPomodoro').classList.contains('selected'));
 await tick(50);assert.equal(w.location.hash,'#pomodoro');
 $('navLibrary').click();await tick();assert.equal($('pomodoroPage').hidden,true);assert.equal($('libraryPage').hidden,false);
 $('navPomodoro').click();await tick();
 assert.ok(w.document.querySelector('.mobile-tabs [data-target=navPomodoro]'));assert.equal(w.document.querySelector('.mobile-tabs [data-target=navMocks]'),null);
 assert.ok(w.document.querySelector('.mobile-sheet [data-target=navMocks]'));

 // Idle, like Sessions: invitation in the ring, duration cards, Som | Play | Séries.
 assert.match($('pomoSetLine').textContent,/Aperte o play/);assert.equal($('pomoConfig').hidden,false);assert.equal($('pomoGoal').hidden,true);
 assert.match($('pomoSideLeft').textContent,/Som/);assert.match($('pomoSideRight').textContent,/Séries/);assert.equal($('pomoStatus').textContent,'Parado');
 assert.equal($('pomoSoundChip').disabled,true,'no sound chosen: the chip does nothing');
 // Duration card: slider 5..120 for focus.
 w.document.querySelector('[data-duration=focus]').click();const d=$('pomoDurationValue');assert.equal(d.min,'5');assert.equal(d.max,'120');
 d.value='30';d.dispatchEvent(new w.Event('input'));[...$('pomoDialog').querySelectorAll('button')].find(b=>b.textContent==='Usar este tempo').click();
 assert.equal(P.state().config.focusMin,30);assert.equal($('pomoFocusMin').textContent,'30 min');
 P.state().config.focusMin=25;P.render();

 // Task sheet: set a task, save it as a template, change config, update template, apply template.
 $('pomoTask').click();$('pomoTaskInput').value='Hematologia';$('pomoTaskInput').dispatchEvent(new w.Event('input'));
 assert.match($('pomoTemplateSave').textContent,/^Salvar como rotina/);$('pomoTemplateSave').click();
 assert.equal(P.state().templates.length,1);assert.match($('pomoTemplateSave').textContent,/^Rotina salva/);
 $('pomoSetTask').click();assert.equal($('pomoTaskName').textContent,'Hematologia');
 P.state().config.shortMin=10;$('pomoTask').click();$('pomoTaskInput').dispatchEvent(new w.Event('input'));assert.match($('pomoTemplateSave').textContent,/^Atualizar rotina/);
 $('pomoTemplateSave').click();assert.equal(P.state().templates[0].shortMin,10);$('pomoDialog').close();
 P.state().config.shortMin=5;P.state().task='';P.render();
 $('pomoTask').click();$('pomoDialog').querySelector('.pomo-template').click();
 assert.equal(P.state().task,'Hematologia');assert.equal(P.state().config.shortMin,10);
 P.state().config.shortMin=5;P.render();

 // Sound sheet: switch on, pick Floresta (preview loops while open), save.
 $('pomoSideLeft').click();assert.equal($('pomoDialog').dataset.kind,'sound');
 $('pomoSoundOn').checked=true;$('pomoSoundOn').dispatchEvent(new w.Event('change'));
 $('pomoDialog').querySelector('[data-sound=forest]').click();const prev=sounds.at(-1);assert.match(prev.src,/forest/);assert.equal(prev.loop,true);assert.equal(prev.paused,false);
 for(const s of sounds)if(s.loop)s.preview=true;
 save();assert.equal(prev.paused,true,'preview stops with the sheet');
 assert.equal(P.state().sound.id,'forest');assert.equal(P.state().sound.enabled,true);assert.equal($('pomoSoundChip').textContent,'Floresta');
 assert.equal(ambient(),undefined,'no ambient while idle');

 // Play: focus with the ambient at full volume; side buttons become Descartar / Concluir; task locked.
 $('pomoPlay').click();await settle();
 assert.equal($('pomoStatus').textContent,'Ativo');assert.equal($('pomoSoundChip').dataset.state,'playing');
 assert.match($('pomoSideLeft').textContent,/Descartar/);assert.match($('pomoSideRight').textContent,/Concluir/);assert.equal($('pomoTask').disabled,true);
 assert.equal($('pomoConfig').hidden,true);assert.equal($('pomoGoal').hidden,false);assert.equal($('pomoDone').textContent,'1');assert.equal($('pomoTarget').textContent,' de 4');
 assert.match(ambient().src,/forest/);assert.equal(ambient().paused,false);assert.ok(ambient().volume>.95);
 // Pause: silent, status Parado, same button resumes; Skip only while running.
 $('pomoPlay').click();await settle();assert.equal(P.state().timer.status,'paused');assert.equal($('pomoStatus').textContent,'Parado');assert.ok(ambient().volume<.01);assert.equal($('pomoSkip').disabled,true);
 p.advance(10*MIN);P.advance();assert.equal(P.state().timer.mode,'focus','paused time does not count');
 $('pomoPlay').click();await settle();assert.equal(P.state().timer.status,'running');assert.ok(ambient().volume>.95);
 // Sound chip toggles mute.
 $('pomoSoundChip').click();await settle();assert.equal($('pomoSoundChip').textContent,'Mudo');assert.ok(ambient().volume<.01);$('pomoSoundChip').click();await settle();assert.ok(ambient().volume>.95);

 // End of focus: short break starts by itself, block saved, ambient ducks, chime.
 p.advance(25*MIN);await tick(700);
 assert.equal(P.state().timer.mode,'short');assert.equal(P.state().timer.setsDone,1);assert.equal($('pomoMode').textContent,'Pausa curta');
 assert.equal(saved.length,1);assert.equal(saved[0].p_task,'Hematologia');assert.equal(saved[0].p_focus_ms,25*MIN);
 assert.ok(chimes().includes('session_end'));await settle();assert.ok(Math.abs(ambient().volume-.1)<.02,'ducked during the break');
 p.advance(5*MIN);await tick(700);assert.equal(P.state().timer.mode,'focus');assert.equal($('pomoDone').textContent,'2');

 // Skip: the focus counts as a set right away.
 p.advance(3*MIN);$('pomoSkip').click();await tick();assert.equal(P.state().timer.mode,'short');assert.equal(saved.length,2);assert.ok(Math.abs(saved[1].p_focus_ms-3*MIN)<15000);

 // Discard: back to idle, nothing recorded.
 p.advance(MIN);$('pomoSideLeft').click();assert.equal(P.state().timer.status,'idle');assert.equal(saved.length,2);assert.equal($('pomoConfig').hidden,false);

 // Finish under a minute: "too short" notice, nothing saved.
 $('pomoPlay').click();p.advance(30*1000);$('pomoSideRight').click();
 assert.equal(P.state().timer.status,'idle');assert.match($('pomoIdleLabel').textContent,/Menos de 1 minuto/);assert.equal(saved.length,2);
 // Finish with sets left asks first, then saves.
 $('pomoPlay').click();p.advance(12*MIN);$('pomoSideRight').click();assert.equal(P.state().timer.status,'running','asks before finishing');
 assert.match(w.document.getElementById('confirmDialog').textContent,/Ainda faltam 3 séries/);w.document.getElementById('confirmAccept').click();await tick();
 assert.equal(P.state().timer.status,'idle');assert.equal(saved.length,3);assert.equal(saved[2].p_focus_ms,12*MIN);

 // Flowmodoro (set in Séries): at the minimum the focus keeps counting; "Começar pausa" records the extra.
 $('pomoSideRight').click();assert.equal($('pomoDialog').dataset.kind,'sets');
 $('pomoFlowOn').checked=true;const ts=$('pomoTargetSets');ts.value='2';ts.dispatchEvent(new w.Event('input'));save();
 assert.equal(P.state().config.flow,true);assert.equal(P.state().config.targetSets,2);assert.equal(P.state().config.longEvery,1,'interval capped at sets - 1');
 $('pomoPlay').click();assert.equal($('pomoFlowBreak').hidden,false);
 const before=chimes().length;p.advance(25*MIN+3*MIN);await tick(700);
 assert.equal(P.state().timer.mode,'focus');assert.equal(P.state().timer.flowNotified,true);assert.equal(chimes().length,before+1);assert.match($('pomoTime').textContent,/^[+]0?\d:\d\d/);
 $('pomoFlowBreak').click();await tick();assert.equal(P.state().timer.mode,'long','interval 1: long break after the 1st of 2');assert.equal(saved.length,4);assert.ok(saved[3].p_flow_extra_ms>=3*MIN-2000);
 assert.match($('pomoGoalTitle').textContent,/Feitas 1 de 2/);

 // Offline: the block waits in the outbox; the last set reaches the goal with the celebration.
 P.state().config.flow=false;P.render();p.advance(15*MIN);await tick(700);assert.equal(P.state().timer.mode,'focus');
 p.setFail(true);p.advance(25*MIN);await tick(700);assert.equal(saved.length,4);assert.equal(P.outbox().length,1);
 assert.equal(P.state().timer.status,'idle');assert.equal($('pomoDialog').dataset.kind,'goal');assert.match($('pomoDialog').textContent,/Plano cumprido!/);$('pomoDialog').close();
 p.setFail(false);w.dispatchEvent(new w.Event('online'));await tick(80);assert.equal(saved.length,5);assert.equal(P.outbox().length,0);
 await settle();assert.ok(ambient().volume<.01,'no sound when idle');

 // Catch-up after the tab was away for the whole session.
 P.state().config.longEnabled=false;$('pomoPlay').click();p.advance(25*MIN+5*MIN+25*MIN+1000);P.advance();P.render();await tick();
 assert.equal(P.state().timer.status,'idle');assert.equal(saved.length,7);$('pomoDialog').close();

 // Settings: a Pomodoro section under Peleja.
 assert.ok($('pomodoroSettingsEdit'));$('pomodoroSettingsEdit').click();assert.equal($('pomodoroSettingsPanel').hidden,false);
 $('pomoPrefEffects').click();assert.equal(P.state().prefs.effects,false);
 console.log('PASS pomodoro: idle plan bar and time picker, task routines, sound sheet preview, play/pause/mute, auto break, skip, discard, finish (too short / confirm), flow, long break, goal reached, outbox, catch-up, settings');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
