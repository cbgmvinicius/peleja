const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../next/directions'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const MIN=60000;

async function app(){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:8786/directions/#biblioteca'}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let clock=Date.parse('2026-11-05T12:00:00Z');w.PELEJA_NOW=()=>clock;
 const shown=[],listeners=[];let open=[];
 const reg={showNotification:async(title,opts)=>{open=open.filter(n=>n.tag!==opts.tag);const n={title,...opts,close(){open=open.filter(x=>x!==n);}};open.push(n);shown.push(n);},getNotifications:async({tag})=>open.filter(n=>n.tag===tag)};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async(url)=>{reg.url=url;return reg;},addEventListener:(t,fn)=>{if(t==='message')listeners.push(fn);}}});
 w.Notification=class{static permission='granted';static requestPermission=async()=>'granted';};
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
 return {shown,open:()=>open,reg,post:action=>listeners.forEach(fn=>fn({data:{type:'pomodoro-action',action}})),wsSaves,remote,w,$:id=>w.document.getElementById(id),sounds,saved,setFail:v=>{failSave=v;},advance:ms=>{clock+=ms;},now:()=>clock};
}
(async()=>{
 const p=await app(),{w,$}=p,P=w.PELEJA_POMODORO,last=()=>p.open().find(n=>n.tag==='peleja-pomodoro-ongoing');
 $('navPomodoro').click();await tick();
 assert.equal(last(),undefined,'nothing while idle');
 P.state().task='Hematologia';$('pomoPlay').click();await tick(60);
 assert.equal(p.reg.url,'pomodoro-sw.js');
 let n=last();assert.ok(n,'ongoing notification while focusing');assert.match(n.title,/^Foco – faltam 4 séries/);assert.match(n.body,/^Foco até \d\d:\d\d · Hematologia$/);
 assert.equal(n.silent,true);assert.equal(n.requireInteraction,true);assert.equal(n.actions.map(a=>a.title).join(','),'Pausar,Concluir');
 p.advance(5*MIN);p.post('toggle');await tick(60);assert.equal(P.state().timer.status,'paused');n=last();assert.match(n.body,/^Pausado · 20:00 restantes/);assert.equal(n.actions[0].title,'Continuar');
 p.post('toggle');await tick(60);assert.equal(P.state().timer.status,'running');
 p.post('skip');await tick(60);assert.equal(P.state().timer.mode,'short');assert.match(last().title,/^Pausa curta – faltam 3 séries/);assert.equal(last().actions.map(a=>a.title).join(','),'Pular,Concluir');
 const count=p.shown.length;P.render();P.render();await tick(60);assert.equal(p.shown.length,count,'not rewritten when nothing changed');
 p.post('finish');await tick(60);assert.equal(P.state().timer.status,'idle');assert.equal(last(),undefined,'closed when the session ends');
 P.state().prefs.notify=false;$('pomoPlay').click();await tick(60);assert.equal(last(),undefined,'off in settings: nothing shows');
 console.log('PASS pomodoro notification: ongoing while on (phase, end time, task), Pausar/Continuar/Pular/Concluir from the notification, closed when idle, off when disabled');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
