// Pomodoro Insights: the member's focus profile, built from their own blocks (pomodoro_blocks_mine)
// plus the ones still waiting on the device. The streak comes first (a fire to keep alive), then the
// last 7 days side by side (beat yesterday), totals per period, the year in days and tasks.
(()=>{
 const P=globalThis.PELEJA_POMODORO;if(!P)return;
 const page=P.page,now=()=>globalThis.PELEJA_NOW?.()??Date.now();
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children.filter(c=>c!=null&&c!==false));return n;};
 const DAY=86400000,WEEKDAYS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 const MONTHS=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
 const MILESTONES=[3,7,14,30,60,100,180,365];
 const pad=n=>String(n).padStart(2,'0');
 const keyOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const startOfDay=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d;};
 const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
 const dur=ms=>{const m=Math.round(ms/60000);if(m<60)return m+' min';const h=Math.floor(m/60),r=m%60;return r?`${h}h ${r}min`:`${h}h`;};
 const short=ms=>{const m=Math.round(ms/60000);if(!m)return '';if(m<60)return m+'m';const h=Math.floor(m/60),r=m%60;return r?`${h}h${pad(r)}`:`${h}h`;};
 const days=n=>n===1?'1 dia':n+' dias';
 const sessions=n=>n===1?'1 sessão':n+' sessões';
 const dateLabel=d=>`${d.getDate()} ${MONTHS[d.getMonth()]}`;
 // The fire: the orange sun of the Peleja logo turned into an ember (lit / at risk / out by CSS).
 function flame(state,size=24){
  const span=el('span',{className:'pomo-flame-wrap'});
  span.innerHTML=`<svg class="pomo-flame" data-state="${state}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><g class="pomo-flame-body"><path class="f-o" d="M24 6c1.6 3.6 4.6 5.2 7.6 7.4A14.5 14.5 0 1 1 13 16.3c1.4-1 3-1.8 4.6-2.4-.2 2 .4 3.7 1.6 4.8C19.4 13.6 21 9.4 24 6Z"/><circle class="f-i" cx="24" cy="29" r="6.5"/></g></svg>`;
  return span;
 }

 // ---------- view switch (Timer | Insights) ----------
 const tabs=el('div',{className:'pomo-views',role:'tablist'});tabs.setAttribute('aria-label','Pomodoro');
 for(const [view,label] of [['timer','Timer'],['insights','Insights']]){const b=el('button',{type:'button',textContent:label,id:'pomoView'+label});b.dataset.view=view;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(view==='timer'));tabs.append(b);}
 const panel=el('section',{className:'pomo-insights',id:'pomoInsights'});panel.setAttribute('aria-label','Insights');panel.hidden=true;
 // Top row: Timer | Insights on the left, the fire on the right.
 page.querySelector('.pomo-head').prepend(tabs);page.append(panel);page.dataset.view='timer';
 // Streak on the timer screen too: always in sight while studying.
 const chip=el('button',{type:'button',className:'pomo-streak-chip',id:'pomoStreakChip',onclick:()=>setView('insights')});
 page.querySelector('.pomo-head')?.append(chip);
 let period='week',blocks=[],loaded=false,loading=null,owner=null;
 // Another account on this device: forget the previous member's blocks.
 const checkOwner=()=>{if(owner!==P.user()){owner=P.user();blocks=[];loaded=false;}};
 function setView(view){
  page.dataset.view=view;panel.hidden=view!=='insights';
  for(const b of tabs.children)b.setAttribute('aria-selected',String(b.dataset.view===view));
  if(view==='insights'){draw();load();if(typeof motion==='function')motion(panel,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:200});}
  else drawChip();
 }
 tabs.onclick=e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view);};

 // ---------- data ----------
 async function load(force=false){
  checkOwner();if(!owner)return;
  if(loading)return loading;if(loaded&&!force)return;
  loading=(async()=>{
   const from=addDays(startOfDay(now()),-371).toISOString();
   const r=await Promise.resolve(P.rpc('pomodoro_blocks_mine',{p_from:from})).catch(()=>({error:{}}));
   if(!r.error&&Array.isArray(r.data)&&owner===P.user()){blocks=r.data;loaded=true;}
   loading=null;redraw();
  })();
  return loading;
 }
 const redraw=()=>{if(!panel.hidden)draw();drawChip();};
 const all=()=>{const user=P.user(),seen=new Set(blocks.map(b=>b.id)),pending=P.outbox().filter(b=>!seen.has(b.id)&&(!b.user||b.user===user));return [...blocks,...pending].map(b=>({...b,start:new Date(b.startedAt)}));};
 globalThis.PELEJA_POMODORO_SAVED=()=>{if(loaded)load(true);else redraw();};
 // Load as soon as the Pomodoro page shows, so the streak chip is right from the start.
 new MutationObserver(()=>{if(!page.hidden){checkOwner();drawChip();load();}}).observe(page,{attributes:true,attributeFilter:['hidden']});

 // ---------- numbers ----------
 function stats(list){
  const byDay=new Map();for(const b of list){const k=keyOf(b.start),d=byDay.get(k)||{ms:0,n:0};d.ms+=b.focusMs;d.n++;byDay.set(k,d);}
  // current streak: today counts if it has focus, otherwise it still runs from yesterday until midnight
  const today=startOfDay(now()),litToday=byDay.has(keyOf(today));let day=litToday?today:addDays(today,-1),current=0;
  while(byDay.has(keyOf(day))){current++;day=addDays(day,-1);}
  const keys=[...byDay.keys()].sort();let best=0,run=0,prev=null;
  for(const k of keys){const d=new Date(k+'T12:00');run=prev&&Math.round((d-prev)/DAY)===1?run+1:1;best=Math.max(best,run);prev=d;}
  return {byDay,current,litToday,best:Math.max(best,current),state:litToday?'lit':current?'risk':'out'};
 }
 const PERIODS={week:['7 dias',7],month:['30 dias',30],year:['Ano',365]};
 function periodSummary(list){
  const since=addDays(startOfDay(now()),-(PERIODS[period][1]-1)),inPeriod=list.filter(b=>b.start>=since);
  const total=inPeriod.reduce((s,b)=>s+b.focusMs,0),active=new Set(inPeriod.map(b=>keyOf(b.start))).size;
  const hours=Array(24).fill(0),tasks=new Map();
  for(const b of inPeriod){
   // spread each block over the hours it actually covered
   let t=b.start.getTime(),left=b.focusMs;
   while(left>0){const d=new Date(t),next=new Date(d);next.setMinutes(60,0,0);const part=Math.min(left,next-d);hours[d.getHours()]+=part;left-=part;t+=part;}
   const name=b.task||'Sem tarefa';tasks.set(name,(tasks.get(name)||0)+b.focusMs);
  }
  const peak=total?hours.indexOf(Math.max(...hours)):null;
  return {total,count:inPeriod.length,active,peak,ranked:[...tasks].sort((a,b)=>b[1]-a[1]),flowExtra:inPeriod.reduce((s,b)=>s+(b.flowExtraMs||0),0)};
 }
 // fixed steps for a day: easier to read than relative ones and stable as the year fills
 const dayLevel=ms=>!ms?0:ms<30*60000?1:ms<60*60000?2:ms<120*60000?3:4;

 // ---------- streak ----------
 function drawChip(){
  checkOwner();const s=stats(all());
  chip.dataset.state=s.state;chip.replaceChildren(flame(s.state,18),el('b',{textContent:String(s.current)}));
  chip.setAttribute('aria-label',s.state==='lit'?`Sequência de ${days(s.current)}, acesa hoje`:s.state==='risk'?`Sequência de ${days(s.current)} em risco: foque hoje para manter`:'Sem sequência. Foque hoje para acender');
  chip.title=chip.getAttribute('aria-label');
 }
 function untilMidnight(){const ms=addDays(startOfDay(now()),1)-now(),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60;return h?`${h}h ${pad(m)}min`:`${m} min`;}
 function streakCard(s){
  const next=MILESTONES.find(m=>m>s.current);
  const title=s.state==='lit'?'Fogo aceso!':s.state==='risk'?'Seu fogo está apagando':'Acenda seu fogo';
  const text=s.state==='lit'?(s.current===1?'Primeiro dia. Volta amanhã pra ele crescer.':`Hoje está garantido. Volta amanhã pra chegar a ${days(s.current+1)}.`)
   :s.state==='risk'?`Faça um foco nas próximas ${untilMidnight()} pra não perder ${days(s.current)}.`
   :s.best?`Seu recorde é ${days(s.best)}. Um foco hoje começa uma sequência nova.`:'Um foco de 1 minuto ou mais acende o fogo. Cada dia seguido ele cresce.';
  // the week, Sunday to Saturday, with each day's flame
  const today=startOfDay(now()),first=addDays(today,-today.getDay()),week=el('ol',{className:'pomo-streak-week'});
  for(let i=0;i<7;i++){const d=addDays(first,i),k=keyOf(d),done=s.byDay.has(k),isToday=+d===+today,future=d>today;
   const li=el('li',{},el('span',{textContent:WEEKDAYS[i].slice(0,1)}),done?flame('lit',22):el('i',{className:'pomo-streak-dot'}));
   li.dataset.state=done?'done':isToday?'today':future?'future':'missed';li.title=`${WEEKDAYS[i]} ${dateLabel(d)}: ${done?'com foco':future?'—':isToday?'ainda sem foco':'sem foco'}`;week.append(li);}
  const big=flame(s.state,96);big.classList.add('pomo-streak-flame');
  const card=el('section',{className:'pomo-streak',id:'pomoStreak'},
   el('div',{className:'pomo-streak-top'},big,el('div',{className:'pomo-streak-count'},el('strong',{textContent:String(s.current)}),el('span',{textContent:s.current===1?'dia seguido':'dias seguidos'}))),
   el('div',{className:'pomo-streak-text'},el('h3',{textContent:title}),el('p',{textContent:text})),
   week,
   el('div',{className:'pomo-streak-foot'},s.best?el('span',{},'Recorde ',el('b',{textContent:days(s.best)})):null,next?el('span',{},'Próxima marca ',el('b',{textContent:days(next)}),` · faltam ${next-s.current}`):null),
   s.state!=='lit'?el('button',{type:'button',className:'primary pomo-streak-go',textContent:s.state==='risk'?'Defender o fogo agora':'Começar um foco',onclick:()=>setView('timer')}):null);
  card.dataset.state=s.state;return card;
 }

 // ---------- drawing ----------
 function tile(label,value,note){return el('div',{className:'pomo-tile'},el('span',{textContent:label}),el('strong',{textContent:value}),note?el('small',{textContent:note}):null);}
 function card(title,...children){return el('section',{className:'pomo-card'},el('h3',{textContent:title}),...children);}
 function draw(){
  checkOwner();
  const list=all(),st=stats(list),s=periodSummary(list);drawChip();
  const head=el('div',{className:'pomo-insights-head'},el('h2',{textContent:'Seu foco'}),el('p',{textContent:loaded||!P.user()?'Tudo o que você focou com o Pomodoro.':'Carregando seus focos…'}));
  if(!list.length){panel.replaceChildren(head,streakCard(st));return;}
  const switcher=el('div',{className:'pomo-period',role:'group'});switcher.setAttribute('aria-label','Período');
  for(const [key,[label]] of Object.entries(PERIODS)){const b=el('button',{type:'button',textContent:label,onclick:()=>{period=key;draw();}});b.setAttribute('aria-pressed',String(key===period));switcher.append(b);}
  const tiles=el('div',{className:'pomo-tiles'},
   tile('Foco total',s.total?dur(s.total):'0 min',s.active?`${days(s.active)} com foco`:'Sem foco no período'),
   tile('Média por dia',s.active?dur(s.total/s.active):'—',s.active?`nos ${days(s.active)} com foco`:null),
   tile('Sessões',String(s.count),s.flowExtra?`+${dur(s.flowExtra)} no flow`:null),
   tile('Horário de pico',s.peak==null?'—':`${pad(s.peak)}h`,s.peak==null?null:`entre ${pad(s.peak)}h e ${pad((s.peak+1)%24)}h`));
  panel.replaceChildren(head,streakCard(st),lastWeekCard(st.byDay),el('div',{className:'pomo-period-row'},el('h3',{textContent:'Resumo'}),switcher),tiles,tasksCard(s),yearCard(st.byDay));
  // on narrow screens the year scrolls: start at the most recent weeks
  const scroll=panel.querySelector('.pomo-year-scroll');if(scroll)scroll.scrollLeft=scroll.scrollWidth;
 }
 // Last 7 days, one column each, today on the right with yesterday's mark to beat.
 function lastWeekCard(byDay){
  const today=startOfDay(now()),list=[];for(let i=6;i>=0;i--){const d=addDays(today,-i);list.push({d,ms:byDay.get(keyOf(d))?.ms||0});}
  const max=Math.max(...list.map(x=>x.ms),60*60000),[yesterday,todayMs]=[list[5].ms,list[6].ms];
  const chart=el('ol',{className:'pomo-days'});
  list.forEach(({d,ms},i)=>{
   const isToday=i===6,col=el('li',{},el('span',{className:'pomo-days-value',textContent:short(ms)}),el('span',{className:'pomo-days-track'},el('i')),el('span',{className:'pomo-days-label',textContent:isToday?'Hoje':WEEKDAYS[d.getDay()]}));
   col.querySelector('i').style.height=(ms?Math.max(4,ms/max*100):0)+'%';col.dataset.today=String(isToday);col.title=`${isToday?'Hoje':WEEKDAYS[d.getDay()]+' '+dateLabel(d)}: ${ms?dur(ms):'sem foco'}`;
   if(isToday&&yesterday){const mark=el('b',{className:'pomo-days-mark',title:'Ontem: '+dur(yesterday)});mark.style.bottom=(yesterday/max*100)+'%';col.querySelector('.pomo-days-track').append(mark);}
   chart.append(col);
  });
  const diff=todayMs-yesterday;
  const text=!todayMs&&!yesterday?'Comece hoje e faça a coluna de hoje subir.':!todayMs?`Ontem foram ${dur(yesterday)}. Bora igualar?`:!yesterday?`Ontem ficou zerado, hoje já tem ${dur(todayMs)}. Segue!`:diff>=0?`Você já passou de ontem (+${dur(diff)}). Cada minuto a mais conta.`:`Faltam ${dur(-diff)} para igualar ontem (${dur(yesterday)}).`;
  const week=list.reduce((a,x)=>a+x.ms,0);
  chart.setAttribute('aria-label',list.map(({d,ms},i)=>`${i===6?'hoje':WEEKDAYS[d.getDay()]}: ${ms?dur(ms):'sem foco'}`).join('; '));
  return el('section',{className:'pomo-card'},el('div',{className:'pomo-card-head'},el('h3',{textContent:'Últimos 7 dias'}),el('span',{textContent:dur(week)})),el('p',{className:'pomo-card-note pomo-beat',textContent:text}),chart);
 }
 function yearCard(byDay){
  // One column per week (Sunday on top), from the week of the first focus to the current one: few weeks
  // means big squares; it scrolls sideways once the history is longer than the card.
  const today=startOfDay(now()),end=addDays(today,6-today.getDay());
  const first=[...byDay.keys()].sort()[0],firstDay=first?new Date(first+'T12:00'):today;
  const weeks=Math.min(53,Math.max(10,Math.ceil((end-startOfDay(firstDay))/DAY/7)+1)),start=addDays(end,-(weeks*7-1));
  const grid=el('div',{className:'pomo-year-grid',role:'img'}),months=el('div',{className:'pomo-year-months','aria-hidden':'true'});
  grid.style.setProperty('--weeks',weeks);months.style.setProperty('--weeks',weeks);
  let total=0,active=0,lastMonth=-1;
  for(let i=0;i<weeks*7;i++){
   const d=addDays(start,i),info=byDay.get(keyOf(d)),future=d>today,cell=el('span',{textContent:String(d.getDate())});
   cell.dataset.level=future?'future':String(dayLevel(info?.ms));
   if(!future){cell.dataset.day=keyOf(d);if(info){total+=info.ms;active++;}}
   if(+d===+today)cell.dataset.today='true';
   if(i%7===0&&d.getMonth()!==lastMonth&&(d.getDate()<=7||i===0)){lastMonth=d.getMonth();const m=el('span',{textContent:MONTHS[d.getMonth()]});m.style.gridColumn=String(i/7+1);months.append(m);}
   grid.append(cell);
  }
  grid.setAttribute('aria-label',`Foco por dia nas últimas ${weeks} semanas: ${days(active)} com foco, ${dur(total)} no total.`);
  const labels=el('div',{className:'pomo-year-days','aria-hidden':'true'},...WEEKDAYS.map(w=>el('span',{textContent:w[0]})));
  const legend=el('div',{className:'pomo-legend','aria-hidden':'true'},'Menos',...[0,1,2,3,4].map(l=>{const s=el('span');s.dataset.level=String(l);return s;}),'Mais');
  const scroll=el('div',{className:'pomo-year-scroll'},el('div',{className:'pomo-year'},el('span'),months,labels,grid));
  const box=card('Seu ano',scroll,el('div',{className:'pomo-year-foot'},legend));box.classList.add('pomo-year-card');
  // The day's total in a small balloon over the square: hover with a mouse, a tap shows it for 3 s.
  const tip=el('div',{className:'pomo-day-tip',id:'pomoDayTip',hidden:true,role:'status'});box.append(tip);
  let tipTimer=0,lastPointer='',selfScroll=0;
  const hide=()=>{clearTimeout(tipTimer);tip.hidden=true;grid.querySelector('[aria-current]')?.removeAttribute('aria-current');};
  const show=(c,ms)=>{
   const k=c.dataset.day,info=byDay.get(k),d=new Date(k+'T12:00');
   tip.replaceChildren(el('span',{textContent:`${WEEKDAYS[d.getDay()]}, ${dateLabel(d)}`}),el('strong',{textContent:info?dur(info.ms):'sem foco'}),info?el('small',{textContent:sessions(info.n)}):'');
   grid.querySelector('[aria-current]')?.removeAttribute('aria-current');c.setAttribute('aria-current','true');
   tip.hidden=false;
   // a day at the edge: scroll just enough to see it whole (ring included) before placing the balloon
   const sr=scroll.getBoundingClientRect(),cr=c.getBoundingClientRect();
   selfScroll=Date.now()+400;if(cr.right+8>sr.right)scroll.scrollLeft+=cr.right+8-sr.right;else if(cr.left-8<sr.left+26)scroll.scrollLeft-=sr.left+26-(cr.left-8);
   const r=c.getBoundingClientRect(),b=box.getBoundingClientRect(),half=(tip.offsetWidth||120)/2;
   tip.style.left=Math.max(half+8,Math.min(b.width-half-8,r.left-b.left+r.width/2))+'px';tip.style.top=(r.top-b.top-8)+'px';
   clearTimeout(tipTimer);if(ms)tipTimer=setTimeout(hide,ms);
  };
  grid.addEventListener('pointerdown',e=>{lastPointer=e.pointerType;});
  grid.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const c=e.target.closest('[data-day]');if(c)show(c,0);});
  grid.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')hide();});
  grid.onclick=e=>{const c=e.target.closest('[data-day]');if(c&&lastPointer!=='mouse')show(c,3000);lastPointer='';};
  scroll.addEventListener('scroll',()=>{if(Date.now()>selfScroll)hide();},{passive:true});
  return box;
 }
 function tasksCard(s){
  if(!s.ranked.length)return card('Tarefas',el('p',{className:'pomo-card-note',textContent:'Sem foco no período.'}));
  const top=s.ranked.slice(0,5),rest=s.ranked.slice(5).reduce((a,[,ms])=>a+ms,0);if(rest)top.push(['Outras',rest]);
  const list=el('ol',{className:'pomo-tasks'});
  for(const [name,ms] of top){const share=ms/s.total,bar=el('i');bar.style.width=Math.max(2,share*100)+'%';list.append(el('li',{},el('div',{},el('span',{textContent:name}),el('b',{textContent:`${dur(ms)} · ${Math.round(share*100)}%`})),el('span',{className:'pomo-bar'},bar)));}
  return card('Tarefas',el('p',{className:'pomo-card-note',textContent:`Principal: ${s.ranked[0][0]}`}),list);
 }
 // the fire may go out at midnight while the page stays open
 let dayShown=keyOf(new Date(now()));
 setInterval(()=>{if(page.hidden)return;const k=keyOf(new Date(now()));if(k!==dayShown){dayShown=k;redraw();return;}drawChip();const old=panel.querySelector('#pomoStreak');if(old&&!panel.hidden&&old.dataset.state==='risk')old.replaceWith(streakCard(stats(all())));},60000);
 drawChip();
 globalThis.PELEJA_POMODORO_INSIGHTS={setView,load,reset(){blocks=[];loaded=false;}};
})();
