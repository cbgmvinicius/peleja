// Pomodoro Insights: the member's focus profile, built from their own blocks (pomodoro_blocks_mine)
// plus the ones still waiting on the device. Streaks, totals per period, the year in days,
// the week in hours and where the time went by task.
(()=>{
 const P=globalThis.PELEJA_POMODORO;if(!P)return;
 const page=P.page,now=()=>globalThis.PELEJA_NOW?.()??Date.now();
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children.filter(c=>c!=null&&c!==false));return n;};
 const DAY=86400000,WEEKDAYS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 const MONTHS=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
 const pad=n=>String(n).padStart(2,'0');
 const keyOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const startOfDay=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d;};
 const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
 const dur=ms=>{const m=Math.round(ms/60000);if(m<60)return m+' min';const h=Math.floor(m/60),r=m%60;return r?`${h}h ${r}min`:`${h}h`;};
 const sessions=n=>n===1?'1 sessão':n+' sessões';
 const dateLabel=d=>`${d.getDate()} ${MONTHS[d.getMonth()]}`;

 // ---------- view switch (Timer | Insights) ----------
 const tabs=el('div',{className:'pomo-views',role:'tablist'});tabs.setAttribute('aria-label','Pomodoro');
 for(const [view,label] of [['timer','Timer'],['insights','Insights']]){const b=el('button',{type:'button',textContent:label,id:'pomoView'+label});b.dataset.view=view;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(view==='timer'));tabs.append(b);}
 const panel=el('section',{className:'pomo-insights',id:'pomoInsights'});panel.setAttribute('aria-label','Insights');panel.hidden=true;
 page.prepend(tabs);page.append(panel);page.dataset.view='timer';
 let period='week',blocks=[],loaded=false,loading=null,selectedDay=null,owner=null;
 // Another account on this device: forget the previous member's blocks.
 const checkOwner=()=>{if(owner!==P.user()){owner=P.user();blocks=[];loaded=false;selectedDay=null;}};
 function setView(view){
  page.dataset.view=view;panel.hidden=view!=='insights';
  for(const b of tabs.children)b.setAttribute('aria-selected',String(b.dataset.view===view));
  if(view==='insights'){draw();load();if(typeof motion==='function')motion(panel,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:200});}
 }
 tabs.onclick=e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view);};

 // ---------- data ----------
 async function load(force=false){
  checkOwner();if(!owner)return;
  if(loading)return loading;if(loaded&&!force)return;
  loading=(async()=>{
   const from=addDays(startOfDay(now()),-371).toISOString();
   const r=await P.rpc('pomodoro_blocks_mine',{p_from:from}).catch(()=>({error:{}}));
   if(!r.error&&Array.isArray(r.data)&&owner===P.user()){blocks=r.data;loaded=true;}
   loading=null;if(!panel.hidden)draw();
  })();
  return loading;
 }
 const all=()=>{const user=P.user(),seen=new Set(blocks.map(b=>b.id)),pending=P.outbox().filter(b=>!seen.has(b.id)&&(!b.user||b.user===user));return [...blocks,...pending].map(b=>({...b,start:new Date(b.startedAt)}));};
 globalThis.PELEJA_POMODORO_SAVED=()=>{if(loaded)load(true);else if(!panel.hidden)draw();};

 // ---------- numbers ----------
 function stats(list){
  const byDay=new Map();for(const b of list){const k=keyOf(b.start),d=byDay.get(k)||{ms:0,n:0};d.ms+=b.focusMs;d.n++;byDay.set(k,d);}
  // current streak: today counts if it has focus, otherwise it still runs from yesterday
  const today=startOfDay(now());let day=byDay.has(keyOf(today))?today:addDays(today,-1),current=0;
  while(byDay.has(keyOf(day))){current++;day=addDays(day,-1);}
  const keys=[...byDay.keys()].sort();let best=0,run=0,prev=null;
  for(const k of keys){const d=new Date(k+'T12:00');run=prev&&Math.round((d-prev)/DAY)===1?run+1:1;best=Math.max(best,run);prev=d;}
  return {byDay,current,best:Math.max(best,current)};
 }
 const PERIODS={week:['Semana',7],month:['Mês',30],year:['Ano',365]};
 function periodSummary(list){
  const since=addDays(startOfDay(now()),-(PERIODS[period][1]-1)),inPeriod=list.filter(b=>b.start>=since);
  const total=inPeriod.reduce((s,b)=>s+b.focusMs,0),days=new Set(inPeriod.map(b=>keyOf(b.start))).size;
  const hours=Array(24).fill(0),grid=Array.from({length:7},()=>Array(24).fill(0)),tasks=new Map();
  for(const b of inPeriod){
   // spread each block over the hours it actually covered
   let t=b.start.getTime(),left=b.focusMs;
   while(left>0){const d=new Date(t),next=new Date(d);next.setMinutes(60,0,0);const part=Math.min(left,next-d);hours[d.getHours()]+=part;grid[d.getDay()][d.getHours()]+=part;left-=part;t+=part;}
   const name=b.task||'Sem tarefa';tasks.set(name,(tasks.get(name)||0)+b.focusMs);
  }
  const peak=total?hours.indexOf(Math.max(...hours)):null;
  const ranked=[...tasks].sort((a,b)=>b[1]-a[1]);
  return {total,count:inPeriod.length,days,peak,grid,ranked,flowExtra:inPeriod.reduce((s,b)=>s+(b.flowExtraMs||0),0)};
 }
 // fixed steps for a day: easier to read than relative ones and stable as the year fills
 const dayLevel=ms=>!ms?0:ms<30*60000?1:ms<60*60000?2:ms<120*60000?3:4;

 // ---------- drawing ----------
 function tile(label,value,note){return el('div',{className:'pomo-tile'},el('span',{textContent:label}),el('strong',{textContent:value}),note?el('small',{textContent:note}):null);}
 function card(title,...children){return el('section',{className:'pomo-card'},el('h3',{textContent:title}),...children);}
 function draw(){
  checkOwner();
  const list=all(),{byDay,current,best}=stats(list),s=periodSummary(list);
  const switcher=el('div',{className:'pomo-period',role:'group'});switcher.setAttribute('aria-label','Período');
  for(const [key,[label]] of Object.entries(PERIODS)){const b=el('button',{type:'button',textContent:label,onclick:()=>{period=key;draw();}});b.setAttribute('aria-pressed',String(key===period));switcher.append(b);}
  const head=el('div',{className:'pomo-insights-head'},el('div',{},el('h2',{textContent:'Seu foco'}),el('p',{textContent:loaded||!P.user()?'Tudo o que você focou com o Pomodoro.':'Carregando seus focos…'})),switcher);
  if(!list.length){switcher.hidden=true;panel.replaceChildren(head,el('div',{className:'pomo-empty'},el('strong',{textContent:'Nada por aqui ainda'}),el('p',{textContent:'Cada foco de 1 minuto ou mais aparece aqui: sequência de dias, horários e tarefas.'}),el('button',{type:'button',className:'primary',textContent:'Ir para o timer',onclick:()=>setView('timer')})));return;}
  const avg=s.days?s.total/s.days:0;
  const tiles=el('div',{className:'pomo-tiles'},
   tile('Foco total',s.total?dur(s.total):'0 min',s.days?`${s.days} ${s.days===1?'dia':'dias'} · média ${dur(avg)}/dia`:'Sem foco no período'),
   tile('Sessões',String(s.count),s.flowExtra?`+${dur(s.flowExtra)} no flow`:null),
   tile('Sequência',current===1?'1 dia':current+' dias',`Melhor: ${best===1?'1 dia':best+' dias'}`),
   tile('Horário de pico',s.peak==null?'—':`${pad(s.peak)}h`,s.peak==null?null:`entre ${pad(s.peak)}h e ${pad((s.peak+1)%24)}h`));
  panel.replaceChildren(head,tiles,yearCard(byDay),weekCard(s),tasksCard(s));
  // on narrow screens the year scrolls: start at the most recent weeks
  const scroll=panel.querySelector('.pomo-year-scroll');if(scroll)scroll.scrollLeft=scroll.scrollWidth;
 }
 function yearCard(byDay){
  // 53 columns of weeks (Sunday on top), ending with the current week
  const today=startOfDay(now()),end=addDays(today,6-today.getDay()),start=addDays(end,-(53*7-1));
  const grid=el('div',{className:'pomo-year-grid',role:'img'}),months=el('div',{className:'pomo-year-months','aria-hidden':'true'});
  let total=0,active=0,lastMonth=-1;
  for(let i=0;i<53*7;i++){
   const d=addDays(start,i),info=byDay.get(keyOf(d)),future=d>today,cell=el('span');
   cell.dataset.level=future?'future':String(dayLevel(info?.ms));
   if(!future){cell.title=`${dateLabel(d)} · ${info?dur(info.ms)+' · '+sessions(info.n):'sem foco'}`;cell.dataset.day=keyOf(d);if(info){total+=info.ms;active++;}}
   if(i%7===0&&d.getMonth()!==lastMonth&&d.getDate()<=7){lastMonth=d.getMonth();const m=el('span',{textContent:MONTHS[d.getMonth()]});m.style.gridColumn=String(i/7+1);months.append(m);}
   grid.append(cell);
  }
  grid.setAttribute('aria-label',`Foco por dia nas últimas 53 semanas: ${active} dias com foco, ${dur(total)} no total.`);
  const detail=el('p',{className:'pomo-day-detail',id:'pomoDayDetail'});
  const show=k=>{const info=byDay.get(k),d=new Date(k+'T12:00');detail.replaceChildren(el('strong',{textContent:dateLabel(d)+' · '}),info?`${dur(info.ms)} de foco em ${sessions(info.n)}`:'sem foco');for(const c of grid.querySelectorAll('[aria-current]'))c.removeAttribute('aria-current');grid.querySelector(`[data-day="${k}"]`)?.setAttribute('aria-current','true');};
  grid.onclick=e=>{const c=e.target.closest('[data-day]');if(c){selectedDay=c.dataset.day;show(selectedDay);}};
  show(selectedDay&&byDay.has(selectedDay)?selectedDay:keyOf(today));
  const legend=el('div',{className:'pomo-legend','aria-hidden':'true'},'Menos',...[0,1,2,3,4].map(l=>{const s=el('span');s.dataset.level=String(l);return s;}),'Mais');
  const labels=el('div',{className:'pomo-year-days','aria-hidden':'true'},...WEEKDAYS.map((w,i)=>el('span',{textContent:i%2?w:''})));
  return card('Seu ano',el('div',{className:'pomo-year-scroll'},el('div',{className:'pomo-year'},el('span'),months,labels,grid)),el('div',{className:'pomo-year-foot'},detail,legend));
 }
 function weekCard(s){
  const max=Math.max(...s.grid.flat());
  const grid=el('div',{className:'pomo-week-grid',role:'img'});
  grid.setAttribute('aria-label',s.peak==null?'Sem foco no período.':`Foco por dia da semana e hora. Pico às ${pad(s.peak)}h.`);
  grid.append(el('span'));for(let h=0;h<24;h++)grid.append(el('span',{className:'pomo-hour',textContent:h%6===0?pad(h)+'h':''}));
  for(let d=0;d<7;d++){
   grid.append(el('span',{className:'pomo-wd',textContent:WEEKDAYS[d]}));
   for(let h=0;h<24;h++){const v=s.grid[d][h],c=el('span',{className:'pomo-slot'});c.dataset.level=String(!v?0:Math.min(4,1+Math.floor(v/max*3.999)));c.title=`${WEEKDAYS[d]}, ${pad(h)}h · ${v?dur(v):'sem foco'}`;grid.append(c);}
  }
  return card('Sua semana',el('p',{className:'pomo-card-note',textContent:`Em que dias e horários você mais focou (${PERIODS[period][0].toLowerCase()}).`}),el('div',{className:'pomo-week-scroll'},grid));
 }
 function tasksCard(s){
  if(!s.ranked.length)return card('Tarefas',el('p',{className:'pomo-card-note',textContent:'Sem foco no período.'}));
  const top=s.ranked.slice(0,5),rest=s.ranked.slice(5).reduce((a,[,ms])=>a+ms,0);if(rest)top.push(['Outras',rest]);
  const list=el('ol',{className:'pomo-tasks'});
  for(const [name,ms] of top){const share=ms/s.total,bar=el('i');bar.style.width=Math.max(2,share*100)+'%';list.append(el('li',{},el('div',{},el('span',{textContent:name}),el('b',{textContent:`${dur(ms)} · ${Math.round(share*100)}%`})),el('span',{className:'pomo-bar'},bar)));}
  return card('Tarefas',el('p',{className:'pomo-card-note',textContent:`Principal: ${s.ranked[0][0]}`}),list);
 }
 // After logout nothing of the previous member stays on screen.
 const detach=P.detach;P.detach=()=>{detach();blocks=[];loaded=false;selectedDay=null;setView('timer');};
 globalThis.PELEJA_POMODORO_INSIGHTS={setView,load,reset(){blocks=[];loaded=false;}};
})();
