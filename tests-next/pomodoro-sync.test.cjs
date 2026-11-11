// Pomodoro session shared between devices: the newest press wins, on opening and on coming back to the page.
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
const running=(over={})=>({state:{timer:{status:'running',mode:'focus',accMs:0,runningSince:START-10*MIN,phaseStartedAt:START-10*MIN,setsDone:1,flowNotified:false,sessionId:SESSION},task:'Cardio',
 config:{focusMin:25,shortMin:5,targetSets:4,longEnabled:true,longMin:15,longEvery:4,flow:false},...over},changedAt:new Date(START-10*MIN).toISOString()});

(async()=>{
 // Started on the phone ten minutes ago: the computer opens on that session, same set, task and plan.
 let a=await app(running());
 let t=a.P.state().timer;
 assert.equal(t.status,'running');assert.equal(t.setsDone,1);assert.equal(a.P.state().task,'Cardio');assert.equal(a.P.elapsed(),10*MIN);
 assert.equal(a.$('pomoTime').textContent,'15:00','the countdown continues where the phone is');
 assert.equal(a.sounds.filter(s=>/session_/.test(s.src)).length,0,'adopting plays no chime');

 // Pausing here goes up with the moment of the press.
 a.advance(MIN);a.P.actions.toggle();await tick(400);
 const sent=a.server.sets.at(-1);assert.equal(sent.p_state.timer.status,'paused');assert.equal(sent.p_changed_at,new Date(a.now()).toISOString());
 assert.equal(sent.p_state.timer.accMs,11*MIN);assert.equal(sent.p_state.timer.sessionId,SESSION);

 // The phone continues later: coming back to the page takes the newer press.
 a.advance(2*MIN);
 a.server.session=running({timer:{...running().state.timer,status:'running',accMs:11*MIN,runningSince:a.now()-MIN}});a.server.session.changedAt=new Date(a.now()-MIN).toISOString();
 a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));await tick(80);
 assert.equal(a.P.state().timer.status,'running');assert.equal(a.P.elapsed(),12*MIN);

 // An older session on the account is not adopted; this device's newer press is sent instead.
 a.advance(MIN);a.P.actions.toggle();await tick(400);const mine=a.P.state().timer.changedAt;
 a.server.session=running();await a.P.pull();await tick(400);
 assert.equal(a.P.state().timer.status,'paused','older session ignored');
 assert.equal(a.server.session.changedAt,new Date(mine).toISOString(),'the newer press replaced it');

 // The phone ended the session: the computer goes idle too.
 a.advance(MIN);a.server.session={state:{...running().state,timer:{...running().state.timer,status:'idle',setsDone:0,sessionId:''}},changedAt:new Date(a.now()).toISOString()};
 await a.P.pull();assert.equal(a.P.state().timer.status,'idle');assert.equal(a.$('pomoConfig').hidden,false);

 // A focus that ended while the computer was closed is caught up quietly, saved with the id every device
 // gives that focus, so the phone saving the same focus does not count it twice.
 a=await app(running({timer:{...running().state.timer,runningSince:START-40*MIN,phaseStartedAt:START-40*MIN}}));
 t=a.P.state().timer;assert.equal(t.mode,'focus','focus, break, next focus');assert.equal(t.setsDone,2);assert.equal(a.P.elapsed(),10*MIN);
 await tick(100);
 const block=a.server.blocks.find(b=>b.p_focus_ms===25*MIN);assert.ok(block,'the focus was saved');
 assert.equal(block.p_id,SESSION.slice(0,32)+'0001','set 2 of session gets a fixed id');
 assert.equal(a.sounds.filter(s=>/session_/.test(s.src)).length,0);

 // Malformed sessions are ignored.
 a=await app({state:{timer:{status:'flying'},config:{}},changedAt:new Date(START).toISOString()});
 assert.equal(a.P.state().timer.status,'idle');
 console.log('PASS Pomodoro sync: adopt newer session on open and return, push presses, ignore older or malformed, quiet catch-up with shared block ids');
 // Pra depois: note during a focus, Enter closes the panel, the chip counts, the note syncs.
 a=await app(null);
 const chip=()=>a.$('pomoNotesChip'),dlg=()=>a.$('pomoDialog');
 assert.match(chip().textContent,/Pra depois/);assert.equal(chip().dataset.count,'0');
 a.P.actions.toggle();await tick(400);
 const note=text=>{chip().click();assert.equal(dlg().dataset.kind,'notes');a.$('pomoNoteInput').value=text;a.$('pomoNoteInput').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter'}));};
 note('  pagar   o boleto ');
 assert.equal(dlg().open,false,'Enter closes the panel to get back to focus');
 assert.deepEqual(Array.from(a.P.state().notes,n=>n.text),['pagar o boleto']);assert.equal(chip().dataset.count,'1');
 assert.equal(a.P.state().timer.status,'running','noting does not touch the timer');
 a.advance(1000);await tick(400);
 assert.deepEqual(Array.from(a.server.sets.at(-1).p_state.notes,n=>n.text),['pagar o boleto'],'the note goes up with the session');
 // Done removes it; the list fills up at 12.
 chip().click();dlg().querySelector('.pomo-note-done').click();assert.equal(a.P.state().notes.length,0);assert.equal(dlg().querySelector('[data-note]'),null);dlg().close();
 for(let i=0;i<12;i++)note('item '+i);
 assert.equal(a.P.state().notes.length,12);chip().click();assert.equal(a.$('pomoNoteInput').disabled,true);assert.equal(a.$('pomoNotesFull').hidden,false);dlg().close();
 // Finishing before the goal shows the list; the goal dialog offers it.
 a.advance(5*MIN);a.P.actions.stop();assert.equal(dlg().dataset.kind,'notes');assert.match(dlg().textContent,/Da sessão que passou/);dlg().close();
 a.P.state().notes=a.P.state().notes.slice(0,2);a.P.state().config.targetSets=1;a.P.actions.toggle();a.advance(26*MIN);a.P.advance();
 assert.equal(dlg().dataset.kind,'goal');assert.match(a.$('pomoGoalNotes').textContent,/2 anotações/);a.$('pomoGoalNotes').click();assert.equal(dlg().dataset.kind,'notes');dlg().close();
 // Notes from the newer session on the account arrive; malformed notes are refused.
 a=await app(running({notes:[{id:'n1',text:'ligar pra mãe'}]}));
 assert.deepEqual(Array.from(a.P.state().notes,n=>n.text),['ligar pra mãe']);
 a=await app(running({notes:[{id:'n1',text:'x'.repeat(500)}]}));
 assert.equal(a.P.state().notes.length,0);assert.equal(a.P.state().timer.status,'idle','a session with bad notes is not adopted');
 console.log('PASS Pomodoro Pra depois: note in a focus, Enter closes, chip count, synced, done removes, limit 12, list on finish and goal, adopted from account, malformed refused');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
