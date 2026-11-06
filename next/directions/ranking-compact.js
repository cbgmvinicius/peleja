// Every ranking starts compact: the top 3 plus whoever is right above and right below you,
// with "⋯" where rows are skipped and a "Ver todos (N)" button. Applies to the Painel comparison,
// the Ranking page table and each simulado's classification (the Pomodoro ranking does it itself).
(()=>{
 const LISTS=[['#dashboardRanking .dashboard-ranking','li'],['#rankingContent .ranking-table tbody','tr'],['.mock-comparison ol','li']];
 const expanded=new Set();
 const keyOf=(list,sel)=>sel+'|'+(list.closest('[id]')?.id||'');
 function compact(list,rowSel,sel){
  list.dataset.compacted='1';
  list._rankMore?.remove();
  for(const g of list.querySelectorAll(':scope > .rank-gap'))g.remove();
  const rows=[...list.querySelectorAll(`:scope > ${rowSel}`)];
  for(const r of rows)r.classList.remove('rank-hidden');
  const me=rows.findIndex(r=>r.classList.contains('is-me')),keep=new Set([0,1,2,me-1,me,me+1].filter(i=>i>=0&&i<rows.length));
  if(rows.length<=keep.size)return;
  const key=keyOf(list,sel),open=expanded.has(key);
  if(!open){
   rows.forEach((r,i)=>{
    if(keep.has(i))return;
    r.classList.add('rank-hidden');
    if(i===0||keep.has(i-1)){const gap=document.createElement(rowSel);gap.className='rank-gap';gap.setAttribute('aria-hidden','true');
     if(rowSel==='tr'){const td=document.createElement('td');td.colSpan=r.children.length||1;td.textContent='⋯';gap.append(td);}else gap.textContent='⋯';
     r.before(gap);}
   });
  }
  const more=document.createElement('button');more.type='button';more.className='rank-more';
  more.textContent=open?'Mostrar menos':`Ver todos (${rows.length})`;
  more.onclick=()=>{open?expanded.delete(key):expanded.add(key);compact(list,rowSel,sel);};
  (list.closest('.ranking-table-wrap')||list).after(more);list._rankMore=more;
 }
 function scan(){for(const [sel,row] of LISTS)for(const list of document.querySelectorAll(sel))if(!list.dataset.compacted)compact(list,row,sel);}
 let queued=false;
 const main=document.querySelector('.app main')||document.body;
 new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();markPrivacy();});}).observe(main,{childList:true,subtree:true});
 // A small mark on your own row when the others see you as "Anônimo" or not at all.
 const MARK={anonymous:['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11h18M6 11l1.5-5h9L18 11"/><circle cx="7.5" cy="16" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/><path d="M10 16h4"/></svg>','Para os outros, você aparece como Anônimo'],
  hidden:['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.7 3.3M6.6 6.6C4.3 8.1 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4.4-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>','Você não aparece nos rankings dos outros']};
 let markPrivacy=function(){
  const mode=globalThis.PELEJA_MY_PRIVACY,mark=MARK[mode];
  for(const row of document.querySelectorAll('.app main .is-me')){
   const old=row.querySelector('.rank-privacy');if(old&&old.dataset.mode===mode)continue; // already right: no change, no loop
   old?.remove();if(!mark)continue;
   const where=row.querySelector('.pomo-you,.ranking-person small,small');if(!where)continue;
   const tag=document.createElement('span');tag.className='rank-privacy';tag.dataset.mode=mode;tag.title=mark[1];tag.setAttribute('role','img');tag.setAttribute('aria-label',mark[1]);tag.innerHTML=mark[0]+'<span>'+(mode==='hidden'?'Oculto':'Anônimo')+'</span>';where.after(tag);
  }
 }
 // "Não participar": no ranking at all, neither showing up nor seeing the others.
 const NOTE='<p class="rank-abstained"><strong>Você não está participando dos rankings.</strong> Para voltar, vá em Configurações → Privacidade.</p>';
 function abstain(){
  const on=globalThis.PELEJA_MY_PRIVACY==='hidden';
  document.querySelector('.dashboard-comparison')?.toggleAttribute('data-abstained',on);
  if(on)for(const box of document.querySelectorAll('#rankingContent,.mock-comparison'))if(!box.querySelector(':scope > .rank-abstained'))box.innerHTML=NOTE;
 }
 const markOwn=markPrivacy;markPrivacy=()=>{abstain();markOwn();};
 globalThis.PELEJA_MARK_PRIVACY=()=>{markPrivacy();if(globalThis.PELEJA_MY_PRIVACY!=='hidden')globalThis.renderGeneralRanking?.();};
 globalThis.PELEJA_COMPACT_RANKINGS=scan;
})();
