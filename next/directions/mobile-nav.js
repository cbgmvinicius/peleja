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
 bar.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-more')){sheet.hidden?openSheet():closeSheet();return;}closeSheet();document.getElementById(b.dataset.target)?.click();toTop();});
 sheet.addEventListener('click',event=>{if(event.target.closest('[data-close]')){closeSheet();return;}const b=event.target.closest('button');if(!b)return;closeSheet();if(b.hasAttribute('data-settings'))document.getElementById('profileSettings')?.click();else{document.getElementById(b.dataset.target)?.click();toTop();}});
 addEventListener('keydown',event=>{if(event.key==='Escape')closeSheet();});
 // Mirror the active section of the header navigation.
 function sync(){
  const active=[...tabs,...more].find(([, ,id])=>document.getElementById(id)?.classList.contains('selected'))?.[2];
  for(const b of bar.querySelectorAll('[data-target]'))b.setAttribute('aria-current',String(b.dataset.target===active));
  bar.querySelector('[data-more]').classList.toggle('is-active',more.some(([, ,id])=>id===active));
 }
 new MutationObserver(sync).observe(document.querySelector('.app header nav'),{attributes:true,subtree:true,attributeFilter:['class']});sync();
})();
