// Pomodoro (inspired by the Sessions app): task, wavy progress ring, focus / short break / long break,
// target sets, optional Flowmodoro (focus keeps counting past the minimum until you start the break),
// ambient sounds loud while focusing, low during breaks, silent when paused or idle, and a chime at each
// change. Each focus block is queued and saved to Supabase (pomodoro_blocks) once the app is connected.
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
 const DEFAULTS={config:{focusMin:25,shortMin:5,longEnabled:true,longMin:15,longEvery:4,targetSets:4,flow:false},sound:{enabled:false,id:'rain',muted:false},prefs:{effects:true,notify:false},task:'',recentTasks:[],
  timer:{status:'idle',mode:'focus',accMs:0,runningSince:0,phaseStartedAt:0,setsDone:0,flowNotified:false}};
 let state=read(KEY,DEFAULTS);for(const k of ['config','sound','prefs','timer'])state[k]={...DEFAULTS[k],...state[k]};
 const save=()=>write(KEY,state);
 const planned=mode=>(mode==='focus'?state.config.focusMin:mode==='short'?state.config.shortMin:state.config.longMin)*60000;
 const elapsed=()=>state.timer.accMs+(state.timer.status==='running'?Math.max(0,now()-state.timer.runningSince):0);
 const fmt=ms=>{const t=Math.max(0,Math.floor(ms/1000)),h=Math.floor(t/3600),m=Math.floor(t/60)%60,s=t%60;return (h?h+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(s).padStart(2,'0');};
 const modeName={focus:'Foco',short:'Pausa curta',long:'Pausa longa'};

 // ---------- saving blocks (outbox survives reloads and offline) ----------
 let client=null,getUser=()=>null;
 const outbox=()=>{try{return JSON.parse(localStorage.getItem(OUTBOX)||'[]');}catch{return [];}};
 async function flush(){
  if(!client||!getUser())return;
  const pending=outbox();if(!pending.length)return;
  const kept=[];
  for(const b of pending){
   if(b.user&&b.user!==getUser()){kept.push(b);continue;}
   try{const r=await client.rpc('pomodoro_block_save',{p_id:b.id,p_task:b.task,p_started:b.startedAt,p_ended:b.endedAt,p_focus_ms:b.focusMs,p_planned_ms:b.plannedMs,p_flow_extra_ms:b.flowExtraMs});if(r.error&&!/check|Horário/.test(r.error.message||''))kept.push(b);}
   catch{kept.push(b);}
  }
  write(OUTBOX,kept);globalThis.PELEJA_POMODORO_SAVED?.();
 }
 function recordBlock(focusMs,endedAt){
  if(focusMs<60000)return; // under a minute is not a block
  const plannedMs=planned('focus'),block={id:crypto.randomUUID(),user:getUser(),task:state.task.trim(),startedAt:new Date(state.timer.phaseStartedAt).toISOString(),endedAt:new Date(endedAt).toISOString(),focusMs:Math.round(Math.min(focusMs,endedAt-state.timer.phaseStartedAt)),plannedMs,flowExtraMs:Math.max(0,Math.round(focusMs-plannedMs))};
  if(block.focusMs<60000)return;
  write(OUTBOX,[...outbox(),block]);globalThis.PELEJA_POMODORO_SAVED?.();flush();
 }

 // ---------- sound ----------
 let ambient=null,ambientId='',fadeTimer=0,currentVolume=0;
 const soundOn=()=>state.sound.enabled&&!state.sound.muted&&!!state.sound.id;
 const targetVolume=()=>!soundOn()||state.timer.status!=='running'?0:state.timer.mode==='focus'?1:.1;
 function fadeTo(target,ms=1500){
  clearInterval(fadeTimer);
  if(target>0&&(!ambient||ambientId!==state.sound.id)){ambient?.pause();ambient=new Audio(soundUrl(state.sound.id));ambient.loop=true;ambientId=state.sound.id;ambient.volume=currentVolume=0;}
  if(!ambient)return;
  if(target>0&&ambient.paused)ambient.play?.()?.catch?.(()=>{});
  const from=currentVolume,start=now();
  fadeTimer=setInterval(()=>{const p=Math.min(1,(now()-start)/ms);currentVolume=from+(target-from)*p;try{ambient.volume=Math.max(0,Math.min(1,currentVolume));}catch{}if(p>=1){clearInterval(fadeTimer);if(target===0)ambient.pause?.();}},30);
 }
 const syncSound=ms=>fadeTo(targetVolume(),ms);
 // Flow minimum reached: a short dip in the background and back, without leaving the focus.
 function wave(){if(!soundOn()||!ambient)return;fadeTo(.35,500);setTimeout(()=>{if(state.timer.mode==='focus'&&state.timer.status==='running')fadeTo(1,900);},700);}
 function chime(name,volume=.9){if(!state.prefs.effects)return;try{const a=new Audio(soundUrl(name));a.volume=volume;a.play?.()?.catch?.(()=>{});}catch{}}
 function notify(text){if(!state.prefs.notify||!document.hidden||typeof Notification==='undefined'||Notification.permission!=='granted')return;try{new Notification('Peleja · Pomodoro',{body:text,icon:'../assets/peleja-icon-192.png',tag:'peleja-pomodoro'});}catch{}}

 // ---------- state machine ----------
 function startPhase(mode,at=now(),carry=0){Object.assign(state.timer,{mode,status:'running',accMs:carry,runningSince:at,phaseStartedAt:at-carry,flowNotified:false});}
 function completeFocus({at=now(),manual=false}={}){
  const e=state.timer.status==='running'?state.timer.accMs+(at-state.timer.runningSince):state.timer.accMs;
  const focusMs=state.config.flow||manual?e:Math.min(e,planned('focus'));recordBlock(focusMs,at);
  state.timer.setsDone++;
  if(state.timer.setsDone>=state.config.targetSets){
   Object.assign(state.timer,{status:'idle',mode:'focus',accMs:0,runningSince:0,flowNotified:false});chime('session_end');notify('Meta da sessão concluída!');
   save();render();syncSound();globalThis.toast?.('Meta da sessão concluída','check');return;
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
 const actions={
  toggle(){
   const t=state.timer;
   if(t.status==='running'){t.accMs=elapsed();t.status='paused';t.runningSince=0;}
   else if(t.status==='paused'){t.status='running';t.runningSince=now();}
   else{startPhase('focus');t.setsDone=0;chime('session_start',.7);}
   save();render();syncSound(t.status==='running'?1500:600);
  },
  // Flow: "Começar pausa" ends the focus with the extra time counted.
  startBreak(){if(state.timer.mode!=='focus'||state.timer.status==='idle')return;completeFocus({manual:true});render();syncSound();},
  skip(){if(state.timer.status==='idle')return;if(state.timer.mode==='focus')completeFocus({manual:true});else completeBreak();render();syncSound();},
  stop(){
   const t=state.timer;if(t.status==='idle')return;
   if(t.mode==='focus')recordBlock(elapsed(),now());
   Object.assign(t,{status:'idle',mode:'focus',accMs:0,runningSince:0,setsDone:0,flowNotified:false});chime('session_stop',.7);save();render();syncSound(600);
  }
 };

 // ---------- page ----------
 const page=el('section',{id:'pomodoroPage',className:'pomodoro',hidden:true});page.setAttribute('aria-label','Pomodoro');
 page.innerHTML=`<div class="pomo-head"><div><h2 id="pomoHeadline">Pronto para focar</h2><p id="pomoSub">Escolha a tarefa e dê play.</p></div></div>
 <div class="pomo-chips"><button type="button" class="pomo-task" id="pomoTask">${icon(I.task)}<span id="pomoTaskName"></span></button><span class="pomo-status" id="pomoStatus"><i></i><span></span></span><button type="button" class="pomo-sound-chip" id="pomoSoundChip"></button></div>
 <div class="pomo-ring-wrap"><svg class="pomo-ring" id="pomoRing" viewBox="0 0 300 300" aria-hidden="true"><circle class="pomo-track" cx="150" cy="150" r="128"/><path class="pomo-progress" id="pomoProgress" d=""/></svg>
 <div class="pomo-center"><strong id="pomoTime" aria-live="off">25:00</strong><span class="pomo-mode" id="pomoMode">Foco</span><button type="button" class="pomo-flow-break" id="pomoFlowBreak" hidden>Começar pausa</button></div></div>
 <div class="pomo-durations"><button type="button" data-duration="focus"><span>Foco</span><b id="pomoFocusMin"></b></button><button type="button" data-duration="short"><span>Pausa curta</span><b id="pomoShortMin"></b></button></div>
 <div class="pomo-controls"><button type="button" class="pomo-side" id="pomoSoundBtn" aria-label="Sons de fundo">${icon(I.sound)}</button><button type="button" class="pomo-play" id="pomoPlay"></button><button type="button" class="pomo-side" id="pomoSetsBtn" aria-label="Séries">${icon(I.sets)}</button></div>
 <div class="pomo-goal"><div class="pomo-goal-top"><span>${icon(I.flag)}Meta da sessão</span><span class="pomo-long-pill" id="pomoLongPill"></span></div>
 <div class="pomo-goal-mid"><div class="pomo-count"><b id="pomoDone">0</b><span id="pomoTarget">/4</span></div><button type="button" class="pomo-skip" id="pomoSkip">${icon(I.skip)}Pular</button><button type="button" class="pomo-skip" id="pomoStop">${icon(I.stop)}Encerrar</button><div class="pomo-left"><b id="pomoLeft"></b><small id="pomoNudge"></small></div></div>
 <div class="pomo-segments" id="pomoSegments"></div></div>`;
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
  const progress=t.status==='idle'?0:Math.min(1,e/p);
  $('pomoProgress').setAttribute('d',ringPath(progress,wavePhase));
  $('pomoTime').textContent=over?'+'+fmt(e-p):fmt(t.status==='idle'?planned('focus'):p-e);
  page.dataset.over=String(over);
 }
 function loop(){draw();if(state.timer.status==='running'&&!document.hidden){if(!(typeof reduceMotion==='function'&&reduceMotion()))wavePhase+=.025;frame=requestAnimationFrame(loop);}else frame=0;}
 function render(){
  const t=state.timer,c=state.config;
  page.dataset.mode=t.mode;page.dataset.status=t.status;
  $('pomoHeadline').textContent=t.status==='running'?(t.mode==='focus'?'Concentrado!':'Respira um pouco'):t.status==='paused'?'Pausado':'Pronto para focar';
  $('pomoSub').textContent=t.status==='idle'?'Escolha a tarefa e dê play.':t.mode==='focus'?(c.flow?'Flowmodoro: siga enquanto render.':'Foco até o fim do tempo.'):'A próxima série começa sozinha.';
  $('pomoTaskName').textContent=state.task||'Definir tarefa';$('pomoTask').classList.toggle('is-empty',!state.task);
  $('pomoStatus').dataset.on=String(t.status==='running');$('pomoStatus').lastElementChild.textContent=t.status==='running'?'Ativo':t.status==='paused'?'Pausado':'Parado';
  const name=SOUNDS.find(s=>s[0]===state.sound.id)?.[1]||'Sem som';
  $('pomoSoundChip').innerHTML=icon(state.sound.muted||!state.sound.enabled?I.mute:I.sound)+`<span>${state.sound.enabled?name:'Sem som'}</span>`;$('pomoSoundChip').setAttribute('aria-label',state.sound.muted?'Ativar som':'Silenciar som');
  $('pomoSoundChip').dataset.muted=String(state.sound.muted||!state.sound.enabled);
  $('pomoMode').textContent=t.mode==='focus'&&c.flow?'Foco · Flow':modeName[t.mode];
  $('pomoFlowBreak').hidden=!(t.mode==='focus'&&c.flow&&t.status!=='idle');
  $('pomoFocusMin').textContent=c.focusMin+' min';$('pomoShortMin').textContent=c.shortMin+' min';
  for(const b of page.querySelectorAll('[data-duration]'))b.disabled=t.status!=='idle';
  $('pomoPlay').innerHTML=icon(t.status==='running'?I.pause:I.play);$('pomoPlay').setAttribute('aria-label',t.status==='running'?'Pausar':t.status==='paused'?'Continuar':'Começar foco');
  $('pomoLongPill').innerHTML=c.longEnabled?icon(I.clock)+`<span>Pausa longa ${c.longMin} min</span>`:'';$('pomoLongPill').hidden=!c.longEnabled;
  $('pomoDone').textContent=t.setsDone;$('pomoTarget').textContent='/'+c.targetSets;
  const left=c.targetSets-t.setsDone;$('pomoLeft').textContent=left<=0?'Meta concluída':left===1?'Falta 1 série':`Faltam ${left} séries`;
  $('pomoNudge').textContent=t.setsDone===0?'Bora começar':left===1?'Última, capricha':'Pequenas vitórias somam';
  $('pomoSkip').disabled=$('pomoStop').disabled=t.status==='idle';
  const seg=$('pomoSegments');seg.replaceChildren();
  for(let i=0;i<c.targetSets;i++){const s=el('span');s.dataset.state=i<t.setsDone?'done':i===t.setsDone&&t.status!=='idle'&&t.mode==='focus'?'current':'todo';seg.append(s);if(c.longEnabled&&(i+1)%c.longEvery===0&&i<c.targetSets-1)seg.append(el('i'));}
  draw();if(t.status==='running'&&!frame)frame=requestAnimationFrame(loop);
 }

 // ---------- dialogs ----------
 const dialog=el('dialog',{id:'pomoDialog',className:'pomo-dialog'});page.append(dialog);
 function openDialog(title,lead,body,onSave){
  dialog.replaceChildren(el('h2',{textContent:title}),el('p',{className:'pomo-lead',textContent:lead}),body,el('div',{className:'pomo-dialog-actions'},el('button',{type:'button',className:'editor-cancel',textContent:'Cancelar',onclick:()=>dialog.close()}),el('button',{type:'button',className:'primary',textContent:'Salvar',onclick:()=>{onSave();save();render();syncSound();dialog.close();}})));
  dialog.showModal();
  if(typeof motion==='function')motion(dialog,[{opacity:0,transform:'translateY(10px) scale(.98)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)'});
 }
 const switchRow=(label,checked,id)=>{const input=el('input',{type:'checkbox',checked,id});input.setAttribute('role','switch');return el('label',{className:'pomo-switch switch-option'},el('span',{textContent:label}),input,el('span',{className:'switch-visual','aria-hidden':'true'}));};
 const stepper=(label,value,min,max,step,unit,id)=>{const out=el('b',{id,textContent:value});const row=el('div',{className:'pomo-stepper'},el('span',{textContent:label}),el('div',{},el('button',{type:'button',textContent:'−','aria-label':'Diminuir '+label,onclick:()=>{out.textContent=Math.max(min,+out.textContent-step);}}),out,el('small',{textContent:unit}),el('button',{type:'button',textContent:'+','aria-label':'Aumentar '+label,onclick:()=>{out.textContent=Math.min(max,+out.textContent+step);}})));return row;};
 function openTask(){
  const input=el('input',{type:'text',maxLength:80,value:state.task,placeholder:'Ex.: Hematologia, PR2.2, Revisão…',id:'pomoTaskInput',autocomplete:'off'});
  const recent=el('div',{className:'pomo-recent'},...state.recentTasks.slice(0,6).map(t=>el('button',{type:'button',textContent:t,onclick:()=>{input.value=t;}})));
  openDialog('Tarefa','Digite no que você vai focar. Ela aparece nos seus Insights.',el('div',{className:'pomo-task-body'},el('label',{className:'editor-field'},el('span',{textContent:'Tarefa'}),input),state.recentTasks.length?recent:''),()=>{state.task=input.value.trim().slice(0,80);if(state.task)state.recentTasks=[state.task,...state.recentTasks.filter(x=>x!==state.task)].slice(0,8);});
  setTimeout(()=>input.focus(),50);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();dialog.querySelector('.primary').click();}};
 }
 let preview=null;
 function openSound(){
  let pick=state.sound.id;
  const list=el('div',{className:'pomo-sound-list'});
  const select=id=>{pick=id;for(const b of list.children)b.setAttribute('aria-pressed',String(b.dataset.sound===id));preview?.pause();if($('pomoSoundOn').checked){preview=new Audio(soundUrl(id));preview.volume=.7;preview.play?.()?.catch?.(()=>{});setTimeout(()=>preview?.pause(),2200);}};
  for(const [id,label] of SOUNDS){const b=el('button',{type:'button',textContent:label,onclick:()=>select(id)});b.dataset.sound=id;b.setAttribute('aria-pressed',String(id===pick));list.append(b);}
  const toggle=switchRow('Ligar sons',state.sound.enabled,'pomoSoundOn');
  openDialog('Sons de fundo','Um ambiente para manter o foco. Alto durante o foco, baixinho nas pausas.',el('div',{},toggle,list),()=>{state.sound.enabled=$('pomoSoundOn').checked;state.sound.id=pick;state.sound.muted=false;preview?.pause();});
  dialog.addEventListener('close',()=>preview?.pause(),{once:true});
 }
 function openSets(){
  const c=state.config;
  const body=el('div',{className:'pomo-sets'},
   stepper('Meta de séries',c.targetSets,1,12,1,'séries','pomoTargetSets'),
   switchRow('Pausa longa',c.longEnabled,'pomoLongOn'),
   el('div',{className:'pomo-long',id:'pomoLongFields'},stepper('Duração',c.longMin,15,45,5,'min','pomoLongMin'),stepper('A cada',c.longEvery,1,11,1,'séries','pomoLongEvery')),
   switchRow('Flowmodoro',c.flow,'pomoFlowOn'),
   el('p',{className:'pomo-hint',textContent:'Com o Flowmodoro, o foco tem um tempo mínimo: ao chegar nele, um aviso suave, e o relógio segue contando o tempo extra até você tocar em “Começar pausa”.'}));
  openDialog('Séries','Defina a meta e as pausas da sessão.',body,()=>{
   c.targetSets=+$('pomoTargetSets').textContent;c.longEnabled=$('pomoLongOn').checked;c.longMin=+$('pomoLongMin').textContent;c.longEvery=Math.min(+$('pomoLongEvery').textContent,Math.max(1,c.targetSets-1));c.flow=$('pomoFlowOn').checked;
   if(state.timer.setsDone>=c.targetSets&&state.timer.status!=='idle')state.timer.setsDone=c.targetSets-1;
  });
  const sync=()=>{$('pomoLongFields').hidden=!$('pomoLongOn').checked;};$('pomoLongOn').onchange=sync;sync();
 }
 function openDuration(kind){
  const c=state.config,focus=kind==='focus';
  openDialog(focus?'Tempo de foco':'Pausa curta',focus?(c.flow?'No Flowmodoro, é o tempo mínimo de cada foco.':'Quanto dura cada série de foco.'):'Quanto dura a pausa entre as séries.',stepper(focus?'Foco':'Pausa',focus?c.focusMin:c.shortMin,focus?5:1,focus?120:30,focus?5:1,'min','pomoDurationValue'),()=>{const v=+$('pomoDurationValue').textContent;if(focus)c.focusMin=v;else c.shortMin=v;});
 }

 // ---------- wiring ----------
 $('pomoPlay').onclick=()=>actions.toggle();
 $('pomoSkip').onclick=()=>actions.skip();
 $('pomoStop').onclick=()=>{if(typeof confirmPeleja==='function'&&state.timer.mode==='focus'&&elapsed()>=60000)confirmPeleja('Encerrar a sessão?',()=>actions.stop(),{description:'O foco feito até agora fica registrado.',accept:'Encerrar'});else actions.stop();};
 $('pomoFlowBreak').onclick=()=>actions.startBreak();
 $('pomoTask').onclick=openTask;$('pomoSoundBtn').onclick=openSound;$('pomoSetsBtn').onclick=openSets;
 $('pomoSoundChip').onclick=()=>{if(!state.sound.enabled){openSound();return;}state.sound.muted=!state.sound.muted;save();render();syncSound(400);};
 for(const b of page.querySelectorAll('[data-duration]'))b.onclick=()=>openDuration(b.dataset.duration);
 setInterval(()=>{if(state.timer.status==='running'){const before=state.timer.mode+state.timer.setsDone+state.timer.status;advance();if(before!==state.timer.mode+state.timer.setsDone+state.timer.status){render();syncSound();}else if(document.hidden)draw();}},500);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){advance();render();}});
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
 const notifyRow=switchRow('Avisar quando um foco ou pausa terminar (com o Peleja em segundo plano)',state.prefs.notify,'pomoPrefNotify');notifyRow.classList.add('settings-row');
 card.append(effects,notifyRow);settingsPanel.append(card);
 effects.querySelector('input').onchange=e=>{state.prefs.effects=e.target.checked;save();};
 notifyRow.querySelector('input').onchange=async e=>{
  if(e.target.checked&&typeof Notification!=='undefined'&&Notification.permission!=='granted'){const p=await Notification.requestPermission().catch(()=>'denied');if(p!=='granted'){e.target.checked=false;globalThis.toast?.('O navegador não permitiu avisos','info');}}
  state.prefs.notify=e.target.checked;save();
 };
 globalThis.PELEJA_POMODORO_SETTINGS=settingsPanel;

 globalThis.PELEJA_POMODORO={
  attach(options){client=options.client;getUser=options.getUser;flush();},
  detach(){client=null;getUser=()=>null;},
  state:()=>state,elapsed,actions,advance,render,outbox,
  rpc:(name,args)=>client?client.rpc(name,args):Promise.resolve({error:{message:'offline'}}),user:()=>getUser(),page,
  reset(){state=read('__none__',DEFAULTS);for(const k of ['config','sound','prefs','timer'])state[k]={...DEFAULTS[k]};save();render();}
 };
 advance();render();
})();
