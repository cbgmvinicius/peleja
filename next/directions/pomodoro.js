// Pomodoro: task, wavy progress ring, focus / short break / long break, a plan of series, optional flow
// (focus keeps counting past the minimum until you start the break), ambient sound loud while focusing,
// low during breaks, silent when paused or idle, and a chime at each change. Each focus block is queued
// and saved to Supabase (pomodoro_blocks) once the app is connected.
(()=>{
 const $=id=>document.getElementById(id);
 const now=()=>globalThis.PELEJA_NOW?.()??Date.now();
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children);return n;};
 const icon=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
 const I={
  play:'<path d="M8 5.5v13c0 .8.9 1.3 1.5.8l10-6.5c.6-.4.6-1.2 0-1.6l-10-6.5C8.9 4.2 8 4.7 8 5.5Z" fill="currentColor" stroke="none"/>',
  pause:'<rect x="6.5" y="5" width="4" height="14" rx="1.4" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.4" fill="currentColor" stroke="none"/>',
  sound:'<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute:'<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  sets:'<path d="M4 7h10M4 12h16M4 17h7"/><circle cx="17" cy="7" r="2"/><circle cx="14" cy="17" r="2"/>',
  skip:'<path d="M6 6.5v11l8-5.5Z" fill="currentColor" stroke="none"/><path d="M17.5 6v12"/>',
  stop:'<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
  task:'<path d="M5 6h14M5 12h14M5 18h9"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  clock:'<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 2M9.5 2.5h5"/>'
 };
 const SOUNDS=[['forest','Floresta'],['rain','Chuva'],['brown_noise','Ruído marrom'],['fireplace','Lareira'],['library','Biblioteca'],['riverside','Rio']];
 const soundUrl=id=>`../assets/sounds/${id}.m4a?v=1`;
 const KEY='peleja-pomodoro-v1',OUTBOX='peleja-pomodoro-outbox-v1';
 const read=(key,fallback)=>{try{return {...fallback,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return {...fallback};}};
 const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
 const DEFAULTS={config:{focusMin:25,shortMin:5,longEnabled:true,longMin:15,longEvery:4,targetSets:4,flow:false},sound:{enabled:false,id:'rain',muted:false},prefs:{effects:true,notify:true,notifyDefault:1},task:'',templates:[],notes:[],
  timer:{status:'idle',mode:'focus',accMs:0,runningSince:0,phaseStartedAt:0,setsDone:0,flowNotified:false,sessionId:'',changedAt:0}};
 let state=read(KEY,DEFAULTS);for(const k of ['config','sound','prefs','timer'])state[k]={...DEFAULTS[k],...state[k]};
 // Notes: things that come to mind during a focus, noted and left for later (up to 12, 100 characters each).
 const NOTES_MAX=10,NOTE_LEN=60,NOTES_KEEP=12,NOTE_LEGACY=100;
 const validNotes=list=>Array.isArray(list)&&list.length<=NOTES_KEEP&&list.every(n=>typeof n?.id==='string'&&n.id&&n.id.length<=40&&typeof n.text==='string'&&n.text.trim()&&n.text.length<=NOTE_LEGACY&&(n.done===undefined||typeof n.done==='boolean'));
 const openNotes_=()=>state.notes.filter(n=>!n.done).length;
 const copyNote=n=>n.done?{id:n.id,text:n.text,done:true}:{id:n.id,text:n.text};
 if(!validNotes(state.notes))state.notes=[];
 // Notifications are on by default, also for whoever had the old default (off) saved; turning them off later sticks.
 if(!state.prefs.notifyDefault){state.prefs.notify=true;state.prefs.notifyDefault=1;}
 // Android app: block other apps during focus (off by default) and the apps that stay allowed.
 const fixBlock=()=>{state.prefs.block={on:false,...(state.prefs.block||{})};state.prefs.block.allow=[...(state.prefs.block.allow||[])];};fixBlock();
 const save=()=>{write(KEY,state);syncSettings();if(state.timer.changedAt!==pushedAt)pushSoon();};
 // Settings follow the account (site and Android app keep separate storage): sent a second after a change.
 const snapshot=()=>{const c=state.config,s=state.sound;return {config:{focusMin:c.focusMin,shortMin:c.shortMin,targetSets:c.targetSets,longEnabled:!!c.longEnabled,longMin:c.longMin,longEvery:c.longEvery,flow:!!c.flow},sound:{enabled:!!s.enabled,id:s.id,muted:!!s.muted},prefs:{effects:!!state.prefs.effects,notify:!!state.prefs.notify}};};
 let saveSettings=null,settingsTimer=0,lastSent='';
 function syncSettings(){if(!saveSettings)return;clearTimeout(settingsTimer);settingsTimer=setTimeout(()=>{const s=snapshot(),k=JSON.stringify(s);if(k===lastSent)return;lastSent=k;saveSettings(s);},1000);}
 const planned=mode=>(mode==='focus'?state.config.focusMin:mode==='short'?state.config.shortMin:state.config.longMin)*60000;
 const elapsed=()=>state.timer.accMs+(state.timer.status==='running'?Math.max(0,now()-state.timer.runningSince):0);
 const fmt=ms=>{const t=Math.max(0,Math.floor(ms/1000)),h=Math.floor(t/3600),m=Math.floor(t/60)%60,s=t%60;return (h?h+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(s).padStart(2,'0');};
 const modeName={focus:'Foco',short:'Pausa curta',long:'Pausa longa'};

 // ---------- saving blocks (outbox survives reloads and offline) ----------
 let client=null,getUser=()=>null,saveRoutines=null;
 const outbox=()=>{try{return JSON.parse(localStorage.getItem(OUTBOX)||'[]');}catch{return [];}};
 // One flush at a time; blocks added meanwhile wait for the next round and are never dropped.
 let flushing=null,again=false;
 function flush(){
  if(flushing){again=true;return flushing;}
  flushing=(async()=>{
   await null; // let flushing be assigned before the body can finish
   try{do{
    again=false;
    if(!client||!getUser())break;
    const sent=new Set();
    for(const b of outbox()){
     if(b.user&&b.user!==getUser())continue;
     try{const r=await client.rpc('pomodoro_block_save',{p_id:b.id,p_task:b.task,p_started:b.startedAt,p_ended:b.endedAt,p_focus_ms:b.focusMs,p_planned_ms:b.plannedMs,p_flow_extra_ms:b.flowExtraMs});if(!r.error||/check|Horário/.test(r.error.message||''))sent.add(b.id);}
     catch{}
    }
    if(sent.size){write(OUTBOX,outbox().filter(b=>!sent.has(b.id)));globalThis.PELEJA_POMODORO_SAVED?.();}
   }while(again);}catch(e){console.error(e);}finally{flushing=null;}
  })();
  return flushing;
 }
 function recordBlock(focusMs,endedAt){
  if(focusMs<60000)return; // under a minute is not a block
  const plannedMs=planned('focus'),block={id:blockId(),user:getUser(),task:state.task.trim(),startedAt:new Date(state.timer.phaseStartedAt).toISOString(),endedAt:new Date(endedAt).toISOString(),focusMs:Math.round(Math.min(focusMs,endedAt-state.timer.phaseStartedAt)),plannedMs,flowExtraMs:Math.max(0,Math.round(focusMs-plannedMs))};
  if(block.focusMs<60000)return;
  write(OUTBOX,[...outbox(),block]);globalThis.PELEJA_POMODORO_SAVED?.();flush();
 }
 // The same focus gets the same id on every device (session id + set number), so a focus finished on two
 // devices is saved once (pomodoro_block_save ignores an id it already has).
 function blockId(){const s=state.timer.sessionId;return /^[0-9a-f-]{36}$/.test(s)?s.slice(0,32)+state.timer.setsDone.toString(16).padStart(4,'0'):crypto.randomUUID();}

 // ---------- session shared between devices (pomodoro_session) ----------
 // Each button press stamps the timer with its moment (changedAt) and sends it up; on opening, coming back
 // to the page and every 15 s, the account's session is read and the newest press wins. Phase changes that
 // follow from the clock are not stamped: every device works them out the same way from the same start.
 const touch=()=>{state.timer.changedAt=Math.max(now(),(state.timer.changedAt||0)+1);}; // always moves forward, so two changes in one millisecond both go up
 const shared=()=>{const t=state.timer,c=state.config;return {timer:{status:t.status,mode:t.mode,accMs:Math.round(t.accMs),runningSince:t.runningSince,phaseStartedAt:t.phaseStartedAt,setsDone:t.setsDone,flowNotified:!!t.flowNotified,sessionId:t.sessionId||''},task:state.task,
  config:{focusMin:c.focusMin,shortMin:c.shortMin,targetSets:c.targetSets,longEnabled:!!c.longEnabled,longMin:c.longMin,longEvery:c.longEvery,flow:!!c.flow},notes:state.notes.map(copyNote)};};
 // The shared session row holds at most 4000 bytes; notes are refused before that is reached.
 const fits=()=>{try{return new TextEncoder().encode(JSON.stringify(shared())).length<=3800;}catch{return true;}};
 let pushedAt=0,pushTimer=0,pulling=null;
 function pushSoon(){clearTimeout(pushTimer);pushTimer=setTimeout(push,300);}
 async function push(force=false){
  const at=state.timer.changedAt;if(!client||!getUser()||!at||(at===pushedAt&&!force))return;
  try{const r=await client.rpc('pomodoro_session_set',{p_state:shared(),p_changed_at:new Date(at).toISOString()});
   if(r?.error)return;pushedAt=at;if(r?.data)adopt(r.data);}catch{}
 }
 const int=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi,num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 // Takes the account's session when it is newer than this device's and well formed.
 function adopt(remote){
  const at=Date.parse(remote?.changedAt),s=remote?.state,t=s?.timer,c=s?.config;
  if(!Number.isFinite(at)||at<=(state.timer.changedAt||0)||!t||!c)return false;
  if(!['idle','running','paused'].includes(t.status)||!['focus','short','long'].includes(t.mode)||![t.accMs,t.runningSince,t.phaseStartedAt].every(num)||!int(t.setsDone,0,12)||typeof t.sessionId!=='string'||typeof s.task!=='string'
   ||!int(c.focusMin,5,120)||!int(c.shortMin,1,60)||!int(c.targetSets,1,12)||!int(c.longMin,5,60)||!int(c.longEvery,1,12)||(s.notes!==undefined&&!validNotes(s.notes)))return false;
  state.timer={...DEFAULTS.timer,status:t.status,mode:t.mode,accMs:t.accMs,runningSince:t.runningSince,phaseStartedAt:t.phaseStartedAt,setsDone:t.setsDone,flowNotified:!!t.flowNotified,sessionId:t.sessionId.slice(0,36),changedAt:at};
  state.task=s.task.slice(0,80);if(s.notes)state.notes=s.notes.map(copyNote);Object.assign(state.config,{focusMin:c.focusMin,shortMin:c.shortMin,targetSets:c.targetSets,longEnabled:!!c.longEnabled,longMin:c.longMin,longEvery:c.longEvery,flow:!!c.flow});
  pushedAt=at;write(KEY,state);
  // catch up quietly with the time since the press; chimes belong to the moment, not to the catch-up
  replaying=true;try{advance();}finally{replaying=false;}
  write(KEY,state);ongoingSig='';render();syncSound();return true;
 }
 function pull(){
  if(!client||!getUser())return Promise.resolve(false);
  if(pulling)return pulling;
  pulling=(async()=>{try{const r=await client.rpc('pomodoro_session_get',{});if(r?.error)return false;if(!adopt(r?.data)&&state.timer.changedAt>(Date.parse(r?.data?.changedAt)||0))push(true);return true;}catch{return false;}finally{pulling=null;}})();
  return pulling;
 }
 setInterval(()=>{if(!document.hidden)pull();},15000);

 // ---------- sound ----------
 let ambient=null,ambientId='',fadeTimer=0,currentVolume=0;
 const soundOn=()=>state.sound.enabled&&!state.sound.muted&&!!state.sound.id;
 const targetVolume=()=>!soundOn()||state.timer.status!=='running'?0:state.timer.mode==='focus'?1:.1;
 // Seamless loops: <audio loop> leaves an audible seam (encoder silence + restart). With Web Audio each lap
 // overlaps the next by a few seconds with an equal-power crossfade, so the turn cannot be heard.
 const AC=globalThis.AudioContext||globalThis.webkitAudioContext;let actx=null,ambientNode=null;const buffers=new Map();
 const audio=()=>{if(!AC)return null;try{actx||=new AC();if(actx.state==='suspended')actx.resume().catch(()=>{});}catch{actx=null;}return actx;};
 if(AC)addEventListener('pointerdown',()=>{if(actx?.state==='suspended')actx.resume().catch(()=>{});},{passive:true});
 function bufferOf(id){
  if(!buffers.has(id))buffers.set(id,fetch(soundUrl(id)).then(r=>r.arrayBuffer()).then(b=>new Promise((ok,no)=>actx.decodeAudioData(b,ok,no))).catch(e=>{buffers.delete(id);throw e;}));
  return buffers.get(id);
 }
 const N=48,UP=new Float32Array(N),DOWN=new Float32Array(N);for(let i=0;i<N;i++){const t=i/(N-1);UP[i]=Math.sin(t*Math.PI/2);DOWN[i]=Math.cos(t*Math.PI/2);}
 function looper(id,level=0){
  const ctx=audio(),out=ctx.createGain();out.gain.value=level;out.connect(ctx.destination);
  let alive=true,timer=0,sources=[];const TRIM=.06;
  bufferOf(id).then(buf=>{
   if(!alive)return;const len=buf.duration-2*TRIM,x=Math.min(4,len/4);
   const lap=at=>{
    const g=ctx.createGain(),s=ctx.createBufferSource();s.buffer=buf;s.connect(g);g.connect(out);
    g.gain.setValueCurveAtTime(UP,at,x);g.gain.setValueCurveAtTime(DOWN,at+len-x,x);
    s.start(at,TRIM,len);sources.push(s);s.onended=()=>{sources=sources.filter(v=>v!==s);try{g.disconnect();}catch{}};
    const next=at+len-x;timer=setTimeout(()=>{if(alive)lap(next);},Math.max(0,(next-ctx.currentTime-1.5)*1000));
   };
   lap(ctx.currentTime+.05);
  }).catch(()=>{});
  return {gain:out.gain,stop(){alive=false;clearTimeout(timer);for(const s of sources)try{s.stop();}catch{}sources=[];setTimeout(()=>{try{out.disconnect();}catch{}},80);}};
 }
 function fadeTo(target,ms=1500){
  if(audio()){
   clearTimeout(fadeTimer);
   if(target>0&&(!ambientNode||ambientId!==state.sound.id)){ambientNode?.stop();ambientNode=looper(state.sound.id);ambientId=state.sound.id;}
   if(!ambientNode)return;
   const g=ambientNode.gain,t=actx.currentTime;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(target,t+ms/1000);
   if(target===0){const node=ambientNode;fadeTimer=setTimeout(()=>{if(ambientNode===node&&targetVolume()===0){node.stop();ambientNode=null;ambientId='';}},ms+150);}
   return;
  }
  clearInterval(fadeTimer);
  if(target>0&&(!ambient||ambientId!==state.sound.id)){ambient?.pause();ambient=new Audio(soundUrl(state.sound.id));ambient.loop=true;ambientId=state.sound.id;ambient.volume=currentVolume=0;}
  if(!ambient)return;
  if(target>0&&ambient.paused)ambient.play?.()?.catch?.(()=>{});
  const from=currentVolume,start=now();
  fadeTimer=setInterval(()=>{const p=Math.min(1,(now()-start)/ms);currentVolume=from+(target-from)*p;try{ambient.volume=Math.max(0,Math.min(1,currentVolume));}catch{}if(p>=1){clearInterval(fadeTimer);if(target===0)ambient.pause?.();}},30);
 }
 const syncSound=ms=>fadeTo(targetVolume(),ms);
 // Flow minimum reached: a short dip in the background and back, without leaving the focus.
 function wave(){if(!soundOn()||!(ambient||ambientNode))return;fadeTo(.35,500);setTimeout(()=>{if(state.timer.mode==='focus'&&state.timer.status==='running')fadeTo(1,900);},700);}
 // Chimes are fetched once and kept in memory, so they sound the moment they are called (from the network a
 // phone could take seconds, e.g. when the cached copy has expired).
 const chimeUrls={};
 for(const n of ['session_start','session_end','session_stop'])Promise.resolve(globalThis.fetch?.(soundUrl(n))).then(r=>r?.ok?r.blob():null).then(b=>{if(b)chimeUrls[n]=URL.createObjectURL(b);}).catch(()=>{});
 function chime(name,volume=.9){if(!state.prefs.effects||replaying)return;try{const a=new Audio(chimeUrls[name]||soundUrl(name));a.volume=volume;a.play?.()?.catch?.(()=>{});}catch{}}
 // ---------- notifications ----------
 // Through a small service worker: Android has no "new Notification()", and only a worker's
 // notification can carry buttons (Pausar / Pular / Concluir) that come back to this page.
 // BADGE: the small status-bar icon; Android only keeps its transparency, so it is a white cactus outline
 const ICON='../assets/peleja-icon-192.png',BADGE='../assets/peleja-badge-96.png',ONGOING='peleja-pomodoro-ongoing';
 // In the Peleja Android app (Capacitor) a native service does this instead: see android-app/.
 // The page is the published site, so it talks to the plugin through the bridge the app injects (no @capacitor/core).
 const cap=globalThis.Capacitor,native=cap?.isPluginAvailable?.('PelejaTimer')&&cap.nativePromise?{
  update:plan=>cap.nativePromise('PelejaTimer','update',plan),stop:()=>cap.nativePromise('PelejaTimer','stop',{}),
  drain:()=>cap.nativePromise('PelejaTimer','drain',{}),blockStatus:()=>cap.nativePromise('PelejaTimer','blockStatus',{}),listApps:()=>cap.nativePromise('PelejaTimer','listApps',{}),openBlockSettings:o=>cap.nativePromise('PelejaTimer','openBlockSettings',o),addListener:(name,fn)=>cap.addListener('PelejaTimer',name,fn)}:null;
 let replaying=false;
 let swReg=null,swTried=false;
 const allowed=()=>state.prefs.notify&&typeof Notification!=='undefined'&&Notification.permission==='granted';
 async function worker(){
  if(swReg||swTried||!navigator.serviceWorker?.register)return swReg;
  swTried=true;
  try{swReg=await navigator.serviceWorker.register('pomodoro-sw.js',{scope:'./'});}catch{swReg=null;}
  return swReg;
 }
 navigator.serviceWorker?.addEventListener?.('message',e=>{
  if(e.data?.type!=='pomodoro-action')return;
  ({toggle:()=>actions.toggle(),skip:()=>actions.skip(),finish:()=>actions.stop()})[e.data.action]?.();
 });
 async function notify(text){
  if(native||!allowed()||!document.hidden)return;
  const reg=await worker();
  try{if(reg)await reg.showNotification('Peleja · Pomodoro',{body:text,icon:ICON,badge:BADGE,tag:'peleja-pomodoro-alert'});else new Notification('Peleja · Pomodoro',{body:text,icon:ICON,tag:'peleja-pomodoro-alert'});}catch{}
 }
 // While a session is on, one silent notification that stays: what phase, until when, and the buttons.
 // A website cannot tick a countdown there, so it shows the end time, which stays right.
 let ongoingSig='',ongoingChain=Promise.resolve();
 // One update at a time, each from the state as it is then: a slow show must not land after the close and
 // bring back the notification of a session that has already ended.
 function updateOngoing(){if(native)return nativeOngoing();ongoingChain=ongoingChain.then(ongoingNow).catch(()=>{});return ongoingChain;}
 async function ongoingNow(){
  const t=state.timer,c=state.config,on=allowed()&&t.status!=='idle';
  const sig=on?[t.status,t.mode,t.setsDone,t.runningSince,Math.round(t.accMs/1000),state.task,c.flow,t.flowNotified].join('|'):'off';
  if(sig===ongoingSig)return;ongoingSig=sig;
  const reg=on?await worker():swReg;if(!reg)return;
  if(!on){for(const n of await reg.getNotifications({tag:ONGOING}).catch(()=>[]))n.close();return;}
  const left=Math.max(0,c.targetSets-t.setsDone),remaining=planned(t.mode)-elapsed(),end=new Date(now()+Math.max(0,remaining));
  const hhmm=`${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
  const title=t.mode==='focus'?`Foco – ${left<=1?'última série':`faltam ${left} séries`}`:`${modeName[t.mode]} – ${left===1?'falta 1 série':`faltam ${left} séries`}`;
  let body=t.status==='paused'?`Pausado · ${fmt(remaining)} restantes`:t.mode==='focus'&&c.flow&&remaining<=0?'Flow · tempo mínimo cumprido':`${t.mode==='focus'?'Foco':'Pausa'} até ${hhmm}`;
  if(state.task)body+=' · '+state.task;
  try{await reg.showNotification(title,{tag:ONGOING,body,icon:ICON,badge:BADGE,silent:true,renotify:false,requireInteraction:true,timestamp:+end,
   // Chrome shows at most two buttons: in focus Pausar/Continuar + Concluir, in a break Pular + Concluir
   actions:[t.mode==='focus'?{action:'toggle',title:t.status==='running'?'Pausar':'Continuar'}:{action:'skip',title:'Pular'},{action:'finish',title:'Concluir'}]});}catch{}
 }

 // ---------- Android app: native timer notification ----------
 // The service shows a real countdown with Pausar/Continuar, Pular and Concluir and changes phase on time
 // even with the app closed. It follows the plan sent from here: the phases ahead, as the state machine
 // below would run them. Buttons pressed there are queued with their time and replayed here.
 const titleFor=(mode,sets)=>{const left=Math.max(0,state.config.targetSets-sets);return mode==='focus'?`Foco – ${left<=1?'última série':`faltam ${left} séries`}`:`${modeName[mode]} – ${left===1?'falta 1 série':`faltam ${left} séries`}`;};
 function nativePlan(){
  const t=state.timer,c=state.config,segments=[];let mode=t.mode,sets=t.setsDone;
  const startText={focus:'De volta ao foco.',short:'Hora da pausa curta.',long:'Hora da pausa longa.'};
  for(let i=0;i<40;i++){
   segments.push({mode,durMs:planned(mode),title:titleFor(mode,sets),open:mode==='focus'&&!!c.flow,startText:startText[mode]});
   if(mode!=='focus'){mode='focus';continue;}
   if(++sets>=c.targetSets)break;
   mode=c.longEnabled&&sets%c.longEvery===0?'long':'short';
  }
  return {segments,at:now(),elapsedMs:elapsed(),paused:t.status==='paused',flowNotified:!!t.flowNotified,task:state.task.trim(),effects:!!state.prefs.effects,
   block:{on:!!state.prefs.block.on,allow:state.prefs.block.allow},
   endText:'Meta da sessão concluída!',flowText:'Tempo mínimo atingido. Siga no flow ou comece a pausa.'};
 }
 function nativeOngoing(){
  const t=state.timer,on=state.prefs.notify&&t.status!=='idle';
  const sig=on?JSON.stringify([t,state.config,state.task,state.prefs.effects,state.prefs.block]):'off';
  if(sig===ongoingSig)return;ongoingSig=sig;
  Promise.resolve(on?native.update(nativePlan()):native.stop()).catch(()=>{});
 }
 // Replays the buttons pressed on the notification, each at the moment it was pressed.
 let draining=null;
 function drainNative(){
  if(!native)return;
  if(draining)return draining;
  draining=(async()=>{
   try{
    const list=(await native.drain())?.actions||[];if(!list.length)return;
    const clock=globalThis.PELEJA_NOW;replaying=true;
    try{for(const a of list){
     globalThis.PELEJA_NOW=()=>a.at;advance();
     if(state.timer.status==='idle')continue;
     if(a.action==='toggle')actions.toggle();
     else if(a.action==='skip'){if(state.timer.status==='paused')actions.toggle();actions.skip();}
     else if(a.action==='finish')actions.stop();
    }}finally{globalThis.PELEJA_NOW=clock;replaying=false;}
    advance();ongoingSig='';render();syncSound();
   }catch(e){console.error(e);}finally{draining=null;}
  })();
  return draining;
 }
 native?.addListener?.('action',()=>drainNative());

 // ---------- state machine ----------
 function startPhase(mode,at=now(),carry=0){Object.assign(state.timer,{mode,status:'running',accMs:carry,runningSince:at,phaseStartedAt:at-carry,flowNotified:false});}
 function completeFocus({at=now(),manual=false}={}){
  const e=state.timer.status==='running'?state.timer.accMs+(at-state.timer.runningSince):state.timer.accMs;
  const focusMs=state.config.flow||manual?e:Math.min(e,planned('focus'));recordBlock(focusMs,at);
  state.timer.setsDone++;
  if(state.timer.setsDone>=state.config.targetSets){
   Object.assign(state.timer,{status:'idle',mode:'focus',accMs:0,runningSince:0,flowNotified:false});chime('session_end');notify('Meta da sessão concluída!');
   save();render();syncSound();openGoalReached();return;
  }
  const isLong=state.config.longEnabled&&state.timer.setsDone%state.config.longEvery===0;
  const carry=!state.config.flow&&!manual?Math.max(0,e-planned('focus')):0;
  startPhase(isLong?'long':'short',at,carry);chime('session_end');notify(isLong?'Hora da pausa longa.':'Hora da pausa curta.');save();
 }
 function completeBreak({at=now()}={}){
  const e=state.timer.status==='running'?state.timer.accMs+(at-state.timer.runningSince):state.timer.accMs;
  startPhase('focus',at,Math.max(0,e-planned(state.timer.mode)));chime('session_start');notify('De volta ao foco.');save();
 }
 // Catch up with whatever happened while the page was closed or in the background.
 function advance(){
  let guard=0;
  while(state.timer.status==='running'&&guard++<50){
   const e=elapsed(),p=planned(state.timer.mode);
   if(state.timer.mode==='focus'){
    if(state.config.flow){if(e>=p&&!state.timer.flowNotified){state.timer.flowNotified=true;save();chime('session_start',.45);wave();notify('Tempo mínimo atingido. Siga no flow ou comece a pausa.');}break;}
    if(e<p)break;completeFocus({at:state.timer.runningSince+(p-state.timer.accMs)});
   }else{if(e<p)break;completeBreak({at:state.timer.runningSince+(p-state.timer.accMs)});}
  }
 }
 // Session controls: play/pause in the middle; while a session is on, the side buttons reset or end it.
 let flash='',flashTimer=0;
 function showFlash(text){flash=text;clearTimeout(flashTimer);flashTimer=setTimeout(()=>{flash='';render();},3500);}
 function resetTimer(){Object.assign(state.timer,{status:'idle',mode:'focus',accMs:0,runningSince:0,setsDone:0,flowNotified:false,sessionId:''});}
 function finishSession(celebrate){
  touch();const t=state.timer;if(t.mode==='focus'&&t.status!=='idle')recordBlock(elapsed(),now());
  resetTimer();chime(celebrate?'session_end':'session_stop',.8);save();render();syncSound(600);
  if(celebrate)openGoalReached();else if(openNotes_()&&!replaying)openNotes('Da sessão que passou. Risque o que já resolveu.');
 }
 const actions={
  toggle(){
   const t=state.timer;touch();
   if(t.status==='running'){t.accMs=elapsed();t.status='paused';t.runningSince=0;chime('session_end',.7);}
   else if(t.status==='paused'){t.status='running';t.runningSince=now();chime('session_start',.7);}
   else{flash='';startPhase('focus');t.setsDone=0;t.sessionId=crypto.randomUUID();chime('session_start',.7);
    // the browser only asks for permission after a tap: the first play is that moment
    if(!native&&state.prefs.notify&&typeof Notification!=='undefined'&&Notification.permission==='default')Promise.resolve(Notification.requestPermission?.()).then(()=>{ongoingSig='';updateOngoing();}).catch(()=>{});}
   save();render();syncSound(t.status==='running'?1500:600);
  },
  // Flow: "Começar pausa" ends the focus with the extra time counted.
  startBreak(){if(state.timer.mode!=='focus'||state.timer.status==='idle')return;touch();completeFocus({manual:true});render();syncSound();},
  // Skip ends the current phase now (a focus counts as a set), only while running.
  skip(){if(state.timer.status!=='running')return;touch();if(state.timer.mode==='focus')completeFocus({manual:true});else completeBreak();render();syncSound();},
  // Discard: back to the start, the focus in progress is not kept.
  discard(){if(state.timer.status==='idle')return;touch();resetTimer();chime('session_stop',.6);save();render();syncSound(600);},
  // Finish: keeps what was focused; under a minute nothing counts; with sets left it asks first.
  finish(){
   const t=state.timer,c=state.config;if(t.status==='idle')return;
   if(t.mode==='focus'&&elapsed()<60000){showFlash('Menos de 1 minuto não conta.\nBora de novo?');touch();resetTimer();chime('session_stop',.6);save();render();syncSound(600);return;}
   const left=Math.max(0,t.mode==='focus'?c.targetSets-(t.setsDone+1):c.targetSets-t.setsDone);
   if(!left){finishSession(true);return;}
   const text=`${left===1?'Ainda falta 1 série':`Ainda faltam ${left} séries`} do plano. O que você já focou fica salvo.`;
   if(typeof confirmPeleja==='function')confirmPeleja('Concluir a sessão?',()=>finishSession(false),{description:text,accept:'Concluir'});else finishSession(false);
  },
  stop(){if(state.timer.status!=='idle')finishSession(false);}
 };

 // ---------- page ----------
 const I2={
  pencil:'<path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5Z"/><path d="M13.8 7l3.2 3.2"/>',
  headphones:'<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.6"/><rect x="16.5" y="14" width="4" height="6" rx="1.6"/>',
  routine:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  reset:'<path d="M5 12a7 7 0 1 0 2.2-5.1"/><path d="M5 4.5v4h4"/>',
  end:'<rect x="6.5" y="6.5" width="11" height="11" rx="3" fill="currentColor" stroke="none"/>',
  cup:'<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16"/>',
  stopwatch:'<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.6M9.5 2.8h5"/>',
  stack:'<path d="M4 8h16M4 12h16M4 16h16"/>',
  trash:'<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
  close:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  tree:'<path d="M12 3 6 11h3l-4 6h14l-4-6h3Z"/><path d="M12 17v4"/>',
  drop:'<path d="M12 3.5c3.4 4.4 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.6-6.4 6-10.8Z"/>',
  noise:'<path d="M3 12h2l2-6 3 12 3-9 2 6 2-3h4"/>',
  fire:'<path d="M12 3c.6 3 3.6 4.6 5 7.4 1.5 3 .8 6.6-1.7 8.4A6.5 6.5 0 0 1 6 15c0-2.6 1.3-4.4 2.6-5.6.2 1.7 1 2.8 2.2 3.3C10.2 9 10.8 5.8 12 3Z"/>',
  book:'<path d="M4 5.5c3-1 5.5-.5 8 1.5 2.5-2 5-2.5 8-1.5V19c-3-1-5.5-.5-8 1.5-2.5-2-5-2.5-8-1.5Z"/><path d="M12 7v13"/>',
  waves:'<path d="M3 9c3-2 6 2 9 0s6 2 9 0M3 14c3-2 6 2 9 0s6 2 9 0"/>',
  note:'<rect x="4.5" y="4.5" width="15" height="15" rx="4"/>',
  tick:'<path d="m7.5 12.3 3 3 6-6.3"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7"/>'
 };
 const SOUND_ICONS={forest:I2.tree,rain:I2.drop,brown_noise:I2.noise,fireplace:I2.fire,library:I2.book,riverside:I2.waves};
 const SOUND_NOTES={forest:'Pássaros e folhas',rain:'Chuva constante',brown_noise:'Grave e contínuo',fireplace:'Estalos de lenha',library:'Murmúrio baixinho',riverside:'Água correndo'};
 const page=el('section',{id:'pomodoroPage',className:'pomodoro',hidden:true});page.setAttribute('aria-label','Pomodoro');
 page.innerHTML=`<div class="pomo-head"></div>
 <div class="pomo-taskline" id="pomoTaskLine"><button type="button" class="pomo-task" id="pomoTask"><span id="pomoTaskName"></span><span class="pomo-task-edit">${icon(I2.pencil)}</span></button>
  <div class="pomo-meta"><span class="pomo-status" id="pomoStatus"><i></i><span></span></span><button type="button" class="pomo-sound-chip" id="pomoSoundChip"></button><button type="button" class="pomo-sound-chip pomo-notes-chip" id="pomoNotesChip"></button></div></div>
 <div class="pomo-ring-wrap"><svg class="pomo-ring" id="pomoRing" viewBox="0 0 300 300" aria-hidden="true"><circle class="pomo-track" cx="150" cy="150" r="128"/><path class="pomo-progress" id="pomoProgress" d=""/></svg>
 <div class="pomo-center"><span class="pomo-mode" id="pomoMode">Foco</span><strong id="pomoTime" aria-live="off">25:00</strong><span class="pomo-set-line" id="pomoSetLine"></span><p class="pomo-flash" id="pomoIdleLabel" hidden></p><button type="button" class="pomo-flow-break" id="pomoFlowBreak" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16"/></svg><span>Começar pausa</span></button></div></div>
 <div class="pomo-swap">
  <div class="pomo-plan-wrap" id="pomoConfig" role="group" aria-label="Plano da sessão"><div class="pomo-plan"><button type="button" data-duration="focus"><span class="pomo-plan-icon">${icon(I2.stopwatch)}</span><span><b id="pomoFocusMin"></b><small>foco</small></span></button><button type="button" data-duration="short"><span class="pomo-plan-icon">${icon(I2.cup)}</span><span><b id="pomoShortMin"></b><small>pausa</small></span></button></div>
  <div class="pomo-plan-chips"><span class="pomo-plan-chip" id="pomoPlanSets">${icon(I2.stack)}<span id="pomoChipSets"></span></span><span class="pomo-plan-chip" id="pomoChipFocus">${icon(I.clock)}<span></span></span><span class="pomo-plan-chip" id="pomoChipEnd">${icon(I.flag)}<span class="pomo-chip-long"></span><span class="pomo-chip-short" aria-hidden="true"></span></span></div></div>
  <div class="pomo-goal" id="pomoGoal" hidden><div class="pomo-goal-top"><span class="pomo-count" id="pomoGoalTitle"><span>Série </span><b id="pomoDone">1</b><span id="pomoTarget"> de 4</span></span><span class="pomo-long-pill" id="pomoLongPill"></span><button type="button" class="pomo-skip" id="pomoSkip">Pular ${icon(I.skip)}</button></div>
  <div class="pomo-segments" id="pomoSegments"></div><p class="pomo-left"><b id="pomoLeft"></b> · <span id="pomoNudge"></span></p></div>
 </div>
 <div class="pomo-controls"><button type="button" class="pomo-side" id="pomoSideLeft"></button><button type="button" class="pomo-play" id="pomoPlay"></button><button type="button" class="pomo-side" id="pomoSideRight"></button></div>`;
 (document.querySelector('.app main')||document.body).append(page);

 // ring: wavy progress around a plain track (the wave travels slowly while running)
 function ringPath(progress,phase){
  const cx=150,cy=150,r=128,amp=2.6,waves=30,points=[],steps=Math.max(2,Math.round(360*progress));
  for(let i=0;i<=steps;i++){const t=i/360,a=-Math.PI/2+t*2*Math.PI,rr=r+amp*Math.sin(waves*a+phase);points.push(`${(cx+rr*Math.cos(a)).toFixed(2)} ${(cy+rr*Math.sin(a)).toFixed(2)}`);}
  return progress<=0?'':'M'+points.join('L');
 }
 let wavePhase=0,frame=0;
 function draw(){
  const t=state.timer,p=planned(t.mode),e=elapsed(),over=t.mode==='focus'&&state.config.flow&&e>p;
  // past the minimum in flow: "Começar pausa" turns into the main call to action
  const fb=$('pomoFlowBreak');if(fb&&fb.dataset.over!==String(over))fb.dataset.over=String(over);
  const progress=t.status==='idle'?0:Math.min(1,e/p);
  $('pomoProgress').setAttribute('d',ringPath(progress,wavePhase));
  $('pomoTime').textContent=over?'+'+fmt(e-p):fmt(t.status==='idle'?planned('focus'):p-e);
  page.dataset.over=String(over);
  const cur=page.querySelector('.pomo-segments span[data-state=current] i');if(cur)cur.style.width=(Math.min(1,e/p)*100)+'%';
 }
 function loop(){draw();if(state.timer.status==='running'&&!document.hidden){if(!(typeof reduceMotion==='function'&&reduceMotion()))wavePhase+=.025;frame=requestAnimationFrame(loop);}else frame=0;}
 // Peleja's own voice for the session line.
 const FOCUS_LINES=['segura firme','cabeça no lugar','um bloco por vez','tá rendendo','foco no que importa','constância vence','sem pressa, sem pausa','tu consegue','mais um pouquinho','vai que vai'];
 const BREAK_LINES=['bebe uma água','estica as costas','respira fundo','olha pra longe','descansa a vista','levanta um pouco','deixa o celular quieto','só respira'];
 function goalMessages(){
  const t=state.timer,c=state.config,left=Math.max(0,c.targetSets-t.setsDone),pick=list=>list[(t.setsDone*7+3)%list.length];
  if(t.mode==='long')return ['Pausa longa','você mereceu'];
  if(t.mode==='short')return ['Pausa',pick(BREAK_LINES)];
  if(left<=1)return [c.targetSets===1?'Série única':'Última série','fecha com chave de ouro'];
  return [`Faltam ${left}`,pick(FOCUS_LINES)];
 }
 // Under the plan (idle): the sets (the Séries sheet), the focus time alone (focus × sets) and when the whole plan
 // ends if started now (focus + the breaks between sets, long ones where they fall; none after the last set).
 const hm=min=>{const h=Math.floor(min/60),m=min%60;return h?(m?`${h}h ${m}m`:`${h}h`):`${m} min`;};
 function planMinutes(c=state.config){let total=c.focusMin*c.targetSets;for(let i=1;i<c.targetSets;i++)total+=c.longEnabled&&i%c.longEvery===0?c.longMin:c.shortMin;return total;}
 function paintPlanChips(){
  const c=state.config,end=new Date(now()+planMinutes(c)*60000),start=new Date(now());
  const clock=`${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`,nextDay=end.toDateString()!==start.toDateString();
  $('pomoChipSets').textContent=`${c.targetSets} ${c.targetSets===1?'série':'séries'}`;
  $('pomoChipFocus').lastElementChild.textContent=`${hm(c.focusMin*c.targetSets)} de foco`;
  // phones get the short form so the three pills fit on one line
  $('pomoChipEnd').querySelector('.pomo-chip-long').textContent=`Termina ${nextDay?'amanhã ':'às '}${clock}`;$('pomoChipEnd').querySelector('.pomo-chip-short').textContent=`até ${clock}`;
 }
 function render(){
  const t=state.timer,c=state.config,active=t.status!=='idle',running=t.status==='running';
  page.dataset.mode=t.mode;page.dataset.status=t.status;page.dataset.active=String(active);
  $('pomoTaskName').textContent=state.task||'No que você vai focar?';$('pomoTask').classList.toggle('is-empty',!state.task);$('pomoTask').disabled=false;$('pomoTask').dataset.locked=String(t.status==='running');
  $('pomoTask').setAttribute('aria-label',t.status==='running'?'Tarefa: '+(state.task||'sem nome')+'. Pause para trocar':t.status==='paused'?'Trocar a tarefa':'Escolher a tarefa');
  $('pomoStatus').dataset.on=String(running);$('pomoStatus').lastElementChild.textContent=running?'Ativo':'Parado';
  const none=!state.sound.enabled,muted=!none&&state.sound.muted,name=SOUNDS.find(s=>s[0]===state.sound.id)?.[1]||'Sem som';
  $('pomoSoundChip').innerHTML=icon(none||muted?I.mute:I.sound)+`<span>${none?'Sem som':muted?'Mudo':name}</span>`;
  $('pomoSoundChip').disabled=none;$('pomoSoundChip').dataset.state=none?'none':muted?'muted':running?'playing':'on';
  $('pomoSoundChip').setAttribute('aria-label',none?'Sem som de fundo':muted?'Ligar o som':'Silenciar o som');
  const notes=openNotes_();$('pomoNotesChip').innerHTML=icon(I2.note)+(notes?`<b class="pomo-notes-count">${notes}</b>`:'');$('pomoNotesChip').title='Tarefas';
  $('pomoNotesChip').dataset.count=String(notes);$('pomoNotesChip').setAttribute('aria-label',notes?`Tarefas anotadas: ${notes}`:'Anotar uma tarefa');
  // ring: the planned time when idle, the countdown while active; notices replace the set line
  $('pomoMode').textContent=t.mode==='focus'?(c.flow&&active?'Foco · flow':'Foco'):modeName[t.mode];
  $('pomoSetLine').textContent=active?(t.mode==='focus'?`série ${Math.min(t.setsDone+1,c.targetSets)} de ${c.targetSets}`:'próxima série já já'):'Aperte o play para começar';
  $('pomoIdleLabel').textContent=flash;$('pomoIdleLabel').hidden=!flash;$('pomoSetLine').hidden=!!flash;
  $('pomoFlowBreak').hidden=!(t.mode==='focus'&&c.flow&&active);
  // below the ring: the plan bar when idle, the series track while active
  $('pomoConfig').hidden=active;$('pomoGoal').hidden=!active;
  $('pomoFocusMin').textContent=c.focusMin+' min';$('pomoShortMin').textContent=c.shortMin+' min';paintPlanChips();
  const badge=c.longEnabled&&c.longEvery<c.targetSets;$('pomoLongPill').hidden=!badge;$('pomoLongPill').textContent=badge?`longa de ${c.longMin} min`:'';
  $('pomoDone').textContent=String(Math.min(t.setsDone+(t.mode==='focus'?1:0),c.targetSets)||1);$('pomoTarget').textContent=' de '+c.targetSets;
  $('pomoGoalTitle').firstElementChild.textContent=t.mode==='focus'?'Série ':'Feitas ';
  if(t.mode!=='focus')$('pomoDone').textContent=String(t.setsDone);
  $('pomoSkip').hidden=c.targetSets<=1;$('pomoSkip').disabled=!running;
  const [main,sub]=goalMessages();$('pomoLeft').textContent=main;$('pomoNudge').textContent=sub;
  const seg=$('pomoSegments');seg.replaceChildren();
  for(let i=1;i<=c.targetSets;i++){
   const s=el('span',{},el('i'));s.dataset.state=i<=t.setsDone?'done':i===t.setsDone+1&&t.mode==='focus'?'current':'todo';seg.append(s);
   if(i<c.targetSets&&c.longEnabled&&i%c.longEvery===0){const b=el('em');b.dataset.state=i<t.setsDone||(i===t.setsDone&&t.mode==='focus')?'done':i===t.setsDone?'current':'todo';seg.append(b);}
  }
  // controls in the same places and with the same names as Sessions: Som | play | Séries, then Descartar | pause | Concluir
  $('pomoSideLeft').innerHTML=`<span class="pomo-side-btn">${icon(active?I2.reset:I2.headphones)}</span><span>${active?'Descartar':'Som'}</span>`;$('pomoSideLeft').dataset.kind=active?'discard':'sound';
  $('pomoSideRight').innerHTML=`<span class="pomo-side-btn">${icon(active?I2.check:I2.stack)}</span><span>${active?'Concluir':'Séries'}</span>`;$('pomoSideRight').dataset.kind=active?'finish':'sets';
  $('pomoPlay').innerHTML=icon(running?I.pause:I.play);$('pomoPlay').setAttribute('aria-label',running?'Pausar':t.status==='paused'?'Continuar':'Começar');
  draw();if(running&&!frame)frame=requestAnimationFrame(loop);
  updateOngoing();
  globalThis.PELEJA_POMODORO_CHANGED?.(); // the mini player follows every change
 }

 // ---------- sheets and dialogs ----------
 // A panel from the bottom on the phone, a centered window on larger screens.
 const dialog=el('dialog',{id:'pomoDialog',className:'pomo-dialog'});(document.querySelector('.app')||document.body).append(dialog);
 let onClose=null;
 dialog.addEventListener('close',()=>{const f=onClose;onClose=null;f?.();});
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 const closeButton=()=>{const b=el('button',{type:'button',className:'pomo-dialog-close',innerHTML:icon(I2.close),onclick:()=>dialog.close()});b.setAttribute('aria-label','Fechar');return b;};
 function openSheet(kind,title,lead,...body){
  dialog.className='pomo-dialog pomo-sheet';dialog.dataset.kind=kind;
  dialog.replaceChildren(el('div',{className:'pomo-sheet-head'},el('div',{},el('h2',{textContent:title}),lead?el('p',{className:'pomo-lead',textContent:lead}):''),closeButton()),...body);
  dialog.showModal();
  if(typeof motion==='function')motion(dialog,globalThis.matchMedia?.('(max-width:760px)')?.matches?[{transform:'translateY(100%)'},{transform:'none'}]:[{opacity:0,transform:'translateY(10px) scale(.98)'},{opacity:1,transform:'none'}],{duration:260,easing:'cubic-bezier(.22,1,.36,1)'});
 }
 function openSmall(kind,...body){
  dialog.className='pomo-dialog pomo-small';dialog.dataset.kind=kind;dialog.replaceChildren(...body);dialog.showModal();
  if(typeof motion==='function')motion(dialog,[{opacity:0,transform:'scale(.96)'},{opacity:1,transform:'none'}],{duration:200});
 }
 const applied=()=>{save();render();syncSound();};
 const switchRow=(label,checked,id,note)=>{const input=el('input',{type:'checkbox',checked,id});input.setAttribute('role','switch');return el('label',{className:'pomo-switch switch-option'},el('span',{className:'pomo-switch-text'},el('span',{textContent:label}),note?el('small',{textContent:note}):''),input,el('span',{className:'switch-visual','aria-hidden':'true'}));};
 const saveButton=(label,onclick)=>el('button',{type:'button',className:'primary pomo-sheet-save',textContent:label,onclick});
 // Slider you drag, with the value on the right and the limits below (same gesture as Sessions).
 function slider(label,value,min,max,step,format,id,ends=true){
  const out=el('b',{className:'pomo-slider-value'}),input=el('input',{type:'range',min,max,step,value,id});
  const paint=()=>{const lo=+input.min,hi=+input.max;out.textContent=format(+input.value);input.style.setProperty('--fill',(hi>lo?(input.value-lo)/(hi-lo)*100:100)+'%');input.setAttribute('aria-valuetext',format(+input.value));};
  let last=+input.value;
  input.addEventListener('input',()=>{paint();if(+input.value!==last){last=+input.value;try{navigator.vibrate?.(4);}catch{}}});input.setAttribute('aria-label',label);
  const ticks=el('span',{className:'pomo-ticks','aria-hidden':'true'}),track=el('div',{className:'pomo-slider-track'},input,ticks);
  const lo=el('span'),hi=el('span'),box=el('div',{className:'pomo-slider'},el('div',{className:'pomo-slider-head'},el('span',{textContent:label}),out),track,ends?el('div',{className:'pomo-range-ends'},lo,hi):'');
  box.setRange=(a,b)=>{input.min=a;input.max=b;if(+input.value>b)input.value=b;if(+input.value<a)input.value=a;lo.textContent=format(a);hi.textContent=format(b);input.disabled=a===b;
   const n=Math.round((b-a)/(+input.step||1));track.style.setProperty('--steps',String(Math.max(1,n>24?n/5:n)));ticks.hidden=n<1;last=+input.value;paint();};
  box.setRange(min,max);return box;
 }
 // Time: drag to choose, 5 by 5 minutes.
 function openDuration(kind){
  const focus=kind==='focus',c=state.config,max=focus?120:30;
  const s=slider(focus?'Foco':'Pausa',focus?c.focusMin:c.shortMin,5,max,5,v=>v+' min','pomoDurationValue');
  openSmall('duration',el('div',{className:'pomo-sheet-head'},el('div',{},el('h2',{textContent:focus?'Tempo de foco':'Tempo de pausa'}),el('p',{className:'pomo-lead',textContent:focus?(c.flow?'No flow, é o mínimo de cada foco.':'Quanto dura cada série.'):'O respiro entre uma série e outra.'})),closeButton()),s,
   el('div',{className:'pomo-dialog-actions'},el('button',{type:'button',className:'primary',textContent:'Usar este tempo',onclick:()=>{const v=+$('pomoDurationValue').value;if(focus)c.focusMin=v;else c.shortMin=v;applied();dialog.close();}})));
 }
 // Task and routines: name what you will focus on, or pick a saved routine (task + times + series).
 function syncRoutines(){saveRoutines?.(state.templates.map(t=>({id:String(t.id).slice(0,60),name:t.name,focusMin:t.focusMin,shortMin:Math.max(1,t.shortMin),targetSets:t.targetSets,longEnabled:!!t.longEnabled,longMin:t.longMin,longEvery:Math.max(1,t.longEvery)})));}
 const describe=t=>`${t.focusMin} + ${t.shortMin} min · ${t.targetSets}×`;
 const configOf=()=>{const c=state.config;return {focusMin:c.focusMin,shortMin:c.shortMin,targetSets:c.targetSets,longEnabled:c.longEnabled,longMin:c.longMin,longEvery:c.longEvery};};
 // With the session paused the task can be renamed: only the name (a routine would change the times mid-session).
 // The focus in progress is saved under the new name when it ends.
 function renameTask(){
  const input=el('input',{type:'text',maxLength:80,value:state.task,placeholder:'Ex.: Hematologia, PR2.2, Revisão…',id:'pomoTaskInput',autocomplete:'off'});
  const done=()=>{const name=input.value.trim().slice(0,80);if(name!==state.task){state.task=name;touch();applied();updateOngoing();globalThis.toast?.('Tarefa trocada','edit');}dialog.close();};
  const clear=el('button',{type:'button',className:'pomo-input-clear',innerHTML:icon(I2.close),onclick:()=>{input.value='';input.focus();clear.hidden=true;}});clear.setAttribute('aria-label','Limpar');clear.hidden=!input.value;
  const setTask=el('button',{type:'button',className:'pomo-input-go',id:'pomoSetTask',textContent:'Ok',onclick:done});
  input.oninput=()=>{clear.hidden=!input.value;};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();done();}};
  openSheet('task','Trocar a tarefa','Vale para o foco em andamento e os próximos.',el('div',{className:'pomo-input'},input,clear,setTask));
  setTimeout(()=>input.focus(),60);
 }
 function openTask(){
  const input=el('input',{type:'text',maxLength:80,value:state.task,placeholder:'Ex.: Hematologia, PR2.2, Revisão…',id:'pomoTaskInput',autocomplete:'off'});
  const clear=el('button',{type:'button',className:'pomo-input-clear',innerHTML:icon(I2.close),onclick:()=>{input.value='';input.focus();sync();}});clear.setAttribute('aria-label','Limpar');
  const setTask=el('button',{type:'button',className:'pomo-input-go',id:'pomoSetTask',textContent:'Ok',onclick:()=>{state.task=input.value.trim().slice(0,80);applied();dialog.close();}});
  const list=el('div',{className:'pomo-routines'}),action=el('button',{type:'button',className:'pomo-routine-save',id:'pomoTemplateSave'});
  const same=(a,b)=>['focusMin','shortMin','targetSets','longEnabled','longMin','longEvery'].every(k=>a[k]===b[k]);
  function drawList(){
   list.replaceChildren();
   if(!state.templates.length)list.append(el('p',{className:'pomo-routines-empty',textContent:'Nenhuma rotina ainda. Ajuste o plano, dê um nome e salve aqui embaixo.'}));
   for(const t of state.templates){
    const del=el('button',{type:'button',className:'pomo-template-delete',innerHTML:icon(I2.trash),onclick:e=>{e.stopPropagation();const go=()=>{state.templates=state.templates.filter(x=>x.id!==t.id);save();syncRoutines();drawList();sync();};if(typeof confirmPeleja==='function')confirmPeleja('Apagar rotina?',go,{description:`“${t.name}” sai da sua lista.`,accept:'Apagar',destructive:true});else go();}});
    del.setAttribute('aria-label','Apagar rotina '+t.name);
    const pick=el('button',{type:'button',className:'pomo-template',onclick:()=>{state.task=t.name;Object.assign(state.config,{focusMin:t.focusMin,shortMin:t.shortMin,targetSets:t.targetSets,longEnabled:t.longEnabled,longMin:t.longMin,longEvery:t.longEvery});applied();dialog.close();}},el('b',{textContent:t.name}),el('small',{textContent:describe(t)}));
    list.append(el('div',{className:'pomo-routine'},pick,del));
   }
  }
  function sync(){
   const name=input.value.trim(),match=name?state.templates.find(t=>t.name.toLowerCase()===name.toLowerCase()):null,changed=match&&!same(match,configOf());
   clear.hidden=!input.value;
   const c=state.config,plan=`${c.focusMin} + ${c.shortMin} min · ${c.targetSets}×`;
   action.replaceChildren(el('span',{textContent:match?(changed?'Atualizar rotina':'Rotina salva'):'Salvar como rotina'}),el('small',{textContent:name?`“${name}” · ${plan}`:`Dê um nome acima · ${plan}`}));
   action.disabled=!name||(match&&!changed);
   action.onclick=()=>{
    if(!name||(match&&!changed))return;
    if(match)Object.assign(match,configOf());else state.templates=[{id:crypto.randomUUID(),name:name.slice(0,80),...configOf()},...state.templates].slice(0,20);
    save();syncRoutines();drawList();sync();globalThis.toast?.(match?'Rotina atualizada':'Rotina salva','check');
   };
  }
  input.oninput=sync;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();setTask.click();}};
  drawList();sync();
  openSheet('task','No que você vai focar?','',el('div',{className:'pomo-input'},input,clear,setTask),el('h3',{className:'pomo-sheet-sub',textContent:'Suas rotinas'}),list,action);
  setTimeout(()=>input.focus(),60);
 }
 // Ambient sound: a list with a short description; the chosen sound plays while the panel is open.
 let preview=null;
 const stopPreview=()=>{if(preview?.stop)preview.stop();else preview?.pause();preview=null;};
 function playPreview(id){stopPreview();if(!id)return;if(audio()){preview=looper(id,.7);return;}preview=new Audio(soundUrl(id));preview.loop=true;preview.volume=.7;preview.play?.()?.catch?.(()=>{});}
 function openSound(){
  let pick=state.sound.id||'rain';
  const toggle=switchRow('Som ambiente',state.sound.enabled,'pomoSoundOn','Alto no foco, baixinho na pausa, mudo quando pausar'),on=toggle.querySelector('input');
  const list=el('div',{className:'pomo-sound-list',role:'radiogroup'});list.setAttribute('aria-label','Sons');
  const paint=()=>{list.classList.toggle('is-off',!on.checked);for(const b of list.children){b.setAttribute('aria-checked',String(b.dataset.sound===pick));b.disabled=!on.checked;}};
  for(const [id,label] of SOUNDS){const b=el('button',{type:'button',role:'radio'},el('span',{className:'pomo-sound-icon',innerHTML:icon(SOUND_ICONS[id])}),el('span',{className:'pomo-sound-text'},el('b',{textContent:label}),el('small',{textContent:SOUND_NOTES[id]})),el('span',{className:'pomo-eq','aria-hidden':'true'},el('i'),el('i'),el('i')));b.dataset.sound=id;b.onclick=()=>{pick=id;paint();playPreview(id);};list.append(b);}
  on.onchange=()=>{paint();playPreview(on.checked?pick:null);};
  // What is on screen is kept however the sheet closes (Salvar, X, outside or back): it stays until changed.
  const commit=()=>{const was=state.sound.id,turnedOn=on.checked&&!state.sound.enabled;state.sound.enabled=on.checked;state.sound.id=pick;if(on.checked&&(was!==pick||turnedOn||state.sound.muted))state.sound.muted=false;applied();};
  paint();onClose=()=>{stopPreview();commit();};
  openSheet('sound','Som','Um som de fundo para ajudar a focar.',toggle,list,saveButton('Salvar',()=>{commit();dialog.close();}));
 }
 // Series: how many, the long break (length and how often) and the flow switch, all by dragging.
 function openSets(){
  const c=state.config;
  const sets=slider('Séries',c.targetSets,1,12,1,v=>String(v),'pomoTargetSets');
  const longOn=switchRow('Pausa longa',c.longEnabled,'pomoLongOn','Um descanso maior de tempos em tempos');
  const duration=slider('Duração',c.longMin,15,45,5,v=>v+' min','pomoLongMin');
  const every=slider('A cada',Math.min(c.longEvery,Math.max(1,c.targetSets-1)),1,Math.max(1,c.targetSets-1),1,v=>v===1?'1 série':v+' séries','pomoLongEvery');
  const longFields=el('div',{className:'pomo-long',id:'pomoLongFields'},duration,every);
  const flow=switchRow('Flow',c.flow,'pomoFlowOn','O tempo de foco vira um mínimo. Passou dele, o relógio segue contando até você tocar em “Começar pausa”.');
  const commit=()=>{if(!$('pomoTargetSets'))return;c.targetSets=+$('pomoTargetSets').value;c.longEnabled=$('pomoLongOn').checked;c.longMin=+$('pomoLongMin').value;c.longEvery=Math.min(+$('pomoLongEvery').value,Math.max(1,c.targetSets-1));c.flow=$('pomoFlowOn').checked;applied();};
  openSheet('sets','Séries','Quantas séries fazer e quando ter a pausa longa.',sets,el('div',{className:'pomo-sheet-group'},longOn,longFields),native?blockSection(commit):'',flow,saveButton('Salvar',()=>{commit();dialog.close();}));
  onClose=commit; // closing without Salvar keeps the changes too
  $('pomoTargetSets').addEventListener('input',()=>every.setRange(1,Math.max(1,+$('pomoTargetSets').value-1)));
  const syncLong=()=>{longFields.hidden=!$('pomoLongOn').checked;};$('pomoLongOn').onchange=syncLong;syncLong();
 }
 function openGoalReached(){
  const n=openNotes_(),later=n?el('button',{type:'button',className:'pomo-goal-notes',id:'pomoGoalNotes',onclick:()=>openNotes('Da sessão que passou. Risque o que já resolveu.')},el('span',{innerHTML:icon(I2.note)}),el('span',{textContent:`${n===1?'1 tarefa anotada':n+' tarefas anotadas'}`}),el('b',{textContent:'Ver lista'})):'';
  openSmall('goal',el('span',{className:'pomo-goal-icon',innerHTML:icon(I2.trophy)}),el('h2',{textContent:'Plano cumprido!'}),el('p',{className:'pomo-lead',textContent:'Todas as séries feitas. O fogo de hoje tá garantido. Descansa que tu merece.'}),later,saveButton('Valeu!',()=>dialog.close()));
 }
 // Tasks noted during a focus, like a notebook page: one line each with a box in front. Enter keeps the page
 // open on a new empty line; ticking the box crosses the task out, and crossed tasks leave when the page closes.
 function openNotes(lead='Uma linha por tarefa. Enter abre a próxima.'){
  const box=(checked,label,onclick)=>{const b=el('button',{type:'button',className:'pomo-note-box',innerHTML:icon(I2.note+(checked?I2.tick:'')),onclick});b.setAttribute('role','checkbox');b.setAttribute('aria-checked',String(checked));b.setAttribute('aria-label',label);return b;};
  const input=el('input',{type:'text',maxLength:NOTE_LEN,placeholder:'Nova tarefa',id:'pomoNoteInput',autocomplete:'off',enterKeyHint:'next'});input.setAttribute('aria-label','Nova tarefa');
  const count=el('span',{className:'pomo-note-count',id:'pomoNoteCount'});
  const newRow=el('div',{className:'pomo-note pomo-note-new'},el('span',{className:'pomo-note-box is-blank',innerHTML:icon(I2.note)}),input,count);
  const full=el('p',{className:'pomo-notes-full',id:'pomoNotesFull',textContent:`${NOTES_MAX} tarefas abertas: conclua uma pra anotar outra.`});
  const list=el('div',{className:'pomo-notes',id:'pomoNotesList'});
  const clearDone=el('button',{type:'button',className:'pomo-notes-clear',id:'pomoNotesClear',textContent:'Limpar concluídas',onclick:()=>{state.notes=state.notes.filter(n=>!n.done);changed();}});
  const changed=()=>{touch();save();render();draw();};
  const paintCount=()=>{const n=input.value.length;count.textContent=`${n}/${NOTE_LEN}`;count.dataset.near=String(n>=NOTE_LEN-10);};
  function draw(){
   list.replaceChildren();
   for(const n of state.notes){
    const toggle=box(!!n.done,(n.done?'Desmarcar: ':'Concluir: ')+n.text,()=>{n.done=!n.done;changed();});
    const del=el('button',{type:'button',className:'pomo-template-delete pomo-note-delete',innerHTML:icon(I2.trash),onclick:()=>{state.notes=state.notes.filter(x=>x.id!==n.id);changed();}});del.setAttribute('aria-label','Apagar '+n.text);
    const row=el('div',{className:'pomo-note'+(n.done?' is-done':'')},toggle,el('span',{className:'pomo-note-text',textContent:n.text}),del);row.dataset.note=n.id;list.append(row);
   }
   const isFull=openNotes_()>=NOTES_MAX;newRow.hidden=isFull;full.hidden=!isFull;list.append(newRow,full);
   clearDone.hidden=!state.notes.some(n=>n.done);paintCount();
  }
  input.oninput=paintCount;
  input.onkeydown=e=>{
   if(e.key!=='Enter')return;e.preventDefault();
   const text=input.value.trim().replace(/\s+/g,' ').slice(0,NOTE_LEN);if(!text||openNotes_()>=NOTES_MAX)return;
   // crossed-out tasks make room when the page is at its limit
   let next=[...state.notes,{id:crypto.randomUUID(),text}];while(next.length>NOTES_KEEP&&next.some(n=>n.done))next.splice(next.findIndex(n=>n.done),1);
   const before=state.notes;state.notes=next;
   if(!fits()){state.notes=before;full.textContent='Sem espaço: limpe as concluídas pra anotar mais.';full.hidden=false;return;}
   input.value='';changed();input.focus();
  };
  draw();openSheet('notes','Tarefas',lead,list,clearDone);
  // crossed-out tasks leave when the page closes
  onClose=()=>{if(state.notes.some(n=>n.done)){state.notes=state.notes.filter(n=>!n.done);touch();save();render();}};
  setTimeout(()=>{if(!newRow.hidden)input.focus();},60);
 }

 // ---------- wiring ----------
 $('pomoPlay').onclick=()=>actions.toggle();
 $('pomoSkip').onclick=()=>actions.skip();
 $('pomoSideLeft').onclick=()=>state.timer.status==='idle'?openSound():actions.discard();
 $('pomoSideRight').onclick=()=>state.timer.status==='idle'?openSets():actions.finish();
 $('pomoFlowBreak').onclick=()=>actions.startBreak();
 $('pomoTask').onclick=()=>{const s=state.timer.status;if(s==='idle')openTask();else if(s==='paused')renameTask();else globalThis.toast?.('Pause para trocar a tarefa','info');};
 $('pomoNotesChip').onclick=()=>openNotes();
 $('pomoSoundChip').onclick=()=>{if(!state.sound.enabled)return;state.sound.muted=!state.sound.muted;save();render();syncSound(400);};
 for(const b of page.querySelectorAll('[data-duration]'))b.onclick=()=>openDuration(b.dataset.duration);
 // the end time moves with the clock while the plan waits
 setInterval(()=>{if(state.timer.status==='idle'&&!page.hidden)paintPlanChips();},30000);
 setInterval(()=>{if(state.timer.status==='running'){const before=state.timer.mode+state.timer.setsDone+state.timer.status;advance();if(before!==state.timer.mode+state.timer.setsDone+state.timer.status){render();syncSound();}else if(document.hidden)draw();}},500);
 // Back on the page: it shows the phase itself, so the "pausa/foco" notices already seen can go.
 const clearAlerts=()=>{if(native||!allowed())return;worker().then(reg=>reg?.getNotifications?.({tag:'peleja-pomodoro-alert'})).then(list=>(list||[]).forEach(n=>n.close())).catch(()=>{});};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){pull().finally(()=>{advance();render();clearAlerts();drainNative();});}});
 addEventListener('online',()=>flush());

 // ---------- navigation ----------
 const others=['dashboardPage','libraryPage','facultyPage','mockPage','performancePage','extraPage'];
 function showPomodoro({quiet=false}={}){
  try{closeMenus?.();closeFacultyMenu?.();hideMockPages?.();hideExtraCourses?.();hideDashboard?.();}catch{}
  for(const id of [...others,'facultyDemo'])if($(id))$(id).hidden=true;
  for(const b of document.querySelectorAll('.app header nav button')){b.classList.remove('selected');b.removeAttribute('aria-current');}
  page.hidden=false;$('navPomodoro')?.classList.add('selected');$('navPomodoro')?.setAttribute('aria-current','page');
  advance();render();
  if(!quiet&&typeof motion==='function')motion(page,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:220});
 }
 // Any other page coming up hides the Pomodoro (their own show functions do not know about it).
 const watch=new MutationObserver(()=>{if(!page.hidden&&others.some(id=>$(id)&&!$(id).hidden)){page.hidden=true;$('navPomodoro')?.classList.remove('selected');$('navPomodoro')?.removeAttribute('aria-current');}});
 for(const id of others)if($(id))watch.observe($(id),{attributes:true,attributeFilter:['hidden']});
 $('navPomodoro')?.addEventListener('click',()=>showPomodoro());
 globalThis.showPomodoro=showPomodoro;

 // ---------- settings (section in Configurações) ----------
 const settingsPanel=el('section',{id:'pomodoroSettingsPanel',hidden:true});
 settingsPanel.innerHTML='<h2 class="settings-panel-title">Pomodoro</h2>';
 const card=el('div',{className:'settings-card'},el('h3',{textContent:'Avisos e sons'}));
 const effects=switchRow('Sons de efeito (apitos de início e fim)',state.prefs.effects,'pomoPrefEffects');effects.classList.add('settings-row');
 const notifyRow=switchRow('Notificações do Pomodoro: o timer em andamento, com Pausar ou Pular e Concluir, e um aviso quando um foco ou pausa terminar',state.prefs.notify,'pomoPrefNotify');notifyRow.classList.add('settings-row');
 card.append(effects,notifyRow);settingsPanel.append(card);
 effects.querySelector('input').onchange=e=>{state.prefs.effects=e.target.checked;save();};
 // Whether the notifications can show at all, right under the switch: allowed (nothing), not asked yet
 // ("Permitir"), blocked in the browser (how to unblock) or off for the Peleja app on Android ("Permitir" / "Abrir ajustes").
 const notifyNote=el('div',{className:'pomo-notify-note',id:'pomoNotifyNote',hidden:true},el('p'),el('button',{type:'button',className:'pomo-notify-fix',id:'pomoNotifyFix'}));
 notifyRow.after(notifyNote);
 const nativeCall=(name,args={})=>cap?.nativePromise?cap.nativePromise('PelejaTimer',name,args):Promise.reject(Error('sem app'));
 async function permission(){
  if(native){try{const s=await nativeCall('notifyStatus');return s?.granted?'granted':s?.canAsk?'default':'native-denied';}catch{return 'native-unknown';}}
  return typeof Notification==='undefined'?'unsupported':Notification.permission;
 }
 async function askPermission(){
  if(native){try{const s=await nativeCall('requestNotify');return s?.granted?'granted':'native-denied';}catch{return 'native-unknown';}}
  if(typeof Notification==='undefined')return 'unsupported';
  try{return await Notification.requestPermission();}catch{return 'denied';}
 }
 async function paintNotify(){
  const p=await permission(),input=notifyRow.querySelector('input'),text=notifyNote.querySelector('p'),fix=notifyNote.querySelector('button');
  const blocked=p==='denied'||p==='native-denied'||p==='unsupported';
  input.checked=state.prefs.notify&&!blocked;
  const msg={default:['Falta o navegador permitir os avisos.','Permitir'],denied:['Bloqueado neste navegador. Libere em Configurações do site (o ícone do cadeado ao lado do endereço) e volte aqui.',''],
   unsupported:['Este navegador não mostra notificações.',''],'native-denied':['Notificações desligadas para o Peleja no Android.','Abrir ajustes'],'native-unknown':['Se as notificações não aparecerem, libere-as para o Peleja nas configurações do Android.','']}[p];
  notifyNote.hidden=!msg||(!state.prefs.notify&&p==='default');
  if(msg){text.textContent=msg[0];fix.textContent=msg[1];fix.hidden=!msg[1];notifyNote.dataset.state=p;}
  return p;
 }
 notifyNote.querySelector('button').onclick=async()=>{
  const p=notifyNote.dataset.state;
  if(p==='native-denied'){const s=await nativeCall('notifyStatus').catch(()=>null);if(s?.canAsk)await askPermission();else await nativeCall('openNotifySettings').catch(()=>{});}
  else{const r=await askPermission();if(r==='granted'){state.prefs.notify=true;save();if(!native)await worker();updateOngoing();}}
  paintNotify();
 };
 notifyRow.querySelector('input').onchange=async e=>{
  if(e.target.checked){
   let p=await permission();if(p==='default'||(native&&p==='native-denied'))p=await askPermission();
   if(p!=='granted'&&p!=='native-unknown'){e.target.checked=false;state.prefs.notify=false;save();await paintNotify();notifyNote.hidden=false;return;}
  }
  state.prefs.notify=e.target.checked;save();if(e.target.checked&&!native)await worker();updateOngoing();paintNotify();
 };
 paintNotify();
 // coming back from the browser's or Android's settings
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)paintNotify();});
 globalThis.PELEJA_POMODORO_NOTIFY=paintNotify;
 // Android app only: block other apps while a focus is running (the native AppBlocker does the blocking).
 let paintBlock=()=>{};
 async function openAllowList(back){
  const picked=new Set(state.prefs.block.allow);
  const search=el('input',{type:'search',placeholder:'Buscar app',className:'pomo-app-search',id:'pomoAppSearch'});search.setAttribute('aria-label','Buscar app');
  const list=el('div',{className:'pomo-app-list',id:'pomoAppList'},el('p',{className:'pomo-card-note',textContent:'Carregando apps…'}));
  openSheet('apps','Apps liberados','Esses continuam abrindo durante o foco.',search,list,saveButton('Salvar',()=>{
   state.prefs.block.allow=[...picked];save();updateOngoing();if(back)back();else dialog.close();
  }));
  let apps=[];try{apps=(await native.listApps())?.apps||[];}catch{}
  const draw=()=>{
   const q=search.value.trim().toLowerCase(),shown=apps.filter(a=>!q||a.label.toLowerCase().includes(q));
   list.replaceChildren(...shown.map(a=>{
    const input=el('input',{type:'checkbox',checked:picked.has(a.id)});input.onchange=()=>{if(input.checked)picked.add(a.id);else picked.delete(a.id);};
    const row=el('label',{className:'pomo-app'},a.icon?el('img',{src:a.icon,alt:''}):el('span',{className:'pomo-app-icon'}),el('span',{className:'pomo-app-name',textContent:a.label}),input);row.dataset.app=a.id;return row;
   }));
   if(!shown.length)list.append(el('p',{className:'pomo-card-note',textContent:apps.length?'Nenhum app com esse nome.':'Não deu para listar os apps.'}));
  };
  search.oninput=draw;draw();
 }
 // Built inside the Séries sheet, under "Pausa longa" (Android app only). Saves on its own, right away.
 let refreshBlock=()=>{};
 if(native)document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshBlock();}); // back from the system screens
 function blockSection(beforeApps){
  const box=el('div',{className:'pomo-sheet-group pomo-block',id:'pomoBlockCard'});
  const onRow=switchRow('Bloquear outros apps no foco',state.prefs.block.on,'pomoBlockOn','Abrir um app fora da lista mostra "Volta pro foco". Pausas liberam tudo; telefone e teclado nunca são bloqueados.');
  const perms=el('div',{className:'pomo-block-perms',id:'pomoBlockPerms'}),allowBtn=el('button',{type:'button',className:'pomo-block-apps',id:'pomoBlockApps',onclick:()=>{beforeApps?.();openAllowList(openSets);}});
  box.append(onRow,perms,allowBtn);
  let status={usage:true,overlay:true};
  const permRow=(which,label,note,ok)=>el('div',{className:'pomo-perm'+(ok?' is-ok':'')},el('span',{className:'pomo-perm-text'},el('b',{textContent:label}),el('small',{textContent:note})),
   ok?el('span',{className:'pomo-perm-ok',textContent:'Liberado'}):el('button',{type:'button',className:'pomo-perm-btn',textContent:'Liberar',onclick:()=>Promise.resolve(native.openBlockSettings({which})).catch(()=>{})}));
  paintBlock=()=>{
   const on=state.prefs.block.on;allowBtn.hidden=!on;allowBtn.textContent=`Apps liberados (${state.prefs.block.allow.length})`;
   perms.hidden=!on||(status.usage&&status.overlay);
   perms.replaceChildren(el('p',{className:'pomo-block-note',textContent:'Para bloquear, o Android precisa de duas permissões (é só liberar uma vez):'}),
    permRow('usage','Acesso ao uso','para saber qual app está aberto',status.usage),permRow('overlay','Sobrepor a outros apps','para mostrar a tela "Volta pro foco"',status.overlay));
  };
  const refreshStatus=()=>Promise.resolve(native.blockStatus()).then(s=>{status={usage:!!s?.usage,overlay:!!s?.overlay};paintBlock();}).catch(()=>{});
  onRow.querySelector('input').onchange=e=>{state.prefs.block.on=e.target.checked;save();updateOngoing();paintBlock();refreshStatus();};
  refreshBlock=refreshStatus;paintBlock();refreshStatus();
  return box;
 }
 globalThis.PELEJA_POMODORO_SETTINGS=settingsPanel;

 globalThis.PELEJA_POMODORO={
  attach(options){
   saveSettings=options.saveChange?s=>options.saveChange({kind:'pomodoro-settings',settings:s},()=>{},null,()=>{lastSent='';}):null;
   const remote=options.settings;
   if(remote&&typeof remote==='object'&&remote.config&&remote.sound&&remote.prefs){
    // the account's settings win; times and series wait if a session is running
    if(state.timer.status==='idle')Object.assign(state.config,remote.config);
    Object.assign(state.sound,remote.sound);Object.assign(state.prefs,remote.prefs);write(KEY,state);render();
   }
   // only real changes go up from now on
   lastSent=JSON.stringify(snapshot());
   client=options.client;getUser=options.getUser;saveRoutines=options.saveChange?list=>options.saveChange({kind:'pomodoro-routines',routines:list},()=>{},null,()=>{}):null;
   // Routines live in the account: the account's list wins; routines only on this device are sent up once.
   if(Array.isArray(options.routines)){
    const remote=options.routines,local=(state.templates||[]).filter(t=>!remote.some(x=>x.id===t.id||x.name.toLowerCase()===t.name.toLowerCase()));
    state.templates=[...remote,...local].slice(0,20);save();if(local.length)syncRoutines();
   }
   flush();pull();
  },
  detach(){client=null;getUser=()=>null;saveSettings=null;lastSent='';},
  state:()=>state,elapsed,actions,advance,render,outbox,pull,planned,fmt,modeName,
  rpc:(name,args)=>client?client.rpc(name,args):Promise.resolve({error:{message:'offline'}}),from:table=>client?.from(table),save,user:()=>getUser(),page,
  reset(){state=read('__none__',DEFAULTS);for(const k of ['config','sound','prefs','timer'])state[k]={...DEFAULTS[k]};fixBlock();save();render();}
 };
 advance();render();drainNative();
})();
