// Mini Pomodoro: while a session is on and the Pomodoro tab is not showing, a small player in a
// place of its own (top bar, a bar above the phone tabs, or the solver's header) shows the phase, the time and the set, with Pausar/Continuar, Pular and Concluir (like
// the phone notification). It also works over the question solver: an open modal dialog sits in the top
// layer, so the player moves inside it while it is open.
(()=>{
 const P=globalThis.PELEJA_POMODORO;if(!P)return;
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children.filter(c=>c!=null&&c!==false));return n;};
 const svg=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
 const I={
  play:'<path d="M8 5.8v12.4c0 .7.8 1.2 1.4.8l9.4-6.2c.6-.4.6-1.2 0-1.6L9.4 5c-.6-.4-1.4.1-1.4.8Z" fill="currentColor" stroke="none"/>',
  pause:'<rect x="6.5" y="5" width="4" height="14" rx="1.4" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.4" fill="currentColor" stroke="none"/>',
  skip:'<path d="M6 6.5v11l8-5.5Z" fill="currentColor" stroke="none"/><path d="M17.5 6v12"/>',
  finish:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  cup:'<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16"/>',
  shrink:'<path d="m7 10 5 5 5-5"/>',grow:'<path d="m7 14 5-5 5 5"/>'
 };
 const KEY='peleja-pomodoro-mini-v1';
 let small=false;try{small=localStorage.getItem(KEY)==='small';}catch{}
 const button=(cls,label,onclick)=>{const b=el('button',{type:'button',className:'pomo-mini-btn '+cls,onclick:e=>{e.stopPropagation();onclick();}});b.setAttribute('aria-label',label);b.title=label;return b;};
 const mini=el('div',{className:'pomo-mini',id:'pomoMini',hidden:true});mini.setAttribute('role','region');mini.setAttribute('aria-label','Pomodoro em andamento');
 const dot=el('i',{className:'pomo-mini-dot'}),mode=el('span',{className:'pomo-mini-mode'}),time=el('strong',{className:'pomo-mini-time'}),sets=el('span',{className:'pomo-mini-sets'});
 const info=el('button',{type:'button',className:'pomo-mini-info',onclick:()=>{if(!document.querySelector('#solverDialog[open]'))globalThis.showPomodoro?.();}},dot,el('span',{className:'pomo-mini-text'},mode,time,sets));
 const toggle=button('pomo-mini-toggle','Pausar',()=>P.actions.toggle()),skip=button('pomo-mini-skip','Pular',()=>P.actions.skip());
 const brk=button('pomo-mini-break','Começar pausa',()=>P.actions.startBreak()),finish=button('pomo-mini-finish','Concluir',()=>P.actions.finish());
 const fold=button('pomo-mini-fold','Recolher',()=>{small=!small;try{localStorage.setItem(KEY,small?'small':'');}catch{}paint();});
 brk.innerHTML=svg(I.cup);skip.innerHTML=svg(I.skip);finish.innerHTML=svg(I.finish);
 mini.append(info,el('span',{className:'pomo-mini-actions'},toggle,brk,skip,finish),fold);
 const home=()=>document.querySelector('.app')||document.body;
 home().append(mini);

 // It never floats over buttons: each view gives it a place of its own (see data-dock in pomodoro.css).
 // An open modal dialog (the question solver) is the top layer, so meanwhile it lives inside it.
 const phone=globalThis.matchMedia?.('(max-width:760px)')||{matches:false};
 function place(){
  const solver=document.querySelector('#solverDialog[open]'),actions=document.querySelector('header .header-actions');
  let host=home(),before=null,dock='strip';
  if(solver&&phone.matches){host=solver.querySelector('.solver-shell')||solver;before=solver.querySelector('.solver-progress');dock='solver-row';}
  else if(solver){host=solver.querySelector('.solver-top')||solver;before=solver.querySelector('#solverClock');dock='solver-top';}
  else if(!phone.matches&&actions){host=actions;before=actions.querySelector('#refresh')||actions.firstChild;dock='header';}
  if(before&&before.parentElement!==host)before=null;
  if(mini.parentElement!==host||(before&&mini.nextSibling!==before))host.insertBefore(mini,before);
  mini.dataset.dock=dock;
  return dock;
 }
 // A failure never leaves a half-drawn player on screen: it hides and says why in the console.
 function paint(){try{draw();}catch(error){mini.hidden=true;console.error('Miniatura do Pomodoro:',error);}}
 function draw(){
  const t=P.state().timer,c=P.state().config,running=t.status==='running';
  const show=t.status!=='idle'&&(P.page.hidden||!!document.querySelector('#solverDialog[open]'));
  mini.hidden=!show;
  const dock=show?place():null;
  // on a phone the bar above the tabs takes room: the page, "+" and toasts move up by its height
  document.documentElement.classList.toggle('has-pomo-mini',dock==='strip');
  if(!show)return;
  const planned=P.planned(t.mode),e=P.elapsed(),over=t.mode==='focus'&&c.flow&&e>planned;
  mini.dataset.mode=t.mode;mini.dataset.status=t.status;mini.dataset.small=String(small);
  mode.textContent=t.status==='paused'?'Pausado':t.mode==='focus'?(c.flow?'Foco · flow':'Foco'):P.modeName[t.mode];
  time.textContent=over?'+'+P.fmt(e-planned):P.fmt(planned-e);
  sets.textContent=t.mode==='focus'?`série ${Math.min(t.setsDone+1,c.targetSets)} de ${c.targetSets}`:`${t.setsDone} de ${c.targetSets} feitas`;
  toggle.innerHTML=svg(running?I.pause:I.play);toggle.setAttribute('aria-label',running?'Pausar':'Continuar');toggle.title=running?'Pausar':'Continuar';
  skip.hidden=!running||c.targetSets<=1;
  brk.hidden=!(t.mode==='focus'&&c.flow);
  fold.innerHTML=svg(small?I.grow:I.shrink);fold.setAttribute('aria-label',small?'Expandir':'Recolher');fold.title=small?'Expandir':'Recolher';
  info.setAttribute('aria-label',`${mode.textContent}, ${time.textContent}, ${sets.textContent}`);
 }
 globalThis.PELEJA_POMODORO_CHANGED=paint;
 phone.addEventListener?.('change',paint);
 setInterval(()=>{if(P.state().timer.status!=='idle'||!mini.hidden)paint();},500);
 // the Pomodoro tab showing or hiding, and dialogs opening or closing
 new MutationObserver(paint).observe(P.page,{attributes:true,attributeFilter:['hidden']});
 // the solver dialog is created later (after sign-in): watch for it once, then stop watching the page
 const watchDialog=()=>{const d=document.getElementById('solverDialog');if(!d)return false;new MutationObserver(paint).observe(d,{attributes:true,attributeFilter:['open']});return true;};
 if(!watchDialog()){const wait=new MutationObserver(()=>{if(watchDialog())wait.disconnect();});wait.observe(document.body,{childList:true,subtree:true});}
 globalThis.PELEJA_POMODORO_MINI={paint,element:mini};
 paint();
})();
