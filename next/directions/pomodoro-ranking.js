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
 let period='day',rows=[],loadedFor='',loading=false,photos=null,timer=0;
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
 function avatar(row){
  const a=el('span',{className:'pomo-avatar'}),src=photos?.get(row.userId);
  if(src){const img=new Image();img.src=src;img.alt='';a.append(img);}else a.textContent=(row.name||'?').slice(0,1).toUpperCase();
  if(row.live)a.dataset.live=row.live.running?(row.live.mode==='focus'?'focus':'break'):'paused';
  return a;
 }
 function draw(){
  const from=+periodStart(period);
  const list=rows.map(r=>({...r,shown:r.totalMs+liveFocusMs(r.live,from)})).sort((a,b)=>b.shown-a.shown||a.name.localeCompare(b.name));
  const max=Math.max(...list.map(r=>r.shown),1);
  const switcher=el('div',{className:'pomo-period',role:'group'});switcher.setAttribute('aria-label','Período');
  for(const [key,label] of PERIODS){const b=el('button',{type:'button',textContent:label,onclick:()=>{period=key;rows=[];draw();load();}});b.setAttribute('aria-pressed',String(key===period));switcher.append(b);}
  const head=el('div',{className:'pomo-ranking-head'},el('div',{},el('h2',{textContent:'Ranking de foco'}),el('p',{textContent:'Horas focadas no Pomodoro. O foco em andamento já conta.'})),switcher);
  const studying=list.filter(r=>r.live);
  const liveBox=studying.length?el('div',{className:'pomo-live'},el('h3',{},el('i',{className:'pomo-live-dot'}),studying.filter(r=>r.live.running&&r.live.mode==='focus').length?'Estudando agora':'Com o timer aberto'),
   el('div',{className:'pomo-live-list'},...studying.map(r=>el('div',{className:'pomo-live-person'},avatar(r),el('span',{},el('b',{textContent:r.me?'Você':r.name}),el('small',{textContent:liveText(r.live)})))))):null;
  let body;
  if(!list.length)body=el('p',{className:'pomo-ranking-empty',textContent:loadedFor?'Ninguém por aqui ainda.':'Carregando o ranking…'});
  else if(!list.some(r=>r.shown))body=el('div',{className:'pomo-ranking-empty'},el('strong',{textContent:'Ninguém focou nesse período ainda'}),el('p',{textContent:'Dá o play e sai na frente.'}));
  else{
   body=el('ol',{className:'pomo-board'});let place=0,last=-1;
   list.forEach((r,i)=>{if(r.shown!==last){place=i+1;last=r.shown;}
    const bar=el('i');bar.style.width=(r.shown/max*100)+'%';
    const li=el('li',{className:r.me?'is-me':''},el('span',{className:'pomo-place',textContent:place+'º'}),avatar(r),
     el('span',{className:'pomo-board-name'},el('b',{},r.name,r.me?el('small',{className:'pomo-you',textContent:'Você'}):null),el('small',{textContent:[r.sessions?(r.sessions===1?'1 sessão':r.sessions+' sessões'):'',r.live?(r.live.running&&r.live.mode==='focus'?'focando agora':liveText(r.live)):''].filter(Boolean).join(' · ')||'sem foco'})),
     el('span',{className:'pomo-board-total'},el('strong',{textContent:r.shown?dur(r.shown):'0 min'}),el('span',{className:'pomo-board-bar'},bar)));
    li.dataset.place=String(place);if(r.live?.running&&r.live.mode==='focus')li.dataset.live='true';body.append(li);});
  }
  const mine=list.find(r=>r.me),note=mine?.hidden?el('p',{className:'pomo-ranking-note',textContent:'Você escolheu não aparecer nos rankings: só você vê a sua linha. Dá para mudar em Configurações → Privacidade.'}):null;
  panel.replaceChildren(head,note,liveBox,body);
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
  if(!P.user()||prefs().friends===false)return;
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
