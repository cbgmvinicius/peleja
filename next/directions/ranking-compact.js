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
 new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});}).observe(main,{childList:true,subtree:true});
 globalThis.PELEJA_COMPACT_RANKINGS=scan;
})();
