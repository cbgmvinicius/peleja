const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const MIN=60000;

async function app(){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#biblioteca'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let clock=Date.parse('2026-11-05T12:00:00Z');w.PELEJA_NOW=()=>clock;
 // Capacitor shell with the PelejaTimer plugin (android-app/): no web Notification, no service worker.
 const calls=[],queue=[],listeners={};
 const plugin={update:async plan=>{calls.push(['update',JSON.parse(JSON.stringify(plan))]);},stop:async()=>{calls.push(['stop']);},
  drain:async()=>({actions:queue.splice(0)}),addListener:(name,fn)=>{(listeners[name]||=[]).push(fn);return {remove(){}};}};
 w.Capacitor={isNativePlatform:()=>true,isPluginAvailable:name=>name==='PelejaTimer',
  nativePromise:(name,method,options)=>{assert.equal(name,'PelejaTimer');return plugin[method](options);},
  addListener:(name,event,fn)=>{assert.equal(name,'PelejaTimer');return plugin.addListener(event,fn);}};
 try{w.localStorage.setItem('peleja-pomodoro-v1',JSON.stringify({prefs:{effects:false,notify:true}}));}catch{}
 // Audio stub: records every sound created, its volume and whether it is playing.
 const sounds=[];w.Audio=class{constructor(src){this.src=src;this.volume=1;this.paused=true;this.loop=false;sounds.push(this);}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}};
 const remote={revision:1,catalog_revision:1,catalog:{materials:[],simulations:[],exams:[]},payload:{materials:[],exams:[],simulations:[],courses:[]}};
 const saved=[],wsSaves=[];let failSave=false;
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list'||name==='quiz_sessions_mine'||name==='pomodoro_blocks_mine')return {data:[]};
  if(name==='save_workspace'){remote.payload=structuredClone(args.p_payload);remote.revision++;wsSaves.push(args.p_payload);return {data:{revision:remote.revision,catalog_revision:1}};}
  if(name==='pomodoro_block_save'){if(failSave)throw Error('offline');saved.push(args);return {data:null};}
  return {data:true};},
  from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Aluno',role:'participant'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 return {calls,press:(action,at)=>{queue.push({action,at});(listeners.action||[]).forEach(fn=>fn({}));},wsSaves,remote,w,$:id=>w.document.getElementById(id),sounds,saved,setFail:v=>{failSave=v;},advance:ms=>{clock+=ms;},now:()=>clock};
}
(async()=>{
 const p=await app(),{w,$}=p,P=w.PELEJA_POMODORO,t0=p.now();
 const updates=()=>p.calls.filter(c=>c[0]==='update').map(c=>c[1]),lastPlan=()=>updates().at(-1);
 $('navPomodoro').click();await tick();
 assert.equal(updates().length,0,'nothing while idle');
 P.state().task='Hematologia';$('pomoPlay').click();await tick(60);
 let plan=lastPlan();
 assert.equal(plan.segments.map(s=>s.mode).join(','),'focus,short,focus,short,focus,short,focus','the whole plan of 4 series');
 assert.equal(plan.segments[0].title,'Foco – faltam 4 séries');assert.equal(plan.segments[1].title,'Pausa curta – faltam 3 séries');assert.equal(plan.segments.at(-1).title,'Foco – última série');
 assert.equal(plan.segments[0].durMs,25*MIN);assert.equal(plan.segments[1].startText,'Hora da pausa curta.');
 assert.equal(plan.elapsedMs,0);assert.equal(plan.at,t0);assert.equal(plan.paused,false);assert.equal(plan.task,'Hematologia');
 const before=updates().length;P.render();await tick();assert.equal(updates().length,before,'same state is not sent again');
 // Pausar on the notification while the page sleeps; the page wakes later and replays it at its time.
 const sounds=p.sounds.length;
 p.press('toggle',t0+5*MIN);p.advance(9*MIN);await tick(80);
 assert.equal(P.state().timer.status,'paused');assert.equal(P.state().timer.accMs,5*MIN);
 plan=lastPlan();assert.equal(plan.paused,true);assert.equal(plan.elapsedMs,5*MIN);
 // Continuar and Pular: 3 more minutes of focus, the series counts and the break starts at the skip.
 p.advance(3*MIN);p.press('toggle',t0+7*MIN);await tick(80);
 p.press('skip',t0+10*MIN);await tick(80);
 assert.equal(P.state().timer.mode,'short');assert.equal(P.state().timer.setsDone,1);assert.equal(P.state().timer.phaseStartedAt,t0+10*MIN);
 assert.equal(P.outbox().concat(p.saved).length>0,true);
 const block=p.saved[0]||P.outbox()[0];assert.equal(block.p_focus_ms??block.focusMs,8*MIN);
 plan=lastPlan();assert.equal(plan.segments[0].mode,'short');assert.equal(plan.elapsedMs,p.now()-(t0+10*MIN));
 assert.equal(p.sounds.length,sounds,'no chimes for buttons pressed in the past');
 // Pular while paused also works (resume then skip at the same moment).
 p.press('toggle',p.now());await tick(80);assert.equal(P.state().timer.status,'paused');
 p.press('skip',p.now());await tick(80);assert.equal(P.state().timer.mode,'focus');assert.equal(P.state().timer.status,'running');
 // Concluir ends the session and the native notification.
 p.press('finish',p.now());await tick(80);
 assert.equal(P.state().timer.status,'idle');assert.deepEqual(p.calls.at(-1),['stop']);
 // A stale button after the end does nothing.
 p.press('toggle',p.now());await tick(80);assert.equal(P.state().timer.status,'idle');
 // Flow: the focus is open-ended.
 P.state().config.flow=true;$('pomoPlay').click();await tick(60);
 assert.equal(lastPlan().segments[0].open,true);assert.equal(lastPlan().segments[1].open,false);
 // Notifications off in Configurações: the native one goes away.
 P.state().prefs.notify=false;P.render();await tick();assert.deepEqual(p.calls.at(-1),['stop']);
 console.log('pomodoro native timer ok');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
