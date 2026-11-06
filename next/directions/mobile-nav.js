// Phone navigation: a bottom tab bar (Painel, Biblioteca, Provas, Pomodoro, Mais) driving the same
// header buttons the desktop uses; "Mais" opens a sheet with the remaining sections and settings.
(()=>{
 const svgOf=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
 const ICONS={
  painel:'<path d="M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5h-6v5H5.5A1.5 1.5 0 0 1 4 19Z"/>',
  biblioteca:'<path d="M5 4.5h4v15H5zM10.5 4.5h4v15h-4zM16 5.2l3.6-.9 3 14.4-3.6.8z"/>',
  provas:'<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16M8.5 14h3"/>',
  simulados:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  pomodoro:'<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2.2 1.6M10 3.5h4M18.5 6.5l1.5-1.5"/>',
  mais:'<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  ranking:'<path d="M5 20V12M12 20V5M19 20v-9"/>',
  cursos:'<path d="M4 7.5 12 4l8 3.5-8 3.5Z"/><path d="M7 9.5V14c3 2.4 7 2.4 10 0V9.5M20 7.5v6"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>'
 };
 const tabs=[['painel','Painel','navDashboard'],['biblioteca','Biblioteca','navLibrary'],['provas','Provas','navFaculty'],['pomodoro','Pomodoro','navPomodoro']];
 const more=[['simulados','Simulados','navMocks'],['ranking','Ranking','navPerformance'],['cursos','Cursos extras','navCourses']];
 const bar=document.createElement('nav');bar.className='mobile-tabs';bar.setAttribute('aria-label','Seções');
 bar.innerHTML=tabs.map(([key,label,target])=>`<button type="button" data-target="${target}">${svgOf(ICONS[key])}<span>${label}</span></button>`).join('')+`<button type="button" data-more aria-haspopup="dialog" aria-expanded="false">${svgOf(ICONS.mais)}<span>Mais</span></button>`;
 const sheet=document.createElement('div');sheet.className='mobile-sheet';sheet.hidden=true;
 sheet.innerHTML=`<div class="mobile-sheet-backdrop" data-close></div><div class="mobile-sheet-panel" role="dialog" aria-modal="true" aria-label="Mais seções"><span class="mobile-sheet-handle" aria-hidden="true"></span>${more.map(([key,label,target])=>`<button type="button" data-target="${target}">${svgOf(ICONS[key])}<span>${label}</span></button>`).join('')}<hr><button type="button" data-settings>${svgOf(ICONS.settings)}<span>Configurações</span></button></div>`;
 app.append(bar,sheet);
 const toTop=()=>{try{document.scrollingElement?.scrollTo?.({top:0});}catch{}};
 function openSheet(){sheet.hidden=false;bar.querySelector('[data-more]').setAttribute('aria-expanded','true');const panel=sheet.querySelector('.mobile-sheet-panel');motion(panel,[{transform:'translateY(100%)'},{transform:'none'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});motion(sheet.querySelector('.mobile-sheet-backdrop'),[{opacity:0},{opacity:1}],{duration:200});panel.querySelector('button').focus();}
 function closeSheet(){if(sheet.hidden)return;bar.querySelector('[data-more]').setAttribute('aria-expanded','false');const out=motion(sheet.querySelector('.mobile-sheet-panel'),[{transform:'none'},{transform:'translateY(100%)'}],{duration:200,easing:'cubic-bezier(.4,0,1,1)'});motion(sheet.querySelector('.mobile-sheet-backdrop'),[{opacity:1},{opacity:0}],{duration:200});if(out)out.onfinish=()=>{sheet.hidden=true;};else sheet.hidden=true;}
 bar.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-more')){sheet.hidden?openSheet():closeSheet();return;}closeSheet();slideTo(b.dataset.target);});
 sheet.addEventListener('click',event=>{if(event.target.closest('[data-close]')){closeSheet();return;}const b=event.target.closest('button');if(!b)return;closeSheet();if(b.hasAttribute('data-settings'))document.getElementById('profileSettings')?.click();else{document.getElementById(b.dataset.target)?.click();toTop();}});
 addEventListener('keydown',event=>{if(event.key==='Escape')closeSheet();});
 // Mirror the active section of the header navigation.
 function sync(){
  const active=[...tabs,...more].find(([, ,id])=>document.getElementById(id)?.classList.contains('selected'))?.[2];
  for(const b of bar.querySelectorAll('[data-target]'))b.setAttribute('aria-current',String(b.dataset.target===active));
  bar.querySelector('[data-more]').classList.toggle('is-active',more.some(([, ,id])=>id===active));
 }
 new MutationObserver(sync).observe(document.querySelector('.app header nav'),{attributes:true,subtree:true,attributeFilter:['class']});sync();


 // Swipe between the bar's sections like a phone pager: while dragging, the next (or previous) section
 // sits right beside the current one and follows the finger; letting go finishes the move or springs back.
 const order=tabs.map(([, ,id])=>id),main=document.querySelector('.app main');
 const PAGES={navDashboard:'dashboardPage',navLibrary:'libraryPage',navFaculty:'facultyPage',navPomodoro:'pomodoroPage'};
 const pageOf=navId=>document.getElementById(PAGES[navId]);
 const phone=()=>globalThis.matchMedia?.('(max-width:760px)')?.matches;
 const currentIndex=()=>order.findIndex(id=>document.getElementById(id)?.classList.contains('selected'));
 const still=()=>document.documentElement.dataset.pelejaMotion==='off'||!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 const EASE='cubic-bezier(.22,1,.36,1)';
 // Tapping the bar: the new section slides in from the side it lives on.
 function slideTo(id){
  const from=currentIndex(),to=order.indexOf(id);
  document.getElementById(id)?.click();toTop();
  const page=pageOf(id);
  if(!page||still()||from<0||to<0||from===to)return;
  const w=main.clientWidth||360;
  motion(page,[{transform:`translateX(${(to>from?1:-1)*w*.35}px)`,opacity:.4},{transform:'none',opacity:1}],{duration:260,easing:EASE});
 }
 // Horizontal drags only, and never on things that scroll or slide sideways by themselves.
 const ignore=target=>{
  if(document.querySelector('dialog[open]')||!sheet.hidden)return true;
  for(let n=target;n&&n!==main;n=n.parentElement){
   if(n.matches?.('input,textarea,select,[contenteditable=true],.sliding-tabs,.pomo-views,.pomo-period,input[type=range]'))return true;
   if(n.scrollWidth>n.clientWidth+4&&/(auto|scroll)/.test(getComputedStyle(n).overflowX))return true;
  }
  return false;
 };
 let drag=null;
 function peek(page,cur){
  if(!page)return null;
  page.classList.add('page-peek');
  // same box as the current section (left/right, so centred pages with a max width stay centred)
  Object.assign(page.style,{top:cur.offsetTop+'px',left:cur.offsetLeft+'px',right:(main.clientWidth-cur.offsetLeft-cur.offsetWidth)+'px'});
  return page;
 }
 function place(dx){
  const {cur,prev,next,w}=drag;
  cur.style.transform=`translateX(${dx}px)`;
  if(prev)prev.style.transform=`translateX(${dx-w}px)`;
  if(next)next.style.transform=`translateX(${dx+w}px)`;
 }
 function cleanup(d){
  main.classList.remove('pager-dragging');
  for(const el of [d.cur,d.prev,d.next])if(el){el.classList.remove('page-peek');el.style.transform='';el.style.top=el.style.left=el.style.right='';el.style.transition='';}
 }
 function settle(d,from,to,done){
  if(still()){done();return;}
  const els=[d.cur,d.prev,d.next].filter(Boolean),off={cur:0,prev:-d.w,next:d.w};
  let left=els.length;const finish=()=>{if(--left===0)done();};
  for(const [key,el] of [['cur',d.cur],['prev',d.prev],['next',d.next]]){
   if(!el)continue;
   const a=el.animate?.([{transform:`translateX(${from+off[key]}px)`},{transform:`translateX(${to+off[key]}px)`}],{duration:240,easing:EASE,fill:'forwards'});
   if(a){a.onfinish=()=>{a.cancel?.();finish();};}else finish();
  }
 }
 main?.addEventListener('touchstart',e=>{
  if(!phone()||e.touches.length!==1||drag?.settling||ignore(e.target)){if(!drag?.settling)drag=null;return;}
  const t=e.touches[0];drag={x:t.clientX,y:t.clientY,t:Date.now(),dx:0,axis:null};
 },{passive:true});
 main?.addEventListener('touchmove',e=>{
  if(!drag||drag.settling)return;const t=e.touches[0],dx=t.clientX-drag.x,dy=t.clientY-drag.y;
  if(!drag.axis&&Math.hypot(dx,dy)>10){
   drag.axis=Math.abs(dx)>Math.abs(dy)*1.3?'x':'y';
   if(drag.axis==='x'){
    const i=currentIndex(),cur=pageOf(order[i]);
    if(i<0||!cur||still()){drag.axis='y';return;}
    main.classList.add('pager-dragging');
    Object.assign(drag,{i,cur,w:main.clientWidth||cur.offsetWidth,prev:peek(pageOf(order[i-1]),cur),next:peek(pageOf(order[i+1]),cur)});
   }
  }
  if(drag.axis!=='x')return;
  // past the first or last section the page resists, like a rubber band
  const edge=(dx>0&&!drag.prev)||(dx<0&&!drag.next);
  drag.dx=edge?dx*.25:dx;place(drag.dx);
 },{passive:true});
 function end(){
  if(!drag||drag.settling)return;const d=drag;if(d.axis!=='x'){drag=null;return;}
  const speed=Math.abs(d.dx)/Math.max(1,Date.now()-d.t),target=d.dx<0?d.next:d.prev;
  const go=target&&(Math.abs(d.dx)>d.w*.28||(speed>.45&&Math.abs(d.dx)>30));
  d.settling=true;
  if(go){
   const navId=order[d.i+(d.dx<0?1:-1)];
   settle(d,d.dx,d.dx<0?-d.w:d.w,()=>{cleanup(d);drag=null;document.getElementById(navId)?.click();toTop();});
  }else settle(d,d.dx,0,()=>{cleanup(d);drag=null;});
 }
 main?.addEventListener('touchend',end);
 main?.addEventListener('touchcancel',()=>{if(drag&&drag.axis==='x'&&!drag.settling){drag.dx=0;end();}else drag=null;});
 globalThis.PELEJA_MOBILE_NAV={slideTo,order};
})();
