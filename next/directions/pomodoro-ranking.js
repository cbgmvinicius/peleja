// Pomodoro ranking: focus hours of every member for today, 3 days, the week, the month or the year,
// who is studying right now, and a heads-up when a friend starts (while Peleja is open).
// The member's own timer is published as a "live" row on every change and every minute while on.
(()=>{
 const P=globalThis.PELEJA_POMODORO;if(!P)return;
 const page=P.page,$=id=>document.getElementById(id),now=()=>globalThis.PELEJA_NOW?.()??Date.now();
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children.filter(c=>c!=null&&c!==false));return n;};
 const dur=ms=>{const m=Math.floor(ms/60000);if(m<60)return m+' min';const h=Math.floor(m/60),r=m%60;return r?`${h}h ${String(r).padStart(2,'0')}min`:`${h}h`;};
 const startOfDay=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d;};
 const PERIODS=[['day','Hoje'],['3days','3 dias'],['week','Semana'],['month','Mês'],['year','Ano']];
 function periodStart(key){
  const d=startOfDay(now());
  if(key==='3days')d.setDate(d.getDate()-2);
  else if(key==='week')d.setDate(d.getDate()-((d.getDay()+6)%7)); // weeks start on Monday
  else if(key==='month')d.setDate(1);
  else if(key==='year')d.setMonth(0,1);
  return d;
 }

 // ---------- view ----------
 const tabs=page.querySelector('.pomo-views');
 const tab=el('button',{type:'button',textContent:'Ranking',id:'pomoViewRanking'});tab.dataset.view='ranking';tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');tabs?.append(tab);
 const panel=el('section',{className:'pomo-ranking',id:'pomoRanking',hidden:true});panel.setAttribute('aria-label','Ranking de horas');page.append(panel);
 let period='day',rows=[],loadedFor='',loading=false,photos=null,timer=0,expanded=false;
 new MutationObserver(()=>{const on=page.dataset.view==='ranking'&&!page.hidden;if(on===!panel.hidden)return;panel.hidden=!on;clearInterval(timer);if(on){draw();load();timer=setInterval(()=>{load();},30000);if(typeof motion==='function')motion(panel,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:200});}}).observe(page,{attributes:true,attributeFilter:['data-view','hidden']});
 // live minutes tick on screen without asking the server
 setInterval(()=>{if(!panel.hidden)draw();},15000);

 async function loadPhotos(){
  if(photos)return;photos=new Map();
  try{const r=await P.from('profile_photos')?.select('user_id,image_data');for(const p of r?.data||[])photos.set(p.user_id,p.image_data);}catch{}
 }
 async function load(){
  if(loading||!P.user())return;loading=true;
  const key=period+P.user();
  try{
   const r=await P.rpc('pomodoro_ranking',{p_from:periodStart(period).toISOString()});
   if(!r.error&&Array.isArray(r.data)&&key===period+P.user()){rows=r.data;loadedFor=key;}
   await loadPhotos();
  }finally{loading=false;}
  if(!panel.hidden)draw();
 }
 // The focus in progress counts on the board right away (only the part inside the period).
 function liveFocusMs(live,from){
  if(!live||live.mode!=='focus')return 0;
  const e=live.accMs+(live.running?Math.max(0,now()-Date.parse(live.since)):0);
  return Math.max(0,Math.min(e,now()-Math.max(from,Date.parse(live.phaseStartedAt))));
 }
 function liveText(live){
  if(!live)return '';
  if(!live.running)return 'pausado';
  if(live.mode!=='focus')return live.mode==='long'?'pausa longa':'na pausa';
  return 'focando há '+dur(live.accMs+Math.max(0,now()-Date.parse(live.since)));
 }
 // Status as an icon; the words show on hover (computer) or on a tap (phone), like the heatmap.
 const svg=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
 const ICON={
  focus:'<path d="M8 5.8v12.4c0 .7.8 1.2 1.4.8l9.4-6.2c.6-.4.6-1.2 0-1.6L9.4 5c-.6-.4-1.4.1-1.4.8Z" fill="currentColor" stroke="none"/>',
  break:'<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2M12 3.5v2"/>',
  paused:'<rect x="7" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none"/>',
  flame:'<path d="M12 3c.6 3 3.6 4.6 5 7.4 1.5 3 .8 6.6-1.7 8.4A6.5 6.5 0 0 1 6 15c0-2.6 1.3-4.4 2.6-5.6.2 1.7 1 2.8 2.2 3.3C10.2 9 10.8 5.8 12 3Z" fill="currentColor" stroke="none"/>',
  crown:'<path d="M4 8.5 8 12l4-6 4 6 4-3.5-1.6 9.5H5.6Z" fill="currentColor" stroke="none"/><path d="M5.8 20h12.4"/>',
  batteryHalf:'<rect x="3" y="7.5" width="16" height="9" rx="2.2"/><path d="M21 10.5v3"/><rect x="5.3" y="9.8" width="5.5" height="4.4" rx=".8" fill="currentColor" stroke="none"/>',
  batteryLow:'<rect x="3" y="7.5" width="16" height="9" rx="2.2"/><path d="M21 10.5v3"/><rect x="5.3" y="9.8" width="2.2" height="4.4" rx=".6" fill="currentColor" stroke="none"/>'
 };
 const capital=t=>t.charAt(0).toUpperCase()+t.slice(1);
 function statusIcon(live){
  if(!live)return null;
  const state=live.running?(live.mode==='focus'?'focus':'break'):'paused',text=capital(liveText(live));
  const n=el('span',{className:'pomo-status-icon',innerHTML:svg(ICON[state]),tabIndex:0});n.dataset.state=state;n.dataset.tip=text;n.setAttribute('role','img');n.setAttribute('aria-label',text);return n;
 }
 // Hours of the day: from 3h it starts to warm up, 6h is the top, past 6h30 it cools down into a burnout warning.
 const H=3600000;
 function tier(ms){
  if(ms>=7.5*H)return {key:'burn',icon:'batteryLow',tip:`${dur(ms)} hoje: muito além das 6h. Descansar também é estudo.`};
  if(ms>=6.5*H)return {key:'warn',icon:'batteryHalf',tip:`${dur(ms)} hoje: já passou das 6h. Que tal parar por hoje?`};
  if(ms>=6*H)return {key:'apex',icon:'crown',tip:`${dur(ms)} hoje: meta máxima do dia. Agora é descansar.`};
  if(ms>=5*H)return {key:'t3',icon:'flame',tip:`${dur(ms)} hoje: pegando fogo. Falta pouco pras 6h.`};
  if(ms>=4*H)return {key:'t2',icon:'flame',tip:`${dur(ms)} hoje: embalado. Dia de estudo de verdade.`};
  if(ms>=3*H)return {key:'t1',icon:'flame',tip:`${dur(ms)} hoje: aquecendo. Mais uma hora e o fogo cresce.`};
  return null;
 }
 const tip=el('div',{className:'pomo-day-tip pomo-rank-tip',id:'pomoRankTip',hidden:true,role:'status'});
 let tipTimer=0;
 const hideTip=()=>{clearTimeout(tipTimer);tip.hidden=true;};
 function showTip(target,ms=0){
  tip.textContent=target.dataset.tip;tip.hidden=false;
  const r=target.getBoundingClientRect(),b=panel.getBoundingClientRect(),half=(tip.offsetWidth||140)/2;
  tip.style.left=Math.max(half+8,Math.min(b.width-half-8,r.left-b.left+r.width/2))+'px';tip.style.top=(r.top-b.top-8)+'px';
  clearTimeout(tipTimer);if(ms)tipTimer=setTimeout(hideTip,ms);
 }
 panel.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const t=e.target.closest?.('[data-tip]');if(t)showTip(t);});
 panel.addEventListener('pointerout',e=>{if(e.pointerType!=='mouse')return;const t=e.target.closest?.('[data-tip]');if(t&&!t.contains(e.relatedTarget))hideTip();});
 panel.addEventListener('click',e=>{const t=e.target.closest?.('[data-tip]');if(t)showTip(t,2600);});
 panel.addEventListener('focusin',e=>{const t=e.target.closest?.('[data-tip]');if(t)showTip(t);});
 panel.addEventListener('focusout',hideTip);
 function avatar(row,t=null){
  const a=el('span',{className:'pomo-avatar'}),src=photos?.get(row.userId);
  if(src){const img=new Image();img.src=src;img.alt='';a.append(img);}else a.textContent=(row.name||'?').slice(0,1).toUpperCase();
  if(row.live)a.dataset.live=row.live.running?(row.live.mode==='focus'?'focus':'break'):'paused';
  if(t){a.dataset.tier=t.key;a.dataset.tip=t.tip;a.tabIndex=0;a.setAttribute('role','img');a.setAttribute('aria-label',t.tip);}
  return a;
 }
 const abstained=()=>globalThis.PELEJA_MY_PRIVACY==='hidden';
 function abstainNote(){return el('div',{className:'pomo-ranking-empty pomo-abstained'},el('strong',{textContent:'Você não está participando dos rankings'}),el('p',{textContent:'Você escolheu não aparecer nem ver os rankings. Para voltar, vá em Configurações → Privacidade.'}));}
 function draw(){
  if(abstained()){panel.replaceChildren(el('div',{className:'pomo-ranking-head'},el('div',{},el('h2',{textContent:'Ranking de foco'}))),abstainNote());return;}
  const from=+periodStart(period);
  const list=rows.map(r=>({...r,shown:r.totalMs+liveFocusMs(r.live,from)})).sort((a,b)=>b.shown-a.shown||a.name.localeCompare(b.name));
  const max=Math.max(...list.map(r=>r.shown),1);
  const switcher=el('div',{className:'pomo-period',role:'group'});switcher.setAttribute('aria-label','Período');
  for(const [key,label] of PERIODS){const b=el('button',{type:'button',textContent:label,onclick:()=>{period=key;rows=[];draw();load();}});b.setAttribute('aria-pressed',String(key===period));switcher.append(b);}
  const head=el('div',{className:'pomo-ranking-head'},el('div',{},el('h2',{textContent:'Ranking de foco'}),el('p',{textContent:'Horas focadas no Pomodoro. O foco em andamento já conta.'})),switcher);
  const studying=list.filter(r=>r.live);
  const liveBox=studying.length?el('div',{className:'pomo-live'},el('h3',{},el('i',{className:'pomo-live-dot'}),studying.filter(r=>r.live.running&&r.live.mode==='focus').length?'Estudando agora':'Com o timer aberto'),
   el('div',{className:'pomo-live-list'},...studying.map(r=>el('div',{className:'pomo-live-person'},avatar(r),el('span',{className:'pomo-live-name'},el('b',{textContent:r.me?'Você':r.name}),statusIcon(r.live)))))):null;
  let body;
  if(!list.length)body=el('p',{className:'pomo-ranking-empty',textContent:loadedFor?'Ninguém por aqui ainda.':'Carregando o ranking…'});
  else if(!list.some(r=>r.shown))body=el('div',{className:'pomo-ranking-empty'},el('strong',{textContent:'Ninguém focou nesse período ainda'}),el('p',{textContent:'Dá o play e sai na frente.'}));
  else{
   // Only who focused in the period; places shared on ties.
   const ranked=list.filter(r=>r.shown>0);let place=0,last=-1;
   ranked.forEach((r,i)=>{if(r.shown!==last){place=i+1;last=r.shown;}r.place=place;});
   // Compact by default: the top 3, plus whoever is right above and right below you.
   const meAt=ranked.findIndex(r=>r.me),keep=new Set([0,1,2,meAt-1,meAt,meAt+1].filter(i=>i>=0&&i<ranked.length));
   const compact=!expanded&&ranked.length>keep.size;
   body=el('div',{});const board=el('ol',{className:'pomo-board'});body.append(board);
   ranked.forEach((r,i)=>{
    if(compact&&!keep.has(i)){if(keep.has(i-1)||i===0)board.append(el('li',{className:'pomo-board-gap','aria-hidden':'true',textContent:'⋯'}));return;}
    const bar=el('i');bar.style.width=(r.shown/max*100)+'%';
    const t=period==='day'?tier(r.shown):null,barBox=el('span',{className:'pomo-board-bar'},bar);if(t)barBox.dataset.tier=t.key;
    const li=el('li',{className:r.me?'is-me':''},el('span',{className:'pomo-place',textContent:r.place+'º'}),avatar(r,t),
     el('span',{className:'pomo-board-name'},el('b',{},r.name,r.me?el('small',{className:'pomo-you',textContent:'Você'}):null),el('small',{className:'pomo-board-meta'},r.sessions?(r.sessions===1?'1 sessão':r.sessions+' sessões'):'',statusIcon(r.live))),
     el('span',{className:'pomo-board-total'},el('strong',{textContent:dur(r.shown)}),barBox));
    li.dataset.place=String(r.place);if(r.live?.running&&r.live.mode==='focus')li.dataset.live='true';board.append(li);
   });
   if(ranked.length>keep.size)body.append(el('button',{type:'button',className:'pomo-board-more',id:'pomoBoardMore',textContent:expanded?'Mostrar menos':`Ver todos (${ranked.length})`,onclick:()=>{expanded=!expanded;draw();}}));
   if(meAt<0)body.append(el('p',{className:'pomo-ranking-note',textContent:'Você ainda não focou nesse período. Dá o play e entra no ranking.'}));
  }
  const mine=list.find(r=>r.me),note=mine?.hidden?el('p',{className:'pomo-ranking-note',textContent:'Você escolheu não aparecer nos rankings: só você vê a sua linha. Dá para mudar em Configurações → Privacidade.'}):null;
  hideTip();panel.replaceChildren(...[head,note,liveBox,body,tip].filter(Boolean));
 }

 // ---------- publishing my live state ----------
 let published='',lastBeat=0;
 function signature(){const t=P.state().timer;return t.status==='idle'?'idle':[t.mode,t.status,t.runningSince,Math.round(t.accMs/1000),t.phaseStartedAt].join('|');}
 async function publish(force=false){
  if(!P.user())return;
  const sig=signature();if(!force&&sig===published&&(sig==='idle'||now()-lastBeat<60000))return;
  const t=P.state().timer;published=sig;lastBeat=now();
  const args=t.status==='idle'?{p_mode:null,p_running:null,p_since:null,p_acc_ms:null,p_phase_started:null}
   :{p_mode:t.mode,p_running:t.status==='running',p_since:new Date(t.status==='running'?t.runningSince:now()).toISOString(),p_acc_ms:Math.round(Math.min(t.accMs,21600000)),p_phase_started:new Date(t.phaseStartedAt).toISOString()};
  try{const r=await P.rpc('pomodoro_live_set',args);if(r?.error)published='';}catch{published='';}
 }
 setInterval(()=>publish(),2000);

 // ---------- a friend started ----------
 const prefs=()=>P.state().prefs;
 let seen=null;
 async function watchFriends(){
  if(!P.user()||prefs().friends===false||abstained())return;
  let r;try{r=await P.rpc('pomodoro_ranking',{p_from:startOfDay(now()).toISOString()});}catch{return;}
  if(r?.error||!Array.isArray(r.data))return;
  const focusing=new Set(r.data.filter(x=>!x.me&&!x.anonymous&&x.live?.running&&x.live.mode==='focus').map(x=>x.userId));
  if(seen)for(const x of r.data)if(focusing.has(x.userId)&&!seen.has(x.userId)){
   const text=`${x.name} começou a estudar. Bora junto?`;
   globalThis.toast?.(text,'info');
   if(document.hidden&&prefs().notify&&typeof Notification!=='undefined'&&Notification.permission==='granted'){try{new Notification('Peleja',{body:text,icon:'../assets/peleja-icon-192.png',tag:'peleja-friend-'+x.userId});}catch{}}
  }
  seen=focusing;
  if(page.dataset.view==='ranking'&&period==='day'&&!panel.hidden){rows=r.data;loadedFor=period+P.user();draw();}
 }
 setInterval(watchFriends,60000);setTimeout(watchFriends,4000);

 // ---------- setting ----------
 const card=globalThis.PELEJA_POMODORO_SETTINGS?.querySelector('.settings-card');
 if(card){
  const input=el('input',{type:'checkbox',checked:prefs().friends!==false,id:'pomoPrefFriends'});input.setAttribute('role','switch');
  const row=el('label',{className:'pomo-switch switch-option settings-row'},el('span',{className:'pomo-switch-text'},el('span',{textContent:'Avisar quando um amigo começar a estudar'})),input,el('span',{className:'switch-visual','aria-hidden':'true'}));
  input.onchange=()=>{prefs().friends=input.checked;P.save();};
  card.append(row);
 }
 globalThis.PELEJA_POMODORO_RANKING={load,publish,watchFriends,draw,setPeriod:p=>{period=p;rows=[];load();}};
})();
