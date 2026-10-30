globalThis.PELEJA_INSTALL_DASHBOARD=({client,getUser,getName})=>{
 let rows=null,generation=0,failed=false;
 dashboardSubjectCodes=()=>{
  const exams=dashboardUpcoming(),date=exams.find(e=>e.date)?.date;
  return [...new Set(exams.filter(e=>!dashboardNextOnly||(date&&e.date===date)).flatMap(e=>e.materialCodes))].filter(code=>data.some(m=>m.code===code));
 };
 dashboardProgress=()=>{
  if(!rows)return `<p class="dashboard-empty">${failed?'Não foi possível carregar o comparativo. Tente atualizar.':'Carregando comparativo…'}</p>`;
  const metric=dashboardCourse==='cardio'?'courses':dashboardNextOnly?'next':'materials';
  const codes=dashboardSubjectCodes(),due=scheduledExtra.filter(l=>extraDates.get(l.id)<=localQuestionDate());
  const own={total:metric==='courses'?due.length:codes.length,done:metric==='courses'?due.filter(l=>extraWatched.cardio.has(l.id)).length:data.filter(m=>codes.includes(m.code)&&m.studied).length};
  const list=rows.filter(r=>r.has_data&&r.user_id!==getUser()).map(r=>({...r,...r[metric]}));
  list.push({user_id:getUser(),name:getName(),...own});
  for(const r of list){r.total=Math.max(0,Number(r.total)||0);r.done=Math.min(r.total,Math.max(0,Number(r.done)||0));r.ratio=r.total?r.done/r.total:0;}
  list.sort((a,b)=>b.ratio-a.ratio||b.done-a.done||a.name.localeCompare(b.name,'pt-BR'));
  if(!list.some(r=>r.total))return '<p class="dashboard-empty">Nenhuma pendência neste recorte.</p>';
  return `<ol class="dashboard-ranking">${list.map(r=>{
   const me=r.user_id===getUser(),rank=list.findIndex(x=>x.ratio===r.ratio&&x.done===r.done)+1,pct=Math.round(r.ratio*100);
   const person={name:r.name,userId:r.user_id,me,photo:mockExams.flatMap(e=>e.participants||[]).find(p=>p.userId===r.user_id)?.photo};
   return `<li data-person="${escapeHtml(r.user_id)}" class="${me?'is-me':''}"><span class="dashboard-place">${rank}º</span><span class="ranking-person">${mockPersonAvatar(person)}<span>${escapeHtml(r.name)}${me?'<small>Você</small>':''}</span></span><span class="dashboard-completion"><strong><b data-count="${r.done}">${r.done}</b><span> / <b data-count="${r.total}">${r.total}</b></span></strong><span class="dashboard-track" role="img" aria-label="${pct}% concluído"><i style="width:${pct}%"></i></span></span></li>`;
  }).join('')}</ol>`;
 };
 const originalRender=renderDashboard;
 renderDashboard=()=>{originalRender();$('dashboardPage').querySelector('.dashboard-comparison-context>span:last-child')?.remove();};
 return {
  reset(){generation++;rows=null;failed=false;$('dashboardPage').replaceChildren();},
  async load(){const ticket=++generation,owner=getUser();try{const result=await client.rpc('study_progress_next',{p_day:localQuestionDate()});if(ticket!==generation||owner!==getUser())return;if(result.error||!Array.isArray(result.data))throw Error('Comparativo indisponível');rows=result.data;failed=false;}catch{if(ticket!==generation||owner!==getUser())return;rows=null;failed=true;}renderDashboard();return !failed;}
 };
};
