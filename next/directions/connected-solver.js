// "Resolver questões": members answer the question sets imported for a material.
// Quick modes: Treino (answer key and comments after each answer, questions in order) and Prova (key only
// at the end, everything shuffled). "Personalizar" sets each part: marking on click or with confirmation,
// key after each answer or at the end, questions and options shuffled or in order. The choice travels in
// the session layout (settings), so a resumed session keeps behaving the same.
// Sessions live in Supabase (quiz_sessions) and can be resumed; the first finished session
// of each set becomes a question round of the material, so it counts in the statistics once.
globalThis.PELEJA_INSTALL_SOLVER=({client,saveChange,allowed=()=>false})=>{
 const LETTERS='ABCDEFGHIJKLMNOPQRST',EASE='cubic-bezier(.22,1,.36,1)';
 const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children);return node;};
 const ICON={
  solve:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 4.5h13A2.5 2.5 0 0 1 21 7v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.6 3.4c-.4.3-.9 0-.9-.5v-2.9h0A2.5 2.5 0 0 1 3 15V7a2.5 2.5 0 0 1 2.5-2.5Z"/><path d="M9.9 9.2a2.2 2.2 0 1 1 3.1 2c-.6.3-1 .8-1 1.4v.3"/><circle cx="12" cy="15.2" r="1" fill="currentColor" stroke="none"/></svg>',
  cut:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18.6" cy="7.4" r="2.6"/><circle cx="18.6" cy="16.6" r="2.6"/><path d="M16.4 15.1 12.6 12 3.4 8.1"/><path d="M16.4 8.9 12.6 12 3.4 15.9"/><path d="M1 12h9.4" stroke-dasharray="0.1 3.1" stroke-width="2.4"/></svg>',
  hint:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/></svg>',
  right:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5Z"/><path d="M13.8 7l3.2 3.2"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M10.3 10.3l3.4 3.4M13.7 10.3l-3.4 3.4"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  wrong:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>'
 };
 let pending=new Map(),hintOpen=new Set(),sets=[],material=null,setInfo=null,questions=[],session=null,history=[],position=0,screen='setup',reviewing=false;
 let clockStart=0,clockBase=0,clockTimer=0,saveTimer=0,busy=false,resultFilter='all';
 const dialog=document.createElement('dialog');dialog.id='solverDialog';dialog.className='solver';dialog.setAttribute('aria-labelledby','solverTitle');
 dialog.innerHTML='<div class="solver-shell"><header class="solver-top"><div class="solver-place"><span class="editor-kicker" id="solverKicker"></span><h2 id="solverTitle"></h2></div><button type="button" class="solver-clock" id="solverClock" hidden></button><button type="button" class="icon" id="solverClose" aria-label="Fechar">✕</button></header><div class="solver-progress" id="solverProgress" hidden><span></span></div><div class="solver-body" id="solverBody"></div><footer class="solver-foot editor-footer" id="solverFoot"></footer></div>';
 app.append(dialog);
 const $s=id=>dialog.querySelector('#'+id);
 const message=error=>String(error?.message||error||'').replace(/^Error:\s*/,'')||'Não foi possível concluir. Tente novamente.';
 const random=n=>{const v=new Uint32Array(1);crypto.getRandomValues(v);return v[0]%n;};
 const shuffle=list=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const plural=(n,one,many)=>`${n} ${n===1?one:many}`;
 // A target is one material or one whole exam ("tudo em um"); its sets, title and where the result counts.
 const asMaterial=m=>m&&{kind:'material',sourceId:m.sourceId,title:m.fullTitle||m.title,key:m.code};
 const asExam=e=>e&&{kind:'exam',sourceId:e.sourceId,title:`${e.type} · ${e.subject}`,subject:e.subject,key:e.id};
 const setsFor=t=>t?sets.filter(s=>t.kind==='exam'?s.examId===t.sourceId:s.materialId===t.sourceId):[];
 // "Só meus erros" of an exam reads the exam's own lists and the lists of the subjects linked to it.
 const examTopics=t=>{const e=t?.kind==='exam'&&facultyRecords.find(x=>x.id===t.key);if(!e)return [];const list=(e.materialCodes||[]).map(code=>data.find(m=>m.code===code)).filter(Boolean);return typeof byTopicLabel==='function'?list.sort(byTopicLabel):list;};
 const reviewSetsFor=t=>t?.kind==='exam'?[...setsFor(t),...examTopics(t).flatMap(m=>sets.filter(s=>s.materialId===m.sourceId))]:[];
 const answerOf=q=>session.answers[q]||{o:null,x:[]};
 const isCorrect=(q,o)=>o!=null&&!!questions[q]?.answerOptions[o]?.isCorrect;
 const order=()=>session.layout.questions;
 // ---------- how a session behaves ----------
 // Both quick modes mark on click; "Com confirmação" stays one choice away in Personalizar.
 const PRESETS={treino:{confirm:false,reveal:'each',shuffleQuestions:false,shuffleOptions:true},prova:{confirm:false,reveal:'end',shuffleQuestions:true,shuffleOptions:true}};
 const PREF='peleja-solver-v1';
 const prefs=()=>{try{return JSON.parse(localStorage.getItem(PREF)||'{}')||{};}catch{return {};}};
 const savePrefs=change=>{try{localStorage.setItem(PREF,JSON.stringify({...prefs(),...change}));}catch{}};
 // Saved choices from when Treino/Prova asked for confirmation become the new presets once (so they are not
 // shown as "Personalizado"); a confirmation picked in Personalizar later stays.
 const savedSettings=()=>{
  const p=prefs(),s=p.settings||{};if(p.clickDefault)return s;
  const old=Object.values(PRESETS).some(v=>Object.keys(v).every(k=>k==='confirm'?s.confirm===true:v[k]===s[k]));
  const next=old?{...s,confirm:false}:s;savePrefs({settings:next,clickDefault:true});return next;
 };
 const presetOf=s=>Object.entries(PRESETS).find(([,v])=>Object.keys(v).every(k=>v[k]===s[k]))?.[0]||'custom';
 const settingsOf=s=>({...(PRESETS[s?.mode]||PRESETS.treino),...(s?.layout?.settings||{})});
 const modeLabel=s=>({treino:'Treino',prova:'Prova',custom:'Personalizado'})[presetOf(settingsOf(s))];
 const cfg=()=>session.settings||settingsOf(session);
 let setupSettings={...PRESETS.treino};
 const tip=el('div',{className:'pomo-day-tip pomo-rank-tip solver-tip',id:'solverTip',hidden:true,role:'status'});dialog.append(tip);
 let tipTimer=0;
 const hideTip=()=>{clearTimeout(tipTimer);tip.hidden=true;};
 function showTip(target,ms=0){
  tip.textContent=target.dataset.tip;tip.hidden=false;
  // positioned inside the dialog (the open dialog is the reference box, not the window)
  const r=target.getBoundingClientRect(),d=dialog.getBoundingClientRect(),half=(tip.offsetWidth||140)/2;
  tip.style.left=Math.max(half+8,Math.min(d.width-half-8,r.left-d.left+r.width/2))+'px';tip.style.top=(r.top-d.top-8)+'px';
  clearTimeout(tipTimer);if(ms)tipTimer=setTimeout(hideTip,ms);
 }
 // a screen change or closing the solver never leaves the bubble behind
 dialog.addEventListener('close',hideTip);
 dialog.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const t=e.target.closest?.('[data-tip]');if(t)showTip(t);});
 dialog.addEventListener('pointerout',e=>{if(e.pointerType!=='mouse')return;const t=e.target.closest?.('[data-tip]');if(t&&!t.contains(e.relatedTarget))hideTip();});
 let lastPointer='mouse';dialog.addEventListener('pointerdown',e=>{lastPointer=e.pointerType||'mouse';},true);
 dialog.addEventListener('click',e=>{const t=e.target.closest?.('[data-tip]');if(!t)return;e.preventDefault();e.stopPropagation();if(lastPointer!=='mouse')showTip(t,3000);},true);
 function animateIn(node,dy=8){motion(node,[{opacity:0,transform:`translateY(${dy}px)`},{opacity:1,transform:'none'}],{duration:260,easing:EASE});}

 // ---------- library rows ----------
 // Materials with imported questions show "Resolver questões" where the round target was;
 // registering external questions moves to the row's "more" menu for everyone.
 function decorate(){
  for(const button of document.querySelectorAll('#library [data-questions]')){
   const m=data.find(x=>x.code===button.dataset.questions);if(!setsFor(asMaterial(m)).length)continue;
   const solve=el('button',{type:'button',className:'icon solve-action',title:'Resolver questões'});
   solve.dataset.solve=m.code;solve.setAttribute('aria-label',`Resolver questões de ${m.fullTitle||m.title}`);solve.innerHTML=ICON.solve;
   button.replaceWith(solve);
  }
  // Exam cards: the button is always there; dimmed until the exam has a whole-exam set.
  for(const card of document.querySelectorAll('#facultyList .faculty-card[data-exam]')){
   const actions=card.querySelector('.faculty-actions'),e=facultyRecords.find(x=>x.id===card.dataset.exam);if(!actions||!e)continue;
   let solve=actions.querySelector('[data-solve-exam]');
   if(!solve){solve=el('button',{type:'button',className:'icon solve-action'});solve.dataset.solveExam=e.id;solve.innerHTML=ICON.solve;const more=actions.querySelector('[data-exam-menu]');more?more.after(solve):actions.prepend(solve);}
   const ready=reviewSetsFor(asExam(e)).length>0,label=ready?`Resolver questões de ${e.type} · ${e.subject}`:'Ainda não há questões desta prova';
   if(solve.getAttribute('aria-label')!==label){solve.setAttribute('aria-label',label);solve.title=ready?'Resolver questões da prova':label;solve.setAttribute('aria-disabled',String(!ready));solve.classList.toggle('is-empty',!ready);}
  }
 }
 new MutationObserver(decorate).observe($('library'),{childList:true,subtree:true});
 new MutationObserver(decorate).observe($('facultyList'),{childList:true,subtree:true});
 $('facultyList').addEventListener('click',event=>{const b=event.target.closest('[data-solve-exam]');if(!b)return;event.preventDefault();event.stopPropagation();if(b.getAttribute('aria-disabled')==='true'){toast('Ainda não há questões desta prova.','info');return;}open(asExam(facultyRecords.find(e=>e.id===b.dataset.solveExam)),b);});
 $('library').addEventListener('click',event=>{const b=event.target.closest('[data-solve]');if(!b)return;event.preventDefault();event.stopPropagation();open(asMaterial(data.find(m=>m.code===b.dataset.solve)),b);});
 async function loadSets(){const r=await client.rpc('question_sets_list');if(r.error)throw r.error;sets=Array.isArray(r.data)?r.data:[];render();}

 // ---------- clock ----------
 // The clock pauses with a tap during a question: the question is covered until "Continuar" (no reading
 // with the time stopped), and the saved time leaves the pause out.
 const CLOCK_ICON={pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor"/></svg>',
  play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8v12.4c0 .7.8 1.2 1.4.8l9.4-6.2c.6-.4.6-1.2 0-1.6L9.4 5c-.6-.4-1.4.1-1.4.8Z" fill="currentColor"/></svg>'};
 let clockPaused=false;
 const veil=el('div',{className:'solver-veil',id:'solverVeil',hidden:true},el('strong',{textContent:'Pausado'}),el('p',{textContent:'A questão volta quando você continuar.'}),el('button',{type:'button',className:'primary',id:'solverUnpause',textContent:'Continuar',onclick:()=>unpauseClock()}));
 dialog.querySelector('.solver-shell').append(veil);
 const canPause=()=>screen==='question'&&session?.status==='active';
 function pauseClock(){
  if(clockPaused||!canPause())return;
  stopClock();clockPaused=true;flush().catch(()=>{});
  veil.style.top=$s('solverBody').offsetTop+'px';$s('solverBody').inert=true;$s('solverFoot').inert=true;veil.hidden=false;tick();$s('solverUnpause').focus();
 }
 function unpauseClock(){
  if(!clockPaused)return;
  clockPaused=false;$s('solverBody').inert=false;$s('solverFoot').inert=false;veil.hidden=true;startClock();
 }
 function clearPause(){clockPaused=false;veil.hidden=true;$s('solverBody').inert=false;$s('solverFoot').inert=false;}
 $s('solverClock').onclick=()=>clockPaused?unpauseClock():pauseClock();
 const elapsed=()=>clockBase+(clockStart?Date.now()-clockStart:0);
 const fmt=ms=>{const t=Math.floor(Math.abs(ms)/1000),h=Math.floor(t/3600),m=Math.floor(t/60)%60,s=t%60;return (h?h+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(s).padStart(2,'0');};
 function tick(){
  const node=$s('solverClock');if(!session){node.hidden=true;return;}
  node.hidden=false;let text,label;
  if(session.clock==='timer'){const left=session.timerSeconds*1000-elapsed();node.dataset.over=String(left<0);text=left<0?'+'+fmt(left):fmt(left);label=left<0?'Tempo esgotado':'Tempo restante';}
  else{node.dataset.over='false';text=fmt(elapsed());label='Tempo decorrido';}
  const pausable=canPause();node.dataset.paused=String(clockPaused);node.disabled=!pausable&&!clockPaused;
  const html=(pausable||clockPaused?CLOCK_ICON[clockPaused?'play':'pause']:'')+`<span>${text}</span>`;if(node.innerHTML!==html)node.innerHTML=html;
  node.title=clockPaused?'Pausado · tocar para continuar':pausable?`${label} · tocar para pausar`:label;node.setAttribute('aria-label',node.title+' · '+text);
 }
 function startClock(){if(clockPaused)clearPause();if(clockStart)return;clockStart=Date.now();clearInterval(clockTimer);clockTimer=setInterval(tick,250);tick();}
 function stopClock(){if(clockStart){clockBase=elapsed();clockStart=0;}clearInterval(clockTimer);clockTimer=0;tick();}

 // ---------- persistence ----------
 function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(()=>{}),700);}
 async function flush(){
  clearTimeout(saveTimer);if(!session||session.status!=='active'||session.review)return;
  const r=await client.rpc('quiz_session_save',{p_id:session.id,p_answers:session.answers,p_elapsed:Math.round(elapsed()),p_finish:false});if(r.error)throw r.error;
 }

 // ---------- setup ----------
 async function loadHistory(){const r=await client.rpc('quiz_sessions_mine',{p_set:setInfo.id});if(r.error)throw r.error;history=Array.isArray(r.data)?r.data:[];}
 function choice(name,value,title,text,checked){
  const input=el('input',{type:'radio',name,value,checked});const card=el('label',{className:'solver-choice'},input,el('span',{className:'solver-choice-text'},el('strong',{textContent:title}),el('small',{textContent:text})));return card;
 }
 async function renderSetup(){
  hideTip();clearPause();
  screen='setup';session=null;renderedKey='';stopClock();clockBase=0;
  $s('solverKicker').textContent='RESOLVER QUESTÕES';$s('solverTitle').textContent=material.kind==='exam'?`Prova inteira · ${material.title}`:material.title;$s('solverProgress').hidden=true;tick();
  const body=$s('solverBody'),list=setsFor(material);body.replaceChildren();
  // A session in progress comes first; the new-session choices below step back while it exists.
  body.append(el('div',{id:'solverResume'}),el('p',{className:'solver-section-title solver-new-title',id:'solverNewTitle',textContent:'Ou comece uma nova',hidden:true}));
  if(list.length>1){
   const group=el('fieldset',{className:'solver-group solver-lists'},el('legend',{textContent:'Lista'}));
   list.forEach(s=>{const card=choice('solverSet',s.id,s.title,plural(s.count,'questão','questões'),s.id===setInfo.id);card.dataset.set=s.id;if(allowed())card.append(renameButton(s));group.append(card);});
   group.onchange=async()=>{const c=group.querySelector('input[name=solverSet]:checked'),next=c&&list.find(s=>s.id===c.value);if(!next||next.id===setInfo.id)return;setInfo=next;savePrefs({lists:{...(prefs().lists||{}),[material.key]:setInfo.id}});await refreshSetupDetails();};
   body.append(group);lastAttempts(list,group);
  }else if(setInfo){const lead=el('p',{className:'solver-lead',id:'solverListLead'},el('strong',{textContent:setInfo.title}),' · '+plural(setInfo.count,'questão','questões'));if(allowed())lead.append(renameButton(setInfo));body.append(lead);}
  else body.append(el('p',{className:'solver-lead',id:'solverMistakesLead',textContent:'Esta prova ainda não tem lista própria.'}));
  const modes=el('fieldset',{className:'solver-group solver-pair',id:'solverModes'},el('legend',{textContent:'Modo'}));
  modes.append(choice('solverMode','treino','Treino','Gabarito e comentários a cada resposta. Questões em sequência.',true),choice('solverMode','prova','Prova','Gabarito só ao finalizar. Questões e alternativas embaralhadas.',false));
  // Personalizar: each part on its own; touching one turns the mode into "Personalizado".
  setupSettings={...PRESETS.treino,...savedSettings()};
  const seg=(key,label,options)=>{const g=el('fieldset',{className:'solver-seg'},el('legend',{textContent:label}));for(const [value,text] of options){const input=el('input',{type:'radio',name:'solverOpt-'+key,value});g.append(el('label',{},input,el('span',{textContent:text})));}g.dataset.key=key;return g;};
  const advanced=el('details',{className:'solver-advanced',id:'solverAdvanced'},el('summary',{},el('span',{textContent:'Personalizar'}),el('span',{className:'solver-custom-check',id:'solverCustomNote',innerHTML:ICON.check,hidden:true,tabIndex:0})),
   el('div',{className:'solver-advanced-body'},
    seg('confirm','Marcar a resposta',[['false','Ao clicar'],['true','Com confirmação']]),
    seg('reveal','Gabarito e comentários',[['each','A cada resposta'],['end','No final']]),
    seg('shuffleQuestions','Questões',[['true','Embaralhadas'],['false','Em sequência']]),
    seg('shuffleOptions','Alternativas',[['true','Embaralhadas'],['false','Na ordem']])));
  const paintSettings=()=>{
   const preset=presetOf(setupSettings);
   for(const input of modes.querySelectorAll('input'))input.checked=input.value===preset;
   for(const g of advanced.querySelectorAll('.solver-seg'))for(const input of g.querySelectorAll('input'))input.checked=input.value===String(setupSettings[g.dataset.key]);
   const note=advanced.querySelector('#solverCustomNote');note.hidden=preset!=='custom';note.dataset.tip='Personalizado: as suas escolhas abaixo';note.setAttribute('role','img');note.setAttribute('aria-label','Personalizado');
  };
  modes.onchange=()=>{const v=modes.querySelector('input:checked')?.value;if(!v||!PRESETS[v])return;setupSettings={...PRESETS[v]};paintSettings();};
  advanced.onchange=e=>{const g=e.target.closest('.solver-seg');if(!g)return;const v=e.target.value;setupSettings={...setupSettings,[g.dataset.key]:v==='true'?true:v==='false'?false:v};paintSettings();};
  paintSettings();
  const clocks=el('fieldset',{className:'solver-group solver-pair'},el('legend',{textContent:'Relógio'}));
  clocks.append(choice('solverClock','stopwatch','Cronômetro','Mostra quanto tempo você levou.',true),choice('solverClock','timer','Temporizador','Conta o tempo que você definir.',false));
  const minutes=el('label',{className:'editor-field solver-minutes',hidden:true},el('span',{textContent:'Minutos'}),el('input',{type:'number',id:'solverMinutes',min:1,max:600,step:1,inputMode:'numeric'}));
  clocks.append(minutes);clocks.onchange=()=>{minutes.hidden=clocks.querySelector('input:checked').value!=='timer';if(!minutes.hidden)animateIn(minutes,-4);};
  body.append(modes,advanced,clocks,el('div',{id:'solverHistory'}));
  // Exams: "Só meus erros" sits beside "Começar" and uses the mode and clock chosen above.
  const mistakesButton=material.kind==='exam'?el('button',{type:'button',className:(setInfo?'editor-cancel':'primary')+' solver-mistakes',id:'solverMistakes',disabled:true,onclick:()=>startReview()},el('span',{className:'solver-mistakes-icon',innerHTML:ICON.target}),el('span',{textContent:'Erros'}),el('small',{id:'solverMistakesCount'})):null;
  const foot=$s('solverFoot');foot.replaceChildren(el('button',{type:'button',className:'editor-cancel',textContent:'Cancelar',onclick:close}),...(mistakesButton?[mistakesButton]:[]),...(setInfo?[el('button',{type:'button',className:'primary',id:'solverStart',textContent:'Começar',onclick:()=>startOrConfirm()})]:[]));
  mistakes=[];if(mistakesButton)loadMistakes();
  await refreshSetupDetails();
 }
 // Administrators rename a list right here (the questions stay as they are).
 function renameButton(s){
  const b=el('button',{type:'button',className:'icon solver-rename',title:'Renomear lista',innerHTML:ICON.pencil});b.setAttribute('aria-label',`Renomear ${s.title}`);
  b.onclick=e=>{e.preventDefault();e.stopPropagation();renameList(s,b);};
  return b;
 }
 function renameList(s,button){
  const host=button.parentElement,input=el('input',{type:'text',value:s.title,maxLength:200,className:'solver-rename-input',id:'solverRenameInput'});input.setAttribute('aria-label','Nome da lista');
  const box=el('div',{className:'solver-rename-box'},input,
   el('button',{type:'button',className:'editor-cancel',textContent:'Cancelar',onclick:e=>{e.stopPropagation();renderSetup();}}),
   el('button',{type:'button',className:'primary',id:'solverRenameSave',textContent:'Salvar',onclick:e=>{e.stopPropagation();save();}}));
  const save=async()=>{
   const title=input.value.trim();if(!title){input.focus();return;}
   if(title===s.title){renderSetup();return;}
   try{const r=await client.rpc('question_set_update',{p_id:s.id,p_title:title,p_questions:null});if(r.error)throw r.error;
    for(const x of sets)if(x.id===s.id)x.title=title;if(setInfo.id===s.id)setInfo={...setInfo,title};toast('Nome da lista salvo','check');renderSetup();}
   catch(error){toast(message(error),'info');}
  };
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();renderSetup();}};
  input.onclick=e=>e.stopPropagation();
  host.replaceWith(box);input.focus();input.select();
 }
 // Each list card shows the member's last finished attempt on it.
 async function lastAttempts(list,group){
  await Promise.all(list.map(async s=>{
   try{const r=await client.rpc('quiz_sessions_mine',{p_set:s.id});const done=(r.data||[]).filter(x=>x.status==='done').sort((a,b)=>String(b.finishedAt).localeCompare(String(a.finishedAt)))[0];
    const small=group.querySelector(`[data-set="${s.id}"] small`);if(done&&small)small.textContent=`${plural(s.count,'questão','questões')} · última: ${done.correct}/${done.layout.questions.length}`;}catch{}
  }));
 }
 // Starting a new round on a list with one in progress replaces it (the server deletes the open session),
 // so it asks first. Rounds on other lists are not touched.
 let activeHere=null;
 function startOrConfirm(){
  if(!activeHere||typeof confirmPeleja!=='function')return start();
  const {set,open}=activeHere,done=Object.values(open.answers||{}).filter(a=>a&&a.o!=null).length,total=open.layout.questions.length;
  confirmPeleja('Começar uma nova rodada?',()=>start(),{description:`A rodada em andamento de "${set.title}" (${done} de ${total} respondidas) será apagada, e o progresso dela se perde.`,accept:'Começar nova',destructive:true});
 }
 async function refreshSetupDetails(){
  $s('solverMinutes').value=Math.max(1,Math.round((setInfo?setInfo.count:mistakes.length||10)*1.5));
  const resume=$s('solverResume'),past=$s('solverHistory');resume.replaceChildren();past.replaceChildren();
  if(!setInfo){history=[];return;}
  try{await loadHistory();}catch(error){resume.append(el('p',{className:'solver-note',textContent:message(error)}));return;}
  // Sessions in progress on any list of this subject/exam, newest first, each with its list's name.
  const actives=[];activeHere=null;
  for(const set of setsFor(material)){
   let rows=history;
   if(set.id!==setInfo.id){try{const r=await client.rpc('quiz_sessions_mine',{p_set:set.id});rows=Array.isArray(r.data)?r.data:[];}catch{rows=[];}}
   for(const open of rows.filter(x=>x.status==='active'))actives.push({set,open});
  }
  actives.sort((a,b)=>String(b.open.createdAt||'').localeCompare(String(a.open.createdAt||'')));
  activeHere=actives.find(a=>a.set.id===setInfo.id)||null;
  for(const {set,open} of actives){
   const done=Object.values(open.answers||{}).filter(a=>a&&a.o!=null).length,total=open.layout.questions.length;
   const discard=el('button',{type:'button',className:'editor-cancel solver-resume-discard',textContent:'Descartar',onclick:()=>confirmPeleja('Descartar o progresso?',async()=>{if(await removeSession(open))refreshSetupDetails();},{description:`As ${plural(done,'resposta','respostas')} desta sessão de "${set.title}" serão apagadas e a próxima começa do zero.`,accept:'Descartar',destructive:true})});
   const go=el('button',{type:'button',className:'primary solver-resume-go',textContent:'Continuar',onclick:async()=>{
    if(set.id!==setInfo.id){setInfo=set;savePrefs({lists:{...(prefs().lists||{}),[material.key]:set.id}});}
    await resumeSession(open);}});
   const bar=el('span',{className:'solver-resume-bar'},el('i'));bar.firstChild.style.width=(total?done/total*100:0)+'%';
   resume.append(el('div',{className:'solver-resume'},
    el('div',{className:'solver-resume-text'},el('strong',{textContent:'Continuar de onde parei'}),
     el('small',{textContent:`${set.title} · ${modeLabel(open)} · ${done} de ${total} respondidas · ${fmt(open.elapsedMs)}`}),bar),
    el('div',{className:'solver-resume-actions'},discard,go)));
  }
  // With a session to resume, "Começar" steps back to a secondary "Começar nova".
  $s('solverNewTitle').hidden=!actives.length;
  const startButton=$s('solverStart');if(startButton){startButton.textContent=actives.length?'Começar nova':'Começar';startButton.className=actives.length?'editor-cancel solver-start-new':'primary';}
  if(actives.length)setTimeout(()=>resume.querySelector('.solver-resume-go')?.focus(),60);
  const finished=history.filter(s=>s.status==='done').slice(0,8);
  if(finished.length){
   past.append(el('p',{className:'solver-section-title',textContent:'Tentativas anteriores'}));
   for(const s of finished){
    const when=new Date(s.finishedAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
    const remove=el('button',{type:'button',className:'icon solver-past-delete',title:'Apagar tentativa',innerHTML:ICON.trash});remove.setAttribute('aria-label',`Apagar tentativa de ${when}`);
    remove.onclick=()=>confirmPeleja('Apagar esta tentativa?',async()=>{if(await removeSession(s))refreshSetupDetails();},{description:`${when} · ${modeLabel(s)} · ${s.correct}/${s.layout.questions.length}.${s.counted?` Ela sai também das estatísticas ${material.kind==='exam'?'da disciplina':'da apostila'}.`:''}`,accept:'Apagar',destructive:true});
    const view=el('button',{type:'button',className:'solver-past-open',onclick:()=>openPast(s)},el('span',{textContent:when+' · '+modeLabel(s)+(s.counted?' · conta nas estatísticas':'')}),el('b',{textContent:`${s.correct}/${s.layout.questions.length}`}));
    view.setAttribute('aria-label',`Ver o resultado de ${when}: ${s.correct} de ${s.layout.questions.length}`);
    past.append(el('div',{className:'solver-past'},view,remove));
   }
  }
 }
 // ---------- "Só meus erros" (exams) ----------
 // Every question the member got wrong in a finished attempt (also when it was answered right later),
 // over the exam's own lists and its subjects' lists, in that order. The round lives only here:
 // it is not saved and does not count in the statistics, so the errors stay for the next review.
 let mistakes=[],reviewItems=[];
 async function mistakesOf(set){
  const r=await client.rpc('quiz_sessions_mine',{p_set:set.id});if(r.error)throw r.error;
  const done=(Array.isArray(r.data)?r.data:[]).filter(x=>x.status==='done'&&x.answered>x.correct);if(!done.length)return [];
  const full=await client.rpc('question_set',{p_id:set.id});if(full.error||!full.data)throw full.error||Error('Conjunto não encontrado');
  const list=full.data.questions||[],wrong=new Set();
  for(const s of done)for(const [k,a] of Object.entries(s.answers||{})){const q=list[Number(k)];if(a?.o!=null&&q?.answerOptions?.[a.o]&&!q.answerOptions[a.o].isCorrect)wrong.add(Number(k));}
  return [...wrong].sort((a,b)=>a-b).map(index=>({setId:set.id,title:set.title,index,question:list[index]}));
 }
 async function loadMistakes(){
  const target=material;let rows;
  try{rows=(await Promise.all(reviewSetsFor(target).map(mistakesOf))).flat();}catch{rows=null;}
  const button=$s('solverMistakes');if(material!==target||screen!=='setup'||!button)return;
  if(!rows){button.title='Não foi possível carregar os seus erros. Feche e abra de novo.';return;}
  mistakes=rows;
  button.disabled=!mistakes.length;$s('solverMistakesCount').textContent=String(mistakes.length);
  button.title=mistakes.length?`${plural(mistakes.length,'questão errada','questões erradas')} nas listas da prova e dos assuntos dela`:'Nenhum erro nas listas respondidas desta prova';
  button.setAttribute('aria-label',`Erros: ${button.title}`);
  if(!setInfo){$s('solverMinutes').value=Math.max(1,Math.round((mistakes.length||10)*1.5));$s('solverMistakesLead').textContent=mistakes.length?'Esta prova ainda não tem lista própria. Resolva os seus erros nas listas dos assuntos dela.':'Esta prova ainda não tem lista própria, e você ainda não errou questões nas listas dos assuntos dela.';}
 }
 async function startReview(subset,forced){
  if(busy||(!subset&&!mistakes.length))return;busy=true;const button=$s('solverMistakes');button?.setAttribute('aria-busy','true');
  try{
   const {settings,mode,clock,timerSeconds}=choices(forced);
   if(!subset){reviewItems=mistakes;questions=mistakes.map(x=>x.question);}
   session={id:null,review:true,mode,clock,timerSeconds,layout:layoutFor(settings,subset),settings,answers:{},status:'active',elapsedMs:0};
   clockBase=0;position=0;reviewing=false;pending=new Map();hintOpen=new Set();renderQuestion();startClock();
  }catch(error){toast(message(error),'info');}
  finally{busy=false;button?.removeAttribute('aria-busy');}
 }
 // Deletes one of the member's sessions; a counted attempt also leaves the material's statistics.
 async function removeSession(s){
  try{
   const r=await client.rpc('quiz_session_delete',{p_id:s.id});if(r.error)throw r.error;
   if(r.data?.counted)removeRound(s.id);
   toast(s.status==='active'?'Progresso descartado':'Tentativa apagada','trash');return true;
  }catch(error){toast(message(error),'info');return false;}
 }
 // Where a target's result counts: the material's rounds, or (whole exam) the discipline's rounds.
 function roundsHost(){return material.kind==='exam'?(typeof standaloneQuestions==='object'?standaloneQuestions:null):data.find(x=>x.sourceId===material.sourceId);}
 function removeRound(sessionId){
  const m=roundsHost(),roundId='quiz-'+sessionId;
  if(!m||!saveChange||!(m.questionRounds||[]).some(r=>r.id===roundId))return;
  const before=structuredClone({q:m.q,c:m.c,w:m.w,questionRounds:m.questionRounds});
  m.questionRounds=m.questionRounds.filter(r=>r.id!==roundId);
  Object.assign(m,m.questionRounds.reduce((a,r)=>({q:a.q+r.q,c:a.c+r.c,w:a.w+r.w}),{q:0,c:0,w:0}));render();
  saveChange(material.kind==='exam'?{kind:'delete-session',roundId}:{kind:'delete-round',id:m.sourceId,roundId},()=>{},null,()=>{Object.assign(m,before);render();toast('A tentativa saiu, mas as estatísticas não foram atualizadas. Sincronize e tente de novo.','info');});
 }
 async function loadQuestions(){const r=await client.rpc('question_set',{p_id:setInfo.id});if(r.error||!r.data)throw r.error||Error('Conjunto não encontrado');questions=r.data.questions;}
 function layoutFor(settings,subset){
  const base=subset||questions.map((_,i)=>i),options={};
  for(const q of base){const ids=questions[q].answerOptions.map((_,i)=>i);options[q]=settings.shuffleOptions?shuffle(ids):ids;}
  return {questions:settings.shuffleQuestions?shuffle(base):base,options,settings};
 }
 // Mode, key and clock for a new round: the choices on the setup screen, or the ones of the round being redone.
 function choices(forced){
  const settings={...(forced?forced.settings||PRESETS[forced.mode]:setupSettings)},mode=settings.reveal==='each'?'treino':'prova',clock=forced?.clock||dialog.querySelector('input[name=solverClock]:checked').value;
  if(!forced)savePrefs({settings});
  const minutes=forced?.timerSeconds?forced.timerSeconds/60:Number($s('solverMinutes')?.value);
  if(clock==='timer'&&!(minutes>=1&&minutes<=600)){$s('solverMinutes').focus();throw Error('Informe entre 1 e 600 minutos.');}
  return {settings,mode,clock,timerSeconds:clock==='timer'?Math.round(minutes*60):null};
 }
 async function start(subset,forced){
  if(busy)return;busy=true;const button=$s('solverStart');button?.setAttribute('aria-busy','true');
  try{
   const {settings,mode,clock,timerSeconds}=choices(forced);
   await loadQuestions();const layout=layoutFor(settings,subset);
   const r=await client.rpc('quiz_session_start',{p_set:setInfo.id,p_mode:mode,p_clock:clock,p_timer:timerSeconds,p_layout:layout});if(r.error)throw r.error;
   session={id:r.data,mode,clock,timerSeconds,layout,settings,answers:{},status:'active',elapsedMs:0};
   clockBase=0;position=0;reviewing=false;pending=new Map();hintOpen=new Set();renderQuestion();startClock();
  }catch(error){toast(message(error),'info');}
  finally{busy=false;button?.removeAttribute('aria-busy');}
 }
 // A finished attempt opens straight on its result screen (score, filters, review of each question).
 async function openPast(done){
  try{await loadQuestions();hideTip();stopClock();session={...done,answers:done.answers||{},settings:settingsOf(done),fromHistory:true};clockBase=done.elapsedMs||0;clockStart=0;resultFilter='all';reviewing=false;renderResult();}
  catch(error){toast(message(error),'info');}
 }
 async function resumeSession(open){
  try{await loadQuestions();session={...open,answers:open.answers||{},settings:settingsOf(open)};clockBase=open.elapsedMs||0;reviewing=false;pending=new Map();hintOpen=new Set();
   const first=order().findIndex(q=>answerOf(q).o==null);position=first<0?order().length-1:first;renderQuestion();startClock();}
  catch(error){toast(message(error),'info');}
 }

 // ---------- question ----------
 function revealed(q){return reviewing||(cfg().reveal==='each'&&answerOf(q).o!=null);}
 // Which control had the focus, by kind and option row, to give it back after a redraw without scrolling.
 let renderedKey='';
 function focusKey(body){const a=document.activeElement;if(!a||!body.contains(a))return null;const li=a.closest('.solver-option');return {cls:[...a.classList].find(c=>c.startsWith('solver-'))||'',row:li?[...li.parentElement.children].indexOf(li):-1};}
 function restoreFocus(body,k){if(!k)return;const li=k.row>=0?body.querySelectorAll('.solver-option')[k.row]:body;const t=li?.querySelector('.'+k.cls)||(k.row>=0?li?.querySelector('.solver-pick'):null);try{t?.focus({preventScroll:true});}catch{}}
 function renderQuestion(dir=0){
  hideTip();
  screen='question';const q=order()[position],item=questions[q],answer=answerOf(q),show=revealed(q),total=order().length;
  $s('solverKicker').textContent=`${reviewing?'REVISÃO · ':''}${session.review?'SÓ MEUS ERROS · ':''}${position+1} / ${total}`;
  const bar=$s('solverProgress');bar.hidden=false;bar.firstElementChild.style.width=`${(Object.values(session.answers).filter(a=>a.o!=null).length/total)*100}%`;
  const body=$s('solverBody'),list=el('ol',{className:'solver-options'});
  session.layout.options[q].forEach((o,j)=>{
   const option=item.answerOptions[o],cut=answer.x?.includes(o),chosen=answer.o===o,selected=pending.get(q);
   const li=el('li',{className:'solver-option'});
   // chosen = marked, waiting for "Confirmar resposta"; marked = confirmed answer (exam mode).
   if(show)li.dataset.state=option.isCorrect?'right':chosen?'wrong':'idle';
   else if(selected===o)li.dataset.state='chosen';else if(chosen&&selected==null)li.dataset.state='marked';
   if(cut&&!show)li.dataset.cut='';
   const pick=el('button',{type:'button',className:'solver-pick',disabled:show||cut},el('span',{className:'solver-letter',textContent:LETTERS[j]}),el('span',{className:'solver-text',textContent:option.text}));
   pick.setAttribute('aria-pressed',String(selected===o||(chosen&&selected==null)));pick.onclick=()=>choose(q,o);
   li.append(pick);
   if(!show){const scissors=el('button',{type:'button',className:'icon solver-cut',title:cut?'Trazer alternativa de volta':'Descartar alternativa'});scissors.innerHTML=ICON.cut;scissors.setAttribute('aria-pressed',String(!!cut));scissors.setAttribute('aria-label',`${cut?'Trazer de volta':'Descartar'} alternativa ${LETTERS[j]}`);scissors.onclick=()=>toggleCut(q,o);li.append(scissors);}
   if(show){
    const verdict=option.isCorrect?el('span',{className:'solver-verdict right',innerHTML:ICON.right+'<span>Resposta certa</span>'}):chosen?el('span',{className:'solver-verdict wrong',innerHTML:ICON.wrong+'<span>Não é essa</span>'}):null;
    li.append(el('div',{className:'solver-why'},...(verdict?[verdict]:[]),el('p',{textContent:option.rationale})));
   }
   list.append(li);
  });
  const content=el('div',{className:'solver-question'},el('p',{className:'solver-stem',textContent:item.question}),list);
  // One row under the alternatives: the hint toggle (lamp + "Dica") on the left, "Sugerir alteração" on the right.
  const tools=el('div',{className:'solver-tools-row'});let hintPanel=null;
  if(item.hint){
   // The hint stays hidden until asked for, and stays open for that question once asked.
   const open=hintOpen.has(q);hintPanel=el('div',{className:'solver-hint',hidden:!open},el('span',{innerHTML:ICON.hint}),el('p',{textContent:item.hint}));
   const toggle=el('button',{type:'button',className:'solver-hint-toggle',innerHTML:ICON.hint+'<span>Dica</span>'});toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Ocultar dica':'Ver dica');
   toggle.onclick=()=>{const showHint=hintPanel.hidden;hintPanel.hidden=!showHint;showHint?hintOpen.add(q):hintOpen.delete(q);toggle.setAttribute('aria-expanded',String(showHint));toggle.setAttribute('aria-label',showHint?'Ocultar dica':'Ver dica');if(showHint)animateIn(hintPanel,-6);};
   tools.append(toggle);
  }
  // A member reports a problem with this question (kind + explanation).
  const source=session.review?{id:reviewItems[q].setId,i:reviewItems[q].index,title:reviewItems[q].title}:{id:setInfo.id,i:q,title:setInfo.title};
  if(globalThis.PELEJA_SUGGEST)tools.append(el('button',{type:'button',className:'solver-suggest',textContent:'Sugerir alteração',onclick:()=>globalThis.PELEJA_SUGGEST(source.id,source.i,`${source.title} · Questão ${source.i+1}`)}));
  if(tools.childElementCount)content.append(tools);
  // keyboard help, shown only where there is a keyboard and a fine pointer (see solver.css)
  content.append(el('p',{className:'solver-keys',textContent:reviewing||show?'← → trocam de questão':cfg().confirm?'1–5 selecionam · Enter confirma · ← → trocam de questão':'1–5 marcam · ← → trocam de questão'}));
  if(hintPanel)content.append(hintPanel);
  if(show&&cfg().reveal==='each'&&!reviewing&&answer.o!=null)content.dataset.result=isCorrect(q,answer.o)?'right':'wrong';
  // Same question redrawn (scissors, marking, confirming, hint): keep the scroll and the focus where they were,
  // so a tap never throws the question back to the top (phones). A new question starts at the top.
  const key=`${position}:${reviewing}:${session.id}`,same=key===renderedKey,keep=same?{top:body.scrollTop,focus:focusKey(body)}:null;renderedKey=key;
  body.replaceChildren(content);
  if(keep){body.scrollTop=keep.top;restoreFocus(body,keep.focus);}else body.scrollTop=0;
  if(dir)motion(content,[{opacity:0,transform:`translateX(${dir*14}px)`},{opacity:1,transform:'none'}],{duration:240,easing:EASE});
  renderQuestionFoot();
 }
 function renderQuestionFoot(){
  const total=order().length,last=position===total-1,foot=$s('solverFoot');
  const q=order()[position],answer=answerOf(q),selected=pending.get(q);
  const prev=el('button',{type:'button',className:'editor-cancel',textContent:'Anterior',disabled:position===0,onclick:()=>go(-1)});
  const next=last?null:el('button',{type:'button',className:'primary',textContent:'Próxima',onclick:()=>go(1)});
  if(reviewing){foot.replaceChildren(el('button',{type:'button',className:'editor-cancel solver-left',textContent:'Voltar ao resultado',onclick:()=>renderResult()}),prev,...(next?[next]:[]));return;}
  const finish=el('button',{type:'button',className:last?'primary':'editor-cancel',textContent:session.mode==='prova'?'Finalizar prova':'Finalizar',onclick:askFinish});
  // A marked option still needs "Confirmar resposta": in training it reveals the key, in the exam it records the answer.
  const needsConfirm=cfg().confirm&&(cfg().reveal==='each'?answer.o==null:selected!=null&&selected!==answer.o);
  if(needsConfirm){
   const confirm=el('button',{type:'button',className:'primary',id:'solverConfirm',textContent:'Confirmar resposta',disabled:selected==null,onclick:()=>confirmAnswer(q)});
   const skip=last?null:el('button',{type:'button',className:'editor-cancel',textContent:'Próxima',onclick:()=>go(1)});
   foot.replaceChildren(el('button',{type:'button',className:'editor-cancel solver-left',textContent:finish.textContent,onclick:askFinish}),prev,...(skip?[skip]:[]),confirm);return;
  }
  foot.replaceChildren(...(last?[]:[finish]),prev,...(next?[next]:[finish]));
  if(!last)finish.classList.add('solver-left');
 }
 function go(step){const next=position+step;if(next<0||next>=order().length)return;position=next;renderQuestion(step);}
 function choose(q,o){
  const answer=answerOf(q);if(answer.x?.includes(o))return;
  if(cfg().reveal==='each'&&answer.o!=null)return; // with the key after each answer, the first answer counts
  if(!cfg().confirm){
   // marked on click: recorded right away (tapping it again clears it while the key waits for the end)
   pending.delete(q);session.answers={...session.answers,[q]:{...answer,o:answer.o===o?null:o}};queueSave();renderQuestion();
   if(cfg().reveal==='each')for(const why of $s('solverBody').querySelectorAll('.solver-why'))animateIn(why,-4);
   return;
  }
  if(pending.get(q)===o)pending.delete(q);else pending.set(q,o);
  renderQuestion();
 }
 function confirmAnswer(q){
  const o=pending.get(q);if(o==null)return;pending.delete(q);
  session.answers={...session.answers,[q]:{...answerOf(q),o}};queueSave();
  if(cfg().reveal==='end'&&position<order().length-1){go(1);return;}
  renderQuestion();
  if(cfg().reveal==='each')for(const why of $s('solverBody').querySelectorAll('.solver-why'))animateIn(why,-4);
 }
 function toggleCut(q,o){
  const answer={o:null,x:[],...answerOf(q)},cut=new Set(answer.x||[]);cut.has(o)?cut.delete(o):cut.add(o);
  if(pending.get(q)===o)pending.delete(q);
  answer.x=[...cut];if(answer.o===o)answer.o=null;session.answers={...session.answers,[q]:answer};queueSave();renderQuestion();
 }
 function askFinish(){
  const missing=order().filter(q=>answerOf(q).o==null).length;
  const finish=()=>finishSession();
  if(missing)confirmPeleja(session.mode==='prova'?'Finalizar a prova?':'Finalizar o treino?',finish,{description:`${plural(missing,'questão ficou','questões ficaram')} sem resposta e ${missing===1?'conta':'contam'} como pulada${missing===1?'':'s'}.`,accept:'Finalizar'});
  else finish();
 }
 async function finishSession(){
  if(busy)return;busy=true;stopClock();
  try{
   if(session.review){
    const answered=order().filter(q=>answerOf(q).o!=null);
    session={...session,status:'done',answered:answered.length,correct:answered.filter(q=>isCorrect(q,answerOf(q).o)).length,counted:false,elapsedMs:Math.round(elapsed())};
    renderResult();return;
   }
   const r=await client.rpc('quiz_session_save',{p_id:session.id,p_answers:session.answers,p_elapsed:Math.round(elapsed()),p_finish:true});if(r.error)throw r.error;
   session={...session,status:'done',answered:r.data.answered,correct:r.data.correct,counted:r.data.counted,elapsedMs:Math.round(elapsed())};
   if(r.data.counted)recordRound(r.data);
   renderResult();
  }catch(error){startClock();toast(message(error),'info');}
  finally{busy=false;}
 }
 // The counted attempt of a set becomes one round of the material (or of the exam's "Questões externas"),
 // idempotent by id, so it can be written again safely.
 function addRound({kind,sourceId,subject,sessionId,answered,correct,date}){
  const host=kind==='exam'?(typeof standaloneQuestions==='object'?standaloneQuestions:null):data.find(x=>x.sourceId===sourceId);
  if(!host||!saveChange||!answered||(kind==='exam'&&!subject))return false;
  const round={id:'quiz-'+sessionId,date,q:answered,c:correct,w:answered-correct,...(kind==='exam'?{subject,specialty:''}:{})};
  if((host.questionRounds||[]).some(r=>r.id===round.id))return false;
  const before=structuredClone({q:host.q,c:host.c,w:host.w,questionRounds:host.questionRounds});
  host.questionRounds=[...(host.questionRounds||[]),round];
  Object.assign(host,host.questionRounds.reduce((a,r)=>({q:a.q+r.q,c:a.c+r.c,w:a.w+r.w}),{q:0,c:0,w:0}));render();
  saveChange(kind==='exam'?{kind:'session',round}:{kind:'round',id:sourceId,round},()=>{},null,()=>{Object.assign(host,before);render();toast('O resultado não entrou nas estatísticas. Sincronize e tente de novo.','info');});
  return true;
 }
 function recordRound({answered,correct}){addRound({kind:material.kind,sourceId:material.sourceId,subject:material.subject,sessionId:session.id,answered,correct,date:today()});}
 // On each load: every attempt the server counted must be in the statistics (e.g. a save that never
 // reached the account, a phone that closed right after finishing). Missing ones are added now.
 let reconciling=false;
 async function reconcile(){
  if(reconciling||!saveChange)return;reconciling=true;
  try{
   const r=await client.rpc('quiz_sessions_counted');if(r.error||!Array.isArray(r.data))return;
   for(const c of r.data){
    const d=new Date(c.finishedAt),date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const exam=c.examId?facultyRecords.find(e=>e.sourceId===c.examId):null;
    addRound(c.examId?{kind:'exam',subject:exam?.subject,sessionId:c.id,answered:c.answered,correct:c.correct,date}:{kind:'material',sourceId:c.materialId,sessionId:c.id,answered:c.answered,correct:c.correct,date});
   }
  }catch{}finally{reconciling=false;}
 }

 // ---------- result ----------
 function status(q){const a=answerOf(q);return a.o==null?'skipped':isCorrect(q,a.o)?'right':'wrong';}
 function renderResult(){
  clearPause();screen='result';reviewing=false;renderedKey='';stopClock();
  const all=order(),counts={right:0,wrong:0,skipped:0};all.forEach(q=>counts[status(q)]++);
  const total=all.length,pct=Math.round(counts.right/total*100);
  $s('solverKicker').textContent=session.mode==='prova'?'RESULTADO DA PROVA':'RESULTADO DO TREINO';$s('solverProgress').hidden=true;
  const clockNote=session.clock==='timer'&&elapsed()>session.timerSeconds*1000?` · passou ${fmt(elapsed()-session.timerSeconds*1000)} do tempo`:'';
  const head=el('div',{className:'solver-score'},el('div',{},el('span',{className:'solver-score-label',textContent:'Sua nota'}),el('strong',{},`${counts.right}/${total}`,el('small',{textContent:` (${pct}%)`}))),el('span',{className:'solver-note',textContent:`Tempo ${fmt(elapsed())}${clockNote}${session.counted?` · contou nas estatísticas ${material.kind==='exam'?'da disciplina':'da apostila'}`:''}`}));
  const bar=el('div',{className:'solver-bar'});for(const k of ['right','wrong','skipped'])if(counts[k])bar.append(el('span',{className:k,style:`flex:${counts[k]}`}));
  const filters=el('div',{className:'solver-filters',role:'group'});filters.setAttribute('aria-label','Filtrar questões');
  const labels={all:'Todas',right:'Acertou',wrong:'Errou',skipped:'Pulou'};
  for(const k of ['all','right','wrong','skipped']){const b=el('button',{type:'button'},labels[k],el('small',{textContent:k==='all'?total:counts[k]}));b.dataset.kind=k;b.setAttribute('aria-pressed',String(resultFilter===k));b.onclick=()=>{resultFilter=k;renderResult();};filters.append(b);}
  const list=el('ol',{className:'solver-review-list'});
  all.forEach((q,i)=>{const s=status(q);if(resultFilter!=='all'&&s!==resultFilter)return;const b=el('button',{type:'button'},el('span',{className:'solver-dot '+s}),el('span',{className:'solver-review-n',textContent:i+1}),el('span',{className:'solver-review-q',textContent:questions[q].question}));b.onclick=()=>{reviewing=true;position=i;renderQuestion();};list.append(el('li',{},b));});
  if(!list.children.length)list.append(el('li',{className:'solver-note',textContent:'Nenhuma questão aqui.'}));
  const body=$s('solverBody');body.replaceChildren(el('div',{className:'solver-result'},head,bar,filters,list));body.scrollTop=0;animateIn(body.firstElementChild);
  const missed=all.filter(q=>status(q)!=='right'),foot=$s('solverFoot'),again={mode:session.mode,settings:cfg(),clock:session.clock,timerSeconds:session.timerSeconds};
  foot.replaceChildren(session.fromHistory?el('button',{type:'button',className:'editor-cancel solver-left',textContent:'Voltar',onclick:()=>{session=null;renderSetup();}}):el('button',{type:'button',className:'editor-cancel solver-left',textContent:'Fechar',onclick:close}));
  const redo=session.review?startReview:start;
  if(missed.length)foot.append(el('button',{type:'button',className:'editor-cancel',textContent:'Refazer erradas',onclick:()=>redo(missed,{...again,timerSeconds:again.timerSeconds&&Math.max(60,Math.round(again.timerSeconds*missed.length/total))})}));
  foot.append(el('button',{type:'button',className:'primary',textContent:'Refazer tudo',onclick:()=>redo(session.review?all:null,again)}));
 }

 // ---------- open / close ----------
 async function open(t,opener){
  material=t;const list=setsFor(t);if(!list.length&&!reviewSetsFor(t).length)return;const remembered=prefs().lists?.[t.key];setInfo=list.find(s=>s.id===remembered)||list[0]||null;resultFilter='all';dialog.dataset.opener=t.key;dialog.dataset.openerKind=t.kind;
  if(!dialog.open)dialog.showModal();motion(dialog.querySelector('.solver-shell'),[{opacity:0,transform:'translateY(10px) scale(.99)'},{opacity:1,transform:'none'}],{duration:260,easing:EASE});
  await renderSetup();$s('solverClose').focus();
 }
 // Leaving an unfinished session asks: keep the progress for later, or discard it and start over next time.
 const leave=document.createElement('dialog');leave.id='solverLeave';leave.className='solver-leave';leave.setAttribute('aria-labelledby','solverLeaveTitle');
 leave.innerHTML='<h2 id="solverLeaveTitle">Sair antes de terminar?</h2><p id="solverLeaveText"></p><div class="solver-leave-actions"><button type="button" class="primary" id="solverKeep">Guardar progresso</button><button type="button" class="editor-cancel solver-danger" id="solverDiscard">Descartar e recomeçar depois</button><button type="button" class="editor-cancel" id="solverStay">Continuar respondendo</button></div>';
 dialog.append(leave);
 function finishClose(){leave.open&&leave.close();dialog.close();session=null;questions=[];pending=new Map();document.querySelector(dialog.dataset.openerKind==='exam'?`#facultyList [data-solve-exam="${dialog.dataset.opener}"]`:`#library [data-solve="${dialog.dataset.opener}"]`)?.focus();}
 async function close(){
  if(leave.open)return;
  const answered=session?.status==='active'?Object.values(session.answers).filter(a=>a.o!=null).length:0;
  // The errors round is not saved: leaving with answers only asks once.
  if(session?.review&&session.status==='active'&&answered&&typeof confirmPeleja==='function'){
   confirmPeleja('Sair da rodada de erros?',()=>{stopClock();finishClose();},{description:`Você respondeu ${answered} de ${order().length}. Esta rodada não fica guardada; da próxima vez, os seus erros aparecem de novo.`,accept:'Sair'});
   return;
  }
  if(session?.status==='active'&&!session.review&&(answered||Object.keys(session.answers).length)){
   stopClock();
   leave.querySelector('#solverLeaveText').textContent=`Você respondeu ${answered} de ${order().length}. Guarde para continuar de onde parou, ou descarte para começar do zero na próxima vez.`;
   leave.showModal();leave.querySelector('#solverKeep').focus();
   motion(leave,[{opacity:0,transform:'translateY(6px) scale(.98)'},{opacity:1,transform:'none'}],{duration:200,easing:EASE});
   return;
  }
  stopClock();
  if(session?.status==='active'&&!session.review)Promise.resolve(client.rpc('quiz_session_delete',{p_id:session.id})).catch(()=>{}); // nothing answered: nothing to keep
  finishClose();
 }
 leave.querySelector('#solverKeep').onclick=async()=>{try{await flush();toast('Progresso guardado. Continue quando quiser.','info');}catch{toast('Não foi possível guardar o progresso.','info');}finishClose();};
 leave.querySelector('#solverDiscard').onclick=async()=>{const s=session;if(await removeSession(s))finishClose();};
 leave.querySelector('#solverStay').onclick=()=>{leave.close();startClock();};
 leave.addEventListener('cancel',event=>{event.preventDefault();leave.close();startClock();});
 $s('solverClose').onclick=close;
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 // Keyboard: 1–5 act on A–E like a tap (select when confirming, mark at once on click), Enter confirms, ← → move.
 dialog.addEventListener('keydown',event=>{
  if(screen!=='question'||event.target.closest('input,textarea')||event.ctrlKey||event.metaKey||event.altKey)return;
  if(/^[1-5]$/.test(event.key)){
   const q=order()[position],o=session.layout.options[q]?.[Number(event.key)-1];
   if(reviewing||clockPaused||o==null||revealed(q)||answerOf(q).x?.includes(o))return;
   event.preventDefault();choose(q,o);return;
  }
  if(event.key==='ArrowRight')go(1);else if(event.key==='ArrowLeft')go(-1);else if(event.key==='Enter'&&$s('solverConfirm')&&!$s('solverConfirm').disabled&&!event.target.closest('button')){event.preventDefault();$s('solverConfirm').click();}
 });
 addEventListener('pagehide',()=>{if(session?.status==='active'){clockBase=elapsed();clockStart=clockStart&&Date.now();flush().catch(()=>{});}});

 return {
  async ready(){try{await loadSets();}catch{sets=[];}decorate();reconcile();},
  reset(){sets=[];if(dialog.open){stopClock();dialog.close();}session=null;},
  _debug:{get session(){return session;},get questions(){return questions;}}
 };
};
