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
 const saved=[],liveCalls=[],rankCalls=[];let failSave=false;
 const board={rows:[]};
 const client={auth:{onAuthStateChange:fn=>fn('INITIAL_SESSION',{user:{id:'student'}}),signOut:async()=>({})},rpc:async(name,args)=>{
  if(name==='get_workspace')return {data:remote};if(name==='extra_course_catalog')return {data:[]};if(name==='material_exam_results')return {data:{types:[],rows:[]}};if(name==='simulation_results_next')return {data:[]};if(name==='simulation_bases')return {data:{}};
  if(name==='question_sets_list'||name==='quiz_sessions_mine'||name==='pomodoro_blocks_mine')return {data:[]};
  if(name==='pomodoro_live_set'){liveCalls.push(args);return {data:null};}
  if(name==='pomodoro_ranking'){rankCalls.push(args);return {data:structuredClone(board.rows)};}
  if(name==='pomodoro_block_save'){if(failSave)throw Error('offline');saved.push(args);return {data:null};}
  return {data:true};},
  from:table=>{if(table==='profile_photos'){const res={data:[{user_id:'friend',image_data:'data:image/png;base64,AAAA'}]};const q={eq:()=>q,maybeSingle:async()=>({data:null}),then:(ok,ko)=>Promise.resolve(res).then(ok,ko)};return {select:()=>q};}const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[]}),maybeSingle:async()=>({data:{display_name:'Aluno',role:'participant'}})};return b;}};
 const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=el=>{append(el);if(el.tagName==='SCRIPT')setTimeout(()=>{try{if(el.src.startsWith('https:'))w.supabase={createClient:()=>client};else w.eval(fs.readFileSync(path.join(root,'..',new URL(el.src).pathname.replace(/^\//,'')),'utf8'));el.onload();}catch(e){console.error(e);el.onerror()}},0)};
 w.eval([...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n'));
 await tick(300);
 return {board,liveCalls,rankCalls,w,$:id=>w.document.getElementById(id),sounds,saved,setFail:v=>{failSave=v;},advance:ms=>{clock+=ms;},now:()=>clock};
}


(async()=>{
 const p=await app(),{w,$,board,liveCalls,rankCalls}=p,P=w.PELEJA_POMODORO,R=w.PELEJA_POMODORO_RANKING;
 const T0=p.now(),iso=ms=>new Date(ms).toISOString();
 board.rows=[
  {userId:'student',name:'Vinícius',me:true,totalMs:50*MIN,sessions:2,live:null},
  {userId:'friend',name:'Wilton',me:false,totalMs:40*MIN,sessions:1,live:{mode:'focus',running:true,since:iso(T0-20*MIN),accMs:0,phaseStartedAt:iso(T0-20*MIN)}},
  {userId:'u3',name:'Ulisses',me:false,totalMs:0,sessions:0,live:{mode:'short',running:true,since:iso(T0-2*MIN),accMs:0,phaseStartedAt:iso(T0-2*MIN)}},
  {userId:'u4',name:'Danillo',me:false,totalMs:0,sessions:0,live:null}];
 $('navPomodoro').click();await tick();
 // Third tab: Ranking.
 $('pomoViewRanking').click();await tick(120);
 assert.equal($('pomodoroPage').dataset.view,'ranking');assert.equal($('pomoRanking').hidden,false);assert.equal($('pomoInsights').hidden,true);
 const from=new Date(rankCalls.at(-1).p_from);assert.equal(from.getHours(),0);assert.equal(from.getMinutes(),0);
 // The focus in progress counts: Wilton 40 + 20 = 60 min passes Vinícius (50).
 const names=()=>[...w.document.querySelectorAll('.pomo-board li .pomo-board-name b')].map(b=>b.firstChild.textContent);
 assert.deepEqual(names(),['Wilton','Vinícius','Danillo','Ulisses']);
 const first=w.document.querySelector('.pomo-board li');assert.match(first.textContent,/1h/);assert.equal(first.dataset.live,'true');assert.match(first.textContent,/focando agora/);assert.match($('pomoRanking').querySelector('.pomo-live').textContent,/focando há 20 min/);
 assert.ok(first.querySelector('.pomo-avatar img'),'friend photo');
 assert.match(w.document.querySelector('.pomo-board li.is-me').textContent,/Você/);
 assert.match($('pomoRanking').querySelector('.pomo-live').textContent,/Estudando agora/);assert.match($('pomoRanking').querySelector('.pomo-live').textContent,/na pausa/);
 // Ties share the place.
 assert.deepEqual([...w.document.querySelectorAll('.pomo-board li')].map(li=>li.dataset.place),['1','2','3','3']);
 // Periods: week starts on Monday (2026-11-02), month on the 1st.
 [...$('pomoRanking').querySelectorAll('.pomo-period button')].find(b=>b.textContent==='Semana').click();await tick(80);
 assert.equal(new Date(rankCalls.at(-1).p_from).getDate(),2);
 [...$('pomoRanking').querySelectorAll('.pomo-period button')].find(b=>b.textContent==='Mês').click();await tick(80);
 assert.equal(new Date(rankCalls.at(-1).p_from).getDate(),1);
 // Publishing my timer: play sends focus/running, pause sends running=false, discard clears.
 $('pomoViewTimer').click();$('pomoPlay').click();await tick(2300);
 assert.equal(liveCalls.at(-1).p_mode,'focus');assert.equal(liveCalls.at(-1).p_running,true);
 $('pomoPlay').click();await tick(2300);assert.equal(liveCalls.at(-1).p_running,false);
 $('pomoSideLeft').click();await tick(2300);assert.equal(liveCalls.at(-1).p_mode,null);
 // A friend starts: a heads-up once, not again while they keep going.
 board.rows[3].live={mode:'focus',running:true,since:iso(p.now()),accMs:0,phaseStartedAt:iso(p.now())};
 const toasts=[];w.toast=t=>toasts.push(t);
 await R.watchFriends();assert.equal(toasts.length,1);assert.match(toasts[0],/Danillo começou a estudar/);
 await R.watchFriends();assert.equal(toasts.length,1);
 // The setting turns it off.
 $('pomoPrefFriends').click();assert.equal(P.state().prefs.friends,false);
 board.rows[2].live={mode:'focus',running:true,since:iso(p.now()),accMs:0,phaseStartedAt:iso(p.now())};
 await R.watchFriends();assert.equal(toasts.length,1);
 console.log('PASS pomodoro ranking: tab, periods (day/week from Monday/month), live focus counted, ties, live strip, photos, my live state published, friend heads-up once, setting');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),50));
