const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const MIN=60000;

async function app(){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#biblioteca'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let clock=Date.parse('2026-11-05T12:00:00Z');const T0=clock;w.PELEJA_NOW=()=>clock;
 // Audio stub: records every sound created, its volume and whether it is playing.
 const sounds=[];w.Audio=class{constructor(src){this.src=src;this.volume=1;this.paused=true;this.loop=false;sounds.push(this);}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}};
 // Web Audio stub: the audio clock follows the page clock; records every buffer started, when, and stops.
 const started=[];let ctxState='running';
 w.fetch=async url=>({ok:true,blob:async()=>null,arrayBuffer:async()=>String(url)});
 w.AudioContext=class{constructor(){this.destination={};}get state(){return ctxState;}get currentTime(){return (clock-T0)/1000;}resume(){ctxState='running';return Promise.resolve();}
  decodeAudioData(b,ok){ok({name:b.match(/sounds\/(\w+)/)[1],duration:2});}
  createGain(){return {gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){},setValueCurveAtTime(){}},connect(){},disconnect(){}};}
  createBufferSource(){const s={connect(){},start(when){s.when=when;s.name=s.buffer.name;started.push(s);},stop(){s.stopped=true;}};return s;}};
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
 return {started,setCtx:v=>{ctxState=v;},wsSaves,remote,w,$:id=>w.document.getElementById(id),sounds,saved,setFail:v=>{failSave=v;},advance:ms=>{clock+=ms;},now:()=>clock};
}

(async()=>{
 const p=await app(),{w,$,sounds,started}=p,P=w.PELEJA_POMODORO,t0=p.now();
 const chimes=()=>sounds.filter(s=>!s.loop).map(s=>s.src.match(/sounds\/(\w+)/)[1]);
 const live=()=>started.filter(s=>!s.stopped&&s.when*1000+t0>p.now()).map(s=>[s.name,Math.round(s.when*1000/MIN)]).sort((a,b)=>a[1]-b[1]);
 $('navPomodoro').click();await tick();
 // Começar: the phase changes ahead are queued on the audio clock (25/5 x 4, long break after the 4th = goal).
 $('pomoPlay').click();await tick(80);
 assert.deepEqual(live(),[['session_end',25],['session_start',30],['session_end',55],['session_start',60],['session_end',85],['session_start',90],['session_end',115]]);
 // Screen off: the page's timers are frozen past the end of the focus. The audio clock rang it on time,
 // so when the page catches up it does not ring it a second time.
 const before=chimes().length;
 w.document.dispatchEvent(new w.Event('visibilitychange'));
 p.advance(26*MIN);await tick(700);
 assert.equal(P.state().timer.mode,'short');
 assert.deepEqual(chimes().slice(before),[],'no late duplicate of the whistle the audio clock already played');
 assert.equal(started.filter(s=>s.stopped&&s.when*1000+t0<=p.now()).length,0,'the one that played is not cut');
 // Pausar: nothing rings while paused; Continuar queues again from the new times.
 $('pomoPlay').click();await tick(80);assert.deepEqual(live(),[]);
 p.advance(2*MIN);$('pomoPlay').click();await tick(80);
 assert.deepEqual(live()[0],['session_start',32],'end of the break, two minutes later');
 // Pular is a tap on screen: its whistle plays right away, as before.
 const n=chimes().length;$('pomoSkip').click();await tick(80);
 assert.ok(chimes().slice(n).includes('session_start'));assert.equal(P.state().timer.mode,'focus');
 // Sons de efeito off: nothing queued.
 P.state().prefs.effects=false;P.render();await tick();assert.deepEqual(live(),[]);
 P.state().prefs.effects=true;P.render();await tick();assert.ok(live().length>0);
 // A context the phone suspended (iOS on lock, an interrupted call): the page rings it itself when it can.
 p.setCtx('suspended');const m=chimes().length;p.advance(26*MIN);await tick(700);
 assert.ok(chimes().slice(m).includes('session_end'),'falls back to <audio> when the audio clock is not running');
 console.log('PASS pomodoro background chime: queued on the audio clock, not rung twice, paused/resumed/skipped, effects off, suspended fallback');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
